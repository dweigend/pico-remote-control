/**
 * Purpose: Verify the shared world transition independently from every experience.
 * Context: Calm fades must cover async swaps without allowing overlapping transitions.
 * Responsibilities: Cover fade phases, success, failure, busy rejection, and resource cleanup.
 * Boundaries: Visual XR opacity still requires verification on the physical PICO compositor.
 */

import { describe, expect, it, vi } from "bun:test";
import * as THREE from "three";
import { ExperienceTransition } from "../src/headset/experience-transition.ts";

describe("experience transition", () => {
  it("covers an async operation before calmly revealing its result", async () => {
    const transition = new ExperienceTransition();
    const camera = createCamera();
    const operation = vi.fn(async () => undefined);
    const onComplete = vi.fn();

    expect(transition.start(operation, onComplete)).toBe(true);
    expect(transition.start(operation, onComplete)).toBe(false);
    transition.update(0.45, camera);

    expect(transition.overlay.material.opacity).toBe(1);
    expect(operation).toHaveBeenCalledTimes(1);
    await flushPromises();
    transition.update(0.45, camera);

    expect(transition.active).toBe(false);
    expect(transition.overlay.visible).toBe(false);
    expect(onComplete).toHaveBeenCalledWith({ ok: true, deferred: false });
    transition.dispose();
  });

  it("reveals a usable world when optional asset loading exceeds the bound", () => {
    const transition = new ExperienceTransition();
    const onComplete = vi.fn();

    transition.start(() => new Promise(() => undefined), onComplete);
    transition.update(0.45, createCamera());
    transition.update(2.5, createCamera());
    transition.update(0.45, createCamera());

    expect(onComplete).toHaveBeenCalledWith({ ok: true, deferred: true });
    transition.dispose();
  });

  it("reveals after a failed operation and reports the error", async () => {
    const transition = new ExperienceTransition();
    const error = new Error("asset load failed");
    const onComplete = vi.fn();

    transition.start(() => Promise.reject(error), onComplete);
    transition.update(0.45, createCamera());
    await flushPromises();
    transition.update(0.45, createCamera());

    expect(onComplete).toHaveBeenCalledWith({ ok: false, error });
    transition.dispose();
  });

  it("disposes its overlay resources once", () => {
    const transition = new ExperienceTransition();
    const geometryDispose = vi.spyOn(transition.overlay.geometry, "dispose");
    const materialDispose = vi.spyOn(transition.overlay.material, "dispose");

    transition.dispose();
    transition.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });
});

function createCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(1, 2, 3);
  camera.updateMatrixWorld(true);
  return camera;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
