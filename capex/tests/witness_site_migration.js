#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SITE-MIG (spec bim-ootb prompts/CAPEX_DASHBOARD.md §5.30). READ THE LOG: verdict = §SITE_MIG_VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: "every CAPEX script hard-codes client 11, USD + BDT and the pilot's target numbers, so a real site cannot install the dashboard". It renders a site's scripts for a REAL
//   second tenant (ShopDay, client 1000000, on a clone of pilot_snap), applies them, runs a real server on the clone and reads that tenant's own ZK Home. The clone (capex_site_mig) is dropped at the end.
// Breaks (MUST FAIL): SITE_MIG_BREAK=1 (ids rendered onto a taken one: the apply stops) · SITE_MIG_BREAK=2 (MYR rendered with USD's currency id: the Home's numbers are wrong).
// Exit 0 PASS, 1 FAIL, 2 INCONCLUSIVE.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync, spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), TOOL = path.join(ROOT, 'capex/tools/site_migration.js'), S = require(TOOL), A = require('../adapters.js');
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const DB = 'capex_site_mig', SRC = 'pilot_snap', BREAK = process.env.SITE_MIG_BREAK || '', CLIENT = 1000000, ROLE = 1000000, USER = 'ShopDay1012142417Admin', ROLE_NAME = 'ShopDay1012142417 Admin';
const INSTANCE = path.join(os.homedir(), 'idempiere-bimplugin'), PORT = 8098, BASE = 'http://localhost:' + PORT, REST = BASE + '/ADInterface/services/rest/model_adservice/';
const WS_TABLES = ['ws_webservicetype', 'ws_webservicetypeaccess', 'ws_webservice_para', 'ws_webservicefieldinput', 'ws_webservicefieldoutput'];
const log = console.log, inconclusive = [];
let judged = 0, fails = 0;
function check(n, ok, info) { judged++; if (!ok) fails++; log('  §SITE_MIG ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (info !== undefined ? ' ' + JSON.stringify(info) : '')); }
function inc(n, why) { inconclusive.push(n); log('  §SITE_MIG ' + n + ' INCONCLUSIVE ' + why); }
function psqlOn(db, sql) { const r = spawnSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', db, '-v', 'ON_ERROR_STOP=1', '-qtA'], { input: sql, maxBuffer: 256 << 20 }); return { code: r.status, out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim() }; }
function q(sql) { const r = psqlOn(DB, 'SET search_path=adempiere;\n' + sql + ';'); if (r.code !== 0) throw new Error('psql: ' + r.err.slice(0, 300)); return r.out; }
const rows = sql => JSON.parse(q("SELECT COALESCE(json_agg(x),'[]') FROM (" + sql + ') x') || '[]');
const num = sql => Number(q(sql));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const instanceUp = () => spawnSync('pgrep', ['-f', '[i]dempiere-bimplugin/server/plugins/org.eclipse.equinox.launcher']).status === 0;

// G: what the tool renders for the pilot itself == what is shipped. Nothing lost, nothing added.
function golden() {
  const site = { client: 11, role: 102, currencies: [{ iso: 'USD', id: 100 }, { iso: 'BDT', id: 322 }], stamp: '202611050000', targets: { budget: { USD: 39971166.17, BDT: 30286701.64 }, activeProjects: 9 },
    nextIds: Object.fromEntries(S.ID_TABLES.map(t => [t, 2000000])) };
  const r = S.render(site);
  const all = S.PA_FILES.flatMap(f => S.parseScript(fs.readFileSync(path.join(S.PA_DIR, f), 'utf8')));
  const shipped = all.filter(x => !x.update), updates = all.filter(x => x.update);
  const nameKey = x => x.table + '|' + x.get('Name');
  const shippedName = {}; shipped.forEach(x => { shippedName[x.table + '#' + x.get(x.table + '_ID')] = x.get('Name'); });
  const renderedName = {}; r.pa.forEach(x => { renderedName[x.table + '#' + x.get(x.table + '_ID')] = x.get('Name'); });
  const byKey = new Map(r.pa.map(x => [nameKey(x), x])), diffs = [];
  const ASIDE = /(_ID$|_UU$|^Created$|^Updated$)/i, FK = { PA_Measure: [['PA_MeasureCalc_ID', 'PA_MeasureCalc']], PA_Goal: [['PA_Measure_ID', 'PA_Measure']] };
  let compared = 0;
  shipped.forEach(x => {
    const y = byKey.get(nameKey(x));
    if (!y) { diffs.push('missing ' + nameKey(x)); return; }
    const g7 = x.table === 'PA_Goal' ? updates.find(u => u.ids.includes(Number(x.get('PA_Goal_ID')))) : null;
    x.cols.forEach(c => {
      compared++;
      if (/^AD_Org_ID$|^AD_Table_ID$/i.test(c)) { if (x.get(c) !== y.get(c)) diffs.push(nameKey(x) + ' ' + c); return; }
      if (ASIDE.test(c)) return;
      let want = x.get(c);
      if (g7 && /^MeasureTarget$/i.test(c)) want = String(g7.target);
      if (want !== y.get(c)) diffs.push(nameKey(x) + ' ' + c + ': ' + String(want).slice(0, 70) + ' != ' + String(y.get(c)).slice(0, 70));
    });
    (FK[x.table] || []).forEach(([c, t]) => { compared++; if (shippedName[t + '#' + x.get(c)] !== renderedName[t + '#' + y.get(c)]) diffs.push(nameKey(x) + ' FK ' + c); });
    if (g7) { compared++; const gray = g7.schema === 1000000 ? r.grayId : g7.schema; if (Number(y.get('PA_ColorSchema_ID')) !== gray) diffs.push(nameKey(x) + ' schema ' + y.get('PA_ColorSchema_ID') + ' != ' + gray); }
  });
  check('G1 rendered for the pilot, row count == shipped (' + shipped.length + ')', r.pa.length === shipped.length, { rendered: r.pa.length });
  // the shipped USD and BDT rows of one family were written by hand and differ only here: a template cannot reproduce this wording, and the difference is words in a description
  const named = d => /Approved Budget \(BDT\)' Description/.test(d);
  const unnamed = diffs.filter(d => !named(d)), seen = diffs.filter(named);
  log('§SITE_MIG golden cells compared=' + compared + ' diffs=' + diffs.length + ' ' + JSON.stringify(diffs.slice(0, 8)));
  check('G2 every column == shipped, ' + compared + ' cells; the only differences are named', compared > 0 && !unnamed.length, unnamed.slice(0, 8));
  const shipWs = S.parseScript(fs.readFileSync(path.join(S.WS_DIR, S.WS_FILE), 'utf8')), wsDiff = [];
  shipWs.forEach((x, i) => { const y = r.ws[i]; x.cols.forEach(c => { if (!/(_ID$|_UU$|^Created$|^Updated$)/i.test(c) && x.get(c) !== y.get(c)) wsDiff.push(x.table + ' ' + c); }); });
  check('G3 the read types: ' + shipWs.length + ' rows, every column == shipped apart from ids, UU, dates', r.ws.length === shipWs.length && !wsDiff.length, wsDiff.slice(0, 8));
  check('G4 the named difference is seen: 3 Description cells of Approved Budget (BDT) (a rule that matches nothing fails)', seen.length === 3, seen);
}
// N: refusals, exit 2 and no file
function refusals(tmp, pre) {
  const cases = [
    ['no role', pre, []],
    ['a role of another client', pre, ['--role', '102']],
    ['no project currency', Object.assign({}, pre, { currencies: [] }), ['--role', String(ROLE)]],
    ['a read type already there', Object.assign({}, pre, { existingTypes: [{ value: 'QueryCProject', client: 0 }] }), ['--role', String(ROLE)]],
    ['CAPEX goals already there', Object.assign({}, pre, { existingGoals: 3 }), ['--role', String(ROLE)]]
  ];
  cases.forEach(([n, p, args], i) => {
    const f = path.join(tmp, 'pre' + i + '.json'), out = path.join(tmp, 'no' + i); fs.writeFileSync(f, JSON.stringify(p));
    const r = spawnSync('node', [TOOL, f, '--out', out].concat(args), { encoding: 'utf8' });
    check('N refused: ' + n + ' (exit 2, no file)', r.status === 2 && !fs.existsSync(out) && /§SITE_MIG refused/.test(r.stdout), { exit: r.status, said: String(r.stdout).trim().slice(0, 130) });
  });
}
function fixture() {
  const myr = num("SELECT c_currency_id FROM c_currency WHERE iso_code='MYR'");
  ['QueryCProject', 'QueryADOrg'].forEach(v => {
    const w = "ws_webservicetype_id IN (SELECT ws_webservicetype_id FROM ws_webservicetype WHERE value='" + v + "')";
    WS_TABLES.slice(1).forEach(t => q('DELETE FROM ' + t + ' WHERE ' + w)); q('DELETE FROM ws_webservicetype WHERE value=\'' + v + '\'');
  });
  q('UPDATE c_project SET plannedamt=1000 WHERE ad_client_id=' + CLIENT);
  [[1900001, 'SITE_MIG_A', 2500], [1900002, 'SITE_MIG_B', 500]].forEach(([id, value, amt]) => {
    const f = psqlOn(DB, 'SET search_path=adempiere;\nCREATE TEMP TABLE t AS SELECT * FROM c_project WHERE ad_client_id=' + CLIENT + " AND value='Standard';\nUPDATE t SET c_project_id=" + id + ",value='" + value + "',name='" + value + "',c_currency_id=" + myr + ',plannedamt=' + amt + ',c_project_uu=gen_random_uuid();\nINSERT INTO c_project SELECT * FROM t;\n');
    if (f.code !== 0) throw new Error('fixture: ' + f.err.slice(0, 300));
  });
  log('§SITE_MIG fixture tenant projects ' + rows('SELECT p.value, cu.iso_code AS iso, p.plannedamt AS amt FROM c_project p JOIN c_currency cu USING (c_currency_id) WHERE p.ad_client_id=' + CLIENT + ' ORDER BY 1').map(r => r.value + ':' + r.iso + ':' + r.amt).join(' ') + ' · client 11 projects=' + num('SELECT COUNT(*) FROM c_project WHERE ad_client_id=11'));
  return myr;
}
function applyFile(file) { const r = psqlOn(DB, fs.readFileSync(file, 'utf8')); log('§SITE_MIG_APPLY file=' + path.basename(file) + ' exit=' + r.code + (r.code ? ' err=' + JSON.stringify(r.err.slice(0, 260)) : '')); return r.code === 0; }

async function zkHome(role) {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), c = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), z = await c.newPage();
  const caps = () => [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /^CAPEX /.test((e.textContent || '').trim())).map(e => e.textContent.trim()).sort();
  try {
    await z.goto(BASE + '/webui/', { waitUntil: 'load', timeout: 60000 }); await z.waitForSelector('input[type=password]', { timeout: 40000 }); await z.waitForTimeout(800);
    const ins = await z.$$('input:not([type=password]):not([type=checkbox])'); await ins[0].fill(USER); await ins[0].press('Tab'); await z.fill('input[type=password]', USER); await z.press('input[type=password]', 'Tab'); await z.waitForTimeout(400);
    if (!(await z.evaluate(() => { const x = [...document.querySelectorAll('input[type=checkbox]')].find(y => /Select Role/.test(y.parentElement.textContent)); return x && x.checked; }))) { await z.click('label:has-text("Select Role")'); await z.waitForTimeout(500); }
    await z.click('button.btn-ok'); await z.waitForFunction(() => document.querySelectorAll('input.z-combobox-input').length >= 3, null, { timeout: 25000 }); await z.waitForTimeout(1000);
    const cb = await z.$$('input.z-combobox-input'); await cb[1].click(); await cb[1].fill(role); await cb[1].press('Tab'); await z.waitForTimeout(1200); await z.click('button.btn-ok');
    await z.waitForFunction(() => [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /^CAPEX /.test((e.textContent || '').trim())).length >= 27, null, { timeout: 60000 }).catch(() => {});
    return await z.evaluate(caps);
  } finally { await browser.close(); }
}
async function endOfChain(tmp, myr, lowestIds) {
  const props = path.join(tmp, 'idempiere.properties'), home = path.join(INSTANCE, 'server');
  fs.writeFileSync(props, fs.readFileSync(path.join(home, 'idempiere.properties'), 'utf8').split('idempiere_bimplugin').join(DB));
  const out = fs.openSync(path.join(tmp, 'server.log'), 'a');
  spawn('sh', [path.join(home, 'idempiere-server.sh')], { detached: true, stdio: ['ignore', out, out], cwd: home, env: Object.assign({}, process.env, { JAVA_OPTS: '-Xmx2048M -DIDEMPIERE_HOME=' + home + ' -DPropertyFile=' + props, TELNET_PORT: '12613' }) }).unref();
  const login = { user: USER, pass: USER, lang: 'en_US', ClientID: CLIENT, RoleID: ROLE, OrgID: CLIENT, WarehouseID: CLIENT, stage: 0 };
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { const r = await fetch(REST + 'query_data', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ModelCRUDRequest: { ModelCRUD: { serviceType: 'QueryCCurrency' }, ADLoginRequest: login } }) }); const t = await r.text(); if (r.status === 200 && /WindowTabData/.test(t)) up = true; else if (i === 40) log('§SITE_MIG server says: ' + t.slice(0, 200)); } catch (e) { /* not listening yet */ }
    if (!up) await sleep(5000);
  }
  if (!up) { inc('E', 'the tenant could not read on the server in 300 s: ' + path.join(tmp, 'server.log')); return; }
  const file = path.join(tmp, 'site.json');
  const snap = spawnSync('node', [path.join(ROOT, 'capex/tools/legacy_snapshot.js'), file], { env: Object.assign({}, process.env, { BRIDGE_BASE: BASE, BRIDGE_USER: USER, BRIDGE_PASS: USER, BRIDGE_CLIENT: String(CLIENT), BRIDGE_ROLE: String(ROLE), BRIDGE_ORG: String(CLIENT), BRIDGE_WH: String(CLIENT) }), encoding: 'utf8' });
  log('  ' + String(snap.stdout || snap.stderr).trim().replace(file, 'site.json'));
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('E1 the dashboard job, signed in as the tenant: 8 of 8, no core entity unavailable (the optional BIM Document entity may be absent: the pilot has no such table)', d.unavailable.filter(u => !A.OPTIONAL.includes(u)).length === 0, d.unavailable);
  check('E2 it reads the tenant\'s 3 projects and no other client\'s', d.projects.length === 3 && d.projects.every(p => Number(p.AD_Client_ID === undefined ? CLIENT : p.AD_Client_ID) === CLIENT), d.projects.map(p => p.Value));
  const other = await fetch(REST + 'query_data', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ModelCRUDRequest: { ModelCRUD: { serviceType: 'QueryCProject' }, ADLoginRequest: { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', ClientID: 11, RoleID: 102, OrgID: 11, WarehouseID: 103, stage: 0 } } }) });
  const ot = await other.text();
  check('E3 another tenant\'s user cannot use these types (no project row comes back)', !/WindowTabData[\s\S]*DataRow/.test(ot), { said: ot.slice(0, 130) });
  const titles = await zkHome(ROLE_NAME);
  log('§SITE_MIG zk captions=' + titles.length + ' ' + JSON.stringify(titles));
  check('E4 the tenant\'s real ZK Home shows 27 CAPEX captions', titles.length === 27, { captions: titles.length });
  check('E5 they name MYR, and no BDT', titles.some(t => /\(MYR\)/.test(t)) && !titles.some(t => /BDT/.test(t)));
  const goals = rows('SELECT name, measureactual AS a, measuretarget AS t, pa_colorschema_id AS s, datelastrun IS NOT NULL AS ran FROM pa_goal WHERE ad_client_id=' + CLIENT + " AND name LIKE 'CAPEX %'"), g = Object.fromEntries(goals.map(x => [x.name, x]));
  log('§SITE_MIG stored ' + goals.filter(x => /Total|Approved|Actual Cost/.test(x.name)).map(x => x.name.replace('CAPEX ', '') + '=' + x.a + ' t=' + x.t + ' s=' + x.s).join(' · '));
  check('E6 legacy computed all 27 goals when the Home rendered', goals.length === 27 && goals.every(x => x.ran), { ran: goals.filter(x => x.ran).length });
  check('E7 Total Projects 3: this tenant only', Number((g['CAPEX Total Projects'] || {}).a) === 3, g['CAPEX Total Projects']);
  check('E8 Approved Budget USD 1000', Number((g['CAPEX Approved Budget (USD)'] || {}).a) === 1000, g['CAPEX Approved Budget (USD)']);
  check('E9 Approved Budget MYR 3000', Number((g['CAPEX Approved Budget (MYR)'] || {}).a) === 3000, g['CAPEX Approved Budget (MYR)']);
  const usd = g['CAPEX Actual Cost (USD)'] || {}, m = g['CAPEX Actual Cost (MYR)'] || {}, gray = lowestIds.PA_ColorSchema;
  check('E10 target stated for USD only: USD cost goal on schema 101 with its target, MYR on the gray schema with 0', Number(usd.s) === 101 && Number(usd.t) === 1000 && Number(m.s) === gray && Number(m.t) === 0, { usd, m, gray });
  check('E11 target stated for the active projects: Health Green on schema 100, target 3', Number((g['CAPEX Health Green'] || {}).s) === 100 && Number((g['CAPEX Health Green'] || {}).t) === 3, g['CAPEX Health Green']);
  const c11 = num('SELECT COUNT(*) FROM pa_goal WHERE ad_client_id=11 AND name LIKE \'CAPEX %\'');
  check('E12 nothing landed in client 11', c11 === 0, { c11 });
}

(async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'site-mig-'));
  let started = false;
  log('§SITE_MIG start' + (BREAK ? ' BREAK=' + BREAK : ''));
  if (instanceUp()) { log('§SITE_MIG_VERDICT INCONCLUSIVE the test instance is already running: someone may be using it'); process.exit(2); }
  const adm = psqlOn('postgres', 'DROP DATABASE IF EXISTS ' + DB + ' WITH (FORCE);\nCREATE DATABASE ' + DB + ' TEMPLATE ' + SRC + ';\n');
  if (adm.code !== 0) { log('§SITE_MIG_VERDICT INCONCLUSIVE could not clone ' + SRC + ': ' + adm.err.slice(0, 200)); process.exit(2); }
  try {
    golden();
    const myr = fixture();
    const pfSql = spawnSync('node', [TOOL, '--preflight', String(CLIENT)], { encoding: 'utf8' }).stdout;
    const pf = psqlOn(DB, pfSql);
    check('P the preflight is read-only SQL and returns one line of JSON', pf.code === 0 && !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/.test(pfSql.replace(/^--.*$/gm, '')) && pf.out.split('\n').length === 1, { code: pf.code, err: pf.err.slice(0, 200) });
    const pre = JSON.parse(pf.out);
    log('§SITE_MIG preflight client=' + pre.client + ' ' + pre.clientValue + ' roles=' + pre.roles.map(r => r.id).join(',') + ' currencies=' + pre.currencies.map(c => c.iso + ':' + c.id).join(',') + ' nextIds=' + JSON.stringify(pre.nextIds) + ' existingTypes=' + pre.existingTypes.length + ' existingGoals=' + pre.existingGoals);
    check('P2 the currencies are what the tenant\'s projects hold: USD, MYR', pre.currencies.map(c => c.iso).sort().join() === 'MYR,USD', pre.currencies);
    refusals(tmp, pre);
    const taken = { WS_WebServiceType: num('SELECT MAX(ws_webservicetype_id) FROM ws_webservicetype') };
    const pre2 = JSON.parse(JSON.stringify(pre));
    if (BREAK === '1') { pre2.nextIds.WS_WebServiceType = taken.WS_WebServiceType; log('§SITE_MIG_BREAK=1 renders WS_WebServiceType ids from the taken id ' + taken.WS_WebServiceType); }
    if (BREAK === '2') { pre2.currencies.find(c => c.iso === 'MYR').id = pre2.currencies.find(c => c.iso === 'USD').id; log('§SITE_MIG_BREAK=2 renders MYR with USD\'s currency id'); }
    const preFile = path.join(tmp, 'preflight.json'), tf = path.join(tmp, 'targets.json'), outDir = path.join(tmp, 'site');
    fs.writeFileSync(preFile, JSON.stringify(pre2)); fs.writeFileSync(tf, JSON.stringify({ budget: { USD: 1000 }, activeProjects: 3 }));
    const ren = spawnSync('node', [TOOL, preFile, '--role', String(ROLE), '--out', outDir, '--targets', tf], { encoding: 'utf8' });
    log(String(ren.stdout).trim());
    check('A0 rendered', ren.status === 0, { exit: ren.status, err: String(ren.stderr).slice(0, 200) });
    const files = fs.readdirSync(outDir).sort(), texts = files.map(f => fs.readFileSync(path.join(outDir, f), 'utf8')).join('\n');
    check('A1 two scripts, plain INSERTs after the register line; no pilot number, no BDT, no client 11', files.length === 2 && !/39971166|30286701|\bBDT\b|DO \$\$|nextidfunc|gen_random_uuid/.test(texts), files);
    const parsed = files.flatMap(f => S.parseScript(fs.readFileSync(path.join(outDir, f), 'utf8')));
    check('A2 every row: client ' + CLIENT + ', role ' + ROLE + ' on access (' + parsed.length + ' rows)', parsed.every(r => Number(r.get('AD_Client_ID')) === CLIENT) && parsed.filter(r => r.table === 'WS_WebServiceTypeAccess').every(r => Number(r.get('AD_Role_ID')) === ROLE));
    const low = BREAK === '1' ? [] : parsed.filter(r => r.get(r.table + '_ID') !== undefined && r.table !== 'WS_WebServiceTypeAccess' && Number(r.get(r.table + '_ID')) < pre.nextIds[r.table]);
    check('A3 every new id is at or above the preflight\'s free band', !low.length, low.length);
    const before = { ws: WS_TABLES.map(t => num('SELECT COUNT(*) FROM ' + t)), pa: num('SELECT COUNT(*) FROM pa_goal') };
    let stopped = null;
    for (const f of files) { if (!stopped && !applyFile(path.join(outDir, f))) stopped = f; }
    check('A4 both apply with ON_ERROR_STOP, in name order', !stopped, { stopped });
    if (stopped) throw new Error('stopped at ' + stopped + ': nothing after the apply can be judged');
    q('SELECT update_sequences()');
    const newWs = WS_TABLES.map(t => parsed.filter(r => r.table.toLowerCase() === t).length), after = WS_TABLES.map(t => num('SELECT COUNT(*) FROM ' + t));
    check('A5 existing rows unmoved: each WS table grew by exactly what the script holds', after.every((n, i) => n === before.ws[i] + newWs[i]), { before: before.ws, newWs, after });
    const reg = rows('SELECT name, COUNT(*)::int AS n FROM ad_migrationscript WHERE name IN (\'' + files.join("','") + "') GROUP BY name");
    check('A6 each registered once', reg.length === 2 && reg.every(r => r.n === 1), reg);
    const grayId = parsed.find(r => r.table === 'PA_ColorSchema').get('PA_ColorSchema_ID');
    started = true;
    await endOfChain(tmp, myr, { PA_ColorSchema: Number(grayId) });
  } catch (e) { check('crash', false, String(e && e.stack || e).slice(0, 500)); } finally {
    if (started) { spawnSync('sh', [path.join(INSTANCE, 'stop.sh')]); for (let i = 0; i < 12 && instanceUp(); i++) await sleep(2500); log('§SITE_MIG server stopped=' + !instanceUp()); }
    if (fails === 0) fs.rmSync(tmp, { recursive: true, force: true }); else log('§SITE_MIG kept for reading: ' + tmp);
    log('§SITE_MIG clone dropped=' + (psqlOn('postgres', 'DROP DATABASE IF EXISTS ' + DB + ' WITH (FORCE);\n').code === 0));
  }
  const v = fails ? 'FAIL' : (inconclusive.length) ? 'INCONCLUSIVE' : 'PASS';
  log('§SITE_MIG_VERDICT ' + v + ' judged=' + judged + ' failed=' + fails + ' inconclusive=' + inconclusive.length + (inconclusive.length ? ' [' + inconclusive.join('; ') + ']' : ''));
  process.exit(fails ? 1 : v === 'INCONCLUSIVE' ? 2 : 0);
})();
