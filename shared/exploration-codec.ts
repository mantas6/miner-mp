import { MAX_WORLD_ROW, SURFACE_HEIGHT, WORLD_W } from './constants';

export function explorationIndex(x: number, y: number): number {
  return y * WORLD_W + x;
}

export function isTileExplored(explored: ReadonlySet<number>, x: number, y: number): boolean {
  return y < SURFACE_HEIGHT || explored.has(explorationIndex(x, y));
}

/**
 * Even footprints anchor the ship in the top-left tile of the central 2x2.
 * Thus a 4x4 footprint uses offsets -1..2 on both axes, with no odd-size rounding.
 */
export function revealFootprint(explored: Set<number>, x: number, y: number, size: number): number[] {
  const footprint = Math.max(1, Math.floor(size));
  const startX = x - Math.floor((footprint - 1) / 2);
  const startY = y - Math.floor((footprint - 1) / 2);
  const added: number[] = [];

  for (let wy = startY; wy < startY + footprint; wy++) {
    if (wy < SURFACE_HEIGHT || wy > MAX_WORLD_ROW) continue;
    for (let wx = startX; wx < startX + footprint; wx++) {
      if (wx < 0 || wx >= WORLD_W) continue;
      const index = explorationIndex(wx, wy);
      if (explored.has(index)) continue;
      explored.add(index);
      added.push(index);
    }
  }
  return added;
}

export function encodeExploration(explored: Iterable<number>): string {
  const indexes = [...new Set(explored)]
    .filter(index => Number.isSafeInteger(index) && index >= SURFACE_HEIGHT * WORLD_W && index <= MAX_WORLD_ROW * WORLD_W + WORLD_W - 1)
    .sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < indexes.length; i++) {
    const start = indexes[i];
    let end = start;
    while (i + 1 < indexes.length && indexes[i + 1] === end + 1) end = indexes[++i];
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
  }
  return ranges.join(',');
}

export function mergeExploration(explored: Set<number>, encoded: unknown): number[] {
  if (typeof encoded !== 'string' || !encoded) return [];
  const added: number[] = [];
  for (const range of encoded.split(',')) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(range);
    if (!match) continue;
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || start < SURFACE_HEIGHT * WORLD_W || end > MAX_WORLD_ROW * WORLD_W + WORLD_W - 1) continue;
    for (let index = start; index <= end; index++) {
      if (explored.has(index)) continue;
      explored.add(index);
      added.push(index);
    }
  }
  return added;
}
