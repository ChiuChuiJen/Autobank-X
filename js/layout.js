/* Autobank-X — 樓層平面配置：區域、材質、門、家具、座位與定點 */
(function () {
  const ABX = window.ABX;
  const W = 1000, H = 420;
  const FLOORS = [3, 2, 1, -1];               // 顯示順序
  const ORDER = [-1, 1, 2, 3];                // 樓梯移動順序
  const FLOOR_NAME = { '-1': 'B1 金庫／檔案', 1: '1F 營業大廳', 2: '2F 理財／貸款', 3: '3F 後勤／行政' };
  const FLOOR_SHORT = { '-1': 'B1', 1: '1F', 2: '2F', 3: '3F' };
  const STAIRS = { x: 950, y: 378 };
  const UP = -Math.PI / 2, DOWN = Math.PI / 2, LEFT = Math.PI, RIGHT = 0;

  const sp = (floor, x, y, face) => ({ floor, x, y, face });

  /* 家具速記 */
  const chair = (x, y, dir, c) => ({ t: 'chair', x, y, dir, c });
  const desk = (x, y, w, h, o = {}) => Object.assign({ t: 'desk', x, y, w, h }, o);
  const plant = (x, y, r = 9) => ({ t: 'plant', x, y, r });
  const shelf = (x, y, w, h, label) => ({ t: 'shelf', x, y, w, h, label });
  const machine = (x, y, label, c) => ({ t: 'machine', x, y, label, c });
  const text = (x, y, s, o = {}) => Object.assign({ t: 'text', x, y, text: s }, o);

  function build(counts) {
    const nT = Math.max(1, counts.teller || 0);
    const nA = counts.advisor || 0, nL = counts.loan || 0, nB = Math.max(1, counts.backoffice || 0);
    const L = { W, H, floors: {}, spots: {}, seats: {}, stand: {}, points: [], atms: [] };

    /* ================= 1F 營業大廳 ================= */
    const f1 = {
      outline: { x: 40, y: 15, w: 945, h: 390 },
      zones: {
        street: { x: 0,   y: 0,   w: 40,  h: 420, name: '人行道', mat: 'sidewalk' },
        atm:    { x: 40,  y: 15,  w: 130, h: 170, name: 'ATM 24H', mat: 'tileBlue' },
        foyer:  { x: 40,  y: 185, w: 130, h: 220, name: '入口門廳', mat: 'stone' },
        back:   { x: 170, y: 15,  w: 815, h: 73,  name: '櫃檯作業區', mat: 'wood' },
        lobby:  { x: 170, y: 112, w: 815, h: 293, name: '營業大廳', mat: 'marble' },
      },
      portals: [['street', 'atm', 40, 100, 'glass'], ['street', 'foyer', 40, 330, 'glass'], ['atm', 'foyer', 105, 185, 'glass'],
                ['foyer', 'lobby', 170, 300, 'open'], ['back', 'lobby', 950, 100, 'gate']],
      glass: [[40, 22, 40, 82], [40, 118, 40, 178], [40, 195, 40, 310], [40, 350, 40, 398]],
      deco: [],
    };
    const d1 = f1.deco;
    // 櫃台：後方工作桌＋前方玻璃櫃台
    d1.push({ t: 'counter', x: 170, y: 88, w: 745, h: 24 });
    const cw = 705 / nT;
    for (let i = 0; i < nT; i++) {
      const cx = 190 + (i + 0.5) * cw;
      L.points.push({
        kind: 'counter', idx: i, label: (i + 1) + '號櫃台', short: String(i + 1), floor: 1,
        staffSpot: sp(1, cx, 56, DOWN), custSpot: sp(1, cx, 128, UP), courierSpot: sp(1, cx + 20, 30, DOWN), signX: cx, signY: 100,
      });
      d1.push(desk(cx - 23, 66, 46, 20, { c: '#cbd5e1', mon: 'down' }));
      d1.push(chair(cx, 56, DOWN, '#1e3a8a'));
      d1.push(chair(cx, 130, UP, '#64748b'));
      if (i > 0) d1.push({ t: 'line', x1: 190 + i * cw, y1: 112, x2: 190 + i * cw, y2: 142, c: '#94a3b8', w: 2 });
    }
    d1.push(desk(926, 56, 50, 20, { c: '#f9a8d4', mon: 'down', label: '主管' }));
    d1.push(chair(950, 44, DOWN, '#831843'));
    d1.push(shelf(176, 38, 22, 44, '傳票'));
    d1.push(machine(912, 24, '印表', '#e2e8f0'));
    // ATM 區
    const nAtm = Math.max(1, Math.min(4, counts.atm || 3));
    for (let i = 0; i < nAtm; i++) {
      const x = nAtm === 1 ? 105 : 58 + i * (94 / (nAtm - 1));
      L.atms.push({ idx: i, x, y: 48, spot: sp(1, x, 82, UP), user: null });
      d1.push({ t: 'atm', x, y: 48 });
    }
    d1.push(machine(150, 120, '補摺', '#bae6fd'));
    d1.push({ t: 'bin', x: 60, y: 168 });
    // 門廳
    d1.push({ t: 'mat', x: 46, y: 312, w: 44, h: 36 });
    d1.push(desk(50, 250, 46, 18, { c: '#94a3b8', mon: 'down', label: '保全' }));
    d1.push(plant(60, 392));
    d1.push(plant(155, 200, 8));
    d1.push({ t: 'umbrella', x: 150, y: 392 });
    // 大廳
    d1.push({ t: 'kiosk', x: 205, y: 140 });
    d1.push({ t: 'rope', pts: [[184, 180], [184, 230], [228, 230]] });
    d1.push(desk(230, 180, 48, 16, { c: '#67e8f9', label: '服務台' }));
    d1.push({ t: 'tv', x: 740, y: 140, w: 210, h: 30 });
    d1.push({ t: 'table', x: 225, y: 355, w: 70, h: 34, label: '填單台' });
    d1.push(shelf(760, 300, 90, 14, 'DM 架'));
    d1.push(machine(885, 305, '飲水', '#e0f2fe'));
    d1.push(plant(190, 392)); d1.push(plant(720, 392)); d1.push(plant(970, 205, 8)); d1.push(plant(310, 392, 7));
    d1.push({ t: 'logo', x: 560, y: 160 });
    d1.push(text(850, 342, '理財・貸款 請上 2F ↗', { fs: 9, color: '#475569', bg: '#fff' }));
    L.seats[1] = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 11; c++) {
      const x = 330 + c * 36, y = 208 + r * 36;
      L.seats[1].push({ x, y, occ: null });
      d1.push(chair(x, y, UP, r === 0 && c < 3 ? '#f472b6' : '#93c5fd'));
    }
    d1.push(text(366, 192, '博愛座', { fs: 8, color: '#be185d' }));
    L.stand[1] = { x: 330, y: 385, w: 380, h: 12 };
    d1.push({ t: 'stairs', x: 915, y: 350, w: 62, h: 52 });
    L.floors[1] = f1;

    /* ================= 2F 理財／貸款 ================= */
    const f2 = {
      outline: { x: 20, y: 15, w: 960, h: 390 },
      zones: {
        staff: { x: 20, y: 15,  w: 960, h: 55,  name: '專員座位區', mat: 'carpetBlue' },
        hall:  { x: 20, y: 105, w: 960, h: 300, name: '理財貸款大廳', mat: 'woodWarm' },
      },
      portals: [['staff', 'hall', 515, 88, 'gate']],
      glass: [[30, 15, 500, 15], [530, 15, 970, 15]],
      deco: [],
    };
    const d2 = f2.deco;
    d2.push({ t: 'band', x: 20, y: 70, w: 960, h: 35, c: '#e7e5e4' });
    const addDesk = (kind, k, x, label) => {
      L.points.push({
        kind, idx: k, label, short: label, floor: 2,
        staffSpot: sp(2, x, 44, DOWN), custSpot: sp(2, x, 124, UP), courierSpot: sp(2, x + 24, 28, DOWN), signX: x, signY: 86,
      });
      d2.push(desk(x - 34, 72, 68, 30, { c: kind === 'advisor' ? '#fcd34d' : '#fdba74', mon: 'down' }));
      d2.push(chair(x, 44, DOWN, '#44403c'));
      d2.push(chair(x, 124, UP, '#a8a29e'));
      d2.push(chair(x + 22, 124, UP, '#d6d3d1'));
    };
    const aw = 420 / Math.max(1, nA), lw = 400 / Math.max(1, nL);
    for (let k = 0; k < nA; k++) addDesk('advisor', k, 60 + (k + 0.5) * aw, '理財' + (k + 1) + '號桌');
    for (let k = 0; k < nL; k++) addDesk('loan', k, 560 + (k + 0.5) * lw, '貸款' + (k + 1) + '號桌');
    for (let k = 1; k < nA; k++) d2.push({ t: 'line', x1: 60 + k * aw, y1: 108, x2: 60 + k * aw, y2: 150, c: '#a8a29e', w: 3 });
    for (let k = 1; k < nL; k++) d2.push({ t: 'line', x1: 560 + k * lw, y1: 108, x2: 560 + k * lw, y2: 150, c: '#a8a29e', w: 3 });
    d2.push(shelf(96, 18, 34, 10, '檔案')); d2.push(shelf(920, 18, 50, 10, '檔案'));
    d2.push(text(270, 168, '理財諮詢區', { fs: 11, color: '#92400e' }));
    d2.push(text(760, 168, '貸款服務區', { fs: 11, color: '#9a3412' }));
    L.seats[2] = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
      const x = 120 + c * 38, y = 250 + r * 36;
      L.seats[2].push({ x, y, occ: null });
      d2.push(chair(x, y, UP, '#fbbf24'));
    }
    L.stand[2] = { x: 430, y: 250, w: 60, h: 130 };
    d2.push(text(250, 232, '2F 等候區', { fs: 10, color: '#92400e' }));
    d2.push({ t: 'rug', x: 560, y: 215, w: 300, h: 140, c: '#fed7aa', label: '貴賓理財室' });
    d2.push({ t: 'sofa', x: 585, y: 250, w: 18, h: 70, c: '#9a3412' });
    d2.push({ t: 'sofa', x: 815, y: 250, w: 18, h: 70, c: '#9a3412' });
    d2.push({ t: 'table', x: 655, y: 268, w: 110, h: 34 });
    d2.push(plant(575, 230, 8)); d2.push(plant(845, 340, 8));
    d2.push({ t: 'tv', x: 880, y: 196, w: 70, h: 38 });
    d2.push(shelf(40, 375, 60, 14, 'DM 架'));
    d2.push(machine(470, 390, '飲水', '#e0f2fe'));
    d2.push(plant(40, 130)); d2.push(plant(500, 130, 8));
    d2.push({ t: 'stairs', x: 915, y: 350, w: 62, h: 52 });
    L.floors[2] = f2;

    /* ================= 3F 後勤／行政 ================= */
    const f3 = {
      outline: { x: 20, y: 20, w: 960, h: 385 },
      zones: {
        corridor:  { x: 20,  y: 180, w: 960, h: 60,  name: '走廊', mat: 'vinyl' },
        mgr:       { x: 20,  y: 20,  w: 220, h: 160, name: '經理室', mat: 'carpetPurple' },
        meeting:   { x: 250, y: 20,  w: 300, h: 160, name: '會議室', mat: 'carpetBlue' },
        bo:        { x: 560, y: 20,  w: 420, h: 160, name: '後勤作業區', mat: 'carpetGreen' },
        lounge:    { x: 20,  y: 240, w: 300, h: 165, name: '員工休息室', mat: 'woodWarm' },
        mail:      { x: 330, y: 240, w: 250, h: 165, name: '收發室', mat: 'vinyl' },
        stairhall: { x: 590, y: 240, w: 390, h: 165, name: '更衣室／梯廳', mat: 'stone' },
      },
      portals: [['corridor', 'mgr', 130, 180, 'door'], ['corridor', 'meeting', 400, 180, 'door'], ['corridor', 'bo', 770, 180, 'door'],
                ['corridor', 'lounge', 170, 240, 'door'], ['corridor', 'mail', 455, 240, 'door'], ['corridor', 'stairhall', 785, 240, 'open']],
      glass: [[40, 20, 220, 20], [270, 20, 530, 20], [580, 20, 960, 20]],
      deco: [],
    };
    const d3 = f3.deco;
    d3.push(desk(80, 72, 100, 26, { c: '#a16207', mon: 'down' }));
    d3.push(chair(130, 58, DOWN, '#1e1b4b'));
    d3.push(chair(110, 114, UP, '#78716c')); d3.push(chair(150, 114, UP, '#78716c'));
    d3.push(shelf(160, 26, 46, 12, '書櫃'));
    d3.push({ t: 'sofa', x: 26, y: 120, w: 16, h: 48, c: '#4c1d95' });
    d3.push(plant(222, 36, 8));
    d3.push({ t: 'tray', x: 180, y: 140, w: 40, h: 22 });
    d3.push({ t: 'table', x: 300, y: 75, w: 200, h: 50 });
    d3.push({ t: 'line', x1: 300, y1: 24, x2: 500, y2: 24, c: '#f8fafc', w: 4 });
    d3.push(text(400, 32, '白板', { fs: 8, color: '#64748b' }));
    for (let k = 0; k < 7; k++) { d3.push(chair(315 + k * 30, 60, DOWN, '#3730a3')); d3.push(chair(315 + k * 30, 140, UP, '#3730a3')); }
    d3.push(chair(282, 100, RIGHT, '#1e1b4b'));
    d3.push(machine(950, 40, '影印', '#e2e8f0'));
    d3.push(shelf(940, 70, 34, 60, '卷宗'));
    d3.push({ t: 'tray', x: 600, y: 140, w: 60, h: 24 });
    d3.push({ t: 'tray', x: 880, y: 140, w: 70, h: 24 });
    d3.push({ t: 'table', x: 90, y: 300, w: 160, h: 50 });
    for (let k = 0; k < 6; k++) { d3.push(chair(100 + k * 28, 285, DOWN, '#a21caf')); d3.push(chair(100 + k * 28, 366, UP, '#a21caf')); }
    d3.push({ t: 'counter2', x: 26, y: 392, w: 120, h: 10, label: '茶水間' });
    d3.push(machine(300, 390, '冰箱', '#f1f5f9'));
    d3.push(plant(300, 258, 8));
    d3.push(desk(400, 300, 110, 30, { c: '#5eead4', label: '收發台' }));
    d3.push(chair(455, 350, UP, '#134e4a'));
    d3.push(shelf(338, 266, 26, 84, '信櫃'));
    d3.push(shelf(530, 360, 44, 36, '郵件'));
    d3.push({ t: 'lockers', x: 610, y: 263, w: 180, h: 18 });
    d3.push({ t: 'bench', x: 620, y: 318, w: 160, h: 10 });
    d3.push({ t: 'room', x: 810, y: 250, w: 90, h: 58, label: '洗手間' });
    L.spots.mgrDesk = sp(3, 130, 58, DOWN);
    L.spots.mgrTray = sp(3, 200, 128, DOWN);
    L.spots.boInbox = sp(3, 630, 128, DOWN);
    L.spots.boOutbox = sp(3, 915, 128, DOWN);
    L.spots.mailDesk = sp(3, 455, 350, UP);
    L.spots.meetHead = sp(3, 282, 100, RIGHT);
    L.meetSeats = [];
    for (let k = 0; k < 7; k++) L.meetSeats.push(sp(3, 315 + k * 30, 60, DOWN));
    for (let k = 0; k < 7; k++) L.meetSeats.push(sp(3, 315 + k * 30, 140, UP));
    for (let k = 0; k < 12; k++) L.meetSeats.push(sp(3, 520 + (k % 2) * 16, 40 + Math.floor(k / 2) * 22, LEFT));
    L.loungeSeats = [];
    for (let k = 0; k < 6; k++) L.loungeSeats.push(sp(3, 100 + k * 28, 285, DOWN));
    for (let k = 0; k < 6; k++) L.loungeSeats.push(sp(3, 100 + k * 28, 366, UP));
    for (let k = 0; k < 10; k++) L.loungeSeats.push(sp(3, 280, 262 + k * 13, LEFT));
    L.lockers = [];
    for (let k = 0; k < 15; k++) L.lockers.push(sp(3, 616 + k * 12, 290, UP));
    L.boDesks = [];
    const gap = Math.min(95, 300 / nB);
    for (let k = 0; k < nB; k++) {
      const x = 610 + (k + 0.5) * gap;
      L.boDesks.push(sp(3, x, 50, DOWN));
      d3.push(desk(x - 22, 62, 44, 24, { c: '#bef264', mon: 'down' }));
      d3.push(chair(x, 50, DOWN, '#365314'));
    }
    d3.push({ t: 'stairs', x: 915, y: 350, w: 62, h: 52 });
    L.floors[3] = f3;

    /* ================= B1 金庫／檔案 ================= */
    const fb = {
      outline: { x: 20, y: 20, w: 960, h: 385 },
      zones: {
        corridor:  { x: 20,  y: 180, w: 960, h: 60,  name: '地下走廊', mat: 'concrete' },
        vault:     { x: 20,  y: 20,  w: 420, h: 160, name: '金庫', mat: 'steel' },
        archive:   { x: 450, y: 20,  w: 270, h: 160, name: '檔案室', mat: 'vinyl' },
        monitor:   { x: 730, y: 20,  w: 250, h: 160, name: '監控機房', mat: 'raised' },
        storage:   { x: 20,  y: 240, w: 560, h: 165, name: '物料／清潔用品室', mat: 'concrete' },
        stairhall: { x: 590, y: 240, w: 390, h: 165, name: '梯廳', mat: 'concrete' },
      },
      portals: [['corridor', 'vault', 230, 180, 'vault'], ['corridor', 'archive', 585, 180, 'door'], ['corridor', 'monitor', 855, 180, 'door'],
                ['corridor', 'storage', 300, 240, 'door'], ['corridor', 'stairhall', 785, 240, 'open']],
      glass: [],
      deco: [],
    };
    const db = fb.deco;
    db.push({ t: 'lockers', x: 72, y: 24, w: 136, h: 22, label: '保管箱' });
    db.push(shelf(214, 24, 220, 22, '現金箱保管架'));
    db.push(desk(340, 92, 84, 38, { c: '#fde68a', label: '點鈔機' }));
    db.push({ t: 'cart', x: 30, y: 140 }); db.push({ t: 'cart', x: 60, y: 140 });
    for (let k = 0; k < 3; k++) db.push(shelf(k ? 460 : 520, 28 + k * 26, k ? 250 : 190, 12, k === 1 ? '檔案櫃' : ''));
    db.push({ t: 'tv', x: 810, y: 30, w: 150, h: 30, wall: true });
    db.push(desk(815, 72, 80, 18, { c: '#94a3b8' }));
    db.push(chair(855, 100, UP, '#1e293b'));
    db.push({ t: 'rack', x: 742, y: 110, w: 26, h: 56 }); db.push({ t: 'rack', x: 942, y: 110, w: 26, h: 56 });
    db.push(shelf(30, 266, 120, 18, '清潔用品'));
    db.push(shelf(180, 252, 380, 18, '表單／耗材'));
    db.push(shelf(180, 300, 380, 18, '文具／印刷品'));
    db.push({ t: 'cart', x: 40, y: 370 });
    db.push({ t: 'room', x: 610, y: 260, w: 120, h: 70, label: '機電室' });
    L.spots.vaultDoor = sp(-1, 230, 160, UP);
    L.spots.supVault = sp(-1, 300, 80, UP);
    L.spots.mgrVault = sp(-1, 270, 80, UP);
    L.spots.crewVault = sp(-1, 380, 150, UP);
    L.spots.escortB1 = sp(-1, 260, 210, UP);
    L.spots.archive = sp(-1, 585, 115, UP);
    L.spots.monitor = sp(-1, 855, 100, UP);
    L.spots.closet = sp(-1, 100, 350, UP);
    L.vaultSpots = [];
    for (let k = 0; k < 16; k++) L.vaultSpots.push(sp(-1, 50 + (k % 8) * 36, 75 + Math.floor(k / 8) * 40, UP));
    db.push({ t: 'stairs', x: 915, y: 350, w: 62, h: 52 });
    L.floors[-1] = fb;

    /* ---------- 共同定點 ---------- */
    Object.assign(L.spots, {
      street: sp(1, 15, 330),
      foyerIn: sp(1, 90, 330, RIGHT),
      ticket: sp(1, 205, 166, UP),
      guide: sp(1, 254, 206, DOWN),
      guideCust: sp(1, 282, 222, UP),
      supDesk: sp(1, 950, 44, DOWN),
      post: sp(1, 72, 282, LEFT),
      door: sp(1, 60, 330, LEFT),
      crew: sp(1, 120, 350, RIGHT),
      atmQueue: sp(1, 105, 140, UP),
      lobbyA: sp(1, 600, 150),
      lobbyB: sp(1, 820, 360),
      hall2: sp(2, 500, 200),
      corr3: sp(3, 500, 210),
      corrB1: sp(-1, 500, 210),
    });
    L.cleanSpots = [sp(1, 300, 150), sp(1, 520, 395), sp(1, 700, 160), sp(1, 840, 330), sp(1, 110, 250), sp(1, 105, 110),
      sp(2, 200, 200), sp(2, 650, 200), sp(2, 800, 380), sp(3, 400, 210), sp(3, 160, 380), sp(3, 700, 330), sp(-1, 500, 210), sp(-1, 585, 120)];
    L.patrol = [sp(1, 600, 390), sp(1, 880, 160), sp(2, 500, 380), sp(-1, 260, 210), sp(-1, 855, 100), sp(3, 600, 210)];

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

  function inRect(z, p) { return p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h; }

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
