// @vitest-environment happy-dom
//
// The keyboard/pointer layer, driven through the real window listeners it
// installs. What matters here is the gating: nothing may reach the simulation
// before the run is live, and after a death a press has to deploy the next ship.
//
// `attach()` has no counterpart, so each harness leaves its listeners behind for
// the rest of the file. That is harmless — every harness owns its own state and
// spies, and a window capture listener cannot silence its siblings.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../core/state';
import type { GameState } from '../core/types';
import { uiStore } from '../ui/store';
import type { GameActions } from './actions';
import { createInput, type GameInput } from './input';

function createActionsSpy() {
  return {
    sell: vi.fn(),
    refuel: vi.fn(),
    repair: vi.fn(),
    surfaceService: vi.fn(),
    buyUpgrade: vi.fn(),
    buyDynamite: vi.fn(),
    detonateDynamite: vi.fn(),
    buyTeleporter: vi.fn(),
    buyGun: vi.fn(),
    buyBullets: vi.fn(),
    setGunArmed: vi.fn(),
    fireGun: vi.fn(() => true),
    useTeleporter: vi.fn()
  } satisfies GameActions;
}

interface Harness {
  state: GameState;
  input: GameInput;
  actions: ReturnType<typeof createActionsSpy>;
  move: ReturnType<typeof vi.fn>;
  restartGame: ReturnType<typeof vi.fn>;
  closeShopScreen: ReturnType<typeof vi.fn>;
  closeInfoScreen: ReturnType<typeof vi.fn>;
  toast: ReturnType<typeof vi.fn>;
  tryAutoAudio: ReturnType<typeof vi.fn>;
}

function harness(): Harness {
  const context = {
    state: createInitialState(),
    actions: createActionsSpy(),
    move: vi.fn(),
    restartGame: vi.fn(),
    closeShopScreen: vi.fn(),
    closeInfoScreen: vi.fn(),
    toast: vi.fn(),
    tryAutoAudio: vi.fn()
  };
  const input = createInput({
    ...context,
    isOpenMovementDestination: () => true
  });
  input.attach();
  return {...context, input};
}

function press(key: string, target: EventTarget = window): void {
  target.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}));
}

function release(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', {key, bubbles: true, cancelable: true}));
}

function pointerDown(target: EventTarget = document.body): void {
  target.dispatchEvent(new Event('pointerdown', {bubbles: true, cancelable: true}));
}

beforeEach(() => {
  uiStore.getState().setPhase('intro');
  uiStore.getState().setShopOpen(false);
  uiStore.getState().setInfoOpen(false);
  document.body.innerHTML = '';
});

describe('phase gating', () => {
  it('ignores keys on the splash and in the lobby, then obeys them in the run', () => {
    const h = harness();

    press('s');
    press('Enter');
    h.input.tick();
    expect(h.move).not.toHaveBeenCalled();
    expect(h.actions.sell).not.toHaveBeenCalled();

    uiStore.getState().setPhase('lobby');
    press('s');
    press('Enter');
    h.input.tick();
    expect(h.move).not.toHaveBeenCalled();
    expect(h.actions.sell).not.toHaveBeenCalled();

    uiStore.getState().setPhase('playing');
    press('s');
    h.input.tick();
    expect(h.move).toHaveBeenCalledWith(0, 1, false);
    press('Enter');
    expect(h.actions.sell).toHaveBeenCalledOnce();
  });

  it('keeps counting ticks before the run so enemy cooldowns stay coherent', () => {
    const h = harness();

    h.input.tick();
    h.input.tick();

    expect(h.state.tick).toBe(2);
  });

  it('leaves held keys behind when the run starts', () => {
    const h = harness();

    // Pressed while the lobby was up: never recorded, so nothing auto-repeats.
    uiStore.getState().setPhase('lobby');
    press('d');
    uiStore.getState().setPhase('playing');
    h.input.tick();

    expect(h.move).not.toHaveBeenCalled();
  });

  it('routes Escape to whichever dialog is open', () => {
    const h = harness();
    uiStore.getState().setPhase('playing');

    uiStore.getState().setShopOpen(true);
    press('Escape');
    expect(h.closeShopScreen).toHaveBeenCalledOnce();
    expect(h.actions.sell).not.toHaveBeenCalled();

    uiStore.getState().setShopOpen(false);
    uiStore.getState().setInfoOpen(true);
    press('Escape');
    expect(h.closeInfoScreen).toHaveBeenCalledOnce();
  });
});

describe('restarting after a death', () => {
  it('deploys the next ship on a press, but only once the ship is gone', () => {
    const h = harness();
    uiStore.getState().setPhase('playing');

    pointerDown();
    expect(h.restartGame).not.toHaveBeenCalled();

    h.state.gameOver = true;
    pointerDown();
    expect(h.restartGame).toHaveBeenCalledOnce();
    // The same press is the browser's chance to unlock audio.
    expect(h.tryAutoAudio).toHaveBeenCalledOnce();
  });

  it('ignores presses inside the shop and info dialogs', () => {
    const h = harness();
    uiStore.getState().setPhase('playing');
    h.state.gameOver = true;
    document.body.innerHTML = '<dialog id="info-screen"><button id="infoCloseBtn">Close</button></dialog>';

    pointerDown(document.getElementById('infoCloseBtn')!);

    expect(h.restartGame).not.toHaveBeenCalled();
  });

  it('never restarts from a press on the splash or the lobby', () => {
    const h = harness();
    h.state.gameOver = true;

    pointerDown();
    uiStore.getState().setPhase('lobby');
    pointerDown();

    expect(h.restartGame).not.toHaveBeenCalled();
  });

  it('restarts on R at once after death, and asks twice mid-run', () => {
    const h = harness();
    uiStore.getState().setPhase('playing');

    press('r');
    expect(h.restartGame).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith(expect.stringContaining('Press R again'));

    press('r');
    expect(h.restartGame).toHaveBeenCalledOnce();

    h.state.gameOver = true;
    h.input.reset();
    press('r');
    expect(h.restartGame).toHaveBeenCalledTimes(2);
  });
});

describe('held keys', () => {
  it('auto-repeats a held direction and stops on release', () => {
    const h = harness();
    uiStore.getState().setPhase('playing');

    press('a');
    h.input.tick();
    expect(h.move).toHaveBeenCalledWith(-1, 0, false);

    h.state.input.lastKeyboardMove = 0;
    h.input.tick();
    expect(h.move).toHaveBeenCalledTimes(2);

    release('a');
    h.state.input.lastKeyboardMove = 0;
    h.input.tick();
    expect(h.move).toHaveBeenCalledTimes(2);
  });
});
