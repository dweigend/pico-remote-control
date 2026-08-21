/**
 * Purpose: Own the reconnecting dashboard WebSocket and its protocol boundary.
 * Context: The operator UI must recover from server restarts without retaining stale authority.
 * Responsibilities: Connect, validate server messages, send commands, classify closes, and dispose.
 * Boundaries: This service does not own dashboard state, DOM, command timeouts, ADB, or XR.
 */

import { shouldReconnect } from "../shared/connection-policy.ts";
import {
  type DashboardCommand,
  parseServerToDashboard,
  type ServerToDashboardMessage,
} from "../shared/protocol.ts";
import type { DashboardConnectionState } from "./dashboard-view.ts";

const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 5_000] as const;

type DashboardControlConnectionOptions = Readonly<{
  onStateChange: (state: DashboardConnectionState) => void;
  onMessage: (message: ServerToDashboardMessage) => void;
  onDisconnected: () => void;
  onInvalidMessage: () => void;
}>;

export class DashboardControlConnection {
  private socket: WebSocket | undefined;
  private reconnectAttempt = 0;
  private reconnectTimer: number | undefined;
  private started = false;
  private disposed = false;

  constructor(private readonly options: DashboardControlConnectionOptions) {}

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.connect();
  }

  send(command: DashboardCommand): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(command));
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.closeSocket();
  }

  private connect(): void {
    if (this.disposed) return;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;

    const socket = new WebSocket(createSocketUrl());
    this.socket = socket;
    this.options.onStateChange(this.reconnectAttempt === 0 ? "connecting" : "reconnecting");
    socket.addEventListener("open", this.handleOpen);
    socket.addEventListener("message", this.handleMessage);
    socket.addEventListener("close", this.handleClose);
    socket.addEventListener("error", this.handleError);
  }

  private readonly handleOpen = (): void => {
    this.reconnectAttempt = 0;
    this.options.onStateChange("connected");
  };

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    const message = parseServerToDashboard(event.data);
    if (message === undefined) {
      this.options.onInvalidMessage();
      return;
    }
    this.options.onMessage(message);
  };

  private readonly handleClose = (event: CloseEvent): void => {
    const closedSocket = event.currentTarget;
    if (closedSocket !== this.socket) return;
    this.detachSocketListeners();
    this.socket = undefined;
    this.options.onDisconnected();
    if (!shouldReconnect(event.code)) {
      this.options.onStateChange("replaced");
      return;
    }
    this.scheduleReconnect();
  };

  private readonly handleError = (): void => {
    this.socket?.close();
  };

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer !== undefined) return;
    this.options.onStateChange("reconnecting");
    const delayIndex = Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1);
    const delay = RECONNECT_DELAYS_MS[delayIndex] ?? RECONNECT_DELAYS_MS.at(-1) ?? 5_000;
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  private closeSocket(): void {
    if (this.socket === undefined) return;
    this.detachSocketListeners();
    this.socket.close(1_000, "Dashboard page closed");
    this.socket = undefined;
  }

  private detachSocketListeners(): void {
    if (this.socket === undefined) return;
    this.socket.removeEventListener("open", this.handleOpen);
    this.socket.removeEventListener("message", this.handleMessage);
    this.socket.removeEventListener("close", this.handleClose);
    this.socket.removeEventListener("error", this.handleError);
  }
}

function createSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/dashboard`;
}
