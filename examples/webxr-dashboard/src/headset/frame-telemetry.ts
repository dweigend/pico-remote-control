/**
 * Purpose: Measure bounded headset frame-time distributions for dashboard telemetry.
 * Context: The render loop needs allocation-free sampling and low-frequency serialized reports.
 * Responsibilities: Record active XR frames, reset inactive samples, and emit median/P95 snapshots.
 * Boundaries: This module does not own timers, sockets, rendering, or UI presentation.
 */

import type { Telemetry } from "../shared/protocol.ts";

const TELEMETRY_INTERVAL_MS = 1_000;
const FRAME_SAMPLE_CAPACITY = 256;

export class FrameTelemetry {
  private readonly samples = new Float32Array(FRAME_SAMPLE_CAPACITY);
  private sampleCount = 0;
  private lastPublishedAt = 0;

  record(timestamp: number, deltaSeconds: number, active: boolean): Telemetry | undefined {
    if (!active) {
      this.sampleCount = 0;
      this.lastPublishedAt = timestamp;
      return undefined;
    }

    if (deltaSeconds > 0 && this.sampleCount < FRAME_SAMPLE_CAPACITY) {
      this.samples[this.sampleCount] = deltaSeconds * 1_000;
      this.sampleCount += 1;
    }
    if (timestamp - this.lastPublishedAt < TELEMETRY_INTERVAL_MS) return undefined;

    const distribution = calculateFrameDistribution(this.samples, this.sampleCount);
    const telemetry: Telemetry = {
      version: 1,
      type: "telemetry",
      sampleCount: this.sampleCount,
      medianFrameMs: distribution.median,
      p95FrameMs: distribution.p95,
    };
    this.sampleCount = 0;
    this.lastPublishedAt = timestamp;
    return telemetry;
  }
}

export function calculateFrameDistribution(
  samples: Float32Array,
  count: number,
): { median: number; p95: number } {
  if (count === 0) return { median: 0, p95: 0 };
  const sorted = Array.from(samples.subarray(0, count)).sort((left, right) => left - right);
  return {
    median: roundToHundredth(percentile(sorted, 0.5)),
    p95: roundToHundredth(percentile(sorted, 0.95)),
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(Math.ceil(sorted.length * fraction) - 1, sorted.length - 1);
  return sorted[Math.max(index, 0)] ?? 0;
}

function roundToHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}
