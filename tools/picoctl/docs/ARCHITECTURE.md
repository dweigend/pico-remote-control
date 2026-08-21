<!-- Purpose: Record picoctl architecture, trust boundaries, and deliberate limitations. -->

# Architecture and security

Here I use mature Android tools instead of inventing another control protocol:

```text
macOS terminal
    |
    +-- picoctl -------- target selection and conservative defaults
            |
            +-- adb ---- authentication, shell, APKs, screenshots, lifecycle
            |
            +-- scrcpy - display video and mouse/keyboard input
```

The CLI has no daemon, account credentials, Android companion app, custom
transport, or background service. Every operation finishes or hands control to
an interactive ADB or scrcpy process.

## Responsibilities

`picoctl` is responsible for:

- requiring the needed host commands;
- selecting one authorized physical USB device;
- rejecting explicit and automatically discovered network transports;
- applying conservative scrcpy limits;
- waking a display reported as asleep before mirroring;
- deriving a left-eye crop from the physical display size.

ADB remains responsible for Android host authorization. scrcpy remains
responsible for capture, encoding, rendering, and input forwarding.

## Trust boundary

USB debugging gives the approved Mac broad access to the headset. Only approve
trusted hosts, and disable USB debugging when it is no longer needed. The tool
stores no credentials and never enables ADB-over-TCP.

Screenshots and recordings can contain private visual information. Review them
before sharing. Their default `captures/` directory is relative to the current
working directory.

## Known limitations

- PICO spatial UI does not always interpret pointer input like a phone screen.
- Secure Android surfaces may appear black in captures.
- The eye crop assumes two eye images arranged side by side.
- Enterprise policy may block activities, APK installation, or input events.
- A data-capable USB-C cable must remain connected.

New commands should remain thin wrappers around supported ADB or scrcpy
features. A GUI, cloud service, or companion app belongs in a separate layer.
