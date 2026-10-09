/* Autobank-X — 員工排班、請假與代班
 * 每天開始時：
 *   1. 依上班日與週六輪值決定誰該上班（排休者不到班）
 *   2. 套用假單（預排假單＋隨機病假）；半天假會晚到或提早離開
 *   3. 全天請假者依序找人代班：週六輪休同事調班 → 跨職務支援（代理）→ 鄰近分行派員支援
 *      都找不到時，該窗口當日暫停服務
 */
(function () {
  const ABX = window.ABX;
  const C = () => ABX.SimCore;

  const LEAVE_TYPES = ['特休', '病假', '事假', '公假', '喪假', '婚假'];
  const PARTS = { full: '全天', am: '上午', pm: '下午' };

  // 請假職務 → 可代理的職務（依優先順序）
  const COVER = {
    teller: ['backoffice', 'digital', 'guide'], digital: ['guide', 'backoffice'],
    advisor: ['vip', 'loan'], loan: ['corporate', 'advisor'], corporate: ['loan', 'advisor'], vip: ['advisor', 'corporate'],
    safebox: ['backoffice', 'guide'], supervisor: ['teller'], manager: ['corporate', 'vip', 'supervisor'],
    guide: ['digital', 'backoffice'], backoffice: ['audit'], courier: ['backoffice', 'guide'],
    security: [], cleaner: [], audit: [],
  };
  const DISPATCH_OK = ['manager', 'teller', 'digital', 'advisor', 'loan', 'corporate', 'vip', 'safebox', 'guide', 'courier', 'security', 'cleaner', 'backoffice', 'supervisor'];
  // 被借調後原職務至少要保留的在崗人數
  const KEEP = { backoffice: 2 };
  const PRIORITY = ['supervisor', 'manager', 'security', 'teller', 'guide', 'courier', 'digital', 'safebox', 'advisor', 'loan', 'corporate', 'vip', 'backoffice', 'cleaner', 'audit'];
  const TEMP_NAMES = ['林雅文', '陳柏宇', '黃郁婷', '張志豪', '李宛蓉', '吳承恩', '蔡欣怡', '楊凱文', '徐若瑜', '高振宏'];

  function cfg() {
    const s = C().S.settings.schedule || {};
    return {
      satRotation: s.satRotation !== false,
      sickProb: s.sickProb === undefined ? 2 : +s.sickProb,
      substitute: s.substitute !== false,
      dispatch: s.dispatch !== false,
    };
  }
  const staffCfg = (a) => C().S.settings.staff[a.staffIdx] || {};
  const baseRole = (a) => (a.base ? a.base.role : a.role);
  const daysOf = (a) => String(staffCfg(a).days === undefined || staffCfg(a).days === null ? '123456' : staffCfg(a).days);
  const roleLabel = (r) => ABX.ROLES[r] ? ABX.ROLES[r].label : r;

  /* 依排班規則，該員工在第 d 天（0 起算）是否排班 */
  function worksDay(a, d) {
    const S = C().S, wd = d % 7;
    if (a.temp || !C().hoursOf(wd).open) return false;
    if (!daysOf(a).includes(String(wd + 1))) return false;
    if (wd === 5 && cfg().satRotation) {
      const peers = S.staff.filter((x) => !x.temp && baseRole(x) === baseRole(a) && daysOf(x).includes('6'));
      if (peers.length >= 2) return (peers.indexOf(a) + Math.floor(d / 7)) % 2 === 0;
    }
    return true;
  }
  const leaveOf = (name, d) => (C().S.leaves || []).find((l) => l.name === name && +l.day === d + 1) || null;

  function midday(h) { return Math.round((h.start + (h.end - h.start) / 2) / 1800) * 1800; }

  /* ---------- 每日還原 ---------- */
  function restore() {
    const S = C().S;
    if (!S.staff) return;
    for (const b of S.staff) {
      if (b.base) { Object.assign(b, b.base); delete b.base; }
      b.acting = null; b.callIn = false; b.offDay = false;
    }
    if (S.staff.some((x) => x.temp)) {
      S.staff = S.staff.filter((x) => !x.temp);
      S.agents = S.agents.filter((x) => !x.temp);
    }
    for (const p of S.points) p.staff = p.owner;
  }

  /* ---------- 每日排班 ---------- */
  function planDay(d) {
    const S = C().S, D = S.D, h = D.h, R = C().R;
    if (!S.leaves) S.leaves = ABX.clone((S.settings.schedule && S.settings.schedule.leaves) || []);
    if (!S.rosterHist) S.rosterHist = {};
    D.roster = { absent: [], subs: [], callIns: [], temps: [], vacant: [] };
    if (!h.open) { for (const a of S.staff) { a.scheduled = false; a.absent = true; a.offDay = true; } snapshot(d); return; }
    const c = cfg(), mid = midday(h);

    for (const a of S.staff) {
      a.scheduled = worksDay(a, d);
      if (!a.scheduled) { a.absent = true; a.offDay = true; continue; }
      let lv = leaveOf(a.name, d);
      if (!lv && C().rnd() * 100 < c.sickProb) {
        lv = { name: a.name, day: d + 1, type: '病假', part: 'full', random: true };
        S.leaves.push(lv);
      }
      if (!lv) continue;
      a.leave = lv;
      if (lv.part === 'am') { a.arriveAt = mid + R(-5, 5) * 60; a.didMeeting = true; }
      else if (lv.part === 'pm') a.leaveAt = mid;
      else { a.absent = true; D.roster.absent.push(a); }
      D.stats.leaves = (D.stats.leaves || 0) + 1;
      C().log('排班', `${a.name}（${roleLabel(a.role)}）${lv.type}${lv.part === 'full' ? '' : `（${PARTS[lv.part]}）`}${lv.random ? '，早上來電告假' : ''}`);
    }

    if (c.substitute) {
      const queue = D.roster.absent.slice().sort((x, y) => PRIORITY.indexOf(x.role) - PRIORITY.indexOf(y.role));
      for (const a of queue) coverSlot(slotOf(a), 0, false);
    }
    snapshot(d);
  }

  const slotOf = (a) => ({ role: a.role, station: a.station, point: a.point, vaultIdx: a.vaultIdx, roleIdx: a.roleIdx, forName: a.name });

  function presentIn(role) { return C().S.staff.filter((x) => x.role === role && !x.absent && !x.leaveAt).length; }

  function coverSlot(slot, depth, urgent) {
    const S = C().S, D = S.D;
    // 1) 週六輪休的同職務同事調班
    if (D.wd === 5 && !urgent) {
      const b = S.staff.find((x) => x.offDay && !x.temp && x.role === slot.role && daysOf(x).includes('6') && !leaveOf(x.name, D.d));
      if (b) {
        b.absent = false; b.offDay = false; b.scheduled = true; b.callIn = true;
        D.roster.callIns.push(b); D.stats.subs = (D.stats.subs || 0) + 1;
        C().log('排班', `${b.name} 週六調班，代替 ${slot.forName} 上班`);
        return;
      }
    }
    // 2) 跨職務代理（保留原職務至少一人在崗）
    if (!urgent) {
      const order = COVER[slot.role] || [];
      const cands = S.staff.filter((b) => !b.absent && !b.acting && !b.temp && !b.leave && !b.callIn && order.includes(b.role) &&
        presentIn(b.role) > (KEEP[b.role] || 1));
      cands.sort((x, y) => order.indexOf(x.role) - order.indexOf(y.role) || (x.point ? 1 : 0) - (y.point ? 1 : 0) ||
        (y.level === 'senior') - (x.level === 'senior'));
      const b = cands[0];
      if (b) {
        const vacated = b.point ? slotOf(b) : null;
        if (vacated) vacated.forName = b.name;
        assignActing(b, slot);
        if (vacated) markVacant(vacated);   // 原座位當日關閉，由同職務其他同事分擔
        return;
      }
    }
    // 3) 鄰近分行支援
    if (cfg().dispatch && DISPATCH_OK.includes(slot.role)) { createTemp(slot, urgent); return; }
    markVacant(slot);
  }

  function markVacant(slot) {
    const D = C().S.D;
    D.roster.vacant.push(slot.point ? slot.point.label : roleLabel(slot.role));
    C().log('排班', `${slot.forName} 的${slot.point ? slot.point.label : roleLabel(slot.role) + '職務'}今日無人代班${slot.point ? '，暫停服務' : ''}`);
  }

  function assignActing(b, slot) {
    const D = C().S.D;
    b.base = { role: b.role, station: b.station, point: b.point, vaultIdx: b.vaultIdx, roleIdx: b.roleIdx, noDesk: b.noDesk };
    if (b.point) b.point.staff = null;
    Object.assign(b, { role: slot.role, station: slot.station, point: slot.point, vaultIdx: slot.vaultIdx || 0, roleIdx: slot.roleIdx || 0, noDesk: false });
    if (slot.point) slot.point.staff = b;
    C().resetDaily(b);
    b.acting = slot.forName;
    D.roster.subs.push(b); D.stats.subs = (D.stats.subs || 0) + 1;
    C().log('排班', `${b.name}（${roleLabel(b.base.role)}）代理 ${slot.forName} 的${slot.point ? slot.point.label : roleLabel(slot.role)}職務`);
  }

  function createTemp(slot, urgent) {
    const S = C().S, D = S.D;
    const used = new Set(S.staff.map((x) => x.name));
    const name = TEMP_NAMES.find((n) => !used.has(n)) || '支援人員';
    const role = slot.role;
    const t = C().mkAgent({
      kind: 'staff', role, name, temp: true, color: ABX.ROLES[role].color, roleIdx: slot.roleIdx || 0, staffIdx: -1,
      state: 'home', label: '未到班', cash: 0, dir: Math.PI / 2, look: ABX.People.staffLook(name, role), level: 'regular', trait: '鄰近分行支援',
      lockerIdx: 14, loungeIdx: 11, station: slot.station, point: slot.point, vaultIdx: slot.vaultIdx || 0, acting: slot.forName,
    });
    if (slot.point) slot.point.staff = t;
    S.staff.push(t);
    C().resetDaily(t);
    t.didMeeting = true;
    if (urgent) t.arriveAt = C().tod() + C().R(45, 75) * 60;
    D.roster.temps.push(t); D.stats.subs = (D.stats.subs || 0) + 1;
    C().log('排班', `鄰近分行派員 ${name} 支援${slot.point ? slot.point.label : roleLabel(role)}（代 ${slot.forName}）${urgent ? '，約 1 小時後到班' : ''}`);
  }

  /* ---------- 狀態快照（供排班表顯示過去日期） ---------- */
  function cellOf(a, d) {
    const S = C().S;
    if (!C().hoursOf(d % 7).open) return { k: 'closed', text: '店休' };
    if (d === S.D.d) {
      if (a.temp) return { k: 'temp', text: '支援', note: '代 ' + a.acting };
      if (a.offDay) return { k: 'off', text: '休' };
      if (a.leave) return { k: 'leave', text: a.leave.type + (a.leave.part !== 'full' ? PARTS[a.leave.part].slice(0, 1) : ''), note: a.leave.random ? '臨時告假' : PARTS[a.leave.part] };
      if (a.acting) return { k: 'sub', text: '代班', note: `代 ${a.acting}（${roleLabel(a.role)}）` };
      if (a.callIn) return { k: 'callin', text: '調班', note: '週六輪休調班' };
      return { k: 'work', text: '班' };
    }
    if (d < S.D.d) {
      const hst = S.rosterHist[d];
      return (hst && hst[a.name]) || { k: 'none', text: '' };
    }
    if (a.temp) return { k: 'none', text: '' };
    if (!worksDay(a, d)) return { k: 'off', text: '休' };
    const lv = leaveOf(a.name, d);
    if (lv) return { k: 'leave', text: lv.type + (lv.part !== 'full' ? PARTS[lv.part].slice(0, 1) : ''), note: PARTS[lv.part] };
    return { k: 'work', text: '班' };
  }
  function snapshot(d) {
    const S = C().S;
    S.rosterHist[d] = {};
    for (const a of S.staff) S.rosterHist[d][a.name] = cellOf(a, d);
    const keys = Object.keys(S.rosterHist).map(Number).sort((x, y) => x - y);
    while (keys.length > 21) delete S.rosterHist[keys.shift()];
  }

  function weekView() {
    const S = C().S, d = S.D.d, d0 = d - (d % 7);
    const days = Array.from({ length: 7 }, (_, i) => d0 + i);
    const names = new Set();
    const rows = [];
    for (const a of S.staff) {
      names.add(a.name);
      rows.push({ a, name: a.name, role: a.base ? a.base.role : a.role, temp: !!a.temp, cells: days.map((x) => cellOf(a, x)) });
    }
    for (const x of days) {   // 過去的支援人員
      const hst = S.rosterHist[x];
      if (!hst || x >= d) continue;
      for (const [n, cell] of Object.entries(hst)) {
        if (names.has(n) || cell.k !== 'temp') continue;
        names.add(n);
        rows.push({ a: null, name: n, role: '', temp: true, cells: days.map((y) => (S.rosterHist[y] && S.rosterHist[y][n]) || { k: 'none', text: '' }) });
      }
    }
    return { days, today: d, rows };
  }

  /* ---------- 從模擬頁調整假單 ---------- */
  function setLeave(name, day, type, part) {
    const S = C().S, D = S.D, d = day - 1;
    if (d < D.d) return '無法修改過去的日期';
    S.leaves = (S.leaves || []).filter((l) => !(l.name === name && +l.day === day));
    const lv = type ? { name, day, type, part: part || 'full' } : null;
    if (lv) S.leaves.push(lv);
    if (d > D.d) return '';
    // 今天：立即生效
    const a = S.staff.find((x) => x.name === name && !x.temp);
    if (!a) return '';
    if (!lv) {
      if (a.leave && a.state === 'home' && !a.arrivedToday && !a.offDay) {
        a.leave = null; a.absent = false; a.leaveAt = null;
        C().log('排班', `${name} 取消請假，照常上班`);
      } else if (a.leave) return '已請假離開，無法取消';
      snapshot(d); return '';
    }
    if (a.offDay) return '當天排休，不需請假';
    a.leave = lv;
    D.stats.leaves = (D.stats.leaves || 0) + 1;
    const h = D.h, mid = midday(h), t = C().tod();
    if (a.state === 'home' && !a.arrivedToday) {
      if (lv.part === 'am') { a.arriveAt = Math.max(a.arriveAt, mid); a.didMeeting = true; }
      else if (lv.part === 'pm') a.leaveAt = mid;
      else {
        a.absent = true;
        C().log('排班', `${name}（${roleLabel(a.role)}）臨時請${lv.type}`);
        if (cfg().substitute) coverSlot(slotOf(a), 0, t >= a.arriveAt - 1800);
      }
    } else if (a.state !== 'home') {
      if (lv.part === 'am') return '已到班，上午假無法套用';
      a.leaveAt = lv.part === 'pm' ? Math.max(t, mid) : t;
      C().log('排班', `${name}（${roleLabel(a.role)}）臨時請${lv.type}${lv.part === 'pm' ? '（下午）' : ''}`);
      if (lv.part === 'full' && cfg().substitute && cfg().dispatch && DISPATCH_OK.includes(a.role) && t < h.last) createTemp(slotOf(a), true);
    } else return '已下班';
    snapshot(d);
    return '';
  }

  function todaySummary() {
    const S = C().S, D = S.D;
    const sched = S.staff.filter((a) => !a.temp && a.scheduled && !a.offDay);
    return {
      scheduled: sched.length,
      onLeave: S.staff.filter((a) => a.leave && !a.temp).length,
      present: S.staff.filter((a) => a.state !== 'home').length,
      subs: (D.roster && D.roster.subs.length) || 0,
      callIns: (D.roster && D.roster.callIns.length) || 0,
      temps: S.staff.filter((a) => a.temp).length,
      vacant: (D.roster && D.roster.vacant) || [],
      off: S.staff.filter((a) => a.offDay && !a.temp).length,
    };
  }

  ABX.Roster = { LEAVE_TYPES, PARTS, COVER, restore, planDay, weekView, setLeave, todaySummary, worksDay };
})();
