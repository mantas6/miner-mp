// Keep the mine's zoom in one shared world-to-screen scale.  The previous
// 64px tile baseline is reduced by 25%, so rendering, camera coverage, and
// pointer-to-ship geometry all use the same 48px tile size.
export const BASE_CAMERA_TILE = 64;
export const CAMERA_ZOOM_OUT = 0.25;
export const TILE = BASE_CAMERA_TILE * (1 - CAMERA_ZOOM_OUT);
export const WORLD_W = 90;
export const SURFACE_HEIGHT = 3;
export const START_Y = SURFACE_HEIGHT - 1;
export const WORLD_CHUNK_ROWS = 32;
export const MOTHERLODE_ROW = 1002;
// Keep row-major exploration indexes exact within JavaScript's safe integers.
export const MAX_WORLD_ROW = Math.floor(Number.MAX_SAFE_INTEGER / WORLD_W) - 1;

// --- Protocol / persistence limits (shared by the client and the relay) -----

/** Schema version of the relay's persisted world-state file. */
export const WORLD_STATE_VERSION = 1;
/** Upper bound on persisted/transmitted tile mutations. */
export const MAX_STATE_TILE_ENTRIES = 100_000;
/** Upper bound on exploration indexes carried by one message. */
export const MAX_EXPLORED_TILES = WORLD_W * 1004;
/** Upper bound on encoded exploration payload length. */
export const MAX_EXPLORED_CHARS = MAX_STATE_TILE_ENTRIES * 8;
/** Upper bound on replicated live enemies. */
export const MAX_ENEMIES = 2048;
/** Upper bound on the persisted world-state file and on a relay frame. */
export const MAX_STATE_BYTES = 16 * 1024 * 1024;
/** Highest value a valuable (ore/artifact) may declare. */
export const MAX_VALUABLE_VALUE = 1_000_000;

export const ENEMY_KINDS = ['tunnelFiend', 'skitterling', 'ironback', 'abyssStalker'] as const;

// World-generation thresholds shared with player-facing danger guidance.
// Row values are world coordinates; distance below the depot is derived from START_Y.
export const DANGER = Object.freeze({
  rockMinRow: 13,
  enemyMinRow: 15,
  hazardMinRow: 151
});

// Chance is the relative tier weight once the independent ore-spawn roll succeeds.
// These entries are validated as `Ore` values by shared/world-schema.ts.
export const ORES = [
  {name:'Coal', color:'#343434', value:8, min:2, max:182, chance:.10},
  {name:'Copper', color:'#c47b45', value:16, min:7, max:322, chance:.08},
  {name:'Silver', color:'#c8d3e0', value:36, min:62, max:462, chance:.055},
  {name:'Gold', color:'#ffd65c', value:70, min:152, max:602, chance:.04},
  {name:'Ruby', color:'#f04b73', value:135, min:262, max:742, chance:.026},
  {name:'Emerald', color:'#46df8b', value:220, min:392, max:852, chance:.018},
  {name:'Alienite', color:'#8d7cff', value:360, min:542, max:942, chance:.012},
  {name:'Uranium', color:'#b7ff45', value:620, min:702, max:MAX_WORLD_ROW, chance:.008},
  {name:'Core Shard', color:'#ff7a1f', value:980, min:852, max:MAX_WORLD_ROW, chance:.005}
];

// Absolute per-tile chances, checked only after ordinary ore generation.
export const ARTIFACTS = [
  {name:'Ancient Coin Cache', color:'#ffd166', value:180, min:202, max:502, chance:.00045},
  {name:'Lost Cosmonaut Medal', color:'#71e5ff', value:450, min:452, max:802, chance:.00035},
  {name:'Alien Reliquary', color:'#ff78e1', value:900, min:702, max:MAX_WORLD_ROW, chance:.00025}
];
