// @vitest-environment happy-dom
//
// What `main.tsx` promises the runtime, now that the runtime is mounted by a React
// effect instead of at module import time: StrictMode is on, the game is built
// against the *mounted* canvas and panel (never a `getElementById` at import), the
// developer tools stay behind their flag, and a crash has a visible surface.

import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface RuntimeCall {
  canvas: HTMLCanvasElement;
  panel: HTMLElement;
  developerToolsEnabled?: boolean;
}

/** Stand in for `createGameRuntime`, recording every mount and teardown. */
function stubRuntime() {
  const calls: RuntimeCall[] = [];
  const disposed: number[] = [];
  const createGameRuntime = vi.fn((options: RuntimeCall) => {
    const index = calls.push(options) - 1;
    return {dispose: () => { disposed.push(index); }};
  });
  return {calls, disposed, createGameRuntime};
}

async function bootMain(runtime: ReturnType<typeof stubRuntime>): Promise<void> {
  vi.doMock('./game/game', () => ({createGameRuntime: runtime.createGameRuntime}));
  document.body.innerHTML = '<div id="root"></div>';
  // `root.render` is concurrent, so the commit and the mount effect land inside
  // `act`, not on the import itself.
  await act(async () => { await import('./main'); });
}

/**
 * Bring the developer chrome on screen the only way a player can: it is a tab of
 * the Info overlay, and neither the overlay nor an unselected tab is mounted.
 */
async function openDeveloperTab(): Promise<void> {
  const { uiStore } = await import('./ui/store');
  await act(async () => { uiStore.getState().setActiveOverlay('info'); });
  await act(async () => { uiStore.getState().setInfoTab('info-developer'); });
}

describe('browser startup', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock('./game/game');
    document.body.innerHTML = '';
  });

  it('builds the runtime against the mounted canvas and panel', async () => {
    const runtime = stubRuntime();
    await bootMain(runtime);

    const mounted = runtime.calls.at(-1)!;
    expect(mounted.canvas).toBe(document.getElementById('game'));
    expect(mounted.panel).toBe(document.getElementById('game-panel'));
    expect(mounted.canvas.isConnected).toBe(true);
    expect(mounted.developerToolsEnabled).toBe(false);
    // Developer chrome is absent without the flag, whatever the runtime does.
    await openDeveloperTab();
    expect(document.getElementById('info-tab-developer')).toBeNull();
    expect(document.getElementById('info-developer')).toBeNull();
  });

  it('survives the StrictMode double mount with exactly one live runtime', async () => {
    const runtime = stubRuntime();
    await bootMain(runtime);

    // Dev StrictMode mounts, tears down, and mounts again. Every runtime but the
    // last one has to have been disposed, or two loops would be simulating.
    expect(runtime.calls.length).toBeGreaterThanOrEqual(2);
    const live = runtime.calls.length - 1;
    expect(runtime.disposed).toEqual([...Array(live).keys()]);
  });

  it('reports the boot outcome so a failed runtime has a visible surface', async () => {
    const runtime = stubRuntime();
    await bootMain(runtime);
    const { uiStore } = await import('./ui/store');

    expect(uiStore.getState().runtimeStatus).toBe('ready');
    expect(document.getElementById('runtime-failure')).toBeNull();
  });

  it('renders and initializes development tools only with the explicit Vite flag', async () => {
    vi.stubEnv('VITE_ENABLE_DEVELOPER_TOOLS', 'true');
    const runtime = stubRuntime();
    await bootMain(runtime);

    expect(runtime.calls.at(-1)?.developerToolsEnabled).toBe(true);
    await openDeveloperTab();
    expect(document.getElementById('info-developer')).toBeInstanceOf(HTMLElement);
    expect(document.getElementById('resetPlayerDataBtn')).toBeInstanceOf(HTMLButtonElement);
  });
});
