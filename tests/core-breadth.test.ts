import { afterEach, describe, expect, it, vi } from 'vitest';
import { OxArchive } from '../src';

const snapshot = {
  session_date: '2026-09-29',
  calculated_at: '2026-09-29T04:00:00Z',
  value_pct: 41.5,
  coverage_ratio: 0.93,
  counts: { candidates: 200, eligible: 186, above: 77, at: 0, below: 109, excluded_no_session_volume: 10, excluded_stale_price: 4 },
  namespaces: { eligible: {}, above: {}, at: {}, below: {} },
};

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body,
  text: async () => JSON.stringify(body),
});

afterEach(() => vi.unstubAllGlobals());

describe('core Hyperliquid breadth', () => {
  it('reads /v1/hyperliquid/breadth/above-vwap for current and history', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({ success: true, data: snapshot, meta: { count: 1, request_id: 'c' } }))
      .mockResolvedValueOnce(ok({ success: true, data: [snapshot], meta: { count: 1, request_id: 'h', next_cursor: '1790650800000' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: 'https://api.example.test', validate: true });

    const current = await client.hyperliquid.breadth.current();
    const history = await client.hyperliquid.breadth.history({ start: 1790640000000, end: 1790650800000, interval: '1h' });

    expect(current.valuePct).toBe(41.5);
    expect(history.nextCursor).toBe('1790650800000');
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe('/v1/hyperliquid/breadth/above-vwap/current');
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).pathname).toBe('/v1/hyperliquid/breadth/above-vwap');
  });
});
