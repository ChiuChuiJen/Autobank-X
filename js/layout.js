/* Autobank-X — 樓層平面配置：區域、通道、座位與定點 */
(function () {
  const ABX = window.ABX;
  const W = 1000, H = 420;
  const FLOORS = [3, 2, 1, -1];               // 顯示順序
  const ORDER = [-1, 1, 2, 3];                // 樓梯移動順序
  const FLOOR_NAME = { '-1': 'B1 金庫／檔案', 1: '1F 營業大廳', 2: '2F 理財／貸款', 3: '3F 後勤／行政' };
  const FLOOR_SHORT = { '-1': 'B1', 1: '1F', 2: '2F', 3: '3F' };
  const STAIRS = { x: 950, y: 378 };

  const sp = (floor, x, y) => ({ floor, x, y });

  function build(counts) {
    const nT = Math.max(1, counts.teller || 0);
    const nA = counts.advisor || 0, nL = counts.loan || 0, nB = Math.max(1, counts.backoffice || 0);
    const L = { W, H, floors: {}, spots: {}, seats: {}, stand: {}, points: [], atms: [] };

    /* ---------- 1F 營業大廳 ---------- */
    const f1 = {
      zones: {
        street: { x: 0,   y: 0,   w: 40,  h: 420, name: '分行外', fill: '#d6d3d1' },
        atm:    { x: 40,  y: 15,  w: 130, h: 170, name: 'ATM 自動化服務區', fill: '#e0f2fe' },
        foyer:  { x: 40,  y: 185, w: 130, h: 220, name: '入口門廳', fill: '#f1f5f9' },
        back:   { x: 170, y: 15,  w: 815, h: 73,  name: '櫃檯作業區', fill: '#eef2ff' },
        lobby:  { x: 170, y: 112, w: 815, h: 293, name: '營業大廳', fill: '#f8fafc' },
      },
      portals: [['street', 'atm', 40, 100], ['street', 'foyer', 40, 330], ['atm', 'foyer', 105, 185],
                ['foyer', 'lobby', 170, 300], ['back', 'lobby', 950, 100]],
      deco: [],
    };
    // 櫃檯長桌
    f1.deco.push({ t: 'rect', x: 170, y: 88, w: 745, h: 24, fill: '#94a3b8', r: 3 });
    const cw = 705 / nT;
    for (let i = 0; i < nT; i++) {
      const cx = 190 + (i + 0.5) * cw;
      L.points.push({
        kind: 'counter', idx: i, label: (i + 1) + '號櫃台', short: String(i + 1), floor: 1,
        staffSpot: sp(1, cx, 58), custSpot: sp(1, cx, 130), courierSpot: sp(1, cx + 18, 32), signX: cx, signY: 100,
      });
      f1.deco.push({ t: 'rect', x: cx - 18, y: 40, w: 36, h: 12, fill: '#cbd5e1', r: 2 });
    }
    f1.deco.push({ t: 'rect', x: 928, y: 55, w: 46, h: 18, fill: '#f9a8d4', r: 3, label: '主管', fs: 9 });
    // ATM
    const nAtm = Math.max(1, Math.min(4, counts.atm || 3));
    for (let i = 0; i < nAtm; i++) {
      const x = nAtm === 1 ? 105 : 58 + i * (94 / (nAtm - 1));
      L.atms.push({ idx: i, x, y: 42, spot: sp(1, x, 76), user: null });
      f1.deco.push({ t: 'rect', x: x - 12, y: 30, w: 24, h: 22, fill: '#0369a1', r: 3, label: 'ATM', fs: 8, lc: '#fff' });
    }
    f1.deco.push({ t: 'text', x: 105, y: 170, text: 'ATM 24H', fs: 10, color: '#0369a1' });
    // 取號機、引導台、看板
    f1.deco.push({ t: 'rect', x: 190, y: 128, w: 30, h: 22, fill: '#16a34a', r: 4, label: '取號', fs: 9, lc: '#fff' });
    f1.deco.push({ t: 'rect', x: 232, y: 182, w: 44, h: 14, fill: '#67e8f9', r: 3, label: '服務台', fs: 8 });
    f1.deco.push({ t: 'rect', x: 740, y: 140, w: 210, h: 30, fill: '#0f172a', r: 3, id: 'board1' });
    f1.deco.push({ t: 'rect', x: 230, y: 360, w: 60, h: 30, fill: '#e2e8f0', r: 3, label: '填單台', fs: 9 });
    f1.deco.push({ t: 'rect', x: 760, y: 300, w: 100, h: 16, fill: '#e2e8f0', r: 3, label: '型錄架', fs: 9 });
    f1.deco.push({ t: 'circle', x: 190, y: 390, r: 9, fill: '#86efac' });
    f1.deco.push({ t: 'circle', x: 720, y: 390, r: 9, fill: '#86efac' });
    f1.deco.push({ t: 'rect', x: 50, y: 260, w: 40, h: 16, fill: '#cbd5e1', r: 3, label: '保全', fs: 8 });
    // 等候座位
    L.seats[1] = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 11; c++) {
      const x = 330 + c * 36, y = 208 + r * 36;
      L.seats[1].push({ x, y, occ: null });
      f1.deco.push({ t: 'rect', x: x - 9, y: y - 5, w: 18, h: 13, fill: '#c7d2fe', r: 3 });
    }
    L.stand[1] = { x: 330, y: 385, w: 380, h: 12 };
    f1.deco.push({ t: 'text', x: 510, y: 192, text: '等候區', fs: 11, color: '#64748b' });
    addStairs(f1);
    L.floors[1] = f1;

    /* ---------- 2F 理財／貸款 ---------- */
    const f2 = {
      zones: {
        staff: { x: 20, y: 15,  w: 960, h: 55,  name: '專員作業區', fill: '#fef9c3' },
        hall:  { x: 20, y: 105, w: 960, h: 300, name: '理財貸款大廳', fill: '#fffbeb' },
      },
      portals: [['staff', 'hall', 515, 88]],
      deco: [],
    };
    const addDesk = (kind, k, x, label) => {
      L.points.push({
        kind, idx: k, label, short: label, floor: 2,
        staffSpot: sp(2, x, 45), custSpot: sp(2, x, 125), courierSpot: sp(2, x + 22, 28), signX: x, signY: 86,
      });
      f2.deco.push({ t: 'rect', x: x - 34, y: 72, w: 68, h: 30, fill: kind === 'advisor' ? '#fcd34d' : '#fdba74', r: 4 });
    };
    for (let k = 0; k < nA; k++) addDesk('advisor', k, 60 + (k + 0.5) * (420 / nA), '理財' + (k + 1) + '號桌');
    for (let k = 0; k < nL; k++) addDesk('loan', k, 560 + (k + 0.5) * (400 / nL), '貸款' + (k + 1) + '號桌');
    f2.deco.push({ t: 'text', x: 270, y: 152, text: '理財諮詢區', fs: 11, color: '#92400e' });
    f2.deco.push({ t: 'text', x: 760, y: 152, text: '貸款服務區', fs: 11, color: '#9a3412' });
    L.seats[2] = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
      const x = 120 + c * 38, y = 250 + r * 36;
      L.seats[2].push({ x, y, occ: null });
      f2.deco.push({ t: 'rect', x: x - 9, y: y - 5, w: 18, h: 13, fill: '#fde68a', r: 3 });
    }
    L.stand[2] = { x: 430, y: 250, w: 60, h: 130 };
    f2.deco.push({ t: 'text', x: 250, y: 234, text: '2F 等候區', fs: 11, color: '#92400e' });
    f2.deco.push({ t: 'rect', x: 560, y: 220, w: 300, h: 130, fill: 'rgba(253,186,116,.15)', stroke: '#fdba74', dash: [5, 4], r: 6, label: '貴賓理財室', fs: 11, lc: '#9a3412' });
    f2.deco.push({ t: 'rect', x: 600, y: 270, w: 80, h: 40, fill: '#fed7aa', r: 6 });
    f2.deco.push({ t: 'rect', x: 740, y: 270, w: 80, h: 40, fill: '#fed7aa', r: 6 });
    f2.deco.push({ t: 'rect', x: 840, y: 130, w: 70, h: 40, fill: '#0f172a', r: 3, id: 'board2' });
    addStairs(f2);
    L.floors[2] = f2;

    /* ---------- 3F 後勤／行政 ---------- */
    const f3 = {
      zones: {
        corridor:  { x: 20,  y: 180, w: 960, h: 60,  name: '走廊', fill: '#f1f5f9' },
        mgr:       { x: 20,  y: 20,  w: 220, h: 160, name: '經理室', fill: '#ede9fe' },
        meeting:   { x: 250, y: 20,  w: 300, h: 160, name: '會議室', fill: '#e0e7ff' },
        bo:        { x: 560, y: 20,  w: 420, h: 160, name: '後勤作業區', fill: '#ecfccb' },
        lounge:    { x: 20,  y: 240, w: 300, h: 165, name: '員工休息室', fill: '#fae8ff' },
        mail:      { x: 330, y: 240, w: 250, h: 165, name: '收發室', fill: '#ccfbf1' },
        stairhall: { x: 590, y: 240, w: 390, h: 165, name: '更衣室／梯廳', fill: '#f5f5f4' },
      },
      portals: [['corridor', 'mgr', 130, 180], ['corridor', 'meeting', 400, 180], ['corridor', 'bo', 770, 180],
                ['corridor', 'lounge', 170, 240], ['corridor', 'mail', 455, 240], ['corridor', 'stairhall', 785, 240]],
      deco: [],
    };
    f3.deco.push({ t: 'rect', x: 80, y: 72, w: 100, h: 26, fill: '#c4b5fd', r: 4, label: '經理辦公桌', fs: 9 });
    f3.deco.push({ t: 'rect', x: 180, y: 140, w: 40, h: 22, fill: '#ddd6fe', stroke: '#7c3aed', r: 3, id: 'mgrTray' });
    f3.deco.push({ t: 'rect', x: 300, y: 75, w: 200, h: 50, fill: '#c7d2fe', r: 10, label: '會議桌', fs: 10 });
    f3.deco.push({ t: 'rect', x: 600, y: 140, w: 60, h: 24, fill: '#d9f99d', stroke: '#4d7c0f', r: 3, id: 'boInbox' });
    f3.deco.push({ t: 'rect', x: 880, y: 140, w: 70, h: 24, fill: '#d9f99d', stroke: '#4d7c0f', r: 3, id: 'boOutbox' });
    f3.deco.push({ t: 'rect', x: 90, y: 300, w: 160, h: 50, fill: '#f5d0fe', r: 10, label: '餐桌', fs: 10 });
    f3.deco.push({ t: 'rect', x: 400, y: 300, w: 110, h: 30, fill: '#99f6e4', r: 4, label: '收發台', fs: 9 });
    f3.deco.push({ t: 'rect', x: 345, y: 255, w: 30, h: 80, fill: '#5eead4', r: 2, label: '信櫃', fs: 8 });
    f3.deco.push({ t: 'rect', x: 610, y: 250, w: 180, h: 22, fill: '#d6d3d1', r: 2, label: '員工置物櫃', fs: 9 });
    L.spots.mgrDesk = sp(3, 130, 58);
    L.spots.mgrTray = sp(3, 200, 128);
    L.spots.boInbox = sp(3, 630, 128);
    L.spots.boOutbox = sp(3, 915, 128);
    L.spots.mailDesk = sp(3, 455, 350);
    L.spots.meetHead = sp(3, 282, 100);
    L.meetSeats = [];
    for (let k = 0; k < 7; k++) L.meetSeats.push(sp(3, 315 + k * 30, 60));
    for (let k = 0; k < 7; k++) L.meetSeats.push(sp(3, 315 + k * 30, 140));
    for (let k = 0; k < 12; k++) L.meetSeats.push(sp(3, 520 + (k % 2) * 16, 40 + Math.floor(k / 2) * 22));
    L.loungeSeats = [];
    for (let k = 0; k < 6; k++) L.loungeSeats.push(sp(3, 100 + k * 28, 285));
    for (let k = 0; k < 6; k++) L.loungeSeats.push(sp(3, 100 + k * 28, 366));
    for (let k = 0; k < 10; k++) L.loungeSeats.push(sp(3, 280, 260 + k * 14));
    L.lockers = [];
    for (let k = 0; k < 15; k++) L.lockers.push(sp(3, 616 + k * 12, 290));
    L.boDesks = [];
    const gap = Math.min(95, 300 / nB);
    for (let k = 0; k < nB; k++) {
      const x = 610 + (k + 0.5) * gap;
      L.boDesks.push(sp(3, x, 50));
      f3.deco.push({ t: 'rect', x: x - 20, y: 62, w: 40, h: 22, fill: '#bef264', r: 3 });
    }
    addStairs(f3);
    L.floors[3] = f3;

    /* ---------- B1 金庫／檔案 ---------- */
    const fb = {
      zones: {
        corridor:  { x: 20,  y: 180, w: 960, h: 60,  name: '地下走廊', fill: '#e7e5e4' },
        vault:     { x: 20,  y: 20,  w: 420, h: 160, name: '金庫', fill: '#fef3c7' },
        archive:   { x: 450, y: 20,  w: 270, h: 160, name: '檔案室', fill: '#e0f2fe' },
        monitor:   { x: 730, y: 20,  w: 250, h: 160, name: '監控機房', fill: '#e2e8f0' },
        storage:   { x: 20,  y: 240, w: 560, h: 165, name: '物料／清潔用品室', fill: '#f5f5f4' },
        stairhall: { x: 590, y: 240, w: 390, h: 165, name: '梯廳', fill: '#f5f5f4' },
      },
      portals: [['corridor', 'vault', 230, 180], ['corridor', 'archive', 585, 180], ['corridor', 'monitor', 855, 180],
                ['corridor', 'storage', 300, 240], ['corridor', 'stairhall', 785, 240]],
      deco: [],
    };
    fb.deco.push({ t: 'rect', x: 30, y: 30, w: 400, h: 22, fill: '#fcd34d', r: 2, label: '現金箱保管架', fs: 9 });
    fb.deco.push({ t: 'rect', x: 340, y: 90, w: 80, h: 40, fill: '#fde68a', r: 4, label: '點鈔機', fs: 9 });
    fb.deco.push({ t: 'rect', x: 460, y: 30, w: 250, h: 18, fill: '#bae6fd', r: 2, label: '檔案櫃', fs: 9 });
    fb.deco.push({ t: 'rect', x: 460, y: 70, w: 250, h: 18, fill: '#bae6fd', r: 2, label: '檔案櫃', fs: 9 });
    fb.deco.push({ t: 'rect', x: 760, y: 40, w: 190, h: 30, fill: '#1e293b', r: 3, label: '監視螢幕牆', fs: 9, lc: '#94a3b8' });
    fb.deco.push({ t: 'rect', x: 40, y: 280, w: 120, h: 50, fill: '#e7e5e4', r: 3, label: '清潔用品', fs: 9 });
    fb.deco.push({ t: 'rect', x: 200, y: 280, w: 340, h: 30, fill: '#e7e5e4', r: 3, label: '表單／耗材', fs: 9 });
    L.spots.vaultDoor = sp(-1, 230, 160);
    L.spots.supVault = sp(-1, 300, 80);
    L.spots.mgrVault = sp(-1, 270, 80);
    L.spots.crewVault = sp(-1, 380, 150);
    L.spots.escortB1 = sp(-1, 260, 210);
    L.spots.archive = sp(-1, 585, 115);
    L.spots.monitor = sp(-1, 855, 100);
    L.spots.closet = sp(-1, 100, 350);
    L.vaultSpots = [];
    for (let k = 0; k < 16; k++) L.vaultSpots.push(sp(-1, 50 + (k % 8) * 36, 75 + Math.floor(k / 8) * 40));
    addStairs(fb);
    L.floors[-1] = fb;

    /* ---------- 共同定點 ---------- */
    Object.assign(L.spots, {
      street: sp(1, 15, 330),
      foyerIn: sp(1, 90, 330),
      ticket: sp(1, 205, 165),
      guide: sp(1, 254, 210),
      guideCust: sp(1, 290, 222),
      supDesk: sp(1, 950, 45),
      post: sp(1, 70, 290),
      door: sp(1, 58, 330),
      crew: sp(1, 120, 350),
      atmQueue: sp(1, 105, 140),
      lobbyA: sp(1, 600, 150),
      lobbyB: sp(1, 820, 360),
      hall2: sp(2, 500, 200),
      corr3: sp(3, 500, 210),
      corrB1: sp(-1, 500, 210),
    });
    L.cleanSpots = [sp(1, 300, 150), sp(1, 520, 395), sp(1, 700, 160), sp(1, 840, 330), sp(1, 110, 250), sp(1, 105, 110),
      sp(2, 200, 200), sp(2, 650, 200), sp(2, 800, 380), sp(3, 400, 210), sp(3, 160, 380), sp(3, 700, 330), sp(-1, 500, 210), sp(-1, 585, 120)];
    L.patrol = [sp(1, 600, 390), sp(1, 880, 160), sp(2, 500, 380), sp(-1, 260, 210), sp(-1, 855, 100), sp(3, 600, 210)];

    // 區域鄰接表
    for (const f of Object.values(L.floors)) {
      f.adj = {};
      for (const [a, b, x, y] of f.portals) {
        (f.adj[a] = f.adj[a] || []).push({ to: b, x, y });
        (f.adj[b] = f.adj[b] || []).push({ to: a, x, y });
      }
    }

    L.stairs = (floor) => sp(floor, STAIRS.x, STAIRS.y);
    L.zoneAt = (floor, p) => zoneAt(L.floors[floor], p);
    L.zoneName = (floor, p) => {
      const z = zoneAt(L.floors[floor], p);
      return z ? L.floors[floor].zones[z].name : '';
    };
    L.floorPath = (floor, from, to) => floorPath(L.floors[floor], from, to);
    return L;
  }

  function addStairs(f) {
    f.deco.push({ t: 'rect', x: 915, y: 350, w: 62, h: 52, fill: '#e5e7eb', stroke: '#9ca3af', r: 3, label: '樓梯／電梯', fs: 9 });
  }

  function inRect(z, p, m = 0) { return p.x >= z.x - m && p.x <= z.x + z.w + m && p.y >= z.y - m && p.y <= z.y + z.h + m; }

  function zoneAt(f, p) {
    let best = null, bestD = Infinity;
    for (const [id, z] of Object.entries(f.zones)) {
      if (inRect(z, p)) return id;
      const dx = Math.max(z.x - p.x, 0, p.x - (z.x + z.w));
      const dy = Math.max(z.y - p.y, 0, p.y - (z.y + z.h));
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  function floorPath(f, from, to) {
    const za = zoneAt(f, from), zb = zoneAt(f, to);
    const dest = { x: to.x, y: to.y };
    if (za === zb) return [dest];
    const prev = { [za]: null };
    const q = [za];
    while (q.length) {
      const z = q.shift();
      if (z === zb) break;
      for (const e of f.adj[z] || []) if (!(e.to in prev)) { prev[e.to] = { from: z, x: e.x, y: e.y }; q.push(e.to); }
    }
    if (!(zb in prev)) return [dest];
    const pts = [];
    for (let z = zb; prev[z]; z = prev[z].from) pts.unshift({ x: prev[z].x, y: prev[z].y });
    pts.push(dest);
    return pts;
  }

  Object.assign(ABX, { Layout: { build, W, H, FLOORS, ORDER, FLOOR_NAME, FLOOR_SHORT } });
})();
