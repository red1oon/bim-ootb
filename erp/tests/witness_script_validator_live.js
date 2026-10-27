// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-BUS-ROW-LIVE (prompts/TEAM_REPLICATION_PLUGIN_STUDY.md §10.8). READ THE LOG: §RULE-LIVE lines carry the evidence, the exit code does not.
// THE ISSUE it proves/disproves, in the REAL page (idempiere.html) through the REAL save funnel (crud_overlay -> ModelLayer -> KernelOps.commitGroup): (1) the page loads ad_rule.js and its boot overlay
//   created the two physical tables (the dictionary rows were already in the seed) WITHOUT touching the team base; (2) an AD_Table_ScriptValidator row (data) on c_uom + AD_Rule 'twin:<fn>' blocks a real
//   create with the function's text (nothing sealed in the op-log, §MODEL-SAVE-ROLLBACK, §RULE_VETO), and deactivating the row lets the same create through (control); (3) rows entered through the ERP's OWN
//   write path (CRUD_CREATE ops on ad_rule / ad_table_scriptvalidator, i.e. what the Rule window does) are the rows stage 3 reads; (4) an afterNewReplication row fires on a replica group committed through
//   applyOpGroup and NOT on an ordinary create (FL-8). Node witness_script_validator.js proves the dispatcher; this proves the HOST WIRING (script tag order, boot overlay, the funnel).
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.RULE_LIVE_ROOT || path.join(__dirname, '..', '..'), MUTANT = process.env.RULE_LIVE_MUTANT || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.db': 'application/octet-stream' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/erp/idempiere.html'; const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }); });
let fails = 0, judged = 0; const ok = (n, c, i) => { judged++; if (!c) fails++; console.log('  §RULE-LIVE ' + n + ' ' + (c ? 'PASS' : 'FAIL') + (c ? '' : ' ' + JSON.stringify(i))); };
// Mutants (RULE_LIVE_MUTANTS=1, parent only): rewrite the SHIPPED host wiring in a mirror root (copies, text found exactly once), re-run in a child; the named check must FAIL in a child that prints its verdict.
const LIVE_MUTANTS = [
  { name: 'LM1-no-script-tag', kills: 'L0', what: 'idempiere.html does not load ad_rule.js', file: 'idempiere.html', from: '<script src="ad_rule.js?v=1"></script>', to: '' },
  { name: 'LM2-no-boot-overlay', kills: 'L0', what: 'the boot never calls AdRule.ensure (tables missing in the live db)', file: 'idempiere.html', from: 'if (window.AdRule) { try { AdRule.ensure(db); }', to: 'if (false) { try { AdRule.ensure(db); }' },
  { name: 'LM3-rule-loaded-before-bus', kills: 'L1', what: 'ad_rule.js is loaded BEFORE ad_modelval.js, so it never attaches to the bus', file: 'idempiere.html', from: '<script src="ad_modelval.js?v=6"></script>\n<script src="ad_rule.js?v=1"></script>', to: '<script src="ad_rule.js?v=1"></script>\n<script src="ad_modelval.js?v=6"></script>' },
  { name: 'LM4-gate-skips-rule-tables', kills: 'L1', what: 'crud_overlay skips the model path for a table nothing is registered on in code, ignoring dictionary rows', file: 'crud_overlay.js', from: 'if (any) _modelAfterSaveGo(op, db, cb); else cb([]);', to: 'cb([]);' }
];
if (process.env.RULE_LIVE_MUTANTS && !MUTANT) {
  const cp = require('child_process'), os = require('os');
  let killed = 0; const bad = [];
  LIVE_MUTANTS.forEach((m) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rulelive_')); fs.readdirSync(ROOT).forEach((f) => { if (f !== 'erp') fs.symlinkSync(path.join(ROOT, f), path.join(dir, f)); });
    fs.mkdirSync(path.join(dir, 'erp')); fs.readdirSync(path.join(ROOT, 'erp')).forEach((f) => { if (f !== m.file) fs.symlinkSync(path.join(ROOT, 'erp', f), path.join(dir, 'erp', f)); });
    const src = fs.readFileSync(path.join(ROOT, 'erp', m.file), 'utf8');
    if (src.split(m.from).length - 1 !== 1) { bad.push(m.name + ':NOT-APPLIED'); console.log('§RULE-LIVE-MUTANT ' + m.name + ' NOT-APPLIED (text not found exactly once; proves nothing)'); return; }
    fs.writeFileSync(path.join(dir, 'erp', m.file), src.split(m.from).join(m.to));
    const r = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { RULE_LIVE_ROOT: dir, RULE_LIVE_MUTANT: m.name, RULE_LIVE_MUTANTS: '' }), encoding: 'utf8', timeout: 900000 });
    const out = (r.stdout || '') + '\n' + (r.stderr || ''), vl = out.split('\n').filter((l) => /^§RULE-LIVE-VERDICT /.test(l))[0];
    const hit = out.split('\n').some((l) => new RegExp('§RULE-LIVE ' + m.kills + ' .* FAIL').test(l));
    if (!vl || /FAIL harness/.test(vl)) { bad.push(m.name + ':CRASHED'); console.log('§RULE-LIVE-MUTANT ' + m.name + ' CRASHED (no verdict; a crash is NOT a kill) ' + String(r.stderr || '').split('\n')[0].slice(0, 160)); }
    else if (/FAIL/.test(vl) && hit) { killed++; console.log('§RULE-LIVE-MUTANT ' + m.name + ' KILLED by ' + m.kills + ' :: ' + m.what); }
    else { bad.push(m.name + ':SURVIVED'); console.log('§RULE-LIVE-MUTANT ' + m.name + ' SURVIVED ' + vl); }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  });
  console.log('§RULE-LIVE-MUTANTS verdict=' + (killed === LIVE_MUTANTS.length ? 'PASS' : 'FAIL') + ' total=' + LIVE_MUTANTS.length + ' killed=' + killed + ' bad=' + JSON.stringify(bad)); process.exit(killed === LIVE_MUTANTS.length ? 0 : 1);
}
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port, base = `http://localhost:${port}/erp/idempiere.html?seed=ad_seed.db&login=GardenAdmin&lang=en_US`;
  const browser = await chromium.launch({ args: ['--no-sandbox'] }); const pg = await (await browser.newContext()).newPage();
  const logs = [], errs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(base, { waitUntil: 'networkidle' });
  await pg.waitForSelector('#idmp-tree', { timeout: 20000 }).catch(async () => { const u = await pg.$('#idmp-login-users .idmp-login-user:not(.disabled)'); if (u) { await u.click(); const o = await pg.$('#idmp-login-ok'); if (o) await o.click(); } await pg.waitForTimeout(1500); });
  await pg.waitForFunction(() => !!window.__idmpDb && !!window.__crud && !!window.AdModelVal && !!window.ModelLayer, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  const api = await pg.evaluate(() => {
    const has = (t) => { const r = window.__idmpDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='" + t + "'"); return r.length && r[0].values.length ? 1 : 0; };
    return { adRule: typeof window.AdRule, ensure: window.AdRule ? typeof window.AdRule.ensure : 'n/a', tables: has('ad_rule') + has('ad_table_scriptvalidator'), stage: window.AdRule ? typeof window.AdRule.stage3 : 'n/a' };
  });
  const bootLog = logs.filter(l => /§RULE_TABLES|§RULE_ATTACH_ERR/.test(l));
  console.log('§RULE-LIVE-0 page api: ' + JSON.stringify(api) + ' boot=' + JSON.stringify(bootLog));
  ok('L0 the real page loads ad_rule.js, its boot overlay created both physical tables (§RULE_TABLES created=2), no attach error', api.adRule === 'object' && api.ensure === 'function' && api.tables === 2 && bootLog.some(l => /§RULE_TABLES ensure created=2/.test(l)) && !bootLog.some(l => /ATTACH_ERR/.test(l)), { api, bootLog });
  if (!(api.adRule === 'object' && api.tables === 2)) { console.log('§RULE-LIVE-VERDICT FAIL judged=' + judged + ' failed=' + fails + ' (no ad_rule in this page: nothing further can be judged)' + (MUTANT ? ' mutant=' + MUTANT : '')); await browser.close(); srv.close(); process.exit(1); }
  const fields = (n) => ({ ad_client_id: 11, ad_org_id: 0, name: 'RULELIVE ' + n, x12de355: 'Q' + n, uomsymbol: 'q' + n, stdprecision: 2, costingprecision: 6, isdefault: 'N', uomtype: 'OT', isactive: 'Y' });
  const wait = (ms) => pg.waitForTimeout(ms);
  const kcount = () => pg.evaluate(() => Number(window.__crud.kernelDb().exec('SELECT COUNT(*) FROM kernel_ops')[0].values[0][0]));
  // the rows of the dictionary go in through the page's own db (the boot overlay tables) - the fixture; the L3 case enters them through the ERP write path instead
  await pg.evaluate(() => {
    const db = window.__idmpDb, tid = Number(db.exec("SELECT ad_table_id FROM ad_table WHERE lower(tablename)='c_uom'")[0].values[0][0]);
    window.__ruleLive = { calls: [], tid };
    window.AdRule.registerRuleFunction('LIVE.veto', (b) => { window.__ruleLive.calls.push({ fn: 'veto', event: b.event, repl: b.isReplication, name: b.po && b.po.name }); return window.__ruleLive.vetoOn === false ? null : 'live rule says no'; }, { owner: 'LIVE' });
    window.AdRule.registerRuleFunction('LIVE.mark', (b) => { window.__ruleLive.calls.push({ fn: 'mark', event: b.event, repl: b.isReplication, name: b.po && b.po.name }); return null; }, { owner: 'LIVE' });
    db.run("INSERT INTO ad_rule (ad_client_id, ad_org_id, ad_rule_id, accesslevel, entitytype, eventtype, isactive, name, ruletype, value, ad_rule_uu) VALUES (0,0,9300001,'3','U','T','Y','live veto','S','twin:LIVE.veto','live-rule-1')");
    db.run("INSERT INTO ad_table_scriptvalidator (ad_client_id, ad_org_id, ad_rule_id, ad_table_id, ad_table_scriptvalidator_id, eventmodelvalidator, isactive, seqno, ad_table_scriptvalidator_uu) VALUES (0,0,9300001,?,9400001,'TAN','Y',10,'live-sv-1')", [tid]);
  });
  // L1 a real create is blocked by the row
  const k0 = await kcount(), m1 = logs.length;
  await pg.evaluate((f) => { window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: 'c_uom', table: 'c_uom', verb: 'create', fields: f }); }, fields(1)); await wait(2500);
  const k1 = await kcount(), l1 = logs.slice(m1), c1 = await pg.evaluate(() => JSON.parse(JSON.stringify(window.__ruleLive.calls)));
  console.log('§RULE-LIVE-1 TAN veto: kernel_ops ' + k0 + ' -> ' + k1 + ' calls=' + JSON.stringify(c1) + ' | ' + l1.filter(l => /§RULE_|MODEL-SAVE-ROLLBACK/.test(l)).join(' || ').slice(0, 420));
  ok('L1 a TAN row (AD_Rule twin:LIVE.veto) refuses a real c_uom create through the save funnel (the AFTER_NEW phase of applyOp; TBN is the form BEFORE phase, judged in the node witness): the function ran, nothing sealed, §MODEL-SAVE-ROLLBACK and §RULE_VETO logged', k1 === k0 && c1.length >= 1 && c1[0].fn === 'veto' && c1[0].event === 'TAN' && c1[0].name === 'RULELIVE 1' && l1.some(l => /§MODEL-SAVE-ROLLBACK table=c_uom/.test(l)) && l1.some(l => /§RULE_VETO .*value=twin:LIVE\.veto/.test(l)), { k0, k1, c1 });
  // L2 control: deactivate the row -> the same create is sealed
  await pg.evaluate(() => { window.__ruleLive.calls.length = 0; window.__idmpDb.run("UPDATE ad_table_scriptvalidator SET isactive='N' WHERE ad_table_scriptvalidator_id=9400001"); });
  const k2 = await kcount();
  await pg.evaluate((f) => { window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: 'c_uom', table: 'c_uom', verb: 'create', fields: f }); }, fields(2)); await wait(2500);
  const k3 = await kcount(), c2 = await pg.evaluate(() => window.__ruleLive.calls.length);
  ok('L2 CONTROL: with the row IsActive=N the same create is sealed (op-log grows) and the rule never ran', k3 > k2 && c2 === 0, { k2, k3, c2 });
  // L3 rows entered through the ERP's own write path (what the Rule / Table-ScriptValidator windows commit) are what stage 3 reads
  const rid = await pg.evaluate(() => { const r = window.__idmpDb.exec('SELECT MAX(ad_rule_id) FROM ad_rule'); return Number(r[0].values[0][0]) + 1000; });
  const m3 = logs.length;
  await pg.evaluate((a) => {
    window.__ruleLive.calls.length = 0;
    window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: 'ad_rule', table: 'ad_rule', verb: 'create', fields: { ad_client_id: 11, ad_org_id: 0, ad_rule_id: a.rid, accesslevel: '3', entitytype: 'U', eventtype: 'T', isactive: 'Y', name: 'live via window', ruletype: 'S', value: 'twin:LIVE.veto' } });
  }, { rid }); await wait(2000);
  // a row created in the session has the synthetic key -<kernel op id> (crud_core listTip); the child row's FK is that key, exactly as the Table-ScriptValidator window's rule picker would store it
  const synth = await pg.evaluate(() => { const r = window.__crud.kernelDb().exec("SELECT id FROM kernel_ops WHERE op_type='CRUD_CREATE' AND parameters LIKE '%live via window%' AND undone=0 ORDER BY id DESC LIMIT 1"); return r.length ? -Number(r[0].values[0][0]) : null; });
  console.log('§RULE-LIVE-3a ad_rule created through applyOp: synthetic key=' + synth);
  await pg.evaluate((a) => { window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: 'ad_table_scriptvalidator', table: 'ad_table_scriptvalidator', verb: 'create', fields: { ad_client_id: 11, ad_org_id: 0, ad_rule_id: a.synth, ad_table_id: a.tid, eventmodelvalidator: 'TAN', isactive: 'Y', seqno: 20 } }); }, { rid, synth, tid: await pg.evaluate(() => window.__ruleLive.tid) }); await wait(2500);
  const k4 = await kcount(), l3 = logs.slice(m3);
  await pg.evaluate((f) => { window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: 'c_uom', table: 'c_uom', verb: 'create', fields: f }); }, fields(3)); await wait(2500);
  const k5 = await kcount(), c3 = await pg.evaluate(() => JSON.parse(JSON.stringify(window.__ruleLive.calls))), l3b = logs.slice(m3);
  console.log('§RULE-LIVE-3 rows via the ERP write path: ad_rule id=' + rid + ' kernel_ops after rows=' + k4 + ' after c_uom create=' + k5 + ' calls=' + JSON.stringify(c3) + ' | ' + l3b.filter(l => /§RULE_|CRUD-REFUSED|MODEL-SAVE-ROLLBACK|MV-TIP-SHADOW|MODEL-AFTER-SAVE/.test(l)).join(' || ').slice(0, 900));
  if (process.env.RULE_LIVE_DEBUG) console.log('§RULE-LIVE-DEBUG ' + JSON.stringify(l3b.slice(-25)).slice(0, 3000));
  ok('L3 the two rows were SEALED through applyOp (op-log grew) and now veto a real create (function ran, op-log unchanged by the create)', k4 >= k3 + 2 && k5 === k4 && c3.length >= 1 && c3[0].fn === 'veto', { k3, k4, k5, c3 });
  // L4 CONTROL for L3 (the refusal is the rule's text, not the harness): the same sealed rows, the function now returns null -> the next create is sealed. (Deactivating the row from this client-11 role is NOT possible
  //   and not tried: AD_Rule / AD_Table_ScriptValidator are AccessLevel 4 = System only in legacy and the seed, and the existing CRUD gate answers wrong-accesslevel - the twin keeps legacy's gate.)
  await pg.evaluate(() => { window.__ruleLive.calls.length = 0; window.__ruleLive.vetoOn = false; });
  const k6 = await kcount();
  await pg.evaluate((f) => { window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: 'c_uom', table: 'c_uom', verb: 'create', fields: f }); }, fields(4)); await wait(2500);
  const k7 = await kcount(), c4 = await pg.evaluate(() => JSON.parse(JSON.stringify(window.__ruleLive.calls)));
  console.log('§RULE-LIVE-4 same rows, function returns null: kernel_ops ' + k6 + ' -> ' + k7 + ' calls=' + JSON.stringify(c4));
  ok('L4 CONTROL: with the function returning null the sealed rows still FIRE (ran once) but the create is sealed - so L3\'s refusal was the rule\'s text', k7 > k6 && c4.length === 1 && c4[0].fn === 'veto', { k6, k7, c4 });
  // L5 replica: a TANR row fires for a replica group, not for an ordinary create
  await pg.evaluate(() => {
    const db = window.__idmpDb, tid = window.__ruleLive.tid;
        db.run("INSERT INTO ad_rule (ad_client_id, ad_org_id, ad_rule_id, accesslevel, entitytype, eventtype, isactive, name, ruletype, value, ad_rule_uu) VALUES (0,0,9300002,'3','U','T','Y','live mark','S','twin:LIVE.mark','live-rule-2')");
    db.run("INSERT INTO ad_table_scriptvalidator (ad_client_id, ad_org_id, ad_rule_id, ad_table_id, ad_table_scriptvalidator_id, eventmodelvalidator, isactive, seqno, ad_table_scriptvalidator_uu) VALUES (0,0,9300002,?,9400002,'TANR','Y',10,'live-sv-2')", [tid]);
  });
  await pg.evaluate((f) => { window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: 'c_uom', table: 'c_uom', verb: 'create', fields: f }); }, fields(5)); await wait(2500);
  const own = await pg.evaluate(() => window.__ruleLive.calls.filter(c => c.fn === 'mark').length);
  const g = await pg.evaluate(async () => {
    const f = { name: 'RULELIVE 6', x12de355: 'Q6', uomsymbol: 'q6', stdprecision: 2, costingprecision: 6, isdefault: 'N', uomtype: 'OT' };
    const res = window.__crud.withModelTrx((q, env) => window.ModelLayer.run(q, env, { table: 'c_uom', timing: 'PROCESS', fn: (trx) => { const s = window.ModelLayer.saveReplica(trx, 'c_uom', null, f); return { ok: s.ok, error: s.error }; } }));
    const calls = JSON.parse(JSON.stringify(window.__ruleLive.calls.filter(c => c.fn === 'mark')));
    const cr = res.ok === false ? { committed: false } : await new Promise((r) => window.__crud.applyOpGroup(res.ops, r, res.observed));
    return { runOk: res.ok, ops: (res.ops || []).length, calls, committed: cr && cr.committed };
  });
  console.log('§RULE-LIVE-5 replica: ordinary create fired the TANR rule ' + own + 'x; replica group: ' + JSON.stringify(g));
  ok('L5 FL-8 live: the TANR row ran 0x for the station\'s own create and exactly 1x (event TANR, replica=true) for the replica group, which then committed through applyOpGroup', own === 0 && g.runOk !== false && g.calls.length === 1 && g.calls[0].fn === 'mark' && g.calls[0].event === 'TANR' && g.calls[0].repl === true && g.committed === true, { own, g });
  ok('L6 zero page errors', errs.length === 0, errs.slice(0, 3));
  const v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  console.log('§RULE-LIVE-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails + (MUTANT ? ' mutant=' + MUTANT : '')); await browser.close(); srv.close(); process.exit(v === 'PASS' ? 0 : 1);
})().catch(e => { console.log('§RULE-LIVE-VERDICT FAIL harness: ' + e.stack); process.exit(2); });
