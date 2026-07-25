import { ECONOMY, LIMITS, STARTING } from './balance';

export const SAVE_KEY = 'moleload-progress-v1';
export const SAVE_VERSION = 2;
const LEGACY_CARGO_STEP = 10;
export const DEFAULT_STATS = {
  maxDepth: 0,
  totalCashEarned: 0,
  oreMined: 0,
  enemiesDestroyed: 0,
  deaths: 0,
  motherlodeClaims: 0,
  motherlodeExtractions: 0
};

export function numeric(value, fallback, min=0, max=Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** @param {import('./state').GameState} state */
export function load(state) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const save = JSON.parse(raw);
    const p = state.player;
    state.cash = numeric(save.cash, state.cash, 0);
    p.fuelMax = numeric(save.fuelMax, p.fuelMax, LIMITS.fuelMax.min, LIMITS.fuelMax.max);
    p.hullMax = numeric(save.hullMax, p.hullMax, LIMITS.hullMax.min, LIMITS.hullMax.max);
    const savedCargoMax = numeric(save.cargoMax, p.cargoMax, LIMITS.cargoMax.min, LIMITS.cargoMax.max);
    const cargoUpgradeLevel = Math.max(0, Math.round((savedCargoMax - STARTING.cargoMax) / LEGACY_CARGO_STEP));
    p.cargoMax = numeric(save.version, 1, 1) < SAVE_VERSION
      ? STARTING.cargoMax + cargoUpgradeLevel * ECONOMY.cargo.step
      : savedCargoMax;
    p.drill = numeric(save.drill, p.drill, LIMITS.drill.min, LIMITS.drill.max);
    p.dynamite = Math.floor(numeric(save.dynamite, p.dynamite, LIMITS.dynamite.min, LIMITS.dynamite.max));
    p.teleporters = Math.floor(numeric(save.teleporters, p.teleporters, LIMITS.teleporters.min, LIMITS.teleporters.max));
    state.stats = {...DEFAULT_STATS, ...(save.stats || {})};
    for (const key of Object.keys(DEFAULT_STATS)) state.stats[key] = numeric(state.stats[key], DEFAULT_STATS[key], 0);
  } catch (err) {
    console.warn('Could not load saved Moleload progress:', err);
  }
}

/** @param {import('./state').GameState} state */
export function save(state) {
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
      stats: state.stats,
      savedAt: Date.now()
    }));
  } catch (err) {
    console.warn('Could not save Moleload progress:', err);
  }
}
