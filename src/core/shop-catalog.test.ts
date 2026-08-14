import { describe, expect, it } from 'vitest';
import { ECONOMY, LIMITS } from './balance';
import {
  SHOP_ITEMS,
  SHOP_SERVICES,
  SHOP_UPGRADES,
  ammoRowState,
  gunRowState,
  itemRowState,
  serviceRowState,
  shopSummary,
  upgradeRowState,
  type ShopPlayer
} from './shop-catalog';
import { createInitialState } from './state';

/** A shop-shaped ship: the run's player plus the bay-counted scanner tally. */
function ship(overrides: Partial<ShopPlayer> = {}): ShopPlayer {
  return {...createInitialState().player, scanners: 0, ...overrides};
}

function everyRow(player: ShopPlayer, cash: number, atSurface: boolean) {
  return [
    ...SHOP_UPGRADES.map(upgrade => upgradeRowState(upgrade.id, player, cash, atSurface)),
    ...SHOP_SERVICES.map(service => serviceRowState(service.id, player, cash, atSurface)),
    ...SHOP_ITEMS.map(item => itemRowState(item.id, player, cash, atSurface)),
    gunRowState(player, cash, atSurface),
    ammoRowState(player, cash, atSurface)
  ];
}

describe('shop rows', () => {
  it('shows current level, next benefit, exact price, and affordability', () => {
    const state = createInitialState();

    const cargo = upgradeRowState('cargo', ship(), state.cash, true);

    expect(cargo.current).toBe('Level 0/198 · 10/1000 slots');
    expect(cargo.benefit).toBe('Next: 10 → 15 slots');
    expect(cargo.buttonLabel).toBe('Buy · $120');
    expect(cargo.buttonDisabled).toBe(true);
    expect(cargo.status).toBe('Need $60');
    expect(shopSummary(state.cash, true)).toEqual({cash: '$60 available', location: 'Surface depot'});
  });

  it('marks capped upgrades as maximum regardless of available cash', () => {
    const drill = upgradeRowState('drill', ship({drill: LIMITS.drill.max}), 1_000_000, true);

    expect(drill.benefit).toBe('Maximum 100 power');
    expect(drill.buttonLabel).toBe('Maximum');
    expect(drill.buttonDisabled).toBe(true);
    expect(drill.status).toBe('Maximum');
  });

  it('offers scaled fuel and hull purchases beyond their former caps', () => {
    const player = ship({fuelMax: 1000, hullMax: 1000});

    const tank = upgradeRowState('tank', player, Number.MAX_SAFE_INTEGER, true);
    const hull = upgradeRowState('hull', player, Number.MAX_SAFE_INTEGER, true);

    expect(tank.current).toBe('Level 45/95 · 1000/2000 fuel');
    expect(tank.benefit).toBe('Next: 1000 → 1020 fuel');
    expect(tank.buttonLabel).toBe('Buy · $78669645');
    expect(tank.buttonDisabled).toBe(false);
    expect(hull.current).toBe('Level 45/95 · 1000/2000 strength');
    expect(hull.buttonLabel).toBe('Buy · $354675667');
    expect(hull.buttonDisabled).toBe(false);
  });

  it('marks fuel and hull maximum only at their new caps', () => {
    const player = ship({fuelMax: LIMITS.fuelMax.max, hullMax: LIMITS.hullMax.max});

    for (const id of ['tank', 'hull'] as const) {
      const row = upgradeRowState(id, player, Number.MAX_SAFE_INTEGER, true);
      expect(row.benefit).toContain('Maximum 2000');
      expect(row.buttonLabel).toBe('Maximum');
      expect(row.buttonDisabled).toBe(true);
      expect(row.status).toBe('Maximum');
    }
  });

  it('preserves partial service semantics and reports carried consumables', () => {
    const player = ship({fuel: 50, hull: 80, dynamite: 3, teleporters: 1, scanners: 2});

    expect(serviceRowState('fuel', player, 5, true)).toMatchObject({status: 'Partial service', buttonDisabled: false});
    expect(serviceRowState('repair', player, 5, true).current).toBe('80/100 · full service $39');
    expect(serviceRowState('fuel', ship(), 5, true).status).toBe('Full');
    expect(serviceRowState('fuel', player, 0, true).status).toBe('No cash');
    expect(itemRowState('dynamite', player, 5, true).current).toBe('Carried: 3');
    expect(itemRowState('teleporter', player, 5, true).current).toBe('Carried: 1');
    // The scanner is the one consumable counted out of the cargo bay.
    expect(itemRowState('scanner', player, 5, true).current).toBe('Carried: 2');
    expect(itemRowState('scanner', player, ECONOMY.scanner.price, true)).toMatchObject({
      buttonLabel: `Buy one · $${ECONOMY.scanner.price}`,
      status: 'Ready',
      buttonDisabled: false
    });
  });

  it('requires the permanent gun before ammunition and reports ownership', () => {
    const unarmed = ship();

    expect(gunRowState(unarmed, 1499, true)).toMatchObject({
      current: 'Not owned · Ammo: 0',
      status: 'Need $1',
      buttonDisabled: true
    });
    expect(ammoRowState(unarmed, 1499, true)).toMatchObject({status: 'Gun required', buttonDisabled: true});

    const armed = ship({gunOwned: true, bullets: 7});
    expect(gunRowState(armed, 120, true)).toMatchObject({current: 'Owned · Ammo: 7', status: 'Owned', buttonLabel: 'Installed'});
    expect(ammoRowState(armed, 120, true)).toMatchObject({current: 'Ammo: 7 · +6 per bundle', buttonDisabled: false});
    expect(ammoRowState(ship({gunOwned: true, bullets: LIMITS.bullets.max}), 120, true).status).toBe('Ammo full');
  });

  it('disables every purchase away from the surface depot', () => {
    const rows = everyRow(ship(), 1_000_000, false);

    expect(rows.every(row => row.buttonDisabled)).toBe(true);
    expect(rows.every(row => row.status === 'Surface depot only')).toBe(true);
    expect(shopSummary(1_000_000, false).location).toBe('Return to surface');
  });
});
