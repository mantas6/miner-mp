import { describe, expect, it } from 'vitest';
import { ORES } from '../../shared/constants';
import {
  INVENTORY_SLOTS,
  addItem,
  addOre,
  countItem,
  countOres,
  createInventory,
  findStack,
  hasRoomFor,
  inventoryStacks,
  isFullFor,
  isOreKind,
  oreItem,
  oreKind,
  oreStacks,
  removeItem,
  removeOres,
  totalItems,
  type Inventory
} from './inventory';

const coal = ORES[0];
const copper = ORES[1];
const silver = ORES[2];

/** Fill the bay with one unit of each of the first `count` ore types. */
function withOreTypes(count: number, cargoMax = 99): Inventory {
  let inventory = createInventory();
  for (const ore of ORES.slice(0, count)) inventory = addOre(inventory, ore, cargoMax)!;
  return inventory;
}

describe('a fresh inventory', () => {
  it('has five empty slots', () => {
    const inventory = createInventory();

    expect(INVENTORY_SLOTS).toBe(5);
    expect(inventory).toHaveLength(5);
    expect(inventory.every(slot => slot === null)).toBe(true);
    expect(totalItems(inventory)).toBe(0);
    expect(inventoryStacks(inventory)).toEqual([]);
  });

  it('takes the slot count it is asked for', () => {
    expect(createInventory(2)).toHaveLength(2);
    expect(createInventory(0)).toHaveLength(0);
  });
});

describe('stacking', () => {
  it('puts the first unit of a kind in the first empty slot', () => {
    const inventory = addItem(createInventory(), oreItem(coal))!;

    expect(inventory[0]).toEqual({kind: oreKind('Coal'), count: 1, item: oreItem(coal)});
    expect(inventory.slice(1).every(slot => slot === null)).toBe(true);
  });

  it('grows the open stack instead of claiming a second slot', () => {
    let inventory = createInventory();
    for (let i = 0; i < 4; i++) inventory = addItem(inventory, oreItem(coal))!;

    expect(countItem(inventory, oreKind('Coal'))).toBe(4);
    expect(inventoryStacks(inventory)).toHaveLength(1);
  });

  it('gives every kind its own slot, in arrival order', () => {
    const inventory = withOreTypes(3);

    expect(inventoryStacks(inventory).map(stack => stack.item.label)).toEqual(['Coal', 'Copper', 'Silver']);
    expect(findStack(inventory, oreKind('Silver'))?.count).toBe(1);
    expect(findStack(inventory, oreKind('Gold'))).toBeNull();
  });

  it('adds several units at once, and ignores a non-positive count', () => {
    const inventory = addItem(createInventory(), oreItem(copper), 3)!;

    expect(countItem(inventory, oreKind('Copper'))).toBe(3);
    expect(addItem(inventory, oreItem(copper), 0)).toBe(inventory);
    expect(addItem(inventory, oreItem(copper), -2)).toBe(inventory);
  });

  it('never mutates the inventory it was handed', () => {
    const before = createInventory();
    const after = addItem(before, oreItem(coal))!;

    expect(before.every(slot => slot === null)).toBe(true);
    expect(after).not.toBe(before);
  });
});

describe('a full inventory', () => {
  it('refuses a new kind once every slot is claimed', () => {
    const inventory = withOreTypes(INVENTORY_SLOTS);

    expect(isFullFor(inventory, oreKind('Emerald'))).toBe(true);
    expect(addItem(inventory, oreItem(ORES[5]))).toBeNull();
  });

  it('still accepts a kind that already has a stack', () => {
    const inventory = withOreTypes(INVENTORY_SLOTS);

    expect(hasRoomFor(inventory, oreKind('Coal'))).toBe(true);
    expect(isFullFor(inventory, oreKind('Coal'))).toBe(false);
    expect(countItem(addItem(inventory, oreItem(coal))!, oreKind('Coal'))).toBe(2);
  });
});

describe('removing', () => {
  it('takes units off a stack and frees the slot when it empties', () => {
    let inventory = addItem(createInventory(), oreItem(coal), 3)!;

    inventory = removeItem(inventory, oreKind('Coal'), 2);
    expect(countItem(inventory, oreKind('Coal'))).toBe(1);

    inventory = removeItem(inventory, oreKind('Coal'));
    expect(countItem(inventory, oreKind('Coal'))).toBe(0);
    expect(inventory[0]).toBeNull();
    expect(inventory).toHaveLength(INVENTORY_SLOTS);
  });

  it('drops a whole stack when more is taken than it holds', () => {
    const inventory = removeItem(addItem(createInventory(), oreItem(coal), 2)!, oreKind('Coal'), 9);

    expect(totalItems(inventory)).toBe(0);
  });

  it('leaves a kind it does not hold alone', () => {
    const inventory = withOreTypes(2);

    expect(removeItem(inventory, oreKind('Gold'))).toBe(inventory);
    expect(removeItem(inventory, oreKind('Coal'), 0)).toBe(inventory);
  });
});

describe('ore', () => {
  it('recognises ore stacks by kind', () => {
    expect(isOreKind(oreKind('Coal'))).toBe(true);
    expect(isOreKind('dynamite')).toBe(false);
  });

  it('counts every ore unit across the slots', () => {
    let inventory = addItem(createInventory(), oreItem(coal), 4)!;
    inventory = addItem(inventory, oreItem(silver), 2)!;

    expect(countOres(inventory)).toBe(6);
    expect(oreStacks(inventory).map(stack => stack.item.value)).toEqual([coal.value, silver.value]);
  });

  it('caps loading at the cargo bay upgrade, even with slots to spare', () => {
    let inventory = createInventory();
    for (let i = 0; i < 3; i++) inventory = addOre(inventory, coal, 3)!;

    expect(countOres(inventory)).toBe(3);
    expect(addOre(inventory, coal, 3)).toBeNull();
    // A different ore has an empty slot waiting, and is refused all the same.
    expect(addOre(inventory, copper, 3)).toBeNull();
    expect(addOre(inventory, copper, 4)).not.toBeNull();
  });

  it('refuses ore that has no slot even when the bay is under its cap', () => {
    const inventory = withOreTypes(INVENTORY_SLOTS, 99);

    expect(countOres(inventory)).toBe(INVENTORY_SLOTS);
    expect(addOre(inventory, ORES[6], 99)).toBeNull();
  });

  it('clears every ore stack on a sale, keeping the slot count', () => {
    const sold = removeOres(withOreTypes(3));

    expect(countOres(sold)).toBe(0);
    expect(sold).toHaveLength(INVENTORY_SLOTS);
    expect(sold.every(slot => slot === null)).toBe(true);
  });

  it('leaves an inventory with nothing to sell untouched', () => {
    const empty = createInventory();

    expect(removeOres(empty)).toBe(empty);
  });
});
