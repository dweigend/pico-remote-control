/**
 * Purpose: Render the non-immersive status and Enter XR controls in the PICO browser.
 * Context: Headset application logic publishes view models before and around the XR session.
 * Responsibilities: Own DOM creation, event wiring targets, and accessible status presentation.
 * Boundaries: This view contains no WebXR, socket, command, telemetry, or Three.js logic.
 */

import type { DisplayMode, EnvironmentBlendMode, XrState } from "../shared/protocol.ts";

export type HeadsetViewModel = Readonly<{
  xrState: XrState;
  blendMode: EnvironmentBlendMode | undefined;
  mode: DisplayMode;
  message?: string;
}>;

export interface HeadsetView {
  readonly enterButton: HTMLButtonElement;
  render(model: HeadsetViewModel): void;
  setEnterAvailable(available: boolean): void;
  dispose(): void;
}

export function createHeadsetView(root: HTMLElement): HeadsetView {
  const panel = document.createElement("section");
  panel.className = "status-panel";
  panel.innerHTML = `
    <p class="eyebrow">Phase 0 · PICO capability gate</p>
    <h1>Persistent immersive AR host</h1>
    <p class="lede">One confirmation starts one session. Dashboard commands only change presentation inside it.</p>
    <button class="enter-button" type="button" disabled>Enter XR</button>
    <dl class="status-grid">
      <div><dt>XR</dt><dd data-value="xr">ready</dd></div>
      <div><dt>Blend mode</dt><dd data-value="blend">not measured</dd></div>
      <div><dt>Presentation</dt><dd data-value="mode">AR · transparent</dd></div>
    </dl>
    <p class="message" role="status" aria-live="polite"></p>
  `;
  root.append(panel);

  const enterButton = requireElement(panel, ".enter-button", HTMLButtonElement);
  const xrValue = requireElement(panel, '[data-value="xr"]', HTMLElement);
  const blendValue = requireElement(panel, '[data-value="blend"]', HTMLElement);
  const modeValue = requireElement(panel, '[data-value="mode"]', HTMLElement);
  const messageValue = requireElement(panel, ".message", HTMLElement);

  return {
    enterButton,
    render: (model) => {
      xrValue.textContent = model.xrState;
      blendValue.textContent = model.blendMode ?? "not measured";
      modeValue.textContent = model.mode === "ar" ? "AR · transparent" : "VR · opaque sphere";
      if (model.message !== undefined) messageValue.textContent = model.message;
    },
    setEnterAvailable: (available) => {
      enterButton.disabled = !available;
      enterButton.hidden = !available;
    },
    dispose: () => panel.remove(),
  };
}

function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
  elementConstructor: { new (): T },
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof elementConstructor)) {
    throw new Error(`Missing required UI element: ${selector}`);
  }
  return element;
}
