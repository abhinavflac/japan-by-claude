// Headless stills via the Chrome DevTools protocol.
// node tools/shoot.mjs <outDir> '<json shots>' [width] [height] [query]
// A shot is { cam, u, t, opts, name } for a camera, { explore: [pos, target], t, name } for the free camera,
// or { walk: [x, z, yaw, pitch, dist], t, opts, name } for the walking view;
// eval (an expression) runs after the frame is set up and before the capture, e.g. to open a panel.
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './cdp.mjs';

const outDir = process.argv[2];
const shots = JSON.parse(process.argv[3] || '[{"cam":1,"u":0.5,"t":20}]');
const W = +(process.argv[4] || 1600), H = +(process.argv[5] || 900);
const query = process.argv[6] || 'test=1&q=high';
fs.mkdirSync(outDir, { recursive: true });
const page = await launch({ width: W, height: H, query });
const t0 = Date.now();
try {
  await page.open(txt => console.log('...', txt));
  console.log('ready in', ((Date.now() - t0) / 1000).toFixed(1), 's on', await page.evaluate('(() => { try { const c = document.getElementById("view").getContext("webgl2"); return c.getParameter(c.getExtension("WEBGL_debug_renderer_info").UNMASKED_RENDERER_WEBGL); } catch (e) { return "?"; } })()'));
  for (const s of shots) {
    const ts = Date.now();
    const expr = s.explore ? `window.__explore(${JSON.stringify(s.explore[0])}, ${JSON.stringify(s.explore[1])}, ${s.t ?? 20}, ${JSON.stringify(s.opts || {})})`
      : s.walk ? `window.__walk(${s.walk.join(', ')}, ${s.t ?? 20}, ${JSON.stringify(s.opts || {})})`
      : `window.__shot(${s.cam}, ${s.u ?? 0.5}, ${s.t ?? 20}, ${JSON.stringify(s.opts || {})})`;
    let r;
    try { r = JSON.stringify(await page.evaluate(expr)); if (s.eval) r += ' ' + JSON.stringify(await page.evaluate(s.eval)); } catch (e) { r = 'EXC ' + e.message; }
    if (s.opts?.hideUI) await new Promise(res => setTimeout(res, 600));   // let the interface finish fading out
    const shotR = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    const name = s.name || `cam${String(s.cam).padStart(2, '0')}_${s.u ?? 0.5}`;
    fs.writeFileSync(path.join(outDir, name + '.jpg'), Buffer.from(shotR.data, 'base64'));
    console.log(name, r, ((Date.now() - ts) / 1000).toFixed(1) + 's');
  }
} catch (e) { console.log('ERROR', e.message); }
console.log(page.logs.slice(0, 60).join('\n'));
await page.close();
process.exit(0);
