/* ============================================================
   Landmarks: Inari shrine, Akari Yokochō, the rail viaduct and
   its trains, back blocks, distant towers, the sky
   ============================================================ */

const CAT_SPOT = { p: new THREE.Vector3(12.1, 0.47, -4.75), yaw: Math.PI - 0.5 };
const TRAINS = [];

/* ---------- the shrine (west, z -27..-21) ---------- */
function buildShrine() {
  const zone = zoneOf(-24);
  const verm = new THREE.Color('#c23a1c'), black = new THREE.Color('#1c1a18'), stone = new THREE.Color('#8f8b84');
  const zc = -24;
  // torii at the street edge
  for (const dz of [-1.15, 1.15]) {
    wadd('paintG', M.paintGloss, G.cyl12, mat(-6.45, 1.75, zc + dz, 0, 0, 0, 0.26, 3.5, 0.26), verm, { colors: true });
    wadd('paint', M.paint, G.cyl12, mat(-6.45, 0.28, zc + dz, 0, 0, 0, 0.32, 0.4, 0.32), black, { colors: true });
  }
  wadd('paintG', M.paintGloss, G.box, mat(-6.45, 2.85, zc, 0, 0, 0, 0.16, 0.18, 2.9), verm, { colors: true });
  wadd('paintG', M.paintGloss, G.box, mat(-6.45, 3.42, zc, 0, 0, 0, 0.24, 0.16, 3.1), verm, { colors: true });
  for (const s of [-1, 1]) wadd('paintG', M.paintGloss, G.box, mat(-6.45, 3.58, zc + s * 1.55, 0, s * 0.22, 0, 0.28, 0.14, 0.7), black, { colors: true });
  wadd('paintG', M.paintGloss, G.box, mat(-6.45, 3.55, zc, 0, 0, 0, 0.28, 0.14, 2.6), black, { colors: true });
  const plaque = paintVSign(TX.shrine, { w: 0.34, h: 0.62, bg: '#1c1a18', fg: '#d9b25a', fam: 'mincho', ppm: 160 });
  wadd('print', M.print, atlasPlane(plaque), mat(-6.3, 3.12, zc, Math.PI / 2, 0, 0, 0.3, 0.55, 1));
  // stone path, lanterns, foxes, flags
  for (let x = -7.2; x > -13; x -= 0.9) wbox('concrete', M.concrete, x - 0.4, 0.12, zc - 0.45, x + 0.4, 0.16, zc + 0.45, stone.clone().multiplyScalar(rnd(0.85, 1.05)));
  for (const dz of [-1.6, 1.6]) {
    const x = -9.2;
    wbox('concrete', M.concrete, x - 0.22, 0.12, zc + dz - 0.22, x + 0.22, 0.5, zc + dz + 0.22, stone);
    wbox('concrete', M.concrete, x - 0.1, 0.5, zc + dz - 0.1, x + 0.1, 1.1, zc + dz + 0.1, stone);
    wbox('concrete', M.concrete, x - 0.26, 1.1, zc + dz - 0.26, x + 0.26, 1.42, zc + dz + 0.26, stone);
    wbox('glowc', M.glow, x - 0.12, 1.16, zc + dz - 0.12, x + 0.12, 1.36, zc + dz + 0.12, hdr(4.2, 2.6, 1.2), { colors: true });
    wadd('concrete', M.concrete, G.pyr, mat(x, 1.62, zc + dz, Math.PI / 4, 0, 0, 0.66, 0.4, 0.66), stone);
    STREET_GLOWS.push({ p: V3(x, 1.26, zc + dz), size: 0.9, color: new THREE.Color('#ffb060').multiplyScalar(0.12) });
    // fox guardian with a red bib
    const fx = -11.6;
    wbox('concrete', M.concrete, fx - 0.3, 0.12, zc + dz - 0.3, fx + 0.3, 0.9, zc + dz + 0.3, stone);
    const fm = mat(fx, 0.9, zc + dz, Math.PI / 2 + (dz > 0 ? -0.35 : 0.35));
    const F = (geo, m, c) => wadd('paint', M.paint, geo, new THREE.Matrix4().multiplyMatrices(fm, m), new THREE.Color(c), { colors: true });
    F(G.sph12, mat(0, 0.32, -0.02, 0, 0.25, 0, 0.3, 0.55, 0.36), '#d8d4ca');
    F(G.sph12, mat(0, 0.68, 0.08, 0, 0, 0, 0.2, 0.2, 0.26), '#d8d4ca');
    F(G.cyl8, mat(0, 0.68, 0.22, 0, Math.PI / 2, 0, 0.07, 0.16, 0.07), '#d8d4ca');
    for (const s of [-1, 1]) F(G.pyr, mat(s * 0.06, 0.84, 0.06, 0, 0, s * 0.2, 0.07, 0.14, 0.05), '#d8d4ca');
    F(G.sph12, mat(0, 0.25, -0.22, 0, -0.6, 0, 0.16, 0.42, 0.16), '#d8d4ca');
    F(G.box, mat(0, 0.52, 0.12, 0, 0.5, 0, 0.24, 0.16, 0.05), '#c4161c');
  }
  const flag = paintVSign(TX.shrineFlag, { w: 0.42, h: 2.0, bg: '#c4161c', fg: '#f6f1e6', fam: 'mincho', ppm: 90 });
  for (const [x, dz] of [[-8.0, -2.1], [-8.0, 2.1], [-10.4, -2.1], [-10.4, 2.1]]) {
    wadd('metal', M.metal, G.cyl6, mat(x, 1.4, zc + dz, 0, 0, 0, 0.03, 2.6, 0.03), new THREE.Color('#2a2a2a'), { colors: true });
    STATIC.get('noren', M.noren, {}, zone).add(remapUV(new THREE.PlaneGeometry(1, 1, 2, 6), flag), mat(x, 1.55, zc + dz + 0.24, Math.PI / 2, 0, 0, 0.42, 2.0, 1));
  }
  // the hall on a stone base
  const hx0 = -15.8, hx1 = -12.8, hz0 = zc - 1.6, hz1 = zc + 1.6;
  wbox('concrete', M.concrete, hx0 - 0.3, 0.12, hz0 - 0.3, hx1 + 0.3, 0.62, hz1 + 0.3, stone);
  wbox('wood', M.wood, hx0, 0.62, hz0, hx1, 2.5, hz1, new THREE.Color('#6a4632'));
  wbox('glowc', M.glow, hx1 + 0.01, 0.9, zc - 0.9, hx1 + 0.02, 2.2, zc + 0.9, hdr(1.4, 0.9, 0.45), { colors: true });
  for (let z = zc - 0.9; z <= zc + 0.9; z += 0.12) wbox('wood', M.wood, hx1 + 0.02, 0.9, z - 0.015, hx1 + 0.06, 2.2, z + 0.015, new THREE.Color('#3a2418'));
  const rx = (hx0 + hx1) / 2;
  for (const s of [-1, 1]) {
    const p0 = V3(hx0 - 0.9, 2.5, rx * 0 + zc + s * (1.6 + 0.9)), p1 = V3(hx1 + 0.9, 2.5, zc + s * (1.6 + 0.9));
    const p2 = V3(hx1 + 0.9, 3.75, zc), p3 = V3(hx0 - 0.9, 3.75, zc);
    if (!M.copper) M.copper = std({ color: 0x4f7a68, roughness: 0.5, metalness: 0.3, envMapIntensity: 0.9 });
    if (s > 0) STATIC.get('roofG', M.copper, {}, zone).addQuad(p0, p1, p2, p3);
    else STATIC.get('roofG', M.copper, {}, zone).addQuad(p1, p0, p3, p2);
  }
  wbox('wood', M.wood, hx1 + 0.4, 0.62, zc - 0.5, hx1 + 1.0, 1.2, zc + 0.5, new THREE.Color('#4a2e1e'));
  wadd('paint', M.paint, G.cyl8, mat(hx1 + 0.5, 2.3, zc, 0, 0, 0, 0.06, 0.8, 0.06), new THREE.Color('#d9c9a0'), { colors: true });
  wadd('metal', M.metal, G.sph12, mat(hx1 + 0.5, 2.7, zc, 0, 0, 0, 0.22, 0.2, 0.22), new THREE.Color('#b8902a'), { colors: true });
  // shimenawa rope with paper streamers under the eave
  wadd('paint', M.paint, G.cyl8, mat(hx1 + 0.35, 2.4, zc, 0, 0, Math.PI / 2, 0.12, 2.6, 0.12), new THREE.Color('#d9c9a0'), { colors: true });
  for (const dz of [-0.8, 0, 0.8]) wadd('paint', M.paint, G.box, mat(hx1 + 0.36, 2.15, zc + dz, 0, 0, 0, 0.01, 0.35, 0.12), new THREE.Color('#f4f2ec'), { colors: true });
  // hanging paper lanterns along a wire
  for (let i = 0; i < 6; i++) LANTERNS.push({ p: V3(-8.6 - i * 0.75, 2.75, zc + 2.6), size: 0.34, rect: paintLantern(TX.shrineLantern, { color: '#f2e6c8', fg: '#7b1b14', fam: 'mincho' }), k: 1.6 });
  catenary(V3(-8.2, 2.95, zc + 2.6), V3(-12.6, 2.95, zc + 2.6), 0.08, 0.006, 8);
  // the camphor tree that overhangs the pavement
  buildTree(V3(-12.5, 0.12, -21.9), 1.0);
  addLight2D(-10, zc, 5, '#ffb060', 0.35);
  SPOTS.push({ p: V3(-12.2, 0.62, zc + 0.2), yaw: -Math.PI / 2, pose: 'bow', role: 'worshipper', top: '#3a3a44', bottom: '#2a2a30' });
  COLLIDERS.push(new THREE.Box3(V3(-16.2, 0, zc - 2), V3(-12.4, 4, zc + 2)));
  MAP_BLOCKS.push({ x0: -16, x1: -6, z0: -27, z1: -21, h: 0, shrine: true });
}

function buildTree(base, s) {
  const zone = zoneOf(base.z);
  const bark = new THREE.Color('#3a2e26');
  wadd('paint', M.paint, G.cyl12, mat(base.x, base.y + 2.6 * s, base.z, 0, 0, 0.08, 0.7 * s, 5.2 * s, 0.7 * s), bark, { colors: true });
  const limbs = [[1.6, 4.4, 0.8, 0.6], [-1.2, 4.8, -0.6, -0.5], [0.4, 5.4, 1.6, 0.9], [2.2, 5.0, -0.8, 0.5]];
  for (const [dx, y, dz, a] of limbs) wadd('paint', M.paint, G.cyl8, cylBetween(V3(base.x, base.y + y - 1.5, base.z), V3(base.x + dx, base.y + y + 0.8, base.z + dz), 0.16 * s), bark, { colors: true });
  const greens = ['#22331f', '#2a3d24', '#1d2b1b', '#33482b', '#26381f'];
  reseed(88);
  for (let k = 0; k < 46; k++) {
    const a = rnd(0, TAU), r = Math.sqrt(rnd(0, 1)) * 3.6 * s, y = base.y + rnd(4.6, 8.4) * s;
    const p = V3(base.x + Math.cos(a) * r + 1.2, y, base.z + Math.sin(a) * r * 0.9 + 0.4);
    const sz = rnd(1.4, 2.4) * s;
    STATIC.get('leafT', M.foliage || (M.foliage = std({ vertexColors: true, roughness: 0.85, envMapIntensity: 0.25 }, { lfHeight: 0.12, lfStrength: 1.4 })), { colors: true }, zone)
      .add(G.sph8, mat(p.x, p.y, p.z, rnd(0, 6), rnd(0, 1), 0, sz, sz * 0.7, sz), new THREE.Color(pick(greens)));
  }
  COLLIDERS.push(new THREE.Box3(V3(base.x - 3, base.y + 4, base.z - 4), V3(base.x + 5, base.y + 9.5, base.z + 4)));
}

/* ---------- Akari Yokochō ---------- */
function alleyBldg(spec) {
  const b = new Bldg(spec);
  b.expL = spec.expL; b.expR = spec.expR;
  b.cornerL = b.cornerR = false;
  return b;
}
function buildAlley() {
  const zc = (ALLEY.z0 + ALLEY.z1) / 2;
  // stalls built into the north wall of E8 (facing +z into the alley)
  const southWall = alleyBldg({ id: 'AS', side: 'E', z0: 0, z1: 9.4, depth: 1, floors: 1, gh: 3.2, fh: 3, wall: '#7d7a72', style: 'concrete', win: 'old', frame: { O: V3(10.6, 0, ALLEY.z0), U: V3(1, 0, 0) } });
  alleyStall(southWall, 0.2, 3.4, TX.alleyShops[0], '#d4281a', 'bar');
  alleyStall(southWall, 3.7, 6.9, TX.alleyShops[1], '#f1e4c8', 'yakiniku');
  alleyStall(southWall, 7.2, 9.2, TX.alleyShops[3], '#d4281a', 'bar');
  // and one tiny bar in the wall of E6 past the kissaten (facing -z)
  const northWall = alleyBldg({ id: 'AN', side: 'E', z0: 0, z1: 3.4, depth: 1, floors: 1, gh: 3.2, fh: 3, wall: '#6e4536', style: 'brick', win: 'old', frame: { O: V3(19.2, 0, ALLEY.z1), U: V3(-1, 0, 0) } });
  alleyStall(northWall, 0.2, 3.2, TX.alleyShops[5], '#f1e4c8', 'bar');
  // little two-storey buildings deeper in, both sides, and one closing the end
  const specs = [
    { x0: 20.2, x1: 24.6, side: 'N', name: TX.alleyShops[2] }, { x0: 24.6, x1: 29.2, side: 'N', name: TX.alleyShops[4] }, { x0: 29.2, x1: 34.0, side: 'N', name: TX.alleyShops[1] },
    { x0: 20.2, x1: 25.0, side: 'S', name: TX.alleyShops[3] }, { x0: 25.0, x1: 29.6, side: 'S', name: TX.alleyShops[0] }, { x0: 29.6, x1: 34.0, side: 'S', name: TX.alleyShops[5] },
  ];
  reseed(9191);
  for (const s of specs) {
    const north = s.side === 'N';
    const frame = north ? { O: V3(s.x1, 0, ALLEY.z1), U: V3(-1, 0, 0) } : { O: V3(s.x0, 0, ALLEY.z0), U: V3(1, 0, 0) };
    const b = alleyBldg({ id: 'Y' + s.x0, side: 'E', z0: 0, z1: s.x1 - s.x0, depth: 5, floors: 1, gh: 3.0, fh: 2.6, wall: pick(['#6b5a4a', '#7d776c', '#8a6f58', '#5f5850']), style: pick(['wood', 'mortar', 'concrete']), win: 'old', roof: chance(0.5) ? 'pitched' : 'flat', frame, expL: true, expR: true });
    paintFacade(b);
    const R = b.rect;
    b.quad('facade', M.facade, [0, b.gh, 0], [b.W, b.gh, 0], [b.W, b.H, 0], [0, b.H, 0], [R.u0, R.v0, R.u1, R.v1]);
    wallBatch(b.zone).add(b.P(b.W, 0, -b.depth), b.P(0, 0, -b.depth), b.P(0, b.H, -b.depth), b.P(b.W, b.H, -b.depth), b.W, b.H, rnd(0, 1), new THREE.Color(b.wall).multiplyScalar(0.7));
    for (const x of [0, b.W]) wallBatch(b.zone).add(b.P(x, 0, x === 0 ? -b.depth : 0), b.P(x, 0, x === 0 ? 0 : -b.depth), b.P(x, b.H, x === 0 ? 0 : -b.depth), b.P(x, b.H, x === 0 ? -b.depth : 0), b.depth, b.H, rnd(0, 1), new THREE.Color(b.wall).multiplyScalar(0.7));
    if (b.roof === 'pitched') pitchedRoof(b); else { roofKit(b); const p0 = b.P(0, b.H, 0), p2 = b.P(b.W, b.H, -b.depth), p1 = b.P(b.W, b.H, 0), p3 = b.P(0, b.H, -b.depth); STATIC.get('roof', M.roof, { colors: true }, b.zone).addQuad(p0, p1, p2, p3, [p0.x / 4, p0.z / 4, p2.x / 4, p2.z / 4], new THREE.Color('#6f6b65')); }
    alleyStall(b, 0.25, b.W - 0.25, s.name, pick(['#d4281a', '#f1e4c8', '#e8a020']), pick(['bar', 'yakiniku', 'cafe']));
    const c0 = b.P(0, 0, 0), c1 = b.P(b.W, b.H, -b.depth);
    COLLIDERS.push(new THREE.Box3(V3(Math.min(c0.x, c1.x), 0, Math.min(c0.z, c1.z)), V3(Math.max(c0.x, c1.x), b.H + 1, Math.max(c0.z, c1.z))));
    MAP_BLOCKS.push({ x0: Math.min(c0.x, c1.x), x1: Math.max(c0.x, c1.x), z0: Math.min(c0.z, c1.z), z1: Math.max(c0.z, c1.z), h: b.H });
  }
  // the building that closes the end of the alley
  const endB = alleyBldg({ id: 'YE', side: 'E', z0: 0, z1: 10, depth: 8, floors: 2, gh: 3.0, fh: 2.8, wall: '#8a8478', style: 'concrete', win: 'apt', frame: { O: V3(34.2, 0, zc - 5), U: V3(0, 0, 1) }, expL: false, expR: false });
  paintFacade(endB);
  endB.quad('facade', M.facade, [0, endB.gh, 0], [10, endB.gh, 0], [10, endB.H, 0], [0, endB.H, 0], [endB.rect.u0, endB.rect.v0, endB.rect.u1, endB.rect.v1]);
  endB.box('concrete', M.concrete, 0, 0, -0.3, 10, endB.gh, 0.0, new THREE.Color('#77736a'));
  endB.box('glowc', M.glow, 6.2, 0.15, 0.0, 7.4, 2.2, 0.02, hdr(1.4, 1.2, 0.9));
  roofKit(endB);
  const ev = endB.P(5, 0, 0.45); addVending(ev.x, ev.z, endB.yaw, '#1f4f9a', 1234, endB.zone);
  // the gate sign over the alley mouth
  const zone = zoneOf(zc);
  const gate = paintFascia(TX.alley, { w: 2.3, h: 0.62, bg: '#1c1410', fg: '#f6d9a0', fam: 'mincho', weight: 800, letter: 0.3, border: '#c4161c', ppm: 140 });
  wbox('wood', M.wood, 6.32, 3.25, ALLEY.z0 - 0.05, 6.52, 3.95, ALLEY.z1 + 0.05, new THREE.Color('#2a1d14'));
  wadd('signs', M.signs, atlasPlane(gate), mat(6.3, 3.6, zc, -Math.PI / 2, 0, 0, 2.3, 0.62, 1));
  wadd('signs', M.signs, atlasPlane(gate), mat(6.54, 3.6, zc, Math.PI / 2, 0, 0, 2.3, 0.62, 1));
  SIGN_GLOWS.push({ p: V3(6.0, 3.6, zc), size: 2.0, color: new THREE.Color('#ffd8a0').multiplyScalar(0.06) });
  for (const dz of [-0.9, 0, 0.9]) LANTERNS.push({ p: V3(6.42, 2.85, zc + dz), size: 0.42, rect: paintLantern(TX.alleyShops[5], { color: '#d42a1e' }), k: 2.2 });
  // zigzag lantern strings across the alley
  let side = 1;
  for (let x = 8.5; x < 33; x += 2.3) {
    const a = V3(x, 3.15, side > 0 ? ALLEY.z1 - 0.05 : ALLEY.z0 + 0.05), b = V3(x + 2.3, 3.15, side > 0 ? ALLEY.z0 + 0.05 : ALLEY.z1 - 0.05);
    catenary(a, b, 0.22, 0.006, 10);
    for (let k = 1; k < 4; k++) { const t = k / 4; const p = V3().lerpVectors(a, b, t); p.y -= 0.22 * 4 * t * (1 - t) + 0.22; LANTERNS.push({ p, size: 0.26, rect: paintLantern(chance(0.5) ? TX.izakaya.lanterns[2] : TX.alleyShops[pick([0, 1, 3])], { color: chance(0.75) ? '#d42a1e' : '#f2e6c8' }), k: 1.9 }); }
    side = -side;
  }
  // AC units, pipes, crates, a bicycle, plants, the cat's crate
  for (let x = 9; x < 19; x += rnd(1.8, 3)) { INST.ac.push(mat(x, rnd(3.6, 6.5), ALLEY.z0 + 0.18, 0, 0, 0, 1, 1, 1)); }
  for (let x = 16; x < 19; x += 1.5) INST.ac.push(mat(x, rnd(3.6, 6.5), ALLEY.z1 - 0.18, Math.PI, 0, 0, 1, 1, 1));
  for (const x of [8.9, 13.2, 17.6]) wadd('paint', M.paint, G.cyl8, mat(x, 4, ALLEY.z0 + 0.07, 0, 0, 0, 0.1, 8, 0.1), new THREE.Color('#9d9a92'), { colors: true });
  wbox('paint', M.paint, 11.8, 0.15, -4.95, 12.4, 0.47, -4.55, new THREE.Color('#2c6e49'));
  wbox('paint', M.paint, 22.4, 0.15, -6.9, 22.9, 0.75, -6.45, new THREE.Color('#c9a21a'));
  BIKES.push({ p: V3(13.9, 0.15, -4.85), yaw: Math.PI / 2 + 0.06, lean: 0.12, color: '#c9cdd0', basket: true });
  BIKES.push({ p: V3(27.4, 0.15, -4.85), yaw: -Math.PI / 2, lean: -0.1, color: '#8e2b2b', basket: false });
  addLight2D(12, zc, 3.5, '#ff6a3a', 0.8); addLight2D(18, zc, 3.5, '#ff7a40', 0.7); addLight2D(25, zc, 3.5, '#ff8a4a', 0.8); addLight2D(31, zc, 3.5, '#ffaa60', 0.7);
  PRACTICAL.push({ id: 'alley', p: V3(11.5, 2.4, zc), color: '#ff7040' });
  // a flickering tube light over the far stall
  FLICKER_TUBES.push({ p: V3(27.0, 2.9, ALLEY.z0 + 0.12) });
  // people in the alley: patrons at stalls, someone leaving
  MAP_BLOCKS.push({ x0: FRONT_X, x1: ALLEY.x1, z0: ALLEY.z0, z1: ALLEY.z1, h: 0, alley: true });
}
const FLICKER_TUBES = [];

function alleyStall(b, x0, x1, name, lanternColor, interior) {
  const top = 2.3, depth = 1.6;
  const w = x1 - x0;
  b.box('wood', M.wood, x0, 0.15, -0.6, x1, 1.0, 0.0, new THREE.Color('#5a3a26'));
  b.box('wood', M.wood, x0 - 0.05, 1.0, -0.65, x1 + 0.05, 1.05, 0.08, new THREE.Color('#8a5a34'));
  b.box('wood', M.wood, x0 - 0.1, 0.15, -0.2, x0, top + 0.6, 0.02, new THREE.Color('#3a271b'));
  b.box('wood', M.wood, x1, 0.15, -0.2, x1 + 0.1, top + 0.6, 0.02, new THREE.Color('#3a271b'));
  b.box('wood', M.wood, x0, top, -0.2, x1, top + 0.6, 0.02, new THREE.Color('#3a271b'));
  b.box('wood', M.wood, x0 - 0.1, 0.15, -depth, x0, top, -0.2, new THREE.Color('#2a1d14'));
  b.box('wood', M.wood, x1, 0.15, -depth, x1 + 0.1, top, -0.2, new THREE.Color('#2a1d14'));
  const r = paintInterior(interior, w, 1.6);
  STATIC.get('interior', M.interior, { noRefl: true, colors: true }, b.zone).add(atlasPlane(r), b.M(mat((x0 + x1) / 2, 0.15 + 1.25, -depth, 0, 0, 0, w, 1.6, 1)), new THREE.Color(1.5, 1.2, 0.85));
  b.quad('glowc', M.glow, [x0, top, -depth], [x1, top, -depth], [x1, top, -0.2], [x0, top, -0.2], null, hdr(2.6, 1.7, 0.9), { noRefl: true });
  const nr = paintNoren(name, { w: Math.min(w - 0.2, 2.2), h: 0.5, bg: pick(['#1b2440', '#5a1a14', '#2a3a2a', '#e8e0cc']), fg: '#f4efe4', panels: 3 });
  STATIC.get('noren', M.noren, {}, b.zone).add(remapUV(new THREE.PlaneGeometry(1, 1, 6, 3), nr), b.M(mat((x0 + x1) / 2, top - 0.25, 0.03, 0, 0, 0, Math.min(w - 0.2, 2.2), 0.5, 1)));
  LANTERNS.push({ p: b.P(x0 + 0.25, top - 0.1, 0.32), size: 0.48, rect: paintLantern(name, { color: lanternColor }), k: 2.1 });
  const stools = Math.max(1, Math.floor(w / 0.8));
  for (let i = 0; i < stools; i++) {
    const x = x0 + 0.45 + i * (w - 0.9) / Math.max(1, stools - 1);
    b.add('paint', M.paint, G.cyl12, mat(x, 0.65, 0.42, 0, 0, 0, 0.34, 0.06, 0.34), new THREE.Color('#9a1a14'));
    b.add('metal', M.metal, G.cyl6, mat(x, 0.38, 0.42, 0, 0, 0, 0.04, 0.5, 0.04), new THREE.Color('#888'));
    if (chance(0.55)) SPOTS.push({ p: b.P(x, 0.15, 0.42), yaw: b.yaw + Math.PI, pose: chance(0.5) ? 'drink' : 'eat', seatH: 0.68, role: 'patron', phase: rnd(0, 6) });
  }
  EMITTERS.push({ p: b.P((x0 + x1) / 2, 2.2, -0.4), dir: V3(0, 1, 0), spread: 0.2, rate: 0.4, size: 0.6, life: 3.5, rise: 0.35, color: [0.95, 0.9, 0.85], dens: 0.25, kind: 'smoke' });
}

/* ---------- the rail viaduct, the station sign, trains ---------- */
function paintTrainSide() {
  const r = signRect(20, 3.6, 22), c = ATL.sign.ctx;
  const X = r.x, Y = r.y, Wd = r.w, Hd = r.h, P = Wd / 20;
  c.fillStyle = '#4c5156'; c.fillRect(X, Y, Wd, Hd);
  const g = c.createLinearGradient(X, Y, X, Y + Hd); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.3)'); c.fillStyle = g; c.fillRect(X, Y, Wd, Hd);
  c.fillStyle = '#9a4a1c'; c.fillRect(X, Y + Hd * 0.72, Wd, Hd * 0.08);
  for (let d = 0; d < 4; d++) {
    const dx = X + (1.9 + d * 5.4) * P;
    c.fillStyle = '#2a2e33'; c.fillRect(dx - 2, Y + Hd * 0.12, 1.3 * P + 4, Hd * 0.78);
    c.fillStyle = '#ffe9c8'; c.fillRect(dx + 0.15 * P, Y + Hd * 0.18, 0.45 * P, Hd * 0.32); c.fillRect(dx + 0.7 * P, Y + Hd * 0.18, 0.45 * P, Hd * 0.32);
    if (d < 3) for (let wv = 0; wv < 2; wv++) { const wx = dx + (1.75 + wv * 1.75) * P; c.fillStyle = '#1a1d20'; c.fillRect(wx - 2, Y + Hd * 0.16, 1.5 * P + 4, Hd * 0.38); c.fillStyle = '#fff1d8'; c.fillRect(wx, Y + Hd * 0.18, 1.5 * P, Hd * 0.34); c.fillStyle = 'rgba(40,30,25,0.55)'; c.fillRect(wx + P * 0.3, Y + Hd * 0.3, P * 0.2, Hd * 0.22); c.fillRect(wx + P * 0.9, Y + Hd * 0.28, P * 0.22, Hd * 0.24); }
  }
  return r;
}
function buildViaduct() {
  const { z0, z1, deckBottom: yb, deckTop: yt } = VIADUCT;
  const conc = new THREE.Color('#8d8a84'), steel = new THREE.Color('#3f4a46');
  // deck: concrete on both sides, steel girders over the street
  for (const [xa, xb] of [[-420, -7], [7, 420]]) {
    for (let x = xa; x < xb; x += 40) {
      const x2 = Math.min(x + 40, xb);
      wbox('concrete', M.concrete, x, yb, z0, x2, yt, z1, conc);
      wbox('concrete', M.concrete, x, yt, z0 - 0.15, x2, yt + 1.1, z0, conc);
      wbox('concrete', M.concrete, x, yt, z1, x2, yt + 1.1, z1 + 0.15, conc);
    }
    for (let x = xa + 6; x < xb; x += 12) {
      if (Math.abs(x) < 9) continue;
      wbox('concrete', M.concrete, x - 0.7, 0, z0 + 0.6, x + 0.7, yb, z0 + 2.2, conc.clone().multiplyScalar(0.92));
      wbox('concrete', M.concrete, x - 0.7, 0, z1 - 2.2, x + 0.7, yb, z1 - 0.6, conc.clone().multiplyScalar(0.92));
    }
  }
  for (const z of [z0 + 0.4, (z0 + z1) / 2, z1 - 0.4]) wbox('metal', M.metal, -7.2, yb - 0.1, z - 0.25, 7.2, yt - 0.1, z + 0.25, steel, { colors: true });
  wbox('metal', M.metal, -7.2, yt - 0.2, z0, 7.2, yt, z1, steel, { colors: true });
  for (const z of [z0 - 0.05, z1 + 0.05]) wbox('metal', M.metal, -7.2, yt, z - 0.05, 7.2, yt + 1.0, z + 0.05, steel, { colors: true });
  // the station name and the clearance sign on the girder
  const st = paintFascia(TX.station + TX.stationSub + '  AKARI-CHŌ', { w: 6.0, h: 0.8, bg: '#f4f4f2', fg: '#1a1a1a', fam: 'gothic', stripe: '#e8742a', ppm: 90 });
  wadd('signs', M.signs, atlasPlane(st), mat(-11.5, yb + 0.55, z1 + 0.2, 0, 0, 0, 6.0, 0.8, 1));
  wadd('signs', M.signs, atlasPlane(st), mat(11.5, yb + 0.55, z0 - 0.2, Math.PI, 0, 0, 6.0, 0.8, 1));
  const cl = paintFascia(TX.clearance + ' 4.2m', { w: 1.6, h: 0.42, bg: '#ffd400', fg: '#111', fam: 'gothic', ppm: 120 });
  wadd('print', M.print, atlasPlane(cl), mat(0, yb - 0.25, z1 + 0.3, 0, 0, 0, 1.6, 0.42, 1));
  wbox('metal', M.metal, -0.85, yb - 0.5, z1 + 0.26, 0.85, yb - 0.46, z1 + 0.28, steel, { colors: true });
  SIGN_GLOWS.push({ p: V3(-11.5, yb + 0.55, z1 + 0.5), size: 4.5, color: new THREE.Color('#ffffff').multiplyScalar(0.04) });
  // izakaya in the arches, facing the street, on both sides
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const xa = s * (8 + i * 7.5), xb = s * (8 + i * 7.5 + 6.6);
    const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
    wbox('glowc', M.glow, x0 + 0.3, 0.15, z1 - 0.3, x1 - 0.3, yb - 0.3, z1 - 0.25, hdr(2.2, 1.25, 0.6), { colors: true });
    const nm = paintFascia(i === 1 ? TX.garage : pick(TX.alleyShops), { w: 4.0, h: 0.55, bg: '#1c1410', fg: '#f6d9a0', fam: 'brush', weight: 400, ppm: 70 });
    wadd('signs', M.signs, atlasPlane(nm), mat((x0 + x1) / 2, yb - 0.6, z1 + 0.02, 0, 0, 0, 4.0, 0.55, 1));
    for (let k = 0; k < 3; k++) LANTERNS.push({ p: V3(x0 + 1 + k * 2.2, yb - 1.3, z1 + 0.35), size: 0.42, rect: paintLantern(TX.izakaya.lanterns[k % 3], { color: '#d42a1e' }), k: 2.0 });
    addLight2D((x0 + x1) / 2, z1 + 2, 5, '#ff9a55', 0.9);
  }
  // catenary masts and wires along both tracks
  for (let x = -400; x <= 400; x += 30) {
    wbox('metal', M.metal, x - 0.12, yt, z0 + 0.2, x + 0.12, yt + 5.6, z0 + 0.45, steel, { colors: true });
    wbox('metal', M.metal, x - 0.12, yt, z1 - 0.45, x + 0.12, yt + 5.6, z1 - 0.2, steel, { colors: true });
    wbox('metal', M.metal, x - 0.1, yt + 5.2, z0 + 0.2, x + 0.1, yt + 5.4, z1 - 0.2, steel, { colors: true });
  }
  for (const zt of [z0 + 2, z1 - 2]) for (let x = -400; x < 400; x += 30) {
    catenary(V3(x, yt + 5.0, zt), V3(x + 30, yt + 5.0, zt), 0.35, 0.012, 10);
    catenary(V3(x, yt + 4.2, zt), V3(x + 30, yt + 4.2, zt), 0.04, 0.008, 6);
  }
  // rails
  for (const zt of [z0 + 2, z1 - 2]) for (const o of [-0.53, 0.53]) wbox('metal', M.metal, -420, yt + 0.12, zt + o - 0.04, 420, yt + 0.2, zt + o + 0.04, new THREE.Color('#6d6a66'), { colors: true });
  COLLIDERS.push(new THREE.Box3(V3(-420, yb, z0 - 0.3), V3(420, yt + 6, z1 + 0.3)));
  MAP_BLOCKS.push({ x0: -420, x1: 420, z0, z1, h: yt, rail: true });

  // trains: eight cars each, both directions
  const sideR = paintTrainSide();
  const cars = 8, carL = 20, n = cars * 2;
  const body = new THREE.InstancedMesh(G.box, M.trainBody || (M.trainBody = std({ color: 0xbfc4c8, roughness: 0.32, metalness: 0.75, envMapIntensity: 1.3 })), n);
  const sideGeo = new Batch(null);
  sideGeo.add(atlasPlane(sideR), mat(0, 0, 1.5, 0, 0, 0, carL - 0.3, 3.4, 1));
  sideGeo.add(atlasPlane(sideR, true), mat(0, 0, -1.5, Math.PI, 0, 0, carL - 0.3, 3.4, 1));
  const sides = new THREE.InstancedMesh(sideGeo.build().geometry, M.trainSide || (M.trainSide = basic({ map: TEX.sign, color: hdr(1.7, 1.7, 1.7) })), n);
  const lights = new THREE.InstancedMesh(G.box, M.glowSingleW || (M.glowSingleW = basic({ color: 0xffffff })), 4);
  for (let i = 0; i < 2; i++) { lights.setColorAt(i * 2, hdr(8, 7.5, 6.5)); lights.setColorAt(i * 2 + 1, hdr(6, 0.3, 0.2)); }
  for (const im of [body, sides, lights]) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; scene.add(im); }
  TRAINS.push({ z: z0 + 2, dir: 1, speed: 17, period: 64, offset: 0 }, { z: z1 - 2, dir: -1, speed: 16, period: 58, offset: 23 });
  onUpdate(t => {
    TRAINS.forEach((tr, ti) => {
      const span = 900;
      const u = fract((t + tr.offset) / tr.period);
      const headX = tr.dir > 0 ? -450 + u * span : 450 - u * span;
      tr.headX = headX;
      for (let c = 0; c < cars; c++) {
        const cx = headX - tr.dir * (c * (carL + 0.6) + carL / 2);
        const i = ti * cars + c;
        body.setMatrixAt(i, mat(cx, yt + 0.4 + 1.9, tr.z, 0, 0, 0, carL, 3.5, 2.95));
        sides.setMatrixAt(i, mat(cx, yt + 0.4 + 1.9, tr.z, 0, 0, 0, 1, 1, 1));
      }
      const fx = headX, bx = headX - tr.dir * (cars * (carL + 0.6) - 0.6);
      lights.setMatrixAt(ti * 2, mat(fx + tr.dir * 0.05, yt + 1.3, tr.z, 0, 0, 0, 0.1, 0.25, 2.2));
      lights.setMatrixAt(ti * 2 + 1, mat(bx - tr.dir * 0.05, yt + 1.3, tr.z, 0, 0, 0, 0.1, 0.18, 2.2));
    });
    body.instanceMatrix.needsUpdate = true; sides.instanceMatrix.needsUpdate = true; lights.instanceMatrix.needsUpdate = true;
  });
}

/* ---------- back blocks and the distant city ---------- */
function buildBackBlocks() {
  reseed(31337);
  const lots = [];
  const blocked = (x, z, w, d) => {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const hit = (ax0, ax1, az0, az1) => x1 > ax0 && x0 < ax1 && z1 > az0 && z0 < az1;
    if (hit(-23.5, 23.5, -175, 125)) return true;                 // the main street frontage
    if (hit(-900, 900, CROSS.s0 - 1.5, CROSS.s1 + 1.5)) return true; // cross street
    if (hit(-900, 900, VIADUCT.z0 - 2, VIADUCT.z1 + 2)) return true;
    if (hit(19, 41, -13, 4)) return true;                            // the alley quarter
    if (hit(-62, -5, 49.5, 56.5)) return true;                       // side street
    return false;
  };
  for (let bx = -232; bx < 232; bx += 46) for (let bz = -330; bz < 260; bz += 42) {
    // each block is subdivided into a few lots of varied height
    const nx = rndi(2, 4), nz = rndi(2, 3);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const w = 38 / nx - rnd(0.5, 2.5), d = 36 / nz - rnd(0.5, 2.5);
      const x = bx + 4 + (i + 0.5) * 38 / nx, z = bz + 3 + (j + 0.5) * 36 / nz;
      if (blocked(x, z, w, d)) continue;
      const dist = Math.hypot(x, z * 0.8);
      let h = rnd(6, 16);
      if (chance(0.18)) h = rnd(18, 34);
      if (dist > 160 && chance(0.12)) h = rnd(34, 60);
      lots.push({ x, z, w, d, h });
    }
  }
  const mat_ = windowedMaterial(true);
  const geo = G.boxB;
  const im = new THREE.InstancedMesh(geo, mat_, lots.length);
  const tints = ['#b8b0a2', '#a9a49b', '#c9c2b4', '#8f8a82', '#d6cfc0', '#9a8e80', '#b3aa9a', '#7f7a72'];
  lots.forEach((l, i) => { im.setMatrixAt(i, mat(l.x, 0, l.z, 0, 0, 0, l.w, l.h, l.d)); im.setColorAt(i, new THREE.Color(pick(tints))); });
  im.computeBoundingSphere();
  scene.add(im);
  // rooftop clutter: tanks and penthouses
  const tanks = lots.filter(() => chance(0.35));
  const tankIM = new THREE.InstancedMesh(G.cyl12, M.backTank || (M.backTank = std({ color: 0xc9c6bd, roughness: 0.6, envMapIntensity: 0.5 })), tanks.length);
  tanks.forEach((l, i) => tankIM.setMatrixAt(i, mat(l.x + rnd(-l.w / 4, l.w / 4), l.h + 1.6, l.z + rnd(-l.d / 4, l.d / 4), 0, 0, 0, 1.8, 1.6, 1.8)));
  scene.add(tankIM);
  const pent = lots.filter(() => chance(0.5));
  const pentIM = new THREE.InstancedMesh(G.boxB, M.backPent || (M.backPent = std({ color: 0x8d8981, roughness: 0.9 })), pent.length);
  pent.forEach((l, i) => pentIM.setMatrixAt(i, mat(l.x + rnd(-l.w / 3, l.w / 3), l.h, l.z + rnd(-l.d / 3, l.d / 3), 0, 0, 0, rnd(2, 3.5), rnd(2.2, 3), rnd(2, 3.5))));
  scene.add(pentIM);
  for (const l of lots) MAP_BLOCKS.push({ x0: l.x - l.w / 2, x1: l.x + l.w / 2, z0: l.z - l.d / 2, z1: l.z + l.d / 2, h: l.h, back: true });
  BACK_LOTS.push(...lots);
  // street lights along the back lanes
  const lamps = [];
  for (let bx = -232; bx <= 232; bx += 46) for (let z = -320; z < 250; z += 26) if (!blocked(bx + 2, z, 1, 1)) lamps.push(V3(bx + 2, 5.2, z));
  for (let bz = -330; bz <= 260; bz += 42) for (let x = -220; x < 220; x += 26) if (!blocked(x, bz + 1.5, 1, 1)) lamps.push(V3(x, 5.2, bz + 1.5));
  const lampIM = new THREE.InstancedMesh(G.sph8, M.glowSingleL || (M.glowSingleL = basic({ color: hdr(6, 5.2, 4) })), lamps.length);
  lamps.forEach((p, i) => lampIM.setMatrixAt(i, mat(p.x, p.y, p.z, 0, 0, 0, 0.3, 0.3, 0.3)));
  scene.add(lampIM);
  BACK_LAMPS.push(...lamps);
  const pools = new THREE.InstancedMesh(G.ground, M.backPool = new THREE.MeshBasicMaterial({ map: TEX.glow, color: new THREE.Color(0.55, 0.42, 0.28), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), lamps.length);
  lamps.forEach((p, i) => pools.setMatrixAt(i, mat(p.x, -0.04, p.z, 0, 0, 0, 13, 1, 13)));
  pools.layers.set(LAYER_NOREFL);
  scene.add(pools);
  // cars moving on the back lanes: pairs of head and tail lights
  const lanes = [];
  for (let bx = -186; bx <= 186; bx += 46) lanes.push({ axis: 'z', c: bx + 1.6, a: -320, b: 250 });
  for (let bz = -288; bz <= 218; bz += 42) lanes.push({ axis: 'x', c: bz + 1.5, a: -230, b: 230 });
  const nCars = 44;
  const carLights = new THREE.InstancedMesh(G.box, M.glowSingleC || (M.glowSingleC = basic({ vertexColors: false, color: 0xffffff })), nCars * 2);
  carLights.instanceMatrix.setUsage(THREE.DynamicDrawUsage); carLights.frustumCulled = false;
  const cars = Array.from({ length: nCars }, (_, i) => ({ lane: lanes[i % lanes.length], phase: hash1(i * 7.1), speed: 6 + hash1(i * 3.3) * 5, dir: hash1(i * 9.7) < 0.5 ? 1 : -1 }));
  for (let i = 0; i < nCars; i++) { carLights.setColorAt(i * 2, hdr(7, 6.6, 5.5)); carLights.setColorAt(i * 2 + 1, hdr(5, 0.3, 0.2)); }
  scene.add(carLights);
  onUpdate(t => {
    cars.forEach((c, i) => {
      const L = c.lane, len = L.b - L.a;
      let s = fract(c.phase + t * c.speed / len) * len;
      if (c.dir < 0) s = len - s;
      const p = L.a + s, off = c.dir * 1.2;
      const fx = L.axis === 'z' ? L.c + off : p, fz = L.axis === 'z' ? p : L.c - off;
      const dx = L.axis === 'z' ? 0 : c.dir, dz = L.axis === 'z' ? c.dir : 0;
      const hidden = blocked(fx, fz, 1, 1);
      carLights.setMatrixAt(i * 2, hidden ? ZERO_M : mat(fx + dx * 2.1, 0.75, fz + dz * 2.1, 0, 0, 0, L.axis === 'z' ? 1.4 : 0.1, 0.12, L.axis === 'z' ? 0.1 : 1.4));
      carLights.setMatrixAt(i * 2 + 1, hidden ? ZERO_M : mat(fx - dx * 2.1, 0.8, fz - dz * 2.1, 0, 0, 0, L.axis === 'z' ? 1.4 : 0.1, 0.1, L.axis === 'z' ? 0.1 : 1.4));
    });
    carLights.instanceMatrix.needsUpdate = true;
  });
}
const BACK_LOTS = [], BACK_LAMPS = [];

function buildSkyline() {
  reseed(5150);
  const towers = [];
  for (let i = 0; i < 150; i++) {
    const a = rnd(0, TAU), r = rnd(330, 950);
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 60;
    const h = rnd(35, 120) * (chance(0.15) ? 1.8 : 1), w = rnd(18, 40), d = rnd(18, 40);
    towers.push({ x, z, w, d, h });
  }
  const im = new THREE.InstancedMesh(G.boxB, windowedMaterial(true), towers.length);
  towers.forEach((t, i) => { im.setMatrixAt(i, mat(t.x, 0, t.z, rnd(0, 1.5), 0, 0, t.w, t.h, t.d)); im.setColorAt(i, new THREE.Color(pick(['#8a8f96', '#a3a39c', '#6f747a', '#9a9488']))); });
  scene.add(im);
  const tall = towers.filter(t => t.h > 90);
  AVIATION.push(...tall.map(t => V3(t.x, t.h + 1.5, t.z)));
}
const AVIATION = [];

/* ---------- sky: blue hour, clouds lit from below by the city; by day, washed blue and heaped cloud ---------- */
function buildSky() {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uDay: U.uDay, uSunDir: { value: SUN.dir } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir; uniform float uTime, uDay; uniform vec3 uSunDir;
      float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float ns(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f); return mix(mix(hs(i), hs(i+vec2(1,0)), u.x), mix(hs(i+vec2(0,1)), hs(i+vec2(1,1)), u.x), u.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * ns(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 zen = vec3(0.010, 0.020, 0.058), mid = vec3(0.026, 0.050, 0.110), hor = vec3(0.070, 0.090, 0.140);
        vec3 col = mix(hor, mid, smoothstep(0.0, 0.18, h));
        col = mix(col, zen, smoothstep(0.15, 0.85, h));
        // the last of the afterglow, low and down the street
        vec2 hd = normalize(d.xz + 1e-4);
        float west = pow(max(dot(hd, normalize(vec2(0.25, -1.0))), 0.0), 2.5);
        col += vec3(0.11, 0.075, 0.07) * west * exp(-max(h, 0.0) * 9.0);
        // sodium glow of the city on the haze
        col += vec3(0.075, 0.042, 0.022) * exp(-max(h, 0.0) * 14.0);
        // broken cloud, darker on top, lit from beneath near the horizon
        if (h > 0.0) {
          vec2 cp = d.xz / (h + 0.08) * 0.9 + vec2(uTime * 0.006, uTime * 0.002);
          float c = fbm(cp * 0.55);
          float cloud = smoothstep(0.48, 0.78, c) * smoothstep(0.0, 0.14, h);
          vec3 cc = mix(vec3(0.016, 0.022, 0.036), vec3(0.11, 0.07, 0.05), exp(-h * 5.0));
          col = mix(col, cc, cloud * 0.9);
          // a hazy moon behind cloud
          vec3 md = normalize(vec3(-0.55, 0.42, -0.72));
          float mm = max(dot(d, md), 0.0);
          col += vec3(0.5, 0.52, 0.6) * pow(mm, 900.0) * (1.0 - cloud * 0.8) + vec3(0.05, 0.055, 0.07) * pow(mm, 18.0);
        } else {
          col = mix(hor * 0.7, vec3(0.02), smoothstep(0.0, -0.2, h));
        }
        if (uDay > 0.0) {
          vec3 dhor = vec3(0.5, 0.6, 0.72);
          vec3 day = mix(dhor, vec3(0.07, 0.17, 0.42), pow(clamp(h, 0.0, 1.0), 0.55));
          float sd = max(dot(d, uSunDir), 0.0);
          day += vec3(1.0, 0.86, 0.66) * (pow(sd, 8.0) * 0.45 + pow(sd, 200.0) * 1.5) + vec3(40.0, 37.0, 32.0) * smoothstep(0.99985, 0.99993, sd);
          if (h > 0.0) {
            float c = fbm((d.xz / (h + 0.1) * 0.7 + vec2(uTime * 0.01, uTime * 0.004)) * 0.5);
            vec3 cc = mix(vec3(0.42, 0.45, 0.5), vec3(1.05, 1.02, 0.98) * (0.6 + 0.5 * pow(sd, 3.0)), smoothstep(0.5, 0.85, c));
            day = mix(day, cc, smoothstep(0.5, 0.75, c) * smoothstep(0.0, 0.12, h) * 0.92);
          } else day = mix(dhor * 0.85, vec3(0.25, 0.26, 0.27), smoothstep(0.0, -0.2, h));
          col = mix(col, day, uDay);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), m);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  sky.onBeforeRender = (r, s, cam) => { sky.position.copy(cam.position); sky.updateMatrixWorld(); };
  scene.add(sky);
  return sky;
}
