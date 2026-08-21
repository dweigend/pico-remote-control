<!--
Purpose: Preserve the complete operating and troubleshooting guide for the picoctl utility.
Context: The CLI wraps ADB and scrcpy for one authorized USB-connected PICO on macOS.
Responsibilities: Cover setup, verification, recovery, capture handling, and clean removal.
Boundaries: Application-level WebXR control belongs to the dashboard example, not this tool.
-->

# Operations and troubleshooting

This document describes installation, verification, recovery, and common
failure modes for `picoctl` on macOS.

## First-time setup

Install the host tools:

```bash
brew install --cask android-platform-tools
brew install scrcpy
```

On the headset:

1. Open **Settings > General > About**.
2. Select the software version repeatedly until Developer appears.
3. Open Developer and enable USB debugging.
4. Connect a data-capable USB cable.
5. Approve the Mac's debugging fingerprint inside the headset.

Verify the project:

```bash
./install.sh
picoctl status
picoctl mirror
```

## Development verification

The repository has no build step. Before committing a change, run:

```bash
bash -n picoctl
bash -n install.sh
picoctl --help
picoctl status
```

With a connected headset, also verify the affected behavior. For changes to
mirroring, test both `picoctl mirror` and `picoctl eye` visually.

## `No authorized PICO device found`

Inspect ADB directly:

```bash
adb devices -l
```

Possible states:

- No row: verify the cable, USB port, headset power, and USB debugging.
- `unauthorized`: put on the headset and approve the debugging fingerprint.
- `offline`: reconnect the cable, then restart ADB with `adb kill-server`
  followed by `adb start-server`.
- `device`: the transport is usable.

Charging-only USB-C cables do not carry ADB data.

## `Multiple devices found`

List available targets:

```bash
adb devices -l
```

Then select one:

```bash
PICO_SERIAL=<usb-serial> picoctl status
```

## `Missing command: scrcpy`

Install it and confirm the version:

```bash
brew install scrcpy
scrcpy --version
```

PICO 4 Ultra compatibility requires scrcpy 3.2 or newer.

## Mirroring is slow

The default command already limits resolution and frame rate. Check that the
Mac is not running another PICO streaming application at the same time. Connect
the headset directly instead of using a slow USB hub.

For diagnosis, run scrcpy directly with lower limits:

```bash
scrcpy --no-audio --max-size 1280 --max-fps 30
```

## scrcpy opens but receives no video frames

PICO can leave the physical display registered while Android reports the device
as asleep. `picoctl mirror`, `picoctl eye`, and `picoctl record` detect this state
and send one power-key event before starting scrcpy.

Inspect the current state with:

```bash
adb shell dumpsys power | grep mWakefulness
```

If enterprise policy immediately puts the headset back to sleep, put it on or
cover its proximity sensor before starting the mirror.

## The image contains both eyes

Use the computed left-eye view:

```bash
picoctl eye
```

If the PICO firmware changes its display layout, inspect it with:

```bash
adb shell wm size
```

## Mouse or keyboard input does not work

First confirm that video mirroring works. PICO system UI and immersive XR
applications do not always interpret Android pointer events like a phone.
Enterprise policy can also restrict injected input.

Use the physical controllers for protected or spatial interactions. ADB shell
input remains available for diagnostic key events, but the MVP intentionally
does not emulate PICO controller tracking.

## Capture files

Default screenshots and recordings are written below `captures/`. They are
local operational data, not source files, and Git ignores them.

Review captures before sharing them because they may contain application data,
notifications, network names, or other private information.

## Reset and uninstall

The project installs no service and modifies no shell profile. To stop using it:

1. Close scrcpy and any ADB shell.
2. Run `./install.sh uninstall` from the repository.
3. Disconnect the USB-C cable.
4. Disable USB debugging on the headset if no longer needed.
5. Remove the local repository if desired.

Homebrew dependencies are shared tools and should only be uninstalled if no
other Android workflow uses them.
