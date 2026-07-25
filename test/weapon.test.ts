import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/balance';
import { SURFACE_HEIGHT } from '../src/constants';
import type { Tile } from '../src/types';
import { consumeBulletForShot, gunKeyAction, resolveShot } from '../src/weapon';

function airWorld(width = 15, height = 15): Tile[][] {
  return Array.from({length: height}, (_, y) => Array.from({length: width}, (_, x) =>
    x === 0 || x === width - 1 || y === height - 1 ? {type: 'rock', hp: 999} : {type: 'air'}
  ));
}

describe('gun aim input and ammunition', () => {
  it('arms with G, fires only on a following direction, and supports clear cancellation', () => {
    expect(gunKeyAction(false, 'g')).toBe('arm');
    expect(gunKeyAction(true, 'ArrowRight')).toBe('fire');
    expect(gunKeyAction(true, 'w')).toBe('fire');
    expect(gunKeyAction(true, 'g')).toBe('cancel');
    expect(gunKeyAction(true, 'Escape')).toBe('cancel');
    expect(gunKeyAction(true, 'Enter')).toBe('pass');
  });

  it('consumes exactly one bullet only for an owned, armed, cardinal shot', () => {
    const player = {gunOwned: true, bullets: 2};
    expect(consumeBulletForShot(player, false, [1, 0])).toBe(false);
    expect(consumeBulletForShot(player, true, [1, 1])).toBe(false);
    expect(player.bullets).toBe(2);
    expect(consumeBulletForShot(player, true, [1, 0])).toBe(true);
    expect(player.bullets).toBe(1);
    expect(consumeBulletForShot({gunOwned: false, bullets: 2}, true, [0, 1])).toBe(false);
    expect(consumeBulletForShot({gunOwned: true, bullets: 0}, true, [0, 1])).toBe(false);
  });
});

describe('gun shot resolution', () => {
  it('passes through air and hits the first eligible block without mutating it', () => {
    const world = airWorld();
    const ore: Tile = {type:'ore', ore:{name:'Gold', color:'#fc0', value:70, min:152, max:602, chance:.04}, hp:8, maxHp:8};
    world[7][10] = ore;
    world[7][12] = {type:'dirt', hp:3, maxHp:3};

    const shot = resolveShot(world, 5, 7, [1, 0], ECONOMY.gun.range);

    expect(shot?.target).toEqual({kind:'tile', x:10, y:7, tile:ore});
    expect(shot?.path).toHaveLength(5);
    expect(world[7][10]).toBe(ore);
  });

  it('hits an active enemy before farther terrain', () => {
    const world = airWorld();
    world[7][11] = {type:'dirt', hp:2, maxHp:2};
    const enemy = {id:42, x:8, y:7};

    expect(resolveShot(world, 5, 7, [1, 0], 8, [enemy])?.target)
      .toEqual({kind:'enemy', enemy});
  });

  it('targets dormant enemies as eligible blocks', () => {
    const world = airWorld();
    world[9][5] = {type:'enemy', hp:12, maxHp:12};
    expect(resolveShot(world, 5, 6, [0, 1], 8)?.target).toMatchObject({kind:'tile', x:5, y:9, tile:{type:'enemy'}});
  });

  it('reports an eight-tile miss without inventing a target', () => {
    const shot = resolveShot(airWorld(25, 15), 5, 7, [1, 0], ECONOMY.gun.range);
    expect(shot).toMatchObject({outcome:'miss'});
    expect(shot?.path).toHaveLength(8);
    expect(shot?.target).toBeUndefined();
  });

  it('stops at rock, Motherlode, surface protection, and world boundaries', () => {
    const rockWorld = airWorld();
    rockWorld[7][8] = {type:'rock', hp:999};
    expect(resolveShot(rockWorld, 5, 7, [1, 0], 8)).toMatchObject({outcome:'blocked', path:[{x:6,y:7},{x:7,y:7},{x:8,y:7}]});

    const coreWorld = airWorld();
    coreWorld[7][8] = {type:'motherlode', hp:24, maxHp:24};
    expect(resolveShot(coreWorld, 5, 7, [1, 0], 8)?.target).toBeUndefined();

    const surfaceWorld = airWorld();
    surfaceWorld[SURFACE_HEIGHT][5] = {type:'dirt', hp:2, maxHp:2};
    expect(resolveShot(surfaceWorld, 5, SURFACE_HEIGHT + 2, [0, -1], 8)).toMatchObject({outcome:'blocked', path:[{x:5,y:SURFACE_HEIGHT + 1}]});

    expect(resolveShot(airWorld(), 2, 7, [-1, 0], 8)).toMatchObject({outcome:'blocked', path:[{x:1,y:7}]});
  });
});
