/* ============================================================
   People: an instanced crowd rig driven by deterministic
   timelines (walkers wait for the crossing signals), idle
   figures at their spots, cyclists, a dog, a cat — and him.
   ============================================================ */

const SIM_T = 900; // agent and traffic timelines repeat every 15 minutes

/* ---------- paths with crossings, stops and hidden spells ---------- */
class WalkPath {
  constructor(pts, opts = {}) {
    this.pts = pts.map(p => new THREE.Vector2(p[0], p[1]));
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    this.L = this.cum[this.cum.length - 1];
    this.markers = (opts.markers || []).map(m => ({ ...m, s: m.s != null ? m.s : this.sAtPoint(m.at) })).sort((a, b) => a.s - b.s);
    this.loop = opts.loop !== false;
    this.pingpong = !!opts.pingpong;
  }
  sAtPoint(p) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i], b = this.pts[i + 1], ab = b.clone().sub(a), t = clamp(new THREE.Vector2(p[0], p[1]).sub(a).dot(ab) / ab.lengthSq(), 0, 1);
      const q = a.clone().addScaledVector(ab, t), d = q.distanceTo(new THREE.Vector2(p[0], p[1]));
      if (d < bd) { bd = d; best = this.cum[i] + t * ab.length(); }
    }
    return best;
  }
  at(s, out) {
    s = clamp(s, 0, this.L);
    let i = 0; while (i < this.cum.length - 2 && this.cum[i + 1] < s) i++;
    const a = this.pts[i], b = this.pts[i + 1], len = this.cum[i + 1] - this.cum[i] || 1;
    const t = (s - this.cum[i]) / len;
    out.x = a.x + (b.x - a.x) * t; out.z = a.y + (b.y - a.y) * t;
    return out;
  }
  dir(s, out) {
    const p0 = this.at(clamp(s - 0.6, 0, this.L), { x: 0, z: 0 }), p1 = this.at(clamp(s + 0.6, 0, this.L), { x: 0, z: 0 });
    const dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.hypot(dx, dz) || 1;
    out.x = dx / l; out.z = dz / l;
    return out;
  }
}

function nextWalkStart(t, group) {
  const ph = SIG.phase(t);
  const start = group === 'pedMain' ? 29 : 0, len = 20;
  const into = ((ph - start) % 60 + 60) % 60;
  if (into < len - 7) return t;              // enough green left to cross
  return t + (60 - into);
}

// Precompute a walker's piecewise timeline: walk segments, waits, stops.
function buildTimeline(path, speed, s0) {
  const segs = [];
  let t = 0, s = s0, d = 0;
  let guard = 0;
  while (t < SIM_T && guard++ < 5000) {
    const m = path.markers.find(mk => mk.s > s + 1e-4);
    const target = m ? m.s : path.L;
    const ds = target - s;
    if (ds > 1e-4) { segs.push({ t, s, v: speed, d, act: 'walk' }); t += ds / speed; d += ds; s = target; }
    if (!m) {
      if (path.pingpong) { segs.push({ t, s, v: 0, d, act: 'turn' }); t += 2.5; segs.push({ t, s: path.L, v: -speed, d, act: 'walk', back: true }); t += path.L / speed; d += path.L; s = 0; segs.push({ t, s: 0, v: 0, d, act: 'turn' }); t += 2.5; continue; }
      s = 0; segs.push({ t, s: 0, v: 0, d, act: 'jump' }); continue;
    }
    if (m.type === 'cross') {
      const go = nextWalkStart(t, m.signal);
      if (go > t + 0.01) { segs.push({ t, s, v: 0, d, act: 'wait', m }); t = go; }
    } else if (m.type === 'stop') { segs.push({ t, s, v: 0, d, act: m.act, m }); t += m.dur; }
    else if (m.type === 'hide') { segs.push({ t, s, v: 0, d, act: 'hidden', m }); t += m.dur; }
    s += 1e-3;
  }
  segs.push({ t: 1e9, s, v: 0, d, act: 'end' });
  return segs;
}
function timelineAt(segs, T) {
  const tt = ((T % SIM_T) + SIM_T) % SIM_T;
  let lo = 0, hi = segs.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (segs[mid].t <= tt) lo = mid; else hi = mid; }
  const g = segs[lo], dt = tt - g.t;
  return { s: g.s + g.v * dt, d: g.d + Math.abs(g.v) * dt, act: g.act, actT: dt, seg: g, moving: g.v !== 0, back: !!g.back };
}

/* ---------- looks ---------- */
const SKIN = ['#e9c9a8', '#dfbd98', '#f0d3b6', '#d6ad88', '#caa07c', '#e4c1a0'];
const HAIR = ['#141110', '#1b1512', '#231a14', '#2e221a', '#47352a', '#5d4433'];
const TOPS = ['#1e2a44', '#2b2d31', '#141416', '#b39b74', '#4a5038', '#9a7650', '#e8e6e0', '#6b6e72', '#5a1f24', '#b88a2a', '#8aa6c1', '#d8cdb5', '#2f4a3a', '#3b3f47', '#7b6a58'];
const BOTTOMS = ['#1c1c1e', '#2a2f3a', '#3a3a3c', '#4a4238', '#7a6a52', '#23272e', '#4f6684', '#2f2a26'];
const SHOES = ['#111111', '#2a1e16', '#e8e8e4', '#3a3a3a', '#d9d4c8'];
const UMB = ['#16171a', '#1d2a48', '#5a1d22', '#a89070', '#2a3a30', '#16171a', '#3c3f44'];

function makeLook(o = {}) {
  const female = o.female != null ? o.female : chance(0.48);
  const elderly = o.elderly != null ? o.elderly : chance(0.12);
  const child = !!o.child;
  const s = child ? rnd(0.6, 0.68) : female ? rnd(0.86, 0.93) : rnd(0.93, 1.0);
  return {
    female, elderly, child,
    s: o.height || s,
    skin: new THREE.Color(pick(SKIN)),
    hair: new THREE.Color(o.hair || (elderly ? pick(['#b8b4ad', '#d0ccc4', '#8a857e']) : pick(HAIR))),
    top: new THREE.Color(o.top || pick(TOPS)),
    bottom: new THREE.Color(o.bottom || pick(BOTTOMS)),
    shoes: new THREE.Color(pick(SHOES)),
    longHair: o.long != null ? o.long : female && chance(0.55),
    coat: o.coat != null ? o.coat : chance(female ? 0.35 : 0.25),
    skirt: female && chance(0.3),
    bag: o.bag || pick(female ? ['tote', 'tote', 'none', 'pack', 'shoulder'] : ['brief', 'none', 'pack', 'none', 'shoulder']),
    umbrella: o.umbrella || (chance(0.62) ? (chance(0.34) ? 'open' : 'closed') : 'none'),
    umbClear: chance(0.6),
    umbColor: new THREE.Color(pick(UMB)),
    phone: o.phone != null ? o.phone : chance(0.14),
    cap: !!o.cap, towel: !!o.towel,
    gait: rnd(0.9, 1.1),
    armSwing: rnd(0.8, 1.15),
  };
}

/* ---------- the instanced rig ---------- */
const PART_DEFS = {
  pelvis: () => new THREE.BoxGeometry(0.3, 0.17, 0.19).translate(0, -0.04, 0),
  // waist, chest, a shoulder line that rounds over into the neck
  torso: () => lathe([[0.001, 0], [0.15, 0], [0.152, 0.08], [0.146, 0.18], [0.16, 0.3], [0.178, 0.4], [0.182, 0.44], [0.162, 0.482], [0.11, 0.503], [0.055, 0.51], [0.001, 0.512]], 14).scale(1, 1, 0.62),
  neck: () => new THREE.CylinderGeometry(0.045, 0.05, 0.1, 6).translate(0, 0.05, 0),
  head: () => new THREE.SphereGeometry(0.1, 18, 14).scale(0.88, 1.08, 0.97).translate(0, 0.1, 0.005),
  // a cap of hair with a hairline: high over the forehead, level with the ears, down to the nape
  hair: () => {
    const g = new THREE.SphereGeometry(0.106, 18, 12, 0, TAU, 0, Math.PI * 0.74), p = g.attributes.position, R = 0.106;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), h = Math.hypot(x, z) || 1e-6;
      const ymin = 0.072 * Math.pow(Math.max(0, z / h), 1.6) - 0.012 - 0.05 * Math.max(0, -z / h);
      if (y < ymin) { const k = Math.sqrt(Math.max(0, R * R - ymin * ymin)) / h; p.setXYZ(i, x * k, ymin, z * k); }
    }
    g.computeVertexNormals();
    return g.scale(0.92, 1.06, 1.02).translate(0, 0.112, -0.008);
  },
  hairLong: () => new THREE.CylinderGeometry(0.096, 0.116, 0.3, 14).scale(1, 1, 0.5).translate(0, 0.02, -0.06),
  thigh: () => new THREE.CylinderGeometry(0.068, 0.054, 0.42, 10).translate(0, -0.21, 0),
  shin: () => new THREE.CylinderGeometry(0.051, 0.041, 0.4, 10).translate(0, -0.2, 0),
  foot: () => new THREE.BoxGeometry(0.095, 0.065, 0.245).translate(0, -0.032, 0.055),
  uarm: () => new THREE.CylinderGeometry(0.047, 0.04, 0.28, 9).translate(0, -0.14, 0),
  farm: () => new THREE.CylinderGeometry(0.039, 0.031, 0.26, 9).translate(0, -0.13, 0),
  hand: () => new THREE.SphereGeometry(0.042, 6, 5).scale(0.8, 1.15, 0.55).translate(0, -0.045, 0),
  skirt: () => new THREE.CylinderGeometry(0.165, 0.26, 0.56, 10, 1, true).translate(0, -0.28, 0),
  bag: () => new THREE.BoxGeometry(1, 1, 1),
  umbO: () => new THREE.CylinderGeometry(0.012, 0.52, 0.22, 8, 1, true).translate(0, -0.11, 0),
  umbV: () => new THREE.CylinderGeometry(0.012, 0.52, 0.22, 8, 1, true).translate(0, -0.11, 0),
  umbS: () => new THREE.CylinderGeometry(0.008, 0.008, 0.88, 4).translate(0, 0.44, 0),
  umbF: () => new THREE.CylinderGeometry(0.05, 0.012, 0.75, 8).translate(0, -0.375, 0), // folded umbrella hanging from the hand
  item: () => new THREE.BoxGeometry(1, 1, 1),
  cap: () => new THREE.CylinderGeometry(0.104, 0.11, 0.07, 10).translate(0, 0.19, 0),
};
const CROWD = { agents: [], meshes: {}, max: 0 };

// A face for the crowd, multiplied by each person's skin colour. u = 0.25 is the front, v runs down from the crown.
function paintCrowdFace() {
  const W = 256, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
  const X = u => u * W, Y = v => v * H;
  const blob = (u, v, rx, ry, rgb, a) => { g.save(); g.translate(X(u), Y(v)); g.scale(rx * W, ry * H); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore(); };
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const jaw = g.createLinearGradient(0, Y(0.66), 0, Y(1)); jaw.addColorStop(0, 'rgba(90,60,50,0)'); jaw.addColorStop(1, 'rgba(90,60,50,0.5)'); g.fillStyle = jaw; g.fillRect(0, Y(0.66), W, H);
  for (const s of [-1, 1]) {
    blob(0.25 + s * 0.055, 0.45, 0.04, 0.035, '110,80,70', 0.45);
    g.fillStyle = 'rgba(28,20,16,0.92)'; g.beginPath(); g.ellipse(X(0.25 + s * 0.055), Y(0.455), 4.2, 2.1, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(40,28,22,0.75)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(X(0.25 + s * 0.03), Y(0.405)); g.quadraticCurveTo(X(0.25 + s * 0.055), Y(0.39), X(0.25 + s * 0.085), Y(0.405)); g.stroke();
    blob(0.25 + s * 0.072, 0.57, 0.04, 0.035, '255,185,175', 0.22);
  }
  for (const u of [0, 0.5, 1]) blob(u, 0.5, 0.025, 0.06, '120,85,75', 0.45);
  blob(0.262, 0.53, 0.012, 0.055, '120,85,75', 0.35);
  g.strokeStyle = 'rgba(130,70,62,0.7)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(X(0.233), Y(0.64)); g.quadraticCurveTo(X(0.25), Y(0.65), X(0.267), Y(0.64)); g.stroke();
  return canvasTex(c);
}

function crowdMaterials() {
  return {
    cloth: std({ roughness: 0.88, envMapIntensity: 0.4 }, { lfHeight: 0.18, lfStrength: 1.6 }),
    skin: std({ roughness: 0.62, envMapIntensity: 0.4 }, { lfHeight: 0.18, lfStrength: 1.6 }),
    face: std({ roughness: 0.62, envMapIntensity: 0.4, map: paintCrowdFace() }, { lfHeight: 0.18, lfStrength: 1.6 }),
    hair: std({ roughness: 0.48, envMapIntensity: 0.7 }, { lfHeight: 0.18, lfStrength: 1.4 }),
    umb: std({ roughness: 0.32, envMapIntensity: 0.9, side: THREE.DoubleSide }, { lfHeight: 0.15, lfStrength: 1.4 }),
    vinyl: std({ color: 0xf2f6f8, roughness: 0.12, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 }, { lf: false }),
    item: std({ roughness: 0.5, envMapIntensity: 0.6 }),
  };
}

function initCrowd(agents) {
  const mats = crowdMaterials();
  const matOf = { pelvis: 'cloth', torso: 'cloth', neck: 'skin', head: 'face', hair: 'hair', hairLong: 'hair', thigh: 'cloth', shin: 'cloth', foot: 'cloth', uarm: 'cloth', farm: 'cloth', hand: 'skin', skirt: 'cloth', bag: 'item', umbO: 'umb', umbV: 'vinyl', umbS: 'item', umbF: 'umb', item: 'item', cap: 'item' };
  const pairs = { thigh: 2, shin: 2, foot: 2, uarm: 2, farm: 2, hand: 2 };
  const n = agents.length;
  for (const k in PART_DEFS) {
    const count = n * (pairs[k] || 1);
    const im = new THREE.InstancedMesh(PART_DEFS[k](), mats[matOf[k]], count);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    im.castShadow = !['umbV', 'item'].includes(k);
    im.receiveShadow = false;
    if (k === 'umbV') im.renderOrder = 3;
    for (let i = 0; i < count; i++) im.setMatrixAt(i, ZERO_M);
    scene.add(im);
    CROWD.meshes[k] = im;
  }
  CROWD.agents = agents;
  // colours are fixed per agent
  agents.forEach((a, i) => {
    const L = a.look;
    const set = (k, j, c) => CROWD.meshes[k].setColorAt(i * (pairs[k] || 1) + j, c);
    const topC = L.top, botC = L.coat ? L.top : L.bottom;
    set('pelvis', 0, botC); set('torso', 0, topC); set('neck', 0, L.skin); set('head', 0, L.skin); set('hair', 0, L.hair); set('hairLong', 0, L.hair);
    for (let j = 0; j < 2; j++) { set('thigh', j, L.coat ? L.bottom : L.bottom); set('shin', j, L.bottom); set('foot', j, L.shoes); set('uarm', j, topC); set('farm', j, topC); set('hand', j, L.skin); }
    set('skirt', 0, L.coat ? topC : L.bottom);
    set('bag', 0, L.bagColor || new THREE.Color(L.bag === 'brief' ? '#1c1814' : L.bag === 'pack' ? pick(['#2a2a2e', '#1e2a44', '#5a4632']) : pick(['#c9b28e', '#3b3b3b', '#7a4a32', '#e8e4d8'])));
    set('umbO', 0, L.umbColor); set('umbV', 0, new THREE.Color(1, 1, 1)); set('umbS', 0, new THREE.Color('#2a2a2a')); set('umbF', 0, L.umbClear ? new THREE.Color('#dfe6ea') : L.umbColor);
    set('item', 0, new THREE.Color(a.itemColor || '#151515')); set('cap', 0, new THREE.Color(a.capColor || '#1e2a44'));
  });
  for (const k in CROWD.meshes) if (CROWD.meshes[k].instanceColor) CROWD.meshes[k].instanceColor.needsUpdate = true;
}

/* ---------- poses ---------- */
const POSE0 = () => ({ y: 0.89, bob: 0, pitch: 0, roll: 0, twist: 0, torsoPitch: 0, headYaw: 0, headPitch: 0, thigh: [0, 0], knee: [0, 0], foot: [0, 0], arm: [0.05, 0.05], armOut: [0.08, 0.08], elbow: [-0.15, -0.15], seat: 0 });

function walkPose(P, phi, L, speedK = 1) {
  const A = 0.42 * L.gait * speedK;
  for (let j = 0; j < 2; j++) {
    const ph = phi + j * Math.PI;
    P.thigh[j] = -A * Math.sin(ph);
    P.knee[j] = 0.08 + 0.78 * Math.pow(Math.max(0, Math.cos(ph)), 1.5) * speedK;
    P.foot[j] = -(P.thigh[j] + P.knee[j]) * 0.55 + 0.12 * Math.max(0, -Math.cos(ph + 0.6));
    P.arm[j] = 0.3 * L.armSwing * Math.sin(ph) * speedK + 0.04;
    P.elbow[j] = -(0.22 + 0.2 * Math.max(0, -Math.sin(ph)));
  }
  P.bob = 0.022 * Math.cos(2 * phi) * speedK - 0.012;
  P.twist = 0.07 * Math.sin(phi) * speedK;
  P.roll = 0.025 * Math.sin(phi) * speedK;
  P.torsoPitch = 0.04 * speedK;
}
function idleSway(P, t, ph) {
  P.twist += 0.03 * Math.sin(t * 0.4 + ph);
  P.roll += 0.015 * Math.sin(t * 0.31 + ph * 2);
  P.headYaw += 0.35 * fbm1(t * 0.12 + ph * 10, 2);
  P.headPitch += 0.06 * Math.sin(t * 0.21 + ph);
  P.bob += 0.004 * Math.sin(t * 1.3 + ph);
}
function sitPose(P, seatH) {
  P.seat = seatH;
  for (let j = 0; j < 2; j++) { P.thigh[j] = -1.48; P.knee[j] = 1.42 + (j ? 0.05 : -0.05); P.foot[j] = 0.06; }
}
function holdUmbrellaArm(P, j) { P.arm[j] = -0.62; P.armOut[j] = j === 0 ? -0.12 : 0.12; P.elbow[j] = -1.42; }
function phoneArm(P, j) { P.arm[j] = -0.38; P.armOut[j] = j === 0 ? -0.18 : 0.18; P.elbow[j] = -1.62; }

function poseFor(a, T) {
  if (a.kind === 'player') return playerPose(a, T);
  const P = POSE0(), L = a.look, ph = a.phase || 0;
  const act = a.state.act;
  if (a.kind === 'walker') {
    if (act === 'walk') {
      walkPose(P, a.state.d / (1.42 * L.s) * TAU, L, 1);
      if (L.umbrella === 'open') holdUmbrellaArm(P, a.umbHand);
      if (L.phone && L.umbrella !== 'open') { phoneArm(P, 0); P.headPitch = 0.42; }
      P.headYaw += 0.18 * fbm1(T * 0.15 + ph * 7, 2);
    } else {
      idleSway(P, T, ph);
      if (L.umbrella === 'open') holdUmbrellaArm(P, a.umbHand);
      if (act === 'vending') vendingPose(P, a.state.actT);
      else if (act === 'deliver') { P.torsoPitch = 0.15; P.arm[1] = -0.7; P.elbow[1] = -0.6; }
      else if (L.phone) { phoneArm(P, 0); P.headPitch = 0.45; }
      else if (act === 'turn') { P.headYaw += Math.sin(a.state.actT * 1.2) * 0.6; }
    }
  } else if (a.kind === 'rider') {
    ridePose(P, a, T);
  } else {
    const t = T + ph * 3;
    switch (a.pose) {
      case 'sit': sitPose(P, a.seatH); P.arm = [-0.3, -0.3]; P.elbow = [-1.05, -1.05]; P.armOut = [-0.05, 0.05]; idleSway(P, T, ph); P.headPitch += 0.08; break;
      case 'sitphone': sitPose(P, a.seatH); phoneArm(P, 0); P.arm[1] = -0.25; P.elbow[1] = -1.0; P.headPitch = 0.5 + 0.04 * Math.sin(t * 0.7); P.torsoPitch = 0.1; break;
      case 'eat': sitPose(P, a.seatH); P.torsoPitch = 0.22 + 0.08 * Math.max(0, Math.sin(t * 0.9)); P.headPitch = 0.35 + 0.15 * Math.max(0, Math.sin(t * 0.9));
        P.arm[0] = -0.55 - 0.3 * Math.max(0, Math.sin(t * 0.9)); P.elbow[0] = -1.55; P.arm[1] = -0.55; P.elbow[1] = -1.25; P.armOut = [-0.12, 0.12]; break;
      case 'drink': sitPose(P, a.seatH); P.torsoPitch = 0.12; { const lift = Math.max(0, Math.sin(t * 0.35)) ** 4; P.arm[0] = -0.5 - lift * 0.5; P.elbow[0] = -1.3 - lift * 0.4; P.headPitch = 0.1 - lift * 0.35; } P.arm[1] = -0.45; P.elbow[1] = -1.2; idleSway(P, T, ph); break;
      case 'newspaper': sitPose(P, a.seatH); P.arm = [-0.75, -0.75]; P.elbow = [-1.15, -1.15]; P.armOut = [0.25, -0.25]; P.headPitch = 0.2; break;
      case 'readsit': sitPose(P, a.seatH); P.arm = [-0.45, -0.45]; P.elbow = [-1.45, -1.45]; P.armOut = [-0.15, 0.15]; P.headPitch = 0.5; P.torsoPitch = 0.1; break;
      case 'read': P.arm = [-0.42, -0.42]; P.elbow = [-1.35, -1.35]; P.armOut = [-0.14, 0.14]; P.headPitch = 0.52; idleSway(P, T, ph); P.headYaw *= 0.3; break;
      case 'browse': idleSway(P, T, ph); P.headYaw += 0.5 * Math.sin(t * 0.25); P.arm[0] = -0.2 - 0.3 * Math.max(0, Math.sin(t * 0.3)); P.elbow[0] = -0.6; break;
      case 'phone': phoneArm(P, 0); P.headPitch = 0.48; idleSway(P, T, ph); P.headYaw *= 0.2; break;
      case 'talk': idleSway(P, T, ph); { const g = Math.max(0, Math.sin(t * 0.8)); P.arm[0] = -0.3 - 0.5 * g; P.elbow[0] = -0.9 - 0.4 * g; P.armOut[0] = -0.2; } P.headPitch += 0.08 * Math.sin(t * 2.1) * Math.max(0, Math.sin(t * 0.5)); break;
      case 'laugh': idleSway(P, T, ph); { const l = Math.max(0, Math.sin(t * 0.6)) ** 3; P.torsoPitch = -0.08 * l + 0.05; P.headPitch = -0.25 * l; P.arm[1] = -0.2 - 0.3 * l; P.elbow[1] = -1.2; } break;
      case 'cook': { const w = Math.sin(t * 2.4); P.arm = [-0.75 + 0.12 * w, -0.65]; P.elbow = [-0.85 - 0.2 * w, -1.0]; P.armOut = [-0.1, 0.1]; P.headPitch = 0.45; P.torsoPitch = 0.12; P.twist = 0.15 * Math.sin(t * 0.2); } break;
      case 'polish': { const w = t * 1.6; P.arm = [-0.7 + 0.08 * Math.sin(w), -0.7 + 0.08 * Math.cos(w)]; P.elbow = [-1.2, -1.2]; P.armOut = [-0.2, 0.2]; P.headPitch = 0.35 + 0.1 * Math.sin(t * 0.13); P.headYaw = 0.3 * Math.sin(t * 0.09); } break;
      case 'guard': P.arm = [0.32, 0.32]; P.elbow = [-0.55, -0.55]; P.armOut = [0.15, -0.15]; idleSway(P, T, ph); P.headYaw *= 0.6; break;
      case 'bow': { const c = fract(t / 14), bw = c < 0.18 ? Math.sin(c / 0.18 * Math.PI) : c > 0.24 && c < 0.42 ? Math.sin((c - 0.24) / 0.18 * Math.PI) : 0; const clap = c > 0.5 && c < 0.62; P.torsoPitch = bw * 0.85; P.headPitch = bw * 0.3; P.arm = clap ? [-0.85, -0.85] : [0.05 - bw * 0.2, 0.05 - bw * 0.2]; P.elbow = clap ? [-1.3, -1.3] : [-0.15, -0.15]; P.armOut = clap ? [-0.35, 0.35] : [0.06, -0.06]; } break;
      case 'eatstand': { const w = Math.max(0, Math.sin(t * 1.1)); P.torsoPitch = 0.28 + 0.06 * w; P.headPitch = 0.4 + 0.12 * w; P.arm = [-0.6 - 0.35 * w, -0.55]; P.elbow = [-1.5, -1.3]; P.armOut = [-0.12, 0.12]; } break;
      case 'smoke': P.torsoPitch = 0.32; P.arm = [-1.05, -1.1]; P.elbow = [-0.7, -0.8]; P.armOut = [-0.25, 0.25]; { const puff = Math.max(0, Math.sin(t * 0.3)) ** 6; P.arm[0] -= puff * 0.4; P.elbow[0] -= puff * 0.9; P.headPitch = -0.1 * puff + 0.1; } break;
      case 'work': { const w = Math.sin(t * 0.9); P.torsoPitch = 0.35 + 0.1 * w; P.arm = [-0.9 + 0.2 * w, -0.8]; P.elbow = [-0.6, -0.8]; P.headPitch = 0.45; } break;
      default: idleSway(P, T, ph);
    }
    if (a.look.umbrella === 'open' && a.pose === 'stand') holdUmbrellaArm(P, 1);
  }
  return P;
}
function vendingPose(P, t) {
  if (t < 3) { const k = sstep(0, 1, t); P.arm[0] = -1.1 * k; P.elbow[0] = -0.35 * k; P.armOut[0] = -0.05; }
  else if (t < 5) { P.arm[0] = -1.0; P.elbow[0] = -0.3; P.headPitch = -0.1; }
  else if (t < 8) { const k = sstep(5, 6, t) * (1 - sstep(7.2, 8, t)); P.seat = 0; P.y = 0.89 - 0.42 * k; for (let j = 0; j < 2; j++) { P.thigh[j] = -1.25 * k; P.knee[j] = 2.0 * k; P.foot[j] = -0.6 * k; } P.torsoPitch = 0.4 * k; P.arm[0] = -0.6 * k; P.headPitch = 0.4 * k; }
  else { phoneArm(P, 0); P.elbow[0] = -1.75; P.headPitch = -0.15 * Math.max(0, Math.sin((t - 8) * 1.2)); }
}

/* ---------- writing the rig into the instanced meshes ---------- */
const _R = new THREE.Matrix4(), _T = new THREE.Matrix4(), _X = new THREE.Matrix4(), _Y = new THREE.Matrix4(), _Z = new THREE.Matrix4();
function mRotX(a) { return _X.makeRotationX(a); }
function chain(parent, tx, ty, tz, rx = 0, ry = 0, rz = 0, out = new THREE.Matrix4()) {
  out.copy(parent).multiply(_T.makeTranslation(tx, ty, tz));
  if (ry) out.multiply(_Y.makeRotationY(ry));
  if (rx) out.multiply(_X.makeRotationX(rx));
  if (rz) out.multiply(_Z.makeRotationZ(rz));
  return out;
}
const RIG = { root: new THREE.Matrix4(), pelvis: new THREE.Matrix4(), torso: new THREE.Matrix4(), neck: new THREE.Matrix4(), head: new THREE.Matrix4(), sh: [new THREE.Matrix4(), new THREE.Matrix4()], el: [new THREE.Matrix4(), new THREE.Matrix4()], hd: [new THREE.Matrix4(), new THREE.Matrix4()], hip: [new THREE.Matrix4(), new THREE.Matrix4()], kn: [new THREE.Matrix4(), new THREE.Matrix4()], an: [new THREE.Matrix4(), new THREE.Matrix4()], tmp: new THREE.Matrix4() };

function writeAgent(i, a, P, T) {
  const ms = CROWD.meshes, L = a.look;
  const st = a.state;
  if (st.hidden) { hideAgent(i); return; }
  RIG.root.compose(_v1.set(st.x, st.y, st.z), _q1.setFromAxisAngle(_v2.set(0, 1, 0), st.yaw), _v3.set(L.s, L.s, L.s));
  const pelvisY = P.seat ? P.seat + 0.07 : P.y + P.bob;
  chain(RIG.root, 0, pelvisY, 0, P.pitch, P.twist, P.roll, RIG.pelvis);
  chain(RIG.pelvis, 0, 0.055, 0, P.torsoPitch, -P.twist * 1.6, -P.roll * 0.5, RIG.torso);
  chain(RIG.torso, 0, 0.5, 0, P.headPitch * 0.25, P.headYaw * 0.3, 0, RIG.neck);
  chain(RIG.neck, 0, 0.09, 0, P.headPitch * 0.75, P.headYaw * 0.7, 0, RIG.head);
  ms.pelvis.setMatrixAt(i, RIG.pelvis);
  ms.torso.setMatrixAt(i, RIG.torso);
  ms.neck.setMatrixAt(i, RIG.neck);
  ms.head.setMatrixAt(i, RIG.head);
  ms.hair.setMatrixAt(i, RIG.head);
  ms.hairLong.setMatrixAt(i, L.longHair ? RIG.head : ZERO_M);
  ms.cap.setMatrixAt(i, L.cap ? RIG.head : ZERO_M);
  ms.skirt.setMatrixAt(i, (L.coat || L.skirt) && !P.seat ? chain(RIG.torso, 0, 0.03, 0, -P.torsoPitch * 0.6, 0, 0, RIG.tmp) : ZERO_M);
  for (let j = 0; j < 2; j++) {
    const sx = j === 0 ? 0.19 : -0.19;
    chain(RIG.torso, sx, 0.455, 0, P.arm[j], 0, P.armOut[j] * (j === 0 ? 1 : 1), RIG.sh[j]);
    chain(RIG.sh[j], 0, -0.28, 0, P.elbow[j], 0, 0, RIG.el[j]);
    chain(RIG.el[j], 0, -0.26, 0, 0, 0, 0, RIG.hd[j]);
    ms.uarm.setMatrixAt(i * 2 + j, RIG.sh[j]); ms.farm.setMatrixAt(i * 2 + j, RIG.el[j]); ms.hand.setMatrixAt(i * 2 + j, RIG.hd[j]);
    const hx = j === 0 ? 0.095 : -0.095;
    chain(RIG.pelvis, hx, -0.02, 0, P.thigh[j], 0, 0, RIG.hip[j]);
    chain(RIG.hip[j], 0, -0.42, 0, P.knee[j], 0, 0, RIG.kn[j]);
    chain(RIG.kn[j], 0, -0.4, 0, P.foot[j], 0, 0, RIG.an[j]);
    ms.thigh.setMatrixAt(i * 2 + j, RIG.hip[j]); ms.shin.setMatrixAt(i * 2 + j, RIG.kn[j]); ms.foot.setMatrixAt(i * 2 + j, RIG.an[j]);
  }
  // bag
  let bagM = ZERO_M;
  if (L.bag === 'brief') bagM = chain(RIG.hd[1], 0, -0.2, 0, -P.elbow[1] - P.arm[1], 0, 0, new THREE.Matrix4()).multiply(_T.makeScale(0.1, 0.3, 0.4));
  else if (L.bag === 'pack') bagM = chain(RIG.torso, 0, 0.3, -0.17, 0, 0, 0, new THREE.Matrix4()).multiply(_T.makeScale(0.3, 0.38, 0.14));
  else if (L.bag === 'tote') bagM = chain(RIG.torso, -0.22, 0.12, -0.02, -P.torsoPitch, 0, 0.1, new THREE.Matrix4()).multiply(_T.makeScale(0.08, 0.36, 0.34));
  else if (L.bag === 'shoulder') bagM = chain(RIG.torso, 0.21, 0.02, 0.03, 0, 0, -0.08, new THREE.Matrix4()).multiply(_T.makeScale(0.07, 0.2, 0.26));
  ms.bag.setMatrixAt(i, bagM);
  // umbrella
  let umbO = ZERO_M, umbV = ZERO_M, umbS = ZERO_M, umbF = ZERO_M;
  if (L.umbrella === 'open') {
    const hand = RIG.hd[a.umbHand];
    const hp = _v4.setFromMatrixPosition(hand);
    const tilt = a.umbTilt || 0;
    const back = 0.12;
    const fwd = _v1.set(Math.sin(st.yaw), 0, Math.cos(st.yaw));
    const side = _v2.set(Math.cos(st.yaw), 0, -Math.sin(st.yaw));
    const shaftDir = _v3.set(0, 1, 0).addScaledVector(fwd, -back).addScaledVector(side, tilt).normalize();
    const q = _q2.setFromUnitVectors(V3(0, 1, 0), shaftDir);
    const base = new THREE.Matrix4().compose(hp, q, _v1.set(L.s, L.s, L.s));
    umbS = base;
    const topM = new THREE.Matrix4().copy(base).multiply(_T.makeTranslation(0, 0.88, 0)).multiply(_Y.makeScale(a.umbScale || 1, 1, a.umbScale || 1));
    if (L.umbClear) umbV = topM; else umbO = topM;
  } else if (L.umbrella === 'closed') {
    umbF = chain(RIG.hd[1], 0, -0.06, 0.02, -P.arm[1] - P.elbow[1] + 0.12, 0, 0, new THREE.Matrix4());
  } else if (L.umbrella === 'cane') {
    umbF = chain(RIG.hd[1], 0, -0.04, 0.05, -P.arm[1] - P.elbow[1] + 0.25, 0, 0, new THREE.Matrix4()).multiply(_T.makeScale(0.5, 1.05, 0.5));
  }
  ms.umbO.setMatrixAt(i, umbO); ms.umbV.setMatrixAt(i, umbV); ms.umbS.setMatrixAt(i, umbS); ms.umbF.setMatrixAt(i, umbF);
  // small held item: phone, can, newspaper
  let item = ZERO_M;
  if ((L.phone && (a.kind === 'walker' || a.pose === 'phone' || a.pose === 'sitphone')) || a.pose === 'phone' || a.pose === 'sitphone') item = chain(RIG.hd[0], 0, -0.07, 0.02, 0.5, 0, 0, new THREE.Matrix4()).multiply(_T.makeScale(0.07, 0.14, 0.012));
  if (a.state.act === 'vending' && a.state.actT > 6) item = chain(RIG.hd[0], 0, -0.06, 0.0, 0, 0, 0, new THREE.Matrix4()).multiply(_T.makeScale(0.066, 0.12, 0.066));
  if (a.pose === 'newspaper') item = chain(RIG.torso, 0, 0.42, 0.42, -0.2, 0, 0, new THREE.Matrix4()).multiply(_T.makeScale(0.56, 0.38, 0.01));
  if (a.pose === 'read' || a.pose === 'readsit') item = chain(RIG.torso, 0, 0.32, 0.3, 0.7, 0, 0, new THREE.Matrix4()).multiply(_T.makeScale(0.22, 0.29, 0.02));
  ms.item.setMatrixAt(i, item);
}
function hideAgent(i) {
  const ms = CROWD.meshes;
  for (const k of ['pelvis', 'torso', 'neck', 'head', 'hair', 'hairLong', 'skirt', 'bag', 'umbO', 'umbV', 'umbS', 'umbF', 'item', 'cap']) ms[k].setMatrixAt(i, ZERO_M);
  for (const k of ['thigh', 'shin', 'foot', 'uarm', 'farm', 'hand']) { ms[k].setMatrixAt(i * 2, ZERO_M); ms[k].setMatrixAt(i * 2 + 1, ZERO_M); }
}

/* ---------- riders (bicycles in traffic) ---------- */
function ridePose(P, a, T) {
  const crank = a.state.d / 4.2 * TAU;
  P.seat = 0.86; P.torsoPitch = 0.16;
  for (let j = 0; j < 2; j++) {
    const c = crank + j * Math.PI;
    // pedal relative to the hip, in the bike's sagittal plane
    const pz = 0.17 * Math.sin(c) + 0.08, py = -0.56 + 0.17 * Math.cos(c);
    const dist = clamp(Math.hypot(pz, py), 0.3, 0.8);
    const a1 = 0.42, a2 = 0.4;
    const kneeA = Math.PI - Math.acos(clamp((a1 * a1 + a2 * a2 - dist * dist) / (2 * a1 * a2), -1, 1));
    const base = Math.atan2(pz, -py);
    const off = Math.asin(clamp(a2 * Math.sin(kneeA) / dist, -1, 1));
    P.thigh[j] = -(base + off);
    P.knee[j] = kneeA;
    P.foot[j] = -(P.thigh[j] + P.knee[j]) + 0.2;
  }
  const one = a.look.umbrella === 'open';
  P.arm = [-1.0, one ? -0.62 : -1.0]; P.elbow = [-0.35, one ? -1.42 : -0.35]; P.armOut = [-0.22, one ? 0.12 : 0.22];
  P.headPitch = -0.12; P.headYaw = 0.12 * fbm1(T * 0.2 + a.phase, 2);
}

/* ---------- the crowd's routes ---------- */
function crowdRoutes() {
  const X = { Wslow: -4.85, Wdown: -4.4, Wup: -3.85, Eup: 4.3, Edown: 3.85 };
  const N = 108, S = -150;
  const routes = {};
  routes.A = new WalkPath([[X.Wdown, N], [X.Wdown, -32.6], [-3.9, -33.9], [3.9, -33.9], [X.Eup, -32.6], [X.Eup, N]], { markers: [{ at: [-3.9, -33.9], type: 'cross', signal: 'pedMain', len: 7.8 }] });
  routes.B = new WalkPath([[X.Edown, N], [X.Edown, -33.4], [5.7, -34.5], [5.7, -45.5], [X.Edown, -46.6], [X.Edown, S], [-X.Edown, S], [-X.Edown, -46.6], [-5.7, -45.5], [-5.7, -34.5], [-X.Edown, -33.4], [-X.Edown, N]],
    { markers: [{ at: [5.7, -34.5], type: 'cross', signal: 'pedCross', len: 11 }, { at: [-5.7, -45.5], type: 'cross', signal: 'pedCross', len: 11 }] });
  routes.C = new WalkPath([[-120, -35.3], [-4.6, -35.3], [-3.9, -34.6], [3.9, -34.6], [4.6, -35.3], [120, -35.3], [120, -44.7], [4.6, -44.7], [3.9, -45.6], [-3.9, -45.6], [-4.6, -44.7], [-120, -44.7]],
    { markers: [{ at: [-3.9, -34.6], type: 'cross', signal: 'pedMain', len: 7.8 }, { at: [3.9, -45.6], type: 'cross', signal: 'pedMain', len: 7.8 }] });
  routes.E = new WalkPath([[X.Wslow, N], [X.Wslow, -33.0], [-6.4, -34.6], [-6.4, -45.4], [X.Wslow, -47], [X.Wslow, S]], { markers: [{ at: [-6.4, -34.6], type: 'cross', signal: 'pedCross', len: 11 }] });
  return { routes, X };
}

function buildCrowd() {
  reseed(2026);
  const { routes, X } = crowdRoutes();
  const agents = [];
  const k = QUALITY.crowd;
  const walkers = (route, n, speed, opts = {}) => {
    for (let i = 0; i < n; i++) {
      const look = makeLook(opts.look ? opts.look(i) : {});
      const v = speed * rnd(0.95, 1.05) * (look.elderly ? 0.82 : 1);
      const s0 = (i + rnd(0.1, 0.9)) / n * route.L;
      const path = opts.pathFor ? opts.pathFor(i) : route;
      agents.push({ kind: 'walker', look, path, speed: v, s0, lat: rnd(-0.16, 0.16), crossLat: rnd(-1.4, 1.4), queue: rnd(0, 1.4), phase: rnd(0, 10), umbHand: chance(0.7) ? 1 : 0, ...opts.extra });
    }
  };
  walkers(routes.A, Math.round(28 * k), 1.32);
  walkers(routes.B, Math.round(26 * k), 1.25);
  walkers(routes.C, Math.round(14 * k), 1.3);
  walkers(routes.E, Math.round(12 * k), 1.05, { look: () => ({ elderly: chance(0.35) }) });
  // three people who stop at the red vending machine on their way down the street
  const vendPts = [[X.Wdown, 108], [X.Wdown, 14.2], [-6.05, 13.35], [-6.05, 12.75], [X.Wdown, 11.6], [X.Wdown, -32.6], [-3.9, -33.9], [3.9, -33.9], [X.Eup, -32.6], [X.Eup, 108]];
  for (let i = 0; i < 3; i++) {
    const path = new WalkPath(vendPts, { markers: [{ at: [-6.05, 13.05], type: 'stop', act: 'vending', dur: 13 }, { at: [-3.9, -33.9], type: 'cross', signal: 'pedMain' }] });
    agents.push({ kind: 'walker', look: makeLook({ umbrella: 'closed', phone: false }), path, speed: 1.28, s0: path.L * (0.18 + i * 0.29), lat: 0, crossLat: rnd(-1, 1), queue: rnd(0, 1), phase: rnd(0, 9), umbHand: 1, buyer: true });
  }
  // someone who goes into the izakaya and comes back out later
  {
    const path = new WalkPath([[X.Wup, -70], [X.Wup, -8.7], [-5.6, -8.5], [-7.25, -8.3], [-5.6, -8.0], [X.Wup, -7.5], [X.Wup, 108]], { markers: [{ at: [-7.25, -8.3], type: 'hide', dur: 70 }] });
    agents.push({ kind: 'walker', look: makeLook({ female: false, top: '#2b2f36', bottom: '#2b2f36', bag: 'brief', umbrella: 'closed', phone: false }), path, speed: 1.2, s0: 0, lat: 0, crossLat: 0, queue: 0, phase: 2, umbHand: 1, izakaya: true });
  }
  // a delivery worker with a hand cart, a dog walker, a parent and child, a couple under one umbrella
  {
    const p = new WalkPath([[X.Eup, -32.6], [X.Eup, 44.2], [5.2, 45.5], [X.Eup, 46.5], [X.Eup, 108]], { markers: [{ at: [5.2, 45.5], type: 'stop', act: 'deliver', dur: 22 }] });
    agents.push({ kind: 'walker', look: makeLook({ female: false, top: '#3d6b4a', bottom: '#2a2f3a', cap: true, umbrella: 'none', phone: false, bag: 'none' }), path: p, speed: 1.15, s0: p.L * 0.55, lat: 0, crossLat: 0, queue: 0, phase: 4, umbHand: 1, cart: true, capColor: '#2f5a3e' });
    const dp = routes.E;
    agents.push({ kind: 'walker', look: makeLook({ female: true, umbrella: 'open', phone: false, bag: 'none' }), path: dp, speed: 0.95, s0: dp.L * 0.52, lat: 0.05, crossLat: 0.5, queue: 0.2, phase: 6, umbHand: 1, dog: true });
    const parent = makeLook({ female: true, umbrella: 'open', phone: false, bag: 'tote' });
    agents.push({ kind: 'walker', look: parent, path: routes.A, speed: 1.0, s0: routes.A.L * 0.07, lat: -0.12, crossLat: 0.3, queue: 0.1, phase: 1, umbHand: 1, parentOf: true });
    agents.push({ kind: 'walker', look: makeLook({ child: true, top: '#f2c21a', bottom: '#2a2f3a', umbrella: 'none', phone: false, bag: 'pack', cap: true }), path: routes.A, speed: 1.0, s0: routes.A.L * 0.07, lat: 0.32, crossLat: 0.75, queue: 0.1, phase: 1.3, umbHand: 1, capColor: '#f2c21a', childOf: true });
    const couple = routes.A;
    agents.push({ kind: 'walker', look: makeLook({ female: false, umbrella: 'open', phone: false, bag: 'none' }), path: couple, speed: 1.1, s0: couple.L * 0.61, lat: -0.2, crossLat: -0.4, queue: 0.3, phase: 3, umbHand: 0, umbScale: 1.3 });
    agents.push({ kind: 'walker', look: makeLook({ female: true, umbrella: 'none', phone: false, bag: 'shoulder' }), path: couple, speed: 1.1, s0: couple.L * 0.61, lat: 0.2, crossLat: -0.0, queue: 0.3, phase: 3.4, umbHand: 1 });
  }
  // two people strolling the alley, turning at the end
  for (let i = 0; i < 2; i++) {
    const p = new WalkPath([[4.6, i ? -5.2 : -6.3], [32.5, i ? -5.2 : -6.3]], { pingpong: true });
    agents.push({ kind: 'walker', look: makeLook({ umbrella: chance(0.5) ? 'closed' : 'none' }), path: p, speed: 0.75 + i * 0.12, s0: p.L * (0.2 + i * 0.5), lat: 0, crossLat: 0, queue: 0, phase: 5 + i, umbHand: 1 });
  }
  // people at their spots
  for (const sp of SPOTS) {
    const look = makeLook({ top: sp.top, bottom: sp.bottom, hair: sp.hair, long: sp.long, cap: sp.cap, towel: sp.towel, height: sp.height, umbrella: sp.umbrella || 'none', phone: sp.pose === 'phone' || sp.pose === 'sitphone', bag: sp.bag || 'none', elderly: sp.role === 'grandma' || sp.role === 'oldman' || sp.role === 'master' ? true : undefined, female: sp.role === 'grandma' || sp.role === 'reader' ? true : undefined });
    if (sp.towel) { look.cap = true; }
    agents.push({ kind: 'spot', look, pose: sp.pose, seatH: sp.seatH || 0.45, phase: sp.phase != null ? sp.phase : rnd(0, 10), spot: sp, umbHand: 1, capColor: sp.towel ? '#f2f0ea' : sp.cap ? '#1e2a44' : '#1e2a44' });
  }
  // the smoker on the third-floor balcony across from him
  agents.push({ kind: 'spot', look: makeLook({ female: false, top: '#d8d2c4', bottom: '#2a2f3a', umbrella: 'none', phone: false, bag: 'none' }), pose: 'smoke', phase: 2, spot: { p: V3(-6.55, 3.6 + 2 * 3.0 + 0.12, -9.6), yaw: Math.PI / 2 }, umbHand: 1, smoker: true });
  return agents;
}

/* ---------- per-frame crowd update ---------- */
const _p2 = { x: 0, z: 0 }, _d2 = { x: 0, z: 0 };

// Where a walker is at world time T. Pure, so camera moves can ask ahead of time.
function walkerAt(a, T, st) {
  if (!a.tl) a.tl = buildTimeline(a.path, a.speed, a.s0);
  const r = timelineAt(a.tl, T);
  st.act = r.act; st.actT = r.actT; st.d = r.d; st.hidden = r.act === 'hidden';
  a.path.at(r.s, _p2); a.path.dir(r.s, _d2);
  let dx = _d2.x, dz = _d2.z;
  if (r.back) { dx = -dx; dz = -dz; }
  // lateral offset grows on crossings so groups cross side by side
  const crossing = a.path.markers.find(m => m.type === 'cross' && r.s >= m.s - 0.5 && r.s <= m.s + (m.len || 8) + 0.5);
  let lat = a.lat;
  if (crossing) { const u = clamp((r.s - crossing.s) / (crossing.len || 8), 0, 1); lat = lerp(a.lat, a.crossLat, Math.sin(u * Math.PI) * 0.9 + (r.act === 'wait' ? 1 : 0) * 0.1); }
  if (r.act === 'wait') lat = a.crossLat * 0.8;
  let x = _p2.x + dz * lat, z = _p2.z - dx * lat;
  if (r.act === 'wait') { x -= dx * a.queue; z -= dz * a.queue; }
  st.x = x; st.z = z; st.y = walkY(x, z);
  st.yaw = Math.atan2(dx, dz);
  return st;
}
function personAt(a, T, out) {
  if (a.kind === 'walker') return walkerAt(a, T, out);
  out.hidden = a.kind !== 'spot';
  if (a.kind === 'spot') { out.x = a.spot.p.x; out.y = a.spot.p.y; out.z = a.spot.p.z; }
  return out;
}
function walkY(x, z) {
  // distance to the nearest road surface; kerbs ramp down at crossings
  const dMain = Math.max(0, Math.abs(x) - ROAD_HW);
  const dCross = Math.max(0, Math.max(CROSS.r0 - z, z - CROSS.r1));
  return CURB_H * sstep(0.0, 0.25, Math.min(dMain, dCross));
}
function updateCrowd(T) {
  const A = CROWD.agents;
  for (let i = 0; i < A.length; i++) {
    const a = A[i], st = a.state || (a.state = {});
    if (a.kind === 'walker') {
      walkerAt(a, T, st);
      if (st.act === 'vending') st.yaw = -Math.PI / 2;
      if (st.act === 'deliver') st.yaw = Math.PI / 2;
      if (a.izakaya) st.izakayaDoor = Math.hypot(st.x + 7.25, st.z + 8.3);
    } else if (a.kind === 'spot') {
      st.x = a.spot.p.x; st.y = a.spot.p.y; st.z = a.spot.p.z; st.yaw = a.spot.yaw; st.act = a.pose;
    } else if (a.kind === 'rider') {
      const vs = vehicleState(a.vehicle, T);
      st.hidden = !vs.visible;
      st.x = vs.x; st.y = 0; st.z = vs.z; st.yaw = vs.yaw; st.d = vs.dist;
      st.hideHead = CAMSTATE.riderId === a.vehicle;
    }
  }
  // umbrellas tilt away from each other when people pass
  for (let i = 0; i < A.length; i++) A[i].umbTilt = 0;
  for (let i = 0; i < A.length; i++) {
    const a = A[i]; if (a.look.umbrella !== 'open' || a.state.hidden) continue;
    for (let j = i + 1; j < A.length; j++) {
      const b = A[j]; if (b.look.umbrella !== 'open' || b.state.hidden) continue;
      const dx = b.state.x - a.state.x, dz = b.state.z - a.state.z, d = Math.hypot(dx, dz);
      if (d > 1.15 || d < 0.01) continue;
      const k = (1.15 - d) / 1.15 * 0.55;
      const sa = Math.cos(a.state.yaw) * dx - Math.sin(a.state.yaw) * dz;
      const sb = Math.cos(b.state.yaw) * -dx - Math.sin(b.state.yaw) * -dz;
      a.umbTilt -= Math.sign(sa) * k; b.umbTilt -= Math.sign(sb) * k;
    }
  }
  for (let i = 0; i < A.length; i++) {
    const a = A[i];
    const P = poseFor(a, T);
    writeAgent(i, a, P, T);
    if (a.state.hideHead) {
      for (const k of ['head', 'hair', 'hairLong', 'cap', 'neck', 'torso', 'bag', 'umbO', 'umbV', 'umbS']) CROWD.meshes[k].setMatrixAt(i, ZERO_M);
      for (const k of ['uarm', 'farm']) { CROWD.meshes[k].setMatrixAt(i * 2, ZERO_M); CROWD.meshes[k].setMatrixAt(i * 2 + 1, ZERO_M); }
    }
  }
  for (const k in CROWD.meshes) CROWD.meshes[k].instanceMatrix.needsUpdate = true;
}

/* ---------- small companions: the cart, the dog, the cat, a cigarette ---------- */
function buildCompanions() {
  const comp = {};
  const mk = (geo, color, rough = 0.7) => { const m = new THREE.Mesh(geo, std({ color, roughness: rough })); m.castShadow = true; return m; };
  // hand cart
  const cart = new THREE.Group();
  const bed = mk(new THREE.BoxGeometry(0.55, 0.06, 0.9), 0x8a8f92, 0.5); bed.position.y = 0.2; cart.add(bed);
  for (let i = 0; i < 3; i++) { const bx = mk(new THREE.BoxGeometry(0.45, 0.32, 0.4), 0xb8956a, 0.9); bx.position.set(0, 0.4 + i * 0.32, -0.1 + (i % 2) * 0.12); cart.add(bx); }
  const handle = mk(new THREE.BoxGeometry(0.55, 0.9, 0.03), 0x8a8f92, 0.5); handle.position.set(0, 0.62, -0.45); cart.add(handle);
  for (const [x, z] of [[-0.24, 0.35], [0.24, 0.35], [-0.24, -0.35], [0.24, -0.35]]) { const w = mk(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12).rotateZ(Math.PI / 2), 0x151515); w.position.set(x, 0.07, z); cart.add(w); }
  scene.add(cart); comp.cart = cart;
  // shiba inu
  const dog = new THREE.Group();
  const fur = 0xc8803a, cream = 0xf2e2c4;
  const body = mk(new THREE.SphereGeometry(0.5, 12, 8).scale(0.26, 0.24, 0.52), fur); body.position.y = 0.36; dog.add(body);
  const chest = mk(new THREE.SphereGeometry(0.5, 10, 8).scale(0.2, 0.2, 0.2), cream); chest.position.set(0, 0.33, 0.2); dog.add(chest);
  const head = new THREE.Group(); head.position.set(0, 0.52, 0.28); dog.add(head);
  const skull = mk(new THREE.SphereGeometry(0.5, 12, 8).scale(0.2, 0.18, 0.2), fur); head.add(skull);
  const snout = mk(new THREE.SphereGeometry(0.5, 10, 8).scale(0.1, 0.08, 0.14), cream); snout.position.set(0, -0.03, 0.1); head.add(snout);
  for (const s of [-1, 1]) { const ear = mk(new THREE.ConeGeometry(0.04, 0.09, 4), fur); ear.position.set(s * 0.055, 0.1, -0.01); ear.rotation.z = -s * 0.2; head.add(ear); }
  const legs = [];
  for (const [x, z] of [[-0.07, 0.17], [0.07, 0.17], [-0.07, -0.17], [0.07, -0.17]]) { const lg = new THREE.Group(); lg.position.set(x, 0.3, z); const m = mk(new THREE.CylinderGeometry(0.025, 0.022, 0.28, 6).translate(0, -0.14, 0), fur); lg.add(m); dog.add(lg); legs.push(lg); }
  const tail = mk(new THREE.TorusGeometry(0.06, 0.025, 6, 10, Math.PI * 1.5), fur); tail.position.set(0, 0.48, -0.25); tail.rotation.y = Math.PI / 2; dog.add(tail);
  scene.add(dog); comp.dog = { g: dog, legs, head, tail };
  // the leash
  const leash = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 4).translate(0, 0.5, 0), std({ color: 0xb02a22, roughness: 0.6 }));
  scene.add(leash); comp.leash = leash;
  // the alley cat on its crate
  const cat = new THREE.Group();
  const ccol = 0x2a2522;
  const cb = mk(new THREE.SphereGeometry(0.5, 10, 8).scale(0.16, 0.18, 0.28), ccol); cb.position.set(0, 0.12, 0); cat.add(cb);
  const ch = new THREE.Group(); ch.position.set(0, 0.26, 0.12); cat.add(ch);
  ch.add(mk(new THREE.SphereGeometry(0.5, 10, 8).scale(0.13, 0.11, 0.12), ccol));
  for (const s of [-1, 1]) { const e = mk(new THREE.ConeGeometry(0.03, 0.06, 4), ccol); e.position.set(s * 0.04, 0.06, 0); ch.add(e); }
  for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), basic({ color: hdr(1.6, 1.4, 0.3) })); eye.position.set(s * 0.025, 0.01, 0.055); ch.add(eye); }
  const tailSegs = [];
  let parent = cat;
  for (let i = 0; i < 6; i++) { const seg = new THREE.Group(); seg.position.set(0, i === 0 ? 0.06 : 0.0, i === 0 ? -0.14 : -0.045); parent.add(seg); const m = mk(new THREE.CylinderGeometry(0.014, 0.016, 0.05, 5).rotateX(Math.PI / 2).translate(0, 0, -0.025), ccol); seg.add(m); tailSegs.push(seg); parent = seg; }
  cat.position.copy(CAT_SPOT.p); cat.rotation.y = CAT_SPOT.yaw;
  scene.add(cat); comp.cat = { g: cat, head: ch, tail: tailSegs };
  // cigarette ember for the balcony smoker
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), basic({ color: hdr(6, 1.4, 0.3) }));
  scene.add(ember); comp.ember = ember;
  return comp;
}
let COMP = null;
function updateCompanions(T) {
  const A = CROWD.agents;
  const cartA = A.find(a => a.cart), dogA = A.find(a => a.dog), smoker = A.findIndex(a => a.smoker);
  if (cartA) {
    const st = cartA.state;
    const fwd = V3(Math.sin(st.yaw), 0, Math.cos(st.yaw));
    COMP.cart.position.set(st.x + fwd.x * 0.85, st.y, st.z + fwd.z * 0.85);
    COMP.cart.rotation.y = st.yaw;
    COMP.cart.visible = !st.hidden;
  }
  if (dogA) {
    const st = dogA.state;
    const fwd = V3(Math.sin(st.yaw), 0, Math.cos(st.yaw)), side = V3(Math.cos(st.yaw), 0, -Math.sin(st.yaw));
    const dp = V3(st.x + fwd.x * 1.1 + side.x * -0.45, st.y, st.z + fwd.z * 1.1 + side.z * -0.45);
    const D = COMP.dog;
    D.g.position.copy(dp); D.g.rotation.y = st.yaw + 0.15 * Math.sin(T * 0.7);
    const moving = st.act === 'walk';
    const ph = (st.d || 0) / 0.55 * TAU;
    D.legs.forEach((lg, i) => { lg.rotation.x = moving ? 0.55 * Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)) : 0; });
    D.head.rotation.y = 0.3 * Math.sin(T * 0.5); D.head.rotation.x = moving ? 0.1 * Math.sin(ph * 2) : 0.2 * Math.sin(T * 0.3);
    D.tail.rotation.z = 0.25 * Math.sin(T * 6);
    // leash from her hand to the collar
    const hand = _v1.setFromMatrixPosition(RIG.hd[0]);
    CROWD.meshes.hand.getMatrixAt(A.indexOf(dogA) * 2, _m1); hand.setFromMatrixPosition(_m1);
    const collar = V3(dp.x + fwd.x * 0.25, dp.y + 0.45, dp.z + fwd.z * 0.25);
    const dir = V3().subVectors(collar, hand);
    COMP.leash.position.copy(hand); COMP.leash.scale.set(1, dir.length(), 1);
    COMP.leash.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.normalize());
    D.g.visible = COMP.leash.visible = !st.hidden;
  }
  // cat: tail swishes, head turns slowly, sometimes looks at the camera's street
  const C = COMP.cat;
  C.tail.forEach((s, i) => { s.rotation.y = 0.35 * Math.sin(T * 1.7 - i * 0.6) * (0.4 + i * 0.12); s.rotation.x = -0.25 + 0.08 * i; });
  C.head.rotation.y = 0.6 * fbm1(T * 0.1 + 3, 2); C.head.rotation.x = 0.1 * Math.sin(T * 0.23);
  if (smoker >= 0) {
    CROWD.meshes.hand.getMatrixAt(smoker * 2, _m1);
    COMP.ember.position.setFromMatrixPosition(_m1).add(_v2.set(0, 0.02, 0));
    const puff = Math.max(0, Math.sin((T + A[smoker].phase * 3) * 0.3)) ** 6;
    COMP.ember.material.color.setRGB(4 + 10 * puff, 1 + 2 * puff, 0.25);
  }
}
