#!/usr/bin/env bash
# Install the vendored Indian trading skills into the user-level Claude skills
# directory so they are available in every project, not just this repo.
#
#   ./scripts/install-indian-trading-skills.sh            # install skills only
#   ./scripts/install-indian-trading-skills.sh --with-deps # also pip install the
#                                                          # Python packages the
#                                                          # skill scripts import
#
# Source: https://github.com/ajeeshworkspace/indian-trading-skills

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/.claude/skills"
DEST="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
WITH_DEPS=0

for arg in "$@"; do
  case "$arg" in
    --with-deps) WITH_DEPS=1 ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ ! -d "$SRC" ]; then
  echo "error: $SRC not found" >&2
  exit 1
fi

mkdir -p "$DEST"

for skill_dir in "$SRC"/*/; do
  [ -f "$skill_dir/SKILL.md" ] || continue
  name="$(basename "$skill_dir")"
  rm -rf "${DEST:?}/$name"
  cp -r "$skill_dir" "$DEST/$name"
  echo "installed $name -> $DEST/$name"
done

if [ "$WITH_DEPS" -eq 1 ]; then
  echo
  echo "installing Python dependencies..."
  python3 -m pip install \
    "pyyaml>=6.0" \
    "scipy>=1.13.1" \
    "yfinance>=0.2.36" \
    "pandas>=2.0" \
    "niftystocks>=0.0.2"
fi

echo
echo "Done. Restart Claude Code to pick up newly installed skills."
