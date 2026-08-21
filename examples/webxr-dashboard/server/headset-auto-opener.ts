/**
 * Purpose: Open the local headset runtime once when a USB-connected PICO becomes ready.
 * Context: A headset reboot closes the runtime WebSocket even though ADB reconnects automatically.
 * Responsibilities: Wait for normal browser recovery, avoid duplicate launches, and own cancellation.
 * Boundaries: This service does not poll ADB, manage reverse mappings, retry launches, or expose serials.
 */

import type { AdbCommandExecutor } from "./adb-device-monitor.ts";

const DEFAULT_GRACE_PERIOD_MS = 7_000;
const HEADSET_URL = "http://127.0.0.1:5173/headset.html";
const PICO_BROWSER_PACKAGE = "com.pico.browser.overseas";

export type HeadsetAutoOpenerOptions = {
  executeCommand: AdbCommandExecutor;
  isRuntimeConnected: () => boolean;
  gracePeriodMs?: number;
  onResult?: (message: string) => void;
};

type OnlineEpoch = {
  serial: string;
  abortController: AbortController;
  timer: NodeJS.Timeout | undefined;
  runtimeWasConnected: boolean;
  launchAttempted: boolean;
};

export class HeadsetAutoOpener {
  readonly #executeCommand: AdbCommandExecutor;
  readonly #isRuntimeConnected: () => boolean;
  readonly #gracePeriodMs: number;
  readonly #onResult: ((message: string) => void) | undefined;
  #epoch: OnlineEpoch | undefined;
  #disposed = false;

  constructor(options: HeadsetAutoOpenerOptions) {
    this.#executeCommand = options.executeCommand;
    this.#isRuntimeConnected = options.isRuntimeConnected;
    this.#gracePeriodMs = options.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;
    this.#onResult = options.onResult;
  }

  beginOnlineEpoch(serial: string): void {
    if (this.#disposed || this.#epoch?.serial === serial) {
      return;
    }

    this.#cancelEpoch();
    const epoch: OnlineEpoch = {
      serial,
      abortController: new AbortController(),
      timer: undefined,
      runtimeWasConnected: false,
      launchAttempted: false,
    };
    epoch.timer = setTimeout(() => {
      epoch.timer = undefined;
      void this.#openRuntime(epoch);
    }, this.#gracePeriodMs);
    this.#epoch = epoch;
  }

  confirmRuntimeConnected(): void {
    const epoch = this.#epoch;
    if (epoch === undefined) {
      return;
    }

    epoch.runtimeWasConnected = true;
    clearTimeout(epoch.timer);
    epoch.timer = undefined;
    epoch.abortController.abort();
  }

  leaveOnline(): void {
    this.#cancelEpoch();
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#cancelEpoch();
  }

  async #openRuntime(epoch: OnlineEpoch): Promise<void> {
    if (!this.#canLaunch(epoch)) {
      return;
    }
    epoch.launchAttempted = true;

    try {
      const result = await this.#executeCommand(
        createOpenArguments(epoch.serial),
        epoch.abortController.signal,
      );
      if (epoch.abortController.signal.aborted) {
        return;
      }
      this.#onResult?.(
        result.exitCode === 0
          ? "PICO browser launch requested; waiting for the headset runtime."
          : "Could not open the PICO browser automatically.",
      );
    } catch {
      if (!epoch.abortController.signal.aborted) {
        this.#onResult?.("Could not open the PICO browser automatically.");
      }
    }
  }

  #canLaunch(epoch: OnlineEpoch): boolean {
    return (
      this.#epoch === epoch &&
      !this.#disposed &&
      !epoch.runtimeWasConnected &&
      !epoch.launchAttempted &&
      !this.#isRuntimeConnected()
    );
  }

  #cancelEpoch(): void {
    const epoch = this.#epoch;
    this.#epoch = undefined;
    if (epoch === undefined) {
      return;
    }
    clearTimeout(epoch.timer);
    epoch.abortController.abort();
  }
}

function createOpenArguments(serial: string): readonly string[] {
  return [
    "-s",
    serial,
    "shell",
    "am",
    "start",
    "-W",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    HEADSET_URL,
    "-p",
    PICO_BROWSER_PACKAGE,
  ];
}
