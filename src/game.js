import { ORES, START_Y, SURFACE_HEIGHT, TILE, WORLD_H, WORLD_W } from './constants.js';
import { canvas, gamePanel, ctx, H, keys, ui, VIEW_HEIGHT, VIEW_WIDTH, W } from './dom.js';
import { createAudio } from './audio.js';
import { createInitialState } from './state.js';
import { createRenderer } from './renderer.js';
import { STARTING, LIMITS, FUEL, HULL, ECONOMY } from './balance.js';

const state = createInitialState();
let audio;
let renderer;
let resetConfirmUntil = 0;

const SAVE_KEY = 'moleload-progress-v1';
const DEFAULT_STATS = {
  maxDepth: 0,
  totalCashEarned: 0,
  oreMined: 0,
  enemiesDestroyed: 0,
  deaths: 0,
  motherlodeClaims: 0
};
state.stats = {...DEFAULT_STATS};

function numeric(value, fallback, min=0, max=Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const save = JSON.parse(raw);
    const p = state.player;
    state.cash = numeric(save.cash, state.cash, 0);
    p.fuelMax = numeric(save.fuelMax, p.fuelMax, LIMITS.fuelMax.min, LIMITS.fuelMax.max);
    p.hullMax = numeric(save.hullMax, p.hullMax, LIMITS.hullMax.min, LIMITS.hullMax.max);
    p.cargoMax = numeric(save.cargoMax, p.cargoMax, LIMITS.cargoMax.min, LIMITS.cargoMax.max);
    p.drill = numeric(save.drill, p.drill, LIMITS.drill.min, LIMITS.drill.max);
    state.stats = {...DEFAULT_STATS, ...(save.stats || {})};
    for (const key of Object.keys(DEFAULT_STATS)) state.stats[key] = numeric(state.stats[key], DEFAULT_STATS[key], 0);
  } catch (err) {
    console.warn('Could not load saved Moleload progress:', err);
  }
}

function saveProgress() {
  try {
    const p = state.player;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: 1,
      cash: Math.floor(state.cash),
      fuelMax: p.fuelMax,
      hullMax: p.hullMax,
      cargoMax: p.cargoMax,
      drill: p.drill,
      stats: state.stats,
      savedAt: Date.now()
    }));
  } catch (err) {
    console.warn('Could not save Moleload progress:', err);
  }
}

function addCash(amount) {
  state.cash += amount;
  if (amount > 0) state.stats.totalCashEarned += amount;
  saveProgress();
}

  function rand(x,y){ let n = Math.sin(x*127.1 + y*311.7) * 43758.5453; return n - Math.floor(n); }
  function naturalAirPocket(x,y){
    if (y < 5 || x < 2 || x > WORLD_W - 3) return false;
    const depth = Math.min(1, y / 85);
    const cellular = (rand(Math.floor(x/2), Math.floor(y/2)) + rand(Math.floor((x+1)/3)+41, Math.floor((y-1)/3)-17)) / 2;
    const pocketChance = 0.018 + depth * 0.035;
    if (cellular < pocketChance) return true;
    const seam = Math.abs(Math.sin(x * 0.31 + y * 0.145 + Math.sin(y * 0.071) * 2.3));
    const seamGate = rand(Math.floor(x/5) + 91, Math.floor(y/4) - 53);
    return y > 10 && seam < 0.045 + depth * 0.035 && seamGate < 0.42;
  }
  function makeTile(x,y){
    if (y < SURFACE_HEIGHT) return {type:'air'};
    if (y === SURFACE_HEIGHT && Math.abs(x - WORLD_W/2) < 7) return {type:'dirt', hp:2, maxHp:2};
    if (naturalAirPocket(x,y)) return {type:'air'};
    const r = rand(x,y), depth = y;
    let ore = null;
    for (let i = ORES.length - 1; i >= 0; i--) {
      const o = ORES[i];
      if (depth >= o.min && r < o.chance * Math.min(2.2, 1 + depth / 90)) { ore = o; break; }
    }
    if (y === WORLD_H - 2 && Math.abs(x - Math.floor(WORLD_W/2)) <= 1) return {type:'artifact', hp:24, maxHp:24};
    if (ore) { const hp = Math.max(3, Math.ceil((depth/28)+4)); return {type:'ore', ore, hp, maxHp: hp}; }
    const rockChance = y > 190 ? .036 : .018;
    if (rand(x+9,y-3) < rockChance && y > 12) return {type:'rock', hp: 999};
    if (y > 150 && rand(x+51,y-91) < Math.min(.026, .007 + y / 13000)) {
      const hp = Math.max(4, Math.ceil(3 + y / 55));
      return {type:'hazard', hp, maxHp: hp};
    }
    if (y > 14 && rand(x-37,y+83) < Math.min(.046, .008 + y / 6500)) {
      const hp = Math.max(4, Math.ceil(3 + y / 35));
      return {type:'enemy', hp, maxHp: hp};
    }
    { const hp = Math.max(2, Math.ceil(depth/42)+1 + (depth > 210 ? 2 : 0)); return {type:'dirt', hp, maxHp: hp}; }
  }
  function generate(){
    state.enemies = [];
    state.world = Array.from({length: WORLD_H}, (_,y)=>Array.from({length: WORLD_W},(_,x)=>makeTile(x,y)));
    resetPlayer(false);
  }
  function resetShipUpgradesAfterDeath(){
    const p = state.player;
    p.fuelMax = STARTING.fuelMax;
    p.cargoMax = STARTING.cargoMax;
    p.drill = STARTING.drill;
    p.cargo = [];
    saveProgress();
  }
  function resetPlayer(full=true){
    if (full) { state.cash = STARTING.cash; state.player.fuelMax=STARTING.fuelMax; state.player.hullMax=STARTING.hullMax; state.player.cargoMax=STARTING.cargoMax; state.player.drill=STARTING.drill; state.stats = {...DEFAULT_STATS}; saveProgress(); }
    Object.assign(state.player, {x: Math.floor(WORLD_W/2), y: START_Y, drawX: Math.floor(WORLD_W/2), drawY: START_Y, fuel: state.player.fuelMax, hull: state.player.hullMax, cargo: []});
    state.camX = Math.max(0, state.player.x - Math.floor(W/2));
    state.camY = 0;
    state.particles.length = 0;
    state.gameOver = false; toast('Fresh drill deployed.');
  }
  function get(x,y){ return state.world[y]?.[x] || {type:'rock', hp:999}; }
  function set(x,y,t){ if(state.world[y]) state.world[y][x] = t; }
  function cargoUsed(){ return state.player.cargo.length; }
  function cargoValue(){ return state.player.cargo.reduce((s,o)=>s+o.value,0); }
  function toast(msg){ ui.toast.textContent = msg; ui.toast.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>ui.toast.classList.remove('show'),1800); }
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
    const tile = get(x,y);
    if (tile.type !== 'enemy') return false;
    set(x,y,{type:'air'});
    const enemy = {x, y, drawX:x, drawY:y, hp:tile.hp || 4, maxHp:tile.maxHp || tile.hp || 4, alive:true, moveTick:0, biteTick:0, flash:0};
    state.enemies.push(enemy);
    spawnDust(x, y, '#8aff5a', 18);
    audio.enemyWake();
    toast('Tunnel fiend awakened! Drill it before it chews the hull.');
    return true;
  }
  function wakeEnemiesNear(x,y){
    for (let yy=y-1; yy<=y+1; yy++) for (let xx=x-1; xx<=x+1; xx++) {
      if (Math.abs(xx-x) + Math.abs(yy-y) <= 1) wakeEnemy(xx, yy);
    }
  }
  function enemyBounty(y){ return 12 + Math.floor(y / 35) * 4; }
  function damageEnemy(enemy, amount=state.player.drill){
    if (!enemy || !enemy.alive) return;
    enemy.hp -= amount;
    enemy.flash = 1;
    spawnDust(enemy.x, enemy.y, '#92ff55', 13);
    audio.enemyHit();
    if (enemy.hp <= 0) {
      enemy.alive = false;
      spawnExplosion(enemy.x, enemy.y);
      const bounty = enemyBounty(enemy.y);
      addCash(bounty);
      state.stats.enemiesDestroyed++;
      saveProgress();
      toast(`Enemy destroyed +$${bounty} bounty.`);
    } else {
      toast(`Enemy hit — ${Math.ceil(enemy.hp)} HP left.`);
    }
  }
  function damageEnemyTile(x,y){
    const tile = get(x,y);
    if (tile.type !== 'enemy') return false;
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
      toast(`Drilling enemy cocoon... ${Math.ceil(tile.hp)} HP left`);
    }
    return true;
  }
  function updateEnemies(){
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
    if (died) resetShipUpgradesAfterDeath();
    generate();
    if (died) toast('Replacement ship deployed. Cash kept; cargo and upgrades lost.');
  }
  function gameOver(msg='Game over. Tap anywhere or press R to restart.'){
    if (state.gameOver) return;
    state.gameOver = true;
    state.stats.deaths++;
    saveProgress();
    toast(msg);
    spawnExplosion(state.player.x, state.player.y);
    audio.alarm();
    audio.bump();
  }
  function drainHoverFuel(){
    const p = state.player;
    if (state.gameOver || atSurface()) return;
    if (!grounded()) {
      p.fuel = Math.max(0, p.fuel - FUEL.hover); // hovering uses 50% less fuel
      if (state.tick % 18 === 0) spawnDust(p.x, p.y + .35, '#ffb02e', 2);
      if (p.fuel <= 0) gameOver('Out of fuel — ship exploded. Tap anywhere to restart.');
    }
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
    const flyCost = cost * FUEL.flyMult;             // moving/hovering uses 50% less fuel
    const dig = extra => (cost + extra) * FUEL.digMult; // digging uses 50% more fuel
    p.facing = dx ? Math.sign(dx) : p.facing;
    if (activeEnemy) { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.65; p.fuel -= dig(FUEL.dig.enemy); damageEnemy(activeEnemy); return; }
    if (tile.type !== 'air' && dy < 0) { p.drillDx = 0; p.drillDy = -1; p.drillAnim = 0.75; audio.bump(); toast('The drill cannot dig upward. Use tunnels to fly up.'); return; }
    if (tile.type !== 'air' && dx !== 0 && dy === 0 && !grounded()) { p.drillDx = dx; p.drillDy = 0; p.drillAnim = 0.55; audio.bump(); toast('Side drilling needs solid ground underneath.'); return; }
    if (tile.type === 'rock') { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.2; damage(HULL.rockBump); p.fuel -= dig(0); spawnDust(nx, ny, '#444857', 8); audio.bump(); toast('Solid rock blocks the drill.'); return; }
    if (tile.type === 'enemy') { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.65; p.fuel -= dig(FUEL.dig.enemy); damageEnemyTile(nx, ny); return; }
    if (tile.type === 'hazard') { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.65; tile.hp -= p.drill; p.fuel -= dig(FUEL.dig.hazard); damage(HULL.hazardBase + Math.floor(ny/HULL.hazardDepthDivisor)); spawnDust(nx, ny, '#ff5f24', 18); audio.alarm(); if (tile.hp <= 0) { set(nx,ny,{type:'air'}); spawnExplosion(nx,ny); wakeEnemiesNear(nx,ny); toast('Magma pocket vented — hull scorched!'); } else toast(`Venting magma... ${Math.ceil(tile.hp)} hits left`); return; }
    if (tile.type === 'artifact') { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.9; tile.hp -= p.drill; p.fuel -= dig(FUEL.dig.artifact); spawnDust(nx, ny, '#ffb347', 24); audio.mine(); if (tile.hp <= 0) { set(nx,ny,{type:'air'}); addCash(ECONOMY.artifactReward); state.stats.motherlodeClaims++; saveProgress(); spawnExplosion(nx,ny); toast('Motherlode core claimed +$5000! Now get home alive.'); } else toast(`Cracking Motherlode core... ${Math.ceil(tile.hp)} hits left`); return; }
    if (tile.type !== 'air') {
      p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.65;
      tile.hp -= p.drill;
      p.fuel -= dig(FUEL.dig.dig);
      spawnDust(nx, ny, tile.type === 'ore' ? tile.ore.color : '#9d6a42', tile.type === 'ore' ? 14 : 9);
      audio.mine();
      if (tile.hp <= 0) {
        if (tile.type === 'ore') {
          if (cargoUsed() >= p.cargoMax) { tile.hp = 1; toast('Cargo bay full. Go sell at the surface.'); audio.alarm(); return; }
          p.cargo.push(tile.ore); state.stats.oreMined++; saveProgress(); toast(`Mined ${tile.ore.name} +$${tile.ore.value}`); audio.ore(tile.ore.value);
        }
        set(nx,ny,{type:'air'});
        wakeEnemiesNear(nx, ny);
      } else { toast(`Drilling... ${Math.max(1, tile.hp)} hits left`); return; }
    } else {
      p.fuel -= flyCost;
      if (performance.now() - audio.lastMove > 120) { audio.blip(150 + Math.abs(dy)*35, 0.035, 'triangle', 0.02); audio.lastMove = performance.now(); }
    }
    p.x = nx; p.y = ny; p.bob = 1;
    state.stats.maxDepth = Math.max(state.stats.maxDepth, Math.max(0, p.y - START_Y) * 10);
    wakeEnemiesNear(p.x, p.y);
    if (atSurface()) { p.fuel = Math.min(p.fuelMax, p.fuel + FUEL.surfaceRefuel); }
    if (p.fuel < 0) p.fuel = 0;
    if (p.fuel <= 0) gameOver('Out of fuel — ship exploded. Tap anywhere to restart.');
  }
  function damage(n){ const p=state.player; p.hull = Math.max(0, p.hull - n); if(n > 1) audio.bump(); if(p.hull <= 0){ gameOver('Ship destroyed. Tap anywhere to restart.'); } }
  function sell(){ const v = cargoValue(); if (!atSurface()) return toast('Depot is on the surface.'); if(!v) return toast('Cargo is empty.'); addCash(v); state.player.cargo=[]; saveProgress(); toast(`Sold cargo for $${v}.`); audio.cash(v); }
  function refuelCost(){ return Math.ceil(ECONOMY.refuel.base + (state.player.fuelMax - STARTING.fuelMax) * ECONOMY.refuel.perTank); }
  function repairCost(){ return Math.ceil(ECONOMY.repair.base + (state.player.hullMax - state.player.hull) * ECONOMY.repair.perHull); }
  function cargoCost(){ return Math.ceil(ECONOMY.cargo.base * Math.pow(ECONOMY.cargo.growth, Math.max(0, (state.player.cargoMax - STARTING.cargoMax) / ECONOMY.cargo.step))); }
  function tankCost(){ return Math.ceil(ECONOMY.tank.base * Math.pow(ECONOMY.tank.growth, Math.max(0, (state.player.fuelMax - STARTING.fuelMax) / ECONOMY.tank.step))); }
  function drillCost(){ return Math.ceil(ECONOMY.drill.base * Math.pow(ECONOMY.drill.growth, Math.max(0, state.player.drill - STARTING.drill))); }
  function spend(amount, fn, msg){ if (!atSurface()) return toast('Upgrades are at the surface.'); if (state.cash < amount) { audio.alarm(); return toast(`Need $${amount}.`); } state.cash -= amount; fn(); saveProgress(); toast(msg); audio.cash(amount); }
  function refuel(){
    const p = state.player;
    if (!atSurface()) return toast('Service depot is on the surface.');
    if (p.fuel >= p.fuelMax) return toast('Fuel tank already full.');
    if (state.cash <= 0) { audio.alarm(); return toast('No cash to buy fuel.'); }
    const full = refuelCost();
    const pay = Math.min(state.cash, full);
    const ratio = full > 0 ? pay / full : 1;
    p.fuel = Math.min(p.fuelMax, p.fuel + (p.fuelMax - p.fuel) * ratio);
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
    const full = repairCost();
    const pay = Math.min(state.cash, full);
    const ratio = full > 0 ? pay / full : 1;
    p.hull = Math.min(p.hullMax, p.hull + (p.hullMax - p.hull) * ratio);
    state.cash -= pay;
    saveProgress();
    toast(p.hull >= p.hullMax ? 'Hull repaired.' : `Partial repair — spent $${Math.round(pay)} (all your cash).`);
    audio.cash(pay);
  }
  function surfaceService(){
    const p = state.player;
    if (!atSurface()) return toast('Service depot is on the surface.');
    if (cargoValue() > 0) return sell();
    if (p.fuel < p.fuelMax) return refuel();
    if (p.hull < p.hullMax) return repair();
    toast('Cargo empty, hull and fuel are full.');
  }
  function atSurface(){ return state.player.y < SURFACE_HEIGHT; }
  function bindButtons(){
    ui.sell.onclick = sell;
    ui.fuelBtn.onclick = () => refuel();
    ui.repairBtn.onclick = () => repair();
    ui.cargoBtn.onclick = () => spend(cargoCost(),()=>state.player.cargoMax+=ECONOMY.cargo.step,'Cargo bay expanded.');
    ui.tankBtn.onclick = () => spend(tankCost(),()=>{state.player.fuelMax+=ECONOMY.tank.step; state.player.fuel=state.player.fuelMax;},'Fuel tank upgraded.');
    ui.drillBtn.onclick = () => spend(drillCost(),()=>state.player.drill+=ECONOMY.drill.step,'Drill power increased.');
    ui.soundBtn.addEventListener('pointerdown', e => e.stopPropagation());
    ui.soundBtn.onclick = e => { e.stopPropagation(); audio.toggle(); };
    ui.infoBtn.onclick = e => { e.stopPropagation(); openInfoScreen(); };
    ui.infoCloseBtn.onclick = e => { e.stopPropagation(); closeInfoScreen(); };
    ui.infoScreen.addEventListener('pointerdown', e => { if (e.target === ui.infoScreen) closeInfoScreen(); });
  }
  function openInfoScreen(){
    ui.infoScreen.classList.remove('hidden');
    renderCargoDetails();
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
  function updateButtonStates(){
    const p = state.player, surf = atSurface();
    ui.sell.disabled = !surf || cargoValue() <= 0;
    ui.fuelBtn.textContent = `Refuel $${refuelCost()}`;
    ui.repairBtn.textContent = `Repair $${repairCost()}`;
    ui.cargoBtn.textContent = `Cargo +10 $${cargoCost()}`;
    ui.tankBtn.textContent = `Tank +20 $${tankCost()}`;
    ui.drillBtn.textContent = `Drill +1 $${drillCost()}`;
    ui.fuelBtn.disabled = !surf || state.cash <= 0 || p.fuel >= p.fuelMax;
    ui.repairBtn.disabled = !surf || state.cash <= 0 || p.hull >= p.hullMax;
    ui.cargoBtn.disabled = !surf || state.cash < cargoCost();
    ui.tankBtn.disabled = !surf || state.cash < tankCost();
    ui.drillBtn.disabled = !surf || state.cash < drillCost();
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
    tryAutoAudio();
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
  function directionFromPoint(clientX, clientY, fallbackStart=null){
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
      if (e.target.closest && e.target.closest('button, #info-screen')) return;
      tracking = true;
      start = {x: e.clientX, y: e.clientY};
      const dir = directionFromPoint(e.clientX, e.clientY);
      state.input.touchHoldDir = dir;
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
    const fuelPct = p.fuelMax ? p.fuel / p.fuelMax : 1;
    const lowFuel = fuelPct < FUEL.lowFuelFraction && !state.gameOver;
    ui.fuelWarning.classList.toggle('show', lowFuel);
    if (lowFuel && !atSurface() && performance.now() - audio.lastLowFuel > FUEL.lowFuelWarnMs) { audio.lowFuel(); audio.lastLowFuel = performance.now(); }
    if (!ui.infoScreen.classList.contains('hidden')) renderCargoDetails();
    updateButtonStates();
  }
  function loop(){ input(); if (state.introStarted) { drainHoverFuel(); updateEnemies(); } draw(); hud(); requestAnimationFrame(loop); }
  function tryAutoAudio() {
    if (audio.wantsSound && !audio.enabled) audio.enable();
  }
  function focusGame(){
    try { (gamePanel || canvas).focus({preventScroll:true}); }
    catch (_) { try { (gamePanel || canvas).focus(); } catch (_) {} }
  }
  function startIntro(){
    if (state.introStarted) return;
    state.introStarted = true;
    ui.intro?.classList.add('hidden');
    setTimeout(() => { if (ui.intro) ui.intro.style.display = 'none'; }, 320);
    focusGame();
    tryAutoAudio();
    toast('Drill ready. Mine ore, sell it, and watch your fuel.');
  }
  function handleKeyDown(e){
    if (e.__moleloadHandled) return;
    e.__moleloadHandled = true;
    // Keyboard movement must work even before the browser grants audio permission.
    // Sound can still be enabled with the Sound button or any pointer/touch input.
    const key = e.key.toLowerCase();
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
  ui.intro?.addEventListener('pointerdown', e => {
    startIntro();
    e.preventDefault();
    e.stopPropagation();
  }, {capture:true});
  ui.intro?.addEventListener('touchstart', e => {
    startIntro();
    e.preventDefault();
    e.stopPropagation();
  }, {capture:true, passive:false});
  ui.intro?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { startIntro(); e.preventDefault(); e.stopPropagation(); }
  });
  addEventListener('pointerdown', e => {
    if (e.target.closest && e.target.closest('#info-screen')) return;
    if (!state.introStarted) { startIntro(); e.preventDefault(); e.stopPropagation(); return; }
    if (!state.gameOver) return;
    tryAutoAudio();
    restartGame();
    e.preventDefault();
    e.stopPropagation();
  }, {capture:true});
  addEventListener('touchstart', e => {
    if (e.target.closest && e.target.closest('#info-screen')) return;
    if (!state.introStarted) { startIntro(); e.preventDefault(); e.stopPropagation(); return; }
    if (!state.gameOver) return;
    tryAutoAudio();
    restartGame();
    e.preventDefault();
    e.stopPropagation();
  }, {capture:true, passive:false});
  addEventListener('pointerdown', tryAutoAudio);
export function initGame(){
  audio = createAudio(ui, toast);
  renderer = createRenderer({ state, get, rand });
  loadProgress();
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
  bindButtons(); bindTouchControls(); generate(); setInterval(saveProgress, 60000); addEventListener('beforeunload', saveProgress); focusGame(); setTimeout(focusGame, 60); loop();
}
