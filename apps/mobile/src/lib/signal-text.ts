/**
 * What a signal post's free text adds BEYOND its structured card.
 *
 * Producers send `text` alongside `signal` so text-only consumers still get the
 * message — but under a rendered card the same levels read twice (a signal feed's
 * "XAUUSD · Verkauf (SELL NOW) · Einstieg 4120 · SL 4130 · TP1 4100 …" line, the
 * live demo's "TP1 4104 / SL 4089" block, the gold desk's "High Risk / Sell Gold
 * Now / 4397-4402 / TP … / SL …" post). So: drop only lines that PROVABLY just
 * restate the card — every number on the line is one of the signal's own levels
 * (an entry ZONE "4397-4402" counts as both ends) AND every word is level/direction
 * vocabulary, the pair, or a word of the producer's own `directionLabel` (which the
 * card shows). A line with no number is dropped only if it has words and they ALL
 * come from that vocabulary ("Sell Gold Now", "High Risk"). Anything else (a
 * disclaimer, "Update: SL auf Break-Even", "SL erreicht", a level the card
 * doesn't carry) is kept verbatim. Errs toward showing text: hiding a real
 * instruction is worse than a repeated level.
 */
import type { SignalLevels } from '@spa/contract';

const LEVEL_WORDS = new Set([
  // levels
  'tp', 'sl', 'stop', 'stoploss', 'stop-loss', 'entry', 'einstieg', 'ziel', 'ziele', 'target',
  'targets', 'take', 'profit', 'take-profit',
  // side / order type
  'buy', 'sell', 'long', 'short', 'now', 'limit', 'market', 'kauf', 'kaufen', 'verkauf',
  'verkaufen', 'bullish', 'bearish',
  // status wording the card shows as its pill
  'status', 'aktiv', 'active', 'inaktiv', 'inactive',
  // gold's aliases for the XAUUSD pair
  'gold', 'xau',
]);

/** A price as a number ("4.433,50" style isn't used by producers; "," is a decimal comma). */
const toNum = (s: string) => Number.parseFloat(s.replace(',', '.'));

// A standalone number: not glued to a letter (so "TP1" contributes no "1").
const NUMBER = /(?<![\p{L}\d.,])\d+(?:[.,]\d+)?/gu;
const WORD = /[\p{L}\p{N}-]+/gu;

function levelSet(signal: SignalLevels): number[] {
  return [...signal.entries, ...(signal.stop ? [signal.stop] : []), ...signal.targets]
    .flatMap((level) => level.split(/\s*[-–]\s*/)) // a zone "4397-4402" → both ends
    .map(toNum)
    .filter((n) => Number.isFinite(n));
}

function isRestatement(line: string, levels: number[], extraWords: Set<string>): boolean {
  const nums = line.match(NUMBER) ?? [];
  if (!nums.every((n) => levels.includes(toNum(n)))) return false;
  // A bare "-" left between two numbers of a zone is punctuation, not a word.
  const words = (line.replace(NUMBER, ' ').match(WORD) ?? []).filter((w) => /[\p{L}\p{N}]/u.test(w));
  // No number AND no word (an emoji, a "·") → not a restatement, just keep it.
  if (nums.length === 0 && words.length === 0) return false;
  return words.every((w) => {
    const lw = w.toLowerCase();
    return LEVEL_WORDS.has(lw) || extraWords.has(lw) || /^tp\d+$/.test(lw);
  });
}

export function extraSignalText(text: string, signal: SignalLevels): string {
  const levels = levelSet(signal);
  const extraWords = new Set(
    [signal.pair, signal.directionLabel ?? '']
      .flatMap((s) => s.match(WORD) ?? [])
      .map((w) => w.toLowerCase()),
  );
  return text
    .split('\n')
    .filter((line) => !isRestatement(line, levels, extraWords))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
