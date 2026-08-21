/**
 * Purpose: Validate the complete message set sent from the control server to the dashboard.
 * Context: Server-owned device, peer, and mirror status shares a channel with relayed headset data.
 * Responsibilities: Dispatch by message type and parse exact server-owned status snapshots.
 * Boundaries: This module does not apply snapshots, render UI, control processes, or own sockets.
 */

import {
  type DeviceStatus,
  type MirrorStatus,
  type PeerStatus,
  PROTOCOL_VERSION,
  type ServerToDashboardMessage,
} from "./messages.ts";
import { parseHeadsetMessageRecord } from "./parse-headset-message.ts";
import {
  hasOnlyKeys,
  isBoundedText,
  isDeviceState,
  isMirrorState,
  parseVersionedRecord,
} from "./validation.ts";

export function parseServerToDashboard(data: unknown): ServerToDashboardMessage | undefined {
  const value = parseVersionedRecord(data);
  if (value === undefined) return undefined;

  switch (value.type) {
    case "device-status":
      return parseDeviceStatus(value);
    case "peer-status":
      return parsePeerStatus(value);
    case "mirror-status":
      return parseMirrorStatus(value);
    default:
      return parseHeadsetMessageRecord(value);
  }
}

function parseDeviceStatus(value: Record<string, unknown>): DeviceStatus | undefined {
  if (
    !hasOnlyKeys(value, ["version", "type", "state", "message"]) ||
    !isDeviceState(value.state) ||
    !isBoundedText(value.message)
  ) {
    return undefined;
  }
  return {
    version: PROTOCOL_VERSION,
    type: "device-status",
    state: value.state,
    message: value.message,
  };
}

function parsePeerStatus(value: Record<string, unknown>): PeerStatus | undefined {
  if (
    !hasOnlyKeys(value, ["version", "type", "peer", "connected"]) ||
    value.peer !== "headset" ||
    typeof value.connected !== "boolean"
  ) {
    return undefined;
  }
  return {
    version: PROTOCOL_VERSION,
    type: "peer-status",
    peer: "headset",
    connected: value.connected,
  };
}

function parseMirrorStatus(value: Record<string, unknown>): MirrorStatus | undefined {
  if (
    !hasOnlyKeys(value, ["version", "type", "state", "message"]) ||
    !isMirrorState(value.state) ||
    !isBoundedText(value.message)
  ) {
    return undefined;
  }
  return {
    version: PROTOCOL_VERSION,
    type: "mirror-status",
    state: value.state,
    message: value.message,
  };
}
