/* ============================================================
   Day and night: the same street at 08:42 under a low morning sun
   in a passing shower, or at 19:42 in the blue hour. One switch
   moves the lights, the sky, the fog, the grade and everything
   that glows; the shaders stay the same programs either way.
   ============================================================ */

const DAY = { on: false, env: {}, glow: 1 };
const NIGHT_LOOK = { hemi: [0x3d5793, 0x0e0c0a, 2.8], sun: [0x8090c0, 0.12], fog: [0x0c111c, 0.0105] };
const DAY_LOOK = { hemi: [0xb9d0ef, 0x5d5448, 1.1], sun: [0xffeacc, 5.2], fog: [0x9fb2c6, 0.0042] };
// Point lights by day, as a share of their night strength: shops stay lit, street lamps go out.
const LIGHT_DAY = { pilotis: 0.3, kissaten: 0.35, ramen: 0.35, conbini: 0.4, lampE: 0, lampW: 0, vending: 0.4, izakaya: 0.35, alley: 0.5, soba: 0.35, pharmacy: 0.4, laundry: 0.4, koban: 0.6, spot: 0.3 };

// Unlit materials that glow at night, and how bright each stays in daylight.
function glowTable() {
  return [
    [M.signs, 0.42], [M.signsHot, 0.38], [M.signsDim, 0.6], [M.interior, 0.5], [M.glow, 0.35], [M.lamp, 0.03], [M.vend, 0.6], [M.trainSide, 0.65],
    [M.glowSingle, 0.4], [M.glowSingleW, 0.6], [M.glowSingleL, 0.02], [M.glowSingleC, 0.25], [M.backPool, 0],
    [TRAFFIC.mats.head, 0.25], [TRAFFIC.mats.tail, 0.6], [TRAFFIC.mats.roof, 0.45], [TRAFFIC.mats.cabin, 0.6], [TRAFFIC.vacancy.material, 0.6],
    [TRAFFIC.bikeLamp.material, 0.2], [TRAFFIC.pools.material, 0], [FX.lanterns.material, 0.35], [FX.drums.material, 0.7],
  ].filter(([m]) => m);
}

function setDay(on) {
  DAY.on = on;
  const L = on ? DAY_LOOK : NIGHT_LOOK, sun = LIGHTS.sun;
  U.uDay.value = on ? 1 : 0;
  DAY.glow = on ? 0.45 : 1;
  for (const [m, k] of DAY.glows || (DAY.glows = glowTable())) { m.userData.c0 = m.userData.c0 || m.color.clone(); m.color.copy(m.userData.c0).multiplyScalar(on ? k : 1); }
  for (const id in LIGHT_DAY) { const l = LIGHTS[id]; if (!l) continue; l.userData.base = l.userData.base ?? l.intensity; l.intensity = l.userData.base * (on ? LIGHT_DAY[id] : 1); }
  LIGHTS.hemi.color.set(L.hemi[0]); LIGHTS.hemi.groundColor.set(L.hemi[1]); LIGHTS.hemi.intensity = L.hemi[2];
  sun.color.set(L.sun[0]); sun.intensity = L.sun[1]; sun.shadow.intensity = on ? 1 : 0;
  if (!on) { sun.position.set(-40, 80, -60); sun.target.position.set(0, 0, 0); }
  scene.fog.color.set(L.fog[0]); scene.fog.density = L.fog[1];
  U.uFogColor.value.copy(scene.fog.color); U.uFogDensity.value = scene.fog.density;
  U.uLFGain.value = on ? 0.12 : 1;
  FX.halos.material.uniforms.uGain.value = on ? 0 : 1;
  FX.sigHalo.material.uniforms.uGain.value = on ? 0.15 : 1;
  FX.cone.material.uniforms.uK.value = on ? 0 : 0.05;
  FX.rain.material.uniforms.uSky.value.set(...(on ? [0.42, 0.46, 0.52] : [0.006, 0.008, 0.013]));
  FX.steam.material.uniforms.uAmb.value.set(...(on ? [0.3, 0.32, 0.35] : [0, 0, 0]));
  // by day the sun falls on everything; at night only he takes shadows, from his sign
  scene.traverse(o => { if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial) return; if (o.userData.rs0 === undefined) o.userData.rs0 = o.receiveShadow; o.receiveShadow = on || o.userData.rs0; });
  const key = on ? 'day' : 'night';
  scene.environment = DAY.env[key] || (DAY.env[key] = captureEnvironment());
  scene.environmentIntensity = on ? 0.6 : 0.32;
  UI.onDay && UI.onDay(on);
}

// Seconds since midnight for world time T: the same minute, by night or by day.
const clockAt = T => (DAY.on ? 8 : 19) * 3600 + 42 * 60 + T;

// The sun's shadow map holds what moves (people, cars, him) and the posts, in a square that follows the camera;
// the blocks are already in the baked map. Snapped to its texels so edges hold still while the camera moves.
const _sunView = new THREE.Matrix4().lookAt(SUN.dir, V3(), V3(0, 1, 0)), _sunInv = _sunView.clone().invert();
function updateSun(cam) {
  if (!DAY.on) return;
  const sun = LIGHTS.sun, sc = sun.shadow.camera;
  const R = Math.ceil(clamp(22 + cam.position.y * 0.8, 24, 140) / 8) * 8;
  const f = _v1.set(0, 0, -1).applyQuaternion(cam.quaternion).setY(0);
  if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
  const c = _v2.copy(cam.position).setY(0).addScaledVector(f.normalize(), R * 0.6).applyMatrix4(_sunInv);
  const texel = 2 * R / sun.shadow.mapSize.x;
  c.x = Math.round(c.x / texel) * texel; c.y = Math.round(c.y / texel) * texel;
  c.applyMatrix4(_sunView);
  if (sc.right !== R) { sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.updateProjectionMatrix(); }
  sun.target.position.copy(c); sun.position.copy(c).addScaledVector(SUN.dir, 200);
  sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
  sun.shadow.needsUpdate = true;
}

// Poles and lamp posts throw their thin shadows across the street by day. Boxes drawn only into the sun's map.
function buildSunProxies() {
  const b = new Batch(M.blackout);
  for (const c of COLLIDERS) if (c.thin) b.add(G.box, boxM(c.min.x, c.min.y, c.min.z, c.max.x, c.max.y, c.max.z));
  const m = b.build();
  m.castShadow = true; m.geometry.drawRange.count = 0;
  m.onBeforeShadow = (r, o, cam, sc) => { if (sc === LIGHTS.sun.shadow.camera) o.geometry.drawRange.count = Infinity; };
  m.onAfterShadow = (r, o) => { o.geometry.drawRange.count = 0; };
  scene.add(m);
}
