import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readRepoFile = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const section = (text: string, start: string, end: string): string => {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  expect(from, `missing section ${start}`).toBeGreaterThanOrEqual(0);
  expect(to, `missing end marker ${end}`).toBeGreaterThan(from);
  return text.slice(from, to);
};

describe('1.12.0 release surface', () => {
  const readme = readRepoFile('README.md');
  const changelog = readRepoFile('CHANGELOG.md');
  const pkg = JSON.parse(readRepoFile('package.json')) as { version: string; files: string[] };

  it('carries one aligned version', () => {
    expect(pkg.version).toBe('1.12.0');
    expect(changelog.indexOf('## 1.12.0')).toBeLessThan(changelog.indexOf('## 1.11.0'));
  });

  it('keeps the package contents allowlist unchanged', () => {
    expect(pkg.files).toEqual(['dist', 'README.md']);
  });

  it('presents Robinhood Chain as a second Lighter deployment, never a third venue', () => {
    expect(readme).toContain('two venues: Hyperliquid and Lighter');
    expect(readme).toContain('Lighter has two deployments: mainnet (`/v1/lighter`) and Robinhood Chain (`/v1/rh-lighter`)');
    expect(`${readme}\n${changelog}`).not.toMatch(/third venue|three venues/i);
    expect(changelog).toContain('the second deployment of Lighter');
  });

  it('documents Robinhood Chain coverage and channels', () => {
    const rest = section(readme, '### Lighter on Robinhood Chain', '### Account Positions');
    expect(rest).toContain('2026-06-26 20:10:26 UTC');
    expect(rest).toContain('2026-08-22 18:43 UTC');
    expect(rest).toContain('USDG');
    expect(rest).toContain('`AAPL-USDG`');
    expect(rest).toContain('L3 order book | Not available');
    const ws = section(readme, '#### Lighter on Robinhood Chain Channels', '#### Candle Replay');
    for (const channel of [
      'rh_lighter_orderbook',
      'rh_lighter_trades',
      'rh_lighter_open_interest',
      'rh_lighter_funding',
      'rh_lighter_candles',
    ]) {
      expect(ws).toContain(`\`${channel}\``);
    }
    expect(ws).toContain('not on `wss://stream.0xarchive.io/ws`');
  });

  it('documents account positions coverage, semantics and billing', () => {
    const positions = section(readme, '### Account Positions', '### Data Quality Monitoring');
    for (const date of ['2025-05-25', '2025-10-13', '2026-06-07', '2025-01-17', '2026-06-26']) {
      expect(positions).toContain(date);
    }
    expect(positions).toContain('1,000 rows per credit');
    expect(positions).toContain('snapshot_advanced');
    expect(positions).toContain('meta.builtThrough');
    expect(positions).toContain('meta.finalizedThrough');
  });

  it('uses no em dashes in the new copy', () => {
    const newCopy = [
      section(readme, '### Lighter Liquidations', '### Orders'),
      section(readme, '### Lighter on Robinhood Chain', '### Data Quality Monitoring'),
      section(readme, '#### Lighter on Robinhood Chain Channels', '#### Candle Replay'),
      section(changelog, '## 1.12.0', '## 1.11.0'),
    ].join('\n');
    expect(newCopy).not.toContain('—');
  });
});
