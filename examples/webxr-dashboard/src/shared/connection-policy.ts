/**
 * Purpose: Define close-code behavior shared by local WebSocket peers and the relay server.
 * Context: A newer dashboard or headset connection intentionally supersedes an older tab.
 * Responsibilities: Prevent superseded tabs from entering a reconnect replacement loop.
 * Boundaries: Network backoff and socket ownership remain in each application surface.
 */

export const REPLACED_CONNECTION_CLOSE_CODE = 4_001;

export function shouldReconnect(closeCode: number): boolean {
  return closeCode !== REPLACED_CONNECTION_CLOSE_CODE;
}
