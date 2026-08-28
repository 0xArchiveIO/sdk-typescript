import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LIGHTER_REPLAY_CHANNELS,
  LIGHTER_SUBSCRIPTION_ERROR,
  OxArchiveWs,
} from '../src/websocket';
import type { WsChannel } from '../src/types';

const lighterChannels: WsChannel[] = [
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
});
