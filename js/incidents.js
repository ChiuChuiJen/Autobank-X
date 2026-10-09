/* Autobank-X — 臨時事件與排除動作
 * 每個事件 = 發生時的影響（start/end）＋ 依序執行的排除步驟。
 * 步驟類型：
 *   roles  由指定職務的員工前往現場處理（依順序優先，逾 90 秒無人接手則開放給後面的職務）
 *   timer  等待外部處理（資訊處搶修、台電復電…）
 *   ext    外部人員到場（維修廠商、救護人員、員警、水電師傅）
 */
(function () {
  const ABX = window.ABX;
  const C = () => ABX.SimCore;
  const SEV = { low: '輕微', mid: '中度', high: '嚴重' };

  /* 外部人員 */
  const WHO = {
    tech:      { name: '維修工程師', vehicle: 'van' },
    paramedic: { name: '救護人員',   vehicle: 'ambulance' },
    police:    { name: '轄區員警',   vehicle: 'police' },
    plumber:   { name: '水電師傅',   vehicle: 'van' },
  };

  const behind = (pt) => ({ floor: pt.staffSpot.floor, x: pt.staffSpot.x + 18, y: pt.staffSpot.y - 12, face: Math.PI / 2 });
  const beside = (s, dx = 18, dy = 0) => ({ floor: s.floor, x: s.x + dx, y: s.y + dy });

  /* ---------- 事件定義 ---------- */
  const DEFS = {
    atm: {
      name: 'ATM 故障', sev: 'mid', mode: 'rate', unit: '次／日',
      who: '大堂經理檢查 → 通報廠商 → 工程師維修',
      make() {
        const L = C().L, m = C().pick(L.atms.filter((x) => !x.broken));
        if (!m) return null;
        return {
          where: m.spot, detail: `ATM ${m.idx + 1} 號機卡鈔，暫停服務`,
          start() { m.broken = true; }, end() { m.broken = false; },
          steps: [
            { label: '檢查 ATM・張貼暫停服務公告', roles: ['guide', 'security'], dur: 180, at: beside(m.spot, 0, 14) },
            { label: '通報 ATM 維修廠商', roles: ['guide', 'supervisor', 'security'], dur: 60, at: 'station' },
            { label: '工程師到場維修', ext: { who: 'tech', count: 1, travel: [20, 40], work: 15, at: beside(m.spot, 0, 14) } },
          ],
        };
      },
    },
    kiosk: {
      name: '叫號機當機', sev: 'low', mode: 'rate', unit: '次／日',
      who: '大堂經理重新開機並人工發號 → 資訊廠商遠端修復',
      make() {
        const L = C().L, S = C().S;
        const steps = [{ label: '重新開機・改為人工發號', roles: ['guide', 'security'], dur: 180, at: beside(L.spots.ticket, 26, 4) }];
        if (C().rnd() < 0.5) steps.push({ label: '資訊廠商遠端修復', timer: [8, 20] });
        steps.push({ label: '測試取號功能', roles: ['guide', 'security'], dur: 40, at: beside(L.spots.ticket, 26, 4) });
        return {
          where: L.spots.ticket, detail: '取號機畫面凍結，客戶改由人工發號',
          start() { S.D.kioskDown = true; }, end() { S.D.kioskDown = false; },
          steps,
        };
      },
    },
    system: {
      name: '核心系統斷線', sev: 'high', mode: 'rate', unit: '次／日',
      who: '廣播安撫 → 後勤通報資訊處 → 搶修 → 主管測試恢復',
      make() {
        const L = C().L, S = C().S;
        return {
          where: L.spots.supDesk, detail: '櫃台系統無法連線，所有窗口暫停交易',
          start() { S.D.sysDown = true; extendPatience(20); }, end() { S.D.sysDown = false; },
          steps: [
            { label: '廣播致歉・安撫等候客戶', roles: ['guide', 'supervisor'], dur: 60, at: beside(L.spots.lobbyA, 0, 40) },
            { label: '通報資訊處・確認影響範圍', roles: ['backoffice', 'supervisor'], dur: 120, at: 'station' },
            { label: '資訊處搶修中', timer: [10, 25] },
            { label: '測試交易・恢復櫃台作業', roles: ['supervisor', 'manager'], dur: 120, at: L.spots.supDesk },
          ],
        };
      },
    },
    power: {
      name: '停電', sev: 'high', mode: 'rate', unit: '次／日',
      who: '保全啟動發電機 → 安撫客戶 → 等待復電 → 檢查設備',
      make() {
        const L = C().L, S = C().S;
        const gen = { floor: -1, x: 670, y: 345 };
        return {
          where: gen, detail: '市電中斷，照明與櫃台系統停擺，ATM 停止服務',
          start() { S.D.powerOut = true; S.D.generator = false; extendPatience(25); },
          end() { S.D.powerOut = false; S.D.generator = false; },
          steps: [
            { label: '至機電室啟動緊急發電機', roles: ['security', 'backoffice', 'manager'], dur: 180, at: gen, onDone() { S.D.generator = true; } },
            { label: '安撫客戶・說明暫停服務', roles: ['guide', 'supervisor'], dur: 90, at: beside(L.spots.lobbyA, 0, 40) },
            { label: '等待台電復電', timer: [10, 30] },
            { label: '檢查設備・恢復營業', roles: ['supervisor', 'security'], dur: 120, at: L.spots.supDesk },
          ],
        };
      },
    },
    medical: {
      name: '客戶身體不適', sev: 'high', mode: 'rate', unit: '次／日',
      who: '大堂經理關懷並通報 119 → 保全取 AED → 救護人員送醫',
      make() {
        const S = C().S;
        const pool = S.agents.filter((c) => c.kind === 'customer' && !c.atm && !c.dead && !c.sick && c.ticket && c.ticket.status === 'waiting' && !c.moving && (c.floor === 1 || c.floor === 2));
        if (!pool.length) return null;
        const c = C().pick(pool);
        const spot = { floor: c.floor, x: c.x, y: c.y };
        return {
          where: spot, patient: c, detail: `${c.persona ? c.persona.label : '客戶'}（${c.ticket.no}）在等候區暈眩倒地`,
          start() {
            c.sick = true; c.ticket.status = 'hold';
            c.tasks = []; c.path = []; c.moving = false;
            c.cur = C().T.until(() => !c.sick, '身體不適・等待救護'); c.cur.t0 = S.t; c.label = '身體不適・等待救護';
          },
          end() {
            if (c.dead) return;
            c.sick = false; c.ticket.status = 'abandoned';
            C().freeSeat(c);
            c.cur = null; c.tasks = [];
            C().now(c, C().T.go({ floor: 1, x: 18, y: 250 }, '由救護人員送醫'), C().T.do(() => { c.dead = true; }));
          },
          steps: [
            { label: '上前關懷・通報 119', roles: ['guide', 'security', 'supervisor'], dur: 90, at: beside(spot, 16, 6) },
            { label: '取 AED 待命・維持現場秩序', roles: ['security', 'guide', 'supervisor'], dur: 120, at: beside(spot, -16, 6) },
            { label: '救護人員到場處置', ext: { who: 'paramedic', count: 2, travel: [6, 12], work: 6, at: beside(spot, 0, 16) } },
          ],
        };
      },
    },
    leak: {
      name: '天花板漏水', sev: 'low', mode: 'rate', unit: '次／日',
      who: '清潔放置警示牌拖地 → 通報物業 → 水電師傅修繕',
      make() {
        const spots = [{ floor: 1, x: 640, y: 375 }, { floor: 1, x: 300, y: 300 }, { floor: 2, x: 480, y: 220 }, { floor: 3, x: 650, y: 210 }];
        const spot = C().pick(spots);
        return {
          where: spot, detail: `${ABX.Layout.FLOOR_SHORT[spot.floor]} 天花板滲水，地面積水`, puddle: true,
          start() {}, end() {},
          steps: [
            { label: '放置小心地滑警示牌・拖地', roles: ['cleaner', 'guide', 'security'], dur: 300, at: beside(spot, 20, 0) },
            { label: '通報大樓物業修繕', roles: ['backoffice', 'supervisor', 'security'], dur: 60, at: 'station' },
            { label: '水電師傅到場修繕', ext: { who: 'plumber', count: 1, travel: [15, 30], work: 20, at: beside(spot, 0, 18) } },
          ],
        };
      },
    },
    alarm: {
      name: '火警警報誤報', sev: 'mid', mode: 'rate', unit: '次／日',
      who: '保全查看受信總機 → 現場確認廣播 → 復歸警報',
      make() {
        const L = C().L, S = C().S;
        const panel = L.spots.monitor;
        return {
          where: panel, detail: '火警受信總機發報，警鈴大作',
          start() { S.D.alarm = true; extendPatience(5); }, end() { S.D.alarm = false; },
          steps: [
            { label: '查看火警受信總機', roles: ['security', 'manager'], dur: 90, at: panel },
            { label: '現場確認無火源・廣播安撫', roles: ['security', 'guide', 'manager'], dur: 150, at: beside(L.spots.lobbyB, -20, 0) },
            { label: '復歸警報・回報大樓物業', roles: ['security', 'manager'], dur: 60, at: panel },
          ],
        };
      },
    },
    fraud: {
      name: '疑似詐騙（阻詐）', sev: 'high', mode: 'trigger', unit: '% 長者大額臨櫃',
      who: '櫃員關懷提問 → 主管協助 → 通報 165 → 員警到場勸阻',
      make(o) {
        const p = o.point;
        const amount = Math.round(C().R(30, 300)) * 10000;
        return {
          where: p.custSpot, point: p, amount, detail: `${p.label} 長者欲提領 ${ABX.fmtMoney(amount)}，疑似遭假檢警詐騙`,
          start() {}, end(inc) { C().S.D.stats.fraudStopped += inc.amount; },
          steps: [
            { label: '主管協助關懷提問', roles: ['supervisor', 'manager'], dur: 240, at: behind(p) },
            { label: '通報 165 反詐騙專線・轄區派出所', roles: ['supervisor', 'manager'], dur: 60, at: behind(p) },
            { label: '員警到場說明・勸阻匯款', ext: { who: 'police', count: 1, travel: [8, 15], work: 10, at: beside(p.custSpot, 24, 4) } },
          ],
        };
      },
    },
    counterfeit: {
      name: '發現偽鈔', sev: 'mid', mode: 'trigger', unit: '% 存款交易',
      who: '櫃員暫扣 → 主管鑑定 → 填寫收繳單',
      make(o) {
        const p = o.point;
        return {
          where: p.custSpot, point: p, detail: `${p.label} 客戶存入款項中發現疑似千元偽鈔`,
          start() {}, end() {},
          steps: [{ label: '紫外燈鑑定偽鈔・會同客戶確認', roles: ['supervisor', 'manager'], dur: 240, at: behind(p) }],
        };
      },
    },
    complaint: {
      name: '客戶客訴', sev: 'low', mode: 'trigger', unit: '% 久候客戶',
      who: '大堂經理致歉 → 主管出面說明 → 安排優先辦理',
      make(o) {
        const L = C().L, c = o.cust;
        const spot = { floor: 1, x: L.spots.guideCust.x + 8, y: L.spots.guideCust.y + 4 };
        return {
          where: spot, cust: c, detail: `${c.persona ? c.persona.label : '客戶'}（${c.ticket.no}）等候 ${Math.round((C().S.t - c.ticket.issuedAt) / 60)} 分鐘，向服務台抱怨`,
          start() {}, end() {},
          steps: [
            { label: '傾聽客訴・致歉', roles: ['guide', 'supervisor', 'security'], dur: 150, at: beside(L.spots.guide, 0, 0) },
            { label: '主管出面說明・安排優先辦理', roles: ['manager', 'supervisor'], dur: 240, at: beside(spot, 24, 0) },
          ],
        };
      },
    },
  };

  const DEFAULT_TYPES = {
    atm: { on: true, rate: 0.6 }, kiosk: { on: true, rate: 0.4 }, system: { on: true, rate: 0.25 }, power: { on: true, rate: 0.08 },
    medical: { on: true, rate: 0.25 }, leak: { on: true, rate: 0.2 }, alarm: { on: true, rate: 0.1 },
    fraud: { on: true, rate: 6 }, counterfeit: { on: true, rate: 1.5 }, complaint: { on: true, rate: 20 },
  };

  function cfg() {
    const s = (C().S.settings.incidents) || {};
    return { enabled: s.enabled !== false, mult: s.multiplier === undefined ? 1 : +s.multiplier, types: Object.assign({}, DEFAULT_TYPES, s.types || {}) };
  }
  function typeOn(key) { const c = cfg(); const t = c.types[key]; return c.enabled && t && t.on !== false; }

  function extendPatience(min) {
    for (const c of C().S.agents) if (c.kind === 'customer' && c.patience) c.patience += min * 60;
  }

  /* ---------- 生命週期 ---------- */
  function create(key, o = {}) {
    const S = C().S, def = DEFS[key];
    const body = def.make(o);
    if (!body) return null;
    const inc = Object.assign({ id: ++S.incSeq, key, name: def.name, sev: def.sev, status: 'active', startedAt: S.t, cur: 0, drill: !!o.drill }, body);
    inc.floor = inc.where.floor;
    inc.steps.forEach((st) => { st.done = false; st.assignee = null; });
    S.incidents.unshift(inc);
    if (S.incidents.length > 60) S.incidents.length = 60;
    S.D.stats.incidents++;
    inc.start(inc);
    C().log('事件', `${o.drill ? '【演練】' : ''}${inc.name}：${inc.detail}`);
    startStep(inc);
    if (ABX.onIncident) ABX.onIncident(inc, 'new');
    return inc;
  }

  function startStep(inc) {
    const S = C().S, st = inc.steps[inc.cur];
    st.t0 = S.t;
    if (st.timer) {
      st.until = S.t + C().R(st.timer[0], st.timer[1]) * 60;
      C().log('事件', `${inc.name}：${st.label}（預估 ${Math.round((st.until - S.t) / 60)} 分鐘）`);
    } else if (st.ext) {
      st.arriveAt = S.t + C().R(st.ext.travel[0], st.ext.travel[1]) * 60;
      C().log('事件', `${inc.name}：已通知${WHO[st.ext.who].name}，預計 ${Math.round((st.arriveAt - S.t) / 60)} 分鐘到場`);
    }
  }

  function completeStep(inc, by) {
    const S = C().S, st = inc.steps[inc.cur];
    if (!st || st.done || inc.status !== 'active') return;
    st.done = true; st.doneAt = S.t; st.by = by || st.by || '';
    if (st.onDone) st.onDone(inc);
    C().log('事件', `${inc.name}：${st.label} 完成${st.by ? `（${st.by}）` : ''}`);
    inc.cur++;
    if (inc.cur >= inc.steps.length) resolve(inc);
    else startStep(inc);
  }

  function resolve(inc) {
    const S = C().S;
    inc.status = 'resolved'; inc.resolvedAt = S.t;
    inc.end(inc);
    S.D.stats.incResolved++;
    C().log('事件', `${inc.name} 已排除（處理 ${Math.round((inc.resolvedAt - inc.startedAt) / 60)} 分鐘）`);
    if (ABX.onIncident) ABX.onIncident(inc, 'resolved');
  }

  /* 員工決策掛勾：有待處理的排除步驟就先去處理 */
  function decide(a) {
    const S = C().S;
    if (a.state !== 'duty' || a.transfer) return false;
    for (const inc of S.incidents) {
      if (inc.status !== 'active') continue;
      const st = inc.steps[inc.cur];
      if (!st || !st.roles || st.assignee) continue;
      const idx = st.roles.indexOf(a.role);
      if (idx < 0) continue;
      if (idx > 0 && S.t - st.t0 < 90) {
        const better = st.roles.slice(0, idx).some((r) => C().staffOf(r).some((x) => x.state === 'duty'));
        if (better) continue;
      }
      st.assignee = a; st.by = a.name;
      const T = C().T;
      const dest = st.at === 'station' ? a.station : st.at;
      C().later(a, T.go(dest, '趕往處理：' + inc.name), T.wait(st.dur, st.label), T.do(() => completeStep(inc, a.name)));
      return true;
    }
    return false;
  }

  /* ---------- 每步更新 ---------- */
  function tick(dt) {
    const S = C().S, D = S.D;
    const h = D.h, t = C().tod();
    // 隨機發生（僅在員工上班時段）
    const c = cfg();
    if (c.enabled && h.open && t >= h.start && t < h.end) {
      const span = Math.max(3600, h.end - h.start);
      for (const [key, def] of Object.entries(DEFS)) {
        if (def.mode !== 'rate') continue;
        const tc = c.types[key];
        if (!tc || tc.on === false) continue;
        if (S.incidents.some((x) => x.key === key && x.status === 'active')) continue;
        if (C().rnd() < (+tc.rate * c.mult * dt) / span) create(key);
      }
    }
    for (const inc of S.incidents) {
      if (inc.status !== 'active') continue;
      const st = inc.steps[inc.cur];
      if (!st) continue;
      if (st.timer && S.t >= st.until) completeStep(inc, '');
      else if (st.ext && !st.spawned && S.t >= st.arriveAt) spawnResponders(inc, st);
    }
  }

  function spawnResponders(inc, st) {
    const { T, mkAgent, later } = C();
    const L = C().L, w = WHO[st.ext.who];
    st.spawned = true;
    st.by = w.name;
    C().log('事件', `${inc.name}：${w.name}抵達分行`);
    for (let i = 0; i < st.ext.count; i++) {
      const v = mkAgent({ kind: 'visitor', role: st.ext.who, name: w.name, vehicle: w.vehicle, look: ABX.People.staffLook(w.name + i, st.ext.who),
        floor: 1, x: L.spots.street.x, y: L.spots.street.y + i * 14, speed: 30, label: '抵達分行' });
      const at = { floor: st.ext.at.floor, x: st.ext.at.x + i * 18, y: st.ext.at.y };
      later(v, T.go(at, '前往現場'), T.wait(st.ext.work * 60, st.label), T.do(() => completeStep(inc, w.name)),
        T.go({ floor: 1, x: L.spots.street.x, y: 250 + i * 14 }, '離開分行'), T.do(() => { v.dead = true; }));
    }
  }

  /* ---------- 臨櫃觸發 ---------- */
  function rollTrigger(key) {
    const S = C().S;
    if (S.forceNext[key]) { S.forceNext[key] = false; return true; }
    if (!typeOn(key)) return false;
    return C().rnd() * 100 < +cfg().types[key].rate * cfg().mult;
  }

  function onServiceStart(a, p, tk, svc) {
    if (a.role !== 'teller') return null;
    const T = C().T, c = tk.cust;
    const S = C().S;
    const elder = c.persona && c.persona.key === 'senior';
    if ((tk.code === 'A' || tk.code === 'B') && (elder || S.forceNext.fraud) && rollTrigger('fraud')) {
      let inc = null;
      c.label = '臨櫃辦理（阻詐關懷中）';
      return {
        noCash: true,
        tasks: [
          T.wait(150, '察覺異常・關懷提問'),
          T.do(() => { inc = create('fraud', { point: p }); if (inc) inc.drill = false; }),
          T.until(() => !inc || inc.status === 'resolved', '阻詐處理中', 7200),
          T.do(() => { if (inc) C().log('事件', `成功攔阻詐騙，保住客戶 ${ABX.fmtMoney(inc.amount)}`); }),
        ],
      };
    }
    if (tk.code === 'A' && rollTrigger('counterfeit')) {
      let inc = null;
      return {
        tasks: [
          T.wait(60, '點鈔發現疑似偽鈔・暫扣'),
          T.do(() => { inc = create('counterfeit', { point: p }); }),
          T.until(() => !inc || inc.status === 'resolved', '等候主管鑑定偽鈔', 3600),
          T.wait(180, '填寫偽鈔收繳單・開立收據'),
          T.do(() => { C().createDoc({ name: '偽鈔收繳單', point: p, from: p.label, review: false }); }),
        ],
      };
    }
    return null;
  }

  function onAbandon(c, tk) {
    if (!rollTrigger('complaint')) return false;
    startComplaint(c, tk);
    return true;
  }

  function startComplaint(c, tk) {
    const { T, now } = C();
    const S = C().S;
    tk.status = 'hold';
    C().freeSeat(c);
    S.D.stats.complaints++;
    const inc = create('complaint', { cust: c });
    if (!inc) return false;
    c.tasks = [];
    now(c, T.go(inc.where, '前往服務台客訴'),
      T.until(() => inc.status === 'resolved', '向服務台客訴', 7200),
      T.do(() => {
        tk.status = 'waiting'; tk.priority = true;
        c.patience = S.t - tk.issuedAt + 30 * 60;
        C().log('事件', `${tk.no} 號安排優先辦理`);
        const st = C().L.stand[1];
        C().waitForCall(c, tk, { floor: 1, x: st.x + C().rnd() * st.w, y: st.y + C().rnd() * st.h, face: -Math.PI / 2 }, '回到等候區（優先辦理）');
      }));
    return true;
  }

  /* 手動觸發（演練） */
  function trigger(key) {
    const S = C().S, def = DEFS[key];
    if (!def) return '未知的事件';
    if (S.incidents.some((x) => x.key === key && x.status === 'active') && def.mode === 'rate') return `「${def.name}」已在處理中`;
    if (key === 'fraud' || key === 'counterfeit') {
      S.forceNext[key] = true;
      return `已排定：下一筆${key === 'fraud' ? '臨櫃存提款／匯款' : '臨櫃存提款'}交易將觸發「${def.name}」`;
    }
    if (key === 'complaint') {
      const pool = S.agents.filter((c) => c.kind === 'customer' && !c.atm && !c.dead && !c.sick && c.ticket && c.ticket.status === 'waiting' && c.floor !== null && !c.transfer);
      if (!pool.length) return '目前沒有等候中的客戶可以觸發客訴';
      const c = C().pick(pool);
      c.cur = null; c.path = []; c.moving = false;
      startComplaint(c, c.ticket);
      return '';
    }
    const inc = create(key, { drill: true });
    return inc ? '' : (key === 'medical' ? '目前沒有等候中的客戶' : '無法觸發此事件');
  }

  ABX.Incidents = { DEFS, SEV, WHO, DEFAULT_TYPES, decide, tick, onServiceStart, onAbandon, trigger, active: () => C().S.incidents.filter((x) => x.status === 'active') };
})();
