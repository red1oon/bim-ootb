#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DDL-NOTNULL (bim-ootb prompts/CAPEX_DASHBOARD.md §5.73, G2). READ THE LOG after every run: every verdict is a §-line, the exit code is not evidence.
// THE ISSUE it proves/disproves: the twin saved a row that legacy's DATABASE refuses (a C_Project with no C_Currency_ID). Legacy has no Java check; PostgreSQL's NOT NULL refuses it.
//   The twin's rule is ModelLayer.notNullError over erp/ad_ddl_notnull.js. The ORACLE is PostgreSQL itself: the same INSERT / UPDATE run on the reference database inside a
//   transaction that is rolled back; the expected column is the one Postgres names, never one computed from the list under test.
// Cases: N0 list == live schema · N1 X of N tables, blank new record · N2 X of N columns, set to null · N3 C_Project through ML.save · N4 stored rows that hold a null · N5 one owner.
// Break switches (each must FAIL): NOTNULL_BREAK=nolist (nothing judged → INCONCLUSIVE) · =mandatory (the AD_Column.IsMandatory set instead of the DB's) · =nostar (default flags dropped).
// Needs the `postgres` container (database `idempiere`); without it N0-N2 print INCONCLUSIVE and the verdict is INCONCLUSIVE, never PASS.
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process');
const C = require('./dd_common.js'), ERP = path.join(__dirname, '..');
const BREAK = process.env.NOTNULL_BREAK || '', PGDB = process.env.NOTNULL_PGDB || 'idempiere';
const log = m => console.log(m);
let judged = 0, fails = 0, inconc = 0;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §DDL_NOTNULL ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i).slice(0, 900) : '')); };
const inc = (n, why) => { inconc++; log('  §DDL_NOTNULL ' + n + ' INCONCLUSIVE ' + why); };
const psql = (sql, opts) => cp.spawnSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'postgres', '-d', PGDB, '-tA', '-F', '|'].concat(opts || []), { input: sql, encoding: 'utf8', maxBuffer: 1 << 28 });
const lit = v => v == null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const NNRE = /null value in column "([^"]+)" of relation "([^"]+)" violates not-null constraint/;

(async () => {
  const LIST = require(path.join(ERP, 'ad_ddl_notnull.js'));
  // the live schema (also the column list the oracle INSERT may name)
  const live = psql("select c.table_name, c.column_name, c.is_nullable, case when c.column_default is null or c.column_default ~* '^NULL(::.*)?$' then '' else '*' end from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name where c.table_schema='adempiere' and t.table_type='BASE TABLE' order by c.table_name, c.ordinal_position");
  const PG = live.status === 0 && live.stdout.trim().length > 0, pgCols = {}, liveNN = {};
  if (PG) live.stdout.trim().split('\n').forEach(l => { const p = l.split('|'); (pgCols[p[0]] = pgCols[p[0]] || {})[p[1]] = 1; if (p[2] === 'NO') (liveNN[p[0]] = liveNN[p[0]] || []).push(p[1] + p[3]); });
  // break switches mutate the DATA the rule reads, before the model layer loads it
  if (BREAK === 'nolist') globalThis.AD_DDL_NOTNULL = false;
  if (BREAK === 'nostar') { const m = {}; Object.keys(LIST).forEach(t => { m[t] = LIST[t].replace(/\*/g, ''); }); globalThis.AD_DDL_NOTNULL = m; }
  const H = await C.boot(), ML = H.ML;
  if (BREAK === 'mandatory') { const m = {}; H.q("SELECT lower(t.tablename) AS t, lower(c.columnname) AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE c.ismandatory='Y' AND c.isactive='Y' AND c.columnsql IS NULL ORDER BY 1, c.ad_column_id").forEach(r => { m[r.t] = (m[r.t] ? m[r.t] + ',' : '') + r.c; }); globalThis.AD_DDL_NOTNULL = m; }
  log('§DDL_NOTNULL_DATA list_tables=' + Object.keys(LIST).length + ' list_columns=' + Object.keys(LIST).reduce((n, t) => n + LIST[t].split(',').length, 0) + ' postgres=' + (PG ? PGDB : 'ABSENT') + ' patch_ok=' + H.patchOk + ' patch_bad=' + H.patchBad + (BREAK ? ' (NOTNULL_BREAK=' + BREAK + ': not PASS expected)' : ''));
  const trx = () => new ML.Trx(H.q, H.env());
  const twinTables = H.q("SELECT lower(name) AS n FROM sqlite_master WHERE type='table'").map(r => r.n);
  const physical = t => H.q('PRAGMA table_info("' + t + '")').map(r => String(r.name).toLowerCase());

  // N0 — the generated list is the live schema's (not a stale file)
  if (!PG) inc('N0', 'postgres container not reachable');
  else { const bad = []; Object.keys(liveNN).forEach(t => { if (LIST[t] !== liveNN[t].join(',')) bad.push(t); }); Object.keys(LIST).forEach(t => { if (!liveNN[t]) bad.push(t); });
    ck('N0 ad_ddl_notnull.js == information_schema of ' + PGDB + ' (' + Object.keys(liveNN).length + ' tables)', bad.length === 0, { differ: bad.length, first: bad.slice(0, 5) }); }

  // N1 — X of N tables: a blank new record; the twin's answer == the column Postgres names for the same INSERT
  const enf = twinTables.filter(t => { const e = ML.notNullCols(trx(), t); return e && e.length; });
  log('§DDL_NOTNULL_POP twin_tables=' + twinTables.length + ' with_enforceable_notnull=' + enf.length + ' in_postgres=' + enf.filter(t => pgCols[t]).length);
  const isKey = {}; H.q("SELECT lower(t.tablename) AS t, lower(c.columnname) AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE c.iskey='Y' AND c.isactive='Y'").forEach(r => { if (/_id$/.test(r.c)) isKey[r.t + '.' + r.c] = 1; });
  const STD = { created: 'now()', updated: 'now()', createdby: '100', updatedby: '100', isactive: "'Y'" };
  let sql = '', cases = [];
  enf.forEach(t => {
    if (!pgCols[t]) return;
    const T = trx(); let row; try { row = ML.newPO(T, t, {}); } catch (e) { cases.push({ t, threw: String(e.message) }); return; }
    const twin = ML.notNullError(T, t, row, true), idc = T.idCol(t), cols = [], vals = [];
    Object.keys(pgCols[t]).forEach(c => {
      let v = row[c];
      if (c === t + '_uu') { cols.push(c); vals.push("'a0000000-0000-4000-8000-0000000000aa'"); return; }   // PO.saveNew makes the UU (PO.java:3547-3554)
      if (c === idc && isKey[t + '.' + c]) { cols.push(c); vals.push('999999990'); return; }   // PO assigns the key only for an IsKey column ending _ID (PO.java:3523-3528); a parent-keyed table gets it from the caller
      if (STD[c] && v == null) { cols.push(c); vals.push(STD[c]); return; }
      if ((c === 'ad_client_id' || c === 'ad_org_id') && v == null) { cols.push(c); vals.push('11'); return; }
      if (v == null) return;                                   // PO.doInsert omits a null column (PO.java:3735)
      cols.push(c); vals.push(lit(v));
    });
    cases.push({ t, twin: twin ? (NNRE.exec(twin) || [])[1] : null });
    sql += "\\warn §T " + t + "\nBEGIN;\nINSERT INTO adempiere." + t + (cols.length ? ' (' + cols.map(c => '"' + c + '"').join(',') + ') VALUES (' + vals.join(',') + ')' : ' DEFAULT VALUES') + ';\nROLLBACK;\n';
  });
  if (!PG) inc('N1', 'postgres container not reachable');
  else if (!cases.length) inc('N1', 'no twin table has an enforceable NOT NULL column (list absent?)');
  else {
    const pg = {};   // markers go out with \warn (stderr), as the errors do: stdout is block-buffered and would arrive out of order
    const merged = cp.spawnSync('bash', ['-c', 'docker exec -i postgres psql -U postgres -d ' + PGDB + ' -tA 2>&1 >/dev/null'], { input: sql, encoding: 'utf8', maxBuffer: 1 << 28 }).stdout;
    let cur = null; merged.split('\n').forEach(l => { const m = /^§T (\S+)/.exec(l); if (m) { cur = m[1]; pg[cur] = { col: null, other: null }; return; } if (!cur) return; const n = NNRE.exec(l); if (n) pg[cur].col = n[1]; else if (/^ERROR:/.test(l) && !pg[cur].other) pg[cur].other = l.slice(0, 120); });
    let X = 0, N = 0, bothAccept = 0, masked = 0; const bad = [];
    cases.forEach(c => { if (c.threw) { bad.push({ t: c.t, threw: c.threw }); N++; return; } const p = pg[c.t]; if (!p) { bad.push({ t: c.t, pg: 'no answer' }); N++; return; }
      if (p.col == null && p.other && /invalid input syntax|out of range/.test(p.other)) { masked++; return; }   // a value Postgres could not parse: the statement never reached the constraint (counted, not judged)
      N++; if (c.twin === p.col) { X++; if (c.twin == null) bothAccept++; } else bad.push({ t: c.t, twin: c.twin, pg: p.col, pgOther: p.other }); });
    log('§DDL_NOTNULL_N1 tables=' + N + ' equal=' + X + ' of_which_both_accept=' + bothAccept + ' both_refuse_same_column=' + (X - bothAccept) + ' unparsed_by_postgres=' + masked);
    if (X - bothAccept === 0) inc('N1', 'no table was refused on either side: nothing judged');
    else ck('N1 blank new record: the twin names the column Postgres names, ' + X + ' of ' + N + ' tables', X === N, { bad: bad.length, first: bad.slice(0, 8) });
  }

  // N2 — X of N columns: an UPDATE to null of each NOT NULL column of one stored row; oracle = the same UPDATE on a Postgres row
  let sql2 = '', c2 = [];
  enf.forEach(t => { if (!pgCols[t]) return; const T = trx(), cs = ML.notNullCols(T, t); cs.forEach(x => { if (!pgCols[t][x.c]) return;
    c2.push({ t, c: x.c, twin: !!ML.notNullError(T, t, { [x.c]: null }, false, [x.c]) });
    sql2 += '\\warn §C ' + t + '.' + x.c + '\nBEGIN;\nSET LOCAL session_replication_role = replica;\nUPDATE adempiere.' + t + ' SET "' + x.c + '"=NULL WHERE ctid = (SELECT ctid FROM adempiere.' + t + ' LIMIT 1);\nROLLBACK;\n'; }); });
  if (!PG) inc('N2', 'postgres container not reachable');
  else if (!c2.length) inc('N2', 'no enforceable column: nothing judged');
  else {
    const tabs2 = Array.from(new Set(c2.map(c => c.t))), hasRow = {};
    psql(tabs2.map(t => "SELECT '" + t + "|' || EXISTS (SELECT 1 FROM adempiere." + t + ');').join('\n')).stdout.split('\n').forEach(l => { const p = l.split('|'); if (p.length === 2) hasRow[p[0]] = p[1] === 'true'; });
    const merged = cp.spawnSync('bash', ['-c', 'docker exec -i postgres psql -U postgres -d ' + PGDB + ' -tA 2>&1 >/dev/null'], { input: sql2, encoding: 'utf8', maxBuffer: 1 << 28 }).stdout, pg = {};
    let cur = null; merged.split('\n').forEach(l => { const m = /^§C (\S+)/.exec(l); if (m) { cur = m[1]; pg[cur] = { nn: false, upd: null, other: null }; return; } if (!cur) return; if (NNRE.test(l)) pg[cur].nn = true; else if (/^ERROR:/.test(l)) pg[cur].other = l.slice(0, 120); });
    let X = 0, N = 0, empty = 0, other = 0; const bad = [];
    c2.forEach(c => { const p = pg[c.t + '.' + c.c]; if (!p) { N++; bad.push({ c: c.t + '.' + c.c, pg: 'no answer' }); return; }
      if (!hasRow[c.t]) { empty++; return; }                    // no row in the reference table: Postgres judged nothing
      if (!p.nn && p.other) { other++; N++; bad.push({ c: c.t + '.' + c.c, pgOther: p.other }); return; }
      N++; if (c.twin === p.nn) X++; else bad.push({ c: c.t + '.' + c.c, twin: c.twin, pg: p.nn }); });
    log('§DDL_NOTNULL_N2 columns=' + N + ' equal=' + X + ' empty_reference_table=' + empty + ' other_pg_error=' + other);
    if (!N) inc('N2', 'every reference table was empty'); else ck('N2 set to null on update: twin refuses == Postgres refuses, ' + X + ' of ' + N + ' columns', X === N, { bad: bad.length, first: bad.slice(0, 8) });
  }

  // N3 — the first case, through ML.save (the whole save path, not the function alone)
  require(path.join(ERP, 'model_project.js'));
  const r1 = H.save('C_Project', { ad_client_id: 11, ad_org_id: 11, value: 'W_NN_A', name: 'W_NN_A', issummary: 'N' });
  const want = 'DBExecuteError:ERROR: null value in column "c_currency_id" of relation "c_project" violates not-null constraint';
  ck('N3a a C_Project with no currency and no price list is refused with the saved DB error', r1.ok === false && r1.error === want, { ok: r1.ok, error: r1.error || r1.msg });
  const r2 = H.save('C_Project', { ad_client_id: 11, ad_org_id: 11, value: 'W_NN_B', name: 'W_NN_B', issummary: 'N', c_currency_id: 100 });
  ck('N3b the same project with a currency saves', r2.ok !== false, { error: r2.error || r2.msg });
  if (r2.ok !== false) { const id = H.lastId('c_project'), r3 = H.update('C_Project', id, { name: null }), r4 = H.update('C_Project', id, { description: null, note: 'x' });
    ck('N3c updating its Name to null is refused; updating a nullable column is not', r3.ok === false && /column "name" of relation "c_project"/.test(String(r3.error)) && r4.ok !== false, { r3: r3.error || r3.msg, r4: r4.error || r4.msg }); }

  // N4 — stored rows of the patched db that already hold a null in a NOT NULL column (reported; each is a twin seed/patch defect)
  let nullRows = 0, nullCols = 0; const worst = [];
  enf.forEach(t => { const T = trx(); ML.notNullCols(T, t).forEach(x => { let n = 0; try { n = Number(H.one('SELECT COUNT(*) AS n FROM "' + t + '" WHERE "' + x.c + '" IS NULL').n); } catch (e) {} if (n) { nullRows += n; nullCols++; worst.push({ c: t + '.' + x.c, n }); } }); });
  worst.sort((a, b) => b.n - a.n);
  log('§DDL_NOTNULL_N4 stored_null_in_notnull columns=' + nullCols + ' rows=' + nullRows + ' top=' + JSON.stringify(worst.slice(0, 12)));
  const n4file = process.env.NOTNULL_N4_OUT; if (n4file) fs.writeFileSync(n4file, worst.map(w => w.c + '\t' + w.n).join('\n') + '\n');

  // N5 — one owner: no private not-null rule left
  const ws = fs.readFileSync(path.join(ERP, 'ws_adinterface.js'), 'utf8'), ip = fs.readFileSync(path.join(ERP, 'processes', 'ImportProduct.js'), 'utf8');
  ck('N5 ws_adinterface.js and ImportProduct.js keep no private not-null rule (ML.notNullError is the one owner)', typeof ML.notNullError === 'function' && !/function pgNotNull/.test(ws) && !/violates not-null constraint/.test(ws) && !/violates not-null constraint/.test(ip), { ws: /function pgNotNull/.test(ws), ip: /violates not-null constraint/.test(ip) });

  const v = fails ? 'FAIL' : inconc ? 'INCONCLUSIVE' : 'PASS';
  log('§DDL_NOTNULL_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (BREAK ? ' (NOTNULL_BREAK=' + BREAK + ': not PASS expected)' : ''));
  process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 2);
})().catch(e => { log('§DDL_NOTNULL_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
