// Pure deterministic world generation. DOM-free / testable.
// No imports from dom.js, game.js, or balance.js.
import { DANGER, ORES, SURFACE_HEIGHT, WORLD_W, WORLD_H } from './constants';
import type { Tile } from './types';

/**
 * Deterministic pseudo-random value in [0,1) for a tile coordinate.
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function rand(x,y){ let n = Math.sin(x*127.1 + y*311.7) * 43758.5453; return n - Math.floor(n); }

/**
 * Whether a natural air pocket / cave seam exists at this coordinate.
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function naturalAirPocket(x,y){
  if (y < 5 || x < 2 || x > WORLD_W - 3) return false;
  const depth = Math.min(1, y / 85);
  const cellular = (rand(Math.floor(x/2), Math.floor(y/2)) + rand(Math.floor((x+1)/3)+41, Math.floor((y-1)/3)-17)) / 2;
  const pocketChance = 0.018 + depth * 0.035;
  if (cellular < pocketChance) return true;
  const seam = Math.abs(Math.sin(x * 0.31 + y * 0.145 + Math.sin(y * 0.071) * 2.3));
  const seamGate = rand(Math.floor(x/5) + 91, Math.floor(y/4) - 53);
  return y > 10 && seam < 0.045 + depth * 0.035 && seamGate < 0.42;
}

const STARTER_ORE_PATCHES = [
  {xOffset: 0, y: SURFACE_HEIGHT + 3, oreName: 'Coal'},
  {xOffset: -2, y: SURFACE_HEIGHT + 4, oreName: 'Coal'},
  {xOffset: 2, y: SURFACE_HEIGHT + 5, oreName: 'Copper'},
  {xOffset: -1, y: SURFACE_HEIGHT + 7, oreName: 'Copper'}
];

/**
 * A small deterministic starter seam near the shaft gives new players visible
 * low-tier goals in the first 40-80 m without flattening the whole opening.
 */
export function starterOreForCoordinate(x: number, y: number) {
  const shaftX = Math.floor(WORLD_W / 2);
  const patch = STARTER_ORE_PATCHES.find(tile => x === shaftX + tile.xOffset && y === tile.y);
  if (!patch) return null;
  return ORES.find(ore => ore.name === patch.oreName && y >= ore.min) || null;
}

/**
 * Generate the tile at a world coordinate. Deterministic for a given (x,y).
 * @param {number} x
 * @param {number} y
 * @returns {{type:string, [key:string]:any}}
 */
export function makeTile(x: number, y: number): Tile {
  if (y < SURFACE_HEIGHT) return {type:'air'};
  if (y === SURFACE_HEIGHT && Math.abs(x - WORLD_W/2) < 7) return {type:'dirt', hp:2, maxHp:2};
  if (naturalAirPocket(x,y)) return {type:'air'};
  const r = rand(x,y), depth = y;
  let ore = starterOreForCoordinate(x, y);
  if (!ore) {
    for (let i = ORES.length - 1; i >= 0; i--) {
      const o = ORES[i];
      if (depth >= o.min && r < o.chance * Math.min(2.2, 1 + depth / 90)) { ore = o; break; }
    }
  }
  if (y === WORLD_H - 2 && Math.abs(x - Math.floor(WORLD_W/2)) <= 1) return {type:'artifact', hp:24, maxHp:24};
  if (ore) { const hp = Math.max(3, Math.ceil((depth/28)+4)); return {type:'ore', ore, hp, maxHp: hp}; }
  const rockChance = y > 190 ? .036 : .018;
  if (rand(x+9,y-3) < rockChance && y >= DANGER.rockMinRow) return {type:'rock', hp: 999};
  if (y >= DANGER.hazardMinRow && rand(x+51,y-91) < Math.min(.026, .007 + y / 13000)) {
    const hp = Math.max(4, Math.ceil(3 + y / 55));
    return {type:'hazard', hp, maxHp: hp};
  }
  if (y >= DANGER.enemyMinRow && rand(x-37,y+83) < Math.min(.046, .008 + y / 6500)) {
    const hp = Math.max(4, Math.ceil(3 + y / 35));
    return {type:'enemy', hp, maxHp: hp};
  }
  { const hp = Math.max(2, Math.ceil(depth/42)+1 + (depth > 210 ? 2 : 0)); return {type:'dirt', hp, maxHp: hp}; }
}
