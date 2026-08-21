/**
 * Purpose: Guard against duplicate tabs repeatedly replacing each other's WebSocket connection.
 * Context: Superseded dashboard/headset clients must remain closed while real failures reconnect.
 * Responsibilities: Verify the shared intentional-close policy.
 * Boundaries: End-to-end socket relay behavior is covered by the browser/device checks.
 */

import { describe, expect, it } from "bun:test";
import {
  REPLACED_CONNECTION_CLOSE_CODE,
  shouldReconnect,
} from "../src/shared/connection-policy.ts";

describe("shouldReconnect", () => {
  it("does not reconnect a deliberately superseded tab", () => {
    expect(shouldReconnect(REPLACED_CONNECTION_CLOSE_CODE)).toBe(false);
  });

  it.each([1_000, 1_001, 1_006])("reconnects after ordinary close code %s", (closeCode) => {
    expect(shouldReconnect(closeCode)).toBe(true);
  });
});
