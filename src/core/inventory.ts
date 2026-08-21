// The ship's slot-based inventory. Pure, DOM-free, and immutable.
//
// The bay is a fixed row of slots, each either empty or holding one stack of a
// single item kind. Items of the same kind always land in the stack that is
// already open for them, so a kind never occupies two slots and "is there room"
// is a question about one kind at a time, not about free slots alone.
//
// Every helper returns a new inventory rather than mutating the one it was given.
// That is what makes the 60 Hz HUD sync cheap: the array's identity changes
// exactly when its contents do, so the UI can skip rebuilding the panel by
// comparing one reference.
//
// Ores are the only kind stored here today. Their stacks carry the ore's own
// label, colour and unit price, so selling and the cargo readouts never have to
// look a name up in a table that a co-op peer's world might not agree with.
// `InventoryItemKind` is a namespaced string union, so equipment kinds —
// 'dynamite', 'scanner', 'gun' — sit beside the ore stacks without disturbing
// anything below.

import type { Ore } from './types';

/** Slots a fresh cargo bay ships with. */
export const INVENTORY_SLOTS = 5;

/** Namespaces one ore type's stack; the suffix is the ore's own name. */
const ORE_KIND_PREFIX = 'ore:';

/** One ore type's stack key, e.g. `ore:Copper`. */
export type OreKind = `${typeof ORE_KIND_PREFIX}${string}`;

/** Everything the bay can hold. Extend the union as kinds move in. */
export type InventoryItemKind = OreKind | 'dynamite' | 'scanner' | 'gun';

/** What one unit of a stack is: its identity and how it is shown and priced. */
export interface InventoryItem {
  kind: InventoryItemKind;
  /** Player-facing name of the item, e.g. `Copper`. */
  label: string;
  /** Swatch colour, matching the tile the item came out of. */
  color: string;
  /** Depot price of a single unit; zero for items that are not sold. */
  value: number;
}

export interface InventoryStack {
  kind: InventoryItemKind;
  /** Units held. Always at least 1; an emptied stack becomes `null`. */
  count: number;
  item: InventoryItem;
}

/** One slot: a stack, or nothing. */
export type InventorySlot = InventoryStack | null;

/** The whole bay. Its length is the slot count and never changes. */
export type Inventory = readonly InventorySlot[];

export function createInventory(slots: number = INVENTORY_SLOTS): Inventory {
  return Array.from({length: Math.max(0, slots)}, () => null);
}

export function oreKind(name: string): OreKind {
  return `${ORE_KIND_PREFIX}${name}`;
}

export function isOreKind(kind: InventoryItemKind): kind is OreKind {
  return kind.startsWith(ORE_KIND_PREFIX);
}

/** The stackable item one mined ore becomes. */
export function oreItem(ore: Ore): InventoryItem {
  return {kind: oreKind(ore.name), label: ore.name, color: ore.color, value: ore.value};
}

/** The occupied slots, in slot order. */
export function inventoryStacks(inventory: Inventory): InventoryStack[] {
  return inventory.filter((slot): slot is InventoryStack => slot !== null);
}

export function findStack(inventory: Inventory, kind: InventoryItemKind): InventoryStack | null {
  return inventory.find(slot => slot?.kind === kind) ?? null;
}

export function countItem(inventory: Inventory, kind: InventoryItemKind): number {
  return findStack(inventory, kind)?.count ?? 0;
}

/** Units held across every slot. */
export function totalItems(inventory: Inventory): number {
  return inventory.reduce((sum, slot) => sum + (slot?.count ?? 0), 0);
}

/** Whether this kind has a stack open, or an empty slot to open one in. */
export function hasRoomFor(inventory: Inventory, kind: InventoryItemKind): boolean {
  return inventory.some(slot => slot === null || slot.kind === kind);
}

/** The bay cannot take another unit of this kind: no stack and no free slot. */
export function isFullFor(inventory: Inventory, kind: InventoryItemKind): boolean {
  return !hasRoomFor(inventory, kind);
}

/**
 * Stack `count` units of `item`, in its open stack or the first empty slot.
 * Returns `null` — and changes nothing — when neither exists.
 */
export function addItem(inventory: Inventory, item: InventoryItem, count = 1): Inventory | null {
  if (count <= 0) return inventory;
  const existing = inventory.findIndex(slot => slot?.kind === item.kind);
  const index = existing === -1 ? inventory.indexOf(null) : existing;
  if (index === -1) return null;
  const next = [...inventory];
  const slot = next[index];
  next[index] = slot ? {...slot, count: slot.count + count} : {kind: item.kind, count, item};
  return next;
}

/** Take up to `count` units out; a stack drained to zero frees its slot. */
export function removeItem(inventory: Inventory, kind: InventoryItemKind, count = 1): Inventory {
  const index = inventory.findIndex(slot => slot?.kind === kind);
  if (index === -1 || count <= 0) return inventory;
  const slot = inventory[index]!;
  const next = [...inventory];
  next[index] = slot.count > count ? {...slot, count: slot.count - count} : null;
  return next;
}

/** Empty every slot whose kind matches. */
export function removeMatching(inventory: Inventory, matches: (kind: InventoryItemKind) => boolean): Inventory {
  if (!inventory.some(slot => slot !== null && matches(slot.kind))) return inventory;
  return inventory.map(slot => slot !== null && matches(slot.kind) ? null : slot);
}

// --- Ore, the one kind the bay holds today ---------------------------------

export function oreStacks(inventory: Inventory): InventoryStack[] {
  return inventoryStacks(inventory).filter(stack => isOreKind(stack.kind));
}

/** Ore units aboard, which is what the cargo gauge and `cargoMax` count. */
export function countOres(inventory: Inventory): number {
  return oreStacks(inventory).reduce((sum, stack) => sum + stack.count, 0);
}

/** Sell-everything: the ore stacks leave, anything else stays put. */
export function removeOres(inventory: Inventory): Inventory {
  return removeMatching(inventory, isOreKind);
}

/**
 * Load one mined ore. It needs a slot *and* room under the cargo-bay upgrade,
 * so the `cargoMax` purchase keeps meaning what it always did. Returns `null`
 * when either limit refuses it.
 */
export function addOre(inventory: Inventory, ore: Ore, cargoMax: number): Inventory | null {
  if (countOres(inventory) >= cargoMax) return null;
  return addItem(inventory, oreItem(ore));
}
