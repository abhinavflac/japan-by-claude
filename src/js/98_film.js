/* ============================================================
   Film export: the sequence stepped at a fixed frame rate,
   composited with a title, camera cards, the CCTV burn-in and
   the end card; the ambience is rendered offline afterwards
   from the same per-frame parameters, so sound and picture agree.
   ============================================================ */

const FILM_TX = {
  title: jt('mincho', '二十四台のカメラ、ひとつの街。'),
  end: jt('mincho', 'ひとつの街、ひとつの瞬間、二十四台のカメラ'),
  cctv: jt('gothic', 'CAM-15 · 灯町3-12 北向'),
};
SHOTS.forEach(s => jt('mincho', s.jp));
const FILM = { on: false };

// w x h is the delivered frame; rw x rh is the render, drawn down into it for a little supersampling.
function filmInit(o) {
  Object.assign(FILM, { on: true, w: o.w, h: o.h, fps: o.fps, frame: 0, rec: [], wav: null });
  FILM.cv = makeCanvas(o.w, o.h); FILM.ctx = FILM.cv.getContext('2d');
  renderer.setPixelRatio(1); renderer.setSize(o.rw, o.rh, false);
  camera.aspect = o.rw / o.rh; camera.updateProjectionMatrix();
  pipeline.setSize(o.rw, o.rh);
  releaseAttachment(SHOTS[SEQ.idx]);
  Object.assign(SEQ, { explore: false, tr: null, idx: 0, t: 0, world: o.t0, transitions: true, auto: true, speed: 1, playing: true, cutFlag: true });
  pickAttachment(SHOTS[0], o.t0);
  currentPose = null; STATE.realT = 0; window.__exp = 1;
  Object.assign(DEBUG, { view: null, dof: true, raw: false, halos: true, rain: true });
  FX.halos.visible = FX.rain.visible = FX.sigHalo.visible = true;
  document.getElementById('intro').style.display = 'none';
  return { w: pipeline.w, h: pipeline.h };
}

function filmFrame(quality = 0.95) {
  const dt = 1 / FILM.fps;
  if (FILM.frame > 0) { STATE.realT += dt; updateSequencer(dt); }
  U.uTime.value = SEQ.world;
  updateWorld(SEQ.world);
  renderNow(dt);
  const c = FILM.ctx;
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(renderer.domElement, 0, 0, FILM.w, FILM.h);
  filmOverlay(c, FILM.w, FILM.h);
  FILM.rec.push(audioTargets(currentPose));
  FILM.frame++;
  const done = SEQ.idx === SHOTS.length - 1 && !SEQ.tr && SEQ.t + dt >= shotDur(SEQ.idx) - 1e-6;
  return { jpg: FILM.cv.toDataURL('image/jpeg', quality).slice(23), done, cam: SEQ.tr ? SEQ.tr.to + 1 : SEQ.idx + 1 };
}

function filmOverlay(c, W, H) {
  const ft = FILM.frame / FILM.fps, k = H / 804, ink = '#ece6da', ink2 = 'rgba(236,230,218,.7)';
  const shot = SHOTS[SEQ.idx], text = (str, x, y) => c.fillText(str, x, y);
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  // the security camera's burn-in
  const cc = STATE.look ? STATE.look.cctv : 0;
  if (cc > 0.5) {
    c.save(); c.globalAlpha = sstep(0.5, 0.9, cc);
    c.fillStyle = 'rgba(230,240,230,.86)'; c.shadowColor = '#000'; c.shadowBlur = 2 * k;
    c.font = `500 ${14 * k}px ${FONTS.mono}, ${FONTS.gothic}`; c.letterSpacing = `${0.9 * k}px`;
    const tod = 19 * 3600 + 42 * 60 + SEQ.world, p2 = n => String(Math.floor(n)).padStart(2, '0');
    text(`2026-10-04 ${p2(tod / 3600 % 24)}:${p2(tod / 60 % 60)}:${p2(tod % 60)}`, W * 0.03, H * 0.05 + 12 * k);
    text('CAM-15 · 灯町3-12 北向', W * 0.03, H * 0.05 + 32 * k);
    c.textAlign = 'right';
    text('AKARI-CHO SHOTENGAI ASSN · 12.5 FPS', W * 0.97, H * 0.94);
    text('REC', W * 0.97, H * 0.05 + 12 * k);
    if (fract(ft) < 0.5) { c.fillStyle = '#ff3b30'; c.beginPath(); c.arc(W * 0.97 - c.measureText('REC').width - 12 * k, H * 0.05 + 7 * k, 4.5 * k, 0, TAU); c.fill(); }
    c.restore();
  }
  // a quiet card for each camera as it settles
  if (!SEQ.tr) {
    const t = SEQ.t, d = shotDur(SEQ.idx), s0 = SEQ.idx === 0 ? 6.0 : 0.35;
    const a = sstep(s0, s0 + 0.5, t) * (1 - sstep(s0 + 3.0, s0 + 3.7, t)) * (1 - sstep(d - 0.6, d - 0.2, t));
    if (a > 0.001) {
      c.save(); c.globalAlpha = a;
      const sc = c.createLinearGradient(0, H - 190 * k, 0, H); sc.addColorStop(0, 'rgba(0,0,0,0)'); sc.addColorStop(1, 'rgba(0,0,0,0.42)');
      c.fillStyle = sc; c.fillRect(0, H - 190 * k, W * 0.6, 190 * k);
      c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 10 * k;
      const x = 64 * k, y = H - 86 * k, no = 'CAM ' + shot.no, nm = shot.name.toUpperCase();
      c.fillStyle = '#ff4b3a'; c.beginPath(); c.arc(x + 5 * k, y - 8 * k, 4.5 * k, 0, TAU); c.fill();
      c.fillStyle = ink2; c.font = `500 ${18 * k}px ${FONTS.mono}`; c.letterSpacing = `${1.5 * k}px`; text(no, x + 20 * k, y);
      let cx = x + 20 * k + c.measureText(no).width + 18 * k;
      c.fillStyle = ink; c.font = `600 ${29 * k}px ${FONTS.latin}`; c.letterSpacing = `${4.6 * k}px`; text(nm, cx, y);
      cx += c.measureText(nm).width + 14 * k;
      c.fillStyle = ink2; c.font = `600 ${23 * k}px ${FONTS.mincho}`; c.letterSpacing = `${2.4 * k}px`; text(shot.jp, cx, y);
      c.fillStyle = 'rgba(236,230,218,.58)'; c.font = `500 ${15 * k}px ${FONTS.mono}`; c.letterSpacing = `${1 * k}px`;
      text(`${shot.mm} mm · T${shot.T} · 180° · ISO ${shot.iso}`, x + 20 * k, y + 31 * k);
      c.restore();
    }
  }
  // up from black, with the title over the establishing shot
  const fadeIn = 1 - sstep(0, 1.6, ft);
  if (fadeIn > 0) { c.fillStyle = `rgba(0,0,0,${fadeIn})`; c.fillRect(0, 0, W, H); }
  const ta = sstep(1.0, 2.2, ft) * (1 - sstep(5.2, 6.2, ft));
  if (ta > 0.001) {
    c.save(); c.globalAlpha = ta;
    const sc = c.createLinearGradient(0, 0, W * 0.62, 0); sc.addColorStop(0, 'rgba(0,0,0,0.55)'); sc.addColorStop(0.7, 'rgba(0,0,0,0.25)'); sc.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sc; c.fillRect(0, 0, W * 0.62, H);
    c.shadowColor = 'rgba(0,0,0,0.75)'; c.shadowBlur = 20 * k;
    c.fillStyle = ink; c.font = `600 ${66 * k}px ${FONTS.mincho}`; c.letterSpacing = `${2 * k}px`;
    text('二十四台のカメラ、', 112 * k, 322 * k); text('ひとつの街。', 112 * k, 406 * k);
    c.fillStyle = 'rgba(236,230,218,.86)'; c.font = `500 ${21 * k}px ${FONTS.latin}`; c.letterSpacing = `${8.5 * k}px`;
    text('24 CAMERAS, ONE LIVING JAPANESE STREET', 115 * k, 466 * k);
    c.restore();
  }
  // the end card over the aerial, then down to black
  if (SEQ.idx === SHOTS.length - 1 && !SEQ.tr) {
    const pr = SEQ.t / shotDur(SEQ.idx), ea = sstep(0.5, 0.66, pr);
    if (ea > 0.001) {
      c.save(); c.globalAlpha = ea; c.textAlign = 'center'; c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 16 * k;
      c.fillStyle = ink; c.font = `500 ${26 * k}px ${FONTS.latin}`; c.letterSpacing = `${10.9 * k}px`;
      text('ONE WORLD. ONE MOMENT. 24 CAMERAS.', W / 2 + 5.5 * k, H / 2 - 4 * k);
      c.fillStyle = ink2; c.font = `600 ${17 * k}px ${FONTS.mincho}`; c.letterSpacing = `${5 * k}px`;
      text('ひとつの街、ひとつの瞬間、二十四台のカメラ', W / 2 + 2.5 * k, H / 2 + 34 * k);
      c.restore();
    }
    const out = sstep(0.86, 1.0, pr + 1 / (FILM.fps * shotDur(SEQ.idx)));
    if (out > 0) { c.fillStyle = `rgba(0,0,0,${out})`; c.fillRect(0, 0, W, H); }
  }
}

// The ambience for the whole film, rendered offline and packed as 16-bit stereo WAV (base64, fetched in chunks).
async function filmAudio(sr = 48000) {
  const n = FILM.rec.length, dur = n / FILM.fps;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  const g = buildAmbience(ctx);
  g.master.gain.setValueAtTime(0, 0); g.master.gain.linearRampToValueAtTime(0.9, 1.8);
  g.master.gain.setValueAtTime(0.9, Math.max(1.9, dur - 2.2)); g.master.gain.linearRampToValueAtTime(0, dur);
  FILM.rec.forEach((r, i) => applyAudio(g, r, i / FILM.fps));
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1), m = L.length;
  const out = new DataView(new ArrayBuffer(44 + m * 4));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + m * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, sr, true);
  out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, m * 4, true);
  let peak = 0;
  for (let i = 0; i < m; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const gain = peak > 0.89 ? 0.89 / peak : 1;
  for (let i = 0; i < m; i++) { out.setInt16(44 + i * 4, clamp(L[i] * gain, -1, 1) * 32767, true); out.setInt16(46 + i * 4, clamp(R[i] * gain, -1, 1) * 32767, true); }
  const bytes = new Uint8Array(out.buffer);
  let b64 = '';
  for (let i = 0; i < bytes.length; i += 0x8000) b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  FILM.wav = btoa(b64);
  return { seconds: dur, chunks: Math.ceil(FILM.wav.length / 4e6), peak: +peak.toFixed(3) };
}
const filmAudioChunk = i => FILM.wav.slice(i * 4e6, (i + 1) * 4e6);
