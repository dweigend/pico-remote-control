<!--
Purpose: Answer common questions about Enterprise headsets, kiosk deployment, streaming, and passthrough.
Context: The repository demonstrates local USB and WebXR control, which is often confused with PICO Business services.
Responsibilities: Separate the available mechanisms, document verified hardware, and describe a supervised ICAROS flow.
Boundaries: This repository does not implement or certify PICO Enterprise SDK, Device Manager, or safety functions.
-->

# Enterprise, kiosk, streaming, and passthrough

This page answers two questions I received while discussing supervised PICO operation:

1. Are the tested headsets Enterprise PICOs, and is this repository using an Enterprise API or
   Kiosk Mode?
2. Can a participant remain in passthrough while getting onto an ICAROS and then have a caretaker
   switch the experience remotely?

## Are the tested headsets Enterprise PICOs?

The device recorded during the original hardware tests was a **PICO 4 Ultra Enterprise**, model
`A9210`. I do not infer the edition of every headset from this repository. Before planning an
Enterprise rollout, verify each physical device through its About screen, purchase record, or PICO
Business enrollment state.

More importantly, the runnable demos do **not** use the PICO Enterprise API:

- `picoctl` uses standard Android Debug Bridge and scrcpy over an authorized USB connection.
- The minimal browser example uses ADB reverse and an Android URL intent.
- The WebXR dashboard uses an application-owned WebSocket protocol.

Those mechanisms can be useful on an Enterprise headset, but they neither require nor prove an
Enterprise entitlement.

PICO documents the PICO 4 Ultra Enterprise as a business device with Enterprise OS, Business Suite,
Business Device Manager, and system customization. The public Enterprise SDK documentation also
warns that individual APIs depend on device model, PICO OS, and TobService version.

Primary sources:

- [PICO 4 Ultra Enterprise](https://business.picoxr.com/us/products/pico4-ultra-enterprise)
- [Enterprise SDK introduction](https://business.picoxr.com/us/doc/EnterpriseAPI-Intro)

## What does remote control mean here?

| Mechanism | What it controls | What it is not |
| --- | --- | --- |
| ADB | Android device commands, installation, launch, shell, and port forwarding | PICO Enterprise API |
| scrcpy | Android display pixels and supported input | PICO Business Streaming |
| Application WebSocket | State inside this WebXR example | General PICO OS administration |
| Business Device Manager | Enrollment, monitoring, configuration, content, wipe, reboot, and Kiosk Mode | The protocol implemented here |
| Enterprise SDK / TobService | Supported native app and system-management integrations | A browser WebSocket API |
| Business Streaming | PC-rendered content streamed to a supported headset | The outbound scrcpy mirror |

I keep these layers separate because they have different permissions, deployment models, and
failure modes.

## Does PICO support Kiosk Mode?

Yes, on supported PICO Business devices. PICO documents assigning an installed application as the
Home screen through Business Device Manager. Business Suite also advertises Kiosk Mode, while the
Enterprise SDK exposes native application-management operations such as setting a launcher and
starting an app on boot.

Kiosk Mode is useful for ensuring that the intended application starts and stays in the foreground.
It does not replace application state synchronization. A clean installation could use Kiosk Mode
for deployment, then use the acknowledged WebSocket protocol demonstrated here for live experience
controls.

This repository does not include a pretend Enterprise API client. A real Enterprise bridge needs
supported hardware, the matching PICO SDK or management service, permissions, and physical-device
validation.

Primary sources:

- [Business Device Manager](https://business.picoxr.com/global/software/business-manager)
- [Device Manager device management](https://business.picoxr.com/us/doc/MDM-device)
- [PICO Business Suite](https://business.picoxr.com/global/software/business-suite)
- [Enterprise service for Unity OpenXR](https://developer.picoxr.com/document/unity-openxr/enterprise_service/)

## Is passthrough unavailable while streaming?

That statement is too broad. PICO Business Streaming 2.2, dated 9 June 2026, officially lists
**Seethrough during streaming** for specific Enterprise device and software combinations. This is a
PICO Business Streaming feature, not a general promise for every PCVR stack.

The public Business Streaming SDK guide documents connection, stream, settings, tracking, battery,
and performance operations, but I did not find a public Seethrough toggle command there. I would not
promise caretaker-controlled streamed passthrough until that exact Business Streaming 2.2 workflow
has been proven with the target headset, firmware, and clients.

Primary sources:

- [PICO Business Streaming 2.1 and 2.2](https://business.picoxr.com/us/doc/43j3qcoq)
- [Business Streaming SDK guide](https://business.picoxr.com/us/doc/BusinessStreamingv2SDK)

## Why passthrough works in the WebXR demo

The WebXR example does not stream PC-rendered XR frames into the headset. The PICO Browser downloads
the local application over USB and the PICO renders it locally. The Mac sends only files, small
commands, state snapshots, and optional outward screen mirroring.

```text
Mac dashboard ── commands ──> PICO Browser ── local WebXR rendering ──> PICO display
              <── status ───                  └── compositor passthrough

PICO display ── optional outbound scrcpy mirror ──> Mac operator window
```

The runtime keeps one `immersive-ar` session alive:

- transparent application pixels leave the physical surroundings visible;
- partially opaque content creates a mixed presentation;
- a fully opaque enclosure creates a VR-style presentation that obscures passthrough.

The dashboard changes application pixels, not WebXR session mode. `alpha-blend` is the required
compositor mode, but visible passthrough and complete opaque coverage still need physical-device
verification.

Primary sources:

- [PICO WebXR overview](https://developer.picoxr.com/document/web/webxr/)
- [PICO Web Apps and passthrough](https://developer.picoxr.com/blog/web/)
- [WebXR Augmented Reality Module](https://www.w3.org/TR/webxr-ar-module-1/)

## Supervised ICAROS operator demo

The existing WebXR dashboard can demonstrate the proposed flow without another code path:

1. Start the local runtime and let the participant select `Enter XR` in the headset.
2. In the dashboard, select `AR · passthrough` and wait until the headset confirms AR.
3. Keep the participant and headset directly supervised while positioning and securing the person
   on the ICAROS.
4. After the installation's normal readiness check, select `VR-style · opaque` and wait for the
   headset-confirmed state before starting the intended content.
5. Return to `AR · passthrough` when visual access to the room is needed again.

The copy-ready runbook is in
[`examples/webxr-dashboard/ICAROS_OPERATOR_DEMO.md`](../examples/webxr-dashboard/ICAROS_OPERATOR_DEMO.md).

## Safety boundary

This is a technical demonstration, not a certified safety controller. Confirmed application state,
telemetry, and mirroring can make operation clearer, but they do not replace direct supervision,
physical ICAROS procedures, local exit mechanisms, or installation-specific risk assessment.

A missing acknowledgement, stale connection, lost tracking state, or unavailable mirror should be
treated as “do not advance,” not as implicit success.
