import { describe, expect, it } from 'vitest';
import { expandReachableAir } from '../src/enemy-exposure';
import { applyEnemySpawn, mergeEnemySnapshot, worldSyncFrom } from '../src/net-protocol';
import type { Enemy, Tile } from '../src/types';

function dirt(): Tile {
  return {type: 'dirt', hp: 2, maxHp: 2};
}

function world(): Tile[][] {
  return Array.from({length: 7}, () => Array.from({length: 8}, dirt));
}

describe('buried enemy exposure', () => {
  it('keeps a fully sealed enemy dormant', () => {
    const tiles = world();
    tiles[3][5] = {type: 'enemy', kind:'tunnelFiend', hp: 4, maxHp: 4};

    expect(expandReachableAir(tiles, new Set(), [{x: 1, y: 3}], true)).toEqual([]);
  });

  it('does not expose an enemy beside a disconnected partial tunnel', () => {
    const tiles = world();
    tiles[3][1] = {type: 'air'};
    tiles[3][4] = {type: 'air'};
    tiles[3][5] = {type: 'enemy', kind:'tunnelFiend', hp: 4, maxHp: 4};
    const reachable = new Set<string>();

    expect(expandReachableAir(tiles, reachable, [{x: 1, y: 3}], true)).toEqual([]);
    expect(expandReachableAir(tiles, reachable, [{x: 4, y: 3}])).toEqual([]);
  });

  it('exposes an enemy when air connects a traversable path to its edge', () => {
    const tiles = world();
    tiles[3][1] = {type: 'air'};
    tiles[3][5] = {type: 'enemy', kind:'tunnelFiend', hp: 4, maxHp: 4};
    const reachable = new Set<string>();
    expandReachableAir(tiles, reachable, [{x: 1, y: 3}], true);

    tiles[3][2] = {type: 'air'};
    tiles[3][3] = {type: 'air'};
    tiles[3][4] = {type: 'air'};

    expect(expandReachableAir(tiles, reachable, [{x: 2, y: 3}])).toEqual([{x: 5, y: 3}]);
  });

  it('synchronizes only the active enemy created after exposure', () => {
    const tiles = world();
    tiles[3][1] = {type: 'air'};
    tiles[3][2] = {type: 'air'};
    tiles[3][3] = {type: 'enemy', kind:'skitterling', hp: 4, maxHp: 4};
    const exposed = expandReachableAir(tiles, new Set(), [{x: 1, y: 3}], true);
    const spawn = {type: 'enemySpawn' as const, id: 7, kind:'skitterling' as const, ...exposed[0], hp: 4, maxHp: 4};
    const guestSpawn = applyEnemySpawn([], spawn);
    const hostEnemy: Enemy = {...guestSpawn[0], moveTick: 0, biteTick: 0, flash: 0};
    const sync = worldSyncFrom({}, [hostEnemy]);

    expect(exposed).toEqual([{x: 3, y: 3}]);
    expect(mergeEnemySnapshot([], sync.enemies)).toEqual(guestSpawn);
  });
});
