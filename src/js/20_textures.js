/* ============================================================
   Textures: canvas painting, tileable noise, atlases, Japanese type
   ============================================================ */

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
function canvasTex(c, { srgb = true, repeat = false, mips = true, aniso = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso ? MAX_ANISO : 1;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/* ---------- fonts ---------- */
const FONTS = {
  gothic: '"Noto Sans JP","Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif',
  mincho: '"Shippori Mincho B1","Hiragino Mincho ProN","Yu Mincho","MS Mincho",serif',
  brush: '"Yuji Syuku","Shippori Mincho B1","Hiragino Mincho ProN","Yu Mincho",serif',
  heavy: '"Dela Gothic One","Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif',
  round: '"Zen Maru Gothic","Noto Sans JP","Hiragino Maru Gothic ProN","Yu Gothic",sans-serif',
  dot: '"DotGothic16","Noto Sans JP","MS Gothic",monospace',
  retro: '"Kaisei Decol","Shippori Mincho B1","Hiragino Mincho ProN",serif',
  latin: '"IBM Plex Sans Condensed","Arial Narrow","Roboto Condensed",sans-serif',
  mono: '"IBM Plex Mono",ui-monospace,Menlo,monospace',
};
const FONT_FACE = { gothic: 'Noto Sans JP', mincho: 'Shippori Mincho B1', brush: 'Yuji Syuku', heavy: 'Dela Gothic One', round: 'Zen Maru Gothic', dot: 'DotGothic16', retro: 'Kaisei Decol', latin: 'IBM Plex Sans Condensed', mono: 'IBM Plex Mono' };
const FONT_WEIGHTS = { gothic: [500, 700, 900], mincho: [600, 800], brush: [400], heavy: [400], round: [700], dot: [400], retro: [700], latin: [500, 600], mono: [500] };
const FONT_TEXT = {};
for (const k in FONTS) FONT_TEXT[k] = new Set();
const KANA_BASE = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゃゅょっアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポャュョッーァィゥェォ・、。〜！？「」（）0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz¥%:.,-+/★☆♪→←↑↓○●◎×';
// Register text for a family so its glyph subsets get downloaded before painting.
function jt(family, str) { const set = FONT_TEXT[family]; for (const ch of str) set.add(ch); return str; }

async function loadFonts(timeoutMs = 7000) {
  if (!document.fonts || !document.fonts.load) return;
  const jobs = [];
  for (const fam in FONT_TEXT) {
    const chars = [...FONT_TEXT[fam]].join('');
    if (!chars.length && !['latin', 'mono'].includes(fam)) continue;
    const sample = fam === 'latin' || fam === 'mono' ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' : (KANA_BASE + chars);
    for (const w of FONT_WEIGHTS[fam]) jobs.push(document.fonts.load(`${w} 40px "${FONT_FACE[fam]}"`, sample).catch(() => null));
  }
  await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, timeoutMs))]);
}

function font(fam, size, weight = 700) { return `${weight} ${Math.max(1, size).toFixed(1)}px ${FONTS[fam] || fam}`; }

// Fit horizontal text inside a box.
function drawText(ctx, text, x, y, w, h, o = {}) {
  const fam = o.fam || 'gothic', wt = o.weight || 700;
  let size = o.size || h * 0.8;
  ctx.font = font(fam, size, wt);
  const ls = o.letter || 0;
  const measure = () => ctx.measureText(text).width + ls * size * Math.max(0, [...text].length - 1);
  let mw = measure();
  if (mw > w) { size *= w / mw; ctx.font = font(fam, size, wt); mw = measure(); }
  ctx.textBaseline = 'middle';
  ctx.fillStyle = o.color || '#fff';
  const cy = y + h / 2 + (o.dy || 0) * size;
  let sx = o.align === 'left' ? x : o.align === 'right' ? x + w - mw : x + (w - mw) / 2;
  if (o.shadow) { ctx.shadowColor = o.shadow; ctx.shadowBlur = o.shadowBlur || size * 0.25; }
  if (ls) {
    ctx.textAlign = 'left';
    for (const ch of text) {
      if (o.stroke) { ctx.lineWidth = o.strokeW || size * 0.12; ctx.strokeStyle = o.stroke; ctx.strokeText(ch, sx, cy); }
      ctx.fillText(ch, sx, cy);
      sx += ctx.measureText(ch).width + ls * size;
    }
  } else {
    ctx.textAlign = 'left';
    if (o.stroke) { ctx.lineWidth = o.strokeW || size * 0.12; ctx.strokeStyle = o.stroke; ctx.lineJoin = 'round'; ctx.strokeText(text, sx, cy); }
    ctx.fillText(text, sx, cy);
  }
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  return size;
}

// Vertical (tategaki) text, one glyph per cell; long-vowel marks and dashes are rotated.
const ROTATE_V = new Set(['ー', '〜', '～', '-', '—', '…', '(', ')', '（', '）', '「', '」']);
function drawVText(ctx, text, x, y, w, h, o = {}) {
  const chars = [...text];
  const n = chars.length;
  const fam = o.fam || 'gothic', wt = o.weight || 700;
  const gap = o.gap == null ? 0.06 : o.gap;
  let size = Math.min(w * (o.fill || 0.86), h / (n * (1 + gap)));
  ctx.font = font(fam, size, wt);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = o.color || '#fff';
  const total = n * size * (1 + gap);
  let cy = y + (h - total) / 2 + size * (1 + gap) / 2;
  const cx = x + w / 2;
  if (o.shadow) { ctx.shadowColor = o.shadow; ctx.shadowBlur = o.shadowBlur || size * 0.25; }
  for (const ch of chars) {
    ctx.save();
    ctx.translate(cx, cy);
    if (ROTATE_V.has(ch)) ctx.rotate(Math.PI / 2);
    if ('ゃゅょっャュョッァィゥェォ'.includes(ch)) ctx.translate(size * 0.12, -size * 0.12);
    if (o.stroke) { ctx.lineWidth = o.strokeW || size * 0.12; ctx.strokeStyle = o.stroke; ctx.lineJoin = 'round'; ctx.strokeText(ch, 0, 0); }
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    cy += size * (1 + gap);
  }
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  return size;
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/* ---------- tileable value noise ---------- */
function makeNoise2D(seed) {
  const r = mulberry32(seed), P = 256, vals = new Float32Array(P * P);
  for (let i = 0; i < vals.length; i++) vals[i] = r();
  return (x, y, per) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const p = per | 0;
    const x0 = ((xi % p) + p) % p, x1 = (x0 + 1) % p, y0 = ((yi % p) + p) % p, y1 = (y0 + 1) % p;
    const a = vals[y0 * P + x0], b = vals[y0 * P + x1], c = vals[y1 * P + x0], d = vals[y1 * P + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function tileFbm(nz, x, y, per, oct = 4, gain = 0.5) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let o = 0; o < oct; o++) { s += a * nz(x * f, y * f, per * f); n += a; a *= gain; f *= 2; }
  return s / n;
}

// Height field -> tangent-space normal map canvas.
function normalFromHeight(h, size, strength) {
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * size + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ---------- ground textures ---------- */
const TEX = {};

function paintAsphalt() {
  const S = 1024, nz = makeNoise2D(11), nz2 = makeNoise2D(12);
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S), d = img.data, H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const big = tileFbm(nz, u * 6, v * 6, 6, 4);
    const fine = tileFbm(nz2, u * 64, v * 64, 64, 2);
    let g = 0.24 + big * 0.10 + (fine - 0.5) * 0.10;
    H[y * S + x] = fine * 0.6 + big * 0.4;
    const i = (y * S + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = clamp(g, 0, 1) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // aggregate: stone chips catch light, binder pits stay dark
  const r = mulberry32(5);
  for (let k = 0; k < 26000; k++) {
    const x = r() * S, y = r() * S, s = 0.6 + r() * 1.8, l = r();
    const g = l < 0.55 ? 20 + r() * 30 : 110 + r() * 90;
    ctx.fillStyle = `rgba(${g},${g},${g * 0.98},${0.25 + r() * 0.5})`;
    for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) { if (Math.abs(x + ox - S / 2) > S / 2 + 4 || Math.abs(y + oy - S / 2) > S / 2 + 4) continue; ctx.fillRect(x + ox, y + oy, s, s * (0.6 + r() * 0.8)); }
    const hx = x | 0, hy = y | 0; H[(hy % S) * S + (hx % S)] += l < 0.55 ? -0.25 : 0.35;
  }
  // a few hairline cracks
  ctx.strokeStyle = 'rgba(8,8,8,0.55)';
  for (let k = 0; k < 9; k++) {
    let x = r() * S, y = r() * S, a = r() * TAU;
    ctx.lineWidth = 0.8 + r() * 1.2; ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 40 + r() * 80; s++) { a += (r() - 0.5) * 0.7; x += Math.cos(a) * 4; y += Math.sin(a) * 4; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  TEX.asphalt = canvasTex(c, { repeat: true });
  TEX.asphaltN = canvasTex(normalFromHeight(H, S, 2.2), { srgb: false, repeat: true });
}

function paintPavers() {
  // Interlocking concrete pavers, running bond, grey with a few warm stones.
  const S = 512, ppm = 256; // 2 m tile
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  const H = new Float32Array(S * S);
  const r = mulberry32(21);
  ctx.fillStyle = '#3a3a38'; ctx.fillRect(0, 0, S, S);
  const bw = 0.2 * ppm, bh = 0.1 * ppm;
  const tones = ['#8d8a84', '#7f7d78', '#97938b', '#85827c', '#a29b8f', '#77756f', '#8f857a'];
  for (let row = 0; row < S / bh; row++) {
    const off = (row % 2) * bw / 2;
    for (let col = -1; col < S / bw + 1; col++) {
      const x = col * bw + off, y = row * bh;
      const t = tones[Math.floor(r() * tones.length)];
      ctx.fillStyle = t; ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      ctx.fillStyle = `rgba(0,0,0,${r() * 0.12})`; ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      for (let k = 0; k < 40; k++) { const g = r() * 255; ctx.fillStyle = `rgba(${g},${g},${g},0.08)`; ctx.fillRect(x + 2 + r() * (bw - 4), y + 2 + r() * (bh - 4), 1.2, 1.2); }
      for (let yy = Math.max(0, y | 0); yy < Math.min(S, y + bh); yy++) for (let xx = Math.max(0, x | 0); xx < Math.min(S, x + bw); xx++) {
        const ex = Math.min(xx - x, x + bw - xx), ey = Math.min(yy - y, y + bh - yy);
        H[yy * S + xx] = Math.min(1, Math.min(ex, ey) / 3);
      }
    }
  }
  TEX.pavers = canvasTex(c, { repeat: true });
  TEX.paversN = canvasTex(normalFromHeight(H, S, 1.6), { srgb: false, repeat: true });
}

function paintSmallTextures() {
  const r = mulberry32(31);
  // concrete (alley, curbs, plinths)
  {
    const S = 512, nz = makeNoise2D(32);
    const c = makeCanvas(S, S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = tileFbm(nz, x / S * 8, y / S * 8, 8, 5);
      const g = 120 + n * 60;
      const i = (y * S + x) * 4; d[i] = g; d[i + 1] = g * 0.99; d[i + 2] = g * 0.96; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    for (let k = 0; k < 9000; k++) { const g = r() * 255; ctx.fillStyle = `rgba(${g},${g},${g},${r() * 0.15})`; ctx.fillRect(r() * S, r() * S, 1.5, 1.5); }
    TEX.concrete = canvasTex(c, { repeat: true });
  }
  // granite curb
  {
    const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#9a9894'; ctx.fillRect(0, 0, S, S);
    for (let k = 0; k < 7000; k++) { const g = r() < 0.5 ? 40 + r() * 50 : 170 + r() * 80; ctx.fillStyle = `rgba(${g},${g},${g},${0.3 + r() * 0.5})`; ctx.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
    TEX.granite = canvasTex(c, { repeat: true });
  }
  // tactile guide blocks (yellow, bars)
  {
    const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d'), H = new Float32Array(S * S);
    ctx.fillStyle = '#c99a12'; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, S - 2, S - 2);
    for (let i = 0; i < 4; i++) {
      const x = 22 + i * 60;
      const g = ctx.createLinearGradient(x, 0, x + 26, 0); g.addColorStop(0, '#e6b52a'); g.addColorStop(0.5, '#f3c84a'); g.addColorStop(1, '#a87d0c');
      ctx.fillStyle = g; roundRect(ctx, x, 14, 26, S - 28, 12); ctx.fill();
      for (let y = 14; y < S - 14; y++) for (let xx = x; xx < x + 26; xx++) H[y * S + xx] = Math.sin((xx - x) / 26 * Math.PI);
    }
    TEX.tactile = canvasTex(c, { repeat: true });
    TEX.tactileN = canvasTex(normalFromHeight(H, S, 3), { srgb: false, repeat: true });
  }
  // gravel (shrine)
  {
    const S = 512, c = makeCanvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#6d6a64'; ctx.fillRect(0, 0, S, S);
    for (let k = 0; k < 16000; k++) { const g = 80 + r() * 120; ctx.fillStyle = `rgb(${g},${g * 0.98},${g * 0.94})`; ctx.beginPath(); ctx.ellipse(r() * S, r() * S, 1 + r() * 3, 1 + r() * 2.4, r() * 3, 0, TAU); ctx.fill(); }
    TEX.gravel = canvasTex(c, { repeat: true });
  }
  // roof membrane / weathered concrete
  {
    const S = 512, nz = makeNoise2D(41), c = makeCanvas(S, S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = tileFbm(nz, x / S * 5, y / S * 5, 5, 5);
      const g = 70 + n * 70; const i = (y * S + x) * 4; d[i] = g * 0.98; d[i + 1] = g; d[i + 2] = g * 0.97; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(20,20,20,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * S / 4, 0); ctx.lineTo(i * S / 4, S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * S / 4); ctx.lineTo(S, i * S / 4); ctx.stroke(); }
    TEX.roof = canvasTex(c, { repeat: true });
  }
  // wood planks
  {
    const S = 512, c = makeCanvas(S, S), ctx = c.getContext('2d');
    for (let p = 0; p < 8; p++) {
      const base = 70 + r() * 30;
      ctx.fillStyle = `rgb(${base + 30},${base * 0.75 + 10},${base * 0.5})`; ctx.fillRect(0, p * 64, S, 64);
      for (let k = 0; k < 60; k++) {
        ctx.strokeStyle = `rgba(30,15,5,${0.05 + r() * 0.12})`; ctx.lineWidth = 0.5 + r() * 1.5; ctx.beginPath();
        const y0 = p * 64 + r() * 64; ctx.moveTo(0, y0);
        for (let x = 0; x <= S; x += 32) ctx.lineTo(x, y0 + Math.sin(x * 0.01 + k) * 2.5 + (r() - 0.5) * 1.5);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, p * 64, S, 2);
    }
    TEX.wood = canvasTex(c, { repeat: true });
  }
  // corrugated metal (shutters, sheds)
  {
    const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d');
    for (let y = 0; y < S; y++) { const s = 0.5 + 0.5 * Math.sin(y / S * TAU * 16); const g = 110 + s * 70; ctx.fillStyle = `rgb(${g},${g},${g * 1.02})`; ctx.fillRect(0, y, S, 1); }
    for (let k = 0; k < 30; k++) { ctx.fillStyle = `rgba(90,60,40,${r() * 0.12})`; ctx.fillRect(r() * S, r() * S * 0.3 + S * 0.7, 2 + r() * 6, 20 + r() * 60); }
    TEX.shutter = canvasTex(c, { repeat: true });
  }
}

// Puddle mask: R/G fbm at two scales, B fine noise. World-space tiled.
function makePuddleTexture() {
  const S = 512, nzA = makeNoise2D(51), nzB = makeNoise2D(52), nzC = makeNoise2D(53);
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = (y * S + x) * 4;
    data[i] = tileFbm(nzA, u * 5, v * 5, 5, 5, 0.55) * 255;
    data[i + 1] = tileFbm(nzB, u * 3, v * 3, 3, 4, 0.5) * 255;
    data[i + 2] = tileFbm(nzC, u * 24, v * 24, 24, 3) * 255;
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  TEX.puddle = t;
}

function makeSpriteTextures() {
  // soft radial glow
  {
    const S = 128, c = makeCanvas(S, S), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,0.55)'); g.addColorStop(0.4, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    TEX.glow = canvasTex(c, { srgb: false });
  }
  // steam puff
  {
    const S = 128, c = makeCanvas(S, S), ctx = c.getContext('2d'), r = mulberry32(61);
    for (let k = 0; k < 26; k++) {
      const x = S / 2 + (r() - 0.5) * S * 0.42, y = S / 2 + (r() - 0.5) * S * 0.42, rad = S * (0.12 + r() * 0.22);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    }
    TEX.puff = canvasTex(c, { srgb: false });
  }
  // light pool (elliptic, for headlight pools on the road)
  {
    const S = 128, c = makeCanvas(S, S), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S * 0.35, 0, S / 2, S * 0.35, S * 0.62);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    TEX.pool = canvasTex(c, { srgb: false });
  }
  // blob shadow
  {
    const S = 64, c = makeCanvas(S, S), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.6, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    TEX.blob = canvasTex(c, { srgb: false });
  }
  // raindrops on glass: normal-ish map (RG offset, B mask)
  {
    const S = 512, c = makeCanvas(S, S), ctx = c.getContext('2d'), r = mulberry32(71);
    ctx.fillStyle = 'rgb(128,128,0)'; ctx.fillRect(0, 0, S, S);
    const drop = (x, y, rad, elong) => {
      for (let yy = -rad * elong; yy < rad * elong; yy++) for (let xx = -rad; xx < rad; xx++) {
        const nx = xx / rad, ny = yy / (rad * elong), d2 = nx * nx + ny * ny;
        if (d2 > 1) continue;
        const nz = Math.sqrt(1 - d2);
        ctx.fillStyle = `rgb(${(nx * 0.5 + 0.5) * 255 | 0},${(ny * 0.5 + 0.5) * 255 | 0},${(0.35 + nz * 0.65) * 255 | 0})`;
        ctx.fillRect(x + xx, y + yy, 1, 1);
      }
    };
    for (let k = 0; k < 520; k++) { const rad = 1.5 + Math.pow(r(), 3) * 9; drop(r() * S, r() * S, rad, 1 + r() * 0.3); }
    for (let k = 0; k < 14; k++) { // running streaks
      let x = r() * S, y = r() * S * 0.5; const rad = 2 + r() * 2;
      for (let s = 0; s < 40; s++) { drop(x, y, rad * (1 - s / 60), 1.1); y += rad * 0.9; x += (r() - 0.5) * 1.5; }
    }
    TEX.drops = canvasTex(c, { srgb: false, repeat: true, mips: false });
  }
}

/* ---------- atlases ---------- */
class Atlas {
  constructor(w, h, layers = 1, name = '') {
    this.w = w; this.h = h; this.name = name; this.pad = 4;
    this.canvases = []; this.ctxs = [];
    for (let i = 0; i < layers; i++) { const c = makeCanvas(w, h); this.canvases.push(c); this.ctxs.push(c.getContext('2d')); }
    this.sky = [{ x: 0, y: 0, w }]; this.full = false; this.used = 0; this.bottom = 0; this.shelves = this.sky;
  }
  get ctx() { return this.ctxs[0]; }
  _fit(i, w, h) {
    const sky = this.sky;
    if (sky[i].x + w > this.w) return -1;
    let left = w, j = i, y = 0;
    while (left > 0) {
      if (j >= sky.length) return -1;
      y = Math.max(y, sky[j].y);
      if (y + h > this.h) return -1;
      left -= sky[j].w; j++;
    }
    return y;
  }
  // Skyline bottom-left packing.
  alloc(w, h) {
    w = Math.max(2, Math.ceil(w)); h = Math.max(2, Math.ceil(h));
    if (w > this.w) { h = Math.ceil(h * this.w / w); w = this.w; }
    const pw = w + this.pad, ph = h + this.pad;
    let best = -1, bestTop = Infinity, bestW = Infinity;
    for (let i = 0; i < this.sky.length; i++) {
      const y = this._fit(i, pw, ph);
      if (y < 0) continue;
      if (y + ph < bestTop || (y + ph === bestTop && this.sky[i].w < bestW)) { best = i; bestTop = y + ph; bestW = this.sky[i].w; }
    }
    if (best < 0) {
      if (!this.full) console.warn('atlas full:', this.name);
      this.full = true;
      return this._uv({ x: 0, y: 0, w: Math.min(w, 64), h: Math.min(h, 64) });
    }
    const x = this.sky[best].x, y = bestTop - ph;
    this.sky.splice(best, 0, { x, y: bestTop, w: pw });
    for (let i = best + 1; i < this.sky.length; i++) {
      const s = this.sky[i], pr = this.sky[i - 1];
      const over = pr.x + pr.w - s.x;
      if (over <= 0) break;
      s.x += over; s.w -= over;
      if (s.w <= 0) { this.sky.splice(i, 1); i--; } else break;
    }
    for (let i = 0; i < this.sky.length - 1; i++) if (this.sky[i].y === this.sky[i + 1].y) { this.sky[i].w += this.sky[i + 1].w; this.sky.splice(i + 1, 1); i--; }
    this.used += w * h; this.bottom = Math.max(this.bottom, bestTop);
    return this._uv({ x, y, w, h });
  }
  _uv(r) {
    // inset by half a texel to keep bilinear taps inside the rect
    r.u0 = (r.x + 0.5) / this.w; r.u1 = (r.x + r.w - 0.5) / this.w;
    r.v1 = 1 - (r.y + 0.5) / this.h; r.v0 = 1 - (r.y + r.h - 0.5) / this.h;
    return r;
  }
  textures(opts) { return this.canvases.map((c, i) => canvasTex(c, Array.isArray(opts) ? opts[i] : opts)); }
}
// Sub-rectangle of a rect in normalized (0..1, y down) coords.
function subRect(r, fx0, fy0, fx1, fy1) {
  const s = { x: r.x + r.w * fx0, y: r.y + r.h * fy0, w: r.w * (fx1 - fx0), h: r.h * (fy1 - fy0) };
  const W = (r.u1 - r.u0) / (r.w - 1 || 1), H = (r.v1 - r.v0) / (r.h - 1 || 1);
  s.u0 = r.u0 + (s.x - r.x) * W; s.u1 = r.u0 + (s.x + s.w - r.x) * W;
  s.v1 = r.v1 - (s.y - r.y) * H; s.v0 = r.v1 - (s.y + s.h - r.y) * H;
  return s;
}

// A plane geometry with UVs pointing at an atlas rect (and optionally flipped horizontally).
function atlasPlane(rect, flipX = false) {
  const g = G.plane.clone();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i), v = uv.getY(i);
    if (flipX) u = 1 - u;
    uv.setXY(i, rect.u0 + u * (rect.u1 - rect.u0), rect.v0 + v * (rect.v1 - rect.v0));
  }
  return g;
}
// Box whose +z/-z faces show an atlas rect (sides and top get a corner texel of it).
function atlasBox(rect, sideRect) {
  const g = G.box.clone();
  const uv = g.attributes.uv;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each)
  for (let f = 0; f < 6; f++) {
    const rr = (f === 4 || f === 5) ? rect : (sideRect || rect);
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      let u = uv.getX(i), v = uv.getY(i);
      if (f !== 4 && f !== 5 && !sideRect) { u = 0.02; v = 0.98; }
      uv.setXY(i, rr.u0 + u * (rr.u1 - rr.u0), rr.v0 + v * (rr.v1 - rr.v0));
    }
  }
  return g;
}
