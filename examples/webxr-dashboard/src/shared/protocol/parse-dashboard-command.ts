/**
 * Purpose: Validate commands entering the server or headset from the dashboard role.
 * Context: Mirror commands stop at the server while XR presentation and reset reach the headset.
 * Responsibilities: Parse exact command shapes and narrow commands by their allowed destination.
 * Boundaries: This module owns no command execution, correlation state, sockets, or UI.
 */

import {
  type DashboardCommand,
  type HeadsetCommand,
  type LoadWorldCommand,
  PROTOCOL_VERSION,
  type ResetRuntimeCommand,
  type RestartWorldCommand,
  type SetMirrorCommand,
  type SetModeCommand,
} from "./messages.ts";
import {
  hasOnlyKeys,
  isDisplayMode,
  isRequestId,
  isWorldId,
  parseVersionedRecord,
} from "./validation.ts";

export function parseDashboardToServer(data: unknown): DashboardCommand | undefined {
  const value = parseVersionedRecord(data);
  if (value === undefined) return undefined;

  switch (value.type) {
    case "set-mode":
      return parseSetModeCommand(value);
    case "load-world":
      return parseLoadWorldCommand(value);
    case "restart-world":
      return parseRestartWorldCommand(value);
    case "reset-runtime":
      return parseResetRuntimeCommand(value);
    case "set-mirror":
      return parseSetMirrorCommand(value);
    default:
      return undefined;
  }
}

export function parseServerToHeadset(data: unknown): HeadsetCommand | undefined {
  const command = parseDashboardToServer(data);
  return command !== undefined && isHeadsetCommand(command) ? command : undefined;
}

function isHeadsetCommand(command: DashboardCommand): command is HeadsetCommand {
  return command.type !== "set-mirror";
}

function parseSetModeCommand(value: Record<string, unknown>): SetModeCommand | undefined {
  if (
    !hasOnlyKeys(value, ["version", "type", "requestId", "mode"]) ||
    !isRequestId(value.requestId) ||
    !isDisplayMode(value.mode)
  ) {
    return undefined;
  }
  return {
    version: PROTOCOL_VERSION,
    type: "set-mode",
    requestId: value.requestId,
    mode: value.mode,
  };
}

function parseResetRuntimeCommand(value: Record<string, unknown>): ResetRuntimeCommand | undefined {
  if (!hasOnlyKeys(value, ["version", "type", "requestId"]) || !isRequestId(value.requestId)) {
    return undefined;
  }
  return { version: PROTOCOL_VERSION, type: "reset-runtime", requestId: value.requestId };
}

function parseLoadWorldCommand(value: Record<string, unknown>): LoadWorldCommand | undefined {
  if (
    !hasOnlyKeys(value, ["version", "type", "requestId", "worldId"]) ||
    !isRequestId(value.requestId) ||
    !isWorldId(value.worldId)
  ) {
    return undefined;
  }
  return {
    version: PROTOCOL_VERSION,
    type: "load-world",
    requestId: value.requestId,
    worldId: value.worldId,
  };
}

function parseRestartWorldCommand(value: Record<string, unknown>): RestartWorldCommand | undefined {
  if (!hasOnlyKeys(value, ["version", "type", "requestId"]) || !isRequestId(value.requestId)) {
    return undefined;
  }
  return { version: PROTOCOL_VERSION, type: "restart-world", requestId: value.requestId };
}

function parseSetMirrorCommand(value: Record<string, unknown>): SetMirrorCommand | undefined {
  if (
    !hasOnlyKeys(value, ["version", "type", "requestId", "enabled"]) ||
    !isRequestId(value.requestId) ||
    typeof value.enabled !== "boolean"
  ) {
    return undefined;
  }
  return {
    version: PROTOCOL_VERSION,
    type: "set-mirror",
    requestId: value.requestId,
    enabled: value.enabled,
  };
}
