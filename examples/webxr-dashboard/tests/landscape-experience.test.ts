/**
 * Purpose: Verify the landscape world's lifecycle, static comfort, asset loading, and cleanup.
 * Context: The headset host must switch worlds while GLB requests may still be in flight.
 * Responsibilities: Cover initial state, declared URLs, late loads, detachment, and GPU disposal.
 * Boundaries: Tests inject a model loader and do not fetch real Poly Pizza assets or render WebXR.
 */

import { afterEach, describe, expect, it, vi } from "bun:test";
import * as THREE from "three";
import {
  createLandscapeExperience,
  LANDSCAPE_ASSET_URLS,
  type LandscapeModelLoader,
} from "../src/experiences/landscape/landscape-experience.ts";

describe("landscape experience", () => {
  afterEach(() => vi.restoreAllMocks());

  it("starts a static world without owning or automating a camera", () => {
    const loader = createPendingLoader();
    const experience = createLandscapeExperience(loader);
    const scene = new THREE.Scene();
    scene.add(experience.root);

    void experience.start();
    const environment = experience.root.getObjectByName("landscape-environment");
    const positionBeforeUpdate = environment?.position.toArray();
    const rotationBeforeUpdate = environment
      ? [environment.rotation.x, environment.rotation.y, environment.rotation.z]
      : undefined;
    experience.update(0.5, 10);

    expect(experience.vrBackgroundColor).toBe(0x8fc8e8);
    expect(environment?.position.toArray()).toEqual([0, 0, -3]);
    expect(environment?.position.toArray()).toEqual(positionBeforeUpdate);
    expect(
      environment
        ? [environment.rotation.x, environment.rotation.y, environment.rotation.z]
        : undefined,
    ).toEqual(rotationBeforeUpdate);
    expect(experience.root.getObjectByProperty("type", "PerspectiveCamera")).toBeUndefined();
  });

  it("loads each declared Poly Pizza landmark once and applies its placement", async () => {
    const scenes = [createLoadedScene(), createLoadedScene(), createLoadedScene()] as const;
    const loadAsync = vi
      .fn<LandscapeModelLoader["loadAsync"]>()
      .mockResolvedValueOnce({ scene: scenes[0] })
      .mockResolvedValueOnce({ scene: scenes[1] })
      .mockResolvedValueOnce({ scene: scenes[2] });
    const experience = createLandscapeExperience({ loadAsync });

    await Promise.all([experience.start(), experience.start()]);

    expect(loadAsync.mock.calls.map(([url]) => url)).toEqual([
      LANDSCAPE_ASSET_URLS.tree,
      LANDSCAPE_ASSET_URLS.rock,
      LANDSCAPE_ASSET_URLS.mountainGroup,
    ]);
    expect(scenes[0]?.name).toBe("landscape-tree");
    expect(scenes[0]?.position.toArray()).toEqual([-2.25, 0, -4.2]);
    expect(scenes[1]?.name).toBe("landscape-rock");
    expect(scenes[1]?.position.toArray()).toEqual([1.8, 0, -3.35]);
    expect(scenes[2]?.name).toBe("landscape-mountains");
    expect(scenes[2]?.position.toArray()).toEqual([0, -0.15, -7.5]);
  });

  it("settles startup when one optional landmark fails", async () => {
    const rock = createLoadedScene();
    const loadAsync = vi
      .fn<LandscapeModelLoader["loadAsync"]>()
      .mockRejectedValueOnce(new Error("tree unavailable"))
      .mockResolvedValueOnce({ scene: rock });
    const experience = createLandscapeExperience({ loadAsync });

    await expect(experience.start()).resolves.toBeUndefined();

    const landmarks = experience.root.getObjectByName("landscape-landmarks");
    expect(landmarks?.children).toEqual([rock]);
    expect(rock.name).toBe("landscape-rock");
  });

  it("disposes a landmark that resolves after the experience was disposed", async () => {
    const lateScene = createLoadedScene(true);
    const deferred = createDeferred<{ scene: THREE.Group }>();
    const loadAsync = vi
      .fn<LandscapeModelLoader["loadAsync"]>()
      .mockReturnValueOnce(deferred.promise)
      .mockResolvedValueOnce({ scene: createLoadedScene() });
    const experience = createLandscapeExperience({ loadAsync });
    const geometryDispose = vi.spyOn(lateScene.geometry, "dispose");
    const materialDispose = vi.spyOn(lateScene.material, "dispose");
    const textureDispose = vi.spyOn(lateScene.texture, "dispose");

    const startPromise = experience.start();
    experience.dispose();
    deferred.resolve({ scene: lateScene.root });
    await startPromise;

    expect(lateScene.root.parent).toBeNull();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
  });

  it("detaches and disposes procedural and loaded resources exactly once", async () => {
    const loaded = [
      createLoadedScene(true),
      createLoadedScene(true),
      createLoadedScene(true),
    ] as const;
    const loadAsync = vi
      .fn<LandscapeModelLoader["loadAsync"]>()
      .mockResolvedValueOnce({ scene: loaded[0].root })
      .mockResolvedValueOnce({ scene: loaded[1].root })
      .mockResolvedValueOnce({ scene: loaded[2].root });
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
    const materialDispose = vi.spyOn(THREE.Material.prototype, "dispose");
    const textureDisposals = loaded.map(({ texture }) => vi.spyOn(texture, "dispose"));
    const experience = createLandscapeExperience({ loadAsync });
    const scene = new THREE.Scene();
    scene.add(experience.root);

    await experience.start();
    experience.dispose();
    experience.dispose();

    expect(experience.root.parent).toBeNull();
    expect(loaded.every(({ root }) => root.parent === null)).toBe(true);
    expect(geometryDispose).toHaveBeenCalledTimes(5);
    expect(materialDispose).toHaveBeenCalledTimes(5);
    for (const textureDispose of textureDisposals) expect(textureDispose).toHaveBeenCalledTimes(1);
  });

  it("rejects restarting a disposed experience", async () => {
    const experience = createLandscapeExperience(createPendingLoader());
    experience.dispose();
    await expect(experience.start()).rejects.toThrow(
      "A disposed landscape experience cannot be restarted",
    );
  });
});

type LoadedTestScene = {
  root: THREE.Group;
  geometry: THREE.BoxGeometry;
  material: THREE.MeshStandardMaterial;
  texture: THREE.Texture;
};

function createLoadedScene(withResources: true): LoadedTestScene;
function createLoadedScene(withResources?: false): THREE.Group;
function createLoadedScene(withResources = false): LoadedTestScene | THREE.Group {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  root.add(new THREE.Mesh(geometry, material));
  return withResources ? { root, geometry, material, texture } : root;
}

function createPendingLoader(): LandscapeModelLoader {
  return { loadAsync: () => new Promise(() => undefined) };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve = (_value: T): void => undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
