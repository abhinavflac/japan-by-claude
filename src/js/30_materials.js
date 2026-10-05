/* ============================================================
   Materials: height fog, baked street light field, wet ground,
   wind, atlas instancing, glass, procedural windows
   ============================================================ */

// Shared uniforms (same objects are handed to every patched program).
const U = {
  uTime: { value: 0 },
  uLF: { value: null },
  uLFRect: { value: new THREE.Vector4(-64, -200, 128, 340) },
  uLFGain: { value: 1.0 },
  uRefl: { value: null },
  uReflMat: { value: new THREE.Matrix4() },
  uReflOn: { value: 0 },
  uReflTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
  uPuddle: { value: null },
  uRain: { value: 0.55 },
  uPxWorld: { value: 0.001 },
  uFogColor: { value: new THREE.Color() },
  uFogDensity: { value: 0.011 },
  uCamPos: { value: new THREE.Vector3() },
  uFP0: { value: new THREE.Vector4(4.1, -2.6, 0.8, 1.75) },   // a puddle on the pavement in front of him
  uFP1: { value: new THREE.Vector4(-2.05, 3.6, 0.95, 1.5) },   // and one in the west gutter, across from him
};

/* ---------- height fog with warm city haze near the ground ---------- */
const FOG_FN = /* glsl */`
float hFogAmount(vec3 wp, vec3 cp, float density) {
  vec3 ray = wp - cp;
  float dist = length(ray);
  const float hb = 0.045;
  float k = exp(-hb * max(cp.y, -2.0));
  float dy = ray.y;
  float integ = abs(dy) > 0.05 ? k * (1.0 - exp(-hb * dy)) / (hb * dy) : k;
  return 1.0 - exp(-density * dist * integ);
}
vec3 hFogColor(vec3 base, vec3 wp) {
  return mix(base * vec3(1.22, 1.0, 0.84), base, smoothstep(0.0, 32.0, wp.y));
}`;

THREE.ShaderChunk.fog_pars_vertex = `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldPosition;
#endif`;
THREE.ShaderChunk.fog_vertex = `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  {
    vec4 fwp = vec4( transformed, 1.0 );
    #ifdef USE_BATCHING
      fwp = batchingMatrix * fwp;
    #endif
    #ifdef USE_INSTANCING
      fwp = instanceMatrix * fwp;
    #endif
    vFogWorldPosition = ( modelMatrix * fwp ).xyz;
  }
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorldPosition;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${FOG_FN}
#endif`;
THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogF = hFogAmount( vFogWorldPosition, cameraPosition, fogDensity );
  #else
    float fogF = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, hFogColor( fogColor, vFogWorldPosition ), fogF );
#endif`;

/* ---------- patch snippets ---------- */
const GLSL_HASH = /* glsl */`
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

const LF_PARS = /* glsl */`
uniform sampler2D uLF; uniform vec4 uLFRect; uniform float uLFGain; uniform float uLFH, uLFS;
vec4 sampleLF(vec3 wp){
  vec2 uv = (wp.xz - uLFRect.xy) / uLFRect.zw;
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return vec4(0.0, 0.0, 0.0, 1.0);
  return texture2D(uLF, uv);
}`;
const LF_APPLY = /* glsl */`
#ifdef USE_FOG
{
  vec4 lfs = sampleLF(vFogWorldPosition);
  float hf = exp(-max(vFogWorldPosition.y, 0.0) * uLFH);
  reflectedLight.indirectDiffuse += lfs.rgb * lfs.rgb * uLFGain * hf * BRDF_Lambert( material.diffuseColor ) * uLFS;
}
#endif`;

const WET_PARS = /* glsl */`
uniform sampler2D uRefl; uniform mat4 uReflMat; uniform float uReflOn; uniform vec2 uReflTexel;
uniform sampler2D uPuddle; uniform float uRain; uniform float uTime; uniform vec4 uFP0, uFP1; uniform float uWetAmt, uWetTh;
vec2 wetRipples(vec2 p, float t){
  vec2 acc = vec2(0.0);
  vec2 ip = floor(p);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = ip + vec2(float(i), float(j));
    float hh = h12(c);
    float per = 1.2 + hh * 1.7;
    float tt = t / per + hh * 7.0;
    float k = floor(tt);
    float age = fract(tt) * per;
    float on = step(h12(c + k * 0.731), uRain * 0.8);
    vec2 ctr = c + vec2(h12(c + k * 1.37), h12(c + k * 2.71)) * 0.8 + 0.1;
    vec2 d = p - ctr; float r = length(d);
    float x = r - age * 0.62;
    float w = sin(x * 36.0) * exp(-x * x * 80.0) * exp(-age * 2.4) * on;
    acc += d / max(r, 1e-3) * w;
  }
  return acc;
}`;
// Road paint computed from world position (crisp at any distance).
const MARKINGS = /* glsl */`
float band(float x, float a, float b){ float w = fwidth(x) * 0.75 + 1e-4; return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
float roadPaint(vec2 p){
  float m = 0.0;
  float ax = abs(p.x);
  bool mainSt = ax < 3.25 && (p.y > -36.5 || p.y < -43.5);
  bool crossSt = p.y < -36.5 && p.y > -43.5;
  if (mainSt) {
    bool nearX = (p.y < -30.0 && p.y > -50.0);
    if (!nearX) {
      m += band(ax, 2.86, 3.0);
      m += band(ax, 0.0, 0.075) * step(fract(p.y / 9.0), 0.55);
    }
    // crosswalk stripes (ladder without rails): bars along z, repeating across x
    if ((p.y < -32.0 && p.y > -36.0) || (p.y < -44.0 && p.y > -48.0)) m += step(0.5, fract((p.x + 3.25) / 0.9)) * step(0.15, 3.25 - ax);
    // stop lines
    if (p.x < 0.0) m += band(p.y, -31.25, -30.8);
    if (p.x > 0.0) m += band(p.y, -49.2, -48.75);
  }
  if (crossSt) {
    float az = abs(p.y + 40.0);
    if (ax > 9.5) { m += band(az, 3.06, 3.2) + band(az, 0.0, 0.075) * step(fract(p.x / 9.0), 0.55); }
    if (ax > 4.0 && ax < 8.0) m += step(0.5, fract((p.y + 43.5) / 0.9)) * step(0.15, 3.5 - az);
    if (p.y < -40.0) m += band(p.x, -9.4, -8.95);
    if (p.y > -40.0) m += band(p.x, 8.95, 9.4);
  }
  return clamp(m, 0.0, 1.0);
}`;

const WET_MAP = /* glsl */`
  vec2 wxz = vFogWorldPosition.xz;
  vec4 pn = texture2D(uPuddle, wxz * 0.08);
  vec4 pn2 = texture2D(uPuddle, wxz * 0.021 + 0.37);
  vec4 lfw = sampleLF(vFogWorldPosition);
  float skyVis = lfw.a;
  float pm = pn.r * 0.62 + pn2.g * 0.38;
  #ifdef WET_GUTTER
    pm += smoothstep(2.55, 3.15, abs(wxz.x)) * step(abs(wxz.x), 3.25) * 0.16;
  #endif
  pm = max(pm, (1.0 - smoothstep(0.55, 1.0, length((wxz - uFP0.xy) / uFP0.zw))) * 1.3);
  pm = max(pm, (1.0 - smoothstep(0.55, 1.0, length((wxz - uFP1.xy) / uFP1.zw))) * 1.3);
  float puddle = smoothstep(uWetTh, uWetTh + 0.05, pm) * skyVis;
  float wetv = clamp(uWetAmt + (pn2.b - 0.5) * 0.4, 0.0, 1.0) * mix(0.15, 1.0, skyVis);
  #ifdef WET_PAINT
    float paint = roadPaint(wxz) * (0.82 + 0.18 * pn.b);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.62, 0.6), paint);
  #endif
  diffuseColor.rgb *= mix(1.0, 0.58, wetv);
  diffuseColor.rgb *= mix(1.0, 0.42, puddle);
`;
const WET_ROUGH = /* glsl */`
  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.32, wetv);
  roughnessFactor = mix(roughnessFactor, 0.03, puddle);
`;
const WET_NORMAL = /* glsl */`
  normal = normalize(mix(normal, nonPerturbedNormal, clamp(puddle * 0.95 + wetv * 0.25, 0.0, 1.0)));
  {
    vec2 rg = wetRipples(wxz * 3.1, uTime) * puddle + wetRipples(wxz * 1.6 + 3.1, uTime * 0.83) * puddle * 0.5;
    normal = normalize(normal + (viewMatrix * vec4(-rg.x, 0.0, -rg.y, 0.0)).xyz * 0.32);
  }
`;
const WET_REFL = /* glsl */`
  {
    vec4 rp = uReflMat * vec4(vFogWorldPosition, 1.0);
    vec2 ruv = rp.xy / rp.w;
    vec2 dist = normal.xy - nonPerturbedNormal.xy;
    ruv += dist * (0.035 + 0.05 * puddle);
    float NoV = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    float fres = max(0.025 + 0.975 * pow(1.0 - NoV, 5.0), puddle * 0.32);
    float rough = clamp(roughnessFactor, 0.0, 1.0);
    float lod = clamp(rough * 5.5, 0.0, 4.0);
    float stretch = (0.8 + 12.0 * rough) * (0.5 + (1.0 - NoV) * 1.8);
    vec3 refl = vec3(0.0); float ws = 0.0;
    for (int k = -3; k <= 3; k++) {
      float fk = float(k); float wk = exp(-fk * fk * 0.22);
      refl += textureLod(uRefl, ruv + vec2(0.0, fk * stretch * uReflTexel.y * 2.0), lod).rgb * wk; ws += wk;
    }
    refl /= ws;
    if (any(isnan(refl)) || any(isinf(refl))) refl = vec3(0.0);
    refl = min(refl, vec3(24.0));
    float ramt = mix(0.8 * wetv, 1.0, puddle) * uReflOn;
    outgoingLight += refl * fres * ramt * mix(1.0, 0.7, rough) * 1.25;
  }
`;

// opts: { lf, lfStrength, lfHeight, wet:{amt,th,gutter,paint}, wind:{amp,seed}, uvInst, cable, glass:{spec} }
// Only structural switches go into the program key; numbers travel as uniforms so programs are shared.
function patchStd(m, opts = {}) {
  const o = { lf: true, lfStrength: 1, lfHeight: 0.3, ...opts };
  const key = { lf: !!o.lf, wet: o.wet ? { g: !!o.wet.gutter, p: !!o.wet.paint } : 0, wind: !!o.wind, uvInst: !!o.uvInst, cable: !!o.cable, glass: !!o.glass };
  m.customProgramCacheKey = () => 'p:' + JSON.stringify(key);
  const own = {
    uLFH: { value: o.lfHeight }, uLFS: { value: o.lfStrength },
    uWetAmt: { value: o.wet ? o.wet.amt : 0 }, uWetTh: { value: o.wet ? o.wet.th : 1 },
    uWindAmp: { value: o.wind ? (o.wind.amp || 0.04) : 0 }, uWindSeed: { value: o.wind ? (o.wind.seed || 0) : 0 },
    uGlassSpec: { value: o.glass ? (o.glass.spec || 1) : 1 },
  };
  m.userData.own = own;
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = U.uTime;
    s.uniforms.uLF = U.uLF; s.uniforms.uLFRect = U.uLFRect; s.uniforms.uLFGain = U.uLFGain;
    Object.assign(s.uniforms, own);
    let vs = s.vertexShader, fs = s.fragmentShader;
    const isLit = fs.includes('#include <lights_fragment_end>');
    fs = fs.replace('#include <common>', '#include <common>\n' + GLSL_HASH + LF_PARS + '\nuniform float uTime;\nuniform float uGlassSpec;\n');
    if (o.lf && isLit) fs = fs.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + LF_APPLY);
    if (o.wet) {
      Object.assign(s.uniforms, { uRefl: U.uRefl, uReflMat: U.uReflMat, uReflOn: U.uReflOn, uReflTexel: U.uReflTexel, uPuddle: U.uPuddle, uRain: U.uRain, uFP0: U.uFP0, uFP1: U.uFP1 });
      let defs = '';
      if (o.wet.gutter) defs += '#define WET_GUTTER\n';
      if (o.wet.paint) defs += '#define WET_PAINT\n';
      fs = fs.replace('uniform float uTime;\n', defs + WET_PARS.replace('uniform float uTime;', '') + (o.wet.paint ? MARKINGS : '') + '\nuniform float uTime;\n');
      fs = fs.replace('#include <map_fragment>', '#include <map_fragment>\n' + WET_MAP);
      fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + WET_ROUGH);
      fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + WET_NORMAL);
      fs = fs.replace('#include <opaque_fragment>', WET_REFL + '\n#include <opaque_fragment>');
    }
    if (o.wind) {
      vs = vs.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWindAmp, uWindSeed;\n');
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float sway = pow(clamp(1.0 - uv.y, 0.0, 1.0), 1.3);
          vec4 wwp = modelMatrix * vec4(position, 1.0);
          float ph = wwp.x * 0.7 + wwp.z * 0.5 + uWindSeed;
          transformed.z += (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 3.1 + ph * 2.3 + position.x * 6.0) * 0.4) * uWindAmp * sway;
        }`);
    }
    if (o.uvInst) {
      vs = vs.replace('#include <common>', '#include <common>\nattribute vec4 aUV;\n');
      vs = vs.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = aUV.xy + vMapUv * aUV.zw;\n#endif\n#ifdef USE_EMISSIVEMAP\nvEmissiveMapUv = aUV.xy + vEmissiveMapUv * aUV.zw;\n#endif');
    }
    if (o.cable) {
      s.uniforms.uPxWorld = U.uPxWorld;
      vs = vs.replace('#include <common>', '#include <common>\nuniform float uPxWorld;\n');
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
        { float cd = -(modelViewMatrix * vec4(position, 1.0)).z; transformed += normal * max(0.0, uPxWorld * cd * 0.8 - 0.009); }`);
    }
    if (o.glass) fs = fs.replace('#include <premultiplied_alpha_fragment>', 'gl_FragColor.rgb = gl_FragColor.rgb * gl_FragColor.a + totalSpecular * (1.0 - gl_FragColor.a) * uGlassSpec;');
    s.vertexShader = vs; s.fragmentShader = fs;
  };
  return m;
}

function std(params, opts) { return patchStd(new THREE.MeshStandardMaterial(params), opts); }
function basic(params) { return new THREE.MeshBasicMaterial(params); }
function hdr(r, g, b) { return new THREE.Color(r, g, b); }
// sRGB hex scaled into HDR (linear) range
function hdrHex(hex, k) { const c = new THREE.Color(hex); return c.multiplyScalar(k); }

const M = {};
function buildBaseMaterials() {
  M.asphalt = std({ map: TEX.asphalt, normalMap: TEX.asphaltN, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.9, envMapIntensity: 0.04 },
    { wet: { amt: 0.9, th: 0.53, gutter: true, paint: true }, lfStrength: 1.0 });
  M.asphaltPlain = std({ map: TEX.asphalt, normalMap: TEX.asphaltN, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.9, envMapIntensity: 0.04, color: 0xd8d8d8 },
    { wet: { amt: 0.85, th: 0.6 } });
  M.pavers = std({ map: TEX.pavers, normalMap: TEX.paversN, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.88, envMapIntensity: 0.05 },
    { wet: { amt: 0.72, th: 0.67 } });
  M.tactile = std({ map: TEX.tactile, normalMap: TEX.tactileN, roughness: 0.6, envMapIntensity: 0.06 }, { wet: { amt: 0.6, th: 0.8 } });
  M.curb = std({ map: TEX.granite, roughness: 0.75, color: 0xcfcfcf, envMapIntensity: 0.08 }, { wet: { amt: 0.7, th: 0.9 } });
  M.concreteWet = std({ map: TEX.concrete, roughness: 0.92, color: 0x9a9894, envMapIntensity: 0.05 }, { wet: { amt: 0.7, th: 0.63 } });
  M.gravel = std({ map: TEX.gravel, roughness: 0.95, envMapIntensity: 0.2 }, { wet: { amt: 0.6, th: 0.95 } });
  M.concrete = std({ map: TEX.concrete, roughness: 0.92, vertexColors: true });
  M.roof = std({ map: TEX.roof, roughness: 0.95, vertexColors: true, envMapIntensity: 0.3 }, { lfHeight: 0.12 });
  M.paint = std({ roughness: 0.72, vertexColors: true, envMapIntensity: 0.6 });
  M.paintGloss = std({ roughness: 0.35, vertexColors: true, envMapIntensity: 0.9 });
  M.metal = std({ roughness: 0.42, metalness: 0.65, vertexColors: true, envMapIntensity: 1.0 });
  M.wood = std({ map: TEX.wood, roughness: 0.78, vertexColors: true });
  M.shutter = std({ map: TEX.shutter, roughness: 0.55, metalness: 0.4, vertexColors: true });
  M.cable = std({ color: 0x0b0b0c, roughness: 0.45, metalness: 0.1, envMapIntensity: 0.8 }, { cable: true, lf: false });
  M.rubber = std({ color: 0x111112, roughness: 0.8 });
  M.glass = std({ color: 0x0c1014, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.16, premultipliedAlpha: true, depthWrite: false, envMapIntensity: 1.6 },
    { glass: { spec: 1.0 }, lf: false });
  M.glassDark = std({ color: 0x05070a, roughness: 0.06, metalness: 0.0, envMapIntensity: 1.4 }, { lf: false });
  M.glow = basic({ vertexColors: true, toneMapped: false });
  M.blackout = basic({ color: 0x020203 });
}

/* ---------- procedural windows for back faces and the distant city ---------- */
function windowedMaterial(instanced) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0, envMapIntensity: 0.4, vertexColors: !instanced });
  m.customProgramCacheKey = () => 'win' + (instanced ? 'I' : 'M');
  m.onBeforeCompile = (s) => {
    s.uniforms.uLF = U.uLF; s.uniforms.uLFRect = U.uLFRect; s.uniforms.uLFGain = U.uLFGain;
    s.uniforms.uLFH = { value: 0.3 }; s.uniforms.uLFS = { value: 1.0 };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aWall;
        varying vec4 vWall;
        varying float vRoof;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 S = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          float wu = abs(normal.x) > 0.5 ? (position.z + 0.5) * S.z : (position.x + 0.5) * S.x;
          vWall = vec4(wu, position.y * S.y, fract(float(gl_InstanceID) * 0.61803 + 0.17), 0.0);
        #else
          vWall = aWall;
        #endif
        vRoof = step(0.5, normal.y);`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        ${GLSL_HASH}
        ${LF_PARS}
        varying vec4 vWall;
        varying float vRoof;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 winEmit = vec3(0.0);
        float winMask = 0.0;
        {
          float seed = vWall.z;
          float fh = 2.9 + fract(seed * 7.3) * 0.5;
          float cw = 2.3 + fract(seed * 13.1) * 1.9;
          vec2 g = vec2(vWall.x / cw, (vWall.y - 0.9) / fh);
          vec2 cell = floor(g), f = fract(g);
          float ww = 0.55 + fract(seed * 3.7) * 0.25;
          float inWin = step(0.5 - ww * 0.5, f.x) * step(f.x, 0.5 + ww * 0.5) * step(0.30, f.y) * step(f.y, 0.86) * step(0.0, cell.y) * (1.0 - vRoof);
          float hh = h12(cell + seed * 91.7);
          float litP = 0.22 + fract(seed * 5.9) * 0.3;
          float lit = step(hh, litP) * inWin;
          vec3 warm = vec3(1.0, 0.66, 0.36), cool = vec3(0.70, 0.82, 1.0);
          vec3 wc = mix(warm, cool, step(0.58, h12(cell * 1.7 + seed)));
          float br = 0.35 + 0.9 * h12(cell + 5.1);
          float curtain = step(0.55, h12(cell + 9.3));
          float pattern = mix(1.0, 0.45 + 0.55 * step(0.5, fract(f.x * 9.0)), curtain);
          winEmit = wc * br * lit * pattern * 1.35;
          winMask = inWin;
          float band = smoothstep(0.96, 1.0, f.y) * (1.0 - vRoof);
          diffuseColor.rgb *= 1.0 - band * 0.3;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.03, 0.04), inWin);
          diffuseColor.rgb *= mix(1.0, 0.55 + 0.3 * h12(floor(vWall.xy * 0.5) + seed), vRoof);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.12, winMask);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += winEmit;`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + LF_APPLY.replace('LF_HEIGHT', '0.3').replace('LF_STRENGTH', '1.0'));
  };
  return m;
}
