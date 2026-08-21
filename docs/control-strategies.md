<!--
Purpose: Explain the available PICO control strategies and how they fit together.
Context: Readers often conflate Android administration, browser bootstrap, application commands, and XR lifecycle.
Responsibilities: Map goals to technologies, show tradeoffs, and prevent misleading capability claims.
Boundaries: Detailed implementation belongs in the tool and example directories.
-->

# Control strategies

I have tried several control paths. The most reliable design was not one universal remote-control
API, but a small stack in which each established tool keeps the job it already does well.

## 1. Direct Android control with ADB

Use ADB for device discovery, system properties, shell access, application installation, reboot,
screenshots, reverse port mappings, and Android intents.

This works without modifying the WebXR application. It does not understand worlds, transitions, XR
state, or application-specific success.

## 2. Visual access with scrcpy

Use scrcpy when you need to see the physical display or forward conventional Android pointer and
keyboard input. `picoctl mirror` shows the complete display; `picoctl eye` crops the physical output
to one eye.

The complete dashboard starts a separate, read-only, low-resolution scrcpy window for operator
orientation. It is intentionally limited to 640 pixels and 15 fps, and a preview-process failure
does not take down the XR runtime. Device-side capture and encoding still consume resources, so I
measure their cost on the target headset before using the mirror during a live experience.

scrcpy transports pixels, not semantic state. It cannot confirm that `worldId` changed or that a
WebXR transition completed.

## 3. Local browser access with ADB reverse

`adb reverse tcp:5173 tcp:5173` exposes a service running on the Mac as a loopback service on the
USB-connected Android device. PICO Browser can then open `http://127.0.0.1:5173` without using the
Mac's LAN address.

This solves transport and bootstrap. The examples defensively inspect and restore the reverse
mapping after observed cable, device-reboot, or ADB-restart interruptions instead of assuming that
the mapping survives them.

## 4. Application control with WebSockets

Once the page is running, a WebSocket is the simplest channel for small typed commands, correlated
results, complete state snapshots, and light telemetry.

The headset remains authoritative. A dashboard request and even a successful socket `send()` are
not proof that the headset applied the command. The complete example therefore distinguishes
requested, pending, and headset-confirmed state.

## 5. Persistent WebXR application state

The complete demo keeps one `immersive-ar` session alive. It switches experiences and toggles
transparent versus opaque presentation inside that session instead of navigating or requesting a
second immersive session.

This keeps normal operation remote-controllable after one authorized XR entry. It does not bypass
WebXR's user-intent requirement: this is normally a transient headset action, although a recognized
launch-as-app flow can also satisfy the specification when the user's intent is understood.

## Choosing the smallest solution

| Requirement | Smallest useful strategy |
| --- | --- |
| Inspect or administer one headset | `picoctl` |
| Show a local page on the headset | Minimal ADB reverse demo |
| Mirror the physical display | scrcpy |
| Change state inside your own web application | WebSocket command protocol |
| Switch WebXR scenes without a new confirmation | Persistent runtime with modular experiences |
| Manage multiple remote devices over the internet | Out of scope for this repository |
