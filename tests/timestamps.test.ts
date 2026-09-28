// Times without a time zone are UTC, whatever the machine's local zone. The
// whole file runs with the process time zone set to America/New_York (UTC-4
// in September), where a date-time read as local time is four hours late.
process.env.TZ = 'America/New_York';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { OxArchive } from '../src';
import { toUnixMs } from '../src/time';

const SEPT_1_UTC = 1_788_220_800_000; // 2026-09-01T00:00:00Z
const SEPT_1_NOON_UTC = 1_788_264_000_000; // 2026-09-01T12:00:00Z

function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: [], meta: { count: 0, request_id: 'req' } }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sent(fetchMock: ReturnType<typeof vi.fn>, call: number): Record<string, string> {
  return Object.fromEntries(new URL(String(fetchMock.mock.calls[call]?.[0])).searchParams.entries());
}

describe('times without a time zone are UTC', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs in a zone where local time differs from UTC', () => {
    // Date.parse reads an offset-less date-time as local time: 04:00 UTC here.
    expect(Date.parse('2026-09-01T00:00:00')).toBe(SEPT_1_UTC + 4 * 3_600_000);
  });

  it.each([
    '2026-09-01',
    '2026-09-01T00:00:00',
    '2026-09-01T00:00:00.000',
    '2026-09-01 00:00:00',
    '2026-09-01T00:00',
    '2026-09-01T00:00:00Z',
    '2026-09-01T00:00:00+00:00',
    '2026-08-31T20:00:00-04:00',
    '1788220800000',
    ' 1788220800000 ',
  ])('reads %s as 2026-09-01T00:00:00Z', (value) => {
    expect(toUnixMs(value)).toBe(SEPT_1_UTC);
  });

  it('keeps numbers and Dates as they are and refuses anything else', () => {
    expect(toUnixMs(SEPT_1_UTC)).toBe(SEPT_1_UTC);
    expect(toUnixMs(new Date(Date.UTC(2026, 8, 1)))).toBe(SEPT_1_UTC);
    expect(toUnixMs('2026-09-01T12:00:00.123')).toBe(SEPT_1_NOON_UTC + 123);
    expect(() => toUnixMs('yesterday', 'start')).toThrow('start must be Unix milliseconds');
    expect(() => toUnixMs(Number.NaN, 'end')).toThrow(TypeError);
  });

  it('sends offset-less time strings as UTC milliseconds on every route', async () => {
    const fetchMock = stubFetch();
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: 'https://api.example.test' });

    await client.hyperliquid.trades.list('BTC', { start: '2026-09-01', end: '2026-09-01T12:00:00' });
    await client.lighter.funding.history('BTC', { start: '2026-09-01T00:00:00', end: '2026-09-01 12:00:00' });
    await client.hyperliquid.orderbook.get('BTC', { timestamp: '2026-09-01T12:00:00' });
    await client.hyperliquid.candles.history('BTC', { start: '2026-09-01', end: '2026-09-01T12:00:00' });
    await client.rhLighter.positions.changes(7, { start: '2026-09-01', end: '2026-09-01T12:00:00' });
    await client.hyperliquid.positions.market('BTC', { hour: '2026-09-01T12:00:00' });
    await client.hyperliquid.trades.list('BTC', { start: SEPT_1_UTC, end: SEPT_1_NOON_UTC, cursor: '1788220800123' });

    const window = { start: String(SEPT_1_UTC), end: String(SEPT_1_NOON_UTC) };
    expect(sent(fetchMock, 0)).toEqual(window);
    expect(sent(fetchMock, 1)).toEqual(window);
    expect(sent(fetchMock, 2)).toEqual({ timestamp: String(SEPT_1_NOON_UTC) });
    expect(sent(fetchMock, 3)).toEqual(window);
    expect(sent(fetchMock, 4)).toEqual(window);
    expect(sent(fetchMock, 5)).toEqual({ hour: String(SEPT_1_NOON_UTC) });
    // Cursors are opaque and pass through unchanged.
    expect(sent(fetchMock, 6)).toEqual({ ...window, cursor: '1788220800123' });
  });
});
