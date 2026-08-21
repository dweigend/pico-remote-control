/**
 * Purpose: Verify the shared protocol rejects invalid or role-inappropriate network messages.
 * Context: Dashboard, server, and headset all consume the same bounded JSON contract.
 * Responsibilities: Cover valid variants, role boundaries, identifiers, text, and telemetry.
 * Boundaries: Transport lifecycle and application state are tested by their owning modules.
 */

import { describe, expect, it } from "bun:test";
import {
  MAX_REQUEST_ID_LENGTH,
  MAX_TEXT_LENGTH,
  parseDashboardToServer,
  parseHeadsetToServer,
  parseServerToDashboard,
  parseServerToHeadset,
} from "../src/shared/protocol.ts";

describe("shared protocol", () => {
  it.each([
    { version: 1, type: "set-mode", requestId: "mode-1", mode: "vr" },
    { version: 1, type: "load-world", requestId: "world-1", worldId: "landscape" },
    { version: 1, type: "restart-world", requestId: "restart-world-1" },
    { version: 1, type: "reset-runtime", requestId: "reset-1" },
    { version: 1, type: "set-mirror", requestId: "mirror-1", enabled: true },
  ] as const)("accepts dashboard command $type", (message) => {
    expect(parseDashboardToServer(JSON.stringify(message))).toEqual(message);
  });

  it.each([
    { version: 1, type: "set-mode", requestId: "mode-1", mode: "ar" },
    { version: 1, type: "load-world", requestId: "world-1", worldId: "disco" },
    { version: 1, type: "restart-world", requestId: "restart-world-1" },
    { version: 1, type: "reset-runtime", requestId: "reset-1" },
  ] as const)("accepts headset command $type", (message) => {
    expect(parseServerToHeadset(JSON.stringify(message))).toEqual(message);
  });

  it("keeps the server-owned mirror command away from the headset", () => {
    const raw = JSON.stringify({
      version: 1,
      type: "set-mirror",
      requestId: "mirror-1",
      enabled: true,
    });
    expect(parseServerToHeadset(raw)).toBeUndefined();
  });

  it.each([
    { version: 1, type: "command-result", requestId: "mode-1", ok: true },
    { version: 1, type: "runtime-status", xrState: "active", mode: "ar", worldId: "space" },
    {
      version: 1,
      type: "telemetry",
      sampleCount: 72,
      medianFrameMs: 13.9,
      p95FrameMs: 14.2,
    },
  ] as const)("accepts headset observation $type", (message) => {
    const raw = JSON.stringify(message);
    expect(parseHeadsetToServer(raw)).toEqual(message);
  });

  it.each([
    { version: 1, type: "device-status", state: "online", message: "PICO online." },
    { version: 1, type: "peer-status", peer: "headset", connected: true },
    { version: 1, type: "mirror-status", state: "running", message: "Mirror running." },
  ] as const)("accepts server status $type", (message) => {
    expect(parseServerToDashboard(JSON.stringify(message))).toEqual(message);
  });

  it.each([
    ["malformed JSON", "{"],
    ["unknown version", JSON.stringify({ version: 2, type: "reset-runtime", requestId: "x" })],
    ["empty request ID", JSON.stringify({ version: 1, type: "reset-runtime", requestId: " " })],
    [
      "long request ID",
      JSON.stringify({
        version: 1,
        type: "reset-runtime",
        requestId: "x".repeat(MAX_REQUEST_ID_LENGTH + 1),
      }),
    ],
  ] as const)("rejects dashboard input with %s", (_label, raw) => {
    expect(parseDashboardToServer(raw)).toBeUndefined();
  });

  it.each([
    ["negative samples", { sampleCount: -1, medianFrameMs: 1, p95FrameMs: 1 }],
    ["fractional samples", { sampleCount: 1.5, medianFrameMs: 1, p95FrameMs: 1 }],
    ["infinite median", { sampleCount: 1, medianFrameMs: Number.POSITIVE_INFINITY, p95FrameMs: 1 }],
    ["negative p95", { sampleCount: 1, medianFrameMs: 1, p95FrameMs: -1 }],
  ] as const)("rejects telemetry with %s", (_label, fields) => {
    expect(
      parseHeadsetToServer(JSON.stringify({ version: 1, type: "telemetry", ...fields })),
    ).toBeUndefined();
  });

  it("rejects oversized external text", () => {
    const raw = JSON.stringify({
      version: 1,
      type: "device-status",
      state: "error",
      message: "x".repeat(MAX_TEXT_LENGTH + 1),
    });
    expect(parseServerToDashboard(raw)).toBeUndefined();
  });

  it("rejects unknown world identifiers at both protocol boundaries", () => {
    const command = JSON.stringify({
      version: 1,
      type: "load-world",
      requestId: "world-1",
      worldId: "unknown",
    });
    const status = JSON.stringify({
      version: 1,
      type: "runtime-status",
      xrState: "active",
      mode: "ar",
      worldId: "unknown",
    });

    expect(parseDashboardToServer(command)).toBeUndefined();
    expect(parseHeadsetToServer(status)).toBeUndefined();
  });

  it("rejects messages from the wrong role", () => {
    const command = JSON.stringify({
      version: 1,
      type: "set-mode",
      requestId: "mode-1",
      mode: "ar",
    });
    expect(parseHeadsetToServer(command)).toBeUndefined();
  });
});
