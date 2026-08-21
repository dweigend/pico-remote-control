<!--
Purpose: Define repository-local engineering rules for contributors and coding agents.
Context: This documentation-first repository contains a Bash tool and two Bun examples for PICO control.
Responsibilities: Protect control-layer boundaries, USB safety, source quality, and validation honesty.
Boundaries: User-facing behavior is documented in README.md and docs; this file governs changes.
-->

# Repository instructions

Work as a pragmatic senior engineer. Prefer the smallest robust implementation and keep every
example understandable without hidden infrastructure.

## Architecture boundaries

- `tools/picoctl/` is a short-lived Bash wrapper around ADB and scrcpy.
- `examples/adb-reverse-minimal/` demonstrates only local USB browser transport and bootstrap.
- `examples/webxr-dashboard/server/` owns ADB, HTTP, WebSockets, and external processes.
- `examples/webxr-dashboard/src/headset/` owns WebXR, rendering, telemetry, and experience state.
- `examples/webxr-dashboard/src/dashboard/` owns operator presentation and pending commands.
- `examples/webxr-dashboard/src/shared/` owns serializable contracts and validation only.

Do not create a shared abstraction between Bash and TypeScript merely because both call ADB or
scrcpy. Their lifecycle and error-handling requirements are different.

## Engineering rules

- Keep code, comments, documentation, and commits in English.
- Validate external input before it reaches application state.
- Execute ADB and other subprocesses with argument arrays; never interpolate input into a shell.
- Keep USB-only operation explicit. Do not add Wi-Fi discovery or fallback.
- Preserve one persistent WebXR session during ordinary dashboard commands.
- Give every new source file a header explaining purpose, context, responsibility, and boundary.
- Prefer standard APIs and existing dependencies. Add a dependency only for a demonstrated need.
- Keep functions focused, use early returns, and expose explicit lifecycle methods where state is
  long-lived.

## Verification

Run `./scripts/check.sh` after meaningful changes. Changes involving PICO Browser, WebXR, ADB,
scrcpy, passthrough, or performance also require a dated physical-device check before claiming
hardware acceptance.
