// @vitest-environment happy-dom
//
// One integration test for the orchestrator's wiring. The feature modules are
// unit-tested next door with stubs; what cannot be checked that way is the graph
// itself — several dependencies are late-bound closures precisely because the
// module cycle (grid → session → run → enemies → move → input) cannot be
// resolved in one pass. A mistake there is invisible to every other test and
// fatal in the browser, so this boots the real thing once.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MinerApp } from '../ui/ui';

/** happy-dom has no canvas raster, so drawing calls go into a black hole. */
function stubCanvasContext(): void {
  const context: unknown = new Proxy({}, {
    get: (_target, key) => (key === 'canvas' ? document.getElementById('game') : () => context),
    set: () => true
  });
  HTMLCanvasElement.prototype.getContext = (() => context) as HTMLCanvasElement['getContext'];
}

let frame: ((now: number) => void) | null = null;
let clock = 1000;

/** Run one animation frame, advancing the clock past several fixed steps. */
function renderFrame(): void {
  clock += 100;
  frame?.(clock);
}

function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}));
  window.dispatchEvent(new KeyboardEvent('keyup', {key, bubbles: true, cancelable: true}));
}

describe('booting the game', () => {
  beforeAll(async () => {
    document.body.innerHTML = renderToStaticMarkup(React.createElement(MinerApp));
    stubCanvasContext();
    vi.stubGlobal('requestAnimationFrame', (callback: (now: number) => void) => {
      frame = callback;
      return 0;
    });
    const { initGame } = await import('./game');
    initGame({});
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('deploys a fresh drill at the surface shaft and fills the HUD', () => {
    expect(document.getElementById('toast')?.textContent).toBe('Fresh drill deployed.');
    expect(document.getElementById('depth')?.textContent).toBe('0 m');
    expect(document.getElementById('cash')?.textContent).toBe('$60');
    expect(document.getElementById('fuelLabel')?.textContent).toBe('100/100');
    // The lobby owns the screen until a mode is chosen.
    expect(document.getElementById('lobby-screen')?.classList.contains('hidden')).toBe(false);
  });

  it('runs the whole input → move → terrain → HUD chain on a keypress', () => {
    document.getElementById('soloBtn')?.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    expect(document.getElementById('lobby-screen')?.classList.contains('hidden')).toBe(true);

    press('s');
    renderFrame();

    // The starter shaft below the depot is diggable dirt, so the first press
    // spends fuel drilling; a later one drops the ship into the cleared tile.
    for (let attempt = 0; attempt < 12 && document.getElementById('depth')?.textContent === '0 m'; attempt++) {
      press('s');
      renderFrame();
    }

    expect(document.getElementById('depth')?.textContent).toBe('10 m');
    expect(document.getElementById('fuelLabel')?.textContent).not.toBe('100/100');
  });

  it('opens and closes the info screen through the bound controls', () => {
    const info = document.getElementById('info-screen');
    document.getElementById('infoBtn')?.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    expect(info?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('cargoList')?.textContent).toContain('Cargo bay empty');

    press('Escape');
    expect(info?.classList.contains('hidden')).toBe(true);
  });

  it('routes surface-only actions through the depot check once underground', () => {
    document.getElementById('shopBtn')?.dispatchEvent(new MouseEvent('click', {bubbles: true}));

    expect(document.getElementById('shop-screen')?.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('toast')?.textContent).toBe('Shop is at the surface depot.');
  });
});
