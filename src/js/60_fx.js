/* ============================================================
   Effects: drizzle, drips, steam and smoke, mist halos,
   lanterns, signal lamps, the LED scroller, little flickers
   ============================================================ */

const FX = {};

/* ---------- drizzle: world-anchored streaks wrapped around the camera ---------- */
function buildRain() {
  const n = QUALITY.rain;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(n * 4), r = mulberry32(99);
  for (let i = 0; i < n * 4; i++) seeds[i] = r();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = n;
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.uTime, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(36, 18, 36) },
      uLen: { value: 0.12 }, uWidth: { value: 0.0028 }, uAmt: { value: 1 }, uLF: U.uLF, uLFRect: U.uLFRect,
      uL: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uLC: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
      uFogColor: U.uFogColor, uFogDensity: U.uFogDensity,
    },
    vertexShader: /* glsl */`
      uniform float uTime, uLen, uWidth; uniform vec3 uCam, uBox; uniform sampler2D uLF; uniform vec4 uLFRect;
      uniform vec4 uL[6]; uniform vec3 uLC[6];
      attribute vec4 aSeed;
      varying float vA; varying vec3 vC; varying vec2 vUv;
      void main(){
        float speed = 7.5 + aSeed.w * 2.5;
        vec3 p = aSeed.xyz * uBox;
        p.y -= uTime * speed;
        p.x += uTime * speed * 0.035;
        vec3 base = uCam - uBox * 0.5;
        p = base + mod(p - base, uBox);
        vec3 vel = normalize(vec3(0.035, -1.0, 0.0));
        vec3 toCam = normalize(uCam - p);
        vec3 side = normalize(cross(vel, toCam));
        float len = uLen * (0.7 + aSeed.w * 0.6);
        vec3 pos = p + side * position.x * uWidth * (1.0 + length(uCam - p) * 0.08) + vel * position.y * len;
        vec2 uv = (p.xz - uLFRect.xy) / uLFRect.zw;
        vec4 lf = (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) ? texture2D(uLF, uv) : vec4(0.0, 0.0, 0.0, 1.0);
        float sky = step(0.5, lf.a);
        vec3 light = lf.rgb * lf.rgb * 1.0 * exp(-max(p.y, 0.0) * 0.18) + vec3(0.006, 0.008, 0.013);
        for (int i = 0; i < 6; i++) { vec3 d = p - uL[i].xyz; light += uLC[i] * uL[i].w * 0.8 / (1.0 + dot(d, d) * 2.5); }
        float dist = length(uCam - p);
        vA = sky * smoothstep(1.2, 3.2, dist) * (1.0 - smoothstep(7.0, 12.0, dist)) * step(0.02, p.y);
        vC = light; vUv = position.xy + 0.5;
        gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uAmt; varying float vA; varying vec3 vC; varying vec2 vUv;
      void main(){
        float a = (1.0 - abs(vUv.x * 2.0 - 1.0)) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.6, vUv.y) * vA * uAmt;
        if (a < 0.002) discard;
        gl_FragColor = vec4(vC * a * 0.04, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.layers.set(LAYER_NOREFL); mesh.renderOrder = 8;
  scene.add(mesh);
  FX.rain = mesh;
  // the brightest nearby sources light the drops
  FX.rainSources = [
    { p: V3(5.3, 3.4, 0.05), c: new THREE.Color(1.0, 0.62, 0.32), k: 1.4 },
    ...LAMPS.map(p => ({ p, c: new THREE.Color(1.0, 0.75, 0.45), k: 0.9 })),
    ...VENDING.map(v => ({ p: V3(v.x, 1.2, v.z), c: new THREE.Color(0.7, 0.8, 1.0), k: 0.7 })),
    { p: V3(-5.0, 2.8, 23), c: new THREE.Color(0.85, 0.9, 1.0), k: 1.2 },
    { p: V3(-5.0, 2.6, -1), c: new THREE.Color(1.0, 0.7, 0.4), k: 0.9 },
    { p: V3(-5.2, 2.6, -9), c: new THREE.Color(1.0, 0.35, 0.2), k: 0.9 },
  ];
}
function updateRain(cam, amt) {
  const u = FX.rain.material.uniforms;
  u.uCam.value.copy(cam.position);
  u.uAmt.value = amt;
  const srcs = FX.rainSources.map(s => ({ s, d: s.p.distanceToSquared(cam.position) })).sort((a, b) => a.d - b.d).slice(0, 6);
  srcs.forEach((x, i) => { u.uL.value[i].set(x.s.p.x, x.s.p.y, x.s.p.z, x.s.k); u.uLC.value[i].copy(x.s.c); });
}

/* ---------- drips from eaves, signs and lantern strings ---------- */
function buildDrips() {
  const pts = [];
  // under his sign and along the overhang behind him
  for (let i = 0; i < 6; i++) pts.push([5.58 + rnd(-0.05, 0.05), 3.68, rnd(-0.22, 0.22), 0.15]);   // off the sign's back edge, clear of him
  for (let z = -4.2; z <= 4.2; z += 0.55) pts.push([6.0, 3.2, z + rnd(-0.1, 0.1), 0.15]);
  // shop awnings and eaves on both sides of the hero zone
  for (let z = -12.8; z <= -5.2; z += 0.6) pts.push([-6 + 0.8, 3.28, z, 0.15]);
  for (let z = 20.3; z <= 27.7; z += 0.6) pts.push([6 - 1.0, 2.0, z, 0.15]);
  for (let z = 4.3; z <= 9.7; z += 0.7) pts.push([-6 + 0.85, 3.25, z, 0.15]);
  // balconies of the brick building across from him
  for (let z = -12.5; z <= -5.5; z += 0.9) pts.push([-6.0, 6.6, z, 0.15]);
  const n = pts.length;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const a = new Float32Array(n * 4), b = new Float32Array(n * 4), r = mulberry32(17);
  pts.forEach((p, i) => { a.set([p[0], p[1], p[2], p[3]], i * 4); b.set([0.9 + r() * 2.6, r() * 10, r(), 0], i * 4); });
  g.setAttribute('aP', new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute('aT', new THREE.InstancedBufferAttribute(b, 4));
  g.instanceCount = n;
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uCam: { value: new THREE.Vector3() } },
    vertexShader: /* glsl */`
      uniform float uTime; uniform vec3 uCam; attribute vec4 aP, aT; varying float vA; varying vec2 vUv; varying float vS;
      void main(){
        float per = aT.x, age = mod(uTime + aT.y, per);
        float fallT = sqrt(2.0 * (aP.y - aP.w) / 9.8);
        vec3 p = aP.xyz;
        float splash = 0.0;
        if (age < fallT) { p.y -= 0.5 * 9.8 * age * age; }
        else { p.y = aP.w + 0.01; splash = 1.0 - (age - fallT) / 0.12; }
        float v = 9.8 * min(age, fallT);
        vec3 vel = vec3(0.0, -1.0, 0.0);
        vec3 toCam = normalize(uCam - p);
        vec3 side = normalize(cross(vel, toCam));
        float len = clamp(v * 0.022, 0.02, 0.25);
        vec3 pos = splash > 0.0 ? p + (side * position.x + cross(side, toCam) * position.y) * 0.05 * splash : p + side * position.x * 0.005 + vel * position.y * len;
        vA = splash > 0.0 ? clamp(splash, 0.0, 1.0) * 0.6 : smoothstep(0.0, 0.15, age) * 0.55;
        vS = splash > 0.0 ? 1.0 : 0.0;
        if (age > fallT + 0.12) vA = 0.0;
        vUv = position.xy + 0.5;
        gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vA; varying vec2 vUv; varying float vS;
      void main(){
        float a = vS > 0.5 ? smoothstep(0.5, 0.35, length(vUv - 0.5)) * smoothstep(0.15, 0.3, length(vUv - 0.5)) : (1.0 - abs(vUv.x * 2.0 - 1.0));
        a *= vA; if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(1.0, 0.82, 0.62) * a * 1.6, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.layers.set(LAYER_NOREFL); mesh.renderOrder = 8;
  scene.add(mesh);
  FX.drips = mesh;
}

/* ---------- steam, smoke and coffee wisps ---------- */
function buildSteam() {
  const parts = [];
  const r = mulberry32(55);
  const lfAt = (x, z) => {
    if (!LF_CANVAS) return [0.5, 0.45, 0.4];
    const [px, py] = lfPx(x, z);
    const d = LF_CANVAS.getContext('2d').getImageData(clamp(px | 0, 0, LF_W - 1), clamp(py | 0, 0, LF_H - 1), 1, 1).data;
    return [d[0] / 255, d[1] / 255, d[2] / 255];
  };
  for (const e of EMITTERS) {
    const count = Math.round((e.kind === 'wisp' ? 26 : 20) * e.rate * e.life / 3);
    const l = lfAt(e.p.x, e.p.z);
    const light = e.indoor ? [1.0, 0.82, 0.6] : [0.18 + l[0] * 1.6, 0.18 + l[1] * 1.6, 0.22 + l[2] * 1.6];
    for (let i = 0; i < count; i++) parts.push({ e, seed: r(), off: i / count, light });
  }
  const n = parts.length;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const A = new Float32Array(n * 4), B = new Float32Array(n * 4), C = new Float32Array(n * 4), D = new Float32Array(n * 4);
  parts.forEach((p, i) => {
    const e = p.e;
    A.set([e.p.x, e.p.y, e.p.z, e.life], i * 4);
    B.set([e.dir.x, e.dir.y, e.dir.z, e.spread], i * 4);
    C.set([e.size, e.rise, e.dens, e.kind === 'wisp' ? 1 : e.kind === 'smoke' ? 2 : 0], i * 4);
    D.set([p.light[0] * e.color[0], p.light[1] * e.color[1], p.light[2] * e.color[2], p.off + p.seed * 0.03], i * 4);
  });
  g.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 4));
  g.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 4));
  g.setAttribute('aC', new THREE.InstancedBufferAttribute(C, 4));
  g.setAttribute('aD', new THREE.InstancedBufferAttribute(D, 4));
  g.instanceCount = n;
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, tPuff: { value: TEX.puff }, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity },
    vertexShader: /* glsl */`
      uniform float uTime; attribute vec4 aA, aB, aC, aD;
      varying vec2 vUv; varying float vA; varying vec3 vC; varying float vRot; varying vec3 vW;
      float h(float n){ return fract(sin(n * 91.7) * 43758.5453); }
      void main(){
        float life = aA.w, seed = aD.w;
        float age = fract(uTime / life + seed);
        float t = age * life;
        vec3 dir = aB.xyz;
        float sp = aB.w;
        vec3 rnd = vec3(h(seed * 13.1) - 0.5, h(seed * 7.7), h(seed * 3.3) - 0.5);
        vec3 p = aA.xyz + dir * t * 0.25 + vec3(rnd.x, 0.0, rnd.z) * sp * t + vec3(0.0, aC.y * t, 0.0);
        float wisp = step(0.5, aC.w) * step(aC.w, 1.5);
        p.x += sin(t * 2.3 + seed * 20.0) * (0.05 + t * 0.06) * (wisp > 0.5 ? 0.25 : 1.0);
        p.z += cos(t * 1.9 + seed * 17.0) * (0.05 + t * 0.06) * (wisp > 0.5 ? 0.25 : 1.0);
        p.x += t * 0.08;
        float size = aC.x * (0.35 + age * 1.3) * (wisp > 0.5 ? (0.3 + age * 1.5) : 1.0);
        vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float ang = seed * 6.28 + t * 0.4;
        vec2 q = vec2(cos(ang) * position.x - sin(ang) * position.y, sin(ang) * position.x + cos(ang) * position.y);
        vec3 pos = p + (camR * q.x + camU * q.y * (wisp > 0.5 ? 1.6 : 1.0)) * size;
        vA = aC.z * smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.45, 1.0, age));
        vC = aD.rgb; vUv = position.xy + 0.5; vW = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tPuff; uniform vec3 uFogColor; uniform float uFogDensity;
      varying vec2 vUv; varying float vA; varying vec3 vC; varying vec3 vW;
      ${FOG_FN}
      void main(){
        float a = texture2D(tPuff, vUv).a * vA;
        if (a < 0.003) discard;
        float f = hFogAmount(vW, cameraPosition, uFogDensity);
        vec3 c = mix(vC, hFogColor(uFogColor, vW), f);
        gl_FragColor = vec4(c * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.layers.set(LAYER_NOREFL); mesh.renderOrder = 9;
  scene.add(mesh);
  FX.steam = mesh;
}

/* ---------- mist halos around lights ---------- */
function haloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { tGlow: { value: TEX.glow }, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity, uGain: { value: 1 } },
    vertexShader: /* glsl */`
      attribute vec3 aCol; attribute float aSize;
      varying vec2 vUv; varying vec3 vC; varying vec3 vW;
      void main(){
        vec3 c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float s = length(instanceMatrix[0].xyz);
        vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 toCam = normalize(cameraPosition - c);
        vec3 pos = c + toCam * min(s * 0.5, 0.6) + (camR * position.x + camU * position.y) * s;
        vUv = position.xy + 0.5; vC = instanceColor; vW = c;
        gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tGlow; uniform vec3 uFogColor; uniform float uFogDensity; uniform float uGain;
      varying vec2 vUv; varying vec3 vC; varying vec3 vW;
      ${FOG_FN}
      void main(){
        float g = texture2D(tGlow, vUv).a;
        float f = hFogAmount(vW, cameraPosition, uFogDensity);
        float d = length(vW - cameraPosition);
        gl_FragColor = vec4(vC * g * uGain * (1.0 - f * 0.85) * smoothstep(0.5, 3.0, d), 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  });
}
function buildHalos() {
  const list = [];
  for (const p of LAMPS) list.push({ p, size: 1.5, c: new THREE.Color(0.11, 0.075, 0.04) });
  for (const s of SIGN_GLOWS) list.push({ p: s.p, size: s.size, c: s.color.clone().multiplyScalar(0.6), hero: s.hero });
  for (const s of STREET_GLOWS) list.push({ p: s.p, size: s.size, c: s.color });
  for (const l of LANTERNS) list.push({ p: V3(l.p.x, l.p.y - l.size * 0.55, l.p.z), size: l.size * 2.4, c: new THREE.Color(0.12, 0.035, 0.015).multiplyScalar(l.size > 0.5 ? 1.2 : 0.8) });
  for (const v of VENDING) list.push({ p: V3(v.x + Math.sin(v.yaw) * 0.5, 1.2, v.z + Math.cos(v.yaw) * 0.5), size: 2.0, c: new THREE.Color(0.06, 0.08, 0.12) });
  list.push({ p: KOBAN_LAMP.clone(), size: 1.6, c: new THREE.Color(0.5, 0.03, 0.02) });
  for (const p of AVIATION) list.push({ p, size: 9, c: new THREE.Color(0.8, 0.05, 0.03), blink: true });
  for (const p of BACK_LAMPS) list.push({ p, size: 2.2, c: new THREE.Color(0.03, 0.022, 0.014) });
  const im = new THREE.InstancedMesh(G.plane, haloMaterial(), list.length);
  list.forEach((h, i) => { im.setMatrixAt(i, mat(h.p.x, h.p.y, h.p.z, 0, 0, 0, h.size, h.size, h.size)); im.setColorAt(i, h.c); });
  im.frustumCulled = false; im.layers.set(LAYER_NOREFL); im.renderOrder = 7;
  scene.add(im);
  FX.halos = im; FX.haloList = list;
  FX.heroHalo = list.findIndex(h => h.hero);
  FX.blinkers = list.map((h, i) => h.blink ? i : -1).filter(i => i >= 0);
  // the cone of light under his sign, faint in the mist
  const coneGeo = new THREE.ConeGeometry(1.25, 3.3, 24, 1, true).translate(0, -1.65, 0);
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(1.0, 0.62, 0.3) }, uK: { value: 0.05 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vY = position.y; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 uCol; uniform float uK; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 1.5); float fall = smoothstep(-3.3, -0.2, vY); gl_FragColor = vec4(uCol * uK * (1.0 - f) * fall, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.set(5.3, 3.62, 0.05); cone.layers.set(LAYER_NOREFL); cone.renderOrder = 7;
  scene.add(cone);
  FX.cone = cone;
}

/* ---------- lanterns: instanced, each with its own painted paper, swaying ---------- */
function buildLanterns() {
  const prof = [[0.0, 0.0], [0.28, -0.04], [0.42, -0.2], [0.5, -0.5], [0.42, -0.8], [0.28, -0.96], [0.0, -1.0]];
  const geo = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 16);
  const uvs = geo.attributes.uv; // lathe u wraps around, v runs top to bottom
  for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i), 1 - uvs.getY(i));
  const n = LANTERNS.length;
  const aUV = new Float32Array(n * 4);
  LANTERNS.forEach((l, i) => aUV.set([l.rect.u0, l.rect.v0, l.rect.u1 - l.rect.u0, l.rect.v1 - l.rect.v0], i * 4));
  geo.setAttribute('aUV', new THREE.InstancedBufferAttribute(aUV, 4));
  const m = basic({ map: TEX.sign, color: 0xffffff });
  m.onBeforeCompile = s => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aUV;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = aUV.xy + vMapUv * aUV.zw;');
  };
  m.customProgramCacheKey = () => 'lantern';
  const im = new THREE.InstancedMesh(geo, m, n);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  LANTERNS.forEach((l, i) => { im.setColorAt(i, new THREE.Color(l.k || 2, (l.k || 2) * 0.92, (l.k || 2) * 0.85)); l.phase = hash1(i * 3.7) * 10; });
  im.frustumCulled = false;
  scene.add(im);
  FX.lanterns = im;
}
function updateLanterns(T) {
  const im = FX.lanterns;
  LANTERNS.forEach((l, i) => {
    const rx = 0.05 * Math.sin(T * 1.1 + l.phase) + 0.02 * Math.sin(T * 2.7 + l.phase * 2);
    const rz = 0.04 * Math.sin(T * 0.9 + l.phase * 1.3);
    im.setMatrixAt(i, mat(l.p.x, l.p.y, l.p.z, l.phase, rx, rz, l.size * 0.62, l.size, l.size * 0.62));
  });
  im.instanceMatrix.needsUpdate = true;
}

/* ---------- traffic and pedestrian signal lamps ---------- */
function buildSignalLamps() {
  const veh = SIGNAL_HEADS.filter(h => h.kind === 'veh'), ped = SIGNAL_HEADS.filter(h => h.kind === 'ped');
  const vm = new THREE.InstancedMesh(G.cyl24, basic({ color: 0xffffff }), veh.length);
  veh.forEach((h, i) => vm.setMatrixAt(i, h.m));
  const pg = G.plane.clone();
  const aUV = new Float32Array(ped.length * 4);
  ped.forEach((h, i) => aUV.set([h.rect.u0, h.rect.v0, h.rect.u1 - h.rect.u0, h.rect.v1 - h.rect.v0], i * 4));
  pg.setAttribute('aUV', new THREE.InstancedBufferAttribute(aUV, 4));
  const pmat = basic({ map: TEX.sign, color: 0xffffff });
  pmat.onBeforeCompile = s => { s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aUV;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = aUV.xy + vMapUv * aUV.zw;'); };
  pmat.customProgramCacheKey = () => 'pedlamp';
  const pm = new THREE.InstancedMesh(pg, pmat, ped.length);
  ped.forEach((h, i) => pm.setMatrixAt(i, h.m));
  for (const im of [vm, pm]) { im.frustumCulled = false; scene.add(im); }
  FX.sigV = { im: vm, list: veh }; FX.sigP = { im: pm, list: ped };
  // a dynamic halo per vehicle lamp
  FX.sigHalo = new THREE.InstancedMesh(G.plane, haloMaterial(), veh.length + ped.length);
  [...veh, ...ped].forEach((h, i) => { const p = V3().setFromMatrixPosition(h.m); FX.sigHalo.setMatrixAt(i, mat(p.x, p.y, p.z, 0, 0, 0, 1.4, 1.4, 1.4)); });
  FX.sigHalo.frustumCulled = false; FX.sigHalo.layers.set(LAYER_NOREFL); scene.add(FX.sigHalo);
}
const SIG_COL = { G: new THREE.Color(0.0, 1.0, 0.72), Y: new THREE.Color(1.0, 0.62, 0.05), R: new THREE.Color(1.0, 0.08, 0.04) };
function updateSignalLamps(T) {
  const { im, list } = FX.sigV;
  const halo = FX.sigHalo;
  list.forEach((h, i) => {
    const state = h.group === 'A' ? SIG.A(T) : SIG.B(T);
    const on = state === h.color;
    const c = SIG_COL[h.color];
    im.setColorAt(i, _c1.copy(c).multiplyScalar(on ? 9 : 0.05));
    halo.setColorAt(i, _c1.copy(c).multiplyScalar(on ? 0.22 : 0));
  });
  const P = FX.sigP;
  P.list.forEach((h, i) => {
    const st = h.group === 'pedMain' ? SIG.pedMain(T) : SIG.pedCross(T);
    let on = false;
    if (h.color === 'R') on = st === 'D';
    else on = st === 'W' || (st === 'F' && fract(T * 2) < 0.5);
    const c = h.color === 'R' ? SIG_COL.R : SIG_COL.G;
    P.im.setColorAt(i, on ? _c1.copy(c).multiplyScalar(5) : _c1.setRGB(0.05, 0.05, 0.05));
    halo.setColorAt(list.length + i, _c1.copy(c).multiplyScalar(on ? 0.12 : 0));
  });
  im.instanceColor.needsUpdate = true; P.im.instanceColor.needsUpdate = true; halo.instanceColor.needsUpdate = true;
}

/* ---------- the pharmacy's red dot-matrix scroller ---------- */
function buildLED() {
  const c = makeCanvas(2048, 32), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 2048, 32);
  g.font = font('dot', 28, 400); g.fillStyle = '#fff'; g.textBaseline = 'middle';
  g.fillText(TX.ledScroll + TX.ledScroll, 0, 17);
  const tex = canvasTex(c, { srgb: false, mips: false }); tex.wrapS = THREE.RepeatWrapping;
  const m = new THREE.ShaderMaterial({
    uniforms: { tText: { value: tex }, uTime: U.uTime, uAspect: { value: 10 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tText; uniform float uTime; uniform float uAspect; varying vec2 vUv;
      void main(){
        vec2 grid = vec2(16.0 * uAspect, 16.0);
        vec2 cell = floor(vUv * grid), f = fract(vUv * grid) - 0.5;
        float u = (cell.x + 0.5) / grid.x * (uAspect / 64.0) + uTime * 0.012;
        float on = step(0.45, texture2D(tText, vec2(u, 1.0 - (cell.y + 0.5) / grid.y)).r);
        float dot_ = smoothstep(0.42, 0.3, length(f));
        vec3 col = mix(vec3(0.05, 0.004, 0.0), vec3(5.0, 0.45, 0.12), on) * dot_;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  for (const L of LED_SIGNS) {
    const mesh = new THREE.Mesh(G.plane, m.clone());
    mesh.material.uniforms.uAspect.value = L.w / L.h;
    mesh.material.uniforms.uTime = U.uTime; mesh.material.uniforms.tText = { value: tex };
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(L.b.M(mat(L.x, L.y, L.z, 0, 0, 0, L.w, L.h, 1)));
    scene.add(mesh);
  }
}

/* ---------- laundromat drums, a flickering tube, aviation lights, his neon ---------- */
function buildSmallFX() {
  const dc = makeCanvas(128, 128), g = dc.getContext('2d');
  g.fillStyle = '#20262c'; g.fillRect(0, 0, 128, 128);
  const r = mulberry32(3);
  for (let k = 0; k < 40; k++) { g.fillStyle = ['#c0392b', '#ecf0f1', '#2471a3', '#d4ac0d', '#7d3c98', '#1e8449'][k % 6]; g.beginPath(); g.ellipse(64 + (r() - 0.5) * 80, 70 + (r() - 0.2) * 40, 8 + r() * 12, 5 + r() * 8, r() * 3, 0, TAU); g.fill(); }
  const drumTex = canvasTex(dc);
  const dm = new THREE.InstancedMesh(new THREE.CircleGeometry(0.17, 20), basic({ map: drumTex, color: hdr(1.3, 1.3, 1.4) }), DRUMS.length || 1);
  dm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); dm.frustumCulled = false; dm.layers.set(LAYER_NOREFL); scene.add(dm);
  FX.drums = dm;
  const tube = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05), basic({ color: hdr(6, 6.5, 7) }));
  if (FLICKER_TUBES[0]) { tube.position.copy(FLICKER_TUBES[0].p); scene.add(tube); FX.tube = tube; }
}
function updateSmallFX(T) {
  DRUMS.forEach((d, i) => {
    const ang = d.spin ? T * (2.2 + d.phase * 0.3) + d.phase : d.phase;
    FX.drums.setMatrixAt(i, mat(d.p.x, d.p.y, d.p.z, d.yaw, 0, ang));
  });
  if (DRUMS.length) FX.drums.instanceMatrix.needsUpdate = true;
  if (FX.tube) {
    const h = hash1(Math.floor(T * 14)), h2 = hash1(Math.floor(T * 0.7));
    const on = h2 < 0.7 ? 1 : (h < 0.5 ? 0.15 : 1);
    FX.tube.material.color.setRGB(6 * on, 6.5 * on, 7 * on);
  }
  // his sign's neon stutters for a moment every 17 seconds
  const c = fract(T / 17) * 17;
  let neon = 1;
  if (c > 11.0 && c < 11.6) neon = (hash1(Math.floor(T * 24)) < 0.55) ? 0.08 : 0.9;
  M.neon.color.setScalar(neon);
  if (FX.heroHalo >= 0) { FX.halos.setColorAt(FX.heroHalo, _c1.setRGB(0.07, 0.056, 0.042).multiplyScalar(0.55 + 0.45 * neon)); FX.halos.instanceColor.needsUpdate = true; }
  for (const i of FX.blinkers) FX.halos.setColorAt(i, fract(T * 0.55 + i * 0.37) < 0.18 ? _c1.setRGB(0.9, 0.05, 0.03) : _c1.setRGB(0.02, 0.0, 0.0));
  if (FX.blinkers.length) FX.halos.instanceColor.needsUpdate = true;
}
