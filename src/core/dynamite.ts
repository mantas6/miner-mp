import { SURFACE_HEIGHT } from '../../shared/constants';
import type { Tile } from './types';

export interface BlastCoordinate {
  x: number;
  y: number;
}

export function isDynamiteDestructible(tile: Tile): boolean {
  return tile.type === 'dirt' || tile.type === 'rock' || tile.type === 'ore' || tile.type === 'artifact' || tile.type === 'hazard' || tile.type === 'enemy';
}

/** Select blast tiles without mutating terrain or granting rewards for destroyed valuables. */
export function getDynamiteBlastTargets(
  world: Tile[][],
  centerX: number,
  centerY: number,
  radius: number
): BlastCoordinate[] {
  const targets: BlastCoordinate[] = [];
  for (let y = centerY - radius; y <= centerY + radius; y++) {
    const row = world[y];
    if (!row || y <= SURFACE_HEIGHT) continue;
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      if (x <= 0 || x >= row.length - 1) continue;
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy > radius * radius) continue;
      if (isDynamiteDestructible(row[x])) targets.push({x, y});
    }
  }
  return targets;
}
