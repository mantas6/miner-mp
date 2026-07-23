import { describe, it, expect } from 'vitest';
import { DEFAULT_STATS, numeric } from '../src/persistence';

describe('numeric clamp', () => {
  it('passes through a finite value within range', () => {
    expect(numeric(50, 0, 0, 100)).toBe(50);
  });

  it('clamps a value below min to min', () => {
    expect(numeric(-5, 0, 10, 100)).toBe(10);
  });

  it('clamps a value above max to max', () => {
    expect(numeric(150, 0, 0, 100)).toBe(100);
  });

  it('returns fallback for non-finite (NaN) input', () => {
    expect(numeric(NaN, 7)).toBe(7);
  });

  it('coerces a numeric string', () => {
    expect(numeric('5', 0)).toBe(5);
  });

  it('returns fallback for a non-numeric string', () => {
    expect(numeric('abc', 42)).toBe(42);
  });

  it('applies default min of 0', () => {
    expect(numeric(-3, 99)).toBe(0);
  });
});

describe('Motherlode extraction save compatibility', () => {
  it('gives legacy saves a zero completed-extraction counter', () => {
    const legacyStats = { motherlodeClaims: 1 };

    expect({ ...DEFAULT_STATS, ...legacyStats }).toMatchObject({
      motherlodeClaims: 1,
      motherlodeExtractions: 0
    });
  });
});
