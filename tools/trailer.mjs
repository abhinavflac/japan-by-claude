// A one-minute trailer: a fixed edit of clips (the 24 cameras plus a few extra drone paths), rendered
// frame by frame in headless Chrome, captioned, piped to ffmpeg, with the ambience rendered offline.
// node tools/trailer.mjs [out.mp4] [--w 1920] [--h 804] [--ss 1] [--fps 24] [--crf 18] [--preview dir] [--only i,j]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch, root } from './cdp.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const out = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : path.join(root, 'export', 'trailer-60s.mp4'));
const fps = +opt('fps', 24), W = +opt('w', 1920), H = +opt('h', 804), ss = +opt('ss', 1), crf = opt('crf', '18');
const RW = Math.round(W * ss), RH = Math.round(H * ss), preview = opt('preview', null);
const only = opt('only', null)?.split(',').map(Number);

// The edit. cam: a camera (u0 → u1 over the clip, world time t at the clip's start); pose: a path defined below.
// sec: length in seconds. cap: lower-third caption. fadeIn/fadeOut: seconds of dip to black.
const EDIT = [
  { cam: 7, u0: 0.15, u1: 0.55, t: 31, sec: 1.6, cap: 7 },
  { cam: 4, u0: 0.2, u1: 0.5, t: 44, sec: 1.4, cap: 4 },
  { cam: 20, u0: 0.05, u1: 0.3, t: 60, sec: 1.3, cap: 20 },
  { cam: 3, u0: 0.35, u1: 0.75, t: 75, sec: 1.3, cap: 3 },
  { cam: 8, u0: 0.0, u1: 1.0, t: 90, sec: 6.0, title: true },
  { pose: 'alley', t: 120, sec: 4.0, cap: ['DRONE', 'Akari Yokochō', '横丁'] },
  { cam: 18, u0: 0.35, u1: 0.95, t: 140, sec: 3.2, cap: 18 },
  { pose: 'shrine', t: 160, sec: 3.4, cap: ['STEADICAM', 'The Shrine', '鳥居'] },
  { pose: 'viaduct', t: 177, sec: 4.2, cap: ['CRANE', 'The Viaduct', '高架'] },
  { cam: 1, u0: 0.1, u1: 0.9, t: 200, sec: 3.4, cap: 1 },
  { cam: 15, u0: 0.3, u1: 0.6, t: 215, sec: 1.8, cap: 15 },
  { cam: 17, u0: 0.25, u1: 0.65, t: 230, sec: 2.8, cap: 17, attach: true },
  { cam: 19, u0: 0.45, u1: 1.0, t: 250, sec: 3.0, cap: 19 },
  { cam: 6, u0: 0.0, u1: 1.0, t: 265, sec: 2.8, cap: 6 },
  { cam: 21, u0: 0.1, u1: 0.55, t: 280, sec: 3.6, cap: 21, fadeOut: 0.5 },
  { pose: 'flyover', t: 300, sec: 4.2, day: true, fadeIn: 0.4, cap: ['DRONE · 08:42', 'The Same Street, by Day', '空撮'] },
  { cam: 2, u0: 0.2, u1: 0.8, t: 320, sec: 2.4, day: true, cap: 2 },
  { cam: 9, u0: 0.3, u1: 0.8, t: 335, sec: 2.4, day: true, cap: 9 },
  { cam: 11, u0: 0.2, u1: 0.5, t: 350, sec: 1.1, filter: 'noir', cap: ['LOOK', 'Noir', ''] },
  { cam: 5, u0: 0.3, u1: 0.6, t: 360, sec: 1.1, filter: 'anime', cap: ['LOOK', 'Anime', ''] },
  { cam: 10, u0: 0.3, u1: 0.6, t: 370, sec: 1.1, filter: 'thermal', cap: ['LOOK', 'Thermal', ''] },
  { cam: 1, u0: 0.4, u1: 0.7, t: 380, sec: 1.1, filter: 'tiltshift', cap: ['LOOK', 'Tilt-Shift', ''] },
  { cam: 24, u0: 0.12, u1: 0.8, t: 400, sec: 6.0, end: true, fadeOut: 1.2 },
];

// Extra camera paths, in the page's own coordinates (x across the street, east positive; z along it, the arch at +38).
const POSES = `({
  alley(k) { const e = e3(k); const p = lv(V3(38, 10.5, -5.8), V3(12.5, 4.6, -5.75), e); return pose(p, lv(V3(14, 0.5, -5.8), V3(-6, 2.2, -6.0), e), { mm: 24, T: 4, focus: 14 }); },
  shrine(k) { const e = e3(k); const p = lv(V3(2.6, 1.55, -19.5), V3(-1.2, 1.7, -22.3), e); return pose(p, V3(-9.4, 2.2, -24.1), { mm: 32, T: 2, focus: focusTo(p, V3(-6.45, 2, -24)) }); },
  viaduct(k) { const e = e3(k); const p = lv(V3(0.4, 3.2, -66), V3(0.2, 8.8, -78), e); return pose(p, lv(V3(0, 4.5, -110), V3(0, 6.5, -110), e), { mm: 28, T: 4, focus: 32 }); },
  flyover(k) { const e = e3(k); const p = lv(V3(-26, 34, -78), V3(-9, 17, 12), e); return pose(p, lv(V3(0, 0, -30), V3(3, 1, 30), e), { mm: 24, T: 8, focus: 60 }); },
})`;

const page = await launch({ width: RW, height: RH, query: 'test=1&q=high' });
const t0 = Date.now();
await page.open(txt => console.log('...', txt));
console.log('ready in', ((Date.now() - t0) / 1000).toFixed(0), 's; render', RW + 'x' + RH, '->', W + 'x' + H, '@', fps);
const ev = src => page.evaluate(`window.__eval(${JSON.stringify(src)})`);
await ev(`
  window.__POSES = ${POSES};
  window.__POSE = null;
  { const _evalCam = evaluateCamera;
    evaluateCamera = () => {
      if (!window.__POSE) return _evalCam();
      const o = window.__POSE; o.mm = o.mm || 28; o.T = o.T || 4; o.exposure = o.exposure || 1; o.near = o.near || 0.1; o.rain = o.rain == null ? 1 : o.rain; o.reflPlane = 0;
      o.quat = quatOf(o); currentPose = o;
      return { o, look: { cctv: 0, glitch: 0, wipe: 0, wipeDir: 1, fade: window.__FADE || 0, drops: 0, distort: 0, cut: false } };
    };
    const _ev2 = evaluateCamera;
    evaluateCamera = () => { const r = _ev2(); if (!window.__POSE) r.look.fade = Math.max(r.look.fade, window.__FADE || 0); return r; };
  }
  FILM.on = true; FILM.rec = []; FILM.fps = ${fps};
  FILM.cv = makeCanvas(${W}, ${H}); FILM.ctx = FILM.cv.getContext('2d');
  renderer.setPixelRatio(1); renderer.setSize(${RW}, ${RH}, false);
  camera.aspect = ${RW / RH}; camera.updateProjectionMatrix(); pipeline.setSize(${RW}, ${RH});
  Object.assign(DEBUG, { view: null, dof: true, raw: false, halos: true, rain: true });
  FX.halos.visible = FX.rain.visible = FX.sigHalo.visible = true;
  document.getElementById('intro').style.display = 'none';
  window.__TR = (c, k, T, first, gt) => {
    if (first) {
      if (!!c.day !== DAY.on) setDay(!!c.day);
      setFilter(c.filter ? FILTER_ID[c.filter] : 0, true);
      if (SEQ.idx >= 0) releaseAttachment(SHOTS[SEQ.idx]);
      SEQ.cutFlag = true;
    }
    SEQ.tr = null; SEQ.world = T; U.uTime.value = T; STATE.realT = gt;
    if (c.pose) {
      SEQ.explore = true; SEQ.idx = 0;
      window.__POSE = window.__POSES[c.pose](k, T);
    } else {
      window.__POSE = null; SEQ.explore = false;
      const i = c.cam - 1, u = c.u0 + (c.u1 - c.u0) * k;
      SEQ.idx = i; SEQ.t = u * shotDur(i);
      if (first) pickAttachment(SHOTS[i], T - SEQ.t);
    }
    const kin = c.fadeIn ? 1 - sstep(0, c.fadeIn, k * c.sec) : 0, kout = c.fadeOut ? sstep(c.sec - c.fadeOut, c.sec, (k + 1 / (c.sec * ${fps})) * c.sec) : 0;
    window.__FADE = Math.max(kin, kout);
    updateWorld(T);
    renderNow(1 / ${fps});
    const g = FILM.ctx; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(renderer.domElement, 0, 0, ${W}, ${H});
    trailerOverlay(g, c, k, gt);
    FILM.rec.push(audioTargets(currentPose));
    return FILM.cv.toDataURL('image/jpeg', 0.95).slice(23);
  };
  window.trailerOverlay = (g, c, k, gt) => {
    const W = ${W}, H = ${H}, s = H / 804, t = k * c.sec, ink = '#ece6da', ink2 = 'rgba(236,230,218,.72)';
    const txt = (str, x, y) => g.fillText(str, x, y);
    g.save(); g.textBaseline = 'alphabetic';
    // caption, lower left: the camera number, name and its Japanese name
    let cap = c.cap;
    if (typeof cap === 'number') { const sh = SHOTS[cap - 1]; cap = ['CAM ' + sh.no, sh.name, sh.jp]; }
    if (cap) {
      const a = sstep(0.12, 0.4, t) * (1 - sstep(c.sec - 0.35, c.sec - 0.05, t)) * (1 - (window.__FADE || 0));
      if (a > 0.001) {
        g.globalAlpha = a; g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 10 * s;
        const x = 64 * s, y = H - 70 * s;
        g.fillStyle = '#ff4b3a'; g.beginPath(); g.arc(x + 5 * s, y - 7 * s, 4.5 * s, 0, TAU); g.fill();
        g.fillStyle = ink2; g.font = '500 ' + 17 * s + 'px ' + FONTS.mono; g.letterSpacing = 1.5 * s + 'px'; txt(cap[0], x + 20 * s, y);
        let cx = x + 20 * s + g.measureText(cap[0]).width + 16 * s;
        g.fillStyle = ink; g.font = '600 ' + 25 * s + 'px ' + FONTS.latin; g.letterSpacing = 4 * s + 'px'; txt(cap[1].toUpperCase(), cx, y);
        cx += g.measureText(cap[1].toUpperCase()).width + 12 * s;
        if (cap[2]) { g.fillStyle = ink2; g.font = '600 ' + 20 * s + 'px ' + FONTS.mincho; g.letterSpacing = 2 * s + 'px'; txt(cap[2], cx, y); }
      }
    }
    // the title, over the drone shot
    if (c.title) {
      const a = sstep(0.5, 1.4, t) * (1 - sstep(4.9, 5.8, t));
      if (a > 0.001) {
        g.globalAlpha = a; g.letterSpacing = '0px';
        const sc = g.createLinearGradient(0, 0, W * 0.62, 0); sc.addColorStop(0, 'rgba(0,0,0,0.5)'); sc.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sc; g.fillRect(0, 0, W * 0.62, H);
        g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 20 * s;
        g.fillStyle = ink; g.font = '600 ' + 66 * s + 'px ' + FONTS.mincho; g.letterSpacing = 2 * s + 'px';
        txt('二十四台のカメラ、', 112 * s, 322 * s); txt('ひとつの街。', 112 * s, 406 * s);
        g.fillStyle = 'rgba(236,230,218,.86)'; g.font = '500 ' + 21 * s + 'px ' + FONTS.latin; g.letterSpacing = 8.5 * s + 'px';
        txt('24 CAMERAS, ONE LIVING JAPANESE STREET', 115 * s, 466 * s);
      }
    }
    // the end card
    if (c.end) {
      const a = sstep(2.2, 3.2, t) * (1 - sstep(c.sec - 0.9, c.sec - 0.2, t));
      if (a > 0.001) {
        g.globalAlpha = a; g.textAlign = 'center'; g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 16 * s;
        g.fillStyle = ink; g.font = '500 ' + 26 * s + 'px ' + FONTS.latin; g.letterSpacing = 10.9 * s + 'px';
        txt('ONE WORLD. ONE MOMENT. 24 CAMERAS.', W / 2 + 5.5 * s, H / 2 - 4 * s);
        g.fillStyle = ink2; g.font = '600 ' + 17 * s + 'px ' + FONTS.mincho; g.letterSpacing = 5 * s + 'px';
        txt('ひとつの街、ひとつの瞬間、二十四台のカメラ', W / 2 + 2.5 * s, H / 2 + 34 * s);
      }
    }
    g.restore();
    // up from black at the very start
    const fi = 1 - sstep(0, 0.25, gt);
    if (fi > 0) { g.fillStyle = 'rgba(0,0,0,' + fi + ')'; g.fillRect(0, 0, W, H); }
  };
  true
`);

// glyphs the page didn't preload (the captions' Japanese names)
const jp = [...new Set(EDIT.flatMap(c => Array.isArray(c.cap) ? [...c.cap[2]] : []))].join('');
console.log('fonts', await ev(`Promise.all([400, 600, 800].map(w => document.fonts.load(w + ' 40px "' + FONT_FACE.mincho + '"', ${JSON.stringify(jp)}))).then(r => r.map(x => x.length))`));

const clips = EDIT.map((c, i) => ({ ...c, i })).filter(c => !only || only.includes(c.i));
if (preview) {
  fs.mkdirSync(preview, { recursive: true });
  for (const c of clips) for (const k of [0.05, 0.5, 0.95]) {
    const a = Date.now();
    const jpg = await page.evaluate(`window.__TR(${JSON.stringify(c)}, ${k}, ${c.t + k * c.sec}, true, 1)`);
    fs.writeFileSync(path.join(preview, `${String(c.i).padStart(2, '0')}_${c.cam || c.pose}_${k}.jpg`), Buffer.from(jpg, 'base64'));
    console.log(c.i, c.cam || c.pose, k, ((Date.now() - a) / 1000).toFixed(1) + 's');
  }
  console.log(page.logs.filter(l => /exception|error/i.test(l)).slice(0, 20).join('\n'));
  await page.close(); process.exit(0);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
const tmpVideo = out.replace(/\.mp4$/, '.video.mp4'), tmpAudio = out.replace(/\.mp4$/, '.wav');
const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmpVideo], { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise(r => ff.on('close', r));
const t1 = Date.now();
let n = 0;
for (const c of clips) {
  const frames = Math.round(c.sec * fps);
  for (let f = 0; f < frames; f++) {
    const k = f / frames;
    const jpg = await page.evaluate(`window.__TR(${JSON.stringify(c)}, ${k}, ${c.t + f / fps}, ${f === 0}, ${n / fps})`);
    const buf = Buffer.from(jpg, 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    n++;
    if (n % 24 === 0) { const el = (Date.now() - t1) / 1000; console.log(`frame ${n} (${(n / fps).toFixed(1)} s) clip ${c.i} · ${(el / n).toFixed(2)} s/frame · ${el.toFixed(0)} s elapsed`); }
  }
}
ff.stdin.end();
await ffDone;
const a = await page.evaluate('window.__film.audio()');
const parts = [];
for (let i = 0; i < a.chunks; i++) parts.push(await page.evaluate(`window.__film.chunk(${i})`));
fs.writeFileSync(tmpAudio, Buffer.from(parts.join(''), 'base64'));
await page.close();
await new Promise((res, rej) => {
  const mux = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', tmpVideo, '-i', tmpAudio, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
  mux.on('close', c => c === 0 ? res() : rej(new Error('mux failed ' + c)));
});
fs.rmSync(tmpVideo); fs.rmSync(tmpAudio);
console.log('wrote', out, n, 'frames,', (fs.statSync(out).size / 1048576).toFixed(1) + ' MB in', ((Date.now() - t1) / 60000).toFixed(1), 'min');
process.exit(0);
