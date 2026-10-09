/* Autobank-X — 共用設定（預設值、讀寫 localStorage、時間工具） */
(function () {
  const ABX = (window.ABX = window.ABX || {});
  const KEY = 'autobankx.settings.v2';

  const WD = ['一', '二', '三', '四', '五', '六', '日'];

  const ROLES = {
    manager:    { label: '分行經理', color: '#7c3aed' },
    supervisor: { label: '櫃檯主管', color: '#db2777' },
    teller:     { label: '櫃員',     color: '#2563eb' },
    guide:      { label: '大堂經理', color: '#0891b2' },
    advisor:    { label: '理財專員', color: '#b45309' },
    loan:       { label: '放款專員', color: '#ea580c' },
    backoffice: { label: '後勤作業', color: '#4d7c0f' },
    courier:    { label: '收發送件', color: '#0f766e' },
    security:   { label: '保全',     color: '#334155' },
    cleaner:    { label: '清潔',     color: '#78716c' },
    digital:    { label: '數位服務專員', color: '#0d9488' },
    safebox:    { label: '保管箱專員',   color: '#a16207' },
    corporate:  { label: '企金專員',     color: '#475569' },
    vip:        { label: '貴賓理專',     color: '#b91c1c' },
    audit:      { label: '法遵稽核',     color: '#6d28d9' },
  };

  // 有服務窗口的職務：窗口類型、所在樓層說明、預設服務代碼
  const SERVICE_ROLES = {
    teller:    { kind: 'counter',   def: 'A', where: '1F 櫃台' },
    digital:   { kind: 'digital',   def: 'G', where: '1F 數位服務區' },
    advisor:   { kind: 'advisor',   def: 'D', where: '2F 理財桌' },
    loan:      { kind: 'loan',      def: 'E', where: '2F 貸款桌' },
    corporate: { kind: 'corporate', def: 'I', where: '2F 企金桌' },
    vip:       { kind: 'vip',       def: 'V', where: '2F 貴賓理財室' },
    safebox:   { kind: 'safebox',   def: 'H', where: 'B1 保管箱室' },
  };

  const DEFAULTS = {
    bank: { name: 'Autobank-X 銀行', branch: '信義分行' },
    sim: { startDay: 1, startTime: '07:00', defaultSpeed: 1, seed: '', sound: true, voice: false, showLabels: true },
    // 索引 0 = 星期一 … 6 = 星期日
    hours: [
      { open: true,  start: '08:00', lastTicket: '15:30', end: '17:00' },
      { open: true,  start: '08:00', lastTicket: '15:30', end: '17:00' },
      { open: true,  start: '08:00', lastTicket: '15:30', end: '17:00' },
      { open: true,  start: '08:00', lastTicket: '15:30', end: '17:00' },
      { open: true,  start: '08:00', lastTicket: '15:30', end: '17:00' },
      { open: true,  start: '08:00', lastTicket: '12:30', end: '15:00' },
      { open: false, start: '08:00', lastTicket: '12:30', end: '15:00' },
    ],
    staffRules: {
      arriveBefore: 30,          // 一般員工提早到班（分）
      securityArriveBefore: 45,
      cleanerArriveBefore: 60,
      meetingBefore: 25,         // 晨會於開門前幾分鐘開始
      meetingMinutes: 10,
      lunchStart: '11:30',
      lunchEnd: '13:30',
      lunchMinutes: 30,
    },
    services: [
      { code: 'A', name: '存款／提款',     floor: 1, avgMin: 5,  ratio: 34, docProb: 5,   docName: '大額交易申報書', approvalProb: 6,  mgrProb: 50,  color: '#3b82f6' },
      { code: 'B', name: '匯款／轉帳',     floor: 1, avgMin: 8,  ratio: 15, docProb: 25,  docName: '匯款申請書',     approvalProb: 15, mgrProb: 30,  color: '#10b981' },
      { code: 'C', name: '開戶／綜合業務', floor: 1, avgMin: 15, ratio: 12, docProb: 90,  docName: '開戶申請書',     approvalProb: 30, mgrProb: 40,  color: '#f59e0b' },
      { code: 'F', name: '外幣兌換',       floor: 1, avgMin: 6,  ratio: 8,  docProb: 30,  docName: '外匯水單',       approvalProb: 10, mgrProb: 20,  color: '#06b6d4' },
      { code: 'G', name: '信用卡／數位服務', floor: 1, avgMin: 10, ratio: 7, docProb: 60,  docName: '信用卡申請書',   approvalProb: 0,  mgrProb: 20,  color: '#ec4899' },
      { code: 'H', name: '保管箱',         floor: 1, avgMin: 15, ratio: 3,  docProb: 15,  docName: '保管箱開箱登記', approvalProb: 0,  mgrProb: 0,   color: '#a16207' },
      { code: 'D', name: '理財諮詢',       floor: 2, avgMin: 25, ratio: 8,  docProb: 50,  docName: '理財商品申購書', approvalProb: 0,  mgrProb: 30,  color: '#a855f7' },
      { code: 'E', name: '貸款申辦',       floor: 2, avgMin: 30, ratio: 6,  docProb: 100, docName: '貸款申請案件',   approvalProb: 0,  mgrProb: 100, color: '#ef4444' },
      { code: 'I', name: '企業金融',       floor: 2, avgMin: 35, ratio: 4,  docProb: 100, docName: '企業授信案件',   approvalProb: 0,  mgrProb: 100, color: '#64748b' },
      { code: 'V', name: '貴賓理財',       floor: 2, avgMin: 30, ratio: 3,  docProb: 60,  docName: '信託契約',       approvalProb: 0,  mgrProb: 60,  color: '#b91c1c' },
    ],
    customers: {
      multiplier: 1,
      saturdayMultiplier: 0.7,
      patienceMin: 40,
      guideAskProb: 30,
      // 每小時到店人數（臨櫃）
      hourly: [0, 0, 0, 0, 0, 0, 0, 0, 24, 38, 46, 40, 30, 36, 42, 30, 0, 0, 0, 0, 0, 0, 0, 0],
      atmCount: 3,
      atmHourly: [2, 1, 1, 1, 1, 2, 3, 6, 10, 10, 10, 10, 14, 10, 10, 10, 10, 12, 14, 12, 10, 8, 5, 3],
    },
    courier: {
      collectIntervalMin: 60,
      dispatchWeekday: '10:30, 14:00, 16:40',
      dispatchSaturday: '11:30, 14:20',
      travelMin: 15,
      handoverMin: 5,
    },
    backoffice: { reviewMinMin: 4, reviewMaxMin: 12 },
    cash: {
      vaultInitial: 20000000,
      vaultTarget: 18000000,
      tellerFloat: 500000,
      transportWeekday: '10:00, 15:00',
      transportSaturday: '10:30',
      discrepancyProb: 4,
    },
    incidents: {
      enabled: true,
      multiplier: 1,
      // 隨機事件：rate = 每個營業日平均次數；臨櫃觸發事件：rate = 觸發機率 %
      types: {
        atm: { on: true, rate: 0.6 }, kiosk: { on: true, rate: 0.4 }, system: { on: true, rate: 0.25 }, power: { on: true, rate: 0.08 },
        medical: { on: true, rate: 0.25 }, leak: { on: true, rate: 0.2 }, alarm: { on: true, rate: 0.1 },
        fraud: { on: true, rate: 6 }, counterfeit: { on: true, rate: 1.5 }, complaint: { on: true, rate: 20 },
      },
    },
    staff: [
      { name: '林志明', role: 'manager' },
      { name: '陳美玲', role: 'supervisor' },
      { name: '王小華', role: 'teller', services: 'AB' },
      { name: '李佳穎', role: 'teller', services: 'AB' },
      { name: '張家豪', role: 'teller', services: 'AC' },
      { name: '劉怡君', role: 'teller', services: 'BA' },
      { name: '黃俊傑', role: 'teller', services: 'CB' },
      { name: '吳淑芬', role: 'teller', services: 'CA' },
      { name: '江佩蓉', role: 'teller', services: 'FB' },
      { name: '方子傑', role: 'digital', services: 'G' },
      { name: '蔡宗翰', role: 'guide' },
      { name: '許雅婷', role: 'advisor', services: 'D' },
      { name: '鄭志偉', role: 'advisor', services: 'D' },
      { name: '謝明哲', role: 'loan', services: 'E' },
      { name: '郭佩珊', role: 'loan', services: 'E' },
      { name: '游建國', role: 'corporate', services: 'IE' },
      { name: '沈若晴', role: 'vip', services: 'VD' },
      { name: '杜文雄', role: 'safebox', services: 'H' },
      { name: '洪嘉玲', role: 'backoffice' },
      { name: '曾建宏', role: 'backoffice' },
      { name: '葉淑惠', role: 'audit' },
      { name: '周文彬', role: 'courier' },
      { name: '楊大同', role: 'security' },
      { name: '林秀英', role: 'cleaner' },
    ],
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  function merge(def, sav) {
    if (Array.isArray(def)) {
      if (!Array.isArray(sav)) return clone(def);
      return sav.map((v, i) => (isObj(def[i]) && isObj(v) ? merge(def[i], v) : v));
    }
    if (isObj(def)) {
      const out = {};
      const src = isObj(sav) ? sav : {};
      for (const k of Object.keys(def)) out[k] = k in src ? merge(def[k], src[k]) : clone(def[k]);
      return out;
    }
    return sav === undefined || sav === null ? def : sav;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return merge(DEFAULTS, JSON.parse(raw));
    } catch (e) { /* 無法讀取時使用預設值 */ }
    return clone(DEFAULTS);
  }

  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
  }

  function resetSaved() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  function parseHM(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return 0;
    return (+m[1]) * 3600 + (+m[2]) * 60;
  }

  function parseTimes(s) {
    return String(s || '').split(/[,，\s]+/).filter((x) => /^\d{1,2}:\d{2}$/.test(x)).map(parseHM).sort((a, b) => a - b);
  }

  const pad = (n, w = 2) => String(n).padStart(w, '0');
  function fmtHM(sec) { sec = Math.max(0, Math.floor(sec)); return pad(Math.floor(sec / 3600) % 24) + ':' + pad(Math.floor(sec / 60) % 60); }
  function fmtHMS(sec) { sec = Math.max(0, Math.floor(sec)); return fmtHM(sec) + ':' + pad(sec % 60); }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return sec + ' 秒';
    const m = Math.floor(sec / 60);
    if (m < 60) return m + ' 分' + (sec % 60 ? ' ' + (sec % 60) + ' 秒' : '');
    return Math.floor(m / 60) + ' 小時 ' + (m % 60) + ' 分';
  }
  function fmtMoney(n) { return 'NT$' + Math.round(n).toLocaleString('en-US'); }

  // 兩段式確認（部分嵌入環境不支援 confirm 對話框）
  function armConfirm(btn, armedText, fn) {
    const orig = btn.textContent;
    let timer = null;
    btn.addEventListener('click', () => {
      if (btn.dataset.armed) {
        clearTimeout(timer); delete btn.dataset.armed; btn.textContent = orig; btn.classList.remove('armed');
        fn();
        return;
      }
      btn.dataset.armed = '1'; btn.textContent = armedText; btn.classList.add('armed');
      timer = setTimeout(() => { delete btn.dataset.armed; btn.textContent = orig; btn.classList.remove('armed'); }, 3500);
    });
  }

  // 匯出面板：顯示可複製的內容，並嘗試下載（部分嵌入環境會封鎖下載）
  function showExport(title, text, filename, mime) {
    const old = document.getElementById('exportPanel');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'exportPanel'; wrap.className = 'overlay';
    wrap.innerHTML = `<div class="overlay-box" role="dialog" aria-label="${title}">
      <div class="card-head"><h3>${title}</h3><button class="btn small ghost" data-x>關閉</button></div>
      <textarea id="exportText" readonly></textarea>
      <div class="overlay-actions"><span class="muted" data-msg></span><button class="btn small" data-dl>下載檔案</button><button class="btn small primary" data-copy>複製內容</button></div></div>`;
    document.body.appendChild(wrap);
    const ta = wrap.querySelector('textarea');
    ta.value = text;
    const msg = wrap.querySelector('[data-msg]');
    wrap.querySelector('[data-x]').onclick = () => wrap.remove();
    wrap.onclick = (e) => { if (e.target === wrap) wrap.remove(); };
    wrap.querySelector('[data-copy]').onclick = () => {
      const done = () => { msg.textContent = '已複製'; };
      const fallback = () => { ta.focus(); ta.select(); msg.textContent = '已選取全部內容，請按 Ctrl/⌘+C 複製'; };
      try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
    };
    wrap.querySelector('[data-dl]').onclick = () => {
      try {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: mime }));
        a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        msg.textContent = '若沒有開始下載，請改用「複製內容」';
      } catch (e) { msg.textContent = '此環境無法下載，請改用「複製內容」'; }
    };
  }

  Object.assign(ABX, {
    armConfirm, showExport,
    SETTINGS_KEY: KEY, WD, ROLES, SERVICE_ROLES, DEFAULTS, clone, merge,
    loadSettings: load, saveSettings: save, resetSettings: resetSaved,
    parseHM, parseTimes, pad, fmtHM, fmtHMS, fmtDur, fmtMoney,
  });
})();
