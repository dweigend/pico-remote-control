/**
 * Purpose: Construct the single WebGL renderer used by the persistent PICO XR runtime.
 * Context: Renderer configuration must remain consistent across desktop preview and immersive AR.
 * Responsibilities: Enable WebXR, alpha composition, local-floor tracking, and output color space.
 * Boundaries: Animation-loop ownership and renderer disposal remain in the headset runtime.
 */

import * as THREE from "three";

export function createHeadsetRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local-floor");
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = "xr-canvas";
  return renderer;
}
