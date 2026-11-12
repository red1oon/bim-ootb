#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — capex/tools/film_testdata.js (spec prompts/CAPEX_DASHBOARD.md §5.55). TEST INSTANCE ONLY (~/idempiere-bimdoc, DB idempiere_bimdoc, :8108): REFUSES any other base or DB. READ THE LOG: §TD_* lines; the exit code alone is not evidence.
// Throw-away test data for the film and an ERP workout: 12 neutral projects (Value TD_*, name "<Place> (test data)") with phases, lines, ticked phases, stock Project Issues and purchase orders, all made through iDempiere's
// own web services (the pushProjectOrder footprint + film_progress.js), nothing written by SQL. Teardown is EXACT: `snapshot` takes a database copy (idempiere_bimdoc_pretd) BEFORE any data goes in; `teardown` restores it, so the
// instance is byte-for-byte what it was (posted documents and stock movements included, which row-by-row deletion cannot promise). Never touches the pilot.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tools/film_testdata.js <status|snapshot|generate|teardown> [--today=YYYY-MM-DD]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync, spawnSync } = require('child_process'), Push = require(path.join(__dirname, '..', '..', 'viewer', 'erp_rest_push.js'));
const BASE = 'http://localhost:8108', DB = 'idempiere_bimdoc', PRE = 'idempiere_bimdoc_pretd', INST = path.join(os.homedir(), 'idempiere-bimdoc'), LEDGER_DIR = path.join(os.homedir(), '.cache/capex_film/testdata'), LEDGER = path.join(LEDGER_DIR, 'ledger.json'), log = console.log;
const cmd = process.argv[2], todayArg = (process.argv.find(a => a.startsWith('--today=')) || '').slice(8), TODAY = todayArg || new Date().toISOString().slice(0, 10);
if (process.env.BRIDGE_BASE && process.env.BRIDGE_BASE !== BASE) { log('§TD REFUSED BRIDGE_BASE is not the test instance'); process.exit(2); }
const pg = (db, sql, flags) => execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', db, '-v', 'ON_ERROR_STOP=1', '-qtA'].concat(flags || []), { input: (db === 'postgres' ? '' : 'SET search_path=adempiere;\n') + sql }).toString().trim();
const exists = db => pg('postgres', "SELECT 1 FROM pg_database WHERE datname='" + db + "'") === '1';
const COUNTS = ["select 'projects='||count(*) from c_project", "select 'phases='||count(*) from c_projectphase", "select 'lines='||count(*) from c_projectline", "select 'issues='||count(*) from c_projectissue", "select 'orders='||count(*) from c_order",
  "select 'products='||count(*) from m_product", "select 'transactions='||count(*) from m_transaction", "select 'facts='||count(*) from fact_acct", "select 'migrations='||count(*) from ad_migrationscript"];
const counts = () => Object.fromEntries(COUNTS.map(q => pg(DB, q).split('=')).map(([k, v]) => [k, Number(v)]));
const tdProjects = () => Number(pg(DB, "select count(*) from c_project where value like 'TD\\_%'"));
const up = async (n = 60) => { for (let i = 0; i < n; i++) { try { const r = await fetch(BASE + '/webui/'); if (r.status === 200) return true; } catch (e) {} await new Promise(r => setTimeout(r, 4000)); } return false; };
const sh = (f) => spawnSync('bash', [path.join(INST, f)], { encoding: 'utf8' });
const kill = () => pg('postgres', "select pg_terminate_backend(pid) from pg_stat_activity where datname='" + DB + "' and pid<>pg_backend_pid()");
const day = off => new Date(Date.parse(TODAY + 'T00:00:00Z') + off * 864e5).toISOString().slice(0, 10) + ' 00:00:00';
// the scenario: [value, name, start offset (days from today), phase durations, ticked phases, plan scale, issues, po]. Offsets are relative so the film's dashboard shows a spread: green, amber, red, no data, over budget, ready for handover.
const PH = ['Substructure', 'Superstructure', 'Envelope', 'Services', 'Finishes', 'Handover'];
const SC = [['TD_RIVERSIDE', 'Riverside Tower', -230, [60, 80, 70, 60, 50], 3, 1.0, '139x30', '139x40@50'], ['TD_DEPOT', 'North Depot', -150, [40, 50, 50, 40], 1, 0.6, '139x10', ''], ['TD_BRIDGE', 'Bridge Deck', -300, [90, 90, 80, 60], 2, 3.0, '139x80', '139x20@120'],
  ['TD_CLINIC', 'Clinic Wing', -100, [30, 40, 40, 40], 2, 1.2, '139x15', ''], ['TD_DATAHALL', 'Data Hall', -120, [50, 50, 40], 1, 2.0, '139x25', '139x30@60'], ['TD_SUBSTATION', 'Substation', -60, [30, 40, 40], 1, 0.5, '', '139x5@100'],
  ['TD_CARPARK', 'Car Park', -90, [30, 30, 30], 2, 0.02, '139x60', ''], ['TD_SCHOOL', 'School Block', -180, [60, 60, 60, 60], 3, 1.5, '139x35', '139x25@45'], ['TD_PUMP', 'Pump Station', -250, [40, 40, 40], 1, 0.4, '139x5', ''],
  ['TD_OFFICE', 'Office Fit-out', 10, [30, 30, 30], 0, 0.3, '', ''], ['TD_WAREHOUSE', 'Warehouse 3', -40, [30, 30, 30], 0, 0.7, '', ''], ['TD_PLAZA', 'Plaza', -300, [50, 50, 50], 3, 0.8, '139x12', '']];
const PRODUCTS = [['TD_MAT_A', 'Test material A (test data)', 100, 400], ['TD_MAT_B', 'Test material B (test data)', 50, 300]];
const L = { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', clientId: 11, roleId: 102, orgId: 11, warehouseId: 103, stage: 0 };
const pushCfg = { baseUrl: BASE, login: L, serviceTypes: { C_Project: { query: 'QueryCProject', create: 'BridgeCreateCProject' }, C_ProjectPhase: { query: 'QueryCProjectPhase', create: 'BridgeCreateCProjectPhase' }, C_ProjectTask: { query: 'QueryCProjectTask', create: 'BridgeCreateCProjectTask' },
  C_ProjectLine: { query: 'QueryCProjectLine', create: 'BridgeCreateCProjectLine' }, M_Product: { query: 'QueryMProduct', create: 'Bridge_createData_M_Product' }, M_Product_Category: { query: 'QueryMProductCategory', create: 'Bridge_createData_M_Product_Category' }, C_UOM: { query: 'QueryCUOM', create: 'BridgeCreateCUOM' } } };
function plan(sc) { const [v, n, off, durs, , k] = sc; let t = off;
  return { building: v, name: n + ' (test data)', fields: [{ column: 'C_Currency_ID', val: 100 }], phases: durs.map((d, i) => { const s = t; t += d; return { name: PH[i], seqno: (i + 1) * 10, startDate: day(s), endDate: day(s + d), tasks: [],
    lines: PRODUCTS.map(([pv, pn, q, p]) => ({ productValue: pv, productName: pn, categoryName: 'TD Materials (test data)', qty: q, price: +(p * k).toFixed(2),
      productFields: [{ column: 'Description', val: 'throw-away test data' }, { column: 'C_UOM_ID', val: 100 }, { column: 'C_TaxCategory_ID', val: 107 }, { column: 'ProductType', val: 'I' }, { column: 'IsStocked', val: 'N' }, { column: 'IsPurchased', val: 'Y' }, { column: 'IsSold', val: 'N' }] })) }; }) }; }
(async () => {
  if (cmd === 'status') { log('§TD_STATUS snapshot=' + exists(PRE) + ' td_projects=' + (exists(DB) ? tdProjects() : 'no db') + ' ledger=' + fs.existsSync(LEDGER) + ' counts=' + JSON.stringify(counts())); return; }
  if (cmd === 'snapshot') {
    if (exists(PRE)) { log('§TD_SNAPSHOT REFUSED ' + PRE + ' already exists (a snapshot is waiting for its teardown)'); process.exit(2); }
    if (tdProjects()) { log('§TD_SNAPSHOT REFUSED test projects already present: take the snapshot BEFORE generating'); process.exit(2); }
    const pre = counts(); sh('stop.sh'); await new Promise(r => setTimeout(r, 6000)); kill(); pg('postgres', 'CREATE DATABASE ' + PRE + ' TEMPLATE ' + DB);
    fs.mkdirSync(LEDGER_DIR, { recursive: true }); fs.writeFileSync(path.join(LEDGER_DIR, 'pre_counts.json'), JSON.stringify({ takenAt: new Date().toISOString(), pre }, null, 1));
    spawnSync('bash', ['-c', 'cd ' + INST + ' && nohup ./start.sh >/dev/null 2>&1 &']); const ok = await up(); await new Promise(r => setTimeout(r, ok ? 40000 : 0));
    log('§TD_SNAPSHOT ' + (exists(PRE) && ok ? 'DONE' : 'FAILED') + ' copy=' + PRE + ' pre=' + JSON.stringify(pre) + ' serverUp=' + ok); process.exit(exists(PRE) && ok ? 0 : 1);
  }
  if (cmd === 'generate') {
    if (!exists(PRE)) { log('§TD_GENERATE REFUSED no snapshot: run `snapshot` first, or teardown cannot be exact'); process.exit(2); }
    if (tdProjects()) { log('§TD_GENERATE REFUSED test projects already present (generate runs once per snapshot)'); process.exit(2); }
    if (!(await up(2))) { log('§TD_GENERATE REFUSED the test instance is not answering on ' + BASE); process.exit(2); }
    const pre = JSON.parse(fs.readFileSync(path.join(LEDGER_DIR, 'pre_counts.json'), 'utf8')).pre, t0 = Date.now(), made = [], errs = [];
    for (const sc of SC) {
      try { const r = await Push.pushProjectOrder(pushCfg, plan(sc)); made.push({ value: sc[0], projectId: r.projectId, created: r.created });
        if (sc[4] || sc[6] || sc[7]) { const o = spawnSync('node', [path.join(__dirname, 'film_progress.js'), sc[0], String(sc[4]), sc[6] || '0', sc[7]].filter((x, i) => i < 4 || x !== ''), { encoding: 'utf8', env: Object.assign({}, process.env, { NODE_PATH: process.env.NODE_PATH || path.join(os.homedir(), 'bim-ootb/node_modules') }), timeout: 300000 });
          const line = (o.stdout || '').split('\n').filter(l => /§FILM_PROGRESS/.test(l)).slice(-1)[0] || (o.stdout || '').slice(-200); log('§TD_EVENTS ' + sc[0] + ' ticked=' + sc[4] + ' issues=' + (sc[6] || '-') + ' po=' + (sc[7] || '-') + ' :: ' + line.slice(0, 160)); if (o.status !== 0) errs.push(sc[0] + ': film_progress exit ' + o.status); }
      } catch (e) { errs.push(sc[0] + ': ' + String(e.message || e).slice(0, 140)); }
    }
    // independent read-back through SQL (the oracle is the ERP's own tables, not this script's bookkeeping)
    const q = s => Number(pg(DB, s)), post = counts(), want = SC.reduce((a, s) => { a.ticked += s[4]; a.phases += s[3].length; a.issues += s[6] ? 1 : 0; a.po += s[7] ? 1 : 0; return a; }, { ticked: 0, phases: 0, issues: 0, po: 0 });
    const got = { projects: q("select count(*) from c_project where value like 'TD\\_%'"), phases: q("select count(*) from c_projectphase where c_project_id in (select c_project_id from c_project where value like 'TD\\_%')"), ticked: q("select count(*) from c_projectphase where iscomplete='Y' and c_project_id in (select c_project_id from c_project where value like 'TD\\_%')"),
      issueProjects: q("select count(distinct c_project_id) from c_projectissue where processed='Y' and c_project_id in (select c_project_id from c_project where value like 'TD\\_%')"), poProjects: q("select count(distinct c_project_id) from c_order where issotrx='N' and docstatus='CO' and c_project_id in (select c_project_id from c_project where value like 'TD\\_%')") };
    fs.writeFileSync(LEDGER, JSON.stringify({ today: TODAY, generatedAt: new Date().toISOString(), pre, post, made, errs, scenario: SC.map(s => s[0]) }, null, 1));
    log('§TD_GENERATED projects=' + got.projects + '/' + SC.length + ' phases=' + got.phases + '/' + want.phases + ' ticked=' + got.ticked + '/' + want.ticked + ' projectsWithIssues=' + got.issueProjects + '/' + want.issues + ' projectsWithPO=' + got.poProjects + '/' + want.po + ' deltas=' + JSON.stringify(Object.fromEntries(Object.keys(post).map(k => [k, post[k] - pre[k]]))) + ' errors=' + errs.length + ' secs=' + ((Date.now() - t0) / 1000).toFixed(0));
    errs.forEach(e => log('§TD_ERROR ' + e));
    const ok = got.projects === SC.length && got.phases === want.phases && got.ticked === want.ticked && got.issueProjects === want.issues && got.poProjects === want.po && !errs.length;
    log('§TD_GENERATE_VERDICT ' + (ok ? 'PASS' : 'FAIL')); process.exit(ok ? 0 : 1);
  }
  if (cmd === 'teardown') {
    if (!exists(PRE)) { log('§TD_TEARDOWN REFUSED no snapshot copy ' + PRE + ' (nothing to restore from; a refresh rebuilds from the base seed instead)'); process.exit(2); }
    const pre = JSON.parse(fs.readFileSync(path.join(LEDGER_DIR, 'pre_counts.json'), 'utf8')).pre; sh('stop.sh'); await new Promise(r => setTimeout(r, 6000)); kill();
    pg('postgres', 'DROP DATABASE ' + DB + ' WITH (FORCE)'); pg('postgres', 'CREATE DATABASE ' + DB + ' TEMPLATE ' + PRE); pg('postgres', 'DROP DATABASE ' + PRE);
    spawnSync('bash', ['-c', 'cd ' + INST + ' && nohup ./start.sh >/dev/null 2>&1 &']); const ok = await up(); await new Promise(r => setTimeout(r, ok ? 40000 : 0));
    const now = counts(), diff = Object.keys(pre).filter(k => pre[k] !== now[k]).map(k => k + ' ' + pre[k] + '->' + now[k]), td = tdProjects();
    log('§TD_TEARDOWN restored from the snapshot; td_projects=' + td + ' counts==pre ' + (diff.length ? 'NO ' + diff.join(',') : 'YES') + ' serverUp=' + ok);
    log('§TD_TEARDOWN_VERDICT ' + (td === 0 && !diff.length && ok ? 'PASS' : 'FAIL')); process.exit(td === 0 && !diff.length && ok ? 0 : 1);
  }
  log('usage: film_testdata.js <status|snapshot|generate|teardown>'); process.exit(2);
})().catch(e => { log('§TD ERROR ' + String(e.stack || e).slice(0, 400)); process.exit(1); });
