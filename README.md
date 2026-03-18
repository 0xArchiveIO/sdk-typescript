# @0xarchive/sdk

Official TypeScript/JavaScript SDK for [0xarchive](https://0xarchive.io) - Historical Market Data API.

Supports multiple exchanges:
- **Hyperliquid** - Perpetuals data from April 2023
- **Hyperliquid HIP-3** - Builder-deployed perpetuals (February 2026+, free tier: km:US500, Build+: all symbols, Pro+: orderbook history)
- **Lighter.xyz** - Perpetuals data (August 2025+ for fills, Jan 2026+ for OB, OI, Funding Rate)

## Installation

```bash
npm install @0xarchive/sdk
# or
yarn add @0xarchive/sdk
# or
pnpm add @0xarchive/sdk
```

## Quick Start

```typescript
import { OxArchive } from '@0xarchive/sdk';

const client = new OxArchive({ apiKey: '0xa_your_api_key' });

// Hyperliquid data
const hlOrderbook = await client.hyperliquid.orderbook.get('BTC');
console.log(`Hyperliquid BTC mid price: ${hlOrderbook.midPrice}`);

// Lighter.xyz data
const lighterOrderbook = await client.lighter.orderbook.get('BTC');
console.log(`Lighter BTC mid price: ${lighterOrderbook.midPrice}`);

// HIP-3 builder perps (February 2026+)
const hip3Instruments = await client.hyperliquid.hip3.instruments.list();
const hip3Orderbook = await client.hyperliquid.hip3.orderbook.get('km:US500');
const hip3Trades = await client.hyperliquid.hip3.trades.recent('km:US500');
const hip3Funding = await client.hyperliquid.hip3.funding.current('xyz:XYZ100');
const hip3Oi = await client.hyperliquid.hip3.openInterest.current('xyz:XYZ100');

// Get historical order book snapshots
const history = await client.hyperliquid.orderbook.history('ETH', {
  start: Date.now() - 86400000, // 24 hours ago
  end: Date.now(),
  limit: 100
});
```

## Configuration

```typescript
const client = new OxArchive({
  apiKey: '0xa_your_api_key',       // Required
  baseUrl: 'https://api.0xarchive.io',  // Optional
  timeout: 30000,                   // Optional, request timeout in ms (default: 30000)
  validate: false,                  // Optional, enable Zod schema validation
});
```

## REST API Reference

Core resources (orderbook, trades, instruments, funding, openInterest, candles, freshness, summary, priceHistory) are available on both `client.hyperliquid.*` and `client.lighter.*`. Some resources are exchange-specific -- see each section for details.

### Order Book

```typescript
// Get current order book (Hyperliquid)
const orderbook = await client.hyperliquid.orderbook.get('BTC');

// Get current order book (Lighter.xyz)
const lighterOb = await client.lighter.orderbook.get('BTC');

// Get order book at specific timestamp with custom depth
const historical = await client.hyperliquid.orderbook.get('BTC', {
  timestamp: 1704067200000,
  depth: 20  // Number of levels per side
});

// Get historical snapshots (start is required)
const history = await client.hyperliquid.orderbook.history('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  limit: 1000
});
```

#### Orderbook Depth Limits

The `depth` parameter controls how many price levels are returned per side. Tier-based limits apply:

| Tier | Max Depth |
|------|-----------|
| Free | 20 |
| Build | 50 |
| Pro | 100 |
| Enterprise | Full Depth |

**Note:** Hyperliquid source data only contains 20 levels. Higher limits apply to Lighter.xyz data.

#### Lighter Orderbook Granularity

Lighter.xyz orderbook history supports a `granularity` parameter for different data resolutions. Tier restrictions apply.

| Granularity | Interval | Tier Required | Credit Multiplier |
|-------------|----------|---------------|-------------------|
| `checkpoint` | ~60s | Free+ | 1x |
| `30s` | 30s | Build+ | 2x |
| `10s` | 10s | Build+ | 3x |
| `1s` | 1s | Pro+ | 10x |
| `tick` | tick-level | Enterprise | 20x |

```typescript
// Get Lighter orderbook history with 10s resolution (Build+ tier)
const history = await client.lighter.orderbook.history('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  granularity: '10s'
});

// Get 1-second resolution (Pro+ tier)
const history = await client.lighter.orderbook.history('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  granularity: '1s'
});

// Tick-level data (Enterprise tier) - returns checkpoint + raw deltas
const history = await client.lighter.orderbook.history('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  granularity: 'tick'
});
```

**Note:** The `granularity` parameter is ignored for Hyperliquid orderbook history.

#### Orderbook Reconstruction (Enterprise Tier)

For tick-level data, the SDK provides client-side orderbook reconstruction. This efficiently reconstructs full orderbook state from a checkpoint and incremental deltas.

```typescript
import { OrderBookReconstructor } from '@0xarchive/sdk';

// Option 1: Get fully reconstructed snapshots (simplest)
const snapshots = await client.lighter.orderbook.historyReconstructed('BTC', {
  start: Date.now() - 3600000,
  end: Date.now()
});

for (const ob of snapshots) {
  console.log(`${ob.timestamp}: bid=${ob.bids[0]?.px} ask=${ob.asks[0]?.px}`);
}

// Option 2: Get raw tick data for custom reconstruction
const tickData = await client.lighter.orderbook.historyTick('BTC', {
  start: Date.now() - 3600000,
  end: Date.now()
});

console.log(`Checkpoint: ${tickData.checkpoint.bids.length} bids`);
console.log(`Deltas: ${tickData.deltas.length} updates`);

// Option 3: Auto-paginating iterator (recommended for large time ranges)
// Automatically handles pagination, fetching up to 1,000 deltas per request
for await (const snapshot of client.lighter.orderbook.iterateTickHistory('BTC', {
  start: Date.now() - 86400000, // 24 hours of data
  end: Date.now()
})) {
  console.log(snapshot.timestamp, 'Mid:', snapshot.midPrice);
  if (someCondition(snapshot)) break; // Early exit supported
}

// Option 4: Manual iteration (single page, for custom logic)
const reconstructor = client.lighter.orderbook.createReconstructor();
for (const snapshot of reconstructor.iterate(tickData.checkpoint, tickData.deltas)) {
  // Process each snapshot without loading all into memory
  if (someCondition(snapshot)) break; // Early exit if needed
}

// Option 5: Get only final state (most efficient)
const final = reconstructor.reconstructFinal(tickData.checkpoint, tickData.deltas);

// Check for sequence gaps
const gaps = OrderBookReconstructor.detectGaps(tickData.deltas);
if (gaps.length > 0) {
  console.warn('Sequence gaps detected:', gaps);
}
```

**Methods:**
| Method | Description |
|--------|-------------|
| `historyTick(coin, params)` | Get raw checkpoint + deltas (single page, max 1,000 deltas) |
| `historyReconstructed(coin, params, options)` | Get fully reconstructed snapshots (single page) |
| `iterateTickHistory(coin, params, depth?)` | Auto-paginating async iterator for large time ranges |
| `createReconstructor()` | Create a reconstructor instance for manual control |

**Note:** The API returns a maximum of 1,000 deltas per request. For time ranges with more deltas, use `iterateTickHistory()` which handles pagination automatically.

**ReconstructOptions:**
| Option | Default | Description |
|--------|---------|-------------|
| `depth` | all | Maximum price levels in output |
| `emitAll` | `true` | If `false`, only return final state |

### Trades

The trades API uses cursor-based pagination for efficient retrieval of large datasets.

```typescript
// Get trade history with cursor-based pagination
let result = await client.hyperliquid.trades.list('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  limit: 1000
});

// Paginate through all results
const allTrades = [...result.data];
while (result.nextCursor) {
  result = await client.hyperliquid.trades.list('BTC', {
    start: Date.now() - 86400000,
    end: Date.now(),
    cursor: result.nextCursor,
    limit: 1000
  });
  allTrades.push(...result.data);
}

// Get recent trades (Lighter only - has real-time data)
const recent = await client.lighter.trades.recent('BTC', 100);
```

**Note:** The `recent()` method is available for Lighter.xyz (`client.lighter.trades.recent()`) and HIP-3 (`client.hyperliquid.hip3.trades.recent()`). Hyperliquid does not have a recent trades endpoint -- use `list()` with a time range instead.

### Instruments

```typescript
// List all trading instruments (Hyperliquid)
const instruments = await client.hyperliquid.instruments.list();

// Get specific instrument details
const btc = await client.hyperliquid.instruments.get('BTC');
console.log(`BTC size decimals: ${btc.szDecimals}`);
```

#### Lighter.xyz Instruments

Lighter instruments have a different schema with additional fields for fees, market IDs, and minimum order amounts:

```typescript
// List Lighter instruments (returns LighterInstrument, not Instrument)
const lighterInstruments = await client.lighter.instruments.list();

// Get specific Lighter instrument
const eth = await client.lighter.instruments.get('ETH');
console.log(`ETH taker fee: ${eth.takerFee}`);
console.log(`ETH maker fee: ${eth.makerFee}`);
console.log(`ETH market ID: ${eth.marketId}`);
console.log(`ETH min base amount: ${eth.minBaseAmount}`);
```

**Key differences:**
| Field | Hyperliquid (`Instrument`) | Lighter (`LighterInstrument`) |
|-------|---------------------------|------------------------------|
| Symbol | `name` | `symbol` |
| Size decimals | `szDecimals` | `sizeDecimals` |
| Fee info | Not available | `takerFee`, `makerFee`, `liquidationFee` |
| Market ID | Not available | `marketId` |
| Min amounts | Not available | `minBaseAmount`, `minQuoteAmount` |

#### HIP-3 Instruments

HIP-3 instruments are derived from live market data and include mark price, open interest, and mid price:

```typescript
// List all HIP-3 instruments (no tier restriction)
const hip3Instruments = await client.hyperliquid.hip3.instruments.list();
for (const inst of hip3Instruments) {
  console.log(`${inst.coin} (${inst.namespace}:${inst.ticker}): mark=${inst.markPrice}, OI=${inst.openInterest}`);
}

// Get specific HIP-3 instrument (case-sensitive)
const us500 = await client.hyperliquid.hip3.instruments.get('km:US500');
console.log(`Mark price: ${us500.markPrice}`);
```

**Available HIP-3 Coins:**
| Builder | Coins |
|---------|-------|
| xyz (Hyperliquid) | `xyz:XYZ100` |
| km (Kinetiq Markets) | `km:US500`, `km:SMALL2000`, `km:GOOGL`, `km:USBOND`, `km:GOLD`, `km:USTECH`, `km:NVDA`, `km:SILVER`, `km:BABA` |

### Funding Rates

```typescript
// Get current funding rate
const current = await client.hyperliquid.funding.current('BTC');

// Get funding rate history (start is required)
const history = await client.hyperliquid.funding.history('ETH', {
  start: Date.now() - 86400000 * 7,
  end: Date.now()
});

// Get funding rate history with aggregation interval
const hourly = await client.hyperliquid.funding.history('BTC', {
  start: Date.now() - 86400000 * 7,
  end: Date.now(),
  interval: '1h'
});
```

#### Funding History Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start` | `number \| string` | Yes | Start timestamp (Unix ms or ISO string) |
| `end` | `number \| string` | Yes | End timestamp (Unix ms or ISO string) |
| `cursor` | `number \| string` | No | Cursor from previous response for pagination |
| `limit` | `number` | No | Max results (default: 100, max: 1000) |
| `interval` | `OiFundingInterval` | No | Aggregation interval: `'5m'`, `'15m'`, `'30m'`, `'1h'`, `'4h'`, `'1d'`. When omitted, raw ~1 min data is returned. |

### Open Interest

```typescript
// Get current open interest
const current = await client.hyperliquid.openInterest.current('BTC');

// Get open interest history (start is required)
const history = await client.hyperliquid.openInterest.history('ETH', {
  start: Date.now() - 86400000,
  end: Date.now(),
  limit: 100
});

// Get open interest history with aggregation interval
const hourly = await client.hyperliquid.openInterest.history('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  interval: '1h'
});
```

#### Open Interest History Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start` | `number \| string` | Yes | Start timestamp (Unix ms or ISO string) |
| `end` | `number \| string` | Yes | End timestamp (Unix ms or ISO string) |
| `cursor` | `number \| string` | No | Cursor from previous response for pagination |
| `limit` | `number` | No | Max results (default: 100, max: 1000) |
| `interval` | `OiFundingInterval` | No | Aggregation interval: `'5m'`, `'15m'`, `'30m'`, `'1h'`, `'4h'`, `'1d'`. When omitted, raw ~1 min data is returned. |

### Liquidations

Get historical liquidation events. Data available from May 2025 onwards for Hyperliquid, and from February 2026 for HIP-3.

```typescript
// Get liquidation history for a coin (Hyperliquid)
const liquidations = await client.hyperliquid.liquidations.history('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  limit: 100
});

// Paginate through all results
const allLiquidations = [...liquidations.data];
while (liquidations.nextCursor) {
  const next = await client.hyperliquid.liquidations.history('BTC', {
    start: Date.now() - 86400000,
    end: Date.now(),
    cursor: liquidations.nextCursor,
    limit: 1000
  });
  allLiquidations.push(...next.data);
}

// Get liquidations for a specific user
const userLiquidations = await client.hyperliquid.liquidations.byUser('0x1234...', {
  start: Date.now() - 86400000 * 7,
  end: Date.now(),
  coin: 'BTC'  // optional filter
});

// HIP-3 liquidations (case-sensitive coins)
const hip3Liquidations = await client.hyperliquid.hip3.liquidations.history('km:US500', {
  start: Date.now() - 86400000,
  end: Date.now(),
  limit: 100
});
```

### Liquidation Volume

Get pre-aggregated liquidation volume in time-bucketed intervals. Returns total, long, and short USD volumes per bucket -- 100-1000x less data than individual liquidation records.

```typescript
// Get hourly liquidation volume for the last week (Hyperliquid)
const volume = await client.hyperliquid.liquidations.volume('BTC', {
  start: Date.now() - 86400000 * 7,
  end: Date.now(),
  interval: '1h'  // 5m, 15m, 30m, 1h, 4h, 1d
});

for (const bucket of volume.data) {
  console.log(`${bucket.timestamp}: total=$${bucket.totalUsd}, long=$${bucket.longUsd}, short=$${bucket.shortUsd}`);
}

// HIP-3 liquidation volume (case-sensitive coins)
const hip3Volume = await client.hyperliquid.hip3.liquidations.volume('km:US500', {
  start: Date.now() - 86400000 * 7,
  end: Date.now(),
  interval: '1h'
});
```

### Orders

Access order history, order flow aggregations, and TP/SL (take-profit/stop-loss) orders. Available for Hyperliquid and HIP-3.

```typescript
// Get order history for a coin
const orders = await client.hyperliquid.orders.history('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  limit: 1000,
  user: '0x1234...',    // optional: filter by user address
  status: 'filled',     // optional: filter by status
  order_type: 'limit',  // optional: filter by order type
});

// Paginate through all results
const allOrders = [...orders.data];
while (orders.nextCursor) {
  const next = await client.hyperliquid.orders.history('BTC', {
    start: Date.now() - 86400000,
    end: Date.now(),
    cursor: orders.nextCursor,
    limit: 1000
  });
  allOrders.push(...next.data);
}

// Get order flow (aggregated order activity over time)
const flow = await client.hyperliquid.orders.flow('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  interval: '1h',  // optional aggregation interval
  limit: 100
});

// Get TP/SL orders
const tpsl = await client.hyperliquid.orders.tpsl('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  user: '0x1234...',  // optional: filter by user
  triggered: true,    // optional: filter by triggered status
});

// HIP-3 orders (case-sensitive coins)
const hip3Orders = await client.hyperliquid.hip3.orders.history('km:US500', {
  start: Date.now() - 86400000,
  end: Date.now(),
  limit: 1000
});

const hip3Flow = await client.hyperliquid.hip3.orders.flow('km:US500', {
  start: Date.now() - 86400000,
  end: Date.now(),
  interval: '1h'
});

const hip3Tpsl = await client.hyperliquid.hip3.orders.tpsl('km:US500', {
  start: Date.now() - 86400000,
  end: Date.now()
});
```

### L4 Order Book

Access L4 orderbook snapshots, diffs, and history. L4 data includes user attribution (who placed each order). Available for Hyperliquid and HIP-3.

```typescript
// Get current L4 orderbook snapshot
const l4Ob = await client.hyperliquid.l4Orderbook.get('BTC');

// Get L4 orderbook at a specific timestamp with custom depth
const l4Historical = await client.hyperliquid.l4Orderbook.get('BTC', {
  timestamp: 1704067200000,
  depth: 20
});

// Get L4 orderbook diffs (incremental updates)
const diffs = await client.hyperliquid.l4Orderbook.diffs('BTC', {
  start: Date.now() - 3600000,
  end: Date.now(),
  limit: 1000
});

// Paginate through diffs
const allDiffs = [...diffs.data];
while (diffs.nextCursor) {
  const next = await client.hyperliquid.l4Orderbook.diffs('BTC', {
    start: Date.now() - 3600000,
    end: Date.now(),
    cursor: diffs.nextCursor,
    limit: 1000
  });
  allDiffs.push(...next.data);
}

// Get L4 orderbook history (full snapshots over time)
const l4History = await client.hyperliquid.l4Orderbook.history('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  limit: 1000
});

// HIP-3 L4 orderbook (case-sensitive coins)
const hip3L4 = await client.hyperliquid.hip3.l4Orderbook.get('km:US500');

const hip3L4Diffs = await client.hyperliquid.hip3.l4Orderbook.diffs('km:US500', {
  start: Date.now() - 3600000,
  end: Date.now(),
  limit: 1000
});

const hip3L4History = await client.hyperliquid.hip3.l4Orderbook.history('km:US500', {
  start: Date.now() - 86400000,
  end: Date.now(),
  limit: 1000
});
```

### L3 Order Book (Lighter only)

Access L3 orderbook snapshots and history from Lighter.xyz. L3 data includes individual order-level detail.

```typescript
// Get current L3 orderbook
const l3Ob = await client.lighter.l3Orderbook.get('BTC');

// Get L3 orderbook at a specific timestamp with custom depth
const l3Historical = await client.lighter.l3Orderbook.get('BTC', {
  timestamp: 1704067200000,
  depth: 20
});

// Get L3 orderbook history
const l3History = await client.lighter.l3Orderbook.history('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  limit: 1000
});

// Paginate through L3 history
const allL3 = [...l3History.data];
while (l3History.nextCursor) {
  const next = await client.lighter.l3Orderbook.history('BTC', {
    start: Date.now() - 86400000,
    end: Date.now(),
    cursor: l3History.nextCursor,
    limit: 1000
  });
  allL3.push(...next.data);
}
```

### Freshness

Check when each data type was last updated for a specific coin. Useful for verifying data recency before pulling it. Available for all exchanges.

```typescript
// Hyperliquid
const freshness = await client.hyperliquid.freshness('BTC');
console.log(`Orderbook last updated: ${freshness.orderbook.lastUpdated}, lag: ${freshness.orderbook.lagMs}ms`);
console.log(`Trades last updated: ${freshness.trades.lastUpdated}, lag: ${freshness.trades.lagMs}ms`);
console.log(`Funding last updated: ${freshness.funding.lastUpdated}`);
console.log(`OI last updated: ${freshness.openInterest.lastUpdated}`);

// Lighter.xyz
const lighterFreshness = await client.lighter.freshness('BTC');

// HIP-3 (case-sensitive coins)
const hip3Freshness = await client.hyperliquid.hip3.freshness('km:US500');
```

### Summary

Get a combined market snapshot in a single call -- mark/oracle price, funding rate, open interest, 24h volume, and 24h liquidation volumes.

```typescript
// Hyperliquid (includes volume + liquidation data)
const summary = await client.hyperliquid.summary('BTC');
console.log(`Mark price: ${summary.markPrice}`);
console.log(`Oracle price: ${summary.oraclePrice}`);
console.log(`Funding rate: ${summary.fundingRate}`);
console.log(`Open interest: ${summary.openInterest}`);
console.log(`24h volume: ${summary.volume24h}`);
console.log(`24h liquidation volume: $${summary.liquidationVolume24h}`);
console.log(`  Long: $${summary.longLiquidationVolume24h}`);
console.log(`  Short: $${summary.shortLiquidationVolume24h}`);

// Lighter.xyz (price, funding, OI — no volume/liquidation data)
const lighterSummary = await client.lighter.summary('BTC');

// HIP-3 (includes mid_price — case-sensitive coins)
const hip3Summary = await client.hyperliquid.hip3.summary('km:US500');
console.log(`Mid price: ${hip3Summary.midPrice}`);
```

### Price History

Get mark, oracle, and mid price history over time. Supports aggregation intervals. Data projected from open interest records.

```typescript
// Hyperliquid — available from May 2023
const prices = await client.hyperliquid.priceHistory('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  interval: '1h'  // 5m, 15m, 30m, 1h, 4h, 1d
});

for (const snapshot of prices.data) {
  console.log(`${snapshot.timestamp}: mark=${snapshot.markPrice}, oracle=${snapshot.oraclePrice}, mid=${snapshot.midPrice}`);
}

// Lighter.xyz
const lighterPrices = await client.lighter.priceHistory('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  interval: '1h'
});

// HIP-3 (case-sensitive coins)
const hip3Prices = await client.hyperliquid.hip3.priceHistory('km:US500', {
  start: Date.now() - 86400000,
  end: Date.now(),
  interval: '1d'
});

// Paginate for larger ranges
let result = await client.hyperliquid.priceHistory('BTC', {
  start: Date.now() - 86400000 * 30,
  end: Date.now(),
  interval: '4h',
  limit: 1000
});
while (result.nextCursor) {
  result = await client.hyperliquid.priceHistory('BTC', {
    start: Date.now() - 86400000 * 30,
    end: Date.now(),
    interval: '4h',
    cursor: result.nextCursor,
    limit: 1000
  });
}
```

### Candles (OHLCV)

Get historical OHLCV candle data aggregated from trades.

```typescript
// Get candle history (start is required)
const candles = await client.hyperliquid.candles.history('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  interval: '1h',  // 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
  limit: 100
});

// Iterate through candles
for (const candle of candles.data) {
  console.log(`${candle.timestamp}: O=${candle.open} H=${candle.high} L=${candle.low} C=${candle.close} V=${candle.volume}`);
}

// Cursor-based pagination for large datasets
let result = await client.hyperliquid.candles.history('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  interval: '1m',
  limit: 1000
});
const allCandles = [...result.data];
while (result.nextCursor) {
  result = await client.hyperliquid.candles.history('BTC', {
    start: Date.now() - 86400000,
    end: Date.now(),
    interval: '1m',
    cursor: result.nextCursor,
    limit: 1000
  });
  allCandles.push(...result.data);
}

// Lighter.xyz candles
const lighterCandles = await client.lighter.candles.history('BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  interval: '15m'
});
```

#### Available Intervals

| Interval | Description |
|----------|-------------|
| `1m` | 1 minute |
| `5m` | 5 minutes |
| `15m` | 15 minutes |
| `30m` | 30 minutes |
| `1h` | 1 hour (default) |
| `4h` | 4 hours |
| `1d` | 1 day |
| `1w` | 1 week |

### Data Quality Monitoring

Monitor data coverage, incidents, latency, and SLA compliance across all exchanges.

```typescript
// Get overall system health status
const status = await client.dataQuality.status();
console.log(`System status: ${status.status}`);
for (const [exchange, info] of Object.entries(status.exchanges)) {
  console.log(`  ${exchange}: ${info.status}`);
}

// Get data coverage summary for all exchanges
const coverage = await client.dataQuality.coverage();
for (const exchange of coverage.exchanges) {
  console.log(`${exchange.exchange}:`);
  for (const [dtype, info] of Object.entries(exchange.dataTypes)) {
    console.log(`  ${dtype}: ${info.totalRecords.toLocaleString()} records, ${info.completeness}% complete`);
  }
}

// Get symbol-specific coverage with gap detection
const btc = await client.dataQuality.symbolCoverage('hyperliquid', 'BTC');
const oi = btc.dataTypes.open_interest;
console.log(`BTC OI completeness: ${oi.completeness}%`);
console.log(`Historical coverage: ${oi.historicalCoverage}%`);  // Hour-level granularity
console.log(`Gaps found: ${oi.gaps.length}`);
for (const gap of oi.gaps.slice(0, 5)) {
  console.log(`  ${gap.durationMinutes} min gap: ${gap.start} -> ${gap.end}`);
}

// Check empirical data cadence (when available)
const ob = btc.dataTypes.orderbook;
if (ob.cadence) {
  console.log(`Orderbook cadence: ~${ob.cadence.medianIntervalSeconds}s median, p95=${ob.cadence.p95IntervalSeconds}s`);
}

// Time-bounded gap detection (last 7 days)
const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
const btc7d = await client.dataQuality.symbolCoverage('hyperliquid', 'BTC', {
  from: weekAgo,
  to: Date.now(),
});

// List incidents with filtering
const result = await client.dataQuality.listIncidents({ status: 'open' });
for (const incident of result.incidents) {
  console.log(`[${incident.severity}] ${incident.title}`);
}

// Get latency metrics
const latency = await client.dataQuality.latency();
for (const [exchange, metrics] of Object.entries(latency.exchanges)) {
  console.log(`${exchange}: OB lag ${metrics.dataFreshness.orderbookLagMs}ms`);
}

// Get SLA compliance metrics for a specific month
const sla = await client.dataQuality.sla({ year: 2026, month: 1 });
console.log(`Period: ${sla.period}`);
console.log(`Uptime: ${sla.actual.uptime}% (${sla.actual.uptimeStatus})`);
console.log(`API P99: ${sla.actual.apiLatencyP99Ms}ms (${sla.actual.latencyStatus})`);
```

#### Data Quality Endpoints

| Method | Description |
|--------|-------------|
| `status()` | Overall system health and per-exchange status |
| `coverage()` | Data coverage summary for all exchanges |
| `exchangeCoverage(exchange)` | Coverage details for a specific exchange |
| `symbolCoverage(exchange, symbol, options?)` | Coverage with gap detection, cadence, and historical coverage |
| `listIncidents(params)` | List incidents with filtering and pagination |
| `getIncident(incidentId)` | Get specific incident details |
| `latency()` | Current latency metrics (WebSocket, REST, data freshness) |
| `sla(params)` | SLA compliance metrics for a specific month |

**Note:** Data Quality endpoints (`coverage()`, `exchangeCoverage()`, `symbolCoverage()`) perform complex aggregation queries and may take 30-60 seconds on first request (results are cached server-side for 5 minutes). If you encounter timeout errors, create a client with a longer timeout:

```typescript
const client = new OxArchive({
  apiKey: '0xa_your_api_key',
  timeout: 60000  // 60 seconds for data quality endpoints
});
```

### Web3 Authentication

Get API keys programmatically using an Ethereum wallet — no browser or email required.

#### Free Tier (SIWE)

```typescript
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';

const account = privateKeyToAccount('0xYOUR_PRIVATE_KEY');
const walletClient = createWalletClient({ account, chain: mainnet, transport: http() });

// 1. Get SIWE challenge
const challenge = await client.web3.challenge(account.address);

// 2. Sign with personal_sign (EIP-191)
const signature = await walletClient.signMessage({ message: challenge.message });

// 3. Submit → receive API key
const result = await client.web3.signup(challenge.message, signature);
console.log(result.apiKey); // "0xa_..."
```

#### Paid Tier (x402 USDC on Base)

```typescript
import { createWalletClient, http, encodePacked } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import crypto from 'crypto';

const account = privateKeyToAccount('0xYOUR_PRIVATE_KEY');
const walletClient = createWalletClient({ account, chain: base, transport: http() });

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// 1. Get pricing
const quote = await client.web3.subscribeQuote('build');
// quote.amount = "49000000" ($49 USDC), quote.payTo = "0x..."

// 2. Build & sign EIP-3009 transferWithAuthorization
const nonce = `0x${crypto.randomBytes(32).toString('hex')}` as `0x${string}`;
const validAfter = 0n;
const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);

const signature = await walletClient.signTypedData({
  domain: {
    name: 'USD Coin',
    version: '2',
    chainId: 8453,
    verifyingContract: USDC_ADDRESS,
  },
  types: {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  },
  primaryType: 'TransferWithAuthorization',
  message: {
    from: account.address,
    to: quote.payTo as `0x${string}`,
    value: BigInt(quote.amount),
    validAfter,
    validBefore,
    nonce,
  },
});

// 3. Build x402 payment envelope and base64-encode
const paymentPayload = btoa(JSON.stringify({
  x402Version: 2,
  payload: {
    signature,
    authorization: {
      from: account.address,
      to: quote.payTo,
      value: quote.amount,
      validAfter: '0',
      validBefore: validBefore.toString(),
      nonce,
    },
  },
}));

// 4. Submit payment → receive API key + subscription
const sub = await client.web3.subscribe('build', paymentPayload);
console.log(sub.apiKey, sub.tier, sub.expiresAt);
```

#### Key Management

```typescript
// List and revoke keys (requires a fresh SIWE signature)
const keys = await client.web3.listKeys(challenge.message, signature);
await client.web3.revokeKey(challenge.message, signature, keys.keys[0].id);
```

### Legacy API (Deprecated)

The following legacy methods are deprecated and will be removed in v2.0. They default to Hyperliquid data:

```typescript
// Deprecated - use client.hyperliquid.orderbook.get() instead
const orderbook = await client.orderbook.get('BTC');

// Deprecated - use client.hyperliquid.trades.list() instead
const trades = await client.trades.list('BTC', { start, end });
```

## WebSocket Client

The WebSocket client supports two modes: real-time streaming and historical replay. For bulk data downloads, use the S3 Parquet bulk export via the [Data Explorer](https://0xarchive.io/data).

```typescript
import { OxArchiveWs } from '@0xarchive/sdk';

const ws = new OxArchiveWs({ apiKey: '0xa_your_api_key' });
```

### Real-time Streaming

Subscribe to live market data from Hyperliquid.

```typescript
ws.connect({
  onOpen: () => console.log('Connected'),
  onClose: (code, reason) => console.log(`Disconnected: ${code}`),
  onError: (error) => console.error('Error:', error),
});

// Subscribe to channels
ws.subscribeOrderbook('BTC');
ws.subscribeTrades('ETH');
ws.subscribeTicker('SOL');
ws.subscribeAllTickers();

// Handle real-time data with typed callbacks
ws.onOrderbook((coin, data) => {
  console.log(`${coin} mid price: ${data.midPrice}`);
});

ws.onTrades((coin, trades) => {
  console.log(`${coin} new trades: ${trades.length}`);
});

// Unsubscribe when done
ws.unsubscribeOrderbook('BTC');

// Disconnect
ws.disconnect();
```

### Historical Replay

Replay historical data with original timing preserved. Perfect for backtesting.

> **Important:** Replay data is delivered via `onHistoricalData()`, NOT `onTrades()` or `onOrderbook()`.
> The real-time callbacks only receive live market data from subscriptions.

```typescript
const ws = new OxArchiveWs({ apiKey: 'ox_...' });
ws.connect();

// Handle replay data - this is where historical records arrive
ws.onHistoricalData((coin, timestamp, data) => {
  console.log(`${new Date(timestamp).toISOString()}: ${data.midPrice}`);
});

// Replay lifecycle events
ws.onReplayStart((channel, coin, start, end, speed) => {
  console.log(`Starting replay: ${channel}/${coin} at ${speed}x`);
});

ws.onReplayComplete((channel, coin, recordsSent) => {
  console.log(`Replay complete: ${recordsSent} records`);
});

// Start replay at 10x speed
ws.replay('orderbook', 'BTC', {
  start: Date.now() - 86400000,  // 24 hours ago
  end: Date.now(),               // Optional, defaults to now
  speed: 10                       // Optional, defaults to 1x
});

// Lighter.xyz replay with granularity (tier restrictions apply)
ws.replay('orderbook', 'BTC', {
  start: Date.now() - 86400000,
  speed: 10,
  granularity: '10s'  // Options: 'checkpoint', '30s', '10s', '1s', 'tick'
});

// Handle tick-level data (granularity='tick', Enterprise tier)
ws.onHistoricalTickData((coin, checkpoint, deltas) => {
  console.log(`Checkpoint: ${checkpoint.bids.length} bids`);
  console.log(`Deltas: ${deltas.length} updates`);
  // Apply deltas to checkpoint to reconstruct orderbook at any point
});

// Control playback
ws.replayPause();
ws.replayResume();
ws.replaySeek(1704067200000);  // Jump to timestamp
ws.replayStop();
```

### Gap Detection

During historical replay, the server automatically detects gaps in the data and notifies the client. This helps identify periods where data may be missing.

```typescript
// Handle gap notifications during replay
ws.onGap((channel, coin, gapStart, gapEnd, durationMinutes) => {
  console.log(`Gap detected in ${channel}/${coin}:`);
  console.log(`  From: ${new Date(gapStart).toISOString()}`);
  console.log(`  To: ${new Date(gapEnd).toISOString()}`);
  console.log(`  Duration: ${durationMinutes} minutes`);
});

// Start replay - gaps will be reported via onGap callback
ws.replay('orderbook', 'BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  speed: 10
});
```

Gap thresholds vary by channel:
- **orderbook**, **candles**, **liquidations**: 2 minutes
- **trades**: 60 minutes (trades can naturally have longer gaps during low activity periods)

### WebSocket Configuration

```typescript
const ws = new OxArchiveWs({
  apiKey: '0xa_your_api_key',          // Required
  wsUrl: 'wss://api.0xarchive.io/ws', // Optional
  autoReconnect: true,                // Auto-reconnect on disconnect (default: true)
  reconnectDelay: 1000,               // Initial reconnect delay in ms (default: 1000)
  maxReconnectAttempts: 10,           // Max reconnect attempts (default: 10)
  pingInterval: 30000,                // Keep-alive ping interval in ms (default: 30000)
});
```

### Available Channels

#### Hyperliquid Channels

| Channel | Description | Requires Coin | Historical Support |
|---------|-------------|---------------|-------------------|
| `orderbook` | L2 order book updates | Yes | Yes |
| `trades` | Trade/fill updates | Yes | Yes |
| `candles` | OHLCV candle data | Yes | Yes (replay only) |
| `liquidations` | Liquidation events (May 2025+) | Yes | Yes (replay only) |
| `open_interest` | Open interest snapshots | Yes | Replay/stream only |
| `funding` | Funding rate snapshots | Yes | Replay/stream only |
| `ticker` | Price and 24h volume | Yes | Real-time only |
| `all_tickers` | All market tickers | No | Real-time only |

#### HIP-3 Builder Perps Channels

| Channel | Description | Requires Coin | Historical Support |
|---------|-------------|---------------|-------------------|
| `hip3_orderbook` | HIP-3 L2 order book snapshots | Yes | Yes |
| `hip3_trades` | HIP-3 trade/fill updates | Yes | Yes |
| `hip3_candles` | HIP-3 OHLCV candle data | Yes | Yes |
| `hip3_open_interest` | HIP-3 open interest snapshots | Yes | Replay/stream only |
| `hip3_funding` | HIP-3 funding rate snapshots | Yes | Replay/stream only |
| `hip3_liquidations` | HIP-3 liquidation events (Feb 2026+) | Yes | Yes (replay only) |

> **Note:** HIP-3 coins are case-sensitive (e.g., `km:US500`, `xyz:XYZ100`). Do not uppercase them.

#### Lighter.xyz Channels

| Channel | Description | Requires Coin | Historical Support |
|---------|-------------|---------------|-------------------|
| `lighter_orderbook` | Lighter L2 order book (reconstructed) | Yes | Yes |
| `lighter_trades` | Lighter trade/fill updates | Yes | Yes |
| `lighter_candles` | Lighter OHLCV candle data | Yes | Yes |
| `lighter_open_interest` | Lighter open interest snapshots | Yes | Replay/stream only |
| `lighter_funding` | Lighter funding rate snapshots | Yes | Replay/stream only |
| `lighter_l3_orderbook` | Lighter L3 order-level orderbook (Pro+) | Yes | Yes |

#### Candle Replay/Stream

```typescript
// Replay candles at 10x speed
ws.replay('candles', 'BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  speed: 10,
  interval: '15m'  // 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
});

// Lighter.xyz candles
ws.replay('lighter_candles', 'BTC', {
  start: Date.now() - 86400000,
  speed: 10,
  interval: '5m'
});
```

#### HIP-3 Replay

```typescript
// Replay HIP-3 orderbook at 50x speed
ws.replay('hip3_orderbook', 'km:US500', {
  start: Date.now() - 3600000,
  end: Date.now(),
  speed: 50,
});

// HIP-3 candles
ws.replay('hip3_candles', 'km:US500', {
  start: Date.now() - 86400000,
  end: Date.now(),
  speed: 100,
  interval: '1h'
});
```

### Multi-Channel Replay

Replay multiple data channels simultaneously with synchronized timing. Data from all channels is interleaved chronologically. Before the timeline begins, `replay_snapshot` messages provide the initial state for each channel at the start timestamp.

```typescript
const ws = new OxArchiveWs({ apiKey: 'ox_...' });
await ws.connect();

// Handle initial snapshots (sent before timeline data)
ws.onReplaySnapshot((channel, coin, timestamp, data) => {
  console.log(`Initial ${channel} state at ${new Date(timestamp).toISOString()}`);
  if (channel === 'orderbook') {
    currentOrderbook = data;
  } else if (channel === 'funding') {
    currentFundingRate = data;
  } else if (channel === 'open_interest') {
    currentOI = data;
  }
});

// Handle interleaved historical data
ws.onHistoricalData((coin, timestamp, data) => {
  // The `channel` field on the raw message indicates which channel
  // this data point belongs to
  console.log(`${new Date(timestamp).toISOString()}: data received`);
});

ws.onReplayComplete((channel, coin, count) => {
  console.log(`Replay complete: ${count} records`);
});

// Start multi-channel replay
ws.multiReplay(['orderbook', 'trades', 'funding'], 'BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  speed: 10
});

// Playback controls work the same as single-channel
ws.replayPause();
ws.replayResume();
ws.replaySeek(1704067200000);
ws.replayStop();
```

**Channels available for multi-channel replay:** All historical channels can be combined in a single multi-channel replay. This includes `orderbook`, `trades`, `candles`, `liquidations`, `open_interest`, `funding`, and their `lighter_*` and `hip3_*` variants.

### WebSocket Connection States

```typescript
ws.getState(); // 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
ws.isConnected(); // boolean
```

## Timestamp Formats

The SDK accepts timestamps as Unix milliseconds or Date objects:

```typescript
// Unix milliseconds (recommended)
client.hyperliquid.orderbook.history('BTC', {
  start: Date.now() - 86400000,
  end: Date.now()
});

// Date objects (converted automatically)
client.hyperliquid.orderbook.history('BTC', {
  start: new Date('2024-01-01'),
  end: new Date('2024-01-02')
});

// WebSocket replay also accepts both
ws.replay('orderbook', 'BTC', {
  start: Date.now() - 3600000,
  end: Date.now(),
  speed: 10
});
```

## Error Handling

```typescript
import { OxArchive, OxArchiveError } from '@0xarchive/sdk';

try {
  const orderbook = await client.orderbook.get('INVALID');
} catch (error) {
  if (error instanceof OxArchiveError) {
    console.error(`API Error: ${error.message}`);
    console.error(`Status Code: ${error.code}`);
    console.error(`Request ID: ${error.requestId}`);
  }
}
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type {
  OrderBook,
  PriceLevel,
  Trade,
  Candle,
  Instrument,
  LighterInstrument,
  Hip3Instrument,
  LighterGranularity,
  FundingRate,
  OpenInterest,
  Liquidation,
  LiquidationVolume,
  CoinFreshness,
  CoinSummary,
  PriceSnapshot,
  CursorResponse,
  WsOptions,
  WsChannel,
  WsConnectionState,
  WsReplaySnapshot,
  // Orderbook reconstruction (Enterprise)
  OrderbookDelta,
  TickData,
  ReconstructedOrderBook,
  ReconstructOptions,
  TickHistoryParams,
} from '@0xarchive/sdk';

// Import reconstructor class
import { OrderBookReconstructor } from '@0xarchive/sdk';
```

## Runtime Validation

Enable Zod schema validation for API responses:

```typescript
const client = new OxArchive({
  apiKey: '0xa_your_api_key',
  validate: true  // Enable runtime validation
});
```

When enabled, responses are validated against Zod schemas and throw `OxArchiveError` with status 422 if validation fails.

## Bulk Data Downloads

For large-scale data exports (full order books, complete trade history, etc.), use the S3 Parquet bulk export available at [0xarchive.io/data](https://0xarchive.io/data). The Data Explorer lets you select time ranges, symbols, and data types, then download compressed Parquet files directly.

## Requirements

- Node.js 18+ or modern browsers with `fetch` and `WebSocket` support

## License

MIT
