import { ECONOMY, LIMITS, STARTING } from './core/balance';
import { createDefaultStats } from './core/state';
import { encodeExploration, mergeExploration } from '../shared/exploration-codec';
import type { GameState, GameStats } from './core/types';

/** The persisted save file. Every field is re-validated on load. */
interface SavedProgress {
  version?: unknown;
  cash?: unknown;
  fuelMax?: unknown;
  hullMax?: unknown;
  cargoMax?: unknown;
  drill?: unknown;
  dynamite?: unknown;
  teleporters?: unknown;
  gunOwned?: unknown;
  bullets?: unknown;
  visibility?: unknown;
  explored?: unknown;
  stats?: Partial<Record<keyof GameStats, unknown>>;
}

export const SAVE_KEY = 'moleload-progress-v1';
export const SAVE_VERSION = 3;
const LEGACY_CARGO_STEP = 10;
const CARGO_BALANCE_SAVE_VERSION = 2;

export function numeric(value: unknown, fallback: number, min=0, max=Number.MAX_SAFE_INTEGER): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
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
    mergeExploration(state.exploredTiles, typeof save.explored === 'string' ? save.explored : '');
    const defaultStats = createDefaultStats();
    const savedStats = save.stats || {};
    state.stats = defaultStats;
    for (const key of Object.keys(defaultStats) as (keyof GameStats)[]) {
      state.stats[key] = numeric(savedStats[key], defaultStats[key], 0);
    }
  } catch (err) {
    console.warn('Could not load saved Moleload progress:', err);
  }
}

export function save(state: GameState): void {
  try {
    const p = state.player;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: SAVE_VERSION,
      cash: Math.floor(state.cash),
      fuelMax: p.fuelMax,
      hullMax: p.hullMax,
      cargoMax: p.cargoMax,
      drill: p.drill,
      dynamite: p.dynamite,
      teleporters: p.teleporters,
      gunOwned: p.gunOwned,
      bullets: p.bullets,
      visibility: p.visibility,
      explored: encodeExploration(state.exploredTiles),
      stats: state.stats,
      savedAt: Date.now()
    }));
  } catch (err) {
    console.warn('Could not save Moleload progress:', err);
  }
}
