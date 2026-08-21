/**
 * Purpose: Own the reconnecting WebSocket channel used by the PICO runtime.
 * Context: XR rendering must continue while local control traffic disconnects and reconnects.
 * Responsibilities: Validate inbound commands, bound the frame queue, reconnect, and send status.
 * Boundaries: This service does not apply commands or mutate XR, experience, renderer, or UI state.
 */

import { shouldReconnect } from "../shared/connection-policy.ts";
import {
  type HeadsetCommand,
  type HeadsetOutboundMessage,
  parseServerToHeadset,
} from "../shared/protocol.ts";

const MAX_PENDING_COMMANDS = 32;
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 5_000] as const;

type HeadsetControlChannelOptions = Readonly<{
  onOpen: () => void;
  onNotice: (message: string) => void;
}>;

export class HeadsetControlChannel {
  private readonly pendingCommands: HeadsetCommand[] = [];
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private started = false;
  private disposed = false;

  constructor(private readonly options: HeadsetControlChannelOptions) {}

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.connect();
  }

  drainCommands(apply: (command: HeadsetCommand) => void): void {
    let command = this.pendingCommands.shift();
    while (command !== undefined) {
      apply(command);
      command = this.pendingCommands.shift();
    }
  }

  send(message: HeadsetOutboundMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingCommands.length = 0;
    this.clearReconnectTimer();
    this.closeSocket();
  }

  private connect(): void {
    if (this.disposed || this.socket !== null) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/headset`);
    this.socket = socket;
    socket.addEventListener("open", this.handleOpen);
    socket.addEventListener("message", this.handleMessage);
    socket.addEventListener("close", this.handleClose);
    socket.addEventListener("error", this.handleError);
  }

  private readonly handleOpen = (): void => {
    this.reconnectAttempt = 0;
    this.options.onNotice("Control connection restored.");
    this.options.onOpen();
  };

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    const command = parseServerToHeadset(event.data);
    if (command === undefined) {
      this.options.onNotice("Rejected an invalid control message.");
      return;
    }
    if (this.pendingCommands.length >= MAX_PENDING_COMMANDS) {
      this.sendQueueFullResult(command.requestId);
      return;
    }
    this.pendingCommands.push(command);
  };

  private readonly handleClose = (event: CloseEvent): void => {
    this.detachSocketListeners();
    this.socket = null;
    if (!shouldReconnect(event.code)) {
      this.options.onNotice("This page was replaced by a newer headset connection.");
      return;
    }
    this.scheduleReconnect();
  };

  private readonly handleError = (): void => {
    this.options.onNotice("Control WebSocket error; XR rendering continues.");
  };

  private sendQueueFullResult(requestId: string): void {
    this.send({
      version: 1,
      type: "command-result",
      requestId,
      ok: false,
      error: "Headset command queue is full",
    });
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer !== null) return;
    const delayIndex = Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1);
    const delay = RECONNECT_DELAYS_MS[delayIndex] ?? RECONNECT_DELAYS_MS.at(-1) ?? 5_000;
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) return;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private closeSocket(): void {
    if (this.socket === null) return;
    this.detachSocketListeners();
    this.socket.close();
    this.socket = null;
  }

  private detachSocketListeners(): void {
    if (this.socket === null) return;
    this.socket.removeEventListener("open", this.handleOpen);
    this.socket.removeEventListener("message", this.handleMessage);
    this.socket.removeEventListener("close", this.handleClose);
    this.socket.removeEventListener("error", this.handleError);
  }
}
