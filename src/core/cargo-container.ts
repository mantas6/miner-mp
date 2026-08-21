// The cargo container: a second cargo bay, left behind in the mine.
//
// Bought at the depot like the other consumables, carried in the bay like them,
// and dropped onto a tile like the scanner and the stick of dynamite — but unlike
// any of those it is never spent. What it buys is slots: five more of them,
// stacking by exactly the rules `inventory.ts` already enforces, parked wherever
// the player chose to put them.
//
// So there is no second inventory implementation here. A placed container *is* an
// `Inventory`, and every question about it — is there room, which stack is open,
// what happens when a stack empties — is answered by the same helpers the ship's
// bay uses. All this module adds is the two things a crate has and a bay does not:
// a position in the world, and a transfer across the gap between the two.
//
// One rule survives the transfer: `cargoMax`. Ore may be stored without limit,
// because a crate is not a ship, but taking it back aboard is still capped by the
// cargo-bay upgrade — otherwise a $200 crate would quietly buy every level of it.
//
// Everything here is pure and DOM-free.

import {
  INVENTORY_SLOTS,
  addItem,
  countOres,
  createInventory,
  findStack,
  isOreKind,
  removeItem,
  type Inventory,
  type InventoryItem,
  type InventoryItemKind
} from './inventory';
import { placementRefusal, type PlacementCopy } from './placement';

export const CARGO_CONTAINER = Object.freeze({
  /** Slots inside one crate. The bay's own count: one is a spare of the other. */
  slots: INVENTORY_SLOTS,
  /**
   * Crates that may stand in the mine at once. A soft cap, like the scanner's: it
   * keeps a save bounded, and a mine wallpapered with storage is a map the player
   * can no longer keep in their head.
   */
  maxPlaced: 6,
  /**
   * How far the lid opens from. One tile in any direction — Chebyshev, so the
   * diagonals count — plus the crate's own tile, which the ship can fly onto.
   */
  reach: 1
});

/** The stackable item the depot sells and the cargo bay carries. */
export const CARGO_CONTAINER_ITEM: InventoryItem = {
  kind: 'container',
  label: 'Container',
  color: '#c8912f',
  // Depot equipment is not cargo, so the sell-everything button never prices it.
  value: 0
};

/** One crate standing in the mine, and everything inside it. */
export interface PlacedContainer {
  x: number;
  y: number;
  /** Its own slots. Immutable, like the ship's: a transfer replaces the array. */
  inventory: Inventory;
}

export function createPlacedContainer(x: number, y: number): PlacedContainer {
  return {x, y, inventory: createInventory(CARGO_CONTAINER.slots)};
}

/** The crate standing on this tile, or `null`. */
export function containerAt(containers: readonly PlacedContainer[], x: number, y: number): PlacedContainer | null {
  return containers.find(container => container.x === x && container.y === y) ?? null;
}

/** Whether a ship at `x`/`y` is close enough to open this crate. */
export function isWithinContainerReach(container: PlacedContainer, x: number, y: number): boolean {
  return Math.max(Math.abs(container.x - x), Math.abs(container.y - y)) <= CARGO_CONTAINER.reach;
}

/**
 * The crate a ship at `x`/`y` would open with no tile named — the keyboard's
 * answer. The one it is standing on wins, then the nearest neighbour, so a crate
 * flown onto is never passed over for one beside it.
 */
export function reachableContainer(containers: readonly PlacedContainer[], x: number, y: number): PlacedContainer | null {
  let best: PlacedContainer | null = null;
  let bestDistance = Infinity;
  for (const container of containers) {
    if (!isWithinContainerReach(container, x, y)) continue;
    const distance = Math.abs(container.x - x) + Math.abs(container.y - y);
    if (distance >= bestDistance) continue;
    best = container;
    bestDistance = distance;
  }
  return best;
}

export interface ContainerPlacementContext {
  explored: ReadonlySet<number>;
  /** Whether the target tile is open space the crate can be dropped into. */
  open: boolean;
  containers: readonly PlacedContainer[];
}

/** How a container words each of the shared placement refusals. */
const CONTAINER_PLACEMENT_COPY: PlacementCopy = {
  full: `Only ${CARGO_CONTAINER.maxPlaced} containers can stand in the mine at once.`,
  offMine: 'Containers are set down underground, inside the mine.',
  unexplored: 'Set the container down on a tile you have already explored.',
  blocked: 'Set the container down in cleared space, not inside terrain.',
  occupied: 'A container already stands on that tile.'
};

/** Why this tile cannot take a crate, or `null` when it can. */
export function containerPlacementRefusal(x: number, y: number, context: ContainerPlacementContext): string | null {
  return placementRefusal(x, y, {
    explored: context.explored,
    open: context.open,
    occupied: context.containers.some(container => container.x === x && container.y === y),
    full: context.containers.length >= CARGO_CONTAINER.maxPlaced
  }, CONTAINER_PLACEMENT_COPY);
}

/**
 * The outcome of one press on a stack in the transfer menu: the two inventories
 * as they now stand, or the line to show the player instead.
 */
export type ContainerTransfer =
  | {ok: true; ship: Inventory; container: Inventory; moved: number; label: string}
  | {ok: false; refusal: string};

/**
 * Move a whole stack of `kind` from `from` into `to`, up to `limit` units.
 * `null` when the stack is not there, or when the destination has neither an
 * open stack of that kind nor a free slot.
 */
function moveStack(
  from: Inventory,
  to: Inventory,
  kind: InventoryItemKind,
  limit: number
): {from: Inventory; to: Inventory; moved: number; item: InventoryItem} | null {
  const stack = findStack(from, kind);
  if (!stack) return null;
  const moved = Math.min(stack.count, limit);
  if (moved <= 0) return null;
  const loaded = addItem(to, stack.item, moved);
  if (!loaded) return null;
  return {from: removeItem(from, kind, moved), to: loaded, moved, item: stack.item};
}

/**
 * Bay → crate. The whole stack goes in one press: a menu that moved one unit per
 * click would ask for forty presses to empty a full load of ore.
 */
export function storeInContainer(ship: Inventory, container: Inventory, kind: InventoryItemKind): ContainerTransfer {
  const moved = moveStack(ship, container, kind, Infinity);
  if (!moved) {
    return findStack(ship, kind)
      ? {ok: false, refusal: 'Container is full. Take something out before storing more.'}
      : {ok: false, refusal: 'Nothing of that kind is aboard.'};
  }
  return {ok: true, ship: moved.from, container: moved.to, moved: moved.moved, label: moved.item.label};
}

/**
 * Crate → bay, capped by the cargo-bay upgrade for ore. A partial load is a
 * success: taking four of the six ore a crate holds is what a ship one slot short
 * of `cargoMax` should be able to do, and the rest stays where it was.
 */
export function takeFromContainer(
  ship: Inventory,
  container: Inventory,
  kind: InventoryItemKind,
  cargoMax: number
): ContainerTransfer {
  const room = isOreKind(kind) ? cargoMax - countOres(ship) : Infinity;
  if (room <= 0) {
    return {ok: false, refusal: `Cargo bay is full at ${cargoMax} ore. Sell some before taking more aboard.`};
  }
  const moved = moveStack(container, ship, kind, room);
  if (!moved) {
    return findStack(container, kind)
      ? {ok: false, refusal: 'Cargo bay is full. Free a slot before taking that aboard.'}
      : {ok: false, refusal: 'Nothing of that kind is in the container.'};
  }
  return {ok: true, ship: moved.to, container: moved.from, moved: moved.moved, label: moved.item.label};
}
