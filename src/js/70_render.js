/* ============================================================
   Rendering: puddle reflections, physically based depth of
   field, energy-conserving bloom, camera motion blur, film
   response, grade, grain, and the CCTV / glitch / wipe looks
   ============================================================ */

const FSQ = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const mesh = new THREE.Mesh(g, null);
  mesh.frustumCulled = false;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return { mesh, cam, draw(material, target) { mesh.material = material; renderer.setRenderTarget(target); renderer.render(mesh, cam); } };
})();
const VS_FS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function pass(fs, uniforms, defines = {}) { return new THREE.ShaderMaterial({ vertexShader: VS_FS, fragmentShader: fs, uniforms, defines, depthTest: false, depthWrite: false }); }

const SAN = /* glsl */`
vec3 san(vec3 c){ if (any(isnan(c)) || any(isinf(c))) return vec3(0.0); return min(c, vec3(48.0)); }
`;
// uTilt swaps the lens for a tilt-shift band: sharp across the frame just below centre, soft above and below.
const DOF_COMMON = SAN + /* glsl */`
#include <packing>
uniform float uNear, uFar, uFocus, uFocal, uAperture, uPxPerM, uMaxCoc, uTilt;
float linZ(float d){ return -perspectiveDepthToViewZ(d, uNear, uFar); }
float cocPx(float z, vec2 uv){
  float lens = uAperture * uFocal * (z - uFocus) / (max(z, 1e-3) * max(uFocus - uFocal, 1e-3)) * uPxPerM;
  float y = uv.y - 0.42;
  return mix(lens, sign(y) * max(abs(y) - 0.09, 0.0) * 3.0 * uMaxCoc, uTilt);
}
`;

// Looks laid over the graded picture. P holds the grade each one wants from the main pass.
const FILTERS = [
  { id: 'cinema', name: 'Cinema', jp: '映画' },
  { id: 'noir', name: 'Noir', jp: 'ノワール', P: { bloom: 0.13, halation: 0, grain: 0.045, vignette: 0.62, ca: 0.0005 } },
  { id: 'vintage', name: 'Vintage', jp: '昭和フィルム', P: { bloom: 0.1, halation: 0.05, grain: 0.03, vignette: 0.7 } },
  { id: 'vhs', name: 'VHS', jp: 'ビデオ', P: { bloom: 0.1, grain: 0, ca: 0.003, vignette: 0.3, sat: 1.18 } },
  { id: 'pixel', name: '8-bit', jp: 'ドット絵', P: { grain: 0, ca: 0, vignette: 0, mb: 0, dof: false, exposure: 1.3 } },
  { id: 'anime', name: 'Anime', jp: 'アニメ', P: { grain: 0, ca: 0, vignette: 0.12, bloom: 0.12, halation: 0.01, exposure: 1.12, dof: false } },
  { id: 'thermal', name: 'Thermal', jp: 'サーモ', rain: 0, P: { grain: 0, mb: 0, dof: false } },
  { id: 'night', name: 'Night Vision', jp: '暗視', P: { grain: 0, mb: 0, dof: false } },
  { id: 'tilt', name: 'Tilt-Shift', jp: 'ミニチュア', P: { tilt: 1, grain: 0.01, vignette: 0.2, exposure: 1.15 } },
];
const FILTER_FS = /* glsl */`
#include <packing>
uniform sampler2D tLDR, tHDR, tBloom, tDepth, tHeat, tHeatDepth;
uniform vec2 uRes; uniform float uTime, uNear, uFar, uFade, uExposure, uDay;
uniform int uMode;
varying vec2 vUv;
float hsh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float linZ(float d){ return -perspectiveDepthToViewZ(d, uNear, uFar); }
vec3 ldr(vec2 uv){ return texture2D(tLDR, uv).rgb; }
const vec3 PAL[16] = vec3[16](vec3(0.0), vec3(0.114, 0.169, 0.325), vec3(0.494, 0.145, 0.325), vec3(0.0, 0.529, 0.318), vec3(0.671, 0.322, 0.212), vec3(0.373, 0.341, 0.31),
  vec3(0.761, 0.765, 0.78), vec3(1.0, 0.945, 0.91), vec3(1.0, 0.0, 0.302), vec3(1.0, 0.639, 0.0), vec3(1.0, 0.925, 0.153), vec3(0.0, 0.894, 0.212), vec3(0.161, 0.678, 1.0), vec3(0.514, 0.463, 0.612), vec3(1.0, 0.467, 0.659), vec3(1.0, 0.8, 0.667));
float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
vec3 iron(float t){
  vec3 c = mix(vec3(0.0, 0.0, 0.05), vec3(0.17, 0.02, 0.42), smoothstep(0.0, 0.2, t));
  c = mix(c, vec3(0.6, 0.06, 0.55), smoothstep(0.2, 0.4, t));
  c = mix(c, vec3(0.92, 0.25, 0.1), smoothstep(0.4, 0.6, t));
  c = mix(c, vec3(1.0, 0.64, 0.06), smoothstep(0.6, 0.78, t));
  c = mix(c, vec3(1.0, 0.94, 0.45), smoothstep(0.78, 0.93, t));
  return mix(c, vec3(1.0), smoothstep(0.93, 1.05, t));
}
void main(){
  vec2 uv = vUv, px = 1.0 / uRes;
  float asp = uRes.x / uRes.y;
  vec2 cc = (uv - 0.5) * vec2(asp, 1.0);
  vec3 col;
  if (uMode == 1) {
    // noir: a yellow lens filter darkens the sky, then a hard print curve
    float l = smoothstep(0.01, 0.92, pow(dot(ldr(uv), vec3(0.4, 0.5, 0.1)), 0.8));
    col = vec3(mix(l, l * l * (3.0 - 2.0 * l), 0.45)) * vec3(1.0, 0.985, 0.955);
  } else if (uMode == 2) {
    // sepia print projected at 18 frames a second: gate weave, flicker, scratches, dust
    float fr = floor(uTime * 18.0);
    vec2 q = uv + (vec2(hsh(vec2(fr, 1.0)), hsh(vec2(fr, 2.0))) - 0.5) * vec2(0.0015, 0.003);
    vec3 c = ldr(q) * 0.5 + (ldr(q + vec2(px.x, 0.0)) + ldr(q - vec2(px.x, 0.0))) * 0.25;
    float l = luma(c) * (0.93 + 0.07 * hsh(vec2(fr, 3.0)));
    col = mix(vec3(0.09, 0.055, 0.03), vec3(1.0, 0.84, 0.6), smoothstep(0.0, 0.85, l));
    col = mix(col, vec3(1.0, 0.95, 0.84), smoothstep(0.7, 1.0, l) * 0.6) * 0.9 + 0.045;
    for (int i = 0; i < 3; i++) {
      float fi = float(i), sx = hsh(vec2(fr, 10.0 + fi)), on = step(0.6, hsh(vec2(floor(uTime * 3.0), 20.0 + fi)));
      float d = abs(uv.x - sx - sin(uv.y * 3.0 + fi) * 0.004) * uRes.x;
      col = mix(col, vec3(0.96, 0.9, 0.78), on * (1.0 - smoothstep(0.3, 1.4, d)) * (0.35 + 0.35 * hsh(vec2(floor(uv.y * 40.0), fr))));
    }
    vec2 dg = uv * vec2(asp, 1.0) * 70.0;
    if (hsh(floor(dg) + fr * 7.31) > 0.9975) col *= mix(1.0, 0.2, smoothstep(0.45, 0.15, length(fract(dg) - 0.5)));
  } else if (uMode == 3) {
    // VHS: 240 lines of tape, a tracking band, head-switching noise, smeared and late chroma
    float line = floor(uv.y * 240.0), f = floor(uTime * 30.0);
    float band = fract(uTime * 0.045 + 0.3), inBand = 1.0 - smoothstep(0.0, 0.025, abs(uv.y - band));
    float bottom = 1.0 - smoothstep(0.0, 0.03, uv.y);
    vec2 q = uv;
    q.x += (hsh(vec2(line, f)) - 0.5) * 0.0011 + inBand * (hsh(vec2(line, f + 1.0)) - 0.5) * 0.012 + bottom * (0.02 + 0.02 * hsh(vec2(line, f)));
    float Y = luma(ldr(q)) * 0.5 + luma(ldr(q - vec2(px.x * 2.0, 0.0)) + ldr(q + vec2(px.x * 2.0, 0.0))) * 0.25;
    vec3 cs = vec3(0.0);
    for (int i = 0; i < 6; i++) cs += ldr(q - vec2(px.x * (3.0 + float(i) * 2.5), 0.0));
    cs /= 6.0;
    float I = dot(cs, vec3(0.596, -0.274, -0.322)) * 1.15, Qc = dot(cs, vec3(0.211, -0.523, 0.312)) * 1.15;
    col = vec3(Y + 0.956 * I + 0.621 * Qc, Y - 0.272 * I - 0.647 * Qc, Y - 1.106 * I + 1.703 * Qc);
    float x0 = hsh(vec2(line, f * 1.7)), len = 0.01 + 0.06 * hsh(vec2(f, line));
    float drop = step(hsh(vec2(line * 0.37, f)), 0.006 + inBand * 0.25 + bottom * 0.3) * step(x0, uv.x) * (1.0 - smoothstep(x0, x0 + len, uv.x));
    col = mix(col, vec3(0.92), drop * 0.75);
    col *= 0.92 + 0.08 * sin(uv.y * uRes.y * 3.14159);
    col = col * 0.88 + vec3(0.045, 0.035, 0.055);
  } else if (uMode == 4) {
    // 8-bit: square pixels about 160 to the frame height, the sixteen PICO-8 colours, a light ordered dither
    float ps = max(2.0, floor(uRes.y / 160.0 + 0.5));
    vec2 cell = floor(gl_FragCoord.xy / ps), c0 = (cell + 0.5) * ps * px, o = ps * 0.25 * px;
    vec3 c = (ldr(c0 + vec2(-o.x, -o.y)) + ldr(c0 + vec2(o.x, -o.y)) + ldr(c0 + vec2(-o.x, o.y)) + ldr(c0 + o)) * 0.25;
    c = pow(c, vec3(0.8)) * 1.08 + (bayer4(cell) - 0.47) * 0.13;
    float best = 1e9;
    for (int i = 0; i < 16; i++) { vec3 e = PAL[i] - c; float d = dot(e * e, vec3(0.3, 0.55, 0.15)); if (d < best) { best = d; col = PAL[i]; } }
  } else if (uMode == 5) {
    // anime: cel bands that keep the hue, ink where depth or tone breaks
    vec3 c = ldr(uv);
    float d = linZ(texture2D(tDepth, uv).x);
    float dl = linZ(texture2D(tDepth, uv - vec2(px.x, 0.0)).x), dr = linZ(texture2D(tDepth, uv + vec2(px.x, 0.0)).x);
    float dd = linZ(texture2D(tDepth, uv - vec2(0.0, px.y)).x), du = linZ(texture2D(tDepth, uv + vec2(0.0, px.y)).x);
    float edge = (abs(dl + dr - 2.0 * d) + abs(du + dd - 2.0 * d)) / max(d, 0.3);
    float ink = smoothstep(0.03, 0.09, edge) * (1.0 - smoothstep(40.0, 120.0, d));
    float le = abs(luma(ldr(uv - vec2(px.x, 0.0))) - luma(ldr(uv + vec2(px.x, 0.0)))) + abs(luma(ldr(uv - vec2(0.0, px.y))) - luma(ldr(uv + vec2(0.0, px.y))));
    ink = max(ink, smoothstep(0.22, 0.45, le) * 0.55);
    float l = luma(c), q = l * 4.0;
    float lb = (floor(q) + smoothstep(0.3, 0.7, fract(q))) / 4.0;
    vec3 cel = c / max(l, 0.02) * max(lb, l * 0.35);
    cel = max(mix(vec3(luma(cel)), cel, 1.35), 0.0);
    col = cel * (1.0 - ink * 0.85) + vec3(0.01, 0.012, 0.03);
  } else if (uMode == 6) {
    // thermal: a 300-row sensor; bodies and engines from the heat pass, the rest from light and distance
    vec2 grid = vec2(floor(300.0 * asp), 300.0);
    vec2 q = (floor(uv * grid) + 0.5) / grid;
    float d = texture2D(tDepth, q).x, z = linZ(d);
    float L = luma(texture2D(tHDR, q).rgb);
    float t = 0.17 + 0.3 * (1.0 - 0.55 * uDay) * sqrt(min(L, 6.0)) - 0.08 * smoothstep(15.0, 250.0, z) + (luma(ldr(q)) - 0.12) * 0.12;
    t = mix(t, 0.04 + 0.05 * (1.0 - uv.y), step(1500.0, z));
    float hd = texture2D(tHeatDepth, q).x, hz = linZ(hd);
    float hv = step(hd, 0.999999) * step(hz, z * 1.004 + 0.04);
    t = mix(t, max(t, texture2D(tHeat, q).r), hv);
    t += (hsh(floor(uv * grid) + floor(uTime * 9.0) * 3.1) - 0.5) * 0.035;
    col = iron(t) * (1.0 - uFade);
  } else if (uMode == 7) {
    // night vision: amplified scene light on a green phosphor, photon noise, two tubes
    vec3 h = texture2D(tHDR, uv).rgb + texture2D(tBloom, uv).rgb / 6.0 * 0.5;
    float L = 1.0 - exp(-luma(h) * 15.0 * uExposure * (1.0 - 0.94 * uDay));
    L = pow(L, 0.85);
    L += (hsh(uv * uRes + fract(uTime * 30.0) * 91.0) - 0.5) * (0.12 + 0.18 * sqrt(L));
    L *= 0.93 + 0.07 * sin(uv.y * uRes.y * 1.6);
    col = vec3(0.25, 1.0, 0.34) * L + vec3(0.6, 0.3, 0.5) * L * L * L * 0.35;
    float tube = max(smoothstep(0.64, 0.6, length(cc - vec2(0.36, 0.0))), smoothstep(0.64, 0.6, length(cc + vec2(0.36, 0.0))));
    col *= tube * (1.0 - uFade);
  } else if (uMode == 8) {
    // tilt-shift: the band comes from the depth of field pass; here, toy-like colour
    vec3 c = ldr(uv);
    c = mix(vec3(luma(c)), c, 1.45);
    col = mix(c, c * c * (3.0 - 2.0 * c), 0.5) * 1.04;
  } else col = ldr(uv);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
const FILTER_ID = Object.fromEntries(FILTERS.map((f, i) => [f.id, i]));
const POST = { filter: 0 };

// Warm bodies for the thermal look: everything tagged here is drawn once more with its temperature (0..1).
const LAYER_HEAT = 2;
const HEAT = [];
function tagHeat(obj, k) {
  obj.traverse(o => {
    const h = typeof k === 'function' ? k(o) : k;
    if (!o.isMesh || !h || o.userData.heat != null) return;
    o.userData.heat = h; o.layers.enable(LAYER_HEAT); HEAT.push(o);
  });
}
// Skin is warmest, then clothes over a body, engines and tyres. Umbrellas and bags stay cold and hide what is behind them.
function tagWarmBodies() {
  const crowd = { head: 1, neck: 1, hand: 1, hair: 0.8, hairLong: 0.8, cap: 0.74, torso: 0.74, pelvis: 0.72, uarm: 0.72, farm: 0.74, thigh: 0.7, shin: 0.66, skirt: 0.66, foot: 0.55 };
  for (const k in crowd) tagHeat(CROWD.meshes[k], crowd[k]);
  const hm = HEROM.mat, hero = new Map([[hm.skin, 1], [hm.face, 1], [hm.hair, 0.8], [hm.knit, 0.76], [hm.coat, 0.68], [hm.trousers, 0.66], [hm.shoe, 0.5]]);
  tagHeat(HEROM.root, o => hero.get(o.material));
  tagHeat(COMP.dog.g, 0.86); tagHeat(COMP.cat.g, 0.84);
  const car = { body: 0.4, trim: 0.52, head: 0.8, tail: 0.6, stripe: 0.4 };
  for (const t in TRAFFIC.meshes) for (const p in car) if (TRAFFIC.meshes[t][p]) tagHeat(TRAFFIC.meshes[t][p], car[p]);
  tagHeat(TRAFFIC.wheels, 0.62); tagHeat(TRAFFIC.hubs, 0.58);
}
const HEAT_MATS = new Map();
function heatMaterial(k) {
  if (!HEAT_MATS.has(k)) HEAT_MATS.set(k, new THREE.ShaderMaterial({
    uniforms: { uHeat: { value: k } },
    vertexShader: /* glsl */`
      varying float vF;
      void main(){
        vec4 p = vec4(position, 1.0); vec3 n = normal;
        #ifdef USE_INSTANCING
          p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
        #endif
        vec4 mv = modelViewMatrix * p;
        vF = abs(dot(normalize(normalMatrix * n), normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: 'uniform float uHeat; varying float vF; void main(){ gl_FragColor = vec4(uHeat * (0.74 + 0.26 * vF), 0.0, 0.0, 1.0); }',
    side: THREE.DoubleSide,
  }));
  return HEAT_MATS.get(k);
}

class Pipeline {
  constructor() {
    this.w = 2; this.h = 2;
    const rt = (w, h, o = {}) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, ...o });
    this.rt = rt;
    this.prevVP = new THREE.Matrix4(); this.curVP = new THREE.Matrix4(); this.invVP = new THREE.Matrix4();
    this.reflCam = new THREE.PerspectiveCamera();
    this.reflCam.layers.set(0);
    this.mats = {};
    const M_ = this.mats;
    M_.pre = pass(DOF_COMMON + /* glsl */`
      uniform sampler2D tColor, tDepth; uniform vec2 uTexel; varying vec2 vUv;
      void main(){
        vec2 o = uTexel * 0.5;
        vec2 uv0 = vUv + vec2(-o.x, -o.y), uv1 = vUv + vec2(o.x, -o.y), uv2 = vUv + vec2(-o.x, o.y), uv3 = vUv + vec2(o.x, o.y);
        vec3 c0 = san(texture2D(tColor, uv0).rgb), c1 = san(texture2D(tColor, uv1).rgb), c2 = san(texture2D(tColor, uv2).rgb), c3 = san(texture2D(tColor, uv3).rgb);
        float k0 = cocPx(linZ(texture2D(tDepth, uv0).x), uv0), k1 = cocPx(linZ(texture2D(tDepth, uv1).x), uv1), k2 = cocPx(linZ(texture2D(tDepth, uv2).x), uv2), k3 = cocPx(linZ(texture2D(tDepth, uv3).x), uv3);
        float w0 = 1.0 / (1.0 + dot(c0, vec3(0.3))), w1 = 1.0 / (1.0 + dot(c1, vec3(0.3))), w2 = 1.0 / (1.0 + dot(c2, vec3(0.3))), w3 = 1.0 / (1.0 + dot(c3, vec3(0.3)));
        vec3 col = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / (w0 + w1 + w2 + w3);
        float coc = (k0 + k1 + k2 + k3) * 0.25;
        float kmin = min(min(k0, k1), min(k2, k3));
        coc = mix(coc, kmin, 0.5 * step(kmin, -1.0));
        gl_FragColor = vec4(col, clamp(coc, -uMaxCoc, uMaxCoc));
      }`, { tColor: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uFocus: { value: 5 }, uFocal: { value: 0.035 }, uAperture: { value: 0.01 }, uPxPerM: { value: 1000 }, uMaxCoc: { value: 10 }, uTilt: { value: 0 } });
    M_.bokeh = pass(/* glsl */`
      uniform sampler2D tPre; uniform vec2 uTexel; uniform float uMaxCoc; varying vec2 vUv;
      const float GA = 2.39996323;
      float hb(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      void main(){
        vec4 cen = texture2D(tPre, vUv);
        float rot = hb(gl_FragCoord.xy) * 6.2831853;
        float cc = cen.a, ca = abs(cc);
        vec3 acc = cen.rgb; float wsum = 1.0, fg = 0.0;
        for (int i = 1; i < NS; i++) {
          float fi = float(i);
          float r = sqrt(fi / float(NS)) * uMaxCoc;
          float th = fi * GA + rot;
          vec4 s = texture2D(tPre, vUv + vec2(cos(th), sin(th)) * r * uTexel);
          float sa = abs(s.a);
          float sz = s.a > cc ? min(sa, ca * 2.0 + 0.5) : sa;
          float m = smoothstep(r - 0.9, r + 0.3, sz);
          float lum = dot(s.rgb, vec3(0.3, 0.59, 0.11));
          float w = m * (1.0 + clamp(lum - 1.2, 0.0, 6.0) * 0.12 * step(2.0, sa));
          acc += s.rgb * w; wsum += w;
          if (s.a < 0.0) fg = max(fg, m * sa);
        }
        gl_FragColor = vec4(acc / wsum, max(ca, fg));
      }`, { tPre: { value: null }, uTexel: { value: new THREE.Vector2() }, uMaxCoc: { value: 10 } }, { NS: QUALITY.dofSamples });
    M_.comp = pass(DOF_COMMON + /* glsl */`
      uniform sampler2D tColor, tDepth, tBokeh; uniform float uHalf; varying vec2 vUv;
      void main(){
        vec3 sharp = san(texture2D(tColor, vUv).rgb);
        float c = abs(cocPx(linZ(texture2D(tDepth, vUv).x), vUv));
        vec4 b = texture2D(tBokeh, vUv);
        float blend = smoothstep(0.55, 1.5, max(c, b.a));
        gl_FragColor = vec4(mix(sharp, b.rgb, blend), 1.0);
      }`, { tColor: { value: null }, tDepth: { value: null }, tBokeh: { value: null }, uHalf: { value: 0.5 }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uFocus: { value: 5 }, uFocal: { value: 0.035 }, uAperture: { value: 0.01 }, uPxPerM: { value: 1000 }, uMaxCoc: { value: 10 }, uTilt: { value: 0 } });
    M_.copy = pass(SAN + 'uniform sampler2D tColor; varying vec2 vUv; void main(){ gl_FragColor = vec4(san(texture2D(tColor, vUv).rgb), 1.0); }', { tColor: { value: null } });
    M_.down = pass(/* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uFirst; varying vec2 vUv;
      vec3 s(vec2 o){ return texture2D(tSrc, vUv + o * uTexel).rgb; }
      void main(){
        vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2)), d = s(vec2(-2, 0)), e = s(vec2(0)), f = s(vec2(2, 0)), g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2));
        vec3 j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
        vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
        if (uFirst > 0.5) col = min(col, vec3(40.0));
        gl_FragColor = vec4(col, 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
    M_.up = pass(/* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      void main(){
        vec2 o = uTexel;
        vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
        c += (texture2D(tSrc, vUv + vec2(-o.x, 0)).rgb + texture2D(tSrc, vUv + vec2(o.x, 0)).rgb + texture2D(tSrc, vUv + vec2(0, -o.y)).rgb + texture2D(tSrc, vUv + vec2(0, o.y)).rgb) * 2.0;
        c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb;
        gl_FragColor = vec4(c / 16.0, 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    M_.up.blending = THREE.AdditiveBlending; M_.up.transparent = true;
    M_.final = pass(/* glsl */`
      uniform sampler2D tColor, tBloom, tDepth, tDrops;
      uniform mat4 uPrevVP, uInvVP;
      uniform vec2 uRes; uniform float uTime, uExposure, uBloom, uHalation, uVignette, uGrain, uCA, uDistort, uMB, uSat;
      uniform float uCCTV, uGlitch, uWipe, uWipeDir, uFade, uDrops, uLift, uSplit;
      varying vec2 vUv;
      float hsh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      const mat3 ACESIn = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 ACESOut = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      vec3 rrt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 aces(vec3 c){ c = ACESIn * c; c = rrt(c); c = ACESOut * c; return clamp(c, 0.0, 1.0); }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main(){
        vec2 uv = vUv;
        vec2 cc = uv - 0.5;
        float asp = uRes.x / uRes.y;
        float r2 = dot(cc * vec2(asp, 1.0), cc * vec2(asp, 1.0)) / (asp * asp * 0.25 + 0.25);
        uv = 0.5 + cc * (1.0 - uDistort * 0.25 + uDistort * r2 * 0.6);
        // CCTV: coarser pixels and a rolling interlace bar
        if (uCCTV > 0.0) {
          vec2 px = vec2(720.0, 720.0 / asp);
          uv = mix(uv, (floor(uv * px) + 0.5) / px, uCCTV);
          uv.x += (hsh(vec2(floor(uv.y * px.y), floor(uTime * 12.5))) - 0.5) * 0.0015 * uCCTV;
        }
        if (uGlitch > 0.0) {
          float row = floor(uv.y * 28.0 + floor(uTime * 24.0) * 3.7);
          float h = hsh(vec2(row, floor(uTime * 24.0)));
          if (h < uGlitch * 0.7) uv.x += (hsh(vec2(row, 7.0)) - 0.5) * 0.18 * uGlitch;
          if (hsh(vec2(floor(uTime * 30.0), 3.0)) < uGlitch * 0.4) uv.y += (hsh(vec2(floor(uTime * 30.0), 5.0)) - 0.5) * 0.06 * uGlitch;
        }
        // water drops on a lens dome refract the picture
        if (uDrops > 0.0) {
          vec4 d = texture2D(tDrops, uv * vec2(asp, 1.0) * 0.9 + vec2(0.0, uTime * 0.004));
          float m = smoothstep(0.35, 0.55, d.b);
          uv += (d.rg * 2.0 - 1.0) * 0.035 * m * uDrops;
        }
        // camera motion blur from depth reprojection
        float depth = texture2D(tDepth, uv).x;
        vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vec4 wp = uInvVP * ndc; wp /= wp.w;
        vec4 pp = uPrevVP * wp; pp.xy /= pp.w;
        vec2 vel = (uv - (pp.xy * 0.5 + 0.5)) * uMB;
        float vl = length(vel);
        if (vl > 0.05) vel *= 0.05 / vl;
        if (any(isnan(vel)) || any(isinf(vel))) vel = vec2(0.0);
        vec3 col = vec3(0.0);
        float jit = hsh(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5;
        for (int i = 0; i < 8; i++) { float t = (float(i) + 0.5 + jit) / 8.0 - 0.5; col += texture2D(tColor, uv + vel * t).rgb; }
        col /= 8.0;
        // radial chromatic aberration
        vec2 ca = (uv - 0.5) * uCA;
        col.r = mix(col.r, texture2D(tColor, uv + ca).r, 0.8);
        col.b = mix(col.b, texture2D(tColor, uv - ca).b, 0.8);
        // bloom and red halation around bright points
        vec3 bl = texture2D(tBloom, uv).rgb / 6.0;
        col = mix(col, bl, uBloom) + bl * vec3(1.0, 0.32, 0.12) * uHalation;
        col *= uExposure;
        col = aces(col);
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(col, col * vec3(0.9, 1.0, 1.08), (1.0 - smoothstep(0.0, 0.32, lum)) * 0.55 * uSplit);
        col = mix(col, col * vec3(1.05, 1.0, 0.92), smoothstep(0.4, 1.0, lum) * 0.45 * uSplit);
        col = mix(vec3(lum), col, uSat);
        col += uLift * vec3(0.006, 0.008, 0.012);
        if (uCCTV > 0.0) {
          float g = dot(col, vec3(0.3, 0.59, 0.11));
          g = pow(g, 0.85) * 1.25;
          g += (hsh(gl_FragCoord.xy * 0.5 + fract(uTime * 12.5) * 97.0) - 0.5) * 0.12;
          g *= 0.92 + 0.08 * sin(uv.y * uRes.y * 1.4);
          g *= 1.0 - 0.18 * smoothstep(0.0, 0.04, abs(fract(uv.y * 0.5 - uTime * 0.07) - 0.5) - 0.46);
          col = mix(col, vec3(g * 0.92, g, g * 0.95), uCCTV);
        }
        float vig = smoothstep(1.25, 0.25, length(cc * vec2(asp * 0.75, 1.0)) * 1.3);
        col *= mix(1.0, vig, uVignette);
        float gr = hsh(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5;
        col += gr * uGrain * (0.5 + 0.5 * (1.0 - lum));
        if (uGlitch > 0.0) { float ln = step(0.985 - uGlitch * 0.05, hsh(vec2(floor(uv.y * 160.0), floor(uTime * 20.0)))); col = mix(col, vec3(hsh(uv * 300.0 + uTime)), ln * uGlitch); }
        if (uWipe > 0.0) { float x = uWipeDir > 0.0 ? vUv.x : 1.0 - vUv.x; float c = mix(-0.45, 1.45, uWipe); float band = smoothstep(c - 0.32, c - 0.06, x) * (1.0 - smoothstep(c + 0.06, c + 0.32, x)); col *= 1.0 - band * 0.97; }
        col *= 1.0 - uFade;
        col = toSRGB(clamp(col, 0.0, 1.0));
        col += (hsh(gl_FragCoord.xy + 17.0) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }`, {
      tColor: { value: null }, tBloom: { value: null }, tDepth: { value: null }, tDrops: { value: TEX.drops },
      uPrevVP: { value: new THREE.Matrix4() }, uInvVP: { value: new THREE.Matrix4() },
      uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uExposure: { value: 1 }, uBloom: { value: 0.045 }, uHalation: { value: 0.03 },
      uVignette: { value: 0.35 }, uGrain: { value: 0.035 }, uCA: { value: 0.004 }, uDistort: { value: 0 }, uMB: { value: 1 }, uSat: { value: 1.04 },
      uCCTV: { value: 0 }, uGlitch: { value: 0 }, uWipe: { value: 0 }, uWipeDir: { value: 1 }, uFade: { value: 0 }, uDrops: { value: 0 }, uLift: { value: 1 }, uSplit: { value: 1 },
    });
    M_.filter = pass(FILTER_FS, {
      tLDR: { value: null }, tHDR: { value: null }, tBloom: { value: null }, tDepth: { value: null }, tHeat: { value: null }, tHeatDepth: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uFade: { value: 0 }, uExposure: { value: 1 }, uMode: { value: 0 }, uDay: U.uDay,
    });
    this.bloomLevels = 6;
  }

  setSize(w, h) {
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
    if (w === this.w && h === this.h && this.sceneRT) return;
    this.w = w; this.h = h;
    [this.sceneRT, this.reflRT, this.preRT, this.bokehRT, this.fullRT, this.ldrRT, this.heatRT, ...(this.bloom || [])].forEach(t => t && t.dispose());
    const depthTex = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    this.sceneRT = this.rt(w, h, { depthBuffer: true, depthTexture: depthTex, samples: QUALITY.msaa });
    const rw = Math.max(2, Math.floor(w * QUALITY.refl)), rh = Math.max(2, Math.floor(h * QUALITY.refl));
    this.reflRT = this.rt(rw, rh, { depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1);
    this.preRT = this.rt(hw, hh); this.bokehRT = this.rt(hw, hh);
    this.fullRT = this.rt(w, h);
    this.ldrRT = this.rt(w, h, { type: THREE.UnsignedByteType });
    this.heatRT = this.rt(hw, hh, { type: THREE.UnsignedByteType, depthBuffer: true, depthTexture: new THREE.DepthTexture(hw, hh, THREE.UnsignedIntType) });
    this.bloom = [];
    let bw = hw, bh = hh;
    for (let i = 0; i < this.bloomLevels; i++) { this.bloom.push(this.rt(Math.max(2, bw), Math.max(2, bh))); bw >>= 1; bh >>= 1; }
    U.uReflTexel.value.set(1 / rw, 1 / rh);
  }

  renderReflection(cam, planeY) {
    const rc = this.reflCam;
    rc.copy(cam, false);
    rc.layers.set(0);
    const n = _v1.set(0, 1, 0);
    const mirrorPos = _v2.set(0, planeY, 0);
    const camPos = _v3.setFromMatrixPosition(cam.matrixWorld);
    const rot = _m1.extractRotation(cam.matrixWorld);
    const view = V3().subVectors(mirrorPos, camPos);
    if (view.dot(n) > 0) { U.uReflOn.value = 0; return; }   // camera below the water line: nothing to mirror
    view.reflect(n).negate().add(mirrorPos);
    const look = V3(0, 0, -1).applyMatrix4(rot).add(camPos);
    const target = V3().subVectors(mirrorPos, look).reflect(n).negate().add(mirrorPos);
    rc.position.copy(view);
    rc.up.set(0, 1, 0).applyMatrix4(rot).reflect(n);
    rc.lookAt(target);
    rc.far = cam.far; rc.near = cam.near;
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(cam.projectionMatrix);
    const tm = U.uReflMat.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
    // oblique near plane so nothing below the water line leaks into the mirror
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, mirrorPos).applyMatrix4(rc.matrixWorldInverse);
    const cp = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = rc.projectionMatrix, q = new THREE.Vector4();
    q.x = (Math.sign(cp.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(cp.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0; q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    cp.multiplyScalar(2.0 / cp.dot(q));
    pm.elements[2] = cp.x; pm.elements[6] = cp.y; pm.elements[10] = cp.z + 1.0 - 0.003; pm.elements[14] = cp.w;
    rc.projectionMatrixInverse.copy(pm).invert();
    U.uReflOn.value = 1;
    renderer.setRenderTarget(this.reflRT);
    renderer.clear();
    renderer.render(scene, rc);
  }

  // Tagged bodies only, each in a flat material holding its temperature; the filter tests them against the scene depth.
  renderHeat(cam) {
    const mask = cam.layers.mask, auto = renderer.shadowMap.autoUpdate;
    cam.layers.set(LAYER_HEAT); renderer.shadowMap.autoUpdate = false;
    for (const o of HEAT) { o.userData.mat = o.material; o.material = heatMaterial(o.userData.heat); }
    renderer.setRenderTarget(this.heatRT);
    renderer.clear();
    renderer.render(scene, cam);
    for (const o of HEAT) o.material = o.userData.mat;
    cam.layers.mask = mask; renderer.shadowMap.autoUpdate = auto;
  }

  render(cam, P) {
    const M_ = this.mats;
    renderer.info.reset();
    const hold = P.hold && this.hasFrame;
    if (!hold) {
      cam.updateMatrixWorld();
      if (P.refl && QUALITY.refl > 0) this.renderReflection(cam, P.reflPlane || 0);
      else U.uReflOn.value = 0;
      updateSun(cam);
      renderer.setRenderTarget(this.sceneRT);
      renderer.clear();
      renderer.render(scene, cam);
      // depth of field
      const sensorW = 0.036 * (this.w >= this.h ? 1 : this.w / this.h);
      const f = P.focal / 1000, N = P.fstop, S = Math.max(P.focus, f * 1.5);
      const A = f / N;
      const halfW = this.w >> 1;
      const pxPerM = halfW / sensorW;
      const maxCoc = Math.min(14, Math.max(4, this.h / 1080 * 12));
      const cocInf = A * f / Math.max(S - f, 1e-3) * pxPerM;
      const zn = cam.near * 4;
      const cocNear = Math.abs(A * f * (zn - S) / (zn * Math.max(S - f, 1e-3))) * pxPerM;
      const dofOn = ((cocInf > 0.5 || cocNear > 0.8) && P.dof !== false) || P.tilt > 0;
      const setU = (u) => { u.uNear.value = cam.near; u.uFar.value = cam.far; u.uFocus.value = S; u.uFocal.value = f; u.uAperture.value = A; u.uPxPerM.value = pxPerM; u.uMaxCoc.value = maxCoc; u.uTilt.value = P.tilt || 0; };
      if (dofOn) {
        setU(M_.pre.uniforms);
        M_.pre.uniforms.tColor.value = this.sceneRT.texture; M_.pre.uniforms.tDepth.value = this.sceneRT.depthTexture;
        M_.pre.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
        FSQ.draw(M_.pre, this.preRT);
        M_.bokeh.uniforms.tPre.value = this.preRT.texture; M_.bokeh.uniforms.uTexel.value.set(1 / this.preRT.width, 1 / this.preRT.height); M_.bokeh.uniforms.uMaxCoc.value = maxCoc;
        FSQ.draw(M_.bokeh, this.bokehRT);
        setU(M_.comp.uniforms);
        M_.comp.uniforms.tColor.value = this.sceneRT.texture; M_.comp.uniforms.tDepth.value = this.sceneRT.depthTexture; M_.comp.uniforms.tBokeh.value = this.bokehRT.texture;
        FSQ.draw(M_.comp, this.fullRT);
      } else {
        M_.copy.uniforms.tColor.value = this.sceneRT.texture;
        FSQ.draw(M_.copy, this.fullRT);
      }
      // bloom chain
      let src = this.fullRT;
      for (let i = 0; i < this.bloom.length; i++) {
        M_.down.uniforms.tSrc.value = src.texture; M_.down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height); M_.down.uniforms.uFirst.value = i === 0 ? 1 : 0;
        FSQ.draw(M_.down, this.bloom[i]);
        src = this.bloom[i];
      }
      for (let i = this.bloom.length - 1; i > 0; i--) {
        M_.up.uniforms.tSrc.value = this.bloom[i].texture; M_.up.uniforms.uTexel.value.set(1 / this.bloom[i].width, 1 / this.bloom[i].height);
        renderer.autoClear = false;
        FSQ.draw(M_.up, this.bloom[i - 1]);
        renderer.autoClear = true;
      }
      // motion blur matrices
      this.curVP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      this.invVP.copy(this.curVP).invert();
      if (P.cut || !this.hasFrame) this.prevVP.copy(this.curVP);
      M_.final.uniforms.uPrevVP.value.copy(this.prevVP);
      M_.final.uniforms.uInvVP.value.copy(this.invVP);
      this.prevVP.copy(this.curVP);
      this.hasFrame = true;
    }
    const F = M_.final.uniforms;
    F.tColor.value = this.fullRT.texture; F.tBloom.value = this.bloom[0].texture; F.tDepth.value = this.sceneRT.depthTexture;
    F.uRes.value.set(this.w, this.h);
    F.uTime.value = P.time; F.uExposure.value = P.exposure; F.uBloom.value = P.bloom; F.uHalation.value = P.halation;
    F.uVignette.value = P.vignette; F.uGrain.value = P.grain; F.uCA.value = P.ca; F.uDistort.value = P.distort;
    F.uMB.value = hold ? 0 : P.mb; F.uSat.value = P.sat; F.uCCTV.value = P.cctv; F.uGlitch.value = P.glitch;
    F.uWipe.value = P.wipe; F.uWipeDir.value = P.wipeDir; F.uFade.value = P.fade; F.uDrops.value = P.drops;
    F.uLift.value = P.lift ?? 1; F.uSplit.value = P.split ?? 1;
    const mode = P.filter || 0;
    FSQ.draw(M_.final, mode ? this.ldrRT : null);
    if (mode) {
      if (mode === FILTER_ID.thermal && !hold) this.renderHeat(cam);
      const X = M_.filter.uniforms;
      X.tLDR.value = this.ldrRT.texture; X.tHDR.value = this.fullRT.texture; X.tBloom.value = this.bloom[0].texture; X.tDepth.value = this.sceneRT.depthTexture;
      X.tHeat.value = this.heatRT.texture; X.tHeatDepth.value = this.heatRT.depthTexture;
      X.uRes.value.set(this.w, this.h); X.uTime.value = P.time; X.uNear.value = cam.near; X.uFar.value = cam.far;
      X.uFade.value = P.fade; X.uExposure.value = P.exposure; X.uMode.value = mode;
      FSQ.draw(M_.filter, null);
    }
    if (P.debugView === 'refl') { M_.copy.uniforms.tColor.value = this.reflRT.texture; FSQ.draw(M_.copy, null); }
  }
}
