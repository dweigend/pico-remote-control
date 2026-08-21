<!--
Purpose: Introduce my PICO 4 Enterprise test project and route readers to its runnable demos.
Context: The repository combines USB device tooling, local browser transport, and a remotely operated WebXR experience.
Responsibilities: Explain what I built, which tools I use, how to run it, and where the honest limits are.
Boundaries: Detailed implementation notes and hardware acceptance procedures live in docs and the example READMEs.
-->

# PICO Remote Control

[![CI](https://github.com/dweigend/pico-remote-control/actions/workflows/ci.yml/badge.svg)](https://github.com/dweigend/pico-remote-control/actions/workflows/ci.yml)

This is a small demo I built for myself to test the PICO 4 Enterprise.

It started as a few useful ADB commands and turned into a compact test bench for USB control,
browser bootstrapping, WebXR state, passthrough experiments, and operator workflows. Nothing here is
trying to become a fleet-management platform. It is a collection of small, inspectable examples
that answer one question at a time.

## The project includes

- [`picoctl`](tools/picoctl/) — a small macOS CLI for inspecting, mirroring, capturing, installing,
  and rebooting one USB-connected headset.
- [`adb-reverse-minimal`](examples/adb-reverse-minimal/) — the smallest useful proof that a page on
  the Mac can be opened from PICO Browser through a USB cable.
- [`webxr-dashboard`](examples/webxr-dashboard/) — a complete operator dashboard that sends
  validated commands to a running WebXR experience and displays confirmed headset state.
- [Enterprise, kiosk, streaming, and passthrough notes](docs/enterprise-kiosk-and-passthrough.md) —
  what belongs to standard ADB/WebXR, what needs PICO Business tooling, and what I would actually
  test before putting a person on an ICAROS.
- A few deliberately different demo worlds, because changing a button label is not a convincing XR
  state transition.

## The important libraries and tools I use

- [Bun](https://bun.com/docs) runs the HTTP server, native WebSockets, tests, and build scripts.
- [Three.js](https://threejs.org/docs/) owns rendering, scene resources, GLB loading, and the WebXR
  render loop.
- [WebXR Device API](https://www.w3.org/TR/webxr/) provides the immersive session and compositor
  contract.
- [Android Debug Bridge](https://developer.android.com/tools/adb) handles USB authorization,
  device commands, reverse port mappings, and browser launch intents.
- [scrcpy](https://github.com/Genymobile/scrcpy) provides the external headset mirror. I did not
  invent another video protocol. You are welcome.
- [TypeScript](https://www.typescriptlang.org/docs/) keeps commands, observations, and runtime state
  explicit at the application boundaries.
- [Biome](https://biomejs.dev/) keeps formatting and static checks boring—in the good sense.
- The included models are CC0 assets from [Poly Pizza](https://poly.pizza/), with attribution and
  source metadata stored beside the files.

There is no frontend framework and no WebSocket helper library. The browser APIs and Bun already do
the required jobs, so I let them.

## How it fits together

```text
Mac
├── terminal ── picoctl ── ADB / scrcpy ──────────────── PICO OS
└── dashboard ── Bun server ── WebSocket ─────────────── PICO Browser
                           └── ADB reverse over USB-C       └── WebXR runtime
```

The headset performs the XR rendering. The Mac serves local files, sends small typed commands,
reports confirmed state, and can open a bounded scrcpy preview. ADB gets the browser to the page;
the WebXR application owns the actual experience state. Mixing those responsibilities produced
surprisingly creative bugs, so the repository keeps them separate.

## Screenshots

### WebXR operator dashboard

![PICO WebXR operator dashboard showing the disconnected device state and remote controls](docs/images/webxr-dashboard.png)

The dashboard reports its own connection, the USB device, and the headset runtime separately. This
screenshot shows the honest desktop state with no headset attached.

### Minimal USB transport proof

![Minimal PICO USB transport success page](docs/images/adb-reverse-minimal.png)

If this page appears at the PICO loopback address, the USB transport works. It does not mean that
WebXR is active, approved, comfortable, or a good idea.

## Quick start

Install [Bun](https://bun.com/docs/installation),
[Android Platform Tools](https://developer.android.com/tools/releases/platform-tools), and
[scrcpy 3.2 or newer](https://github.com/Genymobile/scrcpy/releases/tag/v3.2). Then connect and
authorize the headset over USB-C.

Inspect the device:

```bash
./tools/picoctl/picoctl status
```

Run the complete dashboard:

```bash
cd examples/webxr-dashboard
bun install --frozen-lockfile
bun run dev
```

Open `http://127.0.0.1:5173/dashboard.html` on the Mac. The server maintains the USB reverse mapping
and opens the headset page when exactly one authorized USB PICO is available. In the normal browser
flow, put on the headset and select `Enter XR` once. After that, the dashboard can switch worlds and
presentation styles inside the same immersive session.

Run every non-hardware check from the repository root:

```bash
./scripts/check.sh
```

## Useful reading

- [Setup](docs/setup.md)
- [Control strategies](docs/control-strategies.md)
- [Architecture](docs/architecture.md)
- [Complete WebXR dashboard guide](docs/webxr-dashboard.md)
- [Enterprise, kiosk, streaming, and passthrough](docs/enterprise-kiosk-and-passthrough.md)
- [ICAROS operator demo](examples/webxr-dashboard/ICAROS_OPERATOR_DEMO.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Validation and open hardware gates](docs/validation.md)

## Scope and reality check

I keep the project deliberately local and cable-first: one Mac, one explicitly selected PICO, one
fixed loopback origin, and no silent Wi-Fi fallback. The current demos use standard ADB, scrcpy,
browser APIs, and application-level WebSockets. They do not pretend to implement PICO Enterprise
fleet management or a general kiosk API.

Automated tests can verify protocols, lifecycles, cleanup, reconnect behavior, and builds. They
cannot verify passthrough quality, comfort, thermals, frame timing, mirror overhead, or whether the
cable falls out at exactly the wrong dramatic moment. Those checks need the physical headset and
are documented as explicit gates rather than quietly marked “probably fine.”

## One last disclaimer

This is a test project. Obviously, everything is open source under the [MIT License](LICENSE). Some
of it was built with AI, and I have not read every single line of code. So please use the whole thing
with an appropriate amount of caution—and preferably before anyone climbs onto expensive moving
hardware.
