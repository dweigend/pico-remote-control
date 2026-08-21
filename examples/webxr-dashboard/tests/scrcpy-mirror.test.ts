/**
 * Purpose: Verify the bounded scrcpy left-eye mirror lifecycle and command safety.
 * Context: Mirror tests cover USB selection and process ownership without opening a real window.
 * Responsibilities: Exercise crop derivation, wake handling, arguments, idempotency, failures, and cleanup.
 * Boundaries: Tests inject ADB and Bun subprocess adapters and never access a physical PICO.
 */

import { describe, expect, it, vi } from "bun:test";
import type { AdbCommandExecutor } from "../server/adb-device-monitor.ts";
import {
  parseLeftEyeCrop,
  ScrcpyMirror,
  type ScrcpyMirrorSnapshot,
  type ScrcpyProcess,
  type ScrcpyProcessStarter,
} from "../server/scrcpy-mirror.ts";

const SUCCESS = { exitCode: 0, stdout: "", stderr: "" } as const;
const SERIAL = "pico-usb-1";
const EXPECTED_ARGUMENTS = [
  "--serial",
  SERIAL,
  "--no-audio",
  "--no-control",
  "--max-size",
  "640",
  "--max-fps",
  "15",
  "--crop",
  "2160:2160:0:0",
  "--window-title",
  "PICO Left Eye Mirror",
] as const;

describe("parseLeftEyeCrop", () => {
  it("uses half of the physical width and ignores an override size", () => {
    expect(parseLeftEyeCrop("Physical size: 4320x2160\nOverride size: 2160x1080\n")).toBe(
      "2160:2160:0:0",
    );
  });

  it("rejects output without a usable physical size", () => {
    expect(() => parseLeftEyeCrop("Override size: 2160x1080\n")).toThrow(
      "Could not determine the physical PICO display size.",
    );
  });
});

describe("ScrcpyMirror", () => {
  it("reads the display and launches one bounded, read-only left-eye window", async () => {
    const fakeProcess = createFakeProcess();
    const executeAdbCommand = createAwakeExecutor();
    const startProcess: ScrcpyProcessStarter = vi.fn(() => fakeProcess.child);
    const statuses: ScrcpyMirrorSnapshot[] = [];
    const mirror = createMirror({ executeAdbCommand, startProcess, statuses });

    await mirror.start(SERIAL);

    expect(executeAdbCommand).toHaveBeenNthCalledWith(
      1,
      ["-s", SERIAL, "shell", "wm", "size"],
      expect.any(AbortSignal),
    );
    expect(executeAdbCommand).toHaveBeenNthCalledWith(
      2,
      ["-s", SERIAL, "shell", "dumpsys", "power"],
      expect.any(AbortSignal),
    );
    expect(startProcess).toHaveBeenCalledWith("scrcpy", EXPECTED_ARGUMENTS);
    expect(mirror.snapshot).toEqual({
      state: "running",
      message: "PICO left-eye mirror is running.",
    });
    expect(statuses.map(({ state }) => state)).toEqual(["starting", "running"]);
  });

  it("does not send a power key when the display is awake", async () => {
    const fakeProcess = createFakeProcess();
    const executeAdbCommand = createAwakeExecutor();
    const mirror = createMirror({
      executeAdbCommand,
      startProcess: () => fakeProcess.child,
    });

    await mirror.start(SERIAL);

    expect(executeAdbCommand).toHaveBeenCalledTimes(2);
    expect(executeAdbCommand).not.toHaveBeenCalledWith(
      ["-s", SERIAL, "shell", "input", "keyevent", "26"],
      expect.any(AbortSignal),
    );
  });

  it("sends exactly one power key before mirroring an asleep display", async () => {
    const fakeProcess = createFakeProcess();
    const executeAdbCommand: AdbCommandExecutor = vi.fn(async (args) => {
      if (args.at(-1) === "size") {
        return { ...SUCCESS, stdout: "Physical size: 4320x2160\n" };
      }
      if (args.at(-1) === "power") {
        return { ...SUCCESS, stdout: "  mWakefulness=Asleep\n" };
      }
      return SUCCESS;
    });
    const mirror = createMirror({
      executeAdbCommand,
      startProcess: () => fakeProcess.child,
    });

    await mirror.start(SERIAL);

    expect(executeAdbCommand).toHaveBeenNthCalledWith(
      3,
      ["-s", SERIAL, "shell", "input", "keyevent", "26"],
      expect.any(AbortSignal),
    );
    expect(executeAdbCommand).toHaveBeenCalledTimes(3);
  });

  it("keeps repeated start requests idempotent", async () => {
    const fakeProcess = createFakeProcess();
    const executeAdbCommand = createAwakeExecutor();
    const startProcess: ScrcpyProcessStarter = vi.fn(() => fakeProcess.child);
    const mirror = createMirror({ executeAdbCommand, startProcess });

    await Promise.all([mirror.start(SERIAL), mirror.start(SERIAL)]);
    await mirror.start(SERIAL);

    expect(startProcess).toHaveBeenCalledTimes(1);
    expect(executeAdbCommand).toHaveBeenCalledTimes(2);
  });

  it("returns to off when the native scrcpy window closes", async () => {
    const fakeProcess = createFakeProcess();
    const mirror = createMirror({
      executeAdbCommand: createAwakeExecutor(),
      startProcess: () => fakeProcess.child,
    });

    await mirror.start(SERIAL);
    fakeProcess.exit(0);
    await Promise.resolve();

    expect(mirror.snapshot).toEqual({ state: "off", message: "PICO mirror is off." });
  });

  it("reports process errors without exposing the selected serial", async () => {
    const fakeProcess = createFakeProcess();
    const statuses: ScrcpyMirrorSnapshot[] = [];
    const mirror = createMirror({
      executeAdbCommand: createAwakeExecutor(),
      startProcess: () => fakeProcess.child,
      statuses,
    });

    await mirror.start(SERIAL);
    fakeProcess.fail(new Error(`scrcpy failed for ${SERIAL}`));
    await Promise.resolve();

    expect(mirror.snapshot.state).toBe("error");
    expect(mirror.snapshot.message).not.toContain(SERIAL);
    expect(JSON.stringify(statuses)).not.toContain(SERIAL);
  });

  it("stops the owned process and prevents restart after disposal", async () => {
    const fakeProcess = createFakeProcess({ closeOnKill: true });
    const executeAdbCommand = createAwakeExecutor();
    const startProcess: ScrcpyProcessStarter = vi.fn(() => fakeProcess.child);
    const mirror = createMirror({ executeAdbCommand, startProcess });

    await mirror.start(SERIAL);
    await mirror.stop();

    expect(fakeProcess.kill).toHaveBeenCalledTimes(1);
    expect(fakeProcess.kill).toHaveBeenCalledWith("SIGTERM");
    expect(mirror.snapshot.state).toBe("off");

    await mirror.dispose();
    await mirror.start(SERIAL);
    expect(startProcess).toHaveBeenCalledTimes(1);
  });

  it("force-kills and releases a process that ignores graceful shutdown", async () => {
    const fakeProcess = createFakeProcess();
    const mirror = createMirror({
      executeAdbCommand: createAwakeExecutor(),
      startProcess: () => fakeProcess.child,
      stopTimeoutMs: 0,
    });

    await mirror.start(SERIAL);
    await mirror.stop();

    expect(fakeProcess.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(fakeProcess.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
    expect(mirror.snapshot.state).toBe("off");
  });

  it("cancels preparation cleanly when stopped before scrcpy starts", async () => {
    let commandSignal: AbortSignal | undefined;
    const executeAdbCommand: AdbCommandExecutor = vi.fn((_args, signal) => {
      commandSignal = signal;
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
      });
    });
    const startProcess: ScrcpyProcessStarter = vi.fn(() => createFakeProcess().child);
    const mirror = createMirror({ executeAdbCommand, startProcess });

    const startPromise = mirror.start(SERIAL);
    await mirror.stop();
    await startPromise;

    expect(commandSignal?.aborted).toBe(true);
    expect(startProcess).not.toHaveBeenCalled();
    expect(mirror.snapshot.state).toBe("off");
  });

  it("rejects network serials without passing them to ADB or status", async () => {
    const networkSerial = "192.0.2.1:5555";
    const executeAdbCommand = createAwakeExecutor();
    const statuses: ScrcpyMirrorSnapshot[] = [];
    const mirror = createMirror({ executeAdbCommand, statuses });

    await mirror.start(networkSerial);

    expect(executeAdbCommand).not.toHaveBeenCalled();
    expect(mirror.snapshot.state).toBe("error");
    expect(JSON.stringify(statuses)).not.toContain(networkSerial);
  });

  it("rejects Android emulator serials without passing them to ADB", async () => {
    const executeAdbCommand = createAwakeExecutor();
    const mirror = createMirror({ executeAdbCommand });

    await mirror.start("emulator-5554");

    expect(executeAdbCommand).not.toHaveBeenCalled();
    expect(mirror.snapshot.state).toBe("error");
  });
});

type CreateMirrorOptions = {
  executeAdbCommand: AdbCommandExecutor;
  startProcess?: ScrcpyProcessStarter;
  statuses?: ScrcpyMirrorSnapshot[];
  stopTimeoutMs?: number;
};

function createMirror(options: CreateMirrorOptions): ScrcpyMirror {
  return new ScrcpyMirror({
    executeAdbCommand: options.executeAdbCommand,
    onStatus: (status) => options.statuses?.push(status),
    ...(options.startProcess === undefined ? {} : { startProcess: options.startProcess }),
    ...(options.stopTimeoutMs === undefined ? {} : { stopTimeoutMs: options.stopTimeoutMs }),
    wakeDelayMs: 0,
  });
}

function createAwakeExecutor(): AdbCommandExecutor {
  return vi.fn(async (args) => {
    if (args.at(-1) === "size") {
      return { ...SUCCESS, stdout: "Physical size: 4320x2160\n" };
    }
    return { ...SUCCESS, stdout: "mWakefulness=Awake\n" };
  });
}

type FakeProcess = {
  child: ScrcpyProcess;
  exit: (exitCode: number) => void;
  fail: (error: Error) => void;
  kill: ReturnType<typeof vi.fn>;
};

function createFakeProcess(options: { closeOnKill?: boolean } = {}): FakeProcess {
  let resolveExit = (_exitCode: number): void => undefined;
  let rejectExit = (_error: Error): void => undefined;
  const exited = new Promise<number>((resolve, reject) => {
    resolveExit = resolve;
    rejectExit = reject;
  });
  const kill = vi.fn((signal?: NodeJS.Signals | number) => {
    if (options.closeOnKill === true || signal === "SIGKILL") resolveExit(0);
  });
  const child: ScrcpyProcess = { exited, kill };

  return {
    child,
    exit: resolveExit,
    fail: rejectExit,
    kill,
  };
}
