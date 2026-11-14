/**
 * Times that describe market data can be null when the time of the data is
 * unknown: `CoinSummary.timestamp`, `TriggerLevels.asOf` and `asOfBlock`, and
 * the `timestamp` of an `l4_snapshot`. Each accepts a value, `null` and a
 * missing field, so responses with or without these fields parse.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CoinSummarySchema,
  OxArchive,
  OxArchiveWs,
  TriggerLevelsSchema,
  WsL4SnapshotSchema,
  WsServerMessageSchema,
} from '../src';
import type { CoinSummary, TriggerLevels, WsServerMessage } from '../src';

const BASE = 'https://api.example.test';

type Body = Record<string, unknown>;

const without = (record: Body, ...keys: string[]): Body =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));

function ok(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data, meta: { count: 1, request_id: 'req' } }),
  };
}

function stubFetch(data: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(ok(data));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const pathOf = (fetchMock: ReturnType<typeof vi.fn>): string =>
  new URL(String(fetchMock.mock.calls[0]?.[0])).pathname;

const SUMMARY: Body = {
  coin: 'BTC',
  timestamp: '2026-11-13T22:21:00Z',
  mark_price: '98123.5',
  oracle_price: '98120.0',
  funding_rate: '0.0000125',
  open_interest: '31234.5',
};

const TRIGGER_LEVELS: Body = {
  mid_price: 98123.5,
  as_of: '2026-11-13T22:21:05.695Z',
  as_of_block: 1220113000,
  total_bid_size: 1.5,
  total_ask_size: 4,
  levels: [
    { price_bucket: 97000, bid_count: 1, bid_size: 1.5, ask_count: 0, ask_size: 0 },
    { price_bucket: 99000, bid_count: 0, bid_size: 0, ask_count: 2, ask_size: 4 },
  ],
};

const L4_SNAPSHOT: Body = {
  type: 'l4_snapshot',
  channel: 'l4_diffs',
  coin: 'BTC',
  symbol: 'BTC',
  last_block_number: 1220113000,
  timestamp: 1794608465695,
  data: { bids: [], asks: [] },
};

const SNAPSHOT_CHANNELS = [
  'l4_diffs',
  'hip3_l4_diffs',
  'spot_l4_diffs',
  'hip4_l4_diffs',
  'orderbook_full',
  'hip3_orderbook_full',
] as const;

const FULL_DEPTH_DATA: Body = {
  bids: [{ px: 98123, sz: 1.2, n: 3 }],
  asks: [{ px: 98124, sz: 0.4, n: 1 }],
  bid_count: 1,
  ask_count: 1,
  total_bid_size: 1.2,
  total_ask_size: 0.4,
  mid_price: 98123.5,
  spread: 1,
  spread_bps: 0.1,
  is_crossed: false,
};

const snapshotOn = (channel: string): Body => ({
  ...L4_SNAPSHOT,
  channel,
  data: channel.endsWith('orderbook_full') ? FULL_DEPTH_DATA : L4_SNAPSHOT.data,
});

const CASES = [
  ['value', (b: Body, key: string, value: unknown) => ({ ...b, [key]: value })],
  ['null', (b: Body, key: string) => ({ ...b, [key]: null })],
  ['missing', (b: Body, key: string) => without(b, key)],
] as const;

describe('market summary timestamp', () => {
  afterEach(() => vi.unstubAllGlobals());

  const routes: Array<[string, (c: OxArchive) => Promise<CoinSummary>, string]> = [
    ['hyperliquid', (c) => c.hyperliquid.summary('BTC'), '/v1/hyperliquid/summary/BTC'],
    ['hip3', (c) => c.hyperliquid.hip3.summary('xyz:TSLA'), '/v1/hyperliquid/hip3/summary/xyz:TSLA'],
    ['hip4', (c) => c.hyperliquid.hip4.getSummary('0'), '/v1/hyperliquid/hip4/summary/0'],
    ['lighter', (c) => c.lighter.summary('BTC'), '/v1/lighter/summary/BTC'],
    ['rh-lighter', (c) => c.rhLighter.summary('BTC'), '/v1/rh-lighter/summary/BTC'],
  ];

  for (const [venue, call, path] of routes) {
    for (const [name, shape] of CASES) {
      for (const validate of [true, false]) {
        it(`${venue}: ${name} parses (validate ${validate})`, async () => {
          const fetchMock = stubFetch(shape(SUMMARY, 'timestamp', '2026-11-13T22:21:00Z'));
          const summary = await call(new OxArchive({ apiKey: 'k', baseUrl: BASE, validate }));
          expect(pathOf(fetchMock)).toBe(path);
          expect(summary.markPrice).toBe('98123.5');
          if (name === 'value') expect(summary.timestamp).toBe('2026-11-13T22:21:00Z');
          if (name === 'null') expect(summary.timestamp).toBeNull();
          if (name === 'missing') expect(summary.timestamp).toBeUndefined();
        });
      }
    }
  }

  it('the exported schema accepts a value, null and a missing timestamp', () => {
    const camel = { coin: 'BTC', timestamp: '2026-11-13T22:21:00Z', markPrice: '98123.5' };
    expect(CoinSummarySchema.safeParse(camel).success).toBe(true);
    expect(CoinSummarySchema.safeParse({ ...camel, timestamp: null }).success).toBe(true);
    expect(CoinSummarySchema.safeParse(without(camel, 'timestamp')).success).toBe(true);
    expect(CoinSummarySchema.safeParse({ ...camel, timestamp: 0 }).success).toBe(false);
  });
});

describe('trigger levels asOf and asOfBlock', () => {
  afterEach(() => vi.unstubAllGlobals());

  const routes: Array<[string, (c: OxArchive) => Promise<TriggerLevels>, string]> = [
    ['hyperliquid', (c) => c.hyperliquid.orders.triggerLevels('BTC'), '/v1/hyperliquid/orders/BTC/trigger-levels'],
    [
      'hip3',
      (c) => c.hyperliquid.hip3.orders.triggerLevels('xyz:TSLA'),
      '/v1/hyperliquid/hip3/orders/xyz:TSLA/trigger-levels',
    ],
  ];

  const bodies: Array<[string, Body, unknown, unknown]> = [
    ['value', TRIGGER_LEVELS, '2026-11-13T22:21:05.695Z', 1220113000],
    ['null', { ...TRIGGER_LEVELS, as_of: null, as_of_block: null }, null, null],
    ['missing', without(TRIGGER_LEVELS, 'as_of', 'as_of_block'), undefined, undefined],
    // An answer that predates as_of_block: a whole-second as_of and no block.
    [
      'without block',
      { ...without(TRIGGER_LEVELS, 'as_of_block'), as_of: '2026-11-13T22:21:05Z' },
      '2026-11-13T22:21:05Z',
      undefined,
    ],
  ];

  for (const [venue, call, path] of routes) {
    for (const [name, body, asOf, asOfBlock] of bodies) {
      for (const validate of [true, false]) {
        it(`${venue}: ${name} parses (validate ${validate})`, async () => {
          const fetchMock = stubFetch(body);
          const levels = await call(new OxArchive({ apiKey: 'k', baseUrl: BASE, validate }));
          expect(pathOf(fetchMock)).toBe(path);
          expect(levels.asOf).toBe(asOf);
          expect(levels.asOfBlock).toBe(asOfBlock);
          expect(levels.midPrice).toBe(98123.5);
          expect(levels.levels.map((l) => l.priceBucket)).toEqual([97000, 99000]);
        });
      }
    }
  }

  it('the exported schema keeps asOfBlock and accepts null and missing times', () => {
    const camel = {
      midPrice: 1,
      asOf: '2026-11-13T22:21:05.695Z',
      asOfBlock: 7,
      totalBidSize: 0,
      totalAskSize: 0,
      levels: [],
    };
    const parsed = TriggerLevelsSchema.safeParse(camel);
    expect(parsed.success && parsed.data.asOfBlock).toBe(7);
    expect(TriggerLevelsSchema.safeParse({ ...camel, asOf: null, asOfBlock: null }).success).toBe(true);
    expect(TriggerLevelsSchema.safeParse(without(camel, 'asOf', 'asOfBlock')).success).toBe(true);
    expect(TriggerLevelsSchema.safeParse({ ...camel, asOfBlock: -1 }).success).toBe(false);
  });
});

describe('l4_snapshot timestamp', () => {
  afterEach(() => vi.unstubAllGlobals());

  for (const channel of SNAPSHOT_CHANNELS) {
    for (const [name, shape] of CASES) {
      const frame = shape(snapshotOn(channel), 'timestamp', 1794608465695);

      it(`${channel}: ${name} matches the snapshot and server-message schemas`, () => {
        const parsed = WsL4SnapshotSchema.safeParse(frame);
        expect(parsed.success).toBe(true);
        expect(WsServerMessageSchema.safeParse(frame).success).toBe(true);
        if (parsed.success) {
          expect(parsed.data.timestamp).toBe(name === 'value' ? 1794608465695 : name === 'null' ? null : undefined);
        }
      });

      it(`${channel}: ${name} reaches onMessage`, async () => {
        const sockets: Array<{ onmessage: ((e: { data: string }) => void) | null; onopen: (() => void) | null }> = [];
        class FakeSocket {
          static readonly OPEN = 1;
          readyState = 1;
          onopen: (() => void) | null = null;
          onclose: (() => void) | null = null;
          onerror: (() => void) | null = null;
          onmessage: ((e: { data: string }) => void) | null = null;
          constructor() {
            sockets.push(this);
          }
          send(): void {}
          close(): void {}
        }
        vi.stubGlobal('WebSocket', FakeSocket);

        const received: WsServerMessage[] = [];
        const ws = new OxArchiveWs({ apiKey: 'k', autoReconnect: false });
        ws.on('onMessage', (message) => received.push(message));
        const opening = ws.connect();
        sockets[0]!.onopen?.();
        await opening;
        sockets[0]!.onmessage?.({ data: JSON.stringify(frame) });

        expect(received).toHaveLength(1);
        const message = received[0]!;
        expect(message.type).toBe('l4_snapshot');
        if (message.type === 'l4_snapshot') {
          expect(message.channel).toBe(channel);
          expect(message.last_block_number).toBe(1220113000);
          expect(message.timestamp).toBe(name === 'value' ? 1794608465695 : name === 'null' ? null : undefined);
        }
        ws.disconnect();
      });
    }
  }

  it('still refuses a non-integer timestamp', () => {
    expect(WsL4SnapshotSchema.safeParse({ ...L4_SNAPSHOT, timestamp: '2026-11-13' }).success).toBe(false);
    expect(WsL4SnapshotSchema.safeParse({ ...L4_SNAPSHOT, timestamp: 1.5 }).success).toBe(false);
  });
});
