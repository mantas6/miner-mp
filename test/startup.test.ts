// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('browser startup ordering', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../src/game');
    document.body.innerHTML = '';
  });

  it('renders the React GUI shell before importing and initializing game runtime DOM hooks', async () => {
    document.body.innerHTML = '<div id="root"></div>';

    const initGame = vi.fn();
    let gameElementAtImport: HTMLElement | null = null;
    let hudElementAtImport: HTMLElement | null = null;
    let sellButtonAtImport: HTMLElement | null = null;

    vi.doMock('../src/game', () => {
      gameElementAtImport = document.getElementById('game');
      hudElementAtImport = document.getElementById('hud');
      sellButtonAtImport = document.getElementById('sell');
      return { initGame };
    });

    await import('../src/main');

    expect(gameElementAtImport).toBeInstanceOf(HTMLCanvasElement);
    expect(hudElementAtImport).toBeInstanceOf(HTMLElement);
    expect(sellButtonAtImport).toBeInstanceOf(HTMLButtonElement);
    expect(initGame).toHaveBeenCalledOnce();
  });
});