#!/usr/bin/env bash
# Purpose: Install or remove the global picoctl command on macOS.
# Context: Links the repository-owned CLI into an existing directory on PATH.
# Responsibilities: Validate targets, avoid overwrites, and manage one symlink.
# Boundaries: Does not install Homebrew dependencies or modify shell profiles.

set -euo pipefail

readonly SCRIPT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SOURCE_PATH="${SCRIPT_DIR}/picoctl"
readonly COMMAND_NAME="picoctl"
readonly DEFAULT_INSTALL_DIR="/opt/homebrew/bin"

die() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

install_dir() {
  printf '%s\n' "${PICO_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
}

target_path() {
  printf '%s/%s\n' "$(install_dir)" "$COMMAND_NAME"
}

require_install_dir() {
  local directory
  directory="$(install_dir)"
  [[ -d "$directory" ]] || die "Install directory does not exist: $directory"
  [[ -w "$directory" ]] || die "Install directory is not writable: $directory"
}

install_cli() {
  local target
  local existing_source
  target="$(target_path)"
  require_install_dir

  if [[ -L "$target" ]]; then
    existing_source="$(readlink "$target")"
    [[ "$existing_source" == "$SOURCE_PATH" ]] || die "Refusing to replace symlink: $target"
    printf 'Already installed: %s -> %s\n' "$target" "$SOURCE_PATH"
    return
  fi

  [[ ! -e "$target" ]] || die "Refusing to replace existing path: $target"
  ln -s "$SOURCE_PATH" "$target"
  printf 'Installed: %s -> %s\n' "$target" "$SOURCE_PATH"
  printf 'Run: %s status\n' "$COMMAND_NAME"
}

uninstall_cli() {
  local target
  local existing_source
  target="$(target_path)"
  [[ -L "$target" ]] || die "Managed symlink not found: $target"
  existing_source="$(readlink "$target")"
  [[ "$existing_source" == "$SOURCE_PATH" ]] || die "Refusing to remove unrelated symlink: $target"
  rm "$target"
  printf 'Removed: %s\n' "$target"
}

show_status() {
  local target
  target="$(target_path)"
  if [[ -L "$target" && "$(readlink "$target")" == "$SOURCE_PATH" ]]; then
    printf 'Installed: %s -> %s\n' "$target" "$SOURCE_PATH"
    return
  fi
  printf 'Not installed: %s\n' "$target"
}

print_help() {
  cat <<'EOF'
Usage: ./install.sh [install|uninstall|status|help]

Commands:
  install     Create the global picoctl symlink (default)
  uninstall   Remove only the symlink managed by this repository
  status      Show whether the managed symlink is installed
  help        Show this help

Set PICO_INSTALL_DIR to use another existing writable PATH directory.
EOF
}

main() {
  [[ -x "$SOURCE_PATH" ]] || die "CLI is missing or not executable: $SOURCE_PATH"
  case "${1:-install}" in
    install) install_cli ;;
    uninstall) uninstall_cli ;;
    status) show_status ;;
    help | --help | -h) print_help ;;
    *) print_help; die "Unknown command: $1" ;;
  esac
}

main "$@"
