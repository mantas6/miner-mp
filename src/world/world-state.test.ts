import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../core/state';
import { confirmWorldStateReset, resetWorldTerrain, WORLD_STATE_RESET_CONFIRMATION } from './world-state';
import type { Tile } from '../core/types';

describe('world state reset', () => {
  it('requires explicit, world-specific confirmation', () => {
    const confirm = vi.fn(() => false);
    expect(confirmWorldStateReset(confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledWith(WORLD_STATE_RESET_CONFIRMATION);
    expect(WORLD_STATE_RESET_CONFIRMATION).toContain('Player cash, upgrades, inventory, stats, settings, and ship condition are preserved');
  });

  it('regenerates terrain/entities/view state while preserving player progression and inventory', () => {
    const state = createInitialState();
    Object.assign(state.player, { fuel: 17, hull: 23, fuelMax: 400, hullMax: 300, cargoMax: 80, drill: 40, dynamite: 9, teleporters: 8, gunOwned: true, bullets: 70, visibility: 20, cargo: [{name:'Gold'}] });
    state.cash = 9999;
    state.stats.maxDepth = 900;
    state.world = [[{type:'air'}]];
    state.enemies = [{id:1,kind:'tunnelFiend',x:1,y:1,drawX:1,drawY:1,hp:2,maxHp:2,alive:true,moveTick:0,biteTick:0,flash:0}];
    state.exploredTiles.add(400);
    state.extractionPhase = 'returning';
    state.teleportReturnPosition = {x: 17, y: 200};
    const playerBefore = structuredClone(state.player);
    const statsBefore = structuredClone(state.stats);

    resetWorldTerrain(state, (x, y): Tile => (x === 4 && y === 5 ? {type:'air'} : {type:'dirt', hp:2, maxHp:2}));

    expect(state.world).toEqual([]);
    expect(state.enemies).toEqual([]);
    expect(state.exploredTiles.size).toBe(0);
    expect(state.extractionPhase).toBe('none');
    expect(state.teleportReturnPosition).toBeNull();
    expect(state.cash).toBe(9999);
    expect(state.stats).toEqual(statsBefore);
    expect(state.player).toMatchObject({ ...playerBefore, x:45, y:2, drawX:45, drawY:2 });
  });
});
