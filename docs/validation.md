<!--
Purpose: Record reproducible repository checks and keep hardware claims tied to dated evidence.
Context: Desktop automation can verify code but cannot prove PICO-specific WebXR behavior.
Responsibilities: Separate current automated checks, historical device evidence, and open hardware gates.
Boundaries: This file is evidence for named revisions and devices, not a general compatibility guarantee.
-->

# Validation

## Automated repository checks

From the repository root:

```bash
./scripts/check.sh
```

The script checks Bash syntax and CLI help, builds the minimal transport server, installs the locked
WebXR dependencies, runs Biome, performs strict TypeScript checking, runs the Bun tests, and creates
the production build.

GitHub Actions runs the same script on every push and pull request.

## Recorded hardware evidence

The source projects were tested on 2026-08-11 with:

- PICO 4 Ultra Enterprise, model A9210;
- Android 14 and PICO OS 5.11.2;
- PICO Browser 3.3.44;
- Android Platform Tools 37.0.1;
- scrcpy 4.1;
- an authorized USB-C ADB connection.

Those checks demonstrated USB device selection, full-display and one-eye scrcpy streams, a
4320x2160 screenshot, ADB reverse access to a Mac-hosted page, and live switching among the three
demo worlds while one `alpha-blend` WebXR session remained active.

This is dated evidence, not a promise that every PICO model, OS, browser, cable, or enterprise
policy behaves the same way.

## Hardware checks still required for a release claim

- Confirm transparent passthrough and the fully opaque enclosure visually.
- Confirm the corrected world restart and transition on the current build.
- Compare headset frame timing with the dashboard mirror off and on.
- Run repeated world switches and restarts while checking renderer resource counts.
- Disconnect and reconnect USB while the page and XR session remain alive.
- Run the planned two-hour soak test.
- Verify the exact headset edition, PICO OS, browser, and any Business Suite, Device Manager,
  Enterprise SDK, or Business Streaming versions before making Enterprise deployment claims.
- Rehearse the supervised passthrough-first ICAROS operator flow with the installation's physical
  safety procedures and stop conditions.

I keep these checks explicit because desktop mocks, unit tests, and a successful bundle cannot
replace the physical headset for WebXR capability, comfort, thermal, and recovery behavior.

## Manual acceptance protocol

I preserve the measurable gates from the original prototype plan:

- After one warm-up cycle, run 50 world switches and restarts. Geometry and texture counts must
  return to the baseline, and shader program counts must stop growing after warm-up.
- Use 72 Hz as the first device baseline. At least 95% of frame intervals must remain below 1.5
  times the 72 Hz target interval.
- Mirror-on P95 frame time may be at most 20% worse than mirror-off P95 frame time.
- The mirror must show the correct world and orientation continuously for 30 seconds without black
  frames.
- During the cable test, disconnect and reconnect USB while the page, XR session, and active world
  stay alive. The reverse mapping, WebSocket, and complete state snapshot must recover without a
  second browser-open intent.
- During the two-hour soak, change world or presentation every minute, restart the active world
  every ten minutes, and record frame and resource snapshots every five minutes. The run passes
  only with no session loss, unhandled error, or monotonically growing resource count.

These thresholds are an acceptance procedure, not a completed result. Record device, browser,
firmware, cable, mirror, and build revision beside every run.
