// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-BUS-OBSERVE-LIVE (prompts/TEAM_REPLICATION_PLUGIN_STUDY.md §10.3.3, Phase 1 item 2). READ THE LOG: §BUS-LIVE lines carry the evidence, the exit code does not.
// THE ISSUE it proves/disproves, in the REAL page through the REAL commit funnel (crud_overlay -> KernelOps.commitGroup): an observer subscribed on the bus is delivered post* events ONCE per committed op group, AFTER the
//   group is in the signed op-log (the observer reads kernel_ops AT delivery and must already see the row), with the COMMITTED key; NEVER for a group the model refused (no row sealed, no delivery); a delete and an update
//   are observed too; an observer's throw does not stop the save; applyOpGroup(ops, cb, observed) delivers the events of a model run once its group committed. Node witness_event_bus.js proves the bus; this proves the
//   HOST WIRING (the claim "after commitGroup succeeded" can only be judged where commitGroup is).
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.BUS_LIVE_ROOT || path.join(__dirname, '..', '..'), MUTANT = process.env.BUS_LIVE_MUTANT || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.db': 'application/octet-stream' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/erp/idempiere.html'; const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }); });
let fails = 0, judged = 0; const ok = (n, c, i) => { judged++; if (!c) fails++; console.log('  §BUS-LIVE ' + n + ' ' + (c ? 'PASS' : 'FAIL') + (c ? '' : ' ' + JSON.stringify(i))); };
// Mutants (BUS_LIVE_MUTANTS=1, parent only): rewrite the SHIPPED host wiring in a mirror root, re-run this witness in a child; the named check must FAIL in a child that prints its verdict line (a crash is not a kill).
const LIVE_MUTANTS = [
  { name: 'LM1-crud-commit-never-delivers', kills: 'L1', what: 'crud_overlay no longer delivers after a CRUD commit', file: 'crud_overlay.js', from: '_deliverObserved(op._observed, res, 1, groupOps); op._observed = null;', to: 'op._observed = null;' },
  { name: 'LM2-docaction-never-delivers', kills: 'L8', what: 'crud_overlay no longer delivers after a DocAction commit', file: 'crud_overlay.js', from: 'if (fanout && fanout.observed) _deliverObserved(fanout.observed, res, 0, groupOps);', to: '' },
  { name: 'LM3-applyOpGroup-never-delivers', kills: 'L6', what: 'applyOpGroup ignores its observed list', file: 'crud_overlay.js', from: '              _deliverObserved(observed, res, 0, groupOps);', to: '' },
  { name: 'LM4-delivers-before-commit', kills: 'L1', what: 'CRUD delivery moved BEFORE commitGroup (the observer sees an op-log without the row)', file: 'crud_overlay.js', from: "Promise.resolve(K.commitGroup(db, groupOps, _commitMeta())).then(function (res) {\n          if (!res || res.committed !== true) { console.warn('§CRUD ' + op.op_type + ' commitGroup not-committed", to: "_deliverObserved(op._observed, { ids: [] }, 1, groupOps); Promise.resolve(K.commitGroup(db, groupOps, _commitMeta())).then(function (res) {\n          if (!res || res.committed !== true) { console.warn('§CRUD ' + op.op_type + ' commitGroup not-committed" }
];
if (process.env.BUS_LIVE_MUTANTS && !MUTANT) {
  const cp = require('child_process'), os = require('os');
  let killed = 0; const bad = [];
  LIVE_MUTANTS.forEach((m) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buslive_')); fs.readdirSync(ROOT).forEach((f) => { if (f !== 'erp') fs.symlinkSync(path.join(ROOT, f), path.join(dir, f)); });
    fs.mkdirSync(path.join(dir, 'erp')); fs.readdirSync(path.join(ROOT, 'erp')).forEach((f) => { if (f !== m.file) fs.symlinkSync(path.join(ROOT, 'erp', f), path.join(dir, 'erp', f)); });
    const src = fs.readFileSync(path.join(ROOT, 'erp', m.file), 'utf8');
    if (src.split(m.from).length - 1 !== 1) { bad.push(m.name + ':NOT-APPLIED'); console.log('§BUS-LIVE-MUTANT ' + m.name + ' NOT-APPLIED (text not found exactly once; proves nothing)'); return; }
    fs.writeFileSync(path.join(dir, 'erp', m.file), src.split(m.from).join(m.to));
    const r = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { BUS_LIVE_ROOT: dir, BUS_LIVE_MUTANT: m.name, BUS_LIVE_MUTANTS: '' }), encoding: 'utf8', timeout: 900000 });
    const out = (r.stdout || '') + '\n' + (r.stderr || ''), vl = out.split('\n').filter((l) => /^§BUS-LIVE-VERDICT /.test(l))[0];
    const hit = out.split('\n').some((l) => new RegExp('§BUS-LIVE ' + m.kills + ' .* FAIL').test(l));
    if (!vl || /FAIL harness/.test(vl)) { bad.push(m.name + ':CRASHED'); console.log('§BUS-LIVE-MUTANT ' + m.name + ' CRASHED (no verdict; a crash is NOT a kill) ' + String(r.stderr || '').split('\n')[0].slice(0, 160)); }
    else if (/FAIL/.test(vl) && hit) { killed++; console.log('§BUS-LIVE-MUTANT ' + m.name + ' KILLED by ' + m.kills + ' :: ' + m.what); }
    else { bad.push(m.name + ':SURVIVED'); console.log('§BUS-LIVE-MUTANT ' + m.name + ' SURVIVED ' + vl); }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  });
  console.log('§BUS-LIVE-MUTANTS verdict=' + (killed === LIVE_MUTANTS.length ? 'PASS' : 'FAIL') + ' total=' + LIVE_MUTANTS.length + ' killed=' + killed + ' bad=' + JSON.stringify(bad)); process.exit(killed === LIVE_MUTANTS.length ? 0 : 1);
}
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port, base = `http://localhost:${port}/erp/idempiere.html?seed=ad_seed.db&login=GardenAdmin&lang=en_US`;
  const browser = await chromium.launch({ args: ['--no-sandbox'] }); const pg = await (await browser.newContext()).newPage();
  const logs = [], errs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(base, { waitUntil: 'networkidle' });
  await pg.waitForSelector('#idmp-tree', { timeout: 20000 }).catch(async () => { const u = await pg.$('#idmp-login-users .idmp-login-user:not(.disabled)'); if (u) { await u.click(); const o = await pg.$('#idmp-login-ok'); if (o) await o.click(); } await pg.waitForTimeout(1500); });
  await pg.waitForFunction(() => !!window.__idmpDb && !!window.__crud && !!window.AdModelVal && !!window.ModelLayer, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  const api = await pg.evaluate(() => ({ subscribe: typeof window.AdModelVal.subscribe, deliver: typeof window.ModelLayer.deliverObserved, applyOpGroup: window.__crud.applyOpGroup.length }));
  console.log('§BUS-LIVE-0 page api: ' + JSON.stringify(api));
  ok('L0 the real page exposes the bus (subscribe, deliverObserved) and applyOpGroup takes the observed list (arity 3)', api.subscribe === 'function' && api.deliver === 'function' && api.applyOpGroup === 3, api);
  if (!(api.subscribe === 'function' && api.deliver === 'function')) { console.log('§BUS-LIVE-VERDICT FAIL judged=' + judged + ' failed=' + fails + ' (no bus in this page: nothing further can be judged)' + (MUTANT ? ' mutant=' + MUTANT : '')); await browser.close(); srv.close(); process.exit(1); }
  // an observer on c_uom: records, AT DELIVERY, whether the signed op-log already holds the row (the "after commit" proof) and which key it was handed
  await pg.evaluate(() => {
    window.__busSeen = [];
    const inLog = (needle) => { const k = window.__crud.kernelDb && window.__crud.kernelDb(); if (!k) return -1; const r = k.exec("SELECT COUNT(*) FROM kernel_ops WHERE parameters LIKE ? AND undone=0".replace('?', "'%" + needle + "%'")); return r.length ? Number(r[0].values[0][0]) : 0; };
    const note = (kind) => (c, info) => { window.__busSeen.push({ kind, name: info.record && info.record.name, id: info.record && info.record.c_uom_id, unresolved: info.unresolved, inLogAtDelivery: inLog(info.record && info.record.name || 'zzz-none'), group: info.group && info.group.id }); return null; };
    window.AdModelVal.subscribe('adempiere/po/postCreate', 'c_uom', 'W.live.create', note('create'));
    window.AdModelVal.subscribe('adempiere/po/postUpdate', 'c_uom', 'W.live.update', note('update'));
    window.AdModelVal.subscribe('adempiere/po/postDelete', 'c_uom', 'W.live.delete', note('delete'));
    window.__busInLog = inLog;
  });
  const fields = (n) => ({ ad_client_id: 11, ad_org_id: 0, name: 'BUSLIVE ' + n, x12de355: 'L' + n, uomsymbol: 'l' + n, stdprecision: 2, costingprecision: 6, isdefault: 'N', uomtype: 'OT', isactive: 'Y' });
  const wait = (ms) => pg.waitForTimeout(ms);
  const seen = () => pg.evaluate(() => JSON.parse(JSON.stringify(window.__busSeen)));
  const kcount = () => pg.evaluate(() => { const k = window.__crud.kernelDb(); const r = k.exec('SELECT COUNT(*) FROM kernel_ops'); return Number(r[0].values[0][0]); });

  // 1. CREATE through the funnel
  const k0 = await kcount(), m1 = logs.length;
  await pg.evaluate((f) => { window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: 'c_uom', table: 'c_uom', verb: 'create', fields: f }); }, fields(1)); await wait(2500);
  let s = await seen(), k1 = await kcount(), l1 = logs.slice(m1);
  console.log('§BUS-LIVE-1 create: kernel_ops ' + k0 + ' -> ' + k1 + ' observed=' + JSON.stringify(s) + ' | ' + l1.filter(l => /§BUS-DELIVER|§BUS_OBSERVE|§CRUD-PERSIST/.test(l)).join(' || ').slice(0, 400));
  ok('L1 a created row is observed ONCE, after the commit: the op-log already held the row when the observer ran, key = the committed synthetic pk (negative, resolved)', k1 > k0 && s.length === 1 && s[0].kind === 'create' && s[0].name === 'BUSLIVE 1' && s[0].inLogAtDelivery >= 1 && typeof s[0].id === 'number' && s[0].id < 0 && !s[0].unresolved, { k0, k1, s });
  const createdId = s.length ? s[0].id : null;
  ok('L1b the shipped §BUS-DELIVER line says committed=Y events>=1 observers>=1 errors=0', l1.some(l => /§BUS-DELIVER committed=Y gid=\S+ events=1 observers=1 errors=0/.test(l)), l1.filter(l => /BUS-DELIVER/.test(l)));

  // 2. UPDATE (the row this session created: a client-11 row, a seeded system row is gated wrong-client) -> postUpdate once
  await pg.evaluate(() => { window.__busSeen.length = 0; });
  await pg.evaluate((id) => { window.__crud.applyOp({ op_type: 'CRUD_UPDATE', key: 'c_uom', table: 'c_uom', verb: 'update', ownerGated: false, id: id, changes: { description: { old: null, new: 'bus live update' } }, actor: 100 }); }, createdId); await wait(2500);
  s = await seen();
  console.log('§BUS-LIVE-2 update: observed=' + JSON.stringify(s) + ' | ' + logs.slice(-30).filter(l => /CRUD|MODEL|BUS|c_uom/.test(l)).join(' || ').slice(0, 900));
  ok('L2 an update is observed once as postUpdate', s.length === 1 && s[0].kind === 'update', s);

  // 3. DELETE of the created row -> postDelete once
  await pg.evaluate(() => { window.__busSeen.length = 0; });
  await pg.evaluate((id) => { window.__crud.applyOp({ op_type: 'CRUD_DELETE', key: 'c_uom', table: 'c_uom', verb: 'delete', ownerGated: false, id: id, tombstone: true, reversible: true }); }, createdId); await wait(2500);
  s = await seen();
  ok('L3 a delete is observed once as postDelete', s.length === 1 && s[0].kind === 'delete', s);

  // 4. REFUSED group: a gate validator refuses the new row -> nothing sealed, nothing delivered
  await pg.evaluate(() => { window.__busSeen.length = 0; window.AdModelVal.registerValidator('c_uom', 'AFTER_NEW', 'W.live.refuse', (c, info) => /REFUSEME/.test(String(info.record && info.record.name)) ? 'W.live refuses this row' : null); });
  const k2 = await kcount(), m4 = logs.length;
  await pg.evaluate((f) => { window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: 'c_uom', table: 'c_uom', verb: 'create', fields: f }); }, fields('REFUSEME')); await wait(2500);
  s = await seen(); const k3 = await kcount(), l4 = logs.slice(m4);
  console.log('§BUS-LIVE-4 refused create: kernel_ops ' + k2 + ' -> ' + k3 + ' observed=' + s.length + ' | ' + l4.filter(l => /MODEL-SAVE-ROLLBACK|MODEL-AFTER-SAVE/.test(l)).join(' || ').slice(0, 300));
  ok('L4 a refused group is rolled back (op-log unchanged, §MODEL-SAVE-ROLLBACK logged) and the observer is NOT called', k3 === k2 && s.length === 0 && l4.some(l => /§MODEL-SAVE-ROLLBACK table=c_uom/.test(l)), { k2, k3, n: s.length });
  await pg.evaluate(() => window.AdModelVal.unregisterValidator('c_uom', 'AFTER_NEW', 'W.live.refuse'));

  // 5. an observer that throws does not stop the save, and the next observer still runs
  await pg.evaluate(() => { window.__busSeen.length = 0; window.AdModelVal.subscribe('adempiere/po/postCreate', 'c_uom', 'W.live.boom', () => { throw new Error('live observer exploded'); }); });
  const k4 = await kcount(), m5 = logs.length;
  await pg.evaluate((f) => { window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: 'c_uom', table: 'c_uom', verb: 'create', fields: f }); }, fields(5)); await wait(2500);
  s = await seen(); const k5 = await kcount(), l5 = logs.slice(m5);
  ok('L5 a throwing observer: the row IS sealed, the other observer still ran once, §BUS_OBSERVE_ERR logged', k5 > k4 && s.length === 1 && s[0].name === 'BUSLIVE 5' && l5.some(l => /§BUS_OBSERVE_ERR .*live observer exploded/.test(l)), { k4, k5, n: s.length, errs: l5.filter(l => /BUS_OBSERVE_ERR/.test(l)) });
  await pg.evaluate(() => window.AdModelVal.unsubscribe('adempiere/po/postCreate', 'c_uom', 'W.live.boom'));

  // 6. applyOpGroup(ops, cb, observed): a model run's group, delivered after ITS commit
  await pg.evaluate(() => { window.__busSeen.length = 0; });
  const g = await pg.evaluate(async () => {
    const f = { name: 'BUSLIVE 6', x12de355: 'L6', uomsymbol: 'l6', stdprecision: 2, costingprecision: 6, isdefault: 'N', uomtype: 'OT' };
    const res = window.__crud.withModelTrx((q, env) => window.ModelLayer.run(q, env, { table: 'c_uom', timing: 'PROCESS', fn: (trx) => { window.ModelLayer.save(trx, 'c_uom', null, f); return { ok: true }; } }));
    const before = window.__busSeen.length, queued = res.observed.length;
    const cr = await new Promise((r) => window.__crud.applyOpGroup(res.ops, r, res.observed));
    return { ops: res.ops.length, queued: queued, beforeCommit: before, committed: cr && cr.committed, afterCb: window.__busSeen.length };
  });
  s = await seen();
  console.log('§BUS-LIVE-6 applyOpGroup: ' + JSON.stringify(g) + ' observed=' + JSON.stringify(s));
  ok('L6 applyOpGroup delivers the run\'s event once, after its commit (0 queued-delivery before, 1 after)', g.ops === 1 && g.queued === 1 && g.beforeCommit === 0 && g.committed === true && s.length === 1 && s[0].kind === 'create' && s[0].inLogAtDelivery >= 1 && s[0].id < 0, { g, s });

  // 7. the DocAction path (commitProcess): Complete a seeded client-11 draft Physical Inventory -> its post events arrive once, after the group committed; a refused DocAction delivers nothing
  await pg.evaluate(() => { window.__busDoc = []; window.__busKn = () => Number(window.__crud.kernelDb().exec('SELECT COUNT(*) FROM kernel_ops')[0].values[0][0]);
    window.AdModelVal.subscribe('adempiere/po/postUpdate', 'm_inventory', 'W.live.doc', (c, i) => { window.__busDoc.push({ id: i.record.m_inventory_id, status: i.record.docstatus, kn: window.__busKn(), group: i.group.id, n: i.group.n }); return null; }); });
  const kd0 = await kcount(), m7 = logs.length;
  await pg.evaluate(() => { window.__crud.process('m_inventory', 100, 'CO', { from: 'DR', to: 'CO' }); }); await wait(5000);
  const d = await pg.evaluate(() => JSON.parse(JSON.stringify(window.__busDoc))), kd1 = await kcount(), l7 = logs.slice(m7);
  console.log('§BUS-LIVE-7 DocAction Complete m_inventory 100: kernel_ops ' + kd0 + ' -> ' + kd1 + ' observed=' + JSON.stringify(d) + ' | ' + l7.filter(l => /§CRUD process committed|§BUS-DELIVER|§BUS_OBSERVE /.test(l)).join(' || ').slice(0, 420));
  ok('L8 a DocAction group delivers its saves\' postUpdate events in ONE batch, after the signed group committed (the op-log already grew when the observer ran), ending at status CO', d.length >= 1 && d.every(x => x.group === d[0].group && x.n === d.length && x.kn === kd1) && d[d.length - 1].status === 'CO' && kd1 > kd0 && l7.some(l => /§BUS-DELIVER committed=Y .* errors=0/.test(l)), { kd0, kd1, d });
  await pg.evaluate(() => { window.__busDoc.length = 0; window.AdModelVal.subscribe('adempiere/po/postUpdate', 'c_order', 'W.live.doc2', () => { window.__busDoc.push('c_order'); return null; }); });
  const kr0 = await kcount(), m8 = logs.length;
  await pg.evaluate(() => { window.__crud.process('c_order', 1200005, 'CO', { from: 'DR', to: 'CO' }); }); await wait(4000);
  const d2 = await pg.evaluate(() => JSON.parse(JSON.stringify(window.__busDoc))), kr1 = await kcount(), l8 = logs.slice(m8);
  console.log('§BUS-LIVE-8 DocAction refused (c_order 1200005 has no document type): kernel_ops ' + kr0 + ' -> ' + kr1 + ' observed=' + d2.length + ' | ' + l8.filter(l => /REFUSED/.test(l)).join(' || ').slice(0, 200));
  ok('L9 a refused DocAction (model returns false: "No Document Type") seals nothing and delivers nothing', kr1 === kr0 && d2.length === 0 && l8.some(l => /REFUSED by the model/.test(l)), { kr0, kr1, d2, l8: l8.filter(l => /REFUSED|BUS/.test(l)) });
  ok('L7 zero page errors', errs.length === 0, errs.slice(0, 3));
  const v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  console.log('§BUS-LIVE-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails + (MUTANT ? ' mutant=' + MUTANT : '')); await browser.close(); srv.close(); process.exit(v === 'PASS' ? 0 : 1);
})().catch(e => { console.log('§BUS-LIVE-VERDICT FAIL harness: ' + e.stack); process.exit(2); });
