/**
 * Purpose: Serve the dashboard and headset runtime and relay their validated control messages.
 * Context: Bun exposes one fixed origin to the PICO through USB-C and ADB reverse forwarding.
 * Responsibilities: Own HTTP routes, native WebSockets, ADB recovery, scrcpy, and clean shutdown.
 * Boundaries: The headset owns XR state; this server never infers or mutates experience state.
 */

import { resolve, sep } from "node:path";
import dashboardPage from "../dashboard.html";
import headsetPage from "../headset.html";
import { REPLACED_CONNECTION_CLOSE_CODE } from "../src/shared/connection-policy.ts";
import {
  type CommandResult,
  type MirrorStatus,
  PROTOCOL_VERSION,
  parseDashboardToServer,
  parseHeadsetToServer,
  type RuntimeStatus,
  type SetMirrorCommand,
} from "../src/shared/protocol.ts";
import {
  AdbDeviceMonitor,
  createAdbCommandExecutor,
  type PublicDeviceStatus,
} from "./adb-device-monitor.ts";
import { HeadsetAutoOpener } from "./headset-auto-opener.ts";
import { ScrcpyMirror, type ScrcpyMirrorSnapshot } from "./scrcpy-mirror.ts";
import { isAllowedWebSocketRequest } from "./websocket-admission.ts";

const PORT = 5173;
const HOST = "127.0.0.1";
const HEADSET_PATH = "/ws/headset";
const DASHBOARD_PATH = "/ws/dashboard";
const PUBLIC_ASSET_PREFIX = "/assets/";
const PUBLIC_ASSET_ROOT = resolve("public/assets");
const HEADSET_OPEN_TIMEOUT_MS = 15_000;
const WEBSOCKET_MAX_PAYLOAD_BYTES = 64 * 1_024;
const WEBSOCKET_IDLE_TIMEOUT_SECONDS = 60;
const DEVELOPMENT = Bun.argv.includes("--development");
const INITIAL_DEVICE_STATUS: PublicDeviceStatus = {
  version: 1,
  type: "device-status",
  state: "searching",
  message: "Waiting for the first ADB device scan.",
};

type PeerRole = "dashboard" | "headset";
type PeerSocketData = Readonly<{ role: PeerRole }>;
type PeerSocket = Bun.ServerWebSocket<PeerSocketData>;

interface PeerRegistry {
  readonly sockets: Map<PeerRole, PeerSocket>;
  latestDeviceStatus: PublicDeviceStatus;
  latestMirrorStatus: MirrorStatus;
  latestRuntimeStatus: RuntimeStatus | undefined;
  selectedSerial: string | undefined;
}

interface ConnectionContext {
  readonly autoOpener: HeadsetAutoOpener;
  readonly mirror: ScrcpyMirror;
  readonly peers: PeerRegistry;
}

interface DeviceMonitorDependencies {
  readonly peers: PeerRegistry;
  readonly autoOpener: HeadsetAutoOpener;
  readonly mirror: ScrcpyMirror;
  readonly executeCommand: ReturnType<typeof createAdbCommandExecutor>;
}

async function start(): Promise<() => Promise<void>> {
  const peers = createPeerRegistry();
  const executeAdbCommand = createAdbCommandExecutor();
  const autoOpener = new HeadsetAutoOpener({
    executeCommand: createAdbCommandExecutor({ commandTimeoutMs: HEADSET_OPEN_TIMEOUT_MS }),
    isRuntimeConnected: () => isHeadsetConnected(peers),
    onResult: (message) => publishDeviceMessage(peers, message),
  });
  const mirror = new ScrcpyMirror({
    executeAdbCommand,
    onStatus: (snapshot) => publishMirrorStatus(peers, snapshot),
  });
  const deviceMonitor = createDeviceMonitor({
    peers,
    autoOpener,
    mirror,
    executeCommand: executeAdbCommand,
  });
  const context: ConnectionContext = { autoOpener, mirror, peers };
  const server = Bun.serve<PeerSocketData>({
    hostname: HOST,
    port: PORT,
    // Automatic reloads can terminate the persistent XR session; development assets still
    // re-bundle on the next request without HMR.
    development: DEVELOPMENT ? { hmr: false } : false,
    routes: {
      "/": new Response(null, { status: 302, headers: { location: "/dashboard.html" } }),
      "/dashboard.html": dashboardPage,
      "/headset.html": headsetPage,
      "/api/health": Response.json({ ok: true }),
      "/api/device": () => Response.json(peers.latestDeviceStatus),
      "/assets/*": servePublicAsset,
    },
    fetch(request, bunServer) {
      const role = roleFromPath(new URL(request.url).pathname);
      if (role === undefined || !isAllowedWebSocketRequest(request)) {
        return new Response("Not found", { status: 404 });
      }
      const upgraded = bunServer.upgrade(request, { data: { role } });
      return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
    },
    websocket: {
      data: {} as PeerSocketData,
      open: (socket) => attachPeer(socket, context),
      message: (socket, message) => {
        if (typeof message === "string") handlePeerMessage(message, socket, context);
      },
      close: (socket) => detachPeer(socket, peers),
      idleTimeout: WEBSOCKET_IDLE_TIMEOUT_SECONDS,
      sendPings: true,
      maxPayloadLength: WEBSOCKET_MAX_PAYLOAD_BYTES,
      closeOnBackpressureLimit: true,
      perMessageDeflate: false,
    },
  });

  console.log(`PICO WebXR dashboard: ${server.url}dashboard.html`);
  console.log(`Headset URL: ${server.url}headset.html`);
  deviceMonitor.start();

  return async () => {
    autoOpener.dispose();
    await mirror.dispose();
    await deviceMonitor.dispose();
    for (const socket of peers.sockets.values()) socket.close(1001, "Server shutting down");
    peers.sockets.clear();
    await server.stop(true);
  };
}

function createPeerRegistry(): PeerRegistry {
  return {
    sockets: new Map(),
    latestDeviceStatus: INITIAL_DEVICE_STATUS,
    latestMirrorStatus: createMirrorStatus({ state: "off", message: "PICO mirror is off." }),
    latestRuntimeStatus: undefined,
    selectedSerial: undefined,
  };
}

function createDeviceMonitor(dependencies: DeviceMonitorDependencies): AdbDeviceMonitor {
  const { peers, autoOpener, mirror, executeCommand } = dependencies;
  return new AdbDeviceMonitor({
    executeCommand,
    onReady: (serial) => {
      peers.selectedSerial = serial;
      autoOpener.beginOnlineEpoch(serial);
    },
    onStatus: (status) => {
      publishDeviceStatus(peers, status);
      if (status.state === "online") return;
      peers.selectedSerial = undefined;
      autoOpener.leaveOnline();
      void mirror.stop();
    },
  });
}

function roleFromPath(path: string): PeerRole | undefined {
  if (path === HEADSET_PATH) return "headset";
  return path === DASHBOARD_PATH ? "dashboard" : undefined;
}

function attachPeer(socket: PeerSocket, context: ConnectionContext): void {
  const { role } = socket.data;
  const { autoOpener, peers } = context;
  peers.sockets.get(role)?.close(REPLACED_CONNECTION_CLOSE_CODE, "Replaced by a newer connection");
  peers.sockets.set(role, socket);

  if (role === "dashboard") {
    sendDashboardSnapshot(socket, peers);
    return;
  }
  autoOpener.confirmRuntimeConnected();
  publishDeviceMessage(peers, "PICO online via USB; headset runtime connected.");
  sendPeerStatus(peers.sockets.get("dashboard"), "headset", true);
}

function sendDashboardSnapshot(socket: PeerSocket, peers: PeerRegistry): void {
  sendJson(socket, peers.latestDeviceStatus);
  sendJson(socket, peers.latestMirrorStatus);
  sendPeerStatus(socket, "headset", isHeadsetConnected(peers));
  if (isHeadsetConnected(peers) && peers.latestRuntimeStatus !== undefined) {
    sendJson(socket, peers.latestRuntimeStatus);
  }
}

function detachPeer(socket: PeerSocket, peers: PeerRegistry): void {
  const { role } = socket.data;
  if (peers.sockets.get(role) !== socket) return;
  peers.sockets.delete(role);
  if (role !== "headset") return;
  peers.latestRuntimeStatus = undefined;
  publishDeviceMessage(peers, "PICO online via USB; headset runtime disconnected.");
  sendPeerStatus(peers.sockets.get("dashboard"), "headset", false);
}

function handlePeerMessage(raw: string, source: PeerSocket, context: ConnectionContext): void {
  if (source.data.role === "dashboard") {
    handleDashboardMessage(raw, source, context);
    return;
  }
  const message = parseHeadsetToServer(raw);
  if (message === undefined) return;
  if (message.type === "runtime-status") context.peers.latestRuntimeStatus = message;
  sendJson(context.peers.sockets.get("dashboard"), message);
}

function handleDashboardMessage(raw: string, source: PeerSocket, context: ConnectionContext): void {
  const command = parseDashboardToServer(raw);
  if (command === undefined) return;
  if (command.type === "set-mirror") {
    void applyMirrorCommand(command, source, context);
    return;
  }
  sendJson(context.peers.sockets.get("headset"), command);
}

async function applyMirrorCommand(
  command: SetMirrorCommand,
  dashboard: PeerSocket,
  context: ConnectionContext,
): Promise<void> {
  if (!command.enabled) {
    await context.mirror.stop();
    sendCommandResult(dashboard, command.requestId, true);
    return;
  }
  const serial = context.peers.selectedSerial;
  if (serial === undefined) {
    sendCommandResult(dashboard, command.requestId, false, "No authorized USB PICO is online.");
    return;
  }
  await context.mirror.start(serial);
  const snapshot = context.mirror.snapshot;
  sendCommandResult(
    dashboard,
    command.requestId,
    snapshot.state !== "error",
    snapshot.state === "error" ? snapshot.message : undefined,
  );
}

function sendCommandResult(
  socket: PeerSocket,
  requestId: string,
  ok: boolean,
  error?: string,
): void {
  const result: CommandResult = {
    version: PROTOCOL_VERSION,
    type: "command-result",
    requestId,
    ok,
    ...(error === undefined ? {} : { error }),
  };
  sendJson(socket, result);
}

function sendJson(socket: PeerSocket | undefined, value: object): void {
  socket?.send(JSON.stringify(value));
}

function publishDeviceStatus(peers: PeerRegistry, status: PublicDeviceStatus): void {
  peers.latestDeviceStatus = status;
  sendJson(peers.sockets.get("dashboard"), status);
}

function publishMirrorStatus(peers: PeerRegistry, snapshot: ScrcpyMirrorSnapshot): void {
  const status = createMirrorStatus(snapshot);
  peers.latestMirrorStatus = status;
  sendJson(peers.sockets.get("dashboard"), status);
}

function createMirrorStatus(snapshot: ScrcpyMirrorSnapshot): MirrorStatus {
  return {
    version: PROTOCOL_VERSION,
    type: "mirror-status",
    state: snapshot.state,
    message: snapshot.message,
  };
}

function publishDeviceMessage(peers: PeerRegistry, message: string): void {
  if (peers.latestDeviceStatus.state !== "online") return;
  publishDeviceStatus(peers, { ...peers.latestDeviceStatus, message });
}

function isHeadsetConnected(peers: PeerRegistry): boolean {
  return peers.sockets.has("headset");
}

function sendPeerStatus(socket: PeerSocket | undefined, peer: PeerRole, connected: boolean): void {
  sendJson(socket, { version: PROTOCOL_VERSION, type: "peer-status", peer, connected });
}

async function servePublicAsset(request: Request): Promise<Response> {
  const path = decodeURIComponent(new URL(request.url).pathname.slice(PUBLIC_ASSET_PREFIX.length));
  const filePath = resolve(PUBLIC_ASSET_ROOT, path);
  if (!filePath.startsWith(`${PUBLIC_ASSET_ROOT}${sep}`)) {
    return new Response("Not found", { status: 404 });
  }
  const file = Bun.file(filePath);
  return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
}

const dispose = await start();
let disposing = false;

async function handleSignal(): Promise<void> {
  if (disposing) return;
  disposing = true;
  await dispose();
  process.exitCode = 0;
}

process.once("SIGINT", handleSignal);
process.once("SIGTERM", handleSignal);
