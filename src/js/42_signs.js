/* ============================================================
   Sign painters. Everything is drawn into the shared sign atlas
   and returns the atlas rect it occupies.
   ============================================================ */

const LANTERNS = [];   // { p, size, rect, color, phase } chōchin, swayed by the effects module
const EMITTERS = [];   // steam / smoke sources
const DOORS = [];      // animated doors
const SPOTS = [];      // places where idle people sit, stand or work
const PRACTICAL = [];  // anchors for the few real lights

function signRect(wm, hm, ppm = 100) { return ATL.sign.alloc(wm * ppm * QUALITY.atlas, hm * ppm * QUALITY.atlas); }
const PAINT_CACHE = new Map();
function memo(name, fn) {
  return (...args) => {
    const key = name + JSON.stringify(args);
    if (PAINT_CACHE.has(key)) return PAINT_CACHE.get(key);
    const r = fn(...args); PAINT_CACHE.set(key, r); return r;
  };
}

const paintFascia = memo('paintFascia', function (text, o = {}) {
  const wm = o.w || 4, hm = o.h || 0.7, ppm = o.ppm || 90;
  const r = signRect(wm, hm, ppm), c = ATL.sign.ctx;
  if (o.grad) { const g = c.createLinearGradient(r.x, r.y, r.x, r.y + r.h); g.addColorStop(0, o.grad[0]); g.addColorStop(1, o.grad[1]); c.fillStyle = g; }
  else c.fillStyle = o.bg || '#f3efe5';
  c.fillRect(r.x, r.y, r.w, r.h);
  if (o.stripe) { c.fillStyle = o.stripe; c.fillRect(r.x, r.y + r.h * 0.84, r.w, r.h * 0.16); if (o.stripe2) { c.fillStyle = o.stripe2; c.fillRect(r.x, r.y + r.h * 0.74, r.w, r.h * 0.1); } }
  if (o.border) { c.strokeStyle = o.border; c.lineWidth = r.h * 0.06; c.strokeRect(r.x + c.lineWidth / 2, r.y + c.lineWidth / 2, r.w - c.lineWidth, r.h - c.lineWidth); }
  const pad = o.pad == null ? 0.08 : o.pad;
  const tw = o.sub ? 0.62 : 0.86;
  drawText(c, text, r.x + r.w * pad, r.y + r.h * (o.sub ? 0.08 : 0.12), r.w * (1 - pad * 2) * (o.textW || 1), r.h * (o.sub ? 0.58 : 0.72), { fam: o.fam || 'gothic', weight: o.weight || 900, color: o.fg || '#1a1a1a', letter: o.letter || 0, align: o.align, stroke: o.stroke });
  if (o.sub) drawText(c, o.sub, r.x + r.w * pad, r.y + r.h * 0.66, r.w * (1 - pad * 2), r.h * 0.26, { fam: o.subFam || 'gothic', weight: 700, color: o.subColor || o.fg || '#333', letter: 0.05, align: o.align });
  if (o.icon) o.icon(c, r);
  return r;
});

const paintVSign = memo('paintVSign', function (text, o = {}) {
  const wm = o.w || 0.6, hm = o.h || 2.4, ppm = o.ppm || 100;
  const r = signRect(wm, hm, ppm), c = ATL.sign.ctx;
  c.fillStyle = o.bg || '#fff'; c.fillRect(r.x, r.y, r.w, r.h);
  if (o.border) { c.strokeStyle = o.border; c.lineWidth = r.w * 0.06; c.strokeRect(r.x + c.lineWidth, r.y + c.lineWidth, r.w - c.lineWidth * 2, r.h - c.lineWidth * 2); }
  drawVText(c, text, r.x + r.w * 0.1, r.y + r.h * 0.06, r.w * 0.8, r.h * 0.88, { fam: o.fam || 'gothic', weight: o.weight || 900, color: o.fg || '#c00', gap: o.gap, stroke: o.stroke, strokeW: o.strokeW });
  return r;
});

const paintLantern = memo('paintLantern', function (text, o = {}) {
  // unrolled cylinder: paper with ribs, black bands top and bottom, brush text
  const r = signRect(0.9, 0.62, 120), c = ATL.sign.ctx;
  const base = o.color || '#c8281e';
  const g = c.createLinearGradient(r.x, 0, r.x + r.w, 0);
  g.addColorStop(0, shade6(base, 0.55)); g.addColorStop(0.5, shade6(base, 1.12)); g.addColorStop(1, shade6(base, 0.55));
  c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
  c.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = r.y + r.h * 0.12; y < r.y + r.h * 0.9; y += r.h * 0.055) c.fillRect(r.x, y, r.w, Math.max(1, r.h * 0.008));
  c.fillStyle = '#141414'; c.fillRect(r.x, r.y, r.w, r.h * 0.1); c.fillRect(r.x, r.y + r.h * 0.9, r.w, r.h * 0.1);
  for (const cx of [0.25, 0.75]) drawVText(c, text, r.x + r.w * (cx - 0.13), r.y + r.h * 0.13, r.w * 0.26, r.h * 0.74, { fam: o.fam || 'brush', weight: 400, color: o.fg || '#111' });
  return r;
});
function shade6(hex, k) { return shade(hex, k); }

const paintNoren = memo('paintNoren', function (text, o = {}) {
  const wm = o.w || 1.8, hm = o.h || 0.9;
  const r = signRect(wm, hm, 110), c = ATL.sign.ctx;
  c.fillStyle = o.bg || '#1d2a44'; c.fillRect(r.x, r.y, r.w, r.h);
  c.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = r.x; x < r.x + r.w; x += 3) c.fillRect(x, r.y, 1, r.h);
  const n = o.panels || 3;
  if (o.vertical) {
    const chars = [...text]; const per = Math.ceil(chars.length / n);
    for (let i = 0; i < n; i++) drawVText(c, chars.slice(i * per, i * per + per).join(''), r.x + r.w * (i / n) + r.w / n * 0.15, r.y + r.h * 0.12, r.w / n * 0.7, r.h * 0.8, { fam: o.fam || 'brush', weight: 400, color: o.fg || '#f4efe4' });
  } else {
    drawText(c, text, r.x + r.w * 0.06, r.y + r.h * 0.2, r.w * 0.88, r.h * 0.6, { fam: o.fam || 'brush', weight: 400, color: o.fg || '#f4efe4', letter: 0.6 });
  }
  // slits between panels (painted dark; the geometry also splits)
  c.fillStyle = 'rgba(0,0,0,0.6)';
  for (let i = 1; i < n; i++) c.fillRect(r.x + r.w * i / n - 1, r.y + r.h * 0.2, 2, r.h * 0.8);
  return r;
});

const paintBoard = memo('paintBoard', function (lines, o = {}) {
  // chalk A-frame or menu board
  const wm = o.w || 0.55, hm = o.h || 0.8;
  const r = signRect(wm, hm, 150), c = ATL.sign.ctx;
  c.fillStyle = o.frame || '#5a3d26'; c.fillRect(r.x, r.y, r.w, r.h);
  c.fillStyle = o.bg || '#1e2a24'; c.fillRect(r.x + r.w * 0.06, r.y + r.w * 0.06, r.w * 0.88, r.h - r.w * 0.12);
  const lh = (r.h - r.w * 0.2) / lines.length;
  lines.forEach((t, i) => {
    const col = i === 0 ? (o.title || '#f6d27a') : (o.fg || '#eceae2');
    drawText(c, t, r.x + r.w * 0.12, r.y + r.w * 0.1 + i * lh, r.w * 0.76, lh * 0.8, { fam: o.fam || 'round', weight: 700, color: col, align: i === 0 ? 'center' : 'left' });
  });
  return r;
});

const paintPoster = memo('paintPoster', function (kind) {
  const r = signRect(0.42, 0.6, 160), c = ATL.sign.ctx;
  const X = r.x, Y = r.y, Wd = r.w, Hd = r.h;
  if (kind === 'festival') {
    const g = c.createLinearGradient(X, Y, X, Y + Hd); g.addColorStop(0, '#f4e3c2'); g.addColorStop(1, '#e8b56a'); c.fillStyle = g; c.fillRect(X, Y, Wd, Hd);
    c.fillStyle = '#b2241a'; c.beginPath(); c.arc(X + Wd * 0.7, Y + Hd * 0.3, Wd * 0.2, 0, TAU); c.fill();
    drawVText(c, TX.posters[1], X + Wd * 0.12, Y + Hd * 0.08, Wd * 0.3, Hd * 0.6, { fam: 'mincho', weight: 800, color: '#2a1810' });
    drawText(c, TX.screen[3], X, Y + Hd * 0.78, Wd, Hd * 0.12, { fam: 'gothic', weight: 900, color: '#b2241a' });
  } else if (kind === 'oden') {
    c.fillStyle = '#fff8e8'; c.fillRect(X, Y, Wd, Hd);
    c.fillStyle = '#e94b1b'; c.fillRect(X, Y, Wd, Hd * 0.22);
    drawVText(c, TX.conbini.posters[0], X + Wd * 0.3, Y + Hd * 0.25, Wd * 0.4, Hd * 0.72, { fam: 'heavy', color: '#3b2311' });
    c.fillStyle = '#c7a066'; c.beginPath(); c.ellipse(X + Wd * 0.18, Y + Hd * 0.6, Wd * 0.1, Hd * 0.06, 0, 0, TAU); c.fill();
  } else if (kind === 'camera') {
    c.fillStyle = '#ffd400'; c.fillRect(X, Y, Wd, Hd);
    c.fillStyle = '#111'; c.fillRect(X + Wd * 0.25, Y + Hd * 0.12, Wd * 0.5, Hd * 0.18);
    drawVText(c, TX.posters[0], X + Wd * 0.3, Y + Hd * 0.34, Wd * 0.4, Hd * 0.62, { fam: 'gothic', weight: 900, color: '#111' });
  } else if (kind === 'garbage') {
    c.fillStyle = '#eef4ea'; c.fillRect(X, Y, Wd, Hd);
    c.fillStyle = '#2f7d4a'; c.fillRect(X, Y, Wd, Hd * 0.2);
    drawText(c, TX.posters[3], X, Y + Hd * 0.03, Wd, Hd * 0.14, { fam: 'gothic', weight: 900, color: '#fff' });
    drawText(c, TX.posters[4], X + Wd * 0.05, Y + Hd * 0.3, Wd * 0.55, Hd * 0.12, { fam: 'gothic', weight: 700, color: '#c0392b', align: 'left' });
    drawText(c, TX.posters[5], X + Wd * 0.6, Y + Hd * 0.3, Wd * 0.35, Hd * 0.12, { fam: 'gothic', weight: 700, color: '#333' });
    drawText(c, TX.posters[6], X + Wd * 0.05, Y + Hd * 0.5, Wd * 0.55, Hd * 0.12, { fam: 'gothic', weight: 700, color: '#1f5fa8', align: 'left' });
  } else if (kind === 'cat') {
    c.fillStyle = '#ffffff'; c.fillRect(X, Y, Wd, Hd);
    drawText(c, TX.posters[8], X, Y + Hd * 0.04, Wd, Hd * 0.16, { fam: 'gothic', weight: 900, color: '#c0392b' });
    c.fillStyle = '#d39a52'; c.fillRect(X + Wd * 0.15, Y + Hd * 0.25, Wd * 0.7, Hd * 0.4);
    c.fillStyle = '#5a3c22'; c.beginPath(); c.ellipse(X + Wd * 0.5, Y + Hd * 0.47, Wd * 0.2, Hd * 0.12, 0, 0, TAU); c.fill();
    drawText(c, TX.posters[9], X, Y + Hd * 0.72, Wd, Hd * 0.12, { fam: 'gothic', weight: 700, color: '#222' });
  } else if (kind === 'bike') {
    c.fillStyle = '#fff'; c.fillRect(X, Y, Wd, Hd); c.strokeStyle = '#d0221c'; c.lineWidth = Wd * 0.05; c.strokeRect(X + Wd * 0.05, Y + Wd * 0.05, Wd * 0.9, Hd - Wd * 0.1);
    drawVText(c, TX.posters[2], X + Wd * 0.3, Y + Hd * 0.08, Wd * 0.4, Hd * 0.84, { fam: 'gothic', weight: 900, color: '#d0221c' });
  } else {
    c.fillStyle = '#f2efe7'; c.fillRect(X, Y, Wd, Hd);
    drawVText(c, TX.posters[10], X + Wd * 0.3, Y + Hd * 0.08, Wd * 0.4, Hd * 0.84, { fam: 'gothic', weight: 900, color: '#1b4f8a' });
  }
  return r;
});

/* ---------- painted interiors seen through shop glass ---------- */
const paintInterior = (kind, wm, hm) => paintInteriorM(kind, Math.round(wm * 2) / 2, Math.round(hm * 2) / 2);
const paintInteriorM = memo('paintInterior', function (kind, wm, hm) {
  const ppm = 40;
  const r = signRect(wm, hm, ppm), c = ATL.sign.ctx;
  const X = r.x, Y = r.y, Wd = r.w, Hd = r.h, P = Wd / wm;
  const R = mulberry32((wm * 1000 + hm * 77 + kind.length * 13) | 0);
  const floorY = Y + Hd * 0.88;
  const person = (x, scale, col) => {
    c.fillStyle = col || 'rgba(30,26,24,0.85)';
    c.beginPath(); c.arc(x, floorY - 1.62 * P * scale, 0.12 * P * scale, 0, TAU); c.fill();
    c.fillRect(x - 0.2 * P * scale, floorY - 1.48 * P * scale, 0.4 * P * scale, 0.75 * P * scale);
    c.fillRect(x - 0.15 * P * scale, floorY - 0.75 * P * scale, 0.12 * P * scale, 0.75 * P * scale);
    c.fillRect(x + 0.03 * P * scale, floorY - 0.75 * P * scale, 0.12 * P * scale, 0.75 * P * scale);
  };
  const shelves = (x0, x1, top, rows, palette) => {
    for (let i = 0; i < rows; i++) {
      const y = top + i * (floorY - top) / rows;
      c.fillStyle = '#d9d9d4'; c.fillRect(x0, y + (floorY - top) / rows - 3, x1 - x0, 3);
      for (let x = x0 + 2; x < x1 - 4; x += 3 + R() * 6) {
        const h = (floorY - top) / rows * (0.45 + R() * 0.45);
        c.fillStyle = palette[Math.floor(R() * palette.length)];
        c.fillRect(x, y + (floorY - top) / rows - 3 - h, 2 + R() * 4, h);
      }
    }
  };
  const products = ['#e94b3c', '#f4c430', '#3c78d8', '#ffffff', '#6aa84f', '#e69138', '#c27ba0', '#f6f0d8', '#1c4587', '#cc0000', '#93c47d'];
  switch (kind) {
    case 'conbini': {
      c.fillStyle = '#f4f6f6'; c.fillRect(X, Y, Wd, Hd);
      // fridge doors along the back wall
      for (let x = X + 4; x < X + Wd - 0.9 * P; x += 0.9 * P) {
        c.fillStyle = '#c9d6dc'; c.fillRect(x, Y + Hd * 0.12, 0.86 * P, floorY - Y - Hd * 0.12);
        c.fillStyle = '#fbfdff'; c.fillRect(x + 3, Y + Hd * 0.14, 0.86 * P - 6, floorY - Y - Hd * 0.16);
        for (let row = 0; row < 5; row++) for (let k = 0; k < 6; k++) { c.fillStyle = products[Math.floor(R() * products.length)]; c.fillRect(x + 5 + k * 0.13 * P, Y + Hd * 0.18 + row * Hd * 0.13, 0.08 * P, Hd * 0.09); }
      }
      c.fillStyle = '#3f8f5a'; c.fillRect(X, Y, Wd, Hd * 0.06);
      break;
    }
    case 'laundry': {
      c.fillStyle = '#e8eef0'; c.fillRect(X, Y, Wd, Hd);
      for (let x = X + 0.2 * P; x < X + Wd - 0.8 * P; x += 0.78 * P) for (let k = 0; k < 2; k++) {
        const y = Y + Hd * 0.18 + k * Hd * 0.33;
        c.fillStyle = '#d4d8da'; c.fillRect(x, y, 0.72 * P, Hd * 0.3);
        c.fillStyle = '#20252a'; c.beginPath(); c.arc(x + 0.36 * P, y + Hd * 0.16, 0.22 * P, 0, TAU); c.fill();
        c.fillStyle = 'rgba(150,180,210,0.6)'; c.beginPath(); c.arc(x + 0.36 * P, y + Hd * 0.16, 0.16 * P, 0, TAU); c.fill();
      }
      drawText(c, TX.laundry.price, X + Wd * 0.05, Y + Hd * 0.04, Wd * 0.4, Hd * 0.1, { fam: 'gothic', weight: 900, color: '#1f5fa8', align: 'left' });
      break;
    }
    case 'records': {
      c.fillStyle = '#3a2a1e'; c.fillRect(X, Y, Wd, Hd);
      shelves(X + 4, X + Wd - 4, Y + Hd * 0.12, 5, ['#d9c39a', '#2b2b2b', '#a63d2f', '#e2d9c4', '#355c7d', '#6b4f3a', '#f2e6d0']);
      for (let k = 0; k < 4; k++) { c.fillStyle = products[k * 2]; c.fillRect(X + Wd * (0.1 + k * 0.22), Y + Hd * 0.03, Wd * 0.12, Hd * 0.08); }
      break;
    }
    case 'pharmacy': {
      c.fillStyle = '#ffffff'; c.fillRect(X, Y, Wd, Hd);
      shelves(X + 4, X + Wd - 4, Y + Hd * 0.1, 6, products);
      for (let k = 0; k < 5; k++) { c.fillStyle = '#ffe100'; const x = X + R() * Wd * 0.9, y = Y + Hd * (0.1 + R() * 0.6); c.beginPath(); c.arc(x, y, 0.12 * P, 0, TAU); c.fill(); }
      break;
    }
    case 'soba': {
      c.fillStyle = '#efe2c4'; c.fillRect(X, Y, Wd, Hd);
      c.fillStyle = '#c6a46a'; c.fillRect(X, Y + Hd * 0.55, Wd, Hd * 0.06);
      for (let k = 0; k < 6; k++) { const x = X + Wd * (0.06 + k * 0.155); c.fillStyle = '#fbf6ea'; c.fillRect(x, Y + Hd * 0.08, Wd * 0.13, Hd * 0.32); drawVText(c, TX.soba.menu[k % 4], x, Y + Hd * 0.1, Wd * 0.13, Hd * 0.28, { fam: 'gothic', weight: 900, color: '#1a1a1a' }); }
      c.fillStyle = '#b8b2a4'; c.fillRect(X, Y + Hd * 0.62, Wd, Hd * 0.3);
      for (let k = 0; k < 3; k++) { c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(X + Wd * (0.2 + k * 0.25), Y + Hd * 0.45, Wd * 0.08, Hd * 0.08); }
      break;
    }
    case 'dental': {
      c.fillStyle = '#e4ecef'; c.fillRect(X, Y, Wd, Hd);
      c.fillStyle = '#c9d6d9'; c.fillRect(X + Wd * 0.15, Y + Hd * 0.55, Wd * 0.45, Hd * 0.33);
      c.fillStyle = '#7fb3a0'; c.fillRect(X + Wd * 0.7, Y + Hd * 0.2, Wd * 0.2, Hd * 0.3);
      break;
    }
    case 'estate': {
      c.fillStyle = '#f7f7f2'; c.fillRect(X, Y, Wd, Hd);
      for (let x = X + 6; x < X + Wd - 0.5 * P; x += 0.46 * P) for (let y = Y + Hd * 0.08; y < Y + Hd * 0.75; y += 0.62 * P) {
        c.fillStyle = '#ffffff'; c.fillRect(x, y, 0.4 * P, 0.56 * P);
        c.fillStyle = '#d23c2c'; c.fillRect(x + 2, y + 2, 0.4 * P - 4, 0.09 * P);
        c.fillStyle = '#9aa8b5'; c.fillRect(x + 4, y + 0.14 * P, 0.4 * P - 8, 0.18 * P);
        c.fillStyle = '#555'; for (let l = 0; l < 3; l++) c.fillRect(x + 4, y + 0.36 * P + l * 0.05 * P, 0.4 * P - 10, 2);
      }
      break;
    }
    case 'florist': {
      c.fillStyle = '#e7e2d6'; c.fillRect(X, Y, Wd, Hd);
      for (let k = 0; k < 260; k++) {
        const x = X + R() * Wd, y = Y + Hd * (0.3 + R() * 0.55);
        c.fillStyle = ['#c23b5a', '#f0c419', '#ffffff', '#e86a92', '#7d3c98', '#e67e22', '#3b6e3b', '#4a7a3a'][Math.floor(R() * 8)];
        c.beginPath(); c.arc(x, y, (0.03 + R() * 0.06) * P, 0, TAU); c.fill();
      }
      break;
    }
    case 'atm': {
      c.fillStyle = '#eef2f5'; c.fillRect(X, Y, Wd, Hd);
      for (let k = 0; k < 3; k++) {
        const x = X + Wd * (0.12 + k * 0.28);
        c.fillStyle = '#c8ced3'; c.fillRect(x, Y + Hd * 0.3, Wd * 0.2, Hd * 0.58);
        c.fillStyle = '#1e4d7a'; c.fillRect(x + Wd * 0.03, Y + Hd * 0.36, Wd * 0.14, Hd * 0.12);
      }
      c.fillStyle = '#c0392b'; c.fillRect(X, Y, Wd, Hd * 0.08);
      break;
    }
    case 'bar': {
      c.fillStyle = '#1a0f0b'; c.fillRect(X, Y, Wd, Hd);
      const g = c.createRadialGradient(X + Wd / 2, Y + Hd * 0.3, 0, X + Wd / 2, Y + Hd * 0.3, Wd * 0.6); g.addColorStop(0, 'rgba(255,170,90,0.6)'); g.addColorStop(1, 'rgba(255,170,90,0)'); c.fillStyle = g; c.fillRect(X, Y, Wd, Hd);
      for (let row = 0; row < 3; row++) for (let x = X + 6; x < X + Wd - 6; x += 5 + R() * 4) { c.fillStyle = ['#7a4a1a', '#2d5a2a', '#c9a24a', '#6a1a1a', '#e0d8c0'][Math.floor(R() * 5)]; const h = 0.25 * P * (0.7 + R() * 0.5); c.fillRect(x, Y + Hd * (0.22 + row * 0.16) - h, 3, h); }
      c.fillStyle = '#3a2416'; c.fillRect(X, Y + Hd * 0.62, Wd, Hd * 0.3);
      person(X + Wd * 0.3, 1, 'rgba(10,6,4,0.9)'); person(X + Wd * 0.62, 0.95, 'rgba(10,6,4,0.9)');
      break;
    }
    case 'gyudon': {
      c.fillStyle = '#fff1d6'; c.fillRect(X, Y, Wd, Hd);
      c.fillStyle = '#f39c12'; c.fillRect(X, Y, Wd, Hd * 0.1);
      c.fillStyle = '#d35400'; c.fillRect(X, Y + Hd * 0.6, Wd, Hd * 0.08);
      for (let k = 0; k < 5; k++) person(X + Wd * (0.12 + k * 0.18), 0.85, 'rgba(60,40,25,0.8)');
      c.fillStyle = '#e8d2a8'; c.fillRect(X, Y + Hd * 0.66, Wd, Hd * 0.26);
      break;
    }
    case 'yakiniku': {
      c.fillStyle = '#4a2416'; c.fillRect(X, Y, Wd, Hd);
      for (let k = 0; k < 4; k++) { const x = X + Wd * (0.12 + k * 0.22); c.fillStyle = '#b0b0b0'; c.fillRect(x + Wd * 0.05, Y, Wd * 0.03, Hd * 0.42); c.fillStyle = '#ff9a4a'; c.beginPath(); c.arc(x + Wd * 0.065, Y + Hd * 0.55, Wd * 0.05, 0, TAU); c.fill(); person(x, 0.8, 'rgba(25,12,6,0.85)'); }
      break;
    }
    case 'lobby': {
      c.fillStyle = '#f0ece2'; c.fillRect(X, Y, Wd, Hd);
      for (let row = 0; row < 4; row++) for (let k = 0; k < 6; k++) { c.fillStyle = '#b9b4a8'; c.fillRect(X + Wd * 0.08 + k * 0.32 * P, Y + Hd * 0.25 + row * 0.24 * P, 0.28 * P, 0.2 * P); c.fillStyle = '#6d675c'; c.fillRect(X + Wd * 0.08 + k * 0.32 * P + 4, Y + Hd * 0.25 + row * 0.24 * P + 0.14 * P, 0.1 * P, 2); }
      c.fillStyle = '#7b6a55'; c.fillRect(X + Wd * 0.72, Y + Hd * 0.2, Wd * 0.2, Hd * 0.68);
      break;
    }
    case 'stairs': {
      c.fillStyle = '#d8d3c8'; c.fillRect(X, Y, Wd, Hd);
      for (let s = 0; s < 12; s++) { c.fillStyle = s % 2 ? '#a9a296' : '#bcb5a8'; c.fillRect(X + Wd * 0.15, floorY - s * Hd * 0.065, Wd * 0.7, Hd * 0.065); }
      break;
    }
    case 'cafe': {
      c.fillStyle = '#e9dcc5'; c.fillRect(X, Y, Wd, Hd);
      c.fillStyle = '#5a3d26'; c.fillRect(X, Y + Hd * 0.6, Wd, Hd * 0.3);
      for (let k = 0; k < 3; k++) { c.fillStyle = '#ffd38a'; c.beginPath(); c.arc(X + Wd * (0.2 + k * 0.3), Y + Hd * 0.18, 0.12 * P, 0, TAU); c.fill(); }
      person(X + Wd * 0.4, 0.9, 'rgba(40,28,20,0.8)');
      break;
    }
    default: {
      c.fillStyle = pick(['#efe9dc', '#e3e8ea', '#f2e3cf', '#e7efe4']); c.fillRect(X, Y, Wd, Hd);
      shelves(X + 4, X + Wd - 4, Y + Hd * 0.15, 4, products);
      if (R() < 0.5) person(X + Wd * (0.3 + R() * 0.4), 0.95);
    }
  }
  // perspective cue: darker toward the floor, light falloff toward the edges
  const v = c.createLinearGradient(X, Y, X, Y + Hd); v.addColorStop(0, 'rgba(255,255,255,0.08)'); v.addColorStop(0.85, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = v; c.fillRect(X, Y, Wd, Hd);
  return r;
});

const paintVending = memo('paintVending', function (color, seed) {
  // front face of a Japanese drink machine: three rows of samples, prices, red/blue hot-cold tags
  const r = signRect(1.0, 1.83, 140), c = ATL.sign.ctx;
  const R = mulberry32(seed);
  const X = r.x, Y = r.y, Wd = r.w, Hd = r.h;
  c.fillStyle = color; c.fillRect(X, Y, Wd, Hd);
  c.fillStyle = '#f7f9fa'; c.fillRect(X + Wd * 0.05, Y + Hd * 0.04, Wd * 0.9, Hd * 0.5);
  const cans = ['#c0392b', '#2e86c1', '#27ae60', '#f1c40f', '#ecf0f1', '#8e44ad', '#d35400', '#1c2833', '#a04000', '#f5cba7'];
  for (let row = 0; row < 3; row++) {
    const ry = Y + Hd * (0.06 + row * 0.16);
    const hot = row === 0 || (row === 1 && R() < 0.5);
    for (let k = 0; k < 8; k++) {
      const x = X + Wd * (0.08 + k * 0.105);
      c.fillStyle = cans[Math.floor(R() * cans.length)];
      roundRect(c, x, ry, Wd * 0.075, Hd * 0.1, Wd * 0.012); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x + Wd * 0.012, ry + Hd * 0.01, Wd * 0.012, Hd * 0.07);
      c.fillStyle = hot ? '#e0261b' : '#1f6fd1'; c.fillRect(x - Wd * 0.005, ry + Hd * 0.108, Wd * 0.085, Hd * 0.018);
      c.fillStyle = '#ff3b2f'; c.font = font('mono', Hd * 0.016, 500); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String([130, 160, 140, 110, 180, 200][Math.floor(R() * 6)]), x + Wd * 0.037, ry + Hd * 0.137);
    }
  }
  drawText(c, TX.vending.hot, X + Wd * 0.08, Y + Hd * 0.555, Wd * 0.4, Hd * 0.04, { fam: 'round', weight: 700, color: '#e0261b' });
  drawText(c, TX.vending.cold, X + Wd * 0.52, Y + Hd * 0.555, Wd * 0.4, Hd * 0.04, { fam: 'round', weight: 700, color: '#1f6fd1' });
  c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(X + Wd * 0.05, Y + Hd * 0.62, Wd * 0.9, Hd * 0.18);
  c.fillStyle = '#222'; c.fillRect(X + Wd * 0.7, Y + Hd * 0.64, Wd * 0.18, Hd * 0.1);
  c.fillStyle = '#111'; c.fillRect(X + Wd * 0.1, Y + Hd * 0.84, Wd * 0.8, Hd * 0.1);
  c.fillStyle = '#ff3b2f'; c.fillRect(X + Wd * 0.72, Y + Hd * 0.66, Wd * 0.14, Hd * 0.03);
  return r;
});
