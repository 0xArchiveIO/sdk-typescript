import { readFileSync } from 'node:fs';
import { OxArchive } from '../src';

const readRepoFile = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('HIP-4 candles and coverage contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes typed HIP-4 candle history and encodes canonical coin paths', async () => {
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
          next_cursor: 'next-cursor',
          request_id: 'request-1',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new OxArchive({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.test',
    });
    const result = await client.hyperliquid.hip4.candles.history('#0', {
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
      nextCursor: 'next-cursor',
    });

    const [requestUrl] = fetchMock.mock.calls[0] as [string];
    const url = new URL(requestUrl);
    expect(url.pathname).toBe('/v1/hyperliquid/hip4/candles/%230');
    expect(url.searchParams.get('interval')).toBe('1m');
    expect(url.searchParams.get('start')).toBe('2026-05-02T08:00:00Z');
    expect(url.searchParams.get('end')).toBe('2026-05-02T09:00:00Z');
  });

  it('keeps HIP-4 funding absent while documenting served candle and OI coverage', () => {
    const readme = readRepoFile('README.md');
    const types = readRepoFile('src/types.ts');
    const exchanges = readRepoFile('src/exchanges.ts');
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
    expect(readme).toContain('March 5, 2026+');
    expect(readme).toContain('exact starts vary by market');
    expect(readme).toContain('individual resting orders');
    expect(readme).not.toContain('tick-level individual order detail');
    expect(readme).toContain('live bridge paused');
    expect(types).toContain('stored replay only; live bridges paused');
    expect(readme).toMatch(/Per fill.*maker.*taker/i);
    expect(exchanges).toContain('public readonly candles: CandlesResource;');
    expect(exchanges).toContain("new CandlesResource(http, basePath, coinTransform)");
    expect(exchanges).not.toMatch(/HIP-4[\s\S]{0,220}no candles by design/i);
  });

  it('does not expose a HIP-4 funding resource', () => {
    const client = new OxArchive({ apiKey: 'test-key' });

    expect('funding' in client.hyperliquid.hip4).toBe(false);
  });
});
