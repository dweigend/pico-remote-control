/**
 * Purpose: Restrict Bun WebSocket upgrades to the fixed local application origin.
 * Context: The dashboard and PICO runtime share one loopback origin forwarded over USB-C.
 * Responsibilities: Validate the browser-supplied Host and Origin headers.
 * Boundaries: Bun owns ping, idle-timeout, payload-limit, and connection lifecycle behavior.
 */

const ALLOWED_HOSTS = new Set(["127.0.0.1:5173", "localhost:5173"]);
const ALLOWED_ORIGINS = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);

export function isAllowedWebSocketRequest(request: Pick<Request, "headers">): boolean {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  return host !== null && origin !== null && ALLOWED_HOSTS.has(host) && ALLOWED_ORIGINS.has(origin);
}
