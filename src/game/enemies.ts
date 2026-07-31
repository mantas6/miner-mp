// Enemy simulation glue.
//
// The pure pieces live in core/ (`enemy-types`, `enemy-movement`,
// `enemy-exposure`); this module owns the stateful side: which air is reachable,
// waking cocoons into entities, the single kill path shared by drills, guns and
// replicated peer kills, and the per-tick presentation/bite/movement passes.

import { ENEMY } from '../core/balance';
import { expandReachableAir } from '../core/enemy-exposure';
import { findClosestEnemyTarget, findEnemyPathStep } from '../core/enemy-movement';
import { enemyBiteCooldown, enemyBiteDamage, enemyMoveDelay, getEnemyType } from '../core/enemy-types';
import type { AudioController, Enemy, GameState } from '../core/types';
import type { EnemySnapshotEntry } from '../net/net-protocol';
import { enemyEntryFrom, mergeEnemySnapshot } from '../net/net-protocol';
import type { GameSession } from './session';
import type { WorldGrid } from './world-grid';

/** Enemies stop pathing toward a target further away than this (Manhattan). */
const ENEMY_AGGRO_RANGE = 24;

/** Who banks the bounty for a kill: the local host, or the paired guest. */
export type EnemyKiller = 'host' | 'guest';

/** What a kill removes: a live entity, or a dormant cocoon tile. */
type KillTarget =
  | {kind: 'active'; enemy: Enemy}
  | {kind: 'dormant'; x: number; y: number};

export interface EnemySim {
  /** The live enemy standing on a tile, if any. */
  enemyAt(x: number, y: number): Enemy | undefined;
  /** Wake every cocoon newly reachable through air from this coordinate. */
  wakeEnemiesNear(x: number, y: number): void;
  /** Recompute reachable air from the player and wake everything exposed. */
  resetExposure(): void;
  /** Forget reachable air without re-seeding it (world reset). */
  clearExposure(): void;
  /** Hurt a live enemy; kills it at zero HP. Guests forward the hit instead. */
  damageEnemy(enemy: Enemy | undefined, amount?: number, killer?: EnemyKiller): void;
  /** Drill a dormant cocoon tile. Returns whether the tile was a cocoon. */
  damageEnemyTile(x: number, y: number): boolean;
  /** Destroy a dormant cocoon outright (gun hit). Returns whether it existed. */
  destroyDormantEnemy(x: number, y: number, killer: EnemyKiller): boolean;
  /** Bank a bounty this client was awarded (locally or by the host). */
  creditBounty(amount: number): void;
  /** Replace the local enemy list from an authoritative snapshot. */
  applyEntries(entries: EnemySnapshotEntry[]): void;
  /** Merge an authoritative snapshot into the local enemy list. */
  mergeEntries(entries: EnemySnapshotEntry[]): void;
  /** Host pass: easing, biting, and pathing. */
  update(): void;
  /** Guest pass: easing only (positions are authoritative). */
  updatePresentation(): void;
  /** Guest pass: bites are simulated locally so hull damage stays responsive. */
  updateBites(): void;
}

export interface EnemySimDeps {
  state: GameState;
  session: GameSession;
  grid: WorldGrid;
  audio: AudioController;
  toast(message: string): void;
  addCash(amount: number): void;
  saveProgress(): void;
  /** Apply hull damage to the local ship. */
  damagePlayer(amount: number): void;
  spawnDust(x: number, y: number, color?: string, amount?: number): void;
  spawnExplosion(x: number, y: number): void;
}

export function createEnemySim(deps: EnemySimDeps): EnemySim {
  const {state, session, grid, audio, toast, addCash, saveProgress, damagePlayer, spawnDust, spawnExplosion} = deps;
  /** Air cells already known to be connected to the surface/player. */
  const reachableAir = new Set<string>();

  function enemyFromSnapshot(entry: EnemySnapshotEntry, previous?: Enemy): Enemy {
    return {
      ...entry,
      moveTick: previous?.moveTick ?? 0,
      biteTick: previous?.biteTick ?? 0,
      flash: previous?.flash ?? 0
    };
  }

  function applyEntries(entries: EnemySnapshotEntry[]): void {
    const previous = new Map(state.enemies.map(enemy => [enemy.id, enemy]));
    state.enemies = entries.map(entry => enemyFromSnapshot(entry, previous.get(entry.id)));
  }

  function mergeEntries(entries: EnemySnapshotEntry[]): void {
    applyEntries(mergeEnemySnapshot(state.enemies.map(enemyEntryFrom), entries));
  }

  function enemyAt(x: number, y: number): Enemy | undefined {
    return state.enemies.find(e => e.alive && Math.round(e.x) === x && Math.round(e.y) === y);
  }

  function wakeEnemy(x: number, y: number): boolean {
    if (session.isGuestEnemyReplica()) return false;
    const tile = grid.get(x, y);
    if (tile.type !== 'enemy') return false;
    grid.set(x, y, {type: 'air'});
    const enemy: Enemy = {
      id: state.enemyIdCounter++,
      kind: tile.kind,
      x,
      y,
      drawX: x,
      drawY: y,
      hp: tile.hp || 4,
      maxHp: tile.maxHp || tile.hp || 4,
      alive: true,
      moveTick: 0,
      biteTick: 0,
      flash: 0
    };
    state.enemies.push(enemy);
    if (session.isPairedHost()) {
      session.send({type: 'enemySpawn', id: enemy.id, kind: enemy.kind, x, y, hp: enemy.hp, maxHp: enemy.maxHp});
    }
    spawnDust(x, y, getEnemyType(enemy.kind).glow, 18);
    audio.enemyWake();
    toast(`${getEnemyType(enemy.kind).name} awakened! Drill it before it chews the hull.`);
    return true;
  }

  function wakeEnemiesNear(x: number, y: number): void {
    if (session.isGuestEnemyReplica()) {
      if (session.paired) session.send({type: 'wakeNear', x, y});
      return;
    }
    let seeds = [{x, y}];
    while (seeds.length) {
      const exposed = expandReachableAir(state.world, reachableAir, seeds);
      for (const enemy of exposed) wakeEnemy(enemy.x, enemy.y);
      seeds = exposed;
    }
  }

  function resetExposure(): void {
    reachableAir.clear();
    if (session.isGuestEnemyReplica()) return;
    let seeds = [{x: state.player.x, y: state.player.y}];
    let forceSeeds = true;
    while (seeds.length) {
      const exposed = expandReachableAir(state.world, reachableAir, seeds, forceSeeds);
      for (const enemy of exposed) wakeEnemy(enemy.x, enemy.y);
      seeds = exposed;
      forceSeeds = false;
    }
  }

  function enemyBounty(y: number): number {
    return ENEMY.bounty.base + Math.floor(y / ENEMY.bounty.depthDivisor) * ENEMY.bounty.step;
  }

  function creditBounty(amount: number, message = `Enemy destroyed +$${amount} bounty.`): void {
    addCash(amount);
    state.stats.enemiesDestroyed++;
    saveProgress();
    toast(message);
  }

  /** Green sparks plus the hit sting: identical for entities and cocoons. */
  function playHitFeedback(x: number, y: number, dust: number): void {
    spawnDust(x, y, '#92ff55', dust);
    audio.enemyHit();
  }

  /**
   * The one kill path. Active enemies are entities — flagged dead and replicated
   * by id — while dormant cocoons are tiles, so clearing them can expose (and
   * therefore wake) their neighbours. Either way the bounty is paid exactly once,
   * to whichever side landed the killing blow.
   */
  function killEnemy(target: KillTarget, killer: EnemyKiller, bountyMessage?: (bounty: number) => string): void {
    const x = target.kind === 'active' ? target.enemy.x : target.x;
    const y = target.kind === 'active' ? target.enemy.y : target.y;
    const bounty = enemyBounty(y);
    if (target.kind === 'active') {
      target.enemy.alive = false;
      spawnExplosion(x, y);
      if (session.isPairedHost()) {
        session.send({type: 'enemyDead', id: target.enemy.id, bounty, killerIsGuest: killer === 'guest'});
      }
    } else {
      grid.set(x, y, {type: 'air'});
      spawnExplosion(x, y);
    }
    if (killer === 'guest') session.send({type: 'bounty', amount: bounty});
    else creditBounty(bounty, bountyMessage?.(bounty));
    if (target.kind === 'dormant') wakeEnemiesNear(x, y);
  }

  function damageEnemy(enemy: Enemy | undefined, amount = state.player.drill, killer: EnemyKiller = 'host'): void {
    if (!enemy || !enemy.alive) return;
    if (session.isGuestEnemyReplica()) {
      if (session.paired) session.send({type: 'enemyDamage', id: enemy.id, amount, by: 'guest'});
      playHitFeedback(enemy.x, enemy.y, 13);
      return;
    }
    enemy.hp -= amount;
    enemy.flash = 1;
    playHitFeedback(enemy.x, enemy.y, 13);
    if (enemy.hp <= 0) killEnemy({kind: 'active', enemy}, killer);
    else toast(`Enemy hit — ${Math.ceil(enemy.hp)} HP left.`);
  }

  function damageEnemyTile(x: number, y: number): boolean {
    const tile = grid.get(x, y);
    if (tile.type !== 'enemy') return false;
    if (session.isGuestEnemyReplica()) {
      if (session.paired) session.send({type: 'wakeNear', x, y});
      playHitFeedback(x, y, 12);
      return true;
    }
    tile.hp -= state.player.drill;
    playHitFeedback(x, y, 12);
    if (tile.hp <= 0) {
      killEnemy({kind: 'dormant', x, y}, 'host', bounty => `Dormant enemy drilled out +$${bounty} bounty.`);
    } else {
      grid.set(x, y, tile);
      toast(`Drilling enemy cocoon... ${Math.ceil(tile.hp)} HP left`);
    }
    return true;
  }

  function destroyDormantEnemy(x: number, y: number, killer: EnemyKiller): boolean {
    if (session.isGuestEnemyReplica()) return false;
    if (grid.get(x, y).type !== 'enemy') return false;
    killEnemy({kind: 'dormant', x, y}, killer);
    return true;
  }

  /** Ease an enemy's rendered position toward its logical tile and fade its flash. */
  function easeEnemy(e: Enemy): void {
    e.drawX += (e.x - e.drawX) * 0.28;
    e.drawY += (e.y - e.drawY) * 0.28;
    e.flash *= 0.82;
  }

  /** Chew the local hull if this enemy's bite cooldown has elapsed. */
  function biteLocalPlayer(e: Enemy): void {
    if (state.tick - e.biteTick <= enemyBiteCooldown(e.kind)) return;
    e.biteTick = state.tick;
    const bite = enemyBiteDamage(e.kind, e.y);
    damagePlayer(bite);
    spawnDust(state.player.x, state.player.y, '#ff5d45', 10);
    toast(`${getEnemyType(e.kind).name} chewing the hull! -${bite}`);
  }

  // The three per-tick passes are only called while the run is live; the caller
  // owns that gate (the UI phase), so they only rule out a finished run here.
  function update(): void {
    if (session.isGuestEnemyReplica()) return;
    if (state.gameOver && !state.remotePlayers.length) return;
    state.enemies = state.enemies.filter(e => e.alive);
    for (const e of state.enemies) {
      easeEnemy(e);
      const target = findClosestEnemyTarget(e, state.gameOver ? null : state.player, state.remotePlayers);
      if (!target) continue;
      const dist = Math.abs(e.x - target.x) + Math.abs(e.y - target.y);
      if (dist <= 1) {
        if (target.local) biteLocalPlayer(e);
        continue; // Bite from an adjacent tile; never step onto the ship's tile.
      }
      const moveDelay = enemyMoveDelay(e.kind, e.y);
      if (state.tick - e.moveTick < moveDelay || dist > ENEMY_AGGRO_RANGE) continue;
      e.moveTick = state.tick;
      const step = findEnemyPathStep(state.world, e, target, state.enemies.filter(enemy => enemy.alive), ENEMY_AGGRO_RANGE);
      if (step && (step.x !== target.x || step.y !== target.y)) { e.x = step.x; e.y = step.y; }
    }
  }

  function updatePresentation(): void {
    if (state.gameOver) return;
    for (const e of state.enemies) easeEnemy(e);
  }

  function updateBites(): void {
    if (state.gameOver) return;
    if (session.isGuestEnemyReplica() && !session.paired) return;
    const p = state.player;
    for (const e of state.enemies) {
      if (!e.alive || Math.abs(e.x - p.x) + Math.abs(e.y - p.y) > 1) continue;
      biteLocalPlayer(e);
    }
  }

  return {
    enemyAt,
    wakeEnemiesNear,
    resetExposure,
    clearExposure: () => reachableAir.clear(),
    damageEnemy,
    damageEnemyTile,
    destroyDormantEnemy,
    creditBounty: amount => creditBounty(amount),
    applyEntries,
    mergeEntries,
    update,
    updatePresentation,
    updateBites
  };
}
