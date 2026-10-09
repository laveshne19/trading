#!/usr/bin/env bash
# Install the growwapi Node SDK into a project and patch it so Node can load it.
#
#   install-growwapi.sh [project-dir] [--local <path-to-growwapi-source>]
#
# Without --local the package comes from npm. With --local it is installed from
# a local checkout or extracted archive, which is what you want for a version
# npm does not have yet.
#
# Steps: npm install -> mark the package ESM -> rewrite extensionless import
# specifiers -> run the smoke test. Idempotent; safe to re-run after any
# npm install that may have restored the broken files.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="${1:-$PWD}"
LOCAL_SRC=""

shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --local) LOCAL_SRC="${2:?--local needs a path}"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

command -v node >/dev/null || { echo "node is required" >&2; exit 1; }
command -v npm  >/dev/null || { echo "npm is required" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 is required (for fix-esm.py)" >&2; exit 1; }

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "node >= 18 required (found $(node -v)); the SDK uses global fetch" >&2
  exit 1
fi

mkdir -p "$PROJECT"
cd "$PROJECT"
echo "==> project: $PROJECT"

# The SDK is ESM-only, so the consuming project must be ESM too.
if [ ! -f package.json ]; then
  echo "==> no package.json; creating an ESM one"
  npm init -y >/dev/null
fi
node -e '
  const fs = require("fs");
  const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
  if (p.type !== "module") {
    p.type = "module";
    fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");
    console.log("==> set \"type\": \"module\" on the project (the SDK is ESM-only)");
  }
'

echo "==> installing growwapi"
if [ -n "$LOCAL_SRC" ]; then
  LOCAL_ABS="$(cd "$LOCAL_SRC" && pwd)"
  # Installing straight from a path makes npm run the package's own `prepare`
  # (-> `npm run build` -> tsc) WITHOUT first installing its devDependencies.
  # tsc then resolves to whatever is on PATH, and any TypeScript newer than 5.x
  # hard-errors on this package's deprecated moduleResolution:
  #   tsconfig.json(5,25): error TS5107: Option 'moduleResolution=node10' is
  #   deprecated and will stop functioning in TypeScript 7.0.
  # So build it in place against its own pinned TypeScript (5.8.3), then pack
  # and install the tarball - the same shape npm publishes.
  echo "    building from source with its pinned toolchain"
  ( cd "$LOCAL_ABS" && npm install --no-audit --no-fund --ignore-scripts >/dev/null )
  if [ -x "$LOCAL_ABS/node_modules/.bin/tsc" ]; then
    TSC="$LOCAL_ABS/node_modules/.bin/tsc"
  else
    echo "    pinned tsc missing; falling back to PATH tsc with ignoreDeprecations" >&2
    TSC="npx tsc"
    node -e '
      const fs = require("fs"), f = process.argv[1] + "/tsconfig.json";
      const c = JSON.parse(fs.readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, ""));
      c.compilerOptions.ignoreDeprecations = "6.0";
      fs.writeFileSync(f, JSON.stringify(c, null, 2) + "\n");
    ' "$LOCAL_ABS"
  fi
  ( cd "$LOCAL_ABS" && rm -rf dist && $TSC \
      && mkdir -p dist/utils/Protobuffer \
      && cp -r src/utils/Protobuffer/protos dist/utils/Protobuffer/ )

  TARBALL_DIR="$(mktemp -d)"
  trap 'rm -rf "$TARBALL_DIR"' EXIT
  ( cd "$LOCAL_ABS" && npm pack --ignore-scripts --pack-destination "$TARBALL_DIR" >/dev/null )
  TARBALL="$(find "$TARBALL_DIR" -name '*.tgz' | head -1)"
  [ -n "$TARBALL" ] || { echo "npm pack produced no tarball" >&2; exit 1; }
  echo "    installing $(basename "$TARBALL")"
  npm install "$TARBALL" --no-audit --no-fund --ignore-scripts
else
  npm install growwapi --no-audit --no-fund
fi

PKG="$PROJECT/node_modules/growwapi"
[ -d "$PKG" ] || { echo "growwapi did not install at $PKG" >&2; exit 1; }

# The published tarball ships only dist/. If dist/ is absent (installing from a
# source checkout that skipped prepare), build it.
if [ ! -f "$PKG/dist/index.js" ]; then
  echo "==> dist/ missing; building from source"
  ( cd "$PKG" && npm install --no-audit --no-fund && npx tsc \
      && cp -r src/utils/Protobuffer/protos dist/utils/Protobuffer/ )
fi

echo "==> patching package metadata"
node -e '
  const fs = require("fs"), path = process.argv[1] + "/package.json";
  const p = JSON.parse(fs.readFileSync(path, "utf8"));
  const before = JSON.stringify([p.type, p.module]);
  p.type = "module";                 // dist is ESM; without this Node reads it as CJS
  p.module = "dist/index.js";        // the advertised dist/index.mjs is never built
  if (JSON.stringify([p.type, p.module]) !== before) {
    fs.writeFileSync(path, JSON.stringify(p, null, 2) + "\n");
    console.log("    type=module, module=dist/index.js");
  } else {
    console.log("    already patched");
  }
' "$PKG"

echo "==> rewriting import specifiers"
python3 "$SKILL_DIR/fix-esm.py" "$PKG/dist" "$PROJECT/node_modules"

# protobuf descriptors live outside dist in some builds; the live feed needs them
if [ -d "$PKG/src/utils/Protobuffer/protos" ] && [ ! -d "$PKG/dist/utils/Protobuffer/protos" ]; then
  echo "==> copying protobuf descriptors into dist"
  mkdir -p "$PKG/dist/utils/Protobuffer"
  cp -r "$PKG/src/utils/Protobuffer/protos" "$PKG/dist/utils/Protobuffer/"
fi

if [ ! -f .env ] && [ ! -f .env.local ]; then
  cat > .env.example <<'ENVEOF'
# Groww API credentials. GROWW_API_SECRET is the base32 TOTP seed, not a
# password - the SDK derives a 6-digit code from it and mints the access token
# itself, so there is no daily token to paste by hand.
# Keep this file out of git. Never paste these values into a chat.
GROWW_API_KEY=
GROWW_API_SECRET=
ENVEOF
  echo "==> wrote .env.example (fill it in as .env; add .env to .gitignore)"
fi

echo "==> verifying"
node "$SKILL_DIR/smoke-test.mjs" "$PROJECT"

cat <<'DONEEOF'

Installed. In your code:

  import { GrowwAPI, Exchange, Segment, Product, OrderType,
           TransactionType, Validity } from 'growwapi';
  const groww = new GrowwAPI();

Re-run this script after any `npm install` that reinstalls growwapi - npm will
restore the unpatched files.

Reminder: this SDK has no sandbox. Every orders.create() is real money.
DONEEOF
