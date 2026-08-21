/**
 * Purpose: Verify bounded frame telemetry independently from the WebXR render loop.
 * Context: Refactoring must preserve median/P95 reporting and inactive-session resets.
 * Responsibilities: Cover distribution math, publication cadence, and inactive sample clearing.
 * Boundaries: Device timing quality and frame-rate acceptance remain physical PICO evidence.
 */

import { describe, expect, it } from "bun:test";
import { calculateFrameDistribution, FrameTelemetry } from "../src/headset/frame-telemetry.ts";

describe("frame telemetry", () => {
  it("calculates the nearest-rank median and P95", () => {
    const samples = new Float32Array([20, 10, 40, 30]);
    expect(calculateFrameDistribution(samples, 4)).toEqual({ median: 20, p95: 40 });
  });

  it("publishes once per interval and clears samples while XR is inactive", () => {
    const telemetry = new FrameTelemetry();

    expect(telemetry.record(100, 0.01, false)).toBeUndefined();
    expect(telemetry.record(500, 0.012, true)).toBeUndefined();
    expect(telemetry.record(1_101, 0.018, true)).toMatchObject({
      sampleCount: 2,
      medianFrameMs: 12,
      p95FrameMs: 18,
    });

    expect(telemetry.record(1_200, 0.02, false)).toBeUndefined();
    expect(telemetry.record(2_201, 0.016, true)).toMatchObject({
      sampleCount: 1,
      medianFrameMs: 16,
      p95FrameMs: 16,
    });
  });
});
