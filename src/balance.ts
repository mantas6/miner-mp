// Central balance/config module. DOM-free. Pure data, no behavior.
// All values ported verbatim from the previous inline literals.

export const STARTING = Object.freeze({
  cash: 60,
  fuel: 100,
  fuelMax: 100,
  hull: 100,
  hullMax: 100,
  cargoMax: 10,
  drill: 1
});

export const LIMITS = Object.freeze({
  fuelMax: Object.freeze({ min: 100, max: 1000 }),
  hullMax: Object.freeze({ min: 100, max: 1000 }),
  cargoMax: Object.freeze({ min: STARTING.cargoMax, max: 1000 }),
  drill: Object.freeze({ min: 1, max: 100 })
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
  surfaceRefuel: 0.8,
  // Return forecast: a clear-shaft ascent with a deliberately generous detour allowance.
  returnReserveMultiplier: 2,
  returnReserveCautionMultiplier: 1.5,
  lowFuelFraction: 0.25,
  lowFuelWarnMs: 1400
});

export const HULL = Object.freeze({
  lowHullFraction: 0.30,
  rockBump: 4,
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
  cargo: Object.freeze({ base: 120, growth: 1.32, step: 10 }),
  tank: Object.freeze({ base: 150, growth: 1.34, step: 20 }),
  hull: Object.freeze({ base: 180, growth: 1.38, step: 20 }),
  drill: Object.freeze({ base: 200, growth: 1.55, step: 1 }),
  artifactReward: 5000
});
