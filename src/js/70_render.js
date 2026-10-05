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
const DOF_COMMON = SAN + /* glsl */`
#include <packing>
uniform float uNear, uFar, uFocus, uFocal, uAperture, uPxPerM, uMaxCoc;
float linZ(float d){ return -perspectiveDepthToViewZ(d, uNear, uFar); }
float cocPx(float z){ return uAperture * uFocal * (z - uFocus) / (max(z, 1e-3) * max(uFocus - uFocal, 1e-3)) * uPxPerM; }
`;

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
        float k0 = cocPx(linZ(texture2D(tDepth, uv0).x)), k1 = cocPx(linZ(texture2D(tDepth, uv1).x)), k2 = cocPx(linZ(texture2D(tDepth, uv2).x)), k3 = cocPx(linZ(texture2D(tDepth, uv3).x));
        float w0 = 1.0 / (1.0 + dot(c0, vec3(0.3))), w1 = 1.0 / (1.0 + dot(c1, vec3(0.3))), w2 = 1.0 / (1.0 + dot(c2, vec3(0.3))), w3 = 1.0 / (1.0 + dot(c3, vec3(0.3)));
        vec3 col = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / (w0 + w1 + w2 + w3);
        float coc = (k0 + k1 + k2 + k3) * 0.25;
        float kmin = min(min(k0, k1), min(k2, k3));
        coc = mix(coc, kmin, 0.5 * step(kmin, -1.0));
        gl_FragColor = vec4(col, clamp(coc, -uMaxCoc, uMaxCoc));
      }`, { tColor: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uFocus: { value: 5 }, uFocal: { value: 0.035 }, uAperture: { value: 0.01 }, uPxPerM: { value: 1000 }, uMaxCoc: { value: 10 } });
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
        float c = abs(cocPx(linZ(texture2D(tDepth, vUv).x)));
        vec4 b = texture2D(tBokeh, vUv);
        float blend = smoothstep(0.55, 1.5, max(c, b.a));
        gl_FragColor = vec4(mix(sharp, b.rgb, blend), 1.0);
      }`, { tColor: { value: null }, tDepth: { value: null }, tBokeh: { value: null }, uHalf: { value: 0.5 }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uFocus: { value: 5 }, uFocal: { value: 0.035 }, uAperture: { value: 0.01 }, uPxPerM: { value: 1000 }, uMaxCoc: { value: 10 } });
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
      uniform float uCCTV, uGlitch, uWipe, uWipeDir, uFade, uDrops, uLift;
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
        col = mix(col, col * vec3(0.9, 1.0, 1.08), (1.0 - smoothstep(0.0, 0.32, lum)) * 0.55);
        col = mix(col, col * vec3(1.05, 1.0, 0.92), smoothstep(0.4, 1.0, lum) * 0.45);
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
      uCCTV: { value: 0 }, uGlitch: { value: 0 }, uWipe: { value: 0 }, uWipeDir: { value: 1 }, uFade: { value: 0 }, uDrops: { value: 0 }, uLift: { value: 1 },
    });
    this.bloomLevels = 6;
  }

  setSize(w, h) {
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
    if (w === this.w && h === this.h && this.sceneRT) return;
    this.w = w; this.h = h;
    [this.sceneRT, this.reflRT, this.preRT, this.bokehRT, this.fullRT, ...(this.bloom || [])].forEach(t => t && t.dispose());
    const depthTex = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    this.sceneRT = this.rt(w, h, { depthBuffer: true, depthTexture: depthTex, samples: QUALITY.msaa });
    const rw = Math.max(2, Math.floor(w * QUALITY.refl)), rh = Math.max(2, Math.floor(h * QUALITY.refl));
    this.reflRT = this.rt(rw, rh, { depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1);
    this.preRT = this.rt(hw, hh); this.bokehRT = this.rt(hw, hh);
    this.fullRT = this.rt(w, h);
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

  render(cam, P) {
    const M_ = this.mats;
    renderer.info.reset();
    const hold = P.hold && this.hasFrame;
    if (!hold) {
      cam.updateMatrixWorld();
      if (P.refl && QUALITY.refl > 0) this.renderReflection(cam, P.reflPlane || 0);
      else U.uReflOn.value = 0;
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
      const dofOn = (cocInf > 0.5 || cocNear > 0.8) && P.dof !== false;
      const setU = (u) => { u.uNear.value = cam.near; u.uFar.value = cam.far; u.uFocus.value = S; u.uFocal.value = f; u.uAperture.value = A; u.uPxPerM.value = pxPerM; u.uMaxCoc.value = maxCoc; };
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
    FSQ.draw(M_.final, null);
    if (P.debugView === 'refl') { M_.copy.uniforms.tColor.value = this.reflRT.texture; FSQ.draw(M_.copy, null); }
  }
}
