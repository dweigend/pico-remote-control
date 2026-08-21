<!--
Purpose: Provide a repeatable supervised demo of caretaker-controlled passthrough and opaque presentation.
Context: The participant can see the room while getting onto an ICAROS before the operator reveals virtual content.
Responsibilities: Define preparation, the demonstration sequence, observable evidence, and safe stopping conditions.
Boundaries: This runbook is not a certified safety procedure and does not use PICO Enterprise or streaming APIs.
-->

# ICAROS passthrough-first operator demo

Here I use the existing WebXR dashboard to demonstrate a simple supervised transition: the
participant first sees the physical room through normal passthrough, then the caretaker reveals the
opaque virtual experience after positioning is complete.

## What this demo proves

- The experience renders locally on the PICO rather than arriving as a PC-rendered video stream.
- The dashboard can request transparent or opaque presentation inside one persistent WebXR session.
- The operator can wait for headset-confirmed state instead of assuming a sent command succeeded.
- Normal presentation changes do not navigate, reload, or require another XR entry confirmation.

It does not prove Enterprise API access, Kiosk Mode, streamed Seethrough, remote WebXR consent, or
physical safety certification.

## Preparation

1. Follow the repository setup guide and connect exactly one authorized PICO over USB-C.
2. Start this example with `bun run dev`.
3. Open `http://127.0.0.1:5173/dashboard.html` on the Mac.
4. Put on the headset and select `Enter XR` once.
5. Confirm that the dashboard reports the PICO, headset runtime, and XR session as connected and
   active.

## Demonstration

1. Select `AR · passthrough`.
2. Wait until the AR button and status are confirmed by the headset.
3. Keep the participant directly supervised while they are positioned and secured according to the
   installation's normal ICAROS procedure.
4. When the supervising team decides the participant is ready, select the intended world.
5. Select `VR-style · opaque` and wait for headset confirmation.
6. Demonstrate that world changes and experience restarts preserve the same XR session.
7. Select `AR · passthrough` again before helping the participant leave the installation.

## Stop conditions

Do not advance to opaque content when:

- the dashboard connection is stale or disconnected;
- the headset runtime or XR session is not active;
- the requested state remains pending or reports an error;
- the physical headset view has not been checked on the current device/software combination; or
- the supervising team has not completed its normal readiness check.

The optional scrcpy mirror and frame telemetry are operational aids. They do not replace direct
supervision or the headset's local exit and passthrough mechanisms.

## Related documentation

- [Enterprise, kiosk, streaming, and passthrough](../../docs/enterprise-kiosk-and-passthrough.md)
- [Control strategies](../../docs/control-strategies.md)
- [Validation record](../../docs/validation.md)
