// The Linebreaker: what one shot can reach, and what it hits on the way.
//
// The gun is a single-use device, not a fitting: it is bought at the depot, it
// rides in the cargo bay like a stick of dynamite, and firing it spends the
// item. There is no ammunition to track, so "can I shoot?" is a question about
// the bay, which is why the check below takes a count rather than the ship.

import { SURFACE_HEIGHT } from '../../shared/constants';
import { tileKey } from '../../shared/tile-key';
import type { InventoryItem } from './inventory';
import type { Direction, Tile } from './types';

/** The stackable item the depot sells and the cargo bay carries. */
export const GUN_ITEM: InventoryItem = {
  kind: 'gun',
  label: 'Linebreaker',
  color: '#ffe58a',
  // Depot equipment is not cargo, so the sell-everything button never prices it.
  value: 0
};

export interface ShotEnemyTarget {
  id: number;
  x: number;
  y: number;
}

export type ShotResult = {
  outcome: 'hit' | 'blocked' | 'miss';
  path: {x: number; y: number}[];
  target?: {kind: 'enemy'; enemy: ShotEnemyTarget} | {kind: 'tile'; x: number; y: number; tile: Tile};
};

export function isCardinalDirection(direction: Direction): boolean {
  const [dx, dy] = direction;
  return Math.abs(dx) + Math.abs(dy) === 1 && Number.isInteger(dx) && Number.isInteger(dy);
}

export function isGunDestructible(tile: Tile): boolean {
  return tile.type === 'dirt' || tile.type === 'ore' || tile.type === 'artifact' || tile.type === 'hazard' || tile.type === 'enemy';
}

/**
 * Whether this press spends a carried gun: one has to be armed, one has to be
 * aboard, and the direction has to be one of the four the barrel points down.
 * Pure — the caller takes the item out of the bay — so the same verdict serves
 * the key handler and the button.
 */
export function canFireGun(carried: number, armed: boolean, direction: Direction): boolean {
  return armed && carried > 0 && isCardinalDirection(direction);
}

export function resolveShot(
  world: Tile[][],
  originX: number,
  originY: number,
  direction: Direction,
  range: number,
  enemies: ShotEnemyTarget[] = []
): ShotResult | null {
  if (!isCardinalDirection(direction) || range < 1) return null;
  const [dx, dy] = direction;
  const activeEnemies = new Map(enemies.map(enemy => [tileKey(Math.round(enemy.x), Math.round(enemy.y)), enemy]));
  const path: {x: number; y: number}[] = [];

  for (let distance = 1; distance <= range; distance++) {
    const x = originX + dx * distance;
    const y = originY + dy * distance;
    const row = world[y];
    if (!row || x <= 0 || x >= row.length - 1 || y <= SURFACE_HEIGHT) {
      return {outcome: 'blocked', path};
    }
    path.push({x, y});
    const enemy = activeEnemies.get(tileKey(x, y));
    if (enemy) return {outcome: 'hit', path, target: {kind: 'enemy', enemy}};
    const tile = row[x];
    if (tile.type === 'air') continue;
    if (isGunDestructible(tile)) return {outcome: 'hit', path, target: {kind: 'tile', x, y, tile}};
    return {outcome: 'blocked', path};
  }
  return {outcome: 'miss', path};
}

export type GunKeyAction = 'arm' | 'cancel' | 'fire' | 'pass';

export function gunKeyAction(armed: boolean, key: string): GunKeyAction {
  const normalized = key.toLowerCase();
  if (normalized === 'g') return armed ? 'cancel' : 'arm';
  if (armed && normalized === 'escape') return 'cancel';
  if (armed && ['arrowleft', 'a', 'arrowright', 'd', 'arrowup', 'w', 'arrowdown', 's'].includes(normalized)) return 'fire';
  return 'pass';
}
