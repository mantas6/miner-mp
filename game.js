(() => {
  const canvas = document.getElementById('game');
  const gamePanel = document.getElementById('game-panel');
  const ctx = canvas.getContext('2d');
  const TILE = 128; // oversized tiles for phone readability
  const W = Math.floor(canvas.width / TILE);
  const H = Math.floor(canvas.height / TILE);
  const WORLD_W = 90;
  const WORLD_H = 320;
  const keys = new Set();
  const ui = {
    cash: document.getElementById('cash'), depth: document.getElementById('depth'),
    fuel: document.getElementById('fuel'), hull: document.getElementById('hull'), cargo: document.getElementById('cargo'),
    cargoList: document.getElementById('cargoList'), toast: document.getElementById('toast'), fuelWarning: document.getElementById('fuel-warning'), soundBtn: document.getElementById('soundBtn'), intro: document.getElementById('intro'),
    sell: document.getElementById('sell'), fuelBtn: document.getElementById('fuelBtn'), repairBtn: document.getElementById('repairBtn'),
    cargoBtn: document.getElementById('cargoBtn'), tankBtn: document.getElementById('tankBtn'), drillBtn: document.getElementById('drillBtn')
  };

  const ORES = [
    {name:'Coal', color:'#343434', value:8, min:2, chance:.10},
    {name:'Copper', color:'#c47b45', value:16, min:7, chance:.08},
    {name:'Silver', color:'#c8d3e0', value:36, min:18, chance:.055},
    {name:'Gold', color:'#ffd65c', value:70, min:34, chance:.04},
    {name:'Ruby', color:'#f04b73', value:135, min:55, chance:.026},
    {name:'Emerald', color:'#46df8b', value:220, min:82, chance:.018},
    {name:'Alienite', color:'#8d7cff', value:360, min:118, chance:.012},
    {name:'Uranium', color:'#b7ff45', value:620, min:175, chance:.008},
    {name:'Core Shard', color:'#ff7a1f', value:980, min:240, chance:.005}
  ];

  const state = {
    world: [], cash: 60, tick: 0, gameOver: false, introStarted: false,
    camX: 0, camY: 0,
    particles: [], enemies: [],
    input: {
      keyImpulse: null,
      lastKeyboardMove: 0,
      keyboardRepeatMs: 105,
      touchHoldDir: null,
      lastTouchMove: 0,
      touchRepeatMs: 130
    },
    player: {
      x: Math.floor(WORLD_W/2), y: 0,
      drawX: Math.floor(WORLD_W/2), drawY: 0,
      facing: 1, bob: 0, drillAnim: 0, drillDx: 0, drillDy: 1,
      fuel:100, fuelMax:100, hull:100, hullMax:100, cargoMax:30, drill:1, cargo:[]
    }
  };

  const audio = {
    ctx: null,
    enabled: false,
    wantsSound: true,
    master: null,
    musicGain: null,
    musicEl: null,
    musicTimer: null,
    step: 0,
    lastMove: 0,
    init() {
      if (this.ctx) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return toast('Audio is not supported in this browser.');
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.13;
      this.musicGain.connect(this.master);
      this.musicEl = new Audio();
      const canMp3 = this.musicEl.canPlayType && this.musicEl.canPlayType('audio/mpeg');
      this.musicEl.src = canMp3 ? 'assets/soviet-soundtrack.mp3' : 'assets/soviet-soundtrack.ogg';
      this.musicEl.loop = true;
      this.musicEl.preload = 'auto';
      this.musicEl.volume = 0.72;
    },
    async enable() {
      this.wantsSound = true;
      try {
        this.init();
        if (!this.ctx) return false;
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        this.enabled = true;
        ui.soundBtn.textContent = 'Sound: on';
        await this.startMusic();
        this.blip(720, 0.10, 'square', 0.11);
        toast('Soundtrack on');
        return true;
      } catch (err) {
        this.enabled = false;
        ui.soundBtn.textContent = 'Sound: off';
        return false;
      }
    },
    disable() {
      this.wantsSound = false;
      this.enabled = false;
      ui.soundBtn.textContent = 'Sound: off';
      this.stopMusic();
    },
    async toggle() {
      if (this.enabled) { this.blip(180, 0.05, 'square', 0.08); this.disable(); }
      else await this.enable();
    },
    blip(freq=440, dur=0.08, type='sine', gain=0.06, slide=0) {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + dur);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(now); osc.stop(now + dur + 0.02);
    },
    noise(dur=0.12, gain=0.05, filterFreq=700) {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const buffer = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * (1 - i/data.length);
      const src = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      filter.type = 'lowpass'; filter.frequency.value = filterFreq;
      g.gain.setValueAtTime(gain, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.buffer = buffer; src.connect(filter); filter.connect(g); g.connect(this.master);
      src.start(now); src.stop(now + dur);
    },
    mine() { this.noise(0.13, 0.16, 620); this.blip(92, 0.10, 'sawtooth', 0.10, -35); },
    ore(value=20) { this.blip(520, 0.10, 'triangle', 0.14, 220); setTimeout(()=>this.blip(760 + Math.min(500,value), 0.12, 'triangle', 0.12), 70); },
    cash(value=10) { [0,60,120].forEach((d,i)=>setTimeout(()=>this.blip(740+i*120, 0.08, 'square', 0.11), d)); },
    bump() { this.blip(70, 0.15, 'sawtooth', 0.13, -25); },
    enemyHit() { this.noise(0.10, 0.10, 360); this.blip(230, 0.08, 'sawtooth', 0.10, -80); },
    enemyWake() { this.blip(110, 0.10, 'square', 0.12); setTimeout(()=>this.blip(150, 0.12, 'square', 0.10), 85); },
    alarm() { this.blip(180, 0.12, 'square', 0.13); setTimeout(()=>this.blip(130, 0.16, 'square', 0.13), 120); },
    async startMusic() {
      this.stopMusic();
      if (this.musicEl) {
        this.musicEl.currentTime = this.musicEl.currentTime || 0;
        try {
          await this.musicEl.play();
          return true;
        } catch (err) {
          this.startSynthMusic();
          return false;
        }
      }
      this.startSynthMusic();
      return false;
    },
    startSynthMusic() {
      const bass = [55,55,65.4,55,73.4,65.4,49,49];
      const lead = [220,0,247,262,0,196,185,0,220,247,294,262,0,196,165,0];
      this.musicTimer = setInterval(() => {
        if (!this.enabled || !this.ctx) return;
        const i = this.step++;
        const now = this.ctx.currentTime;
        const root = bass[i % bass.length];
        this.musicNote(root, 0.28, 'sine', 0.026, now);
        if (i % 2 === 0) {
          const f = lead[(i/2) % lead.length | 0];
          if (f) this.musicNote(f, 0.16, 'triangle', 0.018, now + 0.02);
        }
      }, 240);
    },
    musicNote(freq, dur, type, gain, start) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const filt = this.ctx.createBiquadFilter();
      osc.type = type; osc.frequency.value = freq;
      filt.type = 'lowpass'; filt.frequency.value = 850;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(filt); filt.connect(g); g.connect(this.musicGain);
      osc.start(start); osc.stop(start + dur + 0.05);
    },
    stopMusic() { if (this.musicTimer) clearInterval(this.musicTimer); this.musicTimer = null; if (this.musicEl) this.musicEl.pause(); }
  };

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
    if (y <= 0) return {type:'air'};
    if (y === 1 && Math.abs(x - WORLD_W/2) < 7) return {type:'dirt', hp:2, maxHp:2};
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
    p.fuelMax = 100;
    p.cargoMax = 30;
    p.drill = 1;
    p.cargo = [];
  }
  function resetPlayer(full=true){
    if (full) { state.cash = 60; state.player.fuelMax=100; state.player.cargoMax=30; state.player.drill=1; }
    Object.assign(state.player, {x: Math.floor(WORLD_W/2), y: 0, drawX: Math.floor(WORLD_W/2), drawY: 0, fuel: state.player.fuelMax, hull: 100, cargo: []});
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
      state.cash += bounty;
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
      state.cash += bounty;
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
          const bite = 6 + Math.floor(e.y / 70) * 2;
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
        if (nx <= 0 || nx >= WORLD_W-1 || ny <= 0 || ny >= WORLD_H-1) continue;
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
    toast(msg);
    spawnExplosion(state.player.x, state.player.y);
    audio.alarm();
    audio.bump();
  }
  function drainHoverFuel(){
    const p = state.player;
    if (state.gameOver || p.y === 0) return;
    if (!grounded()) {
      p.fuel = Math.max(0, p.fuel - 0.075);
      if (state.tick % 18 === 0) spawnDust(p.x, p.y + .35, '#ffb02e', 2);
      if (p.fuel <= 0) gameOver('Out of fuel — ship exploded. Tap anywhere to restart.');
    }
  }
  function move(dx,dy){
    if (state.gameOver) return;
    const p = state.player;
    if (p.fuel <= 0) { gameOver('Out of fuel — ship exploded. Tap anywhere to restart.'); return; }
    const nx = Math.max(1, Math.min(WORLD_W-2, p.x + dx));
    const ny = Math.max(0, Math.min(WORLD_H-1, p.y + dy));
    if (nx === p.x && ny === p.y) return;
    const tile = get(nx,ny);
    const activeEnemy = enemyAt(nx, ny);
    let cost = 0.25 + Math.abs(dy)*0.08;
    p.facing = dx ? Math.sign(dx) : p.facing;
    if (activeEnemy) { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.65; p.fuel -= cost + 0.65; damageEnemy(activeEnemy); return; }
    if (tile.type !== 'air' && dy < 0) { p.drillDx = 0; p.drillDy = -1; p.drillAnim = 0.75; audio.bump(); toast('The drill cannot dig upward. Use tunnels to fly up.'); return; }
    if (tile.type !== 'air' && dx !== 0 && dy === 0 && !grounded()) { p.drillDx = dx; p.drillDy = 0; p.drillAnim = 0.55; audio.bump(); toast('Side drilling needs solid ground underneath.'); return; }
    if (tile.type === 'rock') { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.2; damage(4); p.fuel -= cost; spawnDust(nx, ny, '#444857', 8); audio.bump(); toast('Solid rock blocks the drill.'); return; }
    if (tile.type === 'enemy') { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.65; p.fuel -= cost + 0.65; damageEnemyTile(nx, ny); return; }
    if (tile.type === 'hazard') { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.65; tile.hp -= p.drill; p.fuel -= cost + 1.15; damage(3.5 + Math.floor(ny/90)); spawnDust(nx, ny, '#ff5f24', 18); audio.alarm(); if (tile.hp <= 0) { set(nx,ny,{type:'air'}); spawnExplosion(nx,ny); wakeEnemiesNear(nx,ny); toast('Magma pocket vented — hull scorched!'); } else toast(`Venting magma... ${Math.ceil(tile.hp)} hits left`); return; }
    if (tile.type === 'artifact') { p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.9; tile.hp -= p.drill; p.fuel -= cost + 1.4; spawnDust(nx, ny, '#ffb347', 24); audio.mine(); if (tile.hp <= 0) { set(nx,ny,{type:'air'}); state.cash += 5000; spawnExplosion(nx,ny); toast('Motherlode core claimed +$5000! Now get home alive.'); } else toast(`Cracking Motherlode core... ${Math.ceil(tile.hp)} hits left`); return; }
    if (tile.type !== 'air') {
      p.drillDx = dx; p.drillDy = dy; p.drillAnim = 1.65;
      tile.hp -= p.drill;
      p.fuel -= cost + 0.9;
      spawnDust(nx, ny, tile.type === 'ore' ? tile.ore.color : '#9d6a42', tile.type === 'ore' ? 14 : 9);
      audio.mine();
      if (tile.hp <= 0) {
        if (tile.type === 'ore') {
          if (cargoUsed() >= p.cargoMax) { tile.hp = 1; toast('Cargo bay full. Go sell at the surface.'); audio.alarm(); return; }
          p.cargo.push(tile.ore); toast(`Mined ${tile.ore.name} +$${tile.ore.value}`); audio.ore(tile.ore.value);
        }
        set(nx,ny,{type:'air'});
        wakeEnemiesNear(nx, ny);
      } else { toast(`Drilling... ${Math.max(1, tile.hp)} hits left`); return; }
    } else {
      p.fuel -= cost;
      if (performance.now() - audio.lastMove > 120) { audio.blip(150 + Math.abs(dy)*35, 0.035, 'triangle', 0.02); audio.lastMove = performance.now(); }
    }
    p.x = nx; p.y = ny; p.bob = 1;
    wakeEnemiesNear(p.x, p.y);
    if (dy > 0 && get(p.x,p.y+1).type === 'air') damage(0.35); // unstable fall bump
    if (p.y === 0) { p.fuel = Math.min(p.fuelMax, p.fuel + .8); }
    if (p.fuel < 0) p.fuel = 0;
    if (p.fuel <= 0) gameOver('Out of fuel — ship exploded. Tap anywhere to restart.');
  }
  function damage(n){ const p=state.player; p.hull = Math.max(0, p.hull - n); if(n > 1) audio.bump(); if(p.hull <= 0){ gameOver('Ship destroyed. Tap anywhere to restart.'); } }
  function sell(){ const v = cargoValue(); if (!atSurface()) return toast('Depot is on the surface.'); if(!v) return toast('Cargo is empty.'); state.cash += v; state.player.cargo=[]; toast(`Sold cargo for $${v}.`); audio.cash(v); }
  function refuelCost(){ return Math.ceil(20 + (state.player.fuelMax - 100) * 0.35); }
  function repairCost(){ return Math.ceil(30 + (state.player.hullMax - state.player.hull) * 0.45); }
  function cargoCost(){ return Math.ceil(120 * Math.pow(1.32, Math.max(0, (state.player.cargoMax - 30) / 10))); }
  function tankCost(){ return Math.ceil(150 * Math.pow(1.34, Math.max(0, (state.player.fuelMax - 100) / 20))); }
  function drillCost(){ return Math.ceil(200 * Math.pow(1.55, Math.max(0, state.player.drill - 1))); }
  function spend(amount, fn, msg){ if (!atSurface()) return toast('Upgrades are at the surface.'); if (state.cash < amount) { audio.alarm(); return toast(`Need $${amount}.`); } state.cash -= amount; fn(); toast(msg); audio.cash(amount); }
  function surfaceService(){
    const p = state.player;
    if (!atSurface()) return toast('Service depot is on the surface.');
    if (p.hull < p.hullMax) return spend(repairCost(),()=>p.hull=p.hullMax,'Hull repaired.');
    if (p.fuel < p.fuelMax) return spend(refuelCost(),()=>p.fuel=p.fuelMax,'Fuel tank full.');
    toast('Hull and fuel are already full.');
  }
  function atSurface(){ return state.player.y === 0; }
  function bindButtons(){
    ui.sell.onclick = sell;
    ui.fuelBtn.onclick = () => spend(refuelCost(),()=>state.player.fuel=state.player.fuelMax,'Fuel tank full.');
    ui.repairBtn.onclick = () => spend(repairCost(),()=>state.player.hull=state.player.hullMax,'Hull repaired.');
    ui.cargoBtn.onclick = () => spend(cargoCost(),()=>state.player.cargoMax+=10,'Cargo bay expanded.');
    ui.tankBtn.onclick = () => spend(tankCost(),()=>{state.player.fuelMax+=20; state.player.fuel=state.player.fuelMax;},'Fuel tank upgraded.');
    ui.drillBtn.onclick = () => spend(drillCost(),()=>state.player.drill+=1,'Drill power increased.');
    ui.soundBtn.addEventListener('pointerdown', e => e.stopPropagation());
    ui.soundBtn.onclick = e => { e.stopPropagation(); audio.toggle(); };
  }
  function updateButtonStates(){
    const p = state.player, surf = atSurface();
    ui.sell.disabled = !surf || cargoValue() <= 0;
    ui.fuelBtn.textContent = `Refuel $${refuelCost()}`;
    ui.repairBtn.textContent = `Repair $${repairCost()}`;
    ui.cargoBtn.textContent = `Cargo +10 $${cargoCost()}`;
    ui.tankBtn.textContent = `Tank +20 $${tankCost()}`;
    ui.drillBtn.textContent = `Drill +1 $${drillCost()}`;
    ui.fuelBtn.disabled = !surf || state.cash < refuelCost() || p.fuel >= p.fuelMax;
    ui.repairBtn.disabled = !surf || state.cash < repairCost() || p.hull >= p.hullMax;
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
  function input(){
    state.tick++;
    if (!state.introStarted) return;
    if (keys.has('r')) { restartGame(); return; }
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
    const scale = Math.max(rect.width / canvas.width, rect.height / canvas.height);
    const drawnW = canvas.width * scale;
    const drawnH = canvas.height * scale;
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
      if (e.target.closest && e.target.closest('button')) return;
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
    const p = state.player;
    const camX = Math.max(0, Math.min(WORLD_W-W, state.camX));
    const camY = Math.max(0, Math.min(WORLD_H-H, state.camY));
    const startX = Math.floor(camX), startY = Math.floor(camY);
    const offX = (startX - camX) * TILE, offY = (startY - camY) * TILE;
    const sky = ctx.createLinearGradient(0,0,0,canvas.height);
    sky.addColorStop(0,'#163762'); sky.addColorStop(.25,'#0e1d31'); sky.addColorStop(.26,'#2a1a11'); sky.addColorStop(1,'#050301');
    ctx.fillStyle = sky; ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let y=-1;y<=H+1;y++) for(let x=-1;x<=W+1;x++){
      const wx=x+startX, wy=y+startY, t=get(wx,wy), sx=x*TILE+offX, sy=y*TILE+offY;
      drawTile(t, wx, wy, sx, sy);
    }
    drawTerrainBlendOverlay(camY);
    drawSurface(camX, camY);
    drawEnemies(camX, camY);
    for (const pt of state.particles) {
      const sx = (pt.x - camX) * TILE, sy = (pt.y - camY) * TILE;
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / 28));
      ctx.fillStyle = pt.color;
      ctx.fillRect(sx, sy, pt.size*TILE, pt.size*TILE);
      ctx.globalAlpha = 1;
    }
    const sx=(p.drawX-camX)*TILE, sy=(p.drawY-camY)*TILE;
    ctx.save();
    ctx.translate(sx+TILE*.5, sy+TILE*.5 + Math.sin(state.tick*.45)*p.bob*TILE*.08);
    ctx.rotate((p.x - p.drawX) * -0.12 + (p.y - p.drawY) * 0.08 + (p.drillDy > 0 ? p.drillAnim * 0.10 : 0));
    ctx.scale(p.facing, 1);
    drawShip(p);
    ctx.restore();
    if(state.gameOver){
      ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#fff'; ctx.textAlign='center';
      ctx.font='bold 38px sans-serif'; ctx.fillText('GAME OVER', canvas.width/2, 295);
      ctx.font='bold 24px sans-serif'; ctx.fillText('Tap anywhere to restart', canvas.width/2, 338);
      ctx.font='18px sans-serif'; ctx.fillText('or press R', canvas.width/2, 370);
      ctx.textAlign='left';
    }
  }
  function drawEnemies(camX, camY) {
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const sx = (e.drawX - camX) * TILE, sy = (e.drawY - camY) * TILE;
      if (sx < -TILE || sy < -TILE || sx > canvas.width + TILE || sy > canvas.height + TILE) continue;
      drawEnemyBody(sx, sy, e.hp / e.maxHp, e.flash);
    }
  }
  function drawEnemyBody(sx, sy, hpPct=1, flash=0) {
    ctx.save();
    ctx.translate(sx + TILE*.5, sy + TILE*.5 + Math.sin(state.tick*.34)*TILE*.05);
    ctx.rotate(Math.sin(state.tick*.18) * .08);
    ctx.shadowColor = flash > .1 ? '#fff6a8' : '#72ff4a';
    ctx.shadowBlur = flash > .1 ? 22 : 10;
    const body = ctx.createRadialGradient(-TILE*.12,-TILE*.16,TILE*.06,0,0,TILE*.45);
    body.addColorStop(0, flash > .1 ? '#fff6a8' : '#c5ff62');
    body.addColorStop(.45, '#4fa23d');
    body.addColorStop(1, '#17391e');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 0, TILE*.34, TILE*.28, 0, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#10180d';
    ctx.beginPath(); ctx.arc(-TILE*.12, -TILE*.06, TILE*.055, 0, Math.PI*2); ctx.arc(TILE*.12, -TILE*.06, TILE*.055, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff8c4';
    ctx.beginPath(); ctx.moveTo(-TILE*.12,TILE*.10); ctx.lineTo(-TILE*.05,TILE*.23); ctx.lineTo(TILE*.02,TILE*.10); ctx.lineTo(TILE*.09,TILE*.23); ctx.lineTo(TILE*.16,TILE*.10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1d4f24'; ctx.lineWidth = 5;
    for (let i=-1;i<=1;i+=2) {
      ctx.beginPath(); ctx.moveTo(i*TILE*.24, TILE*.02); ctx.lineTo(i*TILE*.48, TILE*.14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i*TILE*.20, -TILE*.10); ctx.lineTo(i*TILE*.42, -TILE*.25); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(-TILE*.28, -TILE*.43, TILE*.56, TILE*.055);
    ctx.fillStyle = '#8cff58'; ctx.fillRect(-TILE*.28, -TILE*.43, TILE*.56*Math.max(0,hpPct), TILE*.055);
    ctx.restore();
  }
  function drawTile(t, wx, wy, sx, sy) {
    const pad = 1.5; // overdraw slightly so adjacent cells have no visible seams
    if(t.type==='air') {
      if (wy>0){
        const darkness = Math.min(.76, wy/82);
        ctx.fillStyle = `rgba(17,10,7,${darkness})`;
        ctx.fillRect(sx-pad,sy-pad,TILE+pad*2,TILE+pad*2);
        // very subtle cave haze, not a grid line
        if (rand(wx, wy) > .72) {
          ctx.fillStyle = `rgba(83,55,35,${0.04 + rand(wx+2,wy)*.05})`;
          ctx.beginPath(); ctx.ellipse(sx+TILE*rand(wx+4,wy), sy+TILE*rand(wx,wy+4), TILE*.22, TILE*.11, rand(wx,wy)*Math.PI, 0, Math.PI*2); ctx.fill();
        }
      }
      return;
    }

    if (t.type === 'hazard' || t.type === 'artifact') {
      const artifact = t.type === 'artifact';
      const g = ctx.createRadialGradient(sx+TILE*.50, sy+TILE*.45, TILE*.08, sx+TILE*.5, sy+TILE*.5, TILE*.58);
      if (artifact) { g.addColorStop(0, '#fff4b5'); g.addColorStop(.35, '#ff8a1f'); g.addColorStop(1, '#3a0d05'); }
      else { g.addColorStop(0, '#ffd38a'); g.addColorStop(.38, '#d33b16'); g.addColorStop(1, '#200805'); }
      ctx.fillStyle = g; ctx.fillRect(sx-pad,sy-pad,TILE+pad*2,TILE+pad*2);
      ctx.strokeStyle = artifact ? 'rgba(255,236,150,.85)' : 'rgba(255,89,36,.62)'; ctx.lineWidth = artifact ? 5 : 4;
      for (let i=0;i<4;i++) { ctx.beginPath(); ctx.ellipse(sx+TILE*(.30+i*.13), sy+TILE*(.42+rand(wx+i,wy)*.22), TILE*(.10+rand(wx,wy+i)*.08), TILE*.28, rand(wx+i,wy)*Math.PI, 0, Math.PI*2); ctx.stroke(); }
      if (artifact) { ctx.fillStyle = '#fff2a6'; ctx.font = `bold ${Math.floor(TILE*.18)}px sans-serif`; ctx.textAlign='center'; ctx.fillText('CORE', sx+TILE*.5, sy+TILE*.55); ctx.textAlign='left'; }
      if (t.maxHp && t.hp < t.maxHp) { ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(sx+TILE*.18, sy+TILE*.12, TILE*.64, TILE*.055); ctx.fillStyle=artifact?'#ffe66d':'#ff7145'; ctx.fillRect(sx+TILE*.18, sy+TILE*.12, TILE*.64*Math.max(0,t.hp/t.maxHp), TILE*.055); }
      return;
    }
    if (t.type === 'enemy') {
      const g = ctx.createRadialGradient(sx+TILE*.46, sy+TILE*.42, TILE*.08, sx+TILE*.5, sy+TILE*.5, TILE*.55);
      g.addColorStop(0, '#b7ff5a'); g.addColorStop(.35, '#42612a'); g.addColorStop(1, '#1d120d');
      ctx.fillStyle = g; ctx.fillRect(sx-pad,sy-pad,TILE+pad*2,TILE+pad*2);
      ctx.strokeStyle = 'rgba(146,255,85,.55)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(sx+TILE*.5, sy+TILE*.5, TILE*.26, TILE*.32, rand(wx,wy)*.6, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = '#10180d'; ctx.beginPath(); ctx.arc(sx+TILE*.42, sy+TILE*.44, TILE*.04, 0, Math.PI*2); ctx.arc(sx+TILE*.58, sy+TILE*.44, TILE*.04, 0, Math.PI*2); ctx.fill();
      if (t.maxHp && t.hp < t.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(sx+TILE*.20, sy+TILE*.12, TILE*.60, TILE*.055);
        ctx.fillStyle = '#8cff58'; ctx.fillRect(sx+TILE*.20, sy+TILE*.12, TILE*.60*Math.max(0,t.hp/t.maxHp), TILE*.055);
      }
      return;
    }

    // Smooth neighbor-averaged noise keeps color variation without obvious square patches.
    const n1 = (rand(wx,wy)+rand(wx-1,wy)+rand(wx+1,wy)+rand(wx,wy-1)+rand(wx,wy+1)) / 5;
    const n2 = (rand(wx*2+11,wy*2-7)+rand((wx-1)*2+11,wy*2-7)+rand((wx+1)*2+11,wy*2-7)+rand(wx*2+11,(wy-1)*2-7)+rand(wx*2+11,(wy+1)*2-7)) / 5;
    const n3 = (rand(wx-19,wy+23)+rand(wx-20,wy+23)+rand(wx-18,wy+23)+rand(wx-19,wy+22)+rand(wx-19,wy+24)) / 5;
    const depthWarm = Math.min(48, wy * .38);
    const hueShift = (n1-.5)*13;
    const light = (n2-.5)*12;
    const baseR = 67 + depthWarm + hueShift + light;
    const baseG = 43 + Math.min(30, wy*.16) + hueShift*.35 + light*.45;
    const baseB = 24 + hueShift*.12 + light*.18;

    const g = ctx.createLinearGradient(sx-TILE*.2, sy-TILE*.15, sx+TILE*1.15, sy+TILE*1.1);
    if (t.type === 'rock') {
      const r = 28 + n1*26, gg = 29 + n2*24, b = 36 + n3*24;
      g.addColorStop(0, `rgb(${r+22},${gg+22},${b+26})`);
      g.addColorStop(.55, `rgb(${r},${gg},${b})`);
      g.addColorStop(1, `rgb(${Math.max(9,r-18)},${Math.max(9,gg-18)},${Math.max(12,b-18)})`);
    } else if (t.type === 'ore') {
      g.addColorStop(0, `rgb(${Math.max(80,baseR+18)},${Math.max(48,baseG+8)},${Math.max(28,baseB+2)})`);
      g.addColorStop(.55, `rgb(${Math.max(46,baseR-10)},${Math.max(29,baseG-10)},${Math.max(18,baseB-5)})`);
      g.addColorStop(1, '#21130d');
    } else {
      g.addColorStop(0, `rgb(${baseR+18},${baseG+12},${baseB+7})`);
      g.addColorStop(.42, `rgb(${baseR},${baseG},${baseB})`);
      g.addColorStop(1, `rgb(${Math.max(33,baseR-34)},${Math.max(22,baseG-24)},${Math.max(13,baseB-15)})`);
    }
    ctx.fillStyle = g;
    ctx.fillRect(sx-pad,sy-pad,TILE+pad*2,TILE+pad*2);

    // soft blobs crossing tile borders make dirt feel continuous rather than grid-blocked
    for (let i=0;i<9;i++) {
      const bx = sx + (rand(wx+i*13, wy-i*5) * 1.18 - .09) * TILE;
      const by = sy + (rand(wx-i*9, wy+i*17) * 1.18 - .09) * TILE;
      const rw = TILE*(.18 + rand(wx+i,wy+3)*.48);
      const rh = TILE*(.05 + rand(wx-2,wy+i)*.18);
      ctx.save();
      ctx.translate(bx, by); ctx.rotate((rand(wx+i*2,wy-i)-.5)*1.2);
      if (t.type === 'rock') ctx.fillStyle = `rgba(160,166,184,${.035 + rand(wx+i,wy)*.075})`;
      else ctx.fillStyle = i % 3 === 0 ? `rgba(255,218,145,${.035 + rand(wx+i,wy)*.06})` : `rgba(38,20,11,${.035 + rand(wx-i,wy)*.065})`;
      ctx.beginPath(); ctx.ellipse(0,0,rw,rh,0,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // irregular strata lines, deliberately offset beyond tile bounds
    for (let i=0;i<4;i++) {
      const yy = sy + TILE*(.16 + i*.22 + (rand(wx+i*3,wy)-.5)*.08);
      ctx.strokeStyle = t.type === 'rock' ? `rgba(220,226,240,${.045 + n2*.055})` : `rgba(245,195,120,${.035 + n3*.055})`;
      ctx.lineWidth = 2 + rand(wx+i,wy)*3;
      ctx.beginPath();
      ctx.moveTo(sx - TILE*.08, yy);
      ctx.bezierCurveTo(sx+TILE*.24, yy + (rand(wx,wy+i)-.5)*TILE*.12, sx+TILE*.70, yy + (rand(wx+i,wy+1)-.5)*TILE*.14, sx+TILE*1.08, yy + (rand(wx-i,wy+2)-.5)*TILE*.10);
      ctx.stroke();
    }

    if(t.type==='ore') {
      ctx.save(); ctx.shadowColor=t.ore.color; ctx.shadowBlur=16;
      for (let i=0;i<4;i++) {
        const cx = sx+TILE*(.28+rand(wx+i,wy)*.44), cy = sy+TILE*(.28+rand(wx,wy+i)*.44);
        const r = TILE*(.075+rand(wx+i*2,wy)*.075);
        const crystal = ctx.createLinearGradient(cx-r, cy-r, cx+r, cy+r);
        crystal.addColorStop(0, '#ffffff'); crystal.addColorStop(.18, t.ore.color); crystal.addColorStop(1, 'rgba(0,0,0,.55)');
        ctx.fillStyle=crystal; ctx.beginPath();
        ctx.moveTo(cx, cy-r*1.35); ctx.lineTo(cx+r*.95, cy-r*.22); ctx.lineTo(cx+r*.55, cy+r*.95); ctx.lineTo(cx-r*.50, cy+r*1.05); ctx.lineTo(cx-r*.92, cy-r*.15); ctx.closePath(); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.38)'; ctx.lineWidth=2; ctx.stroke();
      }
      ctx.fillStyle='rgba(255,255,255,.75)';
      for (let i=0;i<3;i++) ctx.fillRect(sx+TILE*(.18+rand(wx-i,wy)*.66), sy+TILE*(.18+rand(wx,wy-i)*.66), TILE*.025, TILE*.025);
      ctx.restore();
    }
    if(t.type==='rock'){
      ctx.fillStyle='rgba(210,220,240,.11)'; ctx.fillRect(sx+TILE*.12,sy+TILE*.22,TILE*.72,TILE*.10); ctx.fillRect(sx+TILE*.29,sy+TILE*.61,TILE*.56,TILE*.10);
    }
    if (t.maxHp && t.hp < t.maxHp) {
      const damage = 1 - t.hp / t.maxHp;
      ctx.strokeStyle = `rgba(255,238,178,${0.25 + damage*.55})`;
      ctx.lineWidth = 2 + damage * 4;
      ctx.beginPath();
      ctx.moveTo(sx+TILE*.24, sy+TILE*.36);
      ctx.lineTo(sx+TILE*.42, sy+TILE*.48);
      ctx.lineTo(sx+TILE*.35, sy+TILE*.66);
      ctx.moveTo(sx+TILE*.58, sy+TILE*.30);
      ctx.lineTo(sx+TILE*.49, sy+TILE*.52);
      ctx.lineTo(sx+TILE*.70, sy+TILE*.70);
      ctx.stroke();
    }
  }
  function drawTerrainBlendOverlay(camY) {
    if (camY < .2) {
      const gy = (1 - camY) * TILE;
      const grad = ctx.createLinearGradient(0, gy, 0, canvas.height);
      grad.addColorStop(0, 'rgba(100,58,28,.10)');
      grad.addColorStop(.55, 'rgba(58,31,16,.09)');
      grad.addColorStop(1, 'rgba(22,10,5,.16)');
      ctx.fillStyle = grad; ctx.fillRect(0, Math.max(0, gy), canvas.width, canvas.height);
    } else {
      ctx.fillStyle = 'rgba(45,24,13,.075)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    }
    ctx.save(); ctx.globalCompositeOperation = 'soft-light';
    for (let i=0;i<10;i++) {
      ctx.fillStyle = i%2 ? 'rgba(255,182,96,.035)' : 'rgba(0,0,0,.045)';
      ctx.beginPath();
      ctx.ellipse((i*.137%1)*canvas.width, (i*.293%1)*canvas.height, canvas.width*(.10+.025*(i%3)), canvas.height*(.06+.015*(i%4)), (i*.7)%Math.PI, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawSurface(camX, camY) {
    if (camY >= 2.2) return;
    const y = -camY*TILE;
    ctx.fillStyle = '#1b623f'; ctx.fillRect(0, y, canvas.width, TILE*.25);
    ctx.fillStyle = '#74451e'; ctx.fillRect(0, y+TILE*.25, canvas.width, TILE*.14);
    // depot platform
    const bx = (WORLD_W/2-4.8-camX)*TILE, by = y + TILE*.05;
    ctx.fillStyle = '#39465a'; roundRect(ctx, bx-TILE*.7, by+TILE*.62, TILE*9.8, TILE*.25, 10); ctx.fill();
    ctx.fillStyle = '#182538'; roundRect(ctx, bx, by+TILE*.12, TILE*3.6, TILE*.72, 14); ctx.fill();
    ctx.fillStyle = '#314560'; roundRect(ctx, bx+TILE*.18, by+TILE*.26, TILE*1.0, TILE*.28, 8); ctx.fill();
    ctx.fillStyle = '#ffc857'; ctx.font='bold 17px sans-serif'; ctx.fillText('DEPOT', bx+TILE*.28, by+TILE*.47);
    drawRedStar(bx+TILE*3.18, by+TILE*.25, TILE*.12, '#ffdf64');
    drawHammerSickle(bx+TILE*2.78, by+TILE*.58, TILE*.18);
    ctx.strokeStyle='#d9e4f2'; ctx.lineWidth=5; ctx.beginPath(); ctx.moveTo(bx-TILE*.35, by+TILE*.66); ctx.lineTo(bx-TILE*.35, by-TILE*.10); ctx.stroke();
    ctx.fillStyle='#b91c1c'; ctx.beginPath(); ctx.moveTo(bx-TILE*.33, by-TILE*.08); ctx.lineTo(bx+TILE*.50, by+TILE*.03); ctx.lineTo(bx-TILE*.33, by+TILE*.18); ctx.closePath(); ctx.fill();
    drawRedStar(bx+TILE*.04, by+TILE*.05, TILE*.085, '#ffd95a');
    ctx.fillStyle = '#ff6b48'; roundRect(ctx, bx+TILE*4.1, by+TILE*.25, TILE*.70, TILE*.62, 8); ctx.fill();
    drawRedStar(bx+TILE*4.45, by+TILE*.68, TILE*.13, '#ffd95a');
    ctx.fillStyle = '#ffe28b'; ctx.fillRect(bx+TILE*4.27, by+TILE*.33, TILE*.36, TILE*.16);
    ctx.fillStyle = '#60d394'; ctx.fillRect(bx+TILE*4.78, by+TILE*.58, TILE*.72, TILE*.08);
    ctx.strokeStyle = '#93a4b8'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(bx+TILE*4.8, by+TILE*.38); ctx.lineTo(bx+TILE*5.45, by+TILE*.56); ctx.stroke();
    // sell crane and cargo crates
    ctx.fillStyle = '#a81919'; ctx.fillRect(bx+TILE*5.95, by+TILE*.02, TILE*1.05, TILE*.18); drawRedStar(bx+TILE*6.12, by+TILE*.11, TILE*.065, '#ffd95a');
    ctx.strokeStyle = '#8ca0b8'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(bx+TILE*6.2, by+TILE*.85); ctx.lineTo(bx+TILE*6.2, by+TILE*.12); ctx.lineTo(bx+TILE*7.55, by+TILE*.12); ctx.stroke();
    ctx.strokeStyle = '#ffc857'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(bx+TILE*7.4, by+TILE*.12); ctx.lineTo(bx+TILE*7.4, by+TILE*.48); ctx.stroke();
    ['#9b5f2b','#6b8f40','#8b4d35'].forEach((c,i)=>{ ctx.fillStyle=c; ctx.fillRect(bx+TILE*(6.55+i*.42), by+TILE*.60, TILE*.34, TILE*.25); ctx.strokeStyle='rgba(0,0,0,.25)'; ctx.strokeRect(bx+TILE*(6.55+i*.42), by+TILE*.60, TILE*.34, TILE*.25); });
    // surface rocks/grass silhouettes
    for (let i=0;i<28;i++) { const x=(i*47 + 13) % canvas.width; ctx.fillStyle=i%3?'#2f8756':'#235d3e'; ctx.fillRect(x, y+TILE*(.19+rand(i,2)*.06), 6+rand(i,3)*18, 14+rand(i,4)*18); }
  }
  function drawShip(p) {
    const dead = state.gameOver;
    const wobble = Math.sin(state.tick*.22) * p.bob * TILE*.025;
    ctx.translate(0, wobble);
    // engine flame + drill pulse
    const flame = TILE*(.22 + Math.sin(state.tick*.55)*.04);
    ctx.fillStyle = dead ? '#433' : '#ffb02e'; ctx.beginPath(); ctx.moveTo(-TILE*.16,TILE*.28); ctx.lineTo(0,TILE*.54+flame*.18); ctx.lineTo(TILE*.16,TILE*.28); ctx.fill();
    ctx.fillStyle = '#9a5a16'; ctx.beginPath(); ctx.moveTo(-TILE*.08,TILE*.30); ctx.lineTo(0,TILE*.46); ctx.lineTo(TILE*.08,TILE*.30); ctx.fill();
    const body = ctx.createLinearGradient(-TILE*.35,-TILE*.3,TILE*.35,TILE*.30);
    body.addColorStop(0, dead ? '#555' : '#9ee6ff'); body.addColorStop(.45, dead ? '#676767' : '#4dbbe8'); body.addColorStop(1, dead ? '#333' : '#126a98');
    ctx.fillStyle = body; roundRect(ctx, -TILE*.36,-TILE*.30,TILE*.72,TILE*.58,TILE*.11); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = 'rgba(7,20,34,.45)'; ctx.fillRect(-TILE*.31, -TILE*.02, TILE*.62, TILE*.045);
    ctx.fillStyle = '#26384d'; ctx.fillRect(-TILE*.43, -TILE*.03, TILE*.14, TILE*.18); ctx.fillRect(TILE*.29, -TILE*.03, TILE*.14, TILE*.18);
    const glass = ctx.createLinearGradient(0,-TILE*.50,0,-TILE*.24); glass.addColorStop(0,'#ffffff'); glass.addColorStop(.25,'#b9f3ff'); glass.addColorStop(1,'#387898');
    ctx.fillStyle = glass; roundRect(ctx, -TILE*.20,-TILE*.50,TILE*.40,TILE*.24,TILE*.055); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-TILE*.12,-TILE*.46,TILE*.10,TILE*.035);
    drawDirectionalDrill(p);
    ctx.fillStyle = '#ffd35f'; ctx.fillRect(TILE*.30, -TILE*.09, TILE*.14, TILE*.18);
    ctx.fillStyle = '#182536'; ctx.fillRect(TILE*.33, -TILE*.055, TILE*.08, TILE*.11);
  }
  function drawRedStar(cx, cy, r, color='#ffd95a') {
    ctx.save(); ctx.fillStyle=color; ctx.beginPath();
    for (let i=0;i<10;i++) { const a=-Math.PI/2 + i*Math.PI/5; const rr=i%2===0?r:r*.42; const x=cx+Math.cos(a)*rr, y=cy+Math.sin(a)*rr; if(i) ctx.lineTo(x,y); else ctx.moveTo(x,y); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function drawHammerSickle(cx, cy, s) {
    ctx.save(); ctx.strokeStyle='#ffd95a'; ctx.fillStyle='#ffd95a'; ctx.lineWidth=Math.max(2,s*.16); ctx.lineCap='round';
    ctx.beginPath(); ctx.arc(cx, cy, s*.62, -Math.PI*.15, Math.PI*.92); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-s*.52, cy+s*.46); ctx.lineTo(cx+s*.56, cy-s*.48); ctx.stroke();
    ctx.fillRect(cx-s*.18, cy-s*.55, s*.65, s*.13);
    ctx.restore();
  }
  function drawDirectionalDrill(p) {
    const active = p.drillAnim > 0.05;
    const jitter = active ? Math.sin(state.tick * 1.8) * TILE * .025 * p.drillAnim : 0;
    ctx.save();
    if (active && p.drillDx !== 0) {
      // ctx is already scaled to facing; +X is the visual nose side after ctx.scale(p.facing, 1).
      ctx.translate(TILE*.45 + jitter, TILE*.03);
      ctx.rotate(-Math.PI / 2);
    } else {
      ctx.translate(0, jitter);
    }
    const spin = active ? Math.sin(state.tick * 1.2) * TILE * .025 : 0;
    ctx.fillStyle = '#25222a';
    ctx.beginPath(); ctx.moveTo(-TILE*.18,TILE*.28); ctx.lineTo(spin,TILE*.62); ctx.lineTo(TILE*.18,TILE*.28); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = active ? '#fff0a6' : '#d5d0c0'; ctx.lineWidth = active ? 5 : 3; ctx.stroke();
    ctx.fillStyle = 'rgba(255,214,92,.85)';
    if (active) {
      ctx.fillRect(-TILE*.04, TILE*.38, TILE*.08, TILE*.18);
      ctx.fillStyle = 'rgba(255,244,170,.75)';
      ctx.fillRect(-TILE*.09, TILE*.56, TILE*.045, TILE*.12);
      ctx.fillRect(TILE*.06, TILE*.52, TILE*.04, TILE*.10);
    }
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function hud(){
    const p=state.player;
    ui.cash.textContent = `$${Math.floor(state.cash)}`;
    ui.depth.textContent=`${p.y*10} m`;
    ui.fuel.max=p.fuelMax; ui.fuel.value=Math.max(0,p.fuel);
    ui.hull.max=p.hullMax; ui.hull.value=p.hull;
    ui.cargo.max=p.cargoMax; ui.cargo.value=cargoUsed();
    const fuelPct = p.fuelMax ? p.fuel / p.fuelMax : 1;
    ui.fuelWarning.classList.toggle('show', fuelPct < 0.25 && !state.gameOver);
    const counts={};
    p.cargo.forEach(o=>counts[o.name]=(counts[o.name]||0)+1);
    ui.cargoList.innerHTML = Object.keys(counts).length ? Object.entries(counts).map(([k,v])=>`<li>${k} × ${v}</li>`).join('') : '<li>Empty</li>';
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
    if (key === 'enter') { sell(); e.preventDefault(); e.stopPropagation(); return; }
    if (key === ' ') { surfaceService(); e.preventDefault(); e.stopPropagation(); return; }
    if (key === 'r') { keys.add(key); e.preventDefault(); }
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
    if (!state.introStarted) { startIntro(); e.preventDefault(); e.stopPropagation(); return; }
    if (!state.gameOver) return;
    tryAutoAudio();
    restartGame();
    e.preventDefault();
    e.stopPropagation();
  }, {capture:true});
  addEventListener('touchstart', e => {
    if (!state.introStarted) { startIntro(); e.preventDefault(); e.stopPropagation(); return; }
    if (!state.gameOver) return;
    tryAutoAudio();
    restartGame();
    e.preventDefault();
    e.stopPropagation();
  }, {capture:true, passive:false});
  addEventListener('pointerdown', tryAutoAudio);
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
  bindButtons(); bindTouchControls(); generate(); focusGame(); setTimeout(focusGame, 60); loop();
})();
