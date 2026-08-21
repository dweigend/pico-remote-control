/**
 * Purpose: Implement the calm low-poly landscape world for the persistent PICO XR host.
 * Context: Landscape combines a small procedural ground plane with licensed Poly Pizza landmarks.
 * Responsibilities: Own static scene objects, load configured GLBs, and dispose every owned resource.
 * Boundaries: This module does not own the scene, camera, renderer, XR session, registry, or asset files.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Experience } from "../experience.ts";

const TERRAIN_SIZE_METERS = 12;
const TERRAIN_SEGMENTS = 10;
const TERRAIN_DEPTH = -3;

export const LANDSCAPE_ASSET_URLS = {
  mountainGroup: "/assets/experiences/landscape/mountain-group.glb",
  rock: "/assets/experiences/landscape/rock.glb",
  tree: "/assets/experiences/landscape/tree.glb",
} as const;

type LoadedModel = {
  readonly scene: THREE.Group;
};

export interface LandscapeModelLoader {
  loadAsync(url: string): Promise<LoadedModel>;
}

type LandscapeAsset = Readonly<{
  name: string;
  url: string;
  position: readonly [x: number, y: number, z: number];
  rotationY: number;
  scale: number;
}>;

const LANDSCAPE_ASSETS: readonly LandscapeAsset[] = [
  {
    name: "landscape-tree",
    url: LANDSCAPE_ASSET_URLS.tree,
    position: [-2.25, 0, -4.2],
    rotationY: 0.35,
    scale: 1.15,
  },
  {
    name: "landscape-rock",
    url: LANDSCAPE_ASSET_URLS.rock,
    position: [1.8, 0, -3.35],
    rotationY: -0.45,
    scale: 0.8,
  },
  {
    name: "landscape-mountains",
    url: LANDSCAPE_ASSET_URLS.mountainGroup,
    position: [0, -0.15, -7.5],
    rotationY: 0,
    scale: 1.8,
  },
];

export function createLandscapeExperience(
  loader: LandscapeModelLoader = new GLTFLoader(),
): Experience {
  return new LandscapeExperience(loader);
}

class LandscapeExperience implements Experience {
  readonly root = new THREE.Group();
  readonly vrBackgroundColor = 0x8fc8e8;

  private readonly environment = new THREE.Group();
  private readonly landmarks = new THREE.Group();
  private readonly resources: Array<THREE.BufferGeometry | THREE.Material> = [];
  private readonly loadedLandmarks = new Set<THREE.Object3D>();
  private loadGeneration = 0;
  private startPromise: Promise<void> | undefined;
  private disposed = false;

  constructor(private readonly loader: LandscapeModelLoader) {
    this.root.name = "landscape-experience";
    this.environment.name = "landscape-environment";
    this.landmarks.name = "landscape-landmarks";
    this.environment.add(this.createTerrain(), this.createSun(), this.landmarks);
    this.root.add(this.environment, this.createHemisphereLight(), this.createSunlight());
  }

  async start(): Promise<void> {
    if (this.disposed) throw new Error("A disposed landscape experience cannot be restarted");
    this.environment.position.set(0, 0, TERRAIN_DEPTH);
    if (this.startPromise !== undefined) {
      await this.startPromise;
      return;
    }

    const generation = ++this.loadGeneration;
    this.startPromise = Promise.allSettled(
      LANDSCAPE_ASSETS.map((asset) => this.loadLandmark(asset, generation)),
    ).then(() => undefined);
    await this.startPromise;
  }

  update(_deltaSeconds: number, _elapsedSeconds: number): void {
    // The static world intentionally avoids camera-independent motion for XR comfort.
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadGeneration += 1;
    this.root.removeFromParent();
    for (const landmark of this.loadedLandmarks) disposeObjectResources(landmark);
    this.loadedLandmarks.clear();
    this.landmarks.clear();
    this.environment.clear();
    this.root.clear();
    for (const resource of this.resources) resource.dispose();
  }

  private async loadLandmark(asset: LandscapeAsset, generation: number): Promise<void> {
    try {
      const loaded = await this.loader.loadAsync(asset.url);
      if (this.disposed || generation !== this.loadGeneration) {
        disposeObjectResources(loaded.scene);
        return;
      }
      configureLandmark(loaded.scene, asset);
      this.loadedLandmarks.add(loaded.scene);
      this.landmarks.add(loaded.scene);
    } catch {
      // A missing optional landmark must not interrupt the persistent XR world.
    }
  }

  private createTerrain(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> {
    const geometry = createTerrainGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: 0x6f9f59,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
    });
    const terrain = new THREE.Mesh(geometry, material);
    terrain.name = "landscape-terrain";
    this.resources.push(geometry, material);
    return terrain;
  }

  private createSun(): THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> {
    const geometry = new THREE.SphereGeometry(0.42, 16, 10);
    const material = new THREE.MeshBasicMaterial({ color: 0xffe4a3 });
    const sun = new THREE.Mesh(geometry, material);
    sun.name = "landscape-sun";
    sun.position.set(-3.8, 5.2, -7);
    this.resources.push(geometry, material);
    return sun;
  }

  private createHemisphereLight(): THREE.HemisphereLight {
    return new THREE.HemisphereLight(0xc8e8ff, 0x3f5635, 1.7);
  }

  private createSunlight(): THREE.DirectionalLight {
    const sunlight = new THREE.DirectionalLight(0xffefc7, 2.2);
    sunlight.position.set(-3, 6, 2);
    return sunlight;
  }
}

function createTerrainGeometry(): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(
    TERRAIN_SIZE_METERS,
    TERRAIN_SIZE_METERS,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS,
  );
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const edgeDistance = Math.min(1, Math.hypot(x, z) / (TERRAIN_SIZE_METERS * 0.5));
    const undulation = Math.sin(x * 0.7) * Math.cos(z * 0.55) * 0.14 * edgeDistance;
    positions.setY(index, undulation - 0.04);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function configureLandmark(root: THREE.Group, asset: LandscapeAsset): void {
  root.name = asset.name;
  root.position.set(...asset.position);
  root.rotation.set(0, asset.rotationY, 0);
  root.scale.setScalar(asset.scale);
}

function disposeObjectResources(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const ownedMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of ownedMaterials) collectMaterial(material, materials, textures);
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function collectMaterial(
  material: THREE.Material,
  materials: Set<THREE.Material>,
  textures: Set<THREE.Texture>,
): void {
  materials.add(material);
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) textures.add(value);
  }
}
