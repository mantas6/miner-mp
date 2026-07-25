import { afterEach, describe, it, expect, vi } from 'vitest';
import { DEFAULT_STATS, SAVE_KEY, SAVE_VERSION, load, numeric, save } from '../src/persistence';
import { createInitialState } from '../src/state';
import { ECONOMY } from '../src/balance';
import { cargoCost } from '../src/economy';

afterEach(() => vi.unstubAllGlobals());

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

describe('cargo balance persistence', () => {
  it.each([
    [10, 10, 120],
    [20, 15, 159],
    [30, 20, 210],
    [40, 25, 276]
  ])('maps legacy capacity %i to rebalanced capacity %i at the same price level', (legacyCapacity, capacity, nextCost) => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({version: 1, cargoMax: legacyCapacity}),
      setItem: vi.fn()
    });
    const state = createInitialState();

    load(state);

    expect(state.player.cargoMax).toBe(capacity);
    expect(cargoCost(state.player)).toBe(nextCost);
  });

  it('round-trips rebalanced cargo capacity without migrating it again', () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value)
    });
    const state = createInitialState();
    state.player.cargoMax += ECONOMY.cargo.step * 2;
    save(state);

    const restored = createInitialState();
    load(restored);

    expect(restored.player.cargoMax).toBe(20);
    expect(JSON.parse(stored.get(SAVE_KEY) || '{}')).toMatchObject({
      version: SAVE_VERSION,
      cargoMax: 20
    });
  });
});

describe('dynamite persistence', () => {
  it('round-trips carried charges with progression', () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value)
    });
    const state = createInitialState();
    state.player.dynamite = 3;
    save(state);

    const restored = createInitialState();
    load(restored);

    expect(restored.player.dynamite).toBe(3);
    expect(JSON.parse(stored.get(SAVE_KEY) || '{}').dynamite).toBe(3);
  });

  it('keeps zero charges when loading a legacy save', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({cash: 90}),
      setItem: vi.fn()
    });
    const state = createInitialState();

    load(state);

    expect(state.player.dynamite).toBe(0);
  });
});

describe('teleporter persistence', () => {
  it('round-trips carried teleporters with progression', () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value)
    });
    const state = createInitialState();
    state.player.teleporters = 2;
    save(state);

    const restored = createInitialState();
    load(restored);

    expect(restored.player.teleporters).toBe(2);
    expect(JSON.parse(stored.get(SAVE_KEY) || '{}').teleporters).toBe(2);
  });

  it('keeps zero teleporters when loading a legacy save', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({cash: 90}),
      setItem: vi.fn()
    });
    const state = createInitialState();

    load(state);

    expect(state.player.teleporters).toBe(0);
  });
});
