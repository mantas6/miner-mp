// @vitest-environment happy-dom
//
// Behaviour of the app shell: the DOM contract the game runtime and the keyboard
// layer still depend on, store-driven HUD updates, tab switching, toasts, and the
// developer-tools gate. Copy is not asserted here — it lives in one place now and
// is checked where it is produced (core/shop-catalog, core/stats, core/objective).

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setUiCommands, uiCommands } from './commands';
import { uiStore, type HudSnapshot } from './store';
import { MinerApp } from './ui';

/** Ids the game runtime, the keyboard layer, and the tests address directly. */
const DOM_CONTRACT = [
  'shell', 'game-panel', 'game',
  'hud', 'musicBtn', 'sfxBtn', 'connectionStatus', 'cash', 'depth', 'depthTarget', 'scanner',
  'fuel', 'fuelLabel', 'fuelReserve', 'fuelReserveLabel', 'hull', 'hullLabel', 'cargo', 'cargoLabel', 'extractionStatus',
  'sell', 'shopBtn', 'dynamiteBtn', 'teleporterBtn', 'gunBtn', 'infoBtn',
  'shop-screen', 'shop-card', 'shopCloseBtn',
  'fuelBtn', 'repairBtn', 'cargoBtn', 'tankBtn', 'hullBtn', 'drillBtn', 'visibilityBtn',
  'shopDynamiteBtn', 'shopTeleporterBtn', 'shopGunBtn', 'shopBulletsBtn',
  'info-screen', 'info-card', 'infoCloseBtn', 'objectiveInfoStatus', 'extractionInfoStatus',
  'cargoList', 'expeditionStats', 'prospectingGuide', 'dangerGuide',
  'fuel-warning', 'toast'
];

/** Ids that only exist in one phase, because only that overlay is mounted. */
const LOBBY_CONTRACT = ['lobby-screen', 'serverUrl', 'lobbyConnectionStatus', 'connectBtn', 'soloBtn'];

const pristine = {...uiStore.getState()};
const pristineCommands = {...uiCommands};

function patchHud(patch: Partial<HudSnapshot>): void {
  act(() => {
    uiStore.getState().syncHud({...uiStore.getState().hud, ...patch});
  });
}

beforeEach(() => {
  uiStore.setState(pristine);
});

afterEach(() => {
  cleanup();
  setUiCommands(pristineCommands);
});

describe('app shell', () => {
  it('renders every DOM hook the game runtime still addresses', () => {
    render(<MinerApp />);

    for (const id of DOM_CONTRACT) expect(document.getElementById(id), id).not.toBeNull();
  });

  it('uses native modal dialogs for the shop and info overlays', () => {
    render(<MinerApp />);

    const shop = document.getElementById('shop-screen') as HTMLDialogElement;
    const info = document.getElementById('info-screen') as HTMLDialogElement;
    expect(shop.tagName).toBe('DIALOG');
    expect(info.tagName).toBe('DIALOG');
    expect(shop.open).toBe(false);
    expect(info.open).toBe(false);

    act(() => { uiStore.getState().setShopOpen(true); });
    expect(shop.open).toBe(true);
    expect(document.activeElement?.id).toBe('shopCloseBtn');

    act(() => { uiStore.getState().setInfoOpen(true); });
    expect(info.open).toBe(true);
  });
});

describe('boot phase machine', () => {
  it('mounts the intro alone, then the lobby alone, then neither', () => {
    render(<MinerApp />);

    expect(document.getElementById('intro')).not.toBeNull();
    expect(document.getElementById('lobby-screen')).toBeNull();

    act(() => { uiStore.getState().setPhase('lobby'); });
    expect(document.getElementById('intro')).toBeNull();
    for (const id of LOBBY_CONTRACT) expect(document.getElementById(id), id).not.toBeNull();

    act(() => { uiStore.getState().setPhase('playing'); });
    expect(document.getElementById('intro')).toBeNull();
    expect(document.getElementById('lobby-screen')).toBeNull();
  });

  it('dismisses the intro on a press, forwarding the gesture for audio unlock', () => {
    const dismissIntro = vi.fn();
    setUiCommands({dismissIntro});
    render(<MinerApp />);

    fireEvent.pointerDown(document.getElementById('intro')!);

    expect(dismissIntro).toHaveBeenCalledTimes(1);
    expect(dismissIntro.mock.calls[0][0]).toBeInstanceOf(Event);
  });

  it('dismisses the intro on Enter or Space wherever focus happens to be', () => {
    const dismissIntro = vi.fn();
    setUiCommands({dismissIntro});
    render(<MinerApp />);

    fireEvent.keyDown(document.body, {key: 'x'});
    expect(dismissIntro).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, {key: 'Enter'});
    fireEvent.keyDown(document.body, {key: ' '});
    expect(dismissIntro).toHaveBeenCalledTimes(2);
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

  it('stops listening for the intro keys once the lobby takes over', () => {
    const dismissIntro = vi.fn();
    setUiCommands({dismissIntro});
    render(<MinerApp />);

    act(() => { uiStore.getState().setPhase('lobby'); });
    fireEvent.keyDown(document.body, {key: 'Enter'});

    expect(dismissIntro).not.toHaveBeenCalled();
  });

  it('dispatches the lobby choices with the entered relay URL', () => {
    const connect = vi.fn();
    const playSolo = vi.fn();
    setUiCommands({connect, playSolo});
    render(<MinerApp />);
    act(() => { uiStore.getState().setPhase('lobby'); });

    fireEvent.change(document.getElementById('serverUrl')!, {target: {value: ' ws://relay.test '}});
    fireEvent.click(document.getElementById('connectBtn')!);
    expect(connect).toHaveBeenCalledWith('ws://relay.test');

    fireEvent.click(document.getElementById('soloBtn')!);
    expect(playSolo).toHaveBeenCalled();
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
    expect(document.getElementById('fuel')?.getAttribute('value')).toBe('12.2');
    expect(document.getElementById('cargoLabel')?.textContent).toBe('10/10');
    expect(document.getElementById('fuel')?.parentElement?.className).toMatch(/alert/);
    expect(document.getElementById('cargo')?.parentElement?.className).toMatch(/alert/);
    expect(document.getElementById('hull')?.parentElement?.className).not.toMatch(/alert/);
    expect(document.getElementById('fuel-warning')?.className).toMatch(/show/);
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

  it('shows the return-fuel forecast underground only, with its status decision', () => {
    render(<MinerApp />);
    const reserve = document.getElementById('fuelReserve') as HTMLElement;

    // At the depot there is no climb to reserve fuel for.
    expect(reserve.hidden).toBe(true);

    patchHud({atSurface: false, fuelReserveStatus: 'caution', fuelReserveMargin: 7, fuelReserveNeeded: 34});
    expect(reserve.hidden).toBe(false);
    expect(reserve.dataset.status).toBe('caution');
    expect(reserve.className).toMatch(/caution/);
    expect(document.getElementById('fuelReserveLabel')?.textContent).toBe('7 after climb');

    // Urgent stops reporting a margin and reports the shortfall instead.
    patchHud({fuelReserveStatus: 'urgent', fuelReserveMargin: 0, fuelReserveNeeded: 34});
    expect(document.getElementById('fuelReserveLabel')?.textContent).toBe('needs 34');
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

  it('captions the depth readout with the next landmark', () => {
    render(<MinerApp />);

    patchHud({depthMeters: 50, depthTarget: 'Silver', depthTargetKind: 'ore', depthTargetRemaining: 550});
    const target = document.getElementById('depthTarget') as HTMLElement;
    expect(target.textContent).toBe('↓ 550 m to Silver');
    expect(target.dataset.kind).toBe('ore');

    patchHud({depthTarget: 'Motherlode core', depthTargetKind: 'motherlode', depthTargetRemaining: 0});
    expect(target.textContent).toBe('↓ 0 m to Motherlode core');
    expect(target.dataset.kind).toBe('motherlode');
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

  it('shows the newest toast and fades the expired one out without clearing it', () => {
    render(<MinerApp />);
    const toast = document.getElementById('toast') as HTMLElement;

    act(() => { uiStore.getState().pushToast('Sold cargo for $40.'); });
    expect(toast.textContent).toBe('Sold cargo for $40.');
    expect(toast.className).toMatch(/show/);

    act(() => { uiStore.getState().pushToast('Cargo is empty.'); });
    expect(toast.textContent).toBe('Cargo is empty.');

    act(() => { uiStore.setState({toasts: []}); });
    expect(toast.textContent).toBe('Cargo is empty.');
    expect(toast.className).not.toMatch(/show/);
  });
});

describe('info dialog tabs', () => {
  it('shows one panel at a time and moves selection on click', () => {
    render(<MinerApp />);
    act(() => { uiStore.getState().setInfoOpen(true); });

    expect(document.getElementById('info-objective')?.hidden).toBe(false);
    expect(document.getElementById('info-stats')?.hidden).toBe(true);

    fireEvent.click(document.getElementById('info-tab-stats')!);

    expect(document.getElementById('info-stats')?.hidden).toBe(false);
    expect(document.getElementById('info-objective')?.hidden).toBe(true);
    expect(document.getElementById('info-tab-stats')?.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('info-tab-objective')?.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement?.id).toBe('info-tab-stats');
  });

  it('roves focus with the arrow keys and selects with Enter', () => {
    render(<MinerApp />);
    act(() => { uiStore.getState().setInfoOpen(true); });

    const first = document.getElementById('info-tab-objective')!;
    fireEvent.keyDown(first, {key: 'ArrowRight'});
    expect(document.activeElement?.id).toBe('info-tab-stats');
    // Roving focus alone must not change the visible panel.
    expect(document.getElementById('info-objective')?.hidden).toBe(false);

    fireEvent.keyDown(document.activeElement!, {key: 'Enter'});
    expect(document.getElementById('info-stats')?.hidden).toBe(false);

    fireEvent.keyDown(document.activeElement!, {key: 'End'});
    expect(document.activeElement?.id).toBe('info-tab-controls');
  });

  it('reopens on the first tab and dispatches close from the close button', () => {
    const closeInfo = vi.fn(() => { uiStore.getState().setInfoOpen(false); });
    setUiCommands({closeInfo});
    render(<MinerApp />);

    act(() => { uiStore.getState().setInfoOpen(true); });
    fireEvent.click(document.getElementById('info-tab-controls')!);
    fireEvent.click(document.getElementById('infoCloseBtn')!);
    expect(closeInfo).toHaveBeenCalled();

    act(() => { uiStore.getState().setInfoOpen(true); });
    expect(document.getElementById('info-objective')?.hidden).toBe(false);
    expect(uiStore.getState().infoTab).toBe('info-objective');
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
    act(() => { uiStore.getState().setInfoOpen(true); });

    expect(document.getElementById('info-tab-developer')).not.toBeNull();
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

    const tabs = [...document.querySelectorAll('[role="tab"]')].map(tab => tab.id);
    expect(tabs).toEqual([
      'info-tab-objective',
      'info-tab-stats',
      'info-tab-developer',
      'info-tab-prospecting',
      'info-tab-hazards',
      'info-tab-controls'
    ]);
    expect(uiCommands.openInfo).toBeTypeOf('function');
  });
});
