<!--
Purpose: Provide the shortest reliable entry point for the complete PICO WebXR dashboard example.
Context: Bun serves a Mac dashboard and a persistent PICO Browser WebXR runtime over USB-C.
Responsibilities: Explain installation, startup, behavior, extension points, and verification limits.
Boundaries: Shared setup and troubleshooting live in the repository-level docs.
-->

# WebXR dashboard example

Here I show a complete application-level control path for one PICO connected to one Mac over
USB-C. A Bun server serves both browser pages, monitors ADB, restores the reverse mapping, opens the
PICO runtime, relays validated WebSocket messages, and manages a bounded scrcpy preview.

The PICO owns the WebXR session and the state that matters. The dashboard requests changes and
shows them as pending until the headset reports what actually happened.

## What the example demonstrates

- one persistent `immersive-ar` session after a single headset confirmation;
- transparent AR and opaque VR-style presentation inside that session;
- switching and restarting `space`, `landscape`, and `disco` without navigation;
- requested, pending, and headset-confirmed command state;
- USB device monitoring, `adb reverse`, and bounded browser opening;
- a low-resolution, read-only, left-eye scrcpy window;
- explicit lifecycle ownership and disposal for Three.js resources.

## Requirements

Follow the repository [setup guide](../../docs/setup.md), then verify that exactly one authorized
USB device is available:

```bash
adb devices -l
```

## Start

```bash
bun install --frozen-lockfile
bun run dev
```

Open the Mac dashboard:

```text
http://127.0.0.1:5173/dashboard.html
```

The server creates `adb reverse tcp:5173 tcp:5173` and opens this page through the browser package
used on my tested PICO. That package identifier is a tested-device value, not a portable Android
or PICO contract:

```text
http://127.0.0.1:5173/headset.html
```

Put on the headset and select `Enter XR` once. A normal webpage cannot silently enter immersive XR
from a Mac command.

## Controls

- `AR · passthrough` keeps transparent pixels available for compositor passthrough.
- `VR-style · opaque` renders an enclosing virtual environment without changing session mode.
- The experience buttons switch among the three local worlds.
- `Restart experience` disposes and reconstructs only the active world.
- The mirror controls start or stop the bounded external scrcpy process.
- `Restart PICO` is a recovery action that ends XR, reloads the page, and requires another
  headset confirmation.

## Architecture

```text
server/             ADB, HTTP, WebSockets, browser bootstrap, and scrcpy
src/shared/         serializable protocol contracts and runtime validation
src/dashboard/      operator state, pending commands, DOM, and connection recovery
src/headset/        WebXR session, renderer, command application, and telemetry
src/experiences/    isolated Three.js worlds behind one lifecycle contract
```

The detailed design and extension points are in the
[WebXR dashboard guide](../../docs/webxr-dashboard.md).

For the passthrough-first supervised ICAROS scenario, use the
[operator demo runbook](ICAROS_OPERATOR_DEMO.md). It demonstrates the existing application flow and
does not claim Enterprise API, Business Streaming, or safety-system behavior.

The complete startup, recovery, mirror, and status runbook is in [Operations](OPERATIONS.md).

## Checks

```bash
bun run lint
bun run typecheck
bun test
bun run build
```

Desktop checks cannot prove PICO passthrough, opacity, frame timing, cable recovery, or long-running
comfort and stability. See the repository [validation record](../../docs/validation.md) before
making device-compatibility claims.

## Included assets

The landscape and disco examples use five lightweight CC0 models from Poly Pizza. Their IDs,
creators, source links, license, file size, and local triangle counts are documented beside the GLB
files in `public/assets/experiences/*/ATTRIBUTION.md`.
