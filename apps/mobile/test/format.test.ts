import { describe, expect, it } from 'vitest';

import {
  absoluteDateTime,
  formatBytes,
  formatMinutes,
  formatNumber,
  formatTimeframe,
  noBreakUnits,
  orderTypeOf,
  relativeTime,
} from '../src/lib/format';

const now = new Date('2026-10-08T12:00:00Z'); // 14:00 Berlin (CEST)
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const MIN = 60_000;

describe('relativeTime', () => {
  it('recent', () => {
    expect(relativeTime(ago(20_000), now)).toBe('gerade eben');
    expect(relativeTime(ago(5 * MIN), now)).toBe('vor 5 Min.');
    expect(relativeTime(ago(3 * 60 * MIN), now)).toBe('vor 3 Std.');
  });
  it('clock skew reads as now', () => {
    expect(relativeTime(new Date(now.getTime() + 5 * MIN).toISOString(), now)).toBe('gerade eben');
  });
  it('yesterday / days / absolute', () => {
    expect(relativeTime('2026-10-07T08:00:00Z', now)).toBe('gestern, 10:00');
    expect(relativeTime('2026-10-04T12:00:00Z', now)).toBe('vor 4 Tagen');
    expect(relativeTime('2026-09-01T12:00:00Z', now)).toBe('01.09.2026, 14:00');
  });
  it('bad input is empty, not a crash', () => {
    expect(relativeTime('nope', now)).toBe('');
  });
});

describe('absolute / numbers / minutes', () => {
  it('renders Berlin time', () => {
    expect(absoluteDateTime('2026-10-08T12:00:00Z')).toBe('08.10.2026, 14:00');
  });
  it('German grouping and durations', () => {
    expect(formatNumber(12345)).toBe('12.345');
    expect(formatMinutes(45)).toBe('45 Min.');
    expect(formatMinutes(60)).toBe('1 Std.');
    expect(formatMinutes(80)).toBe('1 Std. 20 Min.');
    expect(formatMinutes(0)).toBe('0 Min.');
  });
});

describe('formatTimeframe', () => {
  it('German minutes/hours/days from freehand producer strings', () => {
    expect(formatTimeframe('5 mins')).toBe('5 Min.');
    expect(formatTimeframe('5 mina')).toBe('5 Min.'); // live feed typos
    expect(formatTimeframe('5 minzs')).toBe('5 Min.');
    expect(formatTimeframe('15 min.')).toBe('15 Min.');
    expect(formatTimeframe('M30')).toBe('30 Min.');
    expect(formatTimeframe('15M')).toBe('15 Min.');
    expect(formatTimeframe('M15')).toBe('15 Min.');
    expect(formatTimeframe('H4')).toBe('4 Std.');
    expect(formatTimeframe('1 day')).toBe('1 Tag');
    expect(formatTimeframe('2D')).toBe('2 Tage');
  });
  it('unknown wording is shown verbatim, never guessed', () => {
    expect(formatTimeframe('Swing')).toBe('Swing');
    expect(formatTimeframe('1 MN')).toBe('1 MN'); // MetaTrader monthly, not minutes
    expect(formatTimeframe('3 mo')).toBe('3 mo');
    expect(formatTimeframe(' 3 bars ')).toBe('3 bars');
  });
});

describe('noBreakUnits', () => {
  it('glues the number to its unit', () => {
    expect(noBreakUnits('bei 1 % Risiko, +33 %.')).toBe('bei 1 % Risiko, +33 %.');
    expect(noBreakUnits('200 € und 40 Pips')).toBe('200 € und 40 Pips');
  });
  it('leaves other spaces alone', () => {
    expect(noBreakUnits('TP 4425 und SL')).toBe('TP 4425 und SL');
  });
});

describe('orderTypeOf', () => {
  it('reduces a direction label to its execution type', () => {
    expect(orderTypeOf('SELL NOW', true)).toEqual({ kind: 'market' });
    expect(orderTypeOf('BUY NOW', true)).toEqual({ kind: 'market' });
    expect(orderTypeOf('Buy Market', true)).toEqual({ kind: 'market' });
    expect(orderTypeOf('SELL LIMIT', true)).toEqual({ kind: 'limit' });
    expect(orderTypeOf('BUY STOP', true)).toEqual({ kind: 'stop' });
  });
  it('a label that only restates the side adds nothing', () => {
    expect(orderTypeOf('Bearish', true)).toBeNull();
    expect(orderTypeOf('SELL', true)).toBeNull();
    expect(orderTypeOf('  ', true)).toBeNull();
    expect(orderTypeOf(undefined, true)).toBeNull();
  });
  it('without a direction the side word is the information', () => {
    expect(orderTypeOf('Bullish', false)).toEqual({ raw: 'Bullish' });
  });
  it('unknown or mixed wording is shown verbatim', () => {
    expect(orderTypeOf('BUY STOP LIMIT', true)).toEqual({ raw: 'BUY STOP LIMIT' });
    expect(orderTypeOf('Scalp', true)).toEqual({ raw: 'Scalp' });
  });
});

describe('formatBytes', () => {
  it('decimal units with a German comma', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1_234_567)).toBe('1,2 MB');
    expect(formatBytes(2_000)).toBe('2 kB');
    expect(formatBytes(-1)).toBe('');
  });
});
