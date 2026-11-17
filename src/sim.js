/* PRIMORDIA — simulation core. No DOM. Runs in the browser and in Node (for headless evolution). */
(function (root) {
'use strict';
const NS = 5, NCH = 5, NX = 9, NI = NS * NCH + NX, NH = 14, NO = 6;
const NW = NI * NH + (NH + 1) * NO, NG = 12;
const W = 3840, H = 2560, CELL = 128, GC = W / CELL | 0, GR = H / CELL | 0, HW = W / 2, HH = H / 2;
const TAU = Math.PI * 2;
const G = { SIZE: 0, HUE: 1, DIET: 2, RANGE: 3, FOV: 4, SPEED: 5, REPRO: 6, INVEST: 7, MUT: 8, OSC: 9, TAIL: 10, FIN: 11 };
const SPECIES_TH = 0.2;

function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function hueDist(a, b) { let d = Math.abs(a - b); return d > 0.5 ? 1 - d : d; }
function bodyDist(a, b) {
  let s = 0, d;
  d = a[G.SIZE] - b[G.SIZE]; s += d * d; d = a[G.DIET] - b[G.DIET]; s += d * d * 1.5;
  d = a[G.RANGE] - b[G.RANGE]; s += d * d * 0.6; d = a[G.FOV] - b[G.FOV]; s += d * d * 0.6;
  d = a[G.SPEED] - b[G.SPEED]; s += d * d; d = hueDist(a[G.HUE], b[G.HUE]); s += d * d * 9;
  return Math.sqrt(s);
}

const GEN_A = ['Lum', 'Vor', 'Nyx', 'Aur', 'Cry', 'Phos', 'Thal', 'Zeph', 'Umbr', 'Kor', 'Myx', 'Stel', 'Pel', 'Rha', 'Ign', 'Cyan', 'Ser', 'Oph', 'Hyal', 'Tene', 'Noct', 'Vel', 'Xan', 'Brac'];
const GEN_B = ['ara', 'ion', 'ella', 'opsis', 'ina', 'odon', 'ura', 'ix', 'yra', 'oma', 'idium', 'aspis', 'onia', 'ax', 'ora', 'ula'];
const EP_CARN = ['vorax', 'ferox', 'rapax', 'cruentus', 'mordax', 'saevus'];
const EP_HERB = ['placidus', 'pascens', 'mitis', 'viridis', 'lentus'];
const EP_BIG = ['gigas', 'magnus', 'robustus', 'titanus'];
const EP_SMALL = ['minimus', 'pusillus', 'nanus', 'exiguus'];
const EP_FAST = ['velox', 'celer', 'fugax', 'volans'];
const EP_EYE = ['oculatus', 'vigilans', 'speculator'];
const EP_ANY = ['lucens', 'errans', 'novus', 'mirabilis', 'obscurus', 'profundus', 'fulgens', 'vagans', 'arcanus', 'primus', 'solitarius', 'gregarius'];

class Sim {
  constructor(o) {
    o = o || {};
    this.W = W; this.H = H;
    this.rand = rng(o.seed || 20261117);
    this.P = Object.assign({ plantRate: 2.6, maxPlants: 2000, mutScale: 1, maxPop: 420, minPop: 30 }, o.params || {});
    this.tick = 0; this.cr = []; this.food = []; this.nPlants = 0;
    this.species = new Map(); this.living = [];
    this.events = []; this.fx = []; this.history = []; this.fossils = [];
    this.nid = 1; this.nsp = 1; this.acc = 0; this.newborn = [];
    this.cHead = new Int32Array(GC * GR); this.cNext = new Int32Array(2048);
    this.fHead = new Int32Array(GC * GR); this.fNext = new Int32Array(8192);
    this.stats = { births: 0, deaths: 0, kills: 0, starved: 0, aged: 0, immigrants: 0, maxGen: 0, oldest: 0 };
    this.flags = {};
    this.patches = [];
    for (let i = 0; i < 7; i++) this.patches.push({ x: this.rand() * W, y: this.rand() * H, vx: (this.rand() - .5) * .12, vy: (this.rand() - .5) * .12, r: 240 + this.rand() * 220 });
    this._spare = null;
  }
  gauss() {
    if (this._spare !== null) { const v = this._spare; this._spare = null; return v; }
    let u, v, s; do { u = this.rand() * 2 - 1; v = this.rand() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const m = Math.sqrt(-2 * Math.log(s) / s); this._spare = v * m; return u * m;
  }
  randomGenome() {
    const b = new Float32Array(NG), w = new Float32Array(NW);
    for (let i = 0; i < NG; i++) b[i] = this.rand();
    b[G.DIET] = this.rand() * 0.45; b[G.SIZE] = 0.15 + this.rand() * 0.5;
    for (let i = 0; i < NW; i++) w[i] = this.gauss() * 0.7;
    return { b, w };
  }
  mutate(g, scale) {
    const b = new Float32Array(g.b), w = new Float32Array(g.w), R = this.rand;
    scale = (scale || 1) * this.P.mutScale;
    const rate = (0.008 + 0.09 * g.b[G.MUT]) * scale;
    for (let i = 0; i < NW; i++) if (R() < rate) {
      let v = R() < 0.04 ? this.gauss() : w[i] + this.gauss() * 0.3;
      w[i] = v < -4 ? -4 : v > 4 ? 4 : v;
    }
    const br = Math.min(0.9, 0.2 * scale);
    for (let i = 0; i < NG; i++) if (R() < br) {
      if (i === G.HUE) { let h = b[i] + this.gauss() * 0.016 * Math.min(scale, 4); b[i] = h - Math.floor(h); }
      else b[i] = clamp(b[i] + this.gauss() * 0.045, 0, 1);
    }
    if (R() < 0.005 * Math.min(scale, 4)) this.rewire(b, w);
    return { b, w };
  }
  /* macro-mutation: the food-seeking circuit is rewired between plants and prey */
  rewire(b, w) {
    const toCarn = b[G.DIET] < 0.5;
    for (let h = 0; h < NH; h++) for (let s = 0; s < NS; s++) { const i = h * NI + s * NCH, t = w[i]; w[i] = w[i + 2]; w[i + 2] = t; }
    b[G.DIET] = clamp(b[G.DIET] + (toCarn ? 0.7 : -0.7), 0, 1);
    b[G.SIZE] = clamp(b[G.SIZE] + (toCarn ? 0.25 : -0.25), 0, 1);
    w[NI * NH + 2 * (NH + 1) + NH] = toCarn ? 1.2 : -0.5;
    this.stats.rewires = (this.stats.rewires || 0) + 1;
  }
  /* ---------- species ---------- */
  nameSpecies(b, parent) {
    const R = this.rand, pick = a => a[R() * a.length | 0];
    const cls = b[G.DIET] > 0.6 ? 2 : b[G.DIET] > 0.33 ? 1 : 0;
    let genus = parent && parent.cls === cls && R() > 0.12 ? parent.genus : pick(GEN_A) + pick(GEN_B);
    const pools = [EP_ANY];
    if (cls === 2) pools.push(EP_CARN, EP_CARN); if (cls === 0) pools.push(EP_HERB);
    if (b[G.SIZE] > 0.68) pools.push(EP_BIG, EP_BIG); if (b[G.SIZE] < 0.2) pools.push(EP_SMALL, EP_SMALL);
    if (b[G.SPEED] > 0.72) pools.push(EP_FAST); if (b[G.RANGE] > 0.75) pools.push(EP_EYE);
    let ep = pick(pick(pools));
    for (let k = 0; k < 6; k++) { let clash = false; for (const s of this.living) if (s.genus === genus && s.ep === ep) clash = true; if (!clash) break; ep = pick(pick(pools)); }
    return { genus, ep, cls };
  }
  newSpecies(b, parent) {
    const nm = this.nameSpecies(b, parent);
    const sp = { id: this.nsp++, genus: nm.genus, ep: nm.ep, name: nm.genus + ' ' + nm.ep, cls: nm.cls, hue: b[G.HUE], proto: new Float32Array(b), parent: parent ? parent.id : 0, parentName: parent ? parent.name : null, born: this.tick, count: 0, peak: 0, total: 0, extinct: 0, est: false, kills: 0 };
    this.species.set(sp.id, sp); this.living.push(sp); return sp;
  }
  assignSpecies(c, parent) {
    const b = c.g.b;
    if (parent) {
      if (bodyDist(b, parent.sp.proto) < SPECIES_TH) return parent.sp;
      let best = null, bd = SPECIES_TH * 0.75;
      for (const s of this.living) { const d = bodyDist(b, s.proto); if (d < bd) { bd = d; best = s; } }
      return best || this.newSpecies(b, parent.sp);
    }
    let best = null, bd = SPECIES_TH * 0.75;
    for (const s of this.living) { const d = bodyDist(b, s.proto); if (d < bd) { bd = d; best = s; } }
    return best || this.newSpecies(b, null);
  }
  /* ---------- creatures ---------- */
  spawn(g, x, y, energy, parent) {
    const b = g.b, r = 5 + 11 * b[G.SIZE], m = (r / 8) * (r / 8), diet = b[G.DIET];
    const c = {
      id: this.nid++, g, x, y, vx: 0, vy: 0, a: this.rand() * TAU, r, m, diet, hue: b[G.HUE],
      range: 60 + 190 * b[G.RANGE], fov: 0.7 + 2.4 * b[G.FOV], acc: (0.10 + 0.36 * b[G.SPEED]) * Math.pow(r / 8, 0.4), gulp: Math.min(1, m),
      turn: 0.24 * Math.sqrt(8 / r), maxE: 100 * m, maxH: 20 * m, herb: Math.pow(1 - diet, 1.15), carn: Math.pow(diet, 1.15),
      reproAt: 0.5 + 0.4 * b[G.REPRO], invest: 0.2 + 0.3 * b[G.INVEST], oscF: 0.02 + 0.2 * b[G.OSC],
      maxAge: 5000 + 4000 * b[G.SIZE], mature: 150 + 150 * b[G.SIZE],
      cost0: 0.026 * Math.pow(m, 0.75) + 0.011 * b[G.RANGE] + 0.004 * b[G.FOV] + 0.005, moveCost: 0.05 * m * (0.5 + 1.5 * b[G.SPEED]),
      e: 0, h: 20 * m, age: 0, cd: 0, rcd: 40, glow: 0, hurt: 0, bit: 0, thrust: 0,
      gen: parent ? parent.gen + 1 : 0, kids: 0, kills: 0, eaten: 0, dead: false, cause: '',
      parentId: parent ? parent.id : 0, sp: null, phase: this.rand() * TAU,
      inp: new Float32Array(NI), hid: new Float32Array(NH), out: new Float32Array(NO), tail: null
    };
    c.e = Math.min(c.maxE, energy);
    c.sp = this.assignSpecies(c, parent);
    const sp = c.sp; sp.count++; sp.total++; if (sp.count > sp.peak) sp.peak = sp.count;
    if (!sp.est && sp.count >= 6) { sp.est = true; this.emit(sp.cls === 2 && !this.flags.pred ? 'predator' : 'species', sp); if (sp.cls === 2) this.flags.pred = true; }
    if (c.gen > this.stats.maxGen) this.stats.maxGen = c.gen;
    return c;
  }
  emit(type, sp, extra) {
    const e = Object.assign({ type, t: this.tick, sp: sp ? sp.id : 0, name: sp ? sp.name : '', hue: sp ? sp.hue : 0, n: this.cr.length }, extra || {});
    if (sp) { e.parentName = sp.parentName; e.cls = sp.cls; e.peak = sp.peak; e.life = this.tick - sp.born; }
    this.events.push(e); if (this.events.length > 60) this.events.shift();
  }
  addFx(t, x, y, hue, r) { if (this.fx.length < 300) this.fx.push({ t, x, y, hue, r }); }
  addPlant(px, py) {
    if (this.food.length >= 7000) return;
    const R = this.rand; let x, y;
    if (px !== undefined) { x = px; y = py; }
    else if (R() < 0.78) { const p = this.patches[R() * this.patches.length | 0]; const a = R() * TAU, d = Math.sqrt(R()) * p.r * (0.4 + R() * 0.6); x = p.x + Math.cos(a) * d; y = p.y + Math.sin(a) * d; }
    else { x = R() * W; y = R() * H; }
    x = ((x % W) + W) % W; y = ((y % H) + H) % H;
    this.food.push({ x, y, e: 12, t: 0, age: 0, ph: R() * TAU }); this.nPlants++;
  }
  init(seeds, n, genBase) {
    n = n || 130;
    for (let i = 0; i < n; i++) {
      const g = seeds && seeds.length ? this.mutate(seeds[i % seeds.length], 0.5) : this.randomGenome();
      if (seeds && seeds.length) { const k = i % seeds.length, h = g.b[G.DIET] > 0.6 ? 0.96 + (k * 0.031) % 0.12 : 0.08 + (k * 0.6180339) % 0.8; g.b[G.HUE] = h - Math.floor(h); }
      const c = this.spawn(g, this.rand() * W, this.rand() * H, 1e9, null); c.e = c.maxE * 0.6; c.gen = genBase || 0; this.cr.push(c);
    }
    for (let i = 0; i < this.P.maxPlants * 0.7; i++) this.addPlant();
  }
  /* ---------- main step ---------- */
  step() {
    const P = this.P, cr = this.cr, food = this.food, R = this.rand;
    const T = ++this.tick;
    for (const p of this.patches) {
      p.x = (p.x + p.vx + W) % W; p.y = (p.y + p.vy + H) % H;
      if (R() < 0.0006) { p.vx = (R() - .5) * .16; p.vy = (R() - .5) * .16; }
    }
    this.acc += P.plantRate;
    while (this.acc >= 1) { this.acc--; if (this.nPlants < P.maxPlants) this.addPlant(); }
    const fHead = this.fHead, fNext = this.fNext, cHead = this.cHead, cNext = this.cNext;
    fHead.fill(-1); cHead.fill(-1);
    for (let i = 0, n = food.length; i < n; i++) { const f = food[i]; const k = ((f.y / CELL) | 0) * GC + ((f.x / CELL) | 0); fNext[i] = fHead[k]; fHead[k] = i; }
    const n = cr.length;
    for (let i = 0; i < n; i++) { const c = cr[i]; const k = ((c.y / CELL) | 0) * GC + ((c.x / CELL) | 0); cNext[i] = cHead[k]; cHead[k] = i; }
    this.newborn.length = 0;
    for (let i = 0; i < n; i++) { const c = cr[i]; if (!c.dead) this.update(c, T); }
    // remove dead creatures
    let w = 0;
    for (let i = 0; i < cr.length; i++) {
      const c = cr[i];
      if (c.dead) { this.onDeath(c); } else cr[w++] = c;
    }
    cr.length = w;
    for (const c of this.newborn) cr.push(c);
    // food cleanup
    w = 0;
    for (let i = 0; i < food.length; i++) {
      const f = food[i];
      if (f.t === 1 && ++f.age > 520) f.e = 0;
      if (f.e > 0) food[w++] = f; else if (f.t === 0) this.nPlants--;
    }
    food.length = w;
    if (cr.length < P.minPop && T % 4 === 0) {
      const g = this.fossils.length && R() < 0.65 ? this.mutate(this.fossils[R() * this.fossils.length | 0].g, 2) : this.randomGenome();
      const c = this.spawn(g, R() * W, R() * H, 1e9, null); c.e = c.maxE * 0.6; cr.push(c); this.stats.immigrants++;
    }
    if (T % 40 === 0) this.sample();
  }
  update(c, T) {
    const cr = this.cr, food = this.food, inp = c.inp, hid = c.hid, out = c.out;
    const fHead = this.fHead, fNext = this.fNext, cHead = this.cHead, cNext = this.cNext;
    inp.fill(0);
    const range = c.range, r2 = range * range, fov = c.fov, half = fov * 0.5, invF = NS / fov;
    const cx = (c.x / CELL) | 0, cy = (c.y / CELL) | 0, RR = range > CELL ? 2 : 1;
    let hit = 0, heard = 0, target = null, tD = 1e9;
    for (let oy = -RR; oy <= RR; oy++) {
      let gy = cy + oy; if (gy < 0) gy += GR; else if (gy >= GR) gy -= GR;
      for (let ox = -RR; ox <= RR; ox++) {
        let gx = cx + ox; if (gx < 0) gx += GC; else if (gx >= GC) gx -= GC;
        const cell = gy * GC + gx;
        for (let j = fHead[cell]; j >= 0; j = fNext[j]) {
          const f = food[j]; if (f.e <= 0) continue;
          let dx = f.x - c.x; if (dx > HW) dx -= W; else if (dx < -HW) dx += W;
          let dy = f.y - c.y; if (dy > HH) dy -= H; else if (dy < -HH) dy += H;
          const d2 = dx * dx + dy * dy; if (d2 > r2) continue;
          const d = Math.sqrt(d2);
          if (d < c.r + 4) {
            const eff = f.t ? c.carn : c.herb;
            if (eff > 0.08 && c.e < c.maxE) { c.e += f.e * eff * (f.t ? 1 : c.gulp); f.e = 0; c.eaten++; this.addFx(f.t ? 2 : 1, f.x, f.y, c.hue, 0); continue; }
          }
          let a = Math.atan2(dy, dx) - c.a; a -= TAU * Math.round(a / TAU);
          if (a < -half || a > half) continue;
          let s = ((a + half) * invF) | 0; if (s >= NS) s = NS - 1;
          const k = s * NCH + f.t, p = 1 - d / range; if (p > inp[k]) inp[k] = p;
        }
        for (let j = cHead[cell]; j >= 0; j = cNext[j]) {
          const o = cr[j]; if (o === c || o.dead) continue;
          let dx = o.x - c.x; if (dx > HW) dx -= W; else if (dx < -HW) dx += W;
          let dy = o.y - c.y; if (dy > HH) dy -= H; else if (dy < -HH) dy += H;
          const d2 = dx * dx + dy * dy, rr = range + o.r; if (d2 > rr * rr) continue;
          const d = Math.sqrt(d2), touch = c.r + o.r;
          if (d < touch) { hit = 1; if (d > 0.01) { const f = (touch - d) / d * 0.3; c.vx -= dx * f; c.vy -= dy * f; } }
          if (o.glow > 0) { const hh = o.glow * (1 - d / rr); if (hh > heard) heard = hh; }
          let a = Math.atan2(dy, dx) - c.a; a -= TAU * Math.round(a / TAU);
          if (d < touch + 6 && a > -0.9 && a < 0.9 && d < tD) { tD = d; target = o; }
          if (a < -half || a > half) continue;
          let s = ((a + half) * invF) | 0; if (s >= NS) s = NS - 1;
          const k = s * NCH + 2; let p = 1 - (d - o.r) / range; if (p > 1) p = 1;
          if (p > inp[k]) { inp[k] = p; inp[k + 1] = clamp((o.r - c.r) / c.r * 2, -1, 1); inp[k + 2] = 1 - Math.min(1, hueDist(c.hue, o.hue) * 8) * 2; }
        }
      }
    }
    const B = NS * NCH, sp2 = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
    inp[B] = c.e / c.maxE; inp[B + 1] = c.h / c.maxH; inp[B + 2] = sp2 / 3; inp[B + 3] = Math.sin(T * c.oscF + c.phase);
    inp[B + 4] = 1; inp[B + 5] = out[4]; inp[B + 6] = out[5]; inp[B + 7] = hit; inp[B + 8] = heard;
    const w = c.g.w; let k = 0;
    for (let h = 0; h < NH; h++) { let s = 0; for (let i = 0; i < NI; i++) s += w[k++] * inp[i]; hid[h] = Math.tanh(s); }
    for (let o = 0; o < NO; o++) { let s = 0; for (let h = 0; h < NH; h++) s += w[k++] * hid[h]; s += w[k++]; out[o] = Math.tanh(s); }
    // act
    c.a += out[0] * c.turn; if (c.a > TAU) c.a -= TAU; else if (c.a < 0) c.a += TAU;
    const thrust = (out[1] + 1) * 0.5; c.thrust = thrust;
    c.vx = c.vx * 0.85 + Math.cos(c.a) * c.acc * thrust; c.vy = c.vy * 0.85 + Math.sin(c.a) * c.acc * thrust;
    c.x += c.vx; c.y += c.vy;
    if (c.x < 0) c.x += W; else if (c.x >= W) c.x -= W; if (c.y < 0) c.y += H; else if (c.y >= H) c.y -= H;
    c.glow = out[3] > 0 ? out[3] : 0;
    c.e -= c.cost0 + c.moveCost * thrust * thrust + c.glow * 0.004;
    if (c.hurt > 0) c.hurt--; if (c.bit > 0) c.bit--;
    if (c.cd > 0) c.cd--;
    else if (out[2] > 0 && target && !target.dead) {
      c.cd = 10; c.bit = 6;
      const dmg = (1.5 + 14 * c.diet) * c.m, real = Math.min(dmg, target.h);
      c.e -= 0.3 * c.m; target.h -= dmg; target.hurt = 8;
      c.e = Math.min(c.maxE, c.e + real * c.carn * 1.0);
      this.addFx(3, target.x, target.y, target.hue, target.r);
      if (target.h <= 0) { target.dead = true; target.cause = 'eaten'; c.kills++; c.sp.kills++; this.stats.kills++; if (c.kills === 8 && (!this.flags.apex || this.tick - this.flags.apex > 9000)) { this.flags.apex = this.tick; this.emit('apex', c.sp, { cid: c.id }); } }
    }
    c.age++; c.rcd--;
    if (c.age > c.maxAge) c.h -= 0.05 * c.m;
    else if (c.h < c.maxH && c.e > 0.3 * c.maxE) { c.h += 0.03 * c.m; c.e -= 0.03 * c.m; }
    if (c.dead) return;
    if (c.e <= 0) { c.dead = true; c.cause = 'starved'; return; }
    if (c.h <= 0) { c.dead = true; c.cause = c.age > c.maxAge ? 'aged' : 'eaten'; return; }
    if (c.rcd <= 0 && c.e > c.reproAt * c.maxE && c.age > c.mature && this.cr.length + this.newborn.length < this.P.maxPop) {
      const give = c.e * c.invest; c.e -= give + 12 * c.m; c.rcd = 80; c.kids++;
      const a = this.rand() * TAU, kid = this.spawn(this.mutate(c.g, 1), (c.x + Math.cos(a) * c.r * 2 + W) % W, (c.y + Math.sin(a) * c.r * 2 + H) % H, give, c);
      this.newborn.push(kid); this.stats.births++; this.addFx(4, c.x, c.y, c.hue, c.r);
    }
  }
  onDeath(c) {
    const st = this.stats, sp = c.sp; st.deaths++;
    if (c.cause === 'starved') st.starved++; else if (c.cause === 'aged') st.aged++;
    if (c.age > st.oldest) st.oldest = c.age;
    sp.count--;
    if (sp.count <= 0) { sp.extinct = this.tick; const i = this.living.indexOf(sp); if (i >= 0) this.living.splice(i, 1); if (sp.peak >= 12) this.emit('extinct', sp); if (!sp.est) this.species.delete(sp.id); }
    const total = 12 * c.m + 0.7 * Math.max(0, c.e), k = c.m > 2.2 ? 3 : c.m > 1.1 ? 2 : 1;
    for (let i = 0; i < k && this.food.length < 7000; i++) this.food.push({ x: (c.x + (this.rand() - .5) * c.r * 2 + W) % W, y: (c.y + (this.rand() - .5) * c.r * 2 + H) % H, e: total / k, t: 1, age: 0, ph: 0 });
    this.addFx(5, c.x, c.y, c.hue, c.r);
    if (c.kids >= 2) {
      const F = this.fossils, score = c.kids + c.kills * 0.5;
      if (F.length < 40) F.push({ g: c.g, score }); else { let mi = 0; for (let i = 1; i < F.length; i++) if (F[i].score < F[mi].score) mi = i; if (F[mi].score < score || this.rand() < 0.1) F[mi] = { g: c.g, score }; }
    }
  }
  sample() {
    const cr = this.cr, n = cr.length; let diet = 0, size = 0, carn = 0, speed = 0, range = 0;
    for (const c of cr) { diet += c.diet; size += c.g.b[G.SIZE]; speed += c.g.b[G.SPEED]; range += c.g.b[G.RANGE]; if (c.diet > 0.6) carn++; }
    const sp = []; for (const s of this.living) if (s.count > 0) sp.push([s.id, s.count]);
    const h = { t: this.tick, n, sp, diet: n ? diet / n : 0, size: n ? size / n : 0, speed: n ? speed / n : 0, range: n ? range / n : 0, carn, plants: this.nPlants };
    const H2 = this.history; H2.push(h); if (H2.length > 360) H2.shift();
    if (H2.length > 30) {
      const p = H2[H2.length - 26].n;
      if (!this.flags.cool || this.tick - this.flags.cool > 2400) {
        if (p > 50 && n < p * 0.55) { this.flags.cool = this.tick; this.emit('crash', null, { from: p }); }
        else if (p > 30 && n > p * 1.7) { this.flags.cool = this.tick; this.emit('boom', null, { from: p }); }
      }
    }
    if (n > 60) for (const s of this.living) if (!s.dom && s.count > n * 0.55) { s.dom = true; this.emit('dominance', s, { share: s.count / n }); }
  }
  /* ---------- god tools ---------- */
  feed(x, y) { for (let i = 0; i < 46; i++) { const a = this.rand() * TAU, d = Math.sqrt(this.rand()) * 120; this.addPlant(x + Math.cos(a) * d, y + Math.sin(a) * d); } this.addFx(6, x, y, 0.4, 120); }
  wdist2(ax, ay, bx, by) { let dx = Math.abs(ax - bx), dy = Math.abs(ay - by); if (dx > HW) dx = W - dx; if (dy > HH) dy = H - dy; return dx * dx + dy * dy; }
  smite(x, y, r) { let k = 0; for (const c of this.cr) if (!c.dead && this.wdist2(c.x, c.y, x, y) < r * r) { c.h = -1; c.e = Math.min(c.e, 5); k++; } this.addFx(7, x, y, 0.05, r); if (k) this.emit('smite', null, { k }); return k; }
  mutagen(x, y, r) { let k = 0; for (const c of this.cr) if (!c.dead && this.wdist2(c.x, c.y, x, y) < r * r) { const g = this.mutate(c.g, 6); c.g.w.set(g.w); k++; } this.addFx(8, x, y, 0.8, r); if (k) this.emit('mutagen', null, { k }); return k; }
  pick(x, y, rad) { let best = null, bd = rad * rad; for (const c of this.cr) { const d = this.wdist2(c.x, c.y, x, y); if (d < bd) { bd = d; best = c; } } return best; }
  topGenomes(k) {
    // diverse champions: best per living species by kids+kills, biggest species first
    const out = [], sps = this.living.slice().sort((a, b) => b.count - a.count);
    for (let round = 0; out.length < k && round < 6; round++) for (const s of sps) {
      const mem = this.cr.filter(c => c.sp === s).sort((a, b) => (b.kids + b.kills + b.age / 2000) - (a.kids + a.kills + a.age / 2000));
      if (mem[round]) out.push(mem[round].g); if (out.length >= k) break;
    }
    return out;
  }
}
function encodeGenome(g) {
  const u = new Uint8Array(NG + NW);
  for (let i = 0; i < NG; i++) u[i] = Math.round(clamp(g.b[i], 0, 1) * 255);
  for (let i = 0; i < NW; i++) u[NG + i] = Math.round(clamp(g.w[i], -4, 4) * 31.75 + 127.5);
  let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return (typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(u).toString('base64'));
}
function decodeGenome(str) {
  const s = typeof atob !== 'undefined' ? atob(str) : Buffer.from(str, 'base64').toString('binary');
  const b = new Float32Array(NG), w = new Float32Array(NW);
  for (let i = 0; i < NG; i++) b[i] = s.charCodeAt(i) / 255;
  for (let i = 0; i < NW; i++) w[i] = (s.charCodeAt(NG + i) - 127.5) / 31.75;
  return { b, w };
}
const API = { Sim, NS, NCH, NX, NI, NH, NO, NW, NG, W, H, G, hueDist, encodeGenome, decodeGenome };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PRIM = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
