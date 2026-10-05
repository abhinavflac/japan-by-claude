/* ============================================================
   Shops. Each builder works in its building's local frame:
   x along the facade (0..W, left to right seen from the street),
   y up, z toward the street (facade at z = 0, interior z < 0).
   ============================================================ */

const SHOP = {};

function setupAtlases() {
  const s = QUALITY.atlas;
  ATL.fac = new FacadeAtlas(4096 * s, 4096 * s);
  ATL.sign = new Atlas(4096 * s, 4096 * s, 1, 'sign');
  TEX.facC = canvasTex(ATL.fac.canvases[0]);
  TEX.facE = canvasTex(ATL.fac.ec);
  TEX.facR = canvasTex(ATL.fac.rc, { srgb: false });
  TEX.sign = canvasTex(ATL.sign.canvases[0]);
}
function finishAtlases() {
  for (const k of ['facC', 'facE', 'facR', 'sign']) TEX[k].needsUpdate = true;
  for (const a of [ATL.fac, ATL.sign]) console.log(`atlas ${a.name}: used ${(a.used / (a.w * a.h) * 100).toFixed(0)}% area, shelves to y=${a.bottom}/${a.h}, ${a.shelves.length} shelves${a.full ? ' (overflowed)' : ''}`);
}

function paintKawara() {
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#6b7075'; g.fillRect(0, 0, S, S);
  for (let row = 0; row < 8; row++) {
    for (let x = 0; x < S; x += 32) {
      const gr = g.createLinearGradient(x, 0, x + 32, 0);
      gr.addColorStop(0, '#3e4246'); gr.addColorStop(0.5, '#8b9095'); gr.addColorStop(1, '#3e4246');
      g.fillStyle = gr; g.fillRect(x, row * 32, 32, 30);
    }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, row * 32 + 28, S, 4);
  }
  TEX.kawara = canvasTex(c, { repeat: true });
}

function buildAtlasMaterials() {
  M.facade = std({ map: TEX.facC, emissiveMap: TEX.facE, emissive: 0xffffff, emissiveIntensity: 2.3, roughnessMap: TEX.facR, roughness: 1.0, metalness: 0, envMapIntensity: 0.9 });
  M.signs = basic({ map: TEX.sign, color: hdr(3.0, 3.0, 3.0) });
  M.signsHot = basic({ map: TEX.sign, color: hdr(4.4, 4.4, 4.4) });
  M.signsDim = basic({ map: TEX.sign, color: hdr(1.05, 1.05, 1.05) });
  M.print = std({ map: TEX.sign, roughness: 0.7 });
  M.interior = basic({ map: TEX.sign, vertexColors: true });
  M.decal = basic({ map: TEX.sign, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true });
  M.noren = std({ map: TEX.sign, side: THREE.DoubleSide, roughness: 0.9 }, { wind: { amp: 0.05, seed: 1 } });
  M.cloth = std({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95 }, { wind: { amp: 0.06, seed: 3 } });
  M.leaf = std({ vertexColors: true, roughness: 0.8, envMapIntensity: 0.3 });
  M.kawara = std({ map: TEX.kawara, vertexColors: true, roughness: 0.55, envMapIntensity: 0.8 }, { lfHeight: 0.15 });
  M.neon = basic({ vertexColors: true, toneMapped: false });
  M.tileFloor = std({ map: TEX.concrete, vertexColors: true, roughness: 0.45, envMapIntensity: 0.6 });
  M.roadDecal = std({ map: TEX.sign, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.45, vertexColors: true, envMapIntensity: 0.5 });
}

/* ---------- shared storefront pieces ---------- */
function shopShell(b, o = {}) {
  const W = b.W, gh = b.gh;
  const rec = o.recess == null ? 0.22 : o.recess;
  const depth = o.depth || Math.min(b.depth - 1, 5.5);
  const fh = o.fasciaH == null ? 0.78 : o.fasciaH;
  const top = gh - fh;
  const pil = o.pillar == null ? 0.28 : o.pillar;
  const x0 = o.x0 == null ? pil : o.x0, x1 = o.x1 == null ? W - pil : o.x1;
  const wallCol = new THREE.Color(o.wallColor || b.wall);
  if (!o.noPillars) {
    b.box('concrete', M.concrete, 0, 0, -rec - 0.06, pil, gh, 0.03, wallCol);
    b.box('concrete', M.concrete, W - pil, 0, -rec - 0.06, W, gh, 0.03, wallCol);
  }
  if (fh > 0) {
    b.box('concrete', M.concrete, 0, top, -rec - 0.05, W, gh, 0.06, wallCol.clone().multiplyScalar(0.72));
    if (o.fascia) {
      const fx0 = o.fx0 == null ? pil + 0.05 : o.fx0, fx1 = o.fx1 == null ? W - pil - 0.05 : o.fx1;
      const mat_ = o.fasciaMat || M.signs;
      STATIC.get(mat_ === M.print ? 'print' : mat_ === M.signsDim ? 'signsDim' : mat_ === M.signsHot ? 'signsHot' : 'signs', mat_, {}, b.zone)
        .add(atlasPlane(o.fascia), b.M(mat((fx0 + fx1) / 2, top + fh / 2, 0.075, 0, 0, 0, fx1 - fx0, fh - 0.1, 1)));
      SIGN_GLOWS.push({ p: b.P((fx0 + fx1) / 2, top + fh / 2, 0.4), size: (fx1 - fx0) * 0.7, color: new THREE.Color(o.glow || '#ffffff').multiplyScalar(0.035) });
    }
  }
  const bulk = o.bulk == null ? 0.35 : o.bulk;
  if (!o.noGlass) {
    const gy0 = 0.15 + bulk;
    if (bulk > 0.05) b.box('concrete', M.concrete, x0, 0, -rec - 0.04, x1, gy0, -rec + 0.04, wallCol.clone().multiplyScalar(0.6));
    STATIC.get('glass', M.glass, { renderOrder: 2 }, b.zone).add(G.plane, b.M(mat((x0 + x1) / 2, (gy0 + top) / 2, -rec, 0, 0, 0, x1 - x0, top - gy0, 1)));
    const fc = new THREE.Color(o.frame || '#9fa4a7');
    const n = Math.max(1, Math.round((x1 - x0) / (o.mull || 1.8)));
    for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; b.box('metal', M.metal, x - 0.025, gy0, -rec - 0.03, x + 0.025, top, -rec + 0.03, fc); }
    b.box('metal', M.metal, x0, top - 0.05, -rec - 0.03, x1, top, -rec + 0.03, fc);
    b.box('metal', M.metal, x0, gy0, -rec - 0.03, x1, gy0 + 0.04, -rec + 0.03, fc);
  }
  if (o.interior) {
    const k = o.bright || 1.4;
    const tint = new THREE.Color(o.tint || '#ffffff').multiplyScalar(k);
    const iw = x1 - x0, ih = top - 0.16;
    const rect = typeof o.interior === 'string' ? paintInterior(o.interior, iw, ih + 0.6) : o.interior;
    STATIC.get('interior', M.interior, { noRefl: true, colors: true }, b.zone).add(atlasPlane(rect), b.M(mat((x0 + x1) / 2, 0.16 + (ih + 0.6) / 2, -depth, 0, 0, 0, iw, ih + 0.6, 1)), tint);
    const fl = new THREE.Color(o.floor || '#3a3430').multiplyScalar(k * 0.5);
    b.quad('glowc', M.glow, [x0, 0.16, -rec - 0.02], [x1, 0.16, -rec - 0.02], [x1, 0.16, -depth], [x0, 0.16, -depth], null, fl, { noRefl: true });
    const ce = new THREE.Color(o.ceil || '#fff6e8').multiplyScalar(k * 1.1);
    b.quad('glowc', M.glow, [x0, top + 0.5, -depth], [x1, top + 0.5, -depth], [x1, top + 0.5, -rec], [x0, top + 0.5, -rec], null, ce, { noRefl: true });
    const sw = new THREE.Color(o.sideWall || '#d8d2c6').multiplyScalar(k * 0.55);
    b.quad('glowc', M.glow, [x0, 0.16, -rec], [x0, 0.16, -depth], [x0, top + 0.5, -depth], [x0, top + 0.5, -rec], null, sw, { noRefl: true });
    b.quad('glowc', M.glow, [x1, 0.16, -depth], [x1, 0.16, -rec], [x1, top + 0.5, -rec], [x1, top + 0.5, -depth], null, sw, { noRefl: true });
    // ceiling fixtures
    const fx = new THREE.Color(o.fixture || '#fff3e0').multiplyScalar(6);
    for (let x = x0 + 0.8; x < x1 - 0.4; x += 1.6) b.box('glowc', M.glow, x - 0.3, top + 0.42, -depth * 0.5 - 0.05, x + 0.3, top + 0.48, -depth * 0.5 + 0.05, fx, { noRefl: true });
  }
  if (o.spill !== false) b.spill(x0, x1, o.spill || '#ffd7a8', o.spillK == null ? 0.8 : o.spillK, o.spillD || 3.2);
  return { rec, depth, top, pil, x0, x1, gh };
}

function awning(b, x0, x1, y, depth, rect, color) {
  // sloped fabric awning with valance
  const drop = depth * 0.45;
  const g = G.plane.clone();
  const len = Math.hypot(depth, drop);
  const m = b.M(mat((x0 + x1) / 2, y - drop / 2, depth / 2, 0, -Math.PI / 2 + Math.atan2(drop, depth), 0, x1 - x0, len, 1));
  if (rect) {
    STATIC.get('print2', M.printDS || (M.printDS = std({ map: TEX.sign, side: THREE.DoubleSide, roughness: 0.8 })), {}, b.zone).add(atlasPlane(rect), m);
  } else {
    STATIC.get('clothS', M.clothS || (M.clothS = std({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 })), { colors: true }, b.zone).add(g, m, new THREE.Color(color || '#7a2a22'));
  }
  b.box('paint', M.paint, x0, y - drop - 0.28, depth - 0.02, x1, y - drop, depth + 0.02, new THREE.Color(color || '#7a2a22').multiplyScalar(0.85));
}

function aFrame(b, x, z, rect, yaw = 0) {
  const h = 0.85, w = 0.52;
  for (const s of [-1, 1]) {
    const m = b.M(mat(x, h / 2, z + s * 0.12, yaw + (s > 0 ? 0 : Math.PI), -0.24, 0, w, h, 1));
    STATIC.get('print', M.print, {}, b.zone).add(atlasPlane(rect), m);
  }
}

function addVending(x, z, yaw, color, seed, zone) {
  const rect = paintVending(color, seed);
  const m = mat(x, 0.15 + 0.915, z, yaw, 0, 0, 1, 1, 1);
  const body = new THREE.Color(color);
  STATIC.get('paintG', M.paintGloss, { colors: true }, zone).add(G.box, new THREE.Matrix4().multiplyMatrices(m, mat(0, 0, -0.02, 0, 0, 0, 1.0, 1.83, 0.72)), body);
  STATIC.get('vend', M.vend || (M.vend = basic({ map: TEX.sign, color: hdr(1.7, 1.7, 1.7) })), {}, zone).add(atlasPlane(rect), new THREE.Matrix4().multiplyMatrices(m, mat(0, 0, 0.345, 0, 0, 0, 0.98, 1.81, 1)));
  STATIC.get('glowc', M.glow, { colors: true }, zone).add(G.box, new THREE.Matrix4().multiplyMatrices(m, mat(0, 0.98, 0.3, 0, 0, 0, 0.9, 0.05, 0.08)), hdr(5, 5.4, 6));
  const p = V3(0, 0, 1.0).applyAxisAngle(V3(0, 1, 0), yaw);
  addLight2D(x + p.x, z + p.z, 2.6, '#dbe7ff', 0.9);
  VENDING.push({ x, z, yaw });
}
const VENDING = [];

function recyclingBins(b, x, z) {
  b.box('paint', M.paint, x - 0.32, 0.15, z - 0.2, x - 0.02, 0.95, z + 0.2, new THREE.Color('#2f6fb3'));
  b.box('paint', M.paint, x + 0.02, 0.15, z - 0.2, x + 0.32, 0.95, z + 0.2, new THREE.Color('#e8e8e2'));
  b.box('rubberB', M.rubber, x - 0.24, 0.95, z - 0.08, x - 0.1, 0.96, z + 0.08);
  b.box('rubberB', M.rubber, x + 0.1, 0.95, z - 0.08, x + 0.24, 0.96, z + 0.08);
}

function crates(b, x, z, n, color) {
  for (let i = 0; i < n; i++) b.box('paint', M.paint, x - 0.22, 0.15 + i * 0.3, z - 0.18, x + 0.22, 0.43 + i * 0.3, z + 0.18, new THREE.Color(color || pick(['#d9a514', '#c0392b', '#2c6e49'])));
}

function umbrellaStand(b, x, z) {
  b.add('metal', M.metal, G.cyl12, mat(x, 0.15 + 0.3, z, 0, 0, 0, 0.3, 0.6, 0.3), new THREE.Color('#6d7174'));
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    b.add('umbC', M.umbStand || (M.umbStand = std({ color: 0xe8eef0, roughness: 0.2, transparent: true, opacity: 0.45 })), G.cyl6, mat(x + Math.cos(a) * 0.06, 0.15 + 0.62, z + Math.sin(a) * 0.06, a, 0.12, 0.05, 0.09, 0.85, 0.09));
  }
}

/* ---------- shops ---------- */
SHOP.generic = (b) => {
  const kinds = ['default', 'cafe', 'default', 'bar', 'default'];
  const kind = pick(kinds);
  const name = pick(TX.shops);
  const styles = [
    { bg: '#f4efe4', fg: '#2a2622', fam: 'mincho' }, { bg: '#1c1c1e', fg: '#f3d9a4', fam: 'mincho' }, { bg: '#ffffff', fg: '#d02a1e', fam: 'gothic' },
    { bg: '#204a3a', fg: '#f4efe4', fam: 'gothic' }, { bg: '#f7d046', fg: '#222', fam: 'heavy' }, { bg: '#2b3a67', fg: '#fff', fam: 'round' },
  ];
  const st = pick(styles);
  if (chance(0.15)) { SHOP.shutter(b); return; }
  const fascia = paintFascia(name, { w: b.W - 0.6, h: 0.7, bg: st.bg, fg: st.fg, fam: st.fam, ppm: b.far ? 50 : 80 });
  shopShell(b, { fascia, interior: kind, bright: kind === 'bar' ? 1.0 : rnd(1.1, 1.6), spill: kind === 'bar' ? '#ffb070' : pick(['#ffd7a8', '#fff1dc', '#e8f0ff']), spillK: rnd(0.5, 0.9) });
  if (!b.far && chance(0.4)) awning(b, 0.3, b.W - 0.3, b.gh - 0.75, 0.9, null, pick(['#7a2a22', '#2b4a3a', '#33405a', '#6b5a3a']));
};

SHOP.shutter = (b) => {
  const W = b.W, gh = b.gh;
  const wallCol = new THREE.Color(b.wall);
  b.box('concrete', M.concrete, 0, 0, -0.1, 0.3, gh, 0.02, wallCol);
  b.box('concrete', M.concrete, W - 0.3, 0, -0.1, W, gh, 0.02, wallCol);
  const sx1 = W - (W > 5 ? 1.3 : 0.3);
  const q = b.P(0.3, 0, -0.08);
  b.add('shutter', M.shutter, G.box, mat((0.3 + sx1) / 2, (gh - 0.5) / 2, -0.08, 0, 0, 0, sx1 - 0.3, gh - 0.5, 0.05), new THREE.Color('#9fa2a2'));
  b.box('metal', M.metal, 0.2, gh - 0.55, -0.15, sx1 + 0.1, gh - 0.1, 0.12, new THREE.Color('#7d8183'));
  b.box('concrete', M.concrete, 0, gh - 0.1, -0.15, W, gh, 0.06, wallCol.clone().multiplyScalar(0.7));
  if (b.id === 'W2') {
    const r = paintFascia(TX.shutterName, { w: 2.4, h: 0.6, bg: '#9fa2a2', fg: '#f2f0ea', fam: 'mincho', weight: 800 });
    STATIC.get('print', M.print, {}, b.zone).add(atlasPlane(r), b.M(mat((0.3 + sx1) / 2, gh - 1.3, -0.04, 0, 0, 0, 2.4, 0.6, 1)));
  }
  if (W > 5) {
    // residence door beside the shutter, with a lit frosted window and a mailbox
    b.box('wood', M.wood, sx1 + 0.15, 0.15, -0.12, W - 0.35, 2.2, -0.06, new THREE.Color('#6d5844'));
    b.box('glowc', M.glow, sx1 + 0.35, 1.3, -0.07, W - 0.55, 1.9, -0.05, hdr(1.6, 1.3, 0.9));
    b.box('paint', M.paint, sx1 + 0.3, 1.0, -0.05, sx1 + 0.6, 1.25, 0.06, new THREE.Color('#c23b2a'));
    b.box('glowc', M.glow, sx1 + 0.4, 2.3, -0.05, sx1 + 0.6, 2.4, 0.08, hdr(4, 3.6, 3));
    b.light(W - 0.8, 0.5, 1.8, '#ffd7a8', 0.4);
  }
  if (b.id === 'W2') {
    // garbage station: crow net over bags, rules sign
    const gx = 1.0;
    for (let i = 0; i < 5; i++) b.add('bagM', M.bag || (M.bag = std({ color: 0xe8e8e0, roughness: 0.25, transparent: true, opacity: 0.85, envMapIntensity: 1 })), G.sph8, mat(gx + rnd(-0.35, 0.35), 0.15 + 0.22, 0.35 + rnd(-0.1, 0.15), rnd(0, 3), 0, 0, 0.45, 0.42, 0.38));
    STATIC.get('net', M.net || (M.net = std({ color: 0x2a7a3a, roughness: 0.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide })), {}, b.zone).add(G.sph12, b.M(mat(gx, 0.15 + 0.15, 0.35, 0, 0, 0, 1.25, 0.65, 0.62)));
    const pr = paintPoster('garbage');
    STATIC.get('print', M.print, {}, b.zone).add(atlasPlane(pr), b.M(mat(gx, 1.4, 0.02, 0, 0, 0, 0.42, 0.6, 1)));
  }
};

SHOP.estate = (b) => {
  const f = paintFascia(TX.estate.name, { w: b.W - 0.6, h: 0.7, bg: '#ffffff', fg: '#1d5c3a', stripe: '#2e8b57', sub: TX.estate.sub, fam: 'gothic' });
  const s = shopShell(b, { fascia: f, interior: 'estate', bright: 1.5, spill: '#eef4ff', spillK: 0.8 });
  // listings taped to the glass
  for (let i = 0; i < 8; i++) {
    const r = paintPoster('listing');
    STATIC.get('decal', M.decal, { colors: true }, b.zone).add(atlasPlane(r), b.M(mat(s.x0 + 0.5 + i * 0.5 % (s.x1 - s.x0 - 0.8), 1.15 + (i % 2) * 0.68, -s.rec - 0.02, 0, 0, 0, 0.36, 0.52, 1)), hdr(1.2, 1.2, 1.2));
  }
};

SHOP.conbini = (b) => {
  const W = b.W;
  const f = paintFascia(TX.conbini.name, {
    w: W - 0.6, h: 0.8, bg: '#ffffff', fg: '#1e7a46', fam: 'round', sub: 'HIKARI MART · 24H', subColor: '#e8742a', stripe: '#1e7a46', stripe2: '#f39a2b', textW: 0.7,
  });
  const s = shopShell(b, { fascia: f, fasciaMat: M.signsHot, interior: 'conbini', depth: 7.5, bright: 2.0, spill: '#f2f7ff', spillK: 1.6, spillD: 4.2, ceil: '#ffffff', fixture: '#ffffff', mull: 2.0, bulk: 0.12, glow: '#e8fff0' });
  // aisles: two gondola shelves with product faces, a magazine rack on the window, a counter
  const prodR = paintInterior('pharmacy', 3.0, 1.5);
  for (const z of [-2.6, -4.4]) {
    b.box('paint', M.paint, 1.2, 0.15, z - 0.35, W - 3.5, 1.5, z + 0.35, new THREE.Color('#e8e8e6'));
    STATIC.get('interior', M.interior, { noRefl: true, colors: true }, b.zone).add(atlasPlane(prodR), b.M(mat((W - 2.3) / 2, 0.85, z + 0.36, 0, 0, 0, W - 4.7, 1.3, 1)), hdr(1.6, 1.6, 1.6));
  }
  b.box('paint', M.paint, 0.8, 0.15, -0.95, W - 1.6, 1.15, -0.55, new THREE.Color('#d9dbdc'));
  const mag = paintInterior('records', 2.5, 0.6);
  STATIC.get('interior', M.interior, { noRefl: true, colors: true }, b.zone).add(atlasPlane(mag), b.M(mat(W / 2 - 0.4, 1.0, -0.54, 0, -0.5, 0, W - 2.6, 0.32, 1)), hdr(1.4, 1.4, 1.4));
  // counter and register near the door (right end)
  b.box('paint', M.paint, W - 3.0, 0.15, -3.6, W - 1.0, 1.05, -2.9, new THREE.Color('#cfd4d6'));
  b.box('paint', M.paint, W - 2.6, 1.05, -3.4, W - 2.2, 1.3, -3.1, new THREE.Color('#2a2c2e'));
  b.box('glowc', M.glow, W - 1.9, 1.05, -3.5, W - 1.2, 1.35, -3.0, hdr(3.5, 2.6, 1.6), { noRefl: true });
  // posters on the glass
  [['oden', 1.2], ['festival', 2.0], ['camera', W - 1.0]].forEach(([k, x]) => {
    const r = paintPoster(k);
    STATIC.get('decal', M.decal, { colors: true }, b.zone).add(atlasPlane(r), b.M(mat(x, 1.75, -s.rec + 0.015, 0, 0, 0, 0.42, 0.6, 1)), hdr(1.3, 1.3, 1.3));
  });
  // outside: bins, umbrella stand, a row of bicycles parked along the facade
  recyclingBins(b, 0.7, 0.3);
  umbrellaStand(b, W - 1.6, 0.3);
  for (let i = 0; i < 6; i++) BIKES.push({ p: b.P(2.2 + i * 0.85, 0.15, 0.42), yaw: b.yaw + Math.PI / 2 + rnd(-0.08, 0.08), lean: rnd(-0.05, 0.05), color: pick(BIKE_COLORS), basket: chance(0.8), child: chance(0.2) });
  // people inside
  SPOTS.push({ p: b.P(W - 2.0, 0.16, -3.9), yaw: b.yaw, pose: 'stand', role: 'clerk', top: '#2e8b57', bottom: '#2b2b2b' });
  SPOTS.push({ p: b.P(3.0, 0.16, -1.3), yaw: b.yaw, pose: 'read', role: 'customer' });
  SPOTS.push({ p: b.P(5.6, 0.16, -3.5), yaw: b.yaw + Math.PI / 2, pose: 'browse', role: 'customer' });
  PRACTICAL.push({ id: 'conbini', p: b.P(W / 2, 3.0, 1.2), color: '#eef4ff' });
};

SHOP.stairs = (b) => {
  const W = b.W;
  const s = shopShell(b, { interior: 'stairs', x0: 0.4, x1: 1.6, bright: 1.0, spill: '#e8f0ff', spillK: 0.4, fasciaH: 0.6, depth: 3 });
  // tenant directory beside the stair door
  const dir = paintFascia(TX.tenants[7] + ' / ' + TX.tenants[8], { w: 0.5, h: 0.9, bg: '#f4f4f0', fg: '#222', fam: 'gothic', ppm: 120 });
  STATIC.get('signs', M.signs, {}, b.zone).add(atlasPlane(dir), b.M(mat(1.9, 1.5, 0.02, 0, 0, 0, 0.36, 0.6, 1)));
  // a recessed nook under the building holds the vending machines (red first, as everyone remembers it)
  const nx0 = 1.75, nd = 1.35;
  b.box('concrete', M.concrete, 1.6, 0, -0.25, nx0, b.gh - 0.6, 0.0, new THREE.Color(b.wall).multiplyScalar(0.8));
  b.box('concrete', M.concrete, nx0, 0, -nd - 0.25, W - 0.3, b.gh - 0.6, -nd, new THREE.Color(b.wall).multiplyScalar(0.7));
  b.quad('glowc', M.glow, [nx0, b.gh - 0.62, -nd], [W - 0.3, b.gh - 0.62, -nd], [W - 0.3, b.gh - 0.62, 0], [nx0, b.gh - 0.62, 0], null, hdr(0.35, 0.36, 0.38));
  b.quad('tile', M.tileFloor, [nx0, 0.155, 0], [W - 0.3, 0.155, 0], [W - 0.3, 0.155, -nd], [nx0, 0.155, -nd], [0, 0, 3, 1], new THREE.Color('#6a6660'));
  b.box('glowc', M.glow, nx0 + 0.6, b.gh - 0.68, -0.8, W - 0.9, b.gh - 0.63, -0.7, hdr(6, 6.4, 7));
  const cols = ['#c8221a', '#f2f2ee', '#1f4f9a'];
  cols.forEach((c, i) => { const p = b.P(2.95 + i * 1.02, 0, -nd + 0.4); addVending(p.x, p.z, b.yaw, c, 900 + i, b.zone); });
  recyclingBins(b, 5.6, -nd + 0.3);
  COVERS.push((() => { const p0 = b.P(nx0, 0, 0), p1 = b.P(W - 0.3, 0, -nd); return { x0: Math.min(p0.x, p1.x), x1: Math.max(p0.x, p1.x), z0: Math.min(p0.z, p1.z), z1: Math.max(p0.z, p1.z) }; })());
  const pr = paintPoster('camera');
  STATIC.get('print', M.print, {}, b.zone).add(atlasPlane(pr), b.M(mat(1.9, 2.4, 0.02, 0, 0, 0, 0.3, 0.42, 1)));
};

SHOP.records = (b) => {
  const W = b.W;
  const f = paintFascia(TX.records.name, { w: 2.6, h: 0.7, bg: '#2a1f17', fg: '#f0d9a8', fam: 'mincho', sub: TX.records.sub, subColor: '#d9b26a' });
  const s = shopShell(b, { fascia: f, fasciaMat: M.signs, interior: 'records', bright: 1.2, frame: '#6a4a30', mull: 1.0, spill: '#ffc88a', spillK: 0.7, fx0: 1.6, fx1: 4.4 });
  // record crates on a low table under the eave
  b.box('wood', M.wood, 0.6, 0.15, 0.08, 2.4, 0.62, 0.62, new THREE.Color('#6b4c33'));
  const rr = paintInterior('records', 1.8, 0.45);
  STATIC.get('print', M.print, {}, b.zone).add(atlasPlane(rr), b.M(mat(1.5, 0.78, 0.35, 0, -1.2, 0, 1.7, 0.4, 1)));
  const board = paintBoard(['NEW ARRIVALS', 'JAZZ ¥800', 'CITY POP', 'ENKA ¥500'], { fam: 'latin' });
  aFrame(b, 4.3, 0.45, board);
  // the security camera that serves as CAM 15 hangs from this facade
  const cam = b.P(3.5, 5.42, 0.25);
  CCTV_MOUNT.copy(cam);
  b.box('metal', M.metal, 3.42, 5.38, 0.0, 3.58, 5.48, 0.22, new THREE.Color('#cfd2d2'));
  b.add('paint', M.paintGloss, G.cyl12, mat(3.5, 5.36, 0.3, 0, Math.PI / 2 - 0.5, 0, 0.13, 0.32, 0.13), new THREE.Color('#e8ebeb'), { colors: true });
  b.add('glowc', M.glow, G.sph8, mat(3.5, 5.32, 0.44, 0, 0, 0, 0.02, 0.02, 0.02), hdr(8, 0.5, 0.3), { colors: true });
  plant(b, 0.3, 0.15, 0.25, 0.9); plant(b, W - 0.4, 0.15, 0.25, 0.7);
};
const CCTV_MOUNT = new THREE.Vector3(-5.75, 5.4, 6.5);

SHOP.ramen = (b) => {
  const W = b.W, gh = b.gh; // W = 9, local x = 4 - worldZ
  const wallCol = new THREE.Color('#c9c1b2');
  const top = gh - 0.75;
  // facade shell
  b.box('concrete', M.concrete, 0, 0, -0.12, 0.35, gh, 0.03, wallCol);
  b.box('concrete', M.concrete, W - 0.4, 0, -0.12, W, gh, 0.03, wallCol);
  b.box('concrete', M.concrete, 2.2, 0, -0.12, 2.4, top, 0.02, wallCol);
  b.box('concrete', M.concrete, 2.4, 0, -0.1, W - 0.4, 0.95, 0.02, new THREE.Color('#3b2a22'));
  b.box('concrete', M.concrete, 0, top, -0.1, W, gh, 0.06, new THREE.Color('#1a1512'));
  const f = paintFascia(TX.ramen.name, { w: 5.6, h: 0.72, bg: '#171210', fg: '#f3e2bd', fam: 'brush', weight: 400, letter: 0.4, sub: 'MENYA AKARI · 醤油らーめん', subColor: '#c9a46a' });
  STATIC.get('signs', M.signs, {}, b.zone).add(atlasPlane(f), b.M(mat(5.4, top + 0.37, 0.065, 0, 0, 0, 5.6, 0.66, 1)));
  SIGN_GLOWS.push({ p: b.P(5.4, top + 0.37, 0.4), size: 3.5, color: new THREE.Color('#ffd9a0').multiplyScalar(0.03) });
  // glass: window counter section and door
  STATIC.get('glass', M.glass, { renderOrder: 2 }, b.zone).add(G.plane, b.M(mat((2.4 + W - 0.4) / 2, (0.95 + top) / 2, -0.06, 0, 0, 0, W - 2.8, top - 0.95, 1)));
  STATIC.get('glass', M.glass, { renderOrder: 2 }, b.zone).add(G.plane, b.M(mat(1.28, (0.15 + top) / 2, -0.08, 0, 0, 0, 1.75, top - 0.15, 1)));
  const fc = new THREE.Color('#2a2420');
  for (const x of [2.4, 4.45, 6.5, W - 0.4]) b.box('metal', M.metal, x - 0.03, 0.95, -0.09, x + 0.03, top, -0.03, fc);
  b.box('metal', M.metal, 0.38, 0.15, -0.11, 2.18, 0.2, -0.05, fc);
  b.box('metal', M.metal, 1.26, 0.15, -0.11, 1.31, top, -0.05, fc);
  // reversed lettering on the glass (reads correctly from the street)
  const gl = paintFascia(TX.ramen.glass, { w: 2.0, h: 0.5, bg: 'rgba(0,0,0,0)', fg: '#f2ede2', fam: 'gothic', weight: 900 });
  STATIC.get('decal', M.decal, { colors: true }, b.zone).add(atlasPlane(gl), b.M(mat(5.5, top - 0.38, -0.045, 0, 0, 0, 1.8, 0.45, 1)), hdr(0.85, 0.82, 0.76));
  // noren over the door, lantern, vertical sign, vent with steam
  const nr = paintNoren(TX.ramen.noren, { w: 1.8, h: 0.75, bg: '#203050', panels: 3, vertical: true });
  const ng = new THREE.PlaneGeometry(1, 1, 6, 4);
  STATIC.get('noren', M.noren, {}, b.zone).add(remapUV(ng, nr), b.M(mat(1.28, top - 0.32, 0.08, 0, 0, 0, 1.8, 0.75, 1)));
  b.add('metal', M.metal, G.cyl6, mat(1.28, top + 0.06, 0.1, 0, 0, Math.PI / 2, 0.025, 2.1, 0.025), new THREE.Color('#3a3a3a'));
  LANTERNS.push({ p: b.P(0.15, 2.55, 0.42), size: 0.62, rect: paintLantern(TX.ramen.lantern, { color: '#d02a1e' }), k: 2.2 });
  const vr = paintVSign(TX.ramen.vsign, { w: 0.62, h: 2.3, bg: '#c4161c', fg: '#ffe066', fam: 'heavy', border: '#ffe066' });
  STATIC.get('signs', M.signs, {}, b.zone).add(atlasBoxFaces({ px: vr, nx: vr }), b.M(mat(0.45, gh + 1.4, 0.55, 0, 0, 0, 0.22, 2.3, 0.62)));
  b.box('metal', M.metal, 0.38, gh + 0.2, 0.05, 0.52, gh + 0.28, 0.9, new THREE.Color('#2b2b2b'));
  SIGN_GLOWS.push({ p: b.P(0.45, gh + 1.4, 0.6), size: 1.6, color: new THREE.Color('#ff5030').multiplyScalar(0.06) });
  b.box('metal', M.metal, 6.6, gh - 0.05, 0.0, 7.3, gh + 0.45, 0.42, new THREE.Color('#9ea3a6'));
  EMITTERS.push({ p: b.P(6.95, gh + 0.2, 0.5), dir: V3(0, 1, 0), spread: 0.25, rate: 1, size: 0.9, life: 4.5, rise: 0.55, color: [1.0, 0.95, 0.88], dens: 0.5, kind: 'steam' });
  // interior
  const IN = (x0, y0, z0, x1, y1, z1, col, key = 'paint', m = M.paint) => b.box(key, m, x0, y0, z0, x1, y1, z1, new THREE.Color(col), { noRefl: true });
  b.quad('wood', M.wood, [0.35, 0.155, -0.1], [W - 0.4, 0.155, -0.1], [W - 0.4, 0.155, -7.2], [0.35, 0.155, -7.2], [0, 0, 4, 3], new THREE.Color('#4a3428'), { noRefl: true });
  IN(0.35, 0.15, -7.4, W - 0.4, 3.3, -7.2, '#d7cbb4');                         // back wall
  IN(0.2, 0.15, -7.4, 0.35, 3.3, -0.1, '#d7cbb4'); IN(W - 0.4, 0.15, -7.4, W - 0.25, 3.3, -0.1, '#d7cbb4');
  IN(0.35, 0.15, -7.2, W - 0.4, 1.0, -7.1, '#5a3e2c', 'wood', M.wood);         // wainscot
  b.quad('glowc', M.glow, [0.35, 3.2, -7.2], [W - 0.4, 3.2, -7.2], [W - 0.4, 3.2, -0.1], [0.35, 3.2, -0.1], null, hdr(0.35, 0.3, 0.25), { noRefl: true });
  // window counter with stools
  IN(2.45, 0.95, -0.62, W - 0.45, 1.0, -0.1, '#8a5a34', 'wood', M.wood);
  for (const x of [3.65, 4.85, 6.05, 7.25, 8.25]) {
    IN(x - 0.03, 0.15, -1.03, x + 0.03, 0.7, -0.97, '#888888', 'metal', M.metal);
    b.add('paint', M.paint, G.cyl12, mat(x, 0.72, -1.0, 0, 0, 0, 0.36, 0.06, 0.36), new THREE.Color('#b0201a'), { noRefl: true });
  }
  // main counter and kitchen
  IN(1.5, 0.15, -4.5, W - 1.0, 1.0, -4.0, '#7a4e2e', 'wood', M.wood);
  IN(1.4, 1.0, -4.55, W - 0.9, 1.05, -3.85, '#a06a40', 'wood', M.wood);
  for (const x of [2.4, 3.6, 4.8, 6.0, 7.2]) b.add('paint', M.paint, G.cyl12, mat(x, 0.7, -3.45, 0, 0, 0, 0.36, 0.06, 0.36), new THREE.Color('#b0201a'), { noRefl: true });
  IN(1.0, 0.15, -6.9, W - 0.8, 0.9, -6.2, '#9aa0a3', 'metal', M.metal);
  for (const x of [2.2, 3.4, 5.0]) {
    b.add('metal', M.metal, G.cyl16, mat(x, 1.18, -6.55, 0, 0, 0, 0.55, 0.55, 0.55), new THREE.Color('#c9cdd0'), { noRefl: true });
    EMITTERS.push({ p: b.P(x, 1.5, -6.55), dir: V3(0, 1, 0), spread: 0.15, rate: 0.6, size: 0.5, life: 2.8, rise: 0.45, color: [1, 0.96, 0.9], dens: 0.35, kind: 'steam', indoor: true });
  }
  // menu plaques on the back wall
  TX.ramen.menu.forEach((t, i) => {
    const r = paintVSign(t, { w: 0.22, h: 0.75, bg: '#e9d9b8', fg: '#2b1a10', fam: 'brush', ppm: 160 });
    STATIC.get('print', M.print, {}, b.zone).add(atlasPlane(r), b.M(mat(1.6 + i * 0.32, 2.45, -7.18, 0, 0, 0, 0.22, 0.75, 1)));
  });
  // pendant lamps over the window counter, a small TV, the ticket machine by the door
  for (const x of [3.6, 5.4, 7.2]) {
    b.add('metal', M.metal, G.cyl6, mat(x, 2.85, -0.4, 0, 0, 0, 0.01, 0.6, 0.01), new THREE.Color('#222'), { noRefl: true });
    b.add('glowc', M.glow, G.cyl12, mat(x, 2.5, -0.4, 0, 0, 0, 0.28, 0.18, 0.28), hdr(5.5, 3.6, 1.8), { colors: true, noRefl: true });
  }
  b.box('paint', M.paint, W - 1.4, 2.4, -7.15, W - 0.6, 2.9, -6.95, new THREE.Color('#111'), { noRefl: true });
  b.box('glowc', M.glow, W - 1.35, 2.44, -6.94, W - 0.65, 2.86, -6.93, hdr(0.6, 0.8, 1.2), { noRefl: true });
  b.box('paint', M.paintGloss, 0.45, 0.15, -0.75, 0.95, 1.6, -0.2, new THREE.Color('#d9dcde'), { noRefl: true });
  b.box('glowc', M.glow, 0.5, 1.05, -0.19, 0.9, 1.5, -0.18, hdr(2.2, 2.0, 1.4), { noRefl: true });
  // the bowl in the foreground of CAM 13 and its steam
  ramenBowl(b, 3.65, 1.0, -0.42);
  EMITTERS.push({ p: b.P(3.65, 1.12, -0.42), dir: V3(0, 1, 0), spread: 0.04, rate: 1.2, size: 0.12, life: 2.6, rise: 0.22, color: [1, 1, 1], dens: 0.5, kind: 'wisp', indoor: true });
  for (const x of [4.85, 6.05]) { ramenBowl(b, x, 1.0, -0.42); }
  // outside bits: crates, bucket, the delivery scooter
  crates(b, 0.25, 0.32, 3, '#d9a514');
  b.add('metal', M.metal, G.cyl12, mat(0.75, 0.32, 0.3, 0, 0, 0, 0.32, 0.34, 0.32), new THREE.Color('#b8bcbe'));
  SCOOTERS.push({ p: b.P(8.55, 0.15, 0.45), yaw: b.yaw - Math.PI / 2, demae: true });
  // light: warm spill, interior practical
  b.spill(2.4, W - 0.4, '#ffc27a', 1.1, 3.2);
  b.light(1.2, 0.6, 2.2, '#ffb070', 0.6);
  PRACTICAL.push({ id: 'ramen', p: b.P(5.0, 2.7, -2.0), color: '#ffc58a' });
  // customers at the window counter (CAM 13 sits on the first stool) and at the main counter, the cook
  SPOTS.push({ p: b.P(4.85, 0.15, -1.05), yaw: b.yaw, pose: 'eat', seatH: 0.75, role: 'ramenA' });
  SPOTS.push({ p: b.P(6.05, 0.15, -1.05), yaw: b.yaw, pose: 'eat', seatH: 0.75, role: 'ramenB', phase: 1.7 });
  SPOTS.push({ p: b.P(3.6, 0.15, -3.5), yaw: b.yaw + Math.PI, pose: 'eat', seatH: 0.75, role: 'ramenC', phase: 0.6 });
  SPOTS.push({ p: b.P(6.0, 0.15, -3.5), yaw: b.yaw + Math.PI, pose: 'eat', seatH: 0.75, role: 'ramenD', phase: 2.4 });
  SPOTS.push({ p: b.P(4.2, 0.15, -5.4), yaw: b.yaw, pose: 'cook', role: 'chef', top: '#151515', bottom: '#2a2a2a', towel: true });
  // the queue waits along the record shop next door
  for (let i = 0; i < 3; i++) SPOTS.push({ p: V3(-5.62, CURB_H, 4.55 + i * 0.72), yaw: Math.PI + rnd(-0.3, 0.3), pose: i === 1 ? 'phone' : 'stand', role: 'queue', umbrella: 'closed' });
};

// A shōyu ramen: flared bowl with a red meander band, broth, noodles, chashu, egg, naruto, nori, negi.
const RAMEN_GEO = {};
function ramenBowl(b, x, y, z) {
  const R = RAMEN_GEO;
  if (!R.bowl) {
    R.bowl = lathe([[0.001, 0], [0.042, 0], [0.044, 0.012], [0.05, 0.014], [0.078, 0.03], [0.1, 0.055], [0.114, 0.082], [0.12, 0.1], [0.114, 0.1], [0.108, 0.084], [0.094, 0.06], [0.07, 0.04], [0.001, 0.035]], 28);
    R.band = new THREE.CylinderGeometry(0.1185, 0.11, 0.02, 28, 1, true);
    R.broth = new THREE.CylinderGeometry(0.104, 0.104, 0.004, 28);
    R.noodle = new THREE.TorusGeometry(0.03, 0.0032, 5, 12, Math.PI).rotateX(-Math.PI / 2);
    R.ring = new THREE.TorusGeometry(0.012, 0.0028, 4, 16).rotateX(-Math.PI / 2);
  }
  const add = (key, m, geo, matrix, color) => b.add(key, m, geo, matrix, new THREE.Color(color), { noRefl: true, colors: true });
  add('paint', M.paintGloss, R.bowl, mat(x, y, z), '#f1ece2');
  add('paint', M.paintGloss, R.band, mat(x, y + 0.082, z), '#b3241a');
  add('paint', M.paintGloss, R.broth, mat(x, y + 0.084, z), '#a8682a');
  for (const [dx, dz, a] of [[-0.03, 0.02, 0.4], [0.02, 0.04, 2.1], [0.04, -0.01, 3.6], [-0.01, -0.035, 5.0]]) add('paint', M.paint, R.noodle, mat(x + dx, y + 0.087, z + dz, a), '#ead68e');
  for (const [dx, dz, a] of [[0.035, -0.02, 0.3], [0.05, 0.02, -0.4]]) add('paint', M.paint, G.cyl16, mat(x + dx, y + 0.091, z + dz, a, 0.18, 0, 0.075, 0.008, 0.06), '#c88c68');
  add('paint', M.paint, G.sph12, mat(x - 0.045, y + 0.088, z + 0.025, 0.5, 0, 0, 0.034, 0.024, 0.046), '#f4efe6');
  add('paint', M.paint, G.cyl12, mat(x - 0.045, y + 0.1, z + 0.025, 0.5, 0, 0, 0.022, 0.002, 0.03), '#ee9c1c');
  add('paint', M.paint, G.cyl16, mat(x - 0.005, y + 0.09, z + 0.055, 0, 0, 0, 0.044, 0.006, 0.044), '#f6f2ec');
  add('paint', M.paint, R.ring, mat(x - 0.005, y + 0.0935, z + 0.055), '#e06a8a');
  add('paint', M.paint, G.box, mat(x - 0.01, y + 0.12, z + 0.08, 0, 0.38, 0, 0.07, 0.085, 0.002), '#16211b');
  for (let i = 0; i < 9; i++) add('paint', M.paint, G.box, mat(x + Math.sin(i * 2.4) * 0.025, y + 0.0885, z + Math.cos(i * 2.4) * 0.02 - 0.01, i, 0, 0, 0.009, 0.003, 0.009), '#5aa040');
  for (const [dx, dz, a] of [[0.0, -0.045, 0.6], [0.015, -0.05, 1.1]]) add('paint', M.paint, G.box, mat(x + dx, y + 0.089, z + dz, a, 0, 0, 0.032, 0.006, 0.01), '#c79e5c');
  for (const d of [-0.012, 0.012]) add('paint', M.paint, G.box, mat(x + 0.14, y + 0.004, z + d, 0.3, 0, 0, 0.007, 0.007, 0.23), '#c9a26a');
}

function remapUV(geo, r) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
  return geo;
}

SHOP.izakaya = (b) => {
  const W = b.W, gh = b.gh; // local x = -5 - worldZ (x=0 at z=-5)
  const wood = new THREE.Color('#3a271b');
  const rec = 1.2, ax0 = 1.3, ax1 = 4.3;
  // dark timber front with a recessed entry alcove
  b.box('wood', M.wood, 0, 0, -0.15, ax0, gh, 0.02, wood);
  b.box('wood', M.wood, ax1, 0, -0.15, W, gh, 0.02, wood);
  b.box('wood', M.wood, ax0, 0, -rec - 0.1, ax1, 0.16, 0, new THREE.Color('#2a1d14'));
  b.box('wood', M.wood, ax0 - 0.05, 0, -rec, ax0, gh, 0, wood); b.box('wood', M.wood, ax1, 0, -rec, ax1 + 0.05, gh, 0, wood);
  b.box('wood', M.wood, ax0, 2.35, -rec - 0.15, ax1, gh, -rec, wood);
  // lattice windows glowing behind paper
  b.box('glowc', M.glow, 4.7, 0.8, -0.14, W - 0.4, 2.35, -0.12, hdr(2.6, 1.55, 0.7));
  for (let x = 4.75; x < W - 0.4; x += 0.11) b.box('wood', M.wood, x, 0.78, -0.11, x + 0.035, 2.37, -0.06, new THREE.Color('#2a1a10'));
  b.box('wood', M.wood, 4.65, 2.35, -0.12, W - 0.35, 2.42, -0.04, new THREE.Color('#2a1a10'));
  b.box('wood', M.wood, 4.65, 0.72, -0.12, W - 0.35, 0.8, -0.04, new THREE.Color('#2a1a10'));
  // the sliding door: a separate mesh so it can open
  const doorGeo = new THREE.BoxGeometry(1.0, 2.15, 0.05);
  const door = new THREE.Group();
  const panel = new THREE.Mesh(doorGeo, M.glowSingle || (M.glowSingle = basic({ color: hdr(2.2, 1.35, 0.62) })));
  door.add(panel);
  for (let k = 0; k < 7; k++) { const slat = new THREE.Mesh(G.box, M.woodSingle || (M.woodSingle = std({ map: TEX.wood, color: 0x3a2618, roughness: 0.8 }))); slat.scale.set(0.035, 2.15, 0.06); slat.position.set(-0.45 + k * 0.15, 0, 0.03); door.add(slat); }
  const frameT = new THREE.Mesh(G.box, M.woodSingle); frameT.scale.set(1.0, 0.07, 0.07); frameT.position.set(0, 1.04, 0.03); door.add(frameT);
  door.matrixAutoUpdate = false;
  scene.add(door);
  const closedX = ax0 + 0.55, openX = ax0 + 1.5;
  const dz = -rec + 0.02;
  DOORS.push({ obj: door, b, closedX, openX, y: 0.16 + 1.075, z: dz, schedule: 'izakaya' });
  b.box('glowc', M.glow, ax0 + 0.05, 0.16, -rec - 0.12, ax1 - 0.05, 2.3, -rec - 0.1, hdr(2.4, 1.4, 0.65));
  b.box('wood', M.wood, ax0 + 1.05, 0.16, -rec - 0.08, ax1 - 0.05, 2.3, -rec - 0.02, wood);
  // eave with a row of small lanterns
  b.quad('kawara', M.kawara, [-0.1, gh - 0.3, 0.8], [W + 0.1, gh - 0.3, 0.8], [W + 0.1, gh + 0.15, -0.05], [-0.1, gh + 0.15, -0.05], [0, 0, W / 1.2, 0.8], new THREE.Color('#4d5156'));
  b.quad('wood', M.wood, [W + 0.1, gh - 0.32, 0.8], [-0.1, gh - 0.32, 0.8], [-0.1, gh - 0.32, 0], [W + 0.1, gh - 0.32, 0], [0, 0, 2, 0.3], new THREE.Color('#3a271b'));
  for (let i = 0; i < 6; i++) LANTERNS.push({ p: b.P(0.6 + i * 1.35, gh - 0.62, 0.62), size: 0.36, rect: paintLantern(TX.izakaya.lanterns[i % 2], { color: '#d42a1e' }), k: 2.0 });
  LANTERNS.push({ p: b.P(ax0 - 0.25, 2.35, 0.3), size: 0.78, rect: paintLantern(TX.izakaya.lanterns[0], { color: '#d42a1e' }), k: 2.4 });
  LANTERNS.push({ p: b.P(ax1 + 0.25, 2.35, 0.3), size: 0.78, rect: paintLantern(TX.izakaya.lanterns[3], { color: '#d42a1e' }), k: 2.4 });
  // noren across the alcove
  const nr = paintNoren(TX.izakaya.name, { w: 2.9, h: 0.62, bg: '#1b2440', panels: 3, vertical: false });
  STATIC.get('noren', M.noren, {}, b.zone).add(remapUV(new THREE.PlaneGeometry(1, 1, 8, 4), nr), b.M(mat((ax0 + ax1) / 2, 2.05, -0.03, 0, 0, 0, ax1 - ax0 - 0.1, 0.62, 1)));
  // vertical sign, chalk board, beer crates, smoke from the grill
  const vr = paintVSign(TX.izakaya.vsign, { w: 0.62, h: 2.3, bg: '#f6f1e6', fg: '#1b1b1b', fam: 'mincho', border: '#c4161c' });
  STATIC.get('signs', M.signs, {}, b.zone).add(atlasBoxFaces({ px: vr, nx: vr }), b.M(mat(W - 0.45, gh + 1.5, 0.55, 0, 0, 0, 0.22, 2.3, 0.62)));
  b.box('metal', M.metal, W - 0.52, gh + 0.3, 0.05, W - 0.38, gh + 0.38, 0.9, new THREE.Color('#2b2b2b'));
  SIGN_GLOWS.push({ p: b.P(W - 0.45, gh + 1.5, 0.6), size: 1.6, color: new THREE.Color('#fff2e0').multiplyScalar(0.05) });
  const board = paintBoard(TX.izakaya.board, { fam: 'brush', bg: '#1a2420', w: 0.6, h: 1.0 });
  aFrame(b, W - 0.6, 0.45, board);
  crates(b, W - 0.25, 0.25, 4, '#c9a21a');
  b.box('metal', M.metal, 6.0, gh + 2.3, -0.05, 6.6, gh + 2.75, 0.35, new THREE.Color('#6d7174'));
  EMITTERS.push({ p: b.P(6.3, gh + 2.6, 0.45), dir: V3(0, 1, 0.2), spread: 0.3, rate: 0.9, size: 1.1, life: 5.5, rise: 0.4, color: [0.78, 0.8, 0.85], dens: 0.35, kind: 'smoke' });
  b.spill(0, W, '#ff9a55', 1.0, 3.2);
  PRACTICAL.push({ id: 'izakaya', p: b.P(2.8, 2.4, 0.9), color: '#ff9a50' });
  // the third-floor balcony the balcony camera stands on: a potted maple, a towel, a folding chair
  {
    const y = gh + b.fh + 0.12;
    plant(b, 2.35, y, -0.45, 1.25);
    laundry(b, 3.4, 4.6, y + 1.8, -0.75);
    b.box('metal', M.metal, 4.8, y, -1.0, 5.25, y + 0.45, -0.6, new THREE.Color('#5a6066'), { colors: true });
    b.box('metal', M.metal, 4.8, y + 0.45, -1.02, 5.25, y + 0.9, -0.98, new THREE.Color('#5a6066'), { colors: true });
  }
  // a group of three talking in the alcove, one of them heading home soon
  SPOTS.push({ p: b.P(1.75, 0.16, -0.25), yaw: b.yaw + 1.2, pose: 'talk', role: 'salary', top: '#2b2f36', bottom: '#2b2f36', bag: 'brief', phase: 0.0 });
  SPOTS.push({ p: b.P(2.6, 0.16, 0.25), yaw: b.yaw + Math.PI + 0.2, pose: 'talk', role: 'salary', top: '#1f2228', bottom: '#1f2228', phase: 2.1, umbrella: 'closed' });
  SPOTS.push({ p: b.P(3.45, 0.16, -0.3), yaw: b.yaw - 1.3, pose: 'laugh', role: 'salary', top: '#3a3f47', bottom: '#2b2f36', phase: 4.0 });
};

SHOP.pharmacy = (b) => {
  const W = b.W;
  const f = paintFascia(TX.pharmacy.name, { w: W - 0.6, h: 0.85, bg: '#ffe33b', fg: '#d0101a', fam: 'heavy', sub: TX.pharmacy.sub, subColor: '#127a3a', textW: 0.8 });
  const s = shopShell(b, { fascia: f, fasciaMat: M.signsHot, interior: 'pharmacy', depth: 6.5, bright: 2.0, spill: '#f6fbff', spillK: 1.4, spillD: 4, fasciaH: 0.9, bulk: 0.1, glow: '#fff4b0' });
  // carts of boxed goods out front, price cards
  for (const x of [1.0, 3.2, W - 2.2]) {
    b.box('metal', M.metal, x - 0.7, 0.15, 0.05, x + 0.7, 0.2, 0.62, new THREE.Color('#c9c9c4'));
    for (let row = 0; row < 3; row++) for (let k = 0; k < 7; k++) {
      const c = new THREE.Color(pick(['#e94b3c', '#f4c430', '#3c78d8', '#ffffff', '#6aa84f', '#e69138', '#c27ba0', '#1c4587']));
      b.box('paint', M.paint, x - 0.66 + k * 0.19, 0.25 + row * 0.38, 0.1, x - 0.5 + k * 0.19, 0.25 + row * 0.38 + rnd(0.15, 0.32), 0.55, c);
    }
    const pop = paintFascia(pick(TX.pharmacy.pops), { w: 0.4, h: 0.28, bg: '#ffe100', fg: '#d0101a', fam: 'heavy', ppm: 140 });
    STATIC.get('print', M.print, {}, b.zone).add(atlasPlane(pop), b.M(mat(x, 1.4, 0.64, 0, 0, 0, 0.4, 0.28, 1)));
  }
  LED_SIGNS.push({ b, x: W / 2, y: b.gh + 0.2, z: 0.14, w: W - 2.0, h: 0.28 });
  PRACTICAL.push({ id: 'pharmacy', p: b.P(W / 2, 3.0, 1.0), color: '#f4f8ff' });
};
const LED_SIGNS = [];

SHOP.atm = (b) => {
  const W = b.W;
  const f = paintFascia(TX.bank, { w: W - 0.6, h: 0.7, bg: '#ffffff', fg: '#1d6b44', fam: 'gothic', sub: TX.atm, subColor: '#c0392b', stripe: '#1d6b44' });
  shopShell(b, { fascia: f, interior: 'atm', x1: W * 0.55, bright: 1.6, spill: '#eef6ff', spillK: 0.9 });
  b.add('shutter', M.shutter, G.box, mat(W * 0.55 + (W * 0.45 - 0.3) / 2, (b.gh - 0.8) / 2, -0.1, 0, 0, 0, W * 0.45 - 0.3, b.gh - 0.8, 0.05), new THREE.Color('#a9acac'));
};

SHOP.yakiniku = (b) => {
  const f = paintFascia(TX.yakiniku, { w: b.W - 0.6, h: 0.75, bg: '#120b08', fg: '#ff6a2a', fam: 'brush', weight: 400, letter: 0.3 });
  shopShell(b, { fascia: f, interior: 'yakiniku', bright: 1.2, spill: '#ff9a55', spillK: 0.9 });
  EMITTERS.push({ p: b.P(b.W * 0.7, b.gh + 0.4, 0.4), dir: V3(0, 1, 0.1), spread: 0.3, rate: 0.7, size: 1.0, life: 5, rise: 0.4, color: [0.8, 0.8, 0.84], dens: 0.3, kind: 'smoke' });
};

SHOP.lobby = (b) => {
  const W = b.W, gh = b.gh;
  // bicycle garage under the building on the left, glass lobby on the right
  b.box('concrete', M.concrete, 0, 0, -0.2, 0.3, gh, 0.02, new THREE.Color(b.wall));
  b.box('concrete', M.concrete, W - 0.3, 0, -0.2, W, gh, 0.02, new THREE.Color(b.wall));
  b.box('concrete', M.concrete, 0, gh - 0.4, -0.2, W, gh, 0.04, new THREE.Color(b.wall).multiplyScalar(0.8));
  const gx1 = W - 5.2;
  b.quad('glowc', M.glow, [0.3, 0.16, -0.2], [gx1, 0.16, -0.2], [gx1, 0.16, -3.2], [0.3, 0.16, -3.2], null, hdr(0.18, 0.18, 0.17), { noRefl: true });
  b.quad('glowc', M.glow, [0.3, 0.16, -3.2], [gx1, 0.16, -3.2], [gx1, gh - 0.4, -3.2], [0.3, gh - 0.4, -3.2], null, hdr(0.32, 0.33, 0.33), { noRefl: true });
  b.quad('glowc', M.glow, [0.3, gh - 0.42, -3.2], [gx1, gh - 0.42, -3.2], [gx1, gh - 0.42, -0.2], [0.3, gh - 0.42, -0.2], null, hdr(0.4, 0.42, 0.42), { noRefl: true });
  for (let x = 1.5; x < gx1; x += 3) b.box('glowc', M.glow, x - 0.6, gh - 0.5, -1.7, x + 0.6, gh - 0.44, -1.6, hdr(5, 5.6, 6), { noRefl: true });
  for (let x = 0.8; x < gx1 - 0.3; x += 0.62) BIKES.push({ p: b.P(x, 0.16, -1.6), yaw: b.yaw + rnd(-0.06, 0.06), lean: 0, color: pick(BIKE_COLORS), basket: chance(0.85), child: chance(0.25) });
  b.light(gx1 / 2, 0.4, 3.5, '#e8f0ff', 0.6);
  const sign = paintFascia(TX.misc[4], { w: 1.0, h: 0.32, bg: '#1f5fa8', fg: '#fff', fam: 'gothic', ppm: 120 });
  STATIC.get('signs', M.signs, {}, b.zone).add(atlasPlane(sign), b.M(mat(1.0, gh - 0.2, 0.05, 0, 0, 0, 1.0, 0.3, 1)));
  shopShell(b, { interior: 'lobby', x0: gx1 + 0.2, x1: W - 0.4, fasciaH: 0.4, bright: 1.6, noPillars: true, spill: '#fff6e6', spillK: 0.8, depth: 4 });
  // canopy and the garbage station
  b.box('concrete', M.concrete, gx1 - 0.2, gh - 0.55, 0, W, gh - 0.4, 1.4, new THREE.Color('#d9d4c8'));
  for (let x = gx1; x < W - 0.5; x += 1.4) b.box('glowc', M.glow, x + 0.5, gh - 0.57, 0.6, x + 0.75, gh - 0.55, 0.8, hdr(5, 4.6, 4));
  plant(b, gx1 + 0.4, 0.15, 0.3, 1.2); plant(b, W - 0.6, 0.15, 0.3, 1.2);
  SPOTS.push({ p: b.P(W - 2.6, 0.16, -2.2), yaw: b.yaw + 0.4, pose: 'stand', role: 'resident' });
};

SHOP.dental = (b) => {
  const f = paintFascia(TX.dental.name, { w: b.W - 0.6, h: 0.72, bg: '#fff5f8', fg: '#d6457a', fam: 'round', sub: TX.dental.sub, subColor: '#5a7d8a' });
  shopShell(b, { fascia: f, interior: 'dental', bright: 0.7, spill: '#f0f6ff', spillK: 0.35 });
  const vr = paintVSign(TX.dental.name, { w: 0.55, h: 2.2, bg: '#ffffff', fg: '#d6457a', fam: 'round', border: '#f2a7c3' });
  STATIC.get('signs', M.signs, {}, b.zone).add(atlasBoxFaces({ px: vr, nx: vr }), b.M(mat(b.W - 0.4, b.gh + 1.4, 0.5, 0, 0, 0, 0.2, 2.2, 0.55)));
  SIGN_GLOWS.push({ p: b.P(b.W - 0.4, b.gh + 1.4, 0.55), size: 1.5, color: new THREE.Color('#ffd0e0').multiplyScalar(0.05) });
  const closed = paintFascia(TX.misc[2], { w: 0.6, h: 0.22, bg: '#ffffff', fg: '#b03030', fam: 'gothic', ppm: 140 });
  STATIC.get('print', M.print, {}, b.zone).add(atlasPlane(closed), b.M(mat(1.2, 1.3, -0.2, 0, 0, 0, 0.5, 0.18, 1)));
};

SHOP.florist = (b) => {
  const W = b.W, gh = b.gh;
  const f = paintFascia(TX.florist.name, { w: 2.8, h: 0.7, bg: '#f4efe4', fg: '#2f5a3e', fam: 'mincho', sub: TX.florist.sub, subColor: '#8a5a3a' });
  const s = shopShell(b, { fascia: f, fasciaMat: M.signsDim, interior: 'florist', bright: 1.5, recess: 0.6, spill: '#ffe9c8', spillK: 1.0, fx0: 2.2, fx1: 5.8 });
  // half-closed shutter: closing time
  b.add('shutter', M.shutter, G.box, mat(W / 2, s.top - 0.45, -0.05, 0, 0, 0, W - 0.6, 0.9, 0.04), new THREE.Color('#a7aaaa'));
  // striped awning
  const ar = signRect(W, 1.0, 50); const c = ATL.sign.ctx;
  for (let i = 0; i < 14; i++) { c.fillStyle = i % 2 ? '#f2efe6' : '#2f6a4a'; c.fillRect(ar.x + ar.w * i / 14, ar.y, ar.w / 14 + 1, ar.h); }
  awning(b, 0.2, W - 0.2, gh - 0.85, 1.0, ar, '#2f6a4a');
  // tiers of buckets with flowers
  const flower = ['#c23b5a', '#f0c419', '#ffffff', '#e86a92', '#7d3c98', '#e67e22', '#d94a3a', '#f6e7a1'];
  for (let tier = 0; tier < 3; tier++) for (let x = 0.5; x < W - 0.4; x += 0.42) {
    const y = 0.15 + tier * 0.32, z = 0.15 + tier * -0.18 + 0.35;
    b.add('paint', M.paint, G.cyl8, mat(x, y + 0.13, z, 0, 0, 0, 0.26, 0.26, 0.26), new THREE.Color(pick(['#3b3f44', '#8a8f93', '#2a4a6a'])));
    const fc = new THREE.Color(pick(flower));
    for (let k = 0; k < 5; k++) b.add('leaf', M.leaf, G.sph8, mat(x + rnd(-0.1, 0.1), y + 0.36 + rnd(0, 0.18), z + rnd(-0.08, 0.08), 0, 0, 0, 0.1, 0.08, 0.1), k < 3 ? fc : new THREE.Color('#3a5a2a'));
  }
  plant(b, W - 0.3, 0.15, 0.6, 1.4);
  SPOTS.push({ p: b.P(W * 0.35, 0.16, -1.8), yaw: b.yaw + 0.5, pose: 'work', role: 'florist', top: '#6b8f71', bottom: '#2b2b2b' });
};

SHOP.laundry = (b) => {
  const W = b.W;
  const f = paintFascia(TX.laundry.name, { w: W - 0.6, h: 0.72, bg: '#1f5fa8', fg: '#ffffff', fam: 'gothic', sub: 'COIN LAUNDRY · ' + TX.laundry.h24, subColor: '#bfe0ff' });
  const s = shopShell(b, { fascia: f, interior: 'laundry', depth: 5.5, bright: 1.8, spill: '#eaf3ff', spillK: 1.2, ceil: '#f6fbff', fixture: '#f2f8ff' });
  // washers along the left wall, a bench with someone waiting
  for (let i = 0; i < 4; i++) {
    const z = -1.2 - i * 0.95;
    b.box('paint', M.paintGloss, s.x0 + 0.05, 0.15, z - 0.42, s.x0 + 0.75, 1.0, z + 0.42, new THREE.Color('#e9ecee'), { noRefl: true });
    b.add('glowc', M.glow, G.cyl24, mat(s.x0 + 0.76, 0.62, z, 0, 0, Math.PI / 2, 0.42, 0.02, 0.42), hdr(0.25, 0.3, 0.38), { colors: true, noRefl: true });
    DRUMS.push({ p: b.P(s.x0 + 0.78, 0.62, z), b, yaw: b.yaw + Math.PI / 2, phase: i * 1.3, spin: i !== 2 });
  }
  b.box('wood', M.wood, s.x1 - 2.6, 0.15, -1.2, s.x1 - 0.4, 0.48, -0.8, new THREE.Color('#8a6a4a'), { noRefl: true });
  SPOTS.push({ p: b.P(s.x1 - 1.3, 0.15, -1.05), yaw: b.yaw, pose: 'sitphone', seatH: 0.5, role: 'laundry' });
  PRACTICAL.push({ id: 'laundry', p: b.P(W / 2, 3.0, 1.0), color: '#eef6ff' });
  for (let i = 0; i < 3; i++) BIKES.push({ p: b.P(s.x1 - 0.5 - i * 0.8, 0.15, 0.45), yaw: b.yaw + Math.PI / 2 + rnd(-0.1, 0.1), lean: 0, color: pick(BIKE_COLORS), basket: true });
};
const DRUMS = [];

SHOP.tobacco = (b) => {
  const W = b.W, gh = b.gh; // old house, local x = worldZ - 4.5
  const wall = new THREE.Color(b.wall);
  b.box('wood', M.wood, 0, 0, -0.15, W, 0.5, 0.0, wall.clone().multiplyScalar(0.7));
  b.box('wood', M.wood, 0, 0.5, -0.2, 0.25, gh, 0.0, wall); b.box('wood', M.wood, W - 0.25, 0.5, -0.2, W, gh, 0.0, wall);
  b.box('wood', M.wood, 0, gh - 0.3, -0.2, W, gh, 0.03, wall.clone().multiplyScalar(0.8));
  // tobacco window: a lit glass case with packs
  b.box('glowc', M.glow, W - 2.6, 0.95, -0.25, W - 0.5, 1.75, -0.2, hdr(1.8, 1.7, 1.5));
  for (let i = 0; i < 18; i++) b.box('paint', M.paint, W - 2.5 + (i % 9) * 0.22, 1.02 + Math.floor(i / 9) * 0.34, -0.2, W - 2.36 + (i % 9) * 0.22, 1.25 + Math.floor(i / 9) * 0.34, -0.15, new THREE.Color(pick(['#c0392b', '#ecf0f1', '#2471a3', '#d4ac0d', '#1e8449', '#17202a'])));
  STATIC.get('glass', M.glass, { renderOrder: 2 }, b.zone).add(G.plane, b.M(mat(W - 1.55, 1.35, -0.12, 0, 0, 0, 2.1, 0.8, 1)));
  const tr = paintVSign(TX.tobacco, { w: 0.42, h: 1.25, bg: '#c4161c', fg: '#ffffff', fam: 'mincho', ppm: 140 });
  STATIC.get('signs', M.signs, {}, b.zone).add(atlasPlane(tr), b.M(mat(W - 0.42, 2.4, 0.02, 0, 0, 0, 0.42, 1.25, 1)));
  SIGN_GLOWS.push({ p: b.P(W - 0.42, 2.4, 0.3), size: 1.0, color: new THREE.Color('#ff6050').multiplyScalar(0.05) });
  // the family's own sliding door with frosted glass, potted plants lined along the wall
  b.box('wood', M.wood, 0.4, 0.15, -0.3, 2.2, 2.2, -0.24, new THREE.Color('#5a4434'));
  b.box('glowc', M.glow, 0.5, 0.9, -0.24, 2.1, 2.05, -0.23, hdr(0.9, 0.75, 0.52));
  for (let x = 2.4; x < W - 2.7; x += 0.38) plant(b, x, 0.15, 0.2, rnd(0.5, 0.95));
  b.light(W - 1.5, 0.6, 2.0, '#ffe2b8', 0.5);
  // bus stop: bench, sign pole, the people waiting
  const bz = 0.42;
  b.box('wood', M.wood, 5.5, 0.48, bz - 0.2, 7.2, 0.53, bz + 0.2, new THREE.Color('#8a6a4a'));
  b.box('wood', M.wood, 5.5, 0.6, bz - 0.24, 7.2, 0.95, bz - 0.2, new THREE.Color('#8a6a4a'));
  for (const x of [5.6, 7.1]) b.box('metal', M.metal, x - 0.03, 0.15, bz - 0.2, x + 0.03, 0.5, bz + 0.2, new THREE.Color('#6a6e70'));
  SPOTS.push({ p: b.P(6.1, 0.15, bz + 0.05), yaw: b.yaw, pose: 'sit', seatH: 0.52, role: 'grandma', top: '#6a5a6a', bottom: '#3a3436', hair: '#c9c6c0', umbrella: 'cane', height: 0.92 });
  SPOTS.push({ p: b.P(7.1, 0.15, 1.05), yaw: b.yaw + 0.4, pose: 'phone', role: 'student', top: '#1d2433', bottom: '#2a2f3a', bag: 'pack', headphones: true });
};

SHOP.kissaten = (b) => {
  const W = b.W, gh = b.gh, P = b.pilotis; // W = 9, local x = worldZ + 4.5, glass line at z = -P
  const brick = new THREE.Color('#6e4536');
  // columns and soffit
  b.box('concrete', M.concrete, 0, 0, -0.45, 0.42, gh, 0.0, brick);
  b.box('concrete', M.concrete, W - 0.42, 0, -0.45, W, gh, 0.0, brick);
  b.box('concrete', M.concrete, 0, gh - 0.2, -P - 0.1, W, gh, 0.05, new THREE.Color('#3a2a22'));
  b.quad('glowc', M.glow, [0, gh - 0.21, -P], [W, gh - 0.21, -P], [W, gh - 0.21, 0], [0, gh - 0.21, 0], null, hdr(0.3, 0.22, 0.16));
  for (const x of [1.6, 4.5, 7.4]) b.add('glowc', M.glow, G.cyl16, mat(x, gh - 0.215, -P * 0.5, 0, 0, 0, 0.22, 0.01, 0.22), hdr(9, 6.2, 3.2), { colors: true });
  // terrazzo floor under the overhang
  b.quad('tile', M.tileFloor, [0, 0.162, 0], [W, 0.162, 0], [W, 0.162, -P], [0, 0.162, -P], [0, 0, W / 1.2, P / 1.2], new THREE.Color('#5a4a42'));
  // slab band with the small lit name
  const band = paintFascia(TX.hero.fascia + '   COFFEE LUNA   since 1974', { w: 6.5, h: 0.24, bg: '#2a1c16', fg: '#f2c98a', fam: 'retro', ppm: 160, letter: 0.1 });
  STATIC.get('signs', M.signs, {}, b.zone).add(atlasPlane(band), b.M(mat(W / 2, gh - 0.1, 0.06, 0, 0, 0, 6.5, 0.2, 1)));
  // shopfront: timber frames, big windows, door, display case
  const wf = new THREE.Color('#4a2e1e');
  b.box('wood', M.wood, 0.42, 0.15, -P - 0.12, W - 0.42, 0.62, -P, new THREE.Color('#3a2418'));
  b.box('wood', M.wood, 0.42, gh - 0.75, -P - 0.12, W - 0.42, gh - 0.2, -P, wf);
  STATIC.get('glass', M.glass, { renderOrder: 2 }, b.zone).add(G.plane, b.M(mat(3.15, (0.62 + gh - 0.75) / 2, -P - 0.06, 0, 0, 0, 4.3, gh - 0.75 - 0.62, 1)));
  STATIC.get('glass', M.glass, { renderOrder: 2 }, b.zone).add(G.plane, b.M(mat(7.6, (1.65 + gh - 0.75) / 2, -P - 0.06, 0, 0, 0, 1.3, gh - 0.75 - 1.65, 1)));
  for (const x of [0.95, 3.15, 5.35, 5.55, 6.75, 6.95, 8.25]) b.box('wood', M.wood, x - 0.05, 0.62, -P - 0.1, x + 0.05, gh - 0.75, -P - 0.02, wf);
  b.box('wood', M.wood, 0.95, 1.55, -P - 0.1, 5.35, 1.6, -P - 0.02, wf);
  // door (timber with a small window and an OPEN plaque)
  b.box('wood', M.wood, 5.6, 0.16, -P - 0.08, 6.7, 2.45, -P - 0.02, new THREE.Color('#5a3622'));
  b.box('glowc', M.glow, 5.85, 1.35, -P - 0.01, 6.45, 2.15, -P, hdr(2.4, 1.6, 0.8));
  b.add('metal', M.metal, G.cyl8, mat(5.72, 1.1, -P + 0.02, 0, 0, 0, 0.03, 0.35, 0.03), new THREE.Color('#c9a24a'));
  const open = paintFascia(TX.hero.open, { w: 0.42, h: 0.16, bg: '#2a1c16', fg: '#f2c98a', fam: 'gothic', ppm: 160 });
  STATIC.get('signs', M.signs, {}, b.zone).add(atlasPlane(open), b.M(mat(6.15, 1.2, -P + 0.01, 0, 0, 0, 0.42, 0.16, 1)));
  // gold leaf on the window glass and lace café curtains inside
  const gold = paintFascia(TX.hero.glass, { w: 2.6, h: 0.45, bg: 'rgba(0,0,0,0)', fg: '#d9b25a', fam: 'retro', weight: 700, letter: 0.2 });
  STATIC.get('decal', M.decal, { colors: true }, b.zone).add(atlasPlane(gold), b.M(mat(3.15, 2.05, -P - 0.07, 0, 0, 0, 2.6, 0.45, 1)), hdr(1.15, 0.95, 0.6));
  const lace = signRect(2.2, 0.32, 120); { const c = ATL.sign.ctx; const g = c.createLinearGradient(lace.x, 0, lace.x + 24, 0); g.addColorStop(0, '#e8dcc4'); g.addColorStop(0.5, '#f6eedc'); g.addColorStop(1, '#e8dcc4'); c.fillStyle = g; for (let x = lace.x; x < lace.x + lace.w; x += 24) { c.save(); c.translate(x - lace.x, 0); c.fillRect(lace.x, lace.y, 24, lace.h); c.restore(); } c.fillStyle = 'rgba(255,255,255,0.9)'; for (let x = lace.x; x < lace.x + lace.w; x += 6) { c.beginPath(); c.arc(x + 3, lace.y + 3, 2.4, 0, TAU); c.fill(); } }
  for (const [x0, x1] of [[1.0, 3.1], [3.2, 5.3], [7.0, 8.2]]) STATIC.get('print', M.print, {}, b.zone).add(atlasPlane(lace), b.M(mat((x0 + x1) / 2, 0.78, -P - 0.12, 0, 0, 0, x1 - x0, 0.32, 1)));
  // the food sample display case
  const cx0 = 7.0, cx1 = 8.3, cz0 = -P, cz1 = -P + 0.42;
  b.box('wood', M.wood, cx0, 0.15, cz0, cx1, 0.78, cz1, new THREE.Color('#3a2418'));
  b.box('wood', M.wood, cx0, 1.62, cz0, cx1, 1.7, cz1, new THREE.Color('#3a2418'));
  STATIC.get('glass', M.glass, { renderOrder: 2 }, b.zone).add(G.plane, b.M(mat((cx0 + cx1) / 2, 1.2, cz1 + 0.005, 0, 0, 0, cx1 - cx0, 0.84, 1)));
  b.box('glowc', M.glow, cx0 + 0.05, 1.56, cz0 + 0.05, cx1 - 0.05, 1.6, cz1 - 0.05, hdr(7, 6.2, 5));
  b.box('glowc', M.glow, cx0 + 0.02, 0.78, cz0, cx1 - 0.02, 1.62, cz0 + 0.02, hdr(0.9, 0.75, 0.6));
  foodSamples(b, cx0, cx1, cz0, cz1);
  // A-frame menu, plants, umbrella stand, the owner's bicycle
  const board = paintBoard(TX.hero.board.slice(0, 4).map((t, i) => i === 0 ? t : t + (i === 2 ? ' ¥900' : i === 3 ? ' ¥650' : '')), { fam: 'round', w: 0.55, h: 0.85 });
  aFrame(b, 1.4, -0.55, board, 0.3);
  plant(b, 0.8, 0.16, -P + 0.35, 1.5); plant(b, W - 0.9, 0.16, -P + 0.35, 1.2);
  umbrellaStand(b, 5.3, -P + 0.3);
  BIKES.push({ p: b.P(8.2, 0.16, -0.9), yaw: b.yaw + Math.PI / 2 + 0.1, lean: 0.04, color: '#2c3e50', basket: true });
  // the projecting sign the man stands beneath
  heroSign(b);
  kissatenInterior(b);
  b.spill(0.4, W - 0.4, '#ffbf78', 0.9, 2.6);
  PRACTICAL.push({ id: 'kissaten', p: b.P(4.0, 2.4, -P - 2.2), color: '#ffb46a' });
};

function foodSamples(b, x0, x1, z0, z1) {
  const sh = [0.82, 1.2];
  const S = (geo, x, y, z, sx, sy, sz, col, ry = 0) => b.add('paintG', M.paintGloss, geo, mat(x, y, z, ry, 0, 0, sx, sy, sz), new THREE.Color(col), { colors: true });
  for (const y of sh) b.box('glassD', M.glassDark, x0 + 0.05, y - 0.012, z0 + 0.05, x1 - 0.05, y, z1 - 0.05);
  const zc = (z0 + z1) / 2;
  // omurice, napolitan, pancakes, cream soda, pudding a la mode, sandwiches
  S(G.sph12, x0 + 0.25, 0.86, zc, 0.22, 0.08, 0.13, '#f2c230'); S(G.sph8, x0 + 0.25, 0.9, zc, 0.12, 0.03, 0.06, '#b8241a');
  S(G.cyl12, x0 + 0.6, 0.85, zc, 0.22, 0.02, 0.22, '#f4f1ea'); S(G.sph12, x0 + 0.6, 0.88, zc, 0.17, 0.06, 0.15, '#d9531e');
  for (let i = 0; i < 3; i++) S(G.cyl12, x0 + 1.0, 0.85 + i * 0.03, zc, 0.15, 0.028, 0.15, '#c98a3a'); S(G.box, x0 + 1.0, 0.95, zc, 0.04, 0.012, 0.04, '#f6e7a1');
  S(G.cyl12, x0 + 0.2, 1.3, zc, 0.07, 0.2, 0.07, '#2bd46a'); S(G.sph8, x0 + 0.2, 1.42, zc, 0.07, 0.05, 0.07, '#fbf6ec'); S(G.sph8, x0 + 0.2, 1.47, zc, 0.025, 0.025, 0.025, '#d1121e');
  S(G.cyl12, x0 + 0.5, 1.26, zc, 0.11, 0.12, 0.11, '#f0c048'); S(G.cyl12, x0 + 0.5, 1.33, zc, 0.09, 0.015, 0.09, '#6a3a12');
  S(G.box, x0 + 0.85, 1.25, zc, 0.12, 0.08, 0.06, '#f5ead0', 0.4); S(G.box, x0 + 1.05, 1.25, zc, 0.12, 0.08, 0.06, '#f5ead0', -0.3);
  S(G.cyl12, x0 + 0.2, 1.27, zc, 0.03, 0.12, 0.03, '#d1121e');
}

function heroSign(b) {
  const x = 4.5, y0 = 3.75, y1 = 7.15, z0 = 0.12, z1 = 0.98, t = 0.3;
  const A = ATL.sign, ppm = 240 * QUALITY.atlas;
  const r = A.alloc((z1 - z0) * ppm, (y1 - y0) * ppm), c = A.ctx;
  const g = c.createLinearGradient(r.x, r.y, r.x, r.y + r.h); g.addColorStop(0, '#f7ecd6'); g.addColorStop(1, '#efdcbc'); c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
  c.strokeStyle = '#7b1b14'; c.lineWidth = r.w * 0.04; c.strokeRect(r.x + r.w * 0.06, r.y + r.w * 0.06, r.w * 0.88, r.h - r.w * 0.12);
  // crescent moon
  c.fillStyle = '#c99a2e'; c.beginPath(); c.arc(r.x + r.w * 0.5, r.y + r.h * 0.11, r.w * 0.2, 0, TAU); c.fill();
  c.fillStyle = '#f7ecd6'; c.beginPath(); c.arc(r.x + r.w * 0.58, r.y + r.h * 0.095, r.w * 0.18, 0, TAU); c.fill();
  drawVText(c, TX.hero.v1, r.x + r.w * 0.2, r.y + r.h * 0.2, r.w * 0.6, r.h * 0.34, { fam: 'retro', weight: 700, color: '#5a1a12' });
  drawVText(c, TX.hero.v2, r.x + r.w * 0.1, r.y + r.h * 0.56, r.w * 0.8, r.h * 0.32, { fam: 'retro', weight: 700, color: '#9b1d16', gap: 0.0 });
  drawText(c, 'COFFEE', r.x, r.y + r.h * 0.9, r.w, r.h * 0.05, { fam: 'latin', weight: 600, color: '#5a1a12', letter: 0.25 });
  const geo = atlasBoxFaces({ px: r, nx: r });
  STATIC.get('signsHot', M.signsHot, {}, b.zone).add(geo, b.M(mat(x, (y0 + y1) / 2, (z0 + z1) / 2, 0, 0, 0, t, y1 - y0, z1 - z0)));
  // brass frame and brackets
  const brass = new THREE.Color('#8a6a2a');
  b.box('metal', M.metal, x - t / 2 - 0.02, y1, z0 - 0.02, x + t / 2 + 0.02, y1 + 0.08, z1 + 0.02, brass);
  b.box('metal', M.metal, x - t / 2 - 0.02, y0 - 0.08, z0 - 0.02, x + t / 2 + 0.02, y0, z1 + 0.02, brass);
  for (const y of [y0 + 0.3, y1 - 0.3]) b.box('metal', M.metal, x - 0.04, y - 0.04, -0.02, x + 0.04, y + 0.04, z0, new THREE.Color('#222'));
  // neon outline on both faces
  for (const s of [-1, 1]) {
    const xx = x + s * (t / 2 + 0.025);
    const pts = [];
    const inset = 0.06;
    const za = z0 + inset, zb = z1 - inset, ya = y0 + inset, yb = y1 - inset, rr = 0.08;
    const corners = [[za + rr, ya], [zb - rr, ya], [zb, ya + rr], [zb, yb - rr], [zb - rr, yb], [za + rr, yb], [za, yb - rr], [za, ya + rr], [za + rr, ya]];
    for (const [zz, yy] of corners) pts.push(b.P(xx, yy, zz));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
    const tube = new THREE.TubeGeometry(curve, 120, 0.012, 6, false);
    STATIC.get('neon', M.neon, { colors: true }, b.zone).add(tube, null, hdr(9, 1.6, 2.2));
  }
  HERO_SIGN.center.copy(b.P(x, (y0 + y1) / 2, (z0 + z1) / 2));
  SIGN_GLOWS.push({ p: b.P(x, (y0 + y1) / 2, 0.6), size: 2.6, color: new THREE.Color('#ffd0a0').multiplyScalar(0.07), hero: true });
  addLight2D(HERO.x, HERO.z, 3.2, '#ffc890', 0.9);
}
const HERO_SIGN = { center: new THREE.Vector3() };

function kissatenInterior(b) {
  const W = b.W, P = b.pilotis;
  const zB = -P - 7.0, zF = -P - 0.12; // back wall and inside of the glass
  const ceilY = 3.0;
  const wainscot = new THREE.Color('#4a2c1c'), paper = new THREE.Color('#d8c49c');
  const nr = { noRefl: true };
  b.quad('wood', M.wood, [0.42, 0.161, zF], [W - 0.42, 0.161, zF], [W - 0.42, 0.161, zB], [0.42, 0.161, zB], [0, 0, 5, 4], new THREE.Color('#5a3828'), nr);
  b.box('paint', M.paint, 0.42, 0.15, zB - 0.1, W - 0.42, ceilY, zB, paper, nr);
  b.box('wood', M.wood, 0.42, 0.15, zB, W - 0.42, 1.1, zB + 0.04, wainscot, nr);
  for (const x of [0.32, W - 0.32]) { b.box('paint', M.paint, x - 0.1, 0.15, zB, x + 0.1, ceilY, zF, paper, nr); }
  b.box('wood', M.wood, 0.42, 0.15, zB, 0.46, 1.1, zF, wainscot, nr); b.box('wood', M.wood, W - 0.46, 0.15, zB, W - 0.42, 1.1, zF, wainscot, nr);
  b.quad('glowc', M.glow, [0.42, ceilY, zB], [W - 0.42, ceilY, zB], [W - 0.42, ceilY, zF], [0.42, ceilY, zF], null, hdr(0.22, 0.15, 0.1), nr);
  for (let z = zF - 0.6; z > zB; z -= 1.2) b.box('wood', M.wood, 0.42, ceilY - 0.12, z - 0.06, W - 0.42, ceilY, z + 0.06, new THREE.Color('#2e1a10'), nr);
  // counter, stools, back shelf with cups, siphon, register, pink phone
  const cz = zB + 1.3;
  b.box('wood', M.wood, 1.8, 0.15, cz - 0.3, 7.6, 1.02, cz + 0.3, new THREE.Color('#4a2a18'), nr);
  b.box('wood', M.wood, 1.7, 1.02, cz - 0.38, 7.7, 1.07, cz + 0.36, new THREE.Color('#7a4a2a'), nr);
  for (const x of [2.5, 3.5, 4.5, 5.5, 6.5]) {
    b.add('metal', M.metal, G.cyl8, mat(x, 0.45, cz + 0.75, 0, 0, 0, 0.05, 0.6, 0.05), new THREE.Color('#b0a080'), nr);
    b.add('paint', M.paint, G.cyl16, mat(x, 0.77, cz + 0.75, 0, 0, 0, 0.38, 0.09, 0.38), new THREE.Color('#8a1a1a'), nr);
  }
  b.box('wood', M.wood, 1.2, 1.2, zB, 7.8, 1.24, zB + 0.3, new THREE.Color('#3a2214'), nr);
  b.box('wood', M.wood, 1.2, 1.75, zB, 7.8, 1.79, zB + 0.3, new THREE.Color('#3a2214'), nr);
  for (let i = 0; i < 22; i++) b.add('paint', M.paintGloss, G.cyl12, mat(1.4 + i * 0.29, 1.3 + (i % 2) * 0.55, zB + 0.15, 0, 0, 0, 0.09, 0.09, 0.09), new THREE.Color(i % 5 === 0 ? '#2a4a6a' : '#f2efe6'), { ...nr, colors: true });
  for (const x of [3.0, 3.4]) { b.add('glassD', M.glassDark, G.sph12, mat(x, 1.25, cz, 0, 0, 0, 0.16, 0.16, 0.16), null, nr); b.add('glassD', M.glassDark, G.cyl12, mat(x, 1.45, cz, 0, 0, 0, 0.1, 0.25, 0.1), null, nr); }
  b.box('paint', M.paintGloss, 6.6, 1.07, cz - 0.2, 7.2, 1.3, cz + 0.15, new THREE.Color('#2a2a2a'), { ...nr, colors: true });
  b.box('paint', M.paintGloss, 7.3, 1.07, cz - 0.1, 7.55, 1.22, cz + 0.1, new THREE.Color('#e88aa8'), { ...nr, colors: true });
  // tables: T1 by the window holds the cream soda for the macro camera
  const table = (x, z, w = 0.7, d = 0.62) => {
    b.box('wood', M.wood, x - w / 2, 0.7, z - d / 2, x + w / 2, 0.74, z + d / 2, new THREE.Color('#5a3420'), nr);
    b.add('metal', M.metal, G.cyl8, mat(x, 0.43, z, 0, 0, 0, 0.06, 0.56, 0.06), new THREE.Color('#2a2a2a'), nr);
    b.add('metal', M.metal, G.cyl16, mat(x, 0.16, z, 0, 0, 0, 0.42, 0.02, 0.42), new THREE.Color('#2a2a2a'), nr);
  };
  const chair = (x, z, yaw) => {
    const m0 = mat(x, 0, z, yaw);
    const add = (geo, m, col) => b.add('paint', M.paint, geo, new THREE.Matrix4().multiplyMatrices(m0, m), new THREE.Color(col), nr);
    add(G.box, mat(0, 0.45, 0, 0, 0, 0, 0.46, 0.1, 0.46), '#7a1414');
    add(G.box, mat(0, 0.78, -0.21, 0, 0, 0, 0.46, 0.6, 0.08), '#7a1414');
    for (const [ox, oz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) add(G.box, mat(ox, 0.25, oz, 0, 0, 0, 0.04, 0.4, 0.04), '#2e1a10');
  };
  const T1 = { x: 3.0, z: -P - 0.55 };
  table(T1.x, T1.z); chair(T1.x + 0.62, T1.z, -Math.PI / 2);   // the other seat is where the macro camera sits
  table(7.0, -P - 0.6); chair(7.0, -P - 1.2, 0);
  table(2.6, -P - 3.2, 0.9, 0.7); chair(2.6, -P - 3.85, 0); chair(2.6, -P - 2.55, Math.PI);
  table(6.4, -P - 3.2, 0.9, 0.7); chair(6.4, -P - 3.85, 0); chair(6.4, -P - 2.55, Math.PI);
  // the macro subjects
  creamSoda(b, T1.x - 0.12, 0.74, T1.z + 0.08);
  coffeeCup(b, T1.x + 0.16, 0.74, T1.z - 0.06);
  b.add('paintG', M.paintGloss, G.cyl12, mat(T1.x + 0.02, 0.78, T1.z + 0.2, 0, 0, 0, 0.07, 0.08, 0.07), new THREE.Color('#e9e2d2'), { ...nr, colors: true });
  EMITTERS.push({ p: b.P(T1.x + 0.16, 0.83, T1.z - 0.06), dir: V3(0, 1, 0), spread: 0.02, rate: 1.4, size: 0.07, life: 3.2, rise: 0.12, color: [1, 1, 1], dens: 0.42, kind: 'wisp', indoor: true });
  MACRO.t1.copy(b.P(T1.x, 0.74, T1.z));
  MACRO.soda.copy(b.P(T1.x - 0.12, 0.92, T1.z + 0.08));
  MACRO.cup.copy(b.P(T1.x + 0.16, 0.8, T1.z - 0.06));
  // Tiffany lamps
  const glass = ['#e8a33a', '#d9532a', '#2f7a5a', '#b8324a'];
  [[T1.x, T1.z], [7.0, -P - 0.6], [2.6, -P - 3.2], [6.4, -P - 3.2]].forEach(([x, z], i) => {
    b.add('glowc', M.glow, G.sph12, mat(x, 2.15, z, 0, 0, 0, 0.42, 0.22, 0.42), new THREE.Color(glass[i]).multiplyScalar(3.2), { colors: true, ...nr });
    b.add('metal', M.metal, G.cyl6, mat(x, 2.62, z, 0, 0, 0, 0.012, 0.75, 0.012), new THREE.Color('#2a2a2a'), nr);
    b.add('glowc', M.glow, G.sph8, mat(x, 2.06, z, 0, 0, 0, 0.12, 0.08, 0.12), hdr(10, 7, 3.6), { colors: true, ...nr });
  });
  // a clock and a dark painting on the back wall
  b.box('wood', M.wood, 7.9, 1.9, zB, 8.3, 2.7, zB + 0.12, new THREE.Color('#3a2214'), nr);
  b.add('paint', M.paint, G.cyl16, mat(8.1, 2.45, zB + 0.13, 0, Math.PI / 2, 0, 0.3, 0.01, 0.3), new THREE.Color('#efe6d0'), nr);
  b.box('paint', M.paint, 0.8, 1.6, zB + 0.01, 1.9, 2.4, zB + 0.05, new THREE.Color('#2a2418'), nr);
  // people: the master, a man with a newspaper, a woman reading at the back
  SPOTS.push({ p: b.P(4.6, 0.16, zB + 0.65), yaw: b.yaw, pose: 'polish', role: 'master', top: '#f2efe8', bottom: '#1a1a1a', hair: '#bdb8b0', vest: true });
  SPOTS.push({ p: b.P(7.0, 0.16, -P - 1.2), yaw: b.yaw, pose: 'newspaper', seatH: 0.48, role: 'oldman', top: '#5a5248', bottom: '#3a3530', hair: '#d0ccc4' });
  SPOTS.push({ p: b.P(2.6, 0.16, -P - 3.85), yaw: b.yaw, pose: 'readsit', seatH: 0.48, role: 'reader', top: '#a63d40', bottom: '#2b2b2b', hair: '#1a1410', long: true });
}
const MACRO = { t1: new THREE.Vector3(), soda: new THREE.Vector3(), cup: new THREE.Vector3() };

// The macro subjects: a cream soda in a footed glass, and a coffee on its saucer.
const SODA_GEO = {};
function sodaGeometry() {
  const G2 = SODA_GEO;
  G2.glass = lathe([[0.034, 0], [0.034, 0.006], [0.009, 0.01], [0.008, 0.05], [0.02, 0.058], [0.036, 0.08], [0.043, 0.11], [0.045, 0.17], [0.047, 0.2]], 32);
  G2.foot = lathe([[0.001, 0], [0.034, 0], [0.034, 0.006], [0.009, 0.01], [0.008, 0.05], [0.02, 0.058], [0.001, 0.058]], 24);
  G2.soda = lathe([[0.001, 0.06], [0.019, 0.061], [0.034, 0.08], [0.0405, 0.11], [0.0425, 0.165], [0.001, 0.165]], 28);
  const p = G2.soda.attributes.position, col = new Float32Array(p.count * 3);   // deep green at the stem, bright at the top
  for (let i = 0; i < p.count; i++) { const t = sstep(0.06, 0.165, p.getY(i)); col[i * 3] = lerp(0.03, 0.25, t); col[i * 3 + 1] = lerp(0.35, 1.0, t); col[i * 3 + 2] = lerp(0.08, 0.32, t); }
  G2.soda.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const sc = new THREE.SphereGeometry(1, 22, 16), q = sc.attributes.position;       // a scoop with a scooped, lumpy surface
  for (let i = 0; i < q.count; i++) { const vx = q.getX(i), vy = q.getY(i), vz = q.getZ(i), n = 1 + 0.07 * Math.sin(vx * 9 + vy * 4) * Math.sin(vz * 8 - vy * 6) + 0.04 * Math.sin(vx * 17 + vz * 13); q.setXYZ(i, vx * n, vy * n * (vy < -0.3 ? 0.7 : 1), vz * n); }
  sc.computeVertexNormals();
  G2.scoop = sc;
  G2.ring = new THREE.TorusGeometry(0.03, 0.007, 8, 24).rotateX(-Math.PI / 2);
  G2.cup = lathe([[0.001, 0.008], [0.028, 0.008], [0.03, 0.012], [0.04, 0.03], [0.044, 0.06], [0.046, 0.075], [0.043, 0.075], [0.04, 0.058], [0.036, 0.03], [0.001, 0.028]], 28);
  G2.saucer = lathe([[0.001, 0], [0.05, 0], [0.072, 0.008], [0.076, 0.014], [0.07, 0.012], [0.05, 0.006], [0.001, 0.006]], 32);
  G2.handle = new THREE.TorusGeometry(0.016, 0.0045, 8, 16, Math.PI * 1.2);
}
function creamSoda(b, x, y, z) {
  const nr = { noRefl: true, colors: true };
  if (!SODA_GEO.glass) sodaGeometry();
  const G2 = SODA_GEO;
  b.add('paintG', M.paintGloss, G2.saucer, mat(x, y, z), new THREE.Color('#f2eee6'), nr);
  b.add('paintG', M.paintGloss, G2.foot, mat(x, y + 0.006, z), new THREE.Color('#dfe6e3'), nr);
  b.add('glowc', M.glow, G2.soda, mat(x, y + 0.006, z), hdr(0.95, 0.95, 0.95), nr);
  for (let i = 0; i < 34; i++) {                                                 // bubbles clinging to the inside of the glass
    const h = 0.07 + (i * 0.618 % 1) * 0.09, a = i * 2.39, r = (h < 0.08 ? 0.028 : h < 0.11 ? 0.038 : 0.041) - 0.001;
    b.add('glowc', M.glow, G.sph8, mat(x + Math.sin(a) * r, y + 0.006 + h, z + Math.cos(a) * r, 0, 0, 0, 0.0024 + (i % 3) * 0.0008, 0.0024 + (i % 3) * 0.0008, 0.0024 + (i % 3) * 0.0008), hdr(1.5, 2.1, 1.6), nr);
  }
  b.add('paintG', M.paintGloss, new THREE.TorusGeometry(0.047, 0.0016, 6, 40).rotateX(-Math.PI / 2), mat(x, y + 0.206, z), new THREE.Color('#e9eeee'), nr);   // the glass lip catching the light
  STATIC.get('glass', M.glass, { renderOrder: 2 }, b.zone).add(G2.glass, b.M(mat(x, y + 0.006, z)));
  b.add('paintG', M.paintGloss, G2.ring, mat(x, y + 0.172, z), new THREE.Color('#e8eedd'), nr);
  b.add('paint', M.paint, G2.scoop, mat(x, y + 0.196, z, 0, 0, 0, 0.042, 0.034, 0.042), new THREE.Color('#fbf1da'), nr);
  b.add('paintG', M.paintGloss, G.sph16, mat(x + 0.008, y + 0.24, z - 0.004, 0, 0, 0, 0.024, 0.023, 0.024), new THREE.Color('#b30f1c'), nr);
  b.add('paint', M.paint, G.cyl6, mat(x + 0.012, y + 0.258, z - 0.006, 0, 0.2, -0.5, 0.002, 0.026, 0.002), new THREE.Color('#5a1a10'), nr);
  // a striped straw and a long soda spoon
  const pivot = mat(x - 0.022, y + 0.126, z + 0.012, 0, 0.22, 0.12);
  for (let k = 0; k < 8; k++) b.add('paint', M.paint, G.cyl8, new THREE.Matrix4().multiplyMatrices(pivot, mat(0, -0.075 + k * 0.03, 0, 0, 0, 0, 0.0075, 0.03, 0.0075)), new THREE.Color(k % 2 ? '#f4f0ea' : '#d6262c'), nr);
  b.add('metal', M.metal, G.box, mat(x + 0.024, y + 0.156, z + 0.016, 0, -0.18, -0.16, 0.004, 0.24, 0.002), new THREE.Color('#d4d6d8'), nr);
  BUBBLES.push(b.P(x, y + 0.076, z));
}
function coffeeCup(b, x, y, z) {
  const nr = { noRefl: true, colors: true };
  if (!SODA_GEO.glass) sodaGeometry();
  const G2 = SODA_GEO;
  b.add('paintG', M.paintGloss, G2.saucer, mat(x, y, z), new THREE.Color('#f2eee6'), nr);
  b.add('paintG', M.paintGloss, G2.cup, mat(x, y, z), new THREE.Color('#f2eee6'), nr);
  b.add('paintG', M.paintGloss, G.cyl24, mat(x, y + 0.066, z, 0, 0, 0, 0.082, 0.003, 0.082), new THREE.Color('#2a140a'), nr);
  b.add('paintG', M.paintGloss, G2.handle, mat(x + 0.05, y + 0.047, z, 0, 0, -Math.PI * 0.6), new THREE.Color('#f2eee6'), nr);
  b.add('metal', M.metal, G.box, mat(x - 0.02, y + 0.016, z + 0.06, 0.3, 0, 0, 0.09, 0.004, 0.012), new THREE.Color('#c9c9c9'), nr);
}
const BUBBLES = [];

SHOP.soba = (b) => {
  const W = b.W;
  const f = paintFascia(TX.soba.name, { w: W - 0.6, h: 0.8, bg: '#ffd21f', fg: '#1a1a1a', fam: 'heavy', sub: TX.soba.sub, subColor: '#b3121e' });
  const s = shopShell(b, { fascia: f, fasciaMat: M.signsHot, interior: 'soba', depth: 4.5, bright: 1.6, spill: '#ffe6a8', spillK: 1.1, fasciaH: 0.85, glow: '#fff0a0' });
  const nr = paintNoren(TX.soba.sub, { w: 1.6, h: 0.5, bg: '#1b2b4a', panels: 2 });
  STATIC.get('noren', M.noren, {}, b.zone).add(remapUV(new THREE.PlaneGeometry(1, 1, 5, 3), nr), b.M(mat(1.4, s.top - 0.27, 0.05, 0, 0, 0, 1.6, 0.5, 1)));
  b.box('paint', M.paintGloss, W - 1.2, 0.15, 0.05, W - 0.6, 1.6, 0.6, new THREE.Color('#d9dcde'));
  b.box('glowc', M.glow, W - 1.15, 0.95, 0.61, W - 0.65, 1.5, 0.62, hdr(2.4, 2.2, 1.6));
  b.box('wood', M.wood, 0.6, 0.15, -2.6, W - 1.0, 1.05, -2.2, new THREE.Color('#8a6a3a'), { noRefl: true });
  EMITTERS.push({ p: b.P(W * 0.6, b.gh + 0.3, 0.3), dir: V3(0, 1, 0), spread: 0.25, rate: 0.6, size: 0.8, life: 4, rise: 0.5, color: [1, 0.96, 0.9], dens: 0.35, kind: 'steam' });
  SPOTS.push({ p: b.P(2.2, 0.16, -1.85), yaw: b.yaw + Math.PI, pose: 'eatstand', role: 'soba1', phase: 0.3 });
  SPOTS.push({ p: b.P(4.0, 0.16, -1.85), yaw: b.yaw + Math.PI, pose: 'eatstand', role: 'soba2', phase: 1.9 });
  SPOTS.push({ p: b.P(3.2, 0.16, -3.1), yaw: b.yaw, pose: 'cook', role: 'sobaStaff', top: '#f2efe8', bottom: '#2b2b2b', towel: true });
  PRACTICAL.push({ id: 'soba', p: b.P(W / 2, 2.8, 1.2), color: '#ffe0a0' });
};

SHOP.bar = (b) => {
  const W = b.W;
  const name = TX.tenants[16];
  const f = paintFascia(name, { w: W - 0.6, h: 0.6, bg: '#0e0c0c', fg: '#e8b86a', fam: 'mincho', letter: 0.2 });
  shopShell(b, { fascia: f, interior: 'bar', bright: 0.9, spill: '#ffb070', spillK: 0.5, x1: W * 0.6, fasciaH: 0.6 });
  b.box('wood', M.wood, W * 0.62, 0.15, -0.3, W - 0.35, 2.3, -0.24, new THREE.Color('#2a1a12'));
  b.box('glowc', M.glow, W * 0.62 + 0.1, 2.35, -0.25, W - 0.45, 2.5, -0.15, hdr(3, 2.2, 1.2));
};

SHOP.koban = (b) => {
  // E11 itself is set back; the police box stands at the corner in front of it
  const W = b.W, gh = b.gh;
  shopShell(b, { interior: 'default', bright: 0.8, spill: '#fff1dc', spillK: 0.4, fasciaH: 0.5 });
  const x0 = 0.5, x1 = 4.3, z0 = 0.4, z1 = 4.0, h = 3.0;
  const wall = new THREE.Color('#e9e6de');
  b.box('concrete', M.concrete, x0, 0.15, z0, x1, h, z1, wall);
  // hipped roof
  b.add('paint', M.paint, G.pyr, mat((x0 + x1) / 2, h + 0.5, (z0 + z1) / 2, 0, 0, 0, x1 - x0 + 0.6, 1.0, z1 - z0 + 0.6), new THREE.Color('#3c4248'));
  b.box('paint', M.paint, x0 - 0.3, h - 0.05, z0 - 0.3, x1 + 0.3, h + 0.05, z1 + 0.3, new THREE.Color('#3c4248'));
  // the face toward the street (+z): glass door, sign, red lamp
  STATIC.get('glass', M.glass, { renderOrder: 2 }, b.zone).add(G.plane, b.M(mat((x0 + x1) / 2, 1.2, z1 + 0.01, 0, 0, 0, 2.2, 2.0, 1)));
  b.box('glowc', M.glow, (x0 + x1) / 2 - 1.05, 0.2, z1 - 0.3, (x0 + x1) / 2 + 1.05, 2.15, z1 - 0.28, hdr(1.5, 1.45, 1.3));
  const ks = paintFascia(TX.koban, { w: 1.4, h: 0.45, bg: '#ffffff', fg: '#111111', fam: 'gothic', sub: 'KOBAN · POLICE', subColor: '#1f3f8a', ppm: 140 });
  STATIC.get('signs', M.signs, {}, b.zone).add(atlasPlane(ks), b.M(mat((x0 + x1) / 2, 2.55, z1 + 0.02, 0, 0, 0, 1.4, 0.45, 1)));
  const lampP = b.P((x0 + x1) / 2, 2.95, z1 + 0.2);
  b.add('glowc', M.glow, G.sph16, mat((x0 + x1) / 2, 2.95, z1 + 0.22, 0, 0, 0, 0.3, 0.3, 0.3), hdr(14, 0.8, 0.5), { colors: true });
  KOBAN_LAMP.copy(lampP);
  addLight2D(lampP.x, lampP.z, 4.5, '#ff3020', 0.6);
  // notice board: today's traffic accidents
  const board = paintBoard([TX.kobanBoard[0], TX.kobanBoard[1] + '  0  ' + TX.kobanBoard[3], TX.kobanBoard[2] + '  2  ' + TX.kobanBoard[3]], { fam: 'gothic', bg: '#f4f4f0', fg: '#222', title: '#1f3f8a', frame: '#8a8f93', w: 0.7, h: 0.6 });
  STATIC.get('print', M.print, {}, b.zone).add(atlasPlane(board), b.M(mat(x1 + 0.02, 1.5, (z0 + z1) / 2, Math.PI / 2, 0, 0, 0.7, 0.6, 1)));
  BIKES.push({ p: b.P(x1 + 0.45, 0.15, z1 - 0.4), yaw: b.yaw, lean: 0.05, color: '#f2f2f0', basket: true, police: true });
  SPOTS.push({ p: b.P((x0 + x1) / 2 + 1.3, 0.15, z1 + 0.45), yaw: b.yaw, pose: 'guard', role: 'police', top: '#1e2a44', bottom: '#1e2a44', cap: true });
  COLLIDERS.push(new THREE.Box3().setFromPoints([b.P(x0, 0, z0), b.P(x1, h + 1, z1)]));
  MAP_BLOCKS.push((() => { const p0 = b.P(x0, 0, z0), p1 = b.P(x1, 0, z1); return { x0: Math.min(p0.x, p1.x), x1: Math.max(p0.x, p1.x), z0: Math.min(p0.z, p1.z), z1: Math.max(p0.z, p1.z), h }; })());
  PRACTICAL.push({ id: 'koban', p: lampP.clone(), color: '#ff3a2a' });
};
const KOBAN_LAMP = new THREE.Vector3();

SHOP.gyudon = (b) => {
  const f = paintFascia(TX.gyudon, { w: b.W - 0.6, h: 0.85, bg: '#f39a12', fg: '#5a1a08', fam: 'heavy', sub: TX.gyudonSub + ' · 24H', subColor: '#ffffff', textW: 0.5, align: 'left' });
  shopShell(b, { fascia: f, fasciaMat: M.signsHot, interior: 'gyudon', bright: 1.7, spill: '#ffd28a', spillK: 1.2, fasciaH: 0.9, glow: '#ffc060' });
};
