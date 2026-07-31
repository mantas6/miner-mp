import { placeAtSurfaceSpawn } from '../core/state';
import type { GameState } from '../core/types';

export const WORLD_STATE_RESET_CONFIRMATION = 'Reset world state for everyone? This permanently regenerates all terrain, restores dug-out blocks and world enemies, and clears explored fog. Player cash, upgrades, inventory, stats, settings, and ship condition are preserved.';

export function confirmWorldStateReset(confirmReset: (message: string) => boolean): boolean {
  return confirmReset(WORLD_STATE_RESET_CONFIRMATION);
}

/**
 * Regenerate world-owned state while preserving every player-owned value.
 *
 * Clearing `world` is all it takes: tiles are generated lazily on first access.
 */
export function resetWorldTerrain(state: GameState): void {
  state.world = [];
  state.enemies = [];
  state.exploredTiles.clear();
  state.particles = [];
  state.extractionPhase = 'none';
  state.teleportEffect = null;
  state.teleportReturnPosition = null;
  state.gameOver = false;
  state.input.gunArmed = false;
  placeAtSurfaceSpawn(state.player);
  state.camX = Math.max(0, state.player.x - 7);
  state.camY = 0;
}
