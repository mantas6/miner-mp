import { describe, expect, it } from 'vitest';
import { START_Y, WORLD_W } from '../src/constants';
import { createInitialState } from '../src/state';
import { teleportPlayerToSurface } from '../src/teleporter';

describe('surface teleporter', () => {
  it('consumes one charge and moves to the safe spawn without free services', () => {
    const state = createInitialState();
    const player = state.player;
    const cargo = [{name: 'Gold', value: 70}];
    state.cash = 90;
    state.extractionPhase = 'returning';
    Object.assign(player, {x: 4, y: 120, drawX: 4, drawY: 120, fuel: 17, hull: 42, cargo, teleporters: 2});

    expect(teleportPlayerToSurface(player)).toBe(true);
    expect(player).toMatchObject({
      x: Math.floor(WORLD_W / 2),
      y: START_Y,
      drawX: Math.floor(WORLD_W / 2),
      drawY: START_Y,
      fuel: 17,
      hull: 42,
      teleporters: 1
    });
    expect(player.cargo).toBe(cargo);
    expect(state.cash).toBe(90);
    expect(state.extractionPhase).toBe('returning');
  });

  it('does nothing at the surface or without inventory', () => {
    const player = createInitialState().player;
    player.teleporters = 1;
    expect(teleportPlayerToSurface(player)).toBe(false);
    expect(player.teleporters).toBe(1);

    player.y = 20;
    player.teleporters = 0;
    expect(teleportPlayerToSurface(player)).toBe(false);
    expect(player.y).toBe(20);
  });
});
