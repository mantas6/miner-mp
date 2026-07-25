import { describe, it, expect } from 'vitest';
import { rand, naturalAirPocket, makeTile, oreForDepthRoll, oreSpawnChanceAtDepth, starterOreForCoordinate } from '../src/world';
import { ORES, START_Y, SURFACE_HEIGHT, WORLD_W, WORLD_H } from '../src/constants';

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

describe('ore depth distribution', () => {
  const sampledNames = (depth: number) => {
    const names = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      const ore = oreForDepthRoll(depth, (i + .5) / 10000);
      if (ore) names.add(ore.name);
    }
    return names;
  };

  it('spreads overlapping mineral bands across the full 10 km mine', () => {
    expect(ORES.map(ore => ({
      name: ore.name,
      min: (ore.min - START_Y) * 10,
      max: (ore.max - START_Y) * 10
    }))).toEqual([
      {name: 'Coal', min: 0, max: 1800},
      {name: 'Copper', min: 50, max: 3200},
      {name: 'Silver', min: 600, max: 4600},
      {name: 'Gold', min: 1500, max: 6000},
      {name: 'Ruby', min: 2600, max: 7400},
      {name: 'Emerald', min: 3900, max: 8500},
      {name: 'Alienite', min: 5400, max: 9400},
      {name: 'Uranium', min: 7000, max: 10000},
      {name: 'Core Shard', min: 8500, max: 10000}
    ]);

    for (let depth = SURFACE_HEIGHT; depth <= WORLD_H - 2; depth++) {
      expect(oreForDepthRoll(depth, .5)).not.toBeNull();
    }
  });

  it('enforces both edges of every mineral band', () => {
    for (const ore of ORES) {
      expect(sampledNames(ore.min)).toContain(ore.name);
      expect(sampledNames(ore.max)).toContain(ore.name);
      expect(sampledNames(ore.min - 1)).not.toContain(ore.name);
      expect(sampledNames(ore.max + 1)).not.toContain(ore.name);
    }
  });

  it('weights low tiers early and reserves the richest tiers for deep bands', () => {
    expect([...sampledNames(START_Y + 100)]).toEqual(['Coal', 'Copper', 'Silver']);
    expect([...sampledNames(START_Y + 300)]).toEqual(['Copper', 'Silver', 'Gold', 'Ruby']);
    expect([...sampledNames(START_Y + 900)]).toEqual(['Alienite', 'Uranium', 'Core Shard']);

    const earlyCounts = new Map<string, number>();
    for (let i = 0; i < 10000; i++) {
      const name = oreForDepthRoll(START_Y + 100, (i + .5) / 10000)?.name;
      if (name) earlyCounts.set(name, (earlyCounts.get(name) || 0) + 1);
    }
    expect(earlyCounts.get('Coal')).toBeGreaterThan(earlyCounts.get('Copper')!);
    expect(earlyCounts.get('Copper')).toBeGreaterThan(earlyCounts.get('Silver')!);
  });

  it('keeps ore frequency stable when mineral tiers transition', () => {
    expect(oreSpawnChanceAtDepth(SURFACE_HEIGHT)).toBeGreaterThan(.10);
    expect(oreSpawnChanceAtDepth(START_Y + 600)).toBeCloseTo(.22);
    expect(oreSpawnChanceAtDepth(WORLD_H - 2)).toBeCloseTo(.22);
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
    const maxY = WORLD_H;
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
    const maxY = WORLD_H;
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
