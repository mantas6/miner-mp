import { SURFACE_HEIGHT, TILE, WORLD_H, WORLD_W } from './constants.js';
import { canvas, ctx, H, VIEW_HEIGHT, VIEW_WIDTH, W } from './dom.js';

export function createRenderer({ state, get, rand }) {
  function draw(){
    const p = state.player;
    const camX = Math.max(0, Math.min(WORLD_W-W, state.camX));
    const camY = Math.max(0, Math.min(WORLD_H-H, state.camY));
    const startX = Math.floor(camX), startY = Math.floor(camY);
    const offX = (startX - camX) * TILE, offY = (startY - camY) * TILE;
    const sky = ctx.createLinearGradient(0,0,0,VIEW_HEIGHT);
    sky.addColorStop(0,'#163762'); sky.addColorStop(.25,'#0e1d31'); sky.addColorStop(.26,'#2a1a11'); sky.addColorStop(1,'#050301');
    ctx.fillStyle = sky; ctx.fillRect(0,0,VIEW_WIDTH,VIEW_HEIGHT);
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
      ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(0,0,VIEW_WIDTH,VIEW_HEIGHT);
      ctx.fillStyle='#fff'; ctx.textAlign='center';
      ctx.font='bold 38px sans-serif'; ctx.fillText('GAME OVER', VIEW_WIDTH/2, 295);
      ctx.font='bold 24px sans-serif'; ctx.fillText('Tap anywhere to restart', VIEW_WIDTH/2, 338);
      ctx.font='18px sans-serif'; ctx.fillText('or press R', VIEW_WIDTH/2, 370);
      ctx.textAlign='left';
    }
  }
  function drawEnemies(camX, camY) {
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const sx = (e.drawX - camX) * TILE, sy = (e.drawY - camY) * TILE;
      if (sx < -TILE || sy < -TILE || sx > VIEW_WIDTH + TILE || sy > VIEW_HEIGHT + TILE) continue;
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
      if (wy >= SURFACE_HEIGHT){
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
    if (camY < SURFACE_HEIGHT + .2) {
      const gy = (SURFACE_HEIGHT - camY) * TILE;
      const grad = ctx.createLinearGradient(0, gy, 0, VIEW_HEIGHT);
      grad.addColorStop(0, 'rgba(100,58,28,.10)');
      grad.addColorStop(.55, 'rgba(58,31,16,.09)');
      grad.addColorStop(1, 'rgba(22,10,5,.16)');
      ctx.fillStyle = grad; ctx.fillRect(0, Math.max(0, gy), VIEW_WIDTH, VIEW_HEIGHT);
    } else {
      ctx.fillStyle = 'rgba(45,24,13,.075)'; ctx.fillRect(0,0,VIEW_WIDTH,VIEW_HEIGHT);
    }
    ctx.save(); ctx.globalCompositeOperation = 'soft-light';
    for (let i=0;i<10;i++) {
      ctx.fillStyle = i%2 ? 'rgba(255,182,96,.035)' : 'rgba(0,0,0,.045)';
      ctx.beginPath();
      ctx.ellipse((i*.137%1)*VIEW_WIDTH, (i*.293%1)*VIEW_HEIGHT, VIEW_WIDTH*(.10+.025*(i%3)), VIEW_HEIGHT*(.06+.015*(i%4)), (i*.7)%Math.PI, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawSurface(camX, camY) {
    if (camY >= SURFACE_HEIGHT + 1.4) return;
    const groundY = (SURFACE_HEIGHT - camY) * TILE;
    const skyTop = Math.max(0, -camY * TILE);
    const bx = (WORLD_W/2 - 5.7 - camX) * TILE;
    const by = groundY - TILE * 2.62;

    // Three full blocks of surface air above the diggable ground.
    const haze = ctx.createLinearGradient(0, skyTop, 0, groundY);
    haze.addColorStop(0, 'rgba(89,160,221,.18)');
    haze.addColorStop(.65, 'rgba(248,188,106,.10)');
    haze.addColorStop(1, 'rgba(48,92,66,.16)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, skyTop, VIEW_WIDTH, Math.max(0, groundY - skyTop));

    // Ground cap now sits below the 3-tile-tall surface space.
    ctx.fillStyle = '#1b623f'; ctx.fillRect(0, groundY - TILE*.12, VIEW_WIDTH, TILE*.18);
    ctx.fillStyle = '#74451e'; ctx.fillRect(0, groundY + TILE*.06, VIEW_WIDTH, TILE*.18);

    // Taller depot/factory using the new headroom.
    ctx.fillStyle = '#39465a'; roundRect(ctx, bx - TILE*.55, groundY - TILE*.18, TILE*11.2, TILE*.30, 10); ctx.fill();
    ctx.fillStyle = '#121d2c'; roundRect(ctx, bx + TILE*.05, by + TILE*.62, TILE*3.85, TILE*2.28, 18); ctx.fill();
    ctx.fillStyle = '#20344d'; roundRect(ctx, bx + TILE*.28, by + TILE*.92, TILE*1.24, TILE*.54, 8); ctx.fill();
    ctx.fillStyle = '#2a4565'; roundRect(ctx, bx + TILE*1.75, by + TILE*.86, TILE*1.42, TILE*.62, 8); ctx.fill();
    ctx.fillStyle = '#ffc857'; ctx.font='bold 25px sans-serif'; ctx.fillText('DEPOT', bx+TILE*.43, by+TILE*1.80);
    drawRedStar(bx+TILE*3.35, by+TILE*1.12, TILE*.18, '#ffdf64');
    drawHammerSickle(bx+TILE*3.03, by+TILE*1.90, TILE*.25);

    // Smokestacks and flag tower extend high into the surface area.
    ctx.fillStyle = '#24374d'; roundRect(ctx, bx+TILE*3.95, by+TILE*.18, TILE*.46, TILE*2.72, 8); ctx.fill();
    ctx.fillStyle = '#314860'; roundRect(ctx, bx+TILE*4.58, by+TILE*.02, TILE*.55, TILE*2.88, 8); ctx.fill();
    ctx.fillStyle = 'rgba(210,226,238,.30)';
    for (let i=0;i<5;i++) { ctx.beginPath(); ctx.ellipse(bx+TILE*(4.22+i*.20), by+TILE*(.05-i*.12), TILE*(.12+i*.035), TILE*.055, -.35, 0, Math.PI*2); ctx.fill(); }
    ctx.strokeStyle='#d9e4f2'; ctx.lineWidth=6; ctx.beginPath(); ctx.moveTo(bx-TILE*.34, groundY-TILE*.08); ctx.lineTo(bx-TILE*.34, by+TILE*.20); ctx.stroke();
    ctx.fillStyle='#b91c1c'; ctx.beginPath(); ctx.moveTo(bx-TILE*.31, by+TILE*.21); ctx.lineTo(bx+TILE*.76, by+TILE*.39); ctx.lineTo(bx-TILE*.31, by+TILE*.63); ctx.closePath(); ctx.fill();
    drawRedStar(bx+TILE*.12, by+TILE*.42, TILE*.105, '#ffd95a');

    // Refuel tower and pump lines.
    ctx.fillStyle = '#ff6b48'; roundRect(ctx, bx+TILE*5.45, by+TILE*1.10, TILE*.86, TILE*1.72, 10); ctx.fill();
    drawRedStar(bx+TILE*5.88, by+TILE*2.36, TILE*.15, '#ffd95a');
    ctx.fillStyle = '#ffe28b'; ctx.fillRect(bx+TILE*5.61, by+TILE*1.28, TILE*.52, TILE*.22);
    ctx.strokeStyle = '#93a4b8'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(bx+TILE*6.18, by+TILE*1.70); ctx.lineTo(bx+TILE*7.05, by+TILE*2.08); ctx.lineTo(bx+TILE*7.05, groundY-TILE*.24); ctx.stroke();
    ctx.fillStyle = '#60d394'; ctx.fillRect(bx+TILE*6.14, by+TILE*2.18, TILE*.92, TILE*.10);

    // Taller sell crane and cargo stack.
    ctx.fillStyle = '#a81919'; ctx.fillRect(bx+TILE*7.35, by+TILE*.58, TILE*1.62, TILE*.22); drawRedStar(bx+TILE*7.58, by+TILE*.69, TILE*.075, '#ffd95a');
    ctx.strokeStyle = '#8ca0b8'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(bx+TILE*7.78, groundY-TILE*.08); ctx.lineTo(bx+TILE*7.78, by+TILE*.68); ctx.lineTo(bx+TILE*9.75, by+TILE*.68); ctx.stroke();
    ctx.strokeStyle = '#ffc857'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(bx+TILE*9.55, by+TILE*.68); ctx.lineTo(bx+TILE*9.55, by+TILE*1.35); ctx.stroke();
    ['#9b5f2b','#6b8f40','#8b4d35','#b77934','#455d85','#7c3f33'].forEach((c,i)=>{ const col=i%3, row=Math.floor(i/3); ctx.fillStyle=c; ctx.fillRect(bx+TILE*(8.18+col*.43), groundY-TILE*(.32+row*.27), TILE*.35, TILE*.24); ctx.strokeStyle='rgba(0,0,0,.25)'; ctx.strokeRect(bx+TILE*(8.18+col*.43), groundY-TILE*(.32+row*.27), TILE*.35, TILE*.24); });

    drawDistantTreeline(groundY);
    drawParallaxTreeShapes(camX, groundY);
  }

  function drawDistantTreeline(groundY) {
    // Distant line is horizontally screen-stable, but vertically tied to the surface ground.
    const baseY = groundY - TILE * .28;
    ctx.fillStyle = 'rgba(34,80,57,.42)';
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    for (let x=0; x<=VIEW_WIDTH+40; x+=40) {
      const h = 18 + rand(x, 7) * 20;
      ctx.lineTo(x, baseY - h);
      ctx.lineTo(x + 20, baseY - h * .72);
    }
    ctx.lineTo(VIEW_WIDTH, baseY + 24);
    ctx.lineTo(0, baseY + 24);
    ctx.closePath();
    ctx.fill();
  }

  function drawParallaxTreeShapes(camX, groundY) {
    // Nearer tree shapes are vertically anchored to the surface and drift horizontally slower than buildings.
    const treeBaseY = groundY - TILE * .18;
    const spacing = TILE * .72;
    const parallaxX = camX * TILE * .38;
    for (let i=-4;i<24;i++) {
      const worldX = i * spacing + 17;
      const x = ((worldX - parallaxX) % (VIEW_WIDTH + spacing * 2)) - spacing;
      const trunkH = 18 + rand(i,4)*20;
      const trunkW = 5 + rand(i,8)*5;
      const crownR = 15 + rand(i,3)*20;
      ctx.fillStyle = 'rgba(47,66,39,.78)';
      ctx.fillRect(x + crownR*.35, treeBaseY - trunkH, trunkW, trunkH);
      ctx.fillStyle = i%3 ? 'rgba(47,135,86,.88)' : 'rgba(35,93,62,.88)';
      ctx.beginPath();
      ctx.ellipse(x + crownR*.5, treeBaseY - trunkH - crownR*.22, crownR*.58, crownR*.92, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = i%2 ? 'rgba(31,92,60,.72)' : 'rgba(65,145,78,.72)';
      ctx.beginPath();
      ctx.ellipse(x + crownR*.18, treeBaseY - trunkH + crownR*.05, crownR*.34, crownR*.54, -.4, 0, Math.PI*2);
      ctx.fill();
    }
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

  return { draw };
}
