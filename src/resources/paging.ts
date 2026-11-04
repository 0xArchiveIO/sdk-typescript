import { OxArchiveError, type CursorResponse } from '../types';

/**
 * Follow `nextCursor` from the first page to the last, yielding every row.
 *
 * Only a missing `nextCursor` ends the walk: a page can be short, or empty,
 * and still be followed by another (a sparse filter, or a stretch with no
 * data), so the page size never decides. A page that returns the cursor it
 * was sent would repeat forever, so that throws instead of looping or
 * stopping early.
 *
 * @internal
 */
export async function* walkCursor<T>(
  fetchPage: (cursor: string | undefined) => Promise<CursorResponse<T[]>>,
): AsyncGenerator<T, void, undefined> {
  let cursor: string | undefined;
  for (;;) {
    const page = await fetchPage(cursor);
    for (const row of page.data) {
      yield row;
    }
    const next = page.nextCursor;
    if (next === undefined || next === null || next === '') {
      return;
    }
    if (next === cursor) {
      throw new OxArchiveError(
        `The API returned the cursor it was sent (${next}), so the next page would repeat this one. ` +
          'Stopped to avoid a loop; retry, or page by hand from this cursor.',
        500,
        page.meta?.requestId,
        'internal_error',
      );
    }
    cursor = next;
  }
}

/**
 * The `end` an iterator sends on every page: the caller's, or the current
 * time, fixed once before the first request so the window does not move
 * while pages are read.
 *
 * @internal
 */
export function pinnedEnd<T>(end: T | undefined): T | number {
  return end ?? Date.now();
}

/** @internal */
export function requireStart(start: unknown, method: string): void {
  if (start === undefined || start === null || start === '') {
    throw new TypeError(`${method} needs start: the window must be fixed while its pages are read`);
  }
}

/** @internal Refuse a value outside `allowed` before sending. */
export function checkOneOf<T>(value: T | undefined, allowed: readonly T[], name: string, what: string): void {
  if (value !== undefined && !allowed.includes(value)) {
    throw new RangeError(`${name} must be one of ${allowed.join(', ')} for ${what}`);
  }
}

/** @internal Refuse a page size outside `1..max` before sending. */
export function checkLimit(limit: number | undefined, max: number, what: string): void {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > max)) {
    throw new RangeError(`limit must be an integer from 1 to ${max} for ${what}`);
  }
}

/** @internal Refuse an empty symbol before sending. */
export function checkSymbol(symbol: unknown): asserts symbol is string {
  if (typeof symbol !== 'string' || symbol.trim() === '') {
    throw new TypeError('symbol is required');
  }
}
