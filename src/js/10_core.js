import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

/* ============================================================
   Core: flags, quality, math, seeded randomness, geometry batching
   ============================================================ */

const QS = new URLSearchParams(location.search);
const TEST = QS.has('test');
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const QUALITY = (() => {
  const forced = QS.get('q');
  const small = Math.min(screen.width, screen.height) < 700;
  const name = forced || (IS_TOUCH || small ? 'low' : 'high');
  const presets = {
    low:  { name: 'low',  msaa: 0, refl: 0.33, maxDpr: 1.0,  shadow: 512,  atlas: 0.5, rain: 700, crowd: 0.65, dofSamples: 28 },
    med:  { name: 'med',  msaa: 2, refl: 0.42, maxDpr: 1.25, shadow: 1024, atlas: 1.0, rain: 1100, crowd: 0.85, dofSamples: 40 },
    high: { name: 'high', msaa: 4, refl: 0.5,  maxDpr: 1.5,  shadow: 1024, atlas: 1.0, rain: 1400, crowd: 1.0,  dofSamples: 48 },
  };
  return presets[name] || presets.high;
})();

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, x) => clamp((x - a) / (b - a), 0, 1);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t * t;
const fract = x => x - Math.floor(x);
const wrapAngle = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return s - Math.floor(s); }
function hash2(a, b) { return hash1(a * 57.31 + b * 113.97); }
function vnoise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash1(i), hash1(i + 1), u) * 2 - 1; }
function fbm1(x, oct = 3) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f + i * 13.7); a *= 0.5; f *= 2.03; } return s; }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RNG = mulberry32(20261004);
const reseed = s => { RNG = mulberry32(s >>> 0); };
const rnd = (a = 0, b = 1) => a + (b - a) * RNG();
const rndi = (a, b) => Math.floor(a + (b - a + 1) * RNG());
const pick = arr => arr[Math.floor(RNG() * arr.length)];
const chance = p => RNG() < p;
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(RNG() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const COL = hex => new THREE.Color(hex);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _e1 = new THREE.Euler();
const _c1 = new THREE.Color();
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);

// Matrix from position, yaw/pitch/roll (YXZ order) and scale.
function mat(px, py, pz, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e1.set(rx, ry, rz, 'YXZ');
  _q1.setFromEuler(_e1);
  return new THREE.Matrix4().compose(_v1.set(px, py, pz), _q1, _v2.set(sx, sy, sz));
}
// Box matrix by its min/max corners (axis aligned), optional yaw around its center.
function boxM(x0, y0, z0, x1, y1, z1, ry = 0) {
  return mat((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, ry, 0, 0, Math.abs(x1 - x0) || 1e-4, Math.abs(y1 - y0) || 1e-4, Math.abs(z1 - z0) || 1e-4);
}

/* ---------- unit geometries ---------- */
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1),
  cyl12: new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1),
  cyl16: new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1),
  cyl24: new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1),
  sph8: new THREE.SphereGeometry(0.5, 8, 6),
  sph12: new THREE.SphereGeometry(0.5, 12, 9),
  sph16: new THREE.SphereGeometry(0.5, 16, 12),
};
// Square pyramid, base 1x1 at y=-0.5, apex at y=+0.5.
G.pyr = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4);
// Box whose bottom sits on y=0 (handy for buildings and props).
G.boxB = G.box.clone().translate(0, 0.5, 0);
// Plane lying flat, facing up.
G.ground = G.plane.clone().rotateX(-Math.PI / 2);

function taperBox(wb, db, wt, dt, h, shiftZ = 0) {
  // Frustum-like box: bottom wb x db, top wt x dt (top shifted along z), flat normals.
  const b = [[-wb / 2, 0, -db / 2], [wb / 2, 0, -db / 2], [wb / 2, 0, db / 2], [-wb / 2, 0, db / 2]];
  const t = [[-wt / 2, h, -dt / 2 + shiftZ], [wt / 2, h, -dt / 2 + shiftZ], [wt / 2, h, dt / 2 + shiftZ], [-wt / 2, h, dt / 2 + shiftZ]];
  const quads = [
    [b[3], b[2], t[2], t[3]], // front (+z)
    [b[1], b[0], t[0], t[1]], // back
    [b[2], b[1], t[1], t[2]], // right (+x)
    [b[0], b[3], t[3], t[0]], // left
    [t[3], t[2], t[1], t[0]], // top
    [b[0], b[1], b[2], b[3]], // bottom
  ];
  const pos = [], uv = [];
  for (const q of quads) {
    const [a, bb, c, d] = q;
    pos.push(...a, ...bb, ...c, ...a, ...c, ...d);
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function lathe(profile, seg = 16) {
  return new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), seg);
}

/* ---------- batching: merge many transformed parts into one draw ---------- */
class Batch {
  constructor(material, opts = {}) {
    this.material = material;
    this.colors = !!opts.colors;
    this.parts = [];
    this.quads = [];
    this.name = opts.name || '';
  }
  add(geo, matrix, color, uvRect) {
    this.parts.push({ geo, matrix: matrix || null, color: color == null ? null : (color.isColor ? color.clone() : new THREE.Color(color)), uvRect: uvRect || null });
    return this;
  }
  // Quad from four world points (bottom-left, bottom-right, top-right, top-left as seen from the front).
  addQuad(p0, p1, p2, p3, uv, color) {
    this.quads.push({ p: [p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z], uv: uv || [0, 0, 1, 1], color: color == null ? null : (color.isColor ? color.clone() : new THREE.Color(color)) });
    return this;
  }
  get empty() { return this.parts.length === 0 && this.quads.length === 0; }
  build() {
    let nv = this.quads.length * 4, ni = this.quads.length * 6;
    for (const p of this.parts) {
      const g = p.geo;
      nv += g.attributes.position.count;
      ni += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const colr = this.colors ? new Float32Array(nv * 3) : null;
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const nm = new THREE.Matrix3(), v = new THREE.Vector3(), n = new THREE.Vector3();
    let vo = 0, io = 0;
    for (const p of this.parts) {
      const g = p.geo, P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv, C = g.attributes.color;
      if (p.matrix) nm.getNormalMatrix(p.matrix);
      const r = p.uvRect;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i); if (p.matrix) v.applyMatrix4(p.matrix);
        const k = (vo + i) * 3;
        pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
        if (N) { n.fromBufferAttribute(N, i); if (p.matrix) n.applyMatrix3(nm).normalize(); nor[k] = n.x; nor[k + 1] = n.y; nor[k + 2] = n.z; }
        if (UV) {
          let u = UV.getX(i), w = UV.getY(i);
          if (r) { u = r.u0 + u * (r.u1 - r.u0); w = r.v0 + w * (r.v1 - r.v0); }
          uv[(vo + i) * 2] = u; uv[(vo + i) * 2 + 1] = w;
        }
        if (colr) {
          let cr = 1, cg = 1, cb = 1;
          if (C) { cr = C.getX(i); cg = C.getY(i); cb = C.getZ(i); }
          if (p.color) { cr *= p.color.r; cg *= p.color.g; cb *= p.color.b; }
          colr[k] = cr; colr[k + 1] = cg; colr[k + 2] = cb;
        }
      }
      if (g.index) { const I = g.index.array; for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo; io += I.length; }
      else { for (let i = 0; i < P.count; i++) idx[io + i] = vo + i; io += P.count; }
      vo += P.count;
    }
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (const q of this.quads) {
      const P = q.p;
      e1.set(P[3] - P[0], P[4] - P[1], P[5] - P[2]); e2.set(P[9] - P[0], P[10] - P[1], P[11] - P[2]);
      n.crossVectors(e1, e2).normalize();
      const [u0, v0, u1, v1] = q.uv;
      const uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
      for (let k = 0; k < 4; k++) {
        const o = (vo + k) * 3;
        pos[o] = P[k * 3]; pos[o + 1] = P[k * 3 + 1]; pos[o + 2] = P[k * 3 + 2];
        nor[o] = n.x; nor[o + 1] = n.y; nor[o + 2] = n.z;
        uv[(vo + k) * 2] = uvs[k * 2]; uv[(vo + k) * 2 + 1] = uvs[k * 2 + 1];
        if (colr) { const c = q.color; colr[o] = c ? c.r : 1; colr[o + 1] = c ? c.g : 1; colr[o + 2] = c ? c.b : 1; }
      }
      idx[io] = vo; idx[io + 1] = vo + 1; idx[io + 2] = vo + 2; idx[io + 3] = vo; idx[io + 4] = vo + 2; idx[io + 5] = vo + 3;
      io += 6; vo += 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (colr) geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.name = this.name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}

// Spatially chunked batches so merged statics can still be frustum culled.
const ZONE_LEN = 48;
class BatchSet {
  constructor() { this.map = new Map(); }
  get(key, material, opts = {}, zone = 0) {
    const k = key + '|' + zone;
    let b = this.map.get(k);
    if (!b) { const o = { ...opts, colors: opts.colors || !!material.vertexColors }; b = new Batch(material, { ...o, name: k }); b.flags = o; this.map.set(k, b); }
    return b;
  }
  buildInto(parent) {
    const out = [];
    for (const b of this.map.values()) {
      if (b.empty) continue;
      const m = b.build();
      if (b.flags.castShadow) m.castShadow = true;
      if (b.flags.receiveShadow) m.receiveShadow = true;
      if (b.flags.noRefl) { m.layers.set(LAYER_NOREFL); }
      if (b.flags.renderOrder) m.renderOrder = b.flags.renderOrder;
      parent.add(m); out.push(m);
    }
    this.map.clear();
    return out;
  }
}
const zoneOf = z => Math.floor((z + 400) / ZONE_LEN);

// Object layers: 0 renders everywhere; NOREFL objects are skipped by the puddle reflection pass.
const LAYER_NOREFL = 1;

/* ---------- renderer ---------- */
const canvas = document.getElementById('view');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
} catch (e) {
  const f = document.getElementById('fatal');
  f.hidden = false;
  f.textContent = 'This experience needs WebGL 2, which this browser or device has turned off. Try a current Chrome, Edge, Firefox or Safari.';
  throw e;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = true;
renderer.info.autoReset = false;
renderer.setClearColor(0x000000, 1);
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 4000);
camera.filmGauge = 36;
camera.layers.enable(LAYER_NOREFL);
scene.add(camera);

// Every animated thing registers here; all of it is a pure function of world time.
const UPDATERS = [];
const onUpdate = fn => UPDATERS.push(fn);
