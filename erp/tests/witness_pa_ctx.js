#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PA-CTX (spec bim-ootb prompts/CAPEX_DASHBOARD.md §5.66 PR A). READ THE LOG: verdict = §PA_CTX_VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: "the twin's PA engine cannot run a measure the way legacy does when the SQL carries a context tag (@$C_Currency_ID@), and cannot list the rows behind a measure"
//   — legacy parses the measure SQL with Env.parseContext (MMeasureCalc.getSqlPI :183-184) and drills with getQuery (:265); before §5.66 goal_engine did neither.
// Data: the twin's own 12-project scenario (capex/tools/twin_mockchain.js, the twin's operations), the CAPEX migration scripts applied to it as legacy applies them.
// (a) a @$C_Currency_ID@ measure over C_Order (a witness-only dictionary row, id 9990001; orders hold 3 currencies, projects 1) per currency == the plain SQL sum; needs >= 2 currencies, else INCONCLUSIVE.
// (b) an unparsable tag empties the SQL (legacy) → ok:false, value 0, state ERROR.
// (c) every CAPEX PA_MeasureCalc whose Select is COUNT(*) (denominator from the dictionary): queryKeys ids.length == evaluateCalc value. All counts 0 → INCONCLUSIVE.
// Break: PA_CTX_BREAK=1 (the engine skips the parse) → (a) MUST FAIL.
// Usage: NODE_PATH=<bim-ootb>/node_modules node erp/tests/witness_pa_ctx.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), initSqlJs = require('sql.js');
const ROOT = path.join(__dirname, '..', '..'), GE = require(path.join(ROOT, 'erp/goal_engine.js')), AC = require(path.join(ROOT, 'erp/ad_callout.js')), MA = require(path.join(ROOT, 'capex/tools/migration_apply.js'));
const MIGDIR = path.join(ROOT, 'capex/legacy/migration/iD13/postgresql'), TODAY = '2026-11-12', BREAK = process.env.PA_CTX_BREAK === '1', log = console.log;
let judged = 0, fails = 0, inconc = 0;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §PA_CTX ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const inc = (n, why) => { inconc++; log('  §PA_CTX ' + n + ' INCONCLUSIVE ' + why); };
(async () => {
  const out = path.join(os.tmpdir(), 'pa_ctx_' + process.pid + '.db'), { build } = require(path.join(ROOT, 'capex/tools/twin_mockchain.js'));
  const _l = console.log, lines = []; console.log = (...a) => lines.push(a.join(' ')); let r; try { r = await build({ today: TODAY, out }); } finally { console.log = _l; }
  lines.filter(l => /§TWIN_MOCK_BUILT/.test(l)).forEach(l => log(l));
  if (!r || r.errs.length || !fs.existsSync(out)) { ck('W0 the twin scenario store was built', false, r && r.errs); return finish(); }
  const SQL = await initSqlJs(), db = new SQL.Database(fs.readFileSync(out)); fs.unlinkSync(out); GE.install(db);
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(m => require(path.join(ROOT, 'erp/callouts', m + '.js'))); AC.RUNTIME.registerSqlFunctions((n, f) => db.create_function(n, f));   // the host's PL/pgSQL ports (TO_TIMESTAMP, …), as dd_common boot()
  const q = (s, p) => { const st = db.prepare(s), o = []; try { if (p) st.bind(p); while (st.step()) { const x = st.getAsObject(), k = {}; Object.keys(x).forEach(c => { k[c.toLowerCase()] = x[c]; }); o.push(k); } } finally { st.free(); } return o; };
  const files = fs.readdirSync(MIGDIR).filter(f => /\.sql$/.test(f)).sort();
  const have = q("SELECT COUNT(*) AS n FROM pa_measurecalc WHERE name LIKE 'CAPEX%'")[0].n;   // the builder installs the plugin's rows (§TWIN_MOCK_CAPEX_PACK)
  if (!have) files.forEach(f => MA.apply(fs.readFileSync(path.join(MIGDIR, f), 'utf8'), { file: f, run: s => db.run(s), convertSql: AC.convertSql, log: m => { if (/MIG_APPLY|MIG_STMT_FAIL/.test(m)) log('    ' + m.slice(0, 260)); }, has: t => q("SELECT 1 AS x FROM sqlite_master WHERE lower(name)=?", [t]).length > 0 }));
  const ctxBase = { today: TODAY, convertSql: AC.convertSql };
  log('§PA_CTX_DATA scripts=' + files.length + ' capex_calcs=' + q("SELECT COUNT(*) AS n FROM pa_measurecalc WHERE name LIKE 'CAPEX%'")[0].n + ' projects=' + q('SELECT COUNT(*) AS n FROM c_project')[0].n + (BREAK ? ' (PA_CTX_BREAK=1: FAIL expected)' : ''));

  // (a) the currency tag
  const fx = (id, name, sel, where) => db.run("INSERT INTO pa_measurecalc (pa_measurecalc_id,ad_client_id,ad_org_id,isactive,name,selectclause,whereclause,keycolumn,orgcolumn) VALUES (?,0,0,'Y',?,?,?,'o.C_Order_ID','o.AD_Org_ID')", [id, name, sel, where]);
  fx(9990001, 'W-PA-CTX currency tag', 'SELECT SUM(o.GrandTotal) FROM C_Order o', "WHERE o.C_Currency_ID=@$C_Currency_ID@");
  fx(9990002, 'W-PA-CTX unparsable tag', 'SELECT COUNT(*) FROM C_Order o', "WHERE o.C_Currency_ID=@$NoSuchTag@");
  const curs = q("SELECT c_currency_id AS c, SUM(grandtotal) AS s, COUNT(*) AS n FROM c_order GROUP BY c_currency_id ORDER BY 1");
  if (curs.length < 2) inc('A1 per-currency value', 'only ' + curs.length + ' currency on orders');
  else curs.forEach(c => {
    const e = GE.evaluateCalc(q, 9990001, Object.assign({ env: { '$C_Currency_ID': String(c.c) } }, ctxBase));
    log('    §PA_CTX_A currency=' + c.c + ' orders=' + c.n + ' engine=' + e.actual + ' state=' + e.state + ' sql=' + JSON.stringify(e.sql || e.reason));
    ck('A1 currency ' + c.c + ': @$C_Currency_ID@ measure == plain SUM', e.ok && Math.abs(e.actual - Math.round(c.s * 1e6) / 1e6) < 1e-6, { engine: e.actual, sql: Math.round(c.s * 1e6) / 1e6 });
  });
  // the same row through the drill: the ids are exactly that currency's purchase orders
  if (curs.length >= 2) { const c = curs[curs.length - 1], k = GE.queryKeys(q, 9990001, Object.assign({ env: { '$C_Currency_ID': String(c.c) } }, ctxBase)), want = q("SELECT c_order_id AS i FROM c_order WHERE c_currency_id=? ORDER BY 1", [c.c]).map(x => x.i);
    ck('A2 queryKeys of the tagged measure == that currency\'s orders', k.ok && k.ids.slice().sort((a, b) => a - b).join() === want.join(), { got: k.ids, want }); }
  // (b) unparsable
  const b = GE.evaluateCalc(q, 9990002, Object.assign({ env: {} }, ctxBase));
  log('    §PA_CTX_B ok=' + b.ok + ' actual=' + b.actual + ' state=' + b.state + ' reason=' + JSON.stringify(b.reason));
  ck('B1 an unparsable tag empties the SQL: ok=false (SQL failed), value 0, state ERROR', !BREAK ? (b.ok === false && b.actual === 0 && b.state === 'ERROR') : (b.ok === false && b.actual === 0), b.reason);
  // (c) drill == count, every CAPEX COUNT(*) measure
  const counts = q("SELECT pa_measurecalc_id AS id, name FROM pa_measurecalc WHERE name LIKE 'CAPEX%' AND upper(selectclause) LIKE 'SELECT COUNT(*)%' ORDER BY 1"); let nonzero = 0;
  counts.forEach(c => {
    // a COUNT row that names the context currency (1000089 CAPEX Forecast projects, §5.75) is judged in a currency the store holds, as a login would supply it; a row with no tag is judged as before
    const tagged = /@\$C_Currency_ID@/.test(String((q('SELECT whereclause AS w FROM pa_measurecalc WHERE pa_measurecalc_id=?', [c.id])[0] || {}).w)), cur0 = tagged ? (q('SELECT MIN(C_Currency_ID) AS c FROM C_Project WHERE C_Currency_ID IS NOT NULL')[0] || {}).c : null;
    const cx = tagged ? Object.assign({ env: { $C_Currency_ID: String(cur0) } }, ctxBase) : ctxBase;
    const e = GE.evaluateCalc(q, c.id, cx), k = GE.queryKeys(q, c.id, cx); if (e.actual > 0) nonzero++;
    log('    §PA_CTX_C calc=' + c.id + ' ' + JSON.stringify(c.name) + ' count=' + e.actual + ' keys=' + (k.ok ? k.ids.length : 'ERR ' + k.reason));
    ck('C1 ' + c.id + ' drill rows == count', e.ok && k.ok && k.ids.length === e.actual, { count: e.actual, keys: k.ok ? k.ids.length : k.reason });
  });
  log('§PA_CTX_C_DENOM count_measures=' + counts.length + ' nonzero=' + nonzero);
  if (!counts.length || !nonzero) inc('C0 denominator', counts.length ? 'every count is 0' : 'no CAPEX COUNT(*) measure');
  finish();
})().catch(e => { log('§PA_CTX_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
function finish() {
  const v = fails ? 'FAIL' : judged && !inconc ? 'PASS' : 'INCONCLUSIVE';
  log('§PA_CTX_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (BREAK ? ' (PA_CTX_BREAK=1: FAIL expected)' : ''));
  process.exit(v === 'PASS' ? 0 : 1);
}
