/* Autobank-X — 主畫面控制 */
(function () {
  const ABX = window.ABX;
  const { WD, ROLES, fmtHM, fmtHMS, fmtDur, fmtMoney, parseHM, parseTimes } = ABX;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PREF_KEY = 'autobankx.ui.v1';

  let settings = ABX.loadSettings();
  const rawSettings = () => { try { return localStorage.getItem(ABX.SETTINGS_KEY) || ''; } catch (e) { return ''; } };
  let knownRaw = rawSettings();
  let running = false;
  let speed = +settings.sim.defaultSpeed || 1;
  let floorView = 'all';
  let pendingSettings = null;
  const UI = (ABX.UI = { showLabels: settings.sim.showLabels !== false, sound: !!settings.sim.sound, voice: !!settings.sim.voice });

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      if (p.speed) speed = p.speed;
      if (p.floorView) floorView = p.floorView;
      for (const k of ['showLabels', 'sound', 'voice']) if (k in p) UI[k] = p[k];
    } catch (e) { /* ignore */ }
  }
  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ speed, floorView, showLabels: UI.showLabels, sound: UI.sound, voice: UI.voice })); } catch (e) { /* ignore */ }
  }

  /* ---------- 初始化 ---------- */
  function start() {
    ABX.Sim.reset(settings);
    $('bankName').textContent = settings.bank.name;
    $('branchName').textContent = settings.bank.branch;
    document.title = settings.bank.branch + '｜銀行模擬';
    buildFloors();
    buildLegend();
    lastDay = -1; lastLogSeq = -1; lastReports = -1;
    updateUI(true);
  }

  function buildFloors() {
    const tabs = $('floorTabs'), grid = $('floorGrid');
    ABX.Render.detachAll();
    grid.innerHTML = '';
    const order = [1, 2, 3, -1];
    const opts = [['all', '全部樓層']].concat(order.map((f) => [String(f), ABX.Layout.FLOOR_NAME[f]]));
    tabs.innerHTML = opts.map(([k, n]) => `<button role="tab" class="tab${floorView === k ? ' active' : ''}" data-k="${k}">${n}</button>`).join('');
    tabs.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      floorView = b.dataset.k; savePrefs();
      tabs.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
      applyFloorView();
    };
    for (const f of order) {
      const card = document.createElement('div');
      card.className = 'floor-card'; card.dataset.floor = f;
      card.innerHTML = `<div class="floor-title"><span>${ABX.Layout.FLOOR_NAME[f]}</span><span class="muted" data-count></span></div><canvas></canvas>`;
      grid.appendChild(card);
      ABX.Render.attach(card.querySelector('canvas'), f);
    }
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
    const img = (look) => `<img src="${P.icon(look)}" alt="" width="24" height="24">`;
    const staffIcons = roles.map(([k, r]) => {
      const a = ABX.S.staff.find((x) => x.role === k);
      return `<span class="lg">${img(a.look)}${r.label}</span>`;
    }).join('');
    const personaIcons = P.PERSONAS.map((p) => {
      const look = { skin: '#efc6a6', hair: p.grey ? '#d6d3d1' : '#231a15', hairStyle: 0, outfit: p.outfits[0], trim: '#f8fafc', acc: p.acc };
      return `<span class="lg">${img(look)}${p.label}</span>`;
    }).join('');
    $('legend').innerHTML =
      `<div class="lg-row-group"><span class="lg-title">員工</span>${staffIcons}<span class="lg">${img(P.staffLook('運鈔', 'crew'))}運鈔人員</span></div>` +
      `<div class="lg-row-group"><span class="lg-title">客戶</span>${personaIcons}</div>` +
      `<div class="lg-row-group"><span class="lg-title">號碼牌</span>` + settings.services.map((s) => `<span class="lg"><i class="tag" style="background:${s.color}">${s.code}</i>${esc(s.name)}</span>`).join('') +
      `<span class="lg"><i class="bub">…</i>有點不耐</span><span class="lg"><i class="bub bad">!</i>快失去耐心</span></div>`;
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
    $('dateLabel').textContent = `Day ${ph.d + 1}（${WD[ph.wd]}）`;
    $('timeLabel').textContent = fmtHMS(ph.tod);
    const chip = $('phaseChip');
    chip.textContent = ph.text; chip.className = 'chip ' + ph.key;
    if (ph.d !== lastDay || force) { lastDay = ph.d; buildTimeline(ph); }
    $('nowMarker').style.left = (ph.tod / 864) + '%';
    updateBoard();
    updatePoints();
    updateStats(ph);
    updateDocs();
    UI.refreshStaff();
    if (S.logSeq !== lastLogSeq || force) { lastLogSeq = S.logSeq; renderLog(); }
    if (S.reports.length !== lastReports || force) { lastReports = S.reports.length; renderReports(); }
    document.querySelectorAll('.floor-card').forEach((c) => {
      const f = +c.dataset.floor;
      const st = S.agents.filter((a) => a.floor === f && a.kind === 'staff' && !a.transfer).length;
      const cu = S.agents.filter((a) => a.floor === f && a.kind === 'customer' && !a.transfer).length;
      c.querySelector('[data-count]').textContent = `員工 ${st}・客戶 ${cu}`;
    });
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
        html += `<div class="tick doc" style="left:${pct(t)}" title="送件 ${fmtHM(t)}">📦</div>`;
      for (const t of parseTimes(sat ? settings.cash.transportSaturday : settings.cash.transportWeekday))
        html += `<div class="tick cash" style="left:${pct(t)}" title="運鈔 ${fmtHM(t)}">🚚</div>`;
      $('timelineInfo').textContent = `營業 ${fmtHM(h.start)}～${fmtHM(h.last)}（${fmtHM(h.last)} 後不接新客）・員工盤點至 ${fmtHM(h.end)}・📦 送件 🚚 運鈔`;
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
    $('boardNow').innerHTML = c ? `<span class="no">${c.no}</span><span class="to">→ ${esc(c.label)}</span>` : '<span class="muted">尚未叫號</span>';
    $('boardList').innerHTML = D.calls.slice(1, 7).map((x) => `<div><b>${x.no}</b><span>${esc(x.label)}</span><em>${fmtHM(x.t % 86400)}</em></div>`).join('');
    const avail = settings.services;
    $('queueSummary').innerHTML = avail.map((s) => {
      const w = D.tickets.filter((t) => t.code === s.code && t.status === 'waiting').length;
      const n = D.seq[s.code] || 0;
      return `<div class="q"><i style="background:${s.color}"></i><span>${s.code} ${esc(s.name)}</span><b>${w}</b><small>人等候・已發 ${n}</small></div>`;
    }).join('');
  }

  function updatePoints() {
    const S = ABX.S;
    $('points').innerHTML = S.points.map((p) => {
      const a = p.staff;
      let st, cls;
      if (p.current) { st = (p.current.status === 'serving' ? '服務中 ' : '叫號 ') + p.current.no; cls = 'busy'; }
      else if (p.open) { st = '可服務'; cls = 'ok'; }
      else if (a && a.label === '午休用餐') { st = '午休'; cls = 'off'; }
      else if (a && a.closing) { st = a.closingDone ? '已結帳' : '盤點中'; cls = 'closing'; }
      else { st = '暫停'; cls = 'off'; }
      return `<div class="pt ${cls}"><span class="pl">${esc(p.label)}</span><span class="ps">${esc(a ? a.name : '—')}・${p.services.join('')}</span><span class="pst">${st}</span></div>`;
    }).join('');
  }

  function updateStats(ph) {
    const S = ABX.S, st = S.D.stats;
    const waiting = S.D.tickets.filter((t) => t.status === 'waiting').length;
    const present = S.staff.filter((a) => a.state !== 'home').length;
    const items = [
      ['臨櫃來客', st.arrived], ['完成服務', st.served], ['目前等候', waiting], ['放棄離開', st.abandoned + st.turnedAway],
      ['平均等候', st.waitN ? fmtDur(st.waitSum / st.waitN) : '—'], ['最長等候', st.waitMax ? fmtDur(st.waitMax) : '—'],
      ['ATM 交易', st.atm], ['店內客戶', ABX.Sim.customersInside()],
      ['在班員工', `${present} / ${S.staff.length}`], ['主管授權', st.approvals],
      ['臨櫃存入', fmtMoney(st.cashIn)], ['臨櫃提領', fmtMoney(st.cashOut)],
      ['金庫庫存', fmtMoney(S.vaultCash)], ['金庫狀態', S.D.vaultOpen ? '開啟' : '封閉'],
    ];
    $('stats').innerHTML = items.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }

  const STAGES = ['櫃檯待收', '內部傳遞', '後勤審核', '主管核章', '待送總行', '送件途中', '已送達總行'];
  function updateDocs() {
    const S = ABX.S;
    const cnt = (st) => S.docs.filter((d) => d.stage === st && !d.inbound).length;
    $('pipeline').innerHTML = STAGES.map((st) => `<div class="stage${cnt(st) ? ' has' : ''}"><b>${cnt(st)}</b><span>${st}</span></div>`).join('<i>›</i>') +
      `<div class="inbound">總行來文待核閱：<b>${S.docs.filter((d) => d.stage === '總行來文').length}</b>　已歸檔：<b>${S.docs.filter((d) => d.stage === '已歸檔').length}</b></div>`;
    const recent = S.docs.slice(-8).reverse();
    $('docList').innerHTML = recent.map((d) => `<div><span class="id">#${d.id}</span><span class="nm">${esc(d.name)}</span><span class="fr">${esc(d.from || '')}</span><span class="sg">${d.stage}</span></div>`).join('') || '<div class="muted">尚無文件</div>';
  }

  UI.refreshStaff = function () {
    const S = ABX.S;
    const rows = S.staff.map((a) => {
      const loc = a.state === 'home' ? (a.arrivedToday ? '已下班' : '未到班') : ABX.Sim.whereOf(a);
      return `<tr data-id="${a.id}" class="${S.highlight === a.id ? 'hl' : ''}${a.state === 'home' ? ' away' : ''}"><td><i class="dot" style="background:${a.color}"></i>${esc(a.name)}</td><td>${ROLES[a.role].label}${ABX.People.LEVELS[a.level] ? '・' + ABX.People.LEVELS[a.level].label : ''}<small class="trait">${esc(a.trait || '')}</small></td><td>${esc(loc)}</td><td>${esc(a.state === 'home' ? '—' : a.label)}${a.overtime && a.state !== 'home' ? ' <em class="ot">加班</em>' : ''}</td></tr>`;
    }).join('');
    const tb = $('staffTable').tBodies[0];
    if (tb._html !== rows) { tb.innerHTML = rows; tb._html = rows; }
    $('staffCount').textContent = `在班 ${S.staff.filter((a) => a.state !== 'home').length} / ${S.staff.length} 人`;
  };

  function renderLog() {
    const f = $('logFilter').value;
    const list = ABX.S.log.filter((l) => !f || l.cat === f).slice(0, 250);
    $('log').innerHTML = list.map((l) => `<div class="lg-row"><span class="t">D${Math.floor(l.t / 86400) + 1} ${fmtHMS(l.t % 86400)}</span><span class="c c-${l.cat}">${l.cat}</span><span>${esc(l.msg)}</span></div>`).join('');
  }

  function renderReports() {
    const R = ABX.S.reports;
    const tb = $('reportTable').tBodies[0];
    if (!R.length) { tb.innerHTML = '<tr><td colspan="15" class="muted">每日 24:00 結算後顯示</td></tr>'; return; }
    tb.innerHTML = R.map((r) => `<tr class="${r.open ? '' : 'away'}"><td>Day ${r.day}（${WD[r.wd]}）${r.open ? '' : ' 休'}</td><td>${r.arrived}</td><td>${r.served}</td><td>${r.abandoned + r.turnedAway}</td><td>${r.waitN ? fmtDur(r.avgWait) : '—'}</td><td>${r.waitMax ? fmtDur(r.waitMax) : '—'}</td><td>${r.atm}</td><td>${r.docsCreated}</td><td>${r.docsDelivered}</td><td>${r.trips}</td><td>${r.cashTransport}</td><td>${r.approvals}</td><td>${r.overtime}</td><td>${r.lastLeave === null ? '—' : fmtHM(r.lastLeave % 86400)}</td><td>${fmtMoney(r.vault)}</td></tr>`).join('');
  }

  function exportCsv() {
    const R = ABX.S.reports.slice().reverse();
    const head = ['日期', '星期', '營業', '來客', '完成', '放棄', '停止取號未服務', '過號', '平均等候(分)', '最長等候(分)', 'ATM', '產生文件', '送達總行', '送件趟數', '運鈔', '主管授權', '帳差', '加班人次', '臨櫃存入', '臨櫃提領', '金庫庫存'];
    const rows = R.map((r) => [r.day, WD[r.wd], r.open ? 'Y' : 'N', r.arrived, r.served, r.abandoned, r.turnedAway, r.noshow, (r.avgWait / 60).toFixed(1), (r.waitMax / 60).toFixed(1), r.atm, r.docsCreated, r.docsDelivered, r.trips, r.cashTransport, r.approvals, r.discrepancies, r.overtime, r.cashIn, r.cashOut, Math.round(r.vault)]);
    const csv = '\ufeff' + [head].concat(rows).map((x) => x.join(',')).join('\n');
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
    b.textContent = running ? '⏸ 暫停' : '▶ 開始';
    b.classList.toggle('primary', !running);
  }

  function jump(sec) {
    const was = running; running = false;
    ABX.Sim.advance(sec, 1);
    running = was;
    updateUI(true);
  }

  function bind() {
    $('btnPlay').onclick = () => setRunning(!running);
    const sp = $('speed');
    if (![...sp.options].some((o) => +o.value === speed)) { const o = new Option(speed + '×', speed); sp.add(o); }
    sp.value = String(speed);
    sp.onchange = () => { speed = +sp.value; savePrefs(); };
    $('btnHour').onclick = () => jump(3600);
    $('btnNextDay').onclick = () => {
      const S = ABX.S, d = Math.floor(S.t / 86400);
      const target = (d + 1) * 86400 + parseHM(settings.sim.startTime);
      jump(target - S.t);
    };
    ABX.armConfirm($('btnReset'), '再按一次確認重置', () => { setRunning(false); start(); });
    $('logFilter').onchange = renderLog;
    $('btnCsv').onclick = exportCsv;
    $('staffTable').tBodies[0].onclick = (e) => {
      const tr = e.target.closest('tr'); if (!tr) return;
      const id = +tr.dataset.id;
      ABX.S.highlight = ABX.S.highlight === id ? null : id;
      const a = ABX.S.staff.find((x) => x.id === id);
      if (a && a.floor !== null && floorView !== 'all' && String(a.floor) !== floorView) {
        floorView = String(a.floor);
        document.querySelectorAll('#floorTabs .tab').forEach((x) => x.classList.toggle('active', x.dataset.k === floorView));
        applyFloorView();
      }
      UI.refreshStaff();
    };
    const opt = (id, key) => { const el = $(id); el.checked = !!UI[key]; el.onchange = () => { UI[key] = el.checked; savePrefs(); }; };
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
