// Deployed oil extractors: arming, placing, and running them.
//
// `core/oil-extractor.ts` holds the rules (where one may stand, how near a patch
// it must be, how fast it draws and pumps); this is the part of the feature that
// touches the running game — the cargo bay it is taken out of, the oil patch it
// drains, the fuel it pours into the ship, the toasts it writes, and the save it
// schedules.
//
// Placement is the same two-press gesture the scanner and the container use: the
// inventory slot arms it, the mine takes it. That state lives here rather than in
// `state.input` because it belongs to the device rather than to the keyboard, and
// because it must not survive a reload — an armed pointer restored from a save
// would swallow the first click of the next run.

import { MAX_WORLD_ROW, SURFACE_HEIGHT, WORLD_W } from '../../shared/constants';
import { countItem, removeItem } from '../core/inventory';
import {
  OIL_EXTRACTOR,
  OIL_EXTRACTOR_ITEM,
  createOilExtractor,
  findNearbyOilPatch,
  oilExtractorPlacementRefusal,
  tickOilExtractor
} from '../core/oil-extractor';
import type { AudioController, GameState, Tile } from '../core/types';
import type { WorldGrid } from './world-grid';

export interface OilExtractorSim {
  /** Whether a carried extractor is waiting for the player to pick a tile. */
  readonly armed: boolean;
  /** Inventory-slot press: arm placement, or stand the armed one down. */
  toggleArmed(): void;
  /**
   * Disarm without complaint (Escape, an overlay opening, a lost ship). Reports
   * whether anything was armed, so a key handler knows if it consumed the press.
   */
  disarm(): boolean;
  /** A press on the mine while armed. Reports whether an extractor was deployed. */
  placeAt(x: number, y: number): boolean;
  /** One fixed 60 Hz step of every deployed extractor. */
  tick(): void;
}

export interface OilExtractorDeps {
  state: GameState;
  grid: WorldGrid;
  audio: AudioController;
  toast(message: string): void;
  saveProgress(): void;
  /** Paint the armed state onto the inventory slot. */
  setArmedUi(armed: boolean): void;
}

/** Whether this tile holds an oil patch that still has oil to give. */
function isLiveOilPatch(tile: Tile): boolean {
  return tile.type === 'oil' && !tile.depleted;
}

export function createOilExtractors(deps: OilExtractorDeps): OilExtractorSim {
  const {state, grid, audio, toast, saveProgress} = deps;
  let armed = false;

  function setArmed(next: boolean): void {
    if (armed === next) return;
    armed = next;
    deps.setArmedUi(next);
  }

  function disarm(): boolean {
    if (!armed) return false;
    setArmed(false);
    return true;
  }

  function toggleArmed(): void {
    if (armed) {
      setArmed(false);
      return toast('Oil extractor placement cancelled.');
    }
    if (state.gameOver) return;
    if (countItem(state.player.inventory, OIL_EXTRACTOR_ITEM.kind) <= 0) {
      audio.alarm();
      return toast('No oil extractor aboard. Buy one at the surface depot.');
    }
    if (state.oilExtractors.length >= OIL_EXTRACTOR.maxPlaced) {
      audio.alarm();
      return toast(`Only ${OIL_EXTRACTOR.maxPlaced} oil extractors can stand in the mine at once.`);
    }
    setArmed(true);
    toast('Extractor ready — press a mapped tile beside an oil patch. Escape cancels.');
  }

  function placeAt(x: number, y: number): boolean {
    if (!armed) return false;
    // The bay can empty between arming and pressing — a reset, a lost ship — and
    // an extractor deployed out of an empty bay would be one the player never bought.
    if (state.gameOver || countItem(state.player.inventory, OIL_EXTRACTOR_ITEM.kind) <= 0) {
      setArmed(false);
      return false;
    }
    // Bounds first, so a press far outside the mine never generates a row chunk
    // just to find out the tile was never a candidate.
    const inBounds = x >= 0 && x < WORLD_W && y >= SURFACE_HEIGHT && y <= MAX_WORLD_ROW;
    const patch = inBounds
      ? findNearbyOilPatch(x, y, (px, py) => isLiveOilPatch(grid.get(px, py)))
      : null;
    const refusal = oilExtractorPlacementRefusal(x, y, {
      explored: state.exploredTiles,
      open: inBounds && grid.get(x, y).type === 'air',
      extractors: state.oilExtractors,
      nearOilPatch: patch !== null
    });
    if (refusal) {
      audio.alarm();
      toast(refusal);
      return false;
    }
    state.player.inventory = removeItem(state.player.inventory, OIL_EXTRACTOR_ITEM.kind);
    state.oilExtractors.push(createOilExtractor(x, y, patch!.x, patch!.y));
    setArmed(false);
    saveProgress();
    audio.blip(240, .12, 'sawtooth', .05, -60);
    toast('Oil extractor deployed. Park the ship beside it to draw fuel from the patch.');
    return true;
  }

  function tick(): void {
    // A lost ship cannot deploy anything, and the armed slot would otherwise
    // still look live behind the game-over screen.
    if (state.gameOver) disarm();
    const extractors = state.oilExtractors;
    if (extractors.length === 0) return;
    const p = state.player;
    let depletedCount = 0;
    for (const extractor of extractors) {
      const patchTile = grid.get(extractor.patchX, extractor.patchY);
      const patchAlive = isLiveOilPatch(patchTile);
      const result = tickOilExtractor(extractor, {
        patchAlive,
        shipWithinReach: Math.max(Math.abs(extractor.x - p.x), Math.abs(extractor.y - p.y)) <= OIL_EXTRACTOR.reach,
        shipFuel: p.fuel,
        shipFuelMax: p.fuelMax
      });
      // Fuel is never persisted — a resumed run refills the tank anyway — so a
      // topped-off tank needs no save. Only a drained patch does, because that
      // depletion is a tile mutation the world diff has to remember.
      if (result.drawFuel > 0) p.fuel = Math.min(p.fuelMax, p.fuel + result.drawFuel);
      if (result.justDepleted && patchAlive) {
        grid.set(extractor.patchX, extractor.patchY, {type: 'oil', depleted: true});
        depletedCount++;
      }
    }
    if (depletedCount > 0) {
      for (let announced = 0; announced < depletedCount; announced++) {
        toast('Oil patch drained dry — the extractor beside it has gone inert.');
      }
      saveProgress();
    }
  }

  return {
    get armed() {
      return armed;
    },
    toggleArmed,
    disarm,
    placeAt,
    tick
  };
}
