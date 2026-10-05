/* ============================================================
   The man under the sign. Built once, animated as a pure
   function of world time so every camera sees the same gesture.
   ============================================================ */

const HERO_YAW = Math.atan2(-0.33, -1.0); // facing down the street, turned a little toward the road
const HEROM = {};

function phys(params, opts) { return patchStd(new THREE.MeshPhysicalMaterial(params), opts); }

// Hair: fine strands running from the crown, as colour and as a normal map.
function paintHair() {
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d'), r = mulberry32(1717), Hh = new Float32Array(S * S);
  g.fillStyle = '#1a1410'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const x0 = r() * S, y0 = r() * S * 0.4, len = S * (0.35 + r() * 0.65), slope = (r() - 0.5) * 0.25, light = r() < 0.5;
    g.strokeStyle = light ? `rgba(92,72,56,${0.08 + r() * 0.16})` : `rgba(6,4,3,${0.15 + r() * 0.2})`;
    g.lineWidth = 0.6 + r() * 0.8; g.beginPath(); g.moveTo(x0, y0);
    for (let k = 1; k <= 6; k++) g.lineTo(x0 + slope * len * k / 6 + Math.sin(k + x0) * 1.2, y0 + len * k / 6);
    g.stroke();
    for (let k = 0; k < len; k += 1) { const x = ((Math.round(x0 + slope * k) % S) + S) % S, y = Math.round(y0 + k) % S; Hh[y * S + x] += light ? 0.5 : -0.3; }
  }
  return { map: canvasTex(c, { repeat: true }), normal: canvasTex(normalFromHeight(Hh, S, 0.6), { srgb: false, repeat: true }) };
}

function paintFabric() {
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
  const H = new Float32Array(S * S), r = mulberry32(808);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const w = Math.sin(x * 0.9) * 0.5 + Math.sin(y * 0.9) * 0.5;
    H[y * S + x] = w * 0.3 + r() * 0.25;
  }
  return canvasTex(normalFromHeight(H, S, 1.2), { srgb: false, repeat: true });
}

// Head proportions in body units: half width, half height (chin to crown 0.246), half depth.
const HEAD = { rx: 0.081, ry: 0.123, rz: 0.1 };
// The skull for a unit-sphere direction, centred on the eye line: the jaw narrows below the cheekbones.
function skullAt(v, out) {
  const y = v.y * HEAD.ry, low = sstep(0.02, -0.11, y);
  return out.set(v.x * HEAD.rx * (1 - 0.28 * low), y, v.z * HEAD.rz * (v.z < 0 ? 1.06 * (1 - 0.26 * low) : 1 - 0.12 * low));
}

// A sculpted head: skull and jaw, brow, eye sockets, nose, cheekbones, lips and chin. Chin at y = 0.
function heroHeadGeometry() {
  const g = new THREE.SphereGeometry(1, 56, 40), p = g.attributes.position, v = new THREE.Vector3(), q = new THREE.Vector3();
  const bump = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    skullAt(v, q);
    if (v.z > 0) {
      const x = q.x, y = q.y;
      let dz = 0.005 * bump(x, y, 0, 0.022, 0.055, 0.012);
      dz -= 0.006 * (bump(x, y, 0.031, 0.002, 0.017, 0.011) + bump(x, y, -0.031, 0.002, 0.017, 0.011));
      dz += 0.016 * bump(x, y, 0, -0.012, 0.008, 0.03) * sstep(0.015, -0.035, y);
      dz += 0.006 * bump(x, y, 0, -0.036, 0.012, 0.008) + 0.004 * (bump(x, y, 0.013, -0.038, 0.007, 0.006) + bump(x, y, -0.013, -0.038, 0.007, 0.006));
      dz += 0.004 * (bump(x, y, 0.045, -0.012, 0.02, 0.018) + bump(x, y, -0.045, -0.012, 0.02, 0.018));
      dz += 0.004 * bump(x, y, 0, -0.056, 0.018, 0.006) + 0.003 * bump(x, y, 0, -0.066, 0.016, 0.005) - 0.002 * bump(x, y, 0, -0.061, 0.02, 0.002);
      dz += 0.006 * bump(x, y, 0, -0.1, 0.02, 0.014);
      q.z += dz * Math.sqrt(v.z);
    }
    p.setXYZ(i, q.x, q.y + HEAD.ry, q.z);
  }
  g.computeVertexNormals();
  return g;
}

// Where his hair ends, in head units above the eye line, by angle around the head (0 = the face).
function hairLine(ang) {
  const a = Math.abs(ang) / Math.PI;
  let line = a < 0.16 ? lerp(0.074, 0.062, a / 0.16) : a < 0.42 ? lerp(0.062, 0.01, (a - 0.16) / 0.26) : lerp(0.01, -0.072, (a - 0.42) / 0.58);
  if (ang > 0 && a < 0.2) line -= 0.014 * (1 - a / 0.2);    // the fringe falls lower on one side
  return line;
}

// Short hair as a shell over the skull, folded up onto that hairline.
function heroHairGeometry() {
  const g = new THREE.SphereGeometry(1, 56, 36, 0, TAU, 0, Math.PI * 0.82), p = g.attributes.position, v = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ang = Math.atan2(v.x, v.z), yu = hairLine(ang) / HEAD.ry;
    if (v.y < yu) { const k = Math.sqrt(Math.max(0, 1 - yu * yu)) / Math.max(1e-6, Math.hypot(v.x, v.z)); v.set(v.x * k, yu, v.z * k); }
    skullAt(v, q);
    const t = 0.005 + 0.013 * sstep(0.0, HEAD.ry, q.y) + (ang > 0 ? 0.003 : 0) * sstep(0.02, 0.1, q.y);   // fuller on top, a side part
    q.multiplyScalar(1 + t / Math.max(0.05, q.length()));
    p.setXYZ(i, q.x, q.y + HEAD.ry, q.z);
  }
  g.computeVertexNormals();
  return g;
}

// The face, painted for the sphere's UVs (u = 0.25 faces forward). Features are placed in head units
// (x across, y up from the eye line) and mapped through the same jaw narrowing as the geometry.
function paintFace() {
  const W = 1024, H = 512, c = makeCanvas(W, H), g = c.getContext('2d');
  const P = (X, Y) => {
    const low = sstep(0.02, -0.11, Y), yu = clamp(Y / HEAD.ry, -0.999, 0.999), s = Math.sqrt(1 - yu * yu);
    const xu = X / (HEAD.rx * (1 - 0.28 * low));
    return [Math.acos(clamp(-xu / s, -1, 1)) / TAU * W, Math.acos(yu) / Math.PI * H];
  };
  const path = pts => { g.beginPath(); pts.forEach(([X, Y], i) => { const [u, v] = P(X, Y); i ? g.lineTo(u, v) : g.moveTo(u, v); }); };
  const curve = (f, a, b, n = 24) => { const o = []; for (let i = 0; i <= n; i++) o.push(f(lerp(a, b, i / n))); return o; };
  const blob = (X, Y, rx, ry, rgb, a) => {
    const [u, v] = P(X, Y), [u2] = P(X + rx, Y), [, v2] = P(X, Y + ry);
    g.save(); g.translate(u, v); g.scale(Math.max(1, Math.abs(u2 - u)), Math.max(1, Math.abs(v2 - v)));
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore();
  };
  g.fillStyle = '#b3896f'; g.fillRect(0, 0, W, H);
  blob(0, 0.06, 0.06, 0.05, '206,166,140', 0.35);
  for (const s of [-1, 1]) { blob(s * 0.045, -0.025, 0.03, 0.025, '190,105,90', 0.2); blob(s * 0.031, 0.004, 0.024, 0.014, '95,62,58', 0.35); }
  blob(0, -0.036, 0.012, 0.01, '190,110,95', 0.22);
  for (let Y = -0.05; Y > -0.125; Y -= 0.006) for (const s of [-1, 1]) blob(s * 0.04 * (1 + Y * 2), Y, 0.035, 0.012, '72,64,68', 0.06);
  blob(0, -0.051, 0.022, 0.006, '72,64,68', 0.12);
  for (const s of [-1, 1]) {
    const cx = s * 0.031, w = 0.0115;
    const up = t => [cx + t * w, 0.0035 * Math.cos(t * Math.PI / 2) + 0.0005], dn = t => [cx + t * w, -0.0028 * Math.cos(t * Math.PI / 2)];
    const eye = () => { path([...curve(up, -1, 1), ...curve(dn, 1, -1)]); g.closePath(); };
    eye(); g.fillStyle = '#e2d8ce'; g.fill();
    g.save(); eye(); g.clip();
    const [u, v] = P(cx, 0.0004), [u2] = P(cx + 0.0045, 0.0004), r = Math.abs(u2 - u);
    g.fillStyle = '#2b1c14'; g.beginPath(); g.arc(u, v, r, 0, TAU); g.fill();
    g.fillStyle = '#0c0807'; g.beginPath(); g.arc(u, v, r * 0.45, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(u - r * 0.3, v - r * 0.3, Math.max(1.2, r * 0.18), 0, TAU); g.fill();
    g.fillStyle = 'rgba(60,35,30,0.35)'; g.fillRect(u - 40, v - 20, 80, 8);
    g.restore();
    path(curve(up, -1.08, 1.02)); g.strokeStyle = '#1a110c'; g.lineWidth = 3.2; g.lineCap = 'round'; g.stroke();
    path(curve(dn, -0.9, 0.9)); g.strokeStyle = 'rgba(80,50,40,0.55)'; g.lineWidth = 1.4; g.stroke();
    path(curve(t => [cx + t * 0.0125, 0.0075 + 0.0012 * Math.cos(t * Math.PI / 2)], -1, 1)); g.strokeStyle = 'rgba(90,55,45,0.35)'; g.lineWidth = 1.5; g.stroke();
    path(curve(t => [s * (0.016 + t * 0.034), 0.0165 + 0.005 * Math.sin(Math.PI * Math.min(1, t * 1.3)) - 0.002 * t], 0, 1)); g.strokeStyle = '#1b1410'; g.lineWidth = 7; g.stroke();
  }
  for (const s of [-1, 1]) { const [u, v] = P(s * 0.0085, -0.0405); g.fillStyle = 'rgba(60,32,28,0.75)'; g.beginPath(); g.ellipse(u, v, 4.5, 2.6, s * 0.4, 0, TAU); g.fill(); }
  blob(-0.009, -0.015, 0.004, 0.022, '110,70,60', 0.28);
  path([...curve(t => [t * 0.022, -0.0585 + 0.0022 * Math.abs(Math.sin(t * Math.PI)) - 0.001 * (1 - t * t)], -1, 1), ...curve(t => [t * 0.019, -0.061], 1, -1)]); g.closePath(); g.fillStyle = '#93594f'; g.fill();
  path([...curve(t => [t * 0.019, -0.0615], -1, 1), ...curve(t => [t * 0.017, -0.0685 + 0.002 * t * t], 1, -1)]); g.closePath(); g.fillStyle = '#a2665a'; g.fill();
  path(curve(t => [t * 0.022, -0.061 - 0.0006 * t * t], -1, 1)); g.strokeStyle = '#4e2e28'; g.lineWidth = 2; g.stroke();
  // hair colour just inside the shell's hairline, so no scalp shows at its edge
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let py = 0; py < H; py++) {
    const th = (py + 0.5) / H * Math.PI, Y = Math.cos(th) * HEAD.ry, st = Math.sin(th);
    for (let px = 0; px < W; px++) {
      const ph = (px + 0.5) / W * TAU, k = sstep(-0.004, 0.003, Y - hairLine(Math.atan2(-Math.cos(ph) * st, Math.sin(ph) * st)));
      if (k <= 0) continue;
      const i = (py * W + px) * 4;
      d[i] = lerp(d[i], 22, k); d[i + 1] = lerp(d[i + 1], 17, k); d[i + 2] = lerp(d[i + 2], 14, k);
    }
  }
  g.putImageData(img, 0, 0);
  return canvasTex(c);
}

function buildHero() {
  const root = new THREE.Group();
  root.position.copy(HERO);
  root.rotation.y = HERO_YAW;
  scene.add(root);
  const S = 0.955; // overall scale to about 1.78 m
  const body = new THREE.Group(); body.scale.setScalar(S); root.add(body);
  const fabricN = paintFabric();
  fabricN.repeat.set(9, 9);
  const faceTex = paintFace(), hairTex = paintHair();
  const mat_ = {
    coat: phys({ color: 0x2a2f36, roughness: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.4, normalMap: fabricN, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.0 }, { lfHeight: 0.15, lfStrength: 1.8 }),
    trousers: std({ color: 0x1a1e27, roughness: 0.82, normalMap: fabricN, normalScale: new THREE.Vector2(0.3, 0.3) }, { lfHeight: 0.15, lfStrength: 1.8 }),
    shoe: std({ color: 0xebeae4, roughness: 0.62, envMapIntensity: 0.7 }, { lfHeight: 0.15, lfStrength: 1.8 }),
    sole: std({ color: 0xcfccc4, roughness: 0.7 }),
    skin: std({ color: 0xbf9a80, roughness: 0.58, envMapIntensity: 0.45 }, { lfHeight: 0.15, lfStrength: 1.6 }),
    face: std({ map: faceTex, roughness: 0.55, envMapIntensity: 0.45 }, { lfHeight: 0.15, lfStrength: 1.6 }),
    hair: std({ map: hairTex.map, normalMap: hairTex.normal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.56, envMapIntensity: 0.55 }, { lfHeight: 0.15, lfStrength: 1.4 }),
    knit: std({ color: 0x1c1e24, roughness: 0.95, envMapIntensity: 0.3, normalMap: fabricN, normalScale: new THREE.Vector2(0.6, 0.6) }, { lfHeight: 0.15, lfStrength: 1.8 }),
    dark: std({ color: 0x0e0e10, roughness: 0.3, metalness: 0.5, envMapIntensity: 1.2 }),
    lens: std({ color: 0x0a0c10, roughness: 0.03, transparent: true, opacity: 0.12, premultipliedAlpha: true, depthWrite: false, envMapIntensity: 2.0 }, { glass: { spec: 1.0 }, lf: false }),
    screen: basic({ color: hdr(1.9, 2.0, 2.3) }),
    vinyl: std({ color: 0xeef3f6, roughness: 0.15, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.5 }, { lf: false }),
    button: std({ color: 0x0c0c0d, roughness: 0.35 }),
    frame: std({ color: 0x0d0d0e, roughness: 0.38, metalness: 0.0, envMapIntensity: 0.3 }),
  };
  HEROM.mat = mat_;
  const add = (parent, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };

  // legs and shoes
  const legs = new THREE.Group(); body.add(legs);
  for (const s of [-1, 1]) {
    add(legs, new THREE.CylinderGeometry(0.062, 0.05, 0.5, 10), mat_.trousers, s * 0.1, 0.32, 0.0, 0, 0, s * -0.02);
    add(legs, new THREE.CylinderGeometry(0.075, 0.064, 0.42, 10), mat_.trousers, s * 0.1, 0.74, 0.0);
    const shoe = new THREE.Group(); shoe.position.set(s * 0.105, 0.0, 0.03); shoe.rotation.y = s * 0.12; legs.add(shoe);
    add(shoe, new THREE.BoxGeometry(0.1, 0.07, 0.24), mat_.shoe, 0, 0.055, 0.0);
    add(shoe, new THREE.SphereGeometry(0.06, 10, 8).scale(0.85, 0.6, 1.0), mat_.shoe, 0, 0.05, 0.11);
    add(shoe, new THREE.BoxGeometry(0.106, 0.025, 0.28), mat_.sole, 0, 0.0125, 0.015);
  }
  // coat: an A-line lathe from the knee to the collar
  const torso = new THREE.Group(); torso.position.y = 0.95; body.add(torso);
  const prof = [[0.27, -0.43], [0.258, -0.3], [0.238, -0.12], [0.214, 0.03], [0.222, 0.17], [0.244, 0.33], [0.25, 0.43], [0.242, 0.49], [0.205, 0.535], [0.12, 0.565], [0.085, 0.575]];
  const coatGeo = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 28).scale(1, 1, 0.64);
  const coat = add(torso, coatGeo, mat_.coat); coat.material.side = THREE.DoubleSide;
  HEROM.coat = coat;
  add(torso, new THREE.CylinderGeometry(0.068, 0.118, 0.1, 36, 1, true, 0.45, TAU - 0.9).scale(1, 1, 0.86), mat_.coat, 0, 0.61, 0.0);
  // buttons down the front, pocket flaps, a belt line
  const zAt = y => { let r = 0.24; for (let i = 0; i < prof.length - 1; i++) if (y >= prof[i][1] && y <= prof[i + 1][1]) { const t = (y - prof[i][1]) / (prof[i + 1][1] - prof[i][1]); r = lerp(prof[i][0], prof[i + 1][0], t); } return r * 0.64; };
  for (let y = -0.32; y < 0.42; y += 0.13) add(torso, new THREE.CylinderGeometry(0.011, 0.011, 0.008, 10).rotateX(Math.PI / 2), mat_.button, 0.02, y, zAt(y) + 0.004);
  for (const s of [-1, 1]) add(torso, new THREE.BoxGeometry(0.14, 0.05, 0.012), mat_.coat, s * 0.13, -0.08, zAt(-0.08) - 0.006, -0.12, s * 0.35, 0);
  add(torso, new THREE.BoxGeometry(0.004, 0.86, 0.004), mat_.button, 0.035, 0.0, zAt(0) + 0.002);
  const rAt = y => zAt(y) / 0.64;
  const surf = (x, y, lift) => V3(x, y, 0.64 * rAt(y) * Math.sqrt(Math.max(0, 1 - (x / rAt(y)) ** 2)) + lift);
  for (const s of [-1, 1]) {
    // lapel: wide at the collar, narrowing to the top button
    const A = surf(s * 0.036, 0.57, 0.016), B = surf(s * 0.108, 0.545, 0.012), C = surf(s * 0.075, 0.46, 0.008), D = surf(s * 0.02, 0.37, 0.006);
    const lg = new THREE.BufferGeometry().setFromPoints(s > 0 ? [A, D, C, A, C, B] : [A, C, D, A, B, C]);
    lg.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(12), 2)); lg.computeVertexNormals();
    add(torso, lg, mat_.coat);
    add(torso, new THREE.BoxGeometry(0.09, 0.008, 0.045), mat_.coat, s * 0.16, 0.556, -0.004, 0, 0, -s * 0.34);
    add(torso, new THREE.CylinderGeometry(0.006, 0.006, 0.005, 8).rotateZ(-s * 0.34), mat_.button, s * 0.125, 0.566, -0.004);
  }
  add(torso, new THREE.CylinderGeometry(0.219, 0.2185, 0.048, 44, 1, true).scale(1, 1, 0.64), mat_.coat, 0, 0.03, 0);
  add(torso, new THREE.BoxGeometry(0.05, 0.042, 0.008), mat_.button, 0.035, 0.03, zAt(0.03) + 0.008);
  add(torso, new THREE.BoxGeometry(0.032, 0.13, 0.005), mat_.coat, 0.075, -0.03, zAt(-0.03) + 0.008, 0.05, 0.2, 0.12);
  // head: sculpted, at true scale, with ears, a hair shell and thin black glasses
  const neck = new THREE.Group(); neck.position.y = 0.62; torso.add(neck);
  add(neck, new THREE.CylinderGeometry(0.046, 0.054, 0.17, 14), mat_.skin, 0, 0.03, 0.006);
  add(neck, new THREE.CylinderGeometry(0.056, 0.061, 0.075, 20), mat_.knit, 0, -0.005, 0.008);   // a dark knit turtleneck under the coat
  const head = new THREE.Group(); head.position.set(0, 0.03, 0.012); neck.add(head);
  HEROM.head = head;
  add(head, heroHeadGeometry(), mat_.face);
  for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(1, 14, 10).scale(0.007, 0.026, 0.016), mat_.skin, s * 0.077, HEAD.ry + 0.002, -0.008, 0, s * 0.38, 0);
  add(head, heroHairGeometry(), mat_.hair);
  const gl = new THREE.Group(); gl.position.set(0, HEAD.ry + 0.004, 0.104); head.add(gl);
  for (const s of [-1, 1]) {
    for (const [w, h, x, y] of [[0.046, 0.0028, 0, 0.0125], [0.046, 0.0022, 0, -0.0125], [0.0026, 0.027, -0.023, 0], [0.0026, 0.027, 0.023, 0]]) add(gl, new THREE.BoxGeometry(w, h, 0.003), mat_.frame, s * 0.031 + x, y, 0);
    add(gl, new THREE.PlaneGeometry(0.044, 0.024), mat_.lens, s * 0.031, 0, -0.001);
    const e0 = V3(s * 0.055, 0.008, -0.002), e1 = V3(s * 0.08, 0.004, -0.1), mid = e0.clone().add(e1).multiplyScalar(0.5);
    add(gl, new THREE.BoxGeometry(0.0028, 0.0028, e0.distanceTo(e1)), mat_.frame, mid.x, mid.y, mid.z, 0, Math.atan2(e1.x - e0.x, e1.z - e0.z), 0);
  }
  add(gl, new THREE.BoxGeometry(0.016, 0.003, 0.003), mat_.frame, 0, 0.005, 0.001);
  // arms: right holds the phone, left the folded umbrella
  const arm = (s) => {
    const sh = new THREE.Group(); sh.position.set(s * 0.205, 0.47, -0.005); torso.add(sh);
    add(sh, new THREE.CylinderGeometry(0.058, 0.05, 0.3, 12).translate(0, -0.15, 0), mat_.coat);
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    add(el, new THREE.CylinderGeometry(0.05, 0.046, 0.27, 12).translate(0, -0.135, 0), mat_.coat);
    add(el, new THREE.CylinderGeometry(0.047, 0.047, 0.03, 12), mat_.trousers, 0, -0.26, 0);
    add(el, new THREE.CylinderGeometry(0.053, 0.053, 0.022, 14), mat_.coat, 0, -0.228, 0);
    const hand = new THREE.Group(); hand.position.y = -0.285; el.add(hand);
    add(hand, new THREE.SphereGeometry(1, 14, 10).scale(0.037, 0.05, 0.019).translate(0, -0.045, 0), mat_.skin);
    add(hand, new THREE.SphereGeometry(1, 12, 8).scale(0.035, 0.03, 0.017).translate(0, -0.088, 0.006), mat_.skin);
    add(hand, new THREE.CylinderGeometry(0.011, 0.01, 0.048, 8).translate(0, -0.024, 0), mat_.skin, s * -0.033, -0.022, 0.012, 0.3, 0, s * 0.5);
    return { sh, el, hand };
  };
  const R = arm(-1), L = arm(1);
  HEROM.R = R; HEROM.L = L;
  // phone in the right hand, screen toward his face
  const phone = new THREE.Group(); phone.position.set(0.0, -0.075, 0.02); R.hand.add(phone);
  add(phone, new THREE.BoxGeometry(0.072, 0.148, 0.008), mat_.dark);
  const scr = add(phone, new THREE.PlaneGeometry(0.064, 0.138), mat_.screen, 0, 0, 0.0045);
  scr.castShadow = false;
  HEROM.phone = phone; HEROM.screen = scr;
  // folded clear umbrella in the left hand, tip on the pavement
  const umb = new THREE.Group(); umb.position.set(0, -0.06, 0.0); L.hand.add(umb);
  add(umb, new THREE.TorusGeometry(0.045, 0.009, 6, 16, Math.PI), mat_.dark, 0.045, 0.02, 0, 0, 0, Math.PI);
  add(umb, new THREE.CylinderGeometry(0.007, 0.007, 0.86, 6).translate(0, -0.43, 0), mat_.dark);
  add(umb, new THREE.CylinderGeometry(0.035, 0.012, 0.6, 10).translate(0, -0.52, 0), mat_.vinyl).castShadow = false;
  add(umb, new THREE.CylinderGeometry(0.004, 0.006, 0.05, 6).translate(0, -0.88, 0), mat_.dark);
  HEROM.umb = umb;
  HEROM.root = root; HEROM.body = body; HEROM.torso = torso; HEROM.neck = neck;
  mergeParts(root, new Set([scr]));
  return root;
}

// Fold each group's same-material parts into one mesh, so buttons, frames and straps cost a few draws, not dozens.
function mergeParts(obj, keep) {
  for (const child of [...obj.children]) if (child.children.length) mergeParts(child, keep);
  const byMat = new Map();
  for (const m of obj.children) if (m.isMesh && !m.children.length && !keep.has(m)) { if (!byMat.has(m.material)) byMat.set(m.material, []); byMat.get(m.material).push(m); }
  for (const [mtl, list] of byMat) {
    if (list.length < 2) continue;
    const b = new Batch(mtl);
    for (const m of list) { m.updateMatrix(); b.add(m.geometry, m.matrix.clone()); obj.remove(m); }
    const merged = b.build();
    merged.matrixAutoUpdate = true; merged.castShadow = true; merged.receiveShadow = true;
    obj.add(merged);
  }
}

// What he does, second by second (48 s rhythm with reactions to passing taxis).
function heroPose(T) {
  const c = ((T % 48) + 48) % 48;
  let headYaw = 0.04, headPitch = 0.5, phoneUp = 1, look = 'phone';
  const blend = (a, b, x) => lerp(a, b, sstep(0, 1, x));
  if (c > 13.5 && c < 19) { const k = sstep(13.5, 14.5, c) * (1 - sstep(18, 19, c)); headPitch = blend(0.5, -0.03, k); headYaw = lerp(0.04, 0.12, k); phoneUp = 1 - 0.55 * k; look = 'street'; }
  else if (c > 29.5 && c < 33.5) { const k = sstep(29.5, 30.6, c) * (1 - sstep(32.5, 33.5, c)); headPitch = blend(0.5, -0.42, k); headYaw = lerp(0.04, -0.1, k); phoneUp = 1 - 0.6 * k; look = 'sky'; }
  else if (c > 43.5 && c < 47.6) { const k = sstep(43.5, 44.4, c) * (1 - sstep(46.8, 47.6, c)); headPitch = blend(0.5, 0.02, k); headYaw = lerp(0.04, -0.75, k); phoneUp = 1 - 0.4 * k; look = 'over'; }
  // a taxi passing on his side of the road catches his eye
  const tx = HERO_TAXI_GLANCE.value;
  if (tx) { headYaw = lerp(headYaw, tx.yaw, tx.k); headPitch = lerp(headPitch, 0.0, tx.k * 0.8); phoneUp = lerp(phoneUp, 0.55, tx.k); }
  return { headYaw, headPitch, phoneUp, look, breath: Math.sin(T * 1.45), sway: Math.sin(T * 0.7) * 0.6 + Math.sin(T * 0.23) * 0.4, scroll: Math.sin(T * 3.1) * (c % 6 < 0.5 ? 1 : 0) };
}
const HERO_TAXI_GLANCE = { value: null };

function updateHero(T) {
  const p = heroPose(T);
  HEROM.body.rotation.z = 0.012 * p.sway;
  HEROM.body.rotation.x = 0.006 * Math.sin(T * 0.5);
  HEROM.torso.scale.set(1 + 0.008 * p.breath, 1, 1 + 0.012 * p.breath);
  HEROM.neck.rotation.set(p.headPitch * 0.3, p.headYaw * 0.3, 0);
  HEROM.head.rotation.set(p.headPitch * 0.7, p.headYaw * 0.7, 0.02 * p.sway);
  // right arm brings the phone up toward his chest
  const u = p.phoneUp;
  HEROM.R.sh.rotation.set(lerp(-0.05, -0.42, u), 0, lerp(0.06, -0.28, u));
  HEROM.R.el.rotation.set(lerp(-0.25, -1.75, u), lerp(0, 0.35, u), 0);
  HEROM.R.hand.rotation.set(lerp(0, 0.35, u) + 0.03 * p.scroll, 0, lerp(0, 0.2, u));
  HEROM.L.sh.rotation.set(0.04 + 0.01 * p.sway, 0, 0.05);
  HEROM.L.el.rotation.set(-0.1, 0, 0);
  HEROM.L.hand.rotation.set(0.04, 0, -0.04);
  HEROM.umb.rotation.set(-0.03, 0, 0.05 - 0.01 * p.sway);
  // screen glow lights his face
  const glow = 0.85 + 0.15 * Math.sin(T * 0.9) + 0.05 * p.scroll;
  HEROM.mat.screen.color.setRGB(1.9 * glow * (0.35 + 0.65 * u), 2.0 * glow * (0.35 + 0.65 * u), 2.3 * glow * (0.35 + 0.65 * u));
  if (LIGHTS.phone) {
    HEROM.screen.getWorldPosition(LIGHTS.phone.position);
    LIGHTS.phone.position.add(_v1.set(0, 0.04, 0));
    LIGHTS.phone.intensity = LIGHTS.phone.userData.base * glow * (0.2 + 0.8 * u);
  }
  HEROM.head.getWorldPosition(HERO_HEAD); HERO_HEAD.y += 0.15;
  HEROM.torso.getWorldPosition(HERO_CHEST); HERO_CHEST.y += 0.38;
}
