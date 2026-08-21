// The emergency round trip: up to the depot on a carried teleporter, and back
// down to the tile it was used on.
//
// The teleporter is a single-use item, not a fitting: it is bought at the depot,
// it rides in the cargo bay like a stick of dynamite, and the trip up spends it.
// The trip *back* is free — the return point is the receipt for the item already
// spent — so only the outbound jump touches the bay.

import { START_Y, SURFACE_HEIGHT } from '../../shared/constants';
import { countItem, removeItem, type InventoryItem } from './inventory';
import { placeAtSurfaceSpawn } from './state';
import type { Player, TeleportEffect, TeleportReturnPosition } from './types';

export const TELEPORT_EFFECT_FRAMES = 36;
export const REDUCED_TELEPORT_EFFECT_FRAMES = 12;
export const MIN_TELEPORT_DEPTH_METERS = 100;

/** The stackable item the depot sells and the cargo bay carries. */
export const TELEPORTER_ITEM: InventoryItem = {
  kind: 'teleporter',
  label: 'Teleporter',
  color: '#72d9ff',
  // Depot equipment is not cargo, so the sell-everything button never prices it.
  value: 0
};

export function canTeleportToSurface(playerY: number): boolean {
  return (playerY - START_Y) * 10 >= MIN_TELEPORT_DEPTH_METERS;
}

/** Teleporters aboard; the whole "have I got a way up?" question. */
export function teleportersCarried(player: Pick<Player, 'inventory'>): number {
  return countItem(player.inventory, TELEPORTER_ITEM.kind);
}

export function canUseTeleporter(player: Player, returnPosition: TeleportReturnPosition | null): boolean {
  if (player.y < SURFACE_HEIGHT) return returnPosition !== null;
  return teleportersCarried(player) > 0 && canTeleportToSurface(player.y);
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
  if (!canTeleportToSurface(player.y) || teleportersCarried(player) <= 0) return null;

  const returnPosition = {x: player.x, y: player.y};
  // The teleporter is spent on the way up; the return trip rides on the point it
  // left behind.
  player.inventory = removeItem(player.inventory, TELEPORTER_ITEM.kind);
  placeAtSurfaceSpawn(player);
  Object.assign(player, {
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
