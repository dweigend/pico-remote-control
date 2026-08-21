<!--
Purpose: Provide one shared diagnostic path for USB, ADB, browser transport, WebXR, and mirroring failures.
Context: The examples build on the same cable-first connection but expose different status layers.
Responsibilities: Distinguish common failure states and give bounded recovery actions.
Boundaries: This is not a PICO fleet-management or firmware-recovery manual.
-->

# Troubleshooting

## No device appears

```bash
adb devices -l
```

- No row: check the cable, USB port, headset power, and USB debugging.
- `unauthorized`: unlock the headset and accept the debugging fingerprint.
- `offline`: reconnect the cable, then restart ADB if needed.
- Multiple `device` rows: disconnect the unrelated device or select the intended USB serial.

Charging-only cables do not carry ADB data.

## Browser page is unavailable

Check the host server and mapping separately:

```bash
curl http://127.0.0.1:5173/
adb reverse --list
```

Recreate the mapping after a cable removal, reboot, or ADB restart:

```bash
adb wait-for-device
adb reverse tcp:5173 tcp:5173
```

The complete dashboard does this automatically while it is running. The minimal example leaves the
steps visible so you can understand the transport.

## scrcpy opens but remains black

The Android display can be reported as asleep even while screenshots still work:

```bash
adb shell dumpsys power | grep mWakefulness
```

Put on the headset or cover its proximity sensor. `picoctl` and the dashboard mirror each send one
power-key event when they detect the asleep state.

Do not run the full `picoctl eye` mirror and the dashboard mirror at the same time.

## Dashboard says PICO online but XR is not active

These are separate facts. ADB can see the device while PICO Browser is closed, and PICO Browser can
be connected while it still waits for `Enter XR`. Check device, runtime, XR, and mirror status as
independent layers.

## Passthrough or VR-style presentation is wrong

The complete example depends on an `immersive-ar` session whose `environmentBlendMode` is
`alpha-blend`. Stop the demo if the target browser reports another mode or if transparency and the
opaque enclosure do not work visually. A desktop browser is not valid evidence for this behavior.

## World change times out

The runtime reveals a usable procedural scene after a bounded transition even when optional GLB
assets are still loading. If the confirmed world does not change, inspect the dashboard error and
PICO Browser console rather than repeatedly sending commands.
