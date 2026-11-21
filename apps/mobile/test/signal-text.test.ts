import type { SignalLevels } from '@spa/contract';
import { describe, expect, it } from 'vitest';

import { extraSignalText } from '../src/lib/signal-text';

const sig = (over: Partial<SignalLevels> = {}): SignalLevels => ({
  pair: 'XAUUSD',
  direction: 'sell',
  directionLabel: 'SELL NOW',
  entries: ['4120'],
  stop: '4130',
  targets: ['4100', '4070'],
  status: 'active',
  ...over,
});

describe('extraSignalText', () => {
  it('drops the feed summary line that only restates the card', () => {
    const t = 'XAUUSD · Verkauf (SELL NOW) · Einstieg 4120 · SL 4130 · TP1 4100 / TP2 4070 · Status: aktiv';
    expect(extraSignalText(t, sig())).toBe('');
  });
  it('keeps a line that says more than the card ("SL erreicht")', () => {
    const t = 'XAUUSD · Verkauf (SELL NOW) · Einstieg 4120 · SL 4130 · TP1 4100 · Status: ungültig (SL erreicht)';
    expect(extraSignalText(t, sig({ status: 'invalid' }))).toBe(t);
  });
  it('keeps prose and disclaimers, drops the level block (live demo)', () => {
    const levels = sig({ direction: 'buy', directionLabel: 'KAUFEN', entries: ['4096', '4100'], stop: '4089', targets: ['4104', '4108', '4116'] });
    const t = '🧪 DEMO · Live-Push-Test (keine Handelsempfehlung)\n\nXAUUSD KAUFEN 4096 – 4100\n\nTP1 4104\nTP2 4108\nTP3 4116\n\nSL 4089\n\nUpdate: SL auf Break-Even';
    expect(extraSignalText(t, levels)).toBe('🧪 DEMO · Live-Push-Test (keine Handelsempfehlung)\n\nUpdate: SL auf Break-Even');
  });
  it('keeps a level line whose number the card does NOT carry', () => {
    expect(extraSignalText('SL 4089', sig())).toBe('SL 4089');
  });
  it('keeps an instruction even when its number is a level', () => {
    expect(extraSignalText('Close half at 4100', sig())).toBe('Close half at 4100');
  });
  it('decimal comma/point and trailing zeros compare as the same price', () => {
    expect(extraSignalText('TP1 4100,0', sig())).toBe('');
  });
  it('drops the gold desk entry block incl. zone + header lines (card shows them)', () => {
    const gold = sig({
      directionLabel: 'High risk · Sell gold now',
      entries: ['4397-4402'],
      stop: '4407',
      targets: ['4394', '4391', '4388', '4385', '4345'],
      status: undefined,
    });
    const t = 'High risk\n\nSell gold now\n\n4397-4402\n\nTP 4394 💵\nTP 4391 💵\nTP 4388 💵\nTP 4385 💵\nTP 4345 💵\n\nSL 4407';
    expect(extraSignalText(t, gold)).toBe('');
  });
  it('keeps a number-less line with a word the card does not carry', () => {
    expect(extraSignalText('Sell gold now carefully', sig({ directionLabel: 'Sell gold now' }))).toBe('Sell gold now carefully');
    expect(extraSignalText('TP open', sig())).toBe('TP open');
  });
  it('keeps a zone line whose ends are not both levels', () => {
    expect(extraSignalText('4397-4410', sig({ entries: ['4397-4402'] }))).toBe('4397-4410');
  });
});
