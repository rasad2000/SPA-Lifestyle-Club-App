import { describe, expect, it } from 'vitest';

import { BACKOFF_MAX_MS, backoffDelay } from '../src/api/backoff';

describe('backoffDelay', () => {
  it('doubles from 1s without jitter', () => {
    const mid = () => 0.5; // jitter factor exactly 1
    expect([0, 1, 2, 3].map((a) => backoffDelay(a, mid))).toEqual([1000, 2000, 4000, 8000]);
  });
  it('caps at 30s even with positive jitter', () => {
    expect(backoffDelay(20, () => 1)).toBe(BACKOFF_MAX_MS);
  });
  it('jitters within ±20%', () => {
    expect(backoffDelay(2, () => 0)).toBe(3200);
    expect(backoffDelay(2, () => 1)).toBe(4800);
  });
});
