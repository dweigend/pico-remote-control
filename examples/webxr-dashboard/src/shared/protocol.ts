/**
 * Purpose: Provide the stable public facade for the versioned control protocol.
 * Context: Server, dashboard, headset, and tests share these contracts and role-specific parsers.
 * Responsibilities: Re-export serializable messages and the validators allowed at app boundaries.
 * Boundaries: Protocol implementation details live in src/shared/protocol and own no runtime state.
 */

export * from "./protocol/messages.ts";
export {
  parseDashboardToServer,
  parseServerToHeadset,
} from "./protocol/parse-dashboard-command.ts";
export { parseHeadsetToServer } from "./protocol/parse-headset-message.ts";
export { parseServerToDashboard } from "./protocol/parse-server-message.ts";
