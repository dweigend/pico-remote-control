/**
 * Purpose: Verify that Bun WebSocket upgrades stay on the fixed local application origin.
 * Context: Dashboard and headset control sockets are reachable through USB-forwarded loopback.
 * Responsibilities: Cover accepted loopback pairs and rejected or malformed headers.
 * Boundaries: Bun owns socket liveness, payload limits, and connection cleanup.
 */

import { describe, expect, it } from "bun:test";
import { isAllowedWebSocketRequest } from "../server/websocket-admission.ts";

describe("isAllowedWebSocketRequest", () => {
  it.each([
    ["127.0.0.1:5173", "http://127.0.0.1:5173"],
    ["127.0.0.1:5173", "http://localhost:5173"],
    ["localhost:5173", "http://127.0.0.1:5173"],
    ["localhost:5173", "http://localhost:5173"],
  ] as const)("accepts loopback Host %s with Origin %s", (host, origin) => {
    expect(isAllowedWebSocketRequest(createUpgradeRequest(host, origin))).toBe(true);
  });

  it.each([
    ["missing Host", undefined, "http://localhost:5173"],
    ["missing Origin", "localhost:5173", undefined],
    ["external Host", "example.com:5173", "http://localhost:5173"],
    ["wrong Host port", "localhost:5174", "http://localhost:5173"],
    ["IPv6 Host", "[::1]:5173", "http://localhost:5173"],
    ["external Origin", "localhost:5173", "http://example.com:5173"],
    ["wrong Origin port", "localhost:5173", "http://localhost:5174"],
    ["HTTPS Origin", "localhost:5173", "https://localhost:5173"],
    ["Origin path", "localhost:5173", "http://localhost:5173/dashboard.html"],
    ["null Origin", "localhost:5173", "null"],
  ] as const)("rejects %s", (_label, host, origin) => {
    expect(isAllowedWebSocketRequest(createUpgradeRequest(host, origin))).toBe(false);
  });
});

function createUpgradeRequest(
  host: string | undefined,
  origin: string | undefined,
): Pick<Request, "headers"> {
  const headers = new Headers();
  if (host !== undefined) headers.set("host", host);
  if (origin !== undefined) headers.set("origin", origin);
  return { headers };
}
