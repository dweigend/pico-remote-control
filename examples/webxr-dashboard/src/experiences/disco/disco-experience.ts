/**
 * Purpose: Implement the restrained disco world used by the persistent PICO XR host.
 * Context: Disco combines a procedural room and slow lights with locally served Poly Pizza props.
 * Responsibilities: Own scene objects, load optional GLBs, provide calm motion, and dispose resources.
 * Boundaries: This module does not own the camera, renderer, XR session, registry, or asset metadata.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Experience } from "../experience.ts";

const ROOM_CENTER_DEPTH = -2.8;
const FLOOR_RADIUS_METERS = 2.4;
const LIGHT_PULSE_SPEED_RADIANS_PER_SECOND = 0.35;
const ASSET_ROTATION_SPEED_RADIANS_PER_SECOND = 0.18;
const LIGHT_PULSE_AMOUNT = 0.24;

export const DISCO_ASSET_URLS = {
  discoBall: "/assets/experiences/disco/disco-ball.glb",
  speaker: "/assets/experiences/disco/speaker.glb",
} as const;

export type DiscoMotionMode = "ambient" | "static";
export type DiscoModelLoader = (url: string) => Promise<THREE.Group>;

export interface DiscoExperienceOptions {
  readonly loadModel?: DiscoModelLoader;
  readonly motionMode?: DiscoMotionMode;
}

interface DiscoAssetDefinition {
  readonly url: string;
  readonly position: readonly [number, number, number];
  readonly targetSizeMeters: number;
  readonly rotates: boolean;
}

interface DiscoLightDefinition {
  readonly color: THREE.ColorRepresentation;
  readonly intensity: number;
  readonly phase: number;
  readonly position: readonly [number, number, number];
}

interface AnimatedLight {
  readonly light: THREE.PointLight;
  readonly baseIntensity: number;
  readonly phase: number;
}

interface OwnedResources {
  readonly geometries: Set<THREE.BufferGeometry>;
  readonly materials: Set<THREE.Material>;
  readonly textures: Set<THREE.Texture>;
}

const ASSET_DEFINITIONS: readonly DiscoAssetDefinition[] = [
  {
    url: DISCO_ASSET_URLS.discoBall,
    position: [0, 2.15, ROOM_CENTER_DEPTH],
    targetSizeMeters: 0.7,
    rotates: true,
  },
  {
    url: DISCO_ASSET_URLS.speaker,
    position: [0, 0.72, ROOM_CENTER_DEPTH - 1.15],
    targetSizeMeters: 1.25,
    rotates: false,
  },
];

const LIGHT_DEFINITIONS: readonly DiscoLightDefinition[] = [
  { color: 0x5c8dff, intensity: 1.45, phase: 0, position: [-1.35, 2.1, -2.25] },
  { color: 0xff5ca8, intensity: 1.35, phase: 2.1, position: [1.35, 1.85, -2.75] },
  { color: 0x7dffcb, intensity: 1.25, phase: 4.2, position: [0, 2.35, -3.7] },
];

export function createDiscoExperience(options: DiscoExperienceOptions = {}): Experience {
  return new DiscoExperience(options);
}

class DiscoExperience implements Experience {
  readonly root = new THREE.Group();
  readonly vrBackgroundColor = 0x070811;

  private readonly assetRoot = new THREE.Group();
  private readonly animatedAssets: THREE.Object3D[] = [];
  private readonly animatedLights: AnimatedLight[] = [];
  private readonly resources = createOwnedResources();
  private readonly loadModel: DiscoModelLoader;
  private readonly motionMode: DiscoMotionMode;
  private assetLoadPromise: Promise<void> | undefined;
  private disposed = false;

  constructor(options: DiscoExperienceOptions) {
    this.loadModel = options.loadModel ?? createGltfModelLoader();
    this.motionMode = options.motionMode ?? readPreferredMotionMode();
    this.root.name = "disco-experience";
    this.assetRoot.name = "disco-assets";
    this.root.add(this.createFloor(), this.assetRoot, this.createAmbientLight());
    this.createLights();
  }

  async start(): Promise<void> {
    if (this.disposed) throw new Error("A disposed disco experience cannot be restarted");
    this.assetRoot.rotation.set(0, 0, 0);
    for (const animatedLight of this.animatedLights) {
      animatedLight.light.intensity = animatedLight.baseIntensity;
    }
    await this.startAssetLoading();
  }

  update(_deltaSeconds: number, elapsedSeconds: number): void {
    if (this.disposed || this.motionMode === "static") return;
    for (const object of this.animatedAssets) {
      object.rotation.y = elapsedSeconds * ASSET_ROTATION_SPEED_RADIANS_PER_SECOND;
    }
    for (const animatedLight of this.animatedLights) {
      const pulse = Math.sin(
        elapsedSeconds * LIGHT_PULSE_SPEED_RADIANS_PER_SECOND + animatedLight.phase,
      );
      animatedLight.light.intensity =
        animatedLight.baseIntensity * (1 + pulse * LIGHT_PULSE_AMOUNT);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.root.clear();
    this.animatedAssets.length = 0;
    disposeResources(this.resources);
  }

  private createFloor(): THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial> {
    const geometry = new THREE.CylinderGeometry(FLOOR_RADIUS_METERS, FLOOR_RADIUS_METERS, 0.06, 32);
    const material = new THREE.MeshStandardMaterial({
      color: 0x111522,
      metalness: 0.35,
      roughness: 0.52,
    });
    const floor = new THREE.Mesh(geometry, material);
    floor.name = "disco-floor";
    floor.position.set(0, -0.03, ROOM_CENTER_DEPTH);
    this.resources.geometries.add(geometry);
    this.resources.materials.add(material);
    return floor;
  }

  private createAmbientLight(): THREE.HemisphereLight {
    return new THREE.HemisphereLight(0x566281, 0x080910, 0.55);
  }

  private createLights(): void {
    for (const definition of LIGHT_DEFINITIONS) {
      const light = new THREE.PointLight(definition.color, definition.intensity, 5.5, 1.8);
      light.position.set(...definition.position);
      this.animatedLights.push({
        light,
        baseIntensity: definition.intensity,
        phase: definition.phase,
      });
      this.root.add(light);
    }
  }

  private startAssetLoading(): Promise<void> {
    this.assetLoadPromise ??= Promise.allSettled(
      ASSET_DEFINITIONS.map((definition) => this.loadAsset(definition)),
    ).then(() => undefined);
    return this.assetLoadPromise;
  }

  private async loadAsset(definition: DiscoAssetDefinition): Promise<void> {
    const model = await this.loadModel(definition.url);
    if (this.disposed) {
      disposeObjectResources(model);
      return;
    }
    const container = prepareModel(model, definition);
    collectObjectResources(container, this.resources);
    this.assetRoot.add(container);
    if (definition.rotates) this.animatedAssets.push(container);
  }
}

function createGltfModelLoader(): DiscoModelLoader {
  const loader = new GLTFLoader();
  return async (url) => (await loader.loadAsync(url)).scene;
}

function readPreferredMotionMode(): DiscoMotionMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "ambient";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "static" : "ambient";
}

function prepareModel(model: THREE.Group, definition: DiscoAssetDefinition): THREE.Group {
  const container = new THREE.Group();
  container.name = `disco-asset:${definition.url}`;
  container.position.set(...definition.position);
  container.add(createNormalizedModel(model, definition.targetSizeMeters));
  return container;
}

function createNormalizedModel(model: THREE.Group, targetSizeMeters: number): THREE.Group {
  const normalizationRoot = new THREE.Group();
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) {
    normalizationRoot.add(model);
    return normalizationRoot;
  }

  const size = bounds.getSize(new THREE.Vector3());
  const largestDimension = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(largestDimension) || largestDimension <= 0) {
    normalizationRoot.add(model);
    return normalizationRoot;
  }

  const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(center);
  normalizationRoot.scale.setScalar(targetSizeMeters / largestDimension);
  normalizationRoot.add(model);
  return normalizationRoot;
}

function createOwnedResources(): OwnedResources {
  return {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
  };
}

function disposeObjectResources(root: THREE.Object3D): void {
  const resources = createOwnedResources();
  collectObjectResources(root, resources);
  disposeResources(resources);
}

function collectObjectResources(root: THREE.Object3D, resources: OwnedResources): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.geometries.add(object.geometry);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) collectMaterialResources(material, resources);
  });
}

function collectMaterialResources(material: THREE.Material, resources: OwnedResources): void {
  resources.materials.add(material);
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) resources.textures.add(value);
  }
}

function disposeResources(resources: OwnedResources): void {
  for (const texture of resources.textures) texture.dispose();
  for (const material of resources.materials) material.dispose();
  for (const geometry of resources.geometries) geometry.dispose();
  resources.textures.clear();
  resources.materials.clear();
  resources.geometries.clear();
}
