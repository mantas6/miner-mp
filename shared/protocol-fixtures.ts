// Protocol conformance table, shared by the client's vitest suite and the
// relay's `node --test` suite. Both runners assert the same verdicts, which is
// what keeps a message from being accepted by one side and dropped by the other.
//
// Test-only: nothing in `src/` or `server/` imports this at runtime.

import { MAX_WORLD_ROW, WORLD_W } from './constants.ts';

export interface ProtocolCase {
  label: string;
  message: unknown;
  valid: boolean;
}

const ORE = { name: 'Gold', color: '#ffd65c', value: 70, min: 152, max: 602, chance: 0.04 };

export const PROTOCOL_CASES: ProtocolCase[] = [
  { label: 'a dug tile', message: { type: 'tile', revision: 1, x: 3, y: 7, tile: { type: 'air' } }, valid: true },
  { label: 'an ore tile', message: { type: 'tile', revision: 1, x: 3, y: 7, tile: { type: 'ore', ore: ORE, hp: 4, maxHp: 4 } }, valid: true },
  // The bug this table exists for: the client used to accept negative hp that
  // the relay silently dropped, leaving the two worlds permanently different.
  { label: 'a tile with negative hp', message: { type: 'tile', revision: 1, x: 3, y: 7, tile: { type: 'dirt', hp: -5, maxHp: 4 } }, valid: false },
  { label: 'a tile with zero maxHp', message: { type: 'tile', revision: 1, x: 3, y: 7, tile: { type: 'dirt', hp: 0, maxHp: 0 } }, valid: false },
  { label: 'a tile with negative rock hp', message: { type: 'tile', revision: 1, x: 3, y: 7, tile: { type: 'rock', hp: -1 } }, valid: false },
  { label: 'a tile outside the world width', message: { type: 'tile', revision: 1, x: WORLD_W, y: 7, tile: { type: 'air' } }, valid: false },
  { label: 'a tile below the deepest row', message: { type: 'tile', revision: 1, x: 3, y: MAX_WORLD_ROW + 1, tile: { type: 'air' } }, valid: false },
  { label: 'a tile at revision 0', message: { type: 'tile', revision: 0, x: 3, y: 7, tile: { type: 'air' } }, valid: false },
  { label: 'an ore tile with a blank ore name', message: { type: 'tile', revision: 1, x: 3, y: 7, tile: { type: 'ore', ore: { ...ORE, name: '' }, hp: 4, maxHp: 4 } }, valid: false },
  { label: 'an ore tile with an overlong colour', message: { type: 'tile', revision: 1, x: 3, y: 7, tile: { type: 'ore', ore: { ...ORE, color: '#'.repeat(40) }, hp: 4, maxHp: 4 } }, valid: false },
  { label: 'an ore tile with a negative value', message: { type: 'tile', revision: 1, x: 3, y: 7, tile: { type: 'ore', ore: { ...ORE, value: -1 }, hp: 4, maxHp: 4 } }, valid: false },
  { label: 'a dormant enemy tile', message: { type: 'tile', revision: 1, x: 3, y: 7, tile: { type: 'enemy', kind: 'ironback', hp: 8, maxHp: 8 } }, valid: true },
  { label: 'a dormant enemy tile of an unknown kind', message: { type: 'tile', revision: 1, x: 3, y: 7, tile: { type: 'enemy', kind: 'wyrm', hp: 8, maxHp: 8 } }, valid: false },
  { label: 'an unknown tile type', message: { type: 'tile', revision: 1, x: 3, y: 7, tile: { type: 'lava', hp: 1, maxHp: 1 } }, valid: false },

  { label: 'an enemy snapshot', message: { type: 'enemySnapshot', revision: 1, enemies: [{ id: 2, kind: 'abyssStalker', x: 1, y: 1002, drawX: 1, drawY: 1002, hp: 8, maxHp: 8, alive: true }] }, valid: true },
  { label: 'an enemy snapshot with a legacy kindless enemy', message: { type: 'enemySnapshot', revision: 1, enemies: [{ id: 2, x: 1, y: 1002, drawX: 1, drawY: 1002, hp: 8, maxHp: 8, alive: true }] }, valid: true },
  { label: 'an enemy with id 0', message: { type: 'enemySnapshot', revision: 1, enemies: [{ id: 0, kind: 'ironback', x: 1, y: 8, drawX: 1, drawY: 8, hp: 8, maxHp: 8, alive: true }] }, valid: false },
  { label: 'an enemy with a fractional id', message: { type: 'enemySnapshot', revision: 1, enemies: [{ id: 1.5, kind: 'ironback', x: 1, y: 8, drawX: 1, drawY: 8, hp: 8, maxHp: 8, alive: true }] }, valid: false },
  { label: 'an enemy outside the world width', message: { type: 'enemySnapshot', revision: 1, enemies: [{ id: 2, kind: 'ironback', x: WORLD_W, y: 8, drawX: 1, drawY: 8, hp: 8, maxHp: 8, alive: true }] }, valid: false },
  { label: 'an enemy with negative hp', message: { type: 'enemySnapshot', revision: 1, enemies: [{ id: 2, kind: 'ironback', x: 1, y: 8, drawX: 1, drawY: 8, hp: -1, maxHp: 8, alive: true }] }, valid: false },
  { label: 'an enemy with a non-finite coordinate', message: { type: 'enemySnapshot', revision: 1, enemies: [{ id: 2, kind: 'ironback', x: Infinity, y: 8, drawX: 1, drawY: 8, hp: 1, maxHp: 8, alive: true }] }, valid: false },

  { label: 'explored ranges', message: { type: 'explore', revision: 1, ranges: '270-278,360' }, valid: true },
  { label: 'empty explored ranges', message: { type: 'explore', revision: 1, ranges: '' }, valid: true },
  { label: 'explored ranges above the surface', message: { type: 'explore', revision: 1, ranges: '5' }, valid: false },
  { label: 'a backwards explored range', message: { type: 'explore', revision: 1, ranges: '400-270' }, valid: false },
  { label: 'malformed explored ranges', message: { type: 'explore', revision: 1, ranges: '270..278' }, valid: false },

  { label: 'a world init', message: { type: 'worldInit', revision: 1, tiles: [{ x: 3, y: 7, tile: { type: 'dirt', hp: 2, maxHp: 2 } }] }, valid: true },
  { label: 'a world init containing air', message: { type: 'worldInit', revision: 1, tiles: [{ x: 3, y: 7, tile: { type: 'air' } }] }, valid: false },
  { label: 'a world reset', message: { type: 'worldReset', revision: 2 }, valid: true },

  { label: 'a player transform', message: { type: 'playerState', x: 5, y: 12, drawX: 5.2, drawY: 11.9, facing: -1, drillAnim: 0.5, drillDx: 0, drillDy: 1, bob: 0.33 }, valid: true },
  { label: 'a player transform missing bob', message: { type: 'playerState', x: 5, y: 12, drawX: 5.2, drawY: 11.9, facing: -1, drillAnim: 0.5, drillDx: 0, drillDy: 1 }, valid: false },
  { label: 'a player transform with a NaN coordinate', message: { type: 'playerState', x: NaN, y: 12, drawX: 5.2, drawY: 11.9, facing: -1, drillAnim: 0.5, drillDx: 0, drillDy: 1, bob: 0 }, valid: false },

  { label: 'a guest damage report', message: { type: 'enemyDamage', id: 7, amount: 3, by: 'guest' }, valid: true },
  { label: 'a damage report attributed to the server', message: { type: 'enemyDamage', id: 7, amount: 3, by: 'server' }, valid: false },
  { label: 'a host-attributed dormant enemy shot', message: { type: 'enemyTileShot', x: 12, y: 30, by: 'host' }, valid: false },
  { label: 'a death notice', message: { type: 'died' }, valid: true },
  { label: 'an unknown message type', message: { type: 'nope' }, valid: false },
  { label: 'a message without a type', message: { x: 1 }, valid: false },
  { label: 'a non-object message', message: 42, valid: false }
];
