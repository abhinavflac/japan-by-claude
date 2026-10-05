// Evaluate an expression in the page (test mode) and print the result as JSON.
// node tools/probe.mjs '<expression>'   e.g.  node tools/probe.mjs "window.__perf(1, 30)"
// Module-scope values are reachable through window.__eval('...source...').
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-'));
const port = 9600 + Math.floor(Math.random() * 300);
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1600,900', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 160; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(250); } }
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: 'file:///' + path.join(root, 'index.html').split(path.sep).join('/') + '?test=1&q=high' });
for (let i = 0; i < 300; i++) { await sleep(500); const r = await send('Runtime.evaluate', { expression: '!!window.__ready', returnByValue: true }); if (r.result.value) break; }
const r = await send('Runtime.evaluate', { expression: process.argv[2], returnByValue: true, awaitPromise: true });
if (r.exceptionDetails) console.log('EXC', JSON.stringify(r.exceptionDetails).slice(0, 1500)); else console.log(JSON.stringify(r.result.value ?? r));
await send('Browser.close'); proc.kill();
setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} process.exit(0); }, 300);
