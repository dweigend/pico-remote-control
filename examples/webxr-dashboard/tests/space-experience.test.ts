/**
 * Purpose: Verify the space world's isolated lifecycle and resource ownership.
 * Context: The headset host must be able to add, animate, and dispose worlds predictably.
 * Responsibilities: Cover initial state, deterministic motion, scene detachment, and GPU cleanup.
 * Boundaries: WebXR session and renderer behavior require browser and PICO verification.
 */

import { afterEach, describe, expect, it, vi } from "bun:test";
import * as THREE from "three";
import { createSpaceExperience } from "../src/experiences/space/space-experience.ts";

describe("space experience", () => {
  afterEach(() => vi.restoreAllMocks());

  it("starts and updates without owning the parent scene", () => {
    const experience = createSpaceExperience();
    const scene = new THREE.Scene();
    scene.add(experience.root);

    experience.start();
    const content = experience.root.children[0];
    expect(content?.position.toArray()).toEqual([0, 1.35, -2.2]);

    experience.update(0.5, 10);
    expect(content?.rotation.y).toBeCloseTo(0.8);
    expect(content?.position.y).not.toBe(1.35);
  });

  it("detaches its root and disposes every owned geometry and material once", () => {
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
    const materialDispose = vi.spyOn(THREE.Material.prototype, "dispose");
    const experience = createSpaceExperience();
    const scene = new THREE.Scene();
    scene.add(experience.root);

    experience.dispose();
    experience.dispose();

    expect(experience.root.parent).toBeNull();
    expect(geometryDispose).toHaveBeenCalledTimes(3);
    expect(materialDispose).toHaveBeenCalledTimes(3);
  });
});
