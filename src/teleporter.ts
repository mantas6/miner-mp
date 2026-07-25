import { START_Y, SURFACE_HEIGHT, WORLD_W } from './constants';
import type { Player, TeleportEffect } from './types';

export const TELEPORT_EFFECT_FRAMES = 36;
export const REDUCED_TELEPORT_EFFECT_FRAMES = 12;

export function createTeleportEffect(
  originScreenX: number,
  originScreenY: number,
  destinationX: number,
  destinationY: number,
  reducedMotion = false
): TeleportEffect {
  return {
    originScreenX,
    originScreenY,
    destinationX,
    destinationY,
    frame: 0,
    duration: reducedMotion ? REDUCED_TELEPORT_EFFECT_FRAMES : TELEPORT_EFFECT_FRAMES,
    reducedMotion
  };
}

export function advanceTeleportEffect(effect: TeleportEffect | null): TeleportEffect | null {
  if (!effect || effect.frame + 1 >= effect.duration) return null;
  return {...effect, frame: effect.frame + 1};
}

export function teleportPlayerToSurface(player: Player): boolean {
  if (player.y < SURFACE_HEIGHT || player.teleporters <= 0) return false;

  const x = Math.floor(WORLD_W / 2);
  player.teleporters--;
  Object.assign(player, {
    x,
    y: START_Y,
    drawX: x,
    drawY: START_Y,
    bob: 0,
    drillAnim: 0
  });
  return true;
}
