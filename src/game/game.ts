// Game orchestrator: owns the singletons (state, audio, renderer), wires the
// feature modules together, and runs the fixed-step loop.
//
// Anything with a life of its own lives next door: `session.ts` (relay session),
// `enemies.ts` (enemy simulation), `actions.ts` (player transactions),
// `move.ts` (one step of the ship), `run.ts` (run lifecycle and death),
// `input.ts` (keyboard), `world-grid.ts` (tile access). What stays here is the
// glue those modules share — progress saving, particles, the HUD and screens,
// and the loop itself.

import { START_Y, SURFACE_HEIGHT, WORLD_W } from '../../shared/constants';
import { canvas, gamePanel, showToast as toast, ui } from './dom';
import { viewport } from './viewport';
import { createAudio } from '../audio/audio';
import { shouldAttemptAutoAudio } from '../audio/audio-permission';
import { createDefaultStats, createInitialState } from '../core/state';
import { createRenderer, type Renderer } from '../render/renderer';
import { FUEL, ECONOMY } from '../core/balance';
import { cargoCost, tankCost, hullCost, drillCost, visibilityCost, cargoValue } from '../core/economy';
import { shouldCargoBarFlash, shouldFuelBarFlash, shouldHullBarFlash } from '../core/hud-alerts';
import { formatExpeditionObjective } from '../core/objective';
import { load, save } from '../persistence';
import { formatExpeditionStats } from '../core/stats';
import { rand } from '../world/world';
import { getInfoNavigationSection, getInfoTabFocusTarget } from '../ui/info-navigation';

import { formatExtractionPresentation } from '../core/extraction-presentation';
import { interpolateRemotePlayers } from '../net/net-protocol';
import { loadServerUrl, saveServerUrl } from '../net/multiplayer-settings';
import { MIN_TELEPORT_DEPTH_METERS, advanceTeleportEffect, canTeleportToSurface, canUseTeleporter } from '../core/teleporter';
import type { AudioController, Ore } from '../core/types';
import { applyPlayerUpgrade, updateDeveloperUpgradeControls, type PlayerUpgradeId } from '../core/upgrades';
import { updateShopControls } from './shop';
import { revealFootprint } from '../../shared/exploration-codec';
import { confirmPlayerDataReset, resetPlayerData } from '../core/player-data-reset';
import { DEVELOPER_CASH_GRANT, developerRefuel, developerRepairHull, grantDeveloperCash, updateDeveloperServiceControls, type DeveloperServiceId } from '../core/developer';
import { confirmWorldStateReset } from '../world/world-state';
import { createFixedStepper } from '../core/fixed-step';
import { createWorldGrid, type WorldGrid } from './world-grid';
import { createSession, type GameSession } from './session';
import { createEnemySim, type EnemySim } from './enemies';
import { createActions, type GameActions } from './actions';
import { createMovement } from './move';
import { createRun, type GameRun } from './run';
import { createInput, type GameInput } from './input';

const state = createInitialState();
let audio: AudioController;
let renderer: Renderer | undefined;
let developerToolsEnabled = false;

// Feature modules, constructed in initGame() once the audio/DOM singletons exist.
let grid: WorldGrid;
let session: GameSession;
let enemies: EnemySim;
let actions: GameActions;
let run: GameRun;
let gameInput: GameInput;

state.stats = createDefaultStats();

function loadProgress() { load(state); renderer?.invalidateFog(); }

function saveProgress() { save(state); }

/** A trailing-edge debounce, so a long tunnel does not save on every tile. */
function createDebouncedSave(flush: () => void, delayMs: number) {
  let timer = 0;
  return {
    schedule(){ clearTimeout(timer); timer = window.setTimeout(flush, delayMs); },
    cancel(){ clearTimeout(timer); }
  };
}
const explorationSave = createDebouncedSave(saveProgress, 500);

// Fog is cached per chunk, so every newly explored tile has to mark its chunk dirty.
function invalidateFogTiles(indexes: number[]) {
  for (const index of indexes) renderer?.invalidateFog(index % WORLD_W, Math.floor(index / WORLD_W));
}
function revealAtPlayer(broadcast=true) {
  const added = revealFootprint(state.exploredTiles, state.player.x, state.player.y, state.player.visibility);
  if (!added.length) return;
  invalidateFogTiles(added);
  if (broadcast) session.broadcastExploration();
  explorationSave.schedule();
}

function addCash(amount: number) {
  state.cash += amount;
  if (amount > 0) state.stats.totalCashEarned += amount;
  saveProgress();
}

function cargoUsed(){ return state.player.cargo.length; }
function currentCargoValue(){ return cargoValue(state.player.cargo); }
function atSurface(){ return state.player.y < SURFACE_HEIGHT; }

function spawnDust(x: number, y: number, color='#9d6a42', amount=10){
  for (let i=0;i<amount;i++) state.particles.push({x:x+0.5,y:y+0.5,vx:(Math.random()-.5)*.08,vy:(Math.random()-.7)*.09,life:22+Math.random()*18,color,size:.035+Math.random()*.045});
}
function spawnExplosion(x: number, y: number){
  const colors = ['#ffec8b','#ff9f1c','#ff4d2d','#7a1f16','#d7e7ff'];
  for (let i=0;i<70;i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = .035 + Math.random() * .16;
    state.particles.push({x:x+0.5,y:y+0.5,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-.04,life:34+Math.random()*34,color:colors[i%colors.length],size:.045+Math.random()*.085});
  }
}
function spawnShotTrail(path: {x: number; y: number}[]){
  const stride = state.reducedMotion ? 3 : 1;
  for (let index=0; index<path.length; index+=stride) {
    const point = path[index];
    state.particles.push({
      x:point.x+.46, y:point.y+.46,
      vx:state.reducedMotion ? 0 : (Math.random()-.5)*.025,
      vy:state.reducedMotion ? 0 : (Math.random()-.5)*.025,
      life:state.reducedMotion ? 7 : 15,
      color:'#ffe58a', size:.09
    });
  }
}

// --- Developer tools ------------------------------------------------------
function grantDeveloperUpgrade(id: PlayerUpgradeId){
  if (!developerToolsEnabled || !ui.developerUpgrades) return;
  if (!applyPlayerUpgrade(state.player, id)) return toast('Developer upgrade already at maximum level.');
  if (id === 'visibility') revealAtPlayer();
  saveProgress();
  updateDeveloperUpgradeControls(ui.developerUpgrades, state.player);
  toast('Developer action: upgrade granted for $0.');
}
function grantDeveloperMoney(){
  if (!developerToolsEnabled) return;
  grantDeveloperCash(state);
  saveProgress();
  ui.cash.textContent = `$${Math.floor(state.cash)}`;
  toast(`Developer action: +$${DEVELOPER_CASH_GRANT.toLocaleString('en-US')} granted.`);
}
function runDeveloperService(id: DeveloperServiceId){
  if (!developerToolsEnabled) return;
  const changed = id === 'fuel'
    ? developerRefuel(state.player)
    : developerRepairHull(state.player);
  if (!changed) return toast(id === 'fuel' ? 'Fuel tank already full.' : 'Hull already at full strength.');
  saveProgress();
  hud();
  toast(id === 'fuel' ? 'Developer action: refueled for $0.' : 'Developer action: hull repaired for $0.');
}

// --- Screens and HUD -----------------------------------------------------
function selectInfoTab(id: string, focusTab=false){
  const selected = getInfoNavigationSection(id, developerToolsEnabled);
  if (!selected) return;
  for (const section of ui.infoScreen.querySelectorAll<HTMLElement>('[role="tabpanel"]')) {
    section.hidden = section.id !== selected.id;
  }
  for (const tab of ui.infoScreen.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
    const active = tab.dataset.infoSection === selected.id;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focusTab) tab.focus({preventScroll:true});
  }
  ui.infoCard.scrollTop = 0;
}
function bindButtons(){
  ui.sell.onclick = () => actions.sell();
  ui.fuelBtn.onclick = () => actions.refuel();
  ui.repairBtn.onclick = () => actions.repair();
  ui.cargoBtn.onclick = () => actions.buyUpgrade('cargo', cargoCost(state.player), 'Cargo bay expanded.');
  ui.tankBtn.onclick = () => actions.buyUpgrade('tank', tankCost(state.player), 'Fuel tank upgraded.');
  ui.hullBtn.onclick = () => actions.buyUpgrade('hull', hullCost(state.player), 'Hull reinforced.');
  ui.drillBtn.onclick = () => actions.buyUpgrade('drill', drillCost(state.player), 'Drill power increased.');
  ui.visibilityBtn.onclick = () => actions.buyUpgrade('visibility', visibilityCost(state.player), 'Sensor footprint expanded.');
  ui.dynamiteBtn.onclick = () => actions.detonateDynamite();
  ui.teleporterBtn.onclick = () => actions.useTeleporter();
  ui.gunBtn.onclick = () => actions.setGunArmed(!state.input.gunArmed);
  ui.shopDynamiteBtn.onclick = () => actions.buyDynamite();
  ui.shopTeleporterBtn.onclick = () => actions.buyTeleporter();
  ui.shopGunBtn.onclick = () => actions.buyGun();
  ui.shopBulletsBtn.onclick = () => actions.buyBullets();
  ui.soundBtn.addEventListener('pointerdown', e => e.stopPropagation());
  ui.soundBtn.onclick = e => { e.stopPropagation(); audio.toggle(); };
  ui.infoBtn.onclick = e => { e.stopPropagation(); openInfoScreen(); };
  ui.infoCloseBtn.onclick = e => { e.stopPropagation(); closeInfoScreen(); };
  if (developerToolsEnabled && ui.resetPlayerDataBtn) ui.resetPlayerDataBtn.onclick = e => {
    e.stopPropagation();
    if (!confirmPlayerDataReset(message => window.confirm(message))) return;
    explorationSave.cancel();
    session.resetForPlayerData();
    gameInput.clearKeys();
    resetPlayerData(state);
    revealAtPlayer(false);
    explorationSave.cancel();
    saveProgress();
    session.setConnectionStatus('Solo');
    closeInfoScreen();
    toast('Player data reset. Shared mine terrain preserved.');
  };
  if (developerToolsEnabled && ui.resetWorldStateBtn) ui.resetWorldStateBtn.onclick = e => {
    e.stopPropagation();
    if (!confirmWorldStateReset(message => window.confirm(message))) return;
    if (!session.requestWorldReset()) {
      run.clearWorldRuntime();
      saveProgress();
      toast('World state reset locally. Player progress preserved.');
    }
    closeInfoScreen();
  };
  ui.shopBtn.onclick = e => { e.stopPropagation(); openShopScreen(); };
  ui.shopCloseBtn.onclick = e => { e.stopPropagation(); closeShopScreen(); };
  ui.shopScreen.addEventListener('pointerdown', e => { if (e.target === ui.shopScreen) closeShopScreen(); });
  ui.infoScreen.addEventListener('pointerdown', e => { if (e.target === ui.infoScreen) closeInfoScreen(); });
  ui.infoScreen.addEventListener('click', e => {
    const target = e.target as Element;
    const cashButton = developerToolsEnabled && target.closest<HTMLButtonElement>('[data-developer-cash]');
    if (cashButton) {
      grantDeveloperMoney();
      return;
    }
    const serviceButton = developerToolsEnabled && target.closest<HTMLButtonElement>('[data-developer-service]');
    if (serviceButton) {
      runDeveloperService(serviceButton.dataset.developerService as DeveloperServiceId);
      return;
    }
    const developerButton = developerToolsEnabled && target.closest<HTMLButtonElement>('[data-developer-upgrade]');
    if (developerButton) {
      grantDeveloperUpgrade(developerButton.dataset.developerUpgrade as PlayerUpgradeId);
      return;
    }
    const button = target.closest<HTMLButtonElement>('[role="tab"]');
    if (!button) return;
    selectInfoTab(button.dataset.infoSection || '', true);
  });
  ui.infoScreen.addEventListener('keydown', e => {
    const tab = (e.target as Element).closest<HTMLButtonElement>('[role="tab"]');
    if (!tab) return;
    const key = e.key.toLowerCase();
    if (key === 'enter' || key === ' ') {
      selectInfoTab(tab.dataset.infoSection || '', true);
      e.preventDefault();
      return;
    }
    const target = getInfoTabFocusTarget(tab.dataset.infoSection || '', key, developerToolsEnabled);
    if (!target) return;
    const targetTab = document.getElementById(target.tabId) as HTMLButtonElement | null;
    targetTab?.focus({preventScroll:true});
    e.preventDefault();
  });
}
function openShopScreen(){
  if (!atSurface()) return toast('Shop is at the surface depot.');
  updateShopControls(ui.shopCard, state.player, state.cash, true);
  state.input.gunArmed = false;
  ui.shopScreen.classList.remove('hidden');
  ui.shopCard.scrollTop = 0;
  ui.shopCloseBtn.focus({preventScroll:true});
}
function closeShopScreen(){
  ui.shopScreen.classList.add('hidden');
  ui.shopBtn.focus({preventScroll:true});
}
function openInfoScreen(){
  ui.infoScreen.classList.remove('hidden');
  renderCargoDetails();
  renderExpeditionStats();
  if (developerToolsEnabled && ui.developerUpgrades) {
    updateDeveloperServiceControls(ui.developerUpgrades, state.player);
    updateDeveloperUpgradeControls(ui.developerUpgrades, state.player);
  }
  selectInfoTab('info-objective');
  ui.infoCloseBtn.focus({preventScroll:true});
}
function closeInfoScreen(){
  ui.infoScreen.classList.add('hidden');
  ui.infoBtn.focus({preventScroll:true});
}
function renderCargoDetails(){
  const counts = new Map<string, {ore: Ore; count: number}>();
  for (const ore of state.player.cargo) {
    const entry = counts.get(ore.name) || {ore, count: 0};
    entry.count++;
    counts.set(ore.name, entry);
  }
  ui.cargoList.innerHTML = counts.size ? [...counts.values()].map(({ore, count}) => `
      <li>
        <span class="ore-icon" style="background:${ore.color}"></span>
        <span class="ore-name">${ore.name}</span>
        <span class="ore-count">× ${count}</span>
        <span class="ore-value">$${ore.value * count}</span>
      </li>`).join('') : '<li class="empty-cargo">Cargo bay empty</li>';
}
function renderExpeditionStats(){
  ui.expeditionStats.innerHTML = formatExpeditionStats(state.stats).map(row => `
      <li>
        <span class="stat-label">${row.label}</span>
        <strong>${row.value}</strong>
        <span class="stat-detail">${row.detail}</span>
      </li>`).join('');
}
function updateButtonStates(){
  const p = state.player, surf = atSurface();
  ui.sell.hidden = !surf;
  ui.shopBtn.hidden = !surf;
  ui.dynamiteBtn.hidden = surf;
  ui.teleporterBtn.hidden = surf && !state.teleportReturnPosition;
  ui.gunBtn.hidden = surf || !p.gunOwned;
  ui.sell.disabled = !surf || currentCargoValue() <= 0;
  ui.dynamiteBtn.textContent = `Detonate (E) · x${p.dynamite}`;
  ui.teleporterBtn.textContent = surf ? 'Return (T)' : canTeleportToSurface(p.y) ? `Teleport (T) · x${p.teleporters}` : `Teleport at ${MIN_TELEPORT_DEPTH_METERS} m (T) · x${p.teleporters}`;
  ui.gunBtn.textContent = state.input.gunArmed ? `AIMING — press direction · x${p.bullets}` : `Arm Gun (G) · x${p.bullets}`;
  ui.gunBtn.classList.toggle('armed', state.input.gunArmed);
  ui.gunBtn.setAttribute('aria-pressed', String(state.input.gunArmed));
  ui.dynamiteBtn.disabled = surf || p.dynamite <= 0 || state.gameOver;
  ui.teleporterBtn.disabled = state.gameOver || !canUseTeleporter(p, state.teleportReturnPosition);
  ui.gunBtn.disabled = surf || !p.gunOwned || p.bullets <= 0 || state.gameOver;
  if (!ui.shopScreen.classList.contains('hidden')) updateShopControls(ui.shopCard, p, state.cash, surf);
}
function updateAnimation(){
  const p = state.player;
  p.drawX += (p.x - p.drawX) * 0.23;
  p.drawY += (p.y - p.drawY) * 0.23;
  p.bob *= 0.86;
  p.drillAnim *= 0.90;
  state.remotePlayers = interpolateRemotePlayers(state.remotePlayers, 0.23);
  state.teleportEffect = advanceTeleportEffect(state.teleportEffect);
  const targetCamX = Math.max(0, Math.min(WORLD_W-viewport.tilesX, p.drawX - viewport.tilesX/2 + 0.5));
  const targetCamY = Math.max(0, p.drawY - viewport.tilesY/2 + 0.5);
  state.camX += (targetCamX - state.camX) * 0.12;
  state.camY += (targetCamY - state.camY) * 0.12;
  state.particles = state.particles.filter(pt => {
    pt.x += pt.vx; pt.y += pt.vy; pt.vy += .003; pt.life -= 1;
    return pt.life > 0;
  });
}
function hud(){
  const p=state.player;
  ui.cash.textContent = `$${Math.floor(state.cash)}`;
  ui.depth.textContent=`${Math.max(0, p.y - START_Y) * 10} m`;
  ui.fuel.max=p.fuelMax; ui.fuel.value=Math.max(0,p.fuel);
  ui.hull.max=p.hullMax; ui.hull.value=p.hull;
  ui.cargo.max=p.cargoMax; ui.cargo.value=cargoUsed();
  ui.fuelLabel.textContent = `${Math.ceil(Math.max(0, p.fuel))}/${p.fuelMax}`;
  ui.hullLabel.textContent = `${Math.ceil(Math.max(0, p.hull))}/${p.hullMax}`;
  ui.cargoLabel.textContent = `${cargoUsed()}/${p.cargoMax}`;
  const displayedCargoValue = currentCargoValue();
  const objectiveCopy = formatExpeditionObjective({
    player: p,
    cash: state.cash,
    cargoCount: cargoUsed(),
    currentCargoValue: displayedCargoValue,
    atSurface: atSurface(),
    extractionPhase: state.extractionPhase
  });
  ui.objectiveInfoStatus.textContent = objectiveCopy;
  const extractionPresentation = formatExtractionPresentation({
    phase: state.extractionPhase,
    motherlodeExtractions: state.stats.motherlodeExtractions,
    reward: ECONOMY.artifactReward
  });
  ui.extractionStatus.textContent = extractionPresentation.hud || '';
  ui.extractionStatus.classList.toggle('hidden', !extractionPresentation.hud);
  ui.extractionInfoStatus.textContent = extractionPresentation.info;

  const lowFuel = shouldFuelBarFlash(state);
  const lowHull = shouldHullBarFlash(state);
  const fullCargo = shouldCargoBarFlash(state);
  ui.fuel.closest('.bar')?.classList.toggle('bar-alert', lowFuel);
  ui.hull.closest('.bar')?.classList.toggle('bar-alert', lowHull);
  ui.cargo.closest('.bar')?.classList.toggle('bar-alert', fullCargo);
  ui.fuelWarning.classList.toggle('show', lowFuel);
  if (lowFuel && !atSurface() && performance.now() - audio.lastLowFuel > FUEL.lowFuelWarnMs) { audio.lowFuel(); audio.lastLowFuel = performance.now(); }
  if (!ui.infoScreen.classList.contains('hidden')) {
    renderCargoDetails();
    renderExpeditionStats();
    if (developerToolsEnabled && ui.developerUpgrades) {
      updateDeveloperServiceControls(ui.developerUpgrades, p);
      updateDeveloperUpgradeControls(ui.developerUpgrades, p);
    }
  }
  updateButtonStates();
}
// Everything tuned in ticks lives here: `state.tick`, enemy cooldowns, keyboard
// repeat, and the per-step easing in updateAnimation(). It runs a whole number of
// times per frame at exactly 60 Hz, independent of the display's refresh rate.
function step(){
  gameInput.tick();
  if (!state.gameOver && session.paired && state.connected) session.sendPlayerState();
  if (state.introStarted) {
    if (session.isGuestEnemyReplica()) {
      enemies.updatePresentation();
      enemies.updateBites();
    } else {
      enemies.update();
      if (session.isPairedHost()) session.sendEnemySnapshot();
    }
  }
  updateAnimation();
}
const stepper = createFixedStepper(step);
function loop(now = performance.now()){
  // Rendering is once per animation frame against the latest simulated state; the
  // 60 Hz step is small enough that interpolation buys nothing visible.
  stepper.advance(now);
  renderer?.draw();
  hud();
  requestAnimationFrame(loop);
}
function tryAutoAudio(event?: Event, allowLobby=false) {
  const target = event?.target as Element | null;
  if (!allowLobby && target?.closest?.('#lobby-screen')) return;
  if (shouldAttemptAutoAudio({
    wantsSound: audio.wantsSound,
    enabled: audio.enabled,
    eventType: event?.type,
    isTrusted: event?.isTrusted
  })) audio.enable();
}
function focusGame(){
  try { (gamePanel || canvas).focus({preventScroll:true}); }
  catch { try { (gamePanel || canvas).focus(); } catch { /* focus is best-effort */ } }
}
function startIntro(event?: Event){
  if (state.introStarted) return;
  state.introStarted = true;
  ui.intro?.classList.add('hidden');
  setTimeout(() => { if (ui.intro) ui.intro.style.display = 'none'; }, 320);
  focusGame();
  tryAutoAudio(event, true);
  toast('Drill ready. Mine ore, sell it, and watch your fuel.');
}

/**
 * Build the feature modules and connect them. A few dependencies are late-bound
 * closures because the graph has cycles by design: the tile grid replicates
 * through the session, the session dispatches into the enemy simulation, and the
 * enemy simulation writes tiles back through the grid.
 */
function wireModules(){
  grid = createWorldGrid({
    state,
    invalidateTerrain: (x, y) => renderer?.invalidateTerrain(x, y),
    onTileSet: (x, y, tile, broadcast) => session.recordTile(x, y, tile, broadcast)
  });
  session = createSession({
    state,
    grid,
    audio,
    enemies: () => enemies,
    toast,
    saveProgress,
    invalidateFogTiles,
    invalidateTerrain: () => renderer?.invalidateTerrain(),
    invalidateFog: () => renderer?.invalidateFog(),
    spawnDust,
    spawnExplosion,
    clearWorldRuntime: () => run.clearWorldRuntime(),
    startIntro
  });
  run = createRun({
    state,
    session,
    audio,
    enemies: () => enemies,
    input: () => gameInput,
    toast,
    saveProgress,
    revealAtPlayer,
    spawnExplosion,
    invalidateTerrain: () => renderer?.invalidateTerrain(),
    invalidateFog: () => renderer?.invalidateFog()
  });
  enemies = createEnemySim({
    state,
    session,
    grid,
    audio,
    toast,
    addCash,
    saveProgress,
    damagePlayer: run.damage,
    spawnDust,
    spawnExplosion
  });
  const movement = createMovement({
    state,
    grid,
    enemies,
    audio,
    toast,
    saveProgress,
    addCash,
    revealAtPlayer,
    atSurface,
    damage: run.damage,
    gameOver: run.gameOver,
    spawnDust,
    spawnExplosion
  });
  actions = createActions({
    state,
    session,
    enemies,
    grid,
    audio,
    toast,
    saveProgress,
    addCash,
    revealAtPlayer,
    atSurface,
    spawnDust,
    spawnExplosion,
    spawnShotTrail,
    clearKeys: () => gameInput.clearKeys()
  });
  gameInput = createInput({
    state,
    actions,
    move: movement.move,
    isOpenMovementDestination: movement.isOpenMovementDestination,
    restartGame: run.restartGame,
    startIntro,
    closeShopScreen,
    closeInfoScreen,
    toast,
    tryAutoAudio
  });
}

export function initGame(options: { developerToolsEnabled?: boolean } = {}){
  developerToolsEnabled = options.developerToolsEnabled === true;
  audio = createAudio(ui, toast);
  state.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  wireModules();
  renderer = createRenderer({ state, get: (x: number, y: number) => grid.get(x, y), rand });
  loadProgress();
  ui.serverUrl.value = loadServerUrl(ui.serverUrl.value);
  addEventListener('touchstart', tryAutoAudio, {passive:true});
  gameInput.attach();
  addEventListener('focus', focusGame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    // Animation frames stop while hidden; discard the gap instead of fast-forwarding.
    stepper.reset();
    focusGame();
  });
  ui.intro?.addEventListener('pointerdown', e => {
    startIntro(e);
    e.preventDefault();
    e.stopPropagation();
  }, {capture:true});
  ui.intro?.addEventListener('touchstart', e => {
    startIntro(e);
    e.preventDefault();
    e.stopPropagation();
  }, {capture:true, passive:false});
  ui.intro?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { startIntro(); e.preventDefault(); e.stopPropagation(); }
  });
  ui.connectBtn.onclick = event => {
    event.stopPropagation();
    const url = ui.serverUrl.value.trim();
    if (!url) { session.setConnectionStatus('Enter a server URL'); return; }
    saveServerUrl(url);
    session.startOnline(url);
  };
  ui.soloBtn.onclick = event => {
    event.stopPropagation();
    session.playSolo(event);
  };
  addEventListener('pointerdown', tryAutoAudio);
  bindButtons(); run.generate(); setInterval(saveProgress, 60000); addEventListener('beforeunload', saveProgress); focusGame(); setTimeout(focusGame, 60); loop();
}
