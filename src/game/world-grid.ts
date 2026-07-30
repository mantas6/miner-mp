// Tile access facade over `state.world`.
//
// Every reader and writer of the shared terrain goes through one object instead
// of the ad-hoc `get`/`set`/`ensureWorldRow` closures that used to live in
// game.ts, so that lazy row generation, terrain-cache invalidation, and the
// tile-diff/broadcast bookkeeping all happen in exactly one place.

import { WORLD_W } from '../../shared/constants';
import { ensureWorldRow } from '../world/world';
import type { GameState, Tile } from '../core/types';

/**
 * Reads outside the generated world answer with indestructible rock rather than
 * `undefined`. A fresh tile per call, because callers may damage what they read.
 */
function outOfBoundsTile(): Tile {
  return {type: 'rock', hp: 999};
}

export interface WorldGrid {
  /** The live tile grid. Rows outside the generated range are still absent. */
  readonly world: Tile[][];
  /** Tile at a coordinate, generating its row chunk on first access. */
  get(x: number, y: number): Tile;
  /** Commit a tile mutation, invalidating render caches and replicating it. */
  set(x: number, y: number, tile: Tile, broadcast?: boolean): void;
  /** Generate the row chunk containing `y` so bulk readers can index it. */
  ensureRow(y: number): Tile[] | undefined;
}

export interface WorldGridOptions {
  state: Pick<GameState, 'world'>;
  /** Mark one tile's terrain cache dirty; only called when its type changed. */
  invalidateTerrain(x: number, y: number): void;
  /** Record a committed mutation for the tile diff and (optionally) the peer. */
  onTileSet(x: number, y: number, tile: Tile, broadcast: boolean): void;
}

export function createWorldGrid({state, invalidateTerrain, onTileSet}: WorldGridOptions): WorldGrid {
  return {
    get world() {
      return state.world;
    },
    get(x, y) {
      if (x < 0 || x >= WORLD_W) return outOfBoundsTile();
      return ensureWorldRow(state.world, y)?.[x] || outOfBoundsTile();
    },
    set(x, y, tile, broadcast = true) {
      const row = ensureWorldRow(state.world, y);
      if (!row || x < 0 || x >= row.length) return;
      const previousType = row[x].type;
      row[x] = tile;
      if (previousType !== tile.type) invalidateTerrain(x, y);
      onTileSet(x, y, tile, broadcast);
    },
    ensureRow(y) {
      return ensureWorldRow(state.world, y);
    }
  };
}
