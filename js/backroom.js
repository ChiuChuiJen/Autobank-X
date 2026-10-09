/* Autobank-X — B1 常駐人員：金庫管理員、檔案管理員、監控員、資訊人員、總務
 * 各自在 B1 有座位與日常作業，並與其他樓層互動：
 *   金庫管理員：配發／收回現金箱、整鈔，櫃員現金過多或不足時送到 1F 調撥
 *   檔案管理員：到 3F 領取已送件副本回來歸檔、把調閱檔案送到 2F 專員或 3F 後勤
 *   監控員：監看監視畫面、巡檢機電室，火警與停電時優先處理
 *   資訊人員：系統監控、到櫃台維護設備，系統斷線與叫號機當機時優先處理
 *   總務：補充 1F／2F 表單與型錄、送傳票紙給櫃台
 */
(function () {
  const ABX = window.ABX;
  const C = () => ABX.SimCore;
  const CASH_HIGH = 900000, CASH_LOW = 150000, FLOAT = 500000;

  const sp = (floor, x, y, face) => ({ floor, x, y, face });
  const behind = (p) => ({ floor: p.staffSpot.floor, x: p.staffSpot.x + 18, y: p.staffSpot.y - 12, face: Math.PI / 2 });
  const at = (a, s) => C().atSpot(a, s);
  const home = (a, label) => { const { T, later } = C(); later(a, T.go(a.station, label || '回到座位')); };

  function D() { return C().S.D; }
  function queue(name) { const d = D(); return (d[name] = d[name] || []); }

  /* 櫃員服務完一筆後檢查：現金過多／不足 → 申請調撥；偶爾需要補傳票紙 */
  function afterService(a, p) {
    if (a.role !== 'teller' || !p) return;
    const cq = queue('cashReqs');
    if (!cq.some((r) => r.a === a && !r.done)) {
      if (a.cash > CASH_HIGH) cq.push({ a, p, kind: '解繳', done: false, taken: false });
      else if (a.cash < CASH_LOW) cq.push({ a, p, kind: '補鈔', done: false, taken: false });
    }
    const sq = queue('supplyReqs');
    if (C().rnd() < 0.02 && !sq.some((r) => r.p === p && !r.done)) sq.push({ p, item: C().pick(['傳票紙', '存提款單', '印泥', '點鈔帶']), done: false, taken: false });
  }

  /* ---------- 金庫管理員 ---------- */
  function vaultkeeper(a, t, h) {
    const { T, later, log, R, pick } = C();
    const S = C().S, d = D();
    if (C().lunchDue(a)) { C().goLunch(a); return; }
    const req = queue('cashReqs').find((r) => !r.done && !r.taken && r.a.state === 'duty');
    if (req && d.vaultOpen && t < h.end) {
      req.taken = true;
      const amt = req.kind === '解繳' ? Math.round((req.a.cash - FLOAT) / 10000) * 10000 : Math.round((FLOAT - req.a.cash) / 10000) * 10000;
      later(a, T.go(a.station, '回到金庫'), T.wait(90, req.kind === '補鈔' ? '準備補鈔現金' : '準備解繳袋'),
        T.go(behind(req.p), '送現金至' + req.p.label), T.wait(60, `現金調撥交接（${req.kind}）`),
        T.do(() => {
          if (req.kind === '解繳') { req.a.cash -= amt; S.vaultCash += amt; } else { req.a.cash += amt; S.vaultCash -= amt; }
          req.done = true;
          d.stats.cashMoves = (d.stats.cashMoves || 0) + 1;
          log('金庫', `${a.name} 至 ${req.p.label} ${req.kind} ${ABX.fmtMoney(amt)}`);
        }),
        T.go(a.station, '回到金庫'), T.wait(45, '入庫登記'));
      return;
    }
    if (!at(a, a.station)) { if (d.vaultOpen || d.vaultClosed || t >= h.start) home(a, '前往金庫'); else later(a, T.go(sp(-1, 200, 205, -Math.PI / 2), '前往金庫門口'), T.until(() => D().vaultOpen || C().tod() >= D().h.start, '等候開啟金庫', 1800)); return; }
    if (t >= h.last && !a.closing) {
      const tellersDone = C().staffOf('teller').every((x) => x.cashReturned || x.state !== 'duty' || !x.prepDone);
      if (tellersDone) {
        a.closing = true;
        later(a, T.wait(R(10, 15) * 60, '金庫日終盤點・登帳'), T.until(() => !D().vaultOpen, '等候封存金庫', 2400),
          T.do(() => { a.closingDone = true; log('金庫', `${a.name} 完成金庫日終盤點`); }));
        return;
      }
      later(a, T.wait(30, '收回現金箱・清點'));
      return;
    }
    if (a.closing) { later(a, T.wait(30, a.closingDone ? '準備下班' : '金庫日終盤點')); return; }
    const crewHere = S.agents.some((x) => x.role === 'crew' && x.floor === -1);
    let label;
    if (crewHere) label = '協助運鈔點收';
    else if (t < h.start) label = '配發現金箱';
    else label = pick(['點鈔・整鈔', '整理破損鈔券', '捆鈔封包', '核對庫存帳']);
    later(a, T.wait(30, label));
  }

  /* ---------- 檔案管理員 ---------- */
  function archivist(a, t, h) {
    const { T, later, log, R, pick } = C();
    const S = C().S, L = C().L;
    if (C().lunchDue(a)) { C().goLunch(a); return; }
    // 調閱檔案
    if (t >= h.start && t < h.last && t >= (a.nextFetch || h.start + 3600)) {
      a.nextFetch = t + R(70, 120) * 60;
      const targets = S.points.filter((p) => ['loan', 'corporate', 'advisor', 'vip'].includes(p.kind) && p.staff && p.staff.state === 'duty');
      const bo = C().staffOf('backoffice').filter((x) => x.state === 'duty');
      const useBo = !targets.length || (bo.length && C().rnd() < 0.35);
      const dest = useBo ? (bo.length ? { floor: 3, x: bo[0].station.x + 18, y: bo[0].station.y + 6 } : null) : behind(pick(targets));
      if (dest) {
        const who = useBo ? '後勤作業區' : targets.find((p) => behind(p).x === dest.x)?.label || '2F 專員';
        later(a, T.go(L.spots.archiveShelf, '前往檔案櫃'), T.wait(R(90, 180), '調閱檔案・登記借閱'),
          T.do(() => { a.carry = [{}]; }), T.go(dest, '送調閱檔案至' + who), T.wait(30, '遞交調閱檔案'),
          T.do(() => { a.carry = []; log('送件', `${a.name} 將調閱檔案送至 ${who}`); }), T.go(a.station, '回到檔案室'));
        return;
      }
    }
    // 收取待歸檔副本
    const q = S.archiveQ || 0;
    if (q >= 6 || (q > 0 && t >= h.last)) {
      const n = Math.min(q, 25);
      S.archiveQ = q - n;
      later(a, T.go({ floor: 3, x: L.spots.mailDesk.x + 30, y: L.spots.mailDesk.y - 10 }, '前往收發室領取副本'), T.wait(30, '點收待歸檔副本'),
        T.do(() => { a.carry = [{}]; }), T.go(a.station, '回到檔案室'), T.do(() => { a.carry = []; }),
        T.wait(n * 15, `分類裝訂 ${n} 件`), T.go(L.spots.archiveShelf, '上架歸檔'), T.wait(60, '上架歸檔'),
        T.do(() => { D().stats.archived = (D().stats.archived || 0) + n; log('送件', `${a.name} 完成 ${n} 件文件副本歸檔`); }),
        T.go(a.station, '回到座位'));
      return;
    }
    if (t >= h.last && !a.closing && (S.archiveQ || 0) === 0 && C().allServiceClosed()) {
      a.closing = true;
      later(a, T.wait(10 * 60, '登記調閱簿・鎖櫃'), T.do(() => { a.closingDone = true; }));
      return;
    }
    if (!at(a, a.station)) { home(a, '回到檔案室'); return; }
    later(a, T.wait(30, a.closing ? '整理檔案' : pick(['檔案編目', '整理過期卷宗', '掃描建檔', '核對借閱清單'])));
  }

  /* ---------- 監控員 ---------- */
  function monitor(a, t, h) {
    const { T, later, log, R, pick } = C();
    const L = C().L;
    if (C().lunchDue(a)) { C().goLunch(a); return; }
    if (t >= (a.nextRound || h.start - 1800)) {
      a.nextRound = t + R(80, 110) * 60;
      later(a, T.go(L.spots.mechRoom, '巡檢機電室'), T.wait(120, '巡檢配電盤・UPS・空調'),
        T.do(() => log('保全', `${a.name} 完成機電室例行巡檢`)), T.go(a.station, '回到監控機房'));
      return;
    }
    if (t >= h.end - 900 && !a.closing) {
      a.closing = true;
      later(a, T.go(a.station), T.wait(15 * 60, '錄影備份・交班紀錄'), T.do(() => { a.closingDone = true; }));
      return;
    }
    if (!at(a, a.station)) { home(a, '回到監控機房'); return; }
    const inside = C().customersInside();
    later(a, T.wait(30, inside > 25 ? '監看人潮・通報大廳' : pick(['監看監視畫面', '門禁紀錄核對', '錄影系統檢查', '監看 ATM 區'])));
  }

  /* ---------- 資訊人員 ---------- */
  function it(a, t, h) {
    const { T, later, log, R, pick } = C();
    const S = C().S;
    if (C().lunchDue(a)) { C().goLunch(a); return; }
    if (t >= h.start && t < h.last && t >= (a.nextVisit || h.start + 1800)) {
      a.nextVisit = t + R(100, 150) * 60;
      const pts = S.points.filter((p) => p.staff && p.staff.state === 'duty');
      if (pts.length) {
        const p = pick(pts);
        later(a, T.go(behind(p), '前往' + p.label + '維護設備'), T.wait(R(120, 240), pick(['更換印表機碳粉', '檢查讀卡機', '更新櫃台系統', '測試存摺補登機'])),
          T.do(() => log('員工', `${a.name}（資訊）完成 ${p.label} 設備維護`)), T.go(a.station, '回到機房'));
        return;
      }
    }
    if (t >= h.last && !a.closing && C().allServiceClosed()) {
      a.closing = true;
      later(a, T.go(a.station), T.wait(20 * 60, '日終系統備份・關閉櫃台主機'), T.do(() => { a.closingDone = true; log('員工', `${a.name} 完成日終系統備份`); }));
      return;
    }
    if (!at(a, a.station)) { home(a, '回到機房'); return; }
    later(a, T.wait(30, t < h.start ? '開機自我檢測' : pick(['系統監控', '資安日誌檢查', '網路流量監看', '處理報修單'])));
  }

  /* ---------- 總務 ---------- */
  function supply(a, t, h) {
    const { T, later, log, R, pick } = C();
    const L = C().L;
    if (C().lunchDue(a)) { C().goLunch(a); return; }
    const req = queue('supplyReqs').find((r) => !r.done && !r.taken);
    if (req && t < h.end) {
      req.taken = true;
      later(a, T.go({ floor: -1, x: 470, y: 290 }, '取' + req.item), T.wait(45, '從物料室取' + req.item),
        T.do(() => { a.carry = [{}]; }), T.go(behind(req.p), '送' + req.item + '至' + req.p.label), T.wait(20, '遞交耗材'),
        T.do(() => { a.carry = []; req.done = true; log('員工', `${a.name}（總務）送${req.item}至 ${req.p.label}`); }), T.go(a.station, '回到物料室'));
      return;
    }
    if (t >= h.start - 1800 && t < h.last && t >= (a.nextRound || h.start - 1800)) {
      a.nextRound = t + R(80, 120) * 60;
      later(a, T.go({ floor: -1, x: 470, y: 325 }, '整備耗材'), T.wait(60, '整備表單・型錄'), T.do(() => { a.carry = [{}]; }),
        T.go(sp(1, 262, 344, Math.PI / 2), '補充填單台表單'), T.wait(60, '補充填單台表單'),
        T.go(sp(1, 795, 318, Math.PI / 2), '補充 DM 架'), T.wait(45, '補充型錄'),
        T.go(sp(2, 70, 365, Math.PI / 2), '補充 2F 型錄'), T.wait(45, '補充 2F 型錄'),
        T.do(() => { a.carry = []; D().stats.restocks = (D().stats.restocks || 0) + 1; }), T.go(a.station, '回到物料室'));
      return;
    }
    if (t >= h.last && !a.closing) {
      a.closing = true;
      later(a, T.go(a.station), T.wait(12 * 60, '登記耗材進出・盤點庫存'), T.do(() => { a.closingDone = true; }));
      return;
    }
    if (!at(a, a.station)) { home(a, '回到物料室'); return; }
    later(a, T.wait(30, pick(['盤點耗材', '登記領用', '整理物料架', '訂購文具'])));
  }

  ABX.Backroom = { DECIDE: { vaultkeeper, archivist, monitor, it, supply }, afterService };
})();
