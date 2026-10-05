/* ============================================================
   The switcher: tally, lens data, timecode, the camera strip,
   the index, the live plan, transport, keyboard, sound
   ============================================================ */

const $ = id => document.getElementById(id);
const UI = {};

function initUI() {
  const app = $('app');
  // camera strip and index
  const strip = $('strip'), idx = $('idx'), tip = $('chiptip');
  SHOTS.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.id = 'chip-' + s.no; b.innerHTML = `<span class="n">${s.no}</span><i class="p"></i>`;
    b.setAttribute('aria-label', `Camera ${s.no}, ${s.name}`);
    b.addEventListener('click', () => { gotoShot(i); });
    b.addEventListener('mouseenter', () => { tip.hidden = false; tip.innerHTML = `CAM ${s.no} — ${s.name}<span class="jp">${s.jp}</span>`; const r = b.getBoundingClientRect(), ar = app.getBoundingClientRect(); tip.style.left = (r.left + r.width / 2 - ar.left) + 'px'; tip.style.top = (r.top - ar.top) + 'px'; });
    b.addEventListener('mouseleave', () => { tip.hidden = true; });
    strip.appendChild(b);
    const row = document.createElement('button');
    row.className = 'idx-row'; row.id = 'idx-' + s.no;
    row.innerHTML = `<span class="no">CAM ${s.no}</span><span class="nm">${s.name}</span><span class="mm">${s.mm}mm</span>`;
    row.title = s.desc;
    row.addEventListener('click', () => { gotoShot(i); });
    idx.appendChild(row);
  });
  UI.chips = [...strip.children]; UI.rows = [...idx.children];
  // transport
  $('btn-play').addEventListener('click', togglePlay);
  $('btn-prev').addEventListener('click', () => gotoShot(SEQ.idx - 1));
  $('btn-next').addEventListener('click', () => gotoShot(SEQ.idx + 1));
  for (const id of ['spd-25', 'spd-50', 'spd-100', 'spd-200']) $(id).addEventListener('click', e => setSpeed(+e.currentTarget.dataset.s));
  $('btn-trans').addEventListener('click', toggleTransitions);
  $('btn-auto').addEventListener('click', () => { SEQ.auto = !SEQ.auto; $('btn-auto').setAttribute('aria-pressed', SEQ.auto); toast(SEQ.auto ? 'Auto-advance on' : 'Holding this camera'); });
  $('btn-explore').addEventListener('click', () => SEQ.explore ? exitExplore() : enterExplore());
  $('btn-index').addEventListener('click', () => toggleIndex());
  $('btn-map').addEventListener('click', () => toggleMap());
  $('btn-sound').addEventListener('click', toggleSound);
  $('btn-ui').addEventListener('click', () => toggleUI());
  $('btn-fs').addEventListener('click', toggleFullscreen);
  // keyboard
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (SEQ.explore && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
      EXP.keys[e.code] = true;
      if (e.code === 'KeyE' && !e.repeat && !EXP.keys._eDown) { EXP.keys._eDown = true; }
      if (e.code.startsWith('Arrow')) e.preventDefault();
      if (e.code !== 'KeyE') return;
    }
    const k = e.key;
    if (k === ' ') { e.preventDefault(); togglePlay(); }
    else if (k === 'ArrowRight' && !SEQ.explore) gotoShot(SEQ.idx + 1);
    else if (k === 'ArrowLeft' && !SEQ.explore) gotoShot(SEQ.idx - 1);
    else if (/^[0-9]$/.test(k)) { let n = k === '0' ? 10 : +k; if (e.shiftKey) n += 10; if (n <= 24) gotoShot(n - 1); }
    else if (k === 't' || k === 'T') toggleTransitions();
    else if (k === 'a' || k === 'A') $('btn-auto').click();
    else if (k === 'e' || k === 'E') { if (!e.repeat) SEQ.explore ? exitExplore() : enterExplore(); }
    else if (k === 'Escape') { if (SEQ.explore) exitExplore(); else if (!$('help').hidden) $('help').hidden = true; else if (!$('index').hidden) toggleIndex(false); }
    else if (k === 'h' || k === 'H') toggleUI();
    else if (k === 'f' || k === 'F') toggleFullscreen();
    else if (k === 'm' || k === 'M') toggleMap();
    else if (k === 'c' || k === 'C') toggleIndex();
    else if (k === 's' || k === 'S') { if (!SEQ.explore) toggleSound(); }
    else if (k === '[') setSpeed(SEQ.speed <= 0.25 ? 0.25 : SEQ.speed / 2);
    else if (k === ']') setSpeed(SEQ.speed >= 2 ? 2 : SEQ.speed * 2);
    else if (k === '?') $('help').hidden = !$('help').hidden;
  });
  addEventListener('keyup', e => { EXP.keys[e.code] = false; if (e.code === 'KeyE') EXP.keys._eDown = false; });
  $('help').addEventListener('click', () => $('help').hidden = true);
  // pointer: orbit / pan / dolly in explore mode
  const cv = $('view');
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => { if (!SEQ.explore) return; EXP.dragging = true; EXP.mode = (e.button === 2 || e.shiftKey) ? 1 : 0; EXP.lx = e.clientX; EXP.ly = e.clientY; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    showChrome();
    if (!SEQ.explore || !EXP.dragging) return;
    const dx = e.clientX - EXP.lx, dy = e.clientY - EXP.ly; EXP.lx = e.clientX; EXP.ly = e.clientY;
    if (EXP.mode === 0) { EXP.theta -= dx * 0.005; EXP.phi -= dy * 0.005; }
    else { const s = EXP.radius * 0.0016; const fwd = V3(-Math.sin(EXP.theta), 0, -Math.cos(EXP.theta)), right = V3(-fwd.z, 0, fwd.x); EXP.target.addScaledVector(right, -dx * s).add(V3(0, dy * s, 0)); }
  });
  cv.addEventListener('pointerup', () => { EXP.dragging = false; });
  cv.addEventListener('wheel', e => { if (!SEQ.explore) return; e.preventDefault(); EXP.radius = clamp(EXP.radius * Math.exp(e.deltaY * 0.0012), 0.6, 320); }, { passive: false });
  // touch pinch
  const touches = new Map();
  cv.addEventListener('touchstart', e => { for (const t of e.changedTouches) touches.set(t.identifier, t); if (touches.size === 2) { const [a, b] = [...touches.values()]; EXP.pinch = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); } }, { passive: true });
  cv.addEventListener('touchmove', e => { for (const t of e.changedTouches) touches.set(t.identifier, t); if (SEQ.explore && touches.size === 2) { const [a, b] = [...touches.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (EXP.pinch) EXP.radius = clamp(EXP.radius * EXP.pinch / d, 0.6, 320); EXP.pinch = d; } }, { passive: true });
  cv.addEventListener('touchend', e => { for (const t of e.changedTouches) touches.delete(t.identifier); if (touches.size < 2) EXP.pinch = 0; }, { passive: true });
  // map clicks jump to the nearest camera marker
  $('map').addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (MAPV.w / r.width), my = (e.clientY - r.top) * (MAPV.h / r.height);
    let best = -1, bd = 14;
    MAPV.markers.forEach((m, i) => { const d = Math.hypot(m.x - mx, m.y - my); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) gotoShot(best);
  });
  addEventListener('mousemove', showChrome);
  addEventListener('resize', layout);
  document.addEventListener('fullscreenchange', layout);
  layout();
  buildMap();
  UI.onShot(SEQ.idx, false);
}

function layout() {
  const app = $('app'), W = app.clientWidth, H = app.clientHeight;
  const aspect = 2.39;
  let sh = H, top = 0;
  if (W / H < aspect && W / H > 1.45) { sh = Math.round(W / aspect); top = Math.round((H - sh) / 2); }
  const root = document.documentElement.style;
  root.setProperty('--stage-top', top + 'px');
  root.setProperty('--stage-h', sh + 'px');
  root.setProperty('--bar-top', Math.max(top, 0) + 'px');
  root.setProperty('--bar-bot', Math.max(H - top - sh, 0) + 'px');
  const thin = top < 90 || (H - top - sh) < 70;
  app.classList.toggle('overlaybars', thin);
  const dpr = Math.min(devicePixelRatio || 1, QUALITY.maxDpr) * RENDER_SCALE.value;
  renderer.setPixelRatio(1);
  const w = Math.round(W * dpr), h = Math.round(sh * dpr);
  renderer.setSize(w, h, false);
  canvas.style.width = '100%'; canvas.style.height = '100%';
  camera.aspect = w / h;
  if (pipeline) pipeline.setSize(w, h);
}
const RENDER_SCALE = { value: 1 };

function togglePlay() {
  SEQ.playing = !SEQ.playing;
  $('btn-play').setAttribute('aria-label', SEQ.playing ? 'Pause' : 'Play');
  $('ico-play').innerHTML = SEQ.playing ? '<path d="M4 3h3v10H4zM9 3h3v10H9z"/>' : '<path d="M4 3v10l9-5z"/>';
  toast(SEQ.playing ? 'Playing' : 'Paused · the moment holds');
  if (AUDIO.ctx) AUDIO.master.gain.setTargetAtTime(SEQ.playing && AUDIO.on ? 0.9 : 0.0, AUDIO.ctx.currentTime, 0.3);
}
function setSpeed(s) {
  SEQ.speed = s;
  for (const [id, v] of [['spd-25', 0.25], ['spd-50', 0.5], ['spd-100', 1], ['spd-200', 2]]) $(id).setAttribute('aria-pressed', v === s);
  toast(`Speed ${s === 0.25 ? '¼' : s === 0.5 ? '½' : s}×`);
}
function toggleTransitions() {
  SEQ.transitions = !SEQ.transitions;
  const b = $('btn-trans'); b.textContent = SEQ.transitions ? 'Glide' : 'Cut'; b.setAttribute('aria-pressed', SEQ.transitions);
  toast(SEQ.transitions ? 'Cinematic transitions' : 'Hard cuts');
}
function toggleIndex(force) {
  const el = $('index'); el.hidden = force == null ? !el.hidden : !force;
  $('btn-index').setAttribute('aria-pressed', !el.hidden);
}
function toggleMap() {
  const el = $('mapwrap'); el.hidden = !el.hidden;
  $('btn-map').setAttribute('aria-pressed', !el.hidden);
}
function toggleUI(force) {
  const app = $('app');
  const hide = force == null ? !app.classList.contains('uihidden') : force;
  app.classList.toggle('uihidden', hide);
  if (hide) toast('Press H to show the interface');
}
async function toggleFullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('app').requestFullscreen(); }
  catch (e) { toast('Fullscreen is not available here'); }
}
let toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.opacity = 1; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.style.opacity = 0, 1600); }

// Interface fades out while the film plays and the pointer is still.
let chromeTimer = 0;
function showChrome() {
  const app = $('app');
  app.classList.remove('idle');
  clearTimeout(chromeTimer);
  chromeTimer = setTimeout(() => { if (SEQ.playing && !SEQ.explore) app.classList.add('idle'); }, 3500);
}

UI.onShot = (i, transitioning) => {
  const s = SHOTS[i];
  $('camno').textContent = 'CAM ' + s.no;
  $('camname').textContent = s.name;
  $('camjp').textContent = s.jp;
  $('lens').textContent = `${s.mm} mm · T${s.T} · 180° · ISO ${s.iso}`;
  $('desc').textContent = s.desc;
  UI.chips.forEach((c, j) => { c.classList.toggle('on', j === i); c.classList.remove('next'); });
  UI.rows.forEach((r, j) => r.classList.toggle('on', j === i));
  if (!SEQ.explore) { const h = '#cam' + s.no; if (location.hash !== h) history.replaceState(null, '', h); }
};
UI.onExplore = (on) => {
  $('app').classList.toggle('explore', on);
  $('btn-explore').setAttribute('aria-pressed', on);
  $('hint').hidden = !on;
  if (on) { $('camno').textContent = 'FREE'; $('camname').textContent = 'Explore'; $('camjp').textContent = '自由'; $('lens').textContent = '28 mm · T4 · drag, scroll, WASD'; $('desc').textContent = SEQ.playing ? 'The street keeps moving. Pause to walk around a frozen moment.' : 'The moment is frozen. Walk around it.'; UI.chips.forEach(c => c.classList.remove('on')); }
};

function updateHUD() {
  const T = SEQ.world;
  const tod = 19 * 3600 + 42 * 60 + T;
  const hh = Math.floor(tod / 3600) % 24, mm = Math.floor(tod / 60) % 60, ss = Math.floor(tod) % 60, ff = Math.floor(fract(tod) * 24);
  const p2 = n => String(n).padStart(2, '0');
  $('tc').textContent = `${p2(hh)}:${p2(mm)}:${p2(ss)}:${p2(ff)}`;
  const cc = !!(STATE.look && STATE.look.cctv > 0.5);
  if ($('cctv').hidden === cc) $('cctv').hidden = !cc;
  if (cc) $('cctv-date').textContent = `2026-10-04 ${p2(hh)}:${p2(mm)}:${p2(ss)}`;
  const i = SEQ.tr ? SEQ.tr.to : SEQ.idx;
  const prog = SEQ.tr ? 0 : clamp(SEQ.t / shotDur(SEQ.idx), 0, 1);
  const chip = UI.chips[i];
  if (chip) chip.querySelector('.p').style.width = (prog * 100).toFixed(1) + '%';
  UI.chips.forEach((c, j) => { if (j !== i) c.querySelector('.p').style.width = '0%'; });
  if (SEQ.auto && !SEQ.tr && prog > 0.75) { const n = UI.chips[(i + 1) % 24]; n.classList.add('next'); }
  // end card over the last seconds of the aerial
  const end = SEQ.explore ? 0 : SEQ.tr ? (SEQ.tr.from === 23 && SEQ.tr.to !== 23 ? 1 - sstep(0, 0.35, SEQ.tr.t / SEQ.tr.dur) : 0) : SEQ.idx === 23 ? sstep(0.62, 0.8, prog) : 0;
  $('endcard').style.opacity = end;
}

/* ---------- the live plan ---------- */
const MAPV = { w: 300, h: 118, markers: [] };
function mapXY(x, z) {
  // street runs left to right (toward the station = right), west side at the top
  const s = MAPV.scale;
  return [MAPV.w * 0.5 + (-z - MAPV.cz) * s, MAPV.h * 0.5 + (x) * s];
}
function buildMap() {
  const cv = $('map');
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(2, devicePixelRatio || 1);
  MAPV.w = Math.max(200, Math.round((r.width || 300) * dpr)); MAPV.h = Math.max(80, Math.round((r.height || 118) * dpr));
  cv.width = MAPV.w; cv.height = MAPV.h;
  MAPV.cz = 6; MAPV.scale = MAPV.w / 150;
  const bg = makeCanvas(MAPV.w, MAPV.h), g = bg.getContext('2d');
  g.fillStyle = 'rgba(10,12,16,0.0)'; g.fillRect(0, 0, MAPV.w, MAPV.h);
  const rect = (x0, z0, x1, z1, fill) => { const [a, b] = mapXY(x0, z0), [c, d] = mapXY(x1, z1); g.fillStyle = fill; g.fillRect(Math.min(a, c), Math.min(b, d), Math.abs(c - a), Math.abs(d - b)); };
  rect(-ROAD_HW, -200, ROAD_HW, 150, 'rgba(236,230,218,0.07)');
  rect(-200, CROSS.r0, 200, CROSS.r1, 'rgba(236,230,218,0.07)');
  for (const b of MAP_BLOCKS) {
    if (b.back && Math.abs(b.x0) > 60) continue;
    const fill = b.lot ? 'rgba(236,230,218,0.05)' : b.shrine ? 'rgba(200,70,40,0.25)' : b.alley ? 'rgba(255,120,60,0.18)' : b.rail ? 'rgba(236,230,218,0.22)' : b.back ? 'rgba(236,230,218,0.09)' : 'rgba(236,230,218,0.16)';
    rect(b.x0, b.z0, b.x1, b.z1, fill);
  }
  MAPV.bg = bg;
  g.font = `${10 * dpr}px ${FONTS.gothic}`; g.fillStyle = 'rgba(236,230,218,0.45)';
  const lbl = (t, x, z) => { const [a, b] = mapXY(x, z); g.fillText(t, a, b); };
  lbl('灯り横丁', 14, -3.5); lbl('駅', -4, -108); lbl('交番', 12, -31);
}
function drawMap(o) {
  if ($('mapwrap').hidden) return;
  const cv = $('map'), g = cv.getContext('2d');
  g.clearRect(0, 0, MAPV.w, MAPV.h);
  g.drawImage(MAPV.bg, 0, 0);
  const dpr = MAPV.w / 300;
  // traffic and people as faint dots
  g.fillStyle = 'rgba(255,214,150,0.55)';
  for (const a of CROWD.agents) { if (!a.state || a.state.hidden || a.kind !== 'walker') continue; const [x, y] = mapXY(a.state.x, a.state.z); if (x < 0 || x > MAPV.w) continue; g.fillRect(x - 0.6 * dpr, y - 0.6 * dpr, 1.2 * dpr, 1.2 * dpr); }
  // the man
  const [hx, hy] = mapXY(HERO.x, HERO.z);
  g.fillStyle = '#ffb766'; g.beginPath(); g.arc(hx, hy, 2.6 * dpr, 0, TAU); g.fill();
  // camera markers
  MAPV.markers = [];
  const active = SEQ.explore ? -1 : (SEQ.tr ? SEQ.tr.to : SEQ.idx);
  SHOTS.forEach((s, i) => {
    if (s.attach && i !== active) { MAPV.markers.push({ x: -99, y: -99 }); return; }
    const pz = (i === active && o) ? o : evalShotCached(i);
    const [x, y] = mapXY(pz.pos.x, pz.pos.z);
    MAPV.markers.push({ x, y });
    if (x < -10 || x > MAPV.w + 10 || y < -10 || y > MAPV.h + 10) return;
    const on = i === active;
    const fwd = V3().subVectors(pz.target, pz.pos);
    const ang = Math.atan2(fwd.x * 1, -fwd.z);
    if (on) {
      g.fillStyle = 'rgba(255,75,58,0.22)';
      g.beginPath(); g.moveTo(x, y);
      const half = Math.atan(18 / s.mm), len = 26 * dpr;
      g.arc(x, y, len, ang - half + Math.PI / 2 * 0, ang + half, false);
      g.closePath(); g.fill();
    }
    g.fillStyle = on ? '#ff4b3a' : 'rgba(236,230,218,0.62)';
    g.beginPath(); g.arc(x, y, (on ? 3 : 1.8) * dpr, 0, TAU); g.fill();
    if (on || MAPV.labels) { g.font = `${9 * dpr}px ${FONTS.mono}`; g.fillText(s.no, x + 4 * dpr, y - 3 * dpr); }
  });
  if (SEQ.explore && o) { const [x, y] = mapXY(o.pos.x, o.pos.z); g.fillStyle = '#7fe0ff'; g.beginPath(); g.arc(x, y, 3 * dpr, 0, TAU); g.fill(); }
}
const MAP_CACHE = {};
function evalShotCached(i) {
  if (!MAP_CACHE[i]) { const o = SHOTS[i].pose(0.5, 0); MAP_CACHE[i] = { pos: o.pos.clone(), target: o.target.clone() }; }
  return MAP_CACHE[i];
}

/* ---------- ambient sound, positioned by the active camera ---------- */
const AUDIO = { on: false };
function toggleSound() {
  if (!AUDIO.ctx) initAudio();
  AUDIO.on = !AUDIO.on;
  if (AUDIO.ctx.state === 'suspended') AUDIO.ctx.resume();
  AUDIO.master.gain.setTargetAtTime(AUDIO.on && SEQ.playing ? 0.9 : 0, AUDIO.ctx.currentTime, 0.4);
  $('btn-sound').setAttribute('aria-pressed', AUDIO.on);
  toast(AUDIO.on ? 'Sound on' : 'Sound off');
}
// The ambience graph, shared by live playback and the offline film render: drizzle (stereo), city hum,
// passing traffic (panned toward the nearest car), train rumble, the crossing chirp, interior muffling.
function buildAmbience(ctx) {
  const rand = mulberry32(3131);
  const noiseBuf = (() => { const b = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), d = b.getChannelData(0); let last = 0; for (let i = 0; i < d.length; i++) { const w = rand() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 3; } return b; })();
  const src = (rate = 1, at = 0) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = rate; s.start(0, at); return s; };
  const master = ctx.createGain(); master.gain.value = 0;
  const muff = ctx.createBiquadFilter(); muff.type = 'lowpass'; muff.frequency.value = 18000;
  master.connect(muff).connect(ctx.destination);
  const rainG = ctx.createGain(); rainG.gain.value = 0.12; rainG.connect(master);
  for (const [rate, pan, at] of [[1, -0.55, 0], [1.07, 0.55, 1.7]]) {
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3800; f.Q.value = 0.4;
    const pn = ctx.createStereoPanner(); pn.pan.value = pan;
    src(rate, at).connect(f).connect(pn).connect(rainG);
  }
  const humF = ctx.createBiquadFilter(); humF.type = 'lowpass'; humF.frequency.value = 180;
  const humG = ctx.createGain(); humG.gain.value = 0.25; src(0.5, 0.9).connect(humF).connect(humG).connect(master);
  const carF = ctx.createBiquadFilter(); carF.type = 'bandpass'; carF.frequency.value = 600; carF.Q.value = 0.7;
  const carG = ctx.createGain(); carG.gain.value = 0; const carP = ctx.createStereoPanner();
  src(0.8, 2.3).connect(carF).connect(carG).connect(carP).connect(master);
  const trF = ctx.createBiquadFilter(); trF.type = 'lowpass'; trF.frequency.value = 260;
  const trG = ctx.createGain(); trG.gain.value = 0; src(0.35, 3.1).connect(trF).connect(trG).connect(master);
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 2600;
  const chG = ctx.createGain(); chG.gain.value = 0; osc.connect(chG).connect(master); osc.start();
  return { ctx, master, rainG, humG, carG, carF, carP, trG, chG, osc, muff };
}
function initAudio() { Object.assign(AUDIO, buildAmbience(new (window.AudioContext || window.webkitAudioContext)())); }

// What the ambience should be doing for a camera pose at the current world time.
function audioTargets(o) {
  const T = SEQ.world, p = o.pos;
  const shot = SEQ.explore ? null : SHOTS[SEQ.idx];
  const inside = !!(shot && shot.interior && !SEQ.tr);
  const right = V3(1, 0, 0).applyQuaternion(o.quat || quatOf(o));
  let dmin = 99, pan = 0;
  for (const l of TRAFFIC.lives) {
    if (l.type === 'bike') continue;
    const s = vehicleState(l.id, T); if (!s.visible) continue;
    const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz);
    if (d < dmin) { dmin = d; pan = clamp((dx * right.x + dz * right.z) / Math.max(d, 0.5), -1, 1) * 0.8; }
  }
  let td = 999;
  for (const tr of TRAINS) { if (tr.headX == null) continue; const x0 = tr.dir > 0 ? tr.headX - 170 : tr.headX, x1 = x0 + 170; const dx = p.x < x0 ? x0 - p.x : p.x > x1 ? p.x - x1 : 0; td = Math.min(td, Math.hypot(dx, p.z - tr.z, p.y - 7)); }
  const walk = SIG.pedMain(T) === 'W', cd = Math.hypot(p.x, p.z + 40);
  return {
    muff: inside ? 900 : 18000, rain: inside ? 0.05 : 0.12,
    car: clamp(1.6 / (1 + dmin * dmin * 0.08), 0, 0.5), pan,
    train: clamp(60 / (td + 20) - 0.25, 0, 0.9),
    chirp: (walk && fract(T * 1.5) < 0.12 ? 1 : 0) * clamp(8 / (cd + 4), 0, 0.15),
    osc: fract(T * 1.5) < 0.06 ? 2900 : 2300,
  };
}
function applyAudio(g, r, t) {
  g.muff.frequency.setTargetAtTime(r.muff, t, 0.25);
  g.rainG.gain.setTargetAtTime(r.rain, t, 0.2);
  g.carG.gain.setTargetAtTime(r.car, t, 0.08);
  g.carP.pan.setTargetAtTime(r.pan, t, 0.12);
  g.trG.gain.setTargetAtTime(r.train, t, 0.2);
  g.chG.gain.setTargetAtTime(r.chirp, t, 0.01);
  g.osc.frequency.setTargetAtTime(r.osc, t, 0.01);
}
function updateAudio(o) {
  if (!AUDIO.ctx || !AUDIO.on || !o) return;
  const r = audioTargets(o);
  if (!SEQ.playing) r.rain = 0;
  applyAudio(AUDIO, r, AUDIO.ctx.currentTime);
}
