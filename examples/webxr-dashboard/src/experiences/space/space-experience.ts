/**
 * Purpose: Implement the calm procedural space world used by the PICO capability demo.
 * Context: Space is the first world behind the shared experience lifecycle contract.
 * Responsibilities: Own its Three.js objects, ambient motion, and disposable GPU resources.
 * Boundaries: This module does not own the scene, camera, renderer, XR session, or UI.
 */

import * as THREE from "three";
import type { Experience } from "../experience.ts";

const CONTENT_BASE_HEIGHT = 1.35;
const CONTENT_DEPTH = -2.2;
const ROTATION_SPEED_RADIANS_PER_SECOND = 0.08;
const FLOAT_SPEED_RADIANS_PER_SECOND = 0.45;
const FLOAT_DISTANCE_METERS = 0.035;
const STAR_COUNT = 72;
const GOLDEN_ANGLE_RADIANS = 2.399_963;

export function createSpaceExperience(): Experience {
  return new SpaceExperience();
}

class SpaceExperience implements Experience {
  readonly root = new THREE.Group();
  readonly vrBackgroundColor = 0x08142e;

  private readonly content = new THREE.Group();
  private readonly resources: Array<THREE.BufferGeometry | THREE.Material> = [];
  private disposed = false;

  constructor() {
    this.content.add(this.createPlanet(), this.createOrbit(), this.createStarField());
    this.root.add(this.content, new THREE.HemisphereLight(0xbfd6ff, 0x18213b, 1.6));

    const keyLight = new THREE.DirectionalLight(0xffe0bd, 2.1);
    keyLight.position.set(2, 4, 3);
    this.root.add(keyLight);
  }

  start(): void {
    if (this.disposed) throw new Error("A disposed space experience cannot be restarted");
    this.content.position.set(0, CONTENT_BASE_HEIGHT, CONTENT_DEPTH);
    this.content.rotation.set(0, 0, 0);
  }

  update(_deltaSeconds: number, elapsedSeconds: number): void {
    if (this.disposed) return;
    this.content.rotation.y = elapsedSeconds * ROTATION_SPEED_RADIANS_PER_SECOND;
    this.content.position.y =
      CONTENT_BASE_HEIGHT +
      Math.sin(elapsedSeconds * FLOAT_SPEED_RADIANS_PER_SECOND) * FLOAT_DISTANCE_METERS;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.root.clear();
    for (const resource of this.resources) resource.dispose();
  }

  private createPlanet(): THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial> {
    const geometry = new THREE.IcosahedronGeometry(0.42, 2);
    const material = new THREE.MeshStandardMaterial({
      color: 0x6fa8ff,
      emissive: 0x142f61,
      roughness: 0.32,
      metalness: 0.15,
    });
    this.resources.push(geometry, material);
    return new THREE.Mesh(geometry, material);
  }

  private createOrbit(): THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial> {
    const geometry = new THREE.TorusGeometry(0.78, 0.025, 8, 64);
    const material = new THREE.MeshBasicMaterial({ color: 0xa8c7ff });
    const orbit = new THREE.Mesh(geometry, material);
    orbit.rotation.x = Math.PI * 0.62;
    this.resources.push(geometry, material);
    return orbit;
  }

  private createStarField(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(createStarPositions(), 3));
    const material = new THREE.PointsMaterial({
      color: 0xd7e4ff,
      size: 0.025,
      sizeAttenuation: true,
    });
    this.resources.push(geometry, material);
    return new THREE.Points(geometry, material);
  }
}

function createStarPositions(): Float32Array {
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let index = 0; index < STAR_COUNT; index += 1) {
    const angle = index * GOLDEN_ANGLE_RADIANS;
    const radius = 1.2 + (index % 9) * 0.18;
    const offset = index * 3;
    positions[offset] = Math.cos(angle) * radius;
    positions[offset + 1] = ((index % 13) - 6) * 0.16;
    positions[offset + 2] = Math.sin(angle) * radius;
  }
  return positions;
}
