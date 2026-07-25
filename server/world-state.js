import fs from 'node:fs';
import path from 'node:path';

export const WORLD_STATE_VERSION = 1;
export const WORLD_WIDTH = 90;
export const MAX_WORLD_ROW = Math.floor(Number.MAX_SAFE_INTEGER / WORLD_WIDTH) - 1;
export const MAX_STATE_TILE_ENTRIES = 100_000;
export const MAX_EXPLORED_TILES = 90 * 1004;
export const MAX_ENEMIES = 2048;
export const MAX_STATE_BYTES = 16 * 1024 * 1024;
const ENEMY_KINDS = new Set(['tunnelFiend', 'skitterling', 'ironback', 'abyssStalker']);

function object(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function shortString(value, max = 100) {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function valuable(value) {
  return object(value) && shortString(value.name) && shortString(value.color, 32) &&
    finite(value.value, 0, 1_000_000) && finite(value.min, 0, MAX_WORLD_ROW) &&
    finite(value.max, 0, MAX_WORLD_ROW) && finite(value.chance, 0, 1);
}

export function validTile(tile) {
  if (!object(tile) || typeof tile.type !== 'string') return false;
  if (tile.type === 'air') return true;
  if (tile.type === 'rock') return finite(tile.hp, 0, Number.MAX_SAFE_INTEGER);
  if (!finite(tile.hp, 0, Number.MAX_SAFE_INTEGER) || !finite(tile.maxHp, 1, Number.MAX_SAFE_INTEGER)) return false;
  if (tile.type === 'ore') return valuable(tile.ore);
  if (tile.type === 'artifact') return valuable(tile.artifact);
  if (tile.type === 'enemy') return tile.kind === undefined || ENEMY_KINDS.has(tile.kind);
  return tile.type === 'dirt' || tile.type === 'hazard' || tile.type === 'motherlode';
}

function normalizedTile(tile) {
  return tile.type === 'enemy' && tile.kind === undefined ? {...tile, kind:'tunnelFiend'} : tile;
}

function normalizedTileEntry(entry) {
  return {...entry, tile:normalizedTile(entry.tile)};
}

export function validTileEntry(entry) {
  return object(entry) && Number.isInteger(entry.x) && entry.x >= 0 && entry.x < WORLD_WIDTH &&
    Number.isSafeInteger(entry.y) && entry.y >= 0 && entry.y <= MAX_WORLD_ROW && validTile(entry.tile);
}

export function validEnemy(enemy) {
  return object(enemy) && Number.isInteger(enemy.id) && enemy.id > 0 &&
    (enemy.kind === undefined || ENEMY_KINDS.has(enemy.kind)) &&
    finite(enemy.x, 0, WORLD_WIDTH - 1) && finite(enemy.y, 0, MAX_WORLD_ROW) &&
    finite(enemy.drawX, 0, WORLD_WIDTH - 1) && finite(enemy.drawY, 0, MAX_WORLD_ROW) &&
    finite(enemy.hp, 0, Number.MAX_SAFE_INTEGER) && finite(enemy.maxHp, 1, Number.MAX_SAFE_INTEGER) && typeof enemy.alive === 'boolean';
}

function normalizedEnemy(enemy) {
  return enemy.kind === undefined ? {...enemy, kind:'tunnelFiend'} : enemy;
}

export function emptyWorld(revision = 1) {
  return { version: WORLD_STATE_VERSION, revision, initialized: false, tiles: [], enemies: [], explored: '' };
}

function explorationIndexes(encoded) {
  if (typeof encoded !== 'string' || encoded.length > MAX_STATE_TILE_ENTRIES * 8) return null;
  const indexes = new Set();
  if (!encoded) return indexes;
  for (const range of encoded.split(',')) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(range);
    if (!match) return null;
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 3 * WORLD_WIDTH || end < start || end > MAX_WORLD_ROW * WORLD_WIDTH + WORLD_WIDTH - 1 || indexes.size + end - start + 1 > MAX_EXPLORED_TILES) return null;
    for (let index = start; index <= end; index++) indexes.add(index);
  }
  return indexes;
}

function encodeExploration(indexes) {
  const sorted = [...indexes].sort((a, b) => a - b);
  const ranges = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    let end = start;
    while (sorted[i + 1] === end + 1) end = sorted[++i];
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
  }
  return ranges.join(',');
}

export function validateWorldState(value) {
  if (!object(value) || value.version !== WORLD_STATE_VERSION || !Number.isInteger(value.revision) || value.revision < 1 ||
      typeof value.initialized !== 'boolean' || !Array.isArray(value.tiles) || value.tiles.length > MAX_STATE_TILE_ENTRIES ||
      !value.tiles.every(validTileEntry) || !Array.isArray(value.enemies) || value.enemies.length > MAX_ENEMIES ||
      !value.enemies.every(validEnemy) || explorationIndexes(value.explored) === null) return null;
  if (!value.initialized && (value.tiles.length || value.enemies.length || value.explored)) return null;
  const unique = new Map();
  for (const entry of value.tiles) unique.set(`${entry.x},${entry.y}`, entry);
  if (unique.size !== value.tiles.length) return null;
  return {
    version: WORLD_STATE_VERSION,
    revision: value.revision,
    initialized: value.initialized,
    tiles: value.tiles.map(normalizedTileEntry),
    enemies: value.enemies.map(normalizedEnemy),
    explored: value.explored
  };
}

export function createWorldStore(filePath) {
  let state = emptyWorld();
  let timer = null;

  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_STATE_BYTES) throw new Error('file exceeds the size limit');
    const loaded = validateWorldState(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    if (!loaded) throw new Error('invalid schema');
    state = loaded;
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn(`Ignoring malformed world state at ${filePath}: ${error.message}`);
  }

  function snapshot() {
    return structuredClone(state);
  }

  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    const data = `${JSON.stringify(state)}\n`;
    if (Buffer.byteLength(data) > MAX_STATE_BYTES) throw new Error('world state exceeds the size limit');
    try {
      fs.writeFileSync(temporary, data, { mode: 0o600 });
      fs.renameSync(temporary, filePath);
    } finally {
      try { fs.unlinkSync(temporary); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    }
  }

  function schedule() {
    if (!timer) timer = setTimeout(flush, 100);
  }

  function initialize(revision, tiles) {
    if (state.initialized || revision !== state.revision || !Array.isArray(tiles) || tiles.length > MAX_STATE_TILE_ENTRIES ||
        !tiles.every(validTileEntry) || tiles.some(entry => entry.tile.type === 'air')) return false;
    const unique = new Map(tiles.map(entry => [`${entry.x},${entry.y}`, entry]));
    if (unique.size !== tiles.length) return false;
    state.tiles = tiles.map(normalizedTileEntry);
    state.initialized = true;
    flush();
    return true;
  }

  function setTile(revision, entry) {
    if (!state.initialized || revision !== state.revision || !validTileEntry(entry)) return false;
    const key = `${entry.x},${entry.y}`;
    const index = state.tiles.findIndex(tile => `${tile.x},${tile.y}` === key);
    if (index < 0) state.tiles.push(normalizedTileEntry(entry));
    else state.tiles[index] = normalizedTileEntry(entry);
    schedule();
    return true;
  }

  function setEnemies(revision, enemies) {
    if (!state.initialized || revision !== state.revision || !Array.isArray(enemies) || enemies.length > MAX_ENEMIES || !enemies.every(validEnemy)) return false;
    state.enemies = enemies.map(normalizedEnemy);
    schedule();
    return true;
  }

  function setExplored(revision, explored) {
    const incoming = explorationIndexes(explored);
    const current = explorationIndexes(state.explored);
    if (!state.initialized || revision !== state.revision || !incoming || !current) return false;
    for (const index of incoming) current.add(index);
    state.explored = encodeExploration(current);
    schedule();
    return true;
  }

  function reset(revision) {
    if (revision !== state.revision) return false;
    state = emptyWorld(state.revision + 1);
    flush();
    return true;
  }

  return { snapshot, flush, initialize, setTile, setEnemies, setExplored, reset };
}
