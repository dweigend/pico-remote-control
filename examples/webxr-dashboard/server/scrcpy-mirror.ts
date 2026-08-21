/**
 * Purpose: Own the bounded external scrcpy process used for the PICO left-eye mirror.
 * Context: The Mac dashboard needs a USB-only preview without adding media work to WebXR.
 * Responsibilities: Read the display size, wake an asleep display, launch one process, and publish its lifecycle.
 * Boundaries: This service does not discover devices, select network transport, or control the headset through scrcpy.
 */

import { setTimeout as wait } from "node:timers/promises";
import type { AdbCommandExecutor, AdbCommandResult } from "./adb-device-monitor.ts";

const DEFAULT_STOP_TIMEOUT_MS = 2_000;
const DEFAULT_WAKE_DELAY_MS = 1_000;
const MIRROR_TITLE = "PICO Left Eye Mirror";
const MAX_MIRROR_SIZE = "640";
const MAX_MIRROR_FPS = "15";
const ANDROID_POWER_KEY_CODE = "26";

export type ScrcpyMirrorState = "off" | "starting" | "running" | "error";

export type ScrcpyMirrorSnapshot = Readonly<{
  state: ScrcpyMirrorState;
  message: string;
}>;

export interface ScrcpyProcess {
  readonly exited: Promise<number>;
  kill(signal?: NodeJS.Signals | number): void;
}

export type ScrcpyProcessStarter = (executable: string, args: readonly string[]) => ScrcpyProcess;

export type ScrcpyMirrorOptions = {
  executeAdbCommand: AdbCommandExecutor;
  onStatus: (snapshot: ScrcpyMirrorSnapshot) => void;
  startProcess?: ScrcpyProcessStarter;
  scrcpyPath?: string;
  stopTimeoutMs?: number;
  wakeDelayMs?: number;
};

type ActiveProcess = {
  child: ScrcpyProcess;
  stopRequested: boolean;
};

const OFF_SNAPSHOT: ScrcpyMirrorSnapshot = {
  state: "off",
  message: "PICO mirror is off.",
};

export class ScrcpyMirror {
  readonly #executeAdbCommand: AdbCommandExecutor;
  readonly #onStatus: (snapshot: ScrcpyMirrorSnapshot) => void;
  readonly #startProcess: ScrcpyProcessStarter;
  readonly #scrcpyPath: string;
  readonly #stopTimeoutMs: number;
  readonly #wakeDelayMs: number;
  #snapshot = OFF_SNAPSHOT;
  #activeProcess: ActiveProcess | undefined;
  #startAbortController: AbortController | undefined;
  #startTask: Promise<void> | undefined;
  #stopTask: Promise<void> | undefined;
  #generation = 0;
  #disposed = false;

  constructor(options: ScrcpyMirrorOptions) {
    this.#executeAdbCommand = options.executeAdbCommand;
    this.#onStatus = options.onStatus;
    this.#startProcess = options.startProcess ?? startScrcpyProcess;
    this.#scrcpyPath = options.scrcpyPath ?? "scrcpy";
    this.#stopTimeoutMs = options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
    this.#wakeDelayMs = options.wakeDelayMs ?? DEFAULT_WAKE_DELAY_MS;
    requireNonNegativeDelay(this.#stopTimeoutMs, "Scrcpy stop timeout");
    requireNonNegativeDelay(this.#wakeDelayMs, "Scrcpy wake delay");
  }

  get snapshot(): ScrcpyMirrorSnapshot {
    return this.#snapshot;
  }

  async start(serial: string): Promise<void> {
    if (this.#disposed || this.#activeProcess !== undefined) {
      return;
    }
    if (this.#startTask !== undefined) {
      return this.#startTask;
    }
    if (!isUsbSerial(serial)) {
      this.#publish({ state: "error", message: "PICO mirror requires a selected USB device." });
      return;
    }

    const generation = ++this.#generation;
    const abortController = new AbortController();
    this.#startAbortController = abortController;
    this.#publish({ state: "starting", message: "Starting PICO left-eye mirror." });

    const task = this.#prepareAndStart(serial, generation, abortController.signal);
    this.#startTask = task;
    try {
      await task;
    } finally {
      if (this.#startTask === task) {
        this.#startTask = undefined;
      }
      if (this.#startAbortController === abortController) {
        this.#startAbortController = undefined;
      }
    }
  }

  async stop(): Promise<void> {
    if (this.#stopTask !== undefined) {
      return this.#stopTask;
    }

    const task = this.#stop();
    this.#stopTask = task;
    try {
      await task;
    } finally {
      if (this.#stopTask === task) {
        this.#stopTask = undefined;
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      await this.#stopTask;
      return;
    }
    this.#disposed = true;
    await this.stop();
  }

  async #prepareAndStart(serial: string, generation: number, signal: AbortSignal): Promise<void> {
    try {
      const crop = await this.#readLeftEyeCrop(serial, signal);
      await this.#wakeIfAsleep(serial, signal);
      if (!this.#canLaunch(generation, signal)) {
        return;
      }
      this.#launch(createScrcpyArguments(serial, crop));
    } catch {
      if (this.#canLaunch(generation, signal)) {
        this.#publish({
          state: "error",
          message: "Could not prepare the PICO left-eye mirror.",
        });
      }
    }
  }

  async #readLeftEyeCrop(serial: string, signal: AbortSignal): Promise<string> {
    const result = await this.#executeAdbCommand(["-s", serial, "shell", "wm", "size"], signal);
    requireSuccessfulAdbCommand(result);
    return parseLeftEyeCrop(result.stdout);
  }

  async #wakeIfAsleep(serial: string, signal: AbortSignal): Promise<void> {
    const powerState = await this.#executeAdbCommand(
      ["-s", serial, "shell", "dumpsys", "power"],
      signal,
    );
    requireSuccessfulAdbCommand(powerState);
    if (!/^\s*mWakefulness=Asleep\s*$/mu.test(powerState.stdout)) {
      return;
    }

    const wakeResult = await this.#executeAdbCommand(
      ["-s", serial, "shell", "input", "keyevent", ANDROID_POWER_KEY_CODE],
      signal,
    );
    requireSuccessfulAdbCommand(wakeResult);
    await wait(this.#wakeDelayMs, undefined, { signal });
  }

  #launch(args: readonly string[]): void {
    try {
      const activeProcess: ActiveProcess = {
        child: this.#startProcess(this.#scrcpyPath, args),
        stopRequested: false,
      };
      this.#activeProcess = activeProcess;
      this.#publish({ state: "running", message: "PICO left-eye mirror is running." });
      void activeProcess.child.exited.then(
        (exitCode) => this.#handleProcessClose(activeProcess, exitCode),
        () => this.#handleProcessClose(activeProcess, null),
      );
    } catch {
      this.#publish({ state: "error", message: "Could not start the PICO mirror process." });
    }
  }

  #handleProcessClose(activeProcess: ActiveProcess, exitCode: number | null): void {
    if (this.#activeProcess !== activeProcess) {
      return;
    }
    this.#activeProcess = undefined;

    if (activeProcess.stopRequested || exitCode === 0) {
      this.#publish(OFF_SNAPSHOT);
      return;
    }
    this.#publish({ state: "error", message: "The PICO mirror process stopped unexpectedly." });
  }

  async #stop(): Promise<void> {
    ++this.#generation;
    this.#startAbortController?.abort();
    await this.#startTask;

    const activeProcess = this.#activeProcess;
    if (activeProcess === undefined) {
      this.#publish(OFF_SNAPSHOT);
      return;
    }

    activeProcess.stopRequested = true;
    try {
      activeProcess.child.kill("SIGTERM");
    } catch {
      this.#releaseProcess(activeProcess);
      return;
    }
    await this.#waitForProcessClose(activeProcess);
  }

  async #waitForProcessClose(activeProcess: ActiveProcess): Promise<void> {
    const exited = activeProcess.child.exited.then(
      () => true,
      () => true,
    );
    const exitedGracefully = await Promise.race([
      exited,
      Bun.sleep(this.#stopTimeoutMs).then(() => false),
    ]);
    if (exitedGracefully) return;
    activeProcess.child.kill("SIGKILL");
    await exited;
  }

  #releaseProcess(activeProcess: ActiveProcess): void {
    if (this.#activeProcess !== activeProcess) return;
    this.#activeProcess = undefined;
    this.#publish(OFF_SNAPSHOT);
  }

  #canLaunch(generation: number, signal: AbortSignal): boolean {
    return !this.#disposed && !signal.aborted && this.#generation === generation;
  }

  #publish(snapshot: ScrcpyMirrorSnapshot): void {
    if (isSameSnapshot(this.#snapshot, snapshot)) {
      return;
    }
    this.#snapshot = snapshot;
    this.#onStatus(snapshot);
  }
}

export function parseLeftEyeCrop(output: string): string {
  const match = /^\s*Physical size:\s*(\d+)x(\d+)\s*$/imu.exec(output);
  const width = Number(match?.[1]);
  const height = Number(match?.[2]);
  if (!Number.isSafeInteger(width) || width < 2 || !Number.isSafeInteger(height) || height < 1) {
    throw new Error("Could not determine the physical PICO display size.");
  }
  return `${Math.floor(width / 2)}:${height}:0:0`;
}

function createScrcpyArguments(serial: string, crop: string): readonly string[] {
  return [
    "--serial",
    serial,
    "--no-audio",
    "--no-control",
    "--max-size",
    MAX_MIRROR_SIZE,
    "--max-fps",
    MAX_MIRROR_FPS,
    "--crop",
    crop,
    "--window-title",
    MIRROR_TITLE,
  ];
}

function startScrcpyProcess(executable: string, args: readonly string[]): ScrcpyProcess {
  return Bun.spawn({
    cmd: [executable, ...args],
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
}

function requireSuccessfulAdbCommand(result: AdbCommandResult): void {
  if (result.exitCode !== 0) {
    throw new Error("ADB command failed.");
  }
}

function isUsbSerial(serial: string): boolean {
  return serial.trim().length > 0 && !serial.includes(":") && !serial.startsWith("emulator-");
}

function isSameSnapshot(current: ScrcpyMirrorSnapshot, next: ScrcpyMirrorSnapshot): boolean {
  return current.state === next.state && current.message === next.message;
}

function requireNonNegativeDelay(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be non-negative and finite.`);
  }
}
