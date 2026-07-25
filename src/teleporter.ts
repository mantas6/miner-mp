import { START_Y, SURFACE_HEIGHT, WORLD_W } from './constants';
import type { Player } from './types';

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
