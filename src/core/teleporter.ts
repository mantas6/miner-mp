import { START_Y, SURFACE_HEIGHT, WORLD_W } from '../../shared/constants';
import type { Player, TeleportEffect, TeleportReturnPosition } from './types';

export const TELEPORT_EFFECT_FRAMES = 36;
export const REDUCED_TELEPORT_EFFECT_FRAMES = 12;
export const MIN_TELEPORT_DEPTH_METERS = 100;

export function canTeleportToSurface(playerY: number): boolean {
  return (playerY - START_Y) * 10 >= MIN_TELEPORT_DEPTH_METERS;
}

export function canUseTeleporter(player: Player, returnPosition: TeleportReturnPosition | null): boolean {
  if (player.y < SURFACE_HEIGHT) return returnPosition !== null;
  return player.teleporters > 0 && canTeleportToSurface(player.y);
}

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

export function teleportPlayerToSurface(player: Player): TeleportReturnPosition | null {
  if (!canTeleportToSurface(player.y) || player.teleporters <= 0) return null;

  const returnPosition = {x: player.x, y: player.y};
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
  return returnPosition;
}

export function teleportPlayerToReturn(player: Player, returnPosition: TeleportReturnPosition | null): boolean {
  if (player.y >= SURFACE_HEIGHT || !returnPosition) return false;

  Object.assign(player, {
    ...returnPosition,
    drawX: returnPosition.x,
    drawY: returnPosition.y,
    bob: 0,
    drillAnim: 0
  });
  return true;
}
