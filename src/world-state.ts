import { START_Y, WORLD_H, WORLD_W } from './constants';
import type { GameState, Tile } from './types';
import type { TileDiffEntry } from './net-protocol';

export const WORLD_STATE_RESET_CONFIRMATION = 'Reset world state for everyone? This permanently regenerates all terrain, restores dug-out blocks and world enemies, and clears explored fog. Player cash, upgrades, inventory, stats, settings, and ship condition are preserved.';

export function confirmWorldStateReset(confirmReset: (message: string) => boolean): boolean {
  return confirmReset(WORLD_STATE_RESET_CONFIRMATION);
}

export function generatedNonAirTiles(world: Tile[][]): TileDiffEntry[] {
  const tiles: TileDiffEntry[] = [];
  for (let y = 0; y < world.length; y++) {
    for (let x = 0; x < world[y].length; x++) {
      if (world[y][x].type !== 'air') tiles.push({ x, y, tile: world[y][x] });
    }
  }
  return tiles;
}

/** Regenerate world-owned state while preserving every player-owned value. */
export function resetWorldTerrain(state: GameState, makeTile: (x: number, y: number) => Tile): void {
  state.world = Array.from({ length: WORLD_H }, (_, y) =>
    Array.from({ length: WORLD_W }, (_, x) => makeTile(x, y))
  );
  state.enemies = [];
  state.exploredTiles.clear();
  state.particles = [];
  state.extractionPhase = 'none';
  state.teleportEffect = null;
  state.teleportReturnPosition = null;
  state.gameOver = false;
  state.input.gunArmed = false;
  state.player.x = Math.floor(WORLD_W / 2);
  state.player.y = START_Y;
  state.player.drawX = state.player.x;
  state.player.drawY = START_Y;
  state.camX = Math.max(0, state.player.x - 7);
  state.camY = 0;
}
