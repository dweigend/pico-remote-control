/**
 * Purpose: Coordinate authoritative dashboard state, commands, and the operator view.
 * Context: Server snapshots and correlated results must remain separate from optimistic requests.
 * Responsibilities: Reduce protocol messages, track pending commands, guard actions, and render state.
 * Boundaries: DOM mechanics and WebSocket lifecycle are delegated to dedicated modules.
 */

import {
  type DashboardCommand,
  type DeviceState,
  type DisplayMode,
  type EnvironmentBlendMode,
  type MirrorState,
  PROTOCOL_VERSION,
  type ServerToDashboardMessage,
  type WorldId,
  type XrState,
} from "../shared/protocol.ts";
import { DashboardControlConnection } from "./control-connection.ts";
import {
  createDashboardView,
  type DashboardConnectionState,
  type DashboardView,
  type DashboardViewModel,
} from "./dashboard-view.ts";

const COMMAND_TIMEOUT_MS = 5_000;

type CommandDraft =
  | { type: "set-mode"; mode: DisplayMode }
  | { type: "load-world"; worldId: WorldId }
  | { type: "restart-world" }
  | { type: "set-mirror"; enabled: boolean }
  | { type: "reset-runtime" };

type PendingCommand = Readonly<{
  timeout: number;
  type: CommandDraft["type"];
}>;

type DashboardState = {
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
  worldRestartRequestId: string | undefined;
  mirrorState: MirrorState;
  medianFrameMs: number | undefined;
  p95FrameMs: number | undefined;
  eventMessage: string;
  pending: Map<string, PendingCommand>;
  resetRequestId: string | undefined;
};

export class DashboardController {
  private readonly state = createInitialState();
  private readonly view: DashboardView;
  private readonly connection: DashboardControlConnection;
  private started = false;
  private disposed = false;

  constructor(root: HTMLElement) {
    this.view = createDashboardView(root, {
      onModeRequested: (mode) => this.requestMode(mode),
      onWorldRequested: (worldId) => this.requestWorld(worldId),
      onWorldRestartRequested: () => this.requestWorldRestart(),
      onMirrorRequested: (enabled) => this.requestMirror(enabled),
      onRuntimeResetRequested: () => this.requestRuntimeReset(),
    });
    this.connection = new DashboardControlConnection({
      onStateChange: (connectionState) => this.applyConnectionState(connectionState),
      onMessage: (message) => this.applyServerMessage(message),
      onDisconnected: () => this.applyDisconnect(),
      onInvalidMessage: () => this.setEventMessage("Rejected an invalid server message."),
    });
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.render();
    this.connection.start();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of this.state.pending.values()) window.clearTimeout(pending.timeout);
    this.state.pending.clear();
    this.connection.dispose();
    this.view.dispose();
  }

  private applyConnectionState(connectionState: DashboardConnectionState): void {
    this.state.connectionState = connectionState;
    if (connectionState === "connected") {
      this.state.eventMessage = "Dashboard control connection is active.";
    } else if (connectionState === "connecting") {
      this.markDeviceStatusStale("Waiting for the current ADB snapshot.");
    }
    this.render();
  }

  private applyDisconnect(): void {
    this.state.headsetConnected = false;
    this.invalidateRuntimeSnapshot();
    this.markDeviceStatusStale("Control connection lost; the last ADB state may be stale.");
    this.render();
  }

  private applyServerMessage(message: ServerToDashboardMessage): void {
    switch (message.type) {
      case "device-status":
        this.applyDeviceStatus(message.state, message.message);
        return;
      case "peer-status":
        this.applyPeerStatus(message.connected);
        return;
      case "mirror-status":
        this.state.mirrorState = message.state;
        this.state.eventMessage = message.message;
        this.render();
        return;
      case "runtime-status":
        this.applyRuntimeStatus(message);
        return;
      case "telemetry":
        this.state.medianFrameMs = message.medianFrameMs;
        this.state.p95FrameMs = message.p95FrameMs;
        this.render();
        return;
      case "command-result":
        this.applyCommandResult(message);
    }
  }

  private applyDeviceStatus(deviceState: DeviceState, message: string): void {
    this.state.deviceState = deviceState;
    this.state.deviceStatusFresh = true;
    this.state.deviceMessage = message;
    this.render();
  }

  private markDeviceStatusStale(message: string): void {
    this.state.deviceStatusFresh = false;
    this.state.deviceMessage = message;
  }

  private applyPeerStatus(connected: boolean): void {
    this.state.headsetConnected = connected;
    this.state.eventMessage = connected
      ? "Headset runtime connected."
      : "Headset runtime disconnected.";
    if (!connected) this.invalidateRuntimeSnapshot();
    this.render();
  }

  private invalidateRuntimeSnapshot(): void {
    this.state.xrState = undefined;
    this.state.blendMode = undefined;
    this.state.confirmedMode = undefined;
    this.state.requestedMode = undefined;
    this.state.confirmedWorldId = undefined;
    this.state.requestedWorldId = undefined;
    this.state.worldRestartRequestId = undefined;
    this.state.medianFrameMs = undefined;
    this.state.p95FrameMs = undefined;
  }

  private applyRuntimeStatus(
    message: Extract<ServerToDashboardMessage, { type: "runtime-status" }>,
  ): void {
    this.state.xrState = message.xrState;
    this.state.blendMode = message.environmentBlendMode;
    this.state.confirmedMode = message.mode;
    if (message.mode === this.state.requestedMode) this.state.requestedMode = undefined;
    this.state.confirmedWorldId = message.worldId;
    if (message.worldId === this.state.requestedWorldId) this.state.requestedWorldId = undefined;
    this.state.eventMessage =
      message.message ?? `Headset confirmed ${message.mode.toUpperCase()} mode.`;
    if (message.xrState !== "active") {
      this.state.medianFrameMs = undefined;
      this.state.p95FrameMs = undefined;
    }
    this.finishResetFromRuntimeStatus(message);
    this.render();
  }

  private finishResetFromRuntimeStatus(
    message: Extract<ServerToDashboardMessage, { type: "runtime-status" }>,
  ): void {
    if (this.state.resetRequestId === undefined) return;
    if (message.xrState === "ready") {
      this.finishRuntimeReset("PICO runtime reset. Confirm Enter XR again in the headset.");
      return;
    }
    if (message.xrState === "unsupported" || message.xrState === "error") {
      this.finishRuntimeReset(
        message.message ?? `PICO runtime reported ${message.xrState} after reset.`,
      );
    }
  }

  private applyCommandResult(
    message: Extract<ServerToDashboardMessage, { type: "command-result" }>,
  ): void {
    const pending = this.state.pending.get(message.requestId);
    if (pending === undefined) return;
    if (message.requestId === this.state.resetRequestId) {
      this.applyResetCommandResult(message.ok, message.error);
      return;
    }

    this.clearPendingCommand(message.requestId);
    if (pending.type === "restart-world") {
      this.clearWorldRequest(pending.type, message.requestId);
    }
    if (!message.ok && pending.type === "set-mode") this.state.requestedMode = undefined;
    if (!message.ok) this.clearWorldRequest(pending.type, message.requestId);
    this.state.eventMessage = message.ok
      ? "Command accepted; waiting for authoritative status."
      : (message.error ?? "Command failed.");
    this.render();
  }

  private applyResetCommandResult(ok: boolean, error: string | undefined): void {
    if (!ok) {
      this.finishRuntimeReset(error ?? "PICO runtime reset failed.");
      return;
    }
    this.state.eventMessage = "Reset accepted; waiting for the restarted PICO runtime.";
    this.render();
  }

  private requestMode(mode: DisplayMode): void {
    if (
      !this.isRuntimeActive() ||
      this.state.confirmedMode === mode ||
      this.state.requestedMode === mode
    ) {
      return;
    }
    if (this.sendCommand({ type: "set-mode", mode }) === undefined) return;
    this.state.requestedMode = mode;
    this.render();
  }

  private requestMirror(enabled: boolean): void {
    if (!this.isDeviceOnline()) return;
    if (
      enabled &&
      (this.state.mirrorState === "starting" || this.state.mirrorState === "running")
    ) {
      return;
    }
    if (!enabled && this.state.mirrorState === "off") return;
    this.sendCommand({ type: "set-mirror", enabled });
  }

  private requestWorld(worldId: WorldId): void {
    if (
      !this.isRuntimeActive() ||
      this.state.confirmedWorldId === worldId ||
      this.state.requestedWorldId !== undefined ||
      this.state.worldRestartRequestId !== undefined
    ) {
      return;
    }
    if (this.sendCommand({ type: "load-world", worldId }) === undefined) return;
    this.state.requestedWorldId = worldId;
    this.render();
  }

  private requestWorldRestart(): void {
    if (
      !this.isRuntimeActive() ||
      this.state.confirmedWorldId === undefined ||
      this.state.requestedWorldId !== undefined ||
      this.state.worldRestartRequestId !== undefined
    ) {
      return;
    }
    const requestId = this.sendCommand({ type: "restart-world" });
    if (requestId === undefined) return;
    this.state.worldRestartRequestId = requestId;
    this.render();
  }

  private requestRuntimeReset(): void {
    if (!this.state.headsetConnected || this.state.resetRequestId !== undefined) return;
    if (!this.view.confirmRuntimeReset()) return;
    const requestId = this.sendCommand({ type: "reset-runtime" });
    if (requestId === undefined) return;
    this.state.resetRequestId = requestId;
    this.state.eventMessage = "Ending the active XR session and reloading the headset page…";
    this.render();
  }

  private sendCommand(command: CommandDraft): string | undefined {
    const requestId = crypto.randomUUID();
    if (!this.connection.send(createCommand(command, requestId))) {
      this.setEventMessage("Control connection is unavailable.");
      return undefined;
    }

    const timeout = window.setTimeout(
      () => this.handleCommandTimeout(requestId),
      COMMAND_TIMEOUT_MS,
    );
    this.state.pending.set(requestId, { timeout, type: command.type });
    this.state.eventMessage = "Command pending…";
    this.render();
    return requestId;
  }

  private handleCommandTimeout(requestId: string): void {
    const pending = this.state.pending.get(requestId);
    if (pending === undefined) return;
    this.state.pending.delete(requestId);
    if (pending.type === "set-mode") this.state.requestedMode = undefined;
    this.clearWorldRequest(pending.type, requestId);
    if (requestId === this.state.resetRequestId) {
      this.finishRuntimeReset("PICO runtime reset timed out.");
      return;
    }
    this.state.eventMessage = "Command timed out without authoritative confirmation.";
    this.render();
  }

  private finishRuntimeReset(message: string): void {
    if (this.state.resetRequestId !== undefined) {
      this.clearPendingCommand(this.state.resetRequestId);
    }
    this.state.resetRequestId = undefined;
    this.state.eventMessage = message;
  }

  private clearPendingCommand(requestId: string): void {
    const pending = this.state.pending.get(requestId);
    if (pending === undefined) return;
    window.clearTimeout(pending.timeout);
    this.state.pending.delete(requestId);
  }

  private clearWorldRequest(type: CommandDraft["type"], requestId: string): void {
    if (type === "load-world") this.state.requestedWorldId = undefined;
    if (type === "restart-world" && requestId === this.state.worldRestartRequestId) {
      this.state.worldRestartRequestId = undefined;
    }
  }

  private setEventMessage(message: string): void {
    this.state.eventMessage = message;
    this.render();
  }

  private isRuntimeActive(): boolean {
    return this.state.headsetConnected && this.state.xrState === "active";
  }

  private isDeviceOnline(): boolean {
    return this.state.deviceStatusFresh && this.state.deviceState === "online";
  }

  private render(): void {
    if (this.disposed) return;
    this.view.render(createViewModel(this.state));
  }
}

function createInitialState(): DashboardState {
  return {
    connectionState: "connecting",
    deviceState: "searching",
    deviceStatusFresh: false,
    deviceMessage: "Waiting for the first ADB snapshot.",
    headsetConnected: false,
    xrState: undefined,
    blendMode: undefined,
    confirmedMode: undefined,
    requestedMode: undefined,
    confirmedWorldId: undefined,
    requestedWorldId: undefined,
    worldRestartRequestId: undefined,
    mirrorState: "off",
    medianFrameMs: undefined,
    p95FrameMs: undefined,
    eventMessage: "Waiting for the control service.",
    pending: new Map(),
    resetRequestId: undefined,
  };
}

function createViewModel(state: DashboardState): DashboardViewModel {
  return {
    connectionState: state.connectionState,
    deviceState: state.deviceState,
    deviceStatusFresh: state.deviceStatusFresh,
    deviceMessage: state.deviceMessage,
    headsetConnected: state.headsetConnected,
    xrState: state.xrState,
    blendMode: state.blendMode,
    confirmedMode: state.confirmedMode,
    requestedMode: state.requestedMode,
    confirmedWorldId: state.confirmedWorldId,
    requestedWorldId: state.requestedWorldId,
    worldRestartPending: state.worldRestartRequestId !== undefined,
    mirrorState: state.mirrorState,
    medianFrameMs: state.medianFrameMs,
    p95FrameMs: state.p95FrameMs,
    eventMessage: state.eventMessage,
    resetPending: state.resetRequestId !== undefined,
  };
}

function createCommand(command: CommandDraft, requestId: string): DashboardCommand {
  switch (command.type) {
    case "set-mode":
      return { version: PROTOCOL_VERSION, requestId, type: command.type, mode: command.mode };
    case "load-world":
      return { version: PROTOCOL_VERSION, requestId, type: command.type, worldId: command.worldId };
    case "restart-world":
      return { version: PROTOCOL_VERSION, requestId, type: command.type };
    case "set-mirror":
      return { version: PROTOCOL_VERSION, requestId, type: command.type, enabled: command.enabled };
    case "reset-runtime":
      return { version: PROTOCOL_VERSION, requestId, type: command.type };
  }
}
