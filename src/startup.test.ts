// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('browser startup ordering', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock('./game/game');
    document.body.innerHTML = '';
  });

  it('renders the React GUI shell before importing and initializing game runtime DOM hooks', async () => {
    document.body.innerHTML = '<div id="root"></div>';

    const initGame = vi.fn();
    let gameElementAtImport: HTMLElement | null = null;
    let hudElementAtImport: HTMLElement | null = null;
    let sellButtonAtImport: HTMLElement | null = null;
    let developerPanelAtImport: HTMLElement | null = null;

    vi.doMock('./game/game', () => {
      gameElementAtImport = document.getElementById('game');
      hudElementAtImport = document.getElementById('hud');
      sellButtonAtImport = document.getElementById('sell');
      developerPanelAtImport = document.getElementById('info-developer');
      return { initGame };
    });

    await import('./main');

    expect(gameElementAtImport).toBeInstanceOf(HTMLCanvasElement);
    expect(hudElementAtImport).toBeInstanceOf(HTMLElement);
    expect(sellButtonAtImport).toBeInstanceOf(HTMLButtonElement);
    expect(developerPanelAtImport).toBeNull();
    expect(initGame).toHaveBeenCalledWith({ developerToolsEnabled: false });
  });

  it('renders and initializes development tools only with the explicit Vite flag', async () => {
    vi.stubEnv('VITE_ENABLE_DEVELOPER_TOOLS', 'true');
    document.body.innerHTML = '<div id="root"></div>';

    const initGame = vi.fn();
    let developerPanelAtImport: HTMLElement | null = null;
    let resetButtonAtImport: HTMLElement | null = null;

    vi.doMock('./game/game', () => {
      developerPanelAtImport = document.getElementById('info-developer');
      resetButtonAtImport = document.getElementById('resetPlayerDataBtn');
      return { initGame };
    });

    await import('./main');

    expect(developerPanelAtImport).toBeInstanceOf(HTMLElement);
    expect(resetButtonAtImport).toBeInstanceOf(HTMLButtonElement);
    expect(initGame).toHaveBeenCalledWith({ developerToolsEnabled: true });
  });
});