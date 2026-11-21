import type { SignalLevels } from '@spa/contract';
import { describe, expect, it } from 'vitest';

import { isDead, isMilestone, tradeState } from '../src/lib/trade';

const sig = (progress?: SignalLevels['progress'], targets = ['1', '2', '3']): SignalLevels => ({
  pair: 'XAUUSD',
  direction: 'sell',
  entries: ['4400'],
  stop: '4410',
  targets,
  ...(progress ? { progress } : {}),
});

describe('tradeState', () => {
  it('reads progress', () => {
    expect(tradeState(sig())).toBe('open');
    expect(tradeState(sig({ kind: 'tp', tp: 1 }))).toBe('running');
    expect(tradeState(sig({ kind: 'tp', tp: 3 }))).toBe('won');
    expect(tradeState(sig({ kind: 'breakeven' }))).toBe('riskfree');
    expect(tradeState(sig({ kind: 'sl' }))).toBe('stopped');
    expect(tradeState(sig({ kind: 'closed', tp: 2 }))).toBe('closed');
  });
  it('dead = won / stopped / closed; a running or risk-free trade stays alive', () => {
    expect([sig({ kind: 'tp', tp: 3 }), sig({ kind: 'sl' }), sig({ kind: 'closed' })].every(isDead)).toBe(true);
    expect([sig(), sig({ kind: 'tp', tp: 2 }), sig({ kind: 'breakeven' })].some(isDead)).toBe(false);
  });
  it('a signal without listed targets is never "won" by a TP count', () => {
    expect(tradeState(sig({ kind: 'tp', tp: 1 }, []))).toBe('running');
  });
});

describe('isMilestone', () => {
  it('flags desk milestones, not chatter', () => {
    for (const t of ['TP1 HIT', 'TP2 HIT 🎯\n+80 pips', 'TP1 was hit', 'SL hit', 'Make your trade risk free', 'Close overall profit', '+550 pips'])
      expect(isMilestone(t)).toBe(true);
    for (const t of ['All entries active', 'Be ready', 'Another week wrapped up']) expect(isMilestone(t)).toBe(false);
  });
});

import { canAccess, canOpenLesson } from '../src/lib/access';

describe('viewer access (demo rule)', () => {
  it('prospects open nothing members-only except previews', () => {
    expect(canAccess('prospect', 'club')).toBe(false);
    expect(canAccess('prospect', 'orangerie')).toBe(false);
    expect(canOpenLesson('prospect', 'club', 'member', true)).toBe(true);
    expect(canOpenLesson('prospect', 'club', 'member')).toBe(false);
    expect(canOpenLesson('prospect', undefined, 'public')).toBe(true);
  });
  it('club opens the club; Orangerie opens both', () => {
    expect([canAccess('club', 'club'), canAccess('club', 'orangerie')]).toEqual([true, false]);
    expect([canAccess('orangerie', 'club'), canAccess('orangerie', 'orangerie')]).toEqual([true, true]);
  });
});
