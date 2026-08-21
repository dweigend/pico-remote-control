<!--
Purpose: Explain how to build a small, reliable dashboard for controlling a PICO WebXR experience.
Context: The WebXR dashboard example is a working USB-first system with a Mac dashboard and a PICO Browser runtime.
Responsibilities: Describe tool roles, architecture, protocol, XR constraints, operating strategies, and extension points.
Boundaries: This is a design and implementation guide, not a fleet-management or native PICO SDK guide.
-->

# Building a PICO control dashboard

Here I explain the ideas behind `examples/webxr-dashboard` so that you can build your own control
surface. Paths in this guide are relative to that example directory. The shortest route is to keep
the server, headset runtime, and shared protocol, then replace only the dashboard page and the
files in `src/dashboard/`.

The central rule is simple:

> The PICO owns XR and reports what actually happened. The dashboard requests changes and displays
> confirmed state.

Do not make the dashboard the owner of the XR session. A command sent from a laptop is not proof
that the headset applied it, and it is not a user gesture inside PICO Browser.

## Start with the smallest useful system

For one PICO connected to one Mac, the complete system needs only three application parts:

```text
Mac dashboard ── /ws/dashboard ──┐
                                  ├── Bun server on 127.0.0.1:5173
PICO runtime  ── /ws/headset ─────┘              │
                                                 └── ADB reverse over USB-C
                                                          │
                                                          ▼
                                                   PICO Browser/WebXR

Optional operator mirror: Bun server ── starts/stops ── scrcpy window
```

- The **dashboard** renders controls, pending actions, confirmed PICO state, and errors.
- The **Bun server** serves both pages, relays validated messages, monitors ADB, restores the USB
  route, opens PICO Browser, and owns the external mirror process.
- The **PICO runtime** owns the WebXR session, Three.js renderer, active experience, command
  execution, and runtime snapshots.

This is deliberately not a generic device platform. It supports one local operator, one headset,
one fixed port, and a physically controlled USB path to exactly one authorized ADB device. The
application has no separate authentication layer.

## Which tool does what?

| Tool | Use it for | Do not use it for |
| --- | --- | --- |
| [Bun](https://bun.com/docs) | Package management, TypeScript execution, bundling, HTTP routes, native WebSockets, tests, and subprocesses in one local process. | XR rendering or PICO capability detection. |
| [WebSocket](https://websockets.spec.whatwg.org/) | Small commands, acknowledgements, complete state snapshots, status, and light telemetry. | Video frames, large assets, or an unbounded event history. |
| [ADB](https://developer.android.com/tools/adb) | Find the USB device, create `adb reverse`, inspect boot state, and open a URL in PICO Browser. | Starting immersive XR without a user gesture or understanding application state. |
| [WebXR](https://www.w3.org/TR/webxr/) | Request and own the immersive session, tracking, reference spaces, frames, and input. | Remote device administration or direct access to passthrough camera frames. |
| [Three.js](https://threejs.org/manual/en/how-to-create-vr-content.html) | Scene graph, WebGL rendering, WebXR integration, animation loop, and GLB loading. | Device discovery, control transport, or dashboard state. |
| [scrcpy](https://github.com/Genymobile/scrcpy) | A bounded external view of the physical Android display for the operator. | Semantic state, level control, or a browser-embedded spectator camera. |

The project uses only Three.js as a runtime package. Bun already provides the server, WebSocket,
bundler, test runner, and subprocess APIs, so Express, `ws`, Vite, and a second process are not
needed here.

## What the PICO web runtime can and cannot do

PICO documents WebXR as part of its web platform. I treat the platform overview as a direction,
not as a compatibility matrix for every PICO model, OS version, browser edition, and enterprise
policy. Gate each feature on the physical target headset.

### You can

- Serve a Three.js/WebXR application from the Mac to PICO Browser over a USB-only loopback route.
- Start an `immersive-ar` or `immersive-vr` session when the browser and headset support it.
- Keep one immersive session alive while changing application state, levels, and presentation.
- Render transparent virtual pixels over color passthrough in an `alpha-blend` AR session.
- Use normal browser WebSockets to control the running application and report state.
- Load local GLB assets and use supported standard WebXR features after checking them at runtime.

### You cannot assume

- A laptop command can silently enter XR. Opening the page through an Android `VIEW` intent does
  not authorize immersive XR. In this normal browser workflow, the person wearing the headset
  still selects `Enter XR`.
- An `XRSession` can change from `immersive-ar` to `immersive-vr`. Its session mode is fixed.
- An ended XR session can be restarted. Session shutdown is permanent; switching mode requires a
  new `requestSession()` and normally another valid user activation.
- `immersive-ar` automatically grants JavaScript access to passthrough camera frames, camera
  intrinsics, or real-world geometry. The XR compositor performs passthrough composition without
  exposing that data. Optional features such as Plane Detection must be requested, supported, and
  handled separately.
- A successful `isSessionSupported()` check proves the complete experience works. Session creation,
  blend mode, visible transparency, and performance still need on-device verification.
- Every feature documented for a recent PICO OS release exists on an older device/browser pair.
- WebGPU works inside WebXR without a dated browser and device check.
- `adb reverse` survives a cable removal, headset reboot, or ADB restart.

## AR and VR-style presentation

This demo does not switch WebXR session modes. It requests one long-lived `immersive-ar` session
and requires:

```ts
if (!navigator.xr || !(await navigator.xr.isSessionSupported("immersive-ar"))) {
  throw new Error("Immersive AR is unavailable.");
}

const session = await navigator.xr.requestSession("immersive-ar", {
  requiredFeatures: ["local-floor"],
});

if (session.environmentBlendMode !== "alpha-blend") {
  await session.end();
  throw new Error(`Expected alpha-blend, received ${session.environmentBlendMode}.`);
}
```

The actual implementation performs these checks in `src/headset/headset-runtime.ts` and injects the
accepted session into Three.js with `renderer.xr.setSession(session)`.

`alpha-blend` reports the compositor technique; it is not by itself proof of correct visible
passthrough or opaque coverage. I still verify both presentations on the physical headset.

Inside that one session, the application has two presentation states:

```text
AR / passthrough     transparent framebuffer areas reveal the camera-composited world
VR-style / opaque   inward-facing opaque geometry fully covers the camera-composited world
```

The shared enclosure lives in `src/headset/experience-host.ts`. The `set-mode` command only toggles
that enclosure; it does not navigate, reload, call `XRSession.end()`, or construct another
renderer. This preserves the current level and avoids another headset prompt.

Use labels such as **AR / passthrough** and **VR-style / opaque** in your dashboard. Calling this a
true AR/VR session switch would be misleading.

### When a real session-mode switch is necessary

Use separate `immersive-ar` and `immersive-vr` sessions only when their semantic or platform
differences are essential to the product. The transition must then:

1. end the current session;
2. return the headset page to a visible entry state; and
3. request the other session from a valid user activation.

That is a different user journey. Do not add it merely to change the background from transparent
to opaque.

## Switching levels without restarting XR

Treat levels as application modules, not pages. Navigating to a new URL would throw away the
runtime and can cost another XR confirmation.

In this repository each experience implements one small contract:

```ts
interface Experience {
  readonly root: THREE.Group;
  readonly vrBackgroundColor: THREE.ColorRepresentation;
  start(): void | Promise<void>;
  update(deltaSeconds: number, elapsedSeconds: number): void;
  dispose(): void;
}
```

The important ownership rules are:

- The headset runtime owns the renderer and XR session. Its persistent experience host owns the
  scene, camera, opaque enclosure, and shared transition.
- One experience owns only the objects, assets, timers, and listeners it creates.
- `dispose()` releases all owned geometries, materials, textures, listeners, and late asynchronous
  results.
- The included GLBs contain no images or textures. If you introduce image-based GLBs, also close
  owned image bitmaps where applicable; `Texture.dispose()` alone does not release them.
- Restart is `dispose()` followed by a fresh construction of the same experience.
- A level change is refused while another transition is active.
- Optional models must not block a usable scene indefinitely.

The exhaustive registry in `src/experiences/experience-registry.ts` maps the validated IDs
`space`, `landscape`, and `disco` to factories. Those three worlds are the current example boundary.
Before adding another, extend the `WorldId` union, validator, registry, dashboard rendering, and
tests together. Do not build a plugin system until worlds truly come from independent third parties.

## The command and state model

The WebSocket is a transport, not the state authority. Use a small, versioned protocol with
discriminated unions and validate every received JSON message before it reaches application state.

Commands sent by this dashboard look like this:

```json
{ "version": 1, "type": "set-mode", "requestId": "…", "mode": "ar" }
{ "version": 1, "type": "load-world", "requestId": "…", "worldId": "landscape" }
{ "version": 1, "type": "restart-world", "requestId": "…" }
{ "version": 1, "type": "set-mirror", "requestId": "…", "enabled": true }
{ "version": 1, "type": "reset-runtime", "requestId": "…" }
```

`set-mirror` terminates at the server because the server owns scrcpy. The other commands are
forwarded to the PICO because the headset owns their state.

For a headset-owned command, the PICO replies with a correlated result and publishes its complete
runtime state:

```json
{ "version": 1, "type": "command-result", "requestId": "…", "ok": true }
{
  "version": 1,
  "type": "runtime-status",
  "xrState": "active",
  "mode": "ar",
  "worldId": "landscape",
  "environmentBlendMode": "alpha-blend"
}
```

Keep three concepts separate in the UI:

| State | Meaning | Example |
| --- | --- | --- |
| Requested | What the operator asked for. | `landscape` button was selected. |
| Pending | The request is waiting for a correlated result or timeout. | Show progress and prevent conflicting actions. |
| Confirmed | What the PICO most recently reported. | `runtime-status.worldId === "landscape"`. |

A successful WebSocket `send()` only means that the browser accepted bytes for transmission. Even
an `ok` command result must be corroborated by an authoritative state snapshot for stateful
changes. This repository uses `crypto.randomUUID()` for correlation and a five-second UI timeout.
Do not depend on message order: mode commands currently publish state before their result, while a
completed world transition publishes its result before state. A mirror command receives its result
from the server and is confirmed separately by `mirror-status`.

### Keep connection states separate

These are different facts and should remain visibly separate:

- **Dashboard connection:** can this page reach the Bun server?
- **Device state:** does ADB see exactly one authorized USB device?
- **Headset runtime:** is the PICO Browser page connected to `/ws/headset`?
- **XR state:** is the page unsupported, ready, requesting, active, ended, or in error?
- **Mirror state:** is the external scrcpy process off, starting, running, or in error?

`PICO online` does not imply that PICO Browser is connected, and a connected browser page does not
imply that XR is active.

## Build your own dashboard

The least invasive approach keeps the working infrastructure and replaces only the presentation
layer.

### 1. Keep these modules

- `server/` for HTTP, role routing, ADB recovery, browser opening, and scrcpy ownership.
- `src/shared/` for protocol types and runtime validation.
- `src/headset/` for WebXR and authoritative state.
- `src/experiences/` for level lifecycles.

### 2. Change only the layer you need

- `dashboard.html` is the page entry.
- `src/dashboard/control-connection.ts` owns only WebSocket connection and reconnection.
- `src/dashboard/dashboard-controller.ts` reduces confirmed messages, tracks pending commands, and
  guards invalid actions.
- `src/dashboard/dashboard-view.ts` owns DOM creation, events, and rendering.
- `src/dashboard/dashboard.css` owns presentation.

For a visual redesign, change only `dashboard-view.ts`, `dashboard.css`, and possibly
`dashboard.html`. Keep the controller and connection so their validation, correlation, timeout,
and reconnect rules stay intact.

For a small dashboard, plain DOM code is sufficient. If the surrounding product already uses a UI
framework, keep the shared protocol and `control-connection.ts` as framework-independent adapters,
then map their messages into the framework's normal state model while preserving the controller's
state rules. The resulting page must still be served from the Bun origin; WebSocket admission in
this demo rejects an unrelated framework development origin. Do not introduce a framework solely
to render a handful of buttons and status labels.

### 3. Connect to the existing endpoint

The server assigns roles by URL, so a custom dashboard connects to the same origin:

```ts
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${protocol}//${window.location.host}/ws/dashboard`);
```

On connection the server sends current device and mirror snapshots, the headset connection state,
and the latest runtime snapshot when one is available. Parse each message through the shared
validator. Do not restore old local assumptions after a reconnect.

Only one dashboard socket is active in this demo. Opening a newer dashboard replaces the older
connection intentionally.

### 4. Derive controls from confirmed state

Enable mode, level, and experience-restart actions only when:

```text
headset runtime connected AND xrState is active
```

Enable mirror controls from fresh ADB device state, not XR state. Mirror and XR are independent.
Disable commands that are already pending or already confirmed. Surface timeouts instead of
pretending that a request succeeded.

The destructive runtime reset is a separate recovery action. It requires a connected headset
runtime and an explicit operator confirmation, but XR does not need to be active. Explain that it
ends the session, reloads the page, and requires `Enter XR` again.

### 5. Test the state machine before styling it

At minimum, verify:

- malformed and unknown protocol messages are rejected;
- controls stay disabled while the required owner is unavailable;
- pending requests settle on success, failure, or timeout, and a disconnect invalidates stale
  requested/runtime state;
- a reconnect replaces stale UI with the latest complete snapshot;
- repeated level switches and restarts release the previous resources;
- a mirror failure leaves XR active;
- an ended XR session returns to a visible `Enter XR` state on the PICO.

The current automated suite covers protocol, connection policy, ADB, mirroring, telemetry, and
experience lifecycles. It has no direct `DashboardController` or `DashboardView` tests; add focused
tests before changing their behavior. Transparency, opacity, user activation, frame timing, and the
physical mirror still require the actual headset.

## Making daily operation boring

The best dashboard is not only a control UI. It removes repetitive setup while preserving the one
security action that WebXR requires from the person wearing the headset.

Starting this demo with `bun run dev` activates this workflow:

1. serves both pages on the fixed loopback origin `127.0.0.1:5173`;
2. polls ADB and distinguishes offline, unauthorized, multiple, and online states;
3. accepts exactly one physical USB device;
4. waits for Android boot completion;
5. checks and restores `adb reverse tcp:5173 tcp:5173`;
6. waits briefly for an existing PICO Browser runtime to reconnect;
7. opens the local headset URL at most once per newly online device epoch when it did not reconnect;
8. lets both browser clients reconnect their WebSockets with bounded backoff; the server accepts
   them and publishes current status; and
9. cleans up only the mirror process and reverse mapping it owns on shutdown.

The operator still puts on the headset and confirms `Enter XR` once. Automating around that browser
security boundary is useful; pretending it does not exist is brittle.

### Why loopback and one fixed port matter

`adb reverse tcp:5173 tcp:5173` makes the Mac server available as `127.0.0.1:5173` from the PICO.
Loopback origins are treated as potentially trustworthy, which matters because WebXR is restricted
to secure contexts. A random `http://192.168.x.x` address is not an equivalent replacement.

A single fixed port also keeps startup, reverse mapping, health checks, URLs, and troubleshooting
predictable. Do not add dynamic port discovery unless the deployment truly needs concurrent
instances.

### Recovery strategy

- Let the PICO keep rendering if the control WebSocket drops.
- Retry sockets with bounded backoff rather than reloading either page.
- Recreate reverse mappings after a USB or ADB interruption.
- Give an already-running headset page time to reconnect before opening another browser intent.
- Send the complete current set of device, mirror, peer, and available runtime status messages
  after reconnection; do not depend on missed deltas or require one atomic snapshot message.
- Keep normal **restart experience** separate from destructive **reset PICO runtime**.
- Never make mirror failure terminate or reload the XR session.
- Disable HMR for this server because an automatic headset-page reload destroys the session.

## Mirroring: choose the simple boundary

The current dashboard starts an external scrcpy window. On my tested PICO 4 Ultra, the captured
display is side-by-side stereo, so the server crops the physical display to its left half. Other
models or software versions may expose a different capture layout. The mirror is limited to 640
pixels on the longest encoded edge, 15 fps, no audio, and no input control. That is enough for
operator orientation and keeps capture cost bounded.

scrcpy is intentionally separate from the semantic control channel:

- It knows pixels, not `worldId`, transitions, or XR state.
- It can fail or be closed without affecting the experience.
- It is an external process with an authoritative process status.
- Its native window is simpler than capturing and embedding that window back into a webpage.

### Why this demo does not use WebRTC

A controlled browser-embedded one-eye spectator view would likely require dedicated spectator
rendering, `captureStream()`, a peer connection, signaling, ICE lifecycle, and real-device
performance checks. More importantly, ADB reverse carries TCP connections such as the signaling
WebSocket; it does not by itself provide the separate ICE media path that WebRTC selects. This
project's USB-only experiment proved signaling but not a working media path with Wi-Fi disabled.

Use WebRTC only when an embedded view is a real requirement. First prove `canvas.captureStream()`,
the selected ICE candidate pair, USB-only transport, and headset frame cost. Do not pre-build TURN,
perfect negotiation, adaptive bitrate, or a custom media protocol.

## A practical file map

| Concern | Start here |
| --- | --- |
| HTTP, WebSocket relay, latest snapshots | `server/server.ts` |
| USB device states and reverse mapping | `server/adb-device-monitor.ts` |
| Bounded browser opening | `server/headset-auto-opener.ts` |
| External left-eye mirror | `server/scrcpy-mirror.ts` |
| Serializable protocol | `src/shared/protocol/messages.ts` |
| Runtime validation | `src/shared/protocol/parse-*.ts` |
| Dashboard state and pending commands | `src/dashboard/dashboard-controller.ts` |
| Dashboard socket recovery | `src/dashboard/control-connection.ts` |
| XR/session/command ownership | `src/headset/headset-runtime.ts` |
| Persistent scene and presentation mode | `src/headset/experience-host.ts` |
| Shared level transition | `src/headset/experience-transition.ts` |
| Experience lifecycle | `src/experiences/experience.ts` |

## What to leave out until it is required

- Cloud hosting, accounts, authentication, analytics, and a database.
- Multiple headsets, device discovery, or Wi-Fi ADB fallback.
- A message broker, event sourcing, or persistent command history.
- Video over WebSocket or a custom streaming codec.
- WebRTC, TURN, or a spectator renderer when a separate scrcpy window is sufficient.
- A true `immersive-ar`/`immersive-vr` session switch just to change visual opacity.
- Automatic immersive entry for a normal browser page.
- A generic plugin system for a known finite set of levels.
- A frontend framework or global state library for a small local panel.
- PICO-specific APIs when a supported standard WebXR API already solves the requirement.

Add one of these only when a concrete use case and an on-device acceptance test justify its cost.

## Known verification boundary of this demo

The implementation and desktop checks are complete enough to serve as an architectural example.
The repository [validation record](validation.md) remains the source of truth for dated hardware
evidence and open gates. Final evidence is still pending for the corrected on-device restart/fade
path, mirror-on versus mirror-off frame timing, repeated renderer resource counts, cable recovery,
and the two-hour soak test.

Do not turn a desktop test into a PICO compatibility claim. Re-run the hardware gates after a PICO
OS, PICO Browser, Three.js, or scrcpy update.

## Primary references

- [PICO WebXR overview](https://developer.picoxr.com/document/web/webxr/) — current PICO web runtime
  direction and listed WebXR modules.
- [PICO Web platform announcement](https://developer.picoxr.com/blog/web/) — PICO Browser,
  passthrough, and packaged web-app context; version-specific historical claims should not be
  treated as a current compatibility matrix.
- [WebXR Device API](https://www.w3.org/TR/webxr/) — session modes, lifecycle, user intent, frames,
  reference spaces, and security model.
- [WebXR Augmented Reality Module](https://www.w3.org/TR/webxr-ar-module-1/) — `immersive-ar`,
  `environmentBlendMode`, alpha composition, and the camera-data boundary.
- [Secure Contexts](https://www.w3.org/TR/secure-contexts/) — why loopback development origins are
  different from arbitrary HTTP LAN addresses.
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) — WebXR renderer and
  the recommended `setAnimationLoop()` lifecycle.
- [Three.js XR manager](https://threejs.org/docs/pages/WebXRManager.html) — session, XR camera,
  reference space, and controller integration.
- [Bun HTTP server](https://bun.com/docs/runtime/http/server) and
  [Bun WebSockets](https://bun.com/docs/runtime/http/websockets) — the one-process server and relay.
- [Bun subprocesses](https://bun.com/docs/runtime/child-process) — safe argument-array execution and
  process lifecycle.
- [Android local server with ADB](https://developer.android.com/develop/ui/views/layout/webapps/access-local-server)
  and [ADB reference](https://developer.android.com/tools/adb) — USB reverse mapping, devices, and
  Android activity commands.
- [scrcpy](https://github.com/Genymobile/scrcpy) — the external Android display mirror and its
  documented limits/options.
- [WebSockets standard](https://websockets.spec.whatwg.org/) — ordered message transport and browser
  client behavior.
- [WebRTC](https://www.w3.org/TR/webrtc/) — use only if an embedded media path becomes a verified
  product requirement.

For running the existing system rather than building a new dashboard, use the
[example README](../examples/webxr-dashboard/README.md) and the shared
[troubleshooting guide](troubleshooting.md).
