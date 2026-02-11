# @0xarchive/sdk

Official TypeScript/JavaScript SDK for [0xarchive](https://0xarchive.io) - Historical Market Data API.

Supports multiple exchanges:
- **Hyperliquid** - Perpetuals data from April 2023
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

const client = new OxArchive({ apiKey: 'ox_your_api_key' });

// Hyperliquid data
const hlOrderbook = await client.hyperliquid.orderbook.get('BTC');
console.log(`Hyperliquid BTC mid price: ${hlOrderbook.midPrice}`);

// Lighter.xyz data
const lighterOrderbook = await client.lighter.orderbook.get('BTC');
console.log(`Lighter BTC mid price: ${lighterOrderbook.midPrice}`);

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
  apiKey: 'ox_your_api_key',       // Required
  baseUrl: 'https://api.0xarchive.io',  // Optional
  timeout: 30000,                   // Optional, request timeout in ms (default: 30000)
  validate: false,                  // Optional, enable Zod schema validation
});
```

## REST API Reference

All examples use `client.hyperliquid.*` but the same methods are available on `client.lighter.*` for Lighter.xyz data.

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

**Note:** The `recent()` method is only available for Lighter.xyz (`client.lighter.trades.recent()`). Hyperliquid does not have a recent trades endpoint - use `list()` with a time range instead.

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

### Funding Rates

```typescript
// Get current funding rate
const current = await client.hyperliquid.funding.current('BTC');

// Get funding rate history (start is required)
const history = await client.hyperliquid.funding.history('ETH', {
  start: Date.now() - 86400000 * 7,
  end: Date.now()
});
```

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
```

### Liquidations (Hyperliquid only)

Get historical liquidation events. Data available from May 2025 onwards.

```typescript
// Get liquidation history for a coin
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
  apiKey: 'ox_your_api_key',
  timeout: 60000  // 60 seconds for data quality endpoints
});
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

The WebSocket client supports three modes: real-time streaming, historical replay, and bulk streaming.

```typescript
import { OxArchiveWs } from '@0xarchive/sdk';

const ws = new OxArchiveWs({ apiKey: 'ox_your_api_key' });
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

### Bulk Streaming

Fast bulk download for data pipelines. Data arrives in batches without timing delays.

```typescript
const ws = new OxArchiveWs({ apiKey: 'ox_...' });
ws.connect();

const allData: OrderBook[] = [];

// Handle batched data
ws.onBatch((coin, records) => {
  allData.push(...records.map(r => r.data));
});

ws.onStreamProgress((snapshotsSent) => {
  console.log(`Progress: ${snapshotsSent} snapshots`);
});

ws.onStreamComplete((channel, coin, recordsSent) => {
  console.log(`Downloaded ${recordsSent} records`);
});

// Start bulk stream
ws.stream('orderbook', 'ETH', {
  start: Date.now() - 3600000,  // 1 hour ago
  end: Date.now(),
  batchSize: 1000               // Optional, defaults to 1000
});

// Lighter.xyz stream with granularity (tier restrictions apply)
ws.stream('orderbook', 'BTC', {
  start: Date.now() - 3600000,
  end: Date.now(),
  granularity: '10s'  // Options: 'checkpoint', '30s', '10s', '1s', 'tick'
});

// Stop if needed
ws.streamStop();
```

### Gap Detection

During historical replay and bulk streaming, the server automatically detects gaps in the data and notifies the client. This helps identify periods where data may be missing.

```typescript
// Handle gap notifications during replay/stream
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
  apiKey: 'ox_your_api_key',          // Required
  wsUrl: 'wss://api.0xarchive.io/ws', // Optional
  autoReconnect: true,                // Auto-reconnect on disconnect (default: true)
  reconnectDelay: 1000,               // Initial reconnect delay in ms (default: 1000)
  maxReconnectAttempts: 10,           // Max reconnect attempts (default: 10)
  pingInterval: 30000,                // Keep-alive ping interval in ms (default: 30000)
});
```

### Available Channels

| Channel | Description | Requires Coin | Historical Support |
|---------|-------------|---------------|-------------------|
| `orderbook` | L2 order book updates | Yes | Yes |
| `trades` | Trade/fill updates | Yes | Yes |
| `candles` | OHLCV candle data | Yes | Yes (replay/stream only) |
| `liquidations` | Liquidation events (May 2025+) | Yes | Yes (replay/stream only) |
| `ticker` | Price and 24h volume | Yes | Real-time only |
| `all_tickers` | All market tickers | No | Real-time only |

#### Candle Replay/Stream

```typescript
// Replay candles at 10x speed
ws.replay('candles', 'BTC', {
  start: Date.now() - 86400000,
  end: Date.now(),
  speed: 10,
  interval: '15m'  // 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
});

// Bulk stream candles
ws.stream('candles', 'ETH', {
  start: Date.now() - 3600000,
  end: Date.now(),
  batchSize: 1000,
  interval: '1h'
});

// Lighter.xyz candles
ws.replay('lighter_candles', 'BTC', {
  start: Date.now() - 86400000,
  speed: 10,
  interval: '5m'
});
```

### WebSocket Connection States

```typescript
ws.getState(); // 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
ws.isConnected(); // boolean
```

## Timestamp Formats

The SDK accepts timestamps as Unix milliseconds or Date objects:

```typescript
// Unix milliseconds (recommended)
client.orderbook.history('BTC', {
  start: Date.now() - 86400000,
  end: Date.now()
});

// Date objects (converted automatically)
client.orderbook.history('BTC', {
  start: new Date('2024-01-01'),
  end: new Date('2024-01-02')
});

// WebSocket replay/stream also accepts both
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
  LighterGranularity,
  FundingRate,
  OpenInterest,
  Liquidation,
  CursorResponse,
  WsOptions,
  WsChannel,
  WsConnectionState,
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
  apiKey: 'ox_your_api_key',
  validate: true  // Enable runtime validation
});
```

When enabled, responses are validated against Zod schemas and throw `OxArchiveError` with status 422 if validation fails.

## Requirements

- Node.js 18+ or modern browsers with `fetch` and `WebSocket` support

## License

MIT
