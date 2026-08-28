import { readFileSync } from 'node:fs';
import { OxArchive } from '../src';

const readRepoFile = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('HIP-4 candles and coverage contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the primary bare numeric HIP-4 candle path and preserves numeric-string cursors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [
          {
            timestamp: '2026-05-02T08:00:00Z',
            open: 0.2,
            high: 0.3,
            low: 0.1,
            close: 0.25,
            volume: 10,
          },
        ],
        meta: {
          count: 1,
          next_cursor: '1777708860000',
          request_id: 'request-1',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new OxArchive({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.test',
    });
    const result = await client.hyperliquid.hip4.candles.history('0', {
      start: '2026-05-02T08:00:00Z',
      end: '2026-05-02T09:00:00Z',
      interval: '1m',
    });

    expect(result).toEqual({
      data: [
        {
          timestamp: '2026-05-02T08:00:00Z',
          open: 0.2,
          high: 0.3,
          low: 0.1,
          close: 0.25,
          volume: 10,
        },
      ],
      nextCursor: '1777708860000',
    });

    const [requestUrl] = fetchMock.mock.calls[0] as [string];
    const url = new URL(requestUrl);
    expect(url.pathname).toBe('/v1/hyperliquid/hip4/candles/0');
    expect(url.searchParams.get('interval')).toBe('1m');
    expect(url.searchParams.get('start')).toBe(String(Date.parse('2026-05-02T08:00:00Z')));
    expect(url.searchParams.get('end')).toBe(String(Date.parse('2026-05-02T09:00:00Z')));

    await client.hyperliquid.hip4.candles.history('#0', {
      start: '2026-05-02T08:00:00Z',
      end: '2026-05-02T09:00:00Z',
      interval: '1m',
    });
    const legacyUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(legacyUrl.pathname).toBe('/v1/hyperliquid/hip4/candles/%230');
  });

  it('preserves a numeric-string cursor across authenticated Spot candle pagination', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [{
            timestamp: '2025-03-22T10:50:22Z',
            open: 18.2,
            high: 18.4,
            low: 18.1,
            close: 18.3,
            volume: 42,
          }],
          meta: {
            count: 1,
            next_cursor: '1742642422000',
            request_id: 'request-spot-candles-1',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [],
          meta: { count: 0, request_id: 'request-spot-candles-2' },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = new OxArchive({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.test',
      validate: true,
    });
    const first = await client.spot.candles.history('hype-usdc', {
      start: '2025-03-22T10:50:22Z',
      end: '2025-03-22T11:20:22Z',
      interval: '5m',
      limit: 1000,
    });
    const second = await client.spot.candles.history('hype-usdc', {
      start: '2025-03-22T10:50:22Z',
      end: '2025-03-22T11:20:22Z',
      interval: '5m',
      cursor: first.nextCursor,
      limit: 1000,
    });

    expect(first.data[0]).toMatchObject({
      timestamp: '2025-03-22T10:50:22Z',
      close: 18.3,
      volume: 42,
    });
    expect(first.nextCursor).toBe('1742642422000');
    expect(second.data).toEqual([]);

    const firstUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(firstUrl.pathname).toBe('/v1/hyperliquid/spot/candles/HYPE-USDC');
    expect(firstUrl.searchParams.get('interval')).toBe('5m');
    expect(firstUrl.searchParams.get('limit')).toBe('1000');
    expect(firstUrl.searchParams.get('cursor')).toBeNull();
    expect(firstUrl.searchParams.get('start')).toBe(String(Date.parse('2025-03-22T10:50:22Z')));
    expect(firstUrl.searchParams.get('end')).toBe(String(Date.parse('2025-03-22T11:20:22Z')));

    const secondUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(secondUrl.pathname).toBe('/v1/hyperliquid/spot/candles/HYPE-USDC');
    expect(secondUrl.searchParams.get('cursor')).toBe('1742642422000');
  });

  it('enforces route-specific candle limits before issuing a request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [],
        meta: { count: 0, request_id: 'request-candle-limit' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new OxArchive({ apiKey: 'fake-key', baseUrl: 'https://api.example.test' });
    const params = {
      start: '2026-05-02T08:00:00Z',
      end: '2026-05-02T09:00:00Z',
      interval: '1m' as const,
    };

    await expect(client.spot.candles.history('HYPE-USDC', { ...params, limit: 1001 }))
      .rejects.toThrow('limit must be between 1 and 1000');
    await expect(client.hyperliquid.hip3.candles.history('xyz:XYZ100', { ...params, limit: 10_001 }))
      .rejects.toThrow('limit must be between 1 and 10000');
    await client.hyperliquid.hip3.candles.history('xyz:XYZ100', { ...params, limit: 10_000 });
    await client.hyperliquid.candles.history('BTC', { ...params, limit: 10_000 });
    await client.lighter.candles.history('BTC', { ...params, limit: 10_000 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('preserves HIP-4 per-side OI identity fields through validation', async () => {
    const record = {
      coin: '#0',
      symbol: '#0',
      outcome_id: 0,
      side: 0,
      timestamp: '2026-05-02T08:00:00Z',
      open_interest: '568048',
      mark_price: '0.6502',
      mid_price: '0.65038',
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [record],
          meta: { count: 1, next_cursor: '1777708860000', request_id: 'request-oi-history' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: record,
          meta: { count: 1, request_id: 'request-oi-current' },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = new OxArchive({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.test',
      validate: true,
    });
    const history = await client.hyperliquid.hip4.openInterest.history('#0', {
      start: '2026-05-02T08:00:00Z',
      end: '2026-05-02T09:00:00Z',
      interval: '5m',
    });
    const current = await client.hyperliquid.hip4.openInterest.current('#0');

    expect(history.data[0]).toMatchObject({
      symbol: '#0',
      outcomeId: 0,
      side: 0,
      openInterest: '568048',
      markPrice: '0.6502',
      midPrice: '0.65038',
    });
    expect(current).toMatchObject({
      symbol: '#0',
      outcomeId: 0,
      side: 0,
    });

    const paths = fetchMock.mock.calls.map(([request]) => new URL(String(request)).pathname);
    expect(paths).toEqual([
      '/v1/hyperliquid/hip4/openinterest/%230',
      '/v1/hyperliquid/hip4/openinterest/%230/current',
    ]);
  });

  it('retains Lighter candle history while exposing HIP-4 candles', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [{
          timestamp: '2026-05-02T08:00:00Z',
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 12,
        }],
        meta: { count: 1, request_id: 'request-lighter-candles' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new OxArchive({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.test',
    });
    const result = await client.lighter.candles.history('BTC', {
      start: '2026-05-02T08:00:00Z',
      end: '2026-05-02T09:00:00Z',
      interval: '15m',
    });

    expect(result.data[0]?.close).toBe(100.5);
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe('/v1/lighter/candles/BTC');
    expect(readRepoFile('README.md')).toContain('client.lighter.candles.history');
  });

  it('keeps HIP-4 funding absent while documenting served candle and OI coverage', () => {
    const readme = readRepoFile('README.md');
    const types = readRepoFile('src/types.ts');
    const exchanges = readRepoFile('src/exchanges.ts');
    const candleResource = readRepoFile('src/resources/candles.ts');
    const hip4SectionStart = readme.indexOf('#### HIP-4 Outcome Markets');
    const hip4SectionEnd = readme.indexOf('#### Hyperliquid Spot');
    const hip4Section = readme.slice(hip4SectionStart, hip4SectionEnd);

    expect(hip4Section).toContain('client.hyperliquid.hip4.candles.history');
    expect(hip4Section).toContain('2026-05-02');
    expect(hip4Section).toContain('~10s');
    expect(hip4Section).toMatch(/no HIP-4 funding/i);
    expect(hip4Section).not.toMatch(/no candles/i);
    expect(readme).not.toContain('All schemas on every tier');
    expect(`${readme}\n${types}`).not.toContain('raw ~1 min');
    expect(readme).toContain('250 orders per side');
    expect(readme).toContain('Candles served from 2025-08-01');
    expect(readme).toContain('March 5, 2026+');
    expect(readme).toContain('exact starts vary by market');
    expect(readme).toContain('individual resting orders');
    const l3SectionStart = readme.indexOf('### L3 Order Book (Lighter only)');
    const l3SectionEnd = readme.indexOf('### L2 Order Book (Full-Depth)');
    const l3Section = readme.slice(l3SectionStart, l3SectionEnd);
    expect(l3Section).toContain('2026-03-05T00:00:00Z');
    expect(l3Section).not.toContain('1704067200000');
    expect(readme).not.toContain('tick-level individual order detail');
    expect(readme).toContain('live bridges are paused');
    expect(types).toContain('stored replay only; live bridges paused');
    expect(types).toContain('The SDK URL-encodes `#` to `%23` on the wire');
    expect(types).not.toContain('it does NOT auto-encode `#`');
    expect(readme).toMatch(/Per fill.*maker.*taker/i);
    expect(exchanges).toContain('public readonly candles: CandlesResource;');
    expect(exchanges).toContain("new CandlesResource(http, basePath, coinTransform, 10_000)");
    expect(hip4Section).not.toMatch(/HIP-4[\s\S]{0,220}no candles by design/i);

    const spotSectionStart = readme.indexOf('#### Hyperliquid Spot');
    const spotSectionEnd = readme.indexOf('### Funding Rates');
    const spotSection = readme.slice(spotSectionStart, spotSectionEnd);
    expect(spotSection).toContain('GET /v1/hyperliquid/spot/candles/{symbol}');
    expect(spotSection).toContain('client.spot.candles.history');
    expect(spotSection).toContain('2025-03-22T10:50:22Z');
    expect(spotSection).toContain('numeric-string pagination cursors');
    expect(spotSection).not.toMatch(/no funding,[\s\S]{0,80}no candles/i);
    expect(types).toContain('SpotClient.candles');
    expect(exchanges).toContain('2025-03-22T10:50:22Z');
    expect(candleResource).toContain('10,000 for core Hyperliquid, HIP-3, and Lighter');
    expect(candleResource).toContain('1,000 for HIP-4 and Hyperliquid Spot');
    expect(candleResource).not.toContain('maximum `limit` of 1000');
    expect(types).toContain('10,000 for core');
    expect(types).toContain('Hyperliquid, HIP-3, and Lighter');
    expect(types).toContain('1,000 for HIP-4 and Hyperliquid Spot');
    expect(types).not.toContain('accept up to 1000 rows per request');
  });

  it('exposes Spot candles while keeping perp-only resources absent', () => {
    const client = new OxArchive({ apiKey: 'test-key' });

    expect(client.spot.candles).toBeDefined();
    expect('funding' in client.spot).toBe(false);
    expect('openInterest' in client.spot).toBe(false);
    expect('liquidations' in client.spot).toBe(false);
  });

  it('does not expose a HIP-4 funding resource', () => {
    const client = new OxArchive({ apiKey: 'test-key' });

    expect('funding' in client.hyperliquid.hip4).toBe(false);
  });
});
