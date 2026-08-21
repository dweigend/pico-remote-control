<!-- Purpose: Separate repeatable picoctl checks from dated hardware evidence. -->

# Validation

This page separates checks anyone can repeat from hardware evidence collected
for the original prototype. The dated record is evidence, not a compatibility
promise for future PICO OS or scrcpy releases.

## Repeatable local checks

From the repository root:

```bash
bash -n tools/picoctl/picoctl
bash -n tools/picoctl/install.sh
env PATH=/usr/bin:/bin tools/picoctl/picoctl --help
tools/picoctl/install.sh --help
```

The restricted `PATH` verifies that help stays available on a clean machine;
device commands still fail early with `Missing command: adb`.

I also exercise installation in a temporary directory so the test never
touches the real PATH:

```bash
install_dir="$(mktemp -d)"
PICO_INSTALL_DIR="$install_dir" tools/picoctl/install.sh install
PICO_INSTALL_DIR="$install_dir" tools/picoctl/install.sh status
PICO_INSTALL_DIR="$install_dir" tools/picoctl/install.sh install
PICO_INSTALL_DIR="$install_dir" tools/picoctl/install.sh uninstall
rmdir "$install_dir"
```

The repeated install must be idempotent. The installer must also refuse to
replace an existing file or unrelated symlink.

## Hardware validation record

The original CLI was exercised on 2026-08-11 with a PICO 4 Ultra Enterprise,
Android 14, PICO OS 5.11.2, ADB Platform Tools 37.0.1, and scrcpy 4.1 over an
authorized USB-C connection.

These checks passed:

- device metadata returned through `picoctl status`;
- a non-empty 4320 x 2160 PNG screenshot;
- full-display scrcpy mirroring at a 1920 x 960 output texture;
- a computed 2160 x 2160 left-eye crop, scaled to 1920 x 1920;
- automatic recovery when Android reported `mWakefulness=Asleep`;
- rejection of `PICO_SERIAL=192.0.2.1:5555` before device access.

APK installation, settings, shell mutations, reboot, and individual spatial UI
interactions were intentionally not part of that smoke test. Recheck affected
behavior on physical hardware after changing device-facing commands.
