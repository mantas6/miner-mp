// Peer-to-peer message protocol for co-op multiplayer.
//
// Pure, DOM-free, and vitest-testable: small "apply" reducers operating on plain
// data, plus builders that project game state onto the wire. The message shapes
// and their validation live in `shared/protocol.ts` so that the relay enforces
// the same rules; this module re-exports them for stable client call sites.

import type { Tile, Enemy, RemotePlayer, ShipTransform } from '../core/types';
import type {
  EnemyDamageMsg,
  EnemyDeadMsg,
  EnemySnapshotEntry,
  EnemySnapshotMsg,
  EnemySpawnMsg,
  NetMessage,
  PlayerStateMsg
} from '../../shared/protocol';
import { parseNetMessage } from '../../shared/protocol';
import { tileSchema } from '../../shared/world-schema';

// --- Message shapes and validation (defined in shared/protocol.ts) ----------

export type {
  BountyMsg,
  DiedMsg,
  EnemyDamageMsg,
  EnemyDeadMsg,
  EnemySnapshotEntry,
  EnemySnapshotMsg,
  EnemySpawnMsg,
  EnemyTileShotMsg,
  ExploreMsg,
  NetMessage,
  NetMessageType,
  PlayerStateMsg,
  RespawnedMsg,
  TeleportedMsg,
  TileDiffEntry,
  TileMsg,
  WakeNearMsg,
  WorldInitMsg,
  WorldResetMsg,
  WorldStateMsg
} from '../../shared/protocol';

/**
 * Validate an already-parsed value as a NetMessage. Returns the normalized
 * message on success or `null` on any malformed input. Never throws.
 */
export function validateMessage(value: unknown): NetMessage | null {
  return parseNetMessage(value);
}

/** Whether a value is a well-formed tile. */
export function isTile(value: unknown): value is Tile {
  return tileSchema.safeParse(value).success;
}

// --- Builders (plain-data constructors) ------------------------------------

/** Build a playerState message from a player (transform fields only). */
export function playerStateFrom(p: ShipTransform): PlayerStateMsg {
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
    kind: e.kind,
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

// The accumulated tile diff and its application to a world live in
// `src/world/tile-diff.ts`: the relay's world and the solo save are the same
// list of tile entries, so they are restored by the same code.

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
    kind: msg.kind,
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
