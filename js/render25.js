/* Autobank-X — 2.5D 立體樓層繪製
 * 平面座標 (x, y) 以斜角投影到畫面：x 軸往右略下、y 軸往左下，z 為高度。
 * 牆採「剖面」手法：後方（北、西）外牆完整高度，前方與室內牆降低，避免遮住人物。
 * 家具、牆段、人物依平面 y（前緣）排序後由後往前繪製，人物會被櫃台、椅背自然遮住。
 */
(function () {
  const ABX = window.ABX;
  const EX = { x: 0.94, y: 0.22 }, EY = { x: -0.42, y: 0.6 };
  const OX = 190, OY = 64;
  const W = 1140, H = 560;
  const WALL = { back: 48, front: 7, inner: 16 };

  const P = (x, y, z = 0) => [OX + x * EX.x + y * EY.x, OY + x * EX.y + y * EY.y - z];

  /* ---------- 基本圖形 ---------- */
  function poly(ctx, pts, fill, stroke, lw = 1) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function shade(hex, f) {
    if (!hex || hex[0] !== '#') return hex;
    const h = hex.length === 4 ? hex.replace(/#(.)(.)(.)/, '#$1$1$2$2$3$3') : hex;
    const n = parseInt(h.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }
  const rect = (x, y, w, h, z = 0) => [P(x, y, z), P(x + w, y, z), P(x + w, y + h, z), P(x, y + h, z)];

  /* 立方體：先畫右側（+x）、前側（+y）再畫頂面 */
  function box(ctx, x, y, w, h, z0, hz, color, o = {}) {
    const z1 = z0 + hz;
    if (!o.noSide) poly(ctx, [P(x + w, y, z0), P(x + w, y + h, z0), P(x + w, y + h, z1), P(x + w, y, z1)], o.side || shade(color, 0.72));
    if (!o.noFront) poly(ctx, [P(x, y + h, z0), P(x + w, y + h, z0), P(x + w, y + h, z1), P(x, y + h, z1)], o.front || shade(color, 0.86));
    poly(ctx, rect(x, y, w, h, z1), o.top || color, o.edge || 'rgba(15,23,42,.18)', 0.6);
  }
  function frontFace(ctx, x1, x2, y, z0, z1, fill) { poly(ctx, [P(x1, y, z0), P(x2, y, z0), P(x2, y, z1), P(x1, y, z1)], fill); }

  function U() { return ABX.RenderUtil; }
  function label(ctx, s, x, y, z, size, color, weight = '700', bg) {
    const [sx, sy] = P(x, y, z);
    if (bg) {
      ctx.font = `${weight} ${size}px ${U().FONT}`;
      const w = ctx.measureText(s).width + 8;
      U().rr(ctx, sx - w / 2, sy - size / 2 - 3, w, size + 6, 4); ctx.fillStyle = bg; ctx.fill();
    }
    U().text(ctx, s, sx, sy, size, color, 'center', weight);
  }

  /* ---------- 地板材質 ---------- */
  const MAT = {
    sidewalk: ['#d6d3d1', '#c4bfbb', 'tile', 20], tileBlue: ['#dcefff', '#c5e0f5', 'tile', 18], stone: ['#eceff3', '#dde2e8', 'tile', 30],
    marble: ['#f6f7fa', '#e3e7ec', 'checker', 36], wood: ['#e7d3b8', '#d6bd9c', 'plank', 9], woodWarm: ['#f1e0c4', '#e1c9a5', 'plank', 10],
    carpetBlue: ['#dbe3f4', '#c9d4ec', 'dots'], carpetPurple: ['#e8e1f6', '#d8cdef', 'dots'], carpetGreen: ['#e2edd2', '#d1e2bb', 'dots'],
    vinyl: ['#eaedf0', '#dde2e6', 'tile', 24], concrete: ['#e2dfdb', '#cfcbc6', 'dots'], steel: ['#e6e0ca', '#d2c9ab', 'diamond', 14], raised: ['#dfe6ee', '#c8d3df', 'tile', 20],
  };
  function seeded(seed) { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

  function floorZone(ctx, z, seed) {
    const [base, line, kind, size] = MAT[z.mat] || MAT.vinyl;
    const pts = rect(z.x, z.y, z.w, z.h);
    poly(ctx, pts, base);
    ctx.save();
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.clip();
    ctx.strokeStyle = line; ctx.lineWidth = 0.8; ctx.fillStyle = line;
    if (kind === 'tile' || kind === 'checker') {
      if (kind === 'checker') {
        for (let x = z.x, i = 0; x < z.x + z.w; x += size, i++) for (let y = z.y, j = 0; y < z.y + z.h; y += size, j++)
          if ((i + j) % 2) poly(ctx, rect(x, y, size, size), 'rgba(203,213,225,.35)');
      }
      ctx.beginPath();
      for (let x = z.x + size; x < z.x + z.w; x += size) { ctx.moveTo(...P(x, z.y)); ctx.lineTo(...P(x, z.y + z.h)); }
      for (let y = z.y + size; y < z.y + z.h; y += size) { ctx.moveTo(...P(z.x, y)); ctx.lineTo(...P(z.x + z.w, y)); }
      ctx.stroke();
    } else if (kind === 'plank') {
      const r = seeded(seed);
      ctx.beginPath();
      for (let y = z.y + size; y < z.y + z.h; y += size) {
        ctx.moveTo(...P(z.x, y)); ctx.lineTo(...P(z.x + z.w, y));
        for (let x = z.x + r() * 60; x < z.x + z.w; x += 60 + r() * 40) { ctx.moveTo(...P(x, y - size)); ctx.lineTo(...P(x, y)); }
      }
      ctx.stroke();
    } else if (kind === 'dots') {
      const r = seeded(seed), n = (z.w * z.h) / 70;
      for (let i = 0; i < n; i++) { const [sx, sy] = P(z.x + r() * z.w, z.y + r() * z.h); ctx.fillRect(sx, sy, 1.3, 1.1); }
    } else if (kind === 'diamond') {
      ctx.beginPath();
      for (let k = -z.h; k < z.w; k += size) {
        ctx.moveTo(...P(z.x + k, z.y)); ctx.lineTo(...P(z.x + k + z.h, z.y + z.h));
        ctx.moveTo(...P(z.x + k + z.h, z.y)); ctx.lineTo(...P(z.x + k, z.y + z.h));
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- 牆段 ---------- */
  function buildWalls(f) {
    if (f._walls25) return f._walls25;
    const o = f.outline, segs = [], seen = new Set();
    const add = (orient, c, a, b) => {
      const key = `${orient}:${c}:${a}:${b}`;
      if (seen.has(key) || b - a < 1) return; seen.add(key);
      let kind = 'inner';
      if (orient === 'h' && Math.abs(c - o.y) < 1) kind = 'back';
      else if (orient === 'v' && Math.abs(c - o.x) < 1) kind = 'back';
      else if (orient === 'h' && Math.abs(c - (o.y + o.h)) < 1) kind = 'front';
      else if (orient === 'v' && Math.abs(c - (o.x + o.w)) < 1) kind = 'front';
      // 扣掉門洞
      let parts = [[a, b]];
      for (const [, , px, py, type] of f.portals) {
        const on = orient === 'h' ? Math.abs(py - c) < 1 && px > a && px < b : Math.abs(px - c) < 1 && py > a && py < b;
        if (!on) continue;
        const m = orient === 'h' ? px : py, half = type === 'glass' && (orient === 'v' && Math.abs(c - 40) < 1) ? 18 : 13;
        parts = parts.flatMap(([s, e]) => (m + half <= s || m - half >= e ? [[s, e]] : [[s, Math.max(s, m - half)], [Math.min(e, m + half), e]]).filter(([s2, e2]) => e2 - s2 > 0.5));
      }
      for (const [s, e] of parts) segs.push({ orient, c, a: s, b: e, kind });
    };
    for (const [id, z] of Object.entries(f.zones)) {
      if (id === 'street') continue;
      add('h', z.y, z.x, z.x + z.w); add('h', z.y + z.h, z.x, z.x + z.w);
      add('v', z.x, z.y, z.y + z.h); add('v', z.x + z.w, z.y, z.y + z.h);
    }
    // 1F 西側為玻璃店面：降為前牆處理，看得到街道
    for (const s of segs) if (s.orient === 'v' && Math.abs(s.c - 40) < 1 && f.zones.street) s.kind = 'glassfront';
    // 切小段以便與人物排序
    const pieces = [];
    for (const s of segs) {
      if (s.kind === 'back') { pieces.push(s); continue; }
      const step = 14;
      for (let a = s.a; a < s.b; a += step) pieces.push(Object.assign({}, s, { a, b: Math.min(s.b, a + step) }));
    }
    f._walls25 = pieces;
    return pieces;
  }

  function drawWall(ctx, s, glassList) {
    const t = 3;
    const hz = s.kind === 'back' ? WALL.back : s.kind === 'front' ? WALL.front : s.kind === 'glassfront' ? 26 : WALL.inner;
    const wallC = s.kind === 'back' ? '#e2e6ec' : '#d5dbe3';
    if (s.kind === 'glassfront') {
      box(ctx, s.c - t / 2, s.a, t, s.b - s.a, 0, 4, '#94a3b8');
      poly(ctx, [P(s.c, s.a, 4), P(s.c, s.b, 4), P(s.c, s.b, hz), P(s.c, s.a, hz)], 'rgba(186,230,253,.35)', 'rgba(125,211,252,.8)', 0.8);
      return;
    }
    if (s.orient === 'h') box(ctx, s.a, s.c - t / 2, s.b - s.a, t, 0, hz, wallC, { top: '#64748b' });
    else box(ctx, s.c - t / 2, s.a, t, s.b - s.a, 0, hz, wallC, { top: '#64748b' });
    if (s.kind === 'back') {   // 窗戶
      for (const [x1, y1, x2, y2] of glassList || []) {
        if (s.orient === 'h' && Math.abs(y1 - s.c) < 1 && Math.abs(y2 - s.c) < 1) {
          const a = Math.max(s.a, Math.min(x1, x2)), b = Math.min(s.b, Math.max(x1, x2));
          if (b - a > 4) for (let x = a; x < b - 4; x += 40) frontFace(ctx, x + 3, Math.min(b, x + 37), s.c + t / 2, 14, 40, 'rgba(147,197,253,.55)');
        }
      }
    }
  }

  /* ---------- 家具 ---------- */
  const DIR = { up: -Math.PI / 2, down: Math.PI / 2 };
  function chair(ctx, x, y, dir, c) {
    box(ctx, x - 5.5, y - 5.5, 11, 11, 0, 7, c);
    const dx = Math.round(Math.cos(dir)), dy = Math.round(Math.sin(dir));
    const back = shade(c, 0.75);
    if (dy === -1) box(ctx, x - 5.5, y + 3, 11, 2.5, 7, 9, back);           // 面向上：椅背在南
    else if (dy === 1) box(ctx, x - 5.5, y - 5.5, 11, 2.5, 7, 9, back);     // 面向下：椅背在北
    else if (dx === 1) box(ctx, x - 5.5, y - 5.5, 2.5, 11, 7, 9, back);
    else box(ctx, x + 3, y - 5.5, 2.5, 11, 7, 9, back);
  }

  function decoItem(d, floor) {
    // 回傳 { key, draw(ctx) }；key 為平面前緣 y
    switch (d.t) {
      case 'chair': return { key: d.y + 5.5, draw: (ctx) => chair(ctx, d.x, d.y, d.dir, d.c) };
      case 'desk': return { key: d.y + d.h, draw: (ctx) => {
        box(ctx, d.x, d.y, d.w, d.h, 0, 13, d.c || '#d6d3d1');
        if (d.mon) {
          const cx = d.x + d.w / 2;
          box(ctx, cx - 8, d.y + 2, 16, 2.5, 13, 11, '#1e293b');
          frontFace(ctx, cx - 7, cx + 7, d.y + 4.5, 15, 23, '#38bdf8');
          box(ctx, cx - 6, d.y + d.h - 7, 12, 4, 13, 1, '#e2e8f0');
        }
        if (d.label) label(ctx, d.label, d.x + d.w / 2, d.y + d.h / 2 + 3, 14, 8, '#334155');
      } };
      case 'counter': return { key: d.y + d.h, draw: (ctx) => {
        box(ctx, d.x, d.y, d.w, d.h, 0, 20, '#e7e0d6', { front: '#8b6b4a', side: '#6b5038' });
        poly(ctx, [P(d.x, d.y + 5, 20), P(d.x + d.w, d.y + 5, 20), P(d.x + d.w, d.y + 5, 38), P(d.x, d.y + 5, 38)], 'rgba(186,230,253,.28)', 'rgba(125,211,252,.7)', 0.8);
      } };
      case 'counter2': return { key: d.y + d.h, draw: (ctx) => { box(ctx, d.x, d.y, d.w, d.h, 0, 14, '#d6d3d1'); if (d.label) label(ctx, d.label, d.x + d.w / 2, d.y, 22, 8, '#57534e'); } };
      case 'plant': return { key: d.y + d.r * 0.6, draw: (ctx) => {
        box(ctx, d.x - d.r * 0.5, d.y - d.r * 0.5, d.r, d.r, 0, 8, '#a16207');
        const [sx, sy] = P(d.x, d.y, 14);
        const g = ['#15803d', '#16a34a', '#22c55e', '#4ade80'];
        for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; ctx.fillStyle = g[i % 4]; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * d.r * 0.55, sy - 4 + Math.sin(a) * d.r * 0.4, d.r * 0.55, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.arc(sx, sy - 8, d.r * 0.45, 0, 7); ctx.fill();
      } };
      case 'shelf': return { key: d.y + d.h, draw: (ctx) => {
        const hz = Math.min(34, 18 + Math.min(d.w, d.h));
        box(ctx, d.x, d.y, d.w, d.h, 0, hz, '#b5aea7', { front: '#9a928a' });
        ctx.strokeStyle = 'rgba(68,64,60,.35)'; ctx.lineWidth = 0.8; ctx.beginPath();
        for (let z = 8; z < hz; z += 8) { ctx.moveTo(...P(d.x, d.y + d.h, z)); ctx.lineTo(...P(d.x + d.w, d.y + d.h, z)); }
        ctx.stroke();
        if (d.label) label(ctx, d.label, d.x + d.w / 2, d.y + d.h / 2, hz + 2, 8, '#fff', '700', 'rgba(68,64,60,.75)');
      } };
      case 'machine': return { key: d.y + 8, draw: (ctx) => {
        box(ctx, d.x - 10, d.y - 8, 20, 16, 0, 26, d.c || '#e2e8f0');
        frontFace(ctx, d.x - 6, d.x + 6, d.y + 8, 14, 22, '#334155');
        label(ctx, d.label, d.x, d.y, 30, 7, '#334155');
      } };
      case 'atm': return { key: d.y + 7, draw: (ctx) => {
        box(ctx, d.x - 12, d.y - 7, 24, 14, 0, 32, '#0c4a6e');
        frontFace(ctx, d.x - 8, d.x + 8, d.y + 7, 18, 28, '#7dd3fc');
        frontFace(ctx, d.x - 6, d.x + 6, d.y + 7, 8, 13, '#cbd5e1');
        const [sx, sy] = P(d.x, d.y + 7, 23); U().text(ctx, 'ATM', sx, sy, 6, '#0c4a6e', 'center', '800');
      } };
      case 'kiosk': return { key: d.y + 6, draw: (ctx) => {
        box(ctx, d.x - 13, d.y - 6, 26, 12, 0, 30, '#15803d');
        frontFace(ctx, d.x - 9, d.x + 9, d.y + 6, 17, 27, '#dcfce7');
        const [sx, sy] = P(d.x, d.y + 6, 22); U().text(ctx, '取號', sx, sy, 7, '#14532d', 'center', '800');
      } };
      case 'tv': return { key: d.y + d.h, draw: (ctx) => drawTv(ctx, d, floor) };
      case 'table': return { key: d.y + d.h, draw: (ctx) => { box(ctx, d.x, d.y, d.w, d.h, 0, 11, '#d4b896'); if (d.label) label(ctx, d.label, d.x + d.w / 2, d.y + d.h / 2, 12, 9, '#57534e'); } };
      case 'sofa': return { key: d.y + d.h, draw: (ctx) => { box(ctx, d.x, d.y, d.w, d.h, 0, 9, d.c); box(ctx, d.x, d.y, d.w, 5, 9, 7, shade(d.c, 0.8)); } };
      case 'lockers': {
        const hz = d.y > 350 ? 14 : 32;   // 靠前牆的櫃子降低，避免擋住房間
        return { key: d.y + d.h, draw: (ctx) => {
          box(ctx, d.x, d.y, d.w, d.h, 0, hz, '#a3b1c2', { front: '#8696aa' });
          ctx.strokeStyle = 'rgba(51,65,85,.4)'; ctx.lineWidth = 0.8; ctx.beginPath();
          for (let x = d.x + 12; x < d.x + d.w; x += 12) { ctx.moveTo(...P(x, d.y + d.h, 0)); ctx.lineTo(...P(x, d.y + d.h, hz)); }
          ctx.moveTo(...P(d.x, d.y + d.h, hz / 2)); ctx.lineTo(...P(d.x + d.w, d.y + d.h, hz / 2)); ctx.stroke();
          if (d.label) label(ctx, d.label, d.x + d.w / 2, d.y + d.h, hz + 4, 8, '#334155', '700', 'rgba(255,255,255,.8)');
        } };
      }
      case 'bench': return { key: d.y + d.h, draw: (ctx) => box(ctx, d.x, d.y, d.w, d.h, 0, 6, '#a8a29e') };
      case 'room': return { key: d.y + d.h, draw: (ctx) => {
        box(ctx, d.x, d.y, d.w, d.h, 0, 24, '#e2e8f0', { front: '#cbd5e1', side: '#b6c2d0', top: '#f1f5f9' });
        label(ctx, d.label, d.x + d.w / 2, d.y + d.h / 2, 25, 9, '#475569');
      } };
      case 'rack': return { key: d.y + d.h, draw: (ctx) => {
        box(ctx, d.x, d.y, d.w, d.h, 0, 36, '#1e293b');
        for (let z = 6; z < 34; z += 6) { const [sx, sy] = P(d.x + 4, d.y + d.h, z); ctx.fillStyle = '#22c55e'; ctx.fillRect(sx, sy, 2, 1.6); }
      } };
      case 'cart': return { key: d.y + 7, draw: (ctx) => box(ctx, d.x - 9, d.y - 7, 18, 14, 2, 8, '#64748b') };
      case 'bin': return { key: d.y + 4, draw: (ctx) => box(ctx, d.x - 4, d.y - 4, 8, 8, 0, 9, '#64748b') };
      case 'umbrella': return { key: d.y + 5, draw: (ctx) => box(ctx, d.x - 5, d.y - 5, 10, 10, 0, 12, '#1e3a8a') };
      case 'rope': return { key: Math.max(...d.pts.map((p) => p[1])), draw: (ctx) => {
        ctx.strokeStyle = '#b91c1c'; ctx.lineWidth = 1.6; ctx.beginPath();
        d.pts.forEach(([x, y], i) => (i ? ctx.lineTo(...P(x, y, 11)) : ctx.moveTo(...P(x, y, 11)))); ctx.stroke();
        for (const [x, y] of d.pts) box(ctx, x - 1.5, y - 1.5, 3, 3, 0, 13, '#ca8a04');
      } };
      case 'tray': return { key: d.y + d.h, draw: (ctx) => box(ctx, d.x, d.y, d.w, d.h, 0, 4, '#f8fafc') };
      case 'line': {
        const v = Math.abs(d.x1 - d.x2) < 0.5;
        return { key: Math.max(d.y1, d.y2), draw: (ctx) => v ? box(ctx, d.x1 - 1, Math.min(d.y1, d.y2), 2, Math.abs(d.y2 - d.y1), 0, 16, '#cbd5e1') : box(ctx, Math.min(d.x1, d.x2), d.y1 - 1, Math.abs(d.x2 - d.x1), 2, 0, 16, '#cbd5e1') };
      }
      case 'stairs': return { key: d.y + d.h, draw: (ctx) => {
        for (let i = 0; i < 7; i++) box(ctx, d.x + i * 5, d.y + 2, 5, d.h - 4, 0, 4 + i * 4, '#d1d5db');
        box(ctx, d.x + 37, d.y + 2, 22, d.h - 4, 0, 46, '#cbd5e1', { front: '#b6c2d0' });
        ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(...P(d.x + 48, d.y + d.h - 2, 2)); ctx.lineTo(...P(d.x + 48, d.y + d.h - 2, 36)); ctx.stroke();
        label(ctx, 'EV', d.x + 48, d.y + d.h - 2, 41, 7, '#334155', '800');
      } };
      default: return null;   // 平面裝飾在靜態圖層處理
    }
  }

  function drawTv(ctx, d, floor) {
    const S = ABX.S, y = d.y + d.h, z0 = d.wall ? 16 : 8, z1 = d.wall ? z0 + Math.max(24, d.h * 1.1) : z0 + 20;
    if (!d.wall) {
      box(ctx, d.x + 8, y - 2, 3, 3, 0, z0, '#475569');
      box(ctx, d.x + d.w - 11, y - 2, 3, 3, 0, z0, '#475569');
    }
    box(ctx, d.x, y - 3, d.w, 3, z0, z1 - z0, '#334155', { front: '#0f172a' });
    if (d.wall) {
      const cols = ['#1d4ed8', '#0f766e', '#334155', '#1e40af'];
      for (let i = 0; i < 4; i++) frontFace(ctx, d.x + 4 + i * (d.w - 8) / 4, d.x + 2 + (i + 1) * (d.w - 8) / 4, y, z0 + 3, z1 - 3, cols[i]);
      return;
    }
    const D = S.D, mid = (z0 + z1) / 2;
    if (floor === 1) {
      const c = D.calls[0];
      label(ctx, '叫號看板', d.x + 22, y, z1 - 6, 7, '#94a3b8', '600');
      label(ctx, c ? `${c.no} → ${c.label}` : '— 尚未叫號 —', d.x + d.w / 2, y, mid - 3, 12, '#fde047', '800');
    } else {
      const c = D.calls.find((x) => x.floor === 2);
      label(ctx, '2F 叫號', d.x + d.w / 2, y, z1 - 6, 7, '#94a3b8', '600');
      label(ctx, c ? c.no : '—', d.x + d.w / 2, y, mid - 4, 13, '#fde047', '800');
    }
  }

  /* 畫面上的外框（保守估計），用於只重畫擋在人物前方的家具 */
  function bbPlan(x1, y1, x2, y2, hz) {
    const pts = [P(x1, y1, 0), P(x2, y1, 0), P(x1, y2, 0), P(x2, y2, 0), P(x1, y1, hz), P(x2, y1, hz), P(x1, y2, hz), P(x2, y2, hz)];
    return [Math.min(...pts.map((q) => q[0])) - 2, Math.min(...pts.map((q) => q[1])) - 2, Math.max(...pts.map((q) => q[0])) + 2, Math.max(...pts.map((q) => q[1])) + 2];
  }
  function bbOf(d) {
    switch (d.t) {
      case 'chair': case 'plant': case 'machine': case 'atm': case 'kiosk': case 'cart': case 'bin': case 'umbrella':
        return bbPlan(d.x - 14, d.y - 14, d.x + 14, d.y + 14, 40);
      case 'rope': { const xs = d.pts.map((q) => q[0]), ys = d.pts.map((q) => q[1]); return bbPlan(Math.min(...xs) - 3, Math.min(...ys) - 3, Math.max(...xs) + 3, Math.max(...ys) + 3, 16); }
      case 'line': return bbPlan(Math.min(d.x1, d.x2) - 2, Math.min(d.y1, d.y2) - 2, Math.max(d.x1, d.x2) + 2, Math.max(d.y1, d.y2) + 2, 18);
      default: return bbPlan(d.x, d.y, d.x + (d.w || 0), d.y + (d.h || 0), 50);
    }
  }
  const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

  function staticItems(f, floor) {
    if (f._static25) return f._static25;
    const items = [];
    for (const d of f.deco) {
      if (d.t === 'tv') continue;   // 看板內容會變動，每格重畫
      const it = decoItem(d, floor);
      if (it) { it.bb = bbOf(d); items.push(it); }
    }
    for (const s of buildWalls(f)) {
      if (s.kind === 'back') continue;
      const bb = s.orient === 'h' ? bbPlan(s.a, s.c - 2, s.b, s.c + 2, 30) : bbPlan(s.c - 2, s.a, s.c + 2, s.b, 30);
      items.push({ key: s.orient === 'h' ? s.c + 1.5 : s.b, draw: (c) => drawWall(c, s), bb });
    }
    items.sort((p, q) => p.key - q.key);
    f._static25 = items;
    return items;
  }

  function flatDeco(ctx, d) {
    switch (d.t) {
      case 'band': poly(ctx, rect(d.x, d.y, d.w, d.h), d.c); break;
      case 'rug':
        poly(ctx, rect(d.x, d.y, d.w, d.h), d.c);
        ctx.setLineDash([5, 4]); poly(ctx, rect(d.x + 5, d.y + 5, d.w - 10, d.h - 10), null, d.stroke || '#fb923c', 1.2); ctx.setLineDash([]);
        if (d.label) label(ctx, d.label, d.x + d.w / 2, d.y + 14, 0, 10, d.lc || '#9a3412');
        break;
      case 'mat': poly(ctx, rect(d.x, d.y, d.w, d.h), '#1e3a8a'); label(ctx, 'X', d.x + d.w / 2, d.y + d.h / 2, 0, 14, '#93c5fd', '800'); break;
      case 'logo': label(ctx, 'X', d.x, d.y, 0, 22, 'rgba(29,78,216,.12)', '800'); break;
      case 'text': label(ctx, d.text, d.x, d.y, 1, d.fs || 10, d.color || '#334155', '600', d.bg); break;
    }
  }

  /* ---------- 靜態圖層：地板、地板裝飾、後牆、區域名稱 ---------- */
  function buildStatic(v) {
    const L = ABX.L, f = L.floors[v.floor];
    const c = document.createElement('canvas');
    c.width = v.canvas.width; c.height = v.canvas.height;
    const ctx = c.getContext('2d');
    ctx.setTransform(v.scale, 0, 0, v.scale, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#e8edf3'); g.addColorStop(1, '#d4dce6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 樓板厚度
    const o = f.outline, ox0 = f.zones.street ? 0 : o.x;
    poly(ctx, [P(ox0, o.y + o.h, 0), P(o.x + o.w, o.y + o.h, 0), P(o.x + o.w, o.y + o.h, -12), P(ox0, o.y + o.h, -12)], '#94a3b8');
    poly(ctx, [P(o.x + o.w, o.y, 0), P(o.x + o.w, o.y + o.h, 0), P(o.x + o.w, o.y + o.h, -12), P(o.x + o.w, o.y, -12)], '#7b8ba0');
    let seed = 11 + v.floor * 97;
    for (const z of Object.values(f.zones)) floorZone(ctx, z, seed++);
    if (f.zones.street) {   // 路緣與斑馬線意象
      poly(ctx, rect(0, 0, 5, 420), '#a8a29e');
      for (let y = 20; y < 420; y += 40) poly(ctx, rect(8, y, 26, 4), 'rgba(255,255,255,.25)');
    }
    for (const d of f.deco) flatDeco(ctx, d);
    for (const s of buildWalls(f)) if (s.kind === 'back') drawWall(ctx, s, f.glass);
    for (const [id, z] of Object.entries(f.zones)) {
      if (id === 'street') continue;
      label(ctx, z.name, z.x + 8 + z.name.length * 4.5, z.y + 10, 0, 9, '#475569', '700', 'rgba(255,255,255,.8)');
    }
    for (const it of staticItems(f, v.floor)) it.draw(ctx);   // 家具與牆（不含人物）
    v.cache = c;
  }

  /* ---------- 每格繪製 ---------- */
  function vehicle(ctx, y, body, stripe, siren) {
    const x = 6, w = 28, h = 60, y0 = y - h / 2;
    box(ctx, x, y0 + 16, w, h - 16, 0, 26, body);
    box(ctx, x, y0, w, 16, 0, 18, shade(body, 0.95), { top: '#7dd3fc' });
    frontFace(ctx, x, x + w, y0 + h, 8, 12, stripe);
    if (siren) {
      const on = Math.floor(performance.now() / 300) % 2;
      box(ctx, x + 8, y0 + 18, 6, 4, 26, 3, on ? '#ef4444' : '#3b82f6');
      box(ctx, x + 15, y0 + 18, 6, 4, 26, 3, on ? '#3b82f6' : '#ef4444');
    }
  }

  function facingOf(dir) {
    const c = Math.cos(dir || 0), s = Math.sin(dir || 0);
    const sdx = c * EX.x + s * EY.x, sdy = c * EX.y + s * EY.y;
    return { facing: sdy > -0.05 ? 'front' : 'back', flip: sdx < 0 };
  }

  function drawFrame(ctx, floor) {
    const S = ABX.S, L = ABX.L, D = S.D, f = L.floors[floor], P2 = ABX.People;
    const items = [];
    const stat = staticItems(f, floor);
    for (const d of f.deco) if (d.t === 'tv') { const it = decoItem(d, floor); it.bb = bbOf(d); items.push(it); }

    // 動態物件
    if (floor === 1) {
      const open = D.doorOpened && !D.doorClosed;
      items.push({ key: 348, bb: bbPlan(36, 310, 44, 350, 30), draw: (c) => {
        const gl = open ? 'rgba(134,239,172,.35)' : 'rgba(252,165,165,.45)';
        if (open) { poly(c, [P(40, 312, 2), P(40, 318, 2), P(40, 318, 26), P(40, 312, 26)], gl, '#22c55e'); poly(c, [P(40, 342, 2), P(40, 348, 2), P(40, 348, 26), P(40, 342, 26)], gl, '#22c55e'); }
        else poly(c, [P(40, 312, 2), P(40, 348, 2), P(40, 348, 26), P(40, 312, 26)], gl, '#ef4444');
      } });
      for (const m of L.atms) if (m.broken || D.powerOut) items.push({ key: m.y + 7.5, bb: [0, 0, 0, 0], draw: (c) => {
        const [sx, sy] = P(m.x, m.y + 7, 22);
        c.strokeStyle = '#dc2626'; c.lineWidth = 3; c.beginPath(); c.moveTo(sx - 8, sy - 7); c.lineTo(sx + 8, sy + 7); c.moveTo(sx + 8, sy - 7); c.lineTo(sx - 8, sy + 7); c.stroke();
      } });
      const vb = (y) => bbPlan(4, y - 32, 38, y + 32, 34);
      if (S.agents.some((a) => a.role === 'crew')) items.push({ key: 415, bb: vb(385), draw: (c) => vehicle(c, 385, '#14532d', '#facc15') });
      const veh = new Set(S.agents.filter((a) => a.vehicle).map((a) => a.vehicle));
      if (veh.has('ambulance')) items.push({ key: 260, bb: vb(230), draw: (c) => vehicle(c, 230, '#f8fafc', '#dc2626', true) });
      if (veh.has('police')) items.push({ key: 180, bb: vb(150), draw: (c) => vehicle(c, 150, '#1e3a8a', '#f8fafc', true) });
      if (veh.has('van')) items.push({ key: 90, bb: vb(60), draw: (c) => vehicle(c, 60, '#e5e7eb', '#f97316') });
    }
    if (floor === -1) {
      items.push({ key: 182, bb: bbPlan(215, 176, 250, 208, 32), draw: (c) => {
        if (D.vaultOpen) { box(c, 243, 180, 4, 26, 0, 30, '#a8a29e'); poly(c, [P(217, 180, 0), P(243, 180, 0), P(243, 180, 30), P(217, 180, 30)], '#1c1917'); }
        else {
          box(c, 217, 178, 26, 4, 0, 30, '#78716c');
          const [sx, sy] = P(230, 182, 15);
          c.strokeStyle = '#facc15'; c.lineWidth = 2; c.beginPath(); c.arc(sx, sy, 7, 0, 7); c.stroke();
          for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; c.beginPath(); c.moveTo(sx + Math.cos(a) * 3, sy + Math.sin(a) * 3); c.lineTo(sx + Math.cos(a) * 10, sy + Math.sin(a) * 10); c.stroke(); }
        }
      } });
    }
    // 臨時事件：地面標記
    for (const inc of S.incidents || []) {
      if (inc.status !== 'active' || inc.floor !== floor) continue;
      const { x, y } = inc.where;
      if (inc.puddle) items.push({ key: y - 20, bb: bbPlan(x - 30, y - 18, x + 30, y + 18, 2), draw: (c) => {
        const pts = []; for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; pts.push(P(x + Math.cos(a) * 28, y + Math.sin(a) * 16)); }
        poly(c, pts, 'rgba(56,189,248,.45)');
      } });
    }
    // 人物
    for (const a of S.agents) {
      if (a.floor !== floor || a.transfer || a.dead) continue;
      items.push({ key: a.y, agent: a });
    }
    items.sort((p, q) => p.key - q.key);
    // 只重畫「位於該物件前方且在畫面上重疊」的靜態家具
    const cover = (key, bb) => { for (const st of stat) if (st.key > key && overlap(st.bb, bb)) st.draw(ctx); };

    const pulse = (Math.sin(performance.now() / 260) + 1) / 2;
    for (const it of items) {
      if (!it.agent) { it.draw(ctx); cover(it.key, it.bb || [0, 0, W, H]); continue; }
      const a = it.agent, [sx, sy] = P(a.x, a.y, 0);
      a._p25 = { floor, x: sx, y: sy };
      if (S.highlight === a.id) {
        ctx.beginPath(); ctx.ellipse(sx, sy, 13, 6, 0, 0, 7); ctx.fillStyle = 'rgba(244,63,94,.25)'; ctx.fill(); ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = 2; ctx.stroke();
      }
      const fc = facingOf(a.dir);
      if (a.look) P2.drawStanding(ctx, sx, sy, a.look, {
        scale: a.kind === 'customer' ? 0.92 : 1, facing: fc.facing, flip: fc.flip, moving: a.moving, walk: a.walk,
        carry: (a.carry && a.carry.length) || (a.bag && a.bag.length), cashbox: a.cashbox, sick: a.sick,
      });
      cover(a.y, a.sick ? [sx - 22, sy - 14, sx + 18, sy + 5] : [sx - 22, sy - 34, sx + 22, sy + 5]);
    }

    /* ---------- 浮動標示（永遠在最上層） ---------- */
    for (const inc of S.incidents || []) {
      if (inc.status !== 'active' || inc.floor !== floor) continue;
      const { x, y } = inc.where;
      const pts = []; for (let i = 0; i < 24; i++) { const ang = (i / 24) * Math.PI * 2; pts.push(P(x + Math.cos(ang) * (20 + pulse * 8), y + Math.sin(ang) * (20 + pulse * 8))); }
      poly(ctx, pts, null, `rgba(220,38,38,${0.35 + pulse * 0.5})`, 2.5);
      const [sx, sy] = P(x, y, 54);
      ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(...P(x, y, 0)); ctx.lineTo(sx, sy); ctx.stroke();
      ctx.font = `700 9px ${U().FONT}`;
      const w = ctx.measureText(inc.name).width + 18;
      U().rr(ctx, sx - w / 2, sy - 8, w, 16, 8); ctx.fillStyle = '#dc2626'; ctx.fill();
      U().text(ctx, '!', sx - w / 2 + 8, sy + 0.5, 10, '#fff', 'center', '900');
      U().text(ctx, inc.name, sx + 5, sy + 0.5, 9, '#fff', 'center', '700');
    }
    for (const p of S.points) {
      if (p.floor !== floor) continue;
      const z = p.kind === 'counter' ? 40 : 30;
      const [sx, sy] = P(p.signX, p.kind === 'counter' ? p.signY - 6 : p.signY, z);
      const w = p.kind === 'counter' ? 44 : 56;
      if ((D.sysDown || D.powerOut) && !p.current) U().sign(ctx, sx, sy, w, '系統異常', '#991b1b', '#fff');
      else if (p.current) U().sign(ctx, sx, sy, w, p.current.no, '#0f172a', p.current.status === 'serving' ? '#4ade80' : '#facc15');
      else if (p.open) U().sign(ctx, sx, sy, w, '請稍候', '#0f172a', '#93c5fd');
      else U().sign(ctx, sx, sy, w, p.staff && p.staff.label === '午休用餐' ? '休息中' : '暫停服務', '#7f1d1d', '#fecaca');
      if (p.kind === 'counter') { U().rr(ctx, sx - w / 2 - 13, sy - 6, 11, 12, 2); ctx.fillStyle = '#fff'; ctx.fill(); U().text(ctx, p.short, sx - w / 2 - 7.5, sy + 0.5, 8, '#1e293b', 'center', '800'); }
      const n = S.docs.filter((d) => d.stage === '櫃檯待收' && d.point === p).length;
      if (n) { const [dx, dy] = P(p.staffSpot.x + 18, p.staffSpot.y + 14, 15); U().rr(ctx, dx - 7, dy - 6, 14, 11, 2); ctx.fillStyle = '#0f766e'; ctx.fill(); U().text(ctx, n, dx, dy, 8, '#fff', 'center', '800'); }
    }
    if (floor === 1) {
      if (D.kioskDown || D.powerOut) { const [sx, sy] = P(205, 140, 44); U().sign(ctx, sx, sy, 52, '暫停取號', '#991b1b', '#fff'); }
      const open = D.doorOpened && !D.doorClosed;
      const [dx, dy] = P(40, 330, 36); U().sign(ctx, dx, dy, 40, open ? '營業中' : '休息', open ? '#166534' : '#7f1d1d', '#fff');
    }
    if (floor === 3) {
      const tray = (x, y, n, lab) => { const [sx, sy] = P(x, y, 16); U().text(ctx, lab, sx, sy - 9, 8, '#334155', 'center', '700'); U().sign(ctx, sx, sy + 2, 34, n + ' 件', n ? '#b91c1c' : '#475569', '#fff'); };
      tray(200, 151, ABX.Sim.docsIn('主管核章', '總行來文').length, '經理待核');
      tray(630, 152, ABX.Sim.docsIn('後勤審核').length, '收件匣');
      tray(915, 152, ABX.Sim.docsIn('待送總行').length, '待送總行');
    }
    if (floor === -1) {
      const [sx, sy] = P(330, 160, 34);
      U().sign(ctx, sx, sy, 70, D.vaultOpen ? '金庫 開啟' : '金庫 封閉', D.vaultOpen ? '#166534' : '#7f1d1d', '#fff');
      label(ctx, '庫存 ' + ABX.fmtMoney(S.vaultCash), 130, 150, 2, 10, '#92400e', '800', 'rgba(255,255,255,.8)');
    }
    const showLabels = ABX.UI ? ABX.UI.showLabels : true;
    for (const a of S.agents) {
      if (a.floor !== floor || a.transfer || a.dead || !a._p25) continue;
      const { x: sx, y: sy } = a._p25;
      if (a.sick) {
        ctx.fillStyle = '#fff'; U().rr(ctx, sx + 6, sy - 26, 13, 13, 3); ctx.fill(); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#dc2626'; ctx.fillRect(sx + 11, sy - 24, 3, 9); ctx.fillRect(sx + 8, sy - 21, 9, 3);
      }
      if (a.kind === 'staff' && showLabels) {
        const lab = a.label.length > 9 ? a.label.slice(0, 9) + '…' : a.label;
        ctx.font = `9px ${U().FONT}`;
        const w = ctx.measureText(lab).width + 6;
        U().rr(ctx, sx - w / 2, sy + 3, w, 12, 3); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
        U().text(ctx, lab, sx, sy + 9.5, 9, '#334155');
      }
      if (S.highlight === a.id && a.kind === 'staff') {
        ctx.font = `700 10px ${U().FONT}`;
        const w = ctx.measureText(a.name).width + 10;
        U().rr(ctx, sx - w / 2, sy - 48, w, 15, 4); ctx.fillStyle = '#f43f5e'; ctx.fill();
        U().text(ctx, a.name, sx, sy - 40.5, 10, '#fff', 'center', '700');
      }
      if (a.role === 'cleaner' && !a.moving && /拖地|擦拭|清理/.test(a.label)) {
        ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(sx + 14, sy - 14); ctx.lineTo(sx + 20, sy - 2); ctx.lineTo(sx + 8, sy - 2); ctx.closePath(); ctx.fill();
        U().text(ctx, '!', sx + 14, sy - 5.5, 7, '#0f172a', 'center', '800');
      }
      if (a.kind === 'customer' && a.ticket && (a.ticket.status === 'waiting' || a.ticket.status === 'called') && !a.atPoint) {
        const tk = a.ticket;
        ctx.font = `800 8px ${U().FONT}`;
        const w = ctx.measureText(tk.no).width + 6;
        U().rr(ctx, sx - w / 2, sy - 42, w, 10, 2); ctx.fillStyle = a.color; ctx.fill();
        U().text(ctx, tk.no, sx, sy - 36.6, 8, '#fff', 'center', '800');
        if (tk.status === 'waiting') {
          const r = (S.t - tk.issuedAt) / a.patience;
          if (r > 0.85) U().bubble(ctx, sx + 8, sy - 44, '!', '#dc2626', '#fff');
          else if (r > 0.55) U().bubble(ctx, sx + 8, sy - 44, '…', '#fff', '#475569');
        }
      }
    }
    lighting(ctx, floor);
    emergency(ctx);
  }

  function lighting(ctx, floor) {
    const S = ABX.S, t = S.t % 86400;
    const anyone = S.staff.some((a) => a.floor === floor && a.state !== 'home');
    const dark = t < 6 * 3600 || t > 18.5 * 3600 ? 0.42 : t < 7 * 3600 ? 0.42 * (7 * 3600 - t) / 3600 : t > 17.5 * 3600 ? 0.42 * (t - 17.5 * 3600) / 3600 : 0;
    const a = anyone ? dark * 0.3 : Math.max(dark, S.D.h.open ? 0 : 0.12);
    if (a > 0.01) { ctx.fillStyle = `rgba(15,23,42,${a.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
  }
  function emergency(ctx) {
    const D = ABX.S.D;
    if (D.powerOut) {
      ctx.fillStyle = `rgba(2,6,23,${D.generator ? 0.28 : 0.5})`; ctx.fillRect(0, 0, W, H);
      U().text(ctx, D.generator ? '停電中・緊急發電機供電' : '停電中', W / 2, 22, 13, '#fde047', 'center', '800');
    }
    if (D.alarm && Math.floor(performance.now() / 400) % 2) {
      ctx.strokeStyle = 'rgba(220,38,38,.85)'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, W - 10, H - 10);
      U().text(ctx, '火警警報', W / 2, 22, 13, '#dc2626', 'center', '900');
    }
  }

  ABX.Render25 = { W, H, P, buildStatic, drawFrame };
})();
