import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HYPERLIQUID_L4_LIVE_ONLY_REPLAY_ERROR,
  LIGHTER_REPLAY_CHANNELS,
  LIGHTER_SUBSCRIPTION_ERROR,
  OxArchiveWs,
} from '../src/websocket';
import { WsServerMessageSchema } from '../src/schemas';
import type { WsChannel, WsL4Batch, WsL4DiffEvent, WsL4Snapshot, WsStandardReplayChannel } from '../src/types';

const lighterChannels: WsStandardReplayChannel[] = [
  'lighter_orderbook',
  'lighter_trades',
  'lighter_candles',
  'lighter_open_interest',
  'lighter_funding',
  'lighter_l3_orderbook',
];

describe('Lighter WebSocket capabilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defines exactly the six replay-only Lighter channels', () => {
    expect([...LIGHTER_REPLAY_CHANNELS].sort()).toEqual([...lighterChannels].sort());
  });

  it.each(lighterChannels)('rejects %s live subscriptions before sending', (channel) => {
    vi.stubGlobal('WebSocket', { OPEN: 1 });
    const ws = new OxArchiveWs({ apiKey: 'test-key' });
    const send = vi.fn();
    (ws as any).ws = { readyState: 1, send };

    expect(() => ws.subscribe(channel, 'BTC')).toThrow(LIGHTER_SUBSCRIPTION_ERROR);
    expect(send).not.toHaveBeenCalled();
    expect((ws as any).subscriptions.size).toBe(0);
  });

  it.each(lighterChannels)('allows %s through bounded replay', (channel) => {
    vi.stubGlobal('WebSocket', { OPEN: 1 });
    const ws = new OxArchiveWs({ apiKey: 'test-key' });
    const send = vi.fn();
    (ws as any).ws = { readyState: 1, send };

    ws.replay(channel, 'BTC', { start: 1, end: 2 });

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        op: 'replay',
        channel,
        symbol: 'BTC',
        start: 1,
        end: 2,
        speed: 1,
        granularity: undefined,
        interval: undefined,
      }),
    );
  });

  it('keeps Hyperliquid live subscriptions unchanged', () => {
    vi.stubGlobal('WebSocket', { OPEN: 1 });
    const ws = new OxArchiveWs({ apiKey: 'test-key' });
    const send = vi.fn();
    (ws as any).ws = { readyState: 1, send };

    ws.subscribe('orderbook', 'BTC');

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ op: 'subscribe', channel: 'orderbook', symbol: 'BTC' }),
    );
  });

  it('accepts the core L4 replay snapshot and ordered batch event shapes', () => {
    const snapshot: WsL4Snapshot = {
      type: 'l4_snapshot',
      channel: 'l4_diffs',
      coin: 'BTC',
      symbol: 'BTC',
      last_block_number: 100,
      timestamp: 1_700_000_000_000,
      data: {
        bids: [['0xabc', { oid: 1, sz: '2' }]],
        asks: [],
      },
    };
    const batch: WsL4Batch<WsL4DiffEvent> = {
      type: 'l4_batch',
      channel: 'l4_diffs',
      coin: 'BTC',
      symbol: 'BTC',
      data: [{
        timestamp: 1_700_000_000_001,
        block_number: 101,
        seq: 2,
        oid: 1,
        user: '0xabc',
        side: 'B',
        price: 100,
        diff_type: 'update',
        new_size: 1,
        insert_before: null,
      }],
    };

    expect(WsServerMessageSchema.safeParse(snapshot).success).toBe(true);
    expect(WsServerMessageSchema.safeParse(batch).success).toBe(true);
    expect(batch.data[0]?.block_number).toBe(101);
    expect(batch.data[0]?.seq).toBe(2);
  });

  it('sends bounded core L4 replay requests and requires end', () => {
    vi.stubGlobal('WebSocket', { OPEN: 1 });
    const ws = new OxArchiveWs({ apiKey: 'test-key' });
    const send = vi.fn();
    (ws as any).ws = { readyState: 1, send };

    ws.replay('l4_orders', 'BTC', { start: 1, end: 2 });
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        op: 'replay',
        channel: 'l4_orders',
        symbol: 'BTC',
        start: 1,
        end: 2,
        speed: 1,
        granularity: undefined,
        interval: undefined,
      }),
    );
    expect(() => (ws.replay as any)('l4_diffs', 'BTC', { start: 1 }))
      .toThrow('Hyperliquid core L4 replay requires an explicit end timestamp.');
  });

  it.each([
    'hip3_l4_diffs',
    'hip3_l4_orders',
    'hip4_l4_diffs',
    'hip4_l4_orders',
    'spot_l4_diffs',
    'spot_l4_orders',
  ] as WsChannel[])('rejects %s replay because the channel is live-only', (channel) => {
    vi.stubGlobal('WebSocket', { OPEN: 1 });
    const ws = new OxArchiveWs({ apiKey: 'test-key' });
    const send = vi.fn();
    (ws as any).ws = { readyState: 1, send };

    expect(() => (ws.replay as any)(channel, 'BTC', { start: 1, end: 2 }))
      .toThrow(HYPERLIQUID_L4_LIVE_ONLY_REPLAY_ERROR);
    expect(send).not.toHaveBeenCalled();
  });
});
