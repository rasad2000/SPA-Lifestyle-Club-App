/**
 * German date / number formatting. Pure (the clock is a parameter) so it is
 * unit-tested; all absolute times render in Europe/Berlin regardless of the
 * device zone, because the community trades on Berlin session times.
 */
export const LOCALE = 'de-DE';
export const TIME_ZONE = 'Europe/Berlin';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const clockFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
});
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const numberFmt = new Intl.NumberFormat(LOCALE);

/** Calendar day in Berlin as "YYYY-MM-DD" (en-CA formats ISO-like). */
function berlinDay(d: Date): string {
  return dayKeyFmt.format(d);
}

/**
 * "gerade eben" · "vor 5 Min." · "vor 3 Std." · "gestern, 09:15" · "vor 4 Tagen" ·
 * then the absolute date WITH the clock time. Future timestamps (clock skew) read
 * as "gerade eben". Older posts keep their time because in a signal feed a thread
 * of same-day replies ("TP1 hit", "SL to BE") is meaningless as ten identical dates.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const t = then.getTime();
  if (Number.isNaN(t)) return '';
  const diff = now.getTime() - t;
  if (diff < MIN) return 'gerade eben';
  if (diff < HOUR) return `vor ${Math.floor(diff / MIN)} Min.`;
  if (diff < 12 * HOUR || berlinDay(then) === berlinDay(now)) {
    return `vor ${Math.floor(diff / HOUR)} Std.`;
  }
  const yesterday = new Date(now.getTime() - DAY);
  if (berlinDay(then) === berlinDay(yesterday)) return `gestern, ${clockFmt.format(then)}`;
  if (diff < 7 * DAY) return `vor ${Math.max(2, Math.round(diff / DAY))} Tagen`;
  return dateTimeFmt.format(then);
}

/** "06.10.2026, 23:18" in Berlin time. */
export function absoluteDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateTimeFmt.format(d);
}

/** "45 Min." · "1 Std." · "1 Std. 20 Min." */
export function formatMinutes(total: number): string {
  if (!Number.isFinite(total) || total <= 0) return '0 Min.';
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  if (h === 0) return `${m} Min.`;
  return m === 0 ? `${h} Std.` : `${h} Std. ${m} Min.`;
}

/** 12345 → "12.345". */
export function formatNumber(n: number): string {
  return numberFmt.format(n);
}

const TF_UNITS: [RegExp, (n: number) => string][] = [
  // Prefix match: producers type the minute unit freehand ("5 mina", "5 minzs").
  // Anchored on "min", so MetaTrader's monthly "MN" / "mo" never reads as minutes.
  [/^(m|min[a-z]*\.?)$/i, () => 'Min.'],
  [/^(h|hr|hrs|hours?|std\.?)$/i, () => 'Std.'],
  [/^(d|days?|tage?)$/i, (n) => (n === 1 ? 'Tag' : 'Tage')],
  [/^(w|wk|weeks?|wochen?)$/i, (n) => (n === 1 ? 'Woche' : 'Wochen')],
];

/**
 * Producer timeframes in German: "5 mins" / "15M" / "M15" → "5 Min." / "15 Min.",
 * "H4" → "4 Std.". Producers type these freehand (one feed has "5 mina" / "5 minzs"), so
 * anything unrecognized is shown verbatim rather than guessed. A bare "M" is
 * minutes, the MetaTrader convention (monthly is "MN" there).
 */
export function formatTimeframe(raw: string): string {
  const s = raw.trim();
  const m = /^(\d+)\s*([a-zA-Z]+\.?)$/.exec(s) ?? swap(/^([a-zA-Z]+)\s*(\d+)$/.exec(s));
  if (!m) return s;
  const n = Number(m[1]);
  for (const [re, label] of TF_UNITS) if (re.test(m[2]!)) return `${n} ${label(n)}`;
  return s;
}

function swap(m: RegExpExecArray | null): [string, string, string] | null {
  return m ? [m[0], m[2]!, m[1]!] : null;
}

/**
 * German typography for long-form text: "1 %" must not wrap between the number
 * and the sign (DIN 5008 uses a space, which a narrow viewport happily breaks,
 * leaving a lone "%." on the next line) — swap that space for a no-break space.
 */
export function noBreakUnits(text: string): string {
  return text.replace(/(\d) (%|€|\$|Pips\b|Min\.)/g, '$1 $2');
}

/** Execution type of an order, as a producer's direction label states it. */
export type OrderKind = 'market' | 'limit' | 'stop';

const DIRECTION_WORDS = new Set([
  'buy', 'sell', 'long', 'short', 'bullish', 'bearish', 'kauf', 'kaufen', 'verkauf', 'verkaufen',
  // the instrument itself ("Sell Gold Now") says nothing about the order
  'gold', 'xau', 'xauusd',
]);

const HIGH_RISK = /\bhigh[\s-]*risk\b/i;

/** The desk flags some entries "High Risk" — real information, shown as its own tag. */
export function isHighRisk(label: string | undefined): boolean {
  return HIGH_RISK.test(label ?? '');
}
const ORDER_WORDS: Record<string, OrderKind> = {
  now: 'market',
  market: 'market',
  instant: 'market',
  sofort: 'market',
  limit: 'limit',
  stop: 'stop',
};

/**
 * What a direction label ("SELL NOW", "BUY LIMIT", "Bullish") adds beyond the
 * KAUFEN/VERKAUFEN pill, which already states the side:
 *  - `{ kind }` — a known execution type (the UI shows it translated, neutral);
 *  - `{ raw }`  — wording that matches no known pattern, shown verbatim rather
 *    than guessed (e.g. "BUY STOP LIMIT");
 *  - `null`     — the label only restates the direction (or is empty).
 * With no direction (the pill says just "SIGNAL"), a bare side word IS the info.
 */
export function orderTypeOf(
  label: string | undefined,
  hasDirection: boolean,
): { kind: OrderKind } | { raw: string } | null {
  const raw = (label ?? '').replace(HIGH_RISK, ' ').replace(/^[\s·|,:-]+|[\s·|,:-]+$/g, '').trim();
  if (!raw) return null;
  const words = raw.toLowerCase().split(/[\s_/·|,:-]+/).filter(Boolean);
  const rest = words.filter((w) => !DIRECTION_WORDS.has(w));
  if (rest.length === 0) return hasDirection ? null : { raw };
  const kinds = new Set<OrderKind | undefined>(rest.map((w) => ORDER_WORDS[w]));
  const [only] = kinds;
  return kinds.size === 1 && only ? { kind: only } : { raw };
}

const sizeFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

/** 1_234_567 → "1,2 MB" (decimal units, German comma). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1000) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB'];
  let v = bytes / 1000;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${sizeFmt.format(v)} ${units[i]}`;
}
