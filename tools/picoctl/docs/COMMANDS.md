<!-- Purpose: Document the public commands and device-selection behavior of picoctl. -->

# Command reference

All commands target one authorized Android device connected over USB-C.

## Device selection

With one authorized USB device, selection is automatic. With several devices,
set the target explicitly:

```bash
PICO_SERIAL=<usb-serial> picoctl <command>
```

Unauthorized, offline, and network ADB devices are not selected. A
`PICO_SERIAL` containing a network port is rejected.

## Commands

| Command | What it does |
| --- | --- |
| `picoctl` or `picoctl menu` | Opens the interactive menu. |
| `picoctl status` | Prints serial, model, Android version, PICO OS build, and transport. |
| `picoctl mirror` | Mirrors and controls the complete display through scrcpy. |
| `picoctl eye` | Crops the mirror to the left half of the physical display. |
| `picoctl shell` | Opens an interactive Android shell. Type `exit` to return. |
| `picoctl settings` | Requests Android's standard Settings activity. |
| `picoctl install path/to/app.apk` | Installs or updates an APK with `adb install -r`. |
| `picoctl screenshot [file.png]` | Saves a PNG; the default is a timestamped file below `captures/`. |
| `picoctl record [file.mp4]` | Mirrors and records until scrcpy closes or you press `Control+C`. |
| `picoctl reboot` | Performs a normal Android reboot. |
| `picoctl help` | Prints the short command summary. |

The `shell`, `install`, `settings`, and `reboot` commands can change device
state. The wrapper does not restrict commands entered in an interactive shell
or inspect APK contents.
