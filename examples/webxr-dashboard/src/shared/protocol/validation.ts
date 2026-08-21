/**
 * Purpose: Provide small reusable guards for role-specific protocol parsers.
 * Context: Every WebSocket payload is untrusted until version, shape, and value bounds are checked.
 * Responsibilities: Parse versioned records and validate finite protocol primitives and exact keys.
 * Boundaries: These helpers do not construct messages or escape the protocol implementation folder.
 */

import {
  type DeviceState,
  type DisplayMode,
  type EnvironmentBlendMode,
  MAX_REQUEST_ID_LENGTH,
  MAX_TEXT_LENGTH,
  type MirrorState,
  PROTOCOL_VERSION,
  type WorldId,
  type XrState,
} from "./messages.ts";

export function parseVersionedRecord(data: unknown): Record<string, unknown> | undefined {
  if (typeof data !== "string") return undefined;

  try {
    const value: unknown = JSON.parse(data);
    if (!isRecord(value) || value.version !== PROTOCOL_VERSION || typeof value.type !== "string") {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

export function isDisplayMode(value: unknown): value is DisplayMode {
  return value === "ar" || value === "vr";
}

export function isWorldId(value: unknown): value is WorldId {
  return value === "space" || value === "landscape" || value === "disco";
}

export function isXrState(value: unknown): value is XrState {
  return (
    value === "unsupported" ||
    value === "ready" ||
    value === "requesting" ||
    value === "active" ||
    value === "ended" ||
    value === "error"
  );
}

export function isDeviceState(value: unknown): value is DeviceState {
  return (
    value === "searching" ||
    value === "offline" ||
    value === "unauthorized" ||
    value === "multiple" ||
    value === "online" ||
    value === "error"
  );
}

export function isMirrorState(value: unknown): value is MirrorState {
  return value === "off" || value === "starting" || value === "running" || value === "error";
}

export function isOptionalEnvironmentBlendMode(
  value: unknown,
): value is EnvironmentBlendMode | undefined {
  return (
    value === undefined || value === "opaque" || value === "additive" || value === "alpha-blend"
  );
}

export function isRequestId(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= MAX_REQUEST_ID_LENGTH
  );
}

export function isOptionalBoundedText(value: unknown): value is string | undefined {
  return value === undefined || isBoundedText(value);
}

export function isBoundedText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_TEXT_LENGTH;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
