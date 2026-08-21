<!-- Purpose: Explain guarded global installation and removal of the picoctl symlink. -->

# Global installation

I use a symlink so the repository remains the only maintained copy of the CLI.
From the repository root:

```bash
./tools/picoctl/install.sh install
picoctl status
```

The default target is `/opt/homebrew/bin/picoctl`. The installer requires an
existing writable directory and refuses to replace a regular file or unrelated
symlink. The name avoids the unrelated `/usr/bin/pico` command included with
macOS.

## Custom PATH directory

Choose another existing writable directory when needed:

```bash
PICO_INSTALL_DIR="$HOME/.local/bin" ./tools/picoctl/install.sh install
```

Use the same value for `status` and `uninstall`.

## Inspect and remove

```bash
./tools/picoctl/install.sh status
./tools/picoctl/install.sh uninstall
```

The uninstaller removes only a symlink pointing to this repository's
`tools/picoctl/picoctl` file. It does not remove captures or dependencies.
Moving the repository breaks the symlink, so uninstall before relocating it.

## Migrating an older installation

An older standalone checkout may already own `/opt/homebrew/bin/picoctl`. This installer refuses to
replace that symlink because it cannot assume ownership. Uninstall it from the old checkout first,
then install this repository-owned command:

```bash
/path/to/old/pico-control/install.sh uninstall
./tools/picoctl/install.sh install
```

Inspect the target with `readlink /opt/homebrew/bin/picoctl` before changing it. Never delete or
replace a path whose owner you have not identified.
