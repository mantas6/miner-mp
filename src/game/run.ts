// Run lifecycle: fresh worlds, fresh ships, hull damage, and death.
//
// These transitions all answer one question — what survives an event and what is
// thrown away — so they are grouped here rather than spread across the loop code.
// The rules worth remembering:
//   * hull damage that empties the hull ends the run exactly once;
//   * death keeps cash, upgrades and stats, and loses cargo and position;
//   * an online reset replaces only this miner's ship, never the shared world.

import { STARTING } from '../core/balance';
import { cancelExtraction } from '../core/extraction-phase';
import { createDefaultStats, respawnPlayer } from '../core/state';
import { makeTile } from '../world/world';
import { resetWorldTerrain } from '../world/world-state';
import type { AudioController, GameState } from '../core/types';
import type { EnemySim } from './enemies';
import type { GameInput } from './input';
import type { GameSession } from './session';
import { viewport } from './viewport';

export interface GameRun {
  /** Discard the generated world and deploy a fresh miner (offline reset). */
  generate(): void;
  /** Regenerate terrain in place, keeping all player progress. */
  clearWorldRuntime(): void;
  /** Redeploy the ship; `full` also wipes cash, upgrades, stats, and fog. */
  resetPlayer(full?: boolean): void;
  /** R or a tap after death: a replacement ship, or a whole new world offline. */
  restartGame(): void;
  /** End the run once, banking the death and telling the peer. */
  gameOver(message?: string): void;
  /** Apply hull damage; an emptied hull ends the run. */
  damage(amount: number): void;
}

export interface GameRunDeps {
  state: GameState;
  session: GameSession;
  audio: AudioController;
  /**
   * Resolved lazily: both the enemy simulation and the keyboard are constructed
   * after the run module, because they depend on it.
   */
  enemies(): EnemySim;
  input(): GameInput;
  toast(message: string): void;
  saveProgress(): void;
  /** Reveal the sensor footprint around the ship; `broadcast` shares it. */
  revealAtPlayer(broadcast?: boolean): void;
  spawnExplosion(x: number, y: number): void;
  /** Drop the whole terrain cache (world replaced wholesale). */
  invalidateTerrain(): void;
  /** Drop the whole fog cache (exploration replaced wholesale). */
  invalidateFog(): void;
}

export function createRun(deps: GameRunDeps): GameRun {
  const {state, session, audio, toast, saveProgress, spawnExplosion} = deps;

  function resetPlayer(full = true): void {
    state.extractionPhase = cancelExtraction();
    state.teleportEffect = null;
    state.teleportReturnPosition = null;
    state.input.gunArmed = false;
    if (full) {
      state.cash = STARTING.cash;
      Object.assign(state.player, {
        fuelMax: STARTING.fuelMax,
        hullMax: STARTING.hullMax,
        cargoMax: STARTING.cargoMax,
        drill: STARTING.drill,
        visibility: STARTING.visibility,
        dynamite: STARTING.dynamite,
        teleporters: STARTING.teleporters,
        gunOwned: STARTING.gunOwned,
        bullets: STARTING.bullets
      });
      state.exploredTiles.clear();
      state.stats = createDefaultStats();
      saveProgress();
      deps.invalidateFog();
    }
    respawnPlayer(state.player);
    deps.revealAtPlayer();
    state.camX = Math.max(0, state.player.x - Math.floor(viewport.tilesX/2));
    state.camY = 0;
    state.particles.length = 0;
    state.gameOver = false;
    toast('Fresh drill deployed.');
  }

  function generate(): void {
    state.enemies = [];
    state.world = [];
    session.resetTileDiff();
    resetPlayer(false);
    deps.enemies().resetExposure();
  }

  function clearWorldRuntime(): void {
    resetWorldTerrain(state, makeTile);
    session.resetTileDiff();
    deps.enemies().clearExposure();
    state.enemyIdCounter = 1;
    deps.input().clearKeys();
    deps.invalidateTerrain();
    deps.invalidateFog();
  }

  function restartGame(): void {
    const died = state.gameOver;
    deps.input().reset();
    // An online death/reset only replaces this miner's ship; the shared world
    // and host-owned enemy list must remain intact for the other player.
    if (state.connected) resetPlayer(false);
    else generate();
    if (died) toast('Replacement ship deployed. Cash and upgrades kept; cargo lost.');
    if (died && state.connected && session.paired) {
      session.send({type:'respawned', x:state.player.x, y:state.player.y});
    }
  }

  function gameOver(message = 'Game over. Tap anywhere or press R to restart.'): void {
    if (state.gameOver) return;
    state.gameOver = true;
    state.input.gunArmed = false;
    state.teleportEffect = null;
    state.extractionPhase = cancelExtraction();
    state.stats.deaths++;
    saveProgress();
    if (state.connected && session.paired) session.send({type:'died'});
    toast(message);
    spawnExplosion(state.player.x, state.player.y);
    audio.alarm();
    audio.bump();
  }

  function damage(amount: number): void {
    const p = state.player;
    p.hull = Math.max(0, p.hull - amount);
    if (amount > 1) audio.bump();
    if (p.hull <= 0) gameOver('Ship destroyed. Tap anywhere to restart.');
  }

  return {generate, clearWorldRuntime, resetPlayer, restartGame, gameOver, damage};
}
