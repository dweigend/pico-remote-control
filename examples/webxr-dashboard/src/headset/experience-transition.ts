/**
 * Purpose: Provide one calm fade transition for every headset world change.
 * Context: World implementations stay unaware of presentation choreography and loading delays.
 * Responsibilities: Cover the view, run one async swap, reveal the result, and dispose its overlay.
 * Boundaries: This service does not construct worlds, own the render loop, or change XR sessions.
 */

import * as THREE from "three";

const FADE_DURATION_SECONDS = 0.45;
const MAX_WAIT_SECONDS = 2.5;
const OVERLAY_RADIUS_METERS = 0.35;

export type TransitionResult =
  | Readonly<{ ok: true; deferred: boolean }>
  | Readonly<{ ok: false; error: Error }>;

type TransitionPhase = "idle" | "covering" | "waiting" | "revealing" | "disposed";
type TransitionOperation = () => void | Promise<void>;
type TransitionCompletion = (result: TransitionResult) => void;

export class ExperienceTransition {
  readonly overlay: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;

  private phase: TransitionPhase = "idle";
  private progress = 0;
  private completion: TransitionCompletion | undefined;
  private result: TransitionResult = { ok: true, deferred: false };
  private waitingSeconds = 0;
  private generation = 0;

  constructor() {
    const geometry = new THREE.SphereGeometry(OVERLAY_RADIUS_METERS, 20, 14);
    const material = new THREE.MeshBasicMaterial({
      color: 0x05070b,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    this.overlay = new THREE.Mesh(geometry, material);
    this.overlay.name = "experience-transition-overlay";
    this.overlay.frustumCulled = false;
    this.overlay.renderOrder = Number.MAX_SAFE_INTEGER;
    this.overlay.visible = false;
  }

  get active(): boolean {
    return this.phase !== "idle" && this.phase !== "disposed";
  }

  start(operation: TransitionOperation, onComplete: TransitionCompletion): boolean {
    if (this.phase !== "idle") return false;
    this.phase = "covering";
    this.progress = 0;
    this.completion = onComplete;
    this.result = { ok: true, deferred: false };
    this.waitingSeconds = 0;
    this.overlay.visible = true;
    this.overlay.material.opacity = 0;
    const generation = ++this.generation;
    this.pendingOperation = { generation, operation };
    return true;
  }

  update(deltaSeconds: number, camera: THREE.Camera): void {
    if (!this.active) return;
    this.overlay.position.setFromMatrixPosition(camera.matrixWorld);
    switch (this.phase) {
      case "covering":
        this.updateCovering(deltaSeconds);
        return;
      case "waiting":
        this.updateWaiting(deltaSeconds);
        return;
      case "revealing":
        this.updateRevealing(deltaSeconds);
        return;
      case "idle":
      case "disposed":
        return;
    }
  }

  dispose(): void {
    if (this.phase === "disposed") return;
    this.phase = "disposed";
    this.generation += 1;
    this.pendingOperation = undefined;
    this.completion = undefined;
    this.overlay.removeFromParent();
    this.overlay.geometry.dispose();
    this.overlay.material.dispose();
  }

  private pendingOperation:
    | Readonly<{ generation: number; operation: TransitionOperation }>
    | undefined;

  private updateCovering(deltaSeconds: number): void {
    this.progress = Math.min(this.progress + deltaSeconds / FADE_DURATION_SECONDS, 1);
    this.overlay.material.opacity = smoothStep(this.progress);
    if (this.progress < 1) return;
    this.phase = "waiting";
    this.runOperation();
  }

  private runOperation(): void {
    const pending = this.pendingOperation;
    this.pendingOperation = undefined;
    if (pending === undefined) return;

    try {
      void Promise.resolve(pending.operation()).then(
        () => this.beginReveal(pending.generation, { ok: true, deferred: false }),
        (error: unknown) =>
          this.beginReveal(pending.generation, { ok: false, error: toError(error) }),
      );
    } catch (error) {
      this.beginReveal(pending.generation, { ok: false, error: toError(error) });
    }
  }

  private updateWaiting(deltaSeconds: number): void {
    this.waitingSeconds += deltaSeconds;
    if (this.waitingSeconds < MAX_WAIT_SECONDS) return;
    this.beginReveal(this.generation, { ok: true, deferred: true });
  }

  private beginReveal(generation: number, result: TransitionResult): void {
    if (this.phase !== "waiting" || generation !== this.generation) return;
    this.result = result;
    this.progress = 1;
    this.phase = "revealing";
  }

  private updateRevealing(deltaSeconds: number): void {
    this.progress = Math.max(this.progress - deltaSeconds / FADE_DURATION_SECONDS, 0);
    this.overlay.material.opacity = smoothStep(this.progress);
    if (this.progress > 0) return;

    const completion = this.completion;
    const result = this.result;
    this.completion = undefined;
    this.phase = "idle";
    this.overlay.visible = false;
    completion?.(result);
  }
}

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
