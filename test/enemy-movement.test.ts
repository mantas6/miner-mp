import { describe, expect, it } from 'vitest';
import { HULL } from '../src/balance';
import { expandReachableAir } from '../src/enemy-exposure';
import { findClosestEnemyTarget, findEnemyPathStep, type EnemyPosition } from '../src/enemy-movement';
import type { Enemy, Tile } from '../src/types';

function dirt(): Tile {
  return {type: 'dirt', hp: 2, maxHp: 2};
}

describe('enemy movement', () => {
  it('follows a cleared path around a bend until it reaches attack range', () => {
    const world = Array.from({length: 8}, () => Array.from({length: 9}, dirt));
    const player = {x: 3, y: 5};
    const clearedPath = [player, {x: 3, y: 4}, {x: 3, y: 3}, {x: 4, y: 3}, {x: 5, y: 3}, {x: 6, y: 3}, {x: 6, y: 4}, {x: 6, y: 5}, {x: 5, y: 5}];
    for (const {x, y} of clearedPath) world[y][x] = {type: 'air'};
    let enemy: EnemyPosition = {x: 5, y: 5};

    const firstStep = findEnemyPathStep(world, enemy, player, [enemy], 24);
    expect(firstStep).toEqual({x: 6, y: 5});

    while (Math.abs(enemy.x - player.x) + Math.abs(enemy.y - player.y) > 1) {
      const step = findEnemyPathStep(world, enemy, player, [enemy], 24);
      expect(step).not.toBeNull();
      enemy = step!;
    }

    expect(enemy).toEqual({x: 3, y: 4});
  });

  it('attacks a guest after the guest clears a path to a sealed enemy', () => {
    const world = Array.from({length: 8}, () => Array.from({length: 40}, dirt));
    const guest = {x: 4, y: 5};
    const host = {x: 35, y: 5};
    const enemyTile = {x: 10, y: 5};
    const reachableAir = new Set<string>();
    world[guest.y][guest.x] = {type: 'air'};
    world[enemyTile.y][enemyTile.x] = {type: 'enemy', hp: 4, maxHp: 4};

    expect(expandReachableAir(world, reachableAir, [guest], true)).toEqual([]);
    for (let x = guest.x + 1; x < enemyTile.x; x++) world[guest.y][x] = {type: 'air'};
    expect(expandReachableAir(world, reachableAir, [{x: guest.x + 1, y: guest.y}])).toEqual([enemyTile]);

    world[enemyTile.y][enemyTile.x] = {type: 'air'};
    const enemy: Enemy = {
      id: 1,
      ...enemyTile,
      drawX: enemyTile.x,
      drawY: enemyTile.y,
      hp: 4,
      maxHp: 4,
      alive: true,
      moveTick: 0,
      biteTick: 0,
      flash: 0
    };
    let guestHull = 100;

    for (let tick = 1; tick <= 100; tick++) {
      const target = findClosestEnemyTarget(enemy, host, [guest]);
      expect(target?.local).toBe(false);
      const distance = Math.abs(enemy.x - target!.x) + Math.abs(enemy.y - target!.y);
      if (distance <= 1) {
        if (tick - enemy.biteTick > 22) {
          enemy.biteTick = tick;
          guestHull -= HULL.enemyBite.base + Math.floor(enemy.y / HULL.enemyBite.perDepth) * HULL.enemyBite.step;
          break;
        }
        continue;
      }
      const moveDelay = Math.max(7, 14 - Math.floor(enemy.y / 70));
      if (tick - enemy.moveTick < moveDelay) continue;
      enemy.moveTick = tick;
      const step = findEnemyPathStep(world, enemy, target!, [enemy], 24);
      if (step && (step.x !== target!.x || step.y !== target!.y)) Object.assign(enemy, step);
    }

    expect(enemy).toMatchObject({x: 5, y: 5});
    expect(guestHull).toBeLessThan(100);
  });
});
