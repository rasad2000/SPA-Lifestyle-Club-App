/**
 * A signal's trade state, read from its `progress` (the producer derives that from the
 * desk's own follow-ups). Pure; the cockpit greys out DEAD trades (stopped, closed, or
 * every listed target reached) and keeps open/running ones bright.
 */
import type { SignalLevels } from '@spa/contract';

export type TradeState = 'open' | 'running' | 'riskfree' | 'won' | 'stopped' | 'closed';

export function tradeState(signal: SignalLevels): TradeState {
  const p = signal.progress;
  if (!p) return 'open';
  if (p.kind === 'sl') return 'stopped';
  if (p.kind === 'closed') return 'closed';
  if (p.kind === 'breakeven') return 'riskfree';
  const listed = signal.targets.length;
  return listed > 0 && (p.tp ?? 0) >= listed ? 'won' : 'running';
}

export function isDead(signal: SignalLevels): boolean {
  const s = tradeState(signal);
  return s === 'won' || s === 'stopped' || s === 'closed';
}

/**
 * Does an update line mark a trade milestone (TP/SL hit, risk-free, close)? Used to
 * give those timeline entries a gold node; ordinary chatter gets a plain one.
 */
export function isMilestone(text: string): boolean {
  return /\btp\s*\d*\b[^\n]{0,20}\bhit|\bhit\b|\bsl\b|stop(?:ped)?\s*out|\bclose|risk[\s-]*free|break[\s-]*even|\bpips\b/i.test(text);
}
