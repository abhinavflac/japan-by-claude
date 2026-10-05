/* ============================================================
   Traffic: vehicle models, a deterministic simulation that
   obeys the signals (precomputed once), parked cars, and the
   taxi interior used by the vehicle camera.
   ============================================================ */

const VTYPES = {};
const TRAFFIC = { lives: [], routes: {}, slots: {}, meshes: {} };

// Number plates, bus interiors, doors and destination boards share one small painted atlas.
const VTX = { dest: jt('dot', '灯01 灯町三丁目 循環'), dest2: jt('dot', '都07 駅前 行'), plate: jt('gothic', '品川 500 12-34 さあれり'), andon: jt('gothic', '個人タクシー') };
const VATL = { tex: null, r: {} };
function paintVehicleAtlas() {
  const W = 1024, H = 512, c = makeCanvas(W, H), g = c.getContext('2d');
  const R = (x, y, w, h) => ({ u0: x / W, v0: 1 - (y + h) / H, u1: (x + w) / W, v1: 1 - y / H });
  const rr = (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
  const rand = mulberry32(5150), pick = a => a[Math.floor(rand() * a.length)];
  const coats = ['#2b2d31', '#1e2a44', '#5a1f24', '#b39b74', '#3b3f47', '#d8cdb5', '#4a5038'], hairs = ['#141110', '#231a14', '#47352a', '#9a9a96'];
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const rider = (px, py, s, coat, hair, standing) => {
    g.fillStyle = coat; rr(px - s * 0.4, py + s * 0.3, s * 0.8, standing ? s * 2.6 : s * 1.1, s * 0.18); g.fill();
    g.fillStyle = '#c9a487'; g.beginPath(); g.ellipse(px, py + s * 0.08, s * 0.17, s * 0.22, 0, 0, TAU); g.fill();
    g.fillStyle = hair; g.beginPath(); g.ellipse(px, py - s * 0.02, s * 0.19, s * 0.16, 0, Math.PI, TAU); g.fill();
    g.fillRect(px - s * 0.19, py - s * 0.03, s * 0.08, s * 0.16);
  };
  // the inside of a city bus at night: fluorescent ceiling, the far windows, seat backs, a few riders
  const interior = (x, y, w, h, who) => {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    const wall = g.createLinearGradient(0, y, 0, y + h);
    wall.addColorStop(0, '#fffaf0'); wall.addColorStop(0.09, '#efe6d2'); wall.addColorStop(0.18, '#9b958a'); wall.addColorStop(1, '#55524b');
    g.fillStyle = wall; g.fillRect(x, y, w, h);
    g.fillStyle = '#0e121a'; g.fillRect(x, y + h * 0.22, w, h * 0.38);
    for (let i = 0; i < 7; i++) { g.fillStyle = `rgba(${200 + rand() * 55 | 0},${140 + rand() * 90 | 0},${80 + rand() * 100 | 0},${0.2 + rand() * 0.4})`; g.beginPath(); g.arc(x + rand() * w, y + h * (0.27 + rand() * 0.28), 1.5 + rand() * 4.5, 0, TAU); g.fill(); }
    g.fillStyle = '#5a564d'; g.fillRect(x + w * 0.46, y + h * 0.2, w * 0.06, h * 0.42);
    g.strokeStyle = '#d9d6cc'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y + h * 0.16); g.lineTo(x + w, y + h * 0.16); g.stroke();
    g.lineWidth = 1.4; g.strokeStyle = '#efe9da';
    for (let sx = x + 9; sx < x + w; sx += 21) { g.beginPath(); g.moveTo(sx, y + h * 0.16); g.lineTo(sx, y + h * 0.24); g.stroke(); g.beginPath(); g.arc(sx, y + h * 0.27, 3, 0, TAU); g.stroke(); }
    for (const p of who.filter(p => !p.standing)) rider(x + w * p.x, y + h * p.y, h * p.s, p.coat, p.hair, false);
    for (let k = 0; k < 2; k++) {
      const sx = x + w * (0.04 + k * 0.5);
      g.fillStyle = '#25325a'; rr(sx, y + h * 0.62, w * 0.4, h * 0.45, 7); g.fill();
      g.fillStyle = '#3d4d7e'; g.fillRect(sx + 3, y + h * 0.62 + 3, w * 0.4 - 6, 3);
      g.fillStyle = '#c9c9c4'; g.fillRect(sx + w * 0.36, y + h * 0.6, 3, h * 0.06);
    }
    for (const p of who.filter(p => p.standing)) {
      rider(x + w * p.x, y + h * p.y, h * p.s, p.coat, p.hair, true);
      g.strokeStyle = p.coat; g.lineWidth = h * p.s * 0.16; g.beginPath(); g.moveTo(x + w * p.x + h * p.s * 0.3, y + h * (p.y + p.s * 0.4)); g.lineTo(x + w * p.x + h * p.s * 0.35, y + h * 0.28); g.stroke();
    }
    const v = g.createLinearGradient(0, y + h * 0.8, 0, y + h); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = v; g.fillRect(x, y, w, h);
    g.restore();
  };
  const dress = list => list.map(p => ({ ...p, coat: pick(coats), hair: pick(hairs) }));
  const seats = [
    [], [{ x: 0.25, y: 0.44, s: 0.3 }], [{ x: 0.72, y: 0.46, s: 0.28 }], [{ x: 0.24, y: 0.45, s: 0.29 }, { x: 0.74, y: 0.43, s: 0.3 }],
    [{ x: 0.62, y: 0.2, s: 0.27, standing: true }], [], [{ x: 0.3, y: 0.44, s: 0.3 }, { x: 0.78, y: 0.22, s: 0.27, standing: true }], [{ x: 0.7, y: 0.45, s: 0.29 }],
  ];
  VATL.r.win = seats.map((w, i) => { interior(i * 128, 0, 128, 128, dress(w)); return R(i * 128 + 1, 1, 126, 126); });
  // through the windscreen: the driver on the right-hand side, cap on, behind a dark dashboard
  {
    const x = 0, y = 128, w = 256, h = 128;
    interior(x, y, w, h, dress([{ x: 0.62, y: 0.42, s: 0.24 }, { x: 0.84, y: 0.45, s: 0.22 }]));
    g.fillStyle = '#e8c84a'; for (const px of [0.44, 0.72]) g.fillRect(x + w * px, y + h * 0.15, 3, h * 0.6);
    rider(x + w * 0.24, y + h * 0.42, h * 0.32, '#1d2433', '#141110', false);
    g.fillStyle = '#1d2433'; g.beginPath(); g.ellipse(x + w * 0.24, y + h * 0.4, h * 0.075, h * 0.05, 0, Math.PI, TAU); g.fill(); g.fillRect(x + w * 0.24 - h * 0.1, y + h * 0.39, h * 0.2, h * 0.025);
    g.fillStyle = '#121418'; g.fillRect(x, y + h * 0.74, w, h * 0.26);
    g.fillStyle = 'rgba(120,200,255,0.55)'; g.fillRect(x + w * 0.15, y + h * 0.78, w * 0.13, h * 0.05);
    g.strokeStyle = '#8d8a84'; g.lineWidth = 3; g.beginPath(); g.ellipse(x + w * 0.24, y + h * 0.76, h * 0.15, h * 0.04, 0, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x, y, w, h * 0.07);
    VATL.r.front = R(x + 1, y + 1, w - 2, h - 2);
  }
  // LED boards: orange text on black, then the dot matrix over it
  const led = (x, y, w, h, parts) => {
    g.fillStyle = '#050505'; g.fillRect(x, y, w, h);
    for (const p of parts) drawText(g, p.t, x + w * p.x, y + h * p.y, w * p.w, h * p.h, { fam: 'dot', weight: 400, color: p.c || '#ffa63a', shadow: 'rgba(255,140,30,0.9)', shadowBlur: 3 });
    g.fillStyle = 'rgba(0,0,0,0.5)';
    for (let yy = y; yy < y + h; yy += 3) g.fillRect(x, yy, w, 1);
    for (let xx = x; xx < x + w; xx += 3) g.fillRect(xx, y, 1, h);
  };
  led(256, 128, 256, 64, [{ t: '灯01', x: 0.02, y: 0.14, w: 0.2, h: 0.72, c: '#ffd08a' }, { t: '灯町三丁目 循環', x: 0.25, y: 0.12, w: 0.73, h: 0.76 }]); VATL.r.dest = R(256, 128, 256, 64);
  led(256, 192, 256, 64, [{ t: '都07', x: 0.02, y: 0.14, w: 0.2, h: 0.72, c: '#ffd08a' }, { t: '駅前 行', x: 0.3, y: 0.12, w: 0.6, h: 0.76 }]); VATL.r.dest2 = R(256, 192, 256, 64);
  led(512, 192, 128, 64, [{ t: '灯01', x: 0.08, y: 0.12, w: 0.84, h: 0.76 }]); VATL.r.route = R(512, 192, 128, 64);
  // Japanese plates: private white, commercial green, kei yellow, kei commercial black
  const plate = (x, y, bg, fg, kana) => {
    g.fillStyle = bg; rr(x + 2, y + 2, 124, 60, 5); g.fill(); g.strokeStyle = fg; g.lineWidth = 2; g.stroke();
    drawText(g, '品川 500', x + 30, y + 6, 70, 18, { fam: 'gothic', weight: 700, color: fg });
    drawText(g, kana, x + 6, y + 30, 20, 26, { fam: 'gothic', weight: 700, color: fg });
    drawText(g, '12-34', x + 26, y + 24, 96, 36, { fam: 'gothic', weight: 900, color: fg });
  };
  plate(512, 128, '#e9ece4', '#2c6a3a', 'さ'); VATL.r.plateW = R(512, 128, 128, 64);
  plate(640, 128, '#2c6a3a', '#f2f2ee', 'あ'); VATL.r.plateG = R(640, 128, 128, 64);
  plate(768, 128, '#eccb36', '#202020', 'れ'); VATL.r.plateY = R(768, 128, 128, 64);
  plate(896, 128, '#1c1c1c', '#eccb36', 'り'); VATL.r.plateK = R(896, 128, 128, 64);
  // taxi roof lamps
  const andon = (x, y, text, fg) => {
    const gr = g.createLinearGradient(0, y, 0, y + 64); gr.addColorStop(0, '#fffdf4'); gr.addColorStop(1, '#efe0b4');
    g.fillStyle = gr; g.fillRect(x, y, 128, 64);
    drawText(g, text, x + 8, y + 10, 112, 44, { fam: 'gothic', weight: 900, color: fg });
  };
  andon(640, 192, '個人', '#b8231a'); VATL.r.andonS = R(641, 193, 126, 62);
  andon(768, 192, 'タクシー', '#1d2a6a'); VATL.r.andonJ = R(769, 193, 126, 62);
  // a glass bus door: steps, yellow handrails, the rubber where the leaves meet
  {
    const x = 0, y = 256, w = 128, h = 256;
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#fff8ea'); gr.addColorStop(0.08, '#e2dac6'); gr.addColorStop(0.6, '#8d877c'); gr.addColorStop(1, '#3d3b37');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = '#6d6a64'; g.fillRect(x, y + h * 0.82, w, h * 0.18);
    g.fillStyle = '#e8c33a'; g.fillRect(x, y + h * 0.82, w, 3); g.fillRect(x, y + h * 0.91, w, 3);
    g.fillStyle = '#e8c84a'; g.fillRect(x + w * 0.2, y + h * 0.1, 4, h * 0.72); g.fillRect(x + w * 0.78, y + h * 0.1, 4, h * 0.72);
    g.fillStyle = '#1a1b1d'; g.fillRect(x, y, w, 5); g.fillRect(x, y, 5, h); g.fillRect(x + w - 5, y, 5, h); g.fillRect(x + w / 2 - 3, y, 6, h); g.fillRect(x, y + h * 0.55, w, 4);
    VATL.r.door = R(x + 1, y + 1, w - 2, h - 2);
  }
  VATL.tex = canvasTex(c);
}

function vehicleModel(type) {
  const body = new Batch(null), trim = new Batch(null), glass = new Batch(null), head = new Batch(null), tail = new Batch(null), roof = new Batch(null);
  const cabin = new Batch(null, { colors: true }), glassT = new Batch(null), stripe = new Batch(null);
  const B = (b, x0, y0, z0, x1, y1, z1) => b.add(G.box, boxM(x0, y0, z0, x1, y1, z1));
  const FACE = { pz: 0, nz: Math.PI, px: Math.PI / 2, nx: -Math.PI / 2 };
  // a quad facing out along one axis; on the cabin layer it samples the atlas, `k` sets its brightness
  const Q = (b, dir, cx, cy, cz, w, h, rect, k = 1) => b.add(G.plane, mat(cx, cy, cz, FACE[dir], 0, 0, w, h, 1), b === cabin ? new THREE.Color(k, k, k) : null, rect);
  let L, W, H, wheels, wr = 0.3;
  const lights = (zf, zr, yh, w, ht = 0.12) => {
    for (const s of [-1, 1]) { B(head, s * w - 0.13 * s - 0.08, yh, zf - 0.03, s * w - 0.13 * s + 0.08, yh + ht, zf + 0.01); B(tail, s * w - 0.1 * s - 0.08, yh, zr - 0.01, s * w - 0.1 * s + 0.08, yh + ht * 1.1, zr + 0.03); }
  };
  // lower body cut away around the wheels, with dark wells behind them
  const lower = (x0, y0, z0, x1, y1, z1) => {
    const top = 2 * wr + 0.05;
    const spans = [...new Set(wheels.map(w => w[1]))].sort((a, b) => a - b).map(z => [Math.max(z0, z - wr - 0.07), Math.min(z1, z + wr + 0.07)]).filter(([a, c]) => c > a);
    let z = z0;
    for (const [a, c] of spans) {
      if (a > z) B(body, x0, y0, z, x1, y1, a);
      if (y1 > top) B(body, x0, top, a, x1, y1, c);
      B(trim, x0 + 0.3, y0, a, x1 - 0.3, Math.min(y1, top), c);
      z = c;
    }
    if (z < z1) B(body, x0, y0, z, x1, y1, z1);
  };
  const plates = (zf, yf, zr, yr, rect) => { Q(cabin, 'pz', 0, yf, zf, 0.33, 0.165, rect, 0.45); Q(cabin, 'nz', 0, yr, zr, 0.33, 0.165, rect, 0.95); };
  const mirrors = (x, y, z) => { for (const s of [-1, 1]) B(trim, s * (x - 0.02), y, z - 0.03, s * (x + 0.12), y + 0.11, z + 0.05); };
  const seams = (x, y0, y1, zs) => { for (const z of zs) for (const s of [-1, 1]) B(trim, s * x - 0.004, y0, z - 0.006, s * x + 0.004, y1, z + 0.006); };
  switch (type) {
    case 'taxiS': {
      L = 4.6; W = 1.7; H = 1.5; wheels = [[0.72, 1.4], [-0.72, 1.4], [0.72, -1.35], [-0.72, -1.35]];
      lower(-0.85, 0.3, -2.3, 0.85, 0.88, 2.3);
      glass.add(taperBox(1.62, 1.95, 1.36, 1.55, 0.5, -0.12), mat(0, 0.88, -0.3));
      B(body, -0.69, 1.37, -1.12, 0.69, 1.42, 0.5);
      B(trim, -0.88, 0.28, 2.22, 0.88, 0.5, 2.38); B(trim, -0.88, 0.28, -2.38, 0.88, 0.5, -2.22);
      B(trim, -0.5, 0.52, 2.3, 0.5, 0.74, 2.32);
      for (const s of [-1, 1]) { B(trim, s * 0.74 - 0.02, 0.9, 1.45, s * 0.74 + 0.02, 1.06, 1.49); B(trim, s * 0.74 - 0.05, 1.03, 1.44, s * 0.74 + 0.05, 1.1, 1.52); }
      for (const s of [-1, 1]) B(trim, s * 0.852 - 0.006, 0.52, -1.1, s * 0.852 + 0.006, 0.57, 1.0);
      seams(0.852, 0.36, 0.86, [0.42, -0.72]);
      cabin.add(G.box, boxM(-0.2, 1.42, -0.32, 0.2, 1.62, -0.12), new THREE.Color(2.3, 2.2, 2.0), VATL.r.andonS);
      lights(2.31, -2.31, 0.62, 0.85);
      plates(2.385, 0.39, -2.305, 0.66, VATL.r.plateG);
      break;
    }
    case 'taxiJ': {
      L = 4.4; W = 1.7; H = 1.75; wheels = [[0.72, 1.35], [-0.72, 1.35], [0.72, -1.35], [-0.72, -1.35]];
      lower(-0.85, 0.3, -2.2, 0.85, 0.95, 2.2);
      glass.add(taperBox(1.64, 3.0, 1.48, 2.7, 0.68, -0.1), mat(0, 0.95, -0.25));
      B(body, -0.75, 1.62, -1.6, 0.75, 1.68, 1.1);
      B(trim, -0.88, 0.28, 2.12, 0.88, 0.5, 2.28); B(trim, -0.88, 0.28, -2.28, 0.88, 0.5, -2.12);
      B(trim, -0.55, 0.55, 2.2, 0.55, 0.78, 2.22);
      mirrors(0.84, 1.0, 1.15);
      seams(0.852, 0.36, 0.93, [0.3, -0.9]);
      cabin.add(G.box, boxM(-0.18, 1.68, -0.28, 0.18, 1.86, -0.08), new THREE.Color(2.3, 2.2, 2.0), VATL.r.andonJ);
      lights(2.21, -2.21, 0.7, 0.84);
      plates(2.285, 0.39, -2.205, 0.72, VATL.r.plateG);
      break;
    }
    case 'kei': {
      L = 3.4; W = 1.48; H = 1.78; wr = 0.27; wheels = [[0.63, 1.12], [-0.63, 1.12], [0.63, -1.12], [-0.63, -1.12]];
      lower(-0.74, 0.28, -1.7, 0.74, 0.95, 1.7);
      glass.add(taperBox(1.46, 2.9, 1.36, 2.6, 0.76, 0.05), mat(0, 0.95, -0.05));
      B(body, -0.68, 1.7, -1.35, 0.68, 1.76, 1.25);
      B(trim, -0.76, 0.26, 1.62, 0.76, 0.46, 1.74); B(trim, -0.76, 0.26, -1.74, 0.76, 0.46, -1.62);
      mirrors(0.73, 1.0, 1.0);
      seams(0.742, 0.34, 0.93, [0.2, -0.95]);
      lights(1.71, -1.71, 0.78, 0.72, 0.16);
      plates(1.745, 0.36, -1.705, 0.62, VATL.r.plateY);
      break;
    }
    case 'sedan': {
      L = 4.75; W = 1.8; H = 1.45; wheels = [[0.76, 1.45], [-0.76, 1.45], [0.76, -1.45], [-0.76, -1.45]];
      lower(-0.9, 0.3, -2.37, 0.9, 0.86, 2.37);
      glass.add(taperBox(1.7, 2.3, 1.38, 1.5, 0.52, -0.2), mat(0, 0.86, -0.25));
      B(body, -0.68, 1.37, -1.05, 0.68, 1.41, 0.45);
      B(trim, -0.92, 0.28, 2.3, 0.92, 0.48, 2.42); B(trim, -0.92, 0.28, -2.42, 0.92, 0.48, -2.3);
      B(trim, -0.45, 0.5, 2.37, 0.45, 0.68, 2.39);
      mirrors(0.88, 0.92, 0.95);
      seams(0.902, 0.36, 0.84, [0.3, -0.8]);
      lights(2.38, -2.38, 0.66, 0.88);
      plates(2.425, 0.38, -2.375, 0.66, VATL.r.plateW);
      break;
    }
    case 'van': {
      L = 4.7; W = 1.7; H = 1.98; wheels = [[0.72, 1.6], [-0.72, 1.6], [0.72, -1.4], [-0.72, -1.4]];
      lower(-0.85, 0.32, -2.35, 0.85, 1.0, 2.35);
      B(body, -0.85, 1.0, -2.35, 0.85, 1.95, 2.0);
      glass.add(taperBox(1.72, 0.1, 1.6, 0.1, 0.8, -0.32), mat(0, 1.05, 2.06));
      for (const s of [-1, 1]) B(glass, s * 0.86 - 0.01, 1.15, -1.0, s * 0.86 + 0.01, 1.75, 1.95);
      B(glass, -0.7, 1.2, -2.362, 0.7, 1.78, -2.35);
      B(trim, -0.88, 0.3, 2.3, 0.88, 0.52, 2.42); B(trim, -0.88, 0.3, -2.42, 0.88, 0.52, -2.3);
      mirrors(0.84, 1.15, 1.95);
      seams(0.852, 0.36, 1.12, [1.25, 0.15, -1.05]);
      lights(2.36, -2.36, 0.8, 0.82);
      plates(2.425, 0.41, -2.355, 0.75, VATL.r.plateW);
      break;
    }
    case 'truck': {
      L = 3.4; W = 1.48; H = 1.8; wr = 0.27; wheels = [[0.63, 1.2], [-0.63, 1.2], [0.63, -1.0], [-0.63, -1.0]];
      lower(-0.74, 0.32, 0.55, 0.74, 1.0, 1.7);
      B(body, -0.74, 1.0, 0.55, 0.74, 1.78, 1.7);
      glass.add(taperBox(1.46, 0.1, 1.38, 0.1, 0.55, -0.15), mat(0, 1.12, 1.66));
      for (const s of [-1, 1]) B(glass, s * 0.742 - 0.006, 1.12, 0.72, s * 0.742 + 0.006, 1.6, 1.45);
      B(glass, -0.55, 1.2, 0.544, 0.55, 1.6, 0.55);
      B(trim, -0.45, 0.3, -1.6, 0.45, 0.62, 0.55);
      B(body, -0.74, 0.62, -1.7, 0.74, 0.68, 0.5);
      for (const s of [-1, 1]) B(body, s * 0.74 - 0.03, 0.68, -1.7, s * 0.74 + 0.03, 0.98, 0.5);
      B(body, -0.74, 0.68, -1.72, 0.74, 0.98, -1.66);
      B(trim, -0.72, 0.98, 0.47, 0.72, 1.72, 0.52);
      B(trim, -0.62, 0.68, -1.55, 0.25, 1.02, -0.45);
      B(trim, -0.76, 0.3, 1.62, 0.76, 0.48, 1.74);
      mirrors(0.73, 1.2, 1.55);
      lights(1.71, -1.71, 0.7, 0.72, 0.14);
      plates(1.745, 0.4, -1.725, 0.82, VATL.r.plateK);
      break;
    }
    case 'bus': case 'cbus': {
      const big = type === 'bus';
      L = big ? 10.5 : 7.0; W = big ? 2.5 : 2.08; H = big ? 3.1 : 2.9;
      const hl = L / 2, hw = W / 2, ws = 1.2, wt = H - 0.72;
      wr = big ? 0.48 : 0.38;
      wheels = big ? [[hw - 0.25, hl - 1.6], [-hw + 0.25, hl - 1.6], [hw - 0.25, -hl + 2.2], [-hw + 0.25, -hl + 2.2]] : [[hw - 0.2, hl - 1.2], [-hw + 0.2, hl - 1.2], [hw - 0.2, -hl + 1.4], [-hw + 0.2, -hl + 1.4]];
      lower(-hw, 0.35, -hl, hw, ws, hl);
      B(body, -hw, wt, -hl, hw, H, hl);
      B(body, -hw * 0.5, H, -1.4, hw * 0.5, H + 0.22, 0.7);                         // roof air-conditioning
      B(trim, -hw + 0.08, ws, -hl + 0.12, hw - 0.08, wt, hl - 0.12);               // dark core behind the glazing
      // glazing: a lit interior behind tinted glass, bay by bay; doors on the kerb side (+x)
      const doors = [[hl - 1.0, hl - 0.15], big ? [-0.75, 0.45] : [-0.55, 0.35]];
      const inDoor = (a, b) => doors.some(([d0, d1]) => b > d0 - 0.05 && a < d1 + 0.05);
      let wi = big ? 3 : 0;
      for (const s of [-1, 1]) {
        const x = s * hw, dir = s > 0 ? 'px' : 'nx';
        for (let z0 = -hl + 0.3; z0 < hl - 0.4; z0 += 1.1) {
          const z1 = Math.min(z0 + 1.1, hl - 0.35);
          B(body, x - 0.02, ws, z0 - 0.05, x + 0.02, wt, z0 + 0.05);
          if (s > 0 && inDoor(z0, z1)) continue;
          Q(cabin, dir, s * (hw - 0.07), (ws + wt) / 2, (z0 + z1) / 2, z1 - z0 - 0.1, wt - ws, VATL.r.win[(wi += 5) % 8]);
          Q(glassT, dir, s * (hw + 0.004), (ws + wt) / 2, (z0 + z1) / 2, z1 - z0 - 0.1, wt - ws);
        }
        B(body, x - 0.02, ws, hl - 0.35, x + 0.02, wt, hl);
      }
      for (const [d0, d1] of doors) {
        Q(cabin, 'px', hw + 0.012, (0.42 + wt) / 2, (d0 + d1) / 2, d1 - d0, wt - 0.42, VATL.r.door, 0.95);
        Q(glassT, 'px', hw + 0.016, (0.42 + wt) / 2, (d0 + d1) / 2, d1 - d0, wt - 0.42);
      }
      // the front: windscreen over the driver, the destination board above, mirrors on stalks
      Q(cabin, 'pz', 0, (1.1 + wt) / 2 + 0.05, hl + 0.006, W - 0.22, wt - 1.0, VATL.r.front);
      Q(glassT, 'pz', 0, (1.1 + wt) / 2 + 0.05, hl + 0.012, W - 0.2, wt - 0.98);
      Q(cabin, 'pz', 0, wt + 0.25, hl + 0.008, W - 0.5, 0.34, big ? VATL.r.dest2 : VATL.r.dest, 1.8);
      B(trim, -hw - 0.02, 0.3, hl - 0.06, hw + 0.02, 0.62, hl + 0.07);
      for (const s of [-1, 1]) { B(trim, s * hw, wt - 0.08, hl - 0.12, s * (hw + 0.3), wt - 0.03, hl + 0.06); B(trim, s * (hw + 0.24), 1.7, hl + 0.02, s * (hw + 0.34), wt - 0.05, hl + 0.14); }
      // the back: a small window, the route number, the engine grille
      Q(cabin, 'nz', 0, wt - 0.32, -hl - 0.006, W - 0.6, 0.6, VATL.r.win[2], 0.85);
      Q(cabin, 'nz', 0, wt + 0.22, -hl - 0.008, 0.62, 0.3, VATL.r.route, 1.8);
      B(trim, -0.65, 0.65, -hl - 0.012, 0.65, 1.15, -hl + 0.01);
      B(trim, -hw - 0.02, 0.3, -hl - 0.07, hw + 0.02, 0.62, -hl + 0.06);
      // livery: a belt line and a band under the roof
      B(stripe, -hw - 0.006, 0.92, -hl - 0.006, hw + 0.006, 1.08, hl + 0.006);
      B(stripe, -hw - 0.006, wt + 0.04, -hl + 0.2, hw + 0.006, wt + 0.1, hl - 0.2);
      lights(hl + 0.01, -hl - 0.01, 0.55, hw - 0.05, 0.16);
      plates(hl + 0.075, 0.46, -hl - 0.075, 0.76, VATL.r.plateG);
      break;
    }
  }
  const geoOf = b => b.empty ? null : b.build().geometry;
  return { L, W, H, wheels, wr, geo: { body: geoOf(body), trim: geoOf(trim), glass: geoOf(glass), head: geoOf(head), tail: geoOf(tail), roof: geoOf(roof), cabin: geoOf(cabin), glassT: geoOf(glassT), stripe: geoOf(stripe) } };
}

const TYPE_MIX = { main: [['taxiS', 0.26], ['taxiJ', 0.16], ['kei', 0.22], ['sedan', 0.14], ['van', 0.1], ['truck', 0.07], ['cbus', 0.0]], cross: [['taxiS', 0.18], ['taxiJ', 0.14], ['kei', 0.14], ['sedan', 0.24], ['van', 0.16], ['truck', 0.06], ['bus', 0.08]] };
const PAINT = {
  taxiS: ['#e9b81c', '#1b4d3a', '#e8e6dc', '#16181b', '#d9541e', '#2a3f6a'],
  taxiJ: ['#1d2a4a', '#1d2a4a', '#1d2a4a', '#16181b'],
  kei: ['#f2f0ea', '#c9d6c2', '#e8d8c0', '#2a2a2e', '#9fb7c8', '#d8b8b0', '#e8e4dc'],
  sedan: ['#d8dadb', '#f2f2f0', '#16181b', '#2a3550', '#5a1e22', '#3a3c40'],
  van: ['#ecebe6', '#d0d2d3', '#ecebe6'], truck: ['#ecebe6', '#e9e7e0'], bus: ['#f0eee8'], cbus: ['#f2e6c8'],
};

/* ---------- routes ---------- */
class Route {
  constructor(pts, o = {}) {
    this.p = pts.map(q => new THREE.Vector2(q[0], q[1]));
    this.cum = [0];
    for (let i = 1; i < this.p.length; i++) this.cum.push(this.cum[i - 1] + this.p[i].distanceTo(this.p[i - 1]));
    this.L = this.cum[this.cum.length - 1];
    this.stop = o.stop || null;          // { s, group }
    this.busStop = o.busStop || null;    // s
    this.v0 = o.v0 || 8.6;
    this.lane = o.lane || '';
  }
  at(s, out) {
    s = clamp(s, 0, this.L);
    let i = 0; while (i < this.cum.length - 2 && this.cum[i + 1] < s) i++;
    const a = this.p[i], b = this.p[i + 1], t = (s - this.cum[i]) / ((this.cum[i + 1] - this.cum[i]) || 1);
    out.x = a.x + (b.x - a.x) * t; out.z = a.y + (b.y - a.y) * t;
    out.dx = (b.x - a.x) / ((this.cum[i + 1] - this.cum[i]) || 1); out.dz = (b.y - a.y) / ((this.cum[i + 1] - this.cum[i]) || 1);
    return out;
  }
}
function arcPts(cx, cz, r, a0, a1, n = 8) { const o = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); o.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return o; }

function makeRoutes() {
  const R = TRAFFIC.routes;
  R.S = new Route([[-1.6, 150], [-1.6, -210]], { stop: { s: 150 - (-31.0), group: 'A' }, lane: 'S' });                       // southbound (down the street)
  R.N = new Route([[1.6, -210], [1.6, 150]], { stop: { s: -49.0 + 210, group: 'A' }, busStop: 210 + 13.6, lane: 'N' });     // northbound (toward the camera's usual view)
  R.Eb = new Route([[-260, -41.75], [260, -41.75]], { stop: { s: 260 - 9.0, group: 'B' }, v0: 11, lane: 'Eb' });
  R.Wb = new Route([[260, -38.25], [-260, -38.25]], { stop: { s: 260 - 9.0, group: 'B' }, v0: 11, lane: 'Wb' });
  // left turn from the southbound lane into the westbound cross street; turners yield to people crossing
  R.St = new Route([[-1.6, 150], [-1.6, -34.6], [-2.2, -36.6], [-3.4, -37.8], [-5.0, -38.25], [-260, -38.25]], { stop: { s: 150 - (-31.0), group: 'A' }, lane: 'S', v0: 8.0 });
  R.St.yieldAt = 150 - (-35.4);
  R.bikeS = new Route([[-2.78, 150], [-2.78, -210]], { stop: { s: 150 - (-31.0), group: 'A' }, v0: 4.6, lane: 'bS' });
  R.bikeN = new Route([[2.78, -210], [2.78, 150]], { stop: { s: -49.0 + 210, group: 'A' }, v0: 4.4, lane: 'bN' });
  // a shortcut through the coin parking: cyclists who join the lane past the junction, out of step with the lights
  R.bikeN2 = new Route([[14, -26.5], [7.5, -24.6], [4.2, -23.6], [2.78, -21.8], [2.78, 150]], { v0: 4.0, lane: 'bN2' });
}

function signalFor(group, t) { return group === 'A' ? SIG.A(t) : SIG.B(t); }

// Intelligent-driver model, precomputed for the whole loop.
function simulateTraffic() {
  makeRoutes();
  reseed(1234);
  const R = TRAFFIC.routes;
  const lives = [];
  const spawn = (route, routeName, every, jitter, mix, opts = {}) => {
    let t = -rnd(10, 60);
    while (t < SIM_T) {
      t += every * rnd(1 - jitter, 1 + jitter);
      let type = opts.type;
      if (!type) { let r = rnd(), acc = 0; for (const [tp, w] of mix) { acc += w; if (r <= acc) { type = tp; break; } } type = type || 'kei'; }
      const bike = type === 'bike';
      const v0 = route.v0 * (bike ? rnd(0.9, 1.1) : rnd(0.92, 1.06)) * (type === 'bus' || type === 'cbus' ? 0.85 : 1);
      lives.push({ id: lives.length, type, route, routeName, t0: t, v0, len: bike ? 1.8 : VT_LEN[type], color: bike ? pick(BIKE_COLORS) : pick(PAINT[type]), occupied: chance(0.45), samples: null });
    }
  };
  spawn(R.S, 'S', 7.5, 0.6, TYPE_MIX.main);
  spawn(R.N, 'N', 7.0, 0.6, TYPE_MIX.main);
  spawn(R.N, 'N', 190, 0.1, null, { type: 'cbus' });
  spawn(R.Eb, 'Eb', 7.5, 0.6, TYPE_MIX.cross);
  spawn(R.Wb, 'Wb', 7.5, 0.6, TYPE_MIX.cross);
  spawn(R.bikeS, 'bS', 26, 0.5, null, { type: 'bike' });
  spawn(R.bikeN, 'bN', 12, 0.5, null, { type: 'bike' });
  spawn(R.bikeN2, 'bN2', 14, 0.5, null, { type: 'bike' });
  lives.sort((a, b) => a.t0 - b.t0);
  lives.forEach((l, i) => l.id = i);
  const DT = 0.1, steps = Math.ceil((SIM_T + 120) / DT);
  const active = [];
  let next = 0;
  for (let k = 0; k < steps; k++) {
    const t = -60 + k * DT;
    while (next < lives.length && lives[next].t0 <= t) {
      const l = lives[next];
      // enter only if the lane start is clear
      const lane = l.route.lane;
      const blocker = active.find(o => o.route.lane === lane && o.s - o.len < 9);
      if (blocker) { l.t0 += 1.0; lives.sort((a, b) => a.t0 - b.t0); continue; }
      l.s = 0; l.v = l.v0 * 0.9; l.dwell = 0; l.samples = { t0: t, s: [], v: [], b: [] }; l.done = false; l.busDone = false;
      active.push(l); next++;
    }
    for (const l of active) {
      // leader on the same lane (routes sharing a lane share coordinates until the turn)
      let gap = 1e9, dv = 0;
      for (const o of active) {
        if (o === l || o.route.lane !== l.route.lane) continue;
        if (l.route.lane === 'S' && (o.routeName === 'St' || l.routeName === 'St') && (o.s > 186 || l.s > 186)) continue;
        const g = o.s - o.len - l.s;
        if (g > -0.5 && g < gap) { gap = g; dv = l.v - o.v; }
      }
      // stop line
      const st = l.route.stop;
      if (st && l.s < st.s + 0.2) {
        const sig = signalFor(st.group, t);
        const d = st.s - l.s;
        const stopDist = l.v * l.v / (2 * 3.0);
        if (sig === 'R' || (sig === 'Y' && d > stopDist)) { if (d < gap) { gap = Math.max(0.01, d); dv = l.v; } }
      }
      // turning cars wait for the people on the crossing they are about to cut across
      if (l.route.yieldAt && l.s < l.route.yieldAt + 0.2 && SIG.pedCross(t) !== 'D') {
        const d = l.route.yieldAt - l.s;
        if (d > -0.2 && d < gap) { gap = Math.max(0.01, d); dv = l.v; }
      }
      const a = 1.4, b = 2.2, s0 = l.type === 'bike' ? 1.0 : 2.2, T = 1.3;
      // community bus dwells at its stop (the stop is a target, not a leader, so it is aimed at s0 beyond)
      if ((l.type === 'cbus') && l.route.busStop && !l.busDone) {
        const d = l.route.busStop - l.s;
        if (d < 0.8 && d > -1) { l.dwell += DT; if (l.dwell > 18) l.busDone = true; gap = 0.01; dv = l.v; }
        else if (d > 0 && d + s0 < gap) { gap = d + s0; dv = l.v; }
      }
      const sStar = s0 + Math.max(0, l.v * T + l.v * dv / (2 * Math.sqrt(a * b)));
      let acc = a * (1 - Math.pow(l.v / l.v0, 4) - Math.pow(sStar / Math.max(gap, 0.01), 2));
      acc = clamp(acc, -7, a);
      l.acc = acc;
    }
    for (const l of active) {
      l.v = Math.max(0, l.v + l.acc * DT);
      l.s += l.v * DT;
      if (k % 2 === 0) { l.samples.s.push(l.s); l.samples.v.push(l.v); l.samples.b.push(l.acc < -0.6 || l.v < 0.2 ? 1 : 0); }
      if (l.s > l.route.L) l.done = true;
    }
    for (let i = active.length - 1; i >= 0; i--) if (active[i].done) { const l = active[i]; l.t1 = t; active.splice(i, 1); }
  }
  for (const l of active) l.t1 = SIM_T + 200;
  TRAFFIC.lives = lives.filter(l => l.samples && l.samples.s.length > 2);
  TRAFFIC.lives.forEach((l, i) => { l.id = i; l.samples.s = Float32Array.from(l.samples.s); l.samples.v = Float32Array.from(l.samples.v); l.samples.b = Uint8Array.from(l.samples.b); });
  // fixed instance slots for bicycles, so no two bikes on screen together ever share one (the loop wraps)
  const used = Array.from({ length: BIKE_SLOTS }, () => []), over = (a, b, c, d) => a < d && c < b;
  for (const l of TRAFFIC.lives.filter(l => l.type === 'bike').sort((p, q) => p.samples.t0 - q.samples.t0)) {
    const a = l.samples.t0, b = a + (l.samples.s.length - 1) * 0.2;
    let k = used.findIndex(list => !list.some(([c, d]) => over(a, b, c, d) || over(a + SIM_T, b + SIM_T, c, d) || over(a - SIM_T, b - SIM_T, c, d)));
    if (k < 0) k = 0;
    used[k].push([a, b]); l.slot = k;
  }
}
const BIKE_SLOTS = 32;
const VT_LEN = { taxiS: 4.6, taxiJ: 4.4, kei: 3.4, sedan: 4.75, van: 4.7, truck: 3.4, bus: 10.5, cbus: 7.0 };

const _vs = { x: 0, z: 0, dx: 0, dz: 1 };
// Where vehicle `id` is at world time T (front-of-vehicle distance along its route).
function vehicleState(id, T) {
  const l = TRAFFIC.lives[id];
  const out = { visible: false, x: 0, z: 0, yaw: 0, dist: 0, v: 0, brake: 0 };
  if (!l) return out;
  const tt = ((T % SIM_T) + SIM_T) % SIM_T;
  for (const tcheck of [tt, tt + SIM_T, tt - SIM_T]) {
    const u = (tcheck - l.samples.t0) / 0.2;
    if (u < 0 || u >= l.samples.s.length - 1) continue;
    const i = Math.floor(u), f = u - i;
    const sF = lerp(l.samples.s[i], l.samples.s[i + 1], f);
    const sC = sF - l.len * 0.5;
    if (sC < 0 || sF > l.route.L) return out;
    l.route.at(sC, _vs);
    // smooth heading across corners
    const a = l.route.at(Math.max(0, sC - 1.2), { x: 0, z: 0 }), b = l.route.at(Math.min(l.route.L, sC + 1.2), { x: 0, z: 0 });
    out.visible = true; out.x = _vs.x; out.z = _vs.z; out.yaw = Math.atan2(b.x - a.x, b.z - a.z);
    out.dist = sF; out.v = lerp(l.samples.v[i], l.samples.v[i + 1], f); out.brake = l.samples.b[i];
    return out;
  }
  return out;
}

/* ---------- instanced vehicle rendering ---------- */
function buildVehicles() {
  const types = ['taxiS', 'taxiJ', 'kei', 'sedan', 'van', 'truck', 'bus', 'cbus'];
  paintVehicleAtlas();
  const mats = {
    paint: std({ roughness: 0.22, metalness: 0.35, envMapIntensity: 1.25 }, { lfHeight: 0.2, lfStrength: 1.4 }),
    trim: std({ color: 0x1c1d1f, roughness: 0.45, metalness: 0.3 }),
    glass: std({ color: 0x0a0d10, roughness: 0.06, metalness: 0.2, envMapIntensity: 1.5 }, { lf: false }),
    head: basic({ color: hdr(9, 8.4, 7.2) }),
    tail: basic({ color: 0xffffff }),
    roof: basic({ color: 0xffffff }),
    cabin: basic({ map: VATL.tex, vertexColors: true }),
    glassT: M.glass,
  };
  const STRIPE = { bus: '#1f7a4a', cbus: '#8c2232' };
  TRAFFIC.mats = mats;
  const maxPer = { taxiS: 22, taxiJ: 14, kei: 18, sedan: 18, van: 12, truck: 8, bus: 4, cbus: 2 };
  for (const t of types) {
    const md = vehicleModel(t);
    VTYPES[t] = md;
    const n = maxPer[t] + 4;
    const mk = (geo, m) => { if (!geo) return null; const im = new THREE.InstancedMesh(geo, m, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; for (let i = 0; i < n; i++) im.setMatrixAt(i, ZERO_M); scene.add(im); return im; };
    const set = { body: mk(md.geo.body, mats.paint), trim: mk(md.geo.trim, mats.trim), glass: mk(md.geo.glass, mats.glass), head: mk(md.geo.head, mats.head), tail: mk(md.geo.tail, mats.tail), roof: mk(md.geo.roof, mats.roof), n };
    set.cabin = mk(md.geo.cabin, mats.cabin);
    set.glassT = mk(md.geo.glassT, mats.glassT);
    set.stripe = STRIPE[t] ? mk(md.geo.stripe, std({ color: STRIPE[t], roughness: 0.3, metalness: 0.25, envMapIntensity: 1.2 }, { lfHeight: 0.2, lfStrength: 1.4 })) : null;
    set.body.castShadow = true;
    const bus = t === 'bus' || t === 'cbus';
    for (let i = 0; i < n; i++) { set.tail.setColorAt(i, hdr(3, 0.15, 0.1)); if (set.roof) set.roof.setColorAt(i, hdr(4.2, 3.8, 2.6)); set.body.setColorAt(i, new THREE.Color('#888')); if (set.cabin) set.cabin.setColorAt(i, bus ? hdr(1.35, 1.28, 1.15) : hdr(1, 1, 1)); }
    TRAFFIC.meshes[t] = set;
  }
  // wheels for everything (tyre + hub), a shared pool
  const wheelGeo = new Batch(null);
  wheelGeo.add(new THREE.CylinderGeometry(1, 1, 0.6, 16).rotateZ(Math.PI / 2), null);
  const hub = new Batch(null); hub.add(new THREE.CylinderGeometry(0.62, 0.62, 0.62, 10).rotateZ(Math.PI / 2), null);
  const nW = 500;
  TRAFFIC.wheels = new THREE.InstancedMesh(wheelGeo.build().geometry, M.rubber, nW);
  TRAFFIC.hubs = new THREE.InstancedMesh(hub.build().geometry, std({ color: 0x9a9fa3, roughness: 0.3, metalness: 0.8 }), nW);
  for (const im of [TRAFFIC.wheels, TRAFFIC.hubs]) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; for (let i = 0; i < nW; i++) im.setMatrixAt(i, ZERO_M); scene.add(im); }
  // the 空車 / 賃走 sign behind the windscreen of taxis
  TRAFFIC.vacancy = new THREE.InstancedMesh(G.box, basic({ color: 0xffffff }), 40);
  TRAFFIC.vacancy.instanceMatrix.setUsage(THREE.DynamicDrawUsage); TRAFFIC.vacancy.frustumCulled = false; scene.add(TRAFFIC.vacancy);
  // moving bicycles (shared geometry with the parked ones)
  const bg = bikeGeometry();
  const nb = BIKE_SLOTS;
  TRAFFIC.bikeFrame = new THREE.InstancedMesh(bg.frame, M.bikeFrame || (M.bikeFrame = std({ roughness: 0.35, metalness: 0.5, envMapIntensity: 1.2 })), nb);
  TRAFFIC.bikeDark = new THREE.InstancedMesh(bg.dark, M.rubber, nb);
  TRAFFIC.bikeBasket = new THREE.InstancedMesh(bg.basket, M.basket || (M.basket = std({ color: 0x9a9fa2, roughness: 0.4, metalness: 0.7, transparent: true, opacity: 0.55 })), nb);
  TRAFFIC.bikeLamp = new THREE.InstancedMesh(G.sph8, basic({ color: hdr(8, 7.6, 6) }), nb);
  for (const im of [TRAFFIC.bikeFrame, TRAFFIC.bikeDark, TRAFFIC.bikeBasket, TRAFFIC.bikeLamp]) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; for (let i = 0; i < nb; i++) im.setMatrixAt(i, ZERO_M); scene.add(im); }
  for (let i = 0; i < nb; i++) TRAFFIC.bikeFrame.setColorAt(i, new THREE.Color(BIKE_COLORS[i % BIKE_COLORS.length]));
  // headlight pools on the wet road
  TRAFFIC.pools = new THREE.InstancedMesh(G.ground, new THREE.MeshBasicMaterial({ map: TEX.pool, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true }), 120);
  TRAFFIC.pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage); TRAFFIC.pools.frustumCulled = false; TRAFFIC.pools.layers.set(LAYER_NOREFL); scene.add(TRAFFIC.pools);
  for (let i = 0; i < 120; i++) TRAFFIC.pools.setMatrixAt(i, ZERO_M);
  // parked cars
  for (const p of PARKED) {
    const md = VTYPES[p.type === 'kei' ? 'kei' : p.type === 'van' ? 'van' : 'sedan'];
    const m = mat(p.x, 0.06, p.z, p.yaw);
    const zone = zoneOf(p.z);
    STATIC.get('parkB', M.paintGloss, { colors: true }, zone).add(md.geo.body, m, new THREE.Color(p.color));
    STATIC.get('parkT', mats.trim, {}, zone).add(md.geo.trim, m);
    if (md.geo.glass) STATIC.get('parkG', mats.glass, {}, zone).add(md.geo.glass, m);
    STATIC.get('parkC', mats.cabin, { colors: true }, zone).add(md.geo.cabin, m);
    for (const [wx, wz] of md.wheels) STATIC.get('rubberB', M.rubber, {}, zone).add(new THREE.CylinderGeometry(md.wr, md.wr, 0.18, 14).rotateZ(Math.PI / 2), new THREE.Matrix4().multiplyMatrices(m, mat(wx, md.wr, wz)));
  }
}

const HERO_TAXI = { id: -1 };
const VPARTS = ['body', 'trim', 'glass', 'head', 'tail', 'roof', 'cabin', 'glassT', 'stripe'];
const VSHELL = { body: 1, trim: 1, glass: 1, cabin: 1, glassT: 1, stripe: 1 };   // hidden around the camera when it rides inside
function updateTraffic(T) {
  const counts = {};
  let wi = 0, vi = 0, pi = 0;
  const M_ = TRAFFIC.meshes;
  const glanceCand = [];
  for (const k in M_) counts[k] = 0;
  const bikeSlotsUsed = new Set();
  for (const l of TRAFFIC.lives) {
    const s = vehicleState(l.id, T);
    if (!s.visible) continue;
    const cosY = Math.cos(s.yaw), sinY = Math.sin(s.yaw);
    if (l.type === 'bike') {
      const slot = l.slot;
      if (bikeSlotsUsed.has(slot)) continue;
      bikeSlotsUsed.add(slot);
      const m = mat(s.x, 0, s.z, s.yaw, 0, 0.03 * Math.sin(s.dist * 1.7));
      TRAFFIC.bikeFrame.setMatrixAt(slot, m); TRAFFIC.bikeDark.setMatrixAt(slot, m); TRAFFIC.bikeBasket.setMatrixAt(slot, m);
      TRAFFIC.bikeLamp.setMatrixAt(slot, new THREE.Matrix4().multiplyMatrices(m, mat(0, 0.9, 0.55, 0, 0, 0, 0.06, 0.06, 0.06)));
      l.slot = slot;
      if (pi < 120) TRAFFIC.pools.setMatrixAt(pi++, mat(s.x + sinY * 2.2, 0.012, s.z + cosY * 2.2, s.yaw, 0, 0, 1.0, 1, 3.2)), TRAFFIC.pools.setColorAt(pi - 1, new THREE.Color(0.35, 0.33, 0.28));
      continue;
    }
    const set = M_[l.type]; const i = counts[l.type]++;
    if (i >= set.n) continue;
    const hideShell = CAMSTATE.vehicleId === l.id;
    const m = mat(s.x, 0, s.z, s.yaw);
    for (const p of VPARTS) if (set[p]) set[p].setMatrixAt(i, hideShell && VSHELL[p] ? ZERO_M : m);
    set.body.setColorAt(i, _c1.set(l.color));
    set.tail.setColorAt(i, s.brake ? _c1.setRGB(9, 0.35, 0.25) : _c1.setRGB(2.6, 0.12, 0.08));
    const md = VTYPES[l.type];
    for (const [wx, wz] of md.wheels) {
      if (wi >= 500) break;
      const wm = new THREE.Matrix4().multiplyMatrices(m, mat(wx, md.wr, wz, 0, s.dist / md.wr, 0, md.wr, md.wr * 0.95, md.wr));
      TRAFFIC.wheels.setMatrixAt(wi, wm);
      TRAFFIC.hubs.setMatrixAt(wi, wm);
      wi++;
    }
    if ((l.type === 'taxiS' || l.type === 'taxiJ') && vi < 40) {
      const zf = l.type === 'taxiS' ? 0.62 : 0.85;
      TRAFFIC.vacancy.setMatrixAt(vi, new THREE.Matrix4().multiplyMatrices(m, mat(0.42, 1.0, zf, 0, 0, 0, 0.3, 0.09, 0.02)));
      TRAFFIC.vacancy.setColorAt(vi, l.occupied ? _c1.setRGB(0.3, 2.2, 0.6) : _c1.setRGB(4.5, 0.2, 0.15));
      vi++;
      if (l.routeName === 'N' && Math.abs(s.z - HERO.z) < 14) glanceCand.push({ s, l });
    }
    if (pi < 118) {
      TRAFFIC.pools.setMatrixAt(pi, mat(s.x + sinY * 5.5, 0.01, s.z + cosY * 5.5, s.yaw, 0, 0, 3.0, 1, 8.5)); TRAFFIC.pools.setColorAt(pi, _c1.setRGB(0.85, 0.8, 0.68)); pi++;
      TRAFFIC.pools.setMatrixAt(pi, mat(s.x - sinY * (md.L * 0.5 + 1.2), 0.011, s.z - cosY * (md.L * 0.5 + 1.2), s.yaw + Math.PI, 0, 0, 2.2, 1, 3.0)); TRAFFIC.pools.setColorAt(pi, s.brake ? _c1.setRGB(0.7, 0.03, 0.02) : _c1.setRGB(0.28, 0.01, 0.01)); pi++;
    }
  }
  for (const k in M_) {
    const set = M_[k];
    for (const p of VPARTS) if (set[p]) {
      for (let i = counts[k]; i < set.n; i++) set[p].setMatrixAt(i, ZERO_M);
      set[p].instanceMatrix.needsUpdate = true; if (set[p].instanceColor) set[p].instanceColor.needsUpdate = true;
    }
  }
  for (let i = wi; i < 500; i++) { TRAFFIC.wheels.setMatrixAt(i, ZERO_M); TRAFFIC.hubs.setMatrixAt(i, ZERO_M); }
  for (let i = vi; i < 40; i++) TRAFFIC.vacancy.setMatrixAt(i, ZERO_M);
  for (let i = pi; i < 120; i++) TRAFFIC.pools.setMatrixAt(i, ZERO_M);
  for (let i = 0; i < BIKE_SLOTS; i++) if (!bikeSlotsUsed.has(i)) { TRAFFIC.bikeFrame.setMatrixAt(i, ZERO_M); TRAFFIC.bikeDark.setMatrixAt(i, ZERO_M); TRAFFIC.bikeBasket.setMatrixAt(i, ZERO_M); TRAFFIC.bikeLamp.setMatrixAt(i, ZERO_M); }
  for (const im of [TRAFFIC.wheels, TRAFFIC.hubs, TRAFFIC.vacancy, TRAFFIC.pools, TRAFFIC.bikeFrame, TRAFFIC.bikeDark, TRAFFIC.bikeBasket, TRAFFIC.bikeLamp]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  // he glances at a taxi passing close on his side
  let best = null;
  for (const c of glanceCand) { const d = Math.abs(c.s.z - HERO.z); if (!best || d < best.d) best = { d, c }; }
  if (best && best.d < 9) {
    const c = best.c.s;
    const dx = c.x - HERO.x, dz = c.z - HERO.z;
    const yawWorld = Math.atan2(dx, dz);
    HERO_TAXI_GLANCE.value = { yaw: clamp(wrapAngle(yawWorld - HERO_YAW), -1.0, 1.0), k: (1 - best.d / 9) * 0.85 };
  } else HERO_TAXI_GLANCE.value = null;
}

/* ---------- riders attached to bicycles in traffic ---------- */
function riderAgents() {
  const out = [];
  reseed(4545);
  for (let i = 0; i < BIKE_SLOTS; i++) {
    const look = makeLook({ umbrella: chance(0.25) ? 'open' : 'none', bag: chance(0.4) ? 'pack' : 'none', phone: false });
    out.push({ kind: 'rider', look, slot: i, vehicle: -1, phase: rnd(0, 10), umbHand: 1 });
  }
  return out;
}
function assignRiders(T) {
  const riders = CROWD.agents.filter(a => a.kind === 'rider');
  riders.forEach(r => r.vehicle = -1);
  for (const l of TRAFFIC.lives) {
    if (l.type !== 'bike') continue;
    const s = vehicleState(l.id, T);
    if (!s.visible) continue;
    const r = riders[l.slot];
    if (r && r.vehicle === -1) r.vehicle = l.id;
  }
}

/* ---------- the taxi interior for CAM 16 ---------- */
function buildTaxiInterior() {
  const g = new THREE.Group();
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); g.add(mesh); return mesh; };
  const dash = std({ color: 0x1a1b1d, roughness: 0.7 }), plastic = std({ color: 0x2a2b2e, roughness: 0.6 }), liner = std({ color: 0x8a8781, roughness: 0.95 });
  const paint = std({ color: 0x1d2a4a, roughness: 0.25, metalness: 0.35, envMapIntensity: 1.2 }, { lfHeight: 0.2 });
  const lace = basic({ map: TEX.sign, color: hdr(0.9, 0.9, 0.86), alphaTest: 0.4, side: THREE.DoubleSide });
  const skin = std({ color: 0xd9b394, roughness: 0.6 }), glove = std({ color: 0xf2f2ee, roughness: 0.7 }), uniform = std({ color: 0x22262e, roughness: 0.85 });
  // shell: roof, pillars, door panels, floor (camera rides in the rear seat, left side)
  add(new THREE.BoxGeometry(1.5, 0.04, 2.6), liner, 0, 1.47, -0.2);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 0.55, 0.08), plastic, s * 0.7, 1.15, 0.78, -0.55, 0, 0);
    add(new THREE.BoxGeometry(0.07, 0.55, 0.12), plastic, s * 0.74, 1.15, -0.25);
    add(new THREE.BoxGeometry(0.07, 0.55, 0.18), plastic, s * 0.72, 1.15, -1.35, 0.35, 0, 0);
    add(new THREE.BoxGeometry(0.06, 0.55, 2.3), dash, s * 0.78, 0.6, -0.25);
  }
  add(new THREE.BoxGeometry(1.5, 0.05, 2.4), dash, 0, 0.33, -0.25);
  // dashboard, steering wheel on the right, the meter, the vacancy sign seen from behind
  add(new THREE.BoxGeometry(1.5, 0.28, 0.45), dash, 0, 0.92, 1.05);
  add(new THREE.TorusGeometry(0.19, 0.022, 8, 24), plastic, -0.38, 1.0, 0.72, -0.35, 0, 0);
  const meter = add(new THREE.BoxGeometry(0.2, 0.08, 0.1), plastic, 0.1, 1.11, 0.92);
  add(new THREE.PlaneGeometry(0.17, 0.05), basic({ color: hdr(3.5, 0.6, 0.3) }), 0.1, 1.11, 0.865, 0, Math.PI, 0);
  add(new THREE.BoxGeometry(0.3, 0.09, 0.02), basic({ color: hdr(1.2, 0.08, 0.05) }), 0.42, 1.0, 1.0);
  add(new THREE.BoxGeometry(0.22, 0.06, 0.03), plastic, 0, 1.36, 0.82);
  add(new THREE.SphereGeometry(0.025, 6, 4), basic({ color: hdr(0.6, 1.4, 0.8) }), 0.0, 1.27, 0.82);
  // hood beyond the windscreen
  add(new THREE.BoxGeometry(1.6, 0.04, 1.3), paint, 0, 0.88, 1.75, 0.05, 0, 0);
  // front seats with white lace covers, the driver
  const laceR = (() => { const r = signRect(0.6, 0.8, 100), c = ATL.sign.ctx; c.clearRect(r.x, r.y, r.w, r.h); c.fillStyle = '#f7f5ef'; for (let y = r.y; y < r.y + r.h; y += 3) for (let x = r.x; x < r.x + r.w; x += 3) if (((x / 3 | 0) * 7 + (y / 3 | 0) * 3) % 5 !== 0) c.fillRect(x, y, 2, 2); TEX.sign.needsUpdate = true; return r; })();
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.5, 0.75, 0.14), uniform, s * 0.38, 0.95, 0.22);
    add(new THREE.BoxGeometry(0.22, 0.14, 0.12), uniform, s * 0.38, 1.4, 0.24);
    const lp = add(atlasPlane(laceR), lace, s * 0.38, 1.0, 0.145, 0, Math.PI, 0); lp.scale.set(0.48, 0.7, 1);
  }
  const drv = new THREE.Group(); drv.position.set(-0.38, 0, 0.42); g.add(drv);
  const dm = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); drv.add(mesh); return mesh; };
  dm(new THREE.CylinderGeometry(0.2, 0.17, 0.55, 10).scale(1, 1, 0.65), uniform, 0, 1.05, 0);
  dm(new THREE.SphereGeometry(0.1, 12, 10).scale(0.9, 1.08, 1), skin, 0, 1.5, 0.02);
  dm(new THREE.CylinderGeometry(0.105, 0.108, 0.06, 12), uniform, 0, 1.6, 0.0);
  dm(new THREE.BoxGeometry(0.2, 0.012, 0.08), plastic, 0, 1.575, 0.1);
  for (const s of [-1, 1]) dm(new THREE.SphereGeometry(0.04, 6, 5), glove, s * 0.15, 1.0, 0.3);
  // rear seat back (behind the camera) and the wet side windows
  add(new THREE.BoxGeometry(1.4, 0.7, 0.2), uniform, 0, 0.8, -0.95);
  const drops = new THREE.ShaderMaterial({
    uniforms: { tDrops: { value: TEX.drops }, uTime: U.uTime },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDrops; uniform float uTime; varying vec2 vUv;
      void main(){ vec2 uv = vUv * vec2(7.0, 2.2); uv.y += uTime * 0.01; vec4 d = texture2D(tDrops, uv); float m = smoothstep(0.38, 0.6, d.b);
        vec2 n = d.rg * 2.0 - 1.0; float spec = pow(max(dot(normalize(vec3(n, 0.6)), normalize(vec3(-0.3, 0.6, 0.7))), 0.0), 20.0);
        gl_FragColor = vec4(vec3(0.9, 0.92, 1.0) * (0.06 + spec * 1.6), m * 0.4); }`,
    transparent: true, depthWrite: false,
  });
  for (const s of [-1, 1]) { const w = add(new THREE.PlaneGeometry(1.9, 0.48), drops, s * 0.79, 1.16, -0.25, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0); w.renderOrder = 5; }
  const ws = add(new THREE.PlaneGeometry(1.36, 0.6), drops, 0, 1.14, 0.8, -0.95, 0, 0); ws.renderOrder = 5;
  // wipers
  const wipers = [];
  for (const x of [-0.45, 0.15]) { const w = new THREE.Group(); w.position.set(x, 0.92, 1.0); const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.55, 0.015).translate(0, 0.275, 0), dash); blade.rotation.x = -0.9; w.add(blade); g.add(w); wipers.push(w); }
  g.visible = false;
  scene.add(g);
  TAXI_INT.group = g; TAXI_INT.wipers = wipers; TAXI_INT.paint = paint; TAXI_INT.driver = drv;
  return g;
}
const TAXI_INT = {};
