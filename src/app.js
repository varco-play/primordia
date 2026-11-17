/* PRIMORDIA — renderer, camera, HUD, narrator */
(function () {
'use strict';
const { Sim, NS, NCH, NI, NH, NO, W, H, G, decodeGenome } = PRIM;
const TAU = Math.PI * 2, HW = W / 2, HH = H / 2;
const $ = id => document.getElementById(id);
const cv = $('world'), ctx = cv.getContext('2d');
let vw = 0, vh = 0, dpr = 1, minZ = 0.3, bgGrad = null;
const cam = { x: W / 2, y: H / 2, z: 0.7, tz: 0.7 };
let sim = null, sel = null, follow = false, auto = true, nextCut = 0, paused = false, speed = 1, tool = 'observe', selDeadAt = 0;
let frameN = 0, edges = null, cutKind = 0, entered = false;
const parts = [], rings = [];
const seeds = (window.PRIM_SEEDS || []).map(decodeGenome);
const wx = d => d > HW ? d - W : d < -HW ? d + W : d;
const wy = d => d > HH ? d - H : d < -HH ? d + H : d;
const hsl = (h, s, l, a) => a === undefined ? `hsl(${(h * 360) | 0},${s}%,${l}%)` : `hsla(${(h * 360) | 0},${s}%,${l}%,${a})`;
const fmt = n => Math.round(n).toLocaleString('en-US');

/* ---------- sprites ---------- */
function mkGlow(h, s, l, size, mid) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), r = size / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, `hsla(${h},${s}%,${Math.min(96, l + 22)}%,1)`); gr.addColorStop(mid, `hsla(${h},${s}%,${l}%,.42)`); gr.addColorStop(1, `hsla(${h},${s}%,${l}%,0)`);
  g.fillStyle = gr; g.fillRect(0, 0, size, size); return c;
}
const GLOW = []; for (let i = 0; i < 36; i++) GLOW.push(mkGlow(i * 10, 95, 60, 64, 0.22));
const PLANT = mkGlow(150, 85, 55, 32, 0.3), MEAT = mkGlow(350, 95, 64, 32, 0.3), HAZE = mkGlow(168, 70, 42, 128, 0.5);
const dust = []; for (let i = 0; i < 150; i++) dust.push({ x: Math.random(), y: Math.random(), d: 0.15 + Math.random() * 0.6, s: 0.5 + Math.random() * 1.4, a: 0.12 + Math.random() * 0.3 });

/* ---------- world ---------- */
function newWorld(evolved) {
  sim = new Sim({ seed: (Math.random() * 1e9) | 0, params: { plantRate: +$('abund').value, maxPlants: 800 + 460 * +$('abund').value, mutScale: +$('mut').value } });
  sim.init(evolved && seeds.length ? seeds : null, evolved ? 170 : 140, evolved ? 392 : 0);
  if (evolved) for (let i = 0; i < 500; i++) sim.step();
  sim.events.length = 0; sim.fx.length = 0;
  sel = null; follow = false; parts.length = 0; rings.length = 0; $('notelist').innerHTML = '';
  note(evolved
    ? 'The water is already old. These lineages were evolved for 220,000 ticks before you arrived; from here on, nothing is scripted.'
    : 'Primordial soup. Every brain is random noise. Most will spin and starve; watch for the first one that learns to turn toward food.', 0.11);
  auto = true; $('bAuto').setAttribute('aria-pressed', 'true'); nextCut = 0; showSpec(false);
}
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2); vw = cv.clientWidth; vh = cv.clientHeight;
  cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
  minZ = Math.max(vw / W, vh / H) * 1.03; cam.z = Math.max(cam.z, minZ); cam.tz = Math.max(cam.tz, minZ);
  bgGrad = ctx.createLinearGradient(0, 0, 0, vh); bgGrad.addColorStop(0, '#06101e'); bgGrad.addColorStop(1, '#02040a');
}

/* ---------- particles ---------- */
function burst(x, y, hue, n, sp, life, size, sat) {
  for (let i = 0; i < n && parts.length < 700; i++) { const a = Math.random() * TAU, v = sp * (0.3 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, hue, size, sat: sat === undefined ? 95 : sat }); }
}
function drainFx() {
  const fx = sim.fx, light = speed > 4;
  for (let i = 0; i < fx.length; i++) {
    const f = fx[i];
    if (light && f.t < 6 && (i & 3)) continue;
    if (Math.abs(wx(f.x - cam.x)) * cam.z > vw / 2 + 80 || Math.abs(wy(f.y - cam.y)) * cam.z > vh / 2 + 80) continue;
    switch (f.t) {
      case 1: burst(f.x, f.y, 0.42, 3, 0.7, 22, 1.6); break;
      case 2: burst(f.x, f.y, 0.97, 4, 0.8, 24, 1.8); break;
      case 3: burst(f.x, f.y, 0.0, 7, 1.6, 20, 2.2); break;
      case 4: rings.push({ x: f.x, y: f.y, r0: f.r, r1: f.r * 4.5, life: 36, max: 36, hue: f.hue, w: 1.4 }); break;
      case 5: burst(f.x, f.y, f.hue, 10, 1.3, 38, 2); rings.push({ x: f.x, y: f.y, r0: f.r, r1: f.r * 3, life: 26, max: 26, hue: f.hue, w: 1 }); break;
      case 6: rings.push({ x: f.x, y: f.y, r0: 10, r1: f.r, life: 40, max: 40, hue: 0.42, w: 2 }); break;
      case 7: rings.push({ x: f.x, y: f.y, r0: 10, r1: f.r, life: 50, max: 50, hue: 0.03, w: 5 }); burst(f.x, f.y, 0.05, 60, 4, 55, 2.6); break;
      case 8: rings.push({ x: f.x, y: f.y, r0: 10, r1: f.r, life: 60, max: 60, hue: 0.8, w: 3 }); burst(f.x, f.y, 0.8, 40, 2, 60, 2); break;
    }
  }
  fx.length = 0;
}

/* ---------- creature drawing ---------- */
function tailOf(c) {
  const n = 3 + ((c.g.b[G.TAIL] * 4.99) | 0);
  if (!c.tail || c.tail.length !== n) { c.tail = []; for (let i = 0; i < n; i++) c.tail.push({ x: c.x - Math.cos(c.a) * c.r * 0.8 * (i + 1), y: c.y - Math.sin(c.a) * c.r * 0.8 * (i + 1) }); }
  const seg = c.r * 0.8; let px = c.x - Math.cos(c.a) * c.r * 0.5, py = c.y - Math.sin(c.a) * c.r * 0.5;
  for (let i = 0; i < n; i++) {
    const s = c.tail[i]; let dx = wx(px - s.x), dy = wy(py - s.y); const d = Math.hypot(dx, dy);
    if (d > seg * 4) { s.x = px - Math.cos(c.a) * seg; s.y = py - Math.sin(c.a) * seg; }
    else if (d > seg) { s.x = px - dx / d * seg; s.y = py - dy / d * seg; }
    px = s.x; py = s.y;
  }
  return c.tail;
}
function drawCreature(c, sx, sy, z, t) {
  const r = c.r, b = c.g.b, ca = Math.cos(c.a), sa = Math.sin(c.a), tail = tailOf(c), n = tail.length;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = 'round'; ctx.strokeStyle = hsl(c.hue, 80, 55, 0.72);
  let px = sx - ca * r * 0.5 * z, py = sy - sa * r * 0.5 * z;
  const wf = t * 0.011 * (0.5 + c.thrust * 1.6) + c.phase, wa = r * 0.3 * (0.35 + c.thrust);
  for (let i = 0; i < n; i++) {
    const s = tail[i], k = (i + 1) / n, wig = Math.sin(wf - i * 0.9) * wa * k;
    const x = sx + (wx(s.x - c.x) - sa * wig) * z, y = sy + (wy(s.y - c.y) + ca * wig) * z;
    ctx.lineWidth = Math.max(0.7, r * z * (1.3 - 1.1 * k));
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke(); px = x; py = y;
  }
  const m = dpr * z; ctx.setTransform(m * ca, m * sa, -m * sa, m * ca, dpr * sx, dpr * sy);
  const nf = (b[G.FIN] * 3.99) | 0;
  if (nf) {
    ctx.fillStyle = hsl(c.hue, 70, 48, 0.6);
    for (let k = 0; k < nf; k++) {
      const xo = r * (0.35 - k * 0.55), fl = Math.sin(t * 0.008 + k + c.phase) * 0.25 * (0.4 + c.thrust);
      for (let sgn = -1; sgn <= 1; sgn += 2) { ctx.beginPath(); ctx.moveTo(xo, sgn * r * 0.7); ctx.lineTo(xo - r * 0.95, sgn * r * (1.45 + fl)); ctx.lineTo(xo - r * 0.55, sgn * r * 0.7); ctx.fill(); }
    }
  }
  if (c.diet > 0.4) {
    const open = c.bit > 0 ? 0.05 : 0.5, len = r * (0.45 + 0.75 * c.diet);
    ctx.strokeStyle = hsl(c.hue, 95, 84); ctx.lineWidth = r * 0.2;
    for (let sgn = -1; sgn <= 1; sgn += 2) { ctx.beginPath(); ctx.moveTo(r * 0.7, sgn * r * 0.55); ctx.quadraticCurveTo(r * 0.9 + len, sgn * r * (0.75 + open), r * 0.9 + len, sgn * r * open * 0.45); ctx.stroke(); }
  }
  ctx.fillStyle = c.hurt > 0 ? '#ff5f6d' : hsl(c.hue, 78, 52);
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * 0.86, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = hsl(c.hue, 95, 80, 0.75);
  ctx.beginPath(); ctx.ellipse(r * 0.12, 0, r * 0.62, r * 0.42, 0, 0, TAU); ctx.fill();
  const er = r * (0.14 + 0.15 * b[G.RANGE]);
  ctx.fillStyle = '#04070d'; ctx.beginPath(); ctx.arc(r * 0.62, r * 0.42, er, 0, TAU); ctx.arc(r * 0.62, -r * 0.42, er, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(r * 0.68, r * 0.42, er * 0.4, 0, TAU); ctx.arc(r * 0.68, -r * 0.42, er * 0.4, 0, TAU); ctx.fill();
}
function drawSelection(c, sx, sy, z, t) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'lighter';
  const half = c.fov / 2, R = c.range * z, st = c.fov / NS;
  for (let s = 0; s < NS; s++) {
    const pl = c.inp[s * NCH], me = c.inp[s * NCH + 1], bo = c.inp[s * NCH + 2];
    const a0 = c.a - half + s * st, a1 = a0 + st;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.arc(sx, sy, R, a0, a1); ctx.closePath();
    const top = Math.max(pl, me, bo);
    ctx.fillStyle = top < 0.01 ? 'rgba(170,210,255,.035)' : bo === top ? hsl(0.11, 100, 70, 0.06 + bo * 0.22) : me === top ? `rgba(255,111,125,${0.06 + me * 0.22})` : `rgba(98,230,167,${0.05 + pl * 0.2})`;
    ctx.fill(); ctx.strokeStyle = 'rgba(190,220,255,.13)'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(255,200,120,.9)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 5]); ctx.lineDashOffset = -t * 0.02;
  ctx.beginPath(); ctx.arc(sx, sy, c.r * z * 2.1 + 5, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
}

/* ---------- frame ---------- */
const vis = [];
function render(t) {
  const z = cam.z, hx = vw / 2, hy = vh / 2;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, vw, vh);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.16;
  for (const p of sim.patches) { const sx = wx(p.x - cam.x) * z + hx, sy = wy(p.y - cam.y) * z + hy, r = p.r * 1.7 * z; if (sx < -r || sx > vw + r || sy < -r || sy > vh + r) continue; ctx.drawImage(HAZE, sx - r, sy - r, r * 2, r * 2); }
  ctx.fillStyle = '#bfe3ff';
  for (const d of dust) {
    let x = (d.x * vw - cam.x * z * d.d) % vw, y = (d.y * vh - cam.y * z * d.d) % vh; if (x < 0) x += vw; if (y < 0) y += vh;
    ctx.globalAlpha = d.a * 0.5; ctx.fillRect(x, y, d.s, d.s);
  }
  // food
  const food = sim.food, pm = hx + 12, pn = hy + 12;
  ctx.globalAlpha = 0.9;
  for (let i = 0, n = food.length; i < n; i++) {
    const f = food[i], dx = wx(f.x - cam.x) * z; if (dx < -pm || dx > pm) continue;
    const dy = wy(f.y - cam.y) * z; if (dy < -pn || dy > pn) continue;
    if (f.t) { const s = Math.max(2.2, 10 * z * (1 - f.age / 700)); ctx.drawImage(MEAT, dx + hx - s, dy + hy - s, s * 2, s * 2); }
    else { const s = Math.max(1.8, 7 * z * (1 + 0.18 * Math.sin(t * 0.002 + f.ph))); ctx.drawImage(PLANT, dx + hx - s, dy + hy - s, s * 2, s * 2); }
  }
  // particles
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95;
    if (--p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
    const sx = wx(p.x - cam.x) * z + hx, sy = wy(p.y - cam.y) * z + hy, k = p.life / p.max, s = Math.max(1, p.size * z * 2.4);
    ctx.globalAlpha = k; ctx.drawImage(GLOW[((p.hue * 36) | 0) % 36], sx - s, sy - s, s * 2, s * 2);
  }
  // creatures: glow pass
  vis.length = 0; const cr = sim.cr;
  for (let i = 0, n = cr.length; i < n; i++) {
    const c = cr[i], m = (c.r * 4 + 30) * z, dx = wx(c.x - cam.x) * z; if (dx < -hx - m || dx > hx + m) continue;
    const dy = wy(c.y - cam.y) * z; if (dy < -hy - m || dy > hy + m) continue;
    c._sx = dx + hx; c._sy = dy + hy; vis.push(c);
    const s = c.r * z * (2.6 + c.glow * 3.2);
    ctx.globalAlpha = 0.34 + c.glow * 0.5; ctx.drawImage(GLOW[((c.hue * 36) | 0) % 36], c._sx - s, c._sy - s, s * 2, s * 2);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < vis.length; i++) {
    const c = vis[i];
    if (c.r * z >= 2.6) drawCreature(c, c._sx, c._sy, z, t);
    else { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = c.hurt > 0 ? '#ff5f6d' : hsl(c.hue, 85, 66); ctx.beginPath(); ctx.arc(c._sx, c._sy, Math.max(1.3, c.r * z), 0, TAU); ctx.fill(); }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let i = rings.length - 1; i >= 0; i--) {
    const g = rings[i]; if (--g.life <= 0) { rings.splice(i, 1); continue; }
    const k = 1 - g.life / g.max, e = 1 - (1 - k) * (1 - k), sx = wx(g.x - cam.x) * z + hx, sy = wy(g.y - cam.y) * z + hy;
    ctx.strokeStyle = hsl(g.hue, 95, 70, (1 - k) * 0.9); ctx.lineWidth = g.w * (1 - k) + 0.4;
    ctx.beginPath(); ctx.arc(sx, sy, (g.r0 + (g.r1 - g.r0) * e) * z, 0, TAU); ctx.stroke();
  }
  if (sel && !sel.dead) drawSelection(sel, wx(sel.x - cam.x) * z + hx, wy(sel.y - cam.y) * z + hy, z, t);
}

/* ---------- director ---------- */
function direct(now) {
  if (!auto || !entered) return;
  if (sel && sel.dead && nextCut > now + 1400) nextCut = now + 1400;
  if (now < nextCut) return;
  const cr = sim.cr; if (!cr.length) return;
  let pick = null; cutKind = (cutKind + 1) % 4;
  if (cutKind === 0) { for (const c of cr) if (c.diet > 0.6 && (!pick || c.kills > pick.kills)) pick = c; }
  else if (cutKind === 1) { let sp = null; for (const s of sim.living) if (s.est && (!sp || s.count > sp.count)) sp = s; const mem = cr.filter(c => c.sp === sp); pick = mem[(Math.random() * mem.length) | 0]; }
  else if (cutKind === 2) { let sp = null; for (const s of sim.living) if (s.est && (!sp || s.born > sp.born)) sp = s; const mem = cr.filter(c => c.sp === sp); pick = mem[(Math.random() * mem.length) | 0]; }
  else { for (const c of cr) if (!pick || c.kids > pick.kids) pick = c; }
  if (!pick) pick = cr[(Math.random() * cr.length) | 0];
  select(pick, true); cam.tz = Math.max(minZ, 1.5 + Math.random() * 0.9); nextCut = now + 13000;
}
function select(c, keepAuto) {
  sel = c; follow = !!c; selDeadAt = 0; edges = null;
  if (!keepAuto) setAuto(false);
  showSpec(!!c);
  if (c) {
    $('spName').textContent = c.sp.name; $('spName').style.color = hsl(c.hue, 90, 74);
    $('spId').textContent = 'Specimen #' + c.id;
    const b = c.g.b;
    $('gDiet').style.left = (c.diet * 100) + '%';
    $('gSize').style.transform = `scaleX(${b[G.SIZE]})`; $('gSpeed').style.transform = `scaleX(${b[G.SPEED]})`;
    $('gRange').style.transform = `scaleX(${b[G.RANGE]})`; $('gMut').style.transform = `scaleX(${b[G.MUT]})`;
    const kind = c.diet > 0.6 ? 'A hunter' : c.diet > 0.33 ? 'An opportunist that eats whatever it finds' : 'A grazer';
    $('verdict').textContent = `${kind}${c.diet > 0.6 ? ' that reads other bodies as food' : c.diet > 0.33 ? '' : ' that lives on drifting algae'}. ${c.sp.parentName ? 'Its line split from ' + c.sp.parentName + ' at tick ' + fmt(c.sp.born) + '.' : 'Its line reaches back to the first water.'}`;
  }
}
function showSpec(on) { $('spec').hidden = !on; $('census').hidden = on; $('side').classList.toggle('census', !on); }
function setAuto(v) { auto = v; $('bAuto').setAttribute('aria-pressed', v ? 'true' : 'false'); if (v) nextCut = 0; }

/* ---------- brain view ---------- */
const IN_ROW = ['algae', 'meat', 'body', 'bigger?', 'kin?'], EX = ['energy', 'health', 'speed', 'clock', 'bias', 'mem a', 'mem b', 'touch', 'signal'], OUT = ['turn', 'swim', 'bite', 'glow', 'mem a', 'mem b'];
function sizeCanvas(c) { const w = c.clientWidth, h = c.clientHeight, W2 = Math.round(w * dpr), H2 = Math.round(h * dpr); if (c.width !== W2 || c.height !== H2) { c.width = W2; c.height = H2; } const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return [g, w, h]; }
function actCol(v, a) { return v >= 0 ? `rgba(255,200,120,${a})` : `rgba(110,190,255,${a})`; }
function drawBrain() {
  const c = sel; if (!c) return; const [g, w, h] = sizeCanvas($('brain')); if (!w) return; g.clearRect(0, 0, w, h);
  const cs = 13, gx = 44, gy = 14, hxp = w * 0.6, oxp = w - 52;
  const ipos = [], hpos = [], opos = [];
  for (let s = 0; s < NS; s++) for (let k = 0; k < NCH; k++) ipos.push([gx + s * (cs + 2) + cs / 2, gy + k * (cs + 2) + cs / 2]);
  const ey = gy + NCH * (cs + 2) + 16;
  for (let k = 0; k < 9; k++) ipos.push([20 + (k % 3) * 40, ey + ((k / 3) | 0) * 31 + cs / 2]);
  for (let k = 0; k < NH; k++) hpos.push([hxp + (k % 2 ? 9 : -9), 12 + k * ((h - 24) / (NH - 1))]);
  for (let k = 0; k < NO; k++) opos.push([oxp, 22 + k * ((h - 44) / (NO - 1))]);
  if (!edges) {
    const wts = c.g.w, all = [];
    for (let hh = 0; hh < NH; hh++) for (let i = 0; i < NI; i++) all.push([i, hh, wts[hh * NI + i]]);
    all.sort((a, b) => Math.abs(b[2]) - Math.abs(a[2])); edges = { ih: all.slice(0, 110), ho: [] };
    for (let o = 0; o < NO; o++) for (let hh = 0; hh < NH; hh++) edges.ho.push([hh, o, wts[NI * NH + o * (NH + 1) + hh]]);
  }
  g.lineWidth = 1;
  for (const e of edges.ih) { const s = e[2] * c.inp[e[0]], a = Math.min(0.9, Math.abs(s) * 0.55); if (a < 0.03) continue; g.strokeStyle = actCol(s, a); g.beginPath(); g.moveTo(ipos[e[0]][0], ipos[e[0]][1]); g.lineTo(hpos[e[1]][0], hpos[e[1]][1]); g.stroke(); }
  for (const e of edges.ho) { const s = e[2] * c.hid[e[0]], a = Math.min(0.9, Math.abs(s) * 0.4); if (a < 0.04) continue; g.strokeStyle = actCol(s, a); g.beginPath(); g.moveTo(hpos[e[0]][0], hpos[e[0]][1]); g.lineTo(opos[e[1]][0] - 6, opos[e[1]][1]); g.stroke(); }
  g.font = '9px "IBM Plex Mono",ui-monospace,monospace'; g.textBaseline = 'middle';
  g.fillStyle = '#8497ab'; g.textAlign = 'right';
  for (let k = 0; k < NCH; k++) g.fillText(IN_ROW[k], gx - 5, gy + k * (cs + 2) + cs / 2);
  for (let i = 0; i < NS * NCH; i++) { const v = c.inp[i]; g.fillStyle = 'rgba(160,200,230,.09)'; g.fillRect(ipos[i][0] - cs / 2, ipos[i][1] - cs / 2, cs, cs); if (Math.abs(v) > 0.02) { g.fillStyle = actCol(v, Math.min(1, Math.abs(v))); g.fillRect(ipos[i][0] - cs / 2, ipos[i][1] - cs / 2, cs, cs); } }
  g.textAlign = 'center';
  for (let k = 0; k < 9; k++) { const p = ipos[NS * NCH + k], v = c.inp[NS * NCH + k]; g.fillStyle = 'rgba(160,200,230,.09)'; g.beginPath(); g.arc(p[0], p[1], 5.5, 0, TAU); g.fill(); g.fillStyle = actCol(v, Math.min(1, Math.abs(v))); g.beginPath(); g.arc(p[0], p[1], 5.5, 0, TAU); g.fill(); g.fillStyle = '#8497ab'; g.fillText(EX[k], p[0], p[1] + 13); }
  for (let k = 0; k < NH; k++) { const v = c.hid[k], p = hpos[k]; g.fillStyle = '#0b1626'; g.beginPath(); g.arc(p[0], p[1], 5, 0, TAU); g.fill(); g.fillStyle = actCol(v, Math.abs(v)); g.beginPath(); g.arc(p[0], p[1], 5, 0, TAU); g.fill(); g.strokeStyle = 'rgba(190,220,255,.3)'; g.stroke(); }
  g.textAlign = 'left';
  for (let k = 0; k < NO; k++) { const v = c.out[k], p = opos[k]; g.fillStyle = '#0b1626'; g.beginPath(); g.arc(p[0], p[1], 6, 0, TAU); g.fill(); g.fillStyle = actCol(v, Math.abs(v)); g.beginPath(); g.arc(p[0], p[1], 6, 0, TAU); g.fill(); g.strokeStyle = 'rgba(190,220,255,.35)'; g.stroke(); g.fillStyle = Math.abs(v) > 0.5 ? '#e4edf5' : '#8497ab'; g.fillText(OUT[k], p[0] + 11, p[1]); }
}

/* ---------- HUD ---------- */
const CLS = ['grazer', 'omnivore', 'predator'];
function hud() {
  const cr = sim.cr; let carn = 0; for (const c of cr) if (c.diet > 0.6) carn++;
  $('sT').textContent = fmt(sim.tick); $('sN').textContent = cr.length; $('sC').textContent = carn; $('sG').textContent = sim.stats.maxGen;
  const live = sim.living.filter(s => s.count > 0).sort((a, b) => b.count - a.count); $('sS').textContent = live.filter(s => s.est).length;
  if (!sel) {
    const top = live.slice(0, 8), mx = top.length ? top[0].count : 1; let html = '';
    for (const s of top) html += `<button class="sprow" data-sp="${s.id}" style="color:${hsl(s.hue, 90, 68)}"><span class="sw"></span><em>${s.name}<span class="meta c${s.cls}">${CLS[s.cls]} · ${s.born ? 'since tick ' + fmt(s.born) : 'founding line'}</span></em><b style="color:var(--fg)">${s.count}</b><span class="bar" style="transform:scaleX(${(s.count / mx).toFixed(3)})"></span></button>`;
    $('cenlist').innerHTML = html; $('cenN').textContent = live.length + ' lineages';
  } else {
    const c = sel;
    $('kAge').textContent = fmt(c.age); $('kGen').textContent = c.gen; $('kKids').textContent = c.kids; $('kKills').textContent = c.kills;
    $('mE').style.transform = `scaleX(${Math.max(0, Math.min(1, c.e / c.maxE)).toFixed(3)})`; $('mH').style.transform = `scaleX(${Math.max(0, Math.min(1, c.h / c.maxH)).toFixed(3)})`;
    if (c.dead) { $('spId').textContent = `Specimen #${c.id} · ${c.cause === 'eaten' ? 'killed' : c.cause === 'aged' ? 'died of old age' : 'starved'}`; }
  }
  drawStream(); drawMini();
}
function drawStream() {
  const [g, w, h] = sizeCanvas($('streamc')); if (!w) return; g.clearRect(0, 0, w, h);
  const Hs = sim.history, n = Hs.length; if (n < 3) return;
  const tot = new Map(); let maxN = 1;
  for (const s of Hs) { if (s.n > maxN) maxN = s.n; for (const p of s.sp) tot.set(p[0], (tot.get(p[0]) || 0) + p[1]); }
  const top = [...tot].sort((a, b) => b[1] - a[1]).slice(0, 12).map(x => x[0]).sort((a, b) => a - b), idx = new Map(top.map((id, i) => [id, i])), L = top.length + 1;
  const cum = new Float32Array(n * (L + 1)), sc = (h - 6) / maxN;
  for (let i = 0; i < n; i++) {
    const row = new Float32Array(L); let sum = 0; for (const p of Hs[i].sp) { const k = idx.get(p[0]); row[k === undefined ? L - 1 : k] += p[1]; sum += p[1]; }
    let y = h / 2 - sum * sc / 2; cum[i * (L + 1)] = y; for (let k = 0; k < L; k++) { y += row[k] * sc; cum[i * (L + 1) + k + 1] = y; }
  }
  const X = i => i / (n - 1) * w;
  for (let k = 0; k < L; k++) {
    const sp = k < L - 1 ? sim.species.get(top[k]) : null;
    g.fillStyle = sp ? hsl(sp.hue, 85, sp.cls === 2 ? 62 : 56, 0.88) : 'rgba(132,151,171,.4)';
    g.beginPath(); for (let i = 0; i < n; i++) g.lineTo(X(i), cum[i * (L + 1) + k]); for (let i = n - 1; i >= 0; i--) g.lineTo(X(i), cum[i * (L + 1) + k + 1]); g.closePath(); g.fill();
  }
  $('strN').textContent = 'last ' + fmt(Hs[n - 1].t - Hs[0].t) + ' ticks';
}
function drawMini() {
  const mc = $('minic'); if (!mc.clientWidth) return; const [g, w, h] = sizeCanvas(mc); g.clearRect(0, 0, w, h);
  const kx = w / W, ky = h / H;
  g.fillStyle = 'rgba(98,230,167,.10)'; for (const p of sim.patches) { g.beginPath(); g.arc(p.x * kx, p.y * ky, p.r * kx, 0, TAU); g.fill(); }
  for (const c of sim.cr) { g.fillStyle = hsl(c.hue, 90, 66); const s = c.diet > 0.6 ? 2.6 : 1.6; g.fillRect(c.x * kx - s / 2, c.y * ky - s / 2, s, s); }
  const rw = vw / cam.z * kx, rh = vh / cam.z * ky; g.strokeStyle = 'rgba(255,200,120,.9)'; g.lineWidth = 1;
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) g.strokeRect(cam.x * kx - rw / 2 + ox * w, cam.y * ky - rh / 2 + oy * h, rw, rh);
}

/* ---------- narrator ---------- */
function note(html, hue, tag) {
  const d = document.createElement('div'); d.className = 'note'; if (hue !== undefined) d.style.setProperty('--c', hsl(hue, 90, 70));
  d.innerHTML = html + `<small>${tag || 'tick ' + fmt(sim ? sim.tick : 0)}</small>`;
  const l = $('notelist'); l.insertBefore(d, l.firstChild); while (l.children.length > 5) l.removeChild(l.lastChild); return d;
}
const one = a => a[(Math.random() * a.length) | 0];
function narrate(e) {
  const nm = `<em>${e.name}</em>`, par = e.parentName ? `<em>${e.parentName}</em>` : null;
  switch (e.type) {
    case 'species': note(par ? one([`${nm} has drifted far enough from ${par} to count as its own kind.`, `A new branch: ${nm}, descended from ${par}.`, `${par} has thrown off a daughter lineage. Call it ${nm}.`]) : `${nm} has taken hold, a lineage with no living ancestor.`, e.hue); break;
    case 'predator': note(`${nm} has started killing for a living. A mutation rewired its feeding circuit from algae to bodies.`, e.hue); break;
    case 'extinct': note(one([`${nm} is extinct. It lasted ${fmt(e.life)} ticks and once numbered ${e.peak}.`, `The last ${nm} is dead. Peak population ${e.peak}; nothing of it remains but its descendants.`]), e.hue); break;
    case 'boom': note(`Population boom: from ${e.from} to ${e.n}. The algae will not keep up for long.`, 0.42); break;
    case 'crash': note(`Collapse. ${e.from} alive a moment ago, ${e.n} now. Whoever survives this will own the water.`, 0.98); break;
    case 'dominance': note(`${nm} now makes up ${Math.round(e.share * 100)}% of everything alive.`, e.hue); break;
    case 'apex': note(`One ${nm} has made its eighth kill. Its young will inherit that brain.`, e.hue); break;
    case 'smite': note(`Something struck the water. ${e.k} dead in an instant, and a clearing for whoever arrives first.`, 0.05); break;
    case 'mutagen': note(`Radiation scrambled ${e.k} genomes. Most of those brains are now worse. One might be better.`, 0.8); break;
  }
}
let sampleFn = null, asking = false;
function initClaude() {
  if (!(window.claude && typeof window.claude.use === 'function')) return;
  window.claude.use('sample').then(s => { if (s) { sampleFn = s; $('ask').hidden = false; } }).catch(() => { });
}
function telemetry() {
  const h = sim.history, last = h[h.length - 1] || {}, first = h[0] || {};
  const live = sim.living.filter(s => s.est && s.count > 0).sort((a, b) => b.count - a.count).slice(0, 7).map(s => ({ species: s.name, alive: s.count, diet: CLS[s.cls], bornAtTick: s.born, descendedFrom: s.parentName || 'founder', bodySize: +s.proto[G.SIZE].toFixed(2), speed: +s.proto[G.SPEED].toFixed(2), eyesight: +s.proto[G.RANGE].toFixed(2), killsByLineage: s.kills }));
  const d = { tick: sim.tick, alive: sim.cr.length, deepestGeneration: sim.stats.maxGen, predatorsAlive: last.carn, algae: last.plants, populationAWhileAgo: first.n, totals: sim.stats, species: live };
  if (sel && !sel.dead) d.creatureBeingWatched = { species: sel.sp.name, age: sel.age, generation: sel.gen, offspring: sel.kids, kills: sel.kills, energyPct: Math.round(sel.e / sel.maxE * 100), diet: +sel.diet.toFixed(2) };
  return d;
}
function askClaude() {
  if (!sampleFn || asking) return; asking = true; $('ask').disabled = true;
  const el = note('Reading the water…', 0.11, 'Claude · field naturalist'), body = el.firstChild;
  const prompt = 'You are a field naturalist observing an artificial-life simulation called Primordia. Each creature is steered by its own small neural network; behaviours evolved by mutation and natural selection, nothing is scripted. Below is live telemetry as JSON. Write one field note of 2 to 3 sentences about what is happening right now: name specific species (binomial names), say who is winning or losing and offer one sharp hypothesis about why. Voice: precise, dry, vivid, like a good nature documentary. Plain text only, no markdown, no lists, no preamble.\n\n' + JSON.stringify(telemetry());
  sampleFn(prompt, { modelTier: 'quick', cache: false, onText: ({ text }) => { if (text) body.textContent = text; } })
    .then(r => { if (r && r.text) body.textContent = r.text; })
    .catch(err => { body.textContent = err && err.code === 'rate_limited' ? 'The naturalist needs a minute. Try again shortly.' : 'The naturalist is unavailable right now.'; if (err && err.code === 'not_granted') $('ask').hidden = true; })
    .then(() => { asking = false; $('ask').disabled = false; });
}

/* ---------- input ---------- */
const ptrs = new Map(); let drag = null, pinch = 0;
function toWorld(px, py) { return [((cam.x + (px - vw / 2) / cam.z) % W + W) % W, ((cam.y + (py - vh / 2) / cam.z) % H + H) % H]; }
function zoomAt(px, py, f) {
  const [wx0, wy0] = toWorld(px, py), nz = Math.max(minZ, Math.min(5, cam.tz * f));
  cam.tz = nz; cam.z = nz; cam.x = ((wx0 - (px - vw / 2) / nz) % W + W) % W; cam.y = ((wy0 - (py - vh / 2) / nz) % H + H) % H;
}
cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.offsetX, e.offsetY]); if (ptrs.size === 1) drag = { x: e.offsetX, y: e.offsetY, moved: 0 }; else { const p = [...ptrs.values()]; pinch = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); if (drag) drag.moved = 99; } });
cv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (ptrs.size === 2) { const p = [...ptrs.values()], d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); if (pinch > 0) { zoomAt((p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2, d / pinch); follow = false; setAuto(false); } pinch = d; return; }
  if (!drag) return; const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy);
  if (drag.moved > 6) { cam.x = ((cam.x - dx / cam.z) % W + W) % W; cam.y = ((cam.y - dy / cam.z) % H + H) % H; follow = false; if (auto) setAuto(false); }
  drag.x = e.offsetX; drag.y = e.offsetY;
});
function up(e) {
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0;
  if (drag && drag.moved <= 6 && e.type === 'pointerup') click(e.offsetX, e.offsetY);
  if (!ptrs.size) drag = null;
}
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); if (auto) setAuto(false); }, { passive: false });
function click(px, py) {
  const [x, y] = toWorld(px, py); $('hint').style.opacity = 0;
  if (tool === 'observe') { const c = sim.pick(x, y, Math.max(26, 30 / cam.z)); if (c) { select(c); cam.tz = Math.max(cam.tz, 1.5); } else if (sel) { select(null); } }
  else if (tool === 'feed') sim.feed(x, y);
  else if (tool === 'smite') sim.smite(x, y, 190);
  else if (tool === 'mutate') sim.mutagen(x, y, 210);
}
function setSpeed(s) { speed = s; paused = false; $('bPause').setAttribute('aria-pressed', 'false'); $('bPause').textContent = 'Pause'; document.querySelectorAll('.sp').forEach(b => b.setAttribute('aria-pressed', +b.dataset.s === s ? 'true' : 'false')); }
function setTool(t) { tool = t; document.querySelectorAll('.tool').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === t ? 'true' : 'false')); cv.style.cursor = t === 'observe' ? 'crosshair' : 'cell'; }
function togglePause() { paused = !paused; $('bPause').setAttribute('aria-pressed', paused ? 'true' : 'false'); $('bPause').textContent = paused ? 'Resume' : 'Pause'; }
$('bPause').onclick = togglePause;
document.querySelectorAll('.sp').forEach(b => b.onclick = () => setSpeed(+b.dataset.s));
document.querySelectorAll('.tool').forEach(b => b.onclick = () => setTool(b.dataset.t));
$('bAuto').onclick = () => setAuto(!auto);
$('abund').oninput = e => { sim.P.plantRate = +e.target.value; sim.P.maxPlants = 800 + 460 * +e.target.value; };
$('mut').oninput = e => { sim.P.mutScale = +e.target.value; };
$('bSoup').onclick = () => newWorld(false);
$('closeSel').onclick = () => select(null);
$('cenlist').addEventListener('click', e => { const b = e.target.closest('.sprow'); if (!b) return; const mem = sim.cr.filter(c => c.sp.id === +b.dataset.sp); if (mem.length) { mem.sort((a, c) => (c.kids + c.kills) - (a.kids + a.kills)); select(mem[0]); cam.tz = Math.max(minZ, 1.8); } });
$('ask').onclick = askClaude;
function enter(evolved) { if (!evolved) newWorld(false); entered = true; $('intro').classList.add('gone'); nextCut = 0; }
$('enter').onclick = () => enter(true); $('enterSoup').onclick = () => enter(false);
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); togglePause(); } else if (e.key === '1') setSpeed(1); else if (e.key === '2') setSpeed(4); else if (e.key === '3') setSpeed(16);
  else if (e.key === 'Escape') select(null); else if (e.key === 'd') setAuto(!auto);
});
window.addEventListener('resize', resize);

/* ---------- loop ---------- */
let lastHud = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!vw || cv.clientWidth !== vw || cv.clientHeight !== vh) resize();
  if (!vw) return;
  frameN++;
  if (!paused) { const t0 = performance.now(), n = entered ? speed : 1; for (let i = 0; i < n; i++) { sim.step(); if (performance.now() - t0 > 26) break; } }
  drainFx();
  if (sim.events.length) { const ev = sim.events.splice(0); for (const e of ev.slice(-2)) narrate(e); }
  direct(now);
  if (sel && sel.dead) { if (!selDeadAt) selDeadAt = now; follow = false; if (!auto && now - selDeadAt > 4000) select(null, true); }
  if (follow && sel && !sel.dead) { cam.x = ((cam.x + wx(sel.x - cam.x) * 0.07) % W + W) % W; cam.y = ((cam.y + wy(sel.y - cam.y) * 0.07) % H + H) % H; }
  cam.z += (cam.tz - cam.z) * 0.035;
  render(now);
  if (sel) drawBrain();
  if (now - lastHud > 300) { lastHud = now; hud(); }
}
newWorld(true); resize(); initClaude(); hud();
window.__prim = { get sim() { return sim; }, cam, get sel() { return sel; } };
requestAnimationFrame(frame);
})();
