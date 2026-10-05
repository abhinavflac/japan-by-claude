/* ============================================================
   Light: the baked street light field (+ sky visibility), the
   handful of real lights, and the environment capture
   ============================================================ */

const LF_EMITTERS = [];
function addLight2D(x, z, r, color, k) { LF_EMITTERS.push({ x, z, r, color, k }); }
const LF_W = 512, LF_H = 1024;
function lfPx(x, z) { const R = U.uLFRect.value; return [(x - R.x) / R.z * LF_W, (z - R.y) / R.w * LF_H]; }

function bakeLightField() {
  const R = U.uLFRect.value;
  const c = makeCanvas(LF_W, LF_H), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, LF_W, LF_H);
  g.globalCompositeOperation = 'lighter';
  const sx = LF_W / R.z, sz = LF_H / R.w;
  for (const e of LF_EMITTERS) {
    const [px, py] = lfPx(e.x, e.z);
    const col = new THREE.Color(e.color);
    const k = clamp(e.k, 0, 1.6);
    const rr = Math.round(col.r * 255), gg = Math.round(col.g * 255), bb = Math.round(col.b * 255);
    // stretch the gradient to the anisotropic texel scale
    g.save(); g.translate(px, py); g.scale(e.r * sx, e.r * sz);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    grd.addColorStop(0, `rgba(${rr},${gg},${bb},${0.55 * k})`);
    grd.addColorStop(0.35, `rgba(${rr},${gg},${bb},${0.28 * k})`);
    grd.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
    g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill();
    g.restore();
  }
  // sky visibility: black where something covers the ground
  const m = makeCanvas(LF_W, LF_H), mg = m.getContext('2d');
  mg.fillStyle = '#fff'; mg.fillRect(0, 0, LF_W, LF_H); mg.fillStyle = '#000';
  const rectZ = (x0, z0, x1, z1, fill = '#000') => { const [a, b] = lfPx(x0, z0), [c2, d] = lfPx(x1, z1); mg.fillStyle = fill; mg.fillRect(Math.min(a, c2), Math.min(b, d), Math.abs(c2 - a), Math.abs(d - b)); };
  for (const b of MAP_BLOCKS) { if (b.lot || b.shrine) continue; rectZ(b.x0, b.z0, b.x1, b.z1, b.alley ? '#9a9a9a' : '#000'); }
  for (const a of COVERS) rectZ(a.x0, a.z0, a.x1, a.z1, '#202020');
  // combine into one RGBA texture: rgb light (sqrt encoded), a = sky visibility
  const li = g.getImageData(0, 0, LF_W, LF_H).data, mi = mg.getImageData(0, 0, LF_W, LF_H).data;
  const data = new Uint8Array(LF_W * LF_H * 4);
  for (let i = 0; i < LF_W * LF_H; i++) {
    data[i * 4] = Math.sqrt(li[i * 4] / 255) * 255;
    data[i * 4 + 1] = Math.sqrt(li[i * 4 + 1] / 255) * 255;
    data[i * 4 + 2] = Math.sqrt(li[i * 4 + 2] / 255) * 255;
    data[i * 4 + 3] = mi[i * 4];
  }
  const t = new THREE.DataTexture(data, LF_W, LF_H, THREE.RGBAFormat);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  U.uLF.value = t;
  LF_CANVAS = c;
}
let LF_CANVAS = null;
const COVERS = []; // awnings and eaves keep the pavement below them dry

/* ---------- the afternoon sun: 14:42, south-west, 33 degrees up ---------- */
const SUN = { dir: new THREE.Vector3(-0.539, 0.545, -0.642).normalize() };

// For each point of the plan, the height below which a block hides the sun (read by SUN_PARS). A block is a
// prism: the ray toward the sun enters its footprint at t and is still under the roof there if y + sy * t < h.
// Raised slabs (the viaduct deck, the arch) count only where their shadow reaches the ground.
function bakeSunMap() {
  const R = U.uSunRect.value, N = QUALITY.name === 'low' ? 1024 : 2048, d = SUN.dir;
  const occ = MAP_BLOCKS.filter(b => b.h > 0 && !b.rail).map(b => [b.x0, b.z0, b.x1, b.z1, 0, b.h]);
  occ.push([-420, VIADUCT.z0, 420, VIADUCT.z1, VIADUCT.deckBottom, VIADUCT.deckTop + 1.1], [-6.1, 37.9, 6.1, 38.5, 6.4, 7.95]);
  const pos = [], box = [], ys = [], idx = [];
  occ.forEach(([x0, z0, x1, z1, y0, y1], i) => {
    const ex = -d.x / d.y * y1, ez = -d.z / d.y * y1;   // the farthest the roof edge throws its shadow
    const qx0 = Math.min(x0, x0 + ex), qx1 = Math.max(x1, x1 + ex), qz0 = Math.min(z0, z0 + ez), qz1 = Math.max(z1, z1 + ez);
    for (const [x, z] of [[qx0, qz0], [qx1, qz0], [qx1, qz1], [qx0, qz1]]) { pos.push(x, 0, z); box.push(x0, z0, x1, z1); ys.push(y0, y1); }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBox', new THREE.Float32BufferAttribute(box, 4));
  g.setAttribute('aY', new THREE.Float32BufferAttribute(ys, 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: { uRect: { value: R }, uDir: { value: d } },
    vertexShader: /* glsl */`
      uniform vec4 uRect; attribute vec4 aBox; attribute vec2 aY; varying vec2 vP; varying vec4 vBox; varying vec2 vY;
      void main(){ vP = position.xz; vBox = aBox; vY = aY; gl_Position = vec4((position.xz - uRect.xy) / uRect.zw * 2.0 - 1.0, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uDir; varying vec2 vP; varying vec4 vBox; varying vec2 vY;
      void main(){
        vec2 t0 = (vBox.xy - vP) / uDir.xz, t1 = (vBox.zw - vP) / uDir.xz;
        vec2 tn = min(t0, t1), tf = max(t0, t1);
        float tin = max(max(tn.x, tn.y), 0.0), tout = min(tf.x, tf.y);
        if (tout < tin || vY.x - uDir.y * tout > 0.2) discard;
        gl_FragColor = vec4(vY.y - uDir.y * tin, 0.0, 0.0, 1.0);
      }`,
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false, depthWrite: false,
  }));
  m.frustumCulled = false;
  const rt = new THREE.WebGLRenderTarget(N, N, { type: THREE.HalfFloatType, format: THREE.RedFormat, depthBuffer: false });
  renderer.setRenderTarget(rt); renderer.clear(); renderer.render(m, FSQ.cam); renderer.setRenderTarget(null);
  g.dispose(); m.material.dispose();
  U.uSunH.value = rt.texture; SUN.rt = rt;
}

/* ---------- real lights (a fixed set, so shaders never recompile) ---------- */
const LIGHTS = {};
function buildLights() {
  const hemi = new THREE.HemisphereLight(0x3d5793, 0x0e0c0a, 2.8);
  scene.add(hemi);
  LIGHTS.hemi = hemi;
  // the moon, and by day the sun; it casts shadows in both so switching never recompiles a shader
  const moon = new THREE.DirectionalLight(0x8090c0, 0.12);
  moon.position.set(-40, 80, -60);
  moon.castShadow = true;
  moon.shadow.mapSize.set(QUALITY.shadow * 2, QUALITY.shadow * 2);
  moon.shadow.camera.near = 1; moon.shadow.camera.far = 400;
  moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.03; moon.shadow.radius = 2;
  moon.shadow.intensity = 0; moon.shadow.autoUpdate = false; moon.shadow.needsUpdate = true;
  scene.add(moon, moon.target);
  LIGHTS.sun = moon;
  // the sign above him: warm, from above, the only shadow caster
  const spot = new THREE.SpotLight(0xffb878, 34, 10, 0.95, 0.85, 2);
  spot.position.set(5.32, 3.62, 0.05);
  spot.target.position.set(5.0, 0.15, 0.3);
  spot.castShadow = true;
  spot.shadow.mapSize.set(QUALITY.shadow, QUALITY.shadow);
  spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 9;
  spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.025; spot.shadow.radius = 3;
  scene.add(spot, spot.target);
  LIGHTS.spot = spot;
  const anchor = id => (PRACTICAL.find(p => p.id === id) || {}).p;
  const defs = [
    ['pilotis', V3(6.9, 3.0, 0.2), 0xffb470, 14, 7.5],
    ['kissaten', anchor('kissaten'), 0xffa860, 18, 9],
    ['ramen', anchor('ramen'), 0xffbc7a, 20, 11],
    ['conbini', anchor('conbini'), 0xeef4ff, 26, 13],
    ['lampE', V3(3.45, 4.35, 8.0), 0xffcf90, 16, 15],
    ['phone', V3(5.0, 1.3, -0.2), 0xd8e4ff, 0.5, 1.4],
    ['vending', V3(-4.7, 1.25, 12.1), 0xd6e4ff, 7, 5.5],
    ['izakaya', anchor('izakaya'), 0xff8c48, 12, 9],
    ['lampW', V3(-3.45, 4.35, -8.0), 0xffcf90, 16, 15],
    ['alley', anchor('alley'), 0xff6a3a, 9, 9],
    ['soba', anchor('soba'), 0xffd890, 14, 10],
    ['pharmacy', anchor('pharmacy'), 0xf2f6ff, 18, 11],
    ['laundry', anchor('laundry'), 0xe8f2ff, 14, 10],
    ['koban', anchor('koban'), 0xff2a1a, 6, 8],
  ];
  const max = QUALITY.name === 'low' ? 6 : defs.length;
  defs.slice(0, max).forEach(([id, p, c, k, d]) => {
    if (!p) return;
    const l = new THREE.PointLight(c, k, d, 2);
    l.position.copy(p);
    scene.add(l);
    LIGHTS[id] = l;
    l.userData.base = k;
  });
}

/* ---------- environment capture from the street itself ---------- */
const ENV_HIDDEN = [];
function captureEnvironment(hidden = ENV_HIDDEN) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cube = new THREE.CubeCamera(0.2, 1200, rt);
  cube.position.set(0.4, 2.8, 2.0);
  cube.layers.enableAll();
  hidden.forEach(o => o.visible = false);
  scene.add(cube);
  cube.update(renderer, scene);
  scene.remove(cube);
  hidden.forEach(o => o.visible = true);
  const env = pmrem.fromCubemap(rt.texture).texture;
  scene.environment = env;
  rt.dispose(); pmrem.dispose();
  return env;
}
