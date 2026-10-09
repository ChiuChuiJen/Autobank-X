/* Autobank-X — 模擬引擎：時鐘、員工行為、客戶流程、叫號、送件、金庫 */
(function () {
  const ABX = window.ABX;
  const { parseHM, parseTimes, ROLES, WD, fmtHM, fmtMoney } = ABX;
  const DAY = 86400;
  let S = null, L = null;

  /* ---------- 亂數 ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
  const rnd = () => S.rand();
  const R = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  function gauss() { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function svcDur(avgMin) {
    const sigma = 0.4, mu = Math.log(avgMin * 60) - (sigma * sigma) / 2;
    return Math.max(60, Math.exp(mu + sigma * gauss()));
  }
  const jit = (s, r) => ({ floor: s.floor, x: s.x + R(-r, r), y: s.y + R(-r, r), face: s.face });

  /* ---------- 時間 ---------- */
  function today() { const d = Math.floor(S.t / DAY); return { d, wd: d % 7, tod: S.t - d * DAY }; }
  const tod = () => S.t - Math.floor(S.t / DAY) * DAY;
  function hoursOf(wd) {
    const h = S.settings.hours[wd] || {};
    return { open: !!h.open, start: parseHM(h.start), last: parseHM(h.lastTicket), end: parseHM(h.end) };
  }

  /* ---------- 紀錄 ---------- */
  function log(cat, msg) {
    S.log.unshift({ t: S.t, cat, msg });
    if (S.log.length > 800) S.log.length = 800;
    S.logSeq++;
  }

  /* ---------- 任務 ---------- */
  const T = {
    go: (dest, label) => ({ k: 'go', dest, label }),
    wait: (dur, label) => ({ k: 'wait', dur, label }),
    until: (cond, label, timeout, onTimeout) => ({ k: 'until', cond, label, timeout, onTimeout }),
    do: (fn) => ({ k: 'do', fn }),
  };
  const now = (a, ...tasks) => a.tasks.unshift(...tasks);
  const later = (a, ...tasks) => a.tasks.push(...tasks);

  function mkAgent(o) {
    const a = Object.assign({ id: ++S.nextId, floor: null, x: 0, y: 0, path: [], tasks: [], cur: null, label: '', transfer: null, speed: 26, dir: 0, walk: 0, moving: false }, o);
    S.agents.push(a);
    return a;
  }

  function routeTo(a, dest) {
    if (a.floor === null) { a.floor = 1; a.x = L.spots.street.x; a.y = L.spots.street.y + R(-20, 20); }
    a.faceTo = dest.face;
    if (a.floor === dest.floor) a.path = L.floorPath(a.floor, a, dest);
    else a.path = L.floorPath(a.floor, a, L.stairs(a.floor)).concat([{ transfer: dest.floor }], L.floorPath(dest.floor, L.stairs(dest.floor), dest));
  }

  function moveStep(a, dt) {
    let remain = a.speed * dt;
    while (remain > 0 && a.path.length) {
      const p = a.path[0];
      if (p.transfer !== undefined) {
        const n = Math.abs(L.ORDER.indexOf(p.transfer) - L.ORDER.indexOf(a.floor));
        a.transfer = { to: p.transfer, until: S.t + 10 + 8 * n };
        a.path.shift();
        return;
      }
      const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0.01) a.dir = Math.atan2(dy, dx);
      const stepLen = Math.min(d, remain);
      a.walk += stepLen * 0.35;
      if (d <= remain) { a.x = p.x; a.y = p.y; a.path.shift(); remain -= d; }
      else { a.x += (dx / d) * remain; a.y += (dy / d) * remain; remain = 0; }
    }
    a.moving = a.path.length > 0;
    if (!a.moving && a.faceTo !== undefined) a.dir = a.faceTo;
  }

  function startTask(a, k) {
    if (k.label) a.label = k.label;
    if (k.k === 'go') { if (!k.label) a.label = '前往' + placeName(k.dest); routeTo(a, k.dest); }
    else if (k.k === 'wait') k.until = S.t + k.dur;
    else if (k.k === 'until') k.t0 = S.t;
    else if (k.k === 'do') k.fn(a);
  }

  function checkTask(a, k) {
    if (k.k === 'wait') return S.t >= k.until;
    if (k.k === 'until') {
      if (k.cond()) return true;
      if (k.timeout && S.t - k.t0 >= k.timeout) { if (k.onTimeout) k.onTimeout(a); return true; }
      return false;
    }
    return true;
  }

  function runAgent(a, dt) {
    if (a.transfer) {
      if (S.t < a.transfer.until) return;
      a.floor = a.transfer.to; const s = L.stairs(a.floor); a.x = s.x; a.y = s.y; a.transfer = null;
    }
    if (a.path.length) { moveStep(a, dt); return; }
    a.moving = false;
    for (let guard = 0; guard < 16; guard++) {
      if (a.cur) { if (!checkTask(a, a.cur)) return; a.cur = null; }
      if (a.dead) return;
      if (!a.tasks.length) { if (a.kind === 'staff') staffDecide(a); if (!a.tasks.length) return; }
      a.cur = a.tasks.shift();
      startTask(a, a.cur);
      if (a.path.length || a.transfer) return;
    }
  }

  function atSpot(a, s) { return a.floor === s.floor && !a.transfer && Math.hypot(a.x - s.x, a.y - s.y) < 4; }
  function placeName(s) { return L.Layout.FLOOR_SHORT[s.floor] + ' ' + L.zoneName(s.floor, s); }
  function whereOf(a) {
    if (a.transfer) return '樓梯／電梯';
    if (a.floor === null) return a.offsite ? '外出（總行）' : '—';
    return placeName(a);
  }

  /* ---------- 重置 ---------- */
  function reset(settings) {
    const seed = settings.sim.seed ? hashSeed(settings.sim.seed) : (Math.random() * 2 ** 32) >>> 0;
    S = ABX.S = {
      settings, t: 0, nextId: 0, docSeq: 0, logSeq: 0, agents: [], staff: [], points: [], docs: [], log: [], reports: [],
      vaultCash: +settings.cash.vaultInitial || 0, rand: mulberry32(seed), D: null, highlight: null,
    };
    const counts = { atm: +settings.customers.atmCount || 3 };
    for (const st of settings.staff) counts[st.role] = (counts[st.role] || 0) + 1;
    L = ABX.L = ABX.Layout.build(counts);
    L.Layout = ABX.Layout;
    L.ORDER = ABX.Layout.ORDER;

    const roleIdx = {};
    let attendee = 0;
    settings.staff.forEach((cfg, i) => {
      if (!ROLES[cfg.role]) return;
      const k = (roleIdx[cfg.role] = (roleIdx[cfg.role] || 0) + 1) - 1;
      const a = mkAgent({
        kind: 'staff', role: cfg.role, name: cfg.name || ROLES[cfg.role].label, color: ROLES[cfg.role].color,
        roleIdx: k, staffIdx: i, state: 'home', label: '未到班', cash: 0, dir: Math.PI / 2,
        look: ABX.People.staffLook(cfg.name || String(i), cfg.role),
        level: ABX.People.LEVELS[cfg.level] ? cfg.level : ABX.People.autoLevel(cfg.name || String(i)),
        trait: ABX.People.trait(cfg.name || String(i), cfg.role),
        lockerIdx: i % L.lockers.length, loungeIdx: i % L.loungeSeats.length,
      });
      if (a.role !== 'security' && a.role !== 'cleaner') a.meetIdx = attendee++;
      const shift = (s, n) => ({ floor: s.floor, x: s.x - n * 26, y: s.y });
      if (['teller', 'advisor', 'loan'].includes(a.role)) {
        const kind = a.role === 'teller' ? 'counter' : a.role;
        const p = L.points.find((q) => q.kind === kind && q.idx === k);
        p.staff = a; p.services = String(cfg.services || '').toUpperCase().replace(/[^A-Z]/g, '').split('');
        if (!p.services.length) p.services = a.role === 'teller' ? ['A'] : a.role === 'advisor' ? ['D'] : ['E'];
        p.open = false; p.current = null;
        a.point = p; a.station = p.staffSpot; a.vaultIdx = k % L.vaultSpots.length;
        S.points.push(p);
      } else if (a.role === 'manager') a.station = shift(L.spots.mgrDesk, k);
      else if (a.role === 'supervisor') a.station = shift(L.spots.supDesk, k);
      else if (a.role === 'guide') a.station = shift(L.spots.guide, -k);
      else if (a.role === 'backoffice') a.station = L.boDesks[k % L.boDesks.length];
      else if (a.role === 'courier') a.station = shift(L.spots.mailDesk, k);
      else if (a.role === 'security') a.station = { floor: 1, x: L.spots.post.x, y: L.spots.post.y + k * 24 };
      else if (a.role === 'cleaner') a.station = shift(L.spots.closet, -k);
      S.staff.push(a);
    });

    const start = Math.max(1, +settings.sim.startDay || 1) - 1;
    S.t = start * DAY;
    newDay(start);
    log('系統', `模擬開始：${settings.bank.name} ${settings.bank.branch}`);
    const target = start * DAY + parseHM(settings.sim.startTime);
    advance(target - S.t, 1);
    return S;
  }

  function serviceAvailable() {
    return S.settings.services.filter((s) => +s.ratio > 0 && S.points.some((p) => p.services.includes(s.code)));
  }
  const svcOf = (code) => S.settings.services.find((s) => s.code === code) || { code, name: code, floor: 1, avgMin: 5, docProb: 0, approvalProb: 0, mgrProb: 0, color: '#64748b', docName: '文件' };

  /* ---------- 每日 ---------- */
  function newStats() {
    return { arrived: 0, served: 0, abandoned: 0, turnedAway: 0, noshow: 0, atm: 0, waitSum: 0, waitN: 0, waitMax: 0, svc: {},
      docsCreated: 0, docsDelivered: 0, inbound: 0, cashIn: 0, cashOut: 0, cashTransport: 0, approvals: 0, discrepancies: 0,
      overtime: 0, trips: 0, lastLeave: null, firstArrive: null };
  }

  function newDay(d) {
    if (S.D) finalizeDay();
    const wd = d % 7, h = hoursOf(wd), sr = S.settings.staffRules;
    const meetStart = h.start - (+sr.meetingBefore) * 60;
    const meetEnd = meetStart + (+sr.meetingMinutes) * 60;
    const sat = wd === 5;
    const dispatch = h.open ? parseTimes(sat ? S.settings.courier.dispatchSaturday : S.settings.courier.dispatchWeekday) : [];
    const cashT = h.open ? parseTimes(sat ? S.settings.cash.transportSaturday : S.settings.cash.transportWeekday) : [];
    S.D = {
      d, wd, h, meetStart, meetEnd, tickets: [], seq: {}, calls: [], approvals: [], guideReq: [],
      vaultOpen: false, vaultOpening: false, vaultClosing: false, vaultClosed: false, doorOpened: false, doorClosed: false,
      lastCollect: h.start, stats: newStats(),
      dispatch: dispatch.map((t) => ({ t, done: false })),
      cashEvents: cashT.filter((t) => t >= h.start && t < h.end).map((t) => ({ t, spawned: false, arrived: 0, atVault: 0, escort: false, escortTaken: false, supTaken: false, done: false })),
    };
    for (const s of L.seats[1].concat(L.seats[2])) if (s.occ && s.occ.dead) s.occ = null;
    for (const p of S.points) { p.open = false; p.current = null; }

    const lunchStart = parseHM(sr.lunchStart), lunchEnd = parseHM(sr.lunchEnd), lunchLen = Math.max(10, +sr.lunchMinutes) * 60;
    const hasLunch = h.open && h.last >= lunchEnd && lunchEnd > lunchStart;
    const slots = Math.max(1, Math.floor((lunchEnd - lunchStart) / lunchLen));
    const off = { teller: 0, advisor: 1, loan: 2, backoffice: 0, supervisor: 0, manager: 2, guide: 1, courier: 1, cleaner: 3 };
    for (const a of S.staff) {
      if (a.state !== 'home') { // 跨日仍未離開者強制下班
        a.floor = null; a.state = 'home'; a.tasks = []; a.cur = null; a.path = []; a.transfer = null; a.offsite = false; a.label = '已下班';
      }
      const before = a.role === 'security' ? +sr.securityArriveBefore : a.role === 'cleaner' ? +sr.cleanerArriveBefore : +sr.arriveBefore;
      Object.assign(a, {
        arrivedToday: false, didMeeting: false, prepDone: false, lunchDone: false, closing: false, closingDone: false,
        cashReturned: false, overtime: false, vaultOpenHelped: false, vaultCloseHelped: false, carry: [], bag: [],
        arriveAt: h.start - before * 60 + R(-8, 3) * 60,
        nextPatrol: h.start + R(20, 50) * 60,
        lunchAt: hasLunch && a.role !== 'security' && off[a.role] !== undefined ? lunchStart + ((a.roleIdx + off[a.role]) % slots) * lunchLen : null,
      });
    }
    S.docs = S.docs.filter((x) => !(['已送達總行', '已歸檔'].includes(x.stage) && x.day < d));
    log('系統', `Day ${d + 1}（${WD[wd]}）${h.open ? `營業日 ${fmtHM(h.start)}～${fmtHM(h.last)} 收件，${fmtHM(h.end)} 下班` : '休假日（僅 ATM 服務）'}`);
  }

  function finalizeDay() {
    const D = S.D, st = D.stats;
    S.reports.unshift(Object.assign({ day: D.d + 1, wd: D.wd, open: D.h.open, avgWait: st.waitN ? st.waitSum / st.waitN : 0, vault: S.vaultCash }, st));
    if (S.reports.length > 120) S.reports.length = 120;
  }

  /* ---------- 文件 ---------- */
  function setStage(doc, st) { doc.stage = st; doc.hist.push([S.t, st]); }
  function createDoc(o) {
    const d = Object.assign({ id: ++S.docSeq, createdAt: S.t, stage: '櫃檯待收', hist: [], claimed: null, inbound: false, day: S.D.d, review: true, needMgr: false }, o);
    d.hist.push([S.t, d.stage]);
    S.docs.push(d);
    if (!d.inbound) S.D.stats.docsCreated++;
    return d;
  }
  const docsAt = (p) => S.docs.filter((d) => d.stage === '櫃檯待收' && d.point === p);
  const docsIn = (...stages) => S.docs.filter((d) => stages.includes(d.stage));

  /* ---------- 輔助判斷 ---------- */
  const onDuty = (a) => a.state === 'duty';
  const staffOf = (role) => S.staff.filter((a) => a.role === role);
  const serviceStaff = () => S.staff.filter((a) => a.point);
  const allServiceClosed = () => serviceStaff().every((a) => a.closingDone || a.state === 'home');
  const customersInside = () => S.agents.filter((a) => a.kind === 'customer' && !a.atm && !a.dead && a.floor !== null).length;
  const pendingFor = (p) => S.D.tickets.some((t) => t.status === 'waiting' && p.services.includes(t.code));
  function lunchDue(a) {
    const D = S.D;
    return a.lunchAt !== null && !a.lunchDone && tod() >= a.lunchAt && tod() < D.h.last;
  }
  function goLunch(a) {
    a.lunchDone = true;
    if (a.point) a.point.open = false;
    log('員工', `${a.name}（${ROLES[a.role].label}）午休用餐`);
    later(a, T.go(L.loungeSeats[a.loungeIdx], '前往休息室'), T.wait(Math.max(10, +S.settings.staffRules.lunchMinutes) * 60, '午休用餐'),
      T.do(() => { a.label = '午休結束'; }));
  }

  /* ---------- 員工決策 ---------- */
  function staffDecide(a) {
    const D = S.D, h = D.h, t = tod();
    if (a.state === 'home') {
      if (h.open && !a.arrivedToday && t >= a.arriveAt && t < h.end) arrive(a);
      return;
    }
    if (a.state !== 'duty') return;
    if (t >= h.end || !h.open) {
      if (a.closingDone || !h.open) { goHome(a); return; }
      if (!a.overtime) { a.overtime = true; D.stats.overtime++; log('員工', `${a.name}（${ROLES[a.role].label}）作業未完成，加班中`); }
    }
    if (!a.didMeeting && a.meetIdx !== undefined) {
      if (t < D.meetEnd) {
        const seat = a.role === 'manager' && a.roleIdx === 0 ? L.spots.meetHead : L.meetSeats[a.meetIdx % L.meetSeats.length];
        later(a, T.go(seat, '前往會議室'),
          T.until(() => tod() >= S.D.meetEnd, a.role === 'manager' ? '主持晨會' : '晨會'),
          T.do(() => { a.didMeeting = true; if (a.role === 'manager' && a.roleIdx === 0) log('員工', '晨會結束，各就各位'); }));
        return;
      }
      a.didMeeting = true;
    }
    (DECIDE[a.role] || idle)(a, t, h);
  }

  function idle(a) { later(a, T.wait(30, '待命')); }

  function arrive(a) {
    const D = S.D;
    a.arrivedToday = true; a.state = 'arriving';
    a.floor = 1; a.x = L.spots.street.x; a.y = L.spots.street.y + R(-25, 25);
    later(a, T.go(L.lockers[a.lockerIdx], '到班進入分行'), T.wait(60, '換制服・打卡'), T.do(() => {
      a.state = 'duty';
      if (D.stats.firstArrive === null) D.stats.firstArrive = S.t;
      log('員工', `${a.name}（${ROLES[a.role].label}）到班打卡`);
    }));
    if (D.meetStart > tod() && a.meetIdx === 0) log('員工', `晨會預定 ${fmtHM(D.meetStart)} 於 3F 會議室舉行`);
  }

  function goHome(a) {
    a.state = 'leaving';
    if (a.point) a.point.open = false;
    later(a, T.go(L.lockers[a.lockerIdx], '前往更衣室'), T.wait(60, '換裝・打卡下班'), T.go(L.spots.street, '下班離開'), T.do(() => {
      a.floor = null; a.state = 'home'; a.label = '已下班';
      S.D.stats.lastLeave = S.t;
      log('員工', `${a.name}（${ROLES[a.role].label}）下班`);
    }));
  }

  /* 櫃員／理專／放款：叫號服務 */
  function serviceDecide(a, t, h) {
    const p = a.point, D = S.D;
    if (!a.prepDone) {
      if (a.role === 'teller') {
        later(a, T.go(L.vaultSpots[a.vaultIdx], '前往 B1 金庫'),
          T.until(() => S.D.vaultOpen, '等候開啟金庫', 1800),
          T.wait(90, '領取現金箱・點收'),
          T.do(() => { const f = +S.settings.cash.tellerFloat || 0; a.cash = f; S.vaultCash -= f; }),
          T.go(p.staffSpot, '前往' + p.label), T.wait(60, '開機・整理櫃台'),
          T.do(() => { a.prepDone = true; }));
      } else {
        later(a, T.go(p.staffSpot, '前往' + p.label), T.wait(120, '開機・準備客戶資料'), T.do(() => { a.prepDone = true; }));
      }
      return;
    }
    if (!atSpot(a, p.staffSpot)) { later(a, T.go(p.staffSpot, '回到' + p.label)); return; }
    if (a.closing) { later(a, T.wait(30, a.closingDone ? (t >= h.end ? '準備下班' : '整理文件・待命') : '盤點作業')); return; }
    if (lunchDue(a) && !p.current) { goLunch(a); return; }
    if (t < h.start) { p.open = false; later(a, T.wait(20, '準備開櫃')); return; }
    p.open = true;
    if (callNext(a, p)) return;
    if (t >= h.last && !pendingFor(p)) { startClosing(a, p); return; }
    later(a, T.wait(10, t >= h.last ? '處理剩餘客戶' : (rnd() < 0.3 ? '整理單據' : '待機')));
  }

  function callNext(a, p) {
    let tk = null;
    for (const code of p.services) { tk = S.D.tickets.find((x) => x.status === 'waiting' && x.code === code); if (tk) break; }
    if (!tk) return false;
    tk.status = 'called'; tk.point = p; tk.calledAt = S.t; tk.calls = 1;
    p.current = tk;
    announce(tk, p);
    const c = tk.cust;
    later(a,
      T.until(() => c.atPoint === p || c.dead, '叫號 ' + tk.no, 150, () => {
        if (tk.calls < 2 && !c.dead) { tk.calls++; tk.calledAt = S.t; announce(tk, p, true); now(a, T.until(() => c.atPoint === p || c.dead, '重新叫號 ' + tk.no, 120)); }
      }),
      T.do(() => beginService(a, p, tk)));
    return true;
  }

  function announce(tk, p, again) {
    const call = { no: tk.no, label: p.label, t: S.t, floor: p.floor, code: tk.code, again: !!again };
    S.D.calls.unshift(call);
    if (S.D.calls.length > 40) S.D.calls.length = 40;
    log('叫號', `${again ? '（重叫）' : ''}來賓 ${tk.no} 號，請到 ${p.label}`);
    if (ABX.onCall) ABX.onCall(call);
  }

  function beginService(a, p, tk) {
    const c = tk.cust, D = S.D;
    if (c.atPoint !== p) {
      tk.status = 'noshow'; p.current = null; D.stats.noshow++;
      log('叫號', `${tk.no} 號過號未到`);
      return;
    }
    tk.status = 'serving'; tk.startAt = S.t;
    const w = tk.firstCall !== undefined ? tk.firstCall : tk.calledAt;
    const wait = w - tk.issuedAt;
    D.stats.waitSum += wait; D.stats.waitN++; D.stats.waitMax = Math.max(D.stats.waitMax, wait);
    const svc = svcOf(tk.code);
    const lv = ABX.People.LEVELS[a.level] || ABX.People.LEVELS.regular;
    const dur = svcDur(+svc.avgMin || 5) * lv.svc * (c.persona && c.persona.key === 'senior' ? 1.2 : 1);
    const needAppr = a.role === 'teller' && rnd() * 100 < +svc.approvalProb * lv.appr;
    const label = `服務 ${tk.no}・${svc.name}`;
    c.label = `辦理 ${svc.name}`;
    const seq = [T.wait(dur * (needAppr ? 0.6 : 1), label)];
    if (needAppr) {
      const req = { p, a, kind: '授權', dur: R(60, 150), done: false, taken: false };
      seq.push(T.do(() => { D.approvals.push(req); log('櫃檯', `${p.label} ${tk.no} 交易需主管授權`); }),
        T.until(() => req.done, '等待主管授權', 600, () => { req.done = true; log('櫃檯', `${p.label} 授權逾時，改由經理線上授權`); }),
        T.wait(dur * 0.4, label));
    }
    seq.push(T.do(() => finishService(a, p, tk, svc, needAppr)));
    now(a, ...seq);
  }

  function finishService(a, p, tk, svc, big) {
    const D = S.D, c = tk.cust;
    tk.status = 'done'; tk.endAt = S.t; c.served = true;
    D.stats.served++;
    D.stats.svc[tk.code] = (D.stats.svc[tk.code] || 0) + 1;
    if (a.role === 'teller' && (tk.code === 'A' || tk.code === 'B')) {
      const amt = Math.round(Math.exp(Math.log(20000) + 0.9 * gauss()) / 100) * 100 * (big ? 10 : 1);
      if (tk.code === 'A' && rnd() < 0.5) { a.cash += amt; D.stats.cashIn += amt; }
      else { const out = Math.min(amt, Math.max(0, a.cash - 50000)); a.cash -= out; D.stats.cashOut += out; }
    }
    let docMsg = '';
    if (rnd() * 100 < +svc.docProb) {
      const doc = createDoc({ name: svc.docName || svc.name + '文件', point: p, from: p.label, ref: tk.no, needMgr: rnd() * 100 < +svc.mgrProb });
      docMsg = `，產生「${doc.name}」待送件`;
    }
    p.current = null;
    log('櫃檯', `${tk.no} 於 ${p.label} 完成${svc.name}（${Math.round((S.t - tk.startAt) / 60)} 分）${docMsg}`);
  }

  function startClosing(a, p) {
    a.closing = true; p.open = false;
    const D = S.D;
    log('盤點', `${p.label}（${a.name}）停止服務，開始盤點`);
    if (a.role === 'teller') {
      later(a,
        T.wait(R(20, 35) * 60 * (ABX.People.LEVELS[a.level] || ABX.People.LEVELS.regular).count, '現金盤點・清點庫存'),
        T.do(() => {
          if (rnd() * 100 < +S.settings.cash.discrepancyProb) {
            const req = { p, a, kind: '差額查核', dur: R(300, 600), done: false, taken: false };
            D.approvals.push(req); D.stats.discrepancies++;
            log('盤點', `${p.label} 現金帳差 ${fmtMoney(Math.round(R(1, 30)) * 100)}，請主管查核`);
            now(a, T.until(() => req.done, '等待主管查核帳差', 1800, () => { req.done = true; }));
          }
        }),
        T.wait(10 * 60, '軋帳・列印日結報表'),
        T.do(() => { createDoc({ name: '日結傳票（' + p.label + '）', point: p, from: p.label, review: false }); }),
        T.go(L.vaultSpots[a.vaultIdx], '繳回現金箱'),
        T.until(() => S.D.vaultOpen || S.D.vaultClosed, '等候金庫', 1800),
        T.wait(120, '現金箱入庫・登記'),
        T.do(() => { S.vaultCash += a.cash; a.cash = 0; a.cashReturned = true; }),
        T.go(p.staffSpot, '回到' + p.label),
        T.wait(5 * 60, '整理桌面・憑證歸檔'),
        T.do(() => { a.closingDone = true; log('盤點', `${p.label}（${a.name}）盤點軋帳完成`); }));
    } else {
      later(a,
        T.wait(R(25, 45) * 60, '整理客戶資料・電話追蹤'),
        T.do(() => { createDoc({ name: '業務日報（' + p.label + '）', point: p, from: p.label, review: false }); }),
        T.wait(5 * 60, '整理桌面'),
        T.do(() => { a.closingDone = true; log('盤點', `${p.label}（${a.name}）完成日終作業`); }));
    }
  }

  /* 櫃檯主管 */
  function supervisorDecide(a, t, h) {
    const D = S.D;
    const mgrAt = (spot) => staffOf('manager').some((m) => atSpot(m, spot));
    if (!D.vaultOpen && !D.vaultOpening && !D.vaultClosed && t >= D.meetEnd && t < h.last) {
      D.vaultOpening = true;
      later(a, T.go(L.spots.supVault, '前往 B1 金庫'),
        T.until(() => mgrAt(L.spots.mgrVault), '等候經理（雙人控管）', 300),
        T.wait(150, '開啟金庫（雙人控管）'),
        T.do(() => { D.vaultOpen = true; log('金庫', `金庫開啟（${a.name}／雙人控管），金庫現金 ${fmtMoney(S.vaultCash)}`); }));
      return;
    }
    const ev = D.cashEvents.find((e) => e.atVault > 0 && !e.supTaken && !e.done);
    if (ev) {
      ev.supTaken = true;
      later(a, T.go(L.spots.supVault, '前往金庫（運鈔交接）'), T.wait(R(300, 480), '運鈔現金交接・點收'), T.do(() => completeCash(ev, a)));
      return;
    }
    const req = D.approvals.find((r) => !r.done && !r.taken);
    if (req) {
      req.taken = true;
      const s = req.p.staffSpot;
      later(a, T.go({ floor: s.floor, x: s.x + 18, y: s.y - 12 }, '前往' + req.p.label),
        T.wait(req.done ? 1 : req.dur, req.kind === '差額查核' ? `查核帳差（${req.a.name}）` : `授權覆核（${req.p.label}）`),
        T.do(() => { if (!req.done) { req.done = true; D.stats.approvals++; } }));
      return;
    }
    if (lunchDue(a)) { goLunch(a); return; }
    if (t >= h.last && !a.closingDone) {
      const tellersDone = staffOf('teller').every((x) => x.cashReturned || x.state !== 'duty' || !x.prepDone);
      if (tellersDone && D.vaultOpen) {
        D.vaultClosing = true;
        later(a, T.go(L.spots.supVault, '前往金庫'),
          T.until(() => mgrAt(L.spots.mgrVault), '等候經理（雙人控管）', 300),
          T.wait(600, '金庫盤點・封存'),
          T.do(() => { D.vaultOpen = false; D.vaultClosed = true; a.closingDone = true; log('金庫', `金庫盤點完成並封存，庫存 ${fmtMoney(S.vaultCash)}`); }));
        return;
      }
      if (!D.vaultOpen) { a.closingDone = true; return; }
    }
    if (!atSpot(a, a.station)) { later(a, T.go(a.station, '回到主管座位')); return; }
    later(a, T.wait(20, t < h.start ? '檢視今日交易限額' : t >= h.last ? '覆核櫃員軋帳' : '櫃檯監督・覆核傳票'));
  }

  function completeCash(ev, by) {
    if (ev.done) return;
    ev.done = true;
    const target = +S.settings.cash.vaultTarget || 0;
    const D = S.D;
    let msg;
    if (S.vaultCash > target) { const amt = Math.round((S.vaultCash - target) / 10000) * 10000; S.vaultCash -= amt; msg = `解繳現金 ${fmtMoney(amt)} 至總行`; }
    else { const amt = Math.round((target - S.vaultCash + R(0, 2000000)) / 10000) * 10000; S.vaultCash += amt; msg = `運補現金 ${fmtMoney(amt)}`; }
    D.stats.cashTransport++;
    log('金庫', `運鈔交接完成（${by ? by.name : '系統'}）：${msg}`);
  }

  /* 分行經理 */
  function managerDecide(a, t, h) {
    const D = S.D;
    if (!a.vaultOpenHelped && !D.vaultOpen && !D.vaultClosed && t >= D.meetEnd && t < h.last) {
      a.vaultOpenHelped = true;
      later(a, T.go(L.spots.mgrVault, '前往 B1 金庫'), T.until(() => S.D.vaultOpen, '開啟金庫（雙人控管）', 1200));
      return;
    }
    if (!a.vaultCloseHelped && D.vaultClosing && D.vaultOpen) {
      a.vaultCloseHelped = true;
      later(a, T.go(L.spots.mgrVault, '前往 B1 金庫'), T.until(() => !S.D.vaultOpen, '金庫封存（雙人控管）', 1800));
      return;
    }
    const docs = S.docs.filter((d) => (d.stage === '主管核章' || d.stage === '總行來文') && !d.claimed);
    if (docs.length) {
      if (!atSpot(a, a.station)) { later(a, T.go(a.station, '回到經理室')); return; }
      const d = docs[0]; d.claimed = a;
      later(a, T.wait(R(90, 240), (d.inbound ? '核閱：' : '核章：') + d.name), T.do(() => {
        d.claimed = null;
        if (d.inbound) { setStage(d, '已歸檔'); log('送件', `經理核閱總行來文「${d.name}」，歸檔`); }
        else { setStage(d, '待送總行'); log('送件', `經理核章「${d.name}」（${d.from}），轉待送總行`); }
      }));
      return;
    }
    if (lunchDue(a)) { goLunch(a); return; }
    if (t >= h.last && !a.closingDone) {
      const supDone = staffOf('supervisor').every((s) => s.closingDone || s.state !== 'duty');
      if (supDone && !D.vaultOpen) {
        if (!atSpot(a, a.station)) { later(a, T.go(a.station, '回到經理室')); return; }
        later(a, T.wait(600, '簽核營業日報'), T.do(() => { a.closingDone = true; log('盤點', `${a.name} 簽核營業日報，分行日結完成`); }));
        return;
      }
    }
    if (t >= a.nextPatrol && t >= h.start && t < h.last) {
      a.nextPatrol = t + R(60, 100) * 60;
      later(a, T.go(jit(L.spots.lobbyA, 30), '巡視營業大廳'), T.wait(90, '巡視營業大廳・問候客戶'),
        T.go(jit(L.spots.hall2, 30), '巡視理財區'), T.wait(60, '關心理專業務'), T.go(a.station, '回到經理室'));
      return;
    }
    if (!atSpot(a, a.station)) { later(a, T.go(a.station, '回到經理室')); return; }
    later(a, T.wait(30, t >= h.last ? '審閱日結資料' : pick(['處理公文', '電話洽公', '審閱授信案件', '業績檢討'])));
  }

  /* 大堂經理 */
  function guideDecide(a, t, h) {
    const D = S.D;
    const req = D.guideReq.find((r) => !r.taken && !r.done && !r.c.dead);
    if (req) {
      req.taken = true;
      later(a, T.go(a.station, '回到服務台'), T.wait(R(40, 100), '協助客戶諮詢・填單'), T.do(() => { req.done = true; }));
      return;
    }
    if (lunchDue(a)) { goLunch(a); return; }
    if (t >= h.last) {
      if (!a.closing) {
        a.closing = true;
        later(a, T.until(() => customersInside() === 0, '協助剩餘客戶', 3 * 3600),
          T.go(jit(L.spots.lobbyA, 20), '整理大廳'), T.wait(15 * 60, '整理大廳・補充表單'),
          T.go(L.spots.archive, '前往 B1 檔案室'), T.wait(25 * 60, '協助文件整理歸檔'),
          T.do(() => { a.closingDone = true; }));
        return;
      }
      later(a, T.wait(30, '整理文件・待命'));
      return;
    }
    if (t >= h.start && rnd() < 0.12) {
      later(a, T.go({ floor: 1, x: R(330, 700), y: R(195, 370) }, '巡視等候區'), T.wait(20, '關懷等候客戶'), T.go(a.station));
      return;
    }
    if (!atSpot(a, a.station)) { later(a, T.go(a.station, '回到服務台')); return; }
    later(a, T.wait(20, t < h.start ? '檢查取號機・整理表單' : '大廳引導'));
  }

  /* 後勤作業 */
  function backofficeDecide(a, t, h) {
    if (!atSpot(a, a.station)) { later(a, T.go(a.station, '回到後勤座位')); return; }
    const doc = S.docs.find((d) => d.stage === '後勤審核' && !d.claimed);
    if (doc) {
      doc.claimed = a;
      const bo = S.settings.backoffice;
      later(a, T.wait(R(+bo.reviewMinMin, Math.max(+bo.reviewMinMin, +bo.reviewMaxMin)) * 60, '審核建檔：' + doc.name), T.do(() => {
        doc.claimed = null;
        setStage(doc, doc.needMgr ? '主管核章' : '待送總行');
        log('送件', `後勤（${a.name}）審核「${doc.name}」完成 → ${doc.stage}`);
      }));
      return;
    }
    if (lunchDue(a)) { goLunch(a); return; }
    if (t >= h.last && !a.closing && allServiceClosed() && !docsIn('櫃檯待收', '內部傳遞', '後勤審核').length) {
      a.closing = true;
      later(a, T.wait(20 * 60, '日終批次・報表列印'), T.do(() => { a.closingDone = true; log('盤點', `後勤（${a.name}）日終批次完成`); }));
      return;
    }
    later(a, T.wait(30, t < h.start ? '開機・檢視待辦' : t >= h.last ? '日終對帳' : pick(['系統建檔', '帳務核對', '整理傳票'])));
  }

  /* 收發送件員 */
  function courierDecide(a, t, h) {
    const D = S.D;
    const disp = D.dispatch.find((x) => !x.done && t >= x.t);
    if (disp) { disp.done = true; dispatchRun(a, false); return; }
    if (lunchDue(a)) { goLunch(a); return; }
    const pts = S.points.filter((p) => docsAt(p).length);
    const interval = Math.max(10, +S.settings.courier.collectIntervalMin) * 60;
    if (pts.length && t >= h.start && (t - D.lastCollect >= interval || (t >= h.last && allServiceClosed()))) { collectRound(a); return; }
    if (t >= h.last) {
      const allDisp = D.dispatch.every((x) => x.done);
      const mgrOn = staffOf('manager').some(onDuty);
      const upstream = docsIn('櫃檯待收', '內部傳遞', '後勤審核', ...(mgrOn ? ['主管核章'] : [])).length;
      const ready = docsIn('待送總行').length;
      if (allDisp && ready && !upstream && allServiceClosed()) { log('送件', '日結文件加開送件梯次'); dispatchRun(a, true); return; }
      if (allDisp && !ready && !upstream && allServiceClosed() && !a.closing) {
        a.closing = true;
        later(a, T.go(a.station, '回到收發室'), T.wait(600, '登記收發簿・整理郵件'), T.do(() => { a.closingDone = true; }));
        return;
      }
    }
    if (!atSpot(a, a.station)) { later(a, T.go(a.station, '回到收發室')); return; }
    later(a, T.wait(30, t < h.start ? '整理今日郵件' : pick(['收發登記', '分類郵件', '整理送件袋'])));
  }

  function collectTasks(a) {
    S.D.lastCollect = tod();
    const pts = S.points.filter((p) => docsAt(p).length).sort((p, q) => p.floor - q.floor || p.staffSpot.x - q.staffSpot.x);
    const out = [];
    for (const p of pts) {
      out.push(T.go(p.courierSpot, '收件：' + p.label), T.wait(15, '收取文件・簽收'), T.do(() => {
        for (const d of docsAt(p)) { setStage(d, '內部傳遞'); a.carry.push(d); }
      }));
    }
    if (pts.length) {
      out.push(T.go(L.spots.boInbox, '送至後勤作業區'), T.wait(20, '文件交接・登記'), T.do(() => {
        const n = a.carry.length;
        for (const d of a.carry) setStage(d, d.review ? '後勤審核' : '待送總行');
        a.carry = [];
        if (n) log('送件', `${a.name} 完成收件 ${n} 件，交後勤作業區`);
      }));
    }
    return out;
  }

  function collectRound(a) { later(a, ...collectTasks(a), T.go(a.station, '回到收發室')); }

  function dispatchRun(a, extra) {
    const s = S.settings.courier;
    later(a, ...collectTasks(a), T.go(L.spots.boOutbox, '前往待送件匣'), T.wait(30, '封裝送件袋・清點'), T.do(() => {
      const bag = docsIn('待送總行');
      if (!bag.length) { log('送件', `${fmtHM(tod())} 送件梯次：無待送文件，本梯次取消`); return; }
      for (const d of bag) setStage(d, '送件途中');
      a.bag = bag;
      S.D.stats.trips++;
      log('送件', `${a.name} 攜 ${bag.length} 件文件出發送總行${extra ? '（加開梯次）' : ''}`);
      now(a, T.go(L.spots.street, '外出送件'),
        T.do(() => { a.floor = null; a.offsite = true; }),
        T.wait(+s.travelMin * 60, '前往總行送件'),
        T.do(() => {
          for (const d of a.bag) setStage(d, '已送達總行');
          S.D.stats.docsDelivered += a.bag.length;
          log('送件', `${a.bag.length} 件文件已送達總行`);
          a.bag = [];
          const n = Math.floor(R(0, 3));
          for (let i = 0; i < n; i++) {
            a.carry.push(createDoc({ name: pick(['總行公文', '作業通函', '稽核通知', '空白票據', '新版表單']), from: '總行', inbound: true, review: false, stage: '內部傳遞' }));
            S.D.stats.inbound++;
          }
        }),
        T.wait(+s.handoverMin * 60, '總行收發室交件'),
        T.wait(+s.travelMin * 60, '返回分行'),
        T.do(() => { a.offsite = false; a.floor = 1; a.x = L.spots.street.x; a.y = L.spots.street.y; log('送件', `${a.name} 返回分行`); }),
        T.go(L.spots.mgrTray, '遞交總行來文'), T.wait(20, '遞交總行來文'),
        T.do(() => { for (const d of a.carry) setStage(d, '總行來文'); a.carry = []; }),
        T.go(a.station, '回到收發室'));
    }));
  }

  /* 保全 */
  function securityDecide(a, t, h) {
    const D = S.D;
    const ev = D.cashEvents.find((e) => e.spawned && !e.escortTaken && !e.done);
    if (ev) {
      ev.escortTaken = true;
      later(a, T.go(L.spots.door, '前往門口迎接運鈔車'), T.until(() => ev.arrived > 0, '等候運鈔車', 600),
        T.do(() => { ev.escort = true; log('保全', `${a.name} 戒護運鈔人員進入金庫`); }),
        T.go(L.spots.escortB1, '戒護運鈔至金庫'), T.until(() => ev.done, '戒護現金交接', 1800),
        T.go(L.spots.door, '護送運鈔人員離開'), T.wait(20, '確認運鈔車離開'), T.go(a.station, '回到崗位'));
      return;
    }
    if (t >= h.start - 120 && t < h.last && !D.doorOpened) {
      later(a, T.go(L.spots.door, '前往大門'), T.until(() => tod() >= S.D.h.start, '準備開門'), T.wait(30, '開啟大門・迎客'),
        T.do(() => { D.doorOpened = true; log('保全', `${fmtHM(tod())} 大門開啟，開始營業`); }), T.go(a.station));
      return;
    }
    if (t >= h.last && !D.doorClosed) {
      later(a, T.go(L.spots.door, '前往大門'), T.wait(40, '拉下鐵門（僅出不進）'),
        T.do(() => { D.doorClosed = true; log('保全', `${fmtHM(tod())} 停止收件，大門關閉（僅出不進）`); }), T.go(a.station));
      return;
    }
    if (t >= h.last) {
      if (customersInside() > 0) { later(a, T.wait(30, '送客・維持秩序')); return; }
      const others = S.staff.filter((x) => x !== a && x.role !== 'security');
      if (others.every((x) => x.state === 'home') && t >= h.end - 1800) {
        if (!a.closing) {
          a.closing = true;
          const route = L.patrol.map((s) => T.go(s, '最終巡檢'));
          later(a, ...route, T.go(L.spots.monitor, '前往監控機房'), T.wait(180, '設定保全系統'),
            T.do(() => { a.closingDone = true; log('保全', `${a.name} 完成最終巡檢並設定保全系統`); }));
          return;
        }
        later(a, T.wait(30, '準備下班'));
        return;
      }
    }
    if (t >= a.nextPatrol && t >= h.start) {
      a.nextPatrol = t + 45 * 60;
      const pts = L.patrol.slice().sort(() => rnd() - 0.5).slice(0, 3);
      later(a, ...pts.map((s) => T.go(s, '例行巡邏')), T.go(L.spots.monitor, '巡視監控機房'), T.wait(60, '檢視監視畫面'), T.go(a.station, '回到崗位'));
      return;
    }
    if (!atSpot(a, a.station)) { later(a, T.go(a.station, '回到崗位')); return; }
    later(a, T.wait(30, t < h.start ? '開門前安全檢查' : t >= h.end ? '等候同仁下班' : '站崗・門禁管制'));
  }

  /* 清潔 */
  function cleanerDecide(a, t, h) {
    if (lunchDue(a)) { goLunch(a); return; }
    if (t >= h.last + 3600 && customersInside() === 0) {
      if (!a.closing) {
        a.closing = true;
        later(a, T.go(jit(L.spots.lobbyA, 30), '最後清潔'), T.wait(15 * 60, '大廳拖地・倒垃圾'), T.go(a.station, '歸還清潔用具'), T.wait(120, '整理清潔用具'),
          T.do(() => { a.closingDone = true; }));
        return;
      }
      later(a, T.wait(30, '待命')); return;
    }
    const spots = t < h.start ? L.cleanSpots.filter((s) => s.floor === 1) : L.cleanSpots;
    later(a, T.go(jit(pick(spots), 15)), T.wait(R(120, 360), pick(['拖地清潔', '擦拭桌面', '清理垃圾桶', '擦拭玻璃門', '補充洗手間用品'])));
  }

  const DECIDE = {
    teller: serviceDecide, advisor: serviceDecide, loan: serviceDecide,
    supervisor: supervisorDecide, manager: managerDecide, guide: guideDecide,
    backoffice: backofficeDecide, courier: courierDecide, security: securityDecide, cleaner: cleanerDecide,
  };

  /* ---------- 客戶 ---------- */
  function spawnCustomer() {
    const avail = serviceAvailable();
    if (!avail.length) return;
    const persona = ABX.People.pickPersona(rnd);
    const wOf = (x) => +x.ratio * ((persona.pref && persona.pref[x.code]) || 1);
    const total = avail.reduce((s, x) => s + wOf(x), 0);
    let r = rnd() * total, svc = avail[0];
    for (const x of avail) { r -= wOf(x); if (r <= 0) { svc = x; break; } }
    const D = S.D;
    const c = mkAgent({ kind: 'customer', code: svc.code, name: persona.label, persona, look: ABX.People.customerLook(persona, rnd), color: svc.color,
      floor: 1, x: L.spots.street.x, y: L.spots.street.y + R(-25, 25),
      speed: R(22, 28) * persona.speed, enteredAt: S.t, patience: R(0.6, 1.5) * persona.patience * (+S.settings.customers.patienceMin || 40) * 60, label: '進入分行' });
    D.stats.arrived++;
    later(c, T.go(jit(L.spots.foyerIn, 25), '進入分行'), T.do(() => afterEnter(c)));
  }

  function afterEnter(c) {
    const D = S.D;
    const guide = staffOf('guide').find((g) => onDuty(g) && g.floor === 1 && !g.transfer);
    if (guide && rnd() * 100 < +S.settings.customers.guideAskProb && D.guideReq.filter((r) => !r.done).length < 3) {
      const req = { c, done: false, taken: false };
      D.guideReq.push(req);
      later(c, T.go(jit(L.spots.guideCust, 10), '詢問大堂經理'), T.until(() => req.done, '向大堂經理詢問', 240, () => { req.done = true; }));
    }
    later(c, T.go(jit(L.spots.ticket, 8), '前往取號機'), T.wait(R(6, 15), '取號'), T.do(() => issueTicket(c)));
  }

  function issueTicket(c) {
    const D = S.D, t = tod();
    if (!D.h.open || t >= D.h.last || t < D.h.start) {
      D.stats.turnedAway++;
      log('客戶', '客戶抵達取號機時已停止取號，離開分行');
      leave(c); return;
    }
    D.seq[c.code] = (D.seq[c.code] || 0) + 1;
    const no = c.code + String(D.seq[c.code]).padStart(3, '0');
    const tk = { no, code: c.code, cust: c, issuedAt: S.t, status: 'waiting' };
    D.tickets.push(tk);
    c.ticket = tk;
    const svc = svcOf(c.code);
    const fl = svc.floor === 2 && S.points.some((p) => p.floor === 2 && p.services.includes(c.code)) ? 2 : 1;
    const free = L.seats[fl].filter((s) => !s.occ);
    let dest;
    if (free.length) { const s = pick(free.slice(0, Math.max(6, free.length))); s.occ = c; c.seat = s; dest = { floor: fl, x: s.x, y: s.y, face: -Math.PI / 2 }; }
    else { const st = L.stand[fl]; dest = { floor: fl, x: st.x + rnd() * st.w, y: st.y + rnd() * st.h }; }
    later(c, T.go(dest, `前往${fl === 2 ? ' 2F ' : ''}等候區`),
      T.until(() => tk.status === 'called' || S.t - tk.issuedAt > c.patience, '等候叫號 ' + no),
      T.do(() => respond(c, tk)));
  }

  function freeSeat(c) { if (c.seat) { c.seat.occ = null; c.seat = null; } }

  function respond(c, tk) {
    freeSeat(c);
    if (tk.status === 'called') {
      tk.firstCall = tk.firstCall === undefined ? tk.calledAt : tk.firstCall;
      const p = tk.point;
      now(c, T.go(jit(p.custSpot, 3), '前往' + p.label), T.do(() => { c.atPoint = p; }),
        T.until(() => tk.status === 'done' || tk.status === 'noshow', '臨櫃辦理'),
        T.do(() => { c.atPoint = null; leave(c); }));
      return;
    }
    tk.status = 'abandoned';
    S.D.stats.abandoned++;
    log('客戶', `${tk.no} 號等候過久（${Math.round((S.t - tk.issuedAt) / 60)} 分），放棄離開`);
    leave(c);
  }

  function leave(c) {
    now(c, T.go({ floor: 1, x: L.spots.street.x, y: L.spots.street.y + R(-25, 25) }, '離開分行'), T.do(() => { c.dead = true; freeSeat(c); }));
  }

  function spawnAtm() {
    const persona = ABX.People.pickPersona(rnd);
    const c = mkAgent({ kind: 'customer', atm: true, name: 'ATM 客戶（' + persona.label + '）', persona, look: ABX.People.customerLook(persona, rnd), color: '#64748b',
      floor: 1, x: L.spots.street.x, y: 100 + R(-30, 30), speed: R(22, 28) * persona.speed, label: '前往 ATM' });
    later(c, T.go(jit(L.spots.atmQueue, 18), '前往 ATM'),
      T.until(() => L.atms.some((m) => !m.user), '排隊等候 ATM', 600),
      T.do(() => {
        const m = L.atms.find((x) => !x.user);
        if (!m) { now(c, T.go({ floor: 1, x: 15, y: 100 }, '離開'), T.do(() => { c.dead = true; })); return; }
        m.user = c;
        now(c, T.go(m.spot, '前往 ATM'), T.wait(R(70, 240), 'ATM 交易中'),
          T.do(() => { m.user = null; S.D.stats.atm++; }),
          T.go({ floor: 1, x: 15, y: 100 + R(-30, 30) }, '離開'), T.do(() => { c.dead = true; }));
      }));
  }

  function spawnCrew(ev) {
    log('金庫', `${fmtHM(tod())} 運鈔車抵達分行`);
    ev.spawned = true;
    for (let i = 0; i < 2; i++) {
      const c = mkAgent({ kind: 'visitor', role: 'crew', name: '運鈔員', color: '#166534', look: ABX.People.staffLook('運鈔' + i, 'crew'), cashbox: true,
        floor: 1, x: L.spots.street.x, y: L.spots.street.y + i * 14, speed: 24, label: '運鈔車抵達' });
      later(c, T.go({ floor: 1, x: L.spots.crew.x + i * 16, y: L.spots.crew.y }, '進入分行'),
        T.do(() => { ev.arrived++; }),
        T.until(() => ev.escort, '等候保全戒護', 300),
        T.go({ floor: -1, x: L.spots.crewVault.x + i * 18, y: L.spots.crewVault.y }, '前往金庫'),
        T.do(() => { ev.atVault++; }),
        T.until(() => ev.done, '現金交接', 1500, () => completeCash(ev, null)),
        T.go({ floor: 1, x: L.spots.street.x, y: L.spots.street.y + i * 14 }, '離開分行'),
        T.do(() => { c.dead = true; }));
    }
  }

  /* ---------- 全域事件 ---------- */
  function globalEvents(dt) {
    const D = S.D, h = D.h, t = tod(), hr = Math.floor(t / 3600);
    const cs = S.settings.customers;
    if (h.open) {
      if (t >= h.start + 300 && t < h.last && !D.doorOpened) D.doorOpened = true;
      if (t >= h.last + 300 && !D.doorClosed) D.doorClosed = true;
      if (t >= h.start + 600 && t < h.end && !D.vaultOpen && !D.vaultClosed) { D.vaultOpen = true; log('金庫', '（系統）金庫自動開啟'); }
      if (t >= h.end + 3 * 3600 && D.vaultOpen) { D.vaultOpen = false; D.vaultClosed = true; log('金庫', '（系統）金庫自動封存'); }
      if (t >= h.start && t < h.last) {
        const rate = (+cs.hourly[hr] || 0) * (+cs.multiplier || 0) * (D.wd === 5 ? +cs.saturdayMultiplier : 1);
        if (rnd() < (rate * dt) / 3600) spawnCustomer();
      }
      for (const ev of D.cashEvents) if (!ev.spawned && t >= ev.t) spawnCrew(ev);
    }
    const atmRate = +cs.atmHourly[hr] || 0;
    if (rnd() < (atmRate * dt) / 3600) spawnAtm();
  }

  /* ---------- 推進 ---------- */
  function step(dt) {
    S.t += dt;
    const d = Math.floor(S.t / DAY);
    if (d !== S.D.d) newDay(d);
    globalEvents(dt);
    for (let i = 0; i < S.agents.length; i++) runAgent(S.agents[i], dt);
    if (S.agents.some((a) => a.dead)) S.agents = S.agents.filter((a) => !a.dead);
  }

  function advance(sec, maxDt = 0.5) {
    let rem = sec;
    while (rem > 1e-9) { const dt = Math.min(rem, maxDt); step(dt); rem -= dt; }
  }

  /* ---------- 查詢 ---------- */
  function phaseInfo() {
    const { d, wd, tod: t } = today();
    const h = hoursOf(wd);
    const present = S.staff.filter((a) => a.state !== 'home').length;
    let key, text;
    if (!h.open) { key = 'holiday'; text = '休假日（ATM 24H 服務）'; }
    else if (t < h.start) { key = present ? 'prep' : 'night'; text = present ? '員工到班・營業準備' : '非營業時間'; }
    else if (t < h.last) { key = 'open'; text = '營業中'; }
    else if (t < h.end) { key = 'closing'; text = `停止收件・內部盤點作業（${fmtHM(h.last)} 後不接新客）`; }
    else { key = present ? 'overtime' : 'night'; text = present ? `已過下班時間（${present} 人仍在作業）` : '已打烊'; }
    return { d, wd, tod: t, h, key, text, present };
  }

  Object.assign(ABX, {
    Sim: { reset, advance, phaseInfo, whereOf, svcOf, docsIn, customersInside, hoursOf, DAY },
  });
})();
