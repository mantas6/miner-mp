import { MAX_WORLD_ROW, START_Y, SURFACE_HEIGHT, WORLD_W } from '../shared/constants';
import { ECONOMY, LIMITS, STARTING } from './core/balance';
import { addItem, countItem } from './core/inventory';
import { SCANNER_DEVICE, SCANNER_ITEM, type ScannerDevice } from './core/scanner-device';
import { createDefaultStats } from './core/state';
import { encodeExploration, mergeExploration } from '../shared/exploration-codec';
import { capTileEntries, createTileDiff, parseTileEntries, tileDiffEntries } from './world/tile-diff';
import type { GameState, GameStats } from './core/types';

// Local save file for a solo miner: the wallet, the ship, the fog, and the mine
// itself.
//
// Terrain is not stored tile by tile — it regenerates from its seed — so the
// world is saved the way the relay saves the shared one: as the list of
// `shared/world-schema.ts` tile entries that differ from the generated terrain
// (see `src/world/tile-diff.ts`). Version history:
//   * v1: cash, upgrades, inventory, stats.
//   * v2: rebalanced cargo capacity.
//   * v3: run-length encoded explored tiles.
//   * v4: `tiles`, the solo world's tile diff.
//   * v5: `x`/`y`, the tile the ship was parked on.
//   * v6: `scanners` and `scannerDevices` — the survey scanners carried, and the
//     ones left running in the mine.
// Older blobs still load; they just restore a pristine mine, and pre-v5 saves
// start at the depot the way they always did.
//
// The cargo bay itself is deliberately *not* saved: ore is lost with the run.
// Scanners are equipment rather than cargo, so they are stored as a count and
// re-stacked into the bay on load, the way dynamite and teleporters are stored
// as counts on the ship.

/** The persisted save file. Every field is re-validated on load. */
interface SavedProgress {
  version?: unknown;
  tiles?: unknown;
  x?: unknown;
  y?: unknown;
  cash?: unknown;
  fuelMax?: unknown;
  hullMax?: unknown;
  cargoMax?: unknown;
  drill?: unknown;
  dynamite?: unknown;
  teleporters?: unknown;
  scanners?: unknown;
  scannerDevices?: unknown;
  gunOwned?: unknown;
  bullets?: unknown;
  visibility?: unknown;
  explored?: unknown;
  stats?: Partial<Record<keyof GameStats, unknown>>;
}

export const SAVE_KEY = 'moleload-progress-v1';
export const SAVE_VERSION = 6;
const LEGACY_CARGO_STEP = 10;
const CARGO_BALANCE_SAVE_VERSION = 2;

export function numeric(value: unknown, fallback: number, min=0, max=Number.MAX_SAFE_INTEGER): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * Rebuild the deployed scanners, dropping anything a corrupt or hand-edited save
 * put outside the mine. The count is capped the way the game caps it, so a save
 * can never restore more hardware than the player could have placed.
 */
export function parseScannerDevices(value: unknown): ScannerDevice[] {
  if (!Array.isArray(value)) return [];
  const devices: ScannerDevice[] = [];
  for (const entry of value) {
    if (devices.length >= SCANNER_DEVICE.maxPlaced) break;
    if (!entry || typeof entry !== 'object') continue;
    const saved = entry as {x?: unknown; y?: unknown; timer?: unknown};
    const x = Math.floor(numeric(saved.x, -1, -1, WORLD_W - 1));
    const y = Math.floor(numeric(saved.y, -1, -1, MAX_WORLD_ROW));
    if (x < 0 || y < SURFACE_HEIGHT) continue;
    devices.push({x, y, timer: Math.floor(numeric(saved.timer, 0, 0, SCANNER_DEVICE.intervalTicks))});
  }
  return devices;
}

export function load(state: GameState): void {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const save: SavedProgress = JSON.parse(raw);
    const p = state.player;
    state.cash = numeric(save.cash, state.cash, 0);
    p.fuelMax = numeric(save.fuelMax, p.fuelMax, LIMITS.fuelMax.min, LIMITS.fuelMax.max);
    p.hullMax = numeric(save.hullMax, p.hullMax, LIMITS.hullMax.min, LIMITS.hullMax.max);
    const savedCargoMax = numeric(save.cargoMax, p.cargoMax, LIMITS.cargoMax.min, LIMITS.cargoMax.max);
    const cargoUpgradeLevel = Math.max(0, Math.round((savedCargoMax - STARTING.cargoMax) / LEGACY_CARGO_STEP));
    p.cargoMax = numeric(save.version, 1, 1) < CARGO_BALANCE_SAVE_VERSION
      ? STARTING.cargoMax + cargoUpgradeLevel * ECONOMY.cargo.step
      : savedCargoMax;
    p.drill = numeric(save.drill, p.drill, LIMITS.drill.min, LIMITS.drill.max);
    p.dynamite = Math.floor(numeric(save.dynamite, p.dynamite, LIMITS.dynamite.min, LIMITS.dynamite.max));
    p.teleporters = Math.floor(numeric(save.teleporters, p.teleporters, LIMITS.teleporters.min, LIMITS.teleporters.max));
    p.gunOwned = save.gunOwned === true;
    p.bullets = Math.floor(numeric(save.bullets, p.bullets, LIMITS.bullets.min, LIMITS.bullets.max));
    p.visibility = Math.floor(numeric(save.visibility, p.visibility, LIMITS.visibility.min, LIMITS.visibility.max));
    // Scanners are equipment, so they come back into the bay the run starts with;
    // `run.resume()` clears the ore around them and leaves them alone.
    const scanners = Math.floor(numeric(save.scanners, 0, LIMITS.scanners.min, LIMITS.scanners.max));
    if (scanners > 0) p.inventory = addItem(p.inventory, SCANNER_ITEM, scanners) ?? p.inventory;
    state.scannerDevices = parseScannerDevices(save.scannerDevices);
    // The ship resumes on the tile it parked on, render position included so it
    // appears there instead of easing in from the depot. The clamps are the ones
    // `movementDestination` enforces, so no save can park a miner in a wall.
    const x = Math.floor(numeric(save.x, p.x, 1, WORLD_W - 2));
    const y = Math.floor(numeric(save.y, p.y, START_Y, MAX_WORLD_ROW));
    Object.assign(p, {x, y, drawX: x, drawY: y});
    mergeExploration(state.exploredTiles, typeof save.explored === 'string' ? save.explored : '');
    // Saves written before version 4 carry no terrain, so they simply restore an
    // untouched mine. `run.resume()` lays these entries back over it.
    state.soloTileDiff = createTileDiff(parseTileEntries(save.tiles));
    const defaultStats = createDefaultStats();
    const savedStats = save.stats || {};
    state.stats = defaultStats;
    for (const key of Object.keys(defaultStats) as (keyof GameStats)[]) {
      state.stats[key] = numeric(savedStats[key], defaultStats[key], 0);
    }
  } catch (err) {
    console.warn('Could not load saved Stalinload progress:', err);
  }
}

export function save(state: GameState): void {
  const p = state.player;
  const progress = {
    version: SAVE_VERSION,
    cash: Math.floor(state.cash),
    x: p.x,
    y: p.y,
    fuelMax: p.fuelMax,
    hullMax: p.hullMax,
    cargoMax: p.cargoMax,
    drill: p.drill,
    dynamite: p.dynamite,
    teleporters: p.teleporters,
    gunOwned: p.gunOwned,
    bullets: p.bullets,
    visibility: p.visibility,
    scanners: countItem(p.inventory, SCANNER_ITEM.kind),
    scannerDevices: state.scannerDevices.slice(0, SCANNER_DEVICE.maxPlaced).map(({x, y, timer}) => ({x, y, timer})),
    explored: encodeExploration(state.exploredTiles),
    tiles: capTileEntries(tileDiffEntries(state.soloTileDiff)),
    stats: state.stats,
    savedAt: Date.now()
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch (err) {
    // The mine is the one part of the save that can grow without bound, and the
    // only part the world can regenerate. Losing a player's cash and upgrades to
    // a full quota would be far worse, so drop the terrain and keep the rest.
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({...progress, tiles: []}));
      console.warn('Saved Stalinload progress without the dug terrain:', err);
    } catch (fallbackErr) {
      console.warn('Could not save Stalinload progress:', fallbackErr);
    }
  }
}
