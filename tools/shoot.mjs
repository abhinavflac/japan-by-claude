// Headless stills via the Chrome DevTools protocol.
// node tools/shoot.mjs <outDir> '<json shots>' [width] [height] [query]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2];
const shots = JSON.parse(process.argv[3] || '[{"cam":1,"u":0.5,"t":20}]');
const W = +(process.argv[4] || 1600), H = +(process.argv[5] || 900);
const query = process.argv[6] || 'test=1&q=high';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const url = 'file:///' + path.join(root, 'index.html').split(path.sep).join('/') + '?' + query;
fs.mkdirSync(outDir, { recursive: true });
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const prof = path.join(outDir, '_prof');
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let version;
for (let i = 0; i < 60; i++) { try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(250); } }
if (!version) { console.error('chrome did not start'); process.exit(1); }
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const logs = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 1500));
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 3000));
  if (m.method === 'Log.entryAdded') logs.push(`[log ${m.params.entry.level}] ` + m.params.entry.text.slice(0, 800));
});
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const t0 = Date.now();
await send('Page.navigate', { url });
let ready = false;
for (let i = 0; i < 600; i++) {
  await sleep(500);
  const r = await send('Runtime.evaluate', { expression: 'JSON.stringify({ready: !!window.__ready, err: window.__error || null, gl: (()=>{try{const c=document.getElementById("view").getContext("webgl2");const e=c.getExtension("WEBGL_debug_renderer_info");return c.getParameter(e.UNMASKED_RENDERER_WEBGL)}catch(e){return "?"}})(), txt: (document.getElementById("itext")||{}).textContent})', returnByValue: true });
  const v = JSON.parse(r.result.value);
  if (v.err) { console.log('BOOT ERROR', v.err); break; }
  if (v.ready) { ready = true; console.log('ready in', ((Date.now() - t0) / 1000).toFixed(1), 's on', v.gl); break; }
  if (i % 20 === 19) console.log('...', v.txt);
}
if (ready) {
  for (const s of shots) {
    const ts = Date.now();
    const r = await send('Runtime.evaluate', { expression: `window.__shot(${s.cam}, ${s.u ?? 0.5}, ${s.t ?? 20}, ${JSON.stringify(s.opts || {})}).then(x => JSON.stringify(x))`, awaitPromise: true, returnByValue: true });
    const shotR = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    const name = s.name || `cam${String(s.cam).padStart(2, '0')}_${s.u ?? 0.5}`;
    fs.writeFileSync(path.join(outDir, name + '.jpg'), Buffer.from(shotR.data, 'base64'));
    console.log(name, r.result?.value || JSON.stringify(r.exceptionDetails || r), ((Date.now() - ts) / 1000).toFixed(1) + 's');
  }
}
console.log(logs.slice(0, 60).join('\n'));
try { await send('Browser.close'); } catch {}
setTimeout(() => { try { proc.kill(); } catch {} process.exit(0); }, 500);
