<!--
Purpose: Describe the repository and runtime architecture of the PICO control examples.
Context: The repository contains independent tools that share operational concepts but not a runtime library.
Responsibilities: Define ownership, data flow, lifecycle, and deliberate non-abstractions.
Boundaries: Protocol details and operating instructions live in the WebXR guide and example READMEs.
-->

# Architecture

## Repository structure

```text
tools/picoctl/                 short-lived Bash commands around ADB and scrcpy
examples/adb-reverse-minimal/ transport and browser-bootstrap proof
examples/webxr-dashboard/     complete application-level control system
docs/                         shared concepts, setup, troubleshooting, and evidence
```

I keep these programs separate because their lifecycles are different. The CLI runs one operation
and exits. The minimal example serves one page. The dashboard server continuously monitors ADB,
restores its owned mapping, relays validated state, and manages an external mirror process.

## Complete dashboard data flow

```text
Mac dashboard ── /ws/dashboard ──┐
                                  ├── Bun server on 127.0.0.1:5173
PICO runtime  ── /ws/headset ─────┘              │
                                                 ├── ADB reverse over USB-C
                                                 └── bounded scrcpy process
```

Ownership is explicit:

- The server owns HTTP, WebSockets, ADB state, reverse mappings, browser opening, and scrcpy.
- The dashboard owns controls, pending requests, and presentation of confirmed state.
- The headset runtime owns the WebXR session, renderer, active experience, mode, and telemetry.
- Experience modules own only the Three.js resources they create and expose `start()`, `update()`,
  and `dispose()`.
- Shared modules own serializable types and runtime validators, never application services.

## Why there is no shared ADB package

Both `picoctl` and the Bun server select USB devices and call ADB. Sharing those few operations
would couple Bash command behavior to a long-running TypeScript state machine. The apparent
duplication is smaller and clearer than the adapters, packaging, and error translation a common
library would require.

The repository instead shares documentation and invariants:

- reject network ADB serials;
- require one physical device or an explicit serial;
- never interpolate external input into a shell command;
- restore only mappings owned by the running application;
- keep device state separate from browser, XR, and mirror state.

## Persistent XR boundary

The WebXR example requests one `immersive-ar` session and requires `alpha-blend` for transparent
passthrough. Its `AR` and `VR-style` buttons change application presentation, not WebXR session
mode. Ending or reloading the session remains an explicit recovery action because re-entry can
require another user gesture inside the headset.
