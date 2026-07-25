import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/balance';
import { SURFACE_HEIGHT } from '../src/constants';
import { getDynamiteBlastTargets } from '../src/dynamite';
import type { Tile } from '../src/types';

function dirt(): Tile {
  return {type: 'dirt', hp: 2, maxHp: 2};
}

describe('dynamite blast targets', () => {
  it('selects a radius-two circular area of destructible blocks', () => {
    const world = Array.from({length: 12}, () => Array.from({length: 12}, dirt));
    const targets = getDynamiteBlastTargets(world, 6, 7, ECONOMY.dynamite.radius);

    expect(targets).toHaveLength(13);
    expect(targets).toContainEqual({x: 6, y: 5});
    expect(targets).toContainEqual({x: 8, y: 7});
    expect(targets).not.toContainEqual({x: 8, y: 9});
  });

  it('destroys ore and hazards without returning cargo or rewards', () => {
    const world: Tile[][] = Array.from({length: 10}, () => Array.from({length: 10}, dirt));
    world[6][5] = {type: 'ore', ore: {name: 'Gold', color: '#fc0', value: 70, min: 34, chance: .04}, hp: 5, maxHp: 5};
    world[5][6] = {type: 'hazard', hp: 8, maxHp: 8};

    const targets = getDynamiteBlastTargets(world, 5, 5, 2);

    expect(targets).toContainEqual({x: 5, y: 6});
    expect(targets).toContainEqual({x: 6, y: 5});
    expect(targets.every(target => Object.keys(target).sort().join(',') === 'x,y')).toBe(true);
  });

  it('preserves rock, the Motherlode, the surface layer, and world edges', () => {
    const world: Tile[][] = Array.from({length: 9}, () => Array.from({length: 9}, dirt));
    world[5][4] = {type: 'rock', hp: 999};
    world[5][5] = {type: 'artifact', hp: 24, maxHp: 24};
    const surfaceTargets = getDynamiteBlastTargets(world, 1, SURFACE_HEIGHT + 1, 2);
    const deepTargets = getDynamiteBlastTargets(world, 5, 5, 2);

    expect(surfaceTargets.every(({x, y}) => x > 0 && y > SURFACE_HEIGHT)).toBe(true);
    expect(deepTargets).not.toContainEqual({x: 4, y: 5});
    expect(deepTargets).not.toContainEqual({x: 5, y: 5});
  });
});
