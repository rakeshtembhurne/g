# Keep `g ...` out of shell history.
#
# Source this from your ~/.zshrc, or let `./install.sh --zsh-history` append it.
#
# `zshaddhistory` is a special zsh hook: returning non-zero tells zsh not to save
# the line. If you already define your own `zshaddhistory`, merge the `case` below
# into it rather than sourcing this file, so you don't clobber your version.
zshaddhistory() {
  local cmd="${1%%$'\n'}"
  case "$cmd" in
    g|g\ *|google_ai_search|google_ai_search\ *) return 1 ;;
  esac
  return 0
}
