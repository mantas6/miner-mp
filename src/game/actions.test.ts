import { describe, expect, it, vi } from 'vitest';
import { ORES } from '../../shared/constants';
import { ECONOMY, LIMITS, STARTING } from '../core/balance';
import { cargoCost, drillCost, partialFill, refuelCost, repairCost } from '../core/economy';
import { createInitialState } from '../core/state';
import type { GameState } from '../core/types';
import { createActions, type GameActions } from './actions';
import {
  createAudioStub,
  createEnemySimStub,
  createFakeGrid,
  createSessionStub,
  createToastLog,
  type AudioStub
} from './test-support';

interface Harness {
  state: GameState;
  actions: GameActions;
  audio: AudioStub;
  toasts: ReturnType<typeof createToastLog>;
  saveProgress: ReturnType<typeof vi.fn>;
  revealAtPlayer: ReturnType<typeof vi.fn>;
  flags: {atSurface: boolean};
}

function harness(): Harness {
  const state = createInitialState();
  const context = {
    state,
    audio: createAudioStub(),
    toasts: createToastLog(),
    saveProgress: vi.fn(),
    revealAtPlayer: vi.fn(),
    flags: {atSurface: true}
  };
  const actions = createActions({
    state,
    session: createSessionStub(),
    enemies: createEnemySimStub(),
    grid: createFakeGrid(),
    audio: context.audio,
    toast: context.toasts.toast,
    saveProgress: context.saveProgress,
    // The real orchestrator also banks lifetime earnings here.
    addCash: amount => {
      state.cash += amount;
      if (amount > 0) state.stats.totalCashEarned += amount;
    },
    revealAtPlayer: context.revealAtPlayer,
    atSurface: () => context.flags.atSurface,
    spawnDust: vi.fn(),
    spawnExplosion: vi.fn(),
    spawnShotTrail: vi.fn(),
    clearKeys: vi.fn()
  });
  return {...context, actions};
}

describe('selling cargo', () => {
  it('pays the full cargo value, empties the bay, and records the earnings', () => {
    const h = harness();
    h.state.player.cargo = [ORES[0], ORES[3]];
    const expected = ORES[0].value + ORES[3].value;

    h.actions.sell();

    expect(h.state.cash).toBe(STARTING.cash + expected);
    expect(h.state.stats.totalCashEarned).toBe(expected);
    expect(h.state.player.cargo).toEqual([]);
    expect(h.saveProgress).toHaveBeenCalled();
    expect(h.audio.played).toContain('cash');
  });

  it('refuses to sell underground and keeps the cargo aboard', () => {
    const h = harness();
    h.flags.atSurface = false;
    h.state.player.cargo = [ORES[0]];

    h.actions.sell();

    expect(h.state.cash).toBe(STARTING.cash);
    expect(h.state.player.cargo).toHaveLength(1);
    expect(h.toasts.saw('Depot is on the surface')).toBe(true);
  });

  it('says so when there is nothing to sell', () => {
    const h = harness();

    h.actions.sell();

    expect(h.state.cash).toBe(STARTING.cash);
    expect(h.toasts.saw('Cargo is empty')).toBe(true);
  });
});

describe('depot services', () => {
  it('fills the tank completely when the wallet can afford it', () => {
    const h = harness();
    h.state.player.fuel = 40;
    h.state.cash = 500;
    const cost = refuelCost(h.state.player);

    h.actions.refuel();

    expect(h.state.player.fuel).toBe(h.state.player.fuelMax);
    expect(h.state.cash).toBe(500 - cost);
    expect(h.toasts.saw('Fuel tank full')).toBe(true);
  });

  it('buys a proportional part of a refuel when the cash runs short', () => {
    const h = harness();
    h.state.player.fuel = 20;
    h.state.cash = 5;
    const cost = refuelCost(h.state.player);
    const expected = partialFill(20, h.state.player.fuelMax, 5, cost);

    h.actions.refuel();

    expect(expected.pay).toBe(5);
    expect(h.state.player.fuel).toBeCloseTo(expected.value);
    expect(h.state.player.fuel).toBeLessThan(h.state.player.fuelMax);
    expect(h.state.cash).toBe(0);
    expect(h.toasts.saw('Partial refuel')).toBe(true);
  });

  it('repairs partially on the same money math', () => {
    const h = harness();
    h.state.player.hull = 10;
    h.state.cash = 4;
    const expected = partialFill(10, h.state.player.hullMax, 4, repairCost(h.state.player));

    h.actions.repair();

    expect(h.state.player.hull).toBeCloseTo(expected.value);
    expect(h.state.cash).toBe(0);
    expect(h.toasts.saw('Partial repair')).toBe(true);
  });

  it('refuses a service with no cash at all and warns audibly', () => {
    const h = harness();
    h.state.player.fuel = 10;
    h.state.cash = 0;

    h.actions.refuel();

    expect(h.state.player.fuel).toBe(10);
    expect(h.toasts.saw('No cash to buy fuel')).toBe(true);
    expect(h.audio.played).toContain('alarm');
  });

  it('declines to sell a service that is already at maximum', () => {
    const h = harness();
    h.state.cash = 500;

    h.actions.refuel();
    h.actions.repair();

    expect(h.state.cash).toBe(500);
    expect(h.toasts.saw('Fuel tank already full')).toBe(true);
    expect(h.toasts.saw('Hull already at full strength')).toBe(true);
  });

  it('prioritises selling, then fuel, then hull at the depot', () => {
    const h = harness();
    h.state.cash = 500;
    h.state.player.cargo = [ORES[0]];
    h.state.player.fuel = 50;
    h.state.player.hull = 50;

    h.actions.surfaceService();
    expect(h.state.player.cargo).toEqual([]);

    h.actions.surfaceService();
    expect(h.state.player.fuel).toBe(h.state.player.fuelMax);

    h.actions.surfaceService();
    expect(h.state.player.hull).toBe(h.state.player.hullMax);

    h.actions.surfaceService();
    expect(h.toasts.last).toContain('Cargo empty, hull and fuel are full');
  });
});

describe('buying upgrades', () => {
  it('charges the price and applies the upgrade', () => {
    const h = harness();
    h.state.cash = 1000;
    const cost = cargoCost(h.state.player);

    h.actions.buyUpgrade('cargo', cost, 'Cargo bay expanded.');

    expect(h.state.player.cargoMax).toBe(STARTING.cargoMax + ECONOMY.cargo.step);
    expect(h.state.cash).toBe(1000 - cost);
    expect(h.saveProgress).toHaveBeenCalled();
  });

  it('leaves the ship untouched when the money is short', () => {
    const h = harness();
    h.state.cash = 10;

    h.actions.buyUpgrade('drill', drillCost(h.state.player), 'Drill power increased.');

    expect(h.state.player.drill).toBe(STARTING.drill);
    expect(h.state.cash).toBe(10);
    expect(h.toasts.saw(`Need $${drillCost(h.state.player)}`)).toBe(true);
    expect(h.audio.played).toContain('alarm');
  });

  it('re-reveals the fog footprint after a sensor upgrade only', () => {
    const h = harness();
    h.state.cash = 5000;

    h.actions.buyUpgrade('hull', 1, 'Hull reinforced.');
    expect(h.revealAtPlayer).not.toHaveBeenCalled();

    h.actions.buyUpgrade('visibility', 1, 'Sensor footprint expanded.');
    expect(h.revealAtPlayer).toHaveBeenCalled();
  });

  it('refuses an upgrade that is already maxed out, without charging', () => {
    const h = harness();
    h.state.cash = 5000;
    h.state.player.visibility = LIMITS.visibility.max;

    h.actions.buyUpgrade('visibility', 1, 'Sensor footprint expanded.');

    expect(h.state.cash).toBe(5000);
    expect(h.toasts.saw('already at maximum level')).toBe(true);
  });

  it('sells upgrades only at the depot', () => {
    const h = harness();
    h.flags.atSurface = false;
    h.state.cash = 5000;

    h.actions.buyUpgrade('cargo', 1, 'Cargo bay expanded.');

    expect(h.state.player.cargoMax).toBe(STARTING.cargoMax);
    expect(h.toasts.saw('Upgrades are at the surface')).toBe(true);
  });
});

describe('buying equipment', () => {
  it('loads consumables one at a time', () => {
    const h = harness();
    h.state.cash = ECONOMY.dynamite.price + ECONOMY.teleporter.price;

    h.actions.buyDynamite();
    h.actions.buyTeleporter();

    expect(h.state.player).toMatchObject({dynamite: 1, teleporters: 1});
    expect(h.state.cash).toBe(0);
  });

  it('requires the gun before ammunition, and never sells it twice', () => {
    const h = harness();
    h.state.cash = ECONOMY.gun.price + ECONOMY.gun.ammoPrice;

    h.actions.buyBullets();
    expect(h.state.player.bullets).toBe(0);
    expect(h.toasts.saw('Buy the Linebreaker Gun before')).toBe(true);

    h.actions.buyGun();
    expect(h.state.player.gunOwned).toBe(true);

    h.actions.buyBullets();
    expect(h.state.player.bullets).toBe(ECONOMY.gun.ammoBundle);
    expect(h.state.cash).toBe(0);

    h.actions.buyGun();
    expect(h.toasts.saw('already installed')).toBe(true);
  });

  it('stops ammunition purchases at the storage limit', () => {
    const h = harness();
    h.state.cash = 5000;
    h.state.player.gunOwned = true;
    h.state.player.bullets = LIMITS.bullets.max;

    h.actions.buyBullets();

    expect(h.state.player.bullets).toBe(LIMITS.bullets.max);
    expect(h.state.cash).toBe(5000);
    expect(h.toasts.saw('Ammunition storage is full')).toBe(true);
  });
});
