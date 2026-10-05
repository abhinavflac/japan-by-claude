/* ============================================================
   Boot, the frame loop, and hooks for automated stills
   ============================================================ */

const BUILT = [];
let pipeline = null;
const STATE = { ready: false, began: false, lastCctv: -1, frameTimes: [], realT: 0 };

function buildACUnits() {
  const c = makeCanvas(128, 96), g = c.getContext('2d');
  g.fillStyle = '#d9d6cc'; g.fillRect(0, 0, 128, 96);
  g.fillStyle = '#2a2b2c'; g.beginPath(); g.arc(46, 48, 36, 0, TAU); g.fill();
  g.strokeStyle = '#8d8a82'; g.lineWidth = 2; for (let r = 8; r < 36; r += 6) { g.beginPath(); g.arc(46, 48, r, 0, TAU); g.stroke(); }
  g.fillStyle = '#c4c0b6'; g.fillRect(94, 10, 28, 76);
  g.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = 14; y < 84; y += 6) g.fillRect(96, y, 24, 2);
  const tex = canvasTex(c);
  const geo = new THREE.BoxGeometry(0.8, 0.6, 0.3);
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; if (f !== 4) uv.setXY(i, 0.85 + uv.getX(i) * 0.1, 0.5); }
  const m = std({ map: tex, roughness: 0.6, envMapIntensity: 0.6 });
  const all = [...INST.ac, ...INST.acRoof];
  const im = new THREE.InstancedMesh(geo, m, all.length);
  all.forEach((mm, i) => im.setMatrixAt(i, mm));
  im.computeBoundingSphere();
  scene.add(im);
}

const POV_UMB = (() => {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.56, 0.24, 8, 1, true).translate(0, -0.12, 0), new THREE.MeshStandardMaterial({ color: 0xeef4f6, roughness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 }));
  g.add(canopy);
  const ribs = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.56, 0.24, 8, 1, true).translate(0, -0.12, 0), new THREE.MeshBasicMaterial({ color: 0x8f969a, wireframe: true, transparent: true, opacity: 0.35 }));
  g.add(ribs);
  g.position.set(0.04, 0.34, -0.12); g.rotation.set(0.42, 0, -0.06);
  g.visible = false;
  camera.add(g);
  return g;
})();

function updateDoors(T) {
  for (const d of DOORS) {
    let open = 0;
    if (d.schedule === 'izakaya') {
      const a = CROWD.agents.find(x => x.izakaya);
      if (a && a.state && a.state.izakayaDoor != null) open = sstep(2.2, 0.9, a.state.izakayaDoor);
    }
    d.open = lerp(d.open || 0, open, 0.15);
    d.obj.matrix.copy(d.b.M(mat(lerp(d.closedX, d.openX, d.open), d.y, d.z)));
    d.obj.matrixWorldNeedsUpdate = true;
  }
}

function updateWorld(T) {
  updateTraffic(T);
  assignRiders(T);
  updateCrowd(T);
  updateCompanions(T);
  updateHero(T);
  updateLanterns(T);
  updateSignalLamps(T);
  updateSmallFX(T);
  updateDoors(T);
  for (const f of UPDATERS) f(T);
}

function attachments(o) {
  const shotNow = SEQ.explore ? null : SHOTS[SEQ.tr ? (SEQ.tr.t / SEQ.tr.dur < 0.5 ? SEQ.tr.from : SEQ.tr.to) : SEQ.idx];
  const inTaxi = shotNow && shotNow.attach === 'taxi' && CAMSTATE.vehicleId >= 0;
  TAXI_INT.group.visible = !!inTaxi;
  if (inTaxi) {
    const s = vehicleState(CAMSTATE.vehicleId, SEQ.world);
    TAXI_INT.group.position.set(s.x, 0, s.z); TAXI_INT.group.rotation.set(0, s.yaw, 0);
    const l = TRAFFIC.lives[CAMSTATE.vehicleId];
    TAXI_INT.paint.color.set(l ? l.color : '#1d2a4a');
    const w = fract(SEQ.world / 3.2), sweep = w < 0.42 ? Math.sin(w / 0.42 * Math.PI) : 0;
    TAXI_INT.wipers.forEach(wp => wp.rotation.z = -sweep * 1.45);
  }
  POV_UMB.visible = !!(shotNow && shotNow.umbrella);
}

let lastFrame = performance.now(), mapTick = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = clamp((now - lastFrame) / 1000, 0, 0.1); lastFrame = now;
  STATE.realT += dtReal;
  updateSequencer(dtReal);
  const T = SEQ.world;
  U.uTime.value = T;
  updateWorld(T);
  renderNow(dtReal);
  updateHUD();
  if ((mapTick++ & 3) === 0) drawMap(currentPose);
  if ((mapTick & 7) === 0) updateAudio(currentPose);
  adapt(dtReal);
}

function renderNow(dtReal) {
  const { o, look } = evaluateCamera();
  STATE.look = look;
  applyCamera(o);
  attachments(o);
  updateRain(camera, o.rain);
  FX.drips.material.uniforms.uCam.value.copy(camera.position);
  const wide = clamp((35 - o.mm) / 20, 0, 1);
  const cctvActive = look.cctv > 0.99 && !SEQ.tr && !SEQ.explore;
  let hold = false;
  if (cctvActive) { if (STATE.realT - STATE.lastCctv < 0.08) hold = true; else STATE.lastCctv = STATE.realT; }
  const P = {
    time: STATE.realT, exposure: o.exposure * BASE_EXPOSURE * (window.__exp || 1), focal: o.mm, fstop: o.T, focus: o.focus,
    bloom: 0.07, halation: 0.025, vignette: 0.34 + wide * 0.1, grain: (FILM.on ? 0.006 : 0.018) + (cctvActive ? 0.04 : 0), ca: 0.0007 + wide * 0.0012,
    distort: look.distort, mb: REDUCED_MOTION ? 0 : clamp((1 / 48) / Math.max(dtReal, 1 / 240), 0, 1.6), sat: 1.06,
    cctv: look.cctv, glitch: look.glitch, wipe: look.wipe, wipeDir: look.wipeDir, fade: look.fade, drops: look.drops,
    refl: true, reflPlane: o.reflPlane, hold, cut: SEQ.cutFlag || look.cut, dof: DEBUG.dof, debugView: DEBUG.view,
  };
  if (DEBUG.raw) { P.bloom = 0; P.halation = 0; P.grain = 0; P.vignette = 0; P.ca = 0; P.mb = 0; }
  pipeline.render(camera, P);
  SEQ.cutFlag = false;
}
const BASE_EXPOSURE = 1.0;
const DEBUG = { dof: true, raw: false, halos: true, rain: true, view: null };

// Hold the frame rate by trading resolution.
function adapt(dt) {
  if (TEST) return;
  const ft = STATE.frameTimes; ft.push(dt); if (ft.length > 90) ft.shift();
  if (ft.length < 90) return;
  const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
  if (avg > 0.028 && RENDER_SCALE.value > 0.55) { RENDER_SCALE.value = Math.max(0.55, RENDER_SCALE.value - 0.1); ft.length = 0; layout(); }
  else if (avg < 0.0145 && RENDER_SCALE.value < 1) { RENDER_SCALE.value = Math.min(1, RENDER_SCALE.value + 0.1); ft.length = 0; layout(); }
}

async function boot() {
  const bar = $('ibar'), txt = $('itext');
  let tPrev = performance.now();
  const progress = (t, p) => { const now = performance.now(); if (TEST) console.log(`[boot] ${(now - tPrev).toFixed(0)}ms before: ${t}`); tPrev = now; txt.textContent = t; bar.style.width = (p * 100).toFixed(0) + '%'; };
  const tick = () => new Promise(r => setTimeout(r, 0));
  try {
    progress('Loading type…', 0.03);
    await loadFonts();
    progress('Painting asphalt, tile and paper…', 0.12); await tick();
    paintAsphalt(); paintPavers(); paintSmallTextures(); makePuddleTexture(); makeSpriteTextures(); paintKawara(); makePatterns();
    U.uPuddle.value = TEX.puddle;
    buildBaseMaterials();
    setupAtlases(); buildAtlasMaterials();
    scene.fog = new THREE.FogExp2(0x0c111c, 0.0105);
    U.uFogColor.value.copy(scene.fog.color); U.uFogDensity.value = scene.fog.density;
    progress('Raising the buildings…', 0.2); await tick();
    const specs = [...BUILDINGS, ...generateFarBuildings()];
    computeExposure(specs);
    for (const s of specs) BUILT.push(buildBuilding(s));
    progress('Laying the street, the wires and the signals…', 0.4); await tick();
    buildGround(); buildDecals(); buildPoles(); buildLamps(); buildArch(); buildSignals(); buildSigns(); buildParking();
    buildShrine(); buildAlley(); buildViaduct();
    buildCables();
    buildScooters();
    progress('Traffic…', 0.5); await tick();
    simulateTraffic(); buildVehicles(); buildTaxiInterior();
    progress('The city around it…', 0.56); await tick();
    buildBackBlocks(); buildSkyline(); buildSky();
    STATIC.buildInto(scene);
    const winMat = windowedMaterial(false);
    for (const wb of WALLS.values()) { const m = wb.build(winMat); if (m) scene.add(m); }
    buildACUnits();
    progress('People…', 0.64); await tick();
    initCrowd([...buildCrowd(), ...riderAgents()]);
    COMP = buildCompanions();
    buildHero();
    buildBikes();
    finishAtlases();
    progress('Light…', 0.74); await tick();
    bakeLightField(); buildLights();
    buildRain(); buildDrips(); buildSteam(); buildHalos(); buildLanterns(); buildSignalLamps(); buildLED(); buildSmallFX();
    pipeline = new Pipeline();
    initUI();
    // start where the link asks, or at the beginning
    const m = /cam(\d\d)/.exec(location.hash);
    if (m) { const k = clamp(parseInt(m[1], 10) - 1, 0, 23); SEQ.idx = k; }
    SEQ.auto = false;
    updateWorld(0);
    // compile once, for linear HDR targets and with an environment of the final size bound
    progress('Compiling shaders…', 0.8); await tick();
    const pmremPH = new THREE.PMREMGenerator(renderer);
    const placeholder = pmremPH.fromScene(new THREE.Scene(), 0, 0.1, 10);
    scene.environment = placeholder.texture;
    const { o } = evaluateCamera(); applyCamera(o);
    camera.layers.enableAll();
    renderer.setRenderTarget(pipeline.sceneRT);
    try { await renderer.compileAsync(scene, camera); } catch (e) { renderer.compile(scene, camera); }
    camera.layers.set(0); camera.layers.enable(LAYER_NOREFL);
    progress('Lighting the street…', 0.9); await tick();
    captureEnvironment([FX.rain, FX.drips, FX.steam, FX.halos, FX.lanterns]);
    placeholder.dispose(); pmremPH.dispose();
    if (TEST) { const progs = renderer.info.programs; console.log('[programs] ' + progs.length); const names = {}; progs.forEach(pr => { const k = (pr.name || '?') + '|' + pr.cacheKey.length; names[pr.name] = (names[pr.name] || 0) + 1; }); console.log('[programs by type] ' + JSON.stringify(names)); window.__progs = progs.map(pr => pr.cacheKey); }
    progress('Ready.', 1);
    STATE.ready = true;
    window.__ready = true;
    const begin = $('begin');
    begin.disabled = false;
    begin.textContent = 'Begin';
    begin.addEventListener('click', () => {
      $('intro').classList.add('gone');
      STATE.began = true;
      SEQ.auto = true; SEQ.t = 0; SEQ.cutFlag = true;
      pickAttachment(SHOTS[SEQ.idx], SEQ.world);
      $('view').focus();
      showChrome();
    });
    if (!TEST) requestAnimationFrame(t => { lastFrame = t; frame(t); });
  } catch (err) {
    console.error(err);
    txt.textContent = 'Something failed while building the street: ' + (err && err.message ? err.message : err);
    window.__error = String(err && err.stack || err);
  }
}

/* ---------- stills for automated checks: __shot(cam, u, worldTime) ---------- */
if (TEST) {
  window.__eval = (src) => eval(src);
  window.__shot = async (cam, u = 0.5, t = 20, opts = {}) => {
    const i = clamp(cam - 1, 0, 23);
    SEQ.explore = false; SEQ.tr = null; SEQ.idx = i;
    SEQ.t = u * shotDur(i);
    const t0 = t - SEQ.t;
    pickAttachment(SHOTS[i], t0);
    SEQ.world = t; U.uTime.value = t;
    updateWorld(t);
    document.getElementById('intro').style.display = 'none';
    if (opts.hideUI) $('app').classList.add('uihidden');
    DEBUG.view = opts.view || null;
    DEBUG.dof = opts.dof !== false; DEBUG.raw = !!opts.raw; DEBUG.halos = opts.halos !== false; DEBUG.rain = opts.rain !== false;
    FX.halos.visible = DEBUG.halos; FX.rain.visible = DEBUG.rain; FX.sigHalo.visible = DEBUG.halos;
    if (opts.exposure) window.__exp = opts.exposure;
    UI.onShot(i, false);
    SEQ.cutFlag = true;
    renderNow(1 / 60);
    renderNow(1 / 60);
    updateHUD(); drawMap(currentPose);
    await new Promise(r => requestAnimationFrame(() => r()));
    return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, focus: currentPose.focus.toFixed(2), pos: currentPose.pos.toArray().map(v => +v.toFixed(2)) };
  };
  // average frame cost: world update + full render, synchronised with the GPU
  window.__perf = async (cam, n = 60, t = 31) => {
    const i = clamp(cam - 1, 0, 23);
    SEQ.explore = false; SEQ.tr = null; SEQ.idx = i; SEQ.t = 0;
    pickAttachment(SHOTS[i], t);
    const gl = renderer.getContext(), px = new Uint8Array(4);
    let tw = 0, tr = 0;
    for (let k = 0; k < n; k++) {
      const T = t + k / 60; SEQ.world = T; SEQ.t = k / 60; U.uTime.value = T;
      const a = performance.now(); updateWorld(T); const b = performance.now();
      renderNow(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const c = performance.now();
      tw += b - a; tr += c - b;
    }
    return { world: +(tw / n).toFixed(2), render: +(tr / n).toFixed(2), calls: renderer.info.render.calls, w: pipeline.w, h: pipeline.h };
  };
  // a frame from inside the sequence transition that leaves camera `cam`
  window.__trans = async (cam, k = 0.5, t = 40) => {
    const i = clamp(cam - 1, 0, 23);
    SEQ.explore = false; SEQ.tr = null; SEQ.idx = i; SEQ.transitions = true;
    SEQ.t = shotDur(i); SEQ.world = t; U.uTime.value = t;
    pickAttachment(SHOTS[i], t - shotDur(i));
    updateWorld(t);
    currentPose = null; renderNow(1 / 60);
    gotoShot(i + 1, { seq: true });
    if (SEQ.tr) { SEQ.tr.t = k * SEQ.tr.dur; }
    const T2 = t + (SEQ.tr ? k * SEQ.tr.dur : 0); SEQ.world = T2; U.uTime.value = T2; updateWorld(T2);
    document.getElementById('intro').style.display = 'none';
    renderNow(1 / 60); renderNow(1 / 60);
    await new Promise(r => requestAnimationFrame(() => r()));
    return { type: SEQ.tr ? SEQ.tr.type : 'none', dur: SEQ.tr ? +SEQ.tr.dur.toFixed(2) : 0, pos: currentPose.pos.toArray().map(v => +v.toFixed(2)), path: SEQ.tr && SEQ.tr.path ? SEQ.tr.path.map(q => q.toArray().map(v => +v.toFixed(1))) : null };
  };
  window.__film = { init: filmInit, frame: filmFrame, audio: filmAudio, chunk: filmAudioChunk };
  window.__explore = async (pos, target, t = 20) => {
    SEQ.world = t; U.uTime.value = t; updateWorld(t);
    enterExplore();
    EXP.target.set(...target);
    const d = V3(...pos).sub(EXP.target);
    EXP.radius = d.length(); EXP.theta = Math.atan2(d.x, d.z); EXP.phi = Math.acos(d.y / EXP.radius);
    renderNow(1 / 60); renderNow(1 / 60);
    await new Promise(r => requestAnimationFrame(() => r()));
    return true;
  };
}

boot();
