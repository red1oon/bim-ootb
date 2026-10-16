#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-VIEWS-PARITY (bim-compiler prompts/ERP_DEPTH_FILM.md §FN-CENSUS stage 4; CARDINAL RULE: a view the legacy windows sit on returns the same rows on the twin).
//   READ THE LOG after every run: every verdict is a §VIEWS line; the exit code is not the evidence.
// THE ISSUE it proves/disproves: the views in erp/patches/ad_seed.db.sql (translated mechanically from pg_get_viewdef by build_views_patch.py) return, on the pilot's own base rows, the same
//   multiset of rows as the pilot's view. The pilot's base tables are copied into a scratch SQLite, the patch's view statements are applied exactly as the self-heal loader does (one by one),
//   the registered UDFs are available. A view with 0 rows on both sides is INCONCLUSIVE (nothing judged). Mismatches print the first differing row.
'use strict';
const cp = require('child_process'), fs = require('fs'), path = require('path');
const ERP = path.join(__dirname, '..');
let initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
const log = (s) => console.log(s);
const PGRAW = (sql) => cp.spawnSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'postgres', '-d', 'idempiere_pilot', '-tA', '-c', 'set search_path=adempiere;' + sql], { encoding: 'utf8', maxBuffer: 1 << 29 });
const PGROWS = (sql) => { const r = PGRAW(`select coalesce(jsonb_agg(to_jsonb(zz__)),'[]') from (${sql}) zz__`); const o = (r.stdout || '').replace(/^SET\n/, '').trim(); if (!o) throw new Error('pilot query failed: ' + (r.stderr || '').slice(0, 200) + ' :: ' + sql.slice(0, 100)); return JSON.parse(o); };
(async function main() {
  const patch = fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8'), a = patch.indexOf('-- >>> VIEWS'), b = patch.indexOf('-- <<< VIEWS');
  if (a < 0 || b < 0) { log('§VIEWS verdict=INCONCLUSIVE reason="no VIEWS section in patches/ad_seed.db.sql"'); process.exit(3); }
  const stmts = patch.slice(a, b).split(/;\s*\n/).map(s => s.replace(/^\s*--[^\n]*\n?/gm, '').trim()).filter(Boolean), views = stmts.filter(s => /^CREATE VIEW/i.test(s)).map(s => /^CREATE VIEW (\w+)/i.exec(s)[1]);
  try { PGROWS('select 1 as x'); } catch (e) { log('§VIEWS verdict=INCONCLUSIVE reason="legacy oracle unreachable: docker start postgres"'); process.exit(3); }
  // base tables = dependency closure of the views, minus the views themselves
  const deps = PGROWS(`with recursive d(rel, kind) as (select c.oid, c.relkind from pg_class c where c.relnamespace='adempiere'::regnamespace and c.relname in (${views.map(v => `'${v}'`).join(',')}) union select c2.oid, c2.relkind from d join pg_rewrite r on r.ev_class=d.rel and d.kind='v' join pg_depend dep on dep.objid=r.oid join pg_class c2 on c2.oid=dep.refobjid and c2.oid<>d.rel and c2.relkind in ('r','v')) select distinct c.relname as n, c.relkind as k from d join pg_class c on c.oid=d.rel`);
  const SQL = await initSqlJs(), db = new SQL.Database(), norm = (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v) ? v.replace('T', ' ') : (v && typeof v === 'object' ? JSON.stringify(v) : v);   // keep the fraction: PG UNION de-duplicates on it
  const UDF_TABLES = ['c_currency', 'c_conversion_rate', 'c_conversiontype', 'ad_clientinfo', 'c_acctschema', 'm_attributesetinstance', 'm_attributeinstance', 'm_attributeset', 'm_attribute', 'pp_mrp', 'm_forecast', 'c_order', 'dd_order', 'pp_order', 'm_requisition', 'm_storageonhand', 'm_storagereservation', 'm_locator', 'm_warehouse', 'c_uom', 'm_product', 'm_productprice', 'm_product_bom'];   // tables the stored-function UDFs read (not visible in the view's own dependencies)
  const base = [...new Set(deps.filter(d => d.k === 'r').map(d => d.n).concat(UDF_TABLES))];
  for (const t of base) {
    const rows = PGROWS(`select * from ${t}`); if (!rows.length) { const cs = PGROWS(`select column_name as c from information_schema.columns where table_schema='adempiere' and table_name='${t}' order by ordinal_position`).map(x => x.c); db.run(`CREATE TABLE "${t}" (${cs.map(c => `"${c}"`).join(',')})`); continue; }   // an EMPTY table still has its columns
    const cols = Object.keys(rows[0]); db.run(`CREATE TABLE "${t}" (${cols.map(c => `"${c}"`).join(',')})`);
    const st = db.prepare(`INSERT INTO "${t}" VALUES (${cols.map(() => '?').join(',')})`); rows.forEach(r => st.run(cols.map(c => { const v = norm(r[c]); return v === undefined ? null : v; }))); st.free();
  }
  const A = require(path.join(ERP, 'ad_callout.js')); ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(m => require(path.join(ERP, 'callouts', m + '.js')));
  A.RUNTIME.registerSqlFunctions((n, f) => db.create_function(n, f));
  A.bind((sql, params) => { const st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params); while (st.step()) { const o = st.getAsObject(), r = {}; for (const k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }, {});   // the UDFs read through the bound DB
  let applied = 0, applyFail = 0; stmts.forEach(s => { try { db.run(s); applied++; } catch (e) { applyFail++; log('§VIEWS apply-FAILED ' + s.slice(0, 60) + ' :: ' + String(e.message).slice(0, 120)); } });
  log('§VIEWS-SEED views=' + views.length + ' baseTables=' + base.length + ' statementsApplied=' + applied + ' failed=' + applyFail);
  const NOWMS = Date.now(), isNow = (str) => { const t = Date.parse(String(str).replace(' ', 'T').replace(/([+-]00(:00)?)?$/, 'Z')); return !isNaN(t) && Math.abs(t - NOWMS) < 10 * 60 * 1000; };   // a column that IS the clock (statement_timestamp()) reads each side's own now: compared as NOW
  const num = (x) => x != null && x !== '' && typeof x !== 'boolean' && !isNaN(Number(x)), key = (r) => JSON.stringify(Object.keys(r).map(k => k.toLowerCase()).sort().map(k => { const raw = r[Object.keys(r).find(x => x.toLowerCase() === k)]; return [k, raw == null ? null : (num(raw) ? Math.round(Number(raw) * 1e5) / 1e5 : (typeof raw === 'string' && /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/.test(raw) && isNow(raw)) ? 'NOW' : String(norm(raw)).replace(/\.\d+$/, '').replace(/[+-]00(:00)?$/, '').replace(/\s+$/, ''))]; }));
  let failed = 0, passed = 0, inconc = 0;
  for (const v of views) {
    let L, T, err = null;
    try { L = PGROWS(`select * from ${v}`); } catch (e) { log('§VIEWS view=' + v + ' verdict=INCONCLUSIVE reason="pilot select failed"'); inconc++; continue; }
    try { const st = db.prepare(`SELECT * FROM ${v}`); T = []; while (st.step()) T.push(st.getAsObject()); st.free(); } catch (e) { err = String(e.message).slice(0, 160); }
    if (err) { log('§VIEWS view=' + v + ' legacyRows=' + L.length + ' verdict=FAIL reason="twin select failed: ' + err + '"'); failed++; continue; }
    const lm = new Map(); L.forEach(r => { const k = key(r); lm.set(k, (lm.get(k) || 0) + 1); }); let miss = 0, ex = null; T.forEach(r => { const k = key(r); if (lm.get(k)) lm.set(k, lm.get(k) - 1); else { miss++; ex = ex || r; } });
    const left = [...lm.values()].reduce((x, y) => x + y, 0), vd = (!L.length && !T.length) ? 'INCONCLUSIVE' : (L.length !== T.length || miss || left) ? 'FAIL' : 'PASS';
    log('§VIEWS view=' + v + ' legacyRows=' + L.length + ' twinRows=' + T.length + ' unmatchedTwin=' + miss + ' unmatchedLegacy=' + left + ' verdict=' + vd);
    if (vd === 'FAIL' && miss <= 3 && left <= 3) { const lrows = L.filter(r => lm.get(key(r))), trows = T.filter(r => !L.some(l => key(l) === key(r))); lrows.slice(0, 2).forEach(r => log('  §VIEWS-ONLY-LEGACY ' + JSON.stringify(r).slice(0, 420))); trows.slice(0, 2).forEach(r => log('  §VIEWS-ONLY-TWIN   ' + JSON.stringify(r).slice(0, 420))); }
    if (vd === 'FAIL' && L.length && T.length) {      // which COLUMNS differ: compare each column's value multiset
      const cols = Object.keys(L[0] || {}), bad = []; const sameLen = L.length === T.length;
      cols.forEach(c => { if (!sameLen) { /* multisets of different size: compare distinct values */ } const lc = [...new Set(L.map(r => key({ [c]: r[c] })))].sort(), tcn = Object.keys(T[0] || {}).find(x => x.toLowerCase() === c.toLowerCase()); if (!tcn) { bad.push(c + '(absent in twin)'); return; } const tc = [...new Set(T.map(r => key({ [c]: r[tcn] })))].sort(); if (JSON.stringify(lc) !== JSON.stringify(tc)) bad.push(c); });
      log('  §VIEWS-DIFF differing columns: ' + (bad.join(', ') || '(none - row pairing differs)'));
      const uk = cols.find(c => new Set(L.map(r => r[c])).size === L.length && /_id$/i.test(c));   // pair rows by the first unique *_id column and show examples
      if (uk && bad.length) { const tmap = new Map(T.map(r => [String(r[Object.keys(r).find(x => x.toLowerCase() === uk.toLowerCase())]), r])); let n = 0; for (const lr of L) { const tr = tmap.get(String(lr[uk])); if (!tr) continue; const bc = bad[0].replace(/\(.*/, ''), tcn = Object.keys(tr).find(x => x.toLowerCase() === bc.toLowerCase()); if (key({ [bc]: lr[bc] }) !== key({ [bc]: tr[tcn] })) { log('  §VIEWS-EX ' + uk + '=' + lr[uk] + ' ' + bc + ' legacy=' + JSON.stringify(lr[bc]) + ' twin=' + JSON.stringify(tr[tcn])); if (++n >= 4) break; } } }
    } else if (vd === 'FAIL' && ex) log('  §VIEWS-DIFF first twin row not in legacy: ' + JSON.stringify(ex).slice(0, 300));
    if (vd === 'PASS') passed++; else if (vd === 'FAIL') failed++; else inconc++;
  }
  const verdict = (failed || applyFail) ? 'FAIL' : passed ? 'PASS' : 'INCONCLUSIVE';
  log('§VIEWS summary views=' + views.length + ' PASS=' + passed + ' FAIL=' + failed + ' INCONCLUSIVE=' + inconc + ' verdict=' + verdict); process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 3);
})().catch(e => { console.log('§VIEWS ERROR ' + (e.stack || e)); process.exit(2); });
