/**
 * Timestamp conversion shared by every resource.
 *
 * The API takes times as Unix milliseconds. Every time parameter goes through
 * {@link toUnixMs}, so a time means the same instant everywhere in the SDK,
 * whatever the local time zone of the machine:
 *
 * - a number: Unix milliseconds, sent unchanged (truncated to an integer);
 * - a `Date`: its instant;
 * - a string of digits: Unix milliseconds;
 * - any other string: ISO 8601. A date alone (`2026-09-01`) is midnight UTC,
 *   and a date-time without an offset (`2026-09-01T12:00:00`) is UTC, not
 *   local time as `Date.parse` would read it. A `Z` or `+hh:mm` offset is
 *   honored.
 */

/** A date-time without a `Z` or `+hh:mm` offset, with a `T` or a space. */
const OFFSETLESS_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[Tt ](\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?)$/;

/** Query parameters the SDK treats as times when they arrive as strings. */
export const TIME_PARAMS: ReadonlySet<string> = new Set(['start', 'end', 'timestamp', 'hour']);

/**
 * Convert a time (Unix ms, an ISO 8601 string or a `Date`) to integer Unix
 * milliseconds. A time without a time zone is UTC.
 *
 * @param value - the time
 * @param field - parameter name used in the error message
 * @throws TypeError when the value is not a time
 */
export function toUnixMs(value: number | string | Date, field = 'timestamp'): number {
  let ms: number;
  if (value instanceof Date) {
    ms = value.getTime();
  } else if (typeof value === 'number') {
    ms = value;
  } else if (typeof value === 'string') {
    const text = value.trim();
    if (/^-?\d+$/.test(text)) {
      ms = Number(text);
    } else {
      const offsetless = OFFSETLESS_DATE_TIME.exec(text);
      ms = Date.parse(offsetless ? `${offsetless[1]}T${offsetless[2].replace(',', '.')}Z` : text);
    }
  } else {
    ms = Number.NaN;
  }
  if (!Number.isFinite(ms)) {
    throw new TypeError(`${field} must be Unix milliseconds, an ISO 8601 string, or a Date`);
  }
  return Math.trunc(ms);
}
