<!--
Purpose: Explain the smallest PICO Browser transport demo in this repository.
Context: A Bun server on macOS is exposed to one USB-connected headset through ADB reverse.
Responsibilities: Document startup, browser launch, expected results, limits, and troubleshooting.
Boundaries: This example proves transport and bootstrap only; it does not enter or control WebXR.
-->

# Minimal ADB reverse demo

I use this example to show the smallest useful USB connection between a development server on a
Mac and PICO Browser. It deliberately contains no WebSocket protocol, Three.js scene, dashboard,
or XR lifecycle code.

What this proves:

```text
Bun on macOS :39081 <- USB / ADB reverse <- PICO Browser 127.0.0.1:39081
```

It proves transport and browser bootstrap. It does **not** remotely enter XR, accept the WebXR
permission prompt, or control application state. The user still has to confirm WebXR inside the
headset. See the full `webxr-dashboard` example for application-level remote control.

## Requirements

- macOS with [Bun](https://bun.com/docs/installation) installed
- Android Platform Tools with `adb` available on your `PATH`
- A USB data cable
- A PICO headset with Developer Mode and USB debugging enabled

## Run it

From this directory, start the host server:

```sh
bun run server.ts
```

In another terminal, wait for the headset and create the reverse port mapping:

```sh
adb wait-for-device
adb reverse tcp:39081 tcp:39081
adb reverse --list
```

Then open this URL in PICO Browser:

```text
http://127.0.0.1:39081/
```

You should see **USB transport works**. On the Mac, the same page is available at
`http://127.0.0.1:39081/` and the health endpoint at `http://127.0.0.1:39081/health`.

## Optional browser launch

You can ask Android to open the URL, but PICO OS decides which compatible browser activity handles
the intent:

```sh
adb shell am start -a android.intent.action.VIEW -d http://127.0.0.1:39081/
```

This launches a normal web page. It still cannot bypass the headset interaction required to enter
an immersive WebXR session.

## Why loopback works

`adb reverse` makes a TCP port on the headset forward to a TCP port on the USB-connected Mac. The
PICO Browser therefore requests `127.0.0.1:39081`, while Bun listens only on the Mac loopback
address. The server is not exposed to the local network.

Loopback origins are potentially trustworthy secure contexts. An arbitrary HTTP LAN address is not
an equivalent replacement for WebXR development.

The mapping belongs to the current ADB connection. Reconnect the cable, reboot the headset, or
restart the ADB server and you may need to run the `adb reverse` commands again.

## Troubleshooting

Check the device state:

```sh
adb devices -l
```

- `unauthorized`: accept the USB debugging prompt inside the headset.
- no device: use a data-capable cable and reconnect USB.
- page unavailable: confirm the Bun process is running and `adb reverse --list` includes port
  `39081`.
- port already in use: stop the other process using port `39081`; this minimal example intentionally
  uses one fixed port so its documentation and forwarding command stay identical.

Stop the Bun server with <kbd>Control</kbd>+<kbd>C</kbd>.
