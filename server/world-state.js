import fs from 'node:fs';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import { MAX_STATE_BYTES } from '../shared/constants.ts';
import { encodeExploration, mergeExploration } from '../shared/exploration-codec.ts';
import { tileKey } from '../shared/tile-key.ts';
import {
  emptyWorldState,
  enemyEntriesSchema,
  explorationSchema,
  generatedTileEntriesSchema,
  parseWorldState,
  tileEntrySchema
} from '../shared/world-schema.ts';

// Limits, schemas, and the exploration codec all live in shared/, so the relay
// and the browser client enforce one identical rule set.
export const emptyWorld = emptyWorldState;
export const validateWorldState = parseWorldState;

export function createWorldStore(filePath) {
  let state = emptyWorld();
  let timer = null;
  /** Coordinate -> index into `state.tiles`, so writes stay O(1). */
  let tileIndex = new Map();

  function reindexTiles() {
    tileIndex = new Map(state.tiles.map((entry, index) => [tileKey(entry.x, entry.y), index]));
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_STATE_BYTES) throw new Error('file exceeds the size limit');
    const loaded = validateWorldState(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    if (!loaded) throw new Error('invalid schema');
    state = loaded;
    reindexTiles();
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn(`Ignoring malformed world state at ${filePath}: ${error.message}`);
  }

  function snapshot() {
    return structuredClone(state);
  }

  /**
   * Persist the world. Never throws: a failing disk must not take the relay
   * down and disconnect both players, so write errors are logged instead.
   */
  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    try {
      const data = `${JSON.stringify(state)}\n`;
      if (Buffer.byteLength(data) > MAX_STATE_BYTES) throw new Error('world state exceeds the size limit');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileAtomic.sync(filePath, data, { mode: 0o600 });
      return true;
    } catch (error) {
      console.error(`Failed to persist world state to ${filePath}: ${error.message}`);
      return false;
    }
  }

  function schedule() {
    if (!timer) timer = setTimeout(flush, 100);
  }

  function initialize(revision, tiles) {
    if (state.initialized || revision !== state.revision) return false;
    const parsed = generatedTileEntriesSchema.safeParse(tiles);
    if (!parsed.success) return false;
    const unique = new Map(parsed.data.map(entry => [tileKey(entry.x, entry.y), entry]));
    if (unique.size !== parsed.data.length) return false;
    state.tiles = parsed.data;
    state.initialized = true;
    reindexTiles();
    flush();
    return true;
  }

  function setTile(revision, entry) {
    if (!state.initialized || revision !== state.revision) return false;
    const parsed = tileEntrySchema.safeParse(entry);
    if (!parsed.success) return false;
    const key = tileKey(parsed.data.x, parsed.data.y);
    const index = tileIndex.get(key);
    if (index === undefined) {
      tileIndex.set(key, state.tiles.length);
      state.tiles.push(parsed.data);
    } else {
      state.tiles[index] = parsed.data;
    }
    schedule();
    return true;
  }

  function setEnemies(revision, enemies) {
    if (!state.initialized || revision !== state.revision) return false;
    const parsed = enemyEntriesSchema.safeParse(enemies);
    if (!parsed.success) return false;
    state.enemies = parsed.data;
    schedule();
    return true;
  }

  function setExplored(revision, explored) {
    if (!state.initialized || revision !== state.revision) return false;
    const parsed = explorationSchema.safeParse(explored);
    if (!parsed.success) return false;
    const merged = new Set();
    mergeExploration(merged, state.explored);
    mergeExploration(merged, parsed.data);
    state.explored = encodeExploration(merged);
    schedule();
    return true;
  }

  function reset(revision) {
    if (revision !== state.revision) return false;
    state = emptyWorld(state.revision + 1);
    reindexTiles();
    flush();
    return true;
  }

  return { snapshot, flush, initialize, setTile, setEnemies, setExplored, reset };
}
