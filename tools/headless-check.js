// 以 Node 無頭執行模擬，檢查一週流程是否正常：node tools/headless-check.js [天數]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ctx = { window: {}, console, Math, JSON, Date };
ctx.window = ctx;
ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
vm.createContext(ctx);
for (const f of ['settings.js', 'layout.js', 'people.js', 'sim.js', 'incidents.js', 'roster.js', 'backroom.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const ABX = ctx.ABX;
const days = +(process.argv[2] || 7);
const s = ABX.loadSettings();
s.sim.seed = 'check';
s.sim.startTime = '00:00';
const S = ABX.Sim.reset(s);
const t0 = Date.now();
ABX.Sim.advance(days * 86400 + 60, 1);
console.log(`模擬 ${days} 天耗時 ${Date.now() - t0} ms`);
const out = S.reports.slice().reverse().map((r) => ({
  day: `D${r.day}(${ABX.WD[r.wd]})`, open: r.open, arrived: r.arrived, served: r.served, abandoned: r.abandoned, away: r.turnedAway,
  atm: r.atm, avgWaitMin: +(r.avgWait / 60).toFixed(1), maxWaitMin: Math.round(r.waitMax / 60), docs: r.docsCreated, delivered: r.docsDelivered,
  trips: r.trips, cashT: r.cashTransport, appr: r.approvals, ot: r.overtime,
  firstIn: r.firstArrive === null ? '-' : ABX.fmtHM(r.firstArrive % 86400), lastOut: r.lastLeave === null ? '-' : ABX.fmtHM(r.lastLeave % 86400),
}));
console.table(out);
const stuck = S.docs.filter((d) => !['已送達總行', '已歸檔'].includes(d.stage));
console.log('未完成文件:', stuck.map((d) => d.name + '@' + d.stage));
console.log('仍在班員工:', S.staff.filter((a) => a.state !== 'home').map((a) => a.name + ':' + a.label));
console.log('金庫現金:', ABX.fmtMoney(S.vaultCash));
const errs = S.log.filter((l) => /系統）/.test(l.msg));
console.log('系統備援事件:', errs.map((l) => ABX.fmtHM(l.t % 86400) + ' ' + l.msg));
const incs = S.incidents;
console.log(`臨時事件 ${incs.length} 件，未排除 ${incs.filter((i) => i.status === 'active').length} 件`);
for (const i of incs.slice(0, 12)) console.log(` D${Math.floor(i.startedAt / 86400) + 1} ${ABX.fmtHM(i.startedAt % 86400)} ${i.name} → ${i.status === 'resolved' ? '排除 ' + Math.round((i.resolvedAt - i.startedAt) / 60) + ' 分' : '處理中：' + (i.steps[i.cur] || {}).label}`);
console.log('排班紀錄：');
for (const l of S.log.filter((x) => x.cat === '排班').reverse().slice(0, 30)) console.log(` D${Math.floor(l.t / 86400) + 1} ${ABX.fmtHM(l.t % 86400)} ${l.msg}`);
