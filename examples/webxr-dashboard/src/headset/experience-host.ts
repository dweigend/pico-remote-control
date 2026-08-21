/**
 * Purpose: Host one experience inside the persistent headset scene.
 * Context: Shared camera and VR enclosure must outlive individual experience implementations.
 * Responsibilities: Own scene infrastructure, presentation mode, updates, and deterministic cleanup.
 * Boundaries: The host does not own WebXR session state, rendering cadence, transport, or UI.
 */

import * as THREE from "three";
import type { Experience, ExperienceFactory } from "../experiences/experience.ts";
import type { DisplayMode } from "../shared/protocol.ts";
import { ExperienceTransition, type TransitionResult } from "./experience-transition.ts";

const ENCLOSURE_RADIUS_METERS = 24;

export class ExperienceHost {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 80);

  private experience: Experience;
  private experienceFactory: ExperienceFactory;
  private readonly enclosure: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly transition = new ExperienceTransition();
  private started = false;
  private disposed = false;

  constructor(createExperience: ExperienceFactory) {
    this.experienceFactory = createExperience;
    this.experience = createExperience();
    this.enclosure = createEnclosure(this.experience.vrBackgroundColor);
    this.camera.position.set(0, 1.6, 3.5);
    this.camera.lookAt(0, 1.25, -1.5);
    this.scene.add(this.enclosure, this.transition.overlay);
  }

  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;
    await this.experience.start();
    if (this.disposed) return;
    this.scene.add(this.experience.root);
  }

  update(deltaSeconds: number, elapsedSeconds: number): void {
    if (!this.started || this.disposed) return;
    this.experience.update(deltaSeconds, elapsedSeconds);
    this.transition.update(deltaSeconds, this.camera);
  }

  switchExperience(
    createExperience: ExperienceFactory,
    onComplete: (result: TransitionResult) => void,
  ): boolean {
    return this.startTransition(createExperience, onComplete);
  }

  restart(onComplete: (result: TransitionResult) => void): boolean {
    return this.startTransition(this.experienceFactory, onComplete);
  }

  setDisplayMode(mode: DisplayMode): void {
    this.enclosure.visible = mode === "vr";
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.experience.dispose();
    this.scene.clear();
    this.transition.dispose();
    this.enclosure.geometry.dispose();
    this.enclosure.material.dispose();
  }

  private startTransition(
    createExperience: ExperienceFactory,
    onComplete: (result: TransitionResult) => void,
  ): boolean {
    if (!this.started || this.disposed) return false;
    return this.transition.start(() => this.replaceExperience(createExperience), onComplete);
  }

  private async replaceExperience(createExperience: ExperienceFactory): Promise<void> {
    const nextExperience = createExperience();
    this.experience.dispose();
    this.experience = nextExperience;
    this.experienceFactory = createExperience;
    this.enclosure.material.color.set(nextExperience.vrBackgroundColor);
    if (!this.disposed) this.scene.add(nextExperience.root);

    try {
      await nextExperience.start();
    } catch (error) {
      nextExperience.dispose();
      throw error;
    }
  }
}

function createEnclosure(
  color: THREE.ColorRepresentation,
): THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> {
  const geometry = new THREE.SphereGeometry(ENCLOSURE_RADIUS_METERS, 32, 20);
  const material = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
    transparent: false,
    depthWrite: true,
  });
  const enclosure = new THREE.Mesh(geometry, material);
  enclosure.visible = false;
  enclosure.renderOrder = -100;
  enclosure.frustumCulled = false;
  return enclosure;
}
