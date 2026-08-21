/**
 * Purpose: Validate status, result, and telemetry messages emitted by the headset role.
 * Context: The server relays only bounded, versioned runtime data to the dashboard.
 * Responsibilities: Parse exact outbound shapes and preserve optional fields under strict typing.
 * Boundaries: This module owns no WebXR state, telemetry collection, relay, or UI.
 */

import {
  type CommandResult,
  type EnvironmentBlendMode,
  type HeadsetOutboundMessage,
  PROTOCOL_VERSION,
  type RuntimeStatus,
  type Telemetry,
} from "./messages.ts";
import {
  hasOnlyKeys,
  isDisplayMode,
  isNonNegativeFiniteNumber,
  isNonNegativeInteger,
  isOptionalBoundedText,
  isOptionalEnvironmentBlendMode,
  isRequestId,
  isWorldId,
  isXrState,
  parseVersionedRecord,
} from "./validation.ts";

export function parseHeadsetToServer(data: unknown): HeadsetOutboundMessage | undefined {
  const value = parseVersionedRecord(data);
  return value === undefined ? undefined : parseHeadsetMessageRecord(value);
}

export function parseHeadsetMessageRecord(
  value: Record<string, unknown>,
): HeadsetOutboundMessage | undefined {
  switch (value.type) {
    case "command-result":
      return parseCommandResult(value);
    case "runtime-status":
      return parseRuntimeStatus(value);
    case "telemetry":
      return parseTelemetry(value);
    default:
      return undefined;
  }
}

function parseCommandResult(value: Record<string, unknown>): CommandResult | undefined {
  if (
    !hasOnlyKeys(value, ["version", "type", "requestId", "ok", "error"]) ||
    !isRequestId(value.requestId) ||
    typeof value.ok !== "boolean" ||
    !isOptionalBoundedText(value.error)
  ) {
    return undefined;
  }

  const result: CommandResult = {
    version: PROTOCOL_VERSION,
    type: "command-result",
    requestId: value.requestId,
    ok: value.ok,
  };
  return value.error === undefined ? result : { ...result, error: value.error };
}

function parseRuntimeStatus(value: Record<string, unknown>): RuntimeStatus | undefined {
  if (!hasValidRuntimeShape(value)) return undefined;

  const status: RuntimeStatus = {
    version: PROTOCOL_VERSION,
    type: "runtime-status",
    xrState: value.xrState,
    mode: value.mode,
    worldId: value.worldId,
  };
  return addRuntimeStatusOptionals(status, value.environmentBlendMode, value.message);
}

function hasValidRuntimeShape(value: Record<string, unknown>): value is Record<string, unknown> & {
  xrState: RuntimeStatus["xrState"];
  mode: RuntimeStatus["mode"];
  worldId: RuntimeStatus["worldId"];
  environmentBlendMode: EnvironmentBlendMode | undefined;
  message: string | undefined;
} {
  return (
    hasOnlyKeys(value, [
      "version",
      "type",
      "xrState",
      "mode",
      "worldId",
      "environmentBlendMode",
      "message",
    ]) &&
    isXrState(value.xrState) &&
    isDisplayMode(value.mode) &&
    isWorldId(value.worldId) &&
    isOptionalEnvironmentBlendMode(value.environmentBlendMode) &&
    isOptionalBoundedText(value.message)
  );
}

function addRuntimeStatusOptionals(
  status: RuntimeStatus,
  environmentBlendMode: EnvironmentBlendMode | undefined,
  message: string | undefined,
): RuntimeStatus {
  return {
    ...status,
    ...(environmentBlendMode === undefined ? {} : { environmentBlendMode }),
    ...(message === undefined ? {} : { message }),
  };
}

function parseTelemetry(value: Record<string, unknown>): Telemetry | undefined {
  if (
    !hasOnlyKeys(value, ["version", "type", "sampleCount", "medianFrameMs", "p95FrameMs"]) ||
    !isNonNegativeInteger(value.sampleCount) ||
    !isNonNegativeFiniteNumber(value.medianFrameMs) ||
    !isNonNegativeFiniteNumber(value.p95FrameMs)
  ) {
    return undefined;
  }
  return {
    version: PROTOCOL_VERSION,
    type: "telemetry",
    sampleCount: value.sampleCount,
    medianFrameMs: value.medianFrameMs,
    p95FrameMs: value.p95FrameMs,
  };
}
