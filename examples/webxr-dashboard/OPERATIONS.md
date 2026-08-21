<!--
Purpose: Provide the practical operator runbook for the PICO WebXR demo.
Context: One PICO runs a persistent browser-owned XR session controlled from a Mac over USB-C.
Responsibilities: Explain startup, AR/VR-style presentation, experience switching, device access, mirroring, recovery, and relevant XR references.
Boundaries: This guide covers the PICO and XR workflow, not general Bun, TypeScript, or Three.js development.
-->

# PICO operation guide

This guide describes the recommended way to run and control the demo on a PICO headset. The PICO
does the XR rendering. The Mac serves the application, sends dashboard commands, and optionally
shows a bounded mirror over the USB-C connection.

## One-time Mac setup

Install Bun, Android Platform Tools, and scrcpy before the first run. On a Homebrew-based Mac:

```bash
brew install oven-sh/bun/bun
brew install --cask android-platform-tools
brew install scrcpy
```

Verify the PICO-specific tools before connecting the headset:

```bash
bun --version
adb version
scrcpy --version
```

The demo does not require a PICO cloud connection. It uses the standard Android debugging bridge
exposed by the USB-connected headset.

## Recommended daily workflow

### 1. Connect and authorize the PICO

1. Use a data-capable USB-C cable, not a charge-only cable.
2. Wake and unlock the PICO.
3. Enable USB debugging on the headset if it is not already enabled.
4. Accept the USB debugging prompt inside the headset.
5. Confirm that exactly one authorized device is visible:

   ```bash
   adb devices -l
   ```

The device must be listed with the state `device`. `unauthorized` means that the debugging prompt
still needs to be accepted on the PICO. The application intentionally rejects multiple connected
Android devices because it cannot safely infer which one is the headset.

### 2. Start the control system

From the project directory on the Mac:

```bash
bun install --frozen-lockfile
bun run dev
```

Open the dashboard on the Mac:

```text
http://127.0.0.1:5173/dashboard.html
```

The Bun server continuously checks ADB, creates the fixed `tcp:5173` reverse mapping, and opens the
headset page in PICO Browser when the device becomes ready. The page used inside the PICO is:

```text
http://127.0.0.1:5173/headset.html
```

Because ADB reverse maps the PICO's loopback port to the Mac, the headset can use this local URL
without Wi-Fi. Do not replace it with the Mac's LAN IP; this project is deliberately USB-only and
WebXR requires a secure context.

### 3. Enter XR once

Put on the PICO and select `Enter XR` in PICO Browser. This explicit headset action supplies the
user intent expected by the normal browser flow; WebXR can also permit a recognized launch-as-app
flow when the user's intent is understood.
After it succeeds, the dashboard should report:

- `PICO device`: `PICO online`;
- `Headset runtime`: `Connected`;
- `XR`: `active`; and
- `Blend mode`: `alpha-blend`.

Normal presentation and experience changes do not reload the page and do not require another
confirmation.

## Switch between AR and VR-style presentation

Use the `Presentation` controls in the Mac dashboard:

- `AR · passthrough` makes the world background transparent so the PICO camera passthrough remains
  visible.
- `VR-style · opaque` renders a fully opaque virtual enclosure that hides the passthrough image.

The selected experience and its current state remain active when the presentation changes. Wait
until the selected button is confirmed as active before sending another command.

### Important WebXR distinction

This is not a runtime switch from an `immersive-ar` session to an `immersive-vr` session. A WebXR
session mode is fixed when the session is created. The demo therefore keeps one persistent
`immersive-ar` session and changes only how the virtual world is composited:

```text
one immersive-ar session
├── AR presentation       transparent pixels reveal passthrough
└── VR-style presentation opaque geometry hides passthrough
```

This design avoids ending the session and asking the person inside the headset to confirm XR
again. It depends on PICO Browser reporting `environmentBlendMode === "alpha-blend"`. If the
dashboard reports another blend mode, do not treat the AR/VR-style switch as supported.

## Switch between experiences

The `Experience` section of the dashboard exposes exactly three levels:

- `Space` selects `space`, a calm planet and star-field scene.
- `Landscape` selects `landscape`, a low-poly outdoor scene.
- `Disco` selects `disco`, a restrained animated stage scene.

Select the required button and wait for the headset-confirmed `World` status to change. The runtime
uses one short fade transition, disposes the previous experience, and starts the next one without
navigating or ending XR. Optional GLB assets may continue loading after the procedural part of the
new experience is already visible.

`Restart experience` disposes and reconstructs only the current level. It preserves the active
XR session and does not require `Enter XR` again.

Do not confuse this with `Restart PICO` in the recovery section. The recovery action ends the
owned XR session and reloads the headset page, so `Enter XR` must be confirmed again.

## Address and control the PICO

### Preferred path: dashboard and automatic ADB management

For demonstrations, use `bun run dev` and the dashboard. The server already owns the required ADB
polling, reverse mapping, browser launch, reconnect handling, and bounded scrcpy process. This keeps
normal operation in one place and avoids competing processes.

Useful status checks from a second terminal are read-only:

```bash
adb devices -l
adb reverse --list
curl http://127.0.0.1:5173/api/device
curl http://127.0.0.1:5173/api/health
```

The expected reverse mapping contains `tcp:5173 tcp:5173`.

### Manual browser recovery

The server normally restores the mapping and opens PICO Browser itself. If you need to diagnose
that path manually, keep `bun run dev` running and use:

```bash
adb wait-for-device
adb reverse tcp:5173 tcp:5173
adb shell am start -W \
  -a android.intent.action.VIEW \
  -d http://127.0.0.1:5173/headset.html \
  -p com.pico.browser.overseas
```

`com.pico.browser.overseas` is the package observed on the tested PICO 4 Ultra Enterprise. Browser
packages can differ by device, region, and installed browser. If it does not exist, use an unscoped
`ACTION_VIEW` intent or inspect the target device instead of assuming that package is universal.

After a cable removal, PICO reboot, or `adb kill-server`, reverse mappings may be gone. The running
server searches again and recreates its mapping after the device returns. If the original PICO
Browser page and XR session remained alive, they can reconnect without another `Enter XR` action.

### Optional local `picoctl` utility

The repository's [`tools/picoctl`](../../tools/picoctl/) directory installs the USB-only `picoctl`
command for diagnostics outside this application:

```bash
picoctl status
picoctl settings
picoctl shell
picoctl eye
picoctl reboot
```

Use `picoctl status` for a quick device check and `picoctl eye` only when you need a higher-quality,
interactive diagnostic view. Prefer the dashboard mirror during the demo because it is deliberately
read-only and performance-bounded. Do not run both mirrors at the same time.

## Mirror the PICO display

The recommended mirror is integrated into the dashboard:

1. Wait until `PICO device` reports `PICO online`.
2. In `USB mirror`, select `Open PICO mirror`.
3. A native window named `PICO Left Eye Mirror` opens on the Mac.
4. Select `Close PICO mirror` when the preview is no longer needed.

On the tested PICO 4 Ultra, the application reads the physical side-by-side display size and crops
its left half. Other devices or software versions may expose a different capture layout. scrcpy
starts with these safety and performance limits:

- USB device only;
- no remote input control;
- no audio;
- maximum encoded edge of 640 pixels; and
- maximum 15 frames per second.

The mirror is for operator orientation, not for judging final visual quality. Stop it when it is not
needed because capture and encoding consume headset resources. A mirror error is isolated from the
XR runtime and must not end the active session.

If the mirror stays black or fails to open, wake the headset and check:

```bash
adb devices -l
scrcpy --version
```

Then close any other scrcpy or `picoctl eye` process before trying the dashboard button again.

## Recovery guide

| Dashboard state | Meaning | Action |
| --- | --- | --- |
| `PICO offline · ADB keeps searching` | No authorized USB device is currently visible. | Wake the PICO, reconnect the data cable, and leave the server running. |
| `PICO unauthorized` | The headset is visible but has not accepted this Mac. | Unlock the PICO and accept the USB debugging prompt. |
| `Multiple devices` | More than one physical Android device is connected. | Disconnect the unrelated device. |
| `Headset runtime: Disconnected` | ADB may be online, but the PICO Browser page is not connected. | Wait for the automatic open attempt, then use the manual browser recovery command if necessary. |
| `XR: ready` | The page is connected, but no immersive session is active. | Put on the PICO and select `Enter XR`. |
| `Blend mode` is not `alpha-blend` | The required passthrough composition is unavailable. | Stop the demo on that browser/OS combination; do not claim AR/VR-style switching works. |
| `Mirror: Error` | scrcpy could not start or stopped unexpectedly. | Wake the PICO, close competing mirror processes, and check `scrcpy --version`. XR can continue. |

Use `Restart PICO` only when the browser runtime or XR compositor is stale. It intentionally
ends XR and reloads the same page. This is a recovery operation, not a normal level restart.

Stop the full Mac-side service with `Control+C`. Its owned mirror process and reverse mapping are
then cleaned up.

## PICO, XR, and rendering references

- [PICO WebXR overview](https://developer.picoxr.com/document/web/webxr/) — PICO's platform overview
  of the WebXR APIs implemented by its browser runtime. Support still needs to be verified on the
  concrete headset, PICO OS, and PICO Browser version used for the demo.
- [WebXR Device API](https://www.w3.org/TR/webxr/) — the browser
  API for device discovery, session creation, tracking, reference spaces, frames, and input.
- [WebXR Augmented Reality Module](https://www.w3.org/TR/webxr-ar-module-1/)
  — the WebXR property that distinguishes `alpha-blend`, `opaque`, and `additive` composition. It
  explains why alpha zero reveals passthrough and alpha one hides it on supported devices.
- [Three.js `WebXRManager`](https://threejs.org/docs/pages/WebXRManager.html) — Three.js integration
  with the browser's XR session, reference space, cameras, and renderer.
- [Three.js `WebGLRenderer`](https://threejs.org/docs/pages/WebGLRenderer.html) — the renderer used by
  this project. Its XR support and `setAnimationLoop()` drive the headset frame loop.
- [Three.js `GLTFLoader`](https://threejs.org/docs/pages/GLTFLoader.html) — the official Three.js
  addon used to load the local `.glb` models in `landscape` and `disco`.
- [Android Debug Bridge](https://developer.android.com/tools/adb) — the official Android reference
  for USB debugging, device selection, shell commands, and port forwarding.
- [scrcpy](https://github.com/Genymobile/scrcpy) — the official source and documentation for the
  USB display mirror. This project delegates capture, encoding, USB transport, and the native Mac
  preview window to scrcpy instead of inventing a custom stream.
- [WebXR TypeScript definitions](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/webxr)
  — compile-time types for browser WebXR APIs. They add no headset runtime code.
- [Bun documentation](https://bun.com/docs) — the Mac-side runtime, server, WebSocket implementation,
  bundler, package manager, and test runner. Bun is infrastructure for the control system; it does
  not render XR on the PICO.

The local GLB source and license records are stored beside the assets in
[`public/assets/experiences`](public/assets/experiences/). They are content dependencies, not
runtime libraries.

To design or replace the Mac control surface, continue with
[Building a PICO control dashboard](../../docs/webxr-dashboard.md).
