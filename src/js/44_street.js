/* ============================================================
   Street: ground, kerbs, markings, poles and the cable web,
   shōtengai lamps, signals, the arch, signs, parked bicycles
   ============================================================ */

const BIKES = [];
const BIKE_COLORS = ['#c9cdd0', '#2c3e50', '#8e2b2b', '#e9e6dc', '#1f4f7a', '#3a5a40', '#d8c3a5', '#151515', '#b85c38', '#7a8b99'];
const SCOOTERS = [];
const POLES = [];
// posts and poles: obstacles for camera moves, though not walls to stare at
const thinCollider = (x, z, r, h) => COLLIDERS.push(Object.assign(new THREE.Box3(V3(x - r, 0, z - r), V3(x + r, h, z + r)), { thin: true }));
const LAMPS = [];        // shōtengai lamp heads (world positions)
const SIGNAL_HEADS = []; // traffic signal lamps, animated
const PARKED = [];       // parked vehicles (built by the vehicles module)
const STREET_GLOWS = []; // extra halo points

/* ---------- signal timing (60 s cycle) ---------- */
const SIG = {
  phase: t => ((t % 60) + 60) % 60,
  A: t => { const p = SIG.phase(t); return p < 24 ? 'G' : p < 27 ? 'Y' : 'R'; },                       // main street traffic
  B: t => { const p = SIG.phase(t); return p >= 29 && p < 53 ? 'G' : p >= 53 && p < 56 ? 'Y' : 'R'; },  // cross street traffic
  pedMain: t => { const p = SIG.phase(t); return p >= 29 && p < 49 ? 'W' : p >= 49 && p < 53 ? 'F' : 'D'; },   // crossing the main street
  pedCross: t => { const p = SIG.phase(t); return p < 20 ? 'W' : p < 24 ? 'F' : 'D'; },                        // crossing the cross street
};

function gquad(key, m, x0, z0, x1, z1, y, tile, color, opts = {}) {
  const zone = zoneOf((z0 + z1) / 2);
  STATIC.get(key, m, { noRefl: true, ...opts }, zone).addQuad(V3(x0, y, z1), V3(x1, y, z1), V3(x1, y, z0), V3(x0, y, z0), [x0 / tile, -z1 / tile, x1 / tile, -z0 / tile], color);
}
function wbox(key, m, x0, y0, z0, x1, y1, z1, color, opts = {}) {
  STATIC.get(key, m, opts, zoneOf((z0 + z1) / 2)).add(G.box, boxM(x0, y0, z0, x1, y1, z1), color);
}
function wadd(key, m, geo, matrix, color, opts = {}) {
  const p = V3().setFromMatrixPosition(matrix);
  STATIC.get(key, m, opts, zoneOf(p.z)).add(geo, matrix, color);
}
// Unit cylinder (G.cyl*) placed between two points.
function cylBetween(a, b, r) {
  const d = _v1.subVectors(b, a); const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
  return new THREE.Matrix4().compose(V3().addVectors(a, b).multiplyScalar(0.5), q, V3(r * 2, len, r * 2));
}

/* ---------- ground ---------- */
function buildGround() {
  const N = 110, S = -170;
  // main road (split around the intersection), cross street, side street
  gquad('road', M.asphalt, -ROAD_HW, CROSS.r1, ROAD_HW, N, 0, 4);
  gquad('road', M.asphalt, -ROAD_HW, S, ROAD_HW, CROSS.r0, 0, 4);
  gquad('road', M.asphalt, -260, CROSS.r0, 260, CROSS.r1, 0, 4);
  gquad('road2', M.asphaltPlain, -60, 50.3, -FRONT_X, 55.7, 0, 4);
  // sidewalks: pavers with a yellow guide strip, kerbs of granite
  for (const s of [-1, 1]) {
    const spans = s < 0 ? [[CROSS.s1, 50], [56, N], [S, CROSS.s0]] : [[CROSS.s1, N], [S, CROSS.s0]];
    for (const [z0, z1] of spans) {
      const a = s * 3.43, b = s * 4.5, c = s * 4.8, d = s * FRONT_X;
      gquad('pav', M.pavers, Math.min(a, b), z0, Math.max(a, b), z1, CURB_H, 2);
      gquad('tact', M.tactile, Math.min(b, c), z0, Math.max(b, c), z1, CURB_H, 0.3);
      gquad('pav', M.pavers, Math.min(c, d), z0, Math.max(c, d), z1, CURB_H, 2);
      wbox('curb', M.curb, Math.min(s * ROAD_HW, a), -0.05, z0, Math.max(s * ROAD_HW, a), CURB_H + 0.02, z1, null, { noRefl: true });
    }
    // cross street sidewalks
    for (const [z0, z1] of [[CROSS.r1, CROSS.s1], [CROSS.s0, CROSS.r0]]) {
      const xa = s * ROAD_HW, xb = s * 260;
      gquad('pav', M.pavers, Math.min(xa, xb), z0, Math.max(xa, xb), z1, CURB_H, 2);
      const kz = z0 === CROSS.r1 ? [CROSS.r1, CROSS.r1 + 0.18] : [CROSS.r0 - 0.18, CROSS.r0];
      wbox('curb', M.curb, Math.min(xa, xb), -0.05, kz[0], Math.max(xa, xb), CURB_H + 0.02, kz[1], null, { noRefl: true });
    }
  }
  // the coin parking (east, z -29..-19), the shrine plot (west, z -27..-21), the alley floor
  gquad('road2', M.asphaltPlain, FRONT_X, -29, 21, -19, 0.06, 4);
  gquad('gravel', M.gravel, -16, -27, -FRONT_X, -21, 0.12, 2);
  gquad('alley', M.concreteWet, FRONT_X, ALLEY.z0, ALLEY.x1, ALLEY.z1, CURB_H, 3);
  // everything else: a wide wet plane for the back streets
  gquad('far', M.asphaltPlain, -900, -900, 900, 900, -0.06, 6);
}

/* ---------- road decals ---------- */
function paintDecals() {
  const A = ATL.sign, c = A.ctx;
  const R = {};
  R.stop = signRect(2.4, 1.2, 60); drawText(c, TX.stop, R.stop.x, R.stop.y, R.stop.w, R.stop.h, { fam: 'gothic', weight: 900, color: '#f2f2ee', letter: 0.1 });
  R.thirty = signRect(1.2, 3.0, 50); drawText(c, '30', R.thirty.x, R.thirty.y, R.thirty.w, R.thirty.h, { fam: 'latin', weight: 600, color: '#f2f2ee' });
  R.diamond = signRect(1.6, 5.0, 30); c.strokeStyle = '#f2f2ee'; c.lineWidth = R.diamond.w * 0.09;
  c.beginPath(); c.moveTo(R.diamond.x + R.diamond.w / 2, R.diamond.y + 4); c.lineTo(R.diamond.x + R.diamond.w - 4, R.diamond.y + R.diamond.h / 2); c.lineTo(R.diamond.x + R.diamond.w / 2, R.diamond.y + R.diamond.h - 4); c.lineTo(R.diamond.x + 4, R.diamond.y + R.diamond.h / 2); c.closePath(); c.stroke();
  R.bike = signRect(0.7, 1.5, 80);
  { const r = R.bike; c.fillStyle = '#2f6fd1'; c.beginPath(); c.moveTo(r.x + r.w / 2, r.y + 2); c.lineTo(r.x + r.w - 2, r.y + r.h * 0.3); c.lineTo(r.x + r.w * 0.65, r.y + r.h * 0.3); c.lineTo(r.x + r.w * 0.65, r.y + r.h * 0.45); c.lineTo(r.x + r.w * 0.35, r.y + r.h * 0.45); c.lineTo(r.x + r.w * 0.35, r.y + r.h * 0.3); c.lineTo(r.x + 2, r.y + r.h * 0.3); c.closePath(); c.fill();
    c.strokeStyle = '#f2f2ee'; c.lineWidth = r.w * 0.06; c.beginPath(); c.arc(r.x + r.w * 0.5, r.y + r.h * 0.62, r.w * 0.16, 0, TAU); c.stroke(); c.beginPath(); c.arc(r.x + r.w * 0.5, r.y + r.h * 0.88, r.w * 0.16, 0, TAU); c.stroke(); }
  R.manhole = signRect(0.7, 0.7, 240);
  { const r = R.manhole, cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = r.w / 2 - 2;
    c.fillStyle = '#4b4d50'; c.beginPath(); c.arc(cx, cy, rad, 0, TAU); c.fill();
    c.strokeStyle = '#2a2b2d'; c.lineWidth = r.w * 0.025; c.beginPath(); c.arc(cx, cy, rad * 0.92, 0, TAU); c.stroke();
    for (let i = 0; i < 7; i++) { c.beginPath(); c.arc(cx, cy + rad * 0.5, rad * (0.15 + i * 0.1), Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
    c.fillStyle = '#5c5e61'; roundRect(c, cx - rad * 0.16, cy - rad * 0.62, rad * 0.32, rad * 0.5, rad * 0.12); c.fill(); c.stroke();
    drawText(c, TX.station, cx - rad * 0.4, cy + rad * 0.02, rad * 0.8, rad * 0.3, { fam: 'gothic', weight: 900, color: '#2c2d30' });
    for (let k = 0; k < 900; k++) { const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * rad; c.fillStyle = `rgba(${Math.random() < 0.5 ? '20,20,20' : '120,120,120'},0.35)`; c.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.5, 1.5); } }
  R.grate = signRect(0.45, 0.7, 120);
  { const r = R.grate; c.fillStyle = '#2b2c2e'; c.fillRect(r.x, r.y, r.w, r.h); c.fillStyle = '#0a0a0b'; for (let y = r.y + 4; y < r.y + r.h - 4; y += 6) c.fillRect(r.x + 4, y, r.w - 8, 3); }
  return R;
}
function decal(rect, x, z, w, l, yaw, color, y = 0.004) {
  const m = mat(x, y, z, yaw, -Math.PI / 2, 0, w, l, 1);
  STATIC.get('decalR', M.roadDecal, { noRefl: true, colors: true }, zoneOf(z)).add(atlasPlane(rect), m, color || new THREE.Color(1, 1, 1));
}
function buildDecals() {
  const R = paintDecals();
  for (const z of [-21, -6]) decal(R.diamond, -1.6, z, 1.5, 4.6, 0);
  for (const z of [-62, -76]) decal(R.diamond, 1.6, z, 1.5, 4.6, Math.PI);
  decal(R.thirty, -1.6, 22, 1.1, 2.8, Math.PI); decal(R.thirty, 1.6, -66, 1.1, 2.8, 0);
  decal(R.stop, -8.6, 53.0, 2.0, 1.0, -Math.PI / 2);
  for (let z = 60; z > -165; z -= 15) { if (z < -28 && z > -52) continue; decal(R.bike, -2.62, z, 0.6, 1.3, Math.PI); decal(R.bike, 2.62, z + 7, 0.6, 1.3, 0); }
  for (const [x, z] of [[-1.15, 12.3], [1.0, -17.6], [0.35, 28.5], [-0.6, -63], [1.3, 55], [-1.2, -92]]) decal(R.manhole, x, z, 0.64, 0.64, x * 3, new THREE.Color(1, 1, 1), 0.005);
  for (let z = 58; z > -160; z -= 9.1) { if (z < -30 && z > -50) continue; decal(R.grate, -3.02, z, 0.36, 0.62, 0, null, 0.006); decal(R.grate, 3.02, z + 3, 0.36, 0.62, 0, null, 0.006); }
}

/* ---------- utility poles and the cable web ---------- */
function paintGuard() {
  const c = makeCanvas(64, 64), g = c.getContext('2d');
  g.fillStyle = '#e8c21a'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#151515';
  for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 8, 0); g.lineTo(i + 8 + 64, 64); g.lineTo(i + 64, 64); g.fill(); }
  TEX.guard = canvasTex(c, { repeat: true });
}
const POLE_SPEC = {
  W: [107, 77, 47, 17.5, -11.5, -31.8, -60, -90, -120, -150],
  E: [93, 63, 33, 3.2, -25.5, -55, -85, -115, -145],
};
function buildPoles() {
  paintGuard();
  M.guard = std({ map: TEX.guard, roughness: 0.6 });
  const concrete = new THREE.Color('#a19f99');
  const grey = new THREE.Color('#7d8183');
  const ads = TX.poleAds;
  let adI = 0;
  for (const side of ['W', 'E']) {
    const s = side === 'E' ? 1 : -1, x = s * 3.55;
    for (const z of POLE_SPEC[side]) {
      const pole = { x, z, side, top: 11.6, arms: [] };
      POLES.push(pole);
      thinCollider(x, z, 0.2, 12.1);
      const zone = zoneOf(z);
      STATIC.get('conc', M.concrete, { colors: true }, zone).add(G.cyl12, mat(x, 6.0, z, 0, 0, 0, 0.32, 12.0, 0.32), concrete);
      STATIC.get('conc', M.concrete, { colors: true }, zone).add(G.cyl12, mat(x, 11.95, z, 0, 0, 0, 0.26, 0.1, 0.26), concrete.clone().multiplyScalar(0.8));
      STATIC.get('guard', M.guard, {}, zone).add(G.cyl12, mat(x, CURB_H + 0.9, z, 0, 0, 0, 0.36, 1.8, 0.36));
      // high-voltage crossarm with insulators
      wadd('metal', M.metal, G.box, mat(x, 11.2, z, 0, 0, 0, 1.7, 0.1, 0.1), grey, { colors: true });
      for (const o of [-0.7, 0, 0.7]) wadd('paintG', M.paintGloss, G.cyl8, mat(x + o, 11.33, z, 0, 0, 0, 0.09, 0.16, 0.09), new THREE.Color('#e8e4da'), { colors: true });
      // low-voltage rack, telecom clamps, step bolts
      wadd('metal', M.metal, G.box, mat(x - s * 0.22, 9.8, z, 0, 0, 0, 0.08, 0.6, 0.08), grey, { colors: true });
      for (let y = 2.4; y < 9; y += 0.45) wadd('metal', M.metal, G.cyl6, mat(x, y, z, (Math.floor(y / 0.45) % 2) * Math.PI / 2, 0, Math.PI / 2, 0.025, 0.42, 0.025), grey, { colors: true });
      if (chance(0.55)) {
        wadd('paint', M.paint, G.cyl12, mat(x + s * 0.42, 8.6, z, 0, 0, 0, 0.62, 1.1, 0.62), new THREE.Color('#8f9496'), { colors: true });
        wadd('metal', M.metal, G.box, mat(x + s * 0.22, 8.6, z, 0, 0, 0, 0.18, 0.9, 0.12), grey, { colors: true });
        for (const o of [-0.15, 0.15]) wadd('paintG', M.paintGloss, G.cyl8, mat(x + s * 0.42 + o, 9.25, z, 0, 0, 0, 0.06, 0.2, 0.06), new THREE.Color('#e8e4da'), { colors: true });
      }
      // a slack coil of telecom cable on the pole
      wadd('cableK', M.cable, new THREE.TorusGeometry(0.28, 0.025, 4, 18), mat(x - s * 0.25, 7.3, z, 0, 0, 0, 1, 1, 1));
      // advertising plate and address plate facing along the street
      const ad = ads[adI++ % ads.length];
      const pr = paintVSign(ad, { w: 0.34, h: 1.4, bg: pick(['#f6f6f2', '#1f5fa8', '#2a7a4a', '#f2d23c']), fg: pick(['#c0392b', '#111', '#fff']), fam: 'gothic', ppm: 120 });
      for (const dz of [0.2, -0.2]) STATIC.get('print', M.print, {}, zone).add(atlasPlane(pr), mat(x, CURB_H + 2.75, z + dz, dz > 0 ? 0 : Math.PI, 0, 0, 0.34, 1.4, 1));
      const addr = paintFascia(TX.address + (Math.abs(z | 0) % 20 + 1), { w: 0.45, h: 0.14, bg: '#1f4f9a', fg: '#ffffff', fam: 'gothic', ppm: 160 });
      STATIC.get('print', M.print, {}, zone).add(atlasPlane(addr), mat(x, CURB_H + 1.95, z + 0.19, 0, 0, 0, 0.42, 0.13, 1));
    }
  }
  // fire hydrant marker on the west sidewalk
  const hr = paintFascia(TX.hydrant, { w: 0.6, h: 0.32, bg: '#d0101a', fg: '#ffffff', fam: 'gothic', ppm: 140 });
  wadd('metal', M.metal, G.cyl6, mat(-3.6, 1.4, 30.2, 0, 0, 0, 0.06, 2.6, 0.06), new THREE.Color('#d0101a'), { colors: true });
  for (const dz of [0.04, -0.04]) wadd('print', M.print, atlasPlane(hr), mat(-3.6, 2.5, 30.2 + dz, dz > 0 ? 0 : Math.PI, 0, 0, 0.6, 0.32, 1));
  wadd('paint', M.paint, G.cyl12, mat(-4.2, CURB_H + 0.005, 30.6, 0, 0, 0, 0.5, 0.012, 0.5), new THREE.Color('#d0101a'), { colors: true });
}

const CABLES = [];
function catenary(a, b, sag, r, seg = 18) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const p = V3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  CABLES.push({ pts, r });
}
function buildCables() {
  const bySide = { W: POLES.filter(p => p.side === 'W').sort((a, b) => b.z - a.z), E: POLES.filter(p => p.side === 'E').sort((a, b) => b.z - a.z) };
  reseed(4242);
  for (const side of ['W', 'E']) {
    const arr = bySide[side], s = side === 'E' ? 1 : -1;
    for (let i = 0; i < arr.length - 1; i++) {
      const A = arr[i], B = arr[i + 1];
      for (const o of [-0.7, 0, 0.7]) catenary(V3(A.x + o, 11.38, A.z), V3(B.x + o, 11.38, B.z), 0.32, 0.009);
      for (const o of [-0.1, 0.12]) catenary(V3(A.x - s * 0.26 + o * 0.2, 9.8 + o, A.z), V3(B.x - s * 0.26 + o * 0.2, 9.8 + o, B.z), 0.42, 0.011);
      for (const [o, y, r] of [[0.12, 7.6, 0.022], [-0.1, 7.15, 0.028], [0.0, 6.7, 0.018]]) catenary(V3(A.x + o, y, A.z), V3(B.x + o, y, B.z), rnd(0.45, 0.7), r);
    }
  }
  // across the street: each west pole to the nearest east poles
  for (const A of bySide.W) {
    const near = bySide.E.slice().sort((p, q) => Math.abs(p.z - A.z) - Math.abs(q.z - A.z)).slice(0, 2);
    for (const B of near) {
      if (Math.abs(B.z - A.z) > 34) continue;
      catenary(V3(A.x, 7.4, A.z), V3(B.x, 7.3, B.z), 0.55, 0.016);
      if (chance(0.6)) catenary(V3(A.x, 9.6, A.z), V3(B.x, 9.6, B.z), 0.45, 0.01);
    }
  }
  // service drops: from poles to the facades around them, on both sides
  const blds = BUILT.filter(b => !b.far || Math.abs(b.zc) < 140);
  for (const P of POLES) {
    const cands = blds.filter(b => Math.abs(b.zc - P.z) < 16);
    const n = Math.min(cands.length, rndi(3, 6));
    shuffle(cands);
    for (let k = 0; k < n; k++) {
      const b = cands[k];
      const zt = clamp(P.z + rnd(-6, 6), b.z0 + 0.4, b.z1 - 0.4);
      const sgn = b.side === 'E' ? 1 : -1;
      const yt = b.setback ? b.gh - 0.2 : clamp(rnd(4.0, Math.min(6.8, b.H - 0.4)), b.gh + 0.3, 30);
      const tgt = V3(sgn * (FRONT_X + b.inset + 0.03), yt, zt);
      if (b.id === 'E6' && Math.abs(zt) < 1.6) continue; // keep the air above him clear
      const from = V3(P.x, rnd(6.6, 8.0), P.z);
      catenary(from, tgt, rnd(0.12, 0.35), rnd(0.008, 0.014), 12);
      wadd('metal', M.metal, G.box, mat(tgt.x, tgt.y, tgt.z, 0, 0, 0, 0.08, 0.08, 0.08), new THREE.Color('#2a2a2a'), { colors: true });
    }
  }
  // build the merged tube mesh, chunked by zone
  const byZone = new Map();
  for (const c of CABLES) {
    const zc = zoneOf((c.pts[0].z + c.pts[c.pts.length - 1].z) / 2);
    if (!byZone.has(zc)) byZone.set(zc, []);
    byZone.get(zc).push(c);
  }
  for (const [zone, list] of byZone) {
    const geos = list.map(c => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(c.pts), c.pts.length * 2, c.r, 4, false));
    const batch = STATIC.get('cable', M.cable, {}, zone);
    for (const g of geos) batch.add(g, null);
  }
}

/* ---------- shōtengai lamps with festival banners ---------- */
function buildLamps() {
  const zs = [56, 40, 24, 8, -8, -24, -60, -76, -92, 72, 88];
  const post = new THREE.Color('#2a3a34');
  const banner = signRect(0.45, 1.3, 90); { const c = ATL.sign.ctx; c.fillStyle = '#b3241a'; c.fillRect(banner.x, banner.y, banner.w, banner.h); c.fillStyle = '#f4efe4'; c.fillRect(banner.x, banner.y + banner.h * 0.82, banner.w, banner.h * 0.18); drawVText(c, TX.posters[1], banner.x + banner.w * 0.1, banner.y + banner.h * 0.06, banner.w * 0.8, banner.h * 0.72, { fam: 'mincho', weight: 800, color: '#f4efe4' }); }
  for (const side of [-1, 1]) for (let z of zs) {
    if (side > 0 && Math.abs(z + 24) < 0.1) z = -21;
    const x = side * 3.45, zone = zoneOf(z);
    wadd('metal', M.metal, G.cyl8, mat(x, CURB_H + 2.3, z, 0, 0, 0, 0.12, 4.6, 0.12), post, { colors: true });
    thinCollider(x, z, 0.15, 4.0);
    COLLIDERS.push(Object.assign(new THREE.Box3(V3(x - 0.3, 3.9, z - 0.7), V3(x + 0.3, 4.8, z + 0.7)), { thin: true }));
    wadd('metal', M.metal, G.cyl8, mat(x, CURB_H + 0.25, z, 0, 0, 0, 0.24, 0.5, 0.24), post, { colors: true });
    wadd('metal', M.metal, G.box, mat(x + side * 0.0, CURB_H + 4.55, z, 0, 0, 0, 0.06, 0.06, 0.9), post, { colors: true });
    for (const dz of [-0.45, 0.45]) {
      const hp = V3(x, CURB_H + 4.28, z + dz);
      wadd('glowc', M.glow, G.sph12, mat(hp.x, hp.y, hp.z, 0, 0, 0, 0.34, 0.42, 0.34), hdr(16, 11.5, 6.8), { colors: true });
      wadd('metal', M.metal, G.cyl8, mat(hp.x, hp.y + 0.25, hp.z, 0, 0, 0, 0.36, 0.07, 0.36), post, { colors: true });
      LAMPS.push(hp);
    }
    STATIC.get('noren', M.noren, {}, zone).add(remapUV(new THREE.PlaneGeometry(1, 1, 2, 5), banner), mat(x - side * 0.27, CURB_H + 3.1, z, 0, 0, 0, 0.42, 1.25, 1));
    wadd('metal', M.metal, G.box, mat(x - side * 0.25, CURB_H + 3.75, z, 0, 0, 0, 0.5, 0.03, 0.03), post, { colors: true });
    addLight2D(x, z, 6.5, '#ffd7a0', 0.55);
  }
}

/* ---------- the shōtengai gateway arch ---------- */
function buildArch() {
  const z = 38.2, zone = zoneOf(z);
  const bronze = new THREE.Color('#3a3530');
  for (const x of [-5.78, 5.78]) { wbox('metal', M.metal, x - 0.16, 0, z - 0.16, x + 0.16, 7.9, z + 0.16, bronze, { colors: true }); thinCollider(x, z, 0.18, 7.9); }
  wbox('metal', M.metal, -6.1, 7.55, z - 0.3, 6.1, 7.95, z + 0.3, bronze, { colors: true });
  const front = paintFascia(TX.arch, { w: 9.6, h: 1.0, bg: '#f8f1e2', fg: '#8a1a14', fam: 'mincho', weight: 800, letter: 0.35, border: '#3a3530', sub: 'AKARI-CHŌ SHŌTENGAI', subColor: '#3a3530', ppm: 80 });
  const back = paintFascia(TX.archBack, { w: 9.6, h: 1.0, bg: '#f8f1e2', fg: '#3a3530', fam: 'mincho', weight: 800, letter: 0.25, border: '#3a3530', ppm: 80 });
  wbox('metal', M.metal, -5.0, 6.4, z - 0.22, 5.0, 7.55, z + 0.22, bronze, { colors: true });
  wadd('signs', M.signs, atlasPlane(front), mat(0, 6.98, z + 0.23, 0, 0, 0, 9.6, 1.0, 1));
  wadd('signs', M.signs, atlasPlane(back), mat(0, 6.98, z - 0.23, Math.PI, 0, 0, 9.6, 1.0, 1));
  for (let x = -4.8; x <= 4.8; x += 0.4) for (const dz of [0.26, -0.26]) {
    wadd('glowc', M.glow, G.sph8, mat(x, 6.38, z + dz, 0, 0, 0, 0.07, 0.07, 0.07), hdr(9, 7, 4), { colors: true });
    wadd('glowc', M.glow, G.sph8, mat(x, 7.6, z + dz, 0, 0, 0, 0.07, 0.07, 0.07), hdr(9, 7, 4), { colors: true });
  }
  SIGN_GLOWS.push({ p: V3(0, 7.0, z + 0.6), size: 6.5, color: new THREE.Color('#ffe8c8').multiplyScalar(0.05) });
  SIGN_GLOWS.push({ p: V3(0, 7.0, z - 0.6), size: 6.5, color: new THREE.Color('#ffe8c8').multiplyScalar(0.04) });
  COLLIDERS.push(new THREE.Box3(V3(-6.2, 6.3, z - 0.4), V3(6.2, 8.0, z + 0.4)));
}

/* ---------- traffic signals at the crossing ---------- */
function paintPedFigures() {
  const R = {};
  for (const k of ['stop', 'walk']) {
    const r = signRect(0.26, 0.26, 200), c = ATL.sign.ctx;
    c.fillStyle = '#111'; c.fillRect(r.x, r.y, r.w, r.h);
    c.fillStyle = '#fff';
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, u = r.w / 10;
    c.beginPath(); c.arc(cx, cy - 3 * u, u * 0.9, 0, TAU); c.fill();
    if (k === 'stop') { c.fillRect(cx - 1.1 * u, cy - 2 * u, 2.2 * u, 3 * u); c.fillRect(cx - 1.1 * u, cy + u, 0.9 * u, 3 * u); c.fillRect(cx + 0.2 * u, cy + u, 0.9 * u, 3 * u); c.fillRect(cx - 1.9 * u, cy - 1.8 * u, 0.7 * u, 2.6 * u); c.fillRect(cx + 1.2 * u, cy - 1.8 * u, 0.7 * u, 2.6 * u); }
    else { c.save(); c.translate(cx, cy); c.rotate(0.15); c.fillRect(-1 * u, -2 * u, 2 * u, 3 * u); c.restore(); c.save(); c.translate(cx - 0.3 * u, cy + 1 * u); c.rotate(0.5); c.fillRect(-0.45 * u, 0, 0.9 * u, 3.1 * u); c.restore(); c.save(); c.translate(cx + 0.4 * u, cy + 1 * u); c.rotate(-0.55); c.fillRect(-0.45 * u, 0, 0.9 * u, 3.1 * u); c.restore(); c.save(); c.translate(cx + 0.9 * u, cy - 1.6 * u); c.rotate(-0.8); c.fillRect(-0.35 * u, 0, 0.7 * u, 2.4 * u); c.restore(); c.save(); c.translate(cx - 0.9 * u, cy - 1.6 * u); c.rotate(0.9); c.fillRect(-0.35 * u, 0, 0.7 * u, 2.4 * u); c.restore(); }
    R[k] = r;
  }
  return R;
}
function buildSignals() {
  const fig = paintPedFigures();
  const grey = new THREE.Color('#8e9294'), dark = new THREE.Color('#2a2c2e');
  const corners = { NW: V3(-3.95, 0, -34.35), NE: V3(3.95, 0, -34.35), SW: V3(-3.95, 0, -45.65), SE: V3(3.95, 0, -45.65) };
  const vehHead = (p, yaw, group) => {
    // horizontal head: blue-green, amber, red from the driver's left
    const m0 = mat(p.x, p.y, p.z, yaw);
    wadd('paint', M.paint, G.box, new THREE.Matrix4().multiplyMatrices(m0, mat(0, 0, 0, 0, 0, 0, 1.15, 0.36, 0.22)), dark, { colors: true });
    ['G', 'Y', 'R'].forEach((c, i) => {
      const lx = -0.37 + i * 0.37;
      wadd('paint', M.paint, G.box, new THREE.Matrix4().multiplyMatrices(m0, mat(lx, 0.17, 0.2, 0, 0, 0, 0.3, 0.02, 0.2)), dark, { colors: true });
      const lm = new THREE.Matrix4().multiplyMatrices(m0, mat(lx, 0, 0.115, 0, Math.PI / 2, 0, 0.26, 0.01, 0.26));
      SIGNAL_HEADS.push({ m: lm, kind: 'veh', group, color: c });
    });
  };
  const pedHead = (p, yaw, group) => {
    const m0 = mat(p.x, p.y, p.z, yaw);
    wadd('paint', M.paint, G.box, new THREE.Matrix4().multiplyMatrices(m0, mat(0, 0, 0, 0, 0, 0, 0.34, 0.66, 0.16)), dark, { colors: true });
    SIGNAL_HEADS.push({ m: new THREE.Matrix4().multiplyMatrices(m0, mat(0, 0.16, 0.082, 0, 0, 0, 0.26, 0.26, 1)), kind: 'ped', group, color: 'R', rect: fig.stop });
    SIGNAL_HEADS.push({ m: new THREE.Matrix4().multiplyMatrices(m0, mat(0, -0.16, 0.082, 0, 0, 0, 0.26, 0.26, 1)), kind: 'ped', group, color: 'G', rect: fig.walk });
  };
  for (const [k, c] of Object.entries(corners)) {
    wbox('metal', M.metal, c.x - 0.09, 0, c.z - 0.09, c.x + 0.09, 6.0, c.z + 0.09, grey, { colors: true });
    thinCollider(c.x, c.z, 0.12, 6.0);
    PEDSIG_POLES.push(c);
  }
  // vehicle heads on arms reaching over the lane they control (far side of the junction)
  const arm = (c, toX, toZ, y) => { const a = V3(c.x, y, c.z), b = V3(toX, y, toZ); wadd('metal', M.metal, G.cyl8, cylBetween(a, b, 0.06), grey, { colors: true }); };
  arm(corners.SW, -1.6, -45.65, 5.4); vehHead(V3(-1.6, 5.4, -45.65), 0, 'A');            // southbound lane, faces north
  arm(corners.NE, 1.6, -34.35, 5.4); vehHead(V3(1.6, 5.4, -34.35), Math.PI, 'A');        // northbound lane, faces south
  arm(corners.SE, 3.95, -41.75, 5.4); vehHead(V3(3.95, 5.4, -41.75), -Math.PI / 2, 'B'); // eastbound, faces west
  arm(corners.NW, -3.95, -38.25, 5.4); vehHead(V3(-3.95, 5.4, -38.25), Math.PI / 2, 'B'); // westbound, faces east
  // near-side repeaters seen from the hero zone
  vehHead(V3(-3.95, 4.6, -34.35), 0, 'A');
  vehHead(V3(3.95, 4.6, -45.65), Math.PI, 'A');
  // pedestrian heads: across the main street (with B) and across the cross street (with A)
  pedHead(V3(-3.95, 2.7, -34.15), Math.PI / 2, 'pedMain'); pedHead(V3(3.95, 2.7, -34.15), -Math.PI / 2, 'pedMain');
  pedHead(V3(-3.95, 2.7, -45.85), Math.PI / 2, 'pedMain'); pedHead(V3(3.95, 2.7, -45.85), -Math.PI / 2, 'pedMain');
  pedHead(V3(-4.15, 2.7, -34.35), Math.PI, 'pedCross'); pedHead(V3(4.15, 2.7, -34.35), Math.PI, 'pedCross');
  pedHead(V3(-4.15, 2.7, -45.65), 0, 'pedCross'); pedHead(V3(4.15, 2.7, -45.65), 0, 'pedCross');
  // crossing sign (blue square) on the north-west pole
  const cs = signRect(0.6, 0.6, 140); { const c = ATL.sign.ctx; c.fillStyle = '#1f5fa8'; c.fillRect(cs.x, cs.y, cs.w, cs.h); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(cs.x + cs.w / 2, cs.y + cs.h * 0.12); c.lineTo(cs.x + cs.w * 0.88, cs.y + cs.h * 0.84); c.lineTo(cs.x + cs.w * 0.12, cs.y + cs.h * 0.84); c.closePath(); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(cs.x + cs.w * 0.5, cs.y + cs.h * 0.42, cs.w * 0.05, 0, TAU); c.fill(); c.fillRect(cs.x + cs.w * 0.46, cs.y + cs.h * 0.48, cs.w * 0.08, cs.h * 0.22); }
  wadd('print', M.print, atlasPlane(cs), mat(-3.95, 3.6, -34.25, 0, 0, 0, 0.6, 0.6, 1));
  // crossing chirp speakers, little boxes on the poles
  for (const c of Object.values(corners)) wbox('paint', M.paint, c.x - 0.1, 3.2, c.z - 0.1, c.x + 0.1, 3.4, c.z + 0.1, new THREE.Color('#d9d9d4'), { colors: true });
}
const PEDSIG_POLES = [];

/* ---------- street signs, mirrors, bus stop ---------- */
function signPole(x, z, h, face, yaw) {
  wadd('metal', M.metal, G.cyl8, mat(x, h / 2, z, 0, 0, 0, 0.06, h, 0.06), new THREE.Color('#9ea2a4'), { colors: true });
  for (const s of [1, -1]) wadd('print', M.print, atlasPlane(face.rect), mat(x + Math.sin(yaw) * 0.03 * s, h - face.h / 2, z + Math.cos(yaw) * 0.03 * s, yaw + (s > 0 ? 0 : Math.PI), 0, 0, face.w, face.h, 1));
}
function roundSign(draw, size = 0.6) {
  const r = signRect(size, size, 160), c = ATL.sign.ctx;
  c.save(); c.beginPath(); c.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 - 1, 0, TAU); c.clip(); draw(c, r); c.restore();
  return { rect: r, w: size, h: size };
}
function buildSigns() {
  // speed limit 30
  const lim = roundSign((c, r) => { c.fillStyle = '#ffffff'; c.fillRect(r.x, r.y, r.w, r.h); c.strokeStyle = '#d0101a'; c.lineWidth = r.w * 0.12; c.beginPath(); c.arc(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.42, 0, TAU); c.stroke(); drawText(c, '30', r.x + r.w * 0.2, r.y + r.h * 0.22, r.w * 0.6, r.h * 0.56, { fam: 'latin', weight: 600, color: '#1f4f9a' }); });
  signPole(3.6, 46, 2.9, lim, Math.PI);
  // pedestrians only at the alley mouth
  const ped = roundSign((c, r) => { c.fillStyle = '#1f5fa8'; c.fillRect(r.x, r.y, r.w, r.h); c.strokeStyle = '#fff'; c.lineWidth = r.w * 0.05; c.beginPath(); c.arc(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.44, 0, TAU); c.stroke(); c.fillStyle = '#fff'; for (const ox of [-0.12, 0.12]) { c.beginPath(); c.arc(r.x + r.w * (0.5 + ox), r.y + r.h * 0.3, r.w * 0.05, 0, TAU); c.fill(); c.fillRect(r.x + r.w * (0.46 + ox), r.y + r.h * 0.37, r.w * 0.08, r.h * 0.34); } });
  signPole(6.25, -4.35, 2.6, ped, -Math.PI / 2);
  // stop sign at the side street, inverted red triangle
  const stopR = signRect(0.8, 0.7, 140); { const c = ATL.sign.ctx; c.fillStyle = '#d0101a'; c.beginPath(); c.moveTo(stopR.x + 2, stopR.y + 2); c.lineTo(stopR.x + stopR.w - 2, stopR.y + 2); c.lineTo(stopR.x + stopR.w / 2, stopR.y + stopR.h - 2); c.closePath(); c.fill(); drawText(c, TX.stop, stopR.x + stopR.w * 0.2, stopR.y + stopR.h * 0.12, stopR.w * 0.6, stopR.h * 0.3, { fam: 'gothic', weight: 900, color: '#fff' }); }
  signPole(-6.3, 50.0, 2.4, { rect: stopR, w: 0.8, h: 0.7 }, Math.PI / 2);
  // curve mirrors: orange posts, convex mirrors
  for (const [x, z, yaw] of [[6.35, -7.35, -Math.PI / 2 - 0.7], [-6.35, 49.6, Math.PI / 2 + 0.6]]) {
    wadd('paint', M.paint, G.cyl8, mat(x, 1.6, z, 0, 0, 0, 0.08, 3.2, 0.08), new THREE.Color('#e8742a'), { colors: true });
    const m = mat(x, 3.15, z, yaw, -0.15, 0, 0.62, 0.62, 0.12);
    wadd('paint', M.paint, G.cyl24, new THREE.Matrix4().multiplyMatrices(m, mat(0, 0, -0.3, 0, Math.PI / 2, 0, 1.05, 0.6, 1.05)), new THREE.Color('#e8742a'), { colors: true });
    wadd('mirror', M.mirror || (M.mirror = std({ color: 0xffffff, roughness: 0.02, metalness: 1.0, envMapIntensity: 1.4 }, { lf: false })), G.sph16, m);
  }
  // bus stop: round sign and timetable on a pole by the bench
  const bus = roundSign((c, r) => { c.fillStyle = '#f2f2ee'; c.fillRect(r.x, r.y, r.w, r.h); c.fillStyle = '#e8742a'; c.fillRect(r.x, r.y + r.h * 0.62, r.w, r.h * 0.38); drawText(c, TX.busStop, r.x + r.w * 0.12, r.y + r.h * 0.22, r.w * 0.76, r.h * 0.22, { fam: 'gothic', weight: 900, color: '#1a1a1a' }); drawText(c, TX.busName, r.x + r.w * 0.18, r.y + r.h * 0.68, r.w * 0.64, r.h * 0.2, { fam: 'round', weight: 700, color: '#fff' }); });
  signPole(3.55, 11.6, 2.6, bus, -Math.PI / 2);
  wadd('glowc', M.glow, G.box, mat(3.55, 1.45, 11.6, 0, 0, 0, 0.06, 0.6, 0.36), hdr(2.2, 2.2, 2.0), { colors: true });
  // posters: security camera notice by the CCTV, festival poster, missing cat on a pole
  [['camera', -5.98, 3.0, 7.6, Math.PI / 2], ['festival', -5.98, 1.6, 8.6, Math.PI / 2], ['cat', 3.5, 1.7, -11.3, Math.PI], ['bike', 5.98, 1.5, 21.0, -Math.PI / 2]].forEach(([k, x, y, z, yaw]) => {
    wadd('print', M.print, atlasPlane(paintPoster(k)), mat(x, y, z, yaw, 0, 0, 0.42, 0.6, 1));
  });
}

/* ---------- bicycles and scooters (instanced) ---------- */
function bikeGeometry() {
  const frame = new Batch(null), dark = new Batch(null), basket = new Batch(null);
  const T = (a, b, r = 0.016, batch = frame) => batch.add(G.cyl6, cylBetween(V3(...a), V3(...b), r));
  const head = [0, 0.86, 0.42], bb = [0, 0.3, 0.0], seat = [0, 0.84, -0.18], rear = [0, 0.33, -0.55], front = [0, 0.33, 0.56];
  T(head, bb, 0.02); T(bb, seat, 0.018); T(bb, rear); T(seat, rear, 0.013); T(head, front, 0.016); T([0, 1.02, 0.36], head, 0.016);
  T([-0.28, 1.04, 0.3], [0.28, 1.04, 0.3], 0.012); T([-0.28, 1.04, 0.3], [-0.3, 1.02, 0.18], 0.012); T([0.28, 1.04, 0.3], [0.3, 1.02, 0.18], 0.012);
  frame.add(G.box, boxM(-0.12, 0.74, -0.75, 0.12, 0.76, -0.3));                   // rear carrier
  frame.add(G.box, boxM(-0.05, 0.62, -0.62, 0.05, 0.64, -0.35));
  frame.add(G.box, boxM(-0.03, 0.26, -0.48, 0.03, 0.34, 0.08));                   // chain guard
  const torus = new THREE.TorusGeometry(0.31, 0.028, 6, 20).rotateY(Math.PI / 2);
  dark.add(torus, mat(0, 0.33, -0.55)); dark.add(torus, mat(0, 0.33, 0.56));
  dark.add(G.box, boxM(-0.09, 0.86, -0.3, 0.09, 0.92, -0.06));                    // saddle
  for (const s of [-1, 1]) dark.add(G.cyl6, mat(s * 0.3, 1.02, 0.16, 0, 0, Math.PI / 2, 0.03, 0.1, 0.03));
  dark.add(G.box, boxM(-0.13, 0.26, -0.03, 0.13, 0.28, 0.03));
  basket.add(G.box, boxM(-0.17, 0.72, 0.5, 0.17, 0.98, 0.82));
  return { frame: frame.build().geometry, dark: dark.build().geometry, basket: basket.build().geometry };
}
function buildBikes() {
  const g = bikeGeometry();
  const n = BIKES.length;
  const frames = new THREE.InstancedMesh(g.frame, M.bikeFrame || (M.bikeFrame = std({ roughness: 0.35, metalness: 0.5, envMapIntensity: 1.2 })), n);
  const darks = new THREE.InstancedMesh(g.dark, M.rubber, n);
  const baskets = new THREE.InstancedMesh(g.basket, M.basket || (M.basket = std({ color: 0x9a9fa2, roughness: 0.4, metalness: 0.7, transparent: true, opacity: 0.55 })), n);
  BIKES.forEach((bk, i) => {
    const m = mat(bk.p.x, bk.p.y, bk.p.z, bk.yaw, 0, bk.lean || 0);
    frames.setMatrixAt(i, m); darks.setMatrixAt(i, m);
    baskets.setMatrixAt(i, bk.basket ? m : ZERO_M);
    frames.setColorAt(i, new THREE.Color(bk.color));
  });
  for (const im of [frames, darks, baskets]) { im.layers.set(LAYER_NOREFL); scene.add(im); }
  // a few child seats and umbrellas hanging from handlebars
  BIKES.filter(b => b.child).forEach(bk => {
    const m = mat(bk.p.x, bk.p.y, bk.p.z, bk.yaw, 0, bk.lean || 0);
    wadd('paintG', M.paintGloss, G.box, new THREE.Matrix4().multiplyMatrices(m, boxM(-0.18, 0.78, -0.75, 0.18, 1.15, -0.4)), new THREE.Color(pick(['#3a6ea5', '#c0392b', '#4a4a4a'])), { colors: true });
  });
}

function buildScooters() {
  for (const sc of SCOOTERS) {
    const m0 = mat(sc.p.x, sc.p.y, sc.p.z, sc.yaw);
    const A = (key, mt, geo, m, col) => wadd(key, mt, geo, new THREE.Matrix4().multiplyMatrices(m0, m), col ? new THREE.Color(col) : null, { colors: !!col });
    const torus = new THREE.TorusGeometry(0.25, 0.06, 6, 16).rotateY(Math.PI / 2);
    A('rubberB', M.rubber, torus, mat(0, 0.3, -0.55)); A('rubberB', M.rubber, torus, mat(0, 0.3, 0.6));
    A('paintG', M.paintGloss, G.box, boxM(-0.18, 0.35, -0.6, 0.18, 0.75, -0.05), '#c9302c');
    A('paintG', M.paintGloss, G.box, boxM(-0.16, 0.3, 0.0, 0.16, 0.95, 0.35), '#f2f0e8');
    A('rubberB', M.rubber, G.box, boxM(-0.15, 0.76, -0.55, 0.15, 0.84, -0.12));
    A('metal', M.metal, G.cyl8, mat(0, 1.02, 0.42, 0, 0, Math.PI / 2, 0.03, 0.62, 0.03), '#2a2a2a');
    A('glowc', M.glow, G.cyl12, mat(0, 1.02, 0.5, 0, Math.PI / 2, 0, 0.12, 0.04, 0.12), '#30302c');
    if (sc.demae) {
      A('metal', M.metal, G.box, boxM(-0.25, 0.85, -0.8, 0.25, 0.9, -0.3), '#9a9ea0');
      A('paintG', M.paintGloss, G.box, boxM(-0.24, 0.95, -0.78, 0.24, 1.35, -0.32), '#e9e6dd');
      A('metal', M.metal, G.cyl6, mat(0, 1.2, -0.55, 0, 0, Math.PI / 2, 0.02, 0.6, 0.02), '#9a9ea0');
    }
  }
}

/* ---------- coin parking ---------- */
function buildParking() {
  const z0 = -29, z1 = -19, x0 = FRONT_X, x1 = 21;
  const white = new THREE.Color(1.6, 1.6, 1.6);
  for (let i = 0; i <= 4; i++) {
    const z = z0 + 0.6 + i * 2.2;
    wbox('paint', M.paint, x1 - 5.4, 0.065, z - 0.05, x1 - 0.4, 0.07, z + 0.05, white, { colors: true });
    if (i < 4) {
      wbox('concrete', M.concrete, x1 - 1.3, 0.06, z + 0.4, x1 - 1.1, 0.2, z + 1.8, new THREE.Color('#bdb8ad'));
      wbox('metal', M.metal, x1 - 3.4, 0.06, z + 0.7, x1 - 2.6, 0.1, z + 1.5, new THREE.Color('#5a5e60'), { colors: true });
    }
  }
  // fence at the back, pay machine, the lit P sign tower
  for (let z = z0; z <= z1; z += 2) wbox('metal', M.metal, x1 - 0.04, 0.06, z - 0.02, x1 + 0.04, 1.4, z + 0.02, new THREE.Color('#6d7174'), { colors: true });
  wbox('metal', M.metal, x1 - 0.04, 1.35, z0, x1 + 0.04, 1.4, z1, new THREE.Color('#6d7174'), { colors: true });
  wbox('paint', M.paintGloss, 6.6, 0.06, -19.9, 7.2, 1.45, -19.4, new THREE.Color('#e8e6df'), { colors: true });
  wbox('glowc', M.glow, 6.65, 1.0, -19.39, 7.15, 1.35, -19.38, hdr(2, 2.2, 2.6), { colors: true });
  const pR = signRect(0.9, 2.0, 120); { const c = ATL.sign.ctx; c.fillStyle = '#ffd400'; c.fillRect(pR.x, pR.y, pR.w, pR.h); c.fillStyle = '#1f4f9a'; c.beginPath(); c.arc(pR.x + pR.w / 2, pR.y + pR.h * 0.24, pR.w * 0.4, 0, TAU); c.fill(); drawText(c, 'P', pR.x, pR.y + pR.h * 0.08, pR.w, pR.h * 0.32, { fam: 'latin', weight: 600, color: '#fff' }); drawText(c, '24H', pR.x, pR.y + pR.h * 0.5, pR.w, pR.h * 0.12, { fam: 'latin', weight: 600, color: '#111' }); drawText(c, '20分 ¥300', pR.x, pR.y + pR.h * 0.66, pR.w, pR.h * 0.1, { fam: 'gothic', weight: 900, color: '#111' }); drawText(c, TX.parking, pR.x + pR.w * 0.25, pR.y + pR.h * 0.8, pR.w * 0.5, pR.h * 0.16, { fam: 'gothic', weight: 900, color: '#1f8a3a' }); }
  wbox('metal', M.metal, 6.32, 0, -19.6, 6.44, 3.6, -19.48, new THREE.Color('#5a5e60'), { colors: true });
  wadd('signs', M.signs, atlasBoxFaces({ px: pR, nx: pR }), mat(6.38, 4.4, -19.55, 0, 0, 0, 0.16, 2.0, 0.9));
  SIGN_GLOWS.push({ p: V3(6.38, 4.4, -19.55), size: 2.0, color: new THREE.Color('#fff0a0').multiplyScalar(0.05) });
  addLight2D(9, -24, 6, '#e8f0ff', 0.35);
  wbox('glowc', M.glow, 8.0, 4.3, -24.1, 8.6, 4.4, -23.9, hdr(5, 5.4, 6), { colors: true });
  wbox('metal', M.metal, 7.95, 0.06, -24.06, 8.05, 4.35, -23.94, new THREE.Color('#6d7174'), { colors: true });
  // parked cars face the fence; one bay is empty
  PARKED.push({ type: 'kei', x: x1 - 2.9, z: z0 + 1.7, yaw: Math.PI / 2, color: '#f2f0ea' });
  PARKED.push({ type: 'sedan', x: x1 - 2.9, z: z0 + 3.9, yaw: Math.PI / 2, color: '#16181b' });
  PARKED.push({ type: 'van', x: x1 - 2.9, z: z0 + 8.3, yaw: Math.PI / 2, color: '#c9ccce' });
  for (let i = 0; i < 4; i++) BIKES.push({ p: V3(x1 - 0.7, 0.06, z1 - 0.8 - i * 0.6), yaw: Math.PI / 2, lean: 0, color: pick(BIKE_COLORS), basket: chance(0.7) });
  MAP_BLOCKS.push({ x0, x1, z0, z1, h: 0, lot: true });
}
