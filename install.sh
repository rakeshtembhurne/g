#!/usr/bin/env bash
#
# Installer for `g` — ask Google AI Mode from your terminal.
# https://github.com/rakeshtembhurne/g
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_NAME="g"
INSTALL_DIR="${G_INSTALL_DIR:-$HOME/.local/bin}"
ZSH_RC="${ZDOTDIR:-$HOME}/.zshrc"
MODE="symlink"
WITH_HISTORY=0
HISTORY_MARKER="# >>> g history suppression >>>"

usage() {
  cat <<'EOF'
Install `g` into your PATH.

Usage: ./install.sh [options]

Options:
  --copy              Copy the script instead of symlinking it
  --dir <path>        Install into <path>                (default: ~/.local/bin)
  --zsh-history       Append zsh-history.zsh to your .zshrc
  --zsh-rc <file>     Shell config used by --zsh-history (default: ~/.zshrc)
  -h, --help          Show this help

Environment:
  G_INSTALL_DIR       Same as --dir
EOF
}

fail() {
  echo "✗ $*" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --copy)        MODE="copy"; shift ;;
    --dir)         INSTALL_DIR="${2:?--dir requires a path}"; shift 2 ;;
    --zsh-history) WITH_HISTORY=1; shift ;;
    --zsh-rc)      ZSH_RC="${2:?--zsh-rc requires a path}"; shift 2 ;;
    -h|--help)     usage; exit 0 ;;
    *)             echo "unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

# --- checks ----------------------------------------------------------------
[ "$(uname -s)" = "Darwin" ] \
  || fail "g is macOS-only (it drives Safari/Brave through AppleScript)."
command -v bun >/dev/null 2>&1 \
  || fail "Bun is required. Install it:  curl -fsSL https://bun.sh/install | bash"
command -v osascript >/dev/null 2>&1 \
  || fail "osascript not found on this system."

SRC="$REPO_DIR/g.ts"
[ -f "$SRC" ] || fail "$SRC not found — run this script from inside the repo."

# --- install ---------------------------------------------------------------
mkdir -p "$INSTALL_DIR"
chmod +x "$SRC"

TARGET="$INSTALL_DIR/$BIN_NAME"
if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
  BACKUP="$TARGET.bak.$(date +%Y%m%d%H%M%S)"
  mv "$TARGET" "$BACKUP"
  echo "• backed up existing $TARGET → $BACKUP"
fi

if [ "$MODE" = "copy" ]; then
  cp "$SRC" "$TARGET"
  chmod +x "$TARGET"
  echo "• copied $SRC → $TARGET"
else
  ln -s "$SRC" "$TARGET"
  echo "• symlinked $TARGET → $SRC"
fi
echo "✓ installed: $TARGET"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *) echo "⚠ $INSTALL_DIR is not on your PATH. Add this to your shell config:"
     echo "    export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
esac

# --- optional: keep g out of shell history ---------------------------------
if [ "$WITH_HISTORY" = "1" ]; then
  if [ -f "$ZSH_RC" ] && grep -qF "$HISTORY_MARKER" "$ZSH_RC"; then
    echo "• history suppression already present in $ZSH_RC"
  else
    if [ -f "$ZSH_RC" ]; then
      cp "$ZSH_RC" "$ZSH_RC.bak.$(date +%Y%m%d%H%M%S)"
    fi
    {
      printf '\n%s\n' "$HISTORY_MARKER"
      cat "$REPO_DIR/zsh-history.zsh"
      printf '# <<< g history suppression <<<\n'
    } >> "$ZSH_RC"
    echo "✓ appended history suppression to $ZSH_RC (open a new terminal to apply)"
  fi
fi
