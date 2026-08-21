/**
 * Purpose: Verify the PICO runtime auto-opener's epoch and cancellation guarantees.
 * Context: Browser recovery must be automatic without creating duplicate PICO tabs.
 * Responsibilities: Cover grace recovery, one-shot launch behavior, new epochs, and disposal.
 * Boundaries: Tests inject an ADB executor and never access a real headset.
 */

import { afterEach, describe, expect, it, vi } from "bun:test";
import type { AdbCommandExecutor } from "../server/adb-device-monitor.ts";
import { HeadsetAutoOpener } from "../server/headset-auto-opener.ts";
import { advanceTimersByTime, runAllTimers } from "./test-timers.ts";

const SUCCESS = { exitCode: 0, stdout: "", stderr: "" } as const;
const GRACE_PERIOD_MS = 100;
const OPEN_ARGUMENTS = [
  "-s",
  "pico-1",
  "shell",
  "am",
  "start",
  "-W",
  "-a",
  "android.intent.action.VIEW",
  "-d",
  "http://127.0.0.1:5173/headset.html",
  "-p",
  "com.pico.browser.overseas",
] as const;

afterEach(() => {
  vi.useRealTimers();
});

describe("HeadsetAutoOpener", () => {
  it("does not open a new tab when the runtime reconnects during the grace period", async () => {
    vi.useFakeTimers();
    const executeCommand: AdbCommandExecutor = vi.fn(async () => SUCCESS);
    const opener = createOpener(executeCommand);

    opener.beginOnlineEpoch("pico-1");
    await advanceTimersByTime(GRACE_PERIOD_MS / 2);
    opener.confirmRuntimeConnected();
    await advanceTimersByTime(GRACE_PERIOD_MS);

    expect(executeCommand).not.toHaveBeenCalled();
    opener.dispose();
  });

  it("opens the runtime exactly once when it remains disconnected", async () => {
    vi.useFakeTimers();
    const executeCommand: AdbCommandExecutor = vi.fn(async () => SUCCESS);
    const opener = createOpener(executeCommand);

    opener.beginOnlineEpoch("pico-1");
    await advanceTimersByTime(GRACE_PERIOD_MS * 3);

    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith(OPEN_ARGUMENTS, expect.any(AbortSignal));
    opener.dispose();
  });

  it("treats duplicate begin calls as the same one-shot epoch", async () => {
    vi.useFakeTimers();
    const executeCommand: AdbCommandExecutor = vi.fn(async () => SUCCESS);
    const opener = createOpener(executeCommand);

    opener.beginOnlineEpoch("pico-1");
    opener.beginOnlineEpoch("pico-1");
    await advanceTimersByTime(GRACE_PERIOD_MS * 3);

    expect(executeCommand).toHaveBeenCalledTimes(1);
    opener.dispose();
  });

  it("allows one new launch after leaving and entering a new online epoch", async () => {
    vi.useFakeTimers();
    const executeCommand: AdbCommandExecutor = vi.fn(async () => SUCCESS);
    const opener = createOpener(executeCommand);

    opener.beginOnlineEpoch("pico-1");
    await advanceTimersByTime(GRACE_PERIOD_MS);
    opener.leaveOnline();
    opener.beginOnlineEpoch("pico-1");
    await advanceTimersByTime(GRACE_PERIOD_MS);

    expect(executeCommand).toHaveBeenCalledTimes(2);
    opener.dispose();
  });

  it("checks the live runtime connection immediately before opening", async () => {
    vi.useFakeTimers();
    let runtimeConnected = false;
    const executeCommand: AdbCommandExecutor = vi.fn(async () => SUCCESS);
    const opener = createOpener(executeCommand, () => runtimeConnected);

    opener.beginOnlineEpoch("pico-1");
    runtimeConnected = true;
    await advanceTimersByTime(GRACE_PERIOD_MS);

    expect(executeCommand).not.toHaveBeenCalled();
    opener.dispose();
  });

  it("cancels an in-flight launch when disposed", async () => {
    vi.useFakeTimers();
    let commandSignal: AbortSignal | undefined;
    const executeCommand: AdbCommandExecutor = vi.fn((_args, signal) => {
      commandSignal = signal;
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
      });
    });
    const opener = createOpener(executeCommand);

    opener.beginOnlineEpoch("pico-1");
    await advanceTimersByTime(GRACE_PERIOD_MS);
    opener.dispose();
    await runAllTimers();

    expect(commandSignal?.aborted).toBe(true);
  });
});

function createOpener(
  executeCommand: AdbCommandExecutor,
  isRuntimeConnected: () => boolean = () => false,
): HeadsetAutoOpener {
  return new HeadsetAutoOpener({
    executeCommand,
    isRuntimeConnected,
    gracePeriodMs: GRACE_PERIOD_MS,
  });
}
