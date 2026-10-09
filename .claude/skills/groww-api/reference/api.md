# growwapi v1.1.3 — full API reference

Read from source. `BaseParams` is `{ [key: string]: unknown }`, so every params
interface tolerates extra keys — a typo in a field name will **not** be caught
by the type checker. Check spelling against this file.

All methods are `async`. Params go out snake_cased; responses come back
camelCased.

## groww.orders

| Method | Params | Returns |
|---|---|---|
| `create` | `CreateOrderParams` | `CreateOrderResponse` |
| `modify` | `ModifyOrderParams` | `ModifyOrderResponse` |
| `cancel` | `CancelOrderParams` | `CancelOrderResponse` |
| `status` | `OrderStatusParams` | `OrderStatusResponse` |
| `statusByReference` | `OrderStatusByReferenceParams` | `OrderStatusResponse` |
| `getOrders` | `ListOrderParams` | `OrderResponse[]` |
| `details` | `OrderDetailsParams` | `OrderResponse` |
| `getTrades` | `GetTradesParams` | `GetTradesResponse[]` |

```typescript
CreateOrderParams {
  exchange: Exchange;  orderType: OrderType;  product: Product;
  quantity: number;    segment: Segment;      tradingSymbol: string;
  transactionType: TransactionType;           validity: Validity;
  orderReferenceId?: string;  price?: number;  triggerPrice?: number;
}
ModifyOrderParams {
  growwOrderId: string;  orderType: OrderType;  quantity: number;
  segment: Segment;      price?: number;        triggerPrice?: number;
}
CancelOrderParams            { growwOrderId: string; segment: Segment; orderReferenceId?: string; }
OrderStatusParams            { growwOrderId: string; segment: Segment; }
OrderStatusByReferenceParams { orderReferenceId: string; segment: Segment; }
OrderDetailsParams           { growwOrderId: string; segment: Segment; }
ListOrderParams              { page: number; pageSize: number; segment: Segment; }
GetTradesParams              { growwOrderId: string; segment: Segment; page?: number; pageSize?: number; }
```

`modify` cannot change exchange, product, symbol or side — only quantity,
price, trigger and order type. To change anything else: cancel, then create.

## groww.holdings

`list(): Promise<HoldingsResponse[]>` — no params. Long-term (CNC) holdings.
For intraday/F&O exposure use `position`, not this.

## groww.position

| Method | Params | Returns |
|---|---|---|
| `user` | `{ segment: Segment }` | `UserPositionsResponse` |
| `tradingSymbol` | `{ segment, tradingSymbol, exchange? }` | `TradingSymbolResponse` |

Singular `position`, not `positions`.

## groww.margins

| Method | Params | Returns |
|---|---|---|
| `details` | — | `MarginsDetailsResponse` |
| `requiredForOrder` | `MarginRequiredForOrderParams` | `RequiredForOrderResponse` |

```typescript
MarginRequiredForOrderParams {
  exchange: Exchange;  orderType: OrderType;  product: Product;
  quantity: number;    segment: Segment;      tradingSymbol: string;
  transactionType: TransactionType;           price?: number;
}
```

Call `requiredForOrder` before `orders.create` in any automated flow.
`details` gives available margin — the figure a kill switch should watch.

## groww.liveData

| Method | Params | Returns |
|---|---|---|
| `getQuote` | `{ exchange, segment, tradingSymbol }` | `GetQuoteResponse` |
| `getLTP` | `{ exchangeSymbols: string[], segment }` | `GetLTPResponse` |
| `getOHLC` | `{ exchangeSymbols: string[], segment }` | `GetOHLCResponse` |

`getQuote` takes one symbol; `getLTP` and `getOHLC` take an **array**, so batch
a watchlist into one call rather than looping.

## groww.historicData

`get(params): Promise<HistoricDataResponse>`

```typescript
HistoricDataParams {
  exchange: Exchange;  segment: Segment;  tradingSymbol: string;
  startTime: string | number;  endTime: string | number;
  intervalInMinutes?: number;
}
```

Times are epoch milliseconds (`Date.getTime()`) or a parseable string.
`intervalInMinutes` omitted gives the default candle size — set it explicitly
(e.g. `1`, `5`, `15`, `1440`) rather than relying on the default.

## groww.instructions

| Method | Params | Returns |
|---|---|---|
| `getInstructions` | — | `CachedCSVResult` (`.fileContent` is the raw CSV) |
| `getFilteredInstructions` | `InstructionsTypeParams` | `InstructionsTypeParams[]` |

Source: `https://growwapi-assets.groww.in/instruments/instrument.csv`, cached
for `GROWW_FILECACHE_TTL` (default 24 h). This is the symbol master — use it to
resolve `tradingSymbol` and `exchangeToken`, and to read `lotSize`,
`tickSize`, `freezeQuantity`, `strikePrice`, `expiryDate`.

Filterable fields: `exchange` `exchangeToken` `tradingSymbol` `segment`
`growwSymbol` `name` `instrumentType` `series` `isin` `underlyingSymbol`
`underlyingExchangeToken` `expiryDate` `strikePrice` `lotSize` `tickSize`
`freezeQuantity` `isReserved` `buyAllowed` `sellAllowed`
`internalTradingSymbol` `isIntraday`.

`buyAllowed` / `sellAllowed` / `isReserved` are worth checking before placing —
a banned or reserved scrip will reject.

## groww.liveFeed

| Method | Signature |
|---|---|
| `connect` | `connect(): Promise<void>` |
| `subscribe` | `subscribe(type: LiveFeedSubscriptionType, exchangeToken?: number \| string): Promise<Subscription \| undefined>` |
| `disconnect` | `disconnect(): void` |

Returned `Subscription` has `.consume(callback)` and `.unsubscribe()`.
Always null-guard: `sub?.consume(fn)`.

```
LiveFeedSubscriptionType
  Price               needs numeric exchangeToken
  MarketDepth         needs numeric exchangeToken
  Index               needs a name, e.g. 'NIFTY'
  EquityOrderUpdates  no token
  FnoOrderUpdates     no token
  FnoPositionUpdates  no token
```

Transport is `wss://socket-api.groww.in`, protobuf-encoded. The socket token is
minted separately via `Auth.socketAccessToken(publicKey)` against
`/api/apex/v1/socket/token/create` — the SDK handles this during `connect()`.
Reconnection is bounded by `GROWW_LIVE_FEED_MAX_RETRY_COUNT` (10) and
`GROWW_LIVE_FEED_MAX_RETRY_DURATION` (30 s); after that it gives up silently,
so a long-running bot must detect a dead feed itself and not assume no ticks
means a flat market.

## groww.auth

`Auth.getAccessToken(): Promise<string>` — cached, expiry-checked, auto-minted,
and concurrency-safe via a single in-flight promise. You normally never call
this; every resource calls it internally.

`Auth.socketAccessToken(publicKey): Promise<SocketCredentials>` — for the
websocket.

Endpoints: `https://api.groww.in/v1/token/api/access` (REST token),
`https://api.groww.in/v1/api/apex/v1/socket/token/create` (socket token).
