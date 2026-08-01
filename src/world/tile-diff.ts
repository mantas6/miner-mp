// Tile mutations layered over the deterministic terrain.
//
// Terrain is never stored tile by tile: `world.ts` regenerates it from the
// coordinate seed, and everything the miners changed is a diff on top. The relay
// keeps the shared world exactly this way (`server/world-state.js` holds a list
// of `shared/world-schema.ts` tile entries behind a coordinate index), so the
// solo save reuses the same entries and the same application path — a world
// restored from `localStorage` and one adopted from the relay are rebuilt by
// identical code.
//
// The diff is a mutable `Map` rather than a copied-on-write object because it is
// written on every drill hit and grows to tens of thousands of entries; copying
// it per mutation costs seconds once a mine is well dug.

import { MAX_SAVED_TILE_ENTRIES } from '../../shared/constants';
import { tileKey } from '../../shared/tile-key';
import { tileEntriesSchema, type Tile, type TileEntry } from '../../shared/world-schema';
import { ensureWorldRow } from './world';

/** Accumulated tile mutations keyed by coordinate, in first-write order. */
export type TileDiff = Map<string, TileEntry>;

/** A diff holding the given entries (last-writer-wins). */
export function createTileDiff(entries: readonly TileEntry[] = []): TileDiff {
  const diff: TileDiff = new Map();
  for (const entry of entries) recordTileDiff(diff, entry);
  return diff;
}

/**
 * Record a tile mutation, replacing whatever the coordinate held before.
 * Re-writing a coordinate keeps its original position, so the entry order stays
 * oldest-first and a capped save drops the mine's earliest work first.
 */
export function recordTileDiff(diff: TileDiff, entry: TileEntry): void {
  diff.set(tileKey(entry.x, entry.y), {x: entry.x, y: entry.y, tile: entry.tile});
}

/** The diff as schema-shaped entries, oldest mutation first. */
export function tileDiffEntries(diff: TileDiff): TileEntry[] {
  return [...diff.values()];
}

/**
 * Validate persisted or received entries with the shared world schema. A
 * malformed payload yields no entries at all rather than a half-restored world.
 */
export function parseTileEntries(value: unknown): TileEntry[] {
  const result = tileEntriesSchema.safeParse(value);
  return result.success ? result.data : [];
}

/**
 * The newest `max` entries. A save that outgrows its budget forgets its oldest
 * tunnels instead of failing to write, so recent digging always survives.
 */
export function capTileEntries(entries: readonly TileEntry[], max = MAX_SAVED_TILE_ENTRIES): TileEntry[] {
  return entries.length <= max ? [...entries] : entries.slice(entries.length - max);
}

/**
 * Layer tile entries over lazily generated terrain, generating the row chunk
 * each entry needs. Mutates and returns the grid; out-of-range entries are
 * ignored. This is the one way a stored world becomes a live one.
 */
export function applyTileEntries(world: Tile[][], entries: readonly TileEntry[]): Tile[][] {
  for (const entry of entries) {
    const row = ensureWorldRow(world, entry.y);
    if (row && entry.x >= 0 && entry.x < row.length) row[entry.x] = entry.tile;
  }
  return world;
}
