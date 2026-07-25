import { describe, it, expect } from 'vitest';
import {
  encodeMessage,
  decodeMessage,
  validateMessage,
  isTile,
  playerStateFrom,
  remotePlayerFrom,
  applyRemotePlayerState,
  interpolateRemotePlayers,
  enemySnapshotFrom,
  enemyEntryFrom,
  applyTileDiff,
  applyTileToWorld,
  applyWorldSyncToWorld,
  tileDiffToArray,
  tileKey,
  worldSyncFrom,
  mergeEnemySnapshot,
  applyEnemySpawn,
  applyEnemyDead,
  applyEnemyDamage,
  mergeWorldSync,
  createRateLimiter,
  type NetMessage,
  type EnemySnapshotEntry,
  type TileDiff
} from '../src/net-protocol';
import type { Enemy, Player, Tile } from '../src/types';

const ORE = { name: 'Gold', color: '#ffd65c', value: 70, min: 34, chance: 0.04 };

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
  { type: 'tile', x: 3, y: 7, tile: { type: 'air' } },
  { type: 'tile', x: 3, y: 8, tile: { type: 'dirt', hp: 2, maxHp: 3 } },
  { type: 'tile', x: 4, y: 9, tile: { type: 'rock', hp: 999 } },
  { type: 'tile', x: 4, y: 10, tile: { type: 'ore', ore: ORE, hp: 4, maxHp: 4 } },
  { type: 'wakeNear', x: 10, y: 40 },
  {
    type: 'enemySnapshot',
    enemies: [
      { id: 1, x: 3, y: 4, drawX: 3, drawY: 4, hp: 5, maxHp: 6, alive: true },
      { id: 2, x: 9, y: 2, drawX: 8.5, drawY: 2.1, hp: 1, maxHp: 6, alive: true }
    ]
  },
  { type: 'enemySpawn', id: 7, x: 12, y: 30, hp: 6, maxHp: 6 },
  { type: 'enemyDead', id: 7, bounty: 42, killerIsGuest: true },
  { type: 'enemyDamage', id: 7, amount: 3, by: 'guest' },
  { type: 'bounty', amount: 42 },
  { type: 'died' },
  { type: 'respawned', x: 45, y: 2 },
  {
    type: 'worldSync',
    tiles: [
      { x: 1, y: 1, tile: { type: 'air' } },
      { x: 2, y: 2, tile: { type: 'dirt', hp: 1, maxHp: 2 } }
    ],
    enemies: [{ id: 3, x: 0, y: 0, drawX: 0, drawY: 0, hp: 4, maxHp: 4, alive: true }]
  }
];

describe('encode/decode round-trips', () => {
  for (const msg of messages) {
    it(`round-trips a ${msg.type} message`, () => {
      const decoded = decodeMessage(encodeMessage(msg));
      expect(decoded).toEqual(msg);
    });
  }
});

describe('decodeMessage / validateMessage rejection', () => {
  it('returns null for invalid JSON', () => {
    expect(decodeMessage('{not json')).toBeNull();
    expect(decodeMessage('')).toBeNull();
  });

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

  it('rejects a non-integer enemy id', () => {
    expect(validateMessage({ type: 'enemySpawn', id: 1.5, x: 0, y: 0, hp: 1, maxHp: 1 })).toBeNull();
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
      { type: 'artifact', hp: 24, maxHp: 24 },
      { type: 'enemy', hp: 4, maxHp: 4 }
    ];
    for (const t of tiles) expect(isTile(t)).toBe(true);
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
      fuel: 100, fuelMax: 100, hull: 80, hullMax: 100, cargoMax: 10, drill: 3, cargo: []
    } as Player;
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
      fuel: 0, fuelMax: 0, hull: 0, hullMax: 0, cargoMax: 0, drill: 0, cargo: []
    } as Player;
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
    const enemy = { id: 9, x: 1, y: 2, drawX: 1, drawY: 2, hp: 4, maxHp: 4, alive: true, moveTick: 3, biteTick: 4, flash: 0.5 } as Enemy;
    expect(enemyEntryFrom(enemy)).toEqual({ id: 9, x: 1, y: 2, drawX: 1, drawY: 2, hp: 4, maxHp: 4, alive: true });
    expect(enemySnapshotFrom([enemy])).toEqual({ type: 'enemySnapshot', enemies: [enemyEntryFrom(enemy)] });
  });
});

describe('tile diff reducers', () => {
  it('applyTileDiff is pure and last-writer-wins', () => {
    const empty: TileDiff = {};
    const a = applyTileDiff(empty, { x: 1, y: 2, tile: { type: 'air' } });
    expect(empty).toEqual({});
    expect(a[tileKey(1, 2)]).toEqual({ x: 1, y: 2, tile: { type: 'air' } });

    const b = applyTileDiff(a, { x: 1, y: 2, tile: { type: 'dirt', hp: 1, maxHp: 2 } });
    expect(a[tileKey(1, 2)].tile).toEqual({ type: 'air' });
    expect(b[tileKey(1, 2)].tile).toEqual({ type: 'dirt', hp: 1, maxHp: 2 });
    expect(Object.keys(b)).toHaveLength(1);
  });

  it('tileDiffToArray flattens entries', () => {
    let diff: TileDiff = {};
    diff = applyTileDiff(diff, { x: 0, y: 0, tile: { type: 'air' } });
    diff = applyTileDiff(diff, { x: 1, y: 0, tile: { type: 'rock', hp: 999 } });
    const arr = tileDiffToArray(diff);
    expect(arr).toHaveLength(2);
    expect(arr).toContainEqual({ x: 1, y: 0, tile: { type: 'rock', hp: 999 } });
  });

  it('applyTileToWorld mutates the grid within bounds and ignores out-of-range', () => {
    const world: Tile[][] = [
      [{ type: 'dirt', hp: 1, maxHp: 1 }, { type: 'dirt', hp: 1, maxHp: 1 }],
      [{ type: 'dirt', hp: 1, maxHp: 1 }, { type: 'dirt', hp: 1, maxHp: 1 }]
    ];
    applyTileToWorld(world, { x: 1, y: 0, tile: { type: 'air' } });
    expect(world[0][1]).toEqual({ type: 'air' });
    // Out of range: no throw, no change.
    applyTileToWorld(world, { x: 5, y: 0, tile: { type: 'rock', hp: 999 } });
    applyTileToWorld(world, { x: 0, y: 9, tile: { type: 'rock', hp: 999 } });
    expect(world).toHaveLength(2);
  });

  it('builds and applies a compact world sync without replacing the generated grid', () => {
    let diff: TileDiff = {};
    diff = applyTileDiff(diff, { x: 0, y: 0, tile: { type: 'air' } });
    diff = applyTileDiff(diff, { x: 1, y: 1, tile: { type: 'dirt', hp: 1, maxHp: 2 } });
    const sync = worldSyncFrom(diff);
    const world: Tile[][] = [
      [{ type: 'dirt', hp: 2, maxHp: 2 }, { type: 'rock', hp: 999 }],
      [{ type: 'ore', ore: ORE, hp: 4, maxHp: 4 }, { type: 'dirt', hp: 2, maxHp: 2 }]
    ];

    expect(sync).toEqual({ type: 'worldSync', tiles: tileDiffToArray(diff), enemies: [] });
    expect(applyWorldSyncToWorld(world, sync)).toBe(world);
    expect(world).toEqual([
      [{ type: 'air' }, { type: 'rock', hp: 999 }],
      [{ type: 'ore', ore: ORE, hp: 4, maxHp: 4 }, { type: 'dirt', hp: 1, maxHp: 2 }]
    ]);
  });
});

describe('enemy list reducers', () => {
  const base: EnemySnapshotEntry[] = [
    { id: 1, x: 1, y: 1, drawX: 0.8, drawY: 1.1, hp: 5, maxHp: 6, alive: true },
    { id: 2, x: 2, y: 2, drawX: 2, drawY: 2, hp: 6, maxHp: 6, alive: true }
  ];

  it('mergeEnemySnapshot preserves local interpolation and drops absent ids', () => {
    const snapshot: EnemySnapshotEntry[] = [
      { id: 1, x: 3, y: 1, drawX: 3, drawY: 1, hp: 4, maxHp: 6, alive: true },
      { id: 5, x: 9, y: 9, drawX: 9, drawY: 9, hp: 6, maxHp: 6, alive: true }
    ];
    const merged = mergeEnemySnapshot(base, snapshot);
    expect(merged).toHaveLength(2);
    // id 1 keeps local drawX/drawY but takes authoritative logical fields.
    expect(merged[0]).toEqual({ id: 1, x: 3, y: 1, drawX: 0.8, drawY: 1.1, hp: 4, maxHp: 6, alive: true });
    // id 5 is new; id 2 dropped (not in snapshot).
    expect(merged[1].id).toBe(5);
    expect(merged.some((e) => e.id === 2)).toBe(false);
    // Input untouched.
    expect(base).toHaveLength(2);
  });

  it('applyEnemySpawn adds a new enemy and updates an existing one', () => {
    const added = applyEnemySpawn(base, { type: 'enemySpawn', id: 3, x: 4, y: 4, hp: 6, maxHp: 6 });
    expect(added).toHaveLength(3);
    expect(added[2]).toEqual({ id: 3, x: 4, y: 4, drawX: 4, drawY: 4, hp: 6, maxHp: 6, alive: true });

    const updated = applyEnemySpawn(base, { type: 'enemySpawn', id: 1, x: 7, y: 7, hp: 6, maxHp: 6 });
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

describe('mergeWorldSync', () => {
  it('merges tiles into the diff and replaces enemies', () => {
    let diff: TileDiff = {};
    diff = applyTileDiff(diff, { x: 0, y: 0, tile: { type: 'rock', hp: 999 } });
    const enemies: EnemySnapshotEntry[] = [
      { id: 1, x: 0, y: 0, drawX: 0, drawY: 0, hp: 1, maxHp: 6, alive: true }
    ];

    const result = mergeWorldSync(diff, enemies, {
      type: 'worldSync',
      tiles: [
        { x: 0, y: 0, tile: { type: 'air' } }, // overwrites existing
        { x: 1, y: 2, tile: { type: 'dirt', hp: 1, maxHp: 2 } }
      ],
      enemies: [{ id: 2, x: 5, y: 5, drawX: 5, drawY: 5, hp: 6, maxHp: 6, alive: true }]
    });

    expect(result.diff[tileKey(0, 0)].tile).toEqual({ type: 'air' });
    expect(result.diff[tileKey(1, 2)].tile).toEqual({ type: 'dirt', hp: 1, maxHp: 2 });
    expect(result.enemies.map((e) => e.id)).toEqual([2]);
    // Inputs untouched.
    expect(diff[tileKey(0, 0)].tile).toEqual({ type: 'rock', hp: 999 });
    expect(enemies).toHaveLength(1);
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
