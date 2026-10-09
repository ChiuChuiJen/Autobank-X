/* Autobank-X — 後台設定頁 */
(function () {
  const ABX = window.ABX;
  const { WD, ROLES, clone, parseHM, parseTimes } = ABX;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let cur = ABX.loadSettings();

  function getPath(o, p) { return p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o); }
  function setPath(o, p, v) {
    const ks = p.split('.');
    let x = o;
    ks.forEach((k, i) => {
      if (i === ks.length - 1) { x[k] = v; return; }
      if (x[k] == null) x[k] = /^\d+$/.test(ks[i + 1]) ? [] : {};
      x = x[k];
    });
  }

  function input(path, type, extra = '') {
    const v = getPath(cur, path);
    if (type === 'check') return `<input type="checkbox" data-path="${path}" data-type="bool" ${v ? 'checked' : ''} ${extra}>`;
    if (type === 'number') return `<input type="number" step="any" data-path="${path}" data-type="num" value="${esc(v)}" ${extra}>`;
    if (type === 'time') return `<input type="time" data-path="${path}" value="${esc(v)}" ${extra}>`;
    if (type === 'color') return `<input type="color" data-path="${path}" value="${esc(v)}" ${extra}>`;
    return `<input type="text" data-path="${path}" value="${esc(v)}" ${extra}>`;
  }
  function select(path, options, numeric) {
    const v = getPath(cur, path);
    return `<select data-path="${path}" ${numeric ? 'data-type="num"' : ''}>${options.map(([k, n]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  }
  const field = (label, html, check) => `<label class="field${check ? ' check' : ''}">${check ? html + label : label + html}</label>`;
  const section = (title, hint, body) => `<section class="card"><h3>${title}</h3>${hint ? `<p class="hint">${hint}</p>` : ''}${body}</section>`;

  function hourlyGrid(path, max) {
    const arr = getPath(cur, path) || [];
    const m = Math.max(1, max || Math.max(...arr.map(Number), 1));
    return `<div class="hourly">${arr.map((v, i) => `<label><div class="bar"><i style="height:${Math.min(100, (v / m) * 100)}%"></i></div>${String(i).padStart(2, '0')}時${input(path + '.' + i, 'number', 'min="0"')}</label>`).join('')}</div>`;
  }

  function render() {
    const roleOpts = Object.entries(ROLES).map(([k, r]) => [k, r.label]);
    const svcCodes = cur.services.map((s) => s.code).join('');
    let html = '';

    html += section('基本資料', '', `<div class="form-grid">
      ${field('銀行名稱', input('bank.name'))}
      ${field('分行名稱', input('bank.branch'))}
    </div>`);

    html += section('模擬設定', '模擬時間預設與真實時間 1:1（1 秒 = 1 秒），可於模擬頁調整倍速。模擬從 Day 1（星期一）開始。', `<div class="form-grid">
      ${field('起始日（Day N，Day 1 = 星期一）', input('sim.startDay', 'number', 'min="1"'))}
      ${field('起始時間', input('sim.startTime', 'time'))}
      ${field('預設速度', select('sim.defaultSpeed', [1, 2, 5, 10, 30, 60, 180, 600].map((x) => [x, x + '×' + (x === 1 ? '（1:1）' : '')]), true))}
      ${field('亂數種子（空白 = 每次不同）', input('sim.seed'))}
      ${field('顯示員工狀態標籤', input('sim.showLabels', 'check'), true)}
      ${field('叫號音效', input('sim.sound', 'check'), true)}
      ${field('語音叫號（1×～2× 時）', input('sim.voice', 'check'), true)}
    </div>`);

    html += section('營業時間', '「停止取號」後不接新客，已取號客戶服務完畢後，員工進行盤點、軋帳、金庫封存與送件，至「下班」時間離開（作業未完成會加班）。', `<div class="scroll-x"><table class="tbl">
      <thead><tr><th>星期</th><th>營業</th><th>上班／開門</th><th>停止取號（盤點開始）</th><th>下班（盤點結束）</th></tr></thead>
      <tbody>${cur.hours.map((h, i) => `<tr><td>星期${WD[i]}</td><td>${input(`hours.${i}.open`, 'check')}</td><td>${input(`hours.${i}.start`, 'time')}</td><td>${input(`hours.${i}.lastTicket`, 'time')}</td><td>${input(`hours.${i}.end`, 'time')}</td></tr>`).join('')}</tbody>
    </table></div>`);

    html += section('員工作息', '到班 → 換制服打卡 → 晨會 → 開金庫領現金箱 → 開櫃服務 → 輪流午休 → 停止取號後盤點軋帳 → 下班。週六若停止取號早於午休結束則不排午休。', `<div class="form-grid">
      ${field('一般員工提早到班（分）', input('staffRules.arriveBefore', 'number', 'min="0"'))}
      ${field('保全提早到班（分）', input('staffRules.securityArriveBefore', 'number', 'min="0"'))}
      ${field('清潔提早到班（分）', input('staffRules.cleanerArriveBefore', 'number', 'min="0"'))}
      ${field('晨會：開門前幾分鐘開始', input('staffRules.meetingBefore', 'number', 'min="0"'))}
      ${field('晨會長度（分）', input('staffRules.meetingMinutes', 'number', 'min="0"'))}
      ${field('午休時段開始', input('staffRules.lunchStart', 'time'))}
      ${field('午休時段結束', input('staffRules.lunchEnd', 'time'))}
      ${field('每人午休長度（分）', input('staffRules.lunchMinutes', 'number', 'min="10"'))}
    </div>`);

    html += section('業務項目（取號類別）', '代碼為取號字首（如 A001）。樓層 2 的業務客戶會到 2F 等候。比例決定客戶選擇各業務的機率。', `<div class="scroll-x"><table class="tbl">
      <thead><tr><th>代碼</th><th>名稱</th><th>樓層</th><th>平均(分)</th><th>比例%</th><th>產生文件%</th><th>文件名稱</th><th>主管授權%</th><th>經理核章%</th><th>顏色</th><th></th></tr></thead>
      <tbody>${cur.services.map((s, i) => `<tr>
        <td>${input(`services.${i}.code`, 'text', 'class="w-s" maxlength="1"')}</td>
        <td>${input(`services.${i}.name`, 'text', 'class="w-m"')}</td>
        <td>${select(`services.${i}.floor`, [[1, '1F'], [2, '2F']], true)}</td>
        <td>${input(`services.${i}.avgMin`, 'number', 'class="w-s" min="1"')}</td>
        <td>${input(`services.${i}.ratio`, 'number', 'class="w-s" min="0"')}</td>
        <td>${input(`services.${i}.docProb`, 'number', 'class="w-s" min="0" max="100"')}</td>
        <td>${input(`services.${i}.docName`, 'text', 'class="w-m"')}</td>
        <td>${input(`services.${i}.approvalProb`, 'number', 'class="w-s" min="0" max="100"')}</td>
        <td>${input(`services.${i}.mgrProb`, 'number', 'class="w-s" min="0" max="100"')}</td>
        <td>${input(`services.${i}.color`, 'color')}</td>
        <td><button class="btn small ghost danger" data-del="services" data-i="${i}">刪除</button></td></tr>`).join('')}</tbody>
    </table></div><p><button class="btn small" data-add="services">＋ 新增業務</button></p>`);

    html += section('員工名單', `櫃員依序對應 1 號、2 號…櫃台；理財專員、放款專員對應 2F 座位。「服務項目」填業務代碼，順序即叫號優先順序（目前代碼：${esc(svcCodes)}）。員工名單變更需在模擬頁重置後生效。`, `<div class="scroll-x"><table class="tbl">
      <thead><tr><th>#</th><th>姓名</th><th>職務</th><th>服務項目（櫃員／理專／放款）</th><th></th></tr></thead>
      <tbody>${cur.staff.map((s, i) => `<tr><td>${i + 1}</td>
        <td>${input(`staff.${i}.name`, 'text', 'class="w-m"')}</td>
        <td>${select(`staff.${i}.role`, roleOpts)}</td>
        <td>${['teller', 'advisor', 'loan'].includes(s.role) ? input(`staff.${i}.services`, 'text', 'class="w-m"') : '<span class="muted">—</span>'}</td>
        <td><button class="btn small ghost danger" data-del="staff" data-i="${i}">刪除</button></td></tr>`).join('')}</tbody>
    </table></div><p><button class="btn small" data-add="staff">＋ 新增員工</button></p>`);

    html += section('客戶來客', '每小時臨櫃來客數（僅在營業收件時段內產生）。等候超過耐心時間的客戶會放棄離開。', `<div class="form-grid">
      ${field('來客倍率', input('customers.multiplier', 'number', 'min="0"'))}
      ${field('週六來客倍率', input('customers.saturdayMultiplier', 'number', 'min="0"'))}
      ${field('平均耐心（分）', input('customers.patienceMin', 'number', 'min="1"'))}
      ${field('詢問大堂經理機率（%）', input('customers.guideAskProb', 'number', 'min="0" max="100"'))}
      ${field('ATM 台數（1～4，需重置）', input('customers.atmCount', 'number', 'min="1" max="4"'))}
    </div>
    <h4>每小時臨櫃來客數</h4>${hourlyGrid('customers.hourly')}
    <h4>每小時 ATM 使用人次（24 小時）</h4>${hourlyGrid('customers.atmHourly')}`);

    html += section('送件作業', '收發員定時至各櫃台收件 → 後勤審核建檔 → 需要者由經理核章 → 依送件時間出發送總行（往返後帶回總行來文給經理核閱）。時間以逗號分隔。', `<div class="form-grid">
      ${field('櫃台收件間隔（分）', input('courier.collectIntervalMin', 'number', 'min="10"'))}
      ${field('平日送總行時間', input('courier.dispatchWeekday'))}
      ${field('週六送總行時間', input('courier.dispatchSaturday'))}
      ${field('單程時間（分）', input('courier.travelMin', 'number', 'min="1"'))}
      ${field('總行交件時間（分）', input('courier.handoverMin', 'number', 'min="0"'))}
      ${field('後勤審核最短（分）', input('backoffice.reviewMinMin', 'number', 'min="1"'))}
      ${field('後勤審核最長（分）', input('backoffice.reviewMaxMin', 'number', 'min="1"'))}
    </div>`);

    html += section('現金與金庫', '金庫由櫃檯主管與經理雙人控管開啟／封存。櫃員開櫃前領取現金箱，盤點後繳回。運鈔車依時間到店，保全戒護、主管交接。', `<div class="form-grid">
      ${field('金庫初始現金', input('cash.vaultInitial', 'number', 'min="0"'))}
      ${field('金庫目標庫存（運鈔調撥依據）', input('cash.vaultTarget', 'number', 'min="0"'))}
      ${field('櫃員每日領用現金', input('cash.tellerFloat', 'number', 'min="0"'))}
      ${field('平日運鈔時間', input('cash.transportWeekday'))}
      ${field('週六運鈔時間', input('cash.transportSaturday'))}
      ${field('盤點帳差機率（%）', input('cash.discrepancyProb', 'number', 'min="0" max="100"'))}
    </div>`);

    $('admin').innerHTML = html;
    validate();
  }

  function collect() {
    const s = clone(cur);
    s.services = []; s.staff = [];
    document.querySelectorAll('[data-path]').forEach((el) => {
      let v;
      if (el.dataset.type === 'bool') v = el.checked;
      else if (el.dataset.type === 'num') v = el.value === '' ? 0 : Number(el.value);
      else v = el.value;
      setPath(s, el.dataset.path, v);
    });
    s.services.forEach((x) => { x.code = String(x.code || '').toUpperCase().trim(); });
    s.staff.forEach((x) => { if (x.services !== undefined) x.services = String(x.services).toUpperCase().replace(/[^A-Z]/g, ''); });
    return s;
  }

  function validate() {
    const s = collect();
    const w = [];
    s.hours.forEach((h, i) => {
      if (!h.open) return;
      const a = parseHM(h.start), b = parseHM(h.lastTicket), c = parseHM(h.end);
      if (!(a < b && b <= c)) w.push(`星期${WD[i]}：時間需符合 上班 < 停止取號 ≤ 下班`);
    });
    const codes = s.services.map((x) => x.code);
    if (codes.some((c) => !/^[A-Z]$/.test(c))) w.push('業務代碼需為單一英文字母');
    if (new Set(codes).size !== codes.length) w.push('業務代碼不可重複');
    if (!s.staff.some((x) => x.role === 'teller')) w.push('至少需要 1 位櫃員');
    s.staff.forEach((x, i) => {
      if (['teller', 'advisor', 'loan'].includes(x.role)) {
        const bad = String(x.services || '').split('').filter((c) => !codes.includes(c));
        if (!x.services) w.push(`第 ${i + 1} 位員工（${x.name}）未設定服務項目`);
        else if (bad.length) w.push(`第 ${i + 1} 位員工（${x.name}）的服務項目 ${bad.join('')} 不存在`);
      }
    });
    for (const p of ['courier.dispatchWeekday', 'courier.dispatchSaturday', 'cash.transportWeekday', 'cash.transportSaturday']) {
      const raw = String(getPath(s, p) || '').trim();
      if (raw && !parseTimes(raw).length) w.push(`時間格式錯誤：${raw}（範例 10:30, 14:00）`);
    }
    if (s.staff.length > 40) w.push('員工人數建議不超過 40 人');
    $('warnings').innerHTML = w.map((x) => `<li>${esc(x)}</li>`).join('');
    return w;
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    const del = e.target.closest('[data-del]');
    if (add) {
      cur = collect();
      if (add.dataset.add === 'services') {
        const used = cur.services.map((x) => x.code);
        const code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((c) => !used.includes(c)) || 'Z';
        cur.services.push({ code, name: '新業務', floor: 1, avgMin: 10, ratio: 5, docProb: 20, docName: '申請書', approvalProb: 0, mgrProb: 0, color: '#14b8a6' });
      } else cur.staff.push({ name: '新員工', role: 'teller', services: 'A' });
      render();
    }
    if (del) {
      cur = collect();
      cur[del.dataset.del].splice(+del.dataset.i, 1);
      render();
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('select[data-path$=".role"]')) {
      cur = collect();
      const i = +e.target.dataset.path.split('.')[1];
      const r = cur.staff[i].role;
      if (['teller', 'advisor', 'loan'].includes(r)) cur.staff[i].services = cur.staff[i].services || (r === 'teller' ? 'A' : r === 'advisor' ? 'D' : 'E');
      else delete cur.staff[i].services;
      render();
      return;
    }
    validate();
  });
  document.addEventListener('input', (e) => { if (e.target.matches('[data-path]')) validate(); });

  $('btnSave').onclick = () => {
    const w = validate();
    cur = collect();
    if (ABX.saveSettings(cur)) toast(w.length ? `已儲存（有 ${w.length} 項警告，請檢查下方提示）` : '已儲存。回到模擬頁時會提示套用新設定。');
    else toast('儲存失敗：瀏覽器不允許存取本機儲存空間');
    render();
  };
  ABX.armConfirm($('btnDefaults'), '再按一次確認恢復', () => {
    cur = clone(ABX.DEFAULTS);
    render();
    toast('已載入預設值，請按「儲存設定」');
  });
  $('btnExport').onclick = () => ABX.showExport('設定 JSON', JSON.stringify(collect(), null, 2), 'autobank-x-settings.json', 'application/json');
  $('btnImport').onclick = () => $('fileImport').click();
  $('fileImport').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      cur = ABX.merge(ABX.DEFAULTS, JSON.parse(await f.text()));
      render();
      toast('已匯入，請確認後按「儲存設定」');
    } catch (err) { toast('匯入失敗：檔案格式錯誤'); }
    e.target.value = '';
  };

  // 嵌入環境中主頁不一定位於 index.html，優先返回上一頁
  $('btnBack').onclick = (e) => { if (history.length > 1) { e.preventDefault(); history.back(); } };

  render();
})();
