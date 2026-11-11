#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-WS-MIG (spec bim-ootb prompts/CAPEX_DASHBOARD.md §5.29). READ THE LOG: verdict = §WS_MIG_VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: "the CAPEX web-service types exist only as ad-hoc scripts plus rows other lanes left on the pilot, so a clean iDempiere cannot get them the way iDempiere ships its own
//   changes". It applies the migration scripts to a clone of the stock DB, compares every row to the pilot, then runs a real server on that clone and calls every type, 24 of 24.
// The pilot is only read. The clone (capex_ws_mig) is dropped at the end. The server is the stopped test instance ~/idempiere-bimplugin, pointed at the clone by -DPropertyFile, on :8098.
// Breaks (MUST FAIL): WS_MIG_BREAK=1 (one output row missing from a script: R) · WS_MIG_BREAK=2 (read-type access flipped to read-write: S). Both stop before the server.
// Exit 0 PASS, 1 FAIL, 2 INCONCLUSIVE.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync, spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), MA = require('../tools/migration_apply.js'), A = require('../adapters.js'), Push = require(path.join(ROOT, 'viewer/erp_rest_push.js'));
const SITE = path.join(ROOT, 'capex/legacy/ws/migration/iD13/postgresql'), TEST = path.join(ROOT, 'capex/legacy/ws_testserver/migration/iD13/postgresql');
const DB = 'capex_ws_mig', STOCK = 'idempiere', PILOT = 'idempiere_pilot', BREAK = process.env.WS_MIG_BREAK || '';
const INSTANCE = path.join(os.homedir(), 'idempiere-bimplugin'), BASE = 'http://localhost:8098', REST = BASE + '/ADInterface/services/rest/model_adservice/';
const WS_TABLES = [['ws_webservicetype', 'ws_webservicetype_id'], ['ws_webservicetypeaccess', null], ['ws_webservice_para', 'ws_webservice_para_id'], ['ws_webservicefieldinput', 'ws_webservicefieldinput_id'], ['ws_webservicefieldoutput', 'ws_webservicefieldoutput_id']];
const log = console.log, inconclusive = [];
let judged = 0, fails = 0;
function check(n, ok, info) { judged++; if (!ok) fails++; log('  §WS_MIG ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (info !== undefined ? ' ' + JSON.stringify(info) : '')); }
function inc(n, why) { inconclusive.push(n); log('  §WS_MIG ' + n + ' INCONCLUSIVE ' + why); }

function psqlOn(db, sql, extra) {
  const r = spawnSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', db, '-v', 'ON_ERROR_STOP=1'].concat(extra || ['-qtA']), { input: sql, maxBuffer: 256 << 20 });
  return { code: r.status, out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim() };
}
function q(db, sql) { const r = psqlOn(db, sql); if (r.code !== 0) throw new Error('psql ' + db + ': ' + r.err.slice(0, 300)); return r.out; }
const rows = (db, sql) => JSON.parse(q(db, "SELECT COALESCE(json_agg(x),'[]') FROM (" + sql + ') x;') || '[]');
const num = (db, sql) => Number(q(db, sql + ';'));
const sqlList = a => "'" + a.join("','") + "'";

const scripts = [SITE, TEST].flatMap(d => fs.readdirSync(d).filter(f => /^\d{12}_.*\.sql$/.test(f)).map(f => ({ dir: d, name: f, text: fs.readFileSync(path.join(d, f), 'utf8') }))).sort((a, b) => a.name < b.name ? -1 : 1);
const typesOf = t => [...t.matchAll(/^-- Nov 4, 2026 — (\S+)$/gm)].map(m => m[1]);
const ALL = scripts.flatMap(s => typesOf(s.text)), SITE_TYPES = scripts.filter(s => s.dir === SITE).flatMap(s => typesOf(s.text));

function formChecks() {
  scripts.forEach(s => {
    const st = MA.split(s.text), first = st[0] || '', rest = st.slice(1);
    const bad = rest.filter(x => !/^INSERT\s+INTO\s+WS_/i.test(x) || !/_UU\b/i.test(x.slice(0, x.indexOf(' VALUES '))));
    check('F ' + s.name + ': first statement registers itself; ' + rest.length + ' plain INSERTs, each with a *_UU; no DO / nextidfunc / gen_random_uuid',
      first === "SELECT register_migration_script('" + s.name + "') FROM dual" && rest.length > 0 && !bad.length && !/\bDO \$\$|nextidfunc|gen_random_uuid/i.test(s.text), { statements: st.length, bad: bad.length });
  });
}
function breakText(s) {
  if (BREAK === '1' && /WS-READ/.test(s.name)) { const m = /^INSERT INTO WS_WebServiceFieldOutput [^\n]*\n;\n/m.exec(s.text); log('§WS_MIG_BREAK=1 drops one output row from ' + s.name); return s.text.replace(m[0], ''); }
  if (BREAK === '2' && /WS-READ/.test(s.name)) { log('§WS_MIG_BREAK=2 flips the read types to read-write in ' + s.name); return s.text.replace(/^(INSERT INTO WS_WebServiceTypeAccess [^\n]*,'Y',)'N'(,TO_TIMESTAMP)/gm, "$1'Y'$2"); }
  return s.text;
}
function applyChecks() {
  const before = num(DB, 'SET search_path=adempiere; SELECT COUNT(*) FROM ws_webservicetype WHERE value IN (' + sqlList(ALL) + ')');
  if (before !== 0) { inc('A0', 'the clone already holds ' + before + ' of the types: it proves nothing'); return false; }
  log('§WS_MIG clean server: 0 of ' + ALL.length + ' types present, stock total=' + num(DB, 'SET search_path=adempiere; SELECT COUNT(*) FROM ws_webservicetype'));
  let stopped = null;
  scripts.forEach(s => {
    if (stopped) return;
    const r = psqlOn(DB, breakText(s), ['-q', '-t', '-A']);         // as SyncDB.sh runs a file: no SET, the role's own search_path
    log('§WS_MIG_APPLY file=' + s.name + ' exit=' + r.code + ' errors=' + (r.err.match(/ERROR/g) || []).length + (r.code ? ' err=' + JSON.stringify(r.err.slice(0, 300)) : ''));
    if (r.code !== 0) stopped = s.name;
  });
  check('A1 every script applies with ON_ERROR_STOP, in name order', !stopped, { stopped });
  if (stopped) return false;
  const reg = rows(DB, 'SELECT name, COUNT(*)::int AS n, MAX(status) AS status FROM adempiere.ad_migrationscript WHERE name IN (' + sqlList(scripts.map(s => s.name)) + ') GROUP BY name');
  check('A2 each script registered once, Status CO', reg.length === scripts.length && reg.every(r => r.n === 1 && r.status === 'CO'), reg);
  q(DB, 'SET search_path=adempiere; SELECT update_sequences();');
  WS_TABLES.filter(t => t[1]).forEach(([t, k]) => {
    const max = num(DB, 'SET search_path=adempiere; SELECT MAX(' + k + ') FROM ' + t), next = num(DB, "SET search_path=adempiere; SELECT currentnext FROM ad_sequence WHERE lower(name)='" + t + "' AND istableid='Y'");
    check('A3 update_sequences: ' + t + ' next ' + next + ' is past MAX ' + max, next > max, { next, max });
  });
  return true;
}
function rowChecks() {
  const ids = rows(PILOT, 'SELECT ws_webservicetype_id AS id, value FROM adempiere.ws_webservicetype WHERE value IN (' + sqlList(ALL) + ')');
  check('R0 the pilot holds ' + ALL.length + ' of ' + ALL.length + ' types', ids.length === ALL.length, { pilot: ids.length });
  const list = ids.map(i => i.id).join(','), name = Object.fromEntries(ids.map(i => [i.id, i.value]));
  const strip = r => { const o = Object.assign({}, r); delete o.created; delete o.updated; return JSON.stringify(o); };
  const unmatched = []; let compared = 0, roleSeen = 0, filterSeen = 0;
  WS_TABLES.forEach(([t, k]) => {
    const sel = 'SELECT * FROM adempiere.' + t + ' WHERE ws_webservicetype_id IN (' + list + ')';
    const P = rows(PILOT, sel), S = rows(DB, sel), key = r => k ? r[k] : r.ws_webservicetype_id + '/' + r.ad_role_id, sMap = new Map(S.map(r => [key(r), r])), pKeys = new Set(P.map(key));
    P.forEach(r => {
      compared++;
      const got = sMap.get(key(r));
      if (t === 'ws_webservicetypeaccess' && r.ad_role_id !== 102 && !got) { roleSeen++; return; }     // §5.29 point 4
      if (t === 'ws_webservice_para' && name[r.ws_webservicetype_id] === 'QueryADOrg' && r.parametername === 'Filter' && r.parametertype === 'F' && got && got.parametertype === 'C' && got.constantvalue === '1=1') { filterSeen++; return; }     // §5.29 point 3
      if (!got || strip(got) !== strip(r)) unmatched.push(t + ':' + key(r) + (got ? ' differs' : ' missing'));
    });
    S.forEach(r => { if (!pKeys.has(key(r))) unmatched.push(t + ':' + key(r) + ' not on the pilot'); });
    const low = k ? S.filter(r => r[k] < 1000000).length : 0, noUU = S.filter(r => !r[t + '_uu']).length;
    check('R1 ' + t + ': every id >= 1000000, every row has its UU', !low && !noUU && S.length > 0, { rows: S.length, low, noUU });
  });
  check('R2 every column except created/updated == the pilot, ' + compared + ' pilot rows compared', compared > 0 && !unmatched.length, unmatched.slice(0, 8));
  check('R3 the named exception "role 1000000 access rows are not shipped" is seen, 4 rows (a rule that matches nothing fails)', roleSeen === 4, { roleSeen });
  check('R4 the named exception "QueryADOrg Filter is Free on the pilot, Constant 1=1 in the script" is seen, 1 row', filterSeen === 1, { filterSeen });
}
function separationChecks() {
  const siteScripts = fs.readdirSync(SITE), wanted = Object.keys(A.LEGACY_TYPES).filter(e => !A.OPTIONAL.includes(e)).map(e => A.LEGACY_TYPES[e]).sort();   // the OPTIONAL entity (BIM Document, §5.36B) has its own script under capex/legacy/ws/bimdoc
  check('S1 the site folder holds one script, its types == capex/adapters.js LEGACY_TYPES, ' + wanted.length + ' of ' + wanted.length, siteScripts.length === 1 && JSON.stringify(SITE_TYPES.slice().sort()) === JSON.stringify(wanted), { siteScripts, SITE_TYPES });
  const r = rows(DB, 'SELECT t.value, m.value AS method, a.isreadwrite AS rw, a.ad_role_id AS role FROM adempiere.ws_webservicetype t JOIN adempiere.ws_webservicemethod m USING (ws_webservicemethod_id) JOIN adempiere.ws_webservicetypeaccess a USING (ws_webservicetype_id) WHERE t.value IN (' + sqlList(SITE_TYPES) + ')');
  check('S2 every site type is queryData with isreadwrite=N (' + r.length + ' access rows)', r.length === SITE_TYPES.length && r.every(x => x.method === 'queryData' && x.rw === 'N'), r.filter(x => x.method !== 'queryData' || x.rw !== 'N'));
  check('S3 no script of the test-server folder is in the site folder; no type in both', !scripts.filter(s => s.dir === TEST).some(s => siteScripts.includes(s.name)) && !scripts.filter(s => s.dir === TEST).flatMap(s => typesOf(s.text)).some(v => SITE_TYPES.includes(v)));
  const inTwinFolder = fs.readdirSync(path.join(ROOT, 'capex/legacy/migration/iD13/postgresql')).filter(f => /CAPEX-WS/.test(f));
  check('S4 none is in capex/legacy/migration (the folder the twin applies, W-MIG-SYNC)', !inTwinFolder.length, inTwinFolder);
}

// ── E: a real server on the clone ──
const xmlLogin = { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', clientId: 11, roleId: 102, orgId: 11, warehouseId: 103, stage: 0 };
const jsonLogin = { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', ClientID: 11, RoleID: 102, OrgID: 11, WarehouseID: 103, stage: 0 };
const instanceUp = () => spawnSync('pgrep', ['-f', '[i]dempiere-bimplugin/server/plugins/org.eclipse.equinox.launcher']).status === 0;
function startServer(tmp) {
  const home = path.join(INSTANCE, 'server'), props = path.join(tmp, 'idempiere.properties');
  fs.writeFileSync(props, fs.readFileSync(path.join(home, 'idempiere.properties'), 'utf8').split('idempiere_bimplugin').join(DB));
  const out = fs.openSync(path.join(tmp, 'server.log'), 'a');
  const p = spawn('sh', [path.join(home, 'idempiere-server.sh')], { detached: true, stdio: ['ignore', out, out], cwd: home, env: Object.assign({}, process.env, { JAVA_OPTS: '-Xmx2048M -DIDEMPIERE_HOME=' + home + ' -DPropertyFile=' + props, TELNET_PORT: '12613' }) });
  p.unref();
}
function stopServer() { spawnSync('sh', [path.join(INSTANCE, 'stop.sh')]); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(REST + 'query_data', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ModelCRUDRequest: { ModelCRUD: { serviceType: 'QueryCCurrency' }, ADLoginRequest: jsonLogin } }) });
      const t = await r.text();
      if (r.status === 200 && /WindowTabData/.test(t)) return i * 5;
    } catch (e) { /* not listening yet */ }
    await sleep(5000);
  }
  return -1;
}
async function crud(method, spec) {
  const r = await fetch(REST + method, { method: 'POST', headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }, body: Push.buildCrudXml(xmlLogin, spec) });
  const text = await r.text(), s = Push.parseStandardResponse(text);
  return { http: r.status, isError: !!s.isError || r.status !== 200, error: s.error || (r.status !== 200 ? text.slice(0, 200) : ''), recordId: s.recordId };
}
const fieldsOf = o => Object.keys(o).map(column => ({ column, val: String(o[column]) }));
const create = (serviceType, tableName, f) => crud('create_data', { serviceType, tableName, action: 'Create', fields: fieldsOf(f) });
const update = (serviceType, tableName, recordId, f) => crud('update_data', { serviceType, tableName, action: 'Update', recordId, fields: fieldsOf(f) });
const one = sql => q(DB, 'SET search_path=adempiere; ' + sql + ';');

async function endOfChain(tmp) {
  const done = new Set(), mark = (t, ok, info, note) => { check('E ' + t + (note ? ' (' + note + ')' : ''), ok, info); if (ok) done.add(t); };
  const snapshot = tag => {
    const file = path.join(tmp, tag + '.json');
    const r = spawnSync('node', [path.join(ROOT, 'capex/tools/legacy_snapshot.js'), file], { env: Object.assign({}, process.env, { BRIDGE_BASE: BASE }), encoding: 'utf8' });
    log('  ' + String(r.stdout || r.stderr).trim().replace(file, tag + '.json'));
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  };
  const s0 = snapshot('before_writes');
  check('E0 legacy_snapshot.js (the dashboard job) reads 8 of 8 with no entity unavailable, on rows the scripts alone set up', s0.unavailable.filter(u => !A.OPTIONAL.includes(u)).length === 0, s0.unavailable);   // bimdocs is optional: this server has no BIM Document plugin

  const stock = rows(DB, "SELECT projinvoicerule, projectlinelevel, c_currency_id, value FROM adempiere.c_project WHERE ad_client_id=11 ORDER BY c_project_id LIMIT 1")[0];
  const found = await Push.queryRows(BASE, xmlLogin, 'QueryCProject', 'C_Project', [{ column: 'Value', val: stock.value }]);
  check('E1 a DataRow-key lookup finds a project with no Filter sent (IDEMPIERE-1784 path)', found.length === 1, { value: stock.value, rows: found.length });
  const nProj = Number(one('SELECT COUNT(*) FROM c_project'));
  const refused = await create('QueryCProject', 'C_Project', { Value: 'WS_MIG_READONLY', Name: 'WS_MIG_READONLY', C_Currency_ID: stock.c_currency_id });
  check('E2 a write through a read type is refused and no row appears', refused.isError && Number(one('SELECT COUNT(*) FROM c_project')) === nProj, { error: String(refused.error).slice(0, 120) });

  const product = one("SELECT value FROM m_product WHERE ad_client_id=11 AND isactive='Y' AND producttype='I' ORDER BY m_product_id LIMIT 1");
  const pRows = await Push.queryRows(BASE, xmlLogin, 'QueryMProduct', 'M_Product', [{ column: 'Value', val: product }]);
  mark('QueryMProduct', pRows.length === 1, { product });
  const productId = one("SELECT m_product_id FROM m_product WHERE ad_client_id=11 AND value='" + product.replace(/'/g, "''") + "'");
  const cat = one('SELECT name FROM m_product_category WHERE ad_client_id=11 ORDER BY m_product_category_id LIMIT 1');
  mark('QueryMProductCategory', (await Push.queryRows(BASE, xmlLogin, 'QueryMProductCategory', 'M_Product_Category', [{ column: 'Name', val: cat }])).length === 1, { cat });
  mark('QueryCUOM', (await Push.queryRows(BASE, xmlLogin, 'QueryCUOM', 'C_UOM', [{ column: 'X12DE355', val: 'EA' }])).length >= 1);

  const uom = await create('BridgeCreateCUOM', 'C_UOM', { X12DE355: 'WSM', Name: 'WS Mig', UOMSymbol: 'WSM', StdPrecision: 0, CostingPrecision: 0 });
  mark('BridgeCreateCUOM', !uom.isError && one("SELECT COUNT(*) FROM c_uom WHERE x12de355='WSM'") === '1', uom);
  const proj = await create('BridgeCreateCProject', 'C_Project', { Value: 'WS_MIG_1', Name: 'WS_MIG_1', C_Currency_ID: stock.c_currency_id, IsCommitment: 'N', ProjInvoiceRule: stock.projinvoicerule, ProjectLineLevel: stock.projectlinelevel });
  mark('BridgeCreateCProject', !proj.isError && one("SELECT COUNT(*) FROM c_project WHERE value='WS_MIG_1'") === '1', proj);
  const phase = await create('BridgeCreateCProjectPhase', 'C_ProjectPhase', { C_Project_ID: proj.recordId, Name: 'WS_MIG phase', SeqNo: 10, IsComplete: 'N', Qty: 1 });
  mark('BridgeCreateCProjectPhase', !phase.isError && one('SELECT c_project_id FROM c_projectphase WHERE c_projectphase_id=' + phase.recordId) === String(proj.recordId), phase);
  const task = await create('BridgeCreateCProjectTask', 'C_ProjectTask', { C_ProjectPhase_ID: phase.recordId, Name: 'WS_MIG task', SeqNo: 10, Qty: 1 });
  mark('BridgeCreateCProjectTask', !task.isError && one('SELECT c_projectphase_id FROM c_projecttask WHERE c_projecttask_id=' + task.recordId) === String(phase.recordId), task);
  const line = await create('BridgeCreateCProjectLine', 'C_ProjectLine', { C_Project_ID: proj.recordId, C_ProjectPhase_ID: phase.recordId, C_ProjectTask_ID: task.recordId, M_Product_ID: productId, Line: 10, PlannedQty: 2, PlannedPrice: 5 });
  mark('BridgeCreateCProjectLine', !line.isError && Number(one('SELECT plannedamt FROM c_projectline WHERE c_projectline_id=' + line.recordId)) === 10, line, 'MProjectLine.beforeSave derives PlannedAmt 2 x 5 = 10');

  const up = await update('BridgeUpdateCProjectPhase', 'C_ProjectPhase', phase.recordId, { IsComplete: 'Y' });
  mark('BridgeUpdateCProjectPhase', !up.isError && one('SELECT iscomplete FROM c_projectphase WHERE c_projectphase_id=' + phase.recordId) === 'Y', up);

  const measure = one("SELECT pa_measure_id FROM pa_measure WHERE ad_client_id=11 AND measuretype='C' ORDER BY pa_measure_id LIMIT 1");
  const goal = await create('BridgeCreatePAGoal', 'PA_Goal', { Name: 'WS_MIG goal', PA_Measure_ID: measure, MeasureScope: '0', MeasureTarget: 0, PA_ColorSchema_ID: 100, SeqNo: 0, IsSummary: 'N', RelativeWeight: 1, ChartType: 'BC' });
  mark('BridgeCreatePAGoal', !goal.isError && one("SELECT COUNT(*) FROM pa_goal WHERE name='WS_MIG goal'") === '1', goal);
  mark('QueryPAGoal', (await Push.queryRows(BASE, xmlLogin, 'QueryPAGoal', 'PA_Goal', [{ column: 'Name', val: 'WS_MIG goal' }])).length === 1);
  const gu = await update('BridgeUpdatePAGoal', 'PA_Goal', goal.recordId, { MeasureTarget: 100 });
  mark('BridgeUpdatePAGoal', !gu.isError && Number(one('SELECT measuretarget FROM pa_goal WHERE pa_goal_id=' + goal.recordId)) === 100, gu);

  const pu = await update('CapexUpdateCProject', 'C_Project', proj.recordId, { IsCommitment: 'Y' });
  mark('CapexUpdateCProject', !pu.isError && one('SELECT iscommitment FROM c_project WHERE c_project_id=' + proj.recordId) === 'Y', pu);
  const lu = await update('CapexUpdateCProjectLine', 'C_ProjectLine', line.recordId, { CommittedAmt: 7 });
  mark('CapexUpdateCProjectLine', !lu.isError && Number(one('SELECT committedamt FROM c_projectline WHERE c_projectline_id=' + line.recordId)) === 7, lu);
  // this type is for a DRAFT invoice (pilot_progress.js sets the project before completing it); on a processed one iDempiere refuses, "Document Processed". Stock GardenWorld's invoices are all
  //   completed and the type that creates one belongs to the bridge lane, so one row of the throwaway clone goes back to draft.
  const invoice = one('SELECT c_invoice_id FROM c_invoice WHERE ad_client_id=11 ORDER BY c_invoice_id LIMIT 1');
  const refusedDone = await update('CapexUpdateCInvoice', 'C_Invoice', invoice, { C_Project_ID: proj.recordId });
  check('E5 on a completed invoice the same update is refused, as in the stock window', refusedDone.isError && /Processed/.test(refusedDone.error), { error: String(refusedDone.error).slice(0, 120) });
  one("UPDATE c_invoice SET processed='N', docstatus='DR', docaction='CO' WHERE c_invoice_id=" + invoice);
  const iu = await update('CapexUpdateCInvoice', 'C_Invoice', invoice, { C_Project_ID: proj.recordId });
  mark('CapexUpdateCInvoice', !iu.isError && one('SELECT c_project_id FROM c_invoice WHERE c_invoice_id=' + invoice) === String(proj.recordId), iu);
  const cl = await fetch(REST + 'run_process', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ModelRunProcessRequest: { ModelRunProcess: { serviceType: 'Capex_RunProcess_ProjectClose', AD_Record_ID: proj.recordId, ParamValues: { field: [{ '@column': 'AD_Record_ID', val: String(proj.recordId) }] } }, ADLoginRequest: jsonLogin } }) });
  const clj = JSON.parse(await cl.text()), clr = clj.RunProcessResponse || {};
  mark('Capex_RunProcess_ProjectClose', !(clj.status === '500' || clj.message || clr['@IsError']) && one('SELECT processed FROM c_project WHERE c_project_id=' + proj.recordId) === 'Y', clj.message || clr.Error || undefined);

  // the 8 read types, now with rows behind every entity the writes can give them
  const s1 = snapshot('after_writes');
  Object.keys(A.LEGACY_TYPES).filter(e => !A.OPTIONAL.includes(e)).forEach(e => {
    const t = A.LEGACY_TYPES[e], n = (s1[e] || []).length;
    if (s1.unavailable.includes(e)) check('E ' + t, false, { entity: e, unavailable: true });
    else if (!n) inc('E ' + t, 'read ok but 0 rows: nothing judged');
    else mark(t, true, { entity: e, rows: n });
  });
  const named = ['WS_MIG phase', 'WS_MIG task'];
  check('E3 the rows written through the types come back through the read types', (s1.phases || []).some(r => r.Name === named[0]) && (s1.tasks || []).some(r => r.Name === named[1]) && (s1.lines || []).some(r => String(r.C_ProjectLine_ID) === String(line.recordId)));

  const missing = ALL.filter(t => !done.has(t));
  log('§WS_MIG_DENOMINATOR exercised=' + done.size + ' of ' + ALL.length + (missing.length ? ' missing=' + missing.join(',') : ''));
  check('E4 every type exercised on the real server, ' + done.size + ' of ' + ALL.length, !missing.length, missing);
}

function pilotChecks(countsBefore) {
  const reg = rows(PILOT, 'SELECT name FROM adempiere.ad_migrationscript WHERE name IN (' + sqlList(scripts.map(s => s.name)) + ')');
  check('P1 the five names are in the pilot\'s ledger', reg.length === scripts.length, reg.map(r => r.name));
  check('P2 the pilot\'s WS row counts did not move during this run', pilotCounts() === countsBefore, { before: countsBefore, after: pilotCounts() });
}
const pilotCounts = () => WS_TABLES.map(([t]) => t + '=' + num(PILOT, 'SELECT COUNT(*) FROM adempiere.' + t)).join(' ');

(async function main() {
  let tmp = null;
  const countsBefore = pilotCounts();
  log('§WS_MIG start scripts=' + scripts.length + ' types=' + ALL.length + ' pilot ' + countsBefore + (BREAK ? ' BREAK=' + BREAK : ''));
  if (instanceUp()) { log('§WS_MIG_VERDICT INCONCLUSIVE the test instance is already running: someone may be using it'); process.exit(2); }
  const adm = psqlOn('postgres', 'DROP DATABASE IF EXISTS ' + DB + ' WITH (FORCE);\nCREATE DATABASE ' + DB + ' TEMPLATE ' + STOCK + ';\n');
  if (adm.code !== 0) { log('§WS_MIG_VERDICT INCONCLUSIVE could not clone ' + STOCK + ': ' + adm.err.slice(0, 200)); process.exit(2); }
  try {
    formChecks();
    if (applyChecks()) {
      rowChecks();
      separationChecks();
      if (!BREAK) {
        pilotChecks(countsBefore);
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-mig-'));
        startServer(tmp);
        const up = await waitServer();
        if (up < 0) inc('E', 'the server on the clone did not answer in 300 s: ' + path.join(tmp, 'server.log'));
        else { log('§WS_MIG server answered after ~' + up + ' s'); await endOfChain(tmp); check('P3 the pilot still unmoved after the server run', pilotCounts() === countsBefore); }
      }
    }
  } catch (e) { check('crash', false, String(e && e.stack || e).slice(0, 500)); } finally {
    if (tmp) {
      stopServer();
      for (let i = 0; i < 12 && instanceUp(); i++) await sleep(2500);
      log('§WS_MIG server stopped=' + !instanceUp());
      if (fails === 0) fs.rmSync(tmp, { recursive: true, force: true }); else log('§WS_MIG kept for reading: ' + tmp);
    }
    const dropped = psqlOn('postgres', 'DROP DATABASE IF EXISTS ' + DB + ' WITH (FORCE);\n');
    log('§WS_MIG clone dropped=' + (dropped.code === 0));
  }
  const v = fails ? 'FAIL' : (inconclusive.length && !judged) ? 'INCONCLUSIVE' : 'PASS';
  log('§WS_MIG_VERDICT ' + v + ' judged=' + judged + ' failed=' + fails + ' inconclusive=' + inconclusive.length + (inconclusive.length ? ' [' + inconclusive.join('; ') + ']' : ''));
  process.exit(fails ? 1 : v === 'INCONCLUSIVE' ? 2 : 0);
})();
