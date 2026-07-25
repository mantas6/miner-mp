import { ORES, START_Y, SURFACE_HEIGHT, TILE, WORLD_H, WORLD_W } from './constants';
import { canvas, gamePanel, ctx, H, keys, ui, VIEW_HEIGHT, VIEW_WIDTH, W } from './dom';
import { createAudio } from './audio';
import { shouldAttemptAutoAudio } from './audio-permission';
import { createInitialState, respawnPlayer } from './state';
import { createRenderer } from './renderer';
import { STARTING, FUEL, HULL, ENEMY, ECONOMY } from './balance';
import { refuelCost, repairCost, cargoCost, tankCost, drillCost, partialFill, cargoValue, formatCargoUpgradeFeedback, formatSurfaceServiceGuidance } from './economy';
import { shouldCargoBarFlash, shouldFuelBarFlash, shouldHullBarFlash } from './hud-alerts';
import { formatExpeditionObjective } from './objective';
import { load, save, DEFAULT_STATS } from './persistence';
import { formatExpeditionStats } from './stats';
import { rand, makeTile } from './world';
import { getInfoNavigationSection, resolveActiveInfoSection } from './info-navigation';
import { formatTerrainScanner } from './scanner';
import { formatFuelReserveForecast } from './fuel-reserve';
import { formatDepthMilestone } from './depth-milestone';
import { beginExtraction, cancelExtraction, completeExtractionAtDepot } from './extraction-phase';
import { formatExtractionPresentation } from './extraction-presentation';
import { createNet, type NetClient } from './net';
import { applyEnemyDead, applyEnemySpawn, applyRemotePlayerState, applyTileDiff, applyWorldSyncToWorld, enemyEntryFrom, enemySnapshotFrom, interpolateRemotePlayers, mergeEnemySnapshot, mergeWorldSync, nextEnemyId, playerStateFrom, remotePlayerFrom, worldSyncFrom, type EnemySnapshotEntry, type TileDiff } from './net-protocol';
import { loadServerUrl, saveServerUrl } from './multiplayer-settings';
import type { Enemy } from './types';

const state = createInitialState();
let audio;
let renderer;
let enemyIdCounter = 1;
let resetConfirmUntil = 0;
let toastTimer = 0;
let net: NetClient | null = null;
let connectionIssue: string | null = null;
let tileDiff: TileDiff = {};

state.stats = {...DEFAULT_STATS};

function loadProgress() { load(state); }

function saveProgress() { save(state); }

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
  state.world = Array.from({length: WORLD_H}, (_,y)=>Array.from({length: WORLD_W},(_,x)=>makeTile(x,y)));
  tileDiff = {};
  resetPlayer(false);
}
function resetPlayer(full=true){
  state.extractionPhase = cancelExtraction();
  if (full) { state.cash = STARTING.cash; state.player.fuelMax=STARTING.fuelMax; state.player.hullMax=STARTING.hullMax; state.player.cargoMax=STARTING.cargoMax; state.player.drill=STARTING.drill; state.stats = {...DEFAULT_STATS}; saveProgress(); }
  respawnPlayer(state.player);
  state.camX = Math.max(0, state.player.x - Math.floor(W/2));
  state.camY = 0;
  state.particles.length = 0;
  state.gameOver = false; toast('Fresh drill deployed.');
}
function get(x,y){ return state.world[y]?.[x] || {type:'rock', hp:999}; }
function set(x,y,t, broadcast=true){
  const row = state.world[y];
  if (!row || x < 0 || x >= row.length) return;
  const previousType = row[x].type;
  row[x] = t;
  if (previousType !== t.type) renderer?.invalidateTerrain();
  // Guests retain received/local mutations too: they may become the next host.
  if (state.role) tileDiff = applyTileDiff(tileDiff, {x, y, tile: t});
  if (broadcast && state.connected && net?.paired) net.send({type:'tile', x, y, tile:t});
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
        net?.send(worldSyncFrom(tileDiff, state.enemies));
        startOnlineGame();
      },
      onPeerLeft(){
        state.remotePlayers = [];
        if (state.role === 'guest') {
          state.role = 'host';
          enemyIdCounter = nextEnemyId(state.enemies);
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
        if (msg.type === 'playerState') state.remotePlayers = applyRemotePlayerState(state.remotePlayers, msg);
        if (msg.type === 'tile') set(msg.x, msg.y, msg.tile, false);
        if (msg.type === 'worldSync' && isGuestEnemyReplica()) {
          applyWorldSyncToWorld(state.world, msg);
          renderer.invalidateTerrain();
          tileDiff = mergeWorldSync(tileDiff, [], msg).diff;
          mergeEnemyEntries(msg.enemies);
        }
        if (msg.type === 'enemySnapshot' && isGuestEnemyReplica()) mergeEnemyEntries(msg.enemies);
        if (msg.type === 'enemySpawn' && isGuestEnemyReplica()) {
          applyEnemyEntries(applyEnemySpawn(state.enemies.map(enemyEntryFrom), msg));
          spawnDust(msg.x, msg.y, '#8aff5a', 18);
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
        if (msg.type === 'wakeNear' && isPairedHost()) wakeEnemiesNear(msg.x, msg.y);
        if (msg.type === 'bounty' && isGuestEnemyReplica()) creditEnemyBounty(msg.amount);
        if (msg.type === 'died') state.remotePlayers = [];
        if (msg.type === 'respawned') {
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
function enemyAt(x,y){
  return state.enemies.find(e => e.alive && Math.round(e.x) === x && Math.round(e.y) === y);
}
function wakeEnemy(x,y){
  if (isGuestEnemyReplica()) return false;
  const tile = get(x,y);
  if (tile.type !== 'enemy') return false;
  set(x,y,{type:'air'});
  const enemy = {id: enemyIdCounter++, x, y, drawX:x, drawY:y, hp:tile.hp || 4, maxHp:tile.maxHp || tile.hp || 4, alive:true, moveTick:0, biteTick:0, flash:0};
  state.enemies.push(enemy);
  if (isPairedHost()) net?.send({type:'enemySpawn', id:enemy.id, x, y, hp:enemy.hp, maxHp:enemy.maxHp});
  spawnDust(x, y, '#8aff5a', 18);
  audio.enemyWake();
  toast('Tunnel fiend awakened! Drill it before it chews the hull.');
  return true;
}
function wakeEnemiesNear(x,y){
  if (isGuestEnemyReplica()) {
    if (net?.paired) net.send({type:'wakeNear', x, y});
    return;
  }
  for (let yy=y-1; yy<=y+1; yy++) for (let xx=x-1; xx<=x+1; xx++) {
    if (Math.abs(xx-x) + Math.abs(yy-y) <= 1) wakeEnemy(xx, yy);
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
function updateEnemies(){
  if (isGuestEnemyReplica()) return;
  if (state.gameOver || !state.introStarted) return;
  const p = state.player;
  state.enemies = state.enemies.filter(e => e.alive);
  for (const e of state.enemies) {
    e.drawX += (e.x - e.drawX) * 0.28;
    e.drawY += (e.y - e.drawY) * 0.28;
    e.flash *= 0.82;
    const dist = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
    if (dist <= 1) {
      if (state.tick - e.biteTick > 22) {
        e.biteTick = state.tick;
        const bite = HULL.enemyBite.base + Math.floor(e.y / HULL.enemyBite.perDepth) * HULL.enemyBite.step;
        damage(bite);
        spawnDust(p.x, p.y, '#ff5d45', 10);
        toast(`Enemy chewing the hull! -${bite}`);
      }
      continue; // Bite from an adjacent tile; never step onto the ship's tile.
    }
    const moveDelay = Math.max(7, 14 - Math.floor(e.y / 70));
    if (state.tick - e.moveTick < moveDelay || dist > 24) continue;
    e.moveTick = state.tick;
    const horizontal = [Math.sign(p.x - e.x), 0];
    const vertical = [0, Math.sign(p.y - e.y)];
    const options = Math.abs(p.x - e.x) >= Math.abs(p.y - e.y) ? [horizontal, vertical] : [vertical, horizontal];
    for (const [dx,dy] of options) {
      if (!dx && !dy) continue;
      const nx = e.x + dx, ny = e.y + dy;
      if (nx <= 0 || nx >= WORLD_W-1 || ny < SURFACE_HEIGHT || ny >= WORLD_H-1) continue;
      if (nx === p.x && ny === p.y) continue;
      if (get(nx,ny).type === 'air' && !enemyAt(nx,ny)) { e.x = nx; e.y = ny; break; }
    }
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
    if (state.tick - e.biteTick <= 22) continue;
    e.biteTick = state.tick;
    const bite = HULL.enemyBite.base + Math.floor(e.y / HULL.enemyBite.perDepth) * HULL.enemyBite.step;
    damage(bite);
    spawnDust(p.x, p.y, '#ff5d45', 10);
    toast(`Enemy chewing the hull! -${bite}`);
  }
}
function grounded(){
  const p = state.player;
  return p.y >= WORLD_H-1 || get(p.x, p.y + 1).type !== 'air';
}
function restartGame(){
  resetConfirmUntil = 0;
  const died = state.gameOver;
  keys.clear();
  state.input.keyImpulse = null;
  state.input.touchHoldDir = null;
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
  state.extractionPhase = cancelExtraction();
  state.stats.deaths++;
  saveProgress();
  if (state.connected && net?.paired) net.send({type:'died'});
  toast(msg);
  spawnExplosion(state.player.x, state.player.y);
  audio.alarm();
  audio.bump();
}
function move(dx,dy){
  if (state.gameOver) return;
  const p = state.player;
  if (p.fuel <= 0) { gameOver('Out of fuel — ship exploded. Tap anywhere to restart.'); return; }
  const nx = Math.max(1, Math.min(WORLD_W-2, p.x + dx));
  const ny = Math.max(START_Y, Math.min(WORLD_H-1, p.y + dy));
  if (nx === p.x && ny === p.y) {
    if (dy < 0 && p.y === START_Y) toast('Stay low — the surface airspace is for the depot, not flying.');
    return;
  }
  const tile = get(nx,ny);
  const activeEnemy = enemyAt(nx, ny);
  let cost = FUEL.baseMove + Math.abs(dy)*FUEL.vertical;
  const flyCost = cost * FUEL.flyMult;             // flying uses 50% less fuel
  const dig = extra => (cost + extra) * FUEL.digMult; // digging uses 50% more fuel
  p.facing = dx ? Math.sign(dx) : p.facing;
  p.drillDx = dx;
  p.drillDy = dy;
  if (activeEnemy) { p.drillAnim = 1.65; p.fuel -= dig(FUEL.dig.enemy); damageEnemy(activeEnemy); return; }
  if (tile.type !== 'air' && dy < 0) { p.drillDx = 0; p.drillDy = -1; p.drillAnim = 0.75; audio.bump(); toast('The drill cannot dig upward. Use tunnels to fly up.'); return; }
  if (tile.type !== 'air' && dx !== 0 && dy === 0 && !grounded()) { p.drillDx = dx; p.drillDy = 0; p.drillAnim = 0.55; audio.bump(); toast('Side drilling needs solid ground underneath.'); return; }
  if (tile.type === 'rock') { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.2; damage(HULL.rockBump); p.fuel -= dig(0); spawnDust(nx, ny, '#444857', 8); audio.bump(); toast('Solid rock blocks the drill.'); return; }
  if (tile.type === 'enemy') { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.65; p.fuel -= dig(FUEL.dig.enemy); damageEnemyTile(nx, ny); return; }
  if (tile.type === 'hazard') { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.65; tile.hp -= p.drill; p.fuel -= dig(FUEL.dig.hazard); damage(HULL.hazardBase + Math.floor(ny/HULL.hazardDepthDivisor)); spawnDust(nx, ny, '#ff5f24', 18); audio.alarm(); if (tile.hp <= 0) { set(nx,ny,{type:'air'}); spawnExplosion(nx,ny); wakeEnemiesNear(nx,ny); toast('Magma pocket vented — hull scorched!'); } else { set(nx,ny,tile); toast(`Venting magma... ${Math.ceil(tile.hp)} hits left`); } return; }
  if (tile.type === 'artifact') { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.9; tile.hp -= p.drill; p.fuel -= dig(FUEL.dig.artifact); spawnDust(nx, ny, '#ffb347', 24); audio.mine(); if (tile.hp <= 0) { set(nx,ny,{type:'air'}); const extraction = beginExtraction(state.extractionPhase); state.extractionPhase = extraction.phase; if (extraction.changed) { addCash(ECONOMY.artifactReward); state.stats.motherlodeClaims++; saveProgress(); } spawnExplosion(nx,ny); toast('Motherlode core secured +$5000! Return it to the depot alive.'); } else { set(nx,ny,tile); toast(`Cracking Motherlode core... ${Math.ceil(tile.hp)} hits left`); } return; }
  if (tile.type !== 'air') {
    p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.65;
    tile.hp -= p.drill;
    p.fuel -= dig(FUEL.dig.dig);
    spawnDust(nx, ny, tile.type === 'ore' ? tile.ore.color : '#9d6a42', tile.type === 'ore' ? 14 : 9);
    audio.mine();
    if (tile.hp <= 0) {
      if (tile.type === 'ore') {
        if (cargoUsed() >= p.cargoMax) { tile.hp = 1; set(nx,ny,tile); toast('Cargo bay full. Go sell at the surface.'); audio.alarm(); return; }
        p.cargo.push(tile.ore); state.stats.oreMined++; saveProgress(); toast(`Mined ${tile.ore.name} +$${tile.ore.value}`); audio.ore(tile.ore.value);
      }
      set(nx,ny,{type:'air'});
      wakeEnemiesNear(nx, ny);
    } else { set(nx,ny,tile); toast(`Drilling... ${Math.max(1, tile.hp)} hits left`); return; }
  } else {
    p.fuel -= flyCost;
    if (performance.now() - audio.lastMove > 120) { audio.blip(150 + Math.abs(dy)*35, 0.035, 'triangle', 0.02); audio.lastMove = performance.now(); }
  }
  p.x = nx; p.y = ny; p.bob = 1;
  state.stats.maxDepth = Math.max(state.stats.maxDepth, Math.max(0, p.y - START_Y) * 10);
  wakeEnemiesNear(p.x, p.y);
  if (atSurface()) {
    p.fuel = Math.min(p.fuelMax, p.fuel + FUEL.surfaceRefuel);
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
function surfaceService(){
  const p = state.player;
  if (!atSurface()) return toast('Service depot is on the surface.');
  if (currentCargoValue() > 0) return sell();
  if (p.fuel < p.fuelMax) return refuel();
  if (p.hull < p.hullMax) return repair();
  toast('Cargo empty, hull and fuel are full.');
}
function atSurface(){ return state.player.y < SURFACE_HEIGHT; }
function updateActiveInfoNavigation(){
  if (ui.infoScreen.classList.contains('hidden')) return;
  const sections = [...ui.infoCard.querySelectorAll<HTMLElement>('section[id]')].map(section => ({
    id: section.id,
    top: section.offsetTop,
    bottom: section.offsetTop + section.offsetHeight
  }));
  const activeId = resolveActiveInfoSection(sections, ui.infoCard.scrollTop, ui.infoCard.clientHeight, ui.infoCard.scrollHeight);
  if (!activeId) return;
  for (const navButton of ui.infoScreen.querySelectorAll<HTMLButtonElement>('[data-info-section]')) {
    navButton.toggleAttribute('aria-current', navButton.dataset.infoSection === activeId);
  }
}
function bindButtons(){
  ui.sell.onclick = sell;
  ui.fuelBtn.onclick = () => refuel();
  ui.repairBtn.onclick = () => repair();
  ui.cargoBtn.onclick = () => spend(cargoCost(state.player),()=>state.player.cargoMax+=ECONOMY.cargo.step,'Cargo bay expanded.');
  ui.tankBtn.onclick = () => spend(tankCost(state.player),()=>{state.player.fuelMax+=ECONOMY.tank.step; state.player.fuel=state.player.fuelMax;},'Fuel tank upgraded.');
  ui.drillBtn.onclick = () => spend(drillCost(state.player),()=>state.player.drill+=ECONOMY.drill.step,'Drill power increased.');
  ui.soundBtn.addEventListener('pointerdown', e => e.stopPropagation());
  ui.soundBtn.onclick = e => { e.stopPropagation(); audio.toggle(); };
  ui.infoBtn.onclick = e => { e.stopPropagation(); openInfoScreen(); };
  ui.infoCloseBtn.onclick = e => { e.stopPropagation(); closeInfoScreen(); };
  ui.infoScreen.addEventListener('pointerdown', e => { if (e.target === ui.infoScreen) closeInfoScreen(); });
  ui.infoCard.addEventListener('scroll', updateActiveInfoNavigation, {passive:true});
  ui.infoScreen.addEventListener('click', e => {
    const button = (e.target as Element).closest<HTMLButtonElement>('[data-info-section]');
    if (!button) return;
    const section = getInfoNavigationSection(button.dataset.infoSection || '');
    const target = section && document.getElementById(section.id);
    if (!target) return;
    target.focus({preventScroll:true});
    target.scrollIntoView({block:'start'});
    for (const navButton of ui.infoScreen.querySelectorAll<HTMLButtonElement>('[data-info-section]')) {
      navButton.toggleAttribute('aria-current', navButton === button);
    }
    requestAnimationFrame(updateActiveInfoNavigation);
  });
}
function openInfoScreen(){
  ui.infoScreen.classList.remove('hidden');
  renderCargoDetails();
  renderExpeditionStats();
  updateActiveInfoNavigation();
}
function closeInfoScreen(){
  ui.infoScreen.classList.add('hidden');
  focusGame();
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
  for (const button of [ui.sell, ui.fuelBtn, ui.repairBtn, ui.cargoBtn, ui.tankBtn, ui.drillBtn]) button.hidden = !surf;
  ui.sell.disabled = !surf || currentCargoValue() <= 0;
  ui.fuelBtn.textContent = `Refuel $${refuelCost(p)}`;
  ui.repairBtn.textContent = `Repair $${repairCost(p)}`;
  ui.cargoBtn.textContent = `Cargo +10 $${cargoCost(p)}`;
  ui.tankBtn.textContent = `Tank +20 $${tankCost(p)}`;
  ui.drillBtn.textContent = `Drill +1 $${drillCost(p)}`;
  ui.fuelBtn.disabled = !surf || state.cash <= 0 || p.fuel >= p.fuelMax;
  ui.repairBtn.disabled = !surf || state.cash <= 0 || p.hull >= p.hullMax;
  ui.cargoBtn.disabled = !surf || state.cash < cargoCost(p);
  ui.tankBtn.disabled = !surf || state.cash < tankCost(p);
  ui.drillBtn.disabled = !surf || state.cash < drillCost(p);
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
  if (!state.introStarted) return;
  const now = performance.now();
  const impulse = state.input.keyImpulse;
  if (impulse) {
    state.input.keyImpulse = null;
    state.input.lastKeyboardMove = now;
    move(impulse[0], impulse[1]);
    return;
  }
  const held = heldKeyDirection();
  if (held && now - state.input.lastKeyboardMove >= state.input.keyboardRepeatMs) {
    state.input.lastKeyboardMove = now;
    move(held[0], held[1]);
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
  const camY = Math.max(0, Math.min(WORLD_H-H, state.camY));
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
  let start = null, tracking = false;
  gamePanel.addEventListener('pointerdown', e => {
    const target = e.target as Element;
    if (target.closest && target.closest('button, #info-screen, #lobby-screen')) return;
    tracking = true;
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
    if (dir && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 28) moveFromTouch(dir[0], dir[1]);
    start = null;
    e.preventDefault();
  });
  gamePanel.addEventListener('pointercancel', () => { tracking = false; state.input.touchHoldDir = null; start = null; });
  gamePanel.addEventListener('touchmove', e => e.preventDefault(), {passive:false});
}
function updateAnimation(){
  const p = state.player;
  p.drawX += (p.x - p.drawX) * 0.23;
  p.drawY += (p.y - p.drawY) * 0.23;
  p.bob *= 0.86;
  p.drillAnim *= 0.90;
  state.remotePlayers = interpolateRemotePlayers(state.remotePlayers, 0.23);
  const targetCamX = Math.max(0, Math.min(WORLD_W-W, p.drawX - W/2 + 0.5));
  const targetCamY = Math.max(0, Math.min(WORLD_H-H, p.drawY - H/2 + 0.5));
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
  ui.objectiveStatus.textContent = objectiveCopy;
  ui.objectiveInfoStatus.textContent = objectiveCopy;
  const extractionPresentation = formatExtractionPresentation({
    phase: state.extractionPhase,
    motherlodeExtractions: state.stats.motherlodeExtractions,
    reward: ECONOMY.artifactReward
  });
  ui.extractionStatus.textContent = extractionPresentation.hud || '';
  ui.extractionStatus.classList.toggle('hidden', !extractionPresentation.hud);
  ui.extractionInfoStatus.textContent = extractionPresentation.info;
  const scannerDirection: [number, number] = p.drillDx || p.drillDy ? [p.drillDx, p.drillDy] : [p.facing || 1, 0];
  const scannerX = p.x + scannerDirection[0];
  const scannerY = p.y + scannerDirection[1];
  ui.terrainScanner.textContent = formatTerrainScanner({
    tile: get(scannerX, scannerY),
    direction: scannerDirection,
    activeEnemy: Boolean(enemyAt(scannerX, scannerY))
  });
  ui.fuelReserve.textContent = formatFuelReserveForecast({
    fuel: p.fuel,
    playerY: p.y,
    startY: START_Y,
    atSurface: atSurface(),
    gameOver: state.gameOver
  });
  ui.depthMilestone.textContent = formatDepthMilestone(p.y);
  ui.cargoFeedback.textContent = formatCargoUpgradeFeedback(p, state.cash, displayedCargoValue);
  ui.serviceStatus.textContent = formatSurfaceServiceGuidance({
    player: p,
    cash: state.cash,
    currentCargoValue: displayedCargoValue,
    atSurface: atSurface()
  });
  const lowFuel = shouldFuelBarFlash(state);
  const lowHull = shouldHullBarFlash(state);
  const fullCargo = shouldCargoBarFlash(state);
  ui.fuel.closest('.bar')?.classList.toggle('bar-alert', lowFuel);
  ui.hull.closest('.bar')?.classList.toggle('bar-alert', lowHull);
  ui.cargo.closest('.bar')?.classList.toggle('bar-alert', fullCargo);
  ui.fuelWarning.classList.toggle('show', lowFuel);
  if (lowFuel && !atSurface() && performance.now() - audio.lastLowFuel > FUEL.lowFuelWarnMs) { audio.lowFuel(); audio.lastLowFuel = performance.now(); }
  if (!ui.infoScreen.classList.contains('hidden')) { renderCargoDetails(); renderExpeditionStats(); }
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
      if (isPairedHost()) net?.sendEnemySnapshot(enemySnapshotFrom(state.enemies));
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
  const target = e.target as Element | null;
  if (target?.closest?.('#info-screen')) {
    if (key === 'escape') { closeInfoScreen(); e.preventDefault(); e.stopPropagation(); }
    return;
  }
  if (!ui.lobby.classList.contains('hidden')) return;
  const dir = movementKeys[key];
  if (!state.introStarted) {
    if (key === 'enter' || key === ' ') { startIntro(); e.preventDefault(); }
    return;
  }
  if (dir) {
    if (!keys.has(key) && !e.repeat) state.input.keyImpulse = dir;
    keys.add(key);
    e.preventDefault();
    return;
  }
  if (key === 'escape' && !ui.infoScreen.classList.contains('hidden')) { closeInfoScreen(); e.preventDefault(); e.stopPropagation(); return; }
  if (key === 'enter') { sell(); e.preventDefault(); e.stopPropagation(); return; }
  if (key === ' ') { surfaceService(); e.preventDefault(); e.stopPropagation(); return; }
  if (key === 'r') { if (!e.repeat) requestReset(); e.preventDefault(); e.stopPropagation(); }
}
function handleKeyUp(e){
  keys.delete(e.key.toLowerCase());
  if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); }
}
export function initGame(){
  audio = createAudio(ui, toast);
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
    if (target.closest && target.closest('#info-screen, #lobby-screen')) return;
    if (!state.introStarted) { startIntro(e); e.preventDefault(); e.stopPropagation(); return; }
    if (!state.gameOver) return;
    tryAutoAudio(e);
    restartGame();
    e.preventDefault();
    e.stopPropagation();
  }, {capture:true});
  addEventListener('touchstart', e => {
    const target = e.target as Element;
    if (target.closest && target.closest('#info-screen, #lobby-screen')) return;
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
