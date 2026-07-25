import { afterEach, describe, expect, it, vi } from 'vitest';
import { MULTIPLAYER_SETTINGS_KEY } from '../src/multiplayer-settings';
import { confirmPlayerDataReset, resetPlayerData } from '../src/player-data-reset';
import { SAVE_KEY } from '../src/persistence';
import { createInitialState } from '../src/state';

afterEach(() => vi.unstubAllGlobals());

function storageWith(entries: [string, string][]) {
  const values = new Map(entries);
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key))
  };
}

describe('player-data reset', () => {
  it('clears every player/profile field and cleanly replaces its save', () => {
    const storage = storageWith([[SAVE_KEY, '{"cash":9999}']]);
    vi.stubGlobal('localStorage', storage);
    const state = createInitialState();
    Object.assign(state.player, {
      x: 8, y: 80, drawX: 7, drawY: 79, facing: -1, bob: 1, drillAnim: 2,
      drillDx: 1, drillDy: 0, fuel: 2, fuelMax: 400, hull: 3, hullMax: 300,
      cargoMax: 80, drill: 40, dynamite: 9, teleporters: 8, gunOwned: true,
      bullets: 70, visibility: 20, cargo: [{name: 'Gold', value: 50}]
    });
    state.cash = 9999;
    state.tick = 500;
    state.gameOver = true;
    state.camX = 20;
    state.camY = 60;
    state.particles.push({x:1,y:1,vx:1,vy:1,life:1,color:'#fff',size:1});
    state.stats = {maxDepth: 900, totalCashEarned: 800, oreMined: 7, artifactsFound: 6, enemiesDestroyed: 5, deaths: 4, motherlodeClaims: 3, motherlodeExtractions: 2};
    state.extractionPhase = 'returning';
    state.role = 'host';
    state.connected = true;
    state.remotePlayers.push({x:1,y:1,drawX:1,drawY:1,facing:1,drillAnim:0,drillDx:0,drillDy:1,bob:0});
    state.teleportReturnPosition = {x: 8, y: 80};
    state.exploredTiles.add(1234);
    state.input.gunArmed = true;

    resetPlayerData(state);

    const fresh = createInitialState();
    expect(state.player).toEqual(fresh.player);
    expect(state).toMatchObject({
      cash: fresh.cash, tick: 0, gameOver: false, camX: 0, camY: 0,
      particles: [], stats: fresh.stats, extractionPhase: 'none', role: null,
      connected: false, remotePlayers: [], teleportEffect: null,
      teleportReturnPosition: null, input: fresh.input
    });
    expect(state.exploredTiles.size).toBe(0);
    expect(storage.removeItem).toHaveBeenCalledWith(SAVE_KEY);
    expect(JSON.parse(storage.values.get(SAVE_KEY)!)).toMatchObject({
      cash: fresh.cash, fuelMax: fresh.player.fuelMax, hullMax: fresh.player.hullMax,
      cargoMax: fresh.player.cargoMax, drill: fresh.player.drill, dynamite: 0,
      teleporters: 0, gunOwned: false, bullets: 0, visibility: fresh.player.visibility,
      explored: '', stats: fresh.stats
    });
  });

  it('does nothing when explicit confirmation is cancelled', () => {
    const confirm = vi.fn(() => false);
    expect(confirmPlayerDataReset(confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('preserves shared world state and the non-player relay setting', () => {
    const relay = JSON.stringify({serverUrl:'wss://relay.example'});
    const storage = storageWith([[SAVE_KEY, '{}'], [MULTIPLAYER_SETTINGS_KEY, relay]]);
    vi.stubGlobal('localStorage', storage);
    const state = createInitialState();
    const world = [[{type:'air'}]] as typeof state.world;
    const enemies = [{id:9,kind:'tunnelFiend' as const,x:1,y:2,drawX:1,drawY:2,hp:3,maxHp:4,alive:true,moveTick:2,biteTick:1,flash:0}];
    state.world = world;
    state.enemies = enemies;

    resetPlayerData(state);

    expect(state.world).toBe(world);
    expect(state.enemies).toBe(enemies);
    expect(storage.values.get(MULTIPLAYER_SETTINGS_KEY)).toBe(relay);
    expect(storage.removeItem).not.toHaveBeenCalledWith(MULTIPLAYER_SETTINGS_KEY);
  });
});
