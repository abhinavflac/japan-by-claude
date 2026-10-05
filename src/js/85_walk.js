/* ============================================================
   Walk: a person you steer through the street. Gravity and kerbs,
   walls, posts and back blocks, parked and moving traffic, the
   crowd and him; mouse-look under pointer lock (or drag), a third
   person view that the wheel pulls in to first person, and a
   thumbstick with buttons on touch screens.
   ============================================================ */

const WALK = {
  on: false, keys: {}, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, body: 0, pitch: -0.1, dist: 2.6, distS: 2.6,
  grounded: true, crouch: 0, air: 0, phase: 0, jumpHeld: false, locked: false, solids: null, cars: [], agent: null,
  touch: { mx: 0, mz: 0, run: false, jump: false, crouch: false, stick: -1, look: -1, ox: 0, oy: 0, lx: 0, ly: 0 },
};
const WALK_R = 0.28, WALK_H = 1.75, WALK_H_LOW = 1.15, WALK_STEP = 0.36, WALK_G = 17, WALK_JUMP = 5.3;
const WALK_V = { walk: 1.7, run: 4.6, crouch: 0.9 };

// The person you play: one more member of the crowd rig, in a red jacket with a cap and a backpack.
// Its look is fixed rather than drawn from the seeded generator, so the rest of the world stays the same.
function playerAgent() {
  const c = h => new THREE.Color(h);
  const look = {
    female: false, elderly: false, child: false, s: 0.97, skin: c('#e2bf9c'), hair: c('#1b1512'), top: c('#b8352a'), bottom: c('#23272e'), shoes: c('#e8e8e4'),
    longHair: false, coat: false, skirt: false, bag: 'pack', bagColor: c('#2a2a2e'), umbrella: 'none', umbClear: false, umbColor: c('#16171a'), phone: false, cap: true, towel: false, gait: 1, armSwing: 1,
  };
  return (WALK.agent = { kind: 'player', look, phase: 0, umbHand: 1, capColor: '#ece9e1', state: { hidden: true, x: 0, y: 0, z: 0, yaw: 0 } });
}

// Ground under a point: pavements and roads on the street, one wet plane in the back lanes.
function walkGround(x, z) {
  const ax = Math.abs(x);
  if (z > 110 || z < -170 || (ax > 23.5 && (z < CROSS.s0 || z > CROSS.s1))) return -0.06;
  if (x < -FRONT_X && z > 50.3 && z < 55.7) return 0;
  if (x > FRONT_X && x < 21 && z > -29 && z < -19) return 0.06;
  return walkY(x, z);
}

// Everything solid that stands still: the camera colliders and the back blocks as boxes; vending machines,
// parked cars, bicycles and scooters as boxes turned to their yaw (x across, z along).
function walkSolids() {
  const boxes = COLLIDERS.slice();
  for (const b of MAP_BLOCKS) if (b.back && b.h > 0) boxes.push(new THREE.Box3(V3(b.x0, -1, b.z0), V3(b.x1, b.h, b.z1)));
  const obb = [];
  const add = (x, z, yaw, L, W, H) => obb.push({ x, z, c: Math.cos(yaw), s: Math.sin(yaw), hx: W / 2, hz: L / 2, y0: -1, y1: H });
  for (const v of VENDING) add(v.x, v.z, v.yaw, 0.72, 1.0, 2.0);
  for (const p of PARKED) { const d = VTYPES[p.type === 'kei' ? 'kei' : p.type === 'van' ? 'van' : 'sedan']; add(p.x, p.z, p.yaw, d.L, d.W, d.H); }
  for (const b of BIKES) add(b.p.x, b.p.z, b.yaw, 1.7, 0.5, 1.1);
  for (const s of SCOOTERS) add(s.p.x, s.p.z, s.yaw, 1.7, 0.6, 1.1);
  return { boxes, obb };
}

// Push the player's circle out of a rectangle centred dx, dz away, turned by (c, s) = (cos, sin) of its yaw.
// Traffic can't stop for you (it is worked out ahead of time), so a moving car only brushes you aside.
function pushRect(dx, dz, c, s, hx, hz, out, aside) {
  const r = WALK_R, lx = dx * c - dz * s, lz = dx * s + dz * c;
  const qx = clamp(lx, -hx, hx), qz = clamp(lz, -hz, hz);
  let px = 0, pz = 0;
  if (aside) {
    if (Math.abs(lx) >= hx + r || Math.abs(lz) >= hz + r) return;
    px = (Math.sign(lx) || 1) * (hx + r - Math.abs(lx));
  } else if (qx !== lx || qz !== lz) {
    const nx = lx - qx, nz = lz - qz, d = Math.hypot(nx, nz);
    if (d >= r) return;
    px = nx / d * (r - d); pz = nz / d * (r - d);
  } else if (hx - Math.abs(lx) < hz - Math.abs(lz)) px = (Math.sign(lx) || 1) * (hx - Math.abs(lx) + r);
  else pz = (Math.sign(lz) || 1) * (hz - Math.abs(lz) + r);
  const wx = px * c + pz * s, wz = -px * s + pz * c;
  WALK.x += wx; WALK.z += wz; out.x += wx; out.z += wz;
}

function walkCollide() {
  const W = WALK, r = WALK_R, foot = W.y + WALK_STEP, top = W.y + lerp(WALK_H, WALK_H_LOW, W.crouch), push = { x: 0, z: 0 };
  for (let it = 0; it < 3; it++) {
    for (const b of W.solids.boxes) {
      if (b.max.y <= foot || b.min.y >= top || W.x < b.min.x - r || W.x > b.max.x + r || W.z < b.min.z - r || W.z > b.max.z + r) continue;
      pushRect(W.x - (b.min.x + b.max.x) / 2, W.z - (b.min.z + b.max.z) / 2, 1, 0, (b.max.x - b.min.x) / 2, (b.max.z - b.min.z) / 2, push);
    }
    for (const list of [W.solids.obb, W.cars]) for (const o of list) {
      if (o.y1 <= foot || o.y0 >= top || Math.abs(W.x - o.x) > o.hx + o.hz + r || Math.abs(W.z - o.z) > o.hx + o.hz + r) continue;
      pushRect(W.x - o.x, W.z - o.z, o.c, o.s, o.hx, o.hz, push, list === W.cars);
    }
    const circle = (x, z, m) => { const dx = W.x - x, dz = W.z - z, d = Math.hypot(dx, dz); if (d < m && d > 1e-4) { W.x += dx / d * (m - d); W.z += dz / d * (m - d); push.x += dx / d * (m - d); push.z += dz / d * (m - d); } };
    for (const a of CROWD.agents) { const st = a.state; if (a !== W.agent && st && !st.hidden && Math.abs(st.y - W.y) < 1.2) circle(st.x, st.z, r + 0.24); }
    circle(HERO.x, HERO.z, r + 0.3);
  }
  // lose the part of the velocity that ran into something
  const pl = Math.hypot(push.x, push.z);
  if (pl > 1e-5) { const nx = push.x / pl, nz = push.z / pl, vn = W.vx * nx + W.vz * nz; if (vn < 0) { W.vx -= nx * vn; W.vz -= nz * vn; } }
}

// Ground plus anything low enough to step up on.
function walkFloor(x, z, y) {
  let g = walkGround(x, z);
  for (const b of WALK.solids.boxes) if (b.max.y > g && b.max.y <= y + WALK_STEP && x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z) g = b.max.y;
  return g;
}

function updateWalk(dt, T) {
  const W = WALK, k = W.keys, t = W.touch;
  dt = Math.min(dt, 1 / 20);
  // traffic near the player, as turned boxes
  W.cars.length = 0;
  for (const l of TRAFFIC.lives) {
    const s = vehicleState(l.id, T);
    if (!s.visible || Math.abs(s.x - W.x) > 14 || Math.abs(s.z - W.z) > 14) continue;
    const D = VDIM(l.type);
    W.cars.push({ x: s.x, z: s.z, c: Math.cos(s.yaw), s: Math.sin(s.yaw), hx: D.W / 2, hz: D.L / 2, y0: -1, y1: D.H });
  }
  let ix = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + t.mx;
  let iz = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + t.mz;
  const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  const low = !!(k.KeyC || t.crouch);
  W.crouch = clamp(W.crouch + (low ? 1 : -1) * dt * 6, 0, 1);
  const run = !!(k.ShiftLeft || k.ShiftRight || t.run) && !low;
  const vmax = low ? WALK_V.crouch : run ? WALK_V.run : WALK_V.walk;
  // input is relative to where you look: forward along the view, right across it
  const fx = Math.sin(W.yaw), fz = Math.cos(W.yaw), rx = -fz, rz = fx;
  const tx = (fx * iz + rx * ix) * vmax, tz = (fz * iz + rz * ix) * vmax;
  const a = 1 - Math.exp(-(W.grounded ? 12 : 2.5) * dt);
  W.vx += (tx - W.vx) * a; W.vz += (tz - W.vz) * a;
  const jump = !!(k.Space || t.jump);
  if (jump && W.grounded && !W.jumpHeld && W.crouch < 0.5) { W.vy = WALK_JUMP; W.grounded = false; }
  W.jumpHeld = jump;
  W.vy -= WALK_G * dt;
  const n = Math.max(1, Math.ceil(Math.hypot(W.vx, W.vz) * dt / 0.1));
  for (let i = 0; i < n; i++) {
    W.x = clamp(W.x + W.vx * dt / n, -250, 250); W.z = clamp(W.z + W.vz * dt / n, -330, 260); W.y += W.vy * dt / n;
    walkCollide();
    const g = walkFloor(W.x, W.z, W.y);
    if (W.y <= g || (W.grounded && W.vy <= 0 && W.y - g < WALK_STEP)) { W.y = g; W.vy = 0; W.grounded = true; }   // land, step up, or keep feet down a kerb
    else W.grounded = false;
  }
  const sp = Math.hypot(W.vx, W.vz);
  W.air = clamp(W.air + (W.grounded ? -1 : 1) * dt * 8, 0, 1);
  const ph0 = W.phase, wasAir = W.air > 0.5;
  W.phase += sp * dt / (lerp(1.42, 2.5, clamp((sp - WALK_V.walk) / (WALK_V.run - WALK_V.walk), 0, 1)) * WALK.agent.look.s) * TAU;
  if (W.grounded && (Math.floor(W.phase / Math.PI) !== Math.floor(ph0 / Math.PI) || wasAir)) walkStep(wasAir ? 1.6 : clamp(sp / WALK_V.walk, 0.4, 1.4) * (1 - 0.5 * W.crouch));
  // the body turns toward where it moves (in first person it faces the view)
  const want = W.distS < 0.6 ? W.yaw : sp > 0.3 ? Math.atan2(W.vx, W.vz) : W.body;
  W.body += wrapAngle(want - W.body) * (1 - Math.exp(-10 * dt));
  const st = W.agent.state;
  st.hidden = false; st.x = W.x; st.y = W.y; st.z = W.z; st.yaw = W.body; st.hideHead = W.distS < 0.6;
}

// A footfall on wet paving, when the sound is on: a short burst of the ambience's noise.
function walkStep(k) {
  if (!AUDIO.ctx || !AUDIO.on || !SEQ.playing) return;
  const c = AUDIO.ctx, t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = AUDIO.noiseBuf; f.type = 'bandpass'; f.frequency.value = 900 + 500 * hash1(WALK.phase); f.Q.value = 0.9;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32 * k, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  src.connect(f).connect(g).connect(AUDIO.master);
  src.start(t, hash1(WALK.phase * 3.1) * 3); src.stop(t + 0.18);
}

// Walk, run, crouch and jump on the crowd's own rig.
function playerPose(a, T) {
  const W = WALK, P = POSE0(), L = a.look;
  const sp = Math.hypot(W.vx, W.vz), runK = clamp((sp - WALK_V.walk) / (WALK_V.run - WALK_V.walk), 0, 1), c = W.crouch, air = W.air;
  if (sp > 0.08) {
    walkPose(P, W.phase, L, clamp(sp / WALK_V.walk, 0.3, 1) * (1 + 0.75 * runK));
    P.torsoPitch += 0.14 * runK;
    for (let j = 0; j < 2; j++) P.elbow[j] -= 0.9 * runK;
  } else idleSway(P, T, 0);
  for (let j = 0; j < 2; j++) {
    P.thigh[j] = lerp(P.thigh[j] * (1 - 0.5 * c) - 1.05 * c, j ? -0.35 : -0.9, air);
    P.knee[j] = lerp(P.knee[j] + 1.65 * c, j ? 0.8 : 1.3, air);
    P.foot[j] = lerp(P.foot[j] - 0.55 * c, 0.2, air);
    P.arm[j] = lerp(P.arm[j] - 0.35 * c, -0.85, air); P.armOut[j] = lerp(P.armOut[j], j ? 0.4 : -0.4, air);
  }
  P.y -= 0.36 * c;
  P.torsoPitch += 0.5 * c + 0.12 * air;
  P.headPitch = -W.pitch * 0.5 - 0.2 * c;
  return P;
}

// The view: over the shoulder, pulled in front of anything solid behind it, or from the eyes.
const _wRay = new THREE.Ray(), _wHit = new THREE.Vector3();
function walkCameraPose() {
  const W = WALK;
  W.distS += (W.dist - W.distS) * 0.2;
  const fpv = W.distS < 0.6;
  const sp = Math.hypot(W.vx, W.vz);
  const eye = W.y + lerp(1.6, 1.08, W.crouch) * WALK.agent.look.s;
  const fwd = V3(Math.sin(W.yaw) * Math.cos(W.pitch), Math.sin(W.pitch), Math.cos(W.yaw) * Math.cos(W.pitch));
  let pos;
  if (fpv) {
    const bob = W.grounded ? Math.abs(Math.sin(W.phase)) * 0.035 * clamp(sp / WALK_V.walk, 0, 1.6) : 0;
    pos = V3(W.x + Math.sin(W.yaw) * 0.1, eye + bob, W.z + Math.cos(W.yaw) * 0.1);
  } else {
    const right = V3(-Math.cos(W.yaw), 0, Math.sin(W.yaw));
    const pivot = V3(W.x, eye - 0.08, W.z).addScaledVector(right, 0.34 * Math.min(1, W.distS / 2));
    let d = W.distS;
    _wRay.set(pivot, fwd.clone().negate());
    for (const b of W.solids.boxes) if (b.distanceToPoint(pivot) < d && _wRay.intersectBox(b, _wHit)) d = Math.min(d, _wHit.distanceTo(pivot) - 0.22);
    pos = pivot.addScaledVector(fwd, -Math.max(0.3, d));
    pos.y = Math.max(pos.y, walkGround(pos.x, pos.z) + 0.15);
  }
  const o = { pos, target: pos.clone().addScaledVector(fwd, 10), mm: fpv ? 20 : 24, T: 8, focus: fpv ? 8 : W.distS + 1, exposure: 1, near: 0.05, rain: 1, reflPlane: 0, roll: 0 };
  o.quat = quatOf(o);
  return o;
}

/* ---------- entering and leaving ---------- */
function enterWalk() {
  if (WALK.on) return;
  const W = WALK, from = currentPose || evalShot(SEQ.idx, 0, SEQ.world);
  let x = SEQ.explore ? EXP.target.x : from.pos.x, z = SEQ.explore ? EXP.target.z : from.pos.z;
  if (!SEQ.explore) enterExplore();
  W.solids = W.solids || walkSolids();
  // start on a pavement: off the road, off a roof or out of a wall
  const inAlley = x > FRONT_X && x < ALLEY.x1 && z > ALLEY.z0 && z < ALLEY.z1;
  if ((Math.abs(x) > FRONT_X - 0.4 && !inAlley) || Math.abs(x) < ROAD_HW + 0.4) x = (Math.sign(x) || -1) * 4.6;
  z = clamp(z, -160, 100);
  const f = V3(0, 0, -1).applyQuaternion(from.quat || quatOf(from));
  Object.assign(W, { x, z, y: walkGround(x, z), vx: 0, vy: 0, vz: 0, yaw: Math.atan2(f.x, f.z), pitch: -0.1, grounded: true, crouch: 0, air: 0, keys: {}, cars: [] });
  W.body = W.yaw;
  for (let i = 0; i < 4; i++) walkCollide();
  W.on = true;
  UI.onWalk(true);
  walkLock();
}
// Leave the person where they stand; the caller decides where the camera goes next.
function leaveWalk() {
  if (!WALK.on) return;
  WALK.on = false; WALK.keys = {};
  Object.assign(WALK.touch, { mx: 0, mz: 0, run: false, jump: false, crouch: false, stick: -1, look: -1 });
  WALK.agent.state.hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
  UI.onWalk(false);
}
// From walking to the free orbit camera, circling the spot where the person stood.
function walkToOrbit() {
  const W = WALK;
  leaveWalk();
  EXP.target.set(W.x, W.y + 1.2, W.z);
  EXP.radius = 4; EXP.theta = W.yaw + Math.PI; EXP.phi = 1.25;
}

/* ---------- input: pointer lock or drag to look, the wheel to pull in, a thumbstick on touch ---------- */
function walkLook(dx, dy, k = 0.0022) {
  WALK.yaw -= dx * k;
  WALK.pitch = clamp(WALK.pitch - dy * k, -1.2, 1.15);
}
function walkLock() {
  if (IS_TOUCH || TEST || WALK.noLock) return;
  const cv = $('view');
  try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
function walkZoom(dy) {
  WALK.dist = clamp(WALK.dist * Math.exp(dy * 0.0015) + (dy > 0 && WALK.dist < 0.6 ? 0.8 : 0), 0, 6);
  if (WALK.dist < 0.75) WALK.dist = 0;
}
function walkPointerDown(e) {
  const t = WALK.touch, r = e.currentTarget.getBoundingClientRect();
  if (e.pointerType !== 'touch') { if (!WALK.locked) { WALK.drag = true; t.lx = e.clientX; t.ly = e.clientY; } return; }
  if (e.clientX - r.left < r.width * 0.45 && t.stick < 0) {
    t.stick = e.pointerId; t.ox = e.clientX; t.oy = e.clientY;
    const s = $('stick'); s.hidden = false; s.style.left = (e.clientX - r.left) + 'px'; s.style.top = (e.clientY - r.top) + 'px'; s.firstElementChild.style.transform = '';
  } else if (t.look < 0) { t.look = e.pointerId; t.lx = e.clientX; t.ly = e.clientY; }
}
function walkPointerMove(e) {
  const t = WALK.touch;
  if (e.pointerId === t.stick) {
    const R = 56, dx = e.clientX - t.ox, dy = e.clientY - t.oy, l = Math.hypot(dx, dy), m = Math.min(l, R) / (l || 1);
    t.mx = dx * m / R; t.mz = -dy * m / R; t.run = l > R * 1.25;
    $('stick').firstElementChild.style.transform = `translate(${dx * m}px, ${dy * m}px)`;
  } else if (e.pointerId === t.look || (e.pointerType !== 'touch' && WALK.drag)) {
    walkLook(e.clientX - t.lx, e.clientY - t.ly, e.pointerType === 'touch' ? 0.006 : 0.004);
    t.lx = e.clientX; t.ly = e.clientY;
  }
}
function walkPointerUp(e) {
  const t = WALK.touch;
  if (e.pointerId === t.stick) { t.stick = -1; t.mx = t.mz = 0; t.run = false; $('stick').hidden = true; }
  if (e.pointerId === t.look) t.look = -1;
  WALK.drag = false;
}
