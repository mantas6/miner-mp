import { SURFACE_HEIGHT } from './constants';
import type { Direction, Tile } from './types';

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

export function consumeBulletForShot(
  player: {gunOwned: boolean; bullets: number},
  armed: boolean,
  direction: Direction
): boolean {
  if (!armed || !player.gunOwned || player.bullets <= 0 || !isCardinalDirection(direction)) return false;
  player.bullets--;
  return true;
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
  const activeEnemies = new Map(enemies.map(enemy => [`${Math.round(enemy.x)},${Math.round(enemy.y)}`, enemy]));
  const path: {x: number; y: number}[] = [];

  for (let distance = 1; distance <= range; distance++) {
    const x = originX + dx * distance;
    const y = originY + dy * distance;
    const row = world[y];
    if (!row || x <= 0 || x >= row.length - 1 || y <= SURFACE_HEIGHT) {
      return {outcome: 'blocked', path};
    }
    path.push({x, y});
    const enemy = activeEnemies.get(`${x},${y}`);
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
