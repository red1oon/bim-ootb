// capex/tests/witness_taskdates.js — W-TASKDATES (spec: prompts/CAPEX_DASHBOARD.md §5.58). READ THE LOG: verdict = §W_TASKDATES_VERDICT; 0 tasks judged = INCONCLUSIVE.
// ISSUE IT PROVES OR DISPROVES: "the Schedule tab can draw phase bars only because the 4D tasks reach the Project Order without their dates".
// Expected values are INDEPENDENT: read from the 4D owner's persisted run (sched.tasks), never from the fold. Break switch TASKDATES_BREAK=1 shifts one stored task date +5 d AFTER the fold: T1 and T2 must FAIL.
// T1 task row dates == its 4D task(s) · T2 phase window == span of its task rows · T3 no programme -> no dated task + note · T4 columns absent -> NO_TASK_DATE_COLUMNS, no throw · T5 2nd fold +0 · T6 projectDetail() task rows == DB rows.
// Run: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_taskdates.js [building=HHS_Office_Federated]   (needs: node scripts/cache_4d_run.js <building>)
'use strict';
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js');
const ROOT = path.join(__dirname, '..', '..');
const ProjFold = require(path.join(ROOT, 'viewer', 'proj_fold.js'));
const FI = require(path.join(ROOT, 'capex', 'tools', 'fold_inputs.js'));
const BLD = process.argv[2] || 'HHS_Office_Federated';
const START = '2026-11-01', NOW = START + ' 00:00:00';
const BREAK = process.env.TASKDATES_BREAK === '1';
let fails = 0, judged = 0, inconclusive = 0;
function check(name, ok, detail) { judged++; if (!ok) fails++; console.log('§W_TASKDATES_ASSERT ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : '')); }
function inc(name, why) { inconclusive++; console.log('§W_TASKDATES_ASSERT INCONCLUSIVE ' + name + ' ' + why); }
function addDays(s, d) { return new Date(Date.parse(s + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10); }
const q = (db, sql, p) => { const r = db.exec(sql, p || []); return r.length ? r[0].values : []; };

function openErp(SQL) {
  const edb = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp', 'ad_seed.db')));
  fs.readFileSync(path.join(ROOT, 'erp', 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(st => { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { edb.run(st); } catch (e) {} });
  ['ad_docvalue_overlay.js', 'ad_taxcat_overlay.js'].forEach(f => require(path.join(ROOT, 'erp', f)).ensure(edb));
  return edb;
}


(async () => {
  const SQL = await initSqlJs();
  const dbPath = [path.join(ROOT, 'buildings', BLD + '_extracted.db'), path.join(process.env.HOME, 'bim-ootb', 'buildings', BLD + '_extracted.db')].find(fs.existsSync);
  if (!dbPath) { console.log('§W_TASKDATES_VERDICT INCONCLUSIVE no building db for ' + BLD); process.exit(2); }
  const bdb = new SQL.Database(fs.readFileSync(dbPath)), building = q(bdb, 'SELECT DISTINCT building FROM elements_meta LIMIT 1')[0][0], sched = FI.schedule4D(BLD, START);
  if (!sched) { console.log('§W_TASKDATES_VERDICT INCONCLUSIVE no 4D run at the current code key — run: node scripts/cache_4d_run.js ' + BLD); process.exit(2); }
  const BD = await import(path.join(ROOT, 'erp/plugins/bim_document.mjs'));
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', 'rsmeans2024_us.json'), 'utf8')), sr = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', 'sequence_rules.json'), 'utf8')), hier = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', 'ifc_schema_hierarchy.json'), 'utf8'));
  const base = { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, hierarchy: hier.hierarchy || hier, packCurrencyISO: 'USD', now: NOW };
  const rows = FI.apply5DRates(FI.compute5D(bdb, building, sched), pack.materials || {});
  // ── A: columns present (the plugin's own ensure function), whole-set fold with the programme ──
  const edb = openErp(SQL);
  if (typeof BD.ensureTaskDateColumns !== 'function') { check('T0 the plugin exports ensureTaskDateColumns', false, 'missing'); } else BD.ensureTaskDateColumns({ run: (s, p) => edb.run(s, p), query: (s, p) => { const r = edb.exec(s, p || []); return r.length ? r[0].values.map(v => { const o = {}; r[0].columns.forEach((c, i) => { o[c] = v[i]; }); return o; }) : []; } });
  const r = ProjFold.foldProjectOrder(edb, building, rows, Object.assign({ schedule: sched }, base)), pid = r.projectId;
  console.log('§W_TASKDATES_RUN building=' + building + ' created=' + JSON.stringify(r.created) + ' notes=' + JSON.stringify(r.notes));
  const hasCols = q(edb, 'PRAGMA table_info("C_ProjectTask")').some(v => String(v[1]).toLowerCase() === 'bim_startdate') && q(edb, 'PRAGMA table_info("C_ProjectTask")').some(v => String(v[1]).toLowerCase() === 'bim_enddate');
  check('T0 C_ProjectTask has BIM_StartDate and BIM_EndDate after the plugin ensure', hasCols);
  const T = sched.tasks.map(t => Object.assign({}, t)); const exp = {};
  T.forEach(t => { const k = t.phase + '|' + t.phase + ' \u2014 ' + t.storey, e = exp[k] || (exp[k] = { s: Infinity, e: -Infinity }); e.s = Math.min(e.s, t.sDays); e.e = Math.max(e.e, t.eDays); });
  if (BREAK && hasCols) { const one = q(edb, 'SELECT C_ProjectTask_ID FROM C_ProjectTask k JOIN C_ProjectPhase p ON p.C_ProjectPhase_ID=k.C_ProjectPhase_ID WHERE p.C_Project_ID=? LIMIT 1', [pid])[0]; if (one) { edb.run("UPDATE C_ProjectTask SET BIM_StartDate=date(BIM_StartDate,'+5 day') WHERE C_ProjectTask_ID=?", [one[0]]); console.log('§W_TASKDATES_BREAK shifted task ' + one[0] + ' start +5 d in the STORE'); } }
  const got = hasCols ? q(edb, 'SELECT p.Name, k.Name, k.BIM_StartDate, k.BIM_EndDate, p.StartDate, p.EndDate, k.C_ProjectTask_ID FROM C_ProjectTask k JOIN C_ProjectPhase p ON p.C_ProjectPhase_ID=k.C_ProjectPhase_ID WHERE p.C_Project_ID=?', [pid]) : [];
  if (!got.length) { console.log('§W_TASKDATES_ASSERT INCONCLUSIVE T1 no task rows with date columns judged'); inconclusive++; }
  else {
    const bad = []; got.forEach(v => { const e = exp[v[0] + '|' + v[1]]; if (!e || String(v[2]).slice(0, 10) !== addDays(START, e.s) || String(v[3]).slice(0, 10) !== addDays(START, e.e)) bad.push(v[0] + '|' + v[1] + ' got ' + String(v[2]).slice(0, 10) + '→' + String(v[3]).slice(0, 10)); });
    check('T1 each of the ' + got.length + ' task rows carries the dates of its 4D task(s)', bad.length === 0, bad.slice(0, 3).join('; '));
    const span = {}; got.forEach(v => { const s = span[v[0]] || (span[v[0]] = { s: '9999', e: '0000', ps: v[4], pe: v[5] }); if (String(v[2]) < s.s) s.s = String(v[2]); if (String(v[3]) > s.e) s.e = String(v[3]); });
    const pb = Object.keys(span).filter(n => String(span[n].ps).slice(0, 10) !== span[n].s.slice(0, 10) || String(span[n].pe).slice(0, 10) !== span[n].e.slice(0, 10));
    check('T2 each of the ' + Object.keys(span).length + ' phase windows == the span of its task rows', pb.length === 0, pb.join(', '));
    // T5
    const r3 = ProjFold.foldProjectOrder(edb, building, rows, Object.assign({ schedule: sched }, base)), plus = r3.created.phases + r3.created.tasks + r3.created.lines + r3.created.products;
    check('T5 2nd fold creates 0', plus === 0, JSON.stringify(r3.created));
    // T6 projectDetail
    const AD = require(path.join(ROOT, 'capex/adapters.js')), TI = require('./pa_harness.js'), data = AD.fromSqlite(edb, {}), pj = q(edb, 'SELECT Value FROM C_Project WHERE C_Project_ID=?', [pid])[0];
    await require('./pa_harness.js').init({ quiet: true });   // §5.75 step 3: PA rows, not the hand formulas
    const d = TI.projectDetail(data, { today: START }, pid), dt = d ? [].concat.apply([], d.phases.map(p => (p.taskRows || []).map(k => p.name + '|' + k.name + '|' + String(k.start).slice(0, 10) + '|' + String(k.end).slice(0, 10)))) : [];
    const dbt = got.map(v => v[0] + '|' + v[1] + '|' + String(v[2]).slice(0, 10) + '|' + String(v[3]).slice(0, 10));
    check('T6 projectDetail() task rows == the ' + dbt.length + ' DB task rows (name, start, end)', dt.slice().sort().join(';') === dbt.slice().sort().join(';'), 'detail=' + dt.length + ' db=' + dbt.length);
  }
  // T7 real page: the folded store served as a snapshot, #project/<id>/schedule: task bars == the dated task rows (x, width from the row dates); a store without the columns says so
  const http = require('http'), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
  let pw = null; try { pw = require('/home/red1/bim-ootb/tests/node_modules/playwright'); } catch (e) { }
  if (!pw || !hasCols) { console.log('§W_TASKDATES_ASSERT INCONCLUSIVE T7 ' + (pw ? 'no columns' : 'playwright missing')); inconclusive++; }
  else {
    const AD = require(path.join(ROOT, 'capex/adapters.js')), snapDated = AD.fromSqlite(edb, {}); snapDated.source = 'legacy';
    const strip = JSON.parse(JSON.stringify(snapDated)); strip.tasks.forEach(k => { delete k.BIM_StartDate; delete k.BIM_EndDate; });
    const srv = http.createServer((rq, rs) => { const u = rq.url.split('?')[0]; if (u.endsWith('/__snapD.json') || u.endsWith('/__snapN.json')) { rs.writeHead(200, { 'Content-Type': 'application/json' }); return rs.end(JSON.stringify(u.endsWith('D.json') ? snapDated : strip)); }
      fs.readFile(path.join(ROOT, decodeURIComponent(u)), (e, b) => { if (e) { rs.writeHead(404); return rs.end('404'); } rs.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); rs.end(b); }); });
    await new Promise(r => srv.listen(0, r));
    const br = await pw.chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), errs = [];
    try {
      const pg = await (await br.newContext({ viewport: { width: 1500, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(String(e)));
      const open = async f => { await pg.goto('http://localhost:' + srv.address().port + '/capex/index.html?snapshot=' + f + '&source=legacy&today=' + START + '#project/' + pid + '/schedule', { waitUntil: 'load' }); await pg.waitForFunction(() => window.__capex && window.__capex.rendered, null, { timeout: 30000 }); await pg.waitForTimeout(500); };
      await open('__snapD.json');
      const bars = await pg.$$eval('#view rect.tbar', e => e.map(x => x.getAttribute('data-phase') + '|' + x.getAttribute('data-task') + '|' + x.getAttribute('data-start') + '|' + x.getAttribute('data-end'))), want = got.map(v => v[0] + '|' + v[1] + '|' + String(v[2]).slice(0, 10) + '|' + String(v[3]).slice(0, 10));
      check('T7 Schedule tab: ' + bars.length + ' task bars == the ' + want.length + ' task rows (phase, task, start, end)', bars.length > 0 && bars.slice().sort().join(';') === want.slice().sort().join(';'), 'bars=' + bars.length + ' rows=' + want.length);
      await open('__snapN.json'); const none = await pg.$$eval('#view [data-taskdates="none"]', e => e.map(x => x.textContent)), nb = await pg.$$eval('#view rect.tbar', e => e.length);
      check('T7b a server without the columns: "no task dates on this server", 0 bars, no page error', nb === 0 && none.length === 1 && /no task dates on this server/.test(none[0]) && errs.length === 0, { none, nb, errs });
    } finally { await br.close(); srv.close(); }
  }
  // ── B: no programme -> no dated task + note ──
  const edb2 = openErp(SQL); if (typeof BD.ensureTaskDateColumns === 'function') BD.ensureTaskDateColumns({ run: (s, p) => edb2.run(s, p), query: (s, p) => { const r = edb2.exec(s, p || []); return r.length ? r[0].values.map(v => { const o = {}; r[0].columns.forEach((c, i) => { o[c] = v[i]; }); return o; }) : []; } });
  const r2 = ProjFold.foldProjectOrder(edb2, building, FI.apply5DRates(FI.compute5D(bdb, building, null), pack.materials || {}), base);
  const has2 = q(edb2, 'PRAGMA table_info("C_ProjectTask")').some(v => String(v[1]).toLowerCase() === 'bim_startdate');
  const n2 = q(edb2, 'SELECT COUNT(*) FROM C_ProjectTask k JOIN C_ProjectPhase p ON p.C_ProjectPhase_ID=k.C_ProjectPhase_ID WHERE p.C_Project_ID=?', [r2.projectId])[0][0], dated2 = has2 ? q(edb2, 'SELECT COUNT(*) FROM C_ProjectTask k JOIN C_ProjectPhase p ON p.C_ProjectPhase_ID=k.C_ProjectPhase_ID WHERE p.C_Project_ID=? AND (k.BIM_StartDate IS NOT NULL OR k.BIM_EndDate IS NOT NULL)', [r2.projectId])[0][0] : -1;
  check('T3 no programme: ' + n2 + ' task rows, none dated', n2 > 0 && dated2 === 0, 'dated=' + dated2);
  // ── C: columns absent -> note, no throw ──
  const edb3 = openErp(SQL); let thrown = ''; let r4 = null; try { r4 = ProjFold.foldProjectOrder(edb3, building, rows, Object.assign({ schedule: sched }, base)); } catch (e) { thrown = String(e && e.message); }
  check('T4 columns absent: fold does not throw and notes NO_TASK_DATE_COLUMNS', !thrown && !!r4 && (r4.notes || []).some(n => n.indexOf('NO_TASK_DATE_COLUMNS') === 0), thrown || JSON.stringify(r4 && r4.notes));
  const verdict = judged === 0 || inconclusive ? (fails ? 'FAIL' : 'INCONCLUSIVE') : fails ? 'FAIL' : 'PASS';
  console.log('§W_TASKDATES_VERDICT ' + verdict + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconclusive + (BREAK ? ' (BREAK=1 — must be FAIL)' : '')); process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.error('§W_TASKDATES_ERROR ' + (e && e.stack || e)); process.exit(2); });
