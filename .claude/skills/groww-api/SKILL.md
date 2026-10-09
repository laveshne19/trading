---
name: groww-api
description: Use the growwapi Node.js SDK to place, modify and cancel real orders on a Groww trading account, read holdings/positions/margins, pull historic candles, and stream live prices and order updates over websocket. Use when the user wants to automate Groww trading, build a Groww trading bot, place orders programmatically on NSE/BSE, handle the Groww daily access-token/TOTP refresh, or asks why growwapi fails to import or authenticate.
---

# Groww API (growwapi Node.js SDK)

Community SDK for Groww's trading APIs. Author: Nithin S and Kokila K N.
License Apache-2.0. Repo `NithinSGowda/growwapi`. Documented here against
**v1.1.3**, read from source.

**This SDK places real orders with real money.** There is no sandbox or paper
mode — see "Safety" below before writing anything that calls `orders.create`.

## Read this first: the package does not import as shipped

v1.1.3 cannot be loaded by Node straight from npm. Both entry points are broken:

| `package.json` field | Points at | Actual state |
|---|---|---|
| `main` | `dist/index.js` | ESM syntax, but no `"type": "module"` in the package |
| `module` | `dist/index.mjs` | **never produced** — `build:esm` writes `.js` into the same `dist/` |

On top of that, `tsc` emits extensionless relative specifiers (`from './config'`),
which Node's ESM resolver rejects outright. So `require('growwapi')` and
`import 'growwapi'` both fail with `ERR_MODULE_NOT_FOUND`.

The source itself is fine — it is genuinely ESM-only by design
(`src/utils/Protobuffer/protobuffer.ts` uses `import.meta` and top-level
`await`, so it cannot be compiled to CommonJS). Only the packaging is wrong.

**Fix it with the bundled installer**, which installs, builds, patches and
verifies in one step:

```bash
# user-level install (available in every project)
bash ~/.claude/skills/groww-api/scripts/install-growwapi.sh /path/to/project
# or, from a repo that vendors this skill
bash .claude/skills/groww-api/scripts/install-growwapi.sh /path/to/project
```

Installing from a local checkout or an extracted archive instead of npm:

```bash
bash .../scripts/install-growwapi.sh /path/to/project --local /path/to/growwapi-source
```

It (1) `npm install`s the package, (2) sets `"type": "module"`, (3) rewrites every
extensionless specifier to an explicit `.js` / `/index.js`, and (4) runs a
25-check smoke test. Do not hand-patch; the rewrite has two cases that are easy
to get wrong — a bare package *root* like `camelcase-keys` must be left alone
(its `exports` map forbids `/index.js`), while a bare *subpath* like
`dayjs/plugin/customParseFormat` does need `.js` appended.

Your project must also be ESM: `"type": "module"` in its own `package.json`,
and `import` rather than `require`.

## Credentials and the daily token

Two environment variables, both required — the constructor throws if either is
missing:

```env
GROWW_API_KEY=<api key from Groww>
GROWW_API_SECRET=<base32 TOTP secret from Groww>
```

`GROWW_API_SECRET` is **not** a password. It is the base32 seed of a TOTP
authenticator. `Auth.generateTOTP()` builds a 6-digit SHA1/30s code from it and
POSTs it to `https://api.groww.in/v1/token/api/access` with the API key as a
Bearer token; the response is `{token, expiry}`.

**This removes the manual daily-token step.** `Auth.getAccessToken()` caches the
token, checks `expiry` before each use, and re-mints it on its own. It also
de-duplicates concurrent requests through a single in-flight promise, so a bot
firing several calls at once mints one token, not five. Nothing needs to be
pasted in by hand each morning — set the two variables once.

Optional overrides: `GROWW_API_BASE_URL`, `GROWW_API_VERSION`,
`GROWW_FILECACHE_TTL` (default 24 h), `GROWW_LIVE_FEED_MAX_RETRY_COUNT`
(default 10), `GROWW_LIVE_FEED_MAX_RETRY_DURATION` (default 30 s).

Never commit the secret, never print it in logs, and never paste it into a
chat. Treat it exactly like a password — it mints trading sessions.

## Shape of the client

```javascript
import { GrowwAPI, Exchange, Segment, Product, OrderType,
         TransactionType, Validity } from 'growwapi';

const groww = new GrowwAPI();   // reads the env vars; throws if absent
```

Nine resources hang off the instance. Note the inconsistency: it is
`groww.position` (singular), not `positions`.

| Resource | Methods |
|---|---|
| `orders` | `create` `modify` `cancel` `status` `statusByReference` `getOrders` `details` `getTrades` |
| `holdings` | `list()` |
| `position` | `user(params)` `tradingSymbol(params)` |
| `margins` | `details()` `requiredForOrder(params)` |
| `liveData` | `getQuote` `getLTP` `getOHLC` |
| `historicData` | `get(params)` |
| `instructions` | `getInstructions()` `getFilteredInstructions(params)` |
| `liveFeed` | `connect()` `subscribe(type, exchangeToken?)` `disconnect()` |
| `auth` | token handling, normally automatic |

Full signatures and parameter shapes: `reference/api.md`.

## Enums — the complete set

These are narrow, and passing a raw string that is not in the enum is the most
common source of rejected orders.

```
Exchange          NSE | BSE
Segment           CASH | FNO
Product           CNC | MIS | NRML
OrderType         LIMIT | MARKET | SL | SL_M
TransactionType   BUY | SELL
Validity          DAY            ← the only value; no IOC
InstrumentType    EQ | FUT | CE | PE | IDX
```

TypeScript member names differ in case from their values: `OrderType.SlM` is
`'SL_M'`, `OrderType.Limit` is `'LIMIT'`, `TransactionType.Buy` is `'BUY'`.

## Placing an order

```javascript
const order = await groww.orders.create({
  tradingSymbol: 'RELIANCE',
  quantity: 1,
  price: 2800,            // required for LIMIT; ignored for MARKET
  triggerPrice: 0,        // required for SL / SL_M
  validity: Validity.Day,
  exchange: Exchange.NSE,
  segment: Segment.CASH,
  product: Product.CNC,
  orderType: OrderType.Limit,
  transactionType: TransactionType.Buy,
  orderReferenceId: 'bot-0001',   // optional; your own idempotency handle
});
```

Set `orderReferenceId` on every order you place from a bot. It is the only way
to ask "did this order of mine actually land?" after a timeout or crash, via
`orders.statusByReference({ orderReferenceId, segment })`. Without it, a
network error mid-request leaves you unable to tell a failed order from a
filled one — and retrying blindly double-fills.

Params are camelCase in JS and converted to snake_case on the wire by
`snakecase-keys`; responses come back camelCase via `camelcase-keys`.

## Live feed

Websocket, protobuf-encoded. Subscription types:
`Price`, `Index`, `MarketDepth`, `FnoOrderUpdates`, `FnoPositionUpdates`,
`EquityOrderUpdates`.

```javascript
await groww.liveFeed.connect();
const price = await groww.liveFeed.subscribe(LiveFeedSubscriptionType.Price, 2885);
price?.consume(data => console.log(data));
const idx = await groww.liveFeed.subscribe(LiveFeedSubscriptionType.Index, 'NIFTY');
// later
price?.unsubscribe();
groww.liveFeed.disconnect();
```

`Price` and `MarketDepth` take a numeric `exchangeToken`; `Index` takes a name
like `'NIFTY'`. Resolve a symbol to its `exchangeToken` through
`instructions.getFilteredInstructions({ exchangeToken })` or by searching the
instrument CSV (`https://growwapi-assets.groww.in/instruments/instrument.csv`,
cached locally for 24 h).

`subscribe()` returns `Subscription | undefined` — always use `?.` on the
result, as the examples do. The order-update channels are what a bot should
react to; do not poll `orders.status` in a loop when a stream will tell you.

## Safety

There is no sandbox, test mode or paper-trading endpoint in this SDK. Every
`orders.create` hits the live account. `GROWW_API_BASE_URL` is overridable but
Groww publishes no mock server to point it at. So:

- Build and prove the strategy against `historicData.get` first. A backtest is
  free; a live bug is not.
- To paper-trade, wrap the order layer behind your own interface and log
  intended orders instead of sending them. Only swap in the real
  `orders.create` after the logged decisions look right for several sessions.
- Put a hard kill switch in front of the order call — a daily loss limit that
  halts the bot, a max open-position count, and a cap on order value — and make
  it fail closed when a check cannot be evaluated.
- Size positions from risk, not conviction: `qty = (equity × risk%) ÷ (entry − stop)`,
  then cap by a max fraction of equity per trade.
- `margins.requiredForOrder` before placing, so an order is not rejected for
  margin mid-strategy.
- Reconcile against `position.user()` and `orders.getOrders()` on every restart
  before acting. Never assume in-memory state survived.

When the user asks for an automated Groww bot, say plainly that a working
pipeline is not the same thing as a profitable one, and that the edge has to be
demonstrated on historic data before real money is committed.

## Reference files

- `reference/api.md` — every method, parameter type and response type
- `reference/gotchas.md` — the packaging bug in full, plus other sharp edges
- `scripts/install-growwapi.sh` — install + patch + verify
- `scripts/fix-esm.py` — the specifier rewriter, standalone
- `scripts/smoke-test.mjs` — 25 checks against a built copy
