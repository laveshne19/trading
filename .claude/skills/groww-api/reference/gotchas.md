# growwapi sharp edges

Verified against v1.1.3 by building and loading the package.

## 1. The package does not import as published (blocking)

`npm install growwapi` then `import { GrowwAPI } from 'growwapi'` fails:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../dist/config'
imported from .../dist/index.js
```

Three separate faults compound:

1. **`main` is ESM but the package is not.** `tsconfig.json` sets
   `"module": "ESNext"` and emits to `dist/*.js`, while `package.json` has no
   `"type": "module"`. Node therefore reads `dist/index.js` as CommonJS and
   chokes on `import`.
2. **`module: "dist/index.mjs"` points at a file that is never built.** The
   `build:esm` script runs `tsc -p tsconfig.esm.json`, whose `outDir` is also
   `dist` with `.js` extensions — it just overwrites the first build. No `.mjs`
   is produced anywhere.
3. **Extensionless specifiers.** `tsc` does not add extensions, so output keeps
   `from './config'`. Node's ESM resolver requires `./config.js`.

**Fix:** `scripts/install-growwapi.sh`. It sets `"type": "module"`, repoints
`module` at `dist/index.js`, and rewrites specifiers.

**Do not try to compile to CommonJS.** It fails — `src/utils/Protobuffer/protobuffer.ts`
uses `import.meta` and three top-level `await`s, which CommonJS cannot express:

```
TS1343: 'import.meta' is only allowed when 'module' is es2020/esnext/node16/...
TS1378: Top-level 'await' is only allowed when 'module' is es2022/esnext/...
```

The SDK is ESM-only by design. Your consuming project must be ESM too.

## 2. The specifier rewrite has two cases, and the naive version breaks

Appending `.js` to everything, or `/index.js` to every directory, produces:

```
ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './index.js' is not defined
by "exports" in node_modules/camelcase-keys/package.json
```

The rule that actually works:

- **relative specifier → file exists at `<spec>.js`** → append `.js`
- **relative specifier → directory with an `index.js`** → append `/index.js`
- **bare subpath** (`dayjs/plugin/customParseFormat`) → append `.js` only if
  that exact file exists
- **bare package root** (`camelcase-keys`, `otpauth`, `dayjs`) → leave alone;
  its own `exports` map resolves it, and touching it breaks resolution

`scripts/fix-esm.py` implements exactly this. It rewrote 102 specifiers across
17 files in a clean v1.1.3 build.

## 3. `BaseParams` defeats type checking

Every params interface extends `BaseParams { [key: string]: unknown }`. A
misspelled field compiles fine and is silently sent to the API. There is no
compile-time protection on any call — validate inputs yourself.

## 4. `groww.position`, not `groww.positions`

The class is `Positions`, the README section is "Positions", but the property on
`GrowwAPI` is singular. Every other resource is plural or a noun matching its
class.

## 5. `Validity` has exactly one value

`Validity.Day = 'DAY'`. No IOC, no GTT, no GTC. Anything needing
good-till-cancelled has to be re-placed by your own scheduler each day.

## 6. Order params that are conditionally required

`price` and `triggerPrice` are both optional in the type, but:

- `LIMIT` needs `price`
- `SL` and `SL_M` need `triggerPrice`
- `MARKET` ignores `price`

Nothing enforces this client-side; a missing field surfaces as an API
rejection at order time.

## 7. Live feed fails silently after its retry budget

`GROWW_LIVE_FEED_MAX_RETRY_COUNT` (10) and
`GROWW_LIVE_FEED_MAX_RETRY_DURATION` (30 s) bound reconnection. Past that the
feed stays down with no throw. A bot that infers "no ticks = quiet market" will
sit on open positions through a move. Track last-tick time and alarm on
staleness.

## 8. There is no sandbox

No test endpoint, no paper mode. `GROWW_API_BASE_URL` is overridable but there
is nothing official to point it at. Every `orders.create` is real money. Gate
it behind your own dry-run flag.

## 9. Only one test ships with the package

`npm test` runs a single Jest spec, `tests/check-types.test.ts`, which checks
that the generated type-export index matches the committed one. It passes, but
it exercises no API behaviour, no auth, and no order logic. A green `npm test`
says nothing about whether the SDK works.

## 10. Egress

The SDK talks to `api.groww.in`, `socket-api.groww.in` and
`growwapi-assets.groww.in`. All three must be reachable. In a sandboxed or
proxied environment they are commonly blocked (`CONNECT tunnel failed, 403`),
which looks exactly like an auth failure — check reachability before debugging
credentials.
