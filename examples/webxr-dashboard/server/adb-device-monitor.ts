/**
 * Purpose: Monitor the USB-connected Android device used by the PICO control server.
 * Context: The dashboard needs an authoritative device status and a stable ADB reverse path.
 * Responsibilities: Poll ADB, classify device state, ensure the fixed reverse mapping, and signal readiness.
 * Boundaries: This module never selects among devices or opens pages and removes only mappings it created.
 */

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 5_000;
const DEFAULT_OFFLINE_CONFIRMATION_POLLS = 2;
const MAX_COMMAND_OUTPUT_BYTES = 1_024 * 1_024;
const HTTP_PORT_SPEC = "tcp:5173";

export type PublicDeviceStatus = {
  version: 1;
  type: "device-status";
  state: "searching" | "offline" | "unauthorized" | "multiple" | "online" | "error";
  message: string;
};

export type AdbDevice = {
  serial: string;
  state: string;
};

export type AdbReverseMapping = {
  serial?: string;
  local: string;
  remote: string;
};

export type AdbCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type AdbCommandExecutor = (
  args: readonly string[],
  signal: AbortSignal,
) => Promise<AdbCommandResult>;

export type AdbDeviceMonitorOptions = {
  onStatus: (status: PublicDeviceStatus) => void;
  onReady?: (serial: string) => void | Promise<void>;
  adbPath?: string;
  pollIntervalMs?: number;
  commandTimeoutMs?: number;
  offlineConfirmationPolls?: number;
  executeCommand?: AdbCommandExecutor;
};

export type AdbCommandExecutorOptions = {
  adbPath?: string;
  commandTimeoutMs?: number;
};

type RunAdbCommandOptions = {
  executable: string;
  args: readonly string[];
  signal: AbortSignal;
  timeoutMs: number;
};

export class AdbDeviceMonitor {
  readonly #onStatus: (status: PublicDeviceStatus) => void;
  readonly #onReady: ((serial: string) => void | Promise<void>) | undefined;
  readonly #pollIntervalMs: number;
  readonly #executeCommand: AdbCommandExecutor;
  readonly #offlineConfirmationPolls: number;
  #abortController: AbortController | undefined;
  #lastStatus: PublicDeviceStatus | undefined;
  #onlineSerial: string | undefined;
  readonly #ownedMappingSerials = new Set<string>();
  #pollPromise: Promise<void> | undefined;
  #pollTimer: NodeJS.Timeout | undefined;
  #missingPollCount = 0;
  #started = false;

  constructor(options: AdbDeviceMonitorOptions) {
    this.#onStatus = options.onStatus;
    this.#onReady = options.onReady;
    this.#pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.#offlineConfirmationPolls =
      options.offlineConfirmationPolls ?? DEFAULT_OFFLINE_CONFIRMATION_POLLS;
    this.#executeCommand =
      options.executeCommand ??
      createAdbCommandExecutor({
        ...(options.adbPath === undefined ? {} : { adbPath: options.adbPath }),
        ...(options.commandTimeoutMs === undefined
          ? {}
          : { commandTimeoutMs: options.commandTimeoutMs }),
      });
  }

  start(): void {
    if (this.#started) {
      return;
    }
    this.#started = true;
    this.#publishStatus(createStatus("searching", "Searching for PICO over USB."));
    this.#beginPoll();
  }

  async dispose(): Promise<void> {
    if (!this.#started && this.#ownedMappingSerials.size === 0) {
      return;
    }
    this.#started = false;
    this.#onlineSerial = undefined;
    clearTimeout(this.#pollTimer);
    this.#pollTimer = undefined;
    this.#abortController?.abort();
    this.#abortController = undefined;
    await this.#pollPromise;
    await this.#removeOwnedMappings();
  }

  #beginPoll(): void {
    const pollPromise = this.#poll();
    this.#pollPromise = pollPromise;
    void pollPromise.finally(() => {
      if (this.#pollPromise === pollPromise) {
        this.#pollPromise = undefined;
      }
    });
  }

  async #poll(): Promise<void> {
    const abortController = new AbortController();
    this.#abortController = abortController;

    try {
      await this.#refreshStatus(abortController.signal);
    } catch (error: unknown) {
      if (this.#started && !abortController.signal.aborted) {
        this.#publishStatus(createStatus("error", getErrorMessage(error)));
      }
    } finally {
      if (this.#abortController === abortController) {
        this.#abortController = undefined;
      }
      this.#scheduleNextPoll();
    }
  }

  async #refreshStatus(signal: AbortSignal): Promise<void> {
    const result = await this.#executeCommand(["devices", "-l"], signal);
    requireSuccessfulCommand(result, "ADB device search failed.");

    const devices = parseAdbDevices(result.stdout);
    if (devices.length === 0) {
      this.#handleMissingDevice();
      return;
    }
    this.#missingPollCount = 0;
    if (devices.length > 1) {
      this.#publishStatus(
        createStatus("multiple", "Multiple Android devices found. Connect exactly one."),
      );
      return;
    }

    const device = devices[0];
    if (device === undefined) {
      return;
    }
    await this.#handleSingleDevice(device, signal);
  }

  #handleMissingDevice(): void {
    this.#missingPollCount += 1;
    if (
      this.#onlineSerial !== undefined &&
      this.#missingPollCount < this.#offlineConfirmationPolls
    ) {
      return;
    }
    this.#publishStatus(
      createStatus(
        "offline",
        "ADB finds no PICO. Unlock the headset and check USB debugging; searching continues.",
      ),
    );
  }

  async #handleSingleDevice(device: AdbDevice, signal: AbortSignal): Promise<void> {
    if (device.state === "unauthorized") {
      this.#publishStatus(
        createStatus("unauthorized", "PICO found. Confirm USB debugging in the headset."),
      );
      return;
    }
    if (device.state === "offline") {
      this.#publishStatus(createStatus("offline", "PICO is connected but offline."));
      return;
    }
    if (device.state !== "device") {
      this.#publishStatus(createStatus("error", `Unsupported ADB device state: ${device.state}.`));
      return;
    }
    if (!(await this.#isBootComplete(device.serial, signal))) {
      this.#publishStatus(createStatus("searching", "PICO detected and still starting up."));
      return;
    }

    await this.#ensureReverseMapping(device.serial, signal);
    this.#publishStatus(createStatus("online", "PICO online via USB."));
    await this.#notifyReady(device.serial);
  }

  async #isBootComplete(serial: string, signal: AbortSignal): Promise<boolean> {
    const result = await this.#executeCommand(
      ["-s", serial, "shell", "getprop", "sys.boot_completed"],
      signal,
    );
    requireSuccessfulCommand(result, "Could not inspect the PICO boot state.");
    return result.stdout.trim() === "1";
  }

  async #ensureReverseMapping(serial: string, signal: AbortSignal): Promise<void> {
    const listResult = await this.#executeCommand(["-s", serial, "reverse", "--list"], signal);
    requireSuccessfulCommand(listResult, "Could not inspect the PICO reverse mapping.");

    const mappings = parseAdbReverseMappings(listResult.stdout, serial);
    const portMappings = mappings.filter((mapping) => mapping.local === HTTP_PORT_SPEC);
    if (portMappings.some((mapping) => mapping.remote !== HTTP_PORT_SPEC)) {
      this.#ownedMappingSerials.delete(serial);
      throw new Error("ADB reverse tcp:5173 conflicts with an existing mapping.");
    }
    if (portMappings.some((mapping) => mapping.remote === HTTP_PORT_SPEC)) {
      return;
    }

    const createResult = await this.#executeCommand(
      ["-s", serial, "reverse", HTTP_PORT_SPEC, HTTP_PORT_SPEC],
      signal,
    );
    requireSuccessfulCommand(createResult, "Could not create the PICO reverse mapping.");
    this.#ownedMappingSerials.add(serial);
  }

  async #notifyReady(serial: string): Promise<void> {
    if (this.#onlineSerial === serial) {
      return;
    }
    this.#onlineSerial = serial;
    await this.#onReady?.(serial);
  }

  #publishStatus(status: PublicDeviceStatus): void {
    if (isSameStatus(status, this.#lastStatus)) {
      return;
    }
    this.#lastStatus = status;
    if (status.state !== "online") {
      this.#onlineSerial = undefined;
    }
    this.#onStatus(status);
  }

  #scheduleNextPoll(): void {
    if (!this.#started) {
      return;
    }
    this.#pollTimer = setTimeout(() => this.#beginPoll(), this.#pollIntervalMs);
  }

  async #removeOwnedMappings(): Promise<void> {
    const serials = [...this.#ownedMappingSerials];
    this.#ownedMappingSerials.clear();
    for (const serial of serials) {
      const abortController = new AbortController();
      try {
        await this.#executeCommand(
          ["-s", serial, "reverse", "--remove", HTTP_PORT_SPEC],
          abortController.signal,
        );
      } catch {
        // A disconnected device has already lost its reverse mapping.
      }
    }
  }
}

export function createAdbCommandExecutor(
  options: AdbCommandExecutorOptions = {},
): AdbCommandExecutor {
  const executable = options.adbPath ?? "adb";
  const timeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  return (args, signal) => runAdbCommand({ executable, args, signal, timeoutMs });
}

export function parseAdbDevices(output: string): readonly AdbDevice[] {
  const devices: AdbDevice[] = [];
  for (const rawLine of output.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("List of devices") || line.startsWith("*")) {
      continue;
    }
    const [serial, state, ...details] = line.split(/\s+/u);
    if (serial !== undefined && state !== undefined && isUsbTransport(serial, details)) {
      devices.push({ serial, state });
    }
  }
  return devices;
}

function isUsbTransport(serial: string, details: readonly string[]): boolean {
  return (
    !serial.includes(":") &&
    !serial.startsWith("emulator-") &&
    details.some((detail) => detail.startsWith("usb:"))
  );
}

export function parseAdbReverseMappings(
  output: string,
  selectedSerial?: string,
): readonly AdbReverseMapping[] {
  const mappings: AdbReverseMapping[] = [];
  for (const rawLine of output.split(/\r?\n/u)) {
    const fields = rawLine.trim().split(/\s+/u);
    if (fields.length === 2) {
      const [local, remote] = fields;
      if (local !== undefined && remote !== undefined) {
        mappings.push({ local, remote });
      }
      continue;
    }
    if (fields.length < 3) {
      continue;
    }
    const [serial, local, remote] = fields;
    if (
      serial !== undefined &&
      local !== undefined &&
      remote !== undefined &&
      (selectedSerial === undefined || serial === selectedSerial)
    ) {
      mappings.push({ serial, local, remote });
    }
  }
  return mappings;
}

async function runAdbCommand(options: RunAdbCommandOptions): Promise<AdbCommandResult> {
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
  const commandSignal = AbortSignal.any([options.signal, timeoutSignal]);
  try {
    const subprocess = Bun.spawn({
      cmd: [options.executable, ...options.args],
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal: commandSignal,
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      subprocess.exited,
      new Response(subprocess.stdout).text(),
      new Response(subprocess.stderr).text(),
    ]);
    throwIfCommandAborted(options.signal, timeoutSignal);
    return { exitCode, stdout, stderr };
  } catch (error) {
    throwIfCommandAborted(options.signal, timeoutSignal);
    throw error;
  }
}

function throwIfCommandAborted(signal: AbortSignal, timeoutSignal: AbortSignal): void {
  if (signal.aborted) throw new Error("ADB command cancelled.");
  if (timeoutSignal.aborted) throw new Error("ADB command timed out.");
}

function requireSuccessfulCommand(result: AdbCommandResult, message: string): void {
  if (result.exitCode !== 0) {
    throw new Error(message);
  }
}

function createStatus(state: PublicDeviceStatus["state"], message: string): PublicDeviceStatus {
  return { version: 1, type: "device-status", state, message };
}

function isSameStatus(
  current: PublicDeviceStatus,
  previous: PublicDeviceStatus | undefined,
): boolean {
  return current.state === previous?.state && current.message === previous.message;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown ADB error.";
}
