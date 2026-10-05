/* ============================================================
   Twenty-four cameras in one coordinate system, their moves,
   lenses and operators, and the transitions between them
   ============================================================ */

const CAMSTATE = { vehicleId: -1, riderId: -1 };
const e3 = easeInOut;
const lv = (a, b, t) => V3().lerpVectors(a, b, t);

// Operator noise: deterministic per shot so a replay is identical.
function operator(o, t, kind, seed = 0) {
  const n = (f, s) => fbm1(t * f + s * 17.3 + seed * 5.1, 3);
  const K = {
    tripod: [0.0015, 0.0008, 0.3], crane: [0.004, 0.0015, 0.25], steadicam: [0.012, 0.004, 0.22], handheld: [0.012, 0.011, 0.75],
    walk: [0.008, 0.008, 0.9], vehicle: [0.004, 0.003, 4.5], bike: [0.012, 0.012, 1.6], drone: [0.05, 0.005, 0.12], none: [0, 0, 0],
  }[kind] || [0, 0, 0];
  if (REDUCED_MOTION) { K[0] *= 0.2; K[1] *= 0.2; }
  o.pos.x += n(K[2], 1) * K[0]; o.pos.y += n(K[2], 2) * K[0]; o.pos.z += n(K[2], 3) * K[0];
  o.dyaw = (o.dyaw || 0) + n(K[2] * 1.3, 4) * K[1];
  o.dpitch = (o.dpitch || 0) + n(K[2] * 1.3, 5) * K[1];
  o.droll = (o.droll || 0) + n(K[2] * 0.8, 6) * K[1] * 0.6;
  if (kind === 'vehicle') { o.dpitch += Math.sin(t * 23) * 0.0008 + (hash1(Math.floor(t * 3)) > 0.85 ? Math.sin(t * 40) * 0.003 : 0); }
}

function pose(pos, target, extra = {}) { return { pos, target, roll: 0, focus: null, ...extra }; }
const focusTo = (p, q) => p.distanceTo(q);

const SHOTS = [
  {
    name: 'Establishing', jp: '全景', mm: 24, T: 5.6, iso: 800, dur: 9, op: 'crane', subject: 'street', exit: 'push', enter: 'pull',
    desc: 'The whole street from behind the shōtengai arch. Signs, wires, and the train viaduct at the far end.',
    pose(u) { const k = e3(u); return pose(lv(V3(-1.9, 3.5, 52), V3(-1.6, 3.2, 47.5), k), lv(V3(2.4, 3.0, -6), V3(2.6, 2.6, -4), k), { focus: 45, exposure: 1.0 }); },
  },
  {
    name: 'Street Level', jp: '目線', mm: 35, T: 2.8, iso: 1600, dur: 7, op: 'handheld', subject: 'hero', exit: 'push', enter: 'push',
    desc: 'Eye level on the west pavement. Umbrellas pass close enough to touch.',
    pose(u) { const k = e3(u); const p = lv(V3(-5.5, 1.64, 16.6), V3(-5.45, 1.63, 15.2), k); return pose(p, lv(V3(4.4, 1.45, -1.2), V3(4.7, 1.45, -1.8), k)); },
  },
  {
    name: 'Low Angle', jp: '煽り', mm: 21, T: 4, iso: 1600, dur: 7, op: 'tripod', subject: 'hero', exit: 'push', enter: 'push',
    desc: 'From the kerb, looking up past him to his sign, the tenant boards and the wires.',
    pose(u) { const k = e3(u); const p = lv(V3(3.42, 0.5, 2.5), V3(3.44, 0.44, 1.9), k); return pose(p, lv(V3(5.0, 1.75, -0.7), V3(5.0, 3.5, -0.45), k), { focus: focusTo(p, HERO_HEAD) }); },
  },
  {
    name: 'Extreme Low', jp: '地面すれすれ', mm: 21, T: 2.8, iso: 3200, dur: 7, op: 'tripod', subject: 'hero', exit: 'pull', enter: 'push', near: 0.03,
    desc: 'Seven centimetres above the west kerb. The gutter puddle holds a copy of the street.',
    pose(u) { const k = e3(u); const p = lv(V3(-3.36, 0.23, 4.9), V3(-3.39, 0.23, 3.5), k); return pose(p, lv(V3(4.9, 1.05, -0.9), V3(4.95, 1.1, -0.4), k), { focus: focusTo(p, HERO_CHEST) }); },
  },
  {
    name: 'Balcony', jp: 'ベランダ', mm: 35, T: 4, iso: 1600, dur: 8, op: 'handheld', subject: 'hero', exit: 'push', enter: 'pull',
    desc: 'A third-floor balcony across the road: laundry, a potted maple, umbrellas from above.',
    pose(u) { const k = e3(u); return pose(lv(V3(-6.62, 8.12, -8.3), V3(-6.5, 8.14, -7.85), k), lv(V3(4.6, 0.95, 0.6), V3(4.85, 1.05, 0.15), k)); },
  },
  {
    name: 'Rooftop', jp: '屋上', mm: 24, T: 5.6, iso: 1600, dur: 8, op: 'tripod', subject: 'street', exit: 'push', enter: 'pull',
    desc: 'Seven storeys up at the parapet: a radio billboard, water tanks, and the street cutting through the blocks.',
    pose(u) { const k = e3(u); return pose(lv(V3(-6.32, 23.2, -13.32), V3(-6.28, 23.1, -13.3), k), lv(V3(6, 12, -2), V3(4, 6, 12), k), { focus: 30, exposure: 1.35 }); },
  },
  {
    name: 'Overhead', jp: '真俯瞰', mm: 40, T: 8, iso: 800, dur: 8, op: 'drone', subject: 'street', exit: 'push', enter: 'push',
    desc: 'Straight down through the wires: taxi roofs, umbrellas, and the red lanterns of the yokochō.',
    pose(u) { const k = e3(u), a = lerp(-0.05, 0.38, k); const p = V3(0.8, lerp(25.5, 23.5, k), -5.4); return pose(p, V3(0.8, 0, -5.52), { up: V3(Math.sin(a), 0, -Math.cos(a)), focus: 24, exposure: 1.25 }); },
  },
  {
    name: 'Drone', jp: 'ドローン', mm: 24, T: 4, iso: 1600, dur: 11, op: 'drone', subject: 'street', exit: 'push', enter: 'push',
    curve: new THREE.CatmullRomCurve3([V3(0.6, 17.5, 47), V3(0.2, 14.5, 32), V3(0.9, 11.6, 22), V3(2.6, 7.6, 15), V3(4.4, 4.0, 11.0)], false, 'centripetal'),
    desc: 'Down the length of the street over the arch, sinking toward him.',
    pose(u) {
      const k = clamp(smoother(u), 0, 1), p = this.curve.getPointAt(k), tan = this.curve.getTangentAt(Math.min(k + 0.02, 1));   // the polynomial can round a hair past 1
      const ahead = p.clone().addScaledVector(tan, 14).add(V3(0, -6.5, 0));
      return pose(p, ahead.lerp(HERO_HEAD, sstep(0.55, 1.0, u)), { roll: -tan.x * 0.12, focus: lerp(30, focusTo(p, HERO_HEAD), sstep(0.5, 1, u)) });
    },
  },
  {
    name: 'Follow', jp: '追従', mm: 35, T: 2, iso: 1600, dur: 8, op: 'steadicam', subject: 'hero', exit: 'push', enter: 'push',
    desc: 'Behind him along the pavement, close enough to see the drizzle on his coat.',
    pose(u) { const k = easeOut(u); const p = lv(V3(5.18, 1.62, 9.6), V3(5.44, 1.72, 1.7), k); return pose(p, lv(V3(4.9, 1.5, -6), V3(4.4, 1.45, -10), k), { focus: focusTo(p, HERO_HEAD) }); },
  },
  {
    name: 'Side Track', jp: '横移動', mm: 85, T: 2, iso: 1600, dur: 8, op: 'steadicam', subject: 'hero', exit: 'push', enter: 'push',
    desc: 'Tracking along the far kerb at 85 mm while taxis and cyclists cross the frame.',
    pose(u) { const z = lerp(5.0, -4.0, e3(u)); const p = V3(-3.25, 1.45, z); return pose(p, V3(5.0, 1.45, z * 0.3), { focus: focusTo(p, HERO_CHEST) }); },
  },
  {
    name: 'Front Track', jp: '後退移動', mm: 50, T: 1.8, iso: 1600, dur: 8, op: 'steadicam', subject: 'hero', exit: 'push', enter: 'pull',
    desc: 'Leading him, walking backwards. The kissaten windows glow behind his shoulders.',
    pose(u) { const k = e3(u); const p = lv(V3(5.2, 1.58, -2.4), V3(5.32, 1.62, -8.2), k); const tg = HERO_HEAD.clone().add(V3(0, -0.12, 0)); return pose(p, tg, { focus: focusTo(p, tg) }); },
  },
  {
    name: 'POV', jp: '主観', mm: 28, T: 4, iso: 1600, dur: 12, op: 'walk', subject: 'walk', exit: 'push', enter: 'push', umbrella: true,
    curve: new THREE.CatmullRomCurve3([V3(5.32, 1.62, -8.2), V3(5.45, 1.62, -5.6), V3(6.55, 1.62, -2.6), V3(6.7, 1.62, 1.2), V3(5.95, 1.62, 4.6), V3(5.25, 1.62, 7.4)], false, 'centripetal'),
    desc: 'Walking behind him under the overhang with a clear umbrella, past the mouth of Akari Yokochō.',
    pose(u, T) {
      const p = this.curve.getPointAt(u), tan = this.curve.getTangentAt(u);
      const t = u * this.dur, step = t * 1.85 * TAU;
      p.y += Math.abs(Math.sin(step / 2)) * 0.03 - 0.015; p.addScaledVector(V3(tan.z, 0, -tan.x), Math.sin(step / 2) * 0.012);
      let yaw = Math.atan2(tan.x, tan.z), pitch = -0.04;
      yaw += 0.95 * sstep(0.8, 1.6, t) * (1 - sstep(3.0, 4.0, t));                       // into the alley on the left
      const toHero = Math.atan2(HERO_HEAD.x - p.x, HERO_HEAD.z - p.z);
      yaw = lerp(yaw, toHero, sstep(4.2, 5.2, t) * (1 - sstep(7.0, 8.0, t)) * 0.85);       // at him as we pass
      yaw -= 1.25 * sstep(8.6, 10.2, t);                                                   // across at the ramen shop
      pitch += 0.06 * sstep(4.2, 5.2, t) * (1 - sstep(7, 8, t));
      const fwd = V3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      return pose(p, p.clone().add(fwd.multiplyScalar(8)), { roll: Math.sin(step / 2) * 0.008, focus: 6 });
    },
  },
  {
    name: 'Shop Window', jp: '店内から', mm: 35, T: 2, iso: 3200, dur: 9, op: 'handheld', subject: 'hero', exit: 'pull', enter: 'pull', interior: true, near: 0.04, rain: 0,
    desc: 'Inside Menya Akari behind a fresh bowl. Focus pulls across the road to him.',
    pose(u) {
      const k = e3(u); const p = lv(V3(-7.18, 1.21, 0.44), V3(-7.1, 1.2, 0.4), k);
      const bowl = V3(-6.42, 1.06, 0.35);
      return pose(p, lv(V3(4.6, -0.2, 0.2), V3(5.0, 0.7, 0.05), k), { focus: lerp(focusTo(p, bowl), focusTo(p, HERO_HEAD), sstep(0.32, 0.56, u)), exposure: 0.95 });
    },
  },
  {
    name: 'Vending Machine', jp: '自販機', mm: 18, T: 2.8, iso: 1600, dur: 8, op: 'tripod', subject: 'hero', exit: 'push', enter: 'pull',
    desc: 'Tucked beside the red vending machine. Hot drinks are back on the top row for October.',
    pose(u) { const k = e3(u); const p = lv(V3(-6.38, 1.02, 14.15), V3(-6.36, 1.04, 13.95), k); return pose(p, lv(V3(-1.2, 1.0, -2.0), V3(-0.6, 1.05, -2.6), k), { focus: focusTo(p, HERO_HEAD) }); },
  },
  {
    name: 'CCTV', jp: '防犯カメラ', mm: 14, T: 2, iso: 6400, dur: 8, op: 'none', subject: 'street', exit: 'pull', enter: 'pull', cctv: true, rain: 0.6,
    desc: 'The security camera on the record shop. Black and white, twelve and a half frames a second.',
    pose(u, T) {
      const p = CCTV_MOUNT.clone().add(V3(0.22, -0.08, 0));
      const sweep = Math.sin((T || 0) * TAU / 18) * 0.32;
      const base = V3(4.2, 0.4, -0.5).sub(p);
      const yaw = Math.atan2(base.x, base.z) + sweep, len = Math.hypot(base.x, base.z);
      return pose(p, p.clone().add(V3(Math.sin(yaw) * len, base.y, Math.cos(yaw) * len)), { focus: 8 });
    },
  },
  {
    name: 'Vehicle', jp: '車載', mm: 28, T: 2.8, iso: 3200, dur: 9, op: 'vehicle', subject: 'vehicle', exit: 'pull', enter: 'pull', interior: true, attach: 'taxi', near: 0.04, rain: 0,
    desc: 'The back seat of a taxi heading north. Lace seat covers, a running meter, a wet window.',
    pose(u, T) {
      const s = vehicleState(CAMSTATE.vehicleId, T);
      if (!s.visible) return pose(V3(1.6, 1.25, -20), V3(1.6, 1.2, 0), { focus: 10 });
      const yaw = s.yaw, f = V3(Math.sin(yaw), 0, Math.cos(yaw)), l = V3(Math.cos(yaw), 0, -Math.sin(yaw));
      const p = V3(s.x, 0, s.z).addScaledVector(l, 0.08).addScaledVector(f, -0.5); p.y = 1.16;
      const toHero = V3().subVectors(HERO_HEAD, p); const d = Math.hypot(toHero.x, toHero.z);
      const w = sstep(16, 4, d) * (toHero.dot(f) > -3 ? 1 : 0.2);
      const fwdT = p.clone().addScaledVector(f, 20).add(V3(0, -0.3, 0));
      const tgt = fwdT.lerp(HERO_HEAD.clone(), w * 0.9);
      return pose(p, tgt, { focus: lerp(12, d, w), vehicle: s });
    },
  },
  {
    name: 'Bicycle', jp: '自転車', mm: 18, T: 4, iso: 1600, dur: 9, op: 'bike', subject: 'vehicle', exit: 'push', enter: 'push', attach: 'bike',
    desc: 'A mamachari along the gutter, past the people on foot and the man under the sign.',
    pose(u, T) {
      const s = vehicleState(CAMSTATE.riderId, T);
      if (!s.visible) return pose(V3(2.78, 1.42, -20), V3(2.78, 1.2, 0), { focus: 8 });
      const f = V3(Math.sin(s.yaw), 0, Math.cos(s.yaw));
      const p = V3(s.x, 1.16, s.z).addScaledVector(f, -0.12);
      const toHero = V3().subVectors(HERO_HEAD, p); const d = Math.hypot(toHero.x, toHero.z);
      const w = sstep(10, 3.5, d) * (toHero.dot(f) > 0 ? 1 : sstep(-1.5, 0, toHero.dot(f)));
      const tgt = p.clone().addScaledVector(f, 10).add(V3(0, -2.1, 0)).lerp(HERO_HEAD.clone(), w * 0.55);
      return pose(p, tgt, { roll: Math.sin(s.dist * 1.5) * 0.015, focus: lerp(6, d, w) });
    },
  },
  {
    name: 'Alley', jp: '横丁', mm: 35, T: 2, iso: 3200, dur: 9, op: 'steadicam', subject: 'street', exit: 'push', enter: 'push',
    desc: 'Down Akari Yokochō: lanterns, a black cat on a crate, a slice of the main street.',
    pose(u) {
      const k = e3(u); const p = lv(V3(17.6, 1.56, -5.76), V3(8.3, 1.6, -5.86), k);
      const across = V3(-6.5, 1.9, -6.1);
      const tgt = across.lerp(HERO_HEAD.clone(), sstep(0.68, 0.98, u));
      return pose(p, tgt, { focus: focusTo(p, tgt) });
    },
  },
  {
    name: 'Reflection', jp: '水たまり', mm: 35, T: 2.8, iso: 1600, dur: 9, op: 'tripod', subject: 'hero', exit: 'push', enter: 'push', reflPlane: CURB_H,
    desc: 'A puddle on the pavement holds the street upside down, until the camera tilts up.',
    pose(u) {
      const k = e3(u); const p = lv(V3(3.43, 0.46, -4.95), V3(3.45, 0.44, -4.6), k);
      const down = V3(4.1, CURB_H, -2.2), up = HERO_HEAD.clone().add(V3(0, -0.25, 0));
      const tk = sstep(0.55, 0.95, u);
      return pose(p, down.lerp(up, tk), { focus: lerp(focusTo(p, HERO_HEAD) * 1.25, focusTo(p, HERO_HEAD), tk) });
    },
  },
  {
    name: 'Telephoto', jp: '望遠', mm: 135, T: 2.8, iso: 1600, dur: 8, op: 'tripod', subject: 'hero', exit: 'pull', enter: 'pull',
    desc: 'From 46 metres up the street at 135 mm: his sign, the tenant boards and the trains, stacked.',
    pose(u) { const k = e3(u); const p = lv(V3(4.42, 3.7, 46.4), V3(4.4, 3.68, 45.7), k); const tg = HERO_HEAD.clone().add(V3(0, 0.75, 0)); return pose(p, tg, { focus: focusTo(p, HERO_HEAD) }); },
  },
  {
    name: 'Macro', jp: '接写', mm: 110, T: 2.8, iso: 3200, dur: 9, op: 'tripod', subject: 'macro', exit: 'push', enter: 'pull', interior: true, near: 0.015, rain: 0,
    desc: 'Melon cream soda on the kissaten window table. The lens pulls back until he appears beyond the glass.',
    pose(u) {
      // bubbles and the scoop at 110 mm, then a pull back and zoom out to 40 mm that puts him beyond the glass, then focus to him
      const k = e3(u), z = sstep(0.28, 0.72, u);
      const soda = MACRO.soda.clone().setY(MACRO.t1.y + 0.12), top = soda.clone().setY(MACRO.t1.y + 0.168);
      const dir = V3().subVectors(HERO_CHEST, soda).setY(0).normalize(), side = V3(dir.z, 0, -dir.x);
      const p = soda.clone().addScaledVector(dir, -lerp(0.72, 1.38, z) + 0.05 * k).addScaledVector(side, -lerp(0.05, 0.52, z)).setY(MACRO.t1.y + lerp(0.19, 0.21, z));
      const bear = q => Math.atan2(q.x - p.x, q.z - p.z);
      const yaw = bear(soda) + wrapAngle(bear(HERO_CHEST) - bear(soda)) * 0.5 * z;
      const reach = Math.hypot(soda.x - p.x, soda.z - p.z);
      const tgt = p.clone().add(V3(Math.sin(yaw) * reach, lerp(top.y - p.y, 0, z), Math.cos(yaw) * reach));
      return pose(p, tgt, { mm: Math.exp(lerp(Math.log(110), Math.log(40), z)), focus: lerp(focusTo(p, top), focusTo(p, HERO_CHEST), sstep(0.74, 0.92, u)), exposure: 1.05 });
    },
  },
  {
    name: 'Orbit', jp: '回り込み', mm: 50, T: 2, iso: 1600, dur: 14, op: 'steadicam', subject: 'hero', exit: 'push', enter: 'push', near: 0.08, rain: 0.4,
    desc: 'A full circle around him. Every direction belongs to the same street.',
    pose(u) {
      const th = 0.13 + smoother(u) * TAU * 0.98;
      const c = HERO_CHEST.clone();
      const p = V3(c.x + Math.cos(th) * 1.95, 1.58, c.z + Math.sin(th) * 1.95);
      return pose(p, c.clone().add(V3(0, 0.22, 0)), { focus: 1.95 });
    },
  },
  {
    name: 'Crane', jp: 'クレーン', mm: 24, T: 4, iso: 1600, dur: 9, op: 'crane', subject: 'hero', exit: 'rise', enter: 'pull',
    desc: 'Up from the kerb, between the signs and through the wires, to the rooftops.',
    pose(u) {
      const k = e3(u);
      const B = (a, b, c, d, t) => V3().addScaledVector(a, (1 - t) ** 3).addScaledVector(b, 3 * (1 - t) ** 2 * t).addScaledVector(c, 3 * (1 - t) * t * t).addScaledVector(d, t ** 3);
      const p = B(V3(3.42, 0.62, -3.6), V3(1.2, 3.2, -2.2), V3(0.4, 12.5, 4.0), V3(0.6, 19.5, 9.6), k);
      const tgt = HERO_CHEST.clone().lerp(V3(1.0, 0.0, -18), sstep(0.25, 1.0, u));
      return pose(p, tgt, { focus: focusTo(p, tgt) });
    },
  },
  {
    name: 'Aerial', jp: '空撮', mm: 24, T: 8, iso: 800, dur: 15, op: 'drone', subject: 'street', exit: 'push', enter: 'continue',
    desc: 'Above everything: the street, the alley, the tracks, and the city around them.',
    pose(u) {
      const k = smoother(u);
      const c = V3(0, 0, -22);
      const th0 = Math.atan2(9.6 - c.z, 0.6 - c.x);
      const th = th0 + k * 1.15;
      const r = lerp(31.6, 125, k), h = lerp(19.5, 135, k);
      const p = V3(c.x + Math.cos(th) * r, h, c.z + Math.sin(th) * r);
      const tgt = V3(0, 0, lerp(-10, -26, k));
      return pose(p, tgt, { focus: 200, near: 0.4 });
    },
  },
];
SHOTS.forEach((s, i) => { s.id = i + 1; s.no = String(i + 1).padStart(2, '0'); });

// How the sequence moves from each camera to the next.
const SEQ_TRANS = {
  1: ['glide', 2.6], 2: ['glide', 1.8], 3: ['glide', 1.4], 4: ['glide', 2.4], 5: ['glide', 2.6], 6: ['glide', 2.4], 7: ['glide', 2.2], 8: ['glide', 1.4],
  9: ['orbit', 2.2], 10: ['orbit', 2.0], 11: ['continuous', 0], 12: ['push', 1.4], 13: ['focus', 1.3], 14: ['glide', 1.8], 15: ['glitch', 0.8],
  16: ['whip', 0.75], 17: ['wipe', 0.9], 18: ['glide', 2.0], 19: ['focus', 1.4], 20: ['focus', 1.4], 21: ['glide', 2.6], 22: ['glide', 1.6], 23: ['continuous', 0], 24: ['glide', 4.2, { enter: 'push', via: [V3(-55, 90, 88), V3(-1.5, 34, 92)] }],
};

/* ---------- camera attachments chosen when a shot begins ---------- */
function pickAttachment(shot, T) {
  if (shot.attach === 'taxi') {
    let best = -1, bestErr = 1e9;
    for (const l of TRAFFIC.lives) {
      if (l.routeName !== 'N') continue;
      const taxi = l.type === 'taxiS' || l.type === 'taxiJ';
      for (let dt = 2; dt <= 7; dt += 0.5) {
        const s = vehicleState(l.id, T + dt);
        if (!s.visible) continue;
        const err = Math.abs(s.z - (HERO.z - 1.5)) + Math.abs(dt - 4.2) * 2 + (taxi ? 0 : 30);
        const s0 = vehicleState(l.id, T);
        if (!s0.visible) continue;
        if (err < bestErr) { bestErr = err; best = l.id; }
      }
    }
    CAMSTATE.vehicleId = best;
  } else if (shot.attach === 'bike') {
    let best = -1, bestErr = 1e9;
    const lane = TRAFFIC.lives.filter(l => l.routeName === 'bN' || l.routeName === 'bN2');
    // a rider close ahead would fill the lens with the back of a coat
    const crowded = l => { for (let dt = 0; dt <= 9; dt += 1.5) { const s = vehicleState(l.id, T + dt); if (!s.visible) continue; for (const o of lane) { if (o === l) continue; const q = vehicleState(o.id, T + dt); if (q.visible && Math.abs(q.x - s.x) < 0.6 && q.z - s.z > 0 && q.z - s.z < 4.5) return true; } } return false; };
    for (const l of lane) {
      const s0 = vehicleState(l.id, T); if (!s0.visible) continue;
      for (let dt = 1.5; dt <= 8.5; dt += 0.5) {
        const s = vehicleState(l.id, T + dt); if (!s.visible) continue;
        const err = Math.abs(s.z - HERO.z) + Math.abs(dt - 4.5) * 1.2;
        if (err < bestErr && !crowded(l)) { bestErr = err; best = l.id; }
      }
    }
    if (best < 0) for (const l of TRAFFIC.lives) { if (l.type === 'bike' && vehicleState(l.id, T).visible) { best = l.id; break; } }
    CAMSTATE.riderId = best;
  }
}
function releaseAttachment(shot) {
  if (shot.attach === 'taxi') CAMSTATE.vehicleId = -1;
  if (shot.attach === 'bike') CAMSTATE.riderId = -1;
}

/* ---------- evaluating a shot into a full camera state ---------- */
function evalShot(i, u, T) {
  const s = SHOTS[i];
  const o = s.pose(clamp(u, 0, 1), T);
  o.mm = o.mm || s.mm; o.T = o.T || s.T;
  if (o.focus == null) o.focus = focusTo(o.pos, o.target);
  o.exposure = o.exposure == null ? 1 : o.exposure;
  o.near = o.near || s.near || 0.1;
  o.reflPlane = s.reflPlane || 0;
  o.rain = s.rain == null ? 1 : s.rain;
  o.cctv = s.cctv ? 1 : 0;
  o.op = s.op;
  operator(o, (T || 0) + i * 31.7, s.op, i);
  return o;
}

function forwardOf(o) { return V3().subVectors(o.target, o.pos).normalize(); }
function quatOf(o) {
  const m = new THREE.Matrix4().lookAt(o.pos, o.target, o.up || V3(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const extra = new THREE.Quaternion().setFromEuler(new THREE.Euler((o.dpitch || 0), (o.dyaw || 0), (o.roll || 0) + (o.droll || 0), 'YXZ'));
  return q.multiply(extra);
}

// The man himself is kept out of camera moves, like the walls are.
const HERO_KEEP = new THREE.Box3(V3(HERO.x - 0.7, 0, HERO.z - 0.7), V3(HERO.x + 0.7, 2.15, HERO.z + 0.7));
const blockersFor = (p0, p3) => COLLIDERS.concat([HERO_KEEP]).filter(b => !b.containsPoint(p0) && !b.containsPoint(p3));

// Highest obstacle a path runs into (-1 when clear), sampled finely enough not to skip a lamp post.
// Away from its two ends a move also keeps 30 cm of air around everything.
function pathTop(at, blockers, hull, p0, p3) {
  const box = new THREE.Box3().setFromPoints(hull).expandByScalar(0.8);
  const bs = blockers.filter(b => b.intersectsBox(box)).map(b => [b, b.clone().expandByScalar(0.3)]);
  if (!bs.length) return -1;
  const n = clamp(Math.ceil(box.getSize(V3()).length() / 0.2), 32, 600);
  let top = -1;
  for (let i = 1; i < n; i++) {
    const p = at(i / n), far = p.distanceToSquared(p0) > 0.64 && p.distanceToSquared(p3) > 0.64;
    for (const [b, big] of bs) if ((far ? big : b).containsPoint(p)) top = Math.max(top, b.max.y);
  }
  return top;
}

// Bezier paths between two poses, gentlest first: the natural curve, a straight line, bends to
// either side, and only then a rise over whatever is in the way, no higher than it must.
function glideCandidates(A, B, sA, sB) {
  const p0 = A.pos.clone(), p3 = B.pos.clone();
  const d = p0.distanceTo(p3);
  const k = clamp(d * 0.3, 0.3, 14);
  const dirOf = (o, mode) => mode === 'pull' ? forwardOf(o).negate() : mode === 'rise' ? V3(0, 1, 0) : forwardOf(o);
  const blockers = blockersFor(p0, p3);
  const blocked = p => blockers.some(b => b.containsPoint(p));
  const p1 = p0.clone().addScaledVector(dirOf(A, sA.exit), k);
  const p2 = p3.clone().addScaledVector(dirOf(B, sB.enter === 'continue' ? 'push' : sB.enter), -k);
  for (let i = 0; i < 4 && blocked(p1); i++) p1.lerp(V3().lerpVectors(p0, p3, 1 / 3), 0.5);
  for (let i = 0; i < 4 && blocked(p2); i++) p2.lerp(V3().lerpVectors(p0, p3, 2 / 3), 0.5);
  p1.y = Math.max(p1.y, 0.2); p2.y = Math.max(p2.y, 0.2);   // the curve stays inside its control hull, so above the pavement
  const top = c => pathTop(e => bez(c, e), blockers, c, p0, p3);
  const third = t => V3().lerpVectors(p0, p3, t);
  const side = V3(p3.z - p0.z, 0, p0.x - p3.x);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const natural = [p0, p1, p2, p3];
  const cands = [natural, [p0, third(1 / 3), third(2 / 3), p3]];
  if (sB.via) cands.unshift([p0, sB.via[0].clone(), sB.via[1].clone(), p3]);
  for (const m of [1.2, 2.5, 4]) for (const sg of [1, -1]) { const o = side.clone().multiplyScalar(m * sg); cands.push([p0, p1.clone().add(o), p2.clone().add(o), p3]); }
  const out = [];
  for (const c of cands) { if (top(c) < 0) out.push(c); if (out.length >= 3) break; }
  // vertical variants that clear traffic and people: straight up first, or a hop over the road
  const hopY = Math.max(p1.y, p2.y, (8 * 5.4 - p0.y - p3.y) / 6);   // midpoint above the lamp heads
  for (const c of [[p0, p0.clone().add(V3(0, Math.max(2.4, k * 0.6), 0)), p2, p3], [p0, p1.clone().setY(hopY), p2.clone().setY(hopY), p3]]) if (top(c) < 0) out.push(c);
  if (!out.length) {
    // rise over what is in the way, each half only as high as its own obstacles
    const half = (c, h) => pathTop(e => bez(c, h * 0.5 + e * 0.5), blockers, c, p0, p3);
    const y1 = half(natural, 0) + 3, y2 = half(natural, 1) + 3, y = Math.max(y1, y2);
    const lifted = [[p0, p1.clone().setY(Math.max(p1.y, y1)), p2.clone().setY(Math.max(p2.y, y2)), p3], [p0, p1.clone().setY(Math.max(p1.y, y)), p2.clone().setY(Math.max(p2.y, y)), p3]];
    for (const c of lifted) if (Math.max(c[1].y, c[2].y) - Math.max(p0.y, p3.y) <= 18 + Math.abs(p0.y - p3.y) && top(c) < 0) { out.push(c); break; }
  }
  return out;
}

// An arc around him, radius and height eased between the two poses.
function orbitPos(A, B, e) {
  const c = HERO_CHEST;
  const a0 = Math.atan2(A.pos.z - c.z, A.pos.x - c.x), a1 = Math.atan2(B.pos.z - c.z, B.pos.x - c.x);
  const r0 = Math.hypot(A.pos.x - c.x, A.pos.z - c.z), r1 = Math.hypot(B.pos.x - c.x, B.pos.z - c.z);
  const a = a0 + wrapAngle(a1 - a0) * e, r = lerp(r0, r1, e) + Math.sin(e * Math.PI) * 0.6;
  return V3(c.x + Math.cos(a) * r, lerp(A.pos.y, B.pos.y, e) + Math.sin(e * Math.PI) * 0.25, c.z + Math.sin(a) * r);
}

// Traffic and people near a move. The world clock is deterministic, so every vehicle and walker
// a move will meet is known before it starts.
const VDIM = t => t === 'bike' ? { L: 1.9, W: 0.75, H: 2.05 } : VTYPES[t];
function lifeNear(box, T0, T1) {
  const cars = [], folk = [], tmp = {};
  const inBox = (x, z, m) => x > box.min.x - m && x < box.max.x + m && z > box.min.z - m && z < box.max.z + m;
  for (const l of TRAFFIC.lives) for (const t of [T0, (T0 + T1) / 2, T1]) { const s = vehicleState(l.id, t); if (s.visible && inBox(s.x, s.z, 40)) { cars.push(l); break; } }
  for (const a of CROWD.agents) { if (a.kind === 'rider') continue; const st = personAt(a, T0, tmp); if (inBox(st.x, st.z, 9)) folk.push(a); }
  return { cars, folk };
}
function lifeHit(at, T0, dur, near) {
  const n = clamp(Math.ceil(dur * 26), 20, 140), tmp = {};
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (k < 0.06 || k > 0.94) continue;   // the shots' own framing is theirs to keep
    const p = at(k), t = T0 + k * dur;
    if (p.y > 3.6) continue;
    for (const l of near.cars) {
      const v = vehicleState(l.id, t); if (!v.visible) continue;
      const D = VDIM(l.type), dx = p.x - v.x, dz = p.z - v.z, c = Math.cos(v.yaw), sn = Math.sin(v.yaw);
      if (Math.abs(dx * sn + dz * c) < D.L / 2 + 0.25 && Math.abs(dx * c - dz * sn) < D.W / 2 + 0.22 && p.y < D.H + 0.15) return true;
    }
    if (p.y > 2.4) continue;
    for (const a of near.folk) {
      const st = personAt(a, t, tmp); if (st.hidden) continue;
      const h = p.y - st.y, open = a.look.umbrella === 'open';
      if (h < -0.1 || h > (open ? 2.2 : 1.92)) continue;
      if (Math.hypot(p.x - st.x, p.z - st.z) < (open && h > 1.5 ? 0.7 : 0.5)) return true;
    }
  }
  return false;
}

// Orientation during a move: locked on him when both ends look at him, otherwise a slerp.
function transQuat(A, B, e, pos, both) {
  if (both) return quatOf({ pos, target: lv(A.target, B.target, e), roll: lerp(A.roll || 0, B.roll || 0, e) });
  return (A.quat || quatOf(A)).clone().slerp(quatOf(B), e);
}

// Choose the move and its timing: a path clear of walls and of him that never stares into a
// wall from close up, timed so no vehicle or passer-by meets the lens. Null when only a rack focus will do.
function planMove(type, A, j, sA, sB, dur) {
  const T0 = SEQ.world;
  const B = evalShot(j, 0, T0 + dur);
  const both = sA.subject === 'hero' && sB.subject === 'hero';
  const walls = COLLIDERS.filter(b => !b.thin && !b.containsPoint(A.pos) && !b.containsPoint(B.pos));
  const ray = new THREE.Ray(), hit = V3();
  const blind = at => {
    for (let i = 3; i <= 21; i++) {
      const e = i / 24, p = at(e);
      ray.set(p, V3(0, 0, -1).applyQuaternion(transQuat(A, B, e, p, both)));
      for (const b of walls) if (ray.intersectBox(b, hit) && hit.distanceToSquared(p) < 4.4) return true;
    }
    return false;
  };
  const moves = [];
  if (type === 'orbit') {
    const r = o => Math.hypot(o.pos.x - HERO.x, o.pos.z - HERO.z);
    const hull = []; for (let i = 0; i <= 16; i++) hull.push(orbitPos(A, B, i / 16));
    if (Math.max(r(A), r(B)) < 14 && pathTop(e => orbitPos(A, B, e), blockersFor(A.pos, B.pos), hull, A.pos, B.pos) < 0) moves.push({ type: 'orbit', at: e => orbitPos(A, B, e), hull });
  }
  for (const c of glideCandidates(A, B, sA, sB)) moves.push({ type: 'glide', path: c, at: e => bez(c, e), hull: c });
  if (!moves.length) return null;
  const box = new THREE.Box3();
  for (const m of moves) for (const p of m.hull) box.expandByPoint(p);
  const near = box.min.y > 3.6 ? null : lifeNear(box, T0, T0 + dur * 1.45);
  for (const m of moves) {
    if (blind(m.at)) continue;
    if (!near) return { type: m.type, path: m.path, dur };
    for (const f of [1, 0.85, 1.2, 0.7, 1.45]) if (!lifeHit(k => m.at(smoother(k)), T0, dur * f, near)) return { type: m.type, path: m.path, dur: dur * f };
  }
  return null;
}
function bez(c, t) { const u = 1 - t; return V3().addScaledVector(c[0], u * u * u).addScaledVector(c[1], 3 * u * u * t).addScaledVector(c[2], 3 * u * t * t).addScaledVector(c[3], t * t * t); }

function blendLens(A, B, k) {
  return { mm: Math.exp(lerp(Math.log(A.mm), Math.log(B.mm), k)), T: lerp(A.T, B.T, k), focus: Math.exp(lerp(Math.log(Math.max(A.focus, 0.05)), Math.log(Math.max(B.focus, 0.05)), k)), exposure: lerp(A.exposure, B.exposure, k), near: Math.min(A.near, B.near), rain: lerp(A.rain, B.rain, k), reflPlane: k < 0.5 ? A.reflPlane : B.reflPlane };
}

/* ---------- the sequencer ---------- */
const SEQ = { idx: 0, t: 0, playing: true, auto: true, transitions: !REDUCED_MOTION, speed: 1, tr: null, world: 0, explore: false, cutFlag: true, endFade: 0 };

function shotDur(i) { return SHOTS[i].dur; }
function gotoShot(j, opts = {}) {
  j = (j + SHOTS.length) % SHOTS.length;
  const from = SEQ.idx;
  if (SEQ.explore) exitExplore(false);
  const seq = opts.seq && j === (from + 1) % SHOTS.length;
  let type = 'cut', dur = 0, entry = null;
  if (SEQ.transitions && from !== j) {
    if (seq) [type, dur, entry] = SEQ_TRANS[from + 1];
    else {
      const A = SHOTS[from], B = SHOTS[j];
      const indoor = A.interior || B.interior || A.attach || B.attach || A.cctv || B.cctv;
      const dist = currentPose ? currentPose.pos.distanceTo(evalShot(j, 0, SEQ.world).pos) : 99;
      type = indoor ? 'focus' : dist > 70 ? 'focus' : (A.subject === 'hero' && B.subject === 'hero') ? 'orbit' : 'glide';
      dur = type === 'focus' ? 1.2 : clamp(dist / 14, 1.2, 3.2);
    }
  }
  const prevShot = SHOTS[from];
  if (type === 'cut' || type === 'continuous' || dur <= 0) {
    releaseAttachment(prevShot);
    SEQ.idx = j; SEQ.t = 0; SEQ.tr = null; SEQ.cutFlag = true;
    pickAttachment(SHOTS[j], SEQ.world);
    onShotChange();
    return;
  }
  const A = currentPose ? clonePose(currentPose) : evalShot(from, 1, SEQ.world);
  let path = null;
  if (type === 'glide' || type === 'orbit') {
    const plan = planMove(type, A, j, SHOTS[from], entry ? { ...SHOTS[j], ...entry } : SHOTS[j], dur);
    if (plan) ({ type, dur, path } = plan); else { type = 'focus'; dur = 1.3; }
  }
  pickAttachment(SHOTS[j], SEQ.world + dur);
  SEQ.tr = { from, to: j, type, dur, t: 0, A, path };
  onShotChange(true);
}
function clonePose(o) { return { ...o, pos: o.pos.clone(), target: o.target.clone(), up: o.up ? o.up.clone() : undefined }; }

let currentPose = null;
function updateSequencer(dtReal) {
  const dt = SEQ.playing ? dtReal * SEQ.speed : 0;
  SEQ.world += dt;
  if (SEQ.explore) return;
  if (SEQ.tr) {
    SEQ.tr.t += dt;
    if (SEQ.tr.t >= SEQ.tr.dur) {
      releaseAttachment(SHOTS[SEQ.tr.from]);
      SEQ.idx = SEQ.tr.to; SEQ.t = 0; SEQ.tr = null;
      onShotChange();
    }
  } else {
    SEQ.t += dt;
    if (SEQ.t >= shotDur(SEQ.idx)) {
      if (SEQ.auto) gotoShot(SEQ.idx + 1, { seq: true });
      else SEQ.t = SEQ.t % shotDur(SEQ.idx);
    }
  }
}

// The camera for this frame, plus the look for the post pipeline.
function evaluateCamera() {
  const T = SEQ.world;
  let o, look = { cctv: 0, glitch: 0, wipe: 0, wipeDir: 1, fade: 0, drops: 0, distort: 0, cut: false };
  if (SEQ.explore) { o = WALK.on ? walkCameraPose() : exploreCameraPose(); }
  else if (!SEQ.tr) {
    o = evalShot(SEQ.idx, SEQ.t / shotDur(SEQ.idx), T);
    o.quat = quatOf(o);
    look.cctv = o.cctv;
  } else {
    const tr = SEQ.tr, k = clamp(tr.t / tr.dur, 0, 1);
    const B = evalShot(tr.to, 0, T);
    const A = tr.A;
    if (tr.type === 'glide' || tr.type === 'orbit') {
      const e = smoother(k);
      const pos = tr.type === 'orbit' ? orbitPos(A, B, e) : bez(tr.path, e);
      const both = tr.from !== tr.to && SHOTS[tr.from].subject === 'hero' && SHOTS[tr.to].subject === 'hero';
      o = { pos, ...blendLens(A, B, e) };
      o.quat = transQuat(A, B, e, pos, both);
      const fwd = V3(0, 0, -1).applyQuaternion(o.quat), toH = V3().subVectors(HERO_CHEST, pos), dH = toH.length();
      if (both) o.focus = lerp(o.focus, dH, sstep(0.88, 0.97, fwd.dot(toH) / dH));
      o.target = both ? lv(A.target, B.target, e) : pos.clone().addScaledVector(fwd, o.focus);
      if (SHOTS[tr.to].cctv) look.cctv = sstep(0.7, 1.0, k);
      if (SHOTS[tr.from].cctv) look.cctv = 1 - sstep(0.0, 0.3, k);
    } else if (tr.type === 'focus' || tr.type === 'push' || tr.type === 'whip' || tr.type === 'glitch' || tr.type === 'wipe' || tr.type === 'dip') {
      const mid = tr.type === 'whip' ? 0.45 : 0.5;
      const first = k < mid;
      const src = first ? A : B;
      o = { ...clonePose(src), mm: src.mm, T: src.T };
      o.quat = first ? (A.quat || quatOf(A)) : quatOf(B);
      const ph = first ? k / mid : (k - mid) / (1 - mid);
      if (tr.type === 'focus') {
        const blur = first ? easeIn(ph) : 1 - easeOut(ph);
        o.focus = Math.exp(lerp(Math.log(src.focus), Math.log(0.12), blur));
        o.T = lerp(src.T, 1.2, blur);
        o.exposure = src.exposure * (1 + 0.3 * blur);
      } else if (tr.type === 'push') {
        const f = V3(0, 0, -1).applyQuaternion(o.quat);
        const d = first ? easeIn(ph) * 1.1 : -(1 - easeOut(ph)) * 0.9;
        o.pos = o.pos.clone().addScaledVector(f, d);
        const blur = first ? easeIn(ph) : 1 - easeOut(ph);
        o.focus = Math.exp(lerp(Math.log(src.focus), Math.log(0.15), blur));
        o.T = lerp(src.T, 1.4, blur);
        o.exposure = src.exposure * (1 - 0.35 * blur);
      } else if (tr.type === 'whip') {
        const ang = first ? easeIn(ph) * 1.1 : -(1 - easeOut(ph)) * 1.1;
        o.quat = o.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), -ang));
      } else if (tr.type === 'glitch') {
        look.glitch = Math.sin(k * Math.PI);
        look.cctv = first ? 1 - 0 : 0;
      } else if (tr.type === 'wipe') {
        look.wipe = k; look.wipeDir = 1;
      } else if (tr.type === 'dip') {
        look.fade = Math.sin(k * Math.PI);
      }
      if (first && SHOTS[tr.from].cctv && tr.type !== 'glitch') look.cctv = 1;
      if (!first && SHOTS[tr.to].cctv) look.cctv = 1;
      if (tr.prevFirst !== undefined && tr.prevFirst !== first) look.cut = true;
      tr.prevFirst = first;
    }
  }
  currentPose = o;
  if (SHOTS[SEQ.idx].cctv && !SEQ.tr && !SEQ.explore) { look.drops = 0.7; look.distort = 0.55; }
  if (SEQ.tr && SHOTS[SEQ.tr.to].cctv) { look.drops = 0.7 * look.cctv; look.distort = 0.55 * look.cctv; }
  return { o, look };
}

function applyCamera(o) {
  camera.position.copy(o.pos);
  camera.quaternion.copy(o.quat || quatOf(o));
  camera.near = o.near || 0.1;
  camera.far = 3000;
  camera.setFocalLength(o.mm);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  U.uPxWorld.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, pipeline.h);
}

function onShotChange(transitioning) {
  SEQ.cutFlag = true;
  UI && UI.onShot && UI.onShot(transitioning ? SEQ.tr.to : SEQ.idx, transitioning);
}

/* ---------- explore: orbit, pan, dolly, WASD ---------- */
const EXP = { target: V3(), radius: 6, theta: 0, phi: 1.2, vt: V3(), keys: {}, dragging: false, mode: 0, lx: 0, ly: 0, pinch: 0 };
function enterExplore() {
  if (SEQ.explore) return;
  const o = currentPose || evalShot(SEQ.idx, 0, SEQ.world);
  const fwd = V3(0, 0, -1).applyQuaternion(o.quat || quatOf(o));
  const dist = clamp(o.focus || 6, 1.5, 60);
  EXP.target.copy(o.pos).addScaledVector(fwd, dist);
  EXP.radius = dist;
  const d = V3().subVectors(o.pos, EXP.target);
  EXP.theta = Math.atan2(d.x, d.z); EXP.phi = Math.acos(clamp(d.y / dist, -1, 1));
  EXP.mm = 28;
  releaseAttachment(SHOTS[SEQ.idx]);
  SEQ.tr = null;
  SEQ.explore = true;
  UI.onExplore(true);
}
function exitExplore(resume = true) {
  if (!SEQ.explore) return;
  leaveWalk();
  SEQ.explore = false;
  UI.onExplore(false);
  if (resume) {
    SEQ.t = 0; pickAttachment(SHOTS[SEQ.idx], SEQ.world);
    const A = clonePose(currentPose);
    const plan = planMove('glide', A, SEQ.idx, { exit: 'push' }, SHOTS[SEQ.idx], 2.0);
    SEQ.tr = plan ? { from: SEQ.idx, to: SEQ.idx, t: 0, A, ...plan } : { from: SEQ.idx, to: SEQ.idx, type: 'focus', dur: 1.2, t: 0, A };
    onShotChange(true);
  }
}
function exploreCameraPose() {
  const dt = 1 / 60;
  const fwd = V3(-Math.sin(EXP.theta), 0, -Math.cos(EXP.theta)), right = V3(-fwd.z, 0, fwd.x);
  const sp = (EXP.keys.ShiftLeft || EXP.keys.ShiftRight ? 14 : 5) * dt;
  if (EXP.keys.KeyW || EXP.keys.ArrowUp) EXP.target.addScaledVector(fwd, sp);
  if (EXP.keys.KeyS || EXP.keys.ArrowDown) EXP.target.addScaledVector(fwd, -sp);
  if (EXP.keys.KeyA || EXP.keys.ArrowLeft) EXP.target.addScaledVector(right, -sp);
  if (EXP.keys.KeyD || EXP.keys.ArrowRight) EXP.target.addScaledVector(right, sp);
  if (EXP.keys.KeyQ) EXP.target.y -= sp; if (EXP.keys.KeyE && !EXP.eToggle) EXP.target.y += sp;
  EXP.target.x = clamp(EXP.target.x, -250, 250); EXP.target.z = clamp(EXP.target.z, -300, 250); EXP.target.y = clamp(EXP.target.y, 0.1, 160);
  EXP.phi = clamp(EXP.phi, 0.05, Math.PI - 0.08);
  const r = EXP.radius;
  const pos = V3(EXP.target.x + r * Math.sin(EXP.phi) * Math.sin(EXP.theta), EXP.target.y + r * Math.cos(EXP.phi), EXP.target.z + r * Math.sin(EXP.phi) * Math.cos(EXP.theta));
  pos.y = Math.max(pos.y, 0.12);
  const o = { pos, target: EXP.target.clone(), mm: EXP.mm || 28, T: 4, focus: r, exposure: 1, near: 0.08, rain: 1, reflPlane: 0, roll: 0 };
  o.quat = quatOf(o);
  return o;
}
