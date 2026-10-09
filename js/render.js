/* Autobank-X — Canvas 樓層繪製 */
(function () {
  const ABX = window.ABX;
  const FONT = "'Noto Sans TC','PingFang TC','Microsoft JhengHei',system-ui,sans-serif";
  const views = []; // {floor, canvas, ctx, scale}

  function attach(canvas, floor) {
    const v = { floor, canvas, ctx: canvas.getContext('2d'), scale: 1 };
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
    v.ctx.setTransform(v.scale, 0, 0, v.scale, 0, 0);
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r || 0); else ctx.rect(x, y, w, h);
  }

  function text(ctx, s, x, y, size, color, align = 'center', weight = '') {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }

  function drawStatic(ctx, f) {
    ctx.fillStyle = '#e5e7eb'; ctx.fillRect(0, 0, 1000, 420);
    for (const z of Object.values(f.zones)) {
      ctx.fillStyle = z.fill; ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.strokeRect(z.x, z.y, z.w, z.h);
    }
    // 門洞
    for (const [a, b, x, y] of f.portals) {
      const za = f.zones[a];
      const vertical = Math.abs(x - za.x) < 1 || Math.abs(x - (za.x + za.w)) < 1;
      const onEdge = vertical || Math.abs(y - za.y) < 1 || Math.abs(y - (za.y + za.h)) < 1;
      if (!onEdge) continue;
      ctx.strokeStyle = f.zones[b].fill; ctx.lineWidth = 5; ctx.beginPath();
      if (vertical) { ctx.moveTo(x, y - 13); ctx.lineTo(x, y + 13); } else { ctx.moveTo(x - 13, y); ctx.lineTo(x + 13, y); }
      ctx.stroke();
    }
    for (const z of Object.values(f.zones)) text(ctx, z.name, z.x + 6, z.y + 9, 10, '#64748b', 'left', '600');
    for (const d of f.deco) {
      if (d.t === 'rect') {
        rr(ctx, d.x, d.y, d.w, d.h, d.r);
        if (d.fill) { ctx.fillStyle = d.fill; ctx.fill(); }
        if (d.stroke) { ctx.setLineDash(d.dash || []); ctx.strokeStyle = d.stroke; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); }
        if (d.label) text(ctx, d.label, d.x + d.w / 2, d.y + (d.dash ? 12 : d.h / 2), d.fs || 10, d.lc || '#334155');
      } else if (d.t === 'text') text(ctx, d.text, d.x, d.y, d.fs || 10, d.color || '#334155');
      else if (d.t === 'circle') { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fillStyle = d.fill; ctx.fill(); }
    }
  }

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
      if (p.current) sign(ctx, p.signX, p.signY, w, p.current.no, '#0f172a', p.current.status === 'serving' ? '#4ade80' : '#facc15');
      else if (p.open) sign(ctx, p.signX, p.signY, w, '請稍候', '#0f172a', '#93c5fd');
      else sign(ctx, p.signX, p.signY, w, p.staff && p.staff.lunchDone && p.staff.label === '午休用餐' ? '休息中' : '暫停服務', '#7f1d1d', '#fecaca');
      if (p.kind === 'counter') text(ctx, p.short, p.signX - 30, p.signY, 9, '#1e293b', 'center', '700');
      const n = S.docs.filter((d) => d.stage === '櫃檯待收' && d.point === p).length;
      if (n) { ctx.fillStyle = '#0f766e'; rr(ctx, p.courierSpot.x - 6, p.courierSpot.y + 6, 12, 10, 2); ctx.fill(); text(ctx, n, p.courierSpot.x, p.courierSpot.y + 11, 8, '#fff', 'center', '700'); }
    }
    if (floor === 1) {
      const open = D.doorOpened && !D.doorClosed;
      ctx.strokeStyle = open ? '#22c55e' : '#ef4444'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(40, 314); ctx.lineTo(40, 346); ctx.stroke();
      text(ctx, open ? '大門 開' : '大門 關', 20, 300, 8, open ? '#15803d' : '#b91c1c');
      for (const m of L.atms) { ctx.fillStyle = m.user ? '#f59e0b' : '#22c55e'; ctx.beginPath(); ctx.arc(m.x + 9, 36, 3, 0, 7); ctx.fill(); }
      // 叫號看板
      const c = D.calls[0];
      text(ctx, '叫號看板', 760, 148, 8, '#94a3b8', 'left');
      text(ctx, c ? `${c.no} → ${c.label}` : '— 尚未叫號 —', 845, 160, 13, '#fde047', 'center', '700');
    }
    if (floor === 2) {
      const c = D.calls.find((x) => x.floor === 2);
      text(ctx, '2F 叫號', 875, 140, 8, '#94a3b8');
      text(ctx, c ? c.no : '—', 875, 156, 12, '#fde047', 'center', '700');
    }
    if (floor === 3) {
      const tray = (x, y, n, lab) => { text(ctx, lab, x, y - 12, 8, '#334155'); text(ctx, n + ' 件', x, y + 1, 10, '#0f172a', 'center', '700'); };
      tray(200, 151, docsIn('主管核章', '總行來文').length, '經理待核');
      tray(630, 152, docsIn('後勤審核').length, '收件匣');
      tray(915, 152, docsIn('待送總行').length, '待送總行');
    }
    if (floor === -1) {
      const open = D.vaultOpen;
      ctx.strokeStyle = open ? '#22c55e' : '#b91c1c'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(214, 180); ctx.lineTo(246, 180); ctx.stroke();
      text(ctx, open ? '金庫門 開啟' : '金庫門 封閉', 230, 166, 9, open ? '#15803d' : '#b91c1c', 'center', '700');
      text(ctx, '庫存 ' + ABX.fmtMoney(ABX.S.vaultCash), 120, 150, 10, '#92400e', 'center', '700');
    }
  }

  function drawAgents(ctx, floor) {
    const S = ABX.S;
    const showLabels = ABX.UI ? ABX.UI.showLabels : true;
    const list = S.agents.filter((a) => a.floor === floor && !a.transfer && !a.dead).sort((a, b) => a.y - b.y);
    for (const a of list) {
      const hl = S.highlight === a.id;
      if (a.kind === 'staff') {
        ctx.beginPath(); ctx.arc(a.x, a.y, 8.5, 0, Math.PI * 2);
        ctx.fillStyle = a.color; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        text(ctx, a.name.slice(-1), a.x, a.y + 0.5, 9, '#fff', 'center', '700');
        if (showLabels) {
          const lab = a.label.length > 9 ? a.label.slice(0, 9) + '…' : a.label;
          ctx.font = `9px ${FONT}`;
          const w = ctx.measureText(lab).width + 6;
          rr(ctx, a.x - w / 2, a.y + 10, w, 12, 3); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
          text(ctx, lab, a.x, a.y + 16.5, 9, '#334155');
        }
      } else if (a.kind === 'visitor') {
        ctx.fillStyle = a.color; rr(ctx, a.x - 7, a.y - 7, 14, 14, 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        text(ctx, '運', a.x, a.y + 0.5, 8, '#fff', 'center', '700');
      } else {
        ctx.beginPath(); ctx.arc(a.x, a.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = a.color; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(15,23,42,.55)'; ctx.stroke();
        if (a.ticket && a.ticket.status !== 'done') text(ctx, a.ticket.no, a.x, a.y - 11, 8, '#0f172a', 'center', '700');
      }
      if (hl) { ctx.beginPath(); ctx.arc(a.x, a.y, 14, 0, Math.PI * 2); ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = 2.5; ctx.stroke(); }
    }
  }

  function lighting(ctx, floor) {
    const S = ABX.S, t = S.t % 86400;
    const anyone = S.staff.some((a) => a.floor === floor && a.state !== 'home');
    const dark = t < 6 * 3600 || t > 18.5 * 3600 ? 0.38 : t < 7 * 3600 ? 0.38 * (7 * 3600 - t) / 3600 : t > 17.5 * 3600 ? 0.38 * (t - 17.5 * 3600) / 3600 : 0;
    const a = anyone ? dark * 0.35 : Math.max(dark, S.D.h.open ? 0 : 0.12);
    if (a > 0.01) {
      ctx.fillStyle = `rgba(15,23,42,${a.toFixed(3)})`;
      if (floor === 1) { ctx.fillRect(40, 185, 960, 235); ctx.fillRect(170, 0, 830, 185); ctx.fillRect(0, 0, 40, 420); }
      else ctx.fillRect(0, 0, 1000, 420);
    }
  }

  function draw() {
    if (!ABX.S || !ABX.L) return;
    for (const v of views) {
      if (!v.canvas.offsetParent) continue;
      resize(v);
      const ctx = v.ctx, f = ABX.L.floors[v.floor];
      drawStatic(ctx, f);
      drawDynamic(ctx, v.floor);
      drawAgents(ctx, v.floor);
      lighting(ctx, v.floor);
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
      html = `<b>${esc(a.name)}</b>（${ABX.ROLES[a.role].label}）<br>${esc(ABX.Sim.whereOf(a))}<br>狀態：${esc(a.label)}`;
      if (a.role === 'teller' && a.cash) html += `<br>櫃台現金：${ABX.fmtMoney(a.cash)}`;
      if (a.carry && a.carry.length) html += `<br>攜帶文件 ${a.carry.length} 件`;
    } else if (a.kind === 'visitor') html = `<b>運鈔人員</b><br>${esc(a.label)}`;
    else if (a.atm) html = `<b>ATM 客戶</b><br>${esc(a.label)}`;
    else {
      const svc = ABX.Sim.svcOf(a.code);
      html = `<b>客戶 ${a.ticket ? a.ticket.no : ''}</b><br>業務：${esc(svc.name)}<br>狀態：${esc(a.label)}`;
      if (a.ticket && a.ticket.status === 'waiting') html += `<br>已等候 ${ABX.fmtDur(ABX.S.t - a.ticket.issuedAt)}`;
    }
    tip(html, e);
  }

  ABX.Render = { attach, detachAll, draw };
})();
