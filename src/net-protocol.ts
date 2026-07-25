// Peer-to-peer message protocol for co-op multiplayer.
//
// Pure, DOM-free, and vitest-testable: message type definitions, JSON
// encode/decode with validation, and small pure "apply" reducers operating on
// plain data. See PLAN.md "Message protocol". These messages are the `payload`
// carried inside the relay envelope (`{ t: 'relay', payload }`); the envelope
// itself is handled in `net.ts`.

import type { Tile, Ore, Artifact, Player, Enemy, RemotePlayer } from './types';

// --- Message types ---------------------------------------------------------

/** Local ship transform, throttled. Transform only — no fuel/hull vitals. */
export interface PlayerStateMsg {
  type: 'playerState';
  x: number;
  y: number;
  drawX: number;
  drawY: number;
  facing: number;
  drillAnim: number;
  drillDx: number;
  drillDy: number;
  bob: number;
}

/** A single local tile mutation (last-writer-wins). */
export interface TileMsg {
  type: 'tile';
  revision: number;
  x: number;
  y: number;
  tile: Tile;
}

/** Guest -> host: request to wake dormant enemies around a coordinate. */
export interface WakeNearMsg {
  type: 'wakeNear';
  x: number;
  y: number;
}

/** One enemy as carried in snapshots and world sync. */
export interface EnemySnapshotEntry {
  id: number;
  x: number;
  y: number;
  drawX: number;
  drawY: number;
  hp: number;
  maxHp: number;
  alive: boolean;
}

/** Host -> guest: authoritative list of current enemies (~15 Hz). */
export interface EnemySnapshotMsg {
  type: 'enemySnapshot';
  revision: number;
  enemies: EnemySnapshotEntry[];
}

/** Host -> guest: a newly-woken enemy. */
export interface EnemySpawnMsg {
  type: 'enemySpawn';
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

/** Host -> guest: an enemy died (with bounty attribution). */
export interface EnemyDeadMsg {
  type: 'enemyDead';
  id: number;
  bounty: number;
  killerIsGuest: boolean;
}

/** Guest -> host: guest drilled an enemy. */
export interface EnemyDamageMsg {
  type: 'enemyDamage';
  id: number;
  amount: number;
  by: 'host' | 'guest';
}

/** Guest -> host: destroy a dormant enemy tile with one valid gun shot. */
export interface EnemyTileShotMsg {
  type: 'enemyTileShot';
  x: number;
  y: number;
  by: 'guest';
}

/** Host -> guest: credit a guest kill locally. */
export interface BountyMsg {
  type: 'bounty';
  amount: number;
}

/** Inform partner the local ship has died. */
export interface DiedMsg {
  type: 'died';
}

/** Inform partner the local ship has respawned at a coordinate. */
export interface RespawnedMsg {
  type: 'respawned';
  x: number;
  y: number;
}

/** Inform partner the local ship teleported to a coordinate. */
export interface TeleportedMsg {
  type: 'teleported';
  x: number;
  y: number;
}

/** Newly explored row-major tile ranges, shared as co-op cartography. */
export interface ExploreMsg {
  type: 'explore';
  revision: number;
  ranges: string;
}

/** A single accumulated tile diff entry. */
export interface TileDiffEntry {
  x: number;
  y: number;
  tile: Tile;
}

/** Host -> new joiner: accumulated tile diff plus the current enemy list. */
export interface WorldSyncMsg {
  type: 'worldSync';
  tiles: TileDiffEntry[];
  enemies: EnemySnapshotEntry[];
  explored: string;
}

/** Server -> client: complete authoritative terrain/entity/view state. */
export interface WorldStateMsg {
  type: 'worldState';
  version: 1;
  revision: number;
  initialized: boolean;
  tiles: TileDiffEntry[];
  enemies: EnemySnapshotEntry[];
  explored: string;
}

/** Client -> server: deterministic generated non-air tiles for a new revision. */
export interface WorldInitMsg {
  type: 'worldInit';
  revision: number;
  tiles: TileDiffEntry[];
}

/** Client request or server broadcast for an authoritative terrain reset. */
export interface WorldResetMsg {
  type: 'worldReset';
  revision: number;
}

export type NetMessage =
  | PlayerStateMsg
  | TileMsg
  | WakeNearMsg
  | EnemySnapshotMsg
  | EnemySpawnMsg
  | EnemyDeadMsg
  | EnemyDamageMsg
  | EnemyTileShotMsg
  | BountyMsg
  | DiedMsg
  | RespawnedMsg
  | TeleportedMsg
  | ExploreMsg
  | WorldSyncMsg
  | WorldStateMsg
  | WorldInitMsg
  | WorldResetMsg;

export type NetMessageType = NetMessage['type'];

// --- Low-level validation helpers ------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isInt(v: unknown): v is number {
  return isNum(v) && Number.isInteger(v);
}
function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}
function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

const MAX_WORLD_TILES = 90 * 1004;
const MAX_ENEMIES = 2048;

const TILE_TYPES = new Set(['air', 'dirt', 'rock', 'ore', 'hazard', 'artifact', 'motherlode', 'enemy']);

function isOre(v: unknown): v is Ore {
  return (
    isObj(v) &&
    isStr(v.name) &&
    isStr(v.color) &&
    isNum(v.value) &&
    isNum(v.min) &&
    isNum(v.max) &&
    isNum(v.chance)
  );
}

function isArtifact(v: unknown): v is Artifact {
  return (
    isObj(v) &&
    isStr(v.name) &&
    isStr(v.color) &&
    isNum(v.value) &&
    isNum(v.min) &&
    isNum(v.max) &&
    isNum(v.chance)
  );
}

export function isTile(v: unknown): v is Tile {
  if (!isObj(v) || !isStr(v.type) || !TILE_TYPES.has(v.type)) return false;
  switch (v.type) {
    case 'air':
      return true;
    case 'rock':
      return isNum(v.hp);
    case 'ore':
      return isNum(v.hp) && isNum(v.maxHp) && isOre(v.ore);
    case 'artifact':
      return isNum(v.hp) && isNum(v.maxHp) && isArtifact(v.artifact);
    case 'dirt':
    case 'hazard':
    case 'motherlode':
    case 'enemy':
      return isNum(v.hp) && isNum(v.maxHp);
    default:
      return false;
  }
}

function isEnemyEntry(v: unknown): v is EnemySnapshotEntry {
  return (
    isObj(v) &&
    isInt(v.id) &&
    isNum(v.x) &&
    isNum(v.y) &&
    isNum(v.drawX) &&
    isNum(v.drawY) &&
    isNum(v.hp) &&
    isNum(v.maxHp) &&
    isBool(v.alive)
  );
}

function isTileDiffEntry(v: unknown): v is TileDiffEntry {
  return isObj(v) && isInt(v.x) && v.x >= 0 && v.x < 90 && isInt(v.y) && v.y >= 0 && v.y < 1004 && isTile(v.tile);
}

function isRevision(v: unknown): v is number {
  return isInt(v) && v >= 1;
}

function isExploration(v: unknown): v is string {
  if (!isStr(v) || v.length > MAX_WORLD_TILES * 8) return false;
  if (!v) return true;
  return v.split(',').every(range => {
    const match = /^(\d+)(?:-(\d+))?$/.exec(range);
    if (!match) return false;
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    return start >= 270 && end >= start && end < MAX_WORLD_TILES;
  });
}

// --- Message validation ----------------------------------------------------

/**
 * Validate an already-parsed value as a NetMessage. Returns the typed message
 * on success or `null` on any malformed input. Never throws.
 */
export function validateMessage(v: unknown): NetMessage | null {
  if (!isObj(v) || !isStr(v.type)) return null;
  switch (v.type) {
    case 'playerState':
      return isNum(v.x) &&
        isNum(v.y) &&
        isNum(v.drawX) &&
        isNum(v.drawY) &&
        isNum(v.facing) &&
        isNum(v.drillAnim) &&
        isNum(v.drillDx) &&
        isNum(v.drillDy) &&
        isNum(v.bob)
        ? (v as unknown as PlayerStateMsg)
        : null;
    case 'tile':
      return isRevision(v.revision) && isTileDiffEntry(v) ? (v as unknown as TileMsg) : null;
    case 'wakeNear':
      return isNum(v.x) && isNum(v.y) ? (v as unknown as WakeNearMsg) : null;
    case 'enemySnapshot':
      return isRevision(v.revision) && Array.isArray(v.enemies) && v.enemies.length <= MAX_ENEMIES && v.enemies.every(isEnemyEntry)
        ? (v as unknown as EnemySnapshotMsg)
        : null;
    case 'enemySpawn':
      return isInt(v.id) && isNum(v.x) && isNum(v.y) && isNum(v.hp) && isNum(v.maxHp)
        ? (v as unknown as EnemySpawnMsg)
        : null;
    case 'enemyDead':
      return isInt(v.id) && isNum(v.bounty) && isBool(v.killerIsGuest)
        ? (v as unknown as EnemyDeadMsg)
        : null;
    case 'enemyDamage':
      return isInt(v.id) && isNum(v.amount) && (v.by === 'host' || v.by === 'guest')
        ? (v as unknown as EnemyDamageMsg)
        : null;
    case 'enemyTileShot':
      return isNum(v.x) && isNum(v.y) && v.by === 'guest'
        ? (v as unknown as EnemyTileShotMsg)
        : null;
    case 'bounty':
      return isNum(v.amount) ? (v as unknown as BountyMsg) : null;
    case 'died':
      return { type: 'died' };
    case 'respawned':
      return isNum(v.x) && isNum(v.y) ? (v as unknown as RespawnedMsg) : null;
    case 'teleported':
      return isNum(v.x) && isNum(v.y) ? (v as unknown as TeleportedMsg) : null;
    case 'explore':
      return isRevision(v.revision) && isExploration(v.ranges) ? (v as unknown as ExploreMsg) : null;
    case 'worldSync':
      return Array.isArray(v.tiles) &&
        v.tiles.every(isTileDiffEntry) &&
        Array.isArray(v.enemies) &&
        v.enemies.every(isEnemyEntry) &&
        isStr(v.explored)
        ? (v as unknown as WorldSyncMsg)
        : null;
    case 'worldState':
      return v.version === 1 && isRevision(v.revision) && isBool(v.initialized) &&
        Array.isArray(v.tiles) && v.tiles.length <= MAX_WORLD_TILES && v.tiles.every(isTileDiffEntry) &&
        Array.isArray(v.enemies) && v.enemies.length <= MAX_ENEMIES && v.enemies.every(isEnemyEntry) &&
        isExploration(v.explored)
        ? (v as unknown as WorldStateMsg)
        : null;
    case 'worldInit':
      return isRevision(v.revision) && Array.isArray(v.tiles) && v.tiles.length <= MAX_WORLD_TILES &&
        v.tiles.every(entry => isTileDiffEntry(entry) && entry.tile.type !== 'air')
        ? (v as unknown as WorldInitMsg)
        : null;
    case 'worldReset':
      return isRevision(v.revision) ? (v as unknown as WorldResetMsg) : null;
    default:
      return null;
  }
}

/** Serialize a message to a JSON string. */
export function encodeMessage(msg: NetMessage): string {
  return JSON.stringify(msg);
}

/**
 * Parse and validate a JSON string into a NetMessage. Returns `null` on invalid
 * JSON or a malformed/unknown message. Never throws.
 */
export function decodeMessage(raw: string): NetMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return validateMessage(parsed);
}

// --- Builders (plain-data constructors) ------------------------------------

/** Build a playerState message from a player (transform fields only). */
export function playerStateFrom(p: Player): PlayerStateMsg {
  return {
    type: 'playerState',
    x: p.x,
    y: p.y,
    drawX: p.drawX,
    drawY: p.drawY,
    facing: p.facing,
    drillAnim: p.drillAnim,
    drillDx: p.drillDx,
    drillDy: p.drillDy,
    bob: p.bob
  };
}

/** Project the transform-only fields of a playerState message onto a remote player. */
export function remotePlayerFrom(msg: PlayerStateMsg): RemotePlayer {
  return {
    x: msg.x,
    y: msg.y,
    drawX: msg.drawX,
    drawY: msg.drawY,
    facing: msg.facing,
    drillAnim: msg.drillAnim,
    drillDx: msg.drillDx,
    drillDy: msg.drillDy,
    bob: msg.bob
  };
}

/**
 * Keep the current rendered position while accepting the latest remote transform.
 * The next animation frame eases drawX/drawY toward the transmitted draw position.
 */
export function applyRemotePlayerState(
  current: RemotePlayer[],
  msg: PlayerStateMsg
): RemotePlayer[] {
  const next = remotePlayerFrom(msg);
  const previous = current[0];
  return [{
    ...next,
    drawX: previous?.drawX ?? next.drawX,
    drawY: previous?.drawY ?? next.drawY,
    targetDrawX: msg.drawX,
    targetDrawY: msg.drawY
  }];
}

/** Ease remote render positions toward their latest received transform. Pure. */
export function interpolateRemotePlayers(players: RemotePlayer[], amount: number): RemotePlayer[] {
  return players.map((player) => ({
    ...player,
    drawX: player.drawX + ((player.targetDrawX ?? player.x) - player.drawX) * amount,
    drawY: player.drawY + ((player.targetDrawY ?? player.y) - player.drawY) * amount
  }));
}

/** Snapshot a single enemy into a wire entry. */
export function enemyEntryFrom(e: Enemy): EnemySnapshotEntry {
  return {
    id: e.id,
    x: e.x,
    y: e.y,
    drawX: e.drawX,
    drawY: e.drawY,
    hp: e.hp,
    maxHp: e.maxHp,
    alive: e.alive
  };
}

/** Build an enemySnapshot message from the host's enemy list. */
export function enemySnapshotFrom(enemies: Enemy[], revision = 1): EnemySnapshotMsg {
  return { type: 'enemySnapshot', revision, enemies: enemies.map(enemyEntryFrom) };
}

/** Return an unused positive enemy id after adopting a replicated enemy list. */
export function nextEnemyId(enemies: Pick<EnemySnapshotEntry, 'id'>[]): number {
  return enemies.reduce((next, enemy) => Math.max(next, enemy.id + 1), 1);
}

// --- Tile diff (dirty-tile set) --------------------------------------------

/** Accumulated tile mutations keyed by coordinate. */
export type TileDiff = Record<string, TileDiffEntry>;

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Apply a tile mutation to an accumulated diff (last-writer-wins), returning a
 * new diff. Pure — the input diff is not mutated.
 */
export function applyTileDiff(diff: TileDiff, msg: Pick<TileMsg, 'x' | 'y' | 'tile'>): TileDiff {
  return { ...diff, [tileKey(msg.x, msg.y)]: { x: msg.x, y: msg.y, tile: msg.tile } };
}

/** Flatten a tile diff into the array form carried by worldSync. */
export function tileDiffToArray(diff: TileDiff): TileDiffEntry[] {
  return Object.values(diff);
}

/** Build a compact late-join world sync from the accumulated tile mutations. */
export function worldSyncFrom(diff: TileDiff, enemies: Enemy[] = [], explored = ''): WorldSyncMsg {
  return { type: 'worldSync', tiles: tileDiffToArray(diff), enemies: enemies.map(enemyEntryFrom), explored };
}

/**
 * Apply a tile mutation onto a 2D world grid. Mutates and returns the grid (the
 * grid is a plain array of plain tiles). No-op if the coordinate is out of range.
 */
export function applyTileToWorld(world: Tile[][], msg: Pick<TileMsg, 'x' | 'y' | 'tile'>): Tile[][] {
  const row = world[msg.y];
  if (row && msg.x >= 0 && msg.x < row.length) row[msg.x] = msg.tile;
  return world;
}

/** Apply a host's compact tile diff to a deterministic local world grid. */
export function applyWorldSyncToWorld(world: Tile[][], msg: WorldSyncMsg): Tile[][] {
  for (const tile of msg.tiles) applyTileToWorld(world, tile);
  return world;
}

// --- Enemy list reducers ---------------------------------------------------

/**
 * Merge an authoritative host snapshot into the local enemy list. The snapshot
 * is the full current list, so absent ids are dropped. Local interpolation
 * fields (drawX/drawY) are preserved for enemies already known. Pure.
 */
export function mergeEnemySnapshot(
  current: EnemySnapshotEntry[],
  snapshot: EnemySnapshotEntry[]
): EnemySnapshotEntry[] {
  const prev = new Map(current.map((e) => [e.id, e]));
  return snapshot.map((s) => {
    const old = prev.get(s.id);
    return old ? { ...s, drawX: old.drawX, drawY: old.drawY } : { ...s };
  });
}

/** Add (or update in place) a spawned enemy. Pure. */
export function applyEnemySpawn(list: EnemySnapshotEntry[], msg: EnemySpawnMsg): EnemySnapshotEntry[] {
  const entry: EnemySnapshotEntry = {
    id: msg.id,
    x: msg.x,
    y: msg.y,
    drawX: msg.x,
    drawY: msg.y,
    hp: msg.hp,
    maxHp: msg.maxHp,
    alive: true
  };
  if (list.some((e) => e.id === msg.id)) {
    return list.map((e) => (e.id === msg.id ? { ...e, ...entry } : e));
  }
  return [...list, entry];
}

/** Remove a dead enemy from the list. Pure. */
export function applyEnemyDead(
  list: EnemySnapshotEntry[],
  msg: Pick<EnemyDeadMsg, 'id'>
): EnemySnapshotEntry[] {
  return list.filter((e) => e.id !== msg.id);
}

/**
 * Apply damage to a matching enemy, reducing hp and flagging it dead when
 * depleted. Returns a new list; unknown ids are ignored. Pure.
 */
export function applyEnemyDamage(
  list: EnemySnapshotEntry[],
  msg: Pick<EnemyDamageMsg, 'id' | 'amount'>
): EnemySnapshotEntry[] {
  return list.map((e) => {
    if (e.id !== msg.id) return e;
    const hp = e.hp - msg.amount;
    return { ...e, hp, alive: hp > 0 && e.alive };
  });
}

export interface WorldSyncResult {
  diff: TileDiff;
  enemies: EnemySnapshotEntry[];
}

/**
 * Reconcile a late joiner's local world diff and enemy list against a host
 * worldSync. Tiles are merged into the diff (last-writer-wins) and enemies are
 * replaced by the authoritative snapshot. Pure.
 */
export function mergeWorldSync(
  diff: TileDiff,
  enemies: EnemySnapshotEntry[],
  msg: WorldSyncMsg
): WorldSyncResult {
  let nextDiff = diff;
  for (const t of msg.tiles) nextDiff = applyTileDiff(nextDiff, t);
  return { diff: nextDiff, enemies: mergeEnemySnapshot(enemies, msg.enemies) };
}

// --- Rate limiting ---------------------------------------------------------

/** A time gate: returns true when enough time has elapsed since the last pass. */
export type RateLimiter = (now: number) => boolean;

/**
 * Create a pure rate limiter for a target frequency in Hz. The returned gate
 * accepts a monotonic timestamp (ms) and returns whether a send is permitted,
 * updating its internal clock when it allows one. `hz <= 0` disables limiting.
 */
export function createRateLimiter(hz: number): RateLimiter {
  const interval = hz > 0 ? 1000 / hz : 0;
  let last = -Infinity;
  return (now: number): boolean => {
    if (now - last >= interval) {
      last = now;
      return true;
    }
    return false;
  };
}
