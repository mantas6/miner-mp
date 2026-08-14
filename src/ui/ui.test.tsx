// @vitest-environment happy-dom
//
// Behaviour of the app shell: the DOM contract the game runtime and the keyboard
// layer still depend on, store-driven HUD updates, tab switching, toasts, and the
// developer-tools gate. Copy is not asserted here — it lives in one place now and
// is checked where it is produced (core/shop-catalog, core/stats, core/objective).

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORES } from '../../shared/constants';
import { addItem, addOre, createInventory } from '../core/inventory';
import { SCANNER_ITEM } from '../core/scanner-device';
import { setUiCommands, uiCommands } from './commands';
import { RELAY_PROBLEM_STATUS } from './connection-status';
import { buildInventorySlots, uiStore, type HudSnapshot } from './store';
import { MinerApp } from './ui';

/** Ids the game runtime, the keyboard layer, and the tests address directly. */
const DOM_CONTRACT = [
  'shell', 'game-panel', 'game', 'game-instructions', 'game-status',
  'hud', 'musicBtn', 'sfxBtn', 'connectionStatus', 'cash', 'depth', 'depthTarget', 'scanner',
  'fuel', 'fuelLabel', 'fuelReturn', 'fuelSurplus', 'hull', 'hullLabel', 'cargo', 'cargoLabel', 'extractionStatus',
  // The inventory panel ships expanded, so its slot list is part of the contract.
  'inventory', 'inventoryToggleBtn', 'inventorySlots',
  'surfaceHint', 'sell', 'shopBtn', 'dynamiteBtn', 'teleporterBtn', 'gunBtn', 'infoBtn',
  // Both overlays keep their dialog shell mounted; their contents do not.
  'shop-screen', 'info-screen',
  'fuel-warning', 'toast'
];

/** Ids that exist only while the shop is the overlay on screen. */
const SHOP_CONTRACT = [
  'shop-card', 'shopCloseBtn',
  'fuelBtn', 'repairBtn', 'cargoBtn', 'tankBtn', 'hullBtn', 'drillBtn', 'visibilityBtn',
  'shopDynamiteBtn', 'shopTeleporterBtn', 'shopScannerBtn', 'shopGunBtn', 'shopBulletsBtn'
];

/** Ids that exist only while the info screen is up, on the tab it opens with. */
const INFO_CONTRACT = ['info-card', 'infoCloseBtn', 'objectiveInfoStatus', 'extractionInfoStatus', 'cargoList'];

/** The remaining panel ids, and the tab that mounts each of them. */
const INFO_TAB_CONTRACT = [
  {tabId: 'info-tab-stats', ids: ['expeditionStats']},
  {tabId: 'info-tab-prospecting', ids: ['prospectingGuide']},
  {tabId: 'info-tab-hazards', ids: ['dangerGuide']},
  {tabId: 'info-tab-settings', ids: ['settingsMusicBtn', 'settingsSfxBtn', 'resetGameBtn']}
];

/** Ids that only exist in the lobby phase, which is the relay panel and nothing else. */
const LOBBY_CONTRACT = ['lobby-screen', 'serverUrl', 'lobbyConnectionStatus', 'connectBtn', 'lobbyBackBtn'];

const pristine = {...uiStore.getState()};
const pristineCommands = {...uiCommands};

function patchHud(patch: Partial<HudSnapshot>): void {
  act(() => {
    uiStore.getState().syncHud({...uiStore.getState().hud, ...patch});
  });
}

beforeEach(() => {
  uiStore.setState(pristine);
  // `setState` restores an empty queue but cannot cancel a toast expiry an
  // earlier test armed, which would fire mid-test outside `act()`.
  uiStore.getState().clearToasts();
});

afterEach(() => {
  cleanup();
  setUiCommands(pristineCommands);
  vi.restoreAllMocks();
});

/** The overlay commands the running game installs, in store terms. */
function installOverlayCommands(): void {
  setUiCommands({
    openShop: () => uiStore.getState().setActiveOverlay('shop'),
    closeShop: () => uiStore.getState().closeOverlay('shop'),
    openInfo: () => uiStore.getState().setActiveOverlay('info'),
    closeInfo: () => uiStore.getState().closeOverlay('info')
  });
}

function dialog(id: string): HTMLDialogElement {
  return document.getElementById(id) as HTMLDialogElement;
}

describe('app shell', () => {
  it('renders every DOM hook the game runtime still addresses', () => {
    render(<MinerApp />);

    for (const id of DOM_CONTRACT) expect(document.getElementById(id), id).not.toBeNull();
  });

  /**
   * The panel used to be a tab stop as well, so Tab landed on a wrapper that does
   * nothing and looked, with no focus ring anywhere, like a key that had been eaten.
   */
  it('gives the game surface exactly one tab stop, on the canvas', () => {
    render(<MinerApp />);
    const panel = document.getElementById('game-panel')!;
    const canvas = document.getElementById('game')!;

    expect(panel.hasAttribute('tabindex')).toBe(false);
    expect(panel.hasAttribute('autofocus')).toBe(false);
    expect([...panel.querySelectorAll('[tabindex]')].map(element => element.id)).toEqual(['game']);
    expect(canvas.getAttribute('tabindex')).toBe('0');
  });

  it('gives the canvas a name, a role that passes keys through, and instructions', () => {
    render(<MinerApp />);
    const canvas = document.getElementById('game')!;

    expect(canvas.getAttribute('role')).toBe('application');
    expect(canvas.getAttribute('aria-label')).toBe('Stalinload mine');
    // A description that points nowhere is worse than none at all.
    const description = document.getElementById(canvas.getAttribute('aria-describedby')!);
    expect(description?.textContent).toContain('WASD');
    expect(description?.textContent).toContain('Space refuels or repairs');
  });

  /**
   * The gameplay a sighted player reads off the pixels, in text. It has to be a
   * live region, and it has to be quiet: the field behind it changes only when the
   * ship crosses a threshold, never with a continuous value.
   */
  it('reports the ship state outside the canvas, in a polite live region', () => {
    render(<MinerApp />);
    const status = document.getElementById('game-status')!;

    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('At the surface depot.');

    patchHud({announcement: 'In the mine. Cargo hold full.'});
    expect(status.textContent).toBe('In the mine. Cargo hold full.');
  });

  it('uses native modal dialogs for the shop and info overlays', () => {
    render(<MinerApp />);

    const shop = dialog('shop-screen');
    const info = dialog('info-screen');
    expect(shop.tagName).toBe('DIALOG');
    expect(info.tagName).toBe('DIALOG');
    expect(shop.open).toBe(false);
    expect(info.open).toBe(false);

    act(() => { uiStore.getState().setActiveOverlay('shop'); });
    expect(shop.open).toBe(true);
    expect(document.activeElement?.id).toBe('shopCloseBtn');

    act(() => { uiStore.getState().setActiveOverlay('info'); });
    expect(info.open).toBe(true);
  });

  it('reports a close the browser performed itself back to the game', () => {
    const closeShop = vi.fn();
    const closeInfo = vi.fn();
    setUiCommands({closeShop, closeInfo});
    render(<MinerApp />);

    // What Escape reaching the UA does: the dialog closes without the store or
    // the close button being involved at all.
    act(() => { uiStore.getState().setActiveOverlay('shop'); });
    act(() => { dialog('shop-screen').close(); });
    expect(closeShop).toHaveBeenCalled();

    act(() => { uiStore.getState().setActiveOverlay('info'); });
    act(() => { dialog('info-screen').close(); });
    expect(closeInfo).toHaveBeenCalled();
  });
});

describe('one overlay at a time', () => {
  it('puts the shop away when info is opened, and restores focus for it', () => {
    installOverlayCommands();
    render(<MinerApp />);

    act(() => { fireEvent.click(document.getElementById('shopBtn')!); });
    expect(dialog('shop-screen').open).toBe(true);

    act(() => { fireEvent.click(document.getElementById('infoBtn')!); });

    expect(uiStore.getState().activeOverlay).toBe('info');
    expect(dialog('shop-screen').open).toBe(false);
    expect(dialog('info-screen').open).toBe(true);
    expect(document.activeElement?.id).toBe('infoCloseBtn');
  });

  it('ignores the close request the replaced dialog fires on its way out', () => {
    installOverlayCommands();
    render(<MinerApp />);

    // Swapping overlays closes the shop's `<dialog>`, whose `close` event asks the
    // game to clear the overlay state that info has already claimed.
    act(() => { uiStore.getState().setActiveOverlay('shop'); });
    act(() => { uiStore.getState().setActiveOverlay('info'); });

    expect(uiStore.getState().activeOverlay).toBe('info');
    expect(dialog('info-screen').open).toBe(true);
  });

  it('reopens info on its first tab and closes it from the close button', () => {
    installOverlayCommands();
    render(<MinerApp />);

    act(() => { uiStore.getState().setActiveOverlay('info'); });
    fireEvent.click(document.getElementById('info-tab-controls')!);
    expect(uiStore.getState().infoTab).toBe('info-controls');

    act(() => { fireEvent.click(document.getElementById('infoCloseBtn')!); });
    expect(uiStore.getState().activeOverlay).toBeNull();
    expect(dialog('info-screen').open).toBe(false);
    expect(document.activeElement?.id).toBe('infoBtn');

    act(() => { uiStore.getState().setActiveOverlay('info'); });
    expect(uiStore.getState().infoTab).toBe('info-objective');
  });
});

describe('closed overlays', () => {
  it('builds overlay contents only while that overlay is on screen', () => {
    render(<MinerApp />);

    for (const id of [...SHOP_CONTRACT, ...INFO_CONTRACT]) expect(document.getElementById(id), id).toBeNull();

    act(() => { uiStore.getState().setActiveOverlay('shop'); });
    for (const id of SHOP_CONTRACT) expect(document.getElementById(id), id).not.toBeNull();
    for (const id of INFO_CONTRACT) expect(document.getElementById(id), id).toBeNull();

    act(() => { uiStore.getState().setActiveOverlay('info'); });
    for (const id of SHOP_CONTRACT) expect(document.getElementById(id), id).toBeNull();
    for (const id of INFO_CONTRACT) expect(document.getElementById(id), id).not.toBeNull();

    act(() => { uiStore.getState().setActiveOverlay(null); });
    for (const id of [...SHOP_CONTRACT, ...INFO_CONTRACT]) expect(document.getElementById(id), id).toBeNull();
  });

  it('mounts only the selected info panel', () => {
    render(<MinerApp />);
    act(() => { uiStore.getState().setActiveOverlay('info'); });

    for (const {tabId, ids} of INFO_TAB_CONTRACT) {
      for (const id of ids) expect(document.getElementById(id), id).toBeNull();
      act(() => { fireEvent.click(document.getElementById(tabId)!); });
      for (const id of ids) expect(document.getElementById(id), id).not.toBeNull();
      // The panel that was up is gone, not merely hidden.
      expect(document.getElementById('cargoList')).toBeNull();
    }
  });

  /**
   * The point of unmounting: a shut overlay must not be listening to the store at
   * all, so the 60 Hz sync behind it has nothing to notify.
   */
  it('leaves no store subscriptions behind a closed overlay', () => {
    const subscribe = uiStore.subscribe;
    let live = 0;
    vi.spyOn(uiStore, 'subscribe').mockImplementation(listener => {
      live++;
      const unsubscribe = subscribe(listener);
      return () => { live--; unsubscribe(); };
    });

    render(<MinerApp />);
    const closed = live;

    act(() => { uiStore.getState().setActiveOverlay('info'); });
    expect(live).toBeGreaterThan(closed);

    act(() => { uiStore.getState().setActiveOverlay('shop'); });
    expect(live).toBeGreaterThan(closed);

    act(() => { uiStore.getState().setActiveOverlay(null); });
    expect(live).toBe(closed);
  });
});

describe('boot phase machine', () => {
  it('mounts the intro alone, then the relay panel alone, then neither', () => {
    render(<MinerApp />);

    expect(document.getElementById('intro')).not.toBeNull();
    expect(document.getElementById('lobby-screen')).toBeNull();

    act(() => { uiStore.getState().setPhase('lobby'); });
    expect(document.getElementById('intro')).toBeNull();
    for (const id of LOBBY_CONTRACT) expect(document.getElementById(id), id).not.toBeNull();
    // A real modal, so the browser contains Tab instead of letting it walk into the
    // HUD of a run that has not started.
    expect(dialog('lobby-screen').tagName).toBe('DIALOG');
    expect(dialog('lobby-screen').open).toBe(true);

    act(() => { uiStore.getState().setPhase('playing'); });
    expect(document.getElementById('intro')).toBeNull();
    expect(document.getElementById('lobby-screen')).toBeNull();
  });

  it('keeps the splash copy to the title, one tagline, the start prompt and MP', () => {
    render(<MinerApp />);

    const intro = document.getElementById('intro')!;
    expect(intro.querySelector('h2')?.textContent).toBe('Stalinload');
    expect(intro.textContent).toContain('Press Enter to start');
    // The rules live in Info / Cargo now: a wall of text here buries the prompt.
    expect(intro.querySelectorAll('li')).toHaveLength(0);
    // Two buttons and no third offer: start, and the way out to a relay.
    expect([...intro.querySelectorAll('button')].map(button => button.id)).toEqual(['introStartBtn', 'introMpBtn']);
    expect(document.getElementById('introMpBtn')?.getAttribute('aria-label')).toBe('Multiplayer');
  });

  it('starts a solo run on a press anywhere, forwarding the gesture for audio unlock', () => {
    const playSolo = vi.fn();
    setUiCommands({playSolo});
    render(<MinerApp />);

    fireEvent.pointerDown(document.getElementById('intro')!);

    expect(playSolo).toHaveBeenCalledTimes(1);
    expect(playSolo.mock.calls[0][0]).toBeInstanceOf(Event);
  });

  /**
   * The splash used to be a `role="button"` div listening for `pointerdown` alone,
   * so the click a screen reader synthesises fell on the floor. The prompt is a
   * real button now, and a click is all it takes.
   */
  it('starts a solo run from the start button a screen reader can click', () => {
    const playSolo = vi.fn();
    setUiCommands({playSolo});
    render(<MinerApp />);

    const start = document.getElementById('introStartBtn') as HTMLButtonElement;
    expect(start.tagName).toBe('BUTTON');
    expect(document.getElementById('intro')?.getAttribute('role')).toBeNull();

    fireEvent.click(start);
    expect(playSolo).toHaveBeenCalledTimes(1);
  });

  it('starts a solo run on Enter or Space wherever focus happens to be', () => {
    const playSolo = vi.fn();
    setUiCommands({playSolo});
    render(<MinerApp />);

    fireEvent.keyDown(document.body, {key: 'x'});
    expect(playSolo).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, {key: 'Enter'});
    fireEvent.keyDown(document.body, {key: ' '});
    expect(playSolo).toHaveBeenCalledTimes(2);
  });

  /**
   * The card's own handlers cover the whole screen, so both of them have to leave
   * the MP button alone — a press that bubbled, or an Enter answered for the
   * focused button, would start the solo run the player was steering away from.
   */
  it('opens the relay panel from MP without starting a run', () => {
    const playSolo = vi.fn();
    const openMultiplayer = vi.fn();
    setUiCommands({playSolo, openMultiplayer});
    render(<MinerApp />);
    const mp = document.getElementById('introMpBtn')!;

    fireEvent.keyDown(mp, {key: 'Enter'});
    expect(playSolo).not.toHaveBeenCalled();

    fireEvent.pointerDown(mp);
    fireEvent.click(mp);

    expect(playSolo).not.toHaveBeenCalled();
    expect(openMultiplayer).toHaveBeenCalledTimes(1);
    expect(openMultiplayer.mock.calls[0][0]).toBeInstanceOf(Event);
  });

  it('runs the lyric voice-over for exactly as long as the intro is mounted', () => {
    const startIntroVoice = vi.fn();
    const stopIntroVoice = vi.fn();
    setUiCommands({startIntroVoice, stopIntroVoice});
    render(<MinerApp />);

    expect(startIntroVoice).toHaveBeenCalledTimes(1);
    expect(stopIntroVoice).not.toHaveBeenCalled();

    act(() => { uiStore.getState().setPhase('lobby'); });

    expect(stopIntroVoice).toHaveBeenCalledTimes(1);
    expect(startIntroVoice).toHaveBeenCalledTimes(1);
  });

  it('stops listening for the intro keys once the relay panel takes over', () => {
    const playSolo = vi.fn();
    setUiCommands({playSolo});
    render(<MinerApp />);

    act(() => { uiStore.getState().setPhase('lobby'); });
    fireEvent.keyDown(document.body, {key: 'Enter'});

    expect(playSolo).not.toHaveBeenCalled();
  });

  /** The lobby phase is the relay panel outright: the mode picker it used to open behind is gone. */
  it('mounts the relay panel with the URL focused, and nothing else', () => {
    render(<MinerApp />);
    act(() => { uiStore.getState().setPhase('lobby'); });

    for (const id of LOBBY_CONTRACT) expect(document.getElementById(id), id).not.toBeNull();
    expect(document.getElementById('soloBtn')).toBeNull();
    expect(document.getElementById('multiplayerBtn')).toBeNull();
    expect(document.activeElement?.id).toBe('serverUrl');
  });

  it('describes the relay field with its status line, and marks it invalid on failure', () => {
    render(<MinerApp />);
    act(() => { uiStore.getState().setPhase('lobby'); });
    const field = document.getElementById('serverUrl') as HTMLInputElement;

    expect(field.getAttribute('aria-describedby')).toBe('lobbyConnectionStatus');
    expect(field.getAttribute('aria-invalid')).toBe('false');

    // Progress is not a problem with what was typed; a refused relay is.
    act(() => { uiStore.getState().setConnection('Connecting...', true); });
    expect(field.getAttribute('aria-invalid')).toBe('false');

    act(() => { uiStore.getState().setConnection(RELAY_PROBLEM_STATUS.socket, true); });
    expect(field.getAttribute('aria-invalid')).toBe('true');
  });

  /**
   * Escape steps back to the splash, and it must be the phase machine that does it:
   * left to the browser the key is a close request, which would drop the card
   * without telling anyone and leave a mine that has not started underneath.
   */
  it('takes Escape out of the browser\'s hands and steps back to the splash', () => {
    setUiCommands({leaveMultiplayer: () => uiStore.getState().setPhase('intro')});
    render(<MinerApp />);
    act(() => { uiStore.getState().setPhase('lobby'); });

    const event = new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true});
    act(() => { window.dispatchEvent(event); });

    // Refused before the browser can turn the key into a close request at all.
    expect(event.defaultPrevented).toBe(true);
    expect(document.getElementById('lobby-screen')).toBeNull();
    expect(document.getElementById('intro')).not.toBeNull();
  });

  it('keeps the keyboard on the card when the dimmed area is pressed', () => {
    render(<MinerApp />);
    act(() => { uiStore.getState().setPhase('lobby'); });
    expect(document.activeElement?.id).toBe('serverUrl');

    const press = new PointerEvent('pointerdown', {bubbles: true, cancelable: true});
    act(() => { dialog('lobby-screen').dispatchEvent(press); });

    // Cancelling the press is what stops the dialog itself from taking focus.
    expect(press.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('serverUrl');
  });

  it('connects with the entered relay URL from the button and from Enter', () => {
    const connect = vi.fn();
    setUiCommands({connect});
    render(<MinerApp />);
    act(() => { uiStore.getState().setPhase('lobby'); });

    fireEvent.change(document.getElementById('serverUrl')!, {target: {value: ' ws://relay.test '}});
    fireEvent.click(document.getElementById('connectBtn')!);
    expect(connect).toHaveBeenCalledWith('ws://relay.test');

    // Connect is the form's submit action, so Enter in the field reaches it too.
    // (happy-dom has no implicit submission, hence the direct submit event.)
    fireEvent.submit(document.getElementById('serverUrl')!.closest('form')!);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('leaves multiplayer from the Back button and from Escape', () => {
    const leaveMultiplayer = vi.fn();
    setUiCommands({leaveMultiplayer});
    render(<MinerApp />);
    act(() => { uiStore.getState().setPhase('lobby'); });

    act(() => { fireEvent.click(document.getElementById('lobbyBackBtn')!); });
    expect(leaveMultiplayer).toHaveBeenCalledTimes(1);

    act(() => { fireEvent.keyDown(document.body, {key: 'Escape'}); });
    expect(leaveMultiplayer).toHaveBeenCalledTimes(2);
  });

  it('keeps reporting connection progress while the host waits in the lobby', () => {
    render(<MinerApp />);
    act(() => { uiStore.getState().setPhase('lobby'); });

    act(() => { uiStore.getState().setConnection('Host - waiting for player', true); });

    expect(document.getElementById('lobbyConnectionStatus')?.textContent).toBe('Host - waiting for player');
  });
});

describe('store-driven HUD', () => {
  it('repaints readouts, meters and alert styling from the synced snapshot', () => {
    render(<MinerApp />);

    patchHud({cash: 1234.7, depthMeters: 420, fuel: 12.2, fuelMax: 200, cargo: 10, cargoMax: 10, fuelAlert: true, cargoAlert: true});

    expect(document.getElementById('cash')?.textContent).toBe('$1234');
    expect(document.getElementById('depth')?.textContent).toBe('420 m');
    expect(document.getElementById('fuelLabel')?.textContent).toBe('13/200');
    expect(document.getElementById('fuel')?.getAttribute('aria-valuenow')).toBe('12.2');
    expect(document.getElementById('cargoLabel')?.textContent).toBe('10/10');
    expect(document.getElementById('fuel')?.parentElement?.className).toMatch(/alert/);
    expect(document.getElementById('cargo')?.parentElement?.className).toMatch(/alert/);
    expect(document.getElementById('hull')?.parentElement?.className).not.toMatch(/alert/);
    expect(document.getElementById('fuel-warning')?.className).toMatch(/show/);
  });

  // The three bars only line up because none of them is a native `<meter>`: an
  // engine draws that one at whatever height it likes (Chrome 151 uses half the
  // element box and ignores `height` on the shadow parts), so a meter next to the
  // fuel gauge's div is a different bar in every browser.
  it('draws all three bars as the same author-owned track', () => {
    render(<MinerApp />);

    expect(document.querySelectorAll('#hud meter')).toHaveLength(0);
    const bars = ['fuel', 'hull', 'cargo'].map(id => document.getElementById(id)!);
    // Same first class on each: one `.gauge` rule, so one height for all three.
    const track = bars[0]!.classList[0];
    expect(track).toBeTruthy();
    for (const bar of bars) {
      expect(bar.classList[0]).toBe(track);
      expect(bar.getAttribute('role')).toBe('meter');
      expect(bar.getAttribute('aria-valuemax')).toBeTruthy();
    }
  });

  it('hides surface actions underground and dispatches the ones it shows', () => {
    const detonateDynamite = vi.fn();
    setUiCommands({detonateDynamite});
    render(<MinerApp />);

    patchHud({atSurface: false, dynamite: 2});

    const sell = document.getElementById('sell') as HTMLButtonElement;
    const dynamite = document.getElementById('dynamiteBtn') as HTMLButtonElement;
    expect(sell.hidden).toBe(true);
    expect(document.getElementById('shopBtn')?.hasAttribute('hidden')).toBe(true);
    expect(dynamite.hidden).toBe(false);
    expect(dynamite.textContent).toBe('Detonate (E) · x2');

    fireEvent.click(dynamite);
    expect(detonateDynamite).toHaveBeenCalledOnce();
  });

  it('prompts for the depot key only while a press would do something', () => {
    render(<MinerApp />);
    const hint = document.getElementById('surfaceHint') as HTMLElement;

    // A fully serviced ship at the depot has nothing to press Space for.
    expect(hint.hidden).toBe(true);

    patchHud({surfaceHint: 'Space: sell & refuel'});
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toBe('Space: sell & refuel');

    // It reads over the mine, not out of the button cluster: the prompt is about
    // a key, so it belongs where the other mid-run line (the fuel banner) is.
    expect(hint.closest('#hud')).toBeNull();
    expect(hint.parentElement).toBe(document.getElementById('fuel-warning')?.parentElement);

    // The shop is modal and covers the HUD, so the prompt stands down under it.
    act(() => { uiStore.getState().setActiveOverlay('shop'); });
    expect(hint.hidden).toBe(true);

    act(() => { uiStore.getState().setActiveOverlay(null); });
    expect(hint.hidden).toBe(false);

    // Underground and after a loss the game clears the line itself.
    patchHud({surfaceHint: null});
    expect(hint.hidden).toBe(true);
  });

  it('marks the gun button armed while aiming', () => {
    render(<MinerApp />);

    patchHud({atSurface: false, gunOwned: true, bullets: 3, gunArmed: true});

    const gun = document.getElementById('gunBtn') as HTMLButtonElement;
    expect(gun.className).toMatch(/armed/);
    expect(gun.getAttribute('aria-pressed')).toBe('true');
    expect(gun.textContent).toContain('AIMING');
  });

  it('paints the scanner line the game formatted, and drops it once the ship is lost', () => {
    render(<MinerApp />);

    patchHud({scanner: 'Scanner ↓: Copper — $16, 4 hits.'});
    const scanner = document.getElementById('scanner') as HTMLElement;
    expect(scanner.textContent).toBe('Scanner ↓: Copper — $16, 4 hits.');
    expect(scanner.hidden).toBe(false);

    patchHud({gameOver: true});
    expect(scanner.hidden).toBe(true);
  });

  it('paints the return-fuel forecast as the two slices of the fuel gauge', () => {
    render(<MinerApp />);
    const gauge = document.getElementById('fuel') as HTMLElement;
    const owed = document.getElementById('fuelReturn') as HTMLElement;
    const surplus = document.getElementById('fuelSurplus') as HTMLElement;

    // At the depot there is no climb to pay for, so the whole fill is surplus.
    patchHud({fuel: 100, fuelMax: 200, fuelReserveNeeded: 0, fuelReserveMargin: 100});
    expect(owed.style.width).toBe('0%');
    expect(surplus.style.width).toBe('50%');
    expect(gauge.getAttribute('aria-label')).toBe('Fuel 100/200');

    // Underground the climb home claims its share of the fill.
    patchHud({atSurface: false, fuelReserveStatus: 'caution', fuelReserveNeeded: 34, fuelReserveMargin: 66});
    expect(gauge.dataset.status).toBe('caution');
    expect(gauge.className).toMatch(/caution/);
    expect(owed.style.width).toBe('17%');
    expect(surplus.style.width).toBe('33%');
    expect(gauge.getAttribute('aria-label')).toBe('Fuel 100/200 — 66 left after climbing home');

    // A climb it can no longer pay for leaves no surplus slice at all.
    patchHud({fuel: 20, fuelReserveStatus: 'urgent', fuelReserveNeeded: 34, fuelReserveMargin: 0});
    expect(owed.style.width).toBe('10%');
    expect(surplus.style.width).toBe('0%');
    expect(gauge.className).toMatch(/urgent/);
    expect(gauge.getAttribute('aria-label')).toBe('Fuel 20/200 — climb home needs 34');
  });

  it('raises the fuel banner for a dry tank or a climb it can no longer pay for', () => {
    render(<MinerApp />);
    const banner = document.getElementById('fuel-warning') as HTMLElement;

    patchHud({atSurface: false, fuelReserveStatus: 'urgent'});
    expect(banner.className).toMatch(/show/);
    expect(banner.textContent).toContain('RETURN FUEL SPENT');

    // A dry tank is the harder stop, so it takes over the wording.
    patchHud({fuelAlert: true});
    expect(banner.textContent).toContain('LOW FUEL');

    // A disabled ship is always 'urgent'; the banner is not the place to say so.
    patchHud({fuelAlert: false, gameOver: true});
    expect(banner.className).not.toMatch(/show/);
  });

  /** Both lines claim the same spot, and the one that names the cure wins it. */
  it('yields the banner slot to the depot prompt', () => {
    render(<MinerApp />);
    const banner = document.getElementById('fuel-warning') as HTMLElement;
    const hint = document.getElementById('surfaceHint') as HTMLElement;

    patchHud({fuelAlert: true, surfaceHint: 'Space: refuel'});
    expect(hint.hidden).toBe(false);
    expect(banner.className).not.toMatch(/show/);

    // Under a modal the prompt stands down, so the warning is free to speak again.
    act(() => { uiStore.getState().setActiveOverlay('shop'); });
    expect(hint.hidden).toBe(true);
    expect(banner.className).toMatch(/show/);

    act(() => { uiStore.getState().setActiveOverlay(null); });
    patchHud({surfaceHint: null});
    expect(banner.className).toMatch(/show/);
  });

  it('captions the depth readout with the next landmark', () => {
    render(<MinerApp />);

    patchHud({depthMeters: 50, depthTarget: 'Silver', depthTargetKind: 'ore', depthTargetRemaining: 550});
    const target = document.getElementById('depthTarget') as HTMLElement;
    expect(target.textContent).toBe('↓ 550 m to Silver');
    expect(target.dataset.kind).toBe('ore');

    patchHud({depthTarget: 'Motherlode core', depthTargetKind: 'motherlode', depthTargetRemaining: 1400});
    expect(target.textContent).toBe('↓ 1400 m to Motherlode core');
    expect(target.dataset.kind).toBe('motherlode');

    // Below the core the ladder keeps rolling, so the caption must too.
    patchHud({depthTarget: '12000 m depth record', depthTargetKind: 'deep', depthTargetRemaining: 800});
    expect(target.textContent).toBe('↓ 800 m to 12000 m depth record');
    expect(target.dataset.kind).toBe('deep');
  });

  it('mutes music and sound effects from separate buttons', () => {
    const toggleMusic = vi.fn();
    const toggleSfx = vi.fn();
    setUiCommands({toggleMusic, toggleSfx});
    render(<MinerApp />);

    const music = document.getElementById('musicBtn') as HTMLButtonElement;
    const sfx = document.getElementById('sfxBtn') as HTMLButtonElement;

    // Nothing plays before the browser grants audio, so both read as muted.
    expect(music.getAttribute('aria-pressed')).toBe('false');
    expect(sfx.getAttribute('aria-pressed')).toBe('false');
    expect(sfx.textContent).toBe('🔇');

    fireEvent.click(music);
    expect(toggleMusic).toHaveBeenCalledOnce();
    expect(toggleSfx).not.toHaveBeenCalled();

    fireEvent.click(sfx);
    expect(toggleSfx).toHaveBeenCalledOnce();
    expect(toggleMusic).toHaveBeenCalledOnce();
  });

  it('paints each audio switch from its own slice of the store', () => {
    render(<MinerApp />);
    const music = document.getElementById('musicBtn') as HTMLButtonElement;
    const sfx = document.getElementById('sfxBtn') as HTMLButtonElement;

    act(() => { uiStore.getState().setMusic(true, 'Mute music'); });
    expect(music.getAttribute('aria-pressed')).toBe('true');
    expect(music.className).not.toMatch(/muted/);
    expect(music.getAttribute('aria-label')).toBe('Mute music');
    // Effects are untouched by the music switch.
    expect(sfx.getAttribute('aria-pressed')).toBe('false');
    expect(sfx.className).toMatch(/muted/);

    act(() => { uiStore.getState().setSfx(true, 'Mute sound effects'); });
    expect(sfx.getAttribute('aria-pressed')).toBe('true');
    expect(sfx.textContent).toBe('🔊');
    expect(sfx.className).not.toMatch(/muted/);
  });

  /**
   * The 60 Hz contract, now that a live region hangs off the HUD snapshot too: a
   * frame that changed nothing must not reach a single subscriber, or the ship's
   * spoken status would be re-announced sixty times a second.
   */
  it('notifies nobody when a frame changes nothing', () => {
    render(<MinerApp />);
    const notified = vi.fn();
    const unsubscribe = uiStore.subscribe(notified);
    const frame = {...uiStore.getState().hud};

    act(() => { for (let i = 0; i < 5; i++) uiStore.getState().syncHud(frame); });
    expect(notified).not.toHaveBeenCalled();

    act(() => { uiStore.getState().syncHud({...frame, announcement: 'In the mine.'}); });
    expect(notified).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  /**
   * The toast is a `role="status"` live region, so what is left in it after the
   * fade is not a cosmetic detail: an expired message that stays in the element is
   * a message a screen reader can still be handed.
   */
  it('shows the newest toast, fades the expired one out, then empties the live region', async () => {
    vi.useFakeTimers();
    try {
      render(<MinerApp />);
      const toast = document.getElementById('toast') as HTMLElement;
      expect(toast.getAttribute('role')).toBe('status');
      expect(toast.textContent).toBe('');

      act(() => { uiStore.getState().pushToast('Sold cargo for $40.'); });
      expect(toast.textContent).toBe('Sold cargo for $40.');
      expect(toast.className).toMatch(/show/);

      act(() => { uiStore.getState().pushToast('Cargo is empty.'); });
      expect(toast.textContent).toBe('Cargo is empty.');

      // The text outlives the fade-out, so the pill has something to fade with.
      act(() => { uiStore.getState().clearToasts(); });
      expect(toast.textContent).toBe('Cargo is empty.');
      expect(toast.className).not.toMatch(/show/);

      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(toast.textContent).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('inventory panel', () => {
  function slotText(): string[] {
    return [...document.querySelectorAll('#inventorySlots > li')].map(slot => slot.textContent ?? '');
  }

  it('shows every slot of the bay, empty ones included', () => {
    render(<MinerApp />);

    expect(slotText()).toEqual(['Empty', 'Empty', 'Empty', 'Empty', 'Empty']);
    expect(document.getElementById('inventoryToggleBtn')?.textContent).toContain('0/5');
  });

  it('paints the stacks the game synced, one row per kind', () => {
    render(<MinerApp />);

    act(() => {
      uiStore.getState().setInventorySlots(buildInventorySlots(
        addOre(addOre(addOre(createInventory(), ORES[0], 99)!, ORES[0], 99)!, ORES[1], 99)!
      ));
    });

    expect(slotText()).toEqual(['Coal×2', 'Copper×1', 'Empty', 'Empty', 'Empty']);
    expect(document.getElementById('inventoryToggleBtn')?.textContent).toContain('2/5');
  });

  /** Collapsing leaves the header and takes the list out of the document. */
  it('collapses to its header and back', () => {
    render(<MinerApp />);
    const toggle = document.getElementById('inventoryToggleBtn') as HTMLButtonElement;

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe('inventorySlots');

    act(() => { fireEvent.click(toggle); });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    // Nothing to point at while it is shut.
    expect(toggle.hasAttribute('aria-controls')).toBe(false);
    expect(document.getElementById('inventorySlots')).toBeNull();
    expect(document.getElementById('inventory')).not.toBeNull();

    act(() => { fireEvent.click(toggle); });
    expect(document.getElementById('inventorySlots')).not.toBeNull();
  });

  it('stands down once the ship is lost', () => {
    render(<MinerApp />);

    patchHud({gameOver: true});

    expect((document.getElementById('inventory') as HTMLElement).hidden).toBe(true);
  });

  /**
   * The scanner is deployed from the slot that holds it, so that slot — and only
   * that slot — is a control. Ore has nowhere to be placed and stays inert text.
   */
  it('makes only the scanner slot a deployment control', () => {
    const toggleScannerPlacement = vi.fn();
    setUiCommands({toggleScannerPlacement});
    render(<MinerApp />);

    act(() => {
      uiStore.getState().setInventorySlots(buildInventorySlots(
        addItem(addOre(createInventory(), ORES[0], 99)!, SCANNER_ITEM, 2)!
      ));
    });

    expect(document.querySelectorAll('#inventorySlots button')).toHaveLength(1);
    const slot = document.getElementById('scannerSlotBtn')!;
    expect(slot.textContent).toBe('Scanner×2');
    expect(slot.getAttribute('aria-pressed')).toBe('false');

    act(() => { fireEvent.click(slot); });
    expect(toggleScannerPlacement).toHaveBeenCalledOnce();

    // The armed state is the game's to report; the slot only paints it.
    act(() => { uiStore.getState().setScannerArmed(true); });
    expect(document.getElementById('scannerSlotBtn')?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('info dialog tabs', () => {
  it('shows one panel at a time and moves selection on click', () => {
    render(<MinerApp />);
    act(() => { uiStore.getState().setActiveOverlay('info'); });

    expect(document.getElementById('info-objective')).not.toBeNull();
    expect(document.getElementById('info-stats')).toBeNull();

    act(() => { fireEvent.click(document.getElementById('info-tab-stats')!); });

    expect(document.getElementById('info-stats')).not.toBeNull();
    expect(document.getElementById('info-objective')).toBeNull();
    expect(document.getElementById('info-tab-stats')?.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('info-tab-objective')?.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement?.id).toBe('info-tab-stats');
  });

  it('roves focus with the arrow keys and selects with Enter', () => {
    render(<MinerApp />);
    act(() => { uiStore.getState().setActiveOverlay('info'); });

    const first = document.getElementById('info-tab-objective')!;
    fireEvent.keyDown(first, {key: 'ArrowRight'});
    expect(document.activeElement?.id).toBe('info-tab-stats');
    // Roving focus alone must not change the visible panel.
    expect(document.getElementById('info-objective')).not.toBeNull();

    act(() => { fireEvent.keyDown(document.activeElement!, {key: 'Enter'}); });
    expect(document.getElementById('info-stats')).not.toBeNull();

    fireEvent.keyDown(document.activeElement!, {key: 'End'});
    expect(document.activeElement?.id).toBe('info-tab-settings');
  });
});

describe('settings tab', () => {
  function openSettings(): void {
    render(<MinerApp />);
    act(() => { uiStore.getState().setActiveOverlay('info'); });
    act(() => { fireEvent.click(document.getElementById('info-tab-settings')!); });
  }

  /** The same two commands the HUD buttons dispatch, not a second audio path. */
  it('mutes music and sound effects through the shared audio commands', () => {
    const toggleMusic = vi.fn();
    const toggleSfx = vi.fn();
    setUiCommands({toggleMusic, toggleSfx});
    openSettings();

    const music = document.getElementById('settingsMusicBtn') as HTMLButtonElement;
    const sfx = document.getElementById('settingsSfxBtn') as HTMLButtonElement;
    expect(music.getAttribute('aria-pressed')).toBe('false');
    expect(music.textContent).toBe('Muted');

    fireEvent.click(music);
    expect(toggleMusic).toHaveBeenCalledOnce();
    expect(toggleSfx).not.toHaveBeenCalled();

    fireEvent.click(sfx);
    expect(toggleSfx).toHaveBeenCalledOnce();

    // The HUD switch and this one read the same slice, so muting is one state.
    act(() => { uiStore.getState().setMusic(true, 'Mute music'); });
    expect(music.getAttribute('aria-pressed')).toBe('true');
    expect(music.textContent).toBe('On');
    expect(music.getAttribute('aria-label')).toBe('Mute music');
    expect(document.getElementById('musicBtn')?.getAttribute('aria-pressed')).toBe('true');
    expect(sfx.getAttribute('aria-pressed')).toBe('false');
  });

  it('never resets on the first press, and only resets once confirmed', () => {
    const resetGame = vi.fn();
    setUiCommands({resetGame});
    openSettings();

    act(() => { fireEvent.click(document.getElementById('resetGameBtn')!); });
    expect(resetGame).not.toHaveBeenCalled();

    // The trigger is gone, and what replaces it in that spot — and on the
    // keyboard — is Cancel, not the button that goes through with it.
    expect(document.getElementById('resetGameBtn')).toBeNull();
    expect(document.activeElement?.id).toBe('resetGameCancelBtn');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('permanently deletes');

    act(() => { fireEvent.click(document.getElementById('resetGameConfirmBtn')!); });
    expect(resetGame).toHaveBeenCalledOnce();
  });

  it('cancels the pending confirm from the Cancel button and by leaving the tab', () => {
    const resetGame = vi.fn();
    setUiCommands({resetGame});
    openSettings();

    act(() => { fireEvent.click(document.getElementById('resetGameBtn')!); });
    act(() => { fireEvent.click(document.getElementById('resetGameCancelBtn')!); });
    expect(document.getElementById('resetGameConfirmBtn')).toBeNull();
    expect(document.getElementById('resetGameBtn')).not.toBeNull();

    // An armed confirm must not be waiting when the tab is opened again.
    act(() => { fireEvent.click(document.getElementById('resetGameBtn')!); });
    act(() => { fireEvent.click(document.getElementById('info-tab-controls')!); });
    act(() => { fireEvent.click(document.getElementById('info-tab-settings')!); });

    expect(document.getElementById('resetGameConfirmBtn')).toBeNull();
    expect(document.getElementById('resetGameBtn')).not.toBeNull();
    expect(resetGame).not.toHaveBeenCalled();
  });
});

describe('developer tooling gate', () => {
  it('omits the developer tab, cheats and resets by default', () => {
    render(<MinerApp />);

    expect(document.getElementById('info-developer')).toBeNull();
    expect(document.getElementById('info-tab-developer')).toBeNull();
    expect(document.getElementById('developerUpgrades')).toBeNull();
    expect(document.getElementById('resetPlayerDataBtn')).toBeNull();
    expect(document.getElementById('resetWorldStateBtn')).toBeNull();
    expect(document.querySelector('[data-developer-cash]')).toBeNull();
  });

  it('renders the isolated developer panel with the explicit opt-in', () => {
    const grantDeveloperUpgrade = vi.fn();
    const runDeveloperService = vi.fn();
    setUiCommands({grantDeveloperUpgrade, runDeveloperService});
    render(<MinerApp developerToolsEnabled />);
    act(() => { uiStore.getState().setActiveOverlay('info'); });

    expect(document.getElementById('info-tab-developer')).not.toBeNull();
    // The panel is a tab of its own, so nothing of it exists until it is selected.
    expect(document.getElementById('resetPlayerDataBtn')).toBeNull();
    act(() => { fireEvent.click(document.getElementById('info-tab-developer')!); });

    expect(document.getElementById('resetPlayerDataBtn')).not.toBeNull();
    expect(document.getElementById('resetWorldStateBtn')).not.toBeNull();
    // Reset actions stay inside the developer panel, after the cheat controls.
    const panel = document.getElementById('info-developer')!;
    expect(panel.contains(document.getElementById('resetWorldStateBtn'))).toBe(true);

    // A full ship leaves the free services disabled; a granted upgrade dispatches.
    expect(document.querySelector<HTMLButtonElement>('[data-developer-service="fuel"]')?.disabled).toBe(true);
    fireEvent.click(document.querySelector<HTMLButtonElement>('[data-developer-upgrade="cargo"]')!);
    expect(grantDeveloperUpgrade).toHaveBeenCalledWith('cargo');

    act(() => { uiStore.getState().syncPlayer({...uiStore.getState().player, fuel: 10}); });
    expect(document.querySelector<HTMLButtonElement>('[data-developer-service="fuel"]')?.disabled).toBe(false);
    fireEvent.click(document.querySelector<HTMLButtonElement>('[data-developer-service="fuel"]')!);
    expect(runDeveloperService).toHaveBeenCalledWith('fuel');
  });

  it('adds the developer tab to the navigation without disturbing the others', () => {
    render(<MinerApp developerToolsEnabled />);
    act(() => { uiStore.getState().setActiveOverlay('info'); });

    const tabs = [...document.querySelectorAll('[role="tab"]')].map(tab => tab.id);
    expect(tabs).toEqual([
      'info-tab-objective',
      'info-tab-stats',
      'info-tab-developer',
      'info-tab-prospecting',
      'info-tab-hazards',
      'info-tab-controls',
      'info-tab-settings'
    ]);
    expect(uiCommands.openInfo).toBeTypeOf('function');
  });
});
