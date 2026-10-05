// Headless Chrome over the DevTools protocol, shared by the test tools. three.js is served from
// tools/three170.js, so the page runs without reaching the CDN. Set CHROME on non-Windows machines.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ width = 1600, height = 900, query = 'test=1&q=high', profile, args = [] } = {}) {
  const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const prof = profile || fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const gpu = process.platform === 'win32' ? ['--use-angle=d3d11'] : process.getuid?.() === 0 ? ['--no-sandbox'] : [];
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${width},${height}`, '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--ignore-gpu-blocklist', '--enable-gpu', ...gpu, '--enable-unsafe-swiftshader', '--allow-file-access-from-files',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', ...args, 'about:blank'], { stdio: 'ignore' });
  let list;
  for (let i = 0; i < 160 && !list; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(250); } }
  if (!list) throw new Error('chrome did not start: ' + chrome);
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map(), handlers = new Map(), logs = [];
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const on = (method, fn) => handlers.set(method, fn);
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
    if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 1500));
    if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 3000));
    if (m.method === 'Log.entryAdded') logs.push(`[log ${m.params.entry.level}] ` + m.params.entry.text.slice(0, 800));
    handlers.get(m.method)?.(m.params);
  });
  const three = fs.readFileSync(path.join(root, 'tools', 'three170.js')).toString('base64');
  on('Fetch.requestPaused', p => send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, body: three,
    responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }, { name: 'Access-Control-Allow-Origin', value: '*' }] }));
  await send('Fetch.enable', { patterns: [{ urlPattern: '*cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js' }] });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 1500));
    return r.result.value;
  };
  // Opens the page and waits for window.__ready (or a boot error).
  const open = async (onWait) => {
    await send('Page.navigate', { url: pathToFileURL(path.join(root, 'index.html')).href + '?' + query });
    for (let i = 0; i < 1200; i++) {
      await sleep(500);
      const v = await evaluate('({ ready: !!window.__ready, err: window.__error || null, txt: (document.getElementById("itext") || {}).textContent })');
      if (v.err) throw new Error('boot error: ' + v.err);
      if (v.ready) return;
      if (onWait && i % 20 === 19) onWait(v.txt);
    }
    throw new Error('page never became ready');
  };
  const close = async () => {
    try { await send('Browser.close'); } catch {}
    try { proc.kill(); } catch {}
    await sleep(300);
    if (!profile) try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
  };
  return { send, on, evaluate, open, close, logs };
}
