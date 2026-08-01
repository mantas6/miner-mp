import { afterEach, describe, it, expect, vi } from 'vitest';
import { SAVE_KEY, SAVE_VERSION, load, numeric, save } from './persistence';
import { createInitialState } from './core/state';
import { ECONOMY } from './core/balance';
import { cargoCost } from './core/economy';
import { claimArtifact } from './core/artifacts';
import { ARTIFACTS, MAX_SAVED_TILE_ENTRIES } from '../shared/constants';
import { explorationIndex } from '../shared/exploration-codec';
import type { TileEntry } from '../shared/world-schema';
import { createTileDiff, tileDiffEntries } from './world/tile-diff';

afterEach(() => vi.unstubAllGlobals());

/** Stub localStorage with an in-memory store, optionally pre-seeded with a save. */
function stubStorage(existingSave?: unknown): Map<string, string> {
  const stored = new Map<string, string>();
  if (existingSave !== undefined) stored.set(SAVE_KEY, JSON.stringify(existingSave));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value)
  });
  return stored;
}

describe('numeric clamp', () => {
  it.each([
    ['passes through a finite value within range', 50, 0, 0, 100, 50],
    ['clamps a value below min to min', -5, 0, 10, 100, 10],
    ['clamps a value above max to max', 150, 0, 0, 100, 100],
    ['returns the fallback for non-finite input', NaN, 7, undefined, undefined, 7],
    ['coerces a numeric string', '5', 0, undefined, undefined, 5],
    ['returns the fallback for a non-numeric string', 'abc', 42, undefined, undefined, 42],
    ['applies a default min of 0', -3, 99, undefined, undefined, 0]
  ])('%s', (_name, value, fallback, min, max, expected) => {
    expect(min === undefined ? numeric(value, fallback) : numeric(value, fallback, min, max)).toBe(expected);
  });
});

describe('Motherlode extraction save compatibility', () => {
  it('gives legacy saves a zero completed-extraction counter', () => {
    stubStorage({ version: SAVE_VERSION, stats: { motherlodeClaims: 1 } });
    const state = createInitialState();

    load(state);

    expect(state.stats).toMatchObject({ motherlodeClaims: 1, motherlodeExtractions: 0 });
  });
});

describe('artifact payout persistence', () => {
  it('round-trips immediately banked cash and artifact count without cargo', () => {
    stubStorage();
    const state = createInitialState();
    claimArtifact(state, ARTIFACTS[0]);
    save(state);

    const restored = createInitialState();
    load(restored);
    expect(restored.cash).toBe(240);
    expect(restored.stats.artifactsFound).toBe(1);
    expect(restored.stats.totalCashEarned).toBe(180);
    expect(restored.player.cargo).toEqual([]);
  });
});

describe('cargo balance persistence', () => {
  it.each([
    [10, 10, 120],
    [20, 15, 159],
    [30, 20, 210],
    [40, 25, 276]
  ])('maps legacy capacity %i to rebalanced capacity %i at the same price level', (legacyCapacity, capacity, nextCost) => {
    stubStorage({ version: 1, cargoMax: legacyCapacity });
    const state = createInitialState();

    load(state);

    expect(state.player.cargoMax).toBe(capacity);
    expect(cargoCost(state.player)).toBe(nextCost);
  });

  it('round-trips rebalanced cargo capacity without migrating it again', () => {
    const stored = stubStorage();
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

describe('carried item persistence', () => {
  it.each([
    ['dynamite charges', { dynamite: 3 }],
    ['teleporters', { teleporters: 2 }],
    ['gun ownership and ammunition', { gunOwned: true, bullets: 17 }]
  ])('round-trips %s through save and load', (_name, owned) => {
    const stored = stubStorage();
    const state = createInitialState();
    Object.assign(state.player, owned);
    save(state);

    const restored = createInitialState();
    load(restored);

    expect(restored.player).toMatchObject(owned);
    expect(JSON.parse(stored.get(SAVE_KEY) || '{}')).toMatchObject(owned);
  });

  it.each([
    ['dynamite charges', { dynamite: 0 }],
    ['teleporters', { teleporters: 0 }],
    ['gun ownership and ammunition', { gunOwned: false, bullets: 0 }]
  ])('gives a legacy save no %s', (_name, empty) => {
    stubStorage({ cash: 90 });
    const state = createInitialState();

    load(state);

    expect(state.player).toMatchObject(empty);
  });
});

describe('fog exploration persistence', () => {
  it('round-trips compact explored ranges and sensor level', () => {
    const stored = stubStorage();
    const state = createInitialState();
    state.player.visibility = 4;
    state.exploredTiles.add(explorationIndex(10, 10));
    state.exploredTiles.add(explorationIndex(11, 10));
    save(state);

    const serialized = JSON.parse(stored.get(SAVE_KEY) || '{}');
    expect(serialized).toMatchObject({version: SAVE_VERSION, visibility: 4, explored: '910-911'});

    const restored = createInitialState();
    load(restored);
    expect(restored.player.visibility).toBe(4);
    expect(restored.exploredTiles).toEqual(state.exploredTiles);
  });

  it('preserves existing saves with default sensors and no explored coordinates', () => {
    stubStorage({ version: 2, cargoMax: 20, cash: 90 });
    const state = createInitialState();
    load(state);

    expect(state.cash).toBe(90);
    expect(state.player.cargoMax).toBe(20);
    expect(state.player.visibility).toBe(3);
    expect(state.exploredTiles.size).toBe(0);
  });
});

describe('solo terrain persistence', () => {
  const dug: TileEntry = { x: 44, y: 61, tile: { type: 'air' } };
  const cracked: TileEntry = { x: 45, y: 61, tile: { type: 'dirt', hp: 1, maxHp: 4 } };
  const mined: TileEntry = {
    x: 46, y: 61,
    tile: { type: 'ore', ore: { name: 'Gold', color: '#ffd65c', value: 70, min: 152, max: 602, chance: 0.04 }, hp: 2, maxHp: 5 }
  };

  it('round-trips the tile diff in the relay world format', () => {
    const stored = stubStorage();
    const state = createInitialState();
    state.soloTileDiff = createTileDiff([dug, cracked, mined]);

    save(state);

    expect(JSON.parse(stored.get(SAVE_KEY) || '{}')).toMatchObject({
      version: SAVE_VERSION,
      tiles: [dug, cracked, mined]
    });

    const restored = createInitialState();
    load(restored);
    expect(restored.soloTileDiff).toEqual(state.soloTileDiff);
  });

  it('gives a version 3 save an untouched mine', () => {
    stubStorage({ version: 3, cash: 90, explored: '910-911' });
    const state = createInitialState();

    load(state);

    expect(state.cash).toBe(90);
    expect(state.exploredTiles.has(explorationIndex(10, 10))).toBe(true);
    expect(state.soloTileDiff.size).toBe(0);
  });

  it('ignores a malformed tile list instead of failing the whole load', () => {
    stubStorage({ version: SAVE_VERSION, cash: 90, tiles: [{ x: 1, y: 2, tile: { type: 'lava' } }] });
    const state = createInitialState();

    load(state);

    expect(state.cash).toBe(90);
    expect(state.soloTileDiff.size).toBe(0);
  });

  it('drops the terrain rather than the wallet when storage is full', () => {
    const stored = new Map<string, string>();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (value.includes('"tiles":[{')) throw new Error('QuotaExceededError');
        stored.set(key, value);
      }
    });
    const state = createInitialState();
    state.cash = 4200;
    state.soloTileDiff = createTileDiff([dug]);

    save(state);

    expect(JSON.parse(stored.get(SAVE_KEY) || '{}')).toMatchObject({ cash: 4200, tiles: [] });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('forgets the oldest mutations once the save budget is spent', () => {
    stubStorage();
    const state = createInitialState();
    const entries: TileEntry[] = Array.from({ length: MAX_SAVED_TILE_ENTRIES + 2 }, (_, index) => ({
      x: index % 90, y: 10 + index, tile: { type: 'air' }
    }));
    state.soloTileDiff = createTileDiff(entries);

    save(state);

    const restored = createInitialState();
    load(restored);
    const kept = tileDiffEntries(restored.soloTileDiff);
    expect(kept).toHaveLength(MAX_SAVED_TILE_ENTRIES);
    expect(kept[0]).toEqual(entries[2]);
    expect(kept.at(-1)).toEqual(entries.at(-1));
  });
});
