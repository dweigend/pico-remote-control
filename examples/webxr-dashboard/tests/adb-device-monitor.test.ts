/**
 * Purpose: Verify the ADB device monitor's parsing, recovery, and mapping safety.
 * Context: USB reconnection must recover automatically without touching foreign reverse mappings.
 * Responsibilities: Cover device states, mapping formats, online epochs, and conflicts.
 * Boundaries: Tests use an injected executor and never access a real Android device.
 */

import { afterEach, describe, expect, it, vi } from "bun:test";
import {
  type AdbCommandExecutor,
  AdbDeviceMonitor,
  type PublicDeviceStatus,
  parseAdbDevices,
  parseAdbReverseMappings,
} from "../server/adb-device-monitor.ts";
import { advanceTimersByTime } from "./test-timers.ts";

const SUCCESS = { exitCode: 0, stdout: "", stderr: "" } as const;

afterEach(() => {
  vi.useRealTimers();
});

describe("parseAdbDevices", () => {
  it("parses authorized and unavailable device states", () => {
    const output = [
      "List of devices attached",
      "pico-1\tdevice usb:1-1 product:PICO model:A9210",
      "pico-2\tunauthorized usb:1-2",
      "pico-3\toffline usb:1-3",
      "emulator-5554\tdevice product:sdk_gphone64_arm64 model:sdk_gphone64_arm64",
      "192.0.2.10:5555\tdevice product:PICO model:A9210",
      "",
    ].join("\n");

    expect(parseAdbDevices(output)).toEqual([
      { serial: "pico-1", state: "device" },
      { serial: "pico-2", state: "unauthorized" },
      { serial: "pico-3", state: "offline" },
    ]);
  });
});

describe("parseAdbReverseMappings", () => {
  it("supports scoped and serial-prefixed ADB output", () => {
    const output = [
      "tcp:5173 tcp:5173",
      "pico-1 tcp:6000 tcp:6001",
      "other-device tcp:7000 tcp:7000",
    ].join("\n");

    expect(parseAdbReverseMappings(output, "pico-1")).toEqual([
      { local: "tcp:5173", remote: "tcp:5173" },
      { serial: "pico-1", local: "tcp:6000", remote: "tcp:6001" },
    ]);
  });
});

describe("AdbDeviceMonitor", () => {
  it("creates a missing mapping and reports readiness once per online epoch", async () => {
    vi.useFakeTimers();
    let connected = false;
    let hasMapping = false;
    const executeCommand: AdbCommandExecutor = vi.fn(async (args) => {
      if (args[0] === "devices") {
        return {
          ...SUCCESS,
          stdout: connected
            ? "List of devices attached\npico-1\tdevice usb:1-1\n"
            : "List of devices attached\n",
        };
      }
      if (args.at(-1) === "sys.boot_completed") {
        return { ...SUCCESS, stdout: "1\n" };
      }
      if (args.at(-1) === "--list") {
        return { ...SUCCESS, stdout: hasMapping ? "pico-1 tcp:5173 tcp:5173\n" : "" };
      }
      hasMapping = true;
      return SUCCESS;
    });
    const statuses: PublicDeviceStatus[] = [];
    const onReady = vi.fn();
    const monitor = new AdbDeviceMonitor({
      executeCommand,
      onReady,
      onStatus: (status) => statuses.push(status),
      pollIntervalMs: 2_000,
    });

    monitor.start();
    await advanceTimersByTime(0);
    expect(statuses).toEqual([
      {
        version: 1,
        type: "device-status",
        state: "searching",
        message: "Searching for PICO over USB.",
      },
      {
        version: 1,
        type: "device-status",
        state: "offline",
        message:
          "ADB finds no PICO. Unlock the headset and check USB debugging; searching continues.",
      },
    ]);

    connected = true;
    await advanceTimersByTime(2_000);
    expect(statuses.map(({ state }) => state)).toEqual(["searching", "offline", "online"]);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenLastCalledWith("pico-1");
    expect(hasMapping).toBe(true);

    await advanceTimersByTime(2_000);
    expect(onReady).toHaveBeenCalledTimes(1);

    connected = false;
    await advanceTimersByTime(2_000);
    expect(statuses.at(-1)?.state).toBe("online");
    await advanceTimersByTime(2_000);
    connected = true;
    await advanceTimersByTime(2_000);
    expect(statuses.map(({ state }) => state)).toEqual([
      "searching",
      "offline",
      "online",
      "offline",
      "online",
    ]);
    expect(onReady).toHaveBeenCalledTimes(2);
    await monitor.dispose();
    expect(executeCommand).toHaveBeenCalledWith(
      ["-s", "pico-1", "reverse", "--remove", "tcp:5173"],
      expect.any(AbortSignal),
    );
  });

  it("reports a mapping conflict without changing it", async () => {
    vi.useFakeTimers();
    const executeCommand: AdbCommandExecutor = vi.fn(async (args) => {
      if (args[0] === "devices") {
        return { ...SUCCESS, stdout: "List of devices attached\npico-1\tdevice usb:1-1\n" };
      }
      if (args.at(-1) === "sys.boot_completed") {
        return { ...SUCCESS, stdout: "1\n" };
      }
      return { ...SUCCESS, stdout: "pico-1 tcp:5173 tcp:9000\n" };
    });
    const statuses: PublicDeviceStatus[] = [];
    const monitor = new AdbDeviceMonitor({
      executeCommand,
      onStatus: (status) => statuses.push(status),
    });

    monitor.start();
    await advanceTimersByTime(0);

    expect(statuses.at(-1)).toMatchObject({
      state: "error",
      message: "ADB reverse tcp:5173 conflicts with an existing mapping.",
    });
    expect(executeCommand).toHaveBeenCalledTimes(3);
    await monitor.dispose();
  });

  it.each([
    ["unauthorized", "unauthorized"],
    ["offline", "offline"],
  ] as const)("reports a single %s device", async (adbState, expectedState) => {
    vi.useFakeTimers();
    const executeCommand: AdbCommandExecutor = async () => ({
      ...SUCCESS,
      stdout: `List of devices attached\npico-1\t${adbState} usb:1-1\n`,
    });
    const statuses: PublicDeviceStatus[] = [];
    const monitor = new AdbDeviceMonitor({
      executeCommand,
      onStatus: (status) => statuses.push(status),
    });

    monitor.start();
    await advanceTimersByTime(0);

    expect(statuses.at(-1)?.state).toBe(expectedState);
    await monitor.dispose();
  });

  it("never removes a matching reverse mapping it did not create", async () => {
    vi.useFakeTimers();
    const executeCommand: AdbCommandExecutor = vi.fn(async (args) => {
      if (args[0] === "devices") {
        return { ...SUCCESS, stdout: "List of devices attached\npico-1\tdevice usb:1-1\n" };
      }
      if (args.at(-1) === "sys.boot_completed") {
        return { ...SUCCESS, stdout: "1\n" };
      }
      return { ...SUCCESS, stdout: "pico-1 tcp:5173 tcp:5173\n" };
    });
    const monitor = new AdbDeviceMonitor({
      executeCommand,
      onStatus: () => undefined,
    });

    monitor.start();
    await advanceTimersByTime(0);
    await monitor.dispose();

    expect(executeCommand).toHaveBeenCalledTimes(3);
    expect(executeCommand).not.toHaveBeenCalledWith(
      ["-s", "pico-1", "reverse", "--remove", "tcp:5173"],
      expect.any(AbortSignal),
    );
  });

  it("removes a mapping it created while the same online epoch remains active", async () => {
    vi.useFakeTimers();
    let hasMapping = false;
    const executeCommand: AdbCommandExecutor = vi.fn(async (args) => {
      if (args[0] === "devices") {
        return { ...SUCCESS, stdout: "List of devices attached\npico-1\tdevice usb:1-1\n" };
      }
      if (args.at(-1) === "sys.boot_completed") {
        return { ...SUCCESS, stdout: "1\n" };
      }
      if (args.at(-1) === "--list") {
        return { ...SUCCESS, stdout: hasMapping ? "pico-1 tcp:5173 tcp:5173\n" : "" };
      }
      hasMapping = true;
      return SUCCESS;
    });
    const monitor = new AdbDeviceMonitor({
      executeCommand,
      onStatus: () => undefined,
    });

    monitor.start();
    await advanceTimersByTime(0);
    await monitor.dispose();

    expect(executeCommand).toHaveBeenLastCalledWith(
      ["-s", "pico-1", "reverse", "--remove", "tcp:5173"],
      expect.any(AbortSignal),
    );
  });

  it("waits for Android boot completion before touching reverse mappings", async () => {
    vi.useFakeTimers();
    const executeCommand: AdbCommandExecutor = vi.fn(async (args) => {
      if (args[0] === "devices") {
        return { ...SUCCESS, stdout: "List of devices attached\npico-1\tdevice usb:1-1\n" };
      }
      return { ...SUCCESS, stdout: "0\n" };
    });
    const statuses: PublicDeviceStatus[] = [];
    const onReady = vi.fn();
    const monitor = new AdbDeviceMonitor({
      executeCommand,
      onReady,
      onStatus: (status) => statuses.push(status),
    });

    monitor.start();
    await advanceTimersByTime(0);

    expect(statuses.at(-1)).toMatchObject({
      state: "searching",
      message: "PICO detected and still starting up.",
    });
    expect(onReady).not.toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalledTimes(2);
    await monitor.dispose();
  });
});
