// Keyboard and restart-pointer handling.
//
// Owns the held-key set (input state, deliberately not part of the DOM layer),
// the impulse/auto-repeat rules that turn key presses into moves, and the
// dialog/gun/action key routing. A single window-level capture listener per
// event type is enough: window is the first node of every capture path, so a
// handler there sees the key before any dialog or canvas listener.

import { gunKeyAction } from '../core/weapon';
import { activeSprintDirection, keyboardMovementRepeatMs } from '../core/movement';
import type { Direction, GameState } from '../core/types';
import type { GameActions } from './actions';
import { ui } from './dom';

/** Grace window (ms) in which a second R press confirms resetting a live run. */
const RESET_CONFIRM_MS = 3500;

const movementKeys: Record<string, Direction> = {
  arrowleft: [-1, 0], a: [-1, 0],
  arrowright: [1, 0], d: [1, 0],
  arrowup: [0, -1], w: [0, -1],
  arrowdown: [0, 1], s: [0, 1]
};

/** Held-key priority when several directions are down at once. */
const HELD_DIRECTIONS: {keys: string[]; direction: Direction}[] = [
  {keys: ['arrowleft', 'a'], direction: [-1, 0]},
  {keys: ['arrowright', 'd'], direction: [1, 0]},
  {keys: ['arrowup', 'w'], direction: [0, -1]},
  {keys: ['arrowdown', 's'], direction: [0, 1]}
];

export interface GameInput {
  /** One simulation step of keyboard movement: impulse first, then auto-repeat. */
  tick(): void;
  /** Forget held keys, so a modal action does not resume movement afterwards. */
  clearKeys(): void;
  /** Drop every scrap of keyboard/aim state (restart, world reset). */
  reset(): void;
  /** Register the window-level keyboard and restart-pointer listeners. */
  attach(): void;
}

export interface GameInputDeps {
  state: GameState;
  actions: GameActions;
  /** Attempt a move; the same entry point the loop uses. */
  move(dx: number, dy: number, sprinting: boolean): void;
  /** Whether the ship would fly (not drill) into this direction's destination. */
  isOpenMovementDestination(dx: number, dy: number): boolean;
  restartGame(): void;
  startIntro(event?: Event): void;
  closeShopScreen(): void;
  closeInfoScreen(): void;
  toast(message: string): void;
  /** Enable sound on the first trusted gesture, when the browser allows it. */
  tryAutoAudio(event?: Event): void;
}

export function createInput(deps: GameInputDeps): GameInput {
  const {state, actions} = deps;
  /** Lower-cased keys currently held down. */
  const keys = new Set<string>();

  function clearKeys(): void {
    keys.clear();
  }

  function reset(): void {
    keys.clear();
    state.input.resetConfirmUntil = 0;
    state.input.keyImpulse = null;
    state.input.sprintDirection = null;
    state.input.gunArmed = false;
    state.input.lastKeyboardMove = 0;
  }

  function heldKeyDirection(): Direction | null {
    for (const {keys: candidates, direction} of HELD_DIRECTIONS) {
      if (candidates.some(key => keys.has(key))) return direction;
    }
    return null;
  }

  /** R resets a finished run outright, but asks for confirmation mid-run. */
  function requestReset(): void {
    if (state.gameOver) { deps.restartGame(); return; }
    const now = performance.now();
    if (now < state.input.resetConfirmUntil) {
      deps.restartGame();
      return;
    }
    state.input.resetConfirmUntil = now + RESET_CONFIRM_MS;
    deps.toast('Press R again to reset progress in this run.');
  }

  function tick(): void {
    state.tick++;
    state.input.sprintDirection = null;
    if (!state.introStarted) return;
    const now = performance.now();
    const sprinting = keys.has('shift');
    const impulse = state.input.keyImpulse;
    if (impulse) {
      state.input.keyImpulse = null;
      state.input.lastKeyboardMove = now;
      state.input.sprintDirection = activeSprintDirection(!state.gameOver && sprinting, deps.isOpenMovementDestination(impulse[0], impulse[1]), impulse[0], impulse[1]);
      deps.move(impulse[0], impulse[1], sprinting);
      return;
    }
    const held = heldKeyDirection();
    const destinationOpen = held ? deps.isOpenMovementDestination(held[0], held[1]) : false;
    if (held) state.input.sprintDirection = activeSprintDirection(!state.gameOver && sprinting, destinationOpen, held[0], held[1]);
    if (held && now - state.input.lastKeyboardMove >= keyboardMovementRepeatMs(state.input.keyboardRepeatMs, sprinting, destinationOpen)) {
      state.input.lastKeyboardMove = now;
      deps.move(held[0], held[1], sprinting);
    }
  }

  /** Keep Tab cycling inside an open dialog instead of escaping to the page. */
  function keepFocusInDialog(event: KeyboardEvent, dialog: HTMLElement): void {
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.hidden && element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) last.focus();
    else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) first.focus();
    else return;
    event.preventDefault();
  }

  function handleKeyDown(e: KeyboardEvent): void {
    // Keyboard movement must work even before the browser grants audio permission.
    // Sound can still be enabled with the Sound button or any pointer/touch input.
    const key = e.key.toLowerCase();
    if (!ui.shopScreen.classList.contains('hidden')) {
      if (key === 'escape') { deps.closeShopScreen(); e.preventDefault(); e.stopPropagation(); }
      else if (key === 'tab') keepFocusInDialog(e, ui.shopScreen);
      return;
    }
    if (!ui.infoScreen.classList.contains('hidden')) {
      if (key === 'escape') { deps.closeInfoScreen(); e.preventDefault(); e.stopPropagation(); }
      else if (key === 'tab') keepFocusInDialog(e, ui.infoScreen);
      return;
    }
    if (!ui.lobby.classList.contains('hidden')) return;
    const dir = movementKeys[key];
    if (!state.introStarted) {
      if (key === 'enter' || key === ' ') { deps.startIntro(); e.preventDefault(); }
      return;
    }
    if (key === 'shift') {
      keys.add(key);
      return;
    }
    const gunAction = gunKeyAction(state.input.gunArmed, key);
    if (gunAction === 'arm') { if (!e.repeat) actions.setGunArmed(true); e.preventDefault(); e.stopPropagation(); return; }
    if (gunAction === 'cancel') { if (!e.repeat) actions.setGunArmed(false); e.preventDefault(); e.stopPropagation(); return; }
    if (gunAction === 'fire' && dir) { if (!e.repeat) actions.fireGun(dir); e.preventDefault(); e.stopPropagation(); return; }
    if (dir) {
      if (e.shiftKey) keys.add('shift');
      if (!keys.has(key) && !e.repeat) state.input.keyImpulse = dir;
      keys.add(key);
      e.preventDefault();
      return;
    }
    if (key === 'enter') { actions.sell(); e.preventDefault(); e.stopPropagation(); return; }
    if (key === ' ') { actions.surfaceService(); e.preventDefault(); e.stopPropagation(); return; }
    if (key === 'e') { if (!e.repeat) actions.detonateDynamite(); e.preventDefault(); e.stopPropagation(); return; }
    if (key === 't') { if (!e.repeat) actions.useTeleporter(); e.preventDefault(); e.stopPropagation(); return; }
    if (key === 'r') { if (!e.repeat) requestReset(); e.preventDefault(); e.stopPropagation(); }
  }

  function handleKeyUp(e: KeyboardEvent): void {
    keys.delete(e.key.toLowerCase());
    if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); }
  }

  /**
   * Tap/click anywhere outside the overlays to start the run, or to deploy a
   * replacement ship once the current one is gone.
   */
  function handleRestartPointer(e: Event): void {
    const target = e.target as Element;
    if (target.closest && target.closest('#info-screen, #shop-screen, #lobby-screen')) return;
    if (!state.introStarted) { deps.startIntro(e); e.preventDefault(); e.stopPropagation(); return; }
    if (!state.gameOver) return;
    deps.tryAutoAudio(e);
    deps.restartGame();
    e.preventDefault();
    e.stopPropagation();
  }

  function attach(): void {
    addEventListener('keydown', handleKeyDown, {capture: true});
    addEventListener('keyup', handleKeyUp, {capture: true});
    addEventListener('pointerdown', handleRestartPointer, {capture: true});
    // Touch needs an active listener so the synthetic click can be suppressed.
    addEventListener('touchstart', handleRestartPointer, {capture: true, passive: false});
  }

  return {tick, clearKeys, reset, attach};
}
