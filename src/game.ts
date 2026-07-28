import { ORES, START_Y, SURFACE_HEIGHT, TILE, WORLD_W } from './constants';
import { canvas, gamePanel, ctx, H, keys, ui, VIEW_HEIGHT, VIEW_WIDTH, W } from './dom';
import { createAudio } from './audio';
import { shouldAttemptAutoAudio } from './audio-permission';
import { createInitialState, respawnPlayer } from './state';
import { createRenderer } from './renderer';
import { STARTING, FUEL, HULL, ENEMY, ECONOMY, LIMITS } from './balance';
import { refuelCost, repairCost, cargoCost, tankCost, hullCost, drillCost, visibilityCost, partialFill, cargoValue } from './economy';
import { shouldCargoBarFlash, shouldFuelBarFlash, shouldHullBarFlash } from './hud-alerts';
import { formatExpeditionObjective } from './objective';
import { load, save, DEFAULT_STATS } from './persistence';
import { formatExpeditionStats } from './stats';
import { ensureWorldRow, rand, makeTile } from './world';
import { getInfoNavigationSection, getInfoTabFocusTarget } from './info-navigation';

import { beginExtraction, cancelExtraction, completeExtractionAtDepot } from './extraction-phase';
import { formatExtractionPresentation } from './extraction-presentation';
import { createNet, type NetClient } from './net';
import { applyEnemyDead, applyEnemySpawn, applyRemotePlayerState, applyTileDiff, applyWorldSyncToWorld, enemyEntryFrom, enemySnapshotFrom, interpolateRemotePlayers, mergeEnemySnapshot, mergeWorldSync, nextEnemyId, playerStateFrom, remotePlayerFrom, type EnemySnapshotEntry, type TileDiff } from './net-protocol';
import { loadServerUrl, saveServerUrl } from './multiplayer-settings';
import { activeSprintDirection, fuelAfterMovement, isOpenSpaceDestination, keyboardMovementRepeatMs, movementDestination } from './movement';
import { getDynamiteBlastTargets } from './dynamite';
import { MIN_TELEPORT_DEPTH_METERS, advanceTeleportEffect, canTeleportToSurface, canUseTeleporter, createTeleportEffect, teleportPlayerToReturn, teleportPlayerToSurface } from './teleporter';
import { claimArtifact } from './artifacts';
import type { Enemy, Tile } from './types';
import { applyPlayerUpgrade, getPlayerUpgradeProgress, updateDeveloperUpgradeControls, type PlayerUpgradeId } from './upgrades';
import { updateShopControls } from './shop';
import { expandReachableAir } from './enemy-exposure';
import { encodeExploration, isTileExplored, mergeExploration, revealFootprint } from './exploration';
import { consumeBulletForShot, gunKeyAction, resolveShot } from './weapon';
import { confirmPlayerDataReset, resetPlayerData } from './player-data-reset';
import { DEVELOPER_CASH_GRANT, developerRefuel, developerRepairHull, grantDeveloperCash, updateDeveloperServiceControls, type DeveloperServiceId } from './developer';
import { confirmWorldStateReset, resetWorldTerrain } from './world-state';
import { findClosestEnemyTarget, findEnemyPathStep } from './enemy-movement';
import { enemyBiteCooldown, enemyBiteDamage, enemyMoveDelay, getEnemyType } from './enemy-types';

const state = createInitialState();
let audio;
let renderer;
let enemyIdCounter = 1;
let resetConfirmUntil = 0;
let toastTimer = 0;
let explorationSaveTimer = 0;
let net: NetClient | null = null;
let connectionIssue: string | null = null;
let resettingPlayerData = false;
let tileDiff: TileDiff = {};
let worldRevision = 1;
const reachableAir = new Set<string>();
const ENEMY_AGGRO_RANGE = 24;

state.stats = {...DEFAULT_STATS};

function loadProgress() { load(state); }

function saveProgress() { save(state); }
function revealAtPlayer(broadcast=true) {
  const added = revealFootprint(state.exploredTiles, state.player.x, state.player.y, state.player.visibility);
  if (!added.length) return;
  if (broadcast && state.connected && net?.paired) net.send({type:'explore', revision:worldRevision, ranges:encodeExploration(state.exploredTiles)});
  clearTimeout(explorationSaveTimer);
  explorationSaveTimer = window.setTimeout(saveProgress, 500);
}

function addCash(amount) {
  state.cash += amount;
  if (amount > 0) state.stats.totalCashEarned += amount;
  saveProgress();
}
function isGuestEnemyReplica(){ return state.role === 'guest'; }
function isPairedHost(){ return state.role === 'host' && state.connected && Boolean(net?.paired); }
function enemyFromSnapshot(entry: EnemySnapshotEntry, previous?: Enemy): Enemy {
  return {
    ...entry,
    moveTick: previous?.moveTick ?? 0,
    biteTick: previous?.biteTick ?? 0,
    flash: previous?.flash ?? 0
  };
}
function applyEnemyEntries(entries: EnemySnapshotEntry[]){
  const previous = new Map(state.enemies.map(enemy => [enemy.id, enemy]));
  state.enemies = entries.map(entry => enemyFromSnapshot(entry, previous.get(entry.id)));
}
function mergeEnemyEntries(entries: EnemySnapshotEntry[]){
  applyEnemyEntries(mergeEnemySnapshot(state.enemies.map(enemyEntryFrom), entries));
}

function generate(){
  state.enemies = [];
  state.world = [];
  tileDiff = {};
  resetPlayer(false);
  resetEnemyExposure();
}
function clearWorldRuntime(){
  resetWorldTerrain(state, makeTile);
  tileDiff = {};
  reachableAir.clear();
  enemyIdCounter = 1;
  keys.clear();
  renderer?.invalidateTerrain();
}
function initializeServerWorld(){
  net?.send({type:'worldInit', revision:worldRevision, tiles:[]});
}
function applyAuthoritativeWorld(msg: Extract<import('./net-protocol').NetMessage, {type:'worldState'}>){
  worldRevision = msg.revision;
  state.world = [];
  tileDiff = {};
  for (const entry of msg.tiles) {
    const row = ensureWorldRow(state.world, entry.y);
    if (row) row[entry.x] = entry.tile;
  }
  applyEnemyEntries(msg.enemies);
  enemyIdCounter = nextEnemyId(state.enemies);
  state.exploredTiles.clear();
  mergeExploration(state.exploredTiles, msg.explored);
  reachableAir.clear();
  renderer?.invalidateTerrain();
  saveProgress();
  if (!msg.initialized) initializeServerWorld();
}
function resetPlayer(full=true){
  state.extractionPhase = cancelExtraction();
  state.teleportEffect = null;
  state.teleportReturnPosition = null;
  state.input.gunArmed = false;
  if (full) { state.cash = STARTING.cash; state.player.fuelMax=STARTING.fuelMax; state.player.hullMax=STARTING.hullMax; state.player.cargoMax=STARTING.cargoMax; state.player.drill=STARTING.drill; state.player.visibility=STARTING.visibility; state.player.dynamite=STARTING.dynamite; state.player.teleporters=STARTING.teleporters; state.player.gunOwned=STARTING.gunOwned; state.player.bullets=STARTING.bullets; state.exploredTiles.clear(); state.stats = {...DEFAULT_STATS}; saveProgress(); }
  respawnPlayer(state.player);
  revealAtPlayer();
  state.camX = Math.max(0, state.player.x - Math.floor(W/2));
  state.camY = 0;
  state.particles.length = 0;
  state.gameOver = false; toast('Fresh drill deployed.');
}
function get(x,y): Tile {
  if (x < 0 || x >= WORLD_W) return {type:'rock', hp:999};
  return ensureWorldRow(state.world, y)?.[x] || {type:'rock', hp:999};
}
function set(x,y,t, broadcast=true){
  const row = ensureWorldRow(state.world, y);
  if (!row || x < 0 || x >= row.length) return;
  const previousType = row[x].type;
  row[x] = t;
  if (previousType !== t.type) renderer?.invalidateTerrain(x, y);
  // Guests retain received/local mutations too: they may become the next host.
  if (state.role) tileDiff = applyTileDiff(tileDiff, {x, y, tile: t});
  if (broadcast && state.connected && net?.paired) net.send({type:'tile', revision:worldRevision, x, y, tile:t});
}
function cargoUsed(){ return state.player.cargo.length; }
function currentCargoValue(){ return cargoValue(state.player.cargo); }
function toast(msg){ ui.toast.textContent = msg; ui.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer=window.setTimeout(()=>ui.toast.classList.remove('show'),1800); }
function setConnectionStatus(status: string, showInHud=true){
  ui.lobbyConnectionStatus.textContent = status;
  ui.connectionStatus.textContent = status;
  ui.connectionStatus.classList.toggle('hidden', !showInHud);
}
function startOnline(url: string){
  net?.disconnect();
  state.remotePlayers = [];
  state.role = null;
  state.connected = false;
  connectionIssue = null;
  setConnectionStatus('Connecting...');
  net = createNet({
    url,
    callbacks: {
      onOpen(){
        state.connected = true;
        setConnectionStatus('Connected - pairing...');
      },
      onPaired(role){
        state.role = role;
        resetEnemyExposure();
        if (role === 'host') {
          setConnectionStatus('Host - waiting for player');
          return;
        }
        setConnectionStatus('Guest - paired');
        startOnlineGame();
      },
      onPeerJoined(){
        if (state.role !== 'host') return;
        setConnectionStatus('Host - paired');
        startOnlineGame();
      },
      onPeerLeft(){
        state.remotePlayers = [];
        if (state.role === 'guest') {
          state.role = 'host';
          enemyIdCounter = nextEnemyId(state.enemies);
          resetEnemyExposure();
          setConnectionStatus('Host - waiting for player');
          return;
        }
        setConnectionStatus('Peer left');
      },
      onRoomFull(){
        connectionIssue = 'Room full';
        setConnectionStatus(connectionIssue);
      },
      onMessage(msg){
        if (msg.type === 'worldState') {
          applyAuthoritativeWorld(msg);
          return;
        }
        if (msg.type === 'worldReset') {
          if (msg.revision <= worldRevision) return;
          worldRevision = msg.revision;
          clearWorldRuntime();
          saveProgress();
          initializeServerWorld();
          toast('Shared world reset. Player progress preserved.');
          return;
        }
        if (msg.type === 'playerState') state.remotePlayers = applyRemotePlayerState(state.remotePlayers, msg);
        if (msg.type === 'tile') set(msg.x, msg.y, msg.tile, false);
        if (msg.type === 'explore') {
          const added = mergeExploration(state.exploredTiles, msg.ranges);
          if (added.length) {
            saveProgress();
            if (isPairedHost()) net?.send({type:'explore', revision:worldRevision, ranges:encodeExploration(state.exploredTiles)});
          }
        }
        if (msg.type === 'worldSync' && isGuestEnemyReplica()) {
          applyWorldSyncToWorld(state.world, msg, makeTile);
          renderer.invalidateTerrain();
          tileDiff = mergeWorldSync(tileDiff, [], msg).diff;
          mergeEnemyEntries(msg.enemies);
          mergeExploration(state.exploredTiles, msg.explored);
          saveProgress();
        }
        if (msg.type === 'enemySnapshot' && isGuestEnemyReplica()) mergeEnemyEntries(msg.enemies);
        if (msg.type === 'enemySpawn' && isGuestEnemyReplica()) {
          applyEnemyEntries(applyEnemySpawn(state.enemies.map(enemyEntryFrom), msg));
          spawnDust(msg.x, msg.y, getEnemyType(msg.kind).glow, 18);
          audio.enemyWake();
        }
        if (msg.type === 'enemyDead' && isGuestEnemyReplica()) {
          const enemy = state.enemies.find(e => e.id === msg.id);
          applyEnemyEntries(applyEnemyDead(state.enemies.map(enemyEntryFrom), msg));
          if (enemy) spawnExplosion(enemy.x, enemy.y);
        }
        if (msg.type === 'enemyDamage' && isPairedHost() && msg.by === 'guest' && msg.amount > 0) {
          damageEnemy(state.enemies.find(e => e.id === msg.id), msg.amount, 'guest');
        }
        if (msg.type === 'enemyTileShot' && isPairedHost() && msg.by === 'guest') destroyDormantEnemy(msg.x, msg.y, 'guest');
        if (msg.type === 'wakeNear' && isPairedHost()) wakeEnemiesNear(msg.x, msg.y);
        if (msg.type === 'bounty' && isGuestEnemyReplica()) creditEnemyBounty(msg.amount);
        if (msg.type === 'died') state.remotePlayers = [];
        if (msg.type === 'respawned' || msg.type === 'teleported') {
          state.remotePlayers = [remotePlayerFrom({
            type: 'playerState', x: msg.x, y: msg.y, drawX: msg.x, drawY: msg.y,
            facing: 1, drillAnim: 0, drillDx: 0, drillDy: 1, bob: 0
          })];
        }
      },
      onError(){
        connectionIssue = 'Connection error';
        setConnectionStatus(connectionIssue);
      },
      onClose(){
        state.connected = false;
        state.role = null;
        state.remotePlayers = [];
        enemyIdCounter = nextEnemyId(state.enemies);
        if (!resettingPlayerData) resetEnemyExposure();
        setConnectionStatus(connectionIssue || 'Disconnected');
      }
    }
  });
  net.connect();
}
function startOnlineGame(){
  if (!net?.paired) return;
  ui.lobby.classList.add('hidden');
  startIntro();
}
function playSolo(event?: Event){
  net?.disconnect();
  net = null;
  state.connected = false;
  state.role = null;
  state.remotePlayers = [];
  connectionIssue = null;
  setConnectionStatus('Solo');
  ui.lobby.classList.add('hidden');
  startIntro(event);
}
function spawnDust(x,y,color='#9d6a42', amount=10){
  for (let i=0;i<amount;i++) state.particles.push({x:x+0.5,y:y+0.5,vx:(Math.random()-.5)*.08,vy:(Math.random()-.7)*.09,life:22+Math.random()*18,color,size:.035+Math.random()*.045});
}
function spawnExplosion(x,y){
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
function enemyAt(x,y){
  return state.enemies.find(e => e.alive && Math.round(e.x) === x && Math.round(e.y) === y);
}
function wakeEnemy(x,y){
  if (isGuestEnemyReplica()) return false;
  const tile = get(x,y);
  if (tile.type !== 'enemy') return false;
  set(x,y,{type:'air'});
  const enemy = {id: enemyIdCounter++, kind:tile.kind, x, y, drawX:x, drawY:y, hp:tile.hp || 4, maxHp:tile.maxHp || tile.hp || 4, alive:true, moveTick:0, biteTick:0, flash:0};
  state.enemies.push(enemy);
  if (isPairedHost()) net?.send({type:'enemySpawn', id:enemy.id, kind:enemy.kind, x, y, hp:enemy.hp, maxHp:enemy.maxHp});
  spawnDust(x, y, getEnemyType(enemy.kind).glow, 18);
  audio.enemyWake();
  toast(`${getEnemyType(enemy.kind).name} awakened! Drill it before it chews the hull.`);
  return true;
}
function wakeEnemiesNear(x,y){
  if (isGuestEnemyReplica()) {
    if (net?.paired) net.send({type:'wakeNear', x, y});
    return;
  }
  let seeds = [{x, y}];
  while (seeds.length) {
    const exposed = expandReachableAir(state.world, reachableAir, seeds);
    for (const enemy of exposed) wakeEnemy(enemy.x, enemy.y);
    seeds = exposed;
  }
}
function resetEnemyExposure(){
  reachableAir.clear();
  if (isGuestEnemyReplica()) return;
  let seeds = [{x: state.player.x, y: state.player.y}];
  let forceSeeds = true;
  while (seeds.length) {
    const exposed = expandReachableAir(state.world, reachableAir, seeds, forceSeeds);
    for (const enemy of exposed) wakeEnemy(enemy.x, enemy.y);
    seeds = exposed;
    forceSeeds = false;
  }
}
function enemyBounty(y){ return ENEMY.bounty.base + Math.floor(y / ENEMY.bounty.depthDivisor) * ENEMY.bounty.step; }
function creditEnemyBounty(amount){
  addCash(amount);
  state.stats.enemiesDestroyed++;
  saveProgress();
  toast(`Enemy destroyed +$${amount} bounty.`);
}
function damageEnemy(enemy, amount=state.player.drill, killer: 'host' | 'guest' = 'host'){
  if (!enemy || !enemy.alive) return;
  if (isGuestEnemyReplica()) {
    if (net?.paired) net.send({type:'enemyDamage', id:enemy.id, amount, by:'guest'});
    spawnDust(enemy.x, enemy.y, '#92ff55', 13);
    audio.enemyHit();
    return;
  }
  enemy.hp -= amount;
  enemy.flash = 1;
  spawnDust(enemy.x, enemy.y, '#92ff55', 13);
  audio.enemyHit();
  if (enemy.hp <= 0) {
    enemy.alive = false;
    spawnExplosion(enemy.x, enemy.y);
    const bounty = enemyBounty(enemy.y);
    if (isPairedHost()) {
      net?.send({type:'enemyDead', id:enemy.id, bounty, killerIsGuest:killer === 'guest'});
      if (killer === 'guest') net?.send({type:'bounty', amount:bounty});
    }
    if (killer === 'host') creditEnemyBounty(bounty);
  } else {
    toast(`Enemy hit — ${Math.ceil(enemy.hp)} HP left.`);
  }
}
function damageEnemyTile(x,y){
  const tile = get(x,y);
  if (tile.type !== 'enemy') return false;
  if (isGuestEnemyReplica()) {
    if (net?.paired) net.send({type:'wakeNear', x, y});
    spawnDust(x, y, '#92ff55', 12);
    audio.enemyHit();
    return true;
  }
  tile.hp -= state.player.drill;
  spawnDust(x, y, '#92ff55', 12);
  audio.enemyHit();
  if (tile.hp <= 0) {
    set(x,y,{type:'air'});
    spawnExplosion(x,y);
    const bounty = enemyBounty(y);
    addCash(bounty);
    state.stats.enemiesDestroyed++;
    saveProgress();
    toast(`Dormant enemy drilled out +$${bounty} bounty.`);
    wakeEnemiesNear(x,y);
  } else {
    set(x,y,tile);
    toast(`Drilling enemy cocoon... ${Math.ceil(tile.hp)} HP left`);
  }
  return true;
}
function destroyDormantEnemy(x: number, y: number, killer: 'host' | 'guest'){
  if (isGuestEnemyReplica()) return false;
  if (get(x,y).type !== 'enemy') return false;
  set(x,y,{type:'air'});
  spawnExplosion(x,y);
  const bounty = enemyBounty(y);
  if (killer === 'guest') net?.send({type:'bounty', amount:bounty});
  else creditEnemyBounty(bounty);
  wakeEnemiesNear(x,y);
  return true;
}
function updateEnemies(){
  if (isGuestEnemyReplica()) return;
  if (!state.introStarted || (state.gameOver && !state.remotePlayers.length)) return;
  state.enemies = state.enemies.filter(e => e.alive);
  for (const e of state.enemies) {
    e.drawX += (e.x - e.drawX) * 0.28;
    e.drawY += (e.y - e.drawY) * 0.28;
    e.flash *= 0.82;
    const target = findClosestEnemyTarget(e, state.gameOver ? null : state.player, state.remotePlayers);
    if (!target) continue;
    const dist = Math.abs(e.x - target.x) + Math.abs(e.y - target.y);
    if (dist <= 1) {
      if (target.local && state.tick - e.biteTick > enemyBiteCooldown(e.kind)) {
        e.biteTick = state.tick;
        const bite = enemyBiteDamage(e.kind, e.y);
        damage(bite);
        spawnDust(target.x, target.y, '#ff5d45', 10);
        toast(`${getEnemyType(e.kind).name} chewing the hull! -${bite}`);
      }
      continue; // Bite from an adjacent tile; never step onto the ship's tile.
    }
    const moveDelay = enemyMoveDelay(e.kind, e.y);
    if (state.tick - e.moveTick < moveDelay || dist > ENEMY_AGGRO_RANGE) continue;
    e.moveTick = state.tick;
    const step = findEnemyPathStep(state.world, e, target, state.enemies.filter(enemy => enemy.alive), ENEMY_AGGRO_RANGE);
    if (step && (step.x !== target.x || step.y !== target.y)) { e.x = step.x; e.y = step.y; }
  }
}
function updateEnemyPresentation(){
  if (state.gameOver || !state.introStarted) return;
  for (const e of state.enemies) {
    e.drawX += (e.x - e.drawX) * 0.28;
    e.drawY += (e.y - e.drawY) * 0.28;
    e.flash *= 0.82;
  }
}
function updateEnemyBites(){
  if (state.gameOver || !state.introStarted) return;
  if (isGuestEnemyReplica() && !net?.paired) return;
  const p = state.player;
  for (const e of state.enemies) {
    if (!e.alive || Math.abs(e.x - p.x) + Math.abs(e.y - p.y) > 1) continue;
    if (state.tick - e.biteTick <= enemyBiteCooldown(e.kind)) continue;
    e.biteTick = state.tick;
    const bite = enemyBiteDamage(e.kind, e.y);
    damage(bite);
    spawnDust(p.x, p.y, '#ff5d45', 10);
    toast(`${getEnemyType(e.kind).name} chewing the hull! -${bite}`);
  }
}
function grounded(){
  const p = state.player;
  return get(p.x, p.y + 1).type !== 'air';
}
function isOpenMovementDestination(dx,dy){
  const p = state.player;
  const {x: nx, y: ny} = movementDestination(p.x, p.y, dx, dy, WORLD_W, START_Y);
  return isOpenSpaceDestination(nx !== p.x || ny !== p.y, get(nx,ny).type, Boolean(enemyAt(nx,ny)));
}
function restartGame(){
  resetConfirmUntil = 0;
  const died = state.gameOver;
  keys.clear();
  state.input.keyImpulse = null;
  state.input.sprintDirection = null;
  state.input.touchHoldDir = null;
  state.input.gunArmed = false;
  state.input.lastKeyboardMove = 0;
  state.input.lastTouchMove = 0;
  // An online death/reset only replaces this miner's ship; the shared world
  // and host-owned enemy list must remain intact for the other player.
  if (state.connected) resetPlayer(false);
  else generate();
  if (died) toast('Replacement ship deployed. Cash and upgrades kept; cargo lost.');
  if (died && state.connected && net?.paired) {
    net.send({type:'respawned', x:state.player.x, y:state.player.y});
  }
}
function gameOver(msg='Game over. Tap anywhere or press R to restart.'){
  if (state.gameOver) return;
  state.gameOver = true;
  state.input.gunArmed = false;
  state.teleportEffect = null;
  state.extractionPhase = cancelExtraction();
  state.stats.deaths++;
  saveProgress();
  if (state.connected && net?.paired) net.send({type:'died'});
  toast(msg);
  spawnExplosion(state.player.x, state.player.y);
  audio.alarm();
  audio.bump();
}
function move(dx,dy,sprinting=false){
  if (state.gameOver) return;
  const p = state.player;
  if (p.fuel <= 0) { gameOver('Out of fuel — ship exploded. Tap anywhere to restart.'); return; }
  const {x: nx, y: ny} = movementDestination(p.x, p.y, dx, dy, WORLD_W, START_Y);
  if (nx === p.x && ny === p.y) {
    if (dy < 0 && p.y === START_Y) toast('Stay low — the surface airspace is for the depot, not flying.');
    return;
  }
  const tile = get(nx,ny);
  const activeEnemy = enemyAt(nx, ny);
  const destinationOpen = isOpenSpaceDestination(true, tile.type, Boolean(activeEnemy));
  let cost = FUEL.baseMove + Math.abs(dy)*FUEL.vertical;
  const flyCost = cost * FUEL.flyMult;             // flying uses 50% less fuel
  const dig = extra => (cost + extra) * FUEL.digMult; // digging uses 50% more fuel
  const useFuel = amount => { p.fuel = fuelAfterMovement(p.fuel, amount, sprinting, destinationOpen, dy > 0); };
  p.facing = dx ? Math.sign(dx) : p.facing;
  p.drillDx = dx;
  p.drillDy = dy;
  if (activeEnemy) { p.drillAnim = 1.65; useFuel(dig(FUEL.dig.enemy)); damageEnemy(activeEnemy); return; }
  if (tile.type !== 'air' && dy < 0) { p.drillDx = 0; p.drillDy = -1; p.drillAnim = 0.75; audio.bump(); toast('The drill cannot dig upward. Use tunnels to fly up.'); return; }
  if (tile.type !== 'air' && dx !== 0 && dy === 0 && !grounded()) { p.drillDx = dx; p.drillDy = 0; p.drillAnim = 0.55; audio.bump(); toast('Side drilling needs solid ground underneath.'); return; }
  if (tile.type === 'rock') { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.2; damage(HULL.rockBump); useFuel(dig(0)); spawnDust(nx, ny, '#444857', 8); audio.bump(); toast('Solid rock blocks the drill.'); return; }
  if (tile.type === 'enemy') { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.65; useFuel(dig(FUEL.dig.enemy)); damageEnemyTile(nx, ny); return; }
  if (tile.type === 'hazard') { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.65; tile.hp -= p.drill; useFuel(dig(FUEL.dig.hazard)); damage(HULL.hazardBase + Math.floor(ny/HULL.hazardDepthDivisor)); spawnDust(nx, ny, '#ff5f24', 18); audio.alarm(); if (tile.hp <= 0) { set(nx,ny,{type:'air'}); spawnExplosion(nx,ny); wakeEnemiesNear(nx,ny); toast('Magma pocket vented — hull scorched!'); } else { set(nx,ny,tile); toast(`Venting magma... ${Math.ceil(tile.hp)} hits left`); } return; }
  if (tile.type === 'motherlode') { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.9; tile.hp -= p.drill; useFuel(dig(FUEL.dig.artifact)); spawnDust(nx, ny, '#ffb347', 24); audio.mine(); if (tile.hp <= 0) { set(nx,ny,{type:'air'}); wakeEnemiesNear(nx,ny); const extraction = beginExtraction(state.extractionPhase); state.extractionPhase = extraction.phase; if (extraction.changed) { addCash(ECONOMY.artifactReward); state.stats.motherlodeClaims++; saveProgress(); } spawnExplosion(nx,ny); toast('Motherlode core secured +$5000! Return it to the depot alive.'); } else { set(nx,ny,tile); toast(`Cracking Motherlode core... ${Math.ceil(tile.hp)} hits left`); } return; }
  if (tile.type !== 'air') {
    p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.65;
    tile.hp -= p.drill;
    useFuel(dig(FUEL.dig.dig));
    spawnDust(nx, ny, tile.type === 'ore' ? tile.ore.color : tile.type === 'artifact' ? tile.artifact.color : '#9d6a42', tile.type === 'ore' || tile.type === 'artifact' ? 14 : 9);
    audio.mine();
    if (tile.hp <= 0) {
      if (tile.type === 'ore') {
        if (cargoUsed() >= p.cargoMax) { tile.hp = 1; set(nx,ny,tile); toast('Cargo bay full. Go sell at the surface.'); audio.alarm(); return; }
        p.cargo.push(tile.ore); state.stats.oreMined++; saveProgress(); toast(`Mined ${tile.ore.name} +$${tile.ore.value}`); audio.ore(tile.ore.value);
      }
      if (tile.type === 'artifact') {
        const payout = claimArtifact(state, tile.artifact);
        saveProgress();
        toast(`ARTIFACT RECOVERED: ${tile.artifact.name} +$${payout} CASH NOW · Cargo unchanged.`);
        audio.cash(payout);
      }
      set(nx,ny,{type:'air'});
      wakeEnemiesNear(nx, ny);
    } else { set(nx,ny,tile); toast(`Drilling... ${Math.max(1, tile.hp)} hits left`); return; }
  } else {
    useFuel(flyCost);
    if (performance.now() - audio.lastMove > 120) { audio.blip(150 + Math.abs(dy)*35, 0.035, 'triangle', 0.02); audio.lastMove = performance.now(); }
  }
  p.x = nx; p.y = ny; p.bob = 1;
  revealAtPlayer();
  state.stats.maxDepth = Math.max(state.stats.maxDepth, Math.max(0, p.y - START_Y) * 10);
  wakeEnemiesNear(p.x, p.y);
  if (atSurface()) {
    const extraction = completeExtractionAtDepot(state.extractionPhase, true);
    state.extractionPhase = extraction.phase;
    if (extraction.changed) {
      state.stats.motherlodeExtractions++;
      saveProgress();
      toast('Motherlode extraction complete at the depot!');
    }
  }
  if (p.fuel < 0) p.fuel = 0;
  if (p.fuel <= 0) gameOver('Out of fuel — ship exploded. Tap anywhere to restart.');
}
function damage(n){ const p=state.player; p.hull = Math.max(0, p.hull - n); if(n > 1) audio.bump(); if(p.hull <= 0){ gameOver('Ship destroyed. Tap anywhere to restart.'); } }
function sell(){ const v = currentCargoValue(); if (!atSurface()) return toast('Depot is on the surface.'); if(!v) return toast('Cargo is empty.'); addCash(v); state.player.cargo=[]; saveProgress(); toast(`Sold cargo for $${v}.`); audio.cash(v); }
function spend(amount, fn, msg){ if (!atSurface()) return toast('Upgrades are at the surface.'); if (state.cash < amount) { audio.alarm(); return toast(`Need $${amount}.`); } state.cash -= amount; fn(); saveProgress(); toast(msg); audio.cash(amount); }
function buyPlayerUpgrade(id: PlayerUpgradeId, amount: number, msg: string){
  if (getPlayerUpgradeProgress(state.player, id).atMax) return toast('Upgrade already at maximum level.');
  spend(amount, () => {
    applyPlayerUpgrade(state.player, id);
    if (id === 'visibility') revealAtPlayer();
  }, msg);
}
function grantDeveloperUpgrade(id: PlayerUpgradeId){
  if (!applyPlayerUpgrade(state.player, id)) return toast('Developer upgrade already at maximum level.');
  if (id === 'visibility') revealAtPlayer();
  saveProgress();
  updateDeveloperUpgradeControls(ui.developerUpgrades, state.player);
  toast('Developer action: upgrade granted for $0.');
}
function grantDeveloperMoney(){
  grantDeveloperCash(state);
  saveProgress();
  ui.cash.textContent = `$${Math.floor(state.cash)}`;
  toast(`Developer action: +$${DEVELOPER_CASH_GRANT.toLocaleString('en-US')} granted.`);
}
function runDeveloperService(id: DeveloperServiceId){
  const changed = id === 'fuel'
    ? developerRefuel(state.player)
    : developerRepairHull(state.player);
  if (!changed) return toast(id === 'fuel' ? 'Fuel tank already full.' : 'Hull already at full strength.');
  saveProgress();
  hud();
  toast(id === 'fuel' ? 'Developer action: refueled for $0.' : 'Developer action: hull repaired for $0.');
}
function refuel(){
  const p = state.player;
  if (!atSurface()) return toast('Service depot is on the surface.');
  if (p.fuel >= p.fuelMax) return toast('Fuel tank already full.');
  if (state.cash <= 0) { audio.alarm(); return toast('No cash to buy fuel.'); }
  const full = refuelCost(p);
  const { value, pay } = partialFill(p.fuel, p.fuelMax, state.cash, full);
  p.fuel = value;
  state.cash -= pay;
  saveProgress();
  toast(p.fuel >= p.fuelMax ? 'Fuel tank full.' : `Partial refuel — spent $${Math.round(pay)} (all your cash).`);
  audio.cash(pay);
}
function repair(){
  const p = state.player;
  if (!atSurface()) return toast('Service depot is on the surface.');
  if (p.hull >= p.hullMax) return toast('Hull already at full strength.');
  if (state.cash <= 0) { audio.alarm(); return toast('No cash for repairs.'); }
  const full = repairCost(p);
  const { value, pay } = partialFill(p.hull, p.hullMax, state.cash, full);
  p.hull = value;
  state.cash -= pay;
  saveProgress();
  toast(p.hull >= p.hullMax ? 'Hull repaired.' : `Partial repair — spent $${Math.round(pay)} (all your cash).`);
  audio.cash(pay);
}
function buyDynamite(){
  spend(ECONOMY.dynamite.price, () => state.player.dynamite++, 'Dynamite loaded. Press E or Detonate underground.');
}
function detonateDynamite(){
  const p = state.player;
  if (state.gameOver) return;
  if (atSurface()) return toast('Dynamite can only be detonated underground.');
  if (p.dynamite <= 0) { audio.alarm(); return toast('No dynamite. Buy a charge at the surface depot.'); }
  ensureWorldRow(state.world, p.y + ECONOMY.dynamite.radius);
  const targets = getDynamiteBlastTargets(state.world, p.x, p.y, ECONOMY.dynamite.radius);
  p.dynamite--;
  for (const {x, y} of targets) set(x, y, {type:'air'});
  wakeEnemiesNear(p.x, p.y);
  spawnExplosion(p.x, p.y);
  audio.noise(.32, .12, 520);
  saveProgress();
  toast(targets.length ? `Dynamite cleared ${targets.length} blocks. Ore and artifacts were destroyed; no rewards granted.` : 'Dynamite detonated, but no destructible blocks were in range.');
}
function buyTeleporter(){
  spend(ECONOMY.teleporter.price, () => state.player.teleporters++, `Teleporter loaded. Press T or Teleport at ${MIN_TELEPORT_DEPTH_METERS} m or deeper.`);
}
function buyGun(){
  if (state.player.gunOwned) return toast('Linebreaker Gun is already installed.');
  spend(ECONOMY.gun.price, () => { state.player.gunOwned = true; }, 'Linebreaker Gun installed permanently. Buy ammunition before descending.');
}
function buyBullets(){
  const p = state.player;
  if (!p.gunOwned) return toast('Buy the Linebreaker Gun before buying ammunition.');
  if (p.bullets + ECONOMY.gun.ammoBundle > LIMITS.bullets.max) return toast('Ammunition storage is full.');
  spend(ECONOMY.gun.ammoPrice, () => { p.bullets += ECONOMY.gun.ammoBundle; }, `${ECONOMY.gun.ammoBundle} bullets loaded.`);
}
function setGunArmed(armed: boolean){
  const p = state.player;
  if (armed) {
    if (state.gameOver) return;
    if (atSurface()) return toast('The gun can only be fired underground.');
    if (!p.gunOwned) { audio.alarm(); return toast('Buy the permanent Linebreaker Gun at the surface shop.'); }
    if (p.bullets <= 0) { audio.alarm(); return toast('No ammunition. Buy bullet bundles at the surface shop.'); }
    keys.clear();
    state.input.keyImpulse = null;
    state.input.touchHoldDir = null;
    state.input.gunArmed = true;
    toast('GUN ARMED — press or tap a direction. G or Escape cancels.');
    return;
  }
  if (state.input.gunArmed) toast('Gun aim cancelled. No bullet used.');
  state.input.gunArmed = false;
}
function fireGun(direction: [number, number]){
  const p = state.player;
  if (!state.input.gunArmed || state.gameOver || atSurface() || !p.gunOwned || p.bullets <= 0) return false;
  if (direction[1] > 0) ensureWorldRow(state.world, p.y + ECONOMY.gun.range);
  const shot = resolveShot(state.world, p.x, p.y, direction, ECONOMY.gun.range, state.enemies.filter(enemy => enemy.alive));
  if (!shot) return false;
  if (!consumeBulletForShot(p, state.input.gunArmed, direction)) return false;
  state.input.gunArmed = false;
  state.input.touchHoldDir = null;
  p.drillDx = direction[0]; p.drillDy = direction[1];
  if (direction[0]) p.facing = direction[0];
  spawnShotTrail(shot.path);
  audio.blip(520, .08, 'square', .055, -180);
  const target = shot.target;
  if (target?.kind === 'enemy') {
    damageEnemy(state.enemies.find(enemy => enemy.id === target.enemy.id), ECONOMY.gun.damage);
    toast(`Direct enemy hit. ${p.bullets} bullets remain.`);
  } else if (target?.kind === 'tile') {
    if (target.tile.type === 'enemy') {
      if (isGuestEnemyReplica()) net?.send({type:'enemyTileShot', x:target.x, y:target.y, by:'guest'});
      else destroyDormantEnemy(target.x, target.y, 'host');
    } else {
      set(target.x,target.y,{type:'air'});
      wakeEnemiesNear(target.x,target.y);
      spawnDust(target.x,target.y,'#ffe58a',state.reducedMotion ? 3 : 12);
    }
    toast(`Shot destroyed ${target.tile.type}. No mining rewards. ${p.bullets} bullets remain.`);
  } else if (shot.outcome === 'blocked') toast(`Shot blocked by protected terrain. ${p.bullets} bullets remain.`);
  else toast(`Shot missed within ${ECONOMY.gun.range}-tile range. ${p.bullets} bullets remain.`);
  saveProgress();
  return true;
}
function useTeleporter(){
  const p = state.player;
  if (state.gameOver) return;
  const surf = atSurface();
  if (surf && !state.teleportReturnPosition) return toast('No underground teleport return point.');
  if (!surf && p.teleporters <= 0) { audio.alarm(); return toast('No teleporter. Buy one at the surface depot.'); }
  if (!surf && !canTeleportToSurface(p.y)) { audio.alarm(); return toast(`Teleport requires a depth of at least ${MIN_TELEPORT_DEPTH_METERS} m.`); }
  const camX = Math.max(0, Math.min(WORLD_W-W, state.camX));
  const camY = Math.max(0, state.camY);
  const originScreenX = (p.drawX - camX + .5) * TILE;
  const originScreenY = (p.drawY - camY + .5) * TILE;
  if (surf) {
    if (!teleportPlayerToReturn(p, state.teleportReturnPosition)) return;
    state.teleportReturnPosition = null;
  } else {
    const returnPosition = teleportPlayerToSurface(p);
    if (!returnPosition) return;
    state.teleportReturnPosition = returnPosition;
  }
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  state.teleportEffect = createTeleportEffect(originScreenX, originScreenY, p.x, p.y, reducedMotion);
  state.input.keyImpulse = null;
  state.input.touchHoldDir = null;
  state.input.gunArmed = false;
  state.camX = Math.max(0, p.x - Math.floor(W/2));
  state.camY = surf ? Math.max(0, p.y - Math.floor(H/2)) : 0;
  saveProgress();
  if (state.connected && net?.paired) net.send({type:'teleported', x:p.x, y:p.y});
  toast(surf ? 'Returned to the underground teleport point.' : 'Teleported safely to the depot. Press T to return underground.');
}
function surfaceService(){
  const p = state.player;
  if (!atSurface()) return toast('Service depot is on the surface.');
  if (currentCargoValue() > 0) return sell();
  if (p.fuel < p.fuelMax) return refuel();
  if (p.hull < p.hullMax) return repair();
  toast('Cargo empty, hull and fuel are full.');
}
function atSurface(){ return state.player.y < SURFACE_HEIGHT; }
function selectInfoTab(id: string, focusTab=false){
  const selected = getInfoNavigationSection(id);
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
  ui.sell.onclick = sell;
  ui.fuelBtn.onclick = () => refuel();
  ui.repairBtn.onclick = () => repair();
  ui.cargoBtn.onclick = () => buyPlayerUpgrade('cargo', cargoCost(state.player), 'Cargo bay expanded.');
  ui.tankBtn.onclick = () => buyPlayerUpgrade('tank', tankCost(state.player), 'Fuel tank upgraded.');
  ui.hullBtn.onclick = () => buyPlayerUpgrade('hull', hullCost(state.player), 'Hull reinforced.');
  ui.drillBtn.onclick = () => buyPlayerUpgrade('drill', drillCost(state.player), 'Drill power increased.');
  ui.visibilityBtn.onclick = () => buyPlayerUpgrade('visibility', visibilityCost(state.player), 'Sensor footprint expanded.');
  ui.dynamiteBtn.onclick = detonateDynamite;
  ui.teleporterBtn.onclick = useTeleporter;
  ui.gunBtn.onclick = () => setGunArmed(!state.input.gunArmed);
  ui.shopDynamiteBtn.onclick = buyDynamite;
  ui.shopTeleporterBtn.onclick = buyTeleporter;
  ui.shopGunBtn.onclick = buyGun;
  ui.shopBulletsBtn.onclick = buyBullets;
  ui.soundBtn.addEventListener('pointerdown', e => e.stopPropagation());
  ui.soundBtn.onclick = e => { e.stopPropagation(); audio.toggle(); };
  ui.infoBtn.onclick = e => { e.stopPropagation(); openInfoScreen(); };
  ui.infoCloseBtn.onclick = e => { e.stopPropagation(); closeInfoScreen(); };
  ui.resetPlayerDataBtn.onclick = e => {
    e.stopPropagation();
    if (!confirmPlayerDataReset(message => window.confirm(message))) return;
    clearTimeout(explorationSaveTimer);
    resettingPlayerData = true;
    net?.disconnect();
    resettingPlayerData = false;
    net = null;
    keys.clear();
    resetPlayerData(state);
    revealAtPlayer(false);
    clearTimeout(explorationSaveTimer);
    saveProgress();
    setConnectionStatus('Solo');
    closeInfoScreen();
    toast('Player data reset. Shared mine terrain preserved.');
  };
  ui.resetWorldStateBtn.onclick = e => {
    e.stopPropagation();
    if (!confirmWorldStateReset(message => window.confirm(message))) return;
    if (state.connected && net) {
      net.send({type:'worldReset', revision:worldRevision});
    } else {
      clearWorldRuntime();
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
    const cashButton = (e.target as Element).closest<HTMLButtonElement>('[data-developer-cash]');
    if (cashButton) {
      grantDeveloperMoney();
      return;
    }
    const serviceButton = (e.target as Element).closest<HTMLButtonElement>('[data-developer-service]');
    if (serviceButton) {
      runDeveloperService(serviceButton.dataset.developerService as DeveloperServiceId);
      return;
    }
    const developerButton = (e.target as Element).closest<HTMLButtonElement>('[data-developer-upgrade]');
    if (developerButton) {
      grantDeveloperUpgrade(developerButton.dataset.developerUpgrade as PlayerUpgradeId);
      return;
    }
    const button = (e.target as Element).closest<HTMLButtonElement>('[role="tab"]');
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
    const target = getInfoTabFocusTarget(tab.dataset.infoSection || '', key);
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
  updateDeveloperServiceControls(ui.developerUpgrades, state.player);
  updateDeveloperUpgradeControls(ui.developerUpgrades, state.player);
  selectInfoTab('info-objective');
  ui.infoCloseBtn.focus({preventScroll:true});
}
function closeInfoScreen(){
  ui.infoScreen.classList.add('hidden');
  ui.infoBtn.focus({preventScroll:true});
}
function renderCargoDetails(){
  const counts = new Map();
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
  ui.gunBtn.textContent = state.input.gunArmed ? `AIMING — tap direction · x${p.bullets}` : `Arm Gun (G) · x${p.bullets}`;
  ui.gunBtn.classList.toggle('armed', state.input.gunArmed);
  ui.gunBtn.setAttribute('aria-pressed', String(state.input.gunArmed));
  ui.dynamiteBtn.disabled = surf || p.dynamite <= 0 || state.gameOver;
  ui.teleporterBtn.disabled = state.gameOver || !canUseTeleporter(p, state.teleportReturnPosition);
  ui.gunBtn.disabled = surf || !p.gunOwned || p.bullets <= 0 || state.gameOver;
  if (!ui.shopScreen.classList.contains('hidden')) updateShopControls(ui.shopCard, p, state.cash, surf);
}
const movementKeys = {
  arrowleft: [-1, 0], a: [-1, 0],
  arrowright: [1, 0], d: [1, 0],
  arrowup: [0, -1], w: [0, -1],
  arrowdown: [0, 1], s: [0, 1]
};
function heldKeyDirection(){
  if (keys.has('arrowleft')||keys.has('a')) return [-1,0];
  if (keys.has('arrowright')||keys.has('d')) return [1,0];
  if (keys.has('arrowup')||keys.has('w')) return [0,-1];
  if (keys.has('arrowdown')||keys.has('s')) return [0,1];
  return null;
}
function requestReset(){
  if (state.gameOver) { restartGame(); return; }
  const now = performance.now();
  if (now < resetConfirmUntil) {
    restartGame();
    return;
  }
  resetConfirmUntil = now + 3500;
  toast('Press R again to reset progress in this run.');
}
function input(){
  state.tick++;
  state.input.sprintDirection = null;
  if (!state.introStarted) return;
  const now = performance.now();
  const sprinting = keys.has('shift');
  const impulse = state.input.keyImpulse;
  if (impulse) {
    state.input.keyImpulse = null;
    state.input.lastKeyboardMove = now;
    state.input.sprintDirection = activeSprintDirection(!state.gameOver && sprinting, isOpenMovementDestination(impulse[0], impulse[1]), impulse[0], impulse[1]);
    move(impulse[0], impulse[1], sprinting);
    return;
  }
  const held = heldKeyDirection();
  const destinationOpen = held ? isOpenMovementDestination(held[0], held[1]) : false;
  if (held) state.input.sprintDirection = activeSprintDirection(!state.gameOver && sprinting, destinationOpen, held[0], held[1]);
  if (held && now - state.input.lastKeyboardMove >= keyboardMovementRepeatMs(state.input.keyboardRepeatMs, sprinting, destinationOpen)) {
    state.input.lastKeyboardMove = now;
    move(held[0], held[1], sprinting);
    return;
  }
  const touch = state.input.touchHoldDir;
  if (touch && now - state.input.lastTouchMove >= state.input.touchRepeatMs) {
    state.input.lastTouchMove = now;
    moveFromTouch(touch[0], touch[1], false);
  }
}
function moveFromTouch(dx, dy, immediate=true) {
  if (!state.introStarted) return;
  if (state.input.gunArmed) { fireGun([dx, dy]); return; }
  if (immediate) state.input.lastTouchMove = performance.now();
  move(dx, dy);
}
function canvasCoverGeometry(){
  const rect = canvas.getBoundingClientRect();
  const scale = Math.max(rect.width / VIEW_WIDTH, rect.height / VIEW_HEIGHT);
  const drawnW = VIEW_WIDTH * scale;
  const drawnH = VIEW_HEIGHT * scale;
  return {rect, scale, offsetX: (rect.width - drawnW) / 2, offsetY: (rect.height - drawnH) / 2};
}
function shipClientPosition(){
  const {rect, scale, offsetX, offsetY} = canvasCoverGeometry();
  const p = state.player;
  const camX = Math.max(0, Math.min(WORLD_W-W, state.camX));
  const camY = Math.max(0, state.camY);
  return {
    x: rect.left + offsetX + (p.drawX - camX + 0.5) * TILE * scale,
    y: rect.top + offsetY + (p.drawY - camY + 0.5) * TILE * scale
  };
}
function directionFromPoint(clientX: number, clientY: number, fallbackStart: {x: number; y: number} | null = null): [number, number] | null {
  const ship = shipClientPosition();
  let dx = clientX - ship.x;
  let dy = clientY - ship.y;
  if (Math.hypot(dx, dy) < 18 && fallbackStart) {
    dx = clientX - fallbackStart.x;
    dy = clientY - fallbackStart.y;
  }
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (Math.max(adx, ady) < 12) return null;
  return adx > ady * 0.75 ? [dx > 0 ? 1 : -1, 0] : [0, dy > 0 ? 1 : -1];
}
function bindTouchControls(){
  let start = null, tracking = false, aimedGesture = false;
  gamePanel.addEventListener('pointerdown', e => {
    const target = e.target as Element;
    if (target.closest && target.closest('button, #info-screen, #lobby-screen')) return;
    tracking = true;
    aimedGesture = state.input.gunArmed;
    start = {x: e.clientX, y: e.clientY};
    const dir = directionFromPoint(e.clientX, e.clientY);
    state.input.touchHoldDir = dir;
    tryAutoAudio(e);
    if (dir) moveFromTouch(dir[0], dir[1]);
    gamePanel.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  gamePanel.addEventListener('pointermove', e => {
    if (!tracking) return;
    const dir = directionFromPoint(e.clientX, e.clientY, start);
    if (dir) state.input.touchHoldDir = dir;
    e.preventDefault();
  });
  gamePanel.addEventListener('pointerup', e => {
    if (!tracking) return;
    tracking = false;
    const dir = directionFromPoint(e.clientX, e.clientY, start);
    state.input.touchHoldDir = null;
    // Keep quick flicks/swipes working, but taps already move on pointerdown.
    if (dir && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 28 && !aimedGesture) moveFromTouch(dir[0], dir[1]);
    start = null;
    aimedGesture = false;
    e.preventDefault();
  });
  gamePanel.addEventListener('pointercancel', () => { tracking = false; aimedGesture = false; state.input.touchHoldDir = null; start = null; });
  gamePanel.addEventListener('touchmove', e => e.preventDefault(), {passive:false});
}
function updateAnimation(){
  const p = state.player;
  p.drawX += (p.x - p.drawX) * 0.23;
  p.drawY += (p.y - p.drawY) * 0.23;
  p.bob *= 0.86;
  p.drillAnim *= 0.90;
  state.remotePlayers = interpolateRemotePlayers(state.remotePlayers, 0.23);
  state.teleportEffect = advanceTeleportEffect(state.teleportEffect);
  const targetCamX = Math.max(0, Math.min(WORLD_W-W, p.drawX - W/2 + 0.5));
  const targetCamY = Math.max(0, p.drawY - H/2 + 0.5);
  state.camX += (targetCamX - state.camX) * 0.12;
  state.camY += (targetCamY - state.camY) * 0.12;
  state.particles = state.particles.filter(pt => {
    pt.x += pt.vx; pt.y += pt.vy; pt.vy += .003; pt.life -= 1;
    return pt.life > 0;
  });
}
function draw(){
  updateAnimation();
  renderer.draw();
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
  if (!ui.infoScreen.classList.contains('hidden')) { renderCargoDetails(); renderExpeditionStats(); updateDeveloperServiceControls(ui.developerUpgrades, p); updateDeveloperUpgradeControls(ui.developerUpgrades, p); }
  updateButtonStates();
}
function loop(){
  input();
  if (!state.gameOver && net?.paired && state.connected) net.sendPlayerState(playerStateFrom(state.player));
  if (state.introStarted) {
    if (isGuestEnemyReplica()) {
      updateEnemyPresentation();
      updateEnemyBites();
    } else {
      updateEnemies();
      if (isPairedHost()) net?.sendEnemySnapshot(enemySnapshotFrom(state.enemies, worldRevision));
    }
  }
  draw(); hud(); requestAnimationFrame(loop);
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
  catch (_) { try { (gamePanel || canvas).focus(); } catch (_) {} }
}
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
function startIntro(event?: Event){
  if (state.introStarted) return;
  state.introStarted = true;
  ui.intro?.classList.add('hidden');
  setTimeout(() => { if (ui.intro) ui.intro.style.display = 'none'; }, 320);
  focusGame();
  tryAutoAudio(event, true);
  toast('Drill ready. Mine ore, sell it, and watch your fuel.');
}
function handleKeyDown(e){
  if (e.__moleloadHandled) return;
  e.__moleloadHandled = true;
  // Keyboard movement must work even before the browser grants audio permission.
  // Sound can still be enabled with the Sound button or any pointer/touch input.
  const key = e.key.toLowerCase();
  if (!ui.shopScreen.classList.contains('hidden')) {
    if (key === 'escape') { closeShopScreen(); e.preventDefault(); e.stopPropagation(); }
    else if (key === 'tab') keepFocusInDialog(e, ui.shopScreen);
    return;
  }
  if (!ui.infoScreen.classList.contains('hidden')) {
    if (key === 'escape') { closeInfoScreen(); e.preventDefault(); e.stopPropagation(); }
    else if (key === 'tab') keepFocusInDialog(e, ui.infoScreen);
    return;
  }
  if (!ui.lobby.classList.contains('hidden')) return;
  const dir = movementKeys[key];
  if (!state.introStarted) {
    if (key === 'enter' || key === ' ') { startIntro(); e.preventDefault(); }
    return;
  }
  if (key === 'shift') {
    keys.add(key);
    return;
  }
  const gunAction = gunKeyAction(state.input.gunArmed, key);
  if (gunAction === 'arm') { if (!e.repeat) setGunArmed(true); e.preventDefault(); e.stopPropagation(); return; }
  if (gunAction === 'cancel') { if (!e.repeat) setGunArmed(false); e.preventDefault(); e.stopPropagation(); return; }
  if (gunAction === 'fire' && dir) { if (!e.repeat) fireGun(dir as [number, number]); e.preventDefault(); e.stopPropagation(); return; }
  if (dir) {
    if (e.shiftKey) keys.add('shift');
    if (!keys.has(key) && !e.repeat) state.input.keyImpulse = dir;
    keys.add(key);
    e.preventDefault();
    return;
  }
  if (key === 'enter') { sell(); e.preventDefault(); e.stopPropagation(); return; }
  if (key === ' ') { surfaceService(); e.preventDefault(); e.stopPropagation(); return; }
  if (key === 'e') { if (!e.repeat) detonateDynamite(); e.preventDefault(); e.stopPropagation(); return; }
  if (key === 't') { if (!e.repeat) useTeleporter(); e.preventDefault(); e.stopPropagation(); return; }
  if (key === 'r') { if (!e.repeat) requestReset(); e.preventDefault(); e.stopPropagation(); }
}
function handleKeyUp(e){
  keys.delete(e.key.toLowerCase());
  if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); }
}
export function initGame(){
  audio = createAudio(ui, toast);
  state.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  renderer = createRenderer({ state, get, rand });
  loadProgress();
  ui.serverUrl.value = loadServerUrl(ui.serverUrl.value);
  addEventListener('touchstart', tryAutoAudio, {passive:true});
  addEventListener('keydown', handleKeyDown, {capture:true});
  document.addEventListener('keydown', handleKeyDown, {capture:true});
  gamePanel.addEventListener('keydown', handleKeyDown, {capture:true});
  canvas.addEventListener('keydown', handleKeyDown, {capture:true});
  addEventListener('keyup', handleKeyUp, {capture:true});
  document.addEventListener('keyup', handleKeyUp, {capture:true});
  gamePanel.addEventListener('keyup', handleKeyUp, {capture:true});
  canvas.addEventListener('keyup', handleKeyUp, {capture:true});
  addEventListener('focus', focusGame);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) focusGame(); });
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
    if (!url) { setConnectionStatus('Enter a server URL'); return; }
    saveServerUrl(url);
    startOnline(url);
  };
  ui.soloBtn.onclick = event => {
    event.stopPropagation();
    playSolo(event);
  };
  addEventListener('pointerdown', e => {
    const target = e.target as Element;
    if (target.closest && target.closest('#info-screen, #shop-screen, #lobby-screen')) return;
    if (!state.introStarted) { startIntro(e); e.preventDefault(); e.stopPropagation(); return; }
    if (!state.gameOver) return;
    tryAutoAudio(e);
    restartGame();
    e.preventDefault();
    e.stopPropagation();
  }, {capture:true});
  addEventListener('touchstart', e => {
    const target = e.target as Element;
    if (target.closest && target.closest('#info-screen, #shop-screen, #lobby-screen')) return;
    if (!state.introStarted) { startIntro(e); e.preventDefault(); e.stopPropagation(); return; }
    if (!state.gameOver) return;
    tryAutoAudio(e);
    restartGame();
    e.preventDefault();
    e.stopPropagation();
  }, {capture:true, passive:false});
  addEventListener('pointerdown', tryAutoAudio);
  bindButtons(); bindTouchControls(); generate(); setInterval(saveProgress, 60000); addEventListener('beforeunload', saveProgress); focusGame(); setTimeout(focusGame, 60); loop();
}
