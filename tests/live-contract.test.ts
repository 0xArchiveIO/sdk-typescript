/**
 * Read-only checks of the API contract against the live API.
 *
 * Skipped unless OXA_API_KEY is set, e.g.
 *   OXA_API_KEY=0xa_... npx vitest run tests/live-contract.test.ts
 * Optional: OXA_BASE_URL (default https://api.0xarchive.io) and OXA_WS_URL
 * (default wss://api.0xarchive.io/ws).
 */
import { describe, expect, it } from 'vitest';
import { OxArchive, OxArchiveError, OxArchiveWs, WS_CHANNEL_CAPABILITIES } from '../src';
import type { WsChannel, WsError, WsServerMessage } from '../src';

const apiKey = process.env.OXA_API_KEY;
const baseUrl = process.env.OXA_BASE_URL ?? 'https://api.0xarchive.io';
const wsUrl = process.env.OXA_WS_URL ?? 'wss://api.0xarchive.io/ws';

const client = () => new OxArchive({ apiKey: apiKey!, baseUrl, validate: true, timeout: 60_000 });
const HOUR = 3_600_000;

describe.skipIf(!apiKey)('live API contract', () => {
  it('capabilities agree with the SDK channel table', async () => {
    const rows = await client().capabilities();
    const rowOf = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      for (const channel of row.wsChannels) rowOf.set(channel, row);
    }
    // Every channel the API lists is in the table, with its venue, datatype and modes.
    for (const [channel, row] of rowOf) {
      expect(WS_CHANNEL_CAPABILITIES[channel as WsChannel], channel).toMatchObject({
        venue: row.venue,
        datatype: row.datatype,
        live: row.live,
        replay: row.replay,
      });
    }
    // A table channel the API lists on no row is REST only: its datatype's
    // row exists, and the channel neither streams nor replays.
    for (const [channel, capability] of Object.entries(WS_CHANNEL_CAPABILITIES)) {
      if (rowOf.has(channel)) continue;
      const row = rows.find((r) => r.venue === capability.venue && r.datatype === capability.datatype);
      expect(row, channel).toBeDefined();
      expect({ live: capability.live, replay: capability.replay }, channel).toEqual({ live: false, replay: false });
    }
    expect(rows.find((r) => r.venue === 'hip3' && r.datatype === 'trades')?.availableFrom).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('trades history filters by side and returns hasMore and meta', async () => {
    const end = Date.now() - HOUR;
    const page = await client().hyperliquid.trades.history('BTC', { start: end - HOUR, end, limit: 50, side: 'buy' });
    expect(page.data.length).toBeGreaterThan(0);
    expect(new Set(page.data.map((t) => t.side))).toEqual(new Set(['B']));
    expect(typeof page.hasMore).toBe('boolean');
    expect(page.meta).toMatchObject({ symbol: 'BTC', venue: 'hyperliquid' });
    if (page.hasMore) expect(typeof page.nextCursor).toBe('string');
  });

  it('recent trades filter by side (Spot)', async () => {
    const trades = await client().spot.trades.recent('HYPE-USDC', { limit: 20, side: 'sell' });
    expect(new Set(trades.map((t) => t.side))).toEqual(new Set(['A']));
  });

  it('order history filters trigger events', async () => {
    const end = Date.now();
    const page = await client().hyperliquid.orders.history('BTC', { start: end - HOUR / 2, end, limit: 50, triggered: true });
    expect(page.data.every((o: { status: string }) => o.status === 'triggered')).toBe(true);
  });

  it('full-depth L2 history honors depth', async () => {
    const end = Date.now();
    const page = await client().hyperliquid.l2Orderbook.history('BTC', { start: end - 3 * HOUR, end, limit: 2, depth: 3 });
    expect(page.data.length).toBeGreaterThan(0);
    for (const snapshot of page.data) {
      expect(snapshot.bids.length).toBeLessThanOrEqual(3);
      expect(snapshot.asks.length).toBeLessThanOrEqual(3);
    }
  });

  it('CVD and levels history use RFC 3339 with *Ms integers', async () => {
    const c = client();
    const cvd = await c.hyperliquid.cvd.history('BTC', { interval: '1h', limit: 2 });
    expect(cvd.data[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(Date.parse(cvd.data[0]!.timestamp)).toBe(cvd.data[0]!.timestampMs);
    const levels = await c.hyperliquid.liquidations.levelsHistory('BTC', { summary: true, limit: 1 });
    expect(Date.parse(levels.data[0]!.snapshotTs)).toBe(levels.data[0]!.snapshotTsMs);
  });

  it('data quality and symbols read the version envelope', async () => {
    const c = client();
    const status = await c.dataQuality.status();
    expect(typeof status.status).toBe('string');
    expect(status.exchanges).toBeTypeOf('object');
    const symbols = await c.symbols.list();
    expect(symbols.length).toBeGreaterThan(100);
    expect(symbols.some((s) => s.exchange === 'hip3')).toBe(true);
  });

  it('errors carry errorCode, param and validValues', async () => {
    const error = await client()
      .hyperliquid.candles.history('BTC', { start: Date.now() - HOUR, end: Date.now(), interval: '7m' as any })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OxArchiveError);
    expect(error).toMatchObject({ status: 400, errorCode: 'invalid_interval', param: 'interval' });
    expect((error as OxArchiveError).validValues).toContain('1h');
    expect((error as OxArchiveError).requestId).toBeTruthy();

    const unknownSymbol = await client()
      .hyperliquid.trades.history('NOTACOIN', { start: Date.now() - HOUR, end: Date.now() })
      .catch((e: unknown) => e);
    expect(unknownSymbol).toMatchObject({ status: 400, errorCode: 'invalid_symbol', param: 'symbol' });
  });

  it('the WebSocket connects with the version, replays HIP-3 L4 in bulk, and sends coded errors', async () => {
    const ws = new OxArchiveWs({ apiKey: apiKey!, wsUrl, autoReconnect: false });
    const messages: WsServerMessage[] = [];
    const errors: WsError[] = [];
    ws.on('onMessage', (message) => messages.push(message));
    ws.onServerError((error) => errors.push(error));
    await ws.connect();

    const start = Date.now() - 3 * HOUR;
    ws.replay('hip3_l4_diffs', 'xyz:SP500', { start, end: start + 60_000 });
    ws.subscribe('no_such_channel' as WsChannel, 'BTC');

    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline && !(messages.some((m) => m.type === 'replay_completed') && errors.length > 0)) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    ws.disconnect();

    const started = messages.find((m) => m.type === 'replay_started') as { version?: string } | undefined;
    expect(started?.version).toBe('2026-10-01');
    expect(messages.some((m) => m.type === 'l4_snapshot' && m.channel === 'hip3_l4_diffs')).toBe(true);
    expect(errors[0]?.errorCode).toBe('invalid_parameter');
  }, 60_000);
});
