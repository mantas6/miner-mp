// Keyboard and restart-pointer handling.
//
// Owns the held-key set (input state, deliberately not part of the DOM layer),
// the impulse/auto-repeat rules that turn key presses into moves, and the
// dialog/gun/action key routing. A single window-level capture listener per
// event type is enough: window is the first node of every capture path, so a
// handler there sees the key before any dialog or canvas listener.
//
// Nothing here reacts before the run is live: the store's `phase` gates the whole
// module, so the splash and the lobby own their own keys and presses. Which
// dialog is up is read from the same store rather than from class names, and Tab
// containment is the modal `<dialog>`'s job now, not ours.

import { gunKeyAction } from '../core/weapon';
import { activeSprintDirection, keyboardMovementRepeatMs } from '../core/movement';
import type { Direction, GameState } from '../core/types';
import { uiStore } from '../ui/store';
import type { GameActions } from './actions';

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

  function isPlaying(): boolean {
    return uiStore.getState().phase === 'playing';
  }

  function tick(): void {
    state.tick++;
    state.input.sprintDirection = null;
    if (!isPlaying()) return;
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

  function handleKeyDown(e: KeyboardEvent): void {
    // Keyboard movement must work even before the browser grants audio permission.
    // Sound can still be enabled with the Sound button or any pointer/touch input.
    const key = e.key.toLowerCase();
    const ui = uiStore.getState();
    // The splash and the lobby are React's; they handle their own keys.
    if (ui.phase !== 'playing') return;
    if (ui.shopOpen) {
      // Escape is handled here so the dialog closes through the same path as the
      // buttons; preventDefault keeps the UA from also firing its close request.
      if (key === 'escape') { deps.closeShopScreen(); e.preventDefault(); e.stopPropagation(); }
      return;
    }
    if (ui.infoOpen) {
      if (key === 'escape') { deps.closeInfoScreen(); e.preventDefault(); e.stopPropagation(); }
      return;
    }
    const dir = movementKeys[key];
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

  /** Tap/click anywhere outside the dialogs to deploy a replacement ship. */
  function handleRestartPointer(e: Event): void {
    if (!isPlaying() || !state.gameOver) return;
    const target = e.target as Element;
    if (target.closest && target.closest('#info-screen, #shop-screen')) return;
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
