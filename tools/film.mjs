// Render the whole sequence to an MP4: frames are stepped at a fixed rate in headless Chrome,
// piped to ffmpeg as JPEG, then the offline-rendered ambience is muxed in.
// node tools/film.mjs [out.mp4] [--fps 24] [--t0 40] [--w 1920] [--h 804] [--ss 1.25] [--frames N] [--crf 17]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const out = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : path.join(root, 'export', '24-cameras-one-living-japanese-street.mp4'));
const fps = +opt('fps', 24), t0 = +opt('t0', 40), W = +opt('w', 1920), H = +opt('h', 804), ss = +opt('ss', 1.25), maxFrames = +opt('frames', 1e9), crf = opt('crf', '20');
const RW = Math.round(W * ss), RH = Math.round(H * ss);
fs.mkdirSync(path.dirname(out), { recursive: true });
const tmpVideo = out.replace(/\.mp4$/, '.video.mp4'), tmpAudio = out.replace(/\.mp4$/, '.wav');

const url = 'file:///' + path.join(root, 'index.html').split(path.sep).join('/') + '?test=1&q=high';
const prof = path.join(path.dirname(out), '_chrome');
const port = 9500 + Math.floor(Math.random() * 300);
const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${RW},${RH + 200}`, '--hide-scrollbars', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--allow-file-access-from-files', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 160; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(250); } }
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') console.error('[page]', m.params.exceptionDetails.exception?.description?.slice(0, 400));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
  return r.result.value;
};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: RW, height: RH + 200, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
for (let i = 0; i < 400; i++) { await sleep(500); if (await evaluate('!!window.__ready')) break; }
console.log('ready; render', RW + 'x' + RH, '-> deliver', W + 'x' + H, '@', fps, 'fps, t0', t0);
console.log(JSON.stringify(await evaluate(`window.__film.init({ w: ${W}, h: ${H}, rw: ${RW}, rh: ${RH}, fps: ${fps}, t0: ${t0} })`)));

const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
  '-c:v', 'libx264', '-preset', opt('preset', 'slow'), '-crf', crf, '-x264-params', 'aq-mode=3', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmpVideo], { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise(r => ff.on('close', r));
const t1 = Date.now();
let n = 0, cam = 0, tEval = 0, tWait = 0;
for (;;) {
  const a0 = Date.now();
  const f = await evaluate('window.__film.frame(0.95)');
  const a1 = Date.now(); tEval += a1 - a0;
  const buf = Buffer.from(f.jpg, 'base64');
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  tWait += Date.now() - a1;
  n++;
  if (f.cam !== cam) { cam = f.cam; console.log(`  frame ${n} (${(n / fps).toFixed(1)}s): CAM ${String(cam).padStart(2, '0')}`); }
  if (f.done || n >= maxFrames) break;
}
ff.stdin.end();
await ffDone;
console.log(`frames: ${n} (${(n / fps).toFixed(2)} s of film) in ${((Date.now() - t1) / 1000).toFixed(0)} s; page ${(tEval / n).toFixed(0)} ms/frame, encoder wait ${(tWait / n).toFixed(0)} ms/frame`);

const a = await evaluate('window.__film.audio()');
console.log('audio', JSON.stringify(a));
const parts = [];
for (let i = 0; i < a.chunks; i++) parts.push(await evaluate(`window.__film.chunk(${i})`));
fs.writeFileSync(tmpAudio, Buffer.from(parts.join(''), 'base64'));
try { await send('Browser.close'); } catch {}
chrome.kill();

await new Promise((res, rej) => {
  const mux = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', tmpVideo, '-i', tmpAudio, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
  mux.on('close', c => c === 0 ? res() : rej(new Error('mux failed ' + c)));
});
fs.rmSync(tmpVideo); fs.rmSync(tmpAudio);
try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
console.log('wrote', out, (fs.statSync(out).size / 1048576).toFixed(1) + ' MB');
process.exit(0);
