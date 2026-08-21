/**
 * Purpose: Verify the disco world's lifecycle, calm motion modes, and asynchronous asset ownership.
 * Context: The headset must switch worlds without leaked GLB resources or motion during reduced mode.
 * Responsibilities: Cover start, animation bounds, GLB integration, late loading, and idempotent cleanup.
 * Boundaries: Visual quality, PICO frame timing, and WebXR presentation require browser/device evidence.
 */

import { afterEach, describe, expect, it, vi } from "bun:test";
import * as THREE from "three";
import {
  createDiscoExperience,
  DISCO_ASSET_URLS,
  type DiscoModelLoader,
} from "../src/experiences/disco/disco-experience.ts";

const ORIGINAL_WINDOW = Object.getOwnPropertyDescriptor(globalThis, "window");

describe("disco experience", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    restoreWindow();
  });

  it("starts asset loading once and uses the declared local GLB URLs", async () => {
    const loadModel: DiscoModelLoader = vi.fn(async () => createModel().group);
    const experience = createDiscoExperience({ loadModel, motionMode: "ambient" });

    expect(loadModel).not.toHaveBeenCalled();
    await Promise.all([experience.start(), experience.start()]);

    expect(loadModel).toHaveBeenCalledTimes(2);
    expect(loadModel).toHaveBeenNthCalledWith(1, DISCO_ASSET_URLS.discoBall);
    expect(loadModel).toHaveBeenNthCalledWith(2, DISCO_ASSET_URLS.speaker);
    expect(experience.root.getObjectByName("disco-assets")?.children).toHaveLength(2);
    expect(findCameras(experience.root)).toHaveLength(0);
  });

  it("keeps ambient motion slow and avoids dark full-field light pulses", async () => {
    const loadModel: DiscoModelLoader = async () => createModel().group;
    const experience = createDiscoExperience({ loadModel, motionMode: "ambient" });
    await experience.start();

    experience.update(0.5, 10);

    const discoBall = experience.root.getObjectByName(`disco-asset:${DISCO_ASSET_URLS.discoBall}`);
    expect(discoBall?.rotation.y).toBeCloseTo(1.8);
    for (const light of findPointLights(experience.root)) {
      expect(light.intensity).toBeGreaterThan(0.9);
      expect(light.intensity).toBeLessThan(1.9);
    }
  });

  it("provides a fully static reduced-motion fallback", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { matchMedia: vi.fn(() => ({ matches: true })) },
    });
    const loadModel: DiscoModelLoader = async () => createModel().group;
    const experience = createDiscoExperience({ loadModel });
    await experience.start();
    const lights = findPointLights(experience.root);
    const initialIntensities = lights.map((light) => light.intensity);

    experience.update(1, 120);

    const discoBall = experience.root.getObjectByName(`disco-asset:${DISCO_ASSET_URLS.discoBall}`);
    expect(discoBall?.rotation.y).toBe(0);
    expect(lights.map((light) => light.intensity)).toEqual(initialIntensities);
  });

  it("detaches its root and disposes loaded and procedural resources once", async () => {
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
    const materialDispose = vi.spyOn(THREE.Material.prototype, "dispose");
    const textureDispose = vi.spyOn(THREE.Texture.prototype, "dispose");
    const loadModel: DiscoModelLoader = async () => createModel().group;
    const experience = createDiscoExperience({ loadModel, motionMode: "ambient" });
    const scene = new THREE.Scene();
    scene.add(experience.root);
    await experience.start();

    experience.dispose();
    experience.dispose();

    expect(experience.root.parent).toBeNull();
    expect(experience.root.children).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledTimes(3);
    expect(materialDispose).toHaveBeenCalledTimes(3);
    expect(textureDispose).toHaveBeenCalledTimes(2);
    await expect(experience.start()).rejects.toThrow(
      "A disposed disco experience cannot be restarted",
    );
  });

  it("disposes models that finish loading after the experience was disposed", async () => {
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
    const materialDispose = vi.spyOn(THREE.Material.prototype, "dispose");
    const textureDispose = vi.spyOn(THREE.Texture.prototype, "dispose");
    const discoBall = createDeferred<THREE.Group>();
    const speaker = createDeferred<THREE.Group>();
    const loadModel: DiscoModelLoader = (url) =>
      url === DISCO_ASSET_URLS.discoBall ? discoBall.promise : speaker.promise;
    const experience = createDiscoExperience({ loadModel, motionMode: "ambient" });

    const startPromise = experience.start();
    experience.dispose();
    discoBall.resolve(createModel().group);
    speaker.resolve(createModel().group);
    await startPromise;

    expect(experience.root.children).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledTimes(3);
    expect(materialDispose).toHaveBeenCalledTimes(3);
    expect(textureDispose).toHaveBeenCalledTimes(2);
  });

  it("isolates optional asset failures from the procedural room lifecycle", async () => {
    const loadModel: DiscoModelLoader = async () => {
      throw new Error("asset unavailable");
    };
    const experience = createDiscoExperience({ loadModel, motionMode: "ambient" });

    await experience.start();

    expect(experience.root.getObjectByName("disco-floor")).toBeInstanceOf(THREE.Mesh);
    expect(experience.root.getObjectByName("disco-assets")?.children).toHaveLength(0);
    expect(() => experience.update(0.5, 10)).not.toThrow();
  });
});

function restoreWindow(): void {
  if (ORIGINAL_WINDOW === undefined) {
    Reflect.deleteProperty(globalThis, "window");
    return;
  }
  Object.defineProperty(globalThis, "window", ORIGINAL_WINDOW);
}

interface TestModel {
  readonly group: THREE.Group;
}

function createModel(): TestModel {
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  return { group };
}

function findPointLights(root: THREE.Object3D): readonly THREE.PointLight[] {
  return root.children.filter(
    (child): child is THREE.PointLight => child instanceof THREE.PointLight,
  );
}

function findCameras(root: THREE.Object3D): readonly THREE.Camera[] {
  const cameras: THREE.Camera[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Camera) cameras.push(object);
  });
  return cameras;
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
  };
}
