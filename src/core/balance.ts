// Central balance/config module. DOM-free. Pure data, no behavior.
// All values ported verbatim from the previous inline literals.

export const STARTING = Object.freeze({
  cash: 60,
  fuel: 100,
  fuelMax: 100,
  hull: 100,
  hullMax: 100,
  cargoMax: 10,
  drill: 1,
  dynamite: 0,
  teleporters: 0,
  gunOwned: false,
  bullets: 0,
  visibility: 3
});

export const LIMITS = Object.freeze({
  fuelMax: Object.freeze({ min: 100, max: 2000 }),
  hullMax: Object.freeze({ min: 100, max: 2000 }),
  cargoMax: Object.freeze({ min: STARTING.cargoMax, max: 1000 }),
  drill: Object.freeze({ min: 1, max: 100 }),
  dynamite: Object.freeze({ min: 0, max: 999 }),
  teleporters: Object.freeze({ min: 0, max: 999 }),
  /** Carried (not yet deployed) scanner devices; they live in the cargo bay. */
  scanners: Object.freeze({ min: 0, max: 999 }),
  bullets: Object.freeze({ min: 0, max: 999 }),
  visibility: Object.freeze({ min: 3, max: 8 })
});

export const FUEL = Object.freeze({
  baseMove: 0.25,
  vertical: 0.08,
  flyMult: 0.5,
  digMult: 1.5,
  dig: Object.freeze({
    enemy: 0.65,
    hazard: 1.15,
    artifact: 1.4,
    dig: 0.9
  }),
  // Return forecast: a clear-shaft ascent with a deliberately generous detour allowance.
  returnReserveMultiplier: 2,
  returnReserveCautionMultiplier: 1.5,
  lowFuelFraction: 0.25,
  lowFuelWarnMs: 1400
});

export const SPRINT = Object.freeze({
  repeatMultiplier: 0.55,
  fuelMultiplier: 1.75
});

export const HULL = Object.freeze({
  lowHullFraction: 0.30,
  rockBump: 4,
  /**
   * Slamming a boosted ship into terrain. Charged on top of any tile damage, and
   * only once per run-up: the crash spends the sprint momentum that earned it.
   */
  sprintCrash: 6,
  hazardBase: 3.5,
  hazardDepthDivisor: 90,
  enemyBite: Object.freeze({
    base: 6,
    perDepth: 70,
    step: 2
  })
});

export const ENEMY = Object.freeze({
  bounty: Object.freeze({ base: 12, depthDivisor: 35, step: 4 })
});

export const ECONOMY = Object.freeze({
  refuel: Object.freeze({ base: 20, perTank: 0.35 }),
  repair: Object.freeze({ base: 30, perHull: 0.45 }),
  cargo: Object.freeze({ base: 120, growth: 1.32, step: 5 }),
  tank: Object.freeze({ base: 150, growth: 1.34, step: 20 }),
  hull: Object.freeze({ base: 180, growth: 1.38, step: 20 }),
  drill: Object.freeze({ base: 200, growth: 1.55, step: 1 }),
  visibility: Object.freeze({ base: 175, growth: 1.45, step: 1 }),
  dynamite: Object.freeze({ price: 50, radius: 2 }),
  teleporter: Object.freeze({ price: 250 }),
  scanner: Object.freeze({ price: 200 }),
  gun: Object.freeze({ price: 1500, ammoPrice: 120, ammoBundle: 6, range: 8, damage: 100 }),
  artifactReward: 5000
});
