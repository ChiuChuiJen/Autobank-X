/* Autobank-X — 主畫面控制 */
(function () {
  const ABX = window.ABX;
  const { WD, ROLES, fmtHM, fmtHMS, fmtDur, fmtMoney, parseHM, parseTimes } = ABX;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PREF_KEY = 'autobankx.ui.v1';
  const SPEEDS = [1, 5, 30, 60, 180, 600];
  const FLOOR_ORDER = [1, 2, 3, -1];
  const POINT_GROUPS = [
    ['counter', '1F 櫃台'], ['digital', '1F 數位服務區'], ['advisor', '2F 理財'], ['loan', '2F 貸款'],
    ['corporate', '2F 企業金融'], ['vip', '2F 貴賓理財室'], ['safebox', 'B1 保管箱室'],
  ];

  let settings = ABX.loadSettings();
  const rawSettings = () => { try { return localStorage.getItem(ABX.SETTINGS_KEY) || ''; } catch (e) { return ''; } };
  let knownRaw = rawSettings();
  let running = false;
  let speed = +settings.sim.defaultSpeed || 1;
  let floorView = 'all';
  let pendingSettings = null;
  const UI = (ABX.UI = { showLabels: settings.sim.showLabels !== false, sound: !!settings.sim.sound, voice: !!settings.sim.voice, view: '25' });

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      if (p.speed) speed = p.speed;
      if (p.floorView) floorView = p.floorView;
      for (const k of ['showLabels', 'sound', 'voice', 'view']) if (k in p) UI[k] = p[k];
    } catch (e) { /* ignore */ }
  }
  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ speed, floorView, showLabels: UI.showLabels, sound: UI.sound, voice: UI.voice, view: UI.view })); } catch (e) { /* ignore */ }
  }

  /* ---------- 初始化 ---------- */
  function start() {
    ABX.Sim.reset(settings);
    $('bankName').textContent = settings.bank.name;
    $('branchName').textContent = settings.bank.branch;
    document.title = settings.bank.branch + '｜銀行模擬';
    buildFloors();
    buildLegend();
    buildStaffFilter();
    lastDay = -1; lastLogSeq = -1; lastReports = -1;
    updateUI(true);
  }

  function buildFloors() {
    const tabs = $('floorTabs'), grid = $('floorGrid');
    ABX.Render.detachAll();
    grid.innerHTML = '';
    const opts = [['all', '全部樓層']].concat(FLOOR_ORDER.map((f) => [String(f), ABX.Layout.FLOOR_NAME[f]]));
    tabs.innerHTML = opts.map(([k, n]) => `<button role="tab" class="tab${floorView === k ? ' active' : ''}" data-k="${k}">${n}${k !== 'all' ? ` <span class="tab-badge" data-badge="${k}">0</span>` : ''}</button>`).join('');
    tabs.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      setFloorView(b.dataset.k);
    };
    for (const f of FLOOR_ORDER) {
      const card = document.createElement('div');
      card.className = 'floor-card'; card.dataset.floor = f;
      card.innerHTML = `<div class="floor-title"><span class="fl-tag">${ABX.Layout.FLOOR_SHORT[f]}</span><span class="fl-name">${ABX.Layout.FLOOR_NAME[f].replace(/^\S+\s/, '')}</span><span class="fl-count" data-count></span></div><div class="canvas-wrap"><canvas></canvas></div>`;
      grid.appendChild(card);
      ABX.Render.attach(card.querySelector('canvas'), f);
    }
    applyFloorView();
  }
  function setFloorView(k) {
    floorView = k; savePrefs();
    document.querySelectorAll('#floorTabs .tab').forEach((x) => x.classList.toggle('active', x.dataset.k === k));
    applyFloorView();
  }
  function applyFloorView() {
    const grid = $('floorGrid');
    grid.classList.toggle('single', floorView !== 'all');
    grid.querySelectorAll('.floor-card').forEach((c) => { c.hidden = floorView !== 'all' && c.dataset.floor !== floorView; });
  }

  function buildLegend() {
    const P = ABX.People;
    const roles = Object.entries(ROLES).filter(([k]) => ABX.S.staff.some((a) => a.role === k));
    const img = (look) => `<img src="${P.icon(look)}" alt="" width="26" height="26">`;
    const staffIcons = roles.map(([k, r]) => `<span class="lg">${img(ABX.S.staff.find((x) => x.role === k).look)}${r.label}</span>`).join('');
    const personaIcons = P.PERSONAS.map((p) => {
      const look = { skin: '#efc6a6', hair: p.grey ? '#d6d3d1' : '#231a15', hairStyle: 0, outfit: p.outfits[0], trim: '#f8fafc', acc: p.acc };
      return `<span class="lg">${img(look)}${p.label}</span>`;
    }).join('');
    $('legend').innerHTML =
      `<div class="lg-group"><span class="lg-title">員工</span><div class="lg-items">${staffIcons}<span class="lg">${img(P.staffLook('運鈔', 'crew'))}運鈔人員</span></div></div>` +
      `<div class="lg-group"><span class="lg-title">客戶</span><div class="lg-items">${personaIcons}</div></div>` +
      `<div class="lg-group"><span class="lg-title">號碼牌</span><div class="lg-items">` + settings.services.map((s) => `<span class="lg"><i class="tag" style="background:${s.color}">${s.code}</i>${esc(s.name)}</span>`).join('') +
      `<span class="lg"><i class="bub">…</i>有點不耐</span><span class="lg"><i class="bub bad">!</i>快失去耐心</span></div></div>`;
  }

  function buildStaffFilter() {
    const sel = $('staffRole'), v = sel.value;
    const roles = Object.entries(ROLES).filter(([k]) => ABX.S.staff.some((a) => a.role === k));
    sel.innerHTML = '<option value="">全部職務</option>' + roles.map(([k, r]) => `<option value="${k}">${r.label}</option>`).join('');
    sel.value = roles.some(([k]) => k === v) ? v : '';
  }

  /* ---------- 主迴圈 ---------- */
  let last = performance.now(), lastUI = 0;
  function frame(nowT) {
    const dt = Math.min(0.25, (nowT - last) / 1000);
    last = nowT;
    if (running) ABX.Sim.advance(dt * speed);
    ABX.Render.draw();
    if (nowT - lastUI > 250) { lastUI = nowT; updateUI(); }
    requestAnimationFrame(frame);
  }

  /* ---------- 介面更新 ---------- */
  let lastDay = -1, lastLogSeq = -1, lastReports = -1;
  function updateUI(force) {
    const S = ABX.S, ph = ABX.Sim.phaseInfo();
    $('dateLabel').textContent = `Day ${ph.d + 1}`;
    $('weekLabel').textContent = '星期' + WD[ph.wd];
    $('timeLabel').textContent = fmtHMS(ph.tod);
    $('boardClock').textContent = fmtHM(ph.tod);
    const chip = $('phaseChip');
    chip.textContent = ph.text; chip.className = 'chip ' + ph.key;
    if (ph.d !== lastDay || force) { lastDay = ph.d; buildTimeline(ph); }
    $('nowMarker').style.left = (ph.tod / 864) + '%';
    updateKpis();
    updateBoard();
    updatePoints();
    updateStats();
    updateDocs();
    updateIncidents();
    updateRoster();
    UI.refreshStaff();
    if (S.logSeq !== lastLogSeq || force) { lastLogSeq = S.logSeq; renderLog(); }
    if (S.reports.length !== lastReports || force) { lastReports = S.reports.length; renderReports(); }
    for (const f of FLOOR_ORDER) {
      const st = S.agents.filter((a) => a.floor === f && a.kind === 'staff' && !a.transfer).length;
      const cu = S.agents.filter((a) => a.floor === f && a.kind === 'customer' && !a.transfer).length;
      const card = document.querySelector(`.floor-card[data-floor="${f}"] [data-count]`);
      if (card) card.innerHTML = `<b>${st}</b> 員工　<b>${cu}</b> 客戶`;
      const badge = document.querySelector(`[data-badge="${f}"]`);
      if (badge) {
        badge.textContent = st + cu; badge.classList.toggle('zero', st + cu === 0);
        badge.classList.toggle('alert', (S.incidents || []).some((i) => i.status === 'active' && i.floor === f));
      }
    }
  }

  function updateKpis() {
    const S = ABX.S, st = S.D.stats;
    const waiting = S.D.tickets.filter((t) => t.status === 'waiting').length;
    const present = S.staff.filter((a) => a.state !== 'home').length;
    const openPts = S.points.filter((p) => p.open || p.current).length;
    const pendingDocs = S.docs.filter((d) => !d.inbound && !['已送達總行', '已歸檔'].includes(d.stage)).length;
    const avg = st.waitN ? st.waitSum / st.waitN : 0;
    const lost = st.abandoned + st.turnedAway;
    const tiles = [
      ['店內客戶', ABX.Sim.customersInside(), `今日來客 ${st.arrived}`, ''],
      ['等候叫號', waiting, `開放窗口 ${openPts} / ${S.points.length}`, waiting > 15 ? 'warn' : ''],
      ['完成服務', st.served, st.arrived ? `完成率 ${Math.round((st.served / st.arrived) * 100)}%` : '尚無來客', 'good'],
      ['平均等候', avg ? Math.round(avg / 60) + ' 分' : '—', st.waitMax ? `最長 ${Math.round(st.waitMax / 60)} 分` : '—', avg > 900 ? 'warn' : ''],
      ['放棄離開', lost, `ATM 交易 ${st.atm}`, lost > 10 ? 'bad' : ''],
      ['在班員工', `${present}/${ABX.Roster.todaySummary().scheduled + ABX.Roster.todaySummary().temps}`, `請假 ${ABX.Roster.todaySummary().onLeave}・代班 ${(st.subs || 0)}`, ABX.Roster.todaySummary().vacant.length ? 'warn' : ''],
      ['待送文件', pendingDocs, `已送總行 ${st.docsDelivered}`, ''],
      ['臨時事件', ABX.Incidents.active().length, `今日 ${st.incidents} 件・排除 ${st.incResolved}`, ABX.Incidents.active().length ? 'bad' : ''],
      ['金庫庫存', (S.vaultCash / 10000).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' 萬', S.D.vaultOpen ? '金庫開啟中' : '金庫封閉', ''],
    ];
    $('kpis').innerHTML = tiles.map(([k, v, sub, cls]) => `<div class="kpi ${cls}"><span class="k">${k}</span><b>${v}</b><small>${sub}</small></div>`).join('');
  }

  function buildTimeline(ph) {
    const h = ph.h, sr = settings.staffRules, el = $('timeline');
    const pct = (s) => (s / 864).toFixed(3) + '%';
    const seg = (a, b, cls, label) => `<div class="seg ${cls}" style="left:${pct(a)};width:${pct(b - a)}" title="${label} ${fmtHM(a)}～${fmtHM(b)}"><span>${label}</span></div>`;
    let html = '';
    if (h.open) {
      const arrive = h.start - Math.max(+sr.arriveBefore, +sr.securityArriveBefore, +sr.cleanerArriveBefore) * 60;
      html += seg(arrive, h.start, 'prep', '到班準備');
      html += seg(h.start, h.last, 'open', '營業收件');
      html += seg(h.last, h.end, 'closing', '盤點作業');
      const ls = parseHM(sr.lunchStart), le = parseHM(sr.lunchEnd);
      if (h.last >= le) html += `<div class="seg lunch" style="left:${pct(ls)};width:${pct(le - ls)}" title="輪流午休 ${sr.lunchStart}～${sr.lunchEnd}"></div>`;
      const sat = ph.wd === 5;
      for (const t of parseTimes(sat ? settings.courier.dispatchSaturday : settings.courier.dispatchWeekday))
        html += `<div class="tick doc" style="left:${pct(t)}" title="送件 ${fmtHM(t)}"></div>`;
      for (const t of parseTimes(sat ? settings.cash.transportSaturday : settings.cash.transportWeekday))
        html += `<div class="tick cash" style="left:${pct(t)}" title="運鈔 ${fmtHM(t)}"></div>`;
      $('timelineInfo').innerHTML = `營業 ${fmtHM(h.start)}～${fmtHM(h.last)}，${fmtHM(h.last)} 後不接新客・盤點至 ${fmtHM(h.end)}　<i class="key doc"></i>送件　<i class="key cash"></i>運鈔　<i class="key lunch"></i>午休`;
    } else {
      html += seg(0, 86400, 'holiday', '休假日（ATM 24 小時服務）');
      $('timelineInfo').textContent = '今日休假，分行不營業';
    }
    html += '<div id="nowMarker" class="now-marker"></div>';
    el.innerHTML = html;
  }

  function updateBoard() {
    const D = ABX.S.D;
    const c = D.calls[0];
    $('boardNow').innerHTML = c
      ? `<span class="no">${c.no}</span><span class="arrow">▶</span><span class="to">${esc(c.label)}</span>`
      : '<span class="idle">等候叫號中</span>';
    $('boardList').innerHTML = D.calls.slice(1, 9).map((x) => `<div><b>${x.no}</b><span>${esc(x.label)}</span></div>`).join('');
    $('queueSummary').innerHTML = settings.services.map((s) => {
      const w = D.tickets.filter((t) => t.code === s.code && t.status === 'waiting').length;
      return `<div class="q${w ? '' : ' none'}"><i style="background:${s.color}">${s.code}</i><span>${esc(s.name)}</span><b>${w}</b></div>`;
    }).join('');
  }

  function pointState(p) {
    const a = p.staff;
    if (p.current) return [p.current.status === 'serving' ? '服務中' : '叫號中', 'busy', p.current.no];
    if (p.open) return ['可服務', 'ok', ''];
    if (a && a.label === '午休用餐') return ['午休', 'off', ''];
    if (a && a.closing) return [a.closingDone ? '已結帳' : '盤點中', 'closing', ''];
    if (a && a.state !== 'duty') return ['未在班', 'off', ''];
    return ['暫停', 'off', ''];
  }

  function updatePoints() {
    const S = ABX.S;
    $('points').innerHTML = POINT_GROUPS.map(([kind, title]) => {
      const pts = S.points.filter((p) => p.kind === kind);
      if (!pts.length) return '';
      return `<div class="pt-group"><div class="pt-title">${title}</div>` + pts.map((p) => {
        const [st, cls, no] = pointState(p);
        return `<div class="pt ${cls}"><span class="pl">${esc(p.label)}</span><span class="ps">${esc(p.staff ? p.staff.name : '—')}<em>${p.services.join('')}</em></span><span class="pst">${no ? `<b>${no}</b>` : ''}${st}</span></div>`;
      }).join('') + '</div>';
    }).join('');
  }

  function updateStats() {
    const S = ABX.S, D = S.D, st = D.stats;
    const rows = settings.services.map((s) => {
      const issued = D.seq[s.code] || 0, done = st.svc[s.code] || 0;
      const wait = D.tickets.filter((t) => t.code === s.code && t.status === 'waiting').length;
      const pct = issued ? Math.round((done / issued) * 100) : 0;
      return `<tr><td><i class="tag" style="background:${s.color}">${s.code}</i>${esc(s.name)}</td><td>${issued}</td><td>${wait}</td><td>${done}</td><td><div class="bar"><i style="width:${pct}%;background:${s.color}"></i></div></td></tr>`;
    }).join('');
    const items = [
      ['臨櫃存入', fmtMoney(st.cashIn)], ['臨櫃提領', fmtMoney(st.cashOut)],
      ['過號', st.noshow], ['停止取號後到店', st.turnedAway],
      ['帳差查核', st.discrepancies], ['運鈔次數', st.cashTransport],
      ['送件趟數', st.trips], ['總行來文', st.inbound],
    ];
    $('stats').innerHTML = `<table class="svc-table"><thead><tr><th>業務</th><th>取號</th><th>等候</th><th>完成</th><th>進度</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<div class="mini-stats">${items.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
  }

  const STAGES = ['櫃檯待收', '內部傳遞', '後勤審核', '主管核章', '待送總行', '送件途中', '已送達總行'];
  function updateDocs() {
    const S = ABX.S;
    const cnt = (st) => S.docs.filter((d) => d.stage === st && !d.inbound).length;
    $('pipeline').innerHTML = `<div class="stages">${STAGES.map((st, i) => `<div class="stage${cnt(st) ? ' has' : ''}"><span class="n">${i + 1}</span><b>${cnt(st)}</b><span>${st}</span></div>`).join('')}</div>` +
      `<div class="inbound">總行來文待核閱 <b>${S.docs.filter((d) => d.stage === '總行來文').length}</b>・已歸檔 <b>${S.docs.filter((d) => d.stage === '已歸檔').length}</b></div>`;
    const recent = S.docs.slice(-10).reverse();
    $('docList').innerHTML = recent.map((d) => `<div><span class="id">#${d.id}</span><span class="nm">${esc(d.name)}<small>${esc(d.from || '')}</small></span><span class="sg">${d.stage}</span></div>`).join('') || '<div class="muted">尚無文件</div>';
  }

  /* ---------- 臨時事件 ---------- */
  const SEV_CLASS = { low: 'sev-low', mid: 'sev-mid', high: 'sev-high' };
  function incCard(inc) {
    const I = ABX.Incidents, S = ABX.S;
    const steps = inc.steps.map((st, i) => {
      const cls = st.done ? 'done' : i === inc.cur ? 'now' : '';
      let who = '';
      if (st.done) who = st.by ? `${esc(st.by)}・${fmtHM(st.doneAt % 86400)}` : fmtHM(st.doneAt % 86400);
      else if (i === inc.cur) {
        if (st.roles) who = st.assignee ? `${esc(st.assignee.name)} 處理中` : '等待人員接手（' + st.roles.map((r) => ROLES[r].label).join('／') + '）';
        else if (st.timer) who = `約 ${Math.max(0, Math.ceil((st.until - S.t) / 60))} 分鐘`;
        else if (st.ext) who = st.spawned ? `${I.WHO[st.ext.who].name}處理中` : `${I.WHO[st.ext.who].name}約 ${Math.max(0, Math.ceil((st.arriveAt - S.t) / 60))} 分鐘到場`;
      }
      return `<li class="${cls}"><span class="st">${esc(st.label)}</span><span class="who">${who}</span></li>`;
    }).join('');
    return `<div class="inc ${SEV_CLASS[inc.sev]}" data-floor="${inc.floor}">
      <div class="inc-head"><span class="sev">${I.SEV[inc.sev]}</span><b>${esc(inc.name)}</b>${inc.drill ? '<span class="drill-tag">演練</span>' : ''}<span class="inc-loc">${ABX.Layout.FLOOR_SHORT[inc.floor]}</span><span class="inc-time">${fmtDur(S.t - inc.startedAt)}</span></div>
      <div class="inc-detail">${esc(inc.detail)}</div><ol class="steps">${steps}</ol></div>`;
  }
  function updateIncidents() {
    const S = ABX.S, list = S.incidents || [];
    const act = list.filter((i) => i.status === 'active');
    $('incBadge').textContent = act.length || '';
    $('incBadge').classList.toggle('alert', act.length > 0);
    const html = act.length ? act.map(incCard).join('') : '<div class="inc-empty">目前沒有臨時事件，分行運作正常。</div>';
    if ($('incActive')._html !== html) { $('incActive').innerHTML = html; $('incActive')._html = html; }
    const today = Math.floor(S.t / 86400);
    const done = list.filter((i) => i.status === 'resolved' && Math.floor(i.resolvedAt / 86400) === today);
    const dh = done.length ? done.map((i) => `<div><span class="t">${fmtHM(i.startedAt % 86400)}</span><span class="sev-dot ${SEV_CLASS[i.sev]}"></span><span class="nm">${esc(i.name)}</span><span class="dur">${Math.round((i.resolvedAt - i.startedAt) / 60)} 分</span></div>`).join('') : '<div class="muted">尚無</div>';
    if ($('incDone')._html !== dh) { $('incDone').innerHTML = dh; $('incDone')._html = dh; }
  }
  function buildDrill() {
    const D = ABX.Incidents.DEFS;
    $('drillType').innerHTML = Object.entries(D).map(([k, d]) => `<option value="${k}">${d.name}</option>`).join('');
  }
  function toast(html, cls, floor) {
    const box = $('toasts');
    const el = document.createElement('button');
    el.className = 'toast-card ' + (cls || '');
    el.innerHTML = html;
    el.onclick = () => { if (floor !== undefined) setFloorView(String(floor)); el.remove(); };
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => el.remove(), 7000);
  }
  ABX.onIncident = function (inc, kind) {
    if (kind === 'new') toast(`<b>${esc(inc.name)}</b><span>${esc(inc.detail)}</span><small>${ABX.Layout.FLOOR_SHORT[inc.floor]}・點此查看樓層</small>`, 'new ' + SEV_CLASS[inc.sev], inc.floor);
    else toast(`<b>已排除：${esc(inc.name)}</b><small>處理 ${Math.round((inc.resolvedAt - inc.startedAt) / 60)} 分鐘</small>`, 'ok');
  };

  /* ---------- 排班表 ---------- */
  let rosterKey = '';
  function updateRoster() {
    const R = ABX.Roster, sum = R.todaySummary(), w = R.weekView();
    $('rosterBadge').textContent = sum.onLeave ? '假 ' + sum.onLeave : '';
    $('rosterSummary').innerHTML = [
      ['今日應到', sum.scheduled], ['在班', ABX.S.staff.filter((a) => a.state !== 'home').length], ['請假', sum.onLeave], ['排休', sum.off],
      ['代班', sum.subs], ['調班', sum.callIns], ['支援', sum.temps],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('') +
      (sum.vacant.length ? `<div class="vacant"><span>無人代班</span><b>${sum.vacant.map(esc).join('、')}</b></div>` : '');
    const key = JSON.stringify([w.today, w.rows.map((r) => [r.name, r.cells.map((c) => c.k + c.text)])]);
    if (key === rosterKey) return;
    rosterKey = key;
    const head = `<thead><tr><th>員工</th>${w.days.map((d) => `<th class="${d === w.today ? 'today' : ''}">Day ${d + 1}<small>星期${WD[d % 7]}</small></th>`).join('')}</tr></thead>`;
    const body = w.rows.map((r) => `<tr><td class="nm">${esc(r.name)}<small>${r.role ? ROLES[r.role].label : '支援'}</small></td>` +
      r.cells.map((c, i) => {
        const d = w.days[i], editable = !r.temp && d >= w.today && c.k !== 'closed' && c.k !== 'off' && c.k !== 'none';
        return `<td class="${d === w.today ? 'today' : ''}"><button class="rc ${c.k}${editable ? ' edit' : ''}" ${editable ? `data-name="${esc(r.name)}" data-day="${d + 1}"` : 'disabled'} title="${esc(c.note || '')}">${esc(c.text || '')}</button></td>`;
      }).join('') + '</tr>').join('');
    $('rosterTable').innerHTML = head + '<tbody>' + body + '</tbody>';
  }
  function openLeaveMenu(btn) {
    const menu = $('leaveMenu'), name = btn.dataset.name, day = +btn.dataset.day;
    const opts = [['', '', '上班（取消請假）']];
    for (const t of ['特休', '病假', '事假', '公假']) opts.push([t, 'full', t + '（全天）']);
    opts.push(['特休', 'am', '特休（上午）'], ['特休', 'pm', '特休（下午）'], ['事假', 'am', '事假（上午）'], ['事假', 'pm', '事假（下午）']);
    menu.innerHTML = `<div class="lm-head">${esc(name)}・Day ${day}</div>` + opts.map(([t, p, l]) => `<button data-type="${t}" data-part="${p}">${l}</button>`).join('') + '<div class="lm-msg"></div>';
    const pane = btn.closest('.tabpane'), r = btn.getBoundingClientRect(), pr = pane.getBoundingClientRect();
    menu.style.left = Math.min(r.left - pr.left, pr.width - 190) + 'px';
    menu.style.top = (r.bottom - pr.top + 4) + 'px';
    menu.hidden = false;
    menu.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const msg = ABX.Roster.setLeave(name, day, b.dataset.type || null, b.dataset.part || 'full');
      if (msg) { menu.querySelector('.lm-msg').textContent = msg; return; }
      menu.hidden = true; rosterKey = ''; updateUI();
    };
  }

  UI.refreshStaff = function () {
    const S = ABX.S;
    const q = $('staffSearch').value.trim(), role = $('staffRole').value, fl = $('staffFloor').value;
    const list = S.staff.filter((a) => {
      if (role && a.role !== role) return false;
      if (fl === 'off') { if (a.state !== 'home' && a.floor !== null) return false; }
      else if (fl === 'leave') { if (!a.leave && !a.offDay) return false; }
      else if (fl && (String(a.floor) !== fl || a.state === 'home')) return false;
      if (q && !(a.name + a.label + ROLES[a.role].label + (a.trait || '')).includes(q)) return false;
      return true;
    });
    const rows = list.map((a) => {
      const loc = a.state === 'home' ? (a.offDay ? '排休' : a.leave && a.leave.part !== 'am' && (a.absent || a.arrivedToday) ? `請假（${a.leave.type}）` : a.arrivedToday ? '已下班' : '未到班') : ABX.Sim.whereOf(a);
      const lv = ABX.People.LEVELS[a.level];
      const tag = a.temp ? `<span class="rtag temp">支援</span>` : a.acting ? `<span class="rtag sub" title="代 ${esc(a.acting)}">代班</span>` : a.callIn ? '<span class="rtag callin">調班</span>' : a.leave ? `<span class="rtag leave">${esc(a.leave.type)}</span>` : '';
      return `<tr data-id="${a.id}" class="${S.highlight === a.id ? 'hl' : ''}${a.state === 'home' ? ' away' : ''}">` +
        `<td><img class="avatar" src="${avatar(a)}" alt="">${esc(a.name)}</td>` +
        `<td>${ROLES[a.role].label}${lv ? `<span class="lv lv-${a.level}">${lv.label}</span>` : ''}${tag}</td>` +
        `<td class="muted">${esc(a.trait || '')}</td><td>${esc(loc)}</td>` +
        `<td>${esc(a.state === 'home' ? '—' : a.label)}${a.overtime && a.state !== 'home' ? ' <em class="ot">加班</em>' : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">沒有符合條件的員工</td></tr>';
    const tb = $('staffTable').tBodies[0];
    if (tb._html !== rows) { tb.innerHTML = rows; tb._html = rows; }
    $('staffCount').textContent = `${S.staff.filter((a) => a.state !== 'home').length}/${S.staff.length}`;
  };
  const avatarCache = new Map();
  function avatar(a) {
    if (!avatarCache.has(a.name + a.role)) avatarCache.set(a.name + a.role, ABX.People.icon(a.look, 22));
    return avatarCache.get(a.name + a.role);
  }

  function renderLog() {
    const f = $('logFilter').value;
    const list = ABX.S.log.filter((l) => !f || l.cat === f).slice(0, 300);
    $('log').innerHTML = list.map((l) => `<div class="lg-row"><span class="t">D${Math.floor(l.t / 86400) + 1} ${fmtHMS(l.t % 86400)}</span><span class="c c-${l.cat}">${l.cat}</span><span class="m">${esc(l.msg)}</span></div>`).join('');
  }

  function renderReports() {
    const R = ABX.S.reports;
    const tb = $('reportTable').tBodies[0];
    if (!R.length) { tb.innerHTML = '<tr><td colspan="18" class="muted">每日 24:00 結算後顯示</td></tr>'; return; }
    tb.innerHTML = R.map((r) => `<tr class="${r.open ? '' : 'away'}"><td>Day ${r.day}（${WD[r.wd]}）${r.open ? '' : ' 休'}</td><td>${r.arrived}</td><td>${r.served}</td><td>${r.abandoned + r.turnedAway}</td><td>${r.waitN ? fmtDur(r.avgWait) : '—'}</td><td>${r.waitMax ? fmtDur(r.waitMax) : '—'}</td><td>${r.atm}</td><td>${r.docsCreated}</td><td>${r.docsDelivered}</td><td>${r.trips}</td><td>${r.cashTransport}</td><td>${r.approvals}</td><td>${r.incidents || 0}</td><td>${r.fraudStopped ? fmtMoney(r.fraudStopped) : '—'}</td><td>${r.leaves || 0}／${r.subs || 0}</td><td>${r.overtime}</td><td>${r.lastLeave === null ? '—' : fmtHM(r.lastLeave % 86400)}</td><td>${fmtMoney(r.vault)}</td></tr>`).join('');
  }

  function exportCsv() {
    const R = ABX.S.reports.slice().reverse();
    const codes = settings.services.map((s) => s.code);
    const head = ['日期', '星期', '營業', '來客', '完成', '放棄', '停止取號未服務', '過號', '平均等候(分)', '最長等候(分)', 'ATM', '產生文件', '送達總行', '送件趟數', '運鈔', '主管授權', '帳差', '臨時事件', '阻詐金額', '客訴', '請假人次', '代班人次', '加班人次', '臨櫃存入', '臨櫃提領', '金庫庫存'].concat(codes.map((c) => '業務' + c));
    const rows = R.map((r) => [r.day, WD[r.wd], r.open ? 'Y' : 'N', r.arrived, r.served, r.abandoned, r.turnedAway, r.noshow, (r.avgWait / 60).toFixed(1), (r.waitMax / 60).toFixed(1), r.atm, r.docsCreated, r.docsDelivered, r.trips, r.cashTransport, r.approvals, r.discrepancies, r.incidents || 0, r.fraudStopped || 0, r.complaints || 0, r.leaves || 0, r.subs || 0, r.overtime, r.cashIn, r.cashOut, Math.round(r.vault)].concat(codes.map((c) => r.svc[c] || 0)));
    const csv = '﻿' + [head].concat(rows).map((x) => x.join(',')).join('\n');
    ABX.showExport('每日營運報表（CSV）', csv, 'autobank-x-report.csv', 'text/csv');
  }

  /* ---------- 叫號音效 ---------- */
  let audio = null, lastBeep = 0;
  ABX.onCall = function (call) {
    if (!running) return;
    const nowT = performance.now();
    if (UI.sound && speed <= 10 && nowT - lastBeep > 700) {
      lastBeep = nowT;
      try {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        [[880, 0], [660, 0.22]].forEach(([f, d]) => {
          const o = audio.createOscillator(), g = audio.createGain();
          o.frequency.value = f; o.type = 'sine';
          g.gain.setValueAtTime(0.0001, audio.currentTime + d);
          g.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + d + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + d + 0.35);
          o.connect(g).connect(audio.destination); o.start(audio.currentTime + d); o.stop(audio.currentTime + d + 0.4);
        });
      } catch (e) { /* 無音效支援 */ }
    }
    if (UI.voice && speed <= 2 && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(`來賓 ${call.no.split('').join(' ')} 號，請到 ${call.label}`);
      u.lang = 'zh-TW'; u.rate = 1;
      window.speechSynthesis.speak(u);
    }
  };

  /* ---------- 控制 ---------- */
  function setRunning(v) {
    running = v;
    const b = $('btnPlay');
    b.textContent = running ? '❚❚ 暫停' : '▶ 開始';
    b.classList.toggle('running', running);
  }

  function jump(sec) {
    const was = running; running = false;
    ABX.Sim.advance(sec, 1);
    running = was;
    updateUI(true);
  }

  function buildSpeed() {
    const list = SPEEDS.includes(speed) ? SPEEDS : SPEEDS.concat(speed).sort((a, b) => a - b);
    $('speedSeg').innerHTML = list.map((v) => `<button role="radio" aria-checked="${v === speed}" class="${v === speed ? 'on' : ''}" data-v="${v}" title="${v === 1 ? '即時（1 秒 = 1 秒）' : `1 秒 = ${v >= 60 ? v / 60 + ' 分' : v + ' 秒'}`}">${v}×</button>`).join('');
  }

  function bindTabs() {
    document.querySelectorAll('.subtabs').forEach((bar) => {
      bar.addEventListener('click', (e) => {
        const b = e.target.closest('.subtab'); if (!b) return;
        const scope = bar.closest('.card');
        bar.querySelectorAll('.subtab').forEach((x) => x.classList.toggle('active', x === b));
        scope.querySelectorAll('.tabpane').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
        scope.querySelectorAll('[data-tools]').forEach((t) => { t.hidden = t.dataset.tools !== b.dataset.tab; });
      });
    });
  }

  function bind() {
    $('btnPlay').onclick = () => setRunning(!running);
    buildSpeed();
    $('speedSeg').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      speed = +b.dataset.v; savePrefs(); buildSpeed();
    };
    $('btnHour').onclick = () => jump(3600);
    $('btnNextDay').onclick = () => {
      const S = ABX.S, d = Math.floor(S.t / 86400);
      const target = (d + 1) * 86400 + parseHM(settings.sim.startTime);
      jump(target - S.t);
    };
    ABX.armConfirm($('btnReset'), '再按一次確認', () => { setRunning(false); start(); });
    bindTabs();
    $('rosterTable').addEventListener('click', (e) => {
      const b = e.target.closest('button.edit'); if (!b) return;
      e.stopPropagation(); openLeaveMenu(b);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('#leaveMenu')) $('leaveMenu').hidden = true; });
    buildDrill();
    $('btnDrill').onclick = () => {
      const msg = ABX.Incidents.trigger($('drillType').value);
      $('drillMsg').textContent = msg || '已觸發';
      updateUI();
    };
    $('logFilter').onchange = renderLog;
    $('btnCsv').onclick = exportCsv;
    for (const id of ['staffSearch', 'staffRole', 'staffFloor']) $(id).addEventListener('input', () => UI.refreshStaff());
    $('staffTable').tBodies[0].onclick = (e) => {
      const tr = e.target.closest('tr'); if (!tr || !tr.dataset.id) return;
      const id = +tr.dataset.id;
      ABX.S.highlight = ABX.S.highlight === id ? null : id;
      const a = ABX.S.staff.find((x) => x.id === id);
      if (ABX.S.highlight && a && a.floor !== null && floorView !== 'all' && String(a.floor) !== floorView) setFloorView(String(a.floor));
      UI.refreshStaff();
    };
    const opt = (id, key) => { const el = $(id); el.checked = !!UI[key]; el.onchange = () => { UI[key] = el.checked; savePrefs(); }; };
    const vs = $('viewSeg');
    const paintView = () => vs.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.v === UI.view); b.setAttribute('aria-checked', b.dataset.v === UI.view); });
    paintView();
    vs.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; UI.view = b.dataset.v; savePrefs(); paintView(); };
    opt('optLabels', 'showLabels'); opt('optSound', 'sound'); opt('optVoice', 'voice');

    // 後台設定變更偵測（storage 事件；file:// 下改於回到頁面時比對）
    const checkSettings = () => {
      const raw = rawSettings();
      if (raw === knownRaw) return;
      knownRaw = raw;
      pendingSettings = ABX.loadSettings();
      $('banner').hidden = false;
    };
    window.addEventListener('storage', (e) => { if (e.key === ABX.SETTINGS_KEY) checkSettings(); });
    window.addEventListener('focus', checkSettings);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkSettings(); });
    $('btnApplyReset').onclick = () => {
      settings = pendingSettings || ABX.loadSettings(); pendingSettings = null; $('banner').hidden = true;
      setRunning(false); start();
    };
    $('btnApplyLive').onclick = () => {
      const s = pendingSettings || ABX.loadSettings(); pendingSettings = null; $('banner').hidden = true;
      s.staff = settings.staff;            // 員工名單需重置才生效
      s.customers.atmCount = settings.customers.atmCount;
      settings = s; ABX.S.settings = s;
      $('bankName').textContent = s.bank.name; $('branchName').textContent = s.bank.branch;
      buildLegend(); updateUI(true);
    };
    $('btnBannerClose').onclick = () => { $('banner').hidden = true; };
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); setRunning(!running); }
    });
  }

  loadPrefs();
  bind();
  start();
  setRunning(false);
  requestAnimationFrame(frame);
})();
