/**
 * Purpose: Define the lifecycle contract implemented by every immersive demonstration world.
 * Context: The headset host must switch and restart worlds without owning their internal objects.
 * Responsibilities: Expose one root, presentation color, frame update, and deterministic cleanup.
 * Boundaries: Experiences do not own the renderer, XR session, dashboard, or transport.
 */

import type * as THREE from "three";

export interface Experience {
  readonly root: THREE.Group;
  readonly vrBackgroundColor: THREE.ColorRepresentation;
  start(): void | Promise<void>;
  update(deltaSeconds: number, elapsedSeconds: number): void;
  dispose(): void;
}

export type ExperienceFactory = () => Experience;
