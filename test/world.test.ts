import { describe, it, expect } from 'vitest';
import { rand, naturalAirPocket, makeTile } from '../src/world';
import { SURFACE_HEIGHT, WORLD_W, WORLD_H } from '../src/constants';

describe('rand', () => {
  it('is deterministic for the same coordinate', () => {
    expect(rand(3, 7)).toBe(rand(3, 7));
    expect(rand(0, 0)).toBe(rand(0, 0));
    expect(rand(42, 199)).toBe(rand(42, 199));
  });

  it('returns values within [0, 1)', () => {
    const coords = [[0, 0], [3, 7], [42, 199], [89, 318], [13, 256], [1, 1]];
    for (const [x, y] of coords) {
      const v = rand(x, y);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('naturalAirPocket', () => {
  it('is deterministic', () => {
    expect(naturalAirPocket(10, 50)).toBe(naturalAirPocket(10, 50));
  });
});

describe('makeTile', () => {
  it('is deterministic', () => {
    expect(makeTile(10, 50)).toEqual(makeTile(10, 50));
    expect(makeTile(0, 0)).toEqual(makeTile(0, 0));
  });

  it('produces air above the surface', () => {
    for (let y = 0; y < SURFACE_HEIGHT; y++) {
      for (let x = 0; x < WORLD_W; x += 7) {
        expect(makeTile(x, y).type).toBe('air');
      }
    }
  });

  it('never spawns ore above its minimum depth', () => {
    const maxY = Math.min(250, WORLD_H);
    for (let x = 0; x < WORLD_W; x += 3) {
      for (let y = 0; y < maxY; y++) {
        const tile = makeTile(x, y);
        if (tile.type === 'ore') {
          expect(tile.ore.min).toBeLessThanOrEqual(y);
        }
      }
    }
  });

  it('generates at least one ore in a deep scan', () => {
    let foundOre = false;
    const maxY = Math.min(250, WORLD_H);
    for (let x = 0; x < WORLD_W && !foundOre; x += 3) {
      for (let y = 0; y < maxY; y++) {
        if (makeTile(x, y).type === 'ore') { foundOre = true; break; }
      }
    }
    expect(foundOre).toBe(true);
  });
});
