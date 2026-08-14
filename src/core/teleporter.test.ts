import { describe, expect, it } from 'vitest';
import { ORES, START_Y, WORLD_W } from '../../shared/constants';
import { addOre, createInventory } from './inventory';
import { createInitialState } from './state';
import {
  MIN_TELEPORT_DEPTH_METERS,
  REDUCED_TELEPORT_EFFECT_FRAMES,
  TELEPORT_EFFECT_FRAMES,
  advanceTeleportEffect,
  canTeleportToSurface,
  canUseTeleporter,
  createTeleportEffect,
  teleportPlayerToReturn,
  teleportPlayerToSurface
} from './teleporter';

describe('surface teleporter', () => {
  it('rejects departure above 100 m and allows it at exactly 100 m', () => {
    const player = createInitialState().player;
    Object.assign(player, {x: 7, drawX: 7, teleporters: 2});

    player.y = START_Y + MIN_TELEPORT_DEPTH_METERS / 10 - 1;
    expect(canTeleportToSurface(player.y)).toBe(false);
    expect(canUseTeleporter(player, null)).toBe(false);
    expect(teleportPlayerToSurface(player)).toBeNull();
    expect(player).toMatchObject({y: START_Y + 9, teleporters: 2});

    player.y = START_Y + MIN_TELEPORT_DEPTH_METERS / 10;
    expect(canTeleportToSurface(player.y)).toBe(true);
    expect(canUseTeleporter(player, null)).toBe(true);
    expect(teleportPlayerToSurface(player)).toEqual({x: 7, y: START_Y + 10});
    expect(player.teleporters).toBe(1);
  });

  it('consumes one charge and moves to the safe spawn without free services', () => {
    const state = createInitialState();
    const player = state.player;
    const inventory = addOre(createInventory(), ORES[3], 10)!;
    state.cash = 90;
    state.extractionPhase = 'returning';
    Object.assign(player, {x: 4, y: 120, drawX: 4, drawY: 120, fuel: 17, hull: 42, inventory, teleporters: 2});

    expect(teleportPlayerToSurface(player)).toEqual({x: 4, y: 120});
    expect(player).toMatchObject({
      x: Math.floor(WORLD_W / 2),
      y: START_Y,
      drawX: Math.floor(WORLD_W / 2),
      drawY: START_Y,
      fuel: 17,
      hull: 42,
      teleporters: 1
    });
    expect(player.inventory).toBe(inventory);
    expect(state.cash).toBe(90);
    expect(state.extractionPhase).toBe('returning');
  });

  it('does nothing at the surface or without inventory', () => {
    const player = createInitialState().player;
    player.teleporters = 1;
    expect(teleportPlayerToSurface(player)).toBeNull();
    expect(player.teleporters).toBe(1);

    player.y = 20;
    player.teleporters = 0;
    expect(teleportPlayerToSurface(player)).toBeNull();
    expect(player.y).toBe(20);
  });

  it('returns to the exact departure point without consuming another charge and supports another round trip', () => {
    const player = createInitialState().player;
    Object.assign(player, {x: 7, y: 143, drawX: 7, drawY: 143, teleporters: 2});

    const firstReturn = teleportPlayerToSurface(player);
    expect(firstReturn).toEqual({x: 7, y: 143});
    expect(teleportPlayerToReturn(player, firstReturn)).toBe(true);
    expect(player).toMatchObject({x: 7, y: 143, drawX: 7, drawY: 143, teleporters: 1});

    player.x = 11;
    player.y = 176;
    const secondReturn = teleportPlayerToSurface(player);
    expect(secondReturn).toEqual({x: 11, y: 176});
    expect(teleportPlayerToReturn(player, secondReturn)).toBe(true);
    expect(player).toMatchObject({x: 11, y: 176, teleporters: 0});
  });

  it('keeps a pending surface return enabled at 0 m without another charge', () => {
    const player = createInitialState().player;
    const returnPosition = {x: 7, y: START_Y + 10};

    expect(player.teleporters).toBe(0);
    expect(canUseTeleporter(player, returnPosition)).toBe(true);
    expect(teleportPlayerToReturn(player, returnPosition)).toBe(true);
    expect(player).toMatchObject({...returnPosition, teleporters: 0});
  });

  it('does not return without a pending point or from underground', () => {
    const player = createInitialState().player;

    expect(teleportPlayerToReturn(player, null)).toBe(false);
    player.y = 20;
    expect(teleportPlayerToReturn(player, {x: 4, y: 120})).toBe(false);
    expect(player).toMatchObject({y: 20, teleporters: 0});
  });

  it('captures both visible endpoints and expires without a timer', () => {
    let effect = createTeleportEffect(320, 240, 45, START_Y);

    expect(effect).toMatchObject({
      originScreenX: 320,
      originScreenY: 240,
      destinationX: 45,
      destinationY: START_Y,
      frame: 0,
      duration: TELEPORT_EFFECT_FRAMES,
      reducedMotion: false
    });
    for (let frame = 1; frame <= TELEPORT_EFFECT_FRAMES; frame++) {
      effect = advanceTeleportEffect(effect)!;
      if (frame < TELEPORT_EFFECT_FRAMES) expect(effect.frame).toBe(frame);
    }
    expect(effect).toBeNull();
    expect(advanceTeleportEffect(effect)).toBeNull();
  });

  it('uses a brief static lifecycle for reduced motion', () => {
    const effect = createTeleportEffect(100, 120, 45, START_Y, true);

    expect(effect.reducedMotion).toBe(true);
    expect(effect.duration).toBe(REDUCED_TELEPORT_EFFECT_FRAMES);
    expect(effect.duration).toBeLessThan(TELEPORT_EFFECT_FRAMES);
  });
});
