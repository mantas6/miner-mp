import type { Ore } from './types';

export const TILE = 64; // Show 50% more world in each viewport dimension.
export const WORLD_W = 90;
export const WORLD_H = 320;
export const SURFACE_HEIGHT = 3;
export const START_Y = SURFACE_HEIGHT - 1;

// World-generation thresholds shared with player-facing danger guidance.
// Row values are world coordinates; distance below the depot is derived from START_Y.
export const DANGER = Object.freeze({
  rockMinRow: 13,
  enemyMinRow: 15,
  hazardMinRow: 151
});

export const ORES: Ore[] = [
  {name:'Coal', color:'#343434', value:8, min:2, chance:.10},
  {name:'Copper', color:'#c47b45', value:16, min:7, chance:.08},
  {name:'Silver', color:'#c8d3e0', value:36, min:18, chance:.055},
  {name:'Gold', color:'#ffd65c', value:70, min:34, chance:.04},
  {name:'Ruby', color:'#f04b73', value:135, min:55, chance:.026},
  {name:'Emerald', color:'#46df8b', value:220, min:82, chance:.018},
  {name:'Alienite', color:'#8d7cff', value:360, min:118, chance:.012},
  {name:'Uranium', color:'#b7ff45', value:620, min:175, chance:.008},
  {name:'Core Shard', color:'#ff7a1f', value:980, min:240, chance:.005}
];
