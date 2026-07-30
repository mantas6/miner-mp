import { SURFACE_HEIGHT } from '../../shared/constants';
import { tileKey as key } from './tile-key';
import type { Tile } from './types';

export interface EnemyPosition {
  x: number;
  y: number;
}

export interface EnemyTarget extends EnemyPosition {
  local: boolean;
}

export function findClosestEnemyTarget(
  from: EnemyPosition,
  localPlayer: EnemyPosition | null,
  remotePlayers: EnemyPosition[]
): EnemyTarget | null {
  const targets: EnemyTarget[] = [
    ...(localPlayer ? [{...localPlayer, local: true}] : []),
    ...remotePlayers.map(player => ({...player, local: false}))
  ];
  return targets.reduce<EnemyTarget | null>((closest, target) => {
    if (!closest) return target;
    const distance = Math.abs(target.x - from.x) + Math.abs(target.y - from.y);
    const closestDistance = Math.abs(closest.x - from.x) + Math.abs(closest.y - from.y);
    return distance < closestDistance ? target : closest;
  }, null);
}

export function findEnemyPathStep(
  world: Tile[][],
  from: EnemyPosition,
  target: EnemyPosition,
  occupied: EnemyPosition[],
  maxDistance: number
): EnemyPosition | null {
  const horizontal = [Math.sign(target.x - from.x), 0] as const;
  const vertical = [0, Math.sign(target.y - from.y)] as const;
  const preferred = Math.abs(target.x - from.x) >= Math.abs(target.y - from.y)
    ? [horizontal, vertical]
    : [vertical, horizontal];
  const directions = [...preferred, [1, 0], [-1, 0], [0, 1], [0, -1]]
    .filter(([dx, dy], index, all) => (dx || dy) && all.findIndex(([x, y]) => x === dx && y === dy) === index);
  const blocked = new Set(occupied.map(position => key(position.x, position.y)));
  blocked.delete(key(from.x, from.y));
  const visited = new Set([key(from.x, from.y)]);
  const queue = [{...from, distance: 0, firstStep: null as EnemyPosition | null}];

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (current.distance >= maxDistance) continue;
    for (const [dx, dy] of directions) {
      const x = current.x + dx;
      const y = current.y + dy;
      const tile = world[y]?.[x];
      const tileKey = key(x, y);
      if (x <= 0 || x >= (world[y]?.length ?? 0) - 1 || y < SURFACE_HEIGHT) continue;
      if (!tile || tile.type !== 'air' || blocked.has(tileKey) || visited.has(tileKey)) continue;
      const firstStep = current.firstStep ?? {x, y};
      if (x === target.x && y === target.y) return firstStep;
      visited.add(tileKey);
      queue.push({x, y, distance: current.distance + 1, firstStep});
    }
  }

  return null;
}
