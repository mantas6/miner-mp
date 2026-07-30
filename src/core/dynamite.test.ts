import { describe, expect, it } from 'vitest';
import { ECONOMY } from './balance';
import { SURFACE_HEIGHT } from '../../shared/constants';
import { getDynamiteBlastTargets } from './dynamite';
import type { Tile } from './types';

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

  it('destroys ore, artifacts, and hazards without returning cargo or rewards', () => {
    const world: Tile[][] = Array.from({length: 10}, () => Array.from({length: 10}, dirt));
    world[6][5] = {type: 'ore', ore: {name: 'Gold', color: '#fc0', value: 70, min: 152, max: 602, chance: .04}, hp: 5, maxHp: 5};
    world[5][6] = {type: 'hazard', hp: 8, maxHp: 8};
    world[5][4] = {type: 'artifact', artifact: {name:'Ancient Coin Cache', color:'#ffd166', value:180, min:202, max:502, chance:.00045}, hp:5, maxHp:5};

    const targets = getDynamiteBlastTargets(world, 5, 5, 2);

    expect(targets).toContainEqual({x: 5, y: 6});
    expect(targets).toContainEqual({x: 6, y: 5});
    expect(targets).toContainEqual({x: 4, y: 5});
    expect(targets.every(target => Object.keys(target).sort().join(',') === 'x,y')).toBe(true);
  });

  it('removes ordinary undrillable rock', () => {
    const world: Tile[][] = Array.from({length: 9}, () => Array.from({length: 9}, dirt));
    world[5][4] = {type: 'rock', hp: 999};

    const targets = getDynamiteBlastTargets(world, 5, 5, 2);
    for (const {x, y} of targets) world[y][x] = {type: 'air'};

    expect(targets).toContainEqual({x: 4, y: 5});
    expect(world[5][4]).toEqual({type: 'air'});
  });

  it('includes directly hit dormant enemies among destroyed terrain', () => {
    const world: Tile[][] = Array.from({length: 9}, () => Array.from({length: 9}, dirt));
    world[5][6] = {type: 'enemy', kind:'tunnelFiend', hp: 4, maxHp: 4};

    const targets = getDynamiteBlastTargets(world, 5, 5, 2);
    for (const {x, y} of targets) world[y][x] = {type: 'air'};

    expect(targets).toContainEqual({x: 6, y: 5});
    expect(world[5][6]).toEqual({type: 'air'});
  });

  it('preserves the Motherlode and protected surface/horizontal boundary tiles without inventing a bottom boundary', () => {
    const world: Tile[][] = Array.from({length: 9}, () => Array.from({length: 9}, dirt));
    world[5][5] = {type: 'motherlode', hp: 24, maxHp: 24};
    world[SURFACE_HEIGHT][1] = {type: 'rock', hp: 999};
    world[SURFACE_HEIGHT + 1][0] = {type: 'rock', hp: 999};
    world[8][5] = {type: 'rock', hp: 999};
    const surfaceTargets = getDynamiteBlastTargets(world, 1, SURFACE_HEIGHT + 1, 2);
    const deepTargets = getDynamiteBlastTargets(world, 5, 5, 2);
    const bottomTargets = getDynamiteBlastTargets(world, 5, 7, 2);

    expect(surfaceTargets).not.toContainEqual({x: 1, y: SURFACE_HEIGHT});
    expect(surfaceTargets).not.toContainEqual({x: 0, y: SURFACE_HEIGHT + 1});
    expect(deepTargets).not.toContainEqual({x: 5, y: 5});
    expect(bottomTargets).toContainEqual({x: 5, y: 8});
  });
});
