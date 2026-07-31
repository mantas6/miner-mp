import { HULL } from './balance';
import { DANGER } from '../../shared/constants';
import type { EnemyKind } from './types';

export interface EnemyTypeDefinition {
  kind: EnemyKind;
  name: string;
  minRow: number;
  healthMultiplier: number;
  moveDelayAdjustment: number;
  biteMultiplier: number;
  biteCooldown: number;
  colors: readonly [string, string, string];
  glow: string;
}

export const ENEMY_TYPES: Record<EnemyKind, EnemyTypeDefinition> = {
  tunnelFiend: {
    kind: 'tunnelFiend', name: 'Tunnel Fiend', minRow: DANGER.enemyMinRow,
    healthMultiplier: 1, moveDelayAdjustment: 0, biteMultiplier: 1, biteCooldown: 22,
    colors: ['#c5ff62', '#4fa23d', '#17391e'], glow: '#72ff4a'
  },
  skitterling: {
    kind: 'skitterling', name: 'Skitterling', minRow: 152,
    healthMultiplier: .72, moveDelayAdjustment: -3, biteMultiplier: .7, biteCooldown: 15,
    colors: ['#fff38a', '#d16a31', '#54201d'], glow: '#ffb34f'
  },
  ironback: {
    kind: 'ironback', name: 'Ironback', minRow: 402,
    healthMultiplier: 1.65, moveDelayAdjustment: 4, biteMultiplier: 1.55, biteCooldown: 30,
    colors: ['#d9ecff', '#657b91', '#202b3a'], glow: '#8ec9ff'
  },
  abyssStalker: {
    kind: 'abyssStalker', name: 'Abyss Stalker', minRow: 1002,
    healthMultiplier: 1.25, moveDelayAdjustment: -2, biteMultiplier: 1.25, biteCooldown: 18,
    colors: ['#f6b8ff', '#8749ba', '#27123e'], glow: '#df76ff'
  }
};

const DEPTH_BANDS: ReadonlyArray<{minRow: number; weights: ReadonlyArray<readonly [EnemyKind, number]>}> = [
  {minRow: DANGER.enemyMinRow, weights: [['tunnelFiend', 1]]},
  {minRow: 152, weights: [['tunnelFiend', .7], ['skitterling', .3]]},
  {minRow: 402, weights: [['tunnelFiend', .45], ['skitterling', .3], ['ironback', .25]]},
  {minRow: 1002, weights: [['tunnelFiend', .25], ['skitterling', .28], ['ironback', .27], ['abyssStalker', .2]]},
  {minRow: 2002, weights: [['tunnelFiend', .12], ['skitterling', .28], ['ironback', .3], ['abyssStalker', .3]]}
];

export function enemyKindForDepthRoll(depth: number, roll: number): EnemyKind {
  // Not a `find`: the deepest matching band wins, not the first one.
  // oxlint-disable-next-line unicorn/prefer-array-find
  const band = DEPTH_BANDS.filter(candidate => depth >= candidate.minRow).at(-1) || DEPTH_BANDS[0];
  let target = Math.max(0, Math.min(.999999999, roll));
  for (const [kind, weight] of band.weights) {
    target -= weight;
    if (target < 0) return kind;
  }
  return band.weights.at(-1)![0];
}

export function getEnemyType(kind?: EnemyKind): EnemyTypeDefinition {
  return kind ? ENEMY_TYPES[kind] : ENEMY_TYPES.tunnelFiend;
}

export function enemyHealth(kind: EnemyKind, baseHealth: number): number {
  return Math.max(1, Math.ceil(baseHealth * getEnemyType(kind).healthMultiplier));
}

export function enemyMoveDelay(kind: EnemyKind, depth: number): number {
  const fiendDelay = Math.max(7, 14 - Math.floor(depth / 70));
  return Math.max(4, fiendDelay + getEnemyType(kind).moveDelayAdjustment);
}

export function enemyBiteCooldown(kind: EnemyKind): number {
  return getEnemyType(kind).biteCooldown;
}

export function enemyBiteDamage(kind: EnemyKind, depth: number): number {
  const base = HULL.enemyBite.base + Math.floor(depth / HULL.enemyBite.perDepth) * HULL.enemyBite.step;
  return Math.max(1, Math.round(base * getEnemyType(kind).biteMultiplier));
}
