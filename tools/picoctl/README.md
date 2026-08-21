<!-- Purpose: Introduce the picoctl USB control tool, its setup, and its boundaries. -->

# `picoctl`: direct USB device control

Here I show the lowest-level control strategy in this repository: a small macOS
CLI that wraps Android Debug Bridge and scrcpy. I use it to inspect a connected
PICO headset, mirror its display, capture its screen, and run common device
operations without a PICO cloud account.

The script deliberately stays small. ADB owns Android authentication and device
commands; scrcpy owns video and input forwarding. `picoctl` only selects a safe
USB target and adds useful defaults.

## Requirements

- macOS
- A data-capable USB-C cable
- A PICO headset with USB debugging enabled
- Android Platform Tools (`adb`)
- scrcpy 3.2 or newer for PICO 4 Ultra support

Install the host tools with Homebrew:

```bash
brew install --cask android-platform-tools
brew install scrcpy
```

## Quick start

Connect the headset, accept its debugging prompt, and run the CLI directly:

```bash
./tools/picoctl/picoctl status
./tools/picoctl/picoctl mirror
./tools/picoctl/picoctl eye
```

Running it without a command opens the interactive menu. You can also expose it
globally as `picoctl`; see [Installation](docs/INSTALLATION.md).

The mirror defaults to 1920 pixels on the longest edge, 60 fps, and no audio.
The `eye` command crops the stereoscopic image to its left half for a more useful
desktop view.

## Multiple devices

When several USB devices are connected, select one explicitly:

```bash
PICO_SERIAL=<usb-serial> picoctl status
```

## Boundaries

I intentionally keep this tool USB-only. It rejects ADB network endpoints and
does not manage PICO enrollment, firmware, cloud services, or WebXR application
state. For application-level control, use the WebXR dashboard example elsewhere
in this repository.

## Documentation

- [Commands](docs/COMMANDS.md)
- [Installation](docs/INSTALLATION.md)
- [Architecture and security](docs/ARCHITECTURE.md)
- [Operations and troubleshooting](docs/OPERATIONS.md)
- [Validation](docs/VALIDATION.md)
