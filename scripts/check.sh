#!/usr/bin/env bash
# Purpose: Run every repository check that does not require a physical PICO headset.
# Context: The repository contains one Bash tool and two independent Bun examples.
# Responsibilities: Validate syntax, dependency locks, types, tests, and production builds.
# Boundaries: Does not claim WebXR, ADB, scrcpy, performance, or comfort acceptance on hardware.

set -euo pipefail

readonly REPOSITORY_ROOT="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly PICOCTL_ROOT="${REPOSITORY_ROOT}/tools/picoctl"
readonly MINIMAL_EXAMPLE_ROOT="${REPOSITORY_ROOT}/examples/adb-reverse-minimal"
readonly WEBXR_EXAMPLE_ROOT="${REPOSITORY_ROOT}/examples/webxr-dashboard"
readonly CHECK_OUTPUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pico-remote-control-check.XXXXXX")"

trap 'rm -rf "${CHECK_OUTPUT_DIR}"' EXIT

printf 'Checking picoctl...\n'
bash -n "${PICOCTL_ROOT}/picoctl"
bash -n "${PICOCTL_ROOT}/install.sh"
"${PICOCTL_ROOT}/picoctl" --help >/dev/null

printf 'Checking the minimal ADB reverse example...\n'
bun build "${MINIMAL_EXAMPLE_ROOT}/server.ts" --target=bun --outdir="${CHECK_OUTPUT_DIR}" >/dev/null

printf 'Checking the WebXR dashboard example...\n'
bun --cwd="${WEBXR_EXAMPLE_ROOT}" install --frozen-lockfile
bun --cwd="${WEBXR_EXAMPLE_ROOT}" run lint
bun --cwd="${WEBXR_EXAMPLE_ROOT}" run typecheck
bun --cwd="${WEBXR_EXAMPLE_ROOT}" test
bun --cwd="${WEBXR_EXAMPLE_ROOT}" run build

printf 'All non-hardware checks passed.\n'
