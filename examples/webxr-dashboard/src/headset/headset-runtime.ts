/**
 * Purpose: Coordinate the persistent PICO WebXR runtime and its application services.
 * Context: One immersive-ar session hosts presentation changes while control may reconnect.
 * Responsibilities: Own XR lifecycle, frame order, command application, status, and cleanup.
 * Boundaries: DOM rendering, socket mechanics, world internals, and renderer construction are delegated.
 */

import { getExperienceFactory } from "../experiences/experience-registry.ts";
import {
  type DisplayMode,
  type EnvironmentBlendMode,
  type HeadsetCommand,
  MAX_TEXT_LENGTH,
  type RuntimeStatus,
  type WorldId,
  type XrState,
} from "../shared/protocol.ts";
import { HeadsetControlChannel } from "./control-channel.ts";
import { ExperienceHost } from "./experience-host.ts";
import type { TransitionResult } from "./experience-transition.ts";
import { FrameTelemetry } from "./frame-telemetry.ts";
import { createHeadsetView, type HeadsetView } from "./headset-view.ts";
import { createHeadsetRenderer } from "./renderer.ts";

const MAX_FRAME_DELTA_SECONDS = 0.05;
const RESET_RELOAD_DELAY_MS = 100;

export class HeadsetRuntime {
  private readonly view: HeadsetView;
  private readonly renderer = createHeadsetRenderer();
  private readonly experienceHost = new ExperienceHost(getExperienceFactory("space"));
  private readonly telemetry = new FrameTelemetry();
  private readonly control: HeadsetControlChannel;
  private xrSession: XRSession | null = null;
  private lastFrameTime = 0;
  private elapsedSeconds = 0;
  private mode: DisplayMode = "ar";
  private worldId: WorldId = "space";
  private xrState: XrState = "ready";
  private blendMode: EnvironmentBlendMode | undefined;
  private generation = 0;
  private started = false;
  private disposed = false;

  constructor(
    private readonly root: HTMLElement,
    view: HeadsetView = createHeadsetView(root),
  ) {
    this.view = view;
    this.control = new HeadsetControlChannel({
      onOpen: () => this.publishStatus(),
      onNotice: (message) => this.syncView(message),
    });
    this.root.prepend(this.renderer.domElement);
    this.syncView("Checking immersive AR support…");
  }

  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;
    await this.experienceHost.start();
    if (this.disposed) return;
    this.view.enterButton.addEventListener("click", this.handleEnterXr);
    window.addEventListener("resize", this.handleResize);
    this.handleResize();
    this.control.start();
    this.renderer.setAnimationLoop(this.handleFrame);
    await this.checkXrSupport(this.generation);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.renderer.setAnimationLoop(null);
    this.view.enterButton.removeEventListener("click", this.handleEnterXr);
    window.removeEventListener("resize", this.handleResize);
    this.control.dispose();
    this.endOwnedSession();
    this.experienceHost.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.view.dispose();
  }

  private readonly handleResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.experienceHost.resize(width, height);
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  };

  private readonly handleEnterXr = (): void => {
    void this.enterXr();
  };

  private readonly handleSessionEnd = (event: Event): void => {
    if (event.currentTarget !== this.xrSession || this.disposed) return;
    this.xrSession = null;
    this.blendMode = undefined;
    this.xrState = "ended";
    this.view.setEnterAvailable(true);
    this.syncView("The XR session ended. Enter XR can be confirmed again.");
    this.publishStatus("XR session ended");
  };

  private readonly handleFrame = (timestamp: number): void => {
    const deltaSeconds = this.calculateDeltaSeconds(timestamp);
    this.control.drainCommands((command) => this.applyCommand(command));
    this.elapsedSeconds += deltaSeconds;
    this.experienceHost.update(deltaSeconds, this.elapsedSeconds);
    this.publishTelemetry(timestamp, deltaSeconds);
    this.renderer.render(this.experienceHost.scene, this.experienceHost.camera);
  };

  private async checkXrSupport(generation: number): Promise<void> {
    if (!navigator.xr) {
      this.setCapabilityFailure("WebXR is unavailable in this browser.");
      return;
    }

    try {
      const supported = await navigator.xr.isSessionSupported("immersive-ar");
      if (!this.isCurrent(generation)) return;
      if (!supported) {
        this.setCapabilityFailure("Immersive AR is not supported by this browser.");
        return;
      }
      this.xrState = "ready";
      this.view.setEnterAvailable(true);
      this.syncView("Ready. Confirm Enter XR once in the headset.");
      this.publishStatus();
    } catch (error) {
      if (this.isCurrent(generation)) this.setCapabilityFailure(formatError(error));
    }
  }

  private async enterXr(): Promise<void> {
    if (
      this.xrSession !== null ||
      !navigator.xr ||
      this.xrState === "requesting" ||
      this.disposed
    ) {
      return;
    }
    const generation = ++this.generation;
    this.xrState = "requesting";
    this.view.setEnterAvailable(false);
    this.syncView("Waiting for immersive AR confirmation…");
    this.publishStatus();

    try {
      const session = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["local-floor"],
      });
      if (!this.isCurrent(generation)) {
        endSession(session);
        return;
      }
      await this.activateSession(session, generation);
    } catch (error) {
      if (!this.isCurrent(generation)) return;
      const message = formatError(error);
      this.xrState = "error";
      this.view.setEnterAvailable(true);
      this.syncView(message);
      this.publishStatus(message);
    }
  }

  private async activateSession(session: XRSession, generation: number): Promise<void> {
    this.blendMode = session.environmentBlendMode;
    if (session.environmentBlendMode !== "alpha-blend") {
      await endSession(session);
      if (!this.isCurrent(generation)) return;
      this.rejectUnsupportedBlendMode(session.environmentBlendMode);
      return;
    }

    this.xrSession = session;
    session.addEventListener("end", this.handleSessionEnd, { once: true });
    try {
      await this.renderer.xr.setSession(session);
    } catch (error) {
      this.releaseSession(session);
      endSession(session);
      if (this.isCurrent(generation)) throw error;
      return;
    }

    if (!this.isCurrent(generation) || this.xrSession !== session) {
      this.releaseSession(session);
      endSession(session);
      return;
    }
    this.xrState = "active";
    this.view.setEnterAvailable(false);
    this.syncView("Immersive AR is active with alpha blending.");
    this.publishStatus();
  }

  private rejectUnsupportedBlendMode(blendMode: EnvironmentBlendMode): void {
    const message = `Expected alpha-blend, received ${blendMode}.`;
    this.xrState = "error";
    this.view.setEnterAvailable(true);
    this.syncView(message);
    this.publishStatus(message);
  }

  private releaseSession(session: XRSession): void {
    session.removeEventListener("end", this.handleSessionEnd);
    if (this.xrSession === session) this.xrSession = null;
  }

  private setCapabilityFailure(message: string): void {
    this.xrState = "unsupported";
    this.view.setEnterAvailable(false);
    this.syncView(message);
    this.publishStatus(message);
  }

  private calculateDeltaSeconds(timestamp: number): number {
    if (this.lastFrameTime === 0) {
      this.lastFrameTime = timestamp;
      return 0;
    }
    const deltaSeconds = Math.min(
      (timestamp - this.lastFrameTime) / 1_000,
      MAX_FRAME_DELTA_SECONDS,
    );
    this.lastFrameTime = timestamp;
    return Math.max(deltaSeconds, 0);
  }

  private publishTelemetry(timestamp: number, deltaSeconds: number): void {
    const telemetry = this.telemetry.record(timestamp, deltaSeconds, this.xrState === "active");
    if (telemetry !== undefined) this.control.send(telemetry);
  }

  private applyCommand(command: HeadsetCommand): void {
    switch (command.type) {
      case "reset-runtime":
        this.sendCommandResult(command.requestId, true);
        this.resetRuntime();
        return;
      case "set-mode":
        this.applyModeCommand(command.requestId, command.mode);
        return;
      case "load-world":
        this.applyLoadWorldCommand(command.requestId, command.worldId);
        return;
      case "restart-world":
        this.applyRestartWorldCommand(command.requestId);
    }
  }

  private applyModeCommand(requestId: string, mode: DisplayMode): void {
    this.mode = mode;
    this.experienceHost.setDisplayMode(mode);
    this.syncView();
    this.publishStatus();
    this.sendCommandResult(requestId, true);
  }

  private applyLoadWorldCommand(requestId: string, worldId: WorldId): void {
    if (worldId === this.worldId) {
      this.sendCommandResult(requestId, true);
      this.publishStatus(`${worldId} is already active`);
      return;
    }

    const started = this.experienceHost.switchExperience(getExperienceFactory(worldId), (result) =>
      this.finishWorldCommand(requestId, worldId, result, "loaded"),
    );
    if (!started) this.sendWorldBusyResult(requestId);
  }

  private applyRestartWorldCommand(requestId: string): void {
    const started = this.experienceHost.restart((result) =>
      this.finishWorldCommand(requestId, this.worldId, result, "restarted"),
    );
    if (!started) this.sendWorldBusyResult(requestId);
  }

  private finishWorldCommand(
    requestId: string,
    worldId: WorldId,
    result: TransitionResult,
    action: "loaded" | "restarted",
  ): void {
    if (this.disposed) return;
    if (!result.ok) {
      const message = boundText(result.error.message);
      this.sendCommandResult(requestId, false, message);
      this.publishStatus(`World transition failed: ${message}`);
      return;
    }

    this.worldId = worldId;
    this.elapsedSeconds = 0;
    this.sendCommandResult(requestId, true);
    const message = result.deferred
      ? `${worldId} ${action}; optional assets are still loading`
      : `${worldId} ${action}`;
    this.publishStatus(message);
  }

  private sendWorldBusyResult(requestId: string): void {
    this.sendCommandResult(requestId, false, "Another world transition is already active.");
  }

  private sendCommandResult(requestId: string, ok: boolean, error?: string): void {
    this.control.send({
      version: 1,
      type: "command-result",
      requestId,
      ok,
      ...(error === undefined ? {} : { error: boundText(error) }),
    });
  }

  private resetRuntime(): void {
    const generation = ++this.generation;
    this.mode = "ar";
    this.worldId = "space";
    this.experienceHost.setDisplayMode("ar");
    this.xrState = "ended";
    this.syncView("Resetting the PICO runtime…");
    this.publishStatus("Resetting the PICO runtime");

    const session = this.xrSession;
    if (session === null) {
      this.scheduleReload(generation);
      return;
    }
    this.releaseSession(session);
    window.setTimeout(() => {
      void session
        .end()
        .catch(() => undefined)
        .finally(() => {
          if (this.isCurrent(generation)) this.scheduleReload(generation);
        });
    }, 0);
  }

  private scheduleReload(generation: number): void {
    window.setTimeout(() => {
      if (this.isCurrent(generation)) window.location.reload();
    }, RESET_RELOAD_DELAY_MS);
  }

  private publishStatus(message?: string): void {
    const status: RuntimeStatus = {
      version: 1,
      type: "runtime-status",
      xrState: this.xrState,
      mode: this.mode,
      worldId: this.worldId,
      ...(this.blendMode === undefined ? {} : { environmentBlendMode: this.blendMode }),
      ...(message === undefined ? {} : { message: boundText(message) }),
    };
    this.control.send(status);
  }

  private syncView(message?: string): void {
    this.view.render({
      xrState: this.xrState,
      blendMode: this.blendMode,
      mode: this.mode,
      ...(message === undefined ? {} : { message }),
    });
  }

  private endOwnedSession(): void {
    const session = this.xrSession;
    if (session === null) return;
    this.releaseSession(session);
    endSession(session);
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed && this.generation === generation;
  }
}

function formatError(error: unknown): string {
  return boundText(error instanceof Error ? error.message : String(error));
}

function boundText(value: string): string {
  return value.slice(0, MAX_TEXT_LENGTH);
}

function endSession(session: XRSession): Promise<void> {
  return session.end().catch(() => undefined);
}
