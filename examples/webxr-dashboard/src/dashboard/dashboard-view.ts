/**
 * Purpose: Render the Mac operator dashboard and expose semantic user actions.
 * Context: The controller supplies authoritative device, runtime, mirror, and pending state.
 * Responsibilities: Own dashboard DOM, labels, accessibility, event listeners, and confirmation UI.
 * Boundaries: This view does not own sockets, command correlation, ADB, XR, or process state.
 */

import type {
  DeviceState,
  DisplayMode,
  EnvironmentBlendMode,
  MirrorState,
  WorldId,
  XrState,
} from "../shared/protocol.ts";

export type DashboardConnectionState = "connecting" | "connected" | "reconnecting" | "replaced";

export type DashboardViewModel = Readonly<{
  connectionState: DashboardConnectionState;
  deviceState: DeviceState;
  deviceStatusFresh: boolean;
  deviceMessage: string;
  headsetConnected: boolean;
  xrState: XrState | undefined;
  blendMode: EnvironmentBlendMode | undefined;
  confirmedMode: DisplayMode | undefined;
  requestedMode: DisplayMode | undefined;
  confirmedWorldId: WorldId | undefined;
  requestedWorldId: WorldId | undefined;
  worldRestartPending: boolean;
  mirrorState: MirrorState;
  medianFrameMs: number | undefined;
  p95FrameMs: number | undefined;
  eventMessage: string;
  resetPending: boolean;
}>;

type DashboardActions = Readonly<{
  onModeRequested: (mode: DisplayMode) => void;
  onWorldRequested: (worldId: WorldId) => void;
  onWorldRestartRequested: () => void;
  onMirrorRequested: (enabled: boolean) => void;
  onRuntimeResetRequested: () => void;
}>;

export interface DashboardView {
  render(model: DashboardViewModel): void;
  confirmRuntimeReset(): boolean;
  dispose(): void;
}

export function createDashboardView(root: HTMLElement, actions: DashboardActions): DashboardView {
  root.innerHTML = dashboardMarkup;
  const elements = resolveElements(root);

  const handleModeAr = (): void => actions.onModeRequested("ar");
  const handleModeVr = (): void => actions.onModeRequested("vr");
  const handleWorldSpace = (): void => actions.onWorldRequested("space");
  const handleWorldLandscape = (): void => actions.onWorldRequested("landscape");
  const handleWorldDisco = (): void => actions.onWorldRequested("disco");
  const handleWorldRestart = (): void => actions.onWorldRestartRequested();
  const handleMirrorOn = (): void => actions.onMirrorRequested(true);
  const handleMirrorOff = (): void => actions.onMirrorRequested(false);
  const handleReset = (): void => actions.onRuntimeResetRequested();

  elements.modeAr.addEventListener("click", handleModeAr);
  elements.modeVr.addEventListener("click", handleModeVr);
  elements.worldSpace.addEventListener("click", handleWorldSpace);
  elements.worldLandscape.addEventListener("click", handleWorldLandscape);
  elements.worldDisco.addEventListener("click", handleWorldDisco);
  elements.worldRestart.addEventListener("click", handleWorldRestart);
  elements.mirrorOn.addEventListener("click", handleMirrorOn);
  elements.mirrorOff.addEventListener("click", handleMirrorOff);
  elements.resetRuntime.addEventListener("click", handleReset);

  return {
    render: (model) => renderDashboard(elements, model),
    confirmRuntimeReset: () =>
      window.confirm(
        "Restart PICO Browser? The active XR session will end and Enter XR must be confirmed again.",
      ),
    dispose: () => {
      elements.modeAr.removeEventListener("click", handleModeAr);
      elements.modeVr.removeEventListener("click", handleModeVr);
      elements.worldSpace.removeEventListener("click", handleWorldSpace);
      elements.worldLandscape.removeEventListener("click", handleWorldLandscape);
      elements.worldDisco.removeEventListener("click", handleWorldDisco);
      elements.worldRestart.removeEventListener("click", handleWorldRestart);
      elements.mirrorOn.removeEventListener("click", handleMirrorOn);
      elements.mirrorOff.removeEventListener("click", handleMirrorOff);
      elements.resetRuntime.removeEventListener("click", handleReset);
      root.replaceChildren();
    },
  };
}

type DashboardElements = Readonly<{
  blend: HTMLElement;
  control: HTMLElement;
  device: HTMLElement;
  deviceMessage: HTMLElement;
  event: HTMLElement;
  headset: HTMLElement;
  median: HTMLElement;
  mirror: HTMLElement;
  modeAr: HTMLButtonElement;
  modeVr: HTMLButtonElement;
  mirrorOff: HTMLButtonElement;
  mirrorOn: HTMLButtonElement;
  p95: HTMLElement;
  resetRuntime: HTMLButtonElement;
  world: HTMLElement;
  worldSpace: HTMLButtonElement;
  worldLandscape: HTMLButtonElement;
  worldDisco: HTMLButtonElement;
  worldRestart: HTMLButtonElement;
  xr: HTMLElement;
}>;

function renderDashboard(elements: DashboardElements, model: DashboardViewModel): void {
  elements.control.textContent = connectionStatusLabel(model.connectionState);
  elements.device.textContent = deviceStatusLabel(model.deviceState);
  elements.device.dataset.state = model.deviceState;
  elements.device.dataset.fresh = String(model.deviceStatusFresh);
  elements.deviceMessage.textContent = model.deviceMessage;
  elements.headset.textContent = model.headsetConnected ? "Connected" : "Disconnected";
  elements.xr.textContent = model.xrState ?? "Unknown";
  elements.blend.textContent = model.blendMode ?? "Unknown";
  elements.world.textContent = model.confirmedWorldId ?? "Unknown";
  elements.mirror.textContent = mirrorStatusLabel(model.mirrorState);
  elements.median.textContent = formatFrameTime(model.medianFrameMs);
  elements.p95.textContent = formatFrameTime(model.p95FrameMs);
  elements.event.textContent = model.eventMessage;
  elements.resetRuntime.textContent = model.resetPending ? "Restarting PICO…" : "Restart PICO";
  renderModeButtons(elements, model);
  renderWorldButtons(elements, model);
  renderActionAvailability(elements, model);
}

function renderWorldButtons(elements: DashboardElements, model: DashboardViewModel): void {
  const worldButtons: ReadonlyArray<readonly [WorldId, HTMLButtonElement]> = [
    ["space", elements.worldSpace],
    ["landscape", elements.worldLandscape],
    ["disco", elements.worldDisco],
  ];
  for (const [worldId, button] of worldButtons) {
    button.dataset.active = String(model.confirmedWorldId === worldId);
    button.dataset.pending = String(model.requestedWorldId === worldId);
  }
  elements.worldRestart.textContent = model.worldRestartPending
    ? "Restarting experience…"
    : "Restart experience";
}

function renderModeButtons(elements: DashboardElements, model: DashboardViewModel): void {
  elements.modeAr.dataset.active = String(model.confirmedMode === "ar");
  elements.modeVr.dataset.active = String(model.confirmedMode === "vr");
  elements.modeAr.dataset.pending = String(model.requestedMode === "ar");
  elements.modeVr.dataset.pending = String(model.requestedMode === "vr");
}

function renderActionAvailability(elements: DashboardElements, model: DashboardViewModel): void {
  const runtimeActive = model.headsetConnected && model.xrState === "active";
  elements.modeAr.disabled =
    !runtimeActive || model.confirmedMode === "ar" || model.requestedMode === "ar";
  elements.modeVr.disabled =
    !runtimeActive || model.confirmedMode === "vr" || model.requestedMode === "vr";

  const worldTransitionPending = model.requestedWorldId !== undefined || model.worldRestartPending;
  elements.worldSpace.disabled =
    !runtimeActive || worldTransitionPending || model.confirmedWorldId === "space";
  elements.worldLandscape.disabled =
    !runtimeActive || worldTransitionPending || model.confirmedWorldId === "landscape";
  elements.worldDisco.disabled =
    !runtimeActive || worldTransitionPending || model.confirmedWorldId === "disco";
  elements.worldRestart.disabled =
    !runtimeActive || worldTransitionPending || model.confirmedWorldId === undefined;

  const deviceOnline = model.deviceStatusFresh && model.deviceState === "online";
  elements.mirrorOn.disabled =
    !deviceOnline || model.mirrorState === "starting" || model.mirrorState === "running";
  elements.mirrorOff.disabled = !deviceOnline || model.mirrorState === "off";
  elements.resetRuntime.disabled = !model.headsetConnected || model.resetPending;
}

function connectionStatusLabel(state: DashboardConnectionState): string {
  switch (state) {
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "reconnecting":
      return "Reconnecting";
    case "replaced":
      return "Replaced by newer dashboard";
  }
}

function deviceStatusLabel(state: DeviceState): string {
  switch (state) {
    case "online":
      return "PICO online";
    case "searching":
      return "PICO starting · searching";
    case "offline":
      return "PICO offline · ADB keeps searching";
    case "unauthorized":
      return "PICO unauthorized";
    case "multiple":
      return "Multiple devices";
    case "error":
      return "ADB error";
  }
}

function mirrorStatusLabel(state: MirrorState): string {
  switch (state) {
    case "off":
      return "Off";
    case "starting":
      return "Starting";
    case "running":
      return "Running · external window";
    case "error":
      return "Error";
  }
}

function formatFrameTime(value: number | undefined): string {
  return value === undefined ? "—" : `${value.toFixed(1)} ms`;
}

function resolveElements(root: ParentNode): DashboardElements {
  return {
    blend: requireElement(root, "#blend-status", HTMLElement),
    control: requireElement(root, "#control-status", HTMLElement),
    device: requireElement(root, "#device-status", HTMLElement),
    deviceMessage: requireElement(root, "#device-message", HTMLElement),
    event: requireElement(root, "#event-status", HTMLElement),
    headset: requireElement(root, "#headset-status", HTMLElement),
    median: requireElement(root, "#median-status", HTMLElement),
    mirror: requireElement(root, "#mirror-status", HTMLElement),
    modeAr: requireElement(root, "#mode-ar", HTMLButtonElement),
    modeVr: requireElement(root, "#mode-vr", HTMLButtonElement),
    mirrorOff: requireElement(root, "#mirror-off", HTMLButtonElement),
    mirrorOn: requireElement(root, "#mirror-on", HTMLButtonElement),
    p95: requireElement(root, "#p95-status", HTMLElement),
    resetRuntime: requireElement(root, "#reset-runtime", HTMLButtonElement),
    world: requireElement(root, "#world-status", HTMLElement),
    worldSpace: requireElement(root, "#world-space", HTMLButtonElement),
    worldLandscape: requireElement(root, "#world-landscape", HTMLButtonElement),
    worldDisco: requireElement(root, "#world-disco", HTMLButtonElement),
    worldRestart: requireElement(root, "#world-restart", HTMLButtonElement),
    xr: requireElement(root, "#xr-status", HTMLElement),
  };
}

function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
  elementConstructor: { new (): T },
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof elementConstructor)) {
    throw new Error(`Required element is missing: ${selector}`);
  }
  return element;
}

const dashboardMarkup = `
  <header class="hero">
    <p class="eyebrow">Phase 0 · USB capability gate</p>
    <h1>PICO WebXR proof console</h1>
    <p>One immersive session, transparent AR, opaque VR-style, and a bounded USB mirror.</p>
  </header>
  <section class="status-grid" aria-label="PICO and runtime status">
    <article><span>Control</span><strong id="control-status">Connecting</strong></article>
    <article class="device-status-card" role="status" aria-live="polite" aria-atomic="true">
      <span>PICO device</span>
      <strong id="device-status" data-state="searching" data-fresh="false">Searching for PICO</strong>
      <small id="device-message">Waiting for the first ADB snapshot.</small>
    </article>
    <article><span>Headset runtime</span><strong id="headset-status">Disconnected</strong></article>
    <article><span>XR</span><strong id="xr-status">Unknown</strong></article>
    <article><span>Blend mode</span><strong id="blend-status">Unknown</strong></article>
    <article><span>World</span><strong id="world-status">Unknown</strong></article>
    <article><span>Mirror</span><strong id="mirror-status">Off</strong></article>
    <article><span>Frame median</span><strong id="median-status">—</strong></article>
    <article><span>Frame P95</span><strong id="p95-status">—</strong></article>
  </section>
  <section class="controls" aria-label="Capability controls">
    <div>
      <h2>Presentation</h2>
      <div class="button-row">
        <button id="mode-ar" type="button" disabled>AR · passthrough</button>
        <button id="mode-vr" type="button" disabled>VR-style · opaque</button>
      </div>
    </div>
    <div>
      <h2>USB mirror</h2>
      <p>Opens a bounded native scrcpy window cropped to the left physical eye.</p>
      <div class="button-row">
        <button id="mirror-on" type="button" disabled>Open PICO mirror</button>
        <button id="mirror-off" type="button" disabled>Close PICO mirror</button>
      </div>
    </div>
    <div class="world-controls">
      <h2>Experience</h2>
      <p>Switches inside the active XR session with one calm shared transition.</p>
      <div class="button-row">
        <button id="world-space" type="button" disabled>Space</button>
        <button id="world-landscape" type="button" disabled>Landscape</button>
        <button id="world-disco" type="button" disabled>Disco</button>
        <button id="world-restart" type="button" disabled>Restart experience</button>
      </div>
    </div>
  </section>
  <section class="recovery-panel" aria-labelledby="recovery-title">
    <div>
      <p class="eyebrow">Explicit recovery</p>
      <h2 id="recovery-title">Restart PICO</h2>
      <p>Ends the active XR session and reloads the same headset page. Enter XR must then be confirmed again.</p>
    </div>
    <button id="reset-runtime" class="danger-button" type="button" disabled>Restart PICO</button>
  </section>
  <section class="event-panel" aria-live="polite">
    <h2>Latest event</h2>
    <p id="event-status">Waiting for the control service.</p>
  </section>
`;
