#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-GOAL-STORE (spec bim-ootb prompts/CAPEX_DASHBOARD.md §5.32). READ THE LOG: verdict = §GOAL_STORE_VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: "legacy stores a due goal at render and the twin only computes it, so within the refresh interval after a data change legacy's Home shows the stored value and the twin's
//   the live one". The same three steps run on real legacy (a real server on a throwaway clone of stock, its real ZK Home) and on the twin (the real erp/idempiere.html); captions compared exactly.
// Break (MUST FAIL): GOAL_STORE_BREAK=1 removes ModelPA.storeDue before the Home renders, which is the twin without this fix. Exit 0 PASS, 1 FAIL, 2 INCONCLUSIVE.
'use strict';
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync, spawn } = require('child_process');
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const ROOT = path.join(__dirname, '..', '..'), BREAK = process.env.GOAL_STORE_BREAK === '1', log = console.log;
const DB = 'capex_goal_store', GOAL_ID = 105, GOAL = 'Total Open Service Requests', REQ_TYPE = 101;
const INSTANCE = path.join(os.homedir(), 'idempiere-bimplugin'), ZK = 'http://localhost:8098';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain', '.zip': 'application/zip' };
let judged = 0, fails = 0; const inconclusive = [];
const ck = (n, ok, info) => { judged++; if (!ok) fails++; log('  §GOAL_STORE ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
const inc = (n, why) => { inconclusive.push(n); log('  §GOAL_STORE ' + n + ' INCONCLUSIVE ' + why); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function psqlOn(db, sql) { const r = spawnSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', db, '-v', 'ON_ERROR_STOP=1', '-qtA', '-F', '|'], { input: sql, maxBuffer: 64 << 20 }); return { code: r.status, out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim() }; }
function q(sql) { const r = psqlOn(DB, 'SET search_path=adempiere;\n' + sql + ';'); if (r.code !== 0) throw new Error('psql: ' + r.err.slice(0, 300)); return r.out; }
const instanceUp = () => spawnSync('pgrep', ['-f', '[i]dempiere-bimplugin/server/plugins/org.eclipse.equinox.launcher']).status === 0;
const isToday = s => { const d = new Date(), p = n => ('0' + n).slice(-2); return String(s).slice(0, 10) === d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const sameStep = (a, b) => a === b;

// ── legacy ──
async function zkCaption(browser) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), z = await c.newPage();
  const find = n => [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.textContent || '').trim().indexOf(n + ':') === 0).map(e => e.textContent.trim())[0] || null;
  try {
    await z.goto(ZK + '/webui/', { waitUntil: 'load', timeout: 60000 }); await z.waitForSelector('input[type=password]', { timeout: 40000 }); await z.waitForTimeout(800);
    const ins = await z.$$('input:not([type=password]):not([type=checkbox])'); await ins[0].fill('GardenAdmin'); await ins[0].press('Tab'); await z.fill('input[type=password]', 'GardenAdmin'); await z.press('input[type=password]', 'Tab'); await z.waitForTimeout(400);
    if (!(await z.evaluate(() => { const x = [...document.querySelectorAll('input[type=checkbox]')].find(y => /Select Role/.test(y.parentElement.textContent)); return x && x.checked; }))) { await z.click('label:has-text("Select Role")'); await z.waitForTimeout(500); }
    await z.click('button.btn-ok'); await z.waitForFunction(() => document.querySelectorAll('input.z-combobox-input').length >= 3, null, { timeout: 25000 }); await z.waitForTimeout(1000);
    const cb = await z.$$('input.z-combobox-input'); await cb[1].click(); await cb[1].fill('GardenWorld Admin'); await cb[1].press('Tab'); await z.waitForTimeout(1200); await z.click('button.btn-ok');
    await z.waitForFunction(find, GOAL, { timeout: 60000 }).catch(() => {});
    await z.waitForTimeout(1500);
    return await z.evaluate(find, GOAL);
  } finally { await c.close(); }
}
const legacyRow = () => { const [a, d] = q('SELECT measureactual, datelastrun FROM pa_goal WHERE pa_goal_id=' + GOAL_ID).split('|'); return { actual: Number(a), last: d }; };
async function legacyRun(browser, tmp) {
  const out = {};
  const adm = psqlOn('postgres', 'DROP DATABASE IF EXISTS ' + DB + ' WITH (FORCE);\nCREATE DATABASE ' + DB + ' TEMPLATE idempiere;\n');
  if (adm.code !== 0) { inc('L', 'could not clone stock: ' + adm.err.slice(0, 200)); return null; }
  const home = path.join(INSTANCE, 'server'), props = path.join(tmp, 'idempiere.properties');
  fs.writeFileSync(props, fs.readFileSync(path.join(home, 'idempiere.properties'), 'utf8').split('idempiere_bimplugin').join(DB));
  const f = fs.openSync(path.join(tmp, 'server.log'), 'a');
  spawn('sh', [path.join(home, 'idempiere-server.sh')], { detached: true, stdio: ['ignore', f, f], cwd: home, env: Object.assign({}, process.env, { JAVA_OPTS: '-Xmx2048M -DIDEMPIERE_HOME=' + home + ' -DPropertyFile=' + props, TELNET_PORT: '12613' }) }).unref();
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { const r = await fetch(ZK + '/webui/'); up = r.status === 200; } catch (e) { /* not listening */ } if (!up) await sleep(5000); }
  if (!up) { inc('L', 'the server on the clone did not answer in 300 s'); return null; }
  const r0 = legacyRow();
  out.c1 = await zkCaption(browser); out.r1 = legacyRow();
  log('§GOAL_STORE legacy before=' + JSON.stringify(r0) + ' step1 caption=' + out.c1 + ' row=' + JSON.stringify(out.r1));
  ck('L1 legacy: the first render stores the goal (DateLastRun 2007 → today)', String(r0.last).slice(0, 4) === '2007' && isToday(out.r1.last), { before: r0.last, after: out.r1.last });
  q("CREATE TEMP TABLE t AS SELECT * FROM r_request WHERE ad_client_id=11 AND r_requesttype_id=" + REQ_TYPE + " AND processed<>'Y' ORDER BY r_request_id LIMIT 1;\nUPDATE t SET r_request_id=1900001, documentno='W-GOAL-STORE', r_request_uu=gen_random_uuid();\nINSERT INTO r_request SELECT * FROM t");
  out.c2 = await zkCaption(browser); out.r2 = legacyRow();
  log('§GOAL_STORE legacy step2 caption=' + out.c2 + ' row=' + JSON.stringify(out.r2) + ' open requests now=' + q("SELECT COUNT(*) FROM r_request WHERE ad_client_id=11 AND r_requesttype_id=" + REQ_TYPE + " AND processed<>'Y'"));
  ck('L2 legacy: a new request inside the interval moves nothing: the caption and the stored row stay', out.c2 === out.c1 && out.r2.actual === out.r1.actual && out.r2.last === out.r1.last, out);
  q("UPDATE pa_goal SET datelastrun = datelastrun - interval '1 hour' WHERE pa_goal_id=" + GOAL_ID);
  out.c3 = await zkCaption(browser); out.r3 = legacyRow();
  log('§GOAL_STORE legacy step3 caption=' + out.c3 + ' row=' + JSON.stringify(out.r3));
  ck('L3 legacy: once the stored row is older than the interval, the render stores the new count and draws it', out.c3 !== out.c2 && out.r3.actual === out.r2.actual + 1, { c3: out.c3, r3: out.r3 });
  return out;
}
// ── the twin ──
async function twinRun(browser) {
  const server = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, buf) => { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(buf); }); });
  await new Promise(r => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port, ctx = await browser.newContext(), out = {};
  let pg, logs = [];
  const open = async () => { pg = await ctx.newPage(); logs = []; pg.on('console', m => { const t = m.text(); if (t.indexOf('§') === 0) logs.push(t); }); await pg.goto(url + '/erp/idempiere.html', { waitUntil: 'networkidle' }); await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 }); };
  const signIn = async () => {
    if (BREAK) { log('§GOAL_STORE_BREAK=1 ModelPA.storeDue removed'); await pg.evaluate(() => { if (window.ModelPA) window.ModelPA.storeDue = function () {}; }); }
    await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 20000 });
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible'); await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
    await pg.waitForSelector('#idmp-home .pi[data-goal-id="' + GOAL_ID + '"]', { timeout: 30000 });
  };
  // settled: the redraw over the tip + the store have had their turn (no fixed count of logs: an unbuilt twin never logs §GOAL_STORE)
  const settle = async () => { for (let i = 0; i < 40 && !logs.some(l => /^§GOAL_STORE /.test(l)); i++) await pg.waitForTimeout(250); await pg.waitForTimeout(800); };
  const caption = () => pg.evaluate(id => { const p = document.querySelector('#idmp-home .pi[data-goal-id="' + id + '"]'); return p ? p.querySelector('.pt').textContent : null; }, GOAL_ID);
  const row = () => pg.evaluate(id => new Promise(res => { const c = window.__crud, r = window.__idmpDb.exec('SELECT * FROM pa_goal WHERE pa_goal_id=' + id), base = r[0].values.map(v => { const o = {}; r[0].columns.forEach((k, i) => { o[k.toLowerCase()] = v[i]; }); return o; }); c.withSidecar(s => { const t = s ? c.core.listTip(s, 'pa_goal', 'pa_goal_id', base, null).rows : base; res(t[0]); }); }), GOAL_ID).then(r => ({ actual: Number(r.measureactual), last: r.datelastrun }));
  try {
    await open(); await pg.evaluate(() => indexedDB.databases().then(ds => Promise.all(ds.map(d => new Promise(r => { const x = indexedDB.deleteDatabase(d.name); x.onsuccess = x.onerror = x.onblocked = () => r(); }))))); await pg.close();
    await open(); const r0 = await pg.evaluate(id => window.__idmpDb.exec('SELECT measureactual, datelastrun FROM pa_goal WHERE pa_goal_id=' + id)[0].values[0], GOAL_ID);
    await signIn(); await settle();
    out.c1 = await caption(); out.r1 = await row(); out.store1 = logs.filter(l => /^§GOAL_STORE /.test(l));
    log('§GOAL_STORE twin before=' + JSON.stringify(r0) + ' step1 caption=' + out.c1 + ' row=' + JSON.stringify(out.r1) + ' ' + JSON.stringify(out.store1));
    ck('T1 twin: the first render stores the goal (DateLastRun 2007 → today)', String(r0[1]).slice(0, 4) === '2007' && isToday(out.r1.last), { before: r0[1], after: out.r1.last });
    const ops = await pg.evaluate(() => new Promise(res => window.__crud.withSidecar(s => { const r = s.exec("SELECT gid, parameters FROM kernel_ops WHERE op_type='CRUD_UPDATE'"); res(r.length ? r[0].values.map(v => ({ gid: v[0], p: JSON.parse(v[1]) })).filter(x => String(x.p.table).toLowerCase() === 'pa_goal') : []); })));
    const gids = new Set(ops.map(o => o.gid));
    ck('O the refresh ops are one group, every one marked teamLocal (' + ops.length + ' ops)', !BREAK && ops.length > 0 && gids.size === 1 && ops.every(o => o.p.teamLocal === 'goal-refresh'), { ops: ops.length, groups: gids.size, cols: ops[0] && Object.keys(ops[0].p.changes || {}) });
    const op = (table, fields) => ({ key: table, table, verb: 'create', op_uuid: null, op_type: 'CRUD_CREATE', fields: Object.assign({ ad_client_id: 11, ad_org_id: 11, isactive: 'Y', createdby: 101, updatedby: 101 }, fields), cas: null, stdDefaults: { actor: 101, clientId: 11, orgId: 11 } });
    const committed = await pg.evaluate(o => new Promise(res => window.__crud.applyOpGroup(o, r => res(!!(r && r.committed)))), [op('r_request', { r_requesttype_id: REQ_TYPE, documentno: 'W-GOAL-STORE', summary: 'W-GOAL-STORE', processed: 'N', duetype: '5', priority: '5' })]);
    log('§GOAL_STORE twin a new open request committed=' + committed);
    await pg.close(); await open(); await signIn(); await settle();
    out.c2 = await caption(); out.r2 = await row();
    log('§GOAL_STORE twin step2 caption=' + out.c2 + ' row=' + JSON.stringify(out.r2));
    ck('T2 twin: a new request inside the interval moves nothing: the caption and the stored row stay', committed && out.c2 === out.c1 && out.r2.actual === out.r1.actual && out.r2.last === out.r1.last, { c1: out.c1, c2: out.c2, r1: out.r1, r2: out.r2 });
    const aged = new Date(Date.parse(String(out.r2.last).replace(' ', 'T') + 'Z') - 3600000).toISOString().slice(0, 19).replace('T', ' ');
    const agedOk = await pg.evaluate(a => new Promise(res => window.__crud.applyOpGroup([a], r => res(!!(r && r.committed)))), { key: 'pa_goal', table: 'pa_goal', verb: 'update', op_uuid: null, op_type: 'CRUD_UPDATE', id: GOAL_ID, changes: { datelastrun: { old: null, new: aged } }, teamLocal: 'witness-aged' });
    log('§GOAL_STORE twin aged the stored row to ' + aged + ' committed=' + agedOk);
    await pg.close(); await open(); await signIn(); await settle();
    out.c3 = await caption(); out.r3 = await row();
    log('§GOAL_STORE twin step3 caption=' + out.c3 + ' row=' + JSON.stringify(out.r3));
    ck('T3 twin: once the stored row is older than the interval, the render stores the new count and draws it', out.c3 !== out.c2 && out.r3.actual === out.r2.actual + 1 && isToday(out.r3.last) && out.r3.last !== aged, { c3: out.c3, r3: out.r3 });
  } catch (e) { ck('twin crash', false, String(e && e.stack || e).slice(0, 400)); } finally { await ctx.close(); server.close(); }
  return out;
}
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-store-'));
  if (instanceUp()) { log('§GOAL_STORE_VERDICT INCONCLUSIVE the test instance is already running: someone may be using it'); process.exit(2); }
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  let L = null, T = null;
  try {
    L = await legacyRun(browser, tmp);
    T = await twinRun(browser);
    if (L && T) ['c1', 'c2', 'c3'].forEach((k, i) => ck('X' + (i + 1) + ' legacy\'s caption == the twin\'s at step ' + (i + 1), sameStep(L[k], T[k]) && !!L[k], { legacy: L[k], twin: T[k] }));
  } catch (e) { ck('crash', false, String(e && e.stack || e).slice(0, 500)); } finally {
    await browser.close();
    spawnSync('sh', [path.join(INSTANCE, 'stop.sh')]); for (let i = 0; i < 12 && instanceUp(); i++) await sleep(2500);
    log('§GOAL_STORE server stopped=' + !instanceUp());
    log('§GOAL_STORE clone dropped=' + (psqlOn('postgres', 'DROP DATABASE IF EXISTS ' + DB + ' WITH (FORCE);\n').code === 0));
    if (fails === 0) fs.rmSync(tmp, { recursive: true, force: true }); else log('§GOAL_STORE kept for reading: ' + tmp);
  }
  const v = fails ? 'FAIL' : inconclusive.length ? 'INCONCLUSIVE' : 'PASS';
  log('§GOAL_STORE_VERDICT ' + v + ' judged=' + judged + ' failed=' + fails + ' inconclusive=' + inconclusive.length);
  process.exit(fails ? 1 : v === 'INCONCLUSIVE' ? 2 : 0);
})();
