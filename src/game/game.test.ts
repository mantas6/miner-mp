// @vitest-environment happy-dom
//
// One integration test for the orchestrator's wiring. The feature modules are
// unit-tested next door with stubs; what cannot be checked that way is the graph
// itself — several dependencies are late-bound closures precisely because the
// module cycle (grid → session → run → enemies → move → input) cannot be
// resolved in one pass. A mistake there is invisible to every other test and
// fatal in the browser, so this boots the real thing once.
//
// The real React tree is mounted too, so the store sync that replaced the old
// per-frame DOM writes is covered end to end: keypress → simulation → store →
// rendered HUD.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { uiStore } from '../ui/store';
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
  act(() => {
    clock += 100;
    frame?.(clock);
  });
}

function press(key: string): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}));
    window.dispatchEvent(new KeyboardEvent('keyup', {key, bubbles: true, cancelable: true}));
  });
}

function click(id: string): void {
  act(() => {
    document.getElementById(id)?.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  });
}

function text(id: string): string | undefined {
  return document.getElementById(id)?.textContent ?? undefined;
}

function dialogOpen(id: string): boolean {
  return (document.getElementById(id) as HTMLDialogElement | null)?.open === true;
}

describe('booting the game', () => {
  beforeAll(async () => {
    stubCanvasContext();
    render(React.createElement(MinerApp));
    vi.stubGlobal('requestAnimationFrame', (callback: (now: number) => void) => {
      frame = callback;
      return 0;
    });
    const { initGame } = await import('./game');
    await act(async () => { initGame({}); });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('deploys a fresh drill at the surface shaft and fills the HUD', () => {
    expect(text('toast')).toBe('Fresh drill deployed.');
    expect(text('depth')).toBe('0 m');
    expect(text('cash')).toBe('$60');
    expect(text('fuelLabel')).toBe('100/100');
    // Boot phase: the splash owns the screen alone, with no lobby behind it.
    expect(document.getElementById('intro')).not.toBeNull();
    expect(document.getElementById('lobby-screen')).toBeNull();
  });

  it('walks the splash → lobby → run phases, one overlay at a time', () => {
    act(() => { fireEvent.pointerDown(document.getElementById('intro')!); });
    expect(document.getElementById('intro')).toBeNull();
    expect(document.getElementById('lobby-screen')).not.toBeNull();
    // Keys still belong to the lobby, so the ship has not moved.
    press('s');
    renderFrame();
    expect(text('depth')).toBe('0 m');

    click('soloBtn');
    expect(document.getElementById('lobby-screen')).toBeNull();
    expect(text('toast')).toContain('Drill ready');
  });

  it('runs the whole input → move → terrain → HUD chain on a keypress', () => {
    press('s');
    renderFrame();

    // The starter shaft below the depot is diggable dirt, so the first press
    // spends fuel drilling; a later one drops the ship into the cleared tile.
    for (let attempt = 0; attempt < 12 && text('depth') === '0 m'; attempt++) {
      press('s');
      renderFrame();
    }

    expect(text('depth')).toBe('10 m');
    expect(text('fuelLabel')).not.toBe('100/100');
  });

  it('opens and closes the info dialog through the bound controls', () => {
    click('infoBtn');
    expect(dialogOpen('info-screen')).toBe(true);
    expect(text('cargoList')).toContain('Cargo bay empty');

    press('Escape');
    expect(dialogOpen('info-screen')).toBe(false);
  });

  it('routes surface-only actions through the depot check once underground', () => {
    click('shopBtn');

    expect(dialogOpen('shop-screen')).toBe(false);
    expect(text('toast')).toBe('Shop is at the surface depot.');
  });

  // Kept last: this one digs far enough to change cargo and depth for good.
  it('feeds the scanner, the return-fuel forecast and the milestone toast from one dive', () => {
    // Underground there is a climb to pay for, so the forecast is on screen.
    expect((document.getElementById('fuelReserve') as HTMLElement).hidden).toBe(false);
    expect(document.getElementById('fuelReserveLabel')?.textContent).toContain('after climb');
    expect(text('scanner')).toMatch(/^Scanner/);
    expect(text('depthTarget')).toContain('starter Coal/Copper seam');

    // The first landmark is that starter seam, 50 m down.
    for (let attempt = 0; attempt < 200 && text('depth') !== '50 m'; attempt++) {
      press('s');
      renderFrame();
    }

    expect(text('depth')).toBe('50 m');
    expect(text('toast')).toContain('Depth 50 m');
    expect(text('depthTarget')).toBe('↓ 550 m to Silver');

    // Crossing announces once: the next frame leaves the toast alone.
    act(() => { uiStore.getState().pushToast('Cleared.'); });
    renderFrame();
    expect(text('toast')).toBe('Cleared.');
  });
});
