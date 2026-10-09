/* Autobank-X — 人物：外觀、角色特色、客戶類型與俯視角繪製 */
(function () {
  const ABX = window.ABX;

  function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pickR = (r, arr) => arr[Math.floor(r() * arr.length)];

  const SKIN = ['#f6d5bd', '#efc6a6', '#e2b08c', '#d39b74', '#b97f58', '#8d5a3b'];
  const HAIR = ['#1c1917', '#231a15', '#3f2a1e', '#57392a', '#7c5a3c'];
  const GREY = ['#a8a29e', '#d6d3d1', '#9ca3af', '#e7e5e4'];

  /* 職務制服 */
  const UNIFORM = {
    manager:    { outfit: '#312e81', trim: '#c4b5fd', acc: 'tie' },
    supervisor: { outfit: '#9d174d', trim: '#fbcfe8', acc: 'badge' },
    teller:     { outfit: '#1d4ed8', trim: '#fbbf24', acc: 'scarf' },
    guide:      { outfit: '#0e7490', trim: '#fde047', acc: 'sash' },
    advisor:    { outfit: '#78350f', trim: '#fcd34d', acc: 'tie' },
    loan:       { outfit: '#9a3412', trim: '#fed7aa', acc: 'tie' },
    backoffice: { outfit: '#3f6212', trim: '#d9f99d', acc: 'lanyard' },
    courier:    { outfit: '#115e59', trim: '#b45309', acc: 'bag' },
    security:   { outfit: '#0f172a', trim: '#facc15', acc: 'cap' },
    cleaner:    { outfit: '#78716c', trim: '#bae6fd', acc: 'apron' },
    crew:       { outfit: '#14532d', trim: '#facc15', acc: 'helmet' },
    digital:    { outfit: '#0f766e', trim: '#f8fafc', acc: 'tablet' },
    safebox:    { outfit: '#713f12', trim: '#facc15', acc: 'keys' },
    corporate:  { outfit: '#334155', trim: '#93c5fd', acc: 'tie' },
    vip:        { outfit: '#450a0a', trim: '#facc15', acc: 'tie' },
    audit:      { outfit: '#4c1d95', trim: '#e9d5ff', acc: 'lanyard' },
  };

  const LEVELS = {
    junior:  { label: '新進', svc: 1.2,  appr: 1.5, count: 1.15 },
    regular: { label: '一般', svc: 1,    appr: 1,   count: 1 },
    senior:  { label: '資深', svc: 0.85, appr: 0.6, count: 0.85 },
  };

  const TRAITS = {
    manager:    ['業績導向', '重視客訴', '親民型主管', '授信專家'],
    supervisor: ['嚴謹覆核', '反應迅速', '帳務精算', '帶新人有耐心'],
    teller:     ['點鈔快手', '親切微笑', '細心核對', '外匯專長', '台語流利', '耐心解說'],
    guide:      ['眼明手快', '熱情招呼', '熟悉各項表單', '長者關懷'],
    advisor:    ['基金達人', '保險規劃', '退休理財', '海外投資'],
    loan:       ['房貸專家', '企業授信', '信貸速審', '徵信細心'],
    backoffice: ['建檔神速', '法規熟稔', '對帳仔細', 'Excel 高手'],
    courier:    ['路線熟悉', '準時達人', '機車老手'],
    security:   ['退伍軍人', '警覺性高', '熱心指引'],
    cleaner:    ['一塵不染', '早到勤快', '愛聊天'],
    digital:    ['App 教學達人', '信用卡推廣王', '3C 通'],
    safebox:    ['口風很緊', '鑰匙管理嚴謹', '熟記每位常客'],
    corporate:  ['財報分析', '中小企業輔導', '貿易融資'],
    vip:        ['家族信託', '高資產配置', '國際稅務'],
    audit:      ['洗錢防制', '鐵面無私', '法規熟稔'],
  };

  /* 客戶類型：比重、步行速度、耐心、業務偏好 */
  const PERSONAS = [
    { key: 'office',  label: '上班族',       w: 28, speed: 1.1,  patience: 0.75, acc: 'briefcase', outfits: ['#1e293b', '#334155', '#475569', '#e2e8f0', '#1e3a8a'], pref: { B: 1.3, D: 1.2, E: 1.4, G: 1.5 } },
    { key: 'senior',  label: '長者',         w: 18, speed: 0.62, patience: 1.5,  acc: 'cane',      outfits: ['#a16207', '#57534e', '#7c2d12', '#4d7c0f', '#6b21a8'], grey: true, pref: { A: 1.5, D: 1.3, E: 0.4, H: 2, G: 0.3 } },
    { key: 'student', label: '學生',         w: 12, speed: 1.15, patience: 0.9,  acc: 'backpack',  outfits: ['#2563eb', '#dc2626', '#16a34a', '#f8fafc', '#f472b6'], pref: { C: 1.8, A: 1.2, D: 0.3, E: 0.3, G: 2, F: 1.3, I: 0, V: 0, H: 0.2 } },
    { key: 'shop',    label: '商家店主',     w: 16, speed: 1.0,  patience: 0.85, acc: 'cashbag',   outfits: ['#b45309', '#065f46', '#be123c', '#0f766e'], pref: { A: 1.8, B: 1.4, I: 1.5, F: 0.5 } },
    { key: 'parent',  label: '帶小孩的家長', w: 9,  speed: 0.8,  patience: 0.9,  acc: 'stroller',  outfits: ['#db2777', '#7c3aed', '#0891b2', '#ea580c'], pref: { C: 1.3, E: 1.2 } },
    { key: 'foreign', label: '外籍人士',     w: 7,  speed: 1.0,  patience: 1.1,  acc: 'none',      outfits: ['#0d9488', '#9333ea', '#ea580c', '#facc15'], pref: { B: 3.5, C: 1.2, F: 4 } },
    { key: 'boss',    label: '企業主',       w: 6,  speed: 1.0,  patience: 0.7,  acc: 'briefcase', outfits: ['#111827', '#1f2937'], pref: { E: 2.5, D: 2, B: 1.5, I: 5, V: 5, H: 2 } },
  ];

  function staffLook(name, role) {
    const r = seeded(hash(name + '|' + role));
    const u = UNIFORM[role] || UNIFORM.teller;
    return {
      skin: pickR(r, SKIN.slice(0, 5)), hair: pickR(r, HAIR), hairStyle: Math.floor(r() * 4),
      outfit: u.outfit, trim: u.trim, acc: u.acc,
    };
  }
  function autoLevel(name) { const v = hash('lv' + name) % 4; return v === 0 ? 'junior' : v === 3 ? 'senior' : 'regular'; }
  function trait(name, role) { const list = TRAITS[role] || ['認真負責']; return list[hash('tr' + name) % list.length]; }

  function pickPersona(rnd) {
    const total = PERSONAS.reduce((s, p) => s + p.w, 0);
    let x = rnd() * total;
    for (const p of PERSONAS) { x -= p.w; if (x <= 0) return p; }
    return PERSONAS[0];
  }
  function customerLook(p, rnd) {
    return {
      skin: p.key === 'foreign' ? pickR(rnd, SKIN) : pickR(rnd, SKIN.slice(0, 5)),
      hair: p.grey ? pickR(rnd, GREY) : (p.key === 'foreign' && rnd() < 0.4 ? pickR(rnd, ['#c2410c', '#ca8a04', '#78350f']) : pickR(rnd, HAIR)),
      hairStyle: Math.floor(rnd() * 4), outfit: pickR(rnd, p.outfits), trim: '#f8fafc', acc: p.acc,
    };
  }

  /* ---------- 繪製（俯視角，dir = 面向角度） ---------- */
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }
  function ell(ctx, x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }

  function draw(ctx, x, y, dir, look, o = {}) {
    const s = o.scale || 1;
    const moving = !!o.moving, sw = moving ? Math.sin(o.walk || 0) * 3.2 : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.rotate(dir);
    ell(ctx, 1.2, 1.4, 9.5, 8, 'rgba(15,23,42,.16)');

    // 身後／身前配件
    if (look.acc === 'stroller') {
      ctx.fillStyle = '#475569'; ctx.fillRect(9, -5, 11, 10);
      ell(ctx, 18, 0, 3.4, 5.5, '#f472b6');
      ell(ctx, 13, 0, 2.4, 2.4, '#f6d5bd');
    }
    if (look.acc === 'backpack') { ctx.fillStyle = shade(look.outfit, 0.6); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-10, -5, 6, 10, 2) : ctx.rect(-10, -5, 6, 10); ctx.fill(); }

    // 腳
    if (moving) { ell(ctx, sw, -3.4, 2.8, 1.9, '#1f2937'); ell(ctx, -sw, 3.4, 2.8, 1.9, '#1f2937'); }

    // 手臂
    const arm = shade(look.outfit, 0.8);
    ell(ctx, -sw * 0.5, -8.3, 2.7, 2.6, arm);
    ell(ctx, sw * 0.5, 8.3, 2.7, 2.6, arm);
    // 身體
    ctx.beginPath(); ctx.ellipse(0, 0, 5.4, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = look.outfit; ctx.fill();
    ctx.lineWidth = 0.8; ctx.strokeStyle = shade(look.outfit, 0.55); ctx.stroke();

    // 制服細節
    ctx.lineCap = 'round';
    switch (look.acc) {
      case 'tie':
        ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.moveTo(5.2, -2.6); ctx.lineTo(2.2, 0); ctx.lineTo(5.2, 2.6); ctx.fill();
        ctx.fillStyle = look.trim; ctx.beginPath(); ctx.moveTo(4.9, -0.9); ctx.lineTo(1.2, 0); ctx.lineTo(4.9, 0.9); ctx.fill();
        break;
      case 'scarf':
        ctx.strokeStyle = look.trim; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(1, 0, 4.2, -1.1, 1.1); ctx.stroke();
        ell(ctx, 4.6, 2.6, 1.6, 1.2, look.trim);
        break;
      case 'sash':
        ctx.strokeStyle = look.trim; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-3.5, -7.5); ctx.lineTo(3.8, 7.5); ctx.stroke();
        break;
      case 'badge':
        ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.moveTo(5.2, -2.4); ctx.lineTo(2.6, 0); ctx.lineTo(5.2, 2.4); ctx.fill();
        ell(ctx, 3.2, -5, 1.4, 1.4, '#facc15');
        break;
      case 'lanyard':
        ctx.strokeStyle = look.trim; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1.5, -3.5); ctx.lineTo(4.2, 0); ctx.lineTo(1.5, 3.5); ctx.stroke();
        ctx.fillStyle = '#f8fafc'; ctx.fillRect(3.4, -1.3, 2, 2.6);
        break;
      case 'bag':
        ctx.strokeStyle = look.trim; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-4, -7); ctx.lineTo(3.5, 7); ctx.stroke();
        ctx.fillStyle = look.trim; ctx.fillRect(-3, 7.5, 7, 4.5);
        break;
      case 'apron':
        ctx.fillStyle = look.trim; ctx.fillRect(0.8, -5, 4, 10);
        break;
      case 'briefcase':
        ctx.fillStyle = '#5b3a1e'; ctx.fillRect(-1, 10.2, 7, 3.6);
        break;
      case 'cashbag':
        ctx.fillStyle = '#facc15'; ctx.fillRect(-0.5, 9.8, 5, 4);
        break;
      case 'cane':
        ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(1, 9.5); ctx.lineTo(8, 12); ctx.stroke();
        break;
      case 'tablet':
        ctx.fillStyle = '#0f172a'; ctx.fillRect(3.5, 5.5, 6, 4.5); ctx.fillStyle = '#5eead4'; ctx.fillRect(4.3, 6.2, 4.4, 3);
        break;
      case 'keys':
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(1.5, 8.5, 2, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(3, 9.5); ctx.lineTo(6, 11); ctx.stroke();
        break;
      case 'helmet':
        ctx.fillStyle = '#facc15'; ctx.fillRect(-4.5, -1, 9, 2);
        break;
    }

    // 頭
    const hs = look.hairStyle || 0;
    if (look.acc === 'cap' || look.acc === 'helmet') {
      ell(ctx, 0.8, 0, 4.4, 4.4, look.skin);
      ell(ctx, -0.6, 0, 4.9, 4.9, look.acc === 'cap' ? '#1e293b' : '#e5e7eb');
      ctx.fillStyle = look.acc === 'cap' ? '#0f172a' : '#9ca3af';
      ctx.beginPath(); ctx.ellipse(4.2, 0, 2.6, 4.2, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
      ell(ctx, 1.4, 0, 1.1, 1.1, look.acc === 'cap' ? '#facc15' : '#16a34a');
    } else {
      if (hs === 1) ell(ctx, -2.6, 0, 5.4, 5.6, look.hair);            // 長髮
      ell(ctx, 0.8, 0, 4.3, 4.3, look.skin);
      ctx.fillStyle = look.hair; ctx.beginPath();
      if (hs === 3) { ctx.arc(0.4, 0, 4.5, Math.PI * 0.62, Math.PI * 1.38); ctx.closePath(); }   // 短平頭
      else { ctx.arc(0.6, 0, 4.7, Math.PI * 0.45, Math.PI * 1.55); ctx.closePath(); }
      ctx.fill();
      if (hs === 2) ell(ctx, -4.6, 0, 2.1, 2.1, look.hair);           // 包頭
    }

    // 手上物品
    if (o.carry) { ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 0.6; ctx.fillRect(4, 6.5, 6, 4.4); ctx.strokeRect(4, 6.5, 6, 4.4); }
    if (o.cashbox) { ctx.fillStyle = '#64748b'; ctx.fillRect(4, 5.5, 7, 6); ctx.fillStyle = '#facc15'; ctx.fillRect(6.5, 7.5, 2, 2); }
    ctx.restore();
  }

  /* 圖例用小圖 */
  function icon(look, size = 28) {
    try {
      const c = document.createElement('canvas');
      const dpr = 2;
      c.width = c.height = size * dpr;
      const ctx = c.getContext('2d');
      ctx.scale(dpr, dpr);
      draw(ctx, size / 2, size / 2, Math.PI / 2, look, { scale: size / 26 });
      return c.toDataURL();
    } catch (e) { return ''; }
  }

  ABX.People = { UNIFORM, LEVELS, PERSONAS, staffLook, customerLook, autoLevel, trait, pickPersona, draw, icon, hash };
})();
