<!--
Purpose: Guide readers through the shared Mac and PICO setup used by all examples.
Context: Every workflow in this repository uses an authorized USB-C ADB connection.
Responsibilities: Cover host tools, headset authorization, first checks, and security implications.
Boundaries: Example-specific startup commands remain in each example README.
-->

# Setup

I use a data-capable USB-C cable and Android Debug Bridge as the common foundation for every demo in
this repository. Wi-Fi is not required and is not used as an automatic fallback.

## Mac requirements

- macOS on Apple Silicon or Intel
- [Bun](https://bun.com/docs/installation) for the browser examples
- [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools) for ADB
- [scrcpy](https://github.com/Genymobile/scrcpy) 3.2 or newer for mirroring and PICO 4 Ultra support

With Homebrew:

```bash
brew install oven-sh/bun/bun
brew install --cask android-platform-tools
brew install scrcpy
```

Check the installed tools:

```bash
bun --version
adb version
scrcpy --version
```

The WebXR example declares Bun 1.3.14 as its package-manager reference and CI pins that version.
The current Homebrew release is supported when it satisfies the declared `>=1.3.14` engine; the
frozen lockfile pins dependencies, not the locally installed Bun executable.

## PICO setup

1. Enable Developer options and USB debugging on the headset.
2. Connect the headset directly with a data-capable cable.
3. Wake and unlock it.
4. Accept the Mac's USB debugging fingerprint inside the headset.
5. Check the connection:

   ```bash
   adb devices -l
   ```

The selected row must report `device`. `unauthorized` means the confirmation is still waiting in
the headset; `offline` usually means the cable or ADB connection needs to be re-established.

## Security boundary

ADB authorization gives the Mac broad access to the Android-based headset, including application
installation and shell commands. Only approve trusted computers. Disable USB debugging when you no
longer need this workflow.

Screenshots and recordings may contain private visual information. The CLI stores default captures
below an ignored `captures/` directory, but you should still review every file before sharing it.
