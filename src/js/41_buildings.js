/* ============================================================
   Buildings: painted facades (atlas), body geometry, balconies,
   rooftops, vertical tenant signs, billboards
   ============================================================ */

const ATL = {};
const STATIC = new BatchSet();
const SIGN_GLOWS = [];  // soft halos around lit signs (built by the effects module)
const INST = { ac: [], tank: [], acRoof: [] };
const COLLIDERS = [];   // AABBs (world) used by camera transitions to avoid flying through walls
const MAP_BLOCKS = [];  // footprints for the minimap

class FacadeAtlas extends Atlas {
  constructor(w, h) {
    super(w, h, 1, 'facade');
    this.ec = makeCanvas(w / 2, h / 2); this.e = this.ec.getContext('2d');
    this.e.fillStyle = '#000'; this.e.fillRect(0, 0, w, h); this.e.setTransform(0.5, 0, 0, 0.5, 0, 0);
    this.rc = makeCanvas(w / 4, h / 4); this.r = this.rc.getContext('2d');
    this.r.fillStyle = 'rgb(255,232,0)'; this.r.fillRect(0, 0, w, h); this.r.setTransform(0.25, 0, 0, 0.25, 0, 0);
  }
}

// Quads carrying wall-space coordinates for the procedural window material.
class WallBatch {
  constructor() { this.q = []; }
  add(p0, p1, p2, p3, w, h, seed, tint) { this.q.push({ p: [p0, p1, p2, p3], w, h, seed, tint }); }
  build(material) {
    const n = this.q.length; if (!n) return null;
    const pos = new Float32Array(n * 12), nor = new Float32Array(n * 12), wall = new Float32Array(n * 16), col = new Float32Array(n * 12), uv = new Float32Array(n * 8);
    const idx = new Uint32Array(n * 6), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3();
    this.q.forEach((q, i) => {
      const [a, b, c, d] = q.p;
      e1.subVectors(b, a); e2.subVectors(d, a); nn.crossVectors(e1, e2).normalize();
      const wc = [[0, 0], [q.w, 0], [q.w, q.h], [0, q.h]];
      [a, b, c, d].forEach((p, k) => {
        const o = (i * 4 + k);
        pos.set([p.x, p.y, p.z], o * 3); nor.set([nn.x, nn.y, nn.z], o * 3);
        wall.set([wc[k][0], wc[k][1] + (q.y0 || 0), q.seed, 0], o * 4);
        col.set([q.tint.r, q.tint.g, q.tint.b], o * 3);
        uv.set([wc[k][0] / 4, wc[k][1] / 4], o * 2);
      });
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aWall', new THREE.BufferAttribute(wall, 4));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.matrixAutoUpdate = false;
    return m;
  }
}
const WALLS = new Map();
const wallBatch = zone => { let w = WALLS.get(zone); if (!w) { w = new WallBatch(); WALLS.set(zone, w); } return w; };

/* ---------- wall patterns (grey, multiplied over the wall colour) ---------- */
const PAT = {};
function makePatterns() {
  const mk = (w, h, fn, seed) => { const c = makeCanvas(w, h); fn(c.getContext('2d'), w, h, mulberry32(seed)); return c; };
  PAT.tile = mk(128, 128, (g, w, h, r) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { const v = 205 + r() * 45; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 3.3, 3.3); }
  }, 1);
  PAT.brick = mk(192, 120, (g, w, h, r) => {
    g.fillStyle = '#8f8f8f'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < h / 3; row++) for (let x = -(row % 2) * 4.8; x < w; x += 9.6) {
      const v = 175 + r() * 80; g.fillStyle = `rgb(${v},${v * 0.97},${v * 0.94})`; g.fillRect(x + 0.6, row * 3 + 0.5, 8.6, 2.2);
    }
  }, 2);
  PAT.concrete = mk(144, 144, (g, w, h, r) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 2200; k++) { const v = 150 + r() * 105; g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(r() * w, r() * h, 2, 2); }
    g.strokeStyle = 'rgba(70,70,70,0.6)'; g.lineWidth = 1;
    for (let x = 0; x <= w; x += 72) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); }
    for (let y = 0; y <= h; y += 36) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
    g.fillStyle = 'rgba(60,60,60,0.7)';
    for (let x = 12; x < w; x += 24) for (let y = 9; y < h; y += 18) { g.beginPath(); g.arc(x, y, 1.1, 0, TAU); g.fill(); }
  }, 3);
  PAT.mortar = mk(256, 256, (g, w, h, r) => {
    g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 9000; k++) { const v = 160 + r() * 95; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    for (let k = 0; k < 7; k++) { g.strokeStyle = 'rgba(80,80,80,0.35)'; g.lineWidth = 0.7; g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let s = 0; s < 12; s++) { x += (r() - 0.5) * 18; y += r() * 10; g.lineTo(x, y); } g.stroke(); }
  }, 4);
  PAT.panel = mk(96, 96, (g, w, h, r) => {
    g.fillStyle = '#d6d6d6'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 24) { const gr = g.createLinearGradient(x, 0, x + 24, 0); gr.addColorStop(0, '#c4c4c4'); gr.addColorStop(0.5, '#e2e2e2'); gr.addColorStop(1, '#bcbcbc'); g.fillStyle = gr; g.fillRect(x, 0, 23, h); }
    g.fillStyle = 'rgba(60,60,60,.5)'; for (let x = 0; x < w; x += 24) g.fillRect(x + 23, 0, 1, h);
  }, 5);
  PAT.wood = mk(96, 128, (g, w, h, r) => {
    for (let x = 0; x < w; x += 6) { const v = 150 + r() * 70; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 5.4, h); }
    for (let k = 0; k < 80; k++) { g.fillStyle = `rgba(40,40,40,${r() * 0.25})`; g.fillRect(r() * w, r() * h, 1, 4 + r() * 20); }
  }, 6);
  PAT.copper = mk(144, 144, (g, w, h, r) => {
    for (let y = 0; y < h; y += 18) for (let x = -(y / 18 % 2) * 9; x < w; x += 18) {
      const v = 170 + r() * 70; g.fillStyle = `rgb(${v * 0.92},${v},${v * 0.95})`; g.fillRect(x + 0.5, y + 0.5, 17, 17);
      g.fillStyle = `rgba(30,50,40,${r() * 0.3})`; g.fillRect(x + 0.5, y + 12 + r() * 4, 17, 3);
    }
  }, 7);
}
function wallFill(ctx, x, y, w, h, color, style, ppm) {
  ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
  const p = PAT[style] || PAT.mortar;
  const pat = ctx.createPattern(p, 'repeat');
  if (pat.setTransform) pat.setTransform(new DOMMatrix().translate(x, y).scale(ppm / 40));
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = pat; ctx.fillRect(x, y, w, h); ctx.restore();
}
function stain(ctx, x, y, w, len, a = 0.18) {
  const g = ctx.createLinearGradient(0, y, 0, y + len);
  g.addColorStop(0, `rgba(28,24,20,${a})`); g.addColorStop(1, 'rgba(28,24,20,0)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, len);
}

/* ---------- window painting ---------- */
const WARM = ['#ffd9a3', '#ffcf8f', '#ffe2b8', '#ffc77e'];
const COOL = ['#e8f0ff', '#dde9ff', '#f2f6ff'];
const CURTAIN = ['#d9cdb8', '#efe9dc', '#b8c4b0', '#c9b59a', '#a7b6c4', '#e3d3c3', '#8f7a68'];
function paintWindow(A, x, y, w, h, o, rr) {
  const c = A.ctx, e = A.e, r = A.r;
  const fw = Math.max(1.5, o.ppm * 0.045);
  c.fillStyle = o.frame; c.fillRect(x - fw, y - fw, w + fw * 2, h + fw * 2);
  r.fillStyle = 'rgb(255,120,0)'; r.fillRect(x - fw, y - fw, w + fw * 2, h + fw * 2);
  if (o.lit) {
    const base = o.cool ? pick(COOL) : pick(WARM);
    const k = o.bright;
    const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, base); g.addColorStop(1, shade(base, 0.72)); c.fillStyle = g; c.fillRect(x, y, w, h);
    const ge = e.createLinearGradient(x, y, x, y + h); ge.addColorStop(0, shade(base, k)); ge.addColorStop(1, shade(base, k * 0.6)); e.fillStyle = ge; e.fillRect(x, y, w, h);
    // ceiling fixture glow
    const gl = e.createRadialGradient(x + w / 2, y + h * 0.1, 0, x + w / 2, y + h * 0.1, w * 0.6); gl.addColorStop(0, 'rgba(255,255,255,0.35)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); e.fillStyle = gl; e.fillRect(x, y, w, h);
    if (o.cover === 'curtain') {
      const cc = pick(CURTAIN), open = rr() * 0.6;
      const cw = w * (1 - open) / 2;
      for (const [cx0, cw0] of [[x, cw], [x + w - cw, cw]]) {
        c.fillStyle = cc; c.fillRect(cx0, y, cw0, h);
        e.fillStyle = shade(base, k * 0.35); e.fillRect(cx0, y, cw0, h);
        for (let f = cx0; f < cx0 + cw0; f += Math.max(2, o.ppm * 0.07)) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(f, y, 1, h); e.fillStyle = 'rgba(0,0,0,0.25)'; e.fillRect(f, y, 1, h); }
      }
      if (rr() < 0.4) { c.fillStyle = 'rgba(240,240,235,0.55)'; c.fillRect(x, y, w, h); e.fillStyle = 'rgba(0,0,0,0.35)'; e.fillRect(x, y, w, h); }
    } else if (o.cover === 'blinds') {
      const step = Math.max(2, o.ppm * 0.05);
      for (let yy = y; yy < y + h; yy += step) { c.fillStyle = 'rgba(210,210,205,0.85)'; c.fillRect(x, yy, w, step * 0.62); e.fillStyle = 'rgba(0,0,0,0.6)'; e.fillRect(x, yy, w, step * 0.62); }
    } else if (o.cover === 'frosted') {
      c.fillStyle = 'rgba(235,235,230,0.6)'; c.fillRect(x, y, w, h); e.fillStyle = 'rgba(0,0,0,0.3)'; e.fillRect(x, y, w, h);
    } else if (rr() < 0.5) {
      // furniture silhouettes inside
      c.fillStyle = 'rgba(40,30,25,0.6)'; e.fillStyle = 'rgba(0,0,0,0.75)';
      const sw = w * (0.2 + rr() * 0.3), sx = x + rr() * (w - sw), sh = h * (0.25 + rr() * 0.4);
      c.fillRect(sx, y + h - sh, sw, sh); e.fillRect(sx, y + h - sh, sw, sh);
    }
  } else {
    const g = c.createLinearGradient(x, y, x + w * 0.3, y + h); g.addColorStop(0, '#26303b'); g.addColorStop(0.5, '#10151b'); g.addColorStop(1, '#090c10'); c.fillStyle = g; c.fillRect(x, y, w, h);
    if (o.cover === 'curtain' && rr() < 0.7) { c.fillStyle = 'rgba(70,60,52,0.55)'; c.fillRect(x, y, w * 0.35, h); c.fillRect(x + w * 0.65, y, w * 0.35, h); }
    if (o.cover === 'frosted') { c.fillStyle = 'rgba(120,125,128,0.5)'; c.fillRect(x, y, w, h); }
    r.fillStyle = 'rgb(255,30,0)'; r.fillRect(x, y, w, h);
  }
  if (o.lit) { r.fillStyle = 'rgb(255,40,0)'; r.fillRect(x, y, w, h); }
  // mullions
  c.fillStyle = o.frame; e.fillStyle = '#000';
  if (o.mullion) for (let i = 1; i < o.mullion; i++) { const mx = x + w * i / o.mullion - fw * 0.5; c.fillRect(mx, y, fw, h); e.fillRect(mx, y, fw, h); }
  if (o.transom) { const ty = y + h * 0.22; c.fillRect(x, ty, w, fw); e.fillRect(x, ty, w, fw); }
  if (o.grille) {
    c.fillStyle = '#b9bcbd';
    for (let gx = x + 2; gx < x + w; gx += Math.max(3, o.ppm * 0.09)) { c.fillRect(gx, y - fw, Math.max(1, o.ppm * 0.02), h + fw * 2); e.fillStyle = '#000'; e.fillRect(gx, y - fw, Math.max(1, o.ppm * 0.02), h + fw * 2); }
  }
  if (o.vinyl) {
    c.save(); e.save();
    drawText(c, o.vinyl, x + w * 0.08, y + h * 0.3, w * 0.84, h * 0.32, { fam: 'gothic', weight: 700, color: o.vinylColor || '#f4f1e8' });
    drawText(e, o.vinyl, x + w * 0.08, y + h * 0.3, w * 0.84, h * 0.32, { fam: 'gothic', weight: 700, color: '#000' });
    c.restore(); e.restore();
  }
}
function shade(hex, k) {
  const r = clamp(Math.round(parseInt(hex.slice(1, 3), 16) * k), 0, 255);
  const g = clamp(Math.round(parseInt(hex.slice(3, 5), 16) * k), 0, 255);
  const b = clamp(Math.round(parseInt(hex.slice(5, 7), 16) * k), 0, 255);
  return `rgb(${r},${g},${b})`;
}

/* ---------- building context ---------- */
class Bldg {
  constructor(spec) {
    Object.assign(this, spec);
    this.W = spec.z1 - spec.z0;
    this.setback = spec.setback || 0;
    this.inset = spec.inset || 0;
    this.H = spec.gh + spec.floors * spec.fh;
    this.zc = (spec.z0 + spec.z1) / 2;
    this.zone = zoneOf(this.zc);
    const s = spec.side === 'E' ? 1 : -1;
    this.sgn = s;
    let U, O;
    if (spec.frame) { U = spec.frame.U.clone().normalize(); O = spec.frame.O.clone(); }
    else { U = s > 0 ? V3(0, 0, 1) : V3(0, 0, -1); O = V3(s * (FRONT_X + this.inset), 0, s > 0 ? spec.z0 : spec.z1); }
    const Out = V3().crossVectors(U, V3(0, 1, 0));
    this.O = O;
    this.L = new THREE.Matrix4().makeBasis(U, V3(0, 1, 0), Out).setPosition(O);
    this.yaw = Math.atan2(Out.x, Out.z); // world yaw of the local +z (outward) direction
    if (spec.frame) { const c = this.P(this.W / 2, 0, 0); this.zc = c.z; this.zone = zoneOf(c.z); }
    const dist = Math.abs(this.zc);
    this.ppm = (dist < 32 ? 46 : dist < 75 ? 32 : 22) * QUALITY.atlas;
    reseed(Math.floor(spec.z0 * 1000 + (s > 0 ? 77 : 33)));
  }
  P(x, y, z) { return V3(x, y, z).applyMatrix4(this.L); }
  M(m) { return new THREE.Matrix4().multiplyMatrices(this.L, m); }
  add(key, mat_, geo, m, color, opts = {}, uvRect) { STATIC.get(key, mat_, opts, this.zone).add(geo, this.M(m), color, uvRect); }
  quad(key, mat_, a, b, c, d, uv, color, opts = {}) { STATIC.get(key, mat_, opts, this.zone).addQuad(this.P(...a), this.P(...b), this.P(...c), this.P(...d), uv, color); }
  // Box in local coordinates by min/max corners.
  box(key, mat_, x0, y0, z0, x1, y1, z1, color, opts) { this.add(key, mat_, G.box, boxM(x0, y0, z0, x1, y1, z1), color, opts); }
  light(x, z, r, color, k) { const p = this.P(x, 0, z); addLight2D(p.x, p.z, r, color, k); }
  spill(x0, x1, color, k, depth = 3.2) { for (let x = x0 + 0.5; x <= x1 - 0.4; x += 1.0) this.light(x, depth * 0.35, depth, color, k); }
}

/* ---------- facade painting ---------- */
function paintFacade(b) {
  const A = ATL.fac, ppm = b.ppm;
  const hUp = b.H - b.gh;
  const r = A.alloc(b.W * ppm, hUp * ppm);
  b.rect = r;
  const c = A.ctx, e = A.e;
  const X = u => r.x + u * ppm, Y = y => r.y + (b.H - y) * ppm;
  wallFill(c, r.x, r.y, r.w, r.h, b.wall, b.style, ppm);
  const rr = RNG;
  const wins = [];
  // parapet cap and floor bands
  c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(r.x, r.y, r.w, Math.max(2, ppm * 0.12));
  for (let f = 1; f < b.floors; f++) {
    const y = Y(b.gh + f * b.fh);
    c.fillStyle = 'rgba(0,0,0,0.14)'; c.fillRect(r.x, y - ppm * 0.02, r.w, Math.max(1.5, ppm * 0.18));
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(r.x, y - ppm * 0.04, r.w, Math.max(1, ppm * 0.03));
  }
  const frame = pick(['#a3a7a9', '#8e9294', '#5a4e44', '#c9c9c2', '#3e3a36']);
  const coolBias = b.win === 'office' ? 0.75 : 0.35;
  for (let f = 0; f < b.floors; f++) {
    const fy = b.gh + f * b.fh;
    let kind = b.win === 'mixed' ? pick(['apt', 'office', 'old']) : b.win;
    const units = [];
    if (kind === 'office') {
      const n = Math.max(1, Math.round((b.W - 0.6) / 1.35));
      units.push({ u0: 0.35, u1: b.W - 0.35, y0: fy + 0.8, y1: fy + 2.35, mull: n, cover: rr() < 0.55 ? 'blinds' : 'none', transom: rr() < 0.4 });
    } else if (kind === 'apt') {
      const n = Math.max(1, Math.round(b.W / 3.6)), uw = b.W / n;
      for (let i = 0; i < n; i++) {
        const u = i * uw;
        if (b.setback) {
          units.push({ u0: u + uw * 0.12, u1: u + uw * 0.72, y0: fy + 0.12, y1: fy + 2.15, mull: 2, cover: 'curtain' });
          units.push({ u0: u + uw * 0.78, u1: u + uw * 0.93, y0: fy + 1.2, y1: fy + 2.0, mull: 1, cover: 'frosted', grille: true });
        } else {
          units.push({ u0: u + uw * 0.15, u1: u + uw * 0.62, y0: fy + 0.9, y1: fy + 2.1, mull: 2, cover: 'curtain', hood: rr() < 0.5 });
          units.push({ u0: u + uw * 0.72, u1: u + uw * 0.88, y0: fy + 1.25, y1: fy + 1.95, mull: 1, cover: 'frosted', grille: rr() < 0.6 });
        }
      }
    } else {
      const n = Math.max(1, Math.min(3, Math.round(b.W / 3.2)));
      for (let i = 0; i < n; i++) {
        const uw = b.W / n, w = Math.min(uw * 0.7, rnd(0.9, 1.7));
        const u0 = i * uw + (uw - w) / 2;
        units.push({ u0, u1: u0 + w, y0: fy + 0.85, y1: fy + 0.85 + rnd(0.9, 1.25), mull: rr() < 0.7 ? 2 : 1, cover: pick(['curtain', 'curtain', 'frosted', 'none']), grille: rr() < 0.35, hood: rr() < 0.6 });
      }
    }
    for (const w of units) {
      const lit = rr() < (b.win === 'office' ? 0.55 : 0.5) && !(w.cover === 'frosted' && rr() < 0.5);
      const vinyl = b.vinyl && kind === 'office' && f < 3 && rr() < 0.7 ? pick(TX.windows) : null;
      paintWindow(A, X(w.u0), Y(w.y1), (w.u1 - w.u0) * ppm, (w.y1 - w.y0) * ppm, {
        ppm, frame, lit, cool: rr() < coolBias, bright: rnd(0.75, 1.15), cover: w.cover, mullion: w.mull, transom: w.transom, grille: w.grille, vinyl,
      }, rr);
      wins.push({ ...w, lit, floor: f });
      // rain streaks under sills
      if (rr() < 0.8) stain(c, X(w.u0 + 0.05), Y(w.y0), (w.u1 - w.u0 - 0.1) * ppm, rnd(0.3, 1.6) * ppm, rnd(0.08, 0.2));
    }
  }
  // streaks from the roof line, grime, repair patches, cable runs
  for (let k = 0; k < b.W / 1.5; k++) stain(c, X(rnd(0, b.W)), r.y, rnd(0.05, 0.25) * ppm, rnd(1, hUp * 0.7) * ppm, rnd(0.05, 0.14));
  if (chance(0.5)) { c.fillStyle = `rgba(255,255,255,${rnd(0.04, 0.09)})`; c.fillRect(X(rnd(0, b.W * 0.7)), Y(rnd(b.gh + 1, b.H - 1)), rnd(0.6, 2) * ppm, rnd(0.4, 1.4) * ppm); }
  c.strokeStyle = 'rgba(20,20,20,0.7)'; c.lineWidth = Math.max(1, ppm * 0.025);
  for (let k = 0; k < 2; k++) { const u = rnd(0.2, b.W - 0.2); c.beginPath(); c.moveTo(X(u), Y(b.gh + rnd(2, 4.5))); c.lineTo(X(u + rnd(-0.4, 0.4)), Y(b.gh)); c.stroke(); }
  // building name plate
  if (b.plate != null) {
    const t = TX.plates[b.plate % TX.plates.length];
    const pw = Math.min(b.W * 0.5, t.length * 0.32), ph = 0.34;
    const px = X(b.W - pw - 0.5), py = Y(b.H - 0.35);
    drawText(c, t, px, py, pw * ppm, ph * ppm, { fam: 'gothic', weight: 700, color: '#d8d2c0', align: 'right' });
    drawText(e, t, px, py, pw * ppm, ph * ppm, { fam: 'gothic', weight: 700, color: '#3a3328', align: 'right' });
  }
  if (b.mahjong) {
    const w = wins.find(w => w.floor === 0);
    if (w) { drawText(c, TX.mahjong, X(w.u0), Y(w.y1 - 0.25), (w.u1 - w.u0) * ppm, 0.6 * ppm, { fam: 'gothic', weight: 900, color: '#e8452c' }); drawText(e, TX.mahjong, X(w.u0), Y(w.y1 - 0.25), (w.u1 - w.u0) * ppm, 0.6 * ppm, { fam: 'gothic', weight: 900, color: '#a02010' }); }
  }
  if (b.id === 'E6') {
    const w = wins.find(w => w.floor === 0);
    if (w) {
      drawText(c, TX.hero.photo, X(w.u0), Y(w.y1 - 0.3), (w.u1 - w.u0) * ppm, 0.45 * ppm, { fam: 'mincho', weight: 800, color: '#d9b45a' });
      drawText(e, TX.hero.photo, X(w.u0), Y(w.y1 - 0.3), (w.u1 - w.u0) * ppm, 0.45 * ppm, { fam: 'mincho', weight: 800, color: '#000' });
    }
  }
  b.wins = wins;
  return r;
}

// Exposed side wall: stair windows, pipes, an occasional painted advert.
function paintSide(b, depth, isCorner, ad) {
  const A = ATL.fac, ppm = isCorner ? b.ppm * 0.8 : Math.max(12, b.ppm * 0.5);
  const r = A.alloc(depth * ppm, b.H * ppm);
  const c = A.ctx, e = A.e;
  const X = u => r.x + u * ppm, Y = y => r.y + (b.H - y) * ppm;
  wallFill(c, r.x, r.y, r.w, r.h, b.wall, b.style === 'copper' ? 'mortar' : b.style, ppm);
  c.fillStyle = 'rgba(0,0,0,0.1)'; c.fillRect(r.x, r.y, r.w, r.h);
  const rr = RNG;
  if (isCorner) {
    for (let f = 0; f < b.floors; f++) {
      const fy = b.gh + f * b.fh, n = Math.max(1, Math.round(depth / 3.4));
      for (let i = 0; i < n; i++) {
        const uw = depth / n, u0 = i * uw + uw * 0.18;
        paintWindow(A, X(u0), Y(fy + 2.2), uw * 0.64 * ppm, 1.35 * ppm, { ppm, frame: '#9a9ea0', lit: rr() < 0.5, cool: rr() < 0.6, bright: rnd(0.8, 1.1), cover: pick(['blinds', 'curtain', 'none']), mullion: 2 }, rr);
      }
    }
  } else {
    // stair core: small vertical windows near the back, bathroom windows
    for (let f = 0; f < b.floors; f++) {
      const fy = b.gh + f * b.fh;
      if (rr() < 0.75) paintWindow(A, X(depth * 0.78), Y(fy + 2.0), 0.55 * ppm, 0.9 * ppm, { ppm, frame: '#9a9ea0', lit: rr() < 0.6, cool: true, bright: 0.7, cover: 'frosted', grille: true, mullion: 1 }, rr);
      if (rr() < 0.4) paintWindow(A, X(rnd(1, depth * 0.5)), Y(fy + 1.9), 0.5 * ppm, 0.5 * ppm, { ppm, frame: '#9a9ea0', lit: rr() < 0.5, cool: true, bright: 0.6, cover: 'frosted', mullion: 1 }, rr);
    }
    // vertical pipes
    c.fillStyle = 'rgba(200,200,195,0.6)';
    for (let k = 0; k < 2; k++) { const u = rnd(0.3, depth - 0.3); c.fillRect(X(u), r.y, Math.max(2, ppm * 0.08), r.h); }
  }
  for (let k = 0; k < depth; k++) stain(c, X(rnd(0, depth)), r.y, rnd(0.05, 0.3) * ppm, rnd(2, b.H * 0.8) * ppm, rnd(0.05, 0.15));
  if (ad === 'beer') {
    // a faded painted advert facing the parking lot
    const ax = X(1.0), ay = Y(b.H - 1.2), aw = (depth - 2) * ppm, ah = (b.H - b.gh - 2.2) * ppm;
    c.fillStyle = '#1d3047'; c.fillRect(ax, ay, aw, ah);
    const g = c.createLinearGradient(ax, ay, ax, ay + ah); g.addColorStop(0, 'rgba(255,190,90,0.0)'); g.addColorStop(1, 'rgba(255,190,90,0.25)'); c.fillStyle = g; c.fillRect(ax, ay, aw, ah);
    // a glass of lager
    const gx = ax + aw * 0.08, gw = aw * 0.22, gy = ay + ah * 0.18, gh2 = ah * 0.68;
    c.fillStyle = '#e6a531'; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + gw, gy); c.lineTo(gx + gw * 0.88, gy + gh2); c.lineTo(gx + gw * 0.12, gy + gh2); c.fill();
    c.fillStyle = '#f4efe4'; c.fillRect(gx - gw * 0.03, gy - gh2 * 0.14, gw * 1.06, gh2 * 0.16);
    drawVText(c, TX.bigAd, ax + aw * 0.38, ay + ah * 0.06, aw * 0.3, ah * 0.86, { fam: 'heavy', color: '#f4efe4' });
    drawVText(c, TX.bigAdSub, ax + aw * 0.72, ay + ah * 0.2, aw * 0.14, ah * 0.6, { fam: 'gothic', weight: 700, color: '#e6a531' });
    c.fillStyle = 'rgba(200,200,200,0.18)'; for (let k = 0; k < 300; k++) c.fillRect(ax + rr() * aw, ay + rr() * ah, rr() * 6, rr() * 3);
  } else if (ad === 'pawn') {
    const ax = X(depth * 0.25), ay = Y(b.H - 1.0), aw = depth * 0.5 * ppm, ah = (b.H - 3.0) * ppm;
    c.fillStyle = '#efe6d2'; c.fillRect(ax, ay, aw, ah);
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(ax, ay, aw, ah);
    drawVText(c, TX.pawn, ax, ay + ah * 0.05, aw, ah * 0.36, { fam: 'mincho', weight: 800, color: '#7b1b14' });
    drawVText(c, TX.pawnName, ax + aw * 0.2, ay + ah * 0.45, aw * 0.6, ah * 0.5, { fam: 'mincho', weight: 800, color: '#1f1a16' });
  }
  return r;
}

/* ---------- body geometry ---------- */
function buildBuilding(spec) {
  const b = new Bldg(spec);
  paintFacade(b);
  const W = b.W, H = b.H, gh = b.gh, d = b.depth, sb = b.setback;
  const wallCol = new THREE.Color(b.wall);
  const facKey = 'facade', facMat = M.facade;
  const R = b.rect;
  // front (upper floors)
  b.quad(facKey, facMat, [0, gh, -sb], [W, gh, -sb], [W, H, -sb], [0, H, -sb], [R.u0, R.v0, R.u1, R.v1]);
  // band between ground floor and first floor (slab edge) on recessed buildings
  if (sb > 0) b.box('concrete', M.concrete, 0, gh - 0.05, -sb, W, gh + 0.12, 0.02, wallCol.clone().multiplyScalar(0.85));
  // sides
  const sides = [['L', 0], ['R', W]];
  for (const [tag, x] of sides) {
    const exp = b['exp' + tag];
    if (!exp) continue;
    const corner = b['corner' + tag];
    const ad = (b.sideAdSide === tag) ? b.sideAd : null;
    const rS = paintSide(b, d - sb, corner, ad);
    const P = b.pilotis || 0;
    if (!P) {
      if (tag === 'L') b.quad(facKey, facMat, [0, 0, -d], [0, 0, -sb], [0, H, -sb], [0, H, -d], [rS.u0, rS.v0, rS.u1, rS.v1]);
      else b.quad(facKey, facMat, [W, 0, -sb], [W, 0, -d], [W, H, -d], [W, H, -sb], [rS.u0, rS.v0, rS.u1, rS.v1]);
    } else {
      // leave the covered forecourt open at ground level
      const vg = rS.v0 + (rS.v1 - rS.v0) * (gh / H), uP = rS.u0 + (rS.u1 - rS.u0) * ((d - P) / d);
      if (tag === 'L') {
        b.quad(facKey, facMat, [0, gh, -d], [0, gh, 0], [0, H, 0], [0, H, -d], [rS.u0, vg, rS.u1, rS.v1]);
        b.quad(facKey, facMat, [0, 0, -d], [0, 0, -P], [0, gh, -P], [0, gh, -d], [rS.u0, rS.v0, uP, vg]);
      } else {
        b.quad(facKey, facMat, [W, gh, 0], [W, gh, -d], [W, H, -d], [W, H, 0], [rS.u0, vg, rS.u1, rS.v1]);
        b.quad(facKey, facMat, [W, 0, -P], [W, 0, -d], [W, gh, -d], [W, gh, -P], [rS.u1 - (uP - rS.u0), rS.v0, rS.u1, vg]);
      }
    }
  }
  // back wall (procedural windows)
  const pB0 = b.P(W, 0, -d), pB1 = b.P(0, 0, -d), pB2 = b.P(0, H, -d), pB3 = b.P(W, H, -d);
  wallBatch(b.zone).add(pB0, pB1, pB2, pB3, W, H, fract(b.z0 * 0.137 + 0.3), wallCol.clone().multiplyScalar(0.8));
  // roof
  if (b.roof !== 'pitched') {
    const rc = wallCol.clone().lerp(new THREE.Color('#77746e'), 0.75);
    const p0 = b.P(0, H, -sb), p1 = b.P(W, H, -sb), p2 = b.P(W, H, -d), p3 = b.P(0, H, -d);
    STATIC.get('roof', M.roof, { colors: true }, b.zone).addQuad(p0, p1, p2, p3, [p0.x / 4, p0.z / 4, p2.x / 4, p2.z / 4], rc);
  }
  // collider & minimap footprint
  const c0 = b.P(0, 0, 0.0), c1 = b.P(W, H, -d);
  const box = (a, c, y0, y1) => new THREE.Box3(V3(Math.min(a.x, c.x), y0, Math.min(a.z, c.z)), V3(Math.max(a.x, c.x), y1, Math.max(a.z, c.z)));
  if (b.pilotis) COLLIDERS.push(box(b.P(0, 0, -b.pilotis), c1, 0, b.gh), box(c0, c1, b.gh, H + 1.2));   // the covered forecourt is open air
  else COLLIDERS.push(box(c0, c1, 0, H + 1.2));
  MAP_BLOCKS.push({ x0: Math.min(c0.x, c1.x), x1: Math.max(c0.x, c1.x), z0: Math.min(c0.z, c1.z), z1: Math.max(c0.z, c1.z), h: H });

  facadeDetails(b);
  if (b.roof === 'pitched') pitchedRoof(b);
  else if (b.roof === 'kanban') kanbanFront(b);
  else roofKit(b);
  if (b.tower) signTower(b);
  if (b.billboard) billboard(b);
  if (b.sideAd === 'stairs') externalStairs(b);
  const shopFn = SHOP[b.shop] || SHOP.generic;
  shopFn(b);
  return b;
}

function facadeDetails(b) {
  const W = b.W, sb = b.setback, wallCol = new THREE.Color(b.wall);
  const sillCol = wallCol.clone().lerp(new THREE.Color('#d8d4cc'), 0.5);
  if (sb > 0) {
    // balconies: slab, frosted panel, rail, partitions, life
    const units = Math.max(1, Math.round(W / 3.6)), uw = W / units;
    const panelCol = pick(['#cfd3d4', '#b6bcc0', '#d8d2c4', '#8f969a']);
    for (let f = 0; f < b.floors; f++) {
      const y = b.gh + f * b.fh;
      b.box('concrete', M.concrete, 0.05, y - 0.04, -sb, W - 0.05, y + 0.12, 0.0, sillCol);
      b.box('paint', M.paint, 0.05, y + 0.12, -0.1, W - 0.05, y + 1.05, -0.04, new THREE.Color(panelCol).multiplyScalar(0.8), { colors: true });
      b.box('metal', M.metal, 0.05, y + 1.05, -0.12, W - 0.05, y + 1.1, -0.02, new THREE.Color('#9fa4a6'), { colors: true });
      for (let i = 1; i < units; i++) b.box('paint', M.paint, i * uw - 0.02, y + 0.12, -sb, i * uw + 0.02, y + 1.9, -0.1, new THREE.Color('#d9d9d4'), { colors: true });
      for (let i = 0; i < units; i++) {
        const u = i * uw;
        if (chance(0.75)) INST.ac.push(b.M(mat(u + uw * 0.8, y + 0.42, -sb + 0.25, 0, 0, 0, 1, 1, 1)));
        if (chance(0.35)) laundry(b, u + uw * 0.15, u + uw * 0.65, y + 1.85, -sb * 0.45);
        if (chance(0.35)) plant(b, u + uw * rnd(0.2, 0.6), y + 0.12, -sb * 0.55, rnd(0.5, 1.1));
      }
    }
    // the balcony smoker's home has a potted maple and a bicycle for the balcony camera foreground
  } else {
    for (const w of b.wins) {
      const z0 = 0;
      b.box('concrete', M.concrete, w.u0 - 0.06, w.y0 - 0.07, z0, w.u1 + 0.06, w.y0 - 0.01, z0 + 0.09, sillCol);
      if (w.hood) b.box('concrete', M.concrete, w.u0 - 0.18, w.y1 + 0.14, z0, w.u1 + 0.18, w.y1 + 0.2, z0 + 0.42, sillCol);
      if (w.lit && chance(0.45) && !b.far) INST.ac.push(b.M(mat(clamp(w.u1 + 0.5, 0.5, W - 0.5), w.y0 - 0.35, 0.18, 0, 0, 0, 1, 1, 1)));
    }
  }
  // drain pipe and meters
  const px = chance(0.5) ? 0.12 : W - 0.12;
  b.add('paint', M.paint, G.cyl8, mat(px, b.H / 2, 0.08, 0, 0, 0, 0.1, b.H, 0.1), new THREE.Color('#9d9a92'), { colors: true });
  if (!b.far) {
    b.box('paint', M.paint, W - 0.75, 1.2, 0.0, W - 0.45, 1.55, 0.12, new THREE.Color('#d7d5cd'), { colors: true });
    b.box('paint', M.paint, W - 0.4, 0.9, 0.0, W - 0.15, 1.25, 0.1, new THREE.Color('#8b8f88'), { colors: true });
  }
}

function laundry(b, x0, x1, y, z) {
  b.add('metal', M.metal, G.cyl6, mat((x0 + x1) / 2, y, z, 0, 0, Math.PI / 2, 0.03, x1 - x0, 0.03), new THREE.Color('#c0c4c6'), { colors: true });
  const cols = ['#f2f0ea', '#3b4b66', '#c9b28e', '#a03a2e', '#e8e4d8', '#6c7a5a', '#25282c', '#d7c7e0'];
  for (let x = x0 + 0.15; x < x1 - 0.1; x += rnd(0.3, 0.5)) {
    const w = rnd(0.22, 0.4), h = rnd(0.35, 0.7);
    STATIC.get('cloth', M.cloth, { colors: true }, b.zone).add(G.plane, b.M(mat(x, y - h / 2 - 0.02, z, 0, 0, 0, w, h, 1)), new THREE.Color(pick(cols)));
  }
}
function plant(b, x, y, z, s) {
  b.add('paint', M.paint, G.cyl12, mat(x, y + 0.14 * s, z, 0, 0, 0, 0.3 * s, 0.28 * s, 0.3 * s), new THREE.Color(pick(['#8a4f32', '#d8d2c4', '#4a4a48', '#3d5a6c'])), { colors: true });
  const greens = ['#2f4a2a', '#3b5b33', '#27402a', '#4a6a3a'];
  for (let k = 0; k < 4; k++) b.add('leaf', M.leaf, G.sph8, mat(x + rnd(-0.12, 0.12) * s, y + (0.4 + rnd(0, 0.35)) * s, z + rnd(-0.12, 0.12) * s, rnd(0, 6), 0, 0, 0.32 * s, 0.38 * s, 0.32 * s), new THREE.Color(pick(greens)), { colors: true });
}

function roofKit(b) {
  const W = b.W, H = b.H, d = b.depth, sb = b.setback;
  const pc = new THREE.Color(b.wall).multiplyScalar(0.8);
  const ph = 0.75, t = 0.15;
  b.box('concrete', M.concrete, 0, H, -sb - t, W, H + ph, -sb, pc);
  b.box('concrete', M.concrete, 0, H, -d, W, H + ph, -d + t, pc);
  b.box('concrete', M.concrete, 0, H, -d, t, H + ph, -sb, pc);
  b.box('concrete', M.concrete, W - t, H, -d, W, H + ph, -sb, pc);
  if (b.far && chance(0.4)) return;
  // stair house
  if (b.floors >= 3 && W > 4.5) {
    const sx = chance(0.5) ? rnd(0.4, 1.2) : W - rnd(2.8, 3.4), sz = -d + rnd(0.6, 2);
    b.box('concrete', M.concrete, sx, H, sz, sx + 2.4, H + 2.6, sz + 2.8, pc.clone().multiplyScalar(1.05));
    b.box('paint', M.paint, sx + 0.7, H, sz + 2.8, sx + 1.6, H + 2.0, sz + 2.84, new THREE.Color('#5d6466'), { colors: true });
    b.add('glowc', M.glow, G.box, mat(sx + 1.15, H + 2.25, sz + 2.9, 0, 0, 0, 0.26, 0.11, 0.12), hdr(5.5, 4.6, 3.2), { colors: true });   // the lamp over the stair door
  }
  if (b.tank || chance(0.35)) {
    const tx = rnd(1.2, W - 1.2), tz = -d * rnd(0.35, 0.7);
    for (const [ox, oz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) b.box('metal', M.metal, tx + ox - 0.05, H, tz + oz - 0.05, tx + ox + 0.05, H + 1.1, tz + oz + 0.05, new THREE.Color('#6f7476'), { colors: true });
    b.add('paint', M.paint, G.cyl16, mat(tx, H + 1.1 + 0.8, tz, 0, 0, 0, 1.7, 1.6, 1.7), new THREE.Color(pick(['#d9d6cf', '#c9d3d6', '#a9b6aa'])), { colors: true });
  }
  const nAC = rndi(1, Math.max(2, Math.floor(W * d / 30)));
  for (let k = 0; k < nAC; k++) INST.acRoof.push(b.M(mat(rnd(0.8, W - 0.8), H + 0.32, -rnd(sb + 0.8, d - 0.8), rndi(0, 3) * Math.PI / 2, 0, 0, 1, 1, 1)));
  if (chance(0.55)) {
    // TV antenna
    const ax = rnd(0.5, W - 0.5), az = -rnd(sb + 1, d - 1), ah = rnd(2.5, 4);
    b.add('metal', M.metal, G.cyl6, mat(ax, H + ah / 2, az, 0, 0, 0, 0.04, ah, 0.04), new THREE.Color('#8b8f91'), { colors: true });
    const ry = rnd(0, TAU);
    b.add('metal', M.metal, G.cyl6, mat(ax, H + ah - 0.2, az, ry, 0, Math.PI / 2, 0.025, 1.4, 0.025), new THREE.Color('#8b8f91'), { colors: true });
    for (let i = 0; i < 6; i++) {
      const o = -0.6 + i * 0.24;
      b.add('metal', M.metal, G.cyl6, mat(ax + Math.cos(ry) * o, H + ah - 0.2, az - Math.sin(ry) * o, ry + Math.PI / 2, 0, Math.PI / 2, 0.012, 0.5 - i * 0.04, 0.012), new THREE.Color('#8b8f91'), { colors: true });
    }
  }
}

function pitchedRoof(b) {
  const W = b.W, H = b.H, d = b.depth;
  const ov = 0.5, rise = 1.7, zr = -d / 2;
  const tile = new THREE.Color('#5a5e63');
  const key = 'kawara';
  // front and back slopes
  b.quad(key, M.kawara, [-0.25, H, ov], [W + 0.25, H, ov], [W + 0.25, H + rise, zr], [-0.25, H + rise, zr], [0, 0, W / 1.2, (d / 2 + ov) / 1.2], tile, { colors: true });
  b.quad(key, M.kawara, [W + 0.25, H, -d - ov], [-0.25, H, -d - ov], [-0.25, H + rise, zr], [W + 0.25, H + rise, zr], [0, 0, W / 1.2, (d / 2 + ov) / 1.2], tile, { colors: true });
  // undersides (eaves) so the roof reads from below
  b.quad('wood', M.wood, [W + 0.25, H - 0.02, ov], [-0.25, H - 0.02, ov], [-0.25, H - 0.02, 0], [W + 0.25, H - 0.02, 0], [0, 0, 2, 0.3], new THREE.Color('#5a4434'), { colors: true });
  b.add('paint', M.paint, G.box, mat(W / 2, H + rise + 0.06, zr, 0, 0, 0, W + 0.6, 0.16, 0.26), new THREE.Color('#3c4044'), { colors: true });
  // gable ends
  const wc = new THREE.Color(b.wall).multiplyScalar(0.85);
  for (const x of [0, W]) {
    const g = new THREE.BufferGeometry();
    const pts = x === 0 ? [[0, H, -d], [0, H, 0], [0, H + rise, zr]] : [[W, H, 0], [W, H, -d], [W, H + rise, zr]];
    const wp = pts.map(p => b.P(...p));
    g.setAttribute('position', new THREE.Float32BufferAttribute(wp.flatMap(p => [p.x, p.y, p.z]), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    g.computeVertexNormals();
    STATIC.get('paint', M.paint, { colors: true }, b.zone).add(g, null, wc);
  }
  // small tiled eave over the shopfront
  b.quad(key, M.kawara, [-0.1, b.gh + 0.05, 0.85], [W + 0.1, b.gh + 0.05, 0.85], [W + 0.1, b.gh + 0.5, 0.0], [-0.1, b.gh + 0.5, 0.0], [0, 0, W / 1.2, 0.7], tile, { colors: true });
  b.quad('wood', M.wood, [W + 0.1, b.gh + 0.03, 0.85], [-0.1, b.gh + 0.03, 0.85], [-0.1, b.gh + 0.03, 0], [W + 0.1, b.gh + 0.03, 0], [0, 0, 2, 0.3], new THREE.Color('#4a3a2c'), { colors: true });
}

function kanbanFront(b) {
  // shitamachi "signboard architecture": a flat copper false front rising above the roof line
  const W = b.W, H = b.H;
  b.box('paint', M.paintGloss, 0, H, -0.25, W, H + 1.3, 0.0, new THREE.Color(b.wall).multiplyScalar(0.9), { colors: true });
  b.box('paint', M.paintGloss, -0.1, H + 1.3, -0.3, W + 0.1, H + 1.45, 0.12, new THREE.Color('#3f5a50'), { colors: true });
  b.box('paint', M.paintGloss, -0.05, b.gh + 0.1, -0.1, W + 0.05, b.gh + 0.22, 0.1, new THREE.Color('#3f5a50'), { colors: true });
  // pitched roof behind the false front
  const d = b.depth, rise = 1.4;
  b.quad('kawara', M.kawara, [0, H, -0.3], [W, H, -0.3], [W, H + rise, -d / 2], [0, H + rise, -d / 2], [0, 0, W / 1.2, d / 2.4], new THREE.Color('#5a5e63'), { colors: true });
  b.quad('kawara', M.kawara, [W, H, -d], [0, H, -d], [0, H + rise, -d / 2], [W, H + rise, -d / 2], [0, 0, W / 1.2, d / 2.4], new THREE.Color('#5a5e63'), { colors: true });
}

/* ---------- vertical tenant sign towers ---------- */
const TENANT_STYLE = [
  { bg: '#f4f0e6', fg: '#16233c', fam: 'gothic' }, { bg: '#1b2a4a', fg: '#f6f2e8', fam: 'gothic' }, { bg: '#7a1420', fg: '#fbe9c6', fam: 'mincho' },
  { bg: '#f2d23c', fg: '#1a1a1a', fam: 'heavy' }, { bg: '#0f0f12', fg: '#ff7fb0', fam: 'mincho' }, { bg: '#e8eef2', fg: '#0d4f8c', fam: 'gothic' },
  { bg: '#2b6a45', fg: '#f1f3ea', fam: 'gothic' }, { bg: '#fdfaf2', fg: '#b3121e', fam: 'mincho' }, { bg: '#13202c', fg: '#7fe0ff', fam: 'gothic' },
  { bg: '#ead9b6', fg: '#3a2416', fam: 'brush' }, { bg: '#ffffff', fg: '#e5502e', fam: 'round' },
];
function signTower(b) {
  const A = ATL.sign, ppm = 90 * QUALITY.atlas;
  const panels = b.tower.panels.slice(0, b.floors);
  const y0 = b.gh + 0.4, y1 = b.H - 0.25, h = y1 - y0, w = 0.74;
  const r = A.alloc(w * ppm, h * ppm), c = A.ctx;
  const ph = h / panels.length;
  panels.forEach((pi, i) => {
    const t = TX.tenants[pi % TX.tenants.length];
    const st = TENANT_STYLE[(((pi * 7 + Math.round(b.z0 * 3)) % TENANT_STYLE.length) + TENANT_STYLE.length) % TENANT_STYLE.length];
    const py = r.y + i * ph * ppm, pw = r.w, phh = ph * ppm;
    const vacant = t === 'テナント募集';
    c.fillStyle = vacant ? '#e9e6dd' : st.bg; c.fillRect(r.x, py, pw, phh);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(r.x, py + phh - 3, pw, 3);
    const label = t.replace(' ', '');
    drawVText(c, label, r.x + pw * 0.08, py + phh * 0.06, pw * 0.84, phh * 0.88, { fam: vacant ? 'gothic' : st.fam, weight: 700, color: vacant ? '#c0392b' : st.fg });
  });
  const x = b.W * b.tower.at;
  const geo = atlasBoxFaces({ px: r, nx: r });
  STATIC.get('signs', M.signs, {}, b.zone).add(geo, b.M(mat(x, (y0 + y1) / 2, 0.45, 0, 0, 0, 0.26, h, 0.7)));
  b.box('metal', M.metal, x - 0.15, y0 - 0.12, 0.05, x + 0.15, y0, 0.85, new THREE.Color('#3a3d40'), { colors: true });
  b.box('metal', M.metal, x - 0.15, y1, 0.05, x + 0.15, y1 + 0.12, 0.85, new THREE.Color('#3a3d40'), { colors: true });
  const wp = b.P(x, 0, 0.6);
  addLight2D(wp.x, wp.z, 5, '#ffd6b0', 0.25);
  SIGN_GLOWS.push({ p: b.P(x, (y0 + y1) / 2, 0.6), size: h * 0.55, color: new THREE.Color('#ffd9c0').multiplyScalar(0.06) });
}

function billboard(b) {
  const A = ATL.sign, ppm = 40 * QUALITY.atlas;
  const w = Math.min(b.W - 0.6, 7.5), h = 3.2;
  const r = A.alloc(w * ppm, h * ppm), c = A.ctx;
  const kind = b.id === 'W10' ? 'beer' : b.id === 'E12' ? 'abacus' : b.id === 'E8' ? 'radio' : pick(['beer', 'clinic', 'radio']);
  if (kind === 'beer') {
    const g = c.createLinearGradient(r.x, r.y, r.x, r.y + r.h); g.addColorStop(0, '#0d1a33'); g.addColorStop(1, '#25406b'); c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
    c.fillStyle = '#f1b43c'; c.beginPath(); c.arc(r.x + r.w * 0.82, r.y + r.h * 0.45, r.h * 0.32, 0, TAU); c.fill();
    drawText(c, TX.screen[0], r.x + r.w * 0.05, r.y + r.h * 0.12, r.w * 0.6, r.h * 0.5, { fam: 'heavy', color: '#f6f1e6' });
    drawText(c, 'YOZORA LAGER', r.x + r.w * 0.05, r.y + r.h * 0.64, r.w * 0.6, r.h * 0.22, { fam: 'latin', weight: 600, color: '#f1b43c', letter: 0.15 });
  } else if (kind === 'abacus') {
    c.fillStyle = '#fdf8ec'; c.fillRect(r.x, r.y, r.w, r.h);
    c.fillStyle = '#d43d2a'; c.fillRect(r.x, r.y + r.h * 0.78, r.w, r.h * 0.22);
    drawText(c, TX.tenants[10], r.x + r.w * 0.05, r.y + r.h * 0.1, r.w * 0.9, r.h * 0.58, { fam: 'round', color: '#1d3557' });
    drawText(c, '03-3333-1004', r.x, r.y + r.h * 0.78, r.w, r.h * 0.22, { fam: 'latin', weight: 600, color: '#fff' });
  } else if (kind === 'clinic') {
    c.fillStyle = '#e9f1f4'; c.fillRect(r.x, r.y, r.w, r.h);
    c.fillStyle = '#2a7f62'; c.fillRect(r.x, r.y, r.w * 0.2, r.h);
    drawText(c, TX.poleAds[0], r.x + r.w * 0.24, r.y + r.h * 0.15, r.w * 0.72, r.h * 0.5, { fam: 'gothic', weight: 900, color: '#1b3a4b' });
    drawText(c, TX.poleAds[1], r.x + r.w * 0.24, r.y + r.h * 0.65, r.w * 0.72, r.h * 0.25, { fam: 'gothic', weight: 700, color: '#2a7f62' });
  } else {
    c.fillStyle = '#111'; c.fillRect(r.x, r.y, r.w, r.h);
    drawText(c, 'TOKYO NIGHT RADIO 81.3', r.x + r.w * 0.05, r.y + r.h * 0.25, r.w * 0.9, r.h * 0.5, { fam: 'latin', weight: 600, color: '#ff8a3d', letter: 0.08 });
  }
  const H = b.H, zf = -b.setback - 1.0;
  const x0 = (b.W - w) / 2;
  STATIC.get('signs', M.signsDim, {}, b.zone).add(atlasPlane(r), b.M(mat(b.W / 2, H + 1.4 + h / 2, zf + 0.06, 0, 0, 0, w, h, 1)));
  b.box('metal', M.metal, x0 - 0.1, H + 1.3, zf - 0.1, x0 + w + 0.1, H + 1.42 + h + 0.1, zf, new THREE.Color('#2b2e31'), { colors: true });
  for (const fx of [0.2, 0.5, 0.8]) {
    b.box('metal', M.metal, x0 + w * fx - 0.06, H, zf - 0.8, x0 + w * fx + 0.06, H + 1.4, zf - 0.68, new THREE.Color('#2b2e31'), { colors: true });
    b.add('glowc', M.glow, G.box, mat(x0 + w * fx, H + 1.25, zf + 0.35, 0, 0, 0, 0.18, 0.1, 0.12), hdr(6, 5.5, 4.6), { colors: true });
  }
}

function externalStairs(b) {
  // steel fire stair on the exposed side wall (faces the parking lot)
  const x = b.sgn > 0 ? 0 : b.W; // the side toward -z
  const dirX = x === 0 ? -1 : 1;
  const col = new THREE.Color('#5b5f5c');
  for (let f = 0; f < b.floors; f++) {
    const y = b.gh + f * b.fh;
    b.box('metal', M.metal, x + dirX * 0.05, y - 0.06, -b.depth + 1.0, x + dirX * 1.2, y + 0.04, -b.depth + 3.6, col, { colors: true });
    b.box('metal', M.metal, x + dirX * 1.15, y + 0.04, -b.depth + 1.0, x + dirX * 1.2, y + 1.1, -b.depth + 3.6, col, { colors: true });
    // flight
    const steps = 9;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      b.box('metal', M.metal, x + dirX * 0.1, y - b.fh + b.fh * t, -b.depth + 3.6 + 0.0 - (1 - t) * 0, x + dirX * 1.1, y - b.fh + b.fh * t + 0.04, -b.depth + 3.6 + 0.28, col, { colors: true });
    }
  }
}

/* ---------- atlas box with per-face rects ---------- */
function atlasBoxFaces(rects) {
  const g = G.box.clone();
  const uv = g.attributes.uv;
  const order = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
  const fallback = rects.px || rects.pz;
  for (let f = 0; f < 6; f++) {
    const rr = rects[order[f]];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      let u = uv.getX(i), v = uv.getY(i);
      if (!rr) { u = 0.02; v = 0.02; }
      const R = rr || fallback;
      uv.setXY(i, R.u0 + u * (R.u1 - R.u0), R.v0 + v * (R.v1 - R.v0));
    }
  }
  return g;
}

/* ---------- neighbours: which side walls are visible ---------- */
function computeExposure(list) {
  for (const side of ['W', 'E']) {
    const arr = list.filter(b => b.side === side).sort((a, b) => a.z0 - b.z0);
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      const south = arr[i - 1], north = arr[i + 1];
      const H = b.gh + b.floors * b.fh;
      const hs = south && Math.abs(south.z1 - b.z0) < 0.6 ? south.gh + south.floors * south.fh : -1;
      const hn = north && Math.abs(north.z0 - b.z1) < 0.6 ? north.gh + north.floors * north.fh : -1;
      const expS = hs < H - 0.5, expN = hn < H - 0.5;
      // local left is south on the east side, north on the west side
      b.expL = side === 'E' ? expS : expN;
      b.expR = side === 'E' ? expN : expS;
      const cornerS = b.corner === 'S', cornerN = b.corner === 'N';
      b.cornerL = side === 'E' ? cornerS : cornerN;
      b.cornerR = side === 'E' ? cornerN : cornerS;
      if (b.sideAd) {
        // adverts go on the north-facing wall for 'beer' (faces the parking lot), the south wall otherwise
        const wantNorth = b.sideAd === 'beer' || b.sideAd === 'pawn';
        b.sideAdSide = side === 'E' ? (wantNorth ? 'R' : 'L') : (wantNorth ? 'L' : 'R');
      }
    }
  }
}
