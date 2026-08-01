// Game orchestrator: owns the singletons (state, audio, renderer), wires the
// feature modules together, and runs the fixed-step loop.
//
// Anything with a life of its own lives next door: `session.ts` (relay session),
// `enemies.ts` (enemy simulation), `actions.ts` (player transactions),
// `move.ts` (one step of the ship), `run.ts` (run lifecycle and death),
// `input.ts` (keyboard), `world-grid.ts` (tile access). What stays here is the
// glue those modules share — progress saving, particles, the UI sync, and the
// loop itself.
//
// The UI is React reading `src/ui/store.ts`. This module pushes a snapshot into
// that store once per frame (`syncUi()`) and exposes a flat command table
// (`src/ui/commands.ts`) for the buttons to dispatch into; it never reads or
// writes UI DOM apart from the canvas.

import { START_Y, SURFACE_HEIGHT, WORLD_W } from '../../shared/constants';
import { canvas, gamePanel } from './dom';
import { advanceViewportZoom, viewport } from './viewport';
import { recenteredCamera } from './zoom';
import { createAudio } from '../audio/audio';
import { shouldAttemptAutoAudio } from '../audio/audio-permission';
import { createIntroVoice, type IntroVoice } from '../audio/intro-voice';
import { createDefaultStats, createInitialState } from '../core/state';
import { createRenderer, type Renderer } from '../render/renderer';
import { FUEL, ECONOMY } from '../core/balance';
import { cargoCost, tankCost, hullCost, drillCost, visibilityCost, cargoValue } from '../core/economy';
import { shouldCargoBarFlash, shouldFuelBarFlash, shouldHullBarFlash } from '../core/hud-alerts';
import { formatExpeditionObjective } from '../core/objective';
import { load, save } from '../persistence';
import { formatExpeditionStats } from '../core/stats';
import { formatSurfaceActionHint } from '../core/surface-hint';
import { rand } from '../world/world';
import { setUiCommands } from '../ui/commands';
import { buildCargoRows, pushToast as toast, uiStore, type HudSnapshot, type PlayerSnapshot } from '../ui/store';

import { formatExtractionPresentation } from '../core/extraction-presentation';
import { interpolateRemotePlayers } from '../net/net-protocol';
import { saveServerUrl } from '../net/multiplayer-settings';
import { advanceTeleportEffect, canTeleportToSurface, canUseTeleporter } from '../core/teleporter';
import type { AudioController } from '../core/types';
import { applyPlayerUpgrade, type PlayerUpgradeId } from '../core/upgrades';
import { revealFootprint } from '../../shared/exploration-codec';
import { confirmPlayerDataReset, resetPlayerData } from '../core/player-data-reset';
import { DEVELOPER_CASH_GRANT, developerRefuel, developerRepairHull, grantDeveloperCash, type DeveloperServiceId } from '../core/developer';
import { confirmWorldStateReset } from '../world/world-state';
import { createFixedStepper } from '../core/fixed-step';
import { createWorldGrid, type WorldGrid } from './world-grid';
import { createSession, type GameSession } from './session';
import { createEnemySim, type EnemySim } from './enemies';
import { createActions, type GameActions } from './actions';
import { createMovement } from './move';
import { createReadouts, type HudReadouts } from './readouts';
import { createRun, type GameRun } from './run';
import { createInput, type GameInput } from './input';

const state = createInitialState();
let audio: AudioController;
let introVoice: IntroVoice;
let renderer: Renderer | undefined;
let developerToolsEnabled = false;

// Feature modules, constructed in initGame() once the audio/DOM singletons exist.
let grid: WorldGrid;
let session: GameSession;
let enemies: EnemySim;
let actions: GameActions;
let run: GameRun;
let gameInput: GameInput;
let readouts: HudReadouts;

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
  if (!developerToolsEnabled) return;
  if (!applyPlayerUpgrade(state.player, id)) return toast('Developer upgrade already at maximum level.');
  if (id === 'visibility') revealAtPlayer();
  saveProgress();
  syncPlayerSnapshot();
  toast('Developer action: upgrade granted for $0.');
}
function grantDeveloperMoney(){
  if (!developerToolsEnabled) return;
  grantDeveloperCash(state);
  saveProgress();
  toast(`Developer action: +$${DEVELOPER_CASH_GRANT.toLocaleString('en-US')} granted.`);
}
function runDeveloperService(id: DeveloperServiceId){
  if (!developerToolsEnabled) return;
  const changed = id === 'fuel'
    ? developerRefuel(state.player)
    : developerRepairHull(state.player);
  if (!changed) return toast(id === 'fuel' ? 'Fuel tank already full.' : 'Hull already at full strength.');
  saveProgress();
  syncPlayerSnapshot();
  toast(id === 'fuel' ? 'Developer action: refueled for $0.' : 'Developer action: hull repaired for $0.');
}

// --- Screens and UI sync -------------------------------------------------
/** Purchase confirmations, paired with the price each upgrade is charged at. */
const UPGRADE_PURCHASES: Record<PlayerUpgradeId, {cost(): number; message: string}> = {
  cargo: {cost: () => cargoCost(state.player), message: 'Cargo bay expanded.'},
  tank: {cost: () => tankCost(state.player), message: 'Fuel tank upgraded.'},
  hull: {cost: () => hullCost(state.player), message: 'Hull reinforced.'},
  drill: {cost: () => drillCost(state.player), message: 'Drill power increased.'},
  visibility: {cost: () => visibilityCost(state.player), message: 'Sensor footprint expanded.'}
};

/** Register the button/dialog dispatch table the React tree calls into. */
function registerUiCommands(){
  setUiCommands({
    sell: () => actions.sell(),
    refuel: () => actions.refuel(),
    repair: () => actions.repair(),
    buyUpgrade: id => actions.buyUpgrade(id, UPGRADE_PURCHASES[id].cost(), UPGRADE_PURCHASES[id].message),
    buyDynamite: () => actions.buyDynamite(),
    buyTeleporter: () => actions.buyTeleporter(),
    buyGun: () => actions.buyGun(),
    buyBullets: () => actions.buyBullets(),
    detonateDynamite: () => actions.detonateDynamite(),
    useTeleporter: () => actions.useTeleporter(),
    toggleGunArmed: () => actions.setGunArmed(!state.input.gunArmed),
    openShop: openShopScreen,
    closeShop: closeShopScreen,
    openInfo: openInfoScreen,
    closeInfo: closeInfoScreen,
    toggleMusic: () => { void audio.toggleMusic(); },
    toggleSfx: () => { void audio.toggleSfx(); },
    dismissIntro: event => dismissIntro(event),
    startIntroVoice: () => introVoice.start(),
    stopIntroVoice: () => introVoice.stop(),
    connect: url => {
      if (!url) { session.setConnectionStatus('Enter a server URL'); return; }
      saveServerUrl(url);
      session.startOnline(url);
    },
    cancelConnect: () => session.cancelOnline(),
    playSolo: event => session.playSolo(event),
    grantDeveloperCash: grantDeveloperMoney,
    runDeveloperService,
    grantDeveloperUpgrade,
    resetPlayerData: () => {
      if (!developerToolsEnabled) return;
      if (!confirmPlayerDataReset(message => window.confirm(message))) return;
      explorationSave.cancel();
      session.resetForPlayerData();
      gameInput.clearKeys();
      resetPlayerData(state);
      readouts.reset();
      revealAtPlayer(false);
      explorationSave.cancel();
      saveProgress();
      session.setConnectionStatus('Solo');
      closeInfoScreen();
      toast('Player data reset. Shared mine terrain preserved.');
    },
    resetWorldState: () => {
      if (!developerToolsEnabled) return;
      if (!confirmWorldStateReset(message => window.confirm(message))) return;
      if (!session.requestWorldReset()) {
        run.clearWorldRuntime();
        saveProgress();
        toast('World state reset locally. Player progress preserved.');
      }
      closeInfoScreen();
    }
  });
}
function openShopScreen(){
  if (!atSurface()) return toast('Shop is at the surface depot.');
  state.input.gunArmed = false;
  syncPlayerSnapshot();
  uiStore.getState().setShopOpen(true);
}
function closeShopScreen(){
  uiStore.getState().setShopOpen(false);
}
function openInfoScreen(){
  syncPlayerSnapshot();
  syncInfoDetails();
  uiStore.getState().setInfoOpen(true);
}
function closeInfoScreen(){
  uiStore.getState().setInfoOpen(false);
}
/**
 * Reused scratch snapshots. The loop fills them every frame and the store copies
 * them only when a value actually changed, so a steady HUD allocates nothing.
 */
const hudScratch: HudSnapshot = {...uiStore.getState().hud};
const playerScratch: PlayerSnapshot = {...uiStore.getState().player};

function syncPlayerSnapshot(){
  const p = state.player;
  playerScratch.fuel = p.fuel;
  playerScratch.fuelMax = p.fuelMax;
  playerScratch.hull = p.hull;
  playerScratch.hullMax = p.hullMax;
  playerScratch.cargoMax = p.cargoMax;
  playerScratch.drill = p.drill;
  playerScratch.visibility = p.visibility;
  playerScratch.dynamite = p.dynamite;
  playerScratch.teleporters = p.teleporters;
  playerScratch.gunOwned = p.gunOwned;
  playerScratch.bullets = p.bullets;
  uiStore.getState().syncPlayer(playerScratch);
}
function syncInfoDetails(){
  const store = uiStore.getState();
  store.setCargoRows(buildCargoRows(state.player.cargo));
  store.setStatRows(formatExpeditionStats(state.stats));
}
function updateAnimation(){
  const p = state.player;
  p.drawX += (p.x - p.drawX) * 0.23;
  p.drawY += (p.y - p.drawY) * 0.23;
  p.bob *= 0.86;
  p.drillAnim *= 0.90;
  state.remotePlayers = interpolateRemotePlayers(state.remotePlayers, 0.23);
  state.teleportEffect = advanceTeleportEffect(state.teleportEffect);
  // A settling zoom grows the view around its own centre, so the ship stays put
  // instead of sliding in from a corner while the follow easing catches up.
  const previousTilesX = viewport.tilesX, previousTilesY = viewport.tilesY;
  if (advanceViewportZoom()) {
    state.camX = Math.max(0, recenteredCamera(state.camX, previousTilesX, viewport.tilesX));
    state.camY = Math.max(0, recenteredCamera(state.camY, previousTilesY, viewport.tilesY));
  }
  const targetCamX = Math.max(0, Math.min(WORLD_W-viewport.tilesX, p.drawX - viewport.tilesX/2 + 0.5));
  const targetCamY = Math.max(0, p.drawY - viewport.tilesY/2 + 0.5);
  state.camX += (targetCamX - state.camX) * 0.12;
  state.camY += (targetCamY - state.camY) * 0.12;
  state.particles = state.particles.filter(pt => {
    pt.x += pt.vx; pt.y += pt.vy; pt.vy += .003; pt.life -= 1;
    return pt.life > 0;
  });
}
/** Publish this frame's UI state. The only place the game talks to the chrome. */
function syncUi(){
  const p = state.player;
  const surf = atSurface();
  const lowFuel = shouldFuelBarFlash(state);
  const extraction = formatExtractionPresentation({
    phase: state.extractionPhase,
    motherlodeExtractions: state.stats.motherlodeExtractions,
    reward: ECONOMY.artifactReward
  });

  hudScratch.cash = state.cash;
  hudScratch.depthMeters = Math.max(0, p.y - START_Y) * 10;
  hudScratch.fuel = p.fuel;
  hudScratch.fuelMax = p.fuelMax;
  hudScratch.hull = p.hull;
  hudScratch.hullMax = p.hullMax;
  hudScratch.cargo = cargoUsed();
  hudScratch.cargoMax = p.cargoMax;
  hudScratch.cargoValue = currentCargoValue();
  hudScratch.fuelAlert = lowFuel;
  hudScratch.hullAlert = shouldHullBarFlash(state);
  hudScratch.cargoAlert = shouldCargoBarFlash(state);
  hudScratch.objective = formatExpeditionObjective({
    player: p,
    cash: state.cash,
    cargoCount: hudScratch.cargo,
    currentCargoValue: hudScratch.cargoValue,
    atSurface: surf,
    extractionPhase: state.extractionPhase
  });
  hudScratch.extractionHud = extraction.hud;
  hudScratch.extractionInfo = extraction.info;
  hudScratch.atSurface = surf;
  hudScratch.gameOver = state.gameOver;
  hudScratch.gunArmed = state.input.gunArmed;
  hudScratch.gunOwned = p.gunOwned;
  hudScratch.bullets = p.bullets;
  hudScratch.dynamite = p.dynamite;
  hudScratch.teleporters = p.teleporters;
  hudScratch.teleportReturn = state.teleportReturnPosition !== null;
  hudScratch.teleportDepthReached = canTeleportToSurface(p.y);
  hudScratch.teleportUsable = canUseTeleporter(p, state.teleportReturnPosition);
  // What Space would actually do if pressed right now, so the depot prompt never
  // offers a service the ship does not need or cannot pay for.
  hudScratch.surfaceHint = formatSurfaceActionHint({
    atSurface: surf,
    gameOver: state.gameOver,
    cargoValue: hudScratch.cargoValue,
    cash: state.cash,
    fuel: p.fuel,
    fuelMax: p.fuelMax,
    hull: p.hull,
    hullMax: p.hullMax
  });
  // Scanner line, return-fuel forecast, and depth landmark, each recomputed only
  // when its own inputs moved. Milestone crossings toast from in here.
  readouts.sync(hudScratch);

  const store = uiStore.getState();
  store.syncHud(hudScratch);
  if (store.shopOpen || store.infoOpen) syncPlayerSnapshot();
  if (store.infoOpen) syncInfoDetails();

  if (lowFuel && !surf && performance.now() - audio.lastLowFuel > FUEL.lowFuelWarnMs) { audio.lowFuel(); audio.lastLowFuel = performance.now(); }
}
// Everything tuned in ticks lives here: `state.tick`, enemy cooldowns, keyboard
// repeat, and the per-step easing in updateAnimation(). It runs a whole number of
// times per frame at exactly 60 Hz, independent of the display's refresh rate.
function step(){
  gameInput.tick();
  if (!state.gameOver && session.paired && state.connected) session.sendPlayerState();
  if (isPlaying()) {
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
  syncUi();
  requestAnimationFrame(loop);
}
/** Enable sound on the first trusted pointer gesture, if the player wants it. */
function tryAutoAudio(event?: Event) {
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
/** Whether the run is live. The simulation and the keyboard both hang off this. */
function isPlaying(){
  return uiStore.getState().phase === 'playing';
}
/** Splash → lobby. The press that got us here is the audio-unlock gesture. */
function dismissIntro(event?: Event){
  const store = uiStore.getState();
  if (store.phase !== 'intro') return;
  // Silence the lyric voice-over before the gesture starts the soundtrack, so
  // the last line cannot talk over the first bar. Unmounting the overlay would
  // stop it anyway; this just makes the hand-off explicit and ordered.
  introVoice.stop();
  tryAutoAudio(event);
  store.setPhase('lobby');
}
/**
 * The one way into the run: solo play, a host whose partner arrived, and a guest
 * auto-started by pairing all land here, so the start-of-run side effects exist
 * exactly once.
 */
function startGame(event?: Event){
  const store = uiStore.getState();
  if (store.phase === 'playing') return;
  store.setPhase('playing');
  focusGame();
  tryAutoAudio(event);
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
    startGame
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
  readouts = createReadouts({state, grid, enemies, atSurface, toast});
  gameInput = createInput({
    state,
    actions,
    move: movement.move,
    isOpenMovementDestination: movement.isOpenMovementDestination,
    restartGame: run.restartGame,
    closeShopScreen,
    closeInfoScreen,
    toast,
    tryAutoAudio
  });
}

export function initGame(options: { developerToolsEnabled?: boolean } = {}){
  developerToolsEnabled = options.developerToolsEnabled === true;
  audio = createAudio(toast);
  // The lyrics are part of the song, so they follow the music switch.
  introVoice = createIntroVoice({wantsVoice: () => audio.musicEnabled});
  state.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  wireModules();
  renderer = createRenderer({ state, get: (x: number, y: number) => grid.get(x, y), rand });
  loadProgress();
  addEventListener('touchstart', tryAutoAudio, {passive:true});
  gameInput.attach();
  addEventListener('focus', focusGame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    // Animation frames stop while hidden; discard the gap instead of fast-forwarding.
    stepper.reset();
    focusGame();
  });
  addEventListener('pointerdown', tryAutoAudio);
  registerUiCommands(); run.generate(); setInterval(saveProgress, 60000); addEventListener('beforeunload', saveProgress); focusGame(); setTimeout(focusGame, 60); loop();
  // The splash is mounted before this module is even imported, so its own
  // start command may have landed on the placeholder no-op. Starting here too
  // makes the order irrelevant: `start()` on a running loop does nothing.
  if (uiStore.getState().phase === 'intro') introVoice.start();
}
