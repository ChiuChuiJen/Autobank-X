/* Autobank-X — Canvas 樓層繪製（靜態圖層快取＋動態物件＋人物） */
(function () {
  const ABX = window.ABX;
  const FONT = "'Noto Sans TC','PingFang TC','Microsoft JhengHei',system-ui,sans-serif";
  const views = []; // {floor, canvas, ctx, scale, cache, cacheKey}

  function attach(canvas, floor) {
    const v = { floor, canvas, ctx: canvas.getContext('2d'), scale: 1, cache: null, cacheKey: '' };
    views.push(v);
    canvas.addEventListener('mousemove', (e) => hover(v, e));
    canvas.addEventListener('mouseleave', () => tip(null));
    canvas.addEventListener('click', (e) => {
      const a = hit(v, e);
      ABX.S.highlight = a ? a.id : null;
      if (ABX.UI) ABX.UI.refreshStaff(true);
    });
    return v;
  }
  function detachAll() { views.length = 0; }

  function resize(v) {
    const L = ABX.L, dpr = window.devicePixelRatio || 1;
    const w = v.canvas.clientWidth || 600;
    const h = Math.round((w * L.H) / L.W);
    if (v.canvas.width !== Math.round(w * dpr) || v.canvas.height !== Math.round(h * dpr)) {
      v.canvas.width = Math.round(w * dpr); v.canvas.height = Math.round(h * dpr);
      v.canvas.style.height = h + 'px';
    }
    v.scale = (w * dpr) / L.W;
  }

  /* ---------- 基本繪圖 ---------- */
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r || 0); else ctx.rect(x, y, w, h);
  }
  function text(ctx, s, x, y, size, color, align = 'center', weight = '') {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }
  function seeded(seed) { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

  /* ---------- 地板材質 ---------- */
  const MAT = {
    sidewalk:     { base: '#d6d3d1', line: '#c4bfbb', kind: 'tile', size: 20 },
    tileBlue:     { base: '#e0f2fe', line: '#cbe5f6', kind: 'tile', size: 18 },
    stone:        { base: '#eef0f3', line: '#dfe3e8', kind: 'tile', size: 30 },
    marble:       { base: '#f7f8fa', alt: '#f0f2f5', line: '#e3e7ec', kind: 'checker', size: 36 },
    wood:         { base: '#ead9c3', line: '#dcc6aa', kind: 'plank', size: 9 },
    woodWarm:     { base: '#f3e4cc', line: '#e5d0b0', kind: 'plank', size: 10 },
    carpetBlue:   { base: '#dfe6f5', dot: '#cfd8ee', kind: 'carpet' },
    carpetPurple: { base: '#ebe5f7', dot: '#dcd3f0', kind: 'carpet' },
    carpetGreen:  { base: '#e6f0d8', dot: '#d6e4c2', kind: 'carpet' },
    vinyl:        { base: '#eceff1', line: '#e1e5e8', kind: 'tile', size: 24 },
    concrete:     { base: '#e4e2df', dot: '#d3d0cc', kind: 'speckle' },
    steel:        { base: '#e8e3d0', line: '#d6cfb6', kind: 'diamond', size: 14 },
    raised:       { base: '#e2e8f0', line: '#cbd5e1', kind: 'tile', size: 20 },
  };

  function floorFill(ctx, z, seed) {
    const m = MAT[z.mat] || MAT.vinyl;
    ctx.save();
    ctx.beginPath(); ctx.rect(z.x, z.y, z.w, z.h); ctx.clip();
    ctx.fillStyle = m.base; ctx.fillRect(z.x, z.y, z.w, z.h);
    ctx.lineWidth = 1;
    if (m.kind === 'tile' || m.kind === 'checker') {
      const s = m.size;
      if (m.kind === 'checker') {
        ctx.fillStyle = m.alt;
        for (let x = z.x, i = 0; x < z.x + z.w; x += s, i++) for (let y = z.y, j = 0; y < z.y + z.h; y += s, j++) if ((i + j) % 2) ctx.fillRect(x, y, s, s);
      }
      ctx.strokeStyle = m.line; ctx.beginPath();
      for (let x = z.x + s; x < z.x + z.w; x += s) { ctx.moveTo(x, z.y); ctx.lineTo(x, z.y + z.h); }
      for (let y = z.y + s; y < z.y + z.h; y += s) { ctx.moveTo(z.x, y); ctx.lineTo(z.x + z.w, y); }
      ctx.stroke();
    } else if (m.kind === 'plank') {
      const s = m.size, r = seeded(seed);
      ctx.strokeStyle = m.line; ctx.beginPath();
      for (let y = z.y + s, row = 0; y < z.y + z.h; y += s, row++) {
        ctx.moveTo(z.x, y); ctx.lineTo(z.x + z.w, y);
        for (let x = z.x + r() * 60; x < z.x + z.w; x += 60 + r() * 40) { ctx.moveTo(x, y - s); ctx.lineTo(x, y); }
      }
      ctx.stroke();
    } else if (m.kind === 'carpet' || m.kind === 'speckle') {
      const r = seeded(seed), n = (z.w * z.h) / (m.kind === 'carpet' ? 60 : 110);
      ctx.fillStyle = m.dot;
      for (let i = 0; i < n; i++) ctx.fillRect(z.x + r() * z.w, z.y + r() * z.h, 1.4, 1.4);
    } else if (m.kind === 'diamond') {
      const s = m.size;
      ctx.strokeStyle = m.line; ctx.beginPath();
      for (let k = -z.h; k < z.w; k += s) { ctx.moveTo(z.x + k, z.y); ctx.lineTo(z.x + k + z.h, z.y + z.h); ctx.moveTo(z.x + k + z.h, z.y); ctx.lineTo(z.x + k, z.y + z.h); }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- 家具 ---------- */
  function chairShape(ctx, x, y, dir, c) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(dir);
    ctx.fillStyle = 'rgba(15,23,42,.12)'; rr(ctx, -6, -6.5, 13, 14, 3); ctx.fill();
    ctx.fillStyle = c; rr(ctx, -6, -6.5, 12, 13, 3); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; rr(ctx, -8, -6.5, 3.2, 13, 1.5); ctx.fill();   // 椅背在身後
    ctx.restore();
  }
  function monitor(ctx, d) {
    const cx = d.x + d.w / 2;
    const y = d.mon === 'down' ? d.y + 3 : d.y + d.h - 7;
    ctx.fillStyle = '#1e293b'; rr(ctx, cx - 9, y, 18, 4, 1); ctx.fill();
    ctx.fillStyle = '#38bdf8'; ctx.fillRect(cx - 7.5, y + (d.mon === 'down' ? 3 : 0.4), 15, 0.9);
    ctx.fillStyle = '#e2e8f0'; rr(ctx, cx - 7, y + (d.mon === 'down' ? 7 : -6), 14, 3.5, 1); ctx.fill();
  }

  function drawDeco(ctx, d) {
    switch (d.t) {
      case 'chair': chairShape(ctx, d.x, d.y, d.dir, d.c); break;
      case 'desk':
        ctx.fillStyle = 'rgba(15,23,42,.10)'; rr(ctx, d.x + 1.5, d.y + 2, d.w, d.h, 3); ctx.fill();
        ctx.fillStyle = d.c || '#d6d3d1'; rr(ctx, d.x, d.y, d.w, d.h, 3); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1; ctx.stroke();
        if (d.mon) monitor(ctx, d);
        if (d.label) text(ctx, d.label, d.x + d.w / 2, d.y + d.h / 2 + (d.mon ? 3 : 0), 8, '#334155', 'center', '600');
        break;
      case 'counter':
        ctx.fillStyle = 'rgba(15,23,42,.12)'; ctx.fillRect(d.x, d.y + 3, d.w, d.h);
        ctx.fillStyle = '#8b6b4a'; ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.fillStyle = '#e7e0d6'; ctx.fillRect(d.x, d.y + d.h - 9, d.w, 9);
        ctx.strokeStyle = 'rgba(186,230,253,.95)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(d.x, d.y + 6); ctx.lineTo(d.x + d.w, d.y + 6); ctx.stroke();
        break;
      case 'counter2':
        ctx.fillStyle = '#d6d3d1'; ctx.fillRect(d.x, d.y, d.w, d.h);
        if (d.label) text(ctx, d.label, d.x + d.w / 2, d.y - 6, 8, '#57534e');
        break;
      case 'band': ctx.fillStyle = d.c; ctx.fillRect(d.x, d.y, d.w, d.h); break;
      case 'plant': {
        ctx.fillStyle = '#a16207'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 0.55, 0, 7); ctx.fill();
        const greens = ['#15803d', '#16a34a', '#22c55e'];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.fillStyle = greens[i % 3]; ctx.beginPath(); ctx.arc(d.x + Math.cos(a) * d.r * 0.5, d.y + Math.sin(a) * d.r * 0.5, d.r * 0.5, 0, 7); ctx.fill();
        }
        ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 0.35, 0, 7); ctx.fill();
        break;
      }
      case 'shelf':
        ctx.fillStyle = '#a8a29e'; rr(ctx, d.x, d.y, d.w, d.h, 2); ctx.fill();
        ctx.strokeStyle = '#78716c'; ctx.lineWidth = 1; ctx.beginPath();
        if (d.w >= d.h) for (let x = d.x + 12; x < d.x + d.w; x += 12) { ctx.moveTo(x, d.y + 2); ctx.lineTo(x, d.y + d.h - 2); }
        else for (let y = d.y + 12; y < d.y + d.h; y += 12) { ctx.moveTo(d.x + 2, y); ctx.lineTo(d.x + d.w - 2, y); }
        ctx.stroke();
        if (d.label) { ctx.save(); if (d.h > d.w * 1.5) { ctx.translate(d.x + d.w / 2, d.y + d.h / 2); ctx.rotate(-Math.PI / 2); text(ctx, d.label, 0, 0, 8, '#fff', 'center', '700'); } else text(ctx, d.label, d.x + d.w / 2, d.y + d.h / 2, 8, '#fff', 'center', '700'); ctx.restore(); }
        break;
      case 'machine':
        ctx.fillStyle = 'rgba(15,23,42,.12)'; rr(ctx, d.x - 10, d.y - 9, 22, 21, 3); ctx.fill();
        ctx.fillStyle = d.c || '#e2e8f0'; rr(ctx, d.x - 11, d.y - 10, 22, 20, 3); ctx.fill();
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.stroke();
        text(ctx, d.label, d.x, d.y + 0.5, 7, '#334155', 'center', '700');
        break;
      case 'atm':
        ctx.fillStyle = 'rgba(15,23,42,.15)'; rr(ctx, d.x - 12, d.y - 10, 26, 26, 3); ctx.fill();
        ctx.fillStyle = '#0c4a6e'; rr(ctx, d.x - 13, d.y - 11, 26, 24, 3); ctx.fill();
        ctx.fillStyle = '#7dd3fc'; ctx.fillRect(d.x - 8, d.y - 7, 16, 9);
        ctx.fillStyle = '#cbd5e1'; ctx.fillRect(d.x - 6, d.y + 4, 12, 5);
        text(ctx, 'ATM', d.x, d.y - 2.5, 6, '#0c4a6e', 'center', '800');
        break;
      case 'kiosk':
        ctx.fillStyle = 'rgba(15,23,42,.15)'; rr(ctx, d.x - 14, d.y - 10, 30, 24, 4); ctx.fill();
        ctx.fillStyle = '#15803d'; rr(ctx, d.x - 15, d.y - 11, 30, 23, 4); ctx.fill();
        ctx.fillStyle = '#dcfce7'; ctx.fillRect(d.x - 10, d.y - 7, 20, 9);
        text(ctx, '取號', d.x, d.y - 2.5, 7, '#14532d', 'center', '800');
        ctx.fillStyle = '#f8fafc'; ctx.fillRect(d.x - 4, d.y + 6, 8, 3);
        break;
      case 'tv':
        ctx.fillStyle = '#334155'; rr(ctx, d.x - 2, d.y - 2, d.w + 4, d.h + 4, 4); ctx.fill();
        ctx.fillStyle = '#0f172a'; rr(ctx, d.x, d.y, d.w, d.h, 2); ctx.fill();
        if (d.wall) { for (let i = 0; i < 4; i++) { ctx.fillStyle = ['#1d4ed8', '#0f766e', '#334155', '#1e40af'][i]; ctx.fillRect(d.x + 4 + i * (d.w - 8) / 4, d.y + 4, (d.w - 8) / 4 - 3, d.h - 8); } }
        break;
      case 'table':
        ctx.fillStyle = 'rgba(15,23,42,.10)'; rr(ctx, d.x + 2, d.y + 2, d.w, d.h, 10); ctx.fill();
        ctx.fillStyle = '#d4b896'; rr(ctx, d.x, d.y, d.w, d.h, 10); ctx.fill();
        ctx.strokeStyle = '#b08d68'; ctx.lineWidth = 1; ctx.stroke();
        if (d.label) text(ctx, d.label, d.x + d.w / 2, d.y + d.h / 2, 9, '#57534e', 'center', '600');
        break;
      case 'sofa':
        ctx.fillStyle = d.c; rr(ctx, d.x, d.y, d.w, d.h, 5); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.18)'; rr(ctx, d.x + 3, d.y + 3, d.w - 6, d.h - 6, 3); ctx.fill();
        break;
      case 'rug':
        ctx.fillStyle = d.c; rr(ctx, d.x, d.y, d.w, d.h, 8); ctx.fill();
        ctx.strokeStyle = '#fb923c'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; rr(ctx, d.x + 5, d.y + 5, d.w - 10, d.h - 10, 6); ctx.stroke(); ctx.setLineDash([]);
        if (d.label) text(ctx, d.label, d.x + d.w / 2, d.y + 16, 10, '#9a3412', 'center', '700');
        break;
      case 'lockers':
        ctx.fillStyle = '#94a3b8'; ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1; ctx.beginPath();
        for (let x = d.x + 12; x < d.x + d.w; x += 12) { ctx.moveTo(x, d.y); ctx.lineTo(x, d.y + d.h); }
        if (d.label) { ctx.moveTo(d.x, d.y + d.h / 2); ctx.lineTo(d.x + d.w, d.y + d.h / 2); }
        ctx.stroke();
        if (d.label) text(ctx, d.label, d.x + d.w / 2, d.y + d.h + 7, 8, '#475569', 'center', '700');
        break;
      case 'bench': ctx.fillStyle = '#a8a29e'; rr(ctx, d.x, d.y, d.w, d.h, 3); ctx.fill(); break;
      case 'room':
        ctx.fillStyle = 'rgba(148,163,184,.18)'; ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2; ctx.strokeRect(d.x, d.y, d.w, d.h);
        text(ctx, d.label, d.x + d.w / 2, d.y + d.h / 2, 9, '#475569', 'center', '600');
        break;
      case 'rack':
        ctx.fillStyle = '#1e293b'; rr(ctx, d.x, d.y, d.w, d.h, 2); ctx.fill();
        for (let y = d.y + 5; y < d.y + d.h - 3; y += 7) { ctx.fillStyle = '#22c55e'; ctx.fillRect(d.x + 4, y, 2, 2); ctx.fillStyle = '#475569'; ctx.fillRect(d.x + 9, y, d.w - 13, 2); }
        break;
      case 'cart':
        ctx.fillStyle = '#64748b'; rr(ctx, d.x - 9, d.y - 7, 18, 14, 2); ctx.fill();
        ctx.fillStyle = '#334155'; for (const [dx, dy] of [[-7, -8], [7, -8], [-7, 8], [7, 8]]) { ctx.beginPath(); ctx.arc(d.x + dx, d.y + dy, 1.8, 0, 7); ctx.fill(); }
        break;
      case 'bin': ctx.fillStyle = '#64748b'; ctx.beginPath(); ctx.arc(d.x, d.y, 5, 0, 7); ctx.fill(); ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(d.x, d.y, 3, 0, 7); ctx.fill(); break;
      case 'umbrella': ctx.fillStyle = '#1e3a8a'; ctx.beginPath(); ctx.arc(d.x, d.y, 6, 0, 7); ctx.fill(); ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(d.x - 2, d.y - 1, 1.8, 0, 7); ctx.fill(); ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(d.x + 2, d.y + 1.5, 1.8, 0, 7); ctx.fill(); break;
      case 'mat':
        ctx.fillStyle = '#1e3a8a'; rr(ctx, d.x, d.y, d.w, d.h, 4); ctx.fill();
        text(ctx, 'X', d.x + d.w / 2, d.y + d.h / 2 + 1, 16, '#93c5fd', 'center', '800');
        break;
      case 'logo':
        ctx.strokeStyle = 'rgba(29,78,216,.12)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(d.x, d.y, 22, 0, 7); ctx.stroke();
        text(ctx, 'X', d.x, d.y + 1, 24, 'rgba(29,78,216,.12)', 'center', '800');
        break;
      case 'rope':
        ctx.strokeStyle = '#b91c1c'; ctx.lineWidth = 1.6; ctx.beginPath();
        d.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        for (const [x, y] of d.pts) { ctx.fillStyle = '#ca8a04'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
        break;
      case 'tray':
        ctx.fillStyle = '#f8fafc'; rr(ctx, d.x, d.y, d.w, d.h, 3); ctx.fill();
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.2; ctx.stroke();
        break;
      case 'line':
        ctx.strokeStyle = d.c; ctx.lineWidth = d.w || 1; ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke();
        break;
      case 'stairs': {
        ctx.fillStyle = '#e5e7eb'; ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 1; ctx.beginPath();
        for (let x = d.x + 4; x < d.x + 34; x += 5) { ctx.moveTo(x, d.y + 3); ctx.lineTo(x, d.y + d.h - 3); }
        ctx.stroke();
        ctx.fillStyle = '#cbd5e1'; ctx.fillRect(d.x + 37, d.y + 4, 22, d.h - 8);
        ctx.strokeStyle = '#64748b'; ctx.beginPath(); ctx.moveTo(d.x + 48, d.y + 4); ctx.lineTo(d.x + 48, d.y + d.h - 4); ctx.stroke();
        text(ctx, 'EV', d.x + 48, d.y + d.h / 2, 7, '#334155', 'center', '800');
        ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1.5; ctx.strokeRect(d.x, d.y, d.w, d.h);
        break;
      }
      case 'text':
        if (d.bg) { ctx.font = `600 ${d.fs || 10}px ${FONT}`; const w = ctx.measureText(d.text).width + 10; ctx.fillStyle = d.bg; rr(ctx, d.x - w / 2, d.y - 8, w, 16, 8); ctx.fill(); }
        text(ctx, d.text, d.x, d.y, d.fs || 10, d.color || '#334155', 'center', '600');
        break;
    }
  }

  /* ---------- 牆與門 ---------- */
  function drawWalls(ctx, f) {
    const zs = Object.entries(f.zones).filter(([id]) => id !== 'street');
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3;
    for (const [, z] of zs) ctx.strokeRect(z.x, z.y, z.w, z.h);
    const o = f.outline;
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 6; ctx.strokeRect(o.x, o.y, o.w, o.h);
    for (const [a, b, x, y, type] of f.portals) {
      const za = f.zones[a];
      const vertical = Math.abs(x - za.x) < 1 || Math.abs(x - (za.x + za.w)) < 1;
      const onEdge = vertical || Math.abs(y - za.y) < 1 || Math.abs(y - (za.y + za.h)) < 1;
      if (!onEdge) continue;
      const half = type === 'glass' && a === 'street' ? 18 : 13;
      ctx.strokeStyle = (MAT[f.zones[b].mat] || MAT.vinyl).base; ctx.lineWidth = 8; ctx.beginPath();
      if (vertical) { ctx.moveTo(x, y - half); ctx.lineTo(x, y + half); } else { ctx.moveTo(x - half, y); ctx.lineTo(x + half, y); }
      ctx.stroke();
      if (type === 'door') {
        const room = a === 'corridor' ? f.zones[b] : za;
        const into = vertical ? (room.x > x - 1 ? 1 : -1) : (room.y > y - 1 ? 1 : -1);
        ctx.strokeStyle = '#78716c'; ctx.lineWidth = 1;
        const r = 2 * half;
        const hx = vertical ? x : x - half, hy = vertical ? y - half : y;
        const leaf = vertical ? (into > 0 ? 0 : Math.PI) : (into > 0 ? Math.PI / 2 : -Math.PI / 2);
        const [a0, a1] = vertical ? (into > 0 ? [0, Math.PI / 2] : [Math.PI / 2, Math.PI]) : (into > 0 ? [0, Math.PI / 2] : [-Math.PI / 2, 0]);
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(leaf) * r, hy + Math.sin(leaf) * r); ctx.stroke();
        ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(hx, hy, r, a0, a1); ctx.stroke(); ctx.setLineDash([]);
      } else if (type === 'glass') {
        ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 2; ctx.beginPath();
        if (vertical) { ctx.moveTo(x - 2, y - half); ctx.lineTo(x - 2, y - 2); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + 2, y + half); }
        else { ctx.moveTo(x - half, y - 2); ctx.lineTo(x - 2, y - 2); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + half, y + 2); }
        ctx.stroke();
      }
    }
    // 窗戶／玻璃帷幕
    ctx.strokeStyle = '#bae6fd'; ctx.lineWidth = 3;
    for (const [x1, y1, x2, y2] of f.glass || []) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  }

  function drawZoneLabels(ctx, f) {
    for (const [id, z] of Object.entries(f.zones)) {
      if (id === 'street') continue;
      ctx.font = `700 9px ${FONT}`;
      const w = ctx.measureText(z.name).width + 8;
      ctx.fillStyle = 'rgba(255,255,255,.78)'; rr(ctx, z.x + 5, z.y + 5, w, 13, 3); ctx.fill();
      text(ctx, z.name, z.x + 9, z.y + 12, 9, '#475569', 'left', '700');
    }
  }

  function buildStatic(v) {
    const L = ABX.L, f = L.floors[v.floor];
    const c = document.createElement('canvas');
    c.width = v.canvas.width; c.height = v.canvas.height;
    const ctx = c.getContext('2d');
    ctx.setTransform(v.scale, 0, 0, v.scale, 0, 0);
    ctx.fillStyle = '#cbd5e1'; ctx.fillRect(0, 0, L.W, L.H);
    let seed = 7 + v.floor * 101;
    for (const z of Object.values(f.zones)) floorFill(ctx, z, seed++);
    if (v.floor === 1) {   // 人行道路緣
      ctx.fillStyle = '#a8a29e'; ctx.fillRect(0, 0, 4, L.H);
    }
    for (const d of f.deco) if (d.t === 'rug' || d.t === 'band' || d.t === 'logo' || d.t === 'mat') drawDeco(ctx, d);
    drawWalls(ctx, f);
    for (const d of f.deco) if (!(d.t === 'rug' || d.t === 'band' || d.t === 'logo' || d.t === 'mat')) drawDeco(ctx, d);
    drawZoneLabels(ctx, f);
    v.cache = c;
  }

  /* ---------- 動態物件 ---------- */
  function sign(ctx, x, y, w, s, bg, fg) {
    rr(ctx, x - w / 2, y - 7, w, 14, 3); ctx.fillStyle = bg; ctx.fill();
    text(ctx, s, x, y + 0.5, 9, fg, 'center', '700');
  }

  function drawDynamic(ctx, floor) {
    const S = ABX.S, L = ABX.L, D = S.D;
    const docsIn = ABX.Sim.docsIn;
    for (const p of S.points) {
      if (p.floor !== floor) continue;
      const w = p.kind === 'counter' ? 46 : 58;
      if ((D.sysDown || D.powerOut) && !p.current) sign(ctx, p.signX, p.signY, w, '系統異常', '#991b1b', '#fff');
      else if (p.current) sign(ctx, p.signX, p.signY, w, p.current.no, '#0f172a', p.current.status === 'serving' ? '#4ade80' : '#facc15');
      else if (p.open) sign(ctx, p.signX, p.signY, w, '請稍候', '#0f172a', '#93c5fd');
      else sign(ctx, p.signX, p.signY, w, p.staff && p.staff.label === '午休用餐' ? '休息中' : '暫停服務', '#7f1d1d', '#fecaca');
      if (p.kind === 'counter') { rr(ctx, p.signX - 36, p.signY - 6, 11, 12, 2); ctx.fillStyle = '#fff'; ctx.fill(); text(ctx, p.short, p.signX - 30.5, p.signY + 0.5, 8, '#1e293b', 'center', '800'); }
      const n = S.docs.filter((d) => d.stage === '櫃檯待收' && d.point === p).length;
      if (n) {
        const x = p.staffSpot.x + 20, y = p.staffSpot.y + 12;
        for (let i = 0; i < Math.min(n, 4); i++) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#64748b'; ctx.lineWidth = 0.7; ctx.fillRect(x - 5 + i, y - 4 - i * 1.5, 10, 7); ctx.strokeRect(x - 5 + i, y - 4 - i * 1.5, 10, 7); }
        text(ctx, n, x + 10, y - 6, 7, '#0f766e', 'center', '800');
      }
    }
    if (floor === 1) {
      const open = D.doorOpened && !D.doorClosed;
      ctx.strokeStyle = open ? '#22c55e' : '#ef4444'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(40, open ? 312 : 314); ctx.lineTo(40, open ? 318 : 346); ctx.moveTo(40, open ? 342 : 346); ctx.lineTo(40, 348); ctx.stroke();
      ctx.save(); ctx.translate(14, 300); text(ctx, open ? '營業中' : '休息', 0, 0, 8, open ? '#15803d' : '#b91c1c', 'center', '800'); ctx.restore();
      for (const m of L.atms) {
        ctx.fillStyle = m.broken || D.powerOut ? '#ef4444' : m.user ? '#f59e0b' : '#22c55e'; ctx.beginPath(); ctx.arc(m.x + 9, 40, 2.4, 0, 7); ctx.fill();
        if (m.broken || D.powerOut) { ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(m.x - 9, m.y - 9); ctx.lineTo(m.x + 9, m.y + 9); ctx.moveTo(m.x + 9, m.y - 9); ctx.lineTo(m.x - 9, m.y + 9); ctx.stroke(); }
      }
      if (D.kioskDown || D.powerOut) sign(ctx, 205, 125, 52, '暫停取號', '#991b1b', '#fff');
      const c = D.calls[0];
      text(ctx, '叫號看板', 748, 147, 7, '#94a3b8', 'left');
      text(ctx, c ? `${c.no} → ${c.label}` : '— 尚未叫號 —', 845, 160, 12, '#fde047', 'center', '800');
      // 運鈔車
      if (S.agents.some((a) => a.role === 'crew')) drawTruck(ctx, 20, 385);
      const veh = new Set(S.agents.filter((a) => a.vehicle).map((a) => a.vehicle));
      if (veh.has('ambulance')) drawTruck(ctx, 20, 230, '#f8fafc', '#dc2626', true);
      if (veh.has('police')) drawTruck(ctx, 20, 150, '#1e3a8a', '#f8fafc', true);
      if (veh.has('van')) drawTruck(ctx, 20, 60, '#e5e7eb', '#f97316');
    }
    if (floor === 2) {
      const c = D.calls.find((x) => x.floor === 2);
      text(ctx, '2F 叫號', 915, 205, 7, '#94a3b8');
      text(ctx, c ? c.no : '—', 915, 222, 13, '#fde047', 'center', '800');
    }
    if (floor === 3) {
      const tray = (x, y, n, lab) => { text(ctx, lab, x, y - 13, 8, '#334155', 'center', '700'); text(ctx, n + ' 件', x, y + 1, 9, n ? '#b91c1c' : '#64748b', 'center', '800'); };
      tray(200, 151, docsIn('主管核章', '總行來文').length, '經理待核');
      tray(630, 152, docsIn('後勤審核').length, '收件匣');
      tray(915, 152, docsIn('待送總行').length, '待送總行');
    }
    if (floor === -1) {
      const open = D.vaultOpen;
      ctx.save(); ctx.translate(230, 180);
      ctx.fillStyle = '#57534e'; ctx.fillRect(-18, -4, 36, 8);
      if (open) {
        ctx.rotate(-Math.PI * 0.42);
        ctx.fillStyle = '#a8a29e'; ctx.beginPath(); ctx.ellipse(-26, 0, 22, 5, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#57534e'; ctx.lineWidth = 1.5; ctx.stroke();
      } else {
        ctx.fillStyle = '#78716c'; ctx.beginPath(); ctx.arc(0, 0, 17, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -6, 6, 0, 7); ctx.stroke();
        for (let i = 0; i < 4; i++) { const a = Math.PI + (i * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 6, -6 + Math.sin(a) * 6); ctx.lineTo(Math.cos(a) * 11, -6 + Math.sin(a) * 11); ctx.stroke(); }
      }
      ctx.restore();
      sign(ctx, 330, 162, 70, open ? '金庫 開啟' : '金庫 封閉', open ? '#166534' : '#7f1d1d', '#fff');
      text(ctx, '庫存 ' + ABX.fmtMoney(ABX.S.vaultCash), 120, 162, 10, '#92400e', 'center', '800');
    }
  }

  function drawTruck(ctx, x, y, body = '#14532d', stripe = '#facc15', siren = false) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(15,23,42,.2)'; rr(ctx, -15, -33, 32, 70, 5); ctx.fill();
    ctx.fillStyle = body; rr(ctx, -16, -34, 32, 68, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#7dd3fc'; rr(ctx, -12, -30, 24, 10, 2); ctx.fill();
    ctx.fillStyle = stripe; ctx.fillRect(-16, 8, 32, 4);
    if (siren) {
      const on = Math.floor(performance.now() / 300) % 2;
      ctx.fillStyle = on ? '#ef4444' : '#3b82f6'; ctx.fillRect(-10, -18, 8, 4);
      ctx.fillStyle = on ? '#3b82f6' : '#ef4444'; ctx.fillRect(2, -18, 8, 4);
    }
    ctx.restore();
  }

  /* 臨時事件標記 */
  function drawIncidents(ctx, floor) {
    const S = ABX.S;
    const pulse = (Math.sin(performance.now() / 260) + 1) / 2;
    for (const inc of S.incidents || []) {
      if (inc.status !== 'active' || inc.floor !== floor) continue;
      const { x, y } = inc.where;
      if (inc.puddle) {
        ctx.fillStyle = 'rgba(56,189,248,.45)'; ctx.beginPath(); ctx.ellipse(x, y, 26, 14, 0.2, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(14,165,233,.35)'; ctx.beginPath(); ctx.ellipse(x + 10, y - 3, 10, 5, 0, 0, 7); ctx.fill();
        for (let i = 0; i < 3; i++) { ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(x - 12 + i * 12, y - 26 + ((performance.now() / 8 + i * 30) % 22), 1.8, 0, 7); ctx.fill(); }
      }
      ctx.strokeStyle = `rgba(220,38,38,${0.35 + pulse * 0.5})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 18 + pulse * 8, 0, 7); ctx.stroke();
      ctx.font = `700 9px ${FONT}`;
      const w = ctx.measureText(inc.name).width + 18;
      const lx = Math.min(Math.max(x, w / 2 + 4), 996 - w / 2), ly = Math.max(y - 34, 14);
      rr(ctx, lx - w / 2, ly - 8, w, 16, 8); ctx.fillStyle = '#dc2626'; ctx.fill();
      text(ctx, '!', lx - w / 2 + 8, ly + 0.5, 10, '#fff', 'center', '900');
      text(ctx, inc.name, lx + 5, ly + 0.5, 9, '#fff', 'center', '700');
    }
  }

  function bubble(ctx, x, y, s, bg, fg) {
    rr(ctx, x, y - 7, 14, 12, 4); ctx.fillStyle = bg; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 3, y + 5); ctx.lineTo(x + 1, y + 9); ctx.lineTo(x + 7, y + 5); ctx.fill();
    text(ctx, s, x + 7, y - 1, 9, fg, 'center', '800');
  }

  function drawAgents(ctx, floor) {
    const S = ABX.S, P = ABX.People;
    const showLabels = ABX.UI ? ABX.UI.showLabels : true;
    const list = S.agents.filter((a) => a.floor === floor && !a.transfer && !a.dead).sort((a, b) => a.y - b.y);
    for (const a of list) {
      const hl = S.highlight === a.id;
      if (hl) { ctx.beginPath(); ctx.arc(a.x, a.y, 15, 0, Math.PI * 2); ctx.fillStyle = 'rgba(244,63,94,.18)'; ctx.fill(); ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = 2; ctx.stroke(); }
      const isStaff = a.kind === 'staff';
      if (a.role === 'cleaner' && !a.moving && /拖地|擦拭|清理/.test(a.label)) {
        ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(a.x + 14, a.y - 12); ctx.lineTo(a.x + 20, a.y - 1); ctx.lineTo(a.x + 8, a.y - 1); ctx.closePath(); ctx.fill();
        text(ctx, '!', a.x + 14, a.y - 4.5, 7, '#0f172a', 'center', '800');
      }
      if (a.sick) {
        ctx.fillStyle = '#fff'; rr(ctx, a.x + 6, a.y - 22, 13, 13, 3); ctx.fill(); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#dc2626'; ctx.fillRect(a.x + 11, a.y - 20, 3, 9); ctx.fillRect(a.x + 8, a.y - 17, 9, 3);
      }
      if (a.look) P.draw(ctx, a.x, a.y, a.sick ? 0.3 : a.dir || 0, a.look, {
        scale: isStaff || a.kind === 'visitor' ? 1 : 0.9, moving: a.moving, walk: a.walk,
        carry: (a.carry && a.carry.length) || (a.bag && a.bag.length), cashbox: a.cashbox,
      });
      if (isStaff && showLabels) {
        const lab = a.label.length > 9 ? a.label.slice(0, 9) + '…' : a.label;
        ctx.font = `9px ${FONT}`;
        const w = ctx.measureText(lab).width + 6;
        rr(ctx, a.x - w / 2, a.y + 11, w, 12, 3); ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fill();
        text(ctx, lab, a.x, a.y + 17.5, 9, '#334155');
      }
      if (hl && isStaff) {
        ctx.font = `700 10px ${FONT}`;
        const w = ctx.measureText(a.name).width + 10;
        rr(ctx, a.x - w / 2, a.y - 27, w, 15, 4); ctx.fillStyle = '#f43f5e'; ctx.fill();
        text(ctx, a.name, a.x, a.y - 19.5, 10, '#fff', 'center', '700');
      }
      if (a.kind === 'customer' && a.ticket && (a.ticket.status === 'waiting' || a.ticket.status === 'called') && !a.atPoint) {
        const tk = a.ticket;
        ctx.font = `800 8px ${FONT}`;
        const w = ctx.measureText(tk.no).width + 6;
        rr(ctx, a.x - w / 2, a.y - 20, w, 10, 2); ctx.fillStyle = a.color; ctx.fill();
        text(ctx, tk.no, a.x, a.y - 14.6, 8, '#fff', 'center', '800');
        if (tk.status === 'waiting') {
          const r = (S.t - tk.issuedAt) / a.patience;
          if (r > 0.85) bubble(ctx, a.x + 7, a.y - 24, '!', '#dc2626', '#fff');
          else if (r > 0.55) bubble(ctx, a.x + 7, a.y - 24, '…', '#fff', '#475569');
        }
      }
    }
  }

  function lighting(ctx, floor) {
    const S = ABX.S, t = S.t % 86400;
    const anyone = S.staff.some((a) => a.floor === floor && a.state !== 'home');
    const dark = t < 6 * 3600 || t > 18.5 * 3600 ? 0.42 : t < 7 * 3600 ? 0.42 * (7 * 3600 - t) / 3600 : t > 17.5 * 3600 ? 0.42 * (t - 17.5 * 3600) / 3600 : 0;
    const a = anyone ? dark * 0.3 : Math.max(dark, S.D.h.open ? 0 : 0.12);
    if (a > 0.01) {
      ctx.fillStyle = `rgba(15,23,42,${a.toFixed(3)})`;
      if (floor === 1) { ctx.fillRect(40, 185, 960, 235); ctx.fillRect(170, 0, 830, 185); ctx.fillRect(0, 0, 40, 420); }
      else ctx.fillRect(0, 0, 1000, 420);
    }
  }

  function emergency(ctx) {
    const D = ABX.S.D;
    if (D.powerOut) {
      ctx.fillStyle = `rgba(2,6,23,${D.generator ? 0.28 : 0.5})`; ctx.fillRect(0, 0, 1000, 420);
      text(ctx, D.generator ? '停電中・緊急發電機供電' : '停電中', 500, 22, 12, '#fde047', 'center', '800');
    }
    if (D.alarm && Math.floor(performance.now() / 400) % 2) {
      ctx.strokeStyle = 'rgba(220,38,38,.85)'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 990, 410);
      text(ctx, '火警警報', 500, 22, 12, '#dc2626', 'center', '900');
    }
  }

  function draw() {
    if (!ABX.S || !ABX.L) return;
    for (const v of views) {
      if (!v.canvas.offsetParent) continue;
      resize(v);
      const key = v.canvas.width + 'x' + v.canvas.height + ':' + (ABX.L.id || (ABX.L.id = Math.random()));
      if (v.cacheKey !== key) { buildStatic(v); v.cacheKey = key; }
      const ctx = v.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(v.cache, 0, 0);
      ctx.setTransform(v.scale, 0, 0, v.scale, 0, 0);
      drawDynamic(ctx, v.floor);
      drawIncidents(ctx, v.floor);
      drawAgents(ctx, v.floor);
      lighting(ctx, v.floor);
      emergency(ctx);
    }
  }

  function pos(v, e) {
    const r = v.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * ABX.L.W, y: ((e.clientY - r.top) / r.height) * ABX.L.H };
  }
  function hit(v, e) {
    const p = pos(v, e);
    let best = null, bd = 14;
    for (const a of ABX.S.agents) {
      if (a.floor !== v.floor || a.transfer || a.dead) continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  let tipEl = null;
  function tip(html, e) {
    if (!tipEl) tipEl = document.getElementById('tooltip');
    if (!tipEl) return;
    if (!html) { tipEl.hidden = true; return; }
    tipEl.innerHTML = html; tipEl.hidden = false;
    const x = Math.min(e.clientX + 14, window.innerWidth - tipEl.offsetWidth - 8);
    tipEl.style.left = x + 'px'; tipEl.style.top = e.clientY + 14 + 'px';
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function hover(v, e) {
    const a = hit(v, e);
    v.canvas.style.cursor = a ? 'pointer' : 'default';
    if (!a) { tip(null); return; }
    let html;
    if (a.kind === 'staff') {
      const lv = ABX.People.LEVELS[a.level];
      html = `<b>${esc(a.name)}</b>（${ABX.ROLES[a.role].label}${lv ? '・' + lv.label : ''}）<br>特色：${esc(a.trait || '—')}<br>${esc(ABX.Sim.whereOf(a))}<br>狀態：${esc(a.label)}`;
      if (a.temp) html += `<br>鄰近分行支援（代 ${esc(a.acting)}）`;
      else if (a.acting) html += `<br>代班：代理 ${esc(a.acting)} 的職務`;
      else if (a.callIn) html += '<br>週六調班';
      if (a.leave && a.leave.part !== 'full') html += `<br>今日${esc(a.leave.type)}（${ABX.Roster.PARTS[a.leave.part]}）`;
      if (a.role === 'teller' && a.cash) html += `<br>櫃台現金：${ABX.fmtMoney(a.cash)}`;
      if (a.carry && a.carry.length) html += `<br>攜帶文件 ${a.carry.length} 件`;
    } else if (a.kind === 'visitor') html = `<b>${esc(a.name)}</b>（外部人員）<br>${esc(a.label)}`;
    else if (a.atm) html = `<b>${esc(a.name)}</b><br>${esc(a.label)}`;
    else {
      const svc = ABX.Sim.svcOf(a.code);
      html = `<b>${esc(a.persona ? a.persona.label : '客戶')} ${a.ticket ? a.ticket.no : ''}</b><br>業務：${esc(svc.name)}<br>狀態：${esc(a.label)}`;
      if (a.ticket && a.ticket.status === 'waiting') {
        const r = (ABX.S.t - a.ticket.issuedAt) / a.patience;
        html += `<br>已等候 ${ABX.fmtDur(ABX.S.t - a.ticket.issuedAt)}・心情：${r > 0.85 ? '快失去耐心' : r > 0.55 ? '有點不耐' : '平靜'}`;
      }
    }
    tip(html, e);
  }

  ABX.Render = { attach, detachAll, draw };
})();
