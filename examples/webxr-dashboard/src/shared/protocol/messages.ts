/**
 * Purpose: Define every serializable message in the local PICO control protocol.
 * Context: Role-specific parsers validate untrusted JSON into these discriminated unions.
 * Responsibilities: Own protocol constants, states, commands, snapshots, results, and telemetry types.
 * Boundaries: This file contains no parsing, transport, application state, or side effects.
 */

export const PROTOCOL_VERSION = 1 as const;
export const MAX_REQUEST_ID_LENGTH = 128;
export const MAX_TEXT_LENGTH = 512;

export type DisplayMode = "ar" | "vr";
export type WorldId = "space" | "landscape" | "disco";
export type XrState = "unsupported" | "ready" | "requesting" | "active" | "ended" | "error";
export type DeviceState =
  | "searching"
  | "offline"
  | "unauthorized"
  | "multiple"
  | "online"
  | "error";
export type MirrorState = "off" | "starting" | "running" | "error";
export type EnvironmentBlendMode = "opaque" | "additive" | "alpha-blend";

export type SetModeCommand = Readonly<{
  version: 1;
  type: "set-mode";
  requestId: string;
  mode: DisplayMode;
}>;

export type ResetRuntimeCommand = Readonly<{
  version: 1;
  type: "reset-runtime";
  requestId: string;
}>;

export type LoadWorldCommand = Readonly<{
  version: 1;
  type: "load-world";
  requestId: string;
  worldId: WorldId;
}>;

export type RestartWorldCommand = Readonly<{
  version: 1;
  type: "restart-world";
  requestId: string;
}>;

export type SetMirrorCommand = Readonly<{
  version: 1;
  type: "set-mirror";
  requestId: string;
  enabled: boolean;
}>;

export type DashboardCommand =
  | SetModeCommand
  | LoadWorldCommand
  | RestartWorldCommand
  | ResetRuntimeCommand
  | SetMirrorCommand;
export type HeadsetCommand =
  | SetModeCommand
  | LoadWorldCommand
  | RestartWorldCommand
  | ResetRuntimeCommand;

export type CommandResult = Readonly<{
  version: 1;
  type: "command-result";
  requestId: string;
  ok: boolean;
  error?: string;
}>;

export type RuntimeStatus = Readonly<{
  version: 1;
  type: "runtime-status";
  xrState: XrState;
  mode: DisplayMode;
  worldId: WorldId;
  environmentBlendMode?: EnvironmentBlendMode;
  message?: string;
}>;

export type Telemetry = Readonly<{
  version: 1;
  type: "telemetry";
  sampleCount: number;
  medianFrameMs: number;
  p95FrameMs: number;
}>;

export type HeadsetOutboundMessage = CommandResult | RuntimeStatus | Telemetry;

export type DeviceStatus = Readonly<{
  version: 1;
  type: "device-status";
  state: DeviceState;
  message: string;
}>;

export type PeerStatus = Readonly<{
  version: 1;
  type: "peer-status";
  peer: "headset";
  connected: boolean;
}>;

export type MirrorStatus = Readonly<{
  version: 1;
  type: "mirror-status";
  state: MirrorState;
  message: string;
}>;

export type ServerStatus = DeviceStatus | PeerStatus | MirrorStatus;
export type ServerToDashboardMessage = HeadsetOutboundMessage | ServerStatus;
