// @vitest-environment happy-dom

import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { LIMITS } from '../src/balance';
import { createInitialState } from '../src/state';
import { updateShopControls } from '../src/shop';
import { MinerApp } from '../src/ui';

describe('shop action states', () => {
  let shop: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    flushSync(() => createRoot(document.getElementById('root')!).render(React.createElement(MinerApp)));
    shop = document.getElementById('shop-card')!;
  });

  it('shows current level, next benefit, exact price, and affordability', () => {
    const state = createInitialState();

    updateShopControls(shop, state.player, state.cash, true);

    const cargo = shop.querySelector<HTMLElement>('[data-shop-upgrade="cargo"]')!;
    expect(cargo.querySelector('[data-shop-current]')?.textContent).toBe('Level 0/198 · 10/1000 slots');
    expect(cargo.querySelector('[data-shop-benefit]')?.textContent).toBe('Next: 10 → 15 slots');
    expect(cargo.querySelector('button')?.textContent).toBe('Buy · $120');
    expect(cargo.querySelector('button')?.disabled).toBe(true);
    expect(cargo.querySelector('[data-shop-status]')?.textContent).toBe('Need $60');
  });

  it('marks capped upgrades as maximum regardless of available cash', () => {
    const state = createInitialState();
    state.player.drill = LIMITS.drill.max;

    updateShopControls(shop, state.player, 1_000_000, true);

    const drill = shop.querySelector<HTMLElement>('[data-shop-upgrade="drill"]')!;
    expect(drill.querySelector('[data-shop-benefit]')?.textContent).toBe('Maximum 100 power');
    expect(drill.querySelector('button')?.textContent).toBe('Maximum');
    expect(drill.querySelector('button')?.disabled).toBe(true);
    expect(drill.querySelector('[data-shop-status]')?.textContent).toBe('Maximum');
  });

  it('preserves partial service semantics and reports carried consumables', () => {
    const state = createInitialState();
    state.cash = 5;
    state.player.fuel = 50;
    state.player.hull = 80;
    state.player.dynamite = 3;
    state.player.teleporters = 1;

    updateShopControls(shop, state.player, state.cash, true);

    expect(shop.querySelector('[data-shop-service="fuel"] [data-shop-status]')?.textContent).toBe('Partial service');
    expect(shop.querySelector<HTMLButtonElement>('[data-shop-service="fuel"] button')?.disabled).toBe(false);
    expect(shop.querySelector('[data-shop-service="repair"] [data-shop-current]')?.textContent).toBe('80/100 · full service $39');
    expect(shop.querySelector('[data-shop-item="dynamite"] [data-shop-current]')?.textContent).toBe('Carried: 3');
    expect(shop.querySelector('[data-shop-item="teleporter"] [data-shop-current]')?.textContent).toBe('Carried: 1');
  });

  it('disables every purchase away from the surface depot', () => {
    const state = createInitialState();

    updateShopControls(shop, state.player, 1_000_000, false);

    expect([...shop.querySelectorAll<HTMLButtonElement>('.shop-item button')].every(button => button.disabled)).toBe(true);
    expect([...shop.querySelectorAll<HTMLElement>('[data-shop-status]')].every(status => status.textContent === 'Surface depot only')).toBe(true);
  });
});
