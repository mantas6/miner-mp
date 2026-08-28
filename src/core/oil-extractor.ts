// The deployable oil extractor: the depot's sixth placeable.
//
// Bought at the depot like the other consumables, carried in the bay like them,
// and dropped onto a tile like the scanner and the cargo container — but unlike
// any of those it may only be set down *beside an oil patch*, the indestructible
// source tile `world.ts` scatters through the mine. Once placed it draws oil out
// of that patch over time into a small buffer, and tops the ship's tank off from
// that buffer whenever the ship is parked alongside it. The patch is finite: once
// the extractor has pulled `patchCapacity` units out of it, the patch is drained
// dry and the extractor goes inert.
//
// Everything here is pure and DOM-free. A device is five numbers — where it sits,
// which patch tile it claimed, how much oil it is holding, and how much it has
// drawn out of the patch so far — because the interesting decisions (is the patch
// gone, is the ship close enough, how much fuel fits) are answered against inputs
// the running game hands in, exactly the way the scanner derives its work from the
// shared explored set.

import type { InventoryItem } from './inventory';
import { placementRefusal, type PlacementCopy } from './placement';

export const OIL_EXTRACTOR = Object.freeze({
  /**
   * How far the placement tile may sit from an oil patch. One tile in any
   * direction — Chebyshev, so the diagonals count — so the extractor drops onto
   * cleared ground the player dug out right beside the patch.
   */
  patchRadius: 1,
  /**
   * How close the ship must be to be refuelled. One tile in any direction plus
   * the extractor's own tile, which the ship can fly onto — the same reach the
   * cargo container's lid opens from.
   */
  reach: 1,
  /**
   * Total oil units one patch yields before it runs dry. Measured in fuel units,
   * so a fresh patch is worth five full starting tanks — generous, because it is
   * a testing feature and because a patch is a fixed one-time payout.
   */
  patchCapacity: 500,
  /** Oil units drawn out of the patch into the buffer each 60 Hz step. */
  ratePerTick: 0.25,
  /** Buffer size: how much oil the extractor holds before it idles, waiting to pump. */
  bufferMax: 100,
  /** Oil units the buffer pumps into an adjacent ship's tank each 60 Hz step. */
  refuelRatePerTick: 1,
  /**
   * Extractors that may stand in the mine at once. A soft cap, like the scanner's
   * and the crate's: it keeps a save bounded and the map legible.
   */
  maxPlaced: 6
});

/** The stackable item the depot sells and the cargo bay carries. */
export const OIL_EXTRACTOR_ITEM: InventoryItem = {
  kind: 'extractor',
  label: 'Extractor',
  color: '#3f6d7a',
  // Depot equipment is not cargo, so the sell-everything button never prices it.
  value: 0
};

/** One deployed extractor and the patch it claimed. */
export interface OilExtractor {
  x: number;
  y: number;
  /** The oil patch tile this extractor draws from. */
  patchX: number;
  patchY: number;
  /** Oil held, waiting to be pumped into the ship. Never above `bufferMax`. */
  buffer: number;
  /** Oil already drawn out of the patch. At `patchCapacity` the patch is dry. */
  extracted: number;
}

export function createOilExtractor(x: number, y: number, patchX: number, patchY: number): OilExtractor {
  return {x, y, patchX, patchY, buffer: 0, extracted: 0};
}

/** The extractor standing on this tile, or `null`. */
export function oilExtractorAt(extractors: readonly OilExtractor[], x: number, y: number): OilExtractor | null {
  return extractors.find(extractor => extractor.x === x && extractor.y === y) ?? null;
}

/** Whether a ship at `x`/`y` is close enough to be refuelled by this extractor. */
export function isWithinExtractorReach(extractor: OilExtractor, x: number, y: number): boolean {
  return Math.max(Math.abs(extractor.x - x), Math.abs(extractor.y - y)) <= OIL_EXTRACTOR.reach;
}

/**
 * The nearest oil patch within `patchRadius` of a placement tile, or `null` when
 * there is none in reach. `isOilPatch` is injected — the running game answers it
 * off the live grid, a test off a fixture — so this module stays terrain-free.
 * The extractor's own tile is skipped: it is cleared air, never a patch.
 */
export function findNearbyOilPatch(
  x: number,
  y: number,
  isOilPatch: (x: number, y: number) => boolean
): {x: number; y: number} | null {
  let best: {x: number; y: number} | null = null;
  let bestDistance = Infinity;
  for (let dy = -OIL_EXTRACTOR.patchRadius; dy <= OIL_EXTRACTOR.patchRadius; dy++) {
    for (let dx = -OIL_EXTRACTOR.patchRadius; dx <= OIL_EXTRACTOR.patchRadius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const px = x + dx, py = y + dy;
      if (!isOilPatch(px, py)) continue;
      const distance = Math.abs(dx) + Math.abs(dy);
      if (distance >= bestDistance) continue;
      best = {x: px, y: py};
      bestDistance = distance;
    }
  }
  return best;
}

export interface OilExtractorPlacementContext {
  explored: ReadonlySet<number>;
  /** Whether the target tile is open space the device can be dropped into. */
  open: boolean;
  extractors: readonly OilExtractor[];
  /** Whether an undrained oil patch sits within `patchRadius` of the tile. */
  nearOilPatch: boolean;
}

/** How an extractor words each of the shared placement refusals. */
const OIL_EXTRACTOR_PLACEMENT_COPY: PlacementCopy = {
  full: `Only ${OIL_EXTRACTOR.maxPlaced} oil extractors can stand in the mine at once.`,
  offMine: 'Oil extractors deploy underground, inside the mine.',
  unexplored: 'Deploy the extractor on a tile you have already explored.',
  blocked: 'Deploy the extractor in cleared space, not inside terrain.',
  occupied: 'An oil extractor already stands on that tile.'
};

/** The refusal shown when a tile passes every other check but has no patch beside it. */
export const OIL_EXTRACTOR_NO_PATCH_REFUSAL = 'Set the extractor down beside an oil patch.';

/** Why this tile cannot take an extractor, or `null` when it can. */
export function oilExtractorPlacementRefusal(x: number, y: number, context: OilExtractorPlacementContext): string | null {
  const base = placementRefusal(x, y, {
    explored: context.explored,
    open: context.open,
    occupied: context.extractors.some(extractor => extractor.x === x && extractor.y === y),
    full: context.extractors.length >= OIL_EXTRACTOR.maxPlaced
  }, OIL_EXTRACTOR_PLACEMENT_COPY);
  if (base) return base;
  if (!context.nearOilPatch) return OIL_EXTRACTOR_NO_PATCH_REFUSAL;
  return null;
}

/** Whether an extractor's claimed patch is drained dry (or gone from the world). */
export function isPatchDepleted(extractor: OilExtractor, patchAlive: boolean): boolean {
  return !patchAlive || extractor.extracted >= OIL_EXTRACTOR.patchCapacity;
}

export interface OilExtractorTickInput {
  /** Whether the claimed patch tile still exists and has not been drained yet. */
  patchAlive: boolean;
  /** Whether the ship is close enough to be refuelled this step. */
  shipWithinReach: boolean;
  shipFuel: number;
  shipFuelMax: number;
}

export interface OilExtractorTickResult {
  /** Fuel units to add to the ship's tank this step. */
  drawFuel: number;
  /** The patch reached `patchCapacity` on this step: drain the tile once. */
  justDepleted: boolean;
}

/**
 * One fixed 60 Hz step of a single extractor. Pulls oil out of the patch into the
 * buffer while the patch lasts, then pumps the buffer into the ship's tank while
 * the ship is alongside. Mutates `extractor.buffer`/`extractor.extracted` in
 * place — this runs for every deployed extractor on every step, and the
 * alternative is a fresh object 60 times a second per device.
 */
export function tickOilExtractor(extractor: OilExtractor, input: OilExtractorTickInput): OilExtractorTickResult {
  let justDepleted = false;
  const draining = input.patchAlive && extractor.extracted < OIL_EXTRACTOR.patchCapacity;
  if (draining) {
    const room = OIL_EXTRACTOR.bufferMax - extractor.buffer;
    const remaining = OIL_EXTRACTOR.patchCapacity - extractor.extracted;
    const pumped = Math.max(0, Math.min(OIL_EXTRACTOR.ratePerTick, room, remaining));
    extractor.buffer += pumped;
    extractor.extracted += pumped;
    if (extractor.extracted >= OIL_EXTRACTOR.patchCapacity) justDepleted = true;
  }
  let drawFuel = 0;
  if (input.shipWithinReach && extractor.buffer > 0 && input.shipFuel < input.shipFuelMax) {
    drawFuel = Math.min(extractor.buffer, input.shipFuelMax - input.shipFuel, OIL_EXTRACTOR.refuelRatePerTick);
    extractor.buffer -= drawFuel;
  }
  return {drawFuel, justDepleted};
}
