import { describe, it, expect } from 'vitest';
import { rand, naturalAirPocket, makeTile, starterOreForCoordinate } from '../src/world';
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

describe('starterOreForCoordinate', () => {
  it('places a compact low-tier starter seam near the starting shaft', () => {
    const shaftX = Math.floor(WORLD_W / 2);
    const expected = [
      {x: shaftX, y: SURFACE_HEIGHT + 3, name: 'Coal'},
      {x: shaftX - 2, y: SURFACE_HEIGHT + 4, name: 'Coal'},
      {x: shaftX + 2, y: SURFACE_HEIGHT + 5, name: 'Copper'},
      {x: shaftX - 1, y: SURFACE_HEIGHT + 7, name: 'Copper'}
    ];

    for (const {x, y, name} of expected) {
      const ore = starterOreForCoordinate(x, y);
      expect(ore?.name).toBe(name);
      expect(ore?.min).toBeLessThanOrEqual(y);
    }
  });

  it('does not turn the whole opening around the shaft into ore', () => {
    const shaftX = Math.floor(WORLD_W / 2);
    let starterOreTiles = 0;
    let nonStarterTiles = 0;
    for (let y = SURFACE_HEIGHT; y <= SURFACE_HEIGHT + 8; y++) {
      for (let x = shaftX - 4; x <= shaftX + 4; x++) {
        if (starterOreForCoordinate(x, y)) starterOreTiles++;
        else nonStarterTiles++;
      }
    }

    expect(starterOreTiles).toBe(4);
    expect(nonStarterTiles).toBeGreaterThan(starterOreTiles * 12);
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

  it('guarantees several reachable Coal/Copper tiles in the first 40-80 meters', () => {
    const shaftX = Math.floor(WORLD_W / 2);
    const earlyTiles = [];
    for (let y = SURFACE_HEIGHT; y <= SURFACE_HEIGHT + 8; y++) {
      for (let x = shaftX - 3; x <= shaftX + 3; x++) {
        const tile = makeTile(x, y);
        if (tile.type === 'ore') earlyTiles.push({x, y, name: tile.ore.name});
      }
    }

    const lowTierStarterOres = earlyTiles.filter(tile =>
      (tile.name === 'Coal' || tile.name === 'Copper') &&
      tile.y >= SURFACE_HEIGHT + 3 &&
      tile.y <= SURFACE_HEIGHT + 7
    );
    expect(lowTierStarterOres.length).toBeGreaterThanOrEqual(4);
    expect(lowTierStarterOres.some(tile => tile.x === shaftX && tile.y === SURFACE_HEIGHT + 3)).toBe(true);
  });

  it('keeps late-game landmarks and hazards intact', () => {
    const artifactXs = [Math.floor(WORLD_W / 2) - 1, Math.floor(WORLD_W / 2), Math.floor(WORLD_W / 2) + 1];
    for (const x of artifactXs) {
      expect(makeTile(x, WORLD_H - 2).type).toBe('artifact');
    }

    expect(makeTile(24, 151).type).toBe('hazard');
    expect(makeTile(36, 17).type).toBe('enemy');
  });
});
