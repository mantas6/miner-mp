import { describe, it, expect } from 'vitest';
import {
  validateMessage,
  isTile,
  playerStateFrom,
  remotePlayerFrom,
  applyRemotePlayerState,
  interpolateRemotePlayers,
  enemySnapshotFrom,
  enemyEntryFrom,
  nextEnemyId,
  mergeEnemySnapshot,
  applyEnemySpawn,
  applyEnemyDead,
  applyEnemyDamage,
  createRateLimiter,
  type NetMessage,
  type EnemySnapshotEntry
} from './net-protocol';
import { PROTOCOL_CASES } from '../../shared/protocol-fixtures';
import type { Enemy, Tile } from '../core/types';

/** Mimic the relay hop: serialize, parse, then validate the decoded payload. */
function roundTrip(msg: NetMessage): NetMessage | null {
  return validateMessage(JSON.parse(JSON.stringify(msg)));
}

const ORE = { name: 'Gold', color: '#ffd65c', value: 70, min: 152, max: 602, chance: 0.04 };

const messages: NetMessage[] = [
  {
    type: 'playerState',
    x: 5,
    y: 12,
    drawX: 5.2,
    drawY: 11.9,
    facing: -1,
    drillAnim: 0.5,
    drillDx: 0,
    drillDy: 1,
    bob: 0.33
  },
  { type: 'tile', revision: 1, x: 3, y: 7, tile: { type: 'air' } },
  { type: 'tile', revision: 1, x: 3, y: 8, tile: { type: 'dirt', hp: 2, maxHp: 3 } },
  { type: 'tile', revision: 1, x: 4, y: 9, tile: { type: 'rock', hp: 999 } },
  { type: 'tile', revision: 1, x: 4, y: 10, tile: { type: 'ore', ore: ORE, hp: 4, maxHp: 4 } },
  { type: 'wakeNear', x: 10, y: 40 },
  {
    type: 'enemySnapshot',
    revision: 1,
    enemies: [
      { id: 1, kind:'tunnelFiend', x: 3, y: 4, drawX: 3, drawY: 4, hp: 5, maxHp: 6, alive: true },
      { id: 2, kind:'skitterling', x: 9, y: 2, drawX: 8.5, drawY: 2.1, hp: 1, maxHp: 6, alive: true }
    ]
  },
  { type: 'enemySpawn', id: 7, kind:'ironback', x: 12, y: 30, hp: 6, maxHp: 6 },
  { type: 'enemyDead', id: 7, bounty: 42, killerIsGuest: true },
  { type: 'enemyDamage', id: 7, amount: 3, by: 'guest' },
  { type: 'enemyTileShot', x: 12, y: 30, by: 'guest' },
  { type: 'bounty', amount: 42 },
  { type: 'died' },
  { type: 'respawned', x: 45, y: 2 },
  { type: 'teleported', x: 45, y: 2 },
  { type: 'explore', revision: 1, ranges: '270-278,360' },
  { type: 'worldState', version: 1, revision: 4, initialized: true, tiles: [{x:3,y:7,tile:{type:'air'}}], enemies: [], explored: '270-278' },
  { type: 'worldInit', revision: 4, tiles: [{x:3,y:7,tile:{type:'dirt',hp:2,maxHp:2}}] },
  { type: 'worldReset', revision: 4 }
];

describe('wire round-trips', () => {
  for (const msg of messages) {
    it(`round-trips a ${msg.type} message`, () => {
      expect(roundTrip(msg)).toEqual(msg);
    });
  }
});

describe('validateMessage rejection', () => {
  it('returns null for non-object / missing type', () => {
    expect(validateMessage(null)).toBeNull();
    expect(validateMessage(42)).toBeNull();
    expect(validateMessage([])).toBeNull();
    expect(validateMessage({})).toBeNull();
    expect(validateMessage({ foo: 'bar' })).toBeNull();
  });

  it('returns null for an unknown message type', () => {
    expect(validateMessage({ type: 'nope' })).toBeNull();
  });

  it('rejects playerState with a missing / non-numeric field', () => {
    expect(
      validateMessage({ type: 'playerState', x: 1, y: 2, drawX: 1, drawY: 2, facing: 1, drillAnim: 0, drillDx: 0, drillDy: 1 })
    ).toBeNull();
    expect(
      validateMessage({ type: 'playerState', x: 'a', y: 2, drawX: 1, drawY: 2, facing: 1, drillAnim: 0, drillDx: 0, drillDy: 1, bob: 0 })
    ).toBeNull();
  });

  it('rejects NaN / Infinity numeric fields', () => {
    expect(validateMessage({ type: 'wakeNear', x: NaN, y: 1 })).toBeNull();
    expect(validateMessage({ type: 'bounty', amount: Infinity })).toBeNull();
  });

  it('rejects a tile message with a malformed tile', () => {
    expect(validateMessage({ type: 'tile', x: 1, y: 1, tile: { type: 'lava' } })).toBeNull();
    expect(validateMessage({ type: 'tile', x: 1, y: 1, tile: { type: 'ore', hp: 1, maxHp: 1 } })).toBeNull();
    expect(validateMessage({ type: 'tile', x: 1, y: 1, tile: { type: 'dirt', hp: 1 } })).toBeNull();
  });

  it('rejects enemySnapshot with a malformed entry', () => {
    expect(
      validateMessage({ type: 'enemySnapshot', enemies: [{ id: 1, x: 0, y: 0, drawX: 0, drawY: 0, hp: 1, maxHp: 1 }] })
    ).toBeNull();
    expect(validateMessage({ type: 'enemySnapshot', enemies: 'x' })).toBeNull();
  });

  it('rejects enemyDamage with an invalid "by"', () => {
    expect(validateMessage({ type: 'enemyDamage', id: 1, amount: 2, by: 'server' })).toBeNull();
  });

  it('validates only guest-attributed dormant enemy shots', () => {
    expect(validateMessage({type:'enemyTileShot', x:12, y:30, by:'guest'})).toEqual({type:'enemyTileShot', x:12, y:30, by:'guest'});
    expect(validateMessage({type:'enemyTileShot', x:12, y:30, by:'host'})).toBeNull();
  });

  it('rejects a non-integer enemy id', () => {
    expect(validateMessage({ type: 'enemySpawn', id: 1.5, x: 0, y: 0, hp: 1, maxHp: 1 })).toBeNull();
  });

  it('requires a recognized enemy kind on tiles, spawns, and snapshots', () => {
    expect(isTile({type:'enemy', kind:'ironback', hp:8, maxHp:8})).toBe(true);
    expect(isTile({type:'enemy', kind:'unknown', hp:8, maxHp:8})).toBe(false);
    expect(validateMessage({type:'enemySpawn', id:2, kind:'unknown', x:1, y:500, hp:8, maxHp:8})).toBeNull();
    expect(validateMessage({type:'enemySnapshot', revision:1, enemies:[{id:2,kind:'abyssStalker',x:1,y:1002,drawX:1,drawY:1002,hp:8,maxHp:8,alive:true}]}))
      .not.toBeNull();
  });
});

describe('client/relay validation parity', () => {
  // The relay asserts the same verdicts over the same table in
  // server/test/protocol-parity.test.js, so neither side can drift again.
  for (const { label, message, valid } of PROTOCOL_CASES) {
    it(`${valid ? 'accepts' : 'rejects'} ${label}`, () => {
      expect(validateMessage(message) !== null).toBe(valid);
    });
  }

  it('normalizes a legacy kindless enemy instead of dropping it', () => {
    const msg = validateMessage({
      type: 'enemySnapshot', revision: 1,
      enemies: [{ id: 2, x: 1, y: 8, drawX: 1, drawY: 8, hp: 8, maxHp: 8, alive: true }]
    });
    expect(msg).toMatchObject({ enemies: [{ id: 2, kind: 'tunnelFiend' }] });
  });
});

describe('isTile', () => {
  it('accepts each valid tile shape', () => {
    const tiles: Tile[] = [
      { type: 'air' },
      { type: 'dirt', hp: 1, maxHp: 2 },
      { type: 'rock', hp: 999 },
      { type: 'ore', ore: ORE, hp: 3, maxHp: 3 },
      { type: 'hazard', hp: 4, maxHp: 4 },
      { type: 'artifact', artifact: {name:'Ancient Coin Cache', color:'#ffd166', value:180, min:202, max:502, chance:.00045}, hp:5, maxHp:5 },
      { type: 'motherlode', hp: 24, maxHp: 24 },
      { type: 'enemy', kind:'tunnelFiend', hp: 4, maxHp: 4 }
    ];
    for (const t of tiles) expect(isTile(t)).toBe(true);
  });

  it('preserves artifact metadata on the wire', () => {
    const artifact: Tile = {type:'artifact', artifact:{name:'Alien Reliquary', color:'#ff78e1', value:900, min:702, max:992, chance:.00025}, hp:7, maxHp:7};
    expect(roundTrip({type:'tile', revision:1, x:8, y:740, tile:artifact})).toEqual({type:'tile', revision:1, x:8, y:740, tile:artifact});
  });

  it('round-trips tile mutations below 10,000 m', () => {
    const deep = {type:'tile', revision:1, x:8, y:1205, tile:{type:'air'}} as const;
    expect(roundTrip(deep)).toEqual(deep);
  });

  it('rejects malformed tiles', () => {
    expect(isTile({ type: 'ore', hp: 1, maxHp: 1 })).toBe(false);
    expect(isTile({ type: 'unknown' })).toBe(false);
    expect(isTile(null)).toBe(false);
  });
});

describe('builders', () => {
  it('projects transform-only fields from a player', () => {
    const player = {
      x: 1, y: 2, drawX: 1.1, drawY: 2.2, facing: -1, bob: 0.5,
      drillAnim: 0.2, drillDx: 1, drillDy: 0,
      // vitals that must NOT leak into the message:
      fuel: 100, fuelMax: 100, hull: 80, hullMax: 100, cargoMax: 10, drill: 3, dynamite: 0, teleporters: 0, inventory: []
    };
    const msg = playerStateFrom(player);
    expect(msg).toEqual({
      type: 'playerState',
      x: 1, y: 2, drawX: 1.1, drawY: 2.2, facing: -1, bob: 0.5,
      drillAnim: 0.2, drillDx: 1, drillDy: 0
    });
    expect(msg).not.toHaveProperty('fuel');
    expect(msg).not.toHaveProperty('hull');
  });

  it('round-trips player -> playerState -> remotePlayer transform', () => {
    const player = {
      x: 1, y: 2, drawX: 1.1, drawY: 2.2, facing: -1, bob: 0.5,
      drillAnim: 0.2, drillDx: 1, drillDy: 0,
      fuel: 0, fuelMax: 0, hull: 0, hullMax: 0, cargoMax: 0, drill: 0, dynamite: 0, teleporters: 0, inventory: []
    };
    const remote = remotePlayerFrom(playerStateFrom(player));
    expect(remote).toEqual({
      x: 1, y: 2, drawX: 1.1, drawY: 2.2, facing: -1, bob: 0.5,
      drillAnim: 0.2, drillDx: 1, drillDy: 0
    });
  });

  it('keeps a remote player render position while applying a newer transform', () => {
    const current = [{
      x: 1, y: 2, drawX: 0.5, drawY: 1.5, targetDrawX: 1, targetDrawY: 2,
      facing: 1, bob: 0, drillAnim: 0, drillDx: 0, drillDy: 1
    }];
    const next = applyRemotePlayerState(current, {
      type: 'playerState', x: 4, y: 5, drawX: 3.8, drawY: 4.7,
      facing: -1, bob: 0.4, drillAnim: 0.8, drillDx: -1, drillDy: 0
    });

    expect(next[0]).toMatchObject({ x: 4, y: 5, drawX: 0.5, drawY: 1.5, targetDrawX: 3.8, targetDrawY: 4.7, facing: -1 });
    expect(current[0].x).toBe(1);
  });

  it('interpolates remote render positions without changing their target transform', () => {
    const current = [{
      x: 4, y: 5, drawX: 0, drawY: 1, targetDrawX: 4, targetDrawY: 5,
      facing: 1, bob: 0, drillAnim: 0, drillDx: 0, drillDy: 1
    }];

    const next = interpolateRemotePlayers(current, 0.25);
    expect(next[0]).toMatchObject({ x: 4, y: 5, drawX: 1, drawY: 2, targetDrawX: 4, targetDrawY: 5 });
    expect(current[0].drawX).toBe(0);
  });

  it('snapshots an enemy list', () => {
    const enemy = { id: 9, kind:'ironback', x: 1, y: 2, drawX: 1, drawY: 2, hp: 4, maxHp: 4, alive: true, moveTick: 3, biteTick: 4, flash: 0.5 } as Enemy;
    expect(enemyEntryFrom(enemy)).toEqual({ id: 9, kind:'ironback', x: 1, y: 2, drawX: 1, drawY: 2, hp: 4, maxHp: 4, alive: true });
    expect(enemySnapshotFrom([enemy])).toEqual({ type: 'enemySnapshot', revision: 1, enemies: [enemyEntryFrom(enemy)] });
  });

  it('allocates a fresh enemy id after adopting a host snapshot', () => {
    expect(nextEnemyId([])).toBe(1);
    expect(nextEnemyId([{ id: 3 }, { id: 11 }, { id: 7 }])).toBe(12);
  });
});

describe('enemy list reducers', () => {
  const base: EnemySnapshotEntry[] = [
    { id: 1, kind:'tunnelFiend', x: 1, y: 1, drawX: 0.8, drawY: 1.1, hp: 5, maxHp: 6, alive: true },
    { id: 2, kind:'ironback', x: 2, y: 2, drawX: 2, drawY: 2, hp: 6, maxHp: 6, alive: true }
  ];

  it('mergeEnemySnapshot preserves local interpolation and drops absent ids', () => {
    const snapshot: EnemySnapshotEntry[] = [
      { id: 1, kind:'tunnelFiend', x: 3, y: 1, drawX: 3, drawY: 1, hp: 4, maxHp: 6, alive: true },
      { id: 5, kind:'abyssStalker', x: 9, y: 9, drawX: 9, drawY: 9, hp: 6, maxHp: 6, alive: true }
    ];
    const merged = mergeEnemySnapshot(base, snapshot);
    expect(merged).toHaveLength(2);
    // id 1 keeps local drawX/drawY but takes authoritative logical fields.
    expect(merged[0]).toEqual({ id: 1, kind:'tunnelFiend', x: 3, y: 1, drawX: 0.8, drawY: 1.1, hp: 4, maxHp: 6, alive: true });
    // id 5 is new; id 2 dropped (not in snapshot).
    expect(merged[1].id).toBe(5);
    expect(merged.some((e) => e.id === 2)).toBe(false);
    // Input untouched.
    expect(base).toHaveLength(2);
  });

  it('applyEnemySpawn adds a new enemy and updates an existing one', () => {
    const added = applyEnemySpawn(base, { type: 'enemySpawn', id: 3, kind:'abyssStalker', x: 4, y: 4, hp: 6, maxHp: 6 });
    expect(added).toHaveLength(3);
    expect(added[2]).toEqual({ id: 3, kind:'abyssStalker', x: 4, y: 4, drawX: 4, drawY: 4, hp: 6, maxHp: 6, alive: true });

    const updated = applyEnemySpawn(base, { type: 'enemySpawn', id: 1, kind:'skitterling', x: 7, y: 7, hp: 6, maxHp: 6 });
    expect(updated).toHaveLength(2);
    expect(updated[0].x).toBe(7);
    expect(base[0].x).toBe(1); // pure
  });

  it('applyEnemyDead removes the matching enemy', () => {
    const out = applyEnemyDead(base, { id: 1 });
    expect(out.map((e) => e.id)).toEqual([2]);
    expect(base).toHaveLength(2);
  });

  it('applyEnemyDamage reduces hp and flags death at zero', () => {
    const hit = applyEnemyDamage(base, { id: 1, amount: 2 });
    expect(hit[0].hp).toBe(3);
    expect(hit[0].alive).toBe(true);
    expect(base[0].hp).toBe(5); // pure

    const killed = applyEnemyDamage(base, { id: 1, amount: 5 });
    expect(killed[0].hp).toBe(0);
    expect(killed[0].alive).toBe(false);

    const missing = applyEnemyDamage(base, { id: 99, amount: 5 });
    expect(missing).toEqual(base);
  });
});

describe('createRateLimiter', () => {
  it('gates by the target frequency', () => {
    const gate = createRateLimiter(20); // 50 ms interval
    expect(gate(0)).toBe(true); // first pass always allowed
    expect(gate(10)).toBe(false);
    expect(gate(49)).toBe(false);
    expect(gate(50)).toBe(true);
    expect(gate(80)).toBe(false);
    expect(gate(100)).toBe(true);
  });

  it('never blocks when hz <= 0', () => {
    const gate = createRateLimiter(0);
    expect(gate(0)).toBe(true);
    expect(gate(0)).toBe(true);
  });
});
