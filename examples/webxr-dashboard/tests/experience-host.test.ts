/**
 * Purpose: Verify experience replacement stays inside one persistent scene host.
 * Context: World commands must dispose the previous instance and preserve shared infrastructure.
 * Responsibilities: Cover async start, calm switching, restart factories, and host cleanup.
 * Boundaries: Renderer, WebXR session, and dashboard correlation are outside this unit test.
 */

import { describe, expect, it, vi } from "bun:test";
import * as THREE from "three";
import type { Experience, ExperienceFactory } from "../src/experiences/experience.ts";
import { ExperienceHost } from "../src/headset/experience-host.ts";

describe("experience host", () => {
  it("switches after an async start and disposes the previous world", async () => {
    const initial = createExperienceFactory(0x112233);
    const next = createExperienceFactory(0x445566, true);
    const host = new ExperienceHost(initial.factory);
    await host.start();
    const onComplete = vi.fn();

    expect(host.switchExperience(next.factory, onComplete)).toBe(true);
    host.update(0.45, 1);
    await flushPromises();
    host.update(0.45, 2);

    expect(initial.dispose).toHaveBeenCalledTimes(1);
    expect(next.start).toHaveBeenCalledTimes(1);
    expect(host.scene.children).toContain(next.root);
    expect(onComplete).toHaveBeenCalledWith({ ok: true, deferred: false });
    host.dispose();
  });

  it("restarts with the active world's factory", async () => {
    const instances: Experience[] = [];
    const factory: ExperienceFactory = () => {
      const experience = createExperienceFactory(0x112233).instance;
      instances.push(experience);
      return experience;
    };
    const host = new ExperienceHost(factory);
    await host.start();

    expect(host.restart(() => undefined)).toBe(true);
    host.update(0.45, 1);
    await flushPromises();
    host.update(0.45, 2);

    expect(instances).toHaveLength(2);
    expect(instances[0]?.root.parent).toBeNull();
    expect(instances[1]?.root.parent).toBe(host.scene);
    host.dispose();
  });
});

function createExperienceFactory(
  color: number,
  asyncStart = false,
): {
  factory: ExperienceFactory;
  instance: Experience;
  root: THREE.Group;
  start: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  const root = new THREE.Group();
  const start = vi.fn(() => (asyncStart ? Promise.resolve() : undefined));
  const dispose = vi.fn(() => root.removeFromParent());
  const instance: Experience = {
    root,
    vrBackgroundColor: color,
    start,
    update: vi.fn(),
    dispose,
  };
  return { factory: () => instance, instance, root, start, dispose };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
