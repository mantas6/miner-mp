// The container's rules: where a crate may stand, how far its lid opens from,
// and what a transfer across the gap is allowed to move.
//
// The wiring — the bay that pays for a placement, the menu the UI paints — is
// game/cargo-containers.test.ts.

import { describe, expect, it } from 'vitest';
import { explorationIndex } from '../../shared/exploration-codec';
import {
  CARGO_CONTAINER,
  CARGO_CONTAINER_ITEM,
  containerAt,
  containerPlacementRefusal,
  createPlacedContainer,
  isWithinContainerReach,
  reachableContainer,
  storeInContainer,
  takeFromContainer
} from './cargo-container';
import { DYNAMITE_ITEM } from './dynamite';
import {
  INVENTORY_SLOTS,
  addItem,
  countItem,
  countOres,
  createInventory,
  oreItem,
  type Inventory
} from './inventory';
import type { Ore } from './types';

const COPPER: Ore = {name: 'Copper', color: '#c87a3a', value: 8, min: 0, max: 900, chance: 1};
const IRON: Ore = {name: 'Iron', color: '#9aa7b4', value: 12, min: 0, max: 900, chance: 1};

/** A bay holding `count` of one ore. */
function withOre(ore: Ore, count: number, bay: Inventory = createInventory()): Inventory {
  return addItem(bay, oreItem(ore), count)!;
}

describe('placing a container', () => {
  const explored = new Set([explorationIndex(40, 100)]);
  const site = {explored, open: true, containers: []};

  it('accepts explored, cleared ground inside the mine', () => {
    expect(containerPlacementRefusal(40, 100, site)).toBeNull();
  });

  it.each([
    ['off the mine', 40, 2, {...site}, 'underground'],
    ['still under fog', 41, 100, {...site}, 'already explored'],
    ['inside terrain', 40, 100, {...site, open: false}, 'cleared space']
  ])('refuses a tile %s', (_name, x, y, context, fragment) => {
    expect(containerPlacementRefusal(x, y, context)).toContain(fragment);
  });

  it('refuses a tile another crate already stands on', () => {
    const containers = [createPlacedContainer(40, 100)];

    expect(containerPlacementRefusal(40, 100, {...site, containers})).toContain('already stands');
  });

  it('refuses one more than the mine will hold, before anything else', () => {
    const containers = Array.from({length: CARGO_CONTAINER.maxPlaced}, (_, i) => createPlacedContainer(i, 500));

    // Even for a tile that would otherwise be perfectly good.
    expect(containerPlacementRefusal(40, 100, {...site, containers}))
      .toContain(`${CARGO_CONTAINER.maxPlaced} containers`);
  });
});

describe('reaching a container', () => {
  const container = createPlacedContainer(40, 100);

  it.each([
    ['the crate\'s own tile', 40, 100, true],
    ['the tile beside it', 41, 100, true],
    ['the tile diagonally off it', 41, 101, true],
    ['two tiles away', 42, 100, false],
    ['two rows above', 40, 98, false]
  ])('opens from %s: %s', (_name, x, y, expected) => {
    expect(isWithinContainerReach(container, x, y)).toBe(expected);
  });

  it('finds the crate on this tile, and nothing on an empty one', () => {
    const containers = [container, createPlacedContainer(12, 300)];

    expect(containerAt(containers, 12, 300)).toBe(containers[1]);
    expect(containerAt(containers, 13, 300)).toBeNull();
  });

  it('prefers the crate the ship is standing on to the one beside it', () => {
    const beside = createPlacedContainer(40, 100);
    const under = createPlacedContainer(41, 100);

    expect(reachableContainer([beside, under], 41, 100)).toBe(under);
    expect(reachableContainer([beside, under], 90, 100)).toBeNull();
  });
});

describe('storing a stack', () => {
  it('moves the whole stack across in one press', () => {
    const ship = withOre(COPPER, 6);
    const crate = createPlacedContainer(40, 100);

    const result = storeInContainer(ship, crate.inventory, oreItem(COPPER).kind);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.moved).toBe(6);
    expect(result.label).toBe('Copper');
    expect(countOres(result.ship)).toBe(0);
    expect(countOres(result.container)).toBe(6);
  });

  it('stacks onto what the crate already holds', () => {
    const crate = withOre(COPPER, 2);
    const result = storeInContainer(withOre(COPPER, 3), crate, oreItem(COPPER).kind);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(countOres(result.container)).toBe(5);
    // One kind, one slot: a stack that lands on an open one takes no second slot.
    expect(result.container.filter(slot => slot !== null)).toHaveLength(1);
  });

  it('refuses a full crate and changes nothing', () => {
    // Every slot taken by a kind the incoming stack cannot join.
    const crate = [COPPER, IRON, ...Array.from({length: INVENTORY_SLOTS - 2}, (_, i) => ({
      ...COPPER, name: `Filler${i}`
    }))].reduce<Inventory>((bay, ore) => withOre(ore, 1, bay), createInventory());
    const ship = addItem(createInventory(), DYNAMITE_ITEM, 2)!;

    const result = storeInContainer(ship, crate, DYNAMITE_ITEM.kind);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toContain('Container is full');
  });

  it('reports a kind that is not aboard at all', () => {
    const result = storeInContainer(createInventory(), createInventory(), CARGO_CONTAINER_ITEM.kind);

    expect(result).toEqual({ok: false, refusal: 'Nothing of that kind is aboard.'});
  });
});

describe('taking a stack back', () => {
  it('moves equipment across without any cap on it', () => {
    const crate = addItem(createInventory(), DYNAMITE_ITEM, 4)!;

    const result = takeFromContainer(createInventory(), crate, DYNAMITE_ITEM.kind, 0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(countItem(result.ship, DYNAMITE_ITEM.kind)).toBe(4);
    expect(countItem(result.container, DYNAMITE_ITEM.kind)).toBe(0);
  });

  /**
   * The rule that keeps a $200 crate from quietly buying every level of the cargo
   * upgrade: a crate stores ore without limit, but the ship still carries what the
   * bay says it carries.
   */
  it('takes only as much ore as the cargo-bay upgrade still allows', () => {
    const crate = withOre(COPPER, 10);

    const result = takeFromContainer(withOre(IRON, 8), crate, oreItem(COPPER).kind, 10);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.moved).toBe(2);
    expect(countOres(result.ship)).toBe(10);
    // The rest stays where it was, rather than falling on the floor.
    expect(countOres(result.container)).toBe(8);
  });

  it('refuses ore outright once the bay is at its ore limit', () => {
    const result = takeFromContainer(withOre(IRON, 10), withOre(COPPER, 1), oreItem(COPPER).kind, 10);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toContain('Cargo bay is full at 10 ore');
  });

  it('refuses when the bay has no slot left for the kind', () => {
    const ship = [COPPER, IRON, ...Array.from({length: INVENTORY_SLOTS - 2}, (_, i) => ({
      ...COPPER, name: `Filler${i}`
    }))].reduce<Inventory>((bay, ore) => withOre(ore, 1, bay), createInventory());
    const crate = addItem(createInventory(), DYNAMITE_ITEM, 1)!;

    const result = takeFromContainer(ship, crate, DYNAMITE_ITEM.kind, 999);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toContain('Cargo bay is full');
  });

  it('reports a kind the crate does not hold', () => {
    const result = takeFromContainer(createInventory(), createInventory(), DYNAMITE_ITEM.kind, 99);

    expect(result).toEqual({ok: false, refusal: 'Nothing of that kind is in the container.'});
  });
});

describe('a fresh container', () => {
  it('opens with the bay\'s own number of empty slots', () => {
    const crate = createPlacedContainer(40, 100);

    expect(crate.inventory).toHaveLength(CARGO_CONTAINER.slots);
    expect(crate.inventory.every(slot => slot === null)).toBe(true);
  });
});
