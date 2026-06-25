import { LIMITS } from './balance.js';

export const SAVE_KEY = 'moleload-progress-v1';
export const DEFAULT_STATS = {
  maxDepth: 0,
  totalCashEarned: 0,
  oreMined: 0,
  enemiesDestroyed: 0,
  deaths: 0,
  motherlodeClaims: 0
};

export function numeric(value, fallback, min=0, max=Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function load(state) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const save = JSON.parse(raw);
    const p = state.player;
    state.cash = numeric(save.cash, state.cash, 0);
    p.fuelMax = numeric(save.fuelMax, p.fuelMax, LIMITS.fuelMax.min, LIMITS.fuelMax.max);
    p.hullMax = numeric(save.hullMax, p.hullMax, LIMITS.hullMax.min, LIMITS.hullMax.max);
    p.cargoMax = numeric(save.cargoMax, p.cargoMax, LIMITS.cargoMax.min, LIMITS.cargoMax.max);
    p.drill = numeric(save.drill, p.drill, LIMITS.drill.min, LIMITS.drill.max);
    state.stats = {...DEFAULT_STATS, ...(save.stats || {})};
    for (const key of Object.keys(DEFAULT_STATS)) state.stats[key] = numeric(state.stats[key], DEFAULT_STATS[key], 0);
  } catch (err) {
    console.warn('Could not load saved Moleload progress:', err);
  }
}

export function save(state) {
  try {
    const p = state.player;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: 1,
      cash: Math.floor(state.cash),
      fuelMax: p.fuelMax,
      hullMax: p.hullMax,
      cargoMax: p.cargoMax,
      drill: p.drill,
      stats: state.stats,
      savedAt: Date.now()
    }));
  } catch (err) {
    console.warn('Could not save Moleload progress:', err);
  }
}
