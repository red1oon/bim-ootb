#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-INFOWIN-SQL (bim-compiler prompts/ERP_DEPTH_FILM.md §FN-CENSUS stage 3f; supersedes W-INFOPROD-PARITY, whose subject - the bom* SQL template registry - is deleted).
//   READ THE LOG after every run: every verdict is a §INFOWIN_SQL line; the exit code is not the evidence.
// THE ISSUE it proves/disproves: the twin builds the Info Window SQL the LEGACY way (InfoWindow.java:1757-1773 + Env.parseContextForSql: the dictionary SelectClause/FromClause text as written,
//   @Var@ -> bound '?') and the stored functions it calls (bomQtyAvailable/OnHand/Reserved/Ordered, bomPriceList/Std/Limit) are registered UDFs, so the SAME statement text run by the legacy
//   pilot and by the twin on the SAME rows returns the same rows. Rows are compared as a multiset (key + every displayed column). INCONCLUSIVE when no row has a non-zero quantity (the
//   functions were never exercised) or a side hits the LIMIT. Also: an unresolvable context variable builds NOTHING (Env.parseContextForSql returns "").
'use strict';
const cp = require('child_process'), fs = require('fs'), path = require('path');
const ERP = path.join(__dirname, '..');
let initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
global.window = global; global.document = {};
const PGRAW = (sql) => cp.spawnSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'postgres', '-d', 'idempiere_pilot', '-tA', '-c', 'set search_path=adempiere;' + sql], { encoding: 'utf8', maxBuffer: 1 << 28 });
const PGROWS = (sql) => { const r = PGRAW(`select coalesce(jsonb_agg(to_jsonb(zz__)),'[]') from (${sql}) zz__`); const o = (r.stdout || '').replace(/^SET\n/, '').trim(); if (!o) throw new Error('pilot query failed: ' + (r.stderr || '').slice(0, 200) + ' :: ' + sql.slice(0, 120)); return JSON.parse(o); };
const log = (s) => console.log(s);
(async function main() {
  const SQL = await initSqlJs();
  const seed = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(st => { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) { try { seed.run(st); } catch (e) {} } });
  window.__idmpDb = seed;                                     // the dictionary reader (adQ)
  require(path.join(ERP, 'ad_infowin.js')); const IW = window.AdInfoWindow;
  try { PGROWS('select 1 as x'); } catch (e) { log('§INFOWIN_SQL verdict=INCONCLUSIVE reason="legacy oracle unreachable: docker start postgres"'); process.exit(3); }
  // scratch twin = the pilot's rows for every table the Product Info statement and its functions read
  const scratch = new SQL.Database(), TABLES = ['m_product', 'm_productprice', 'm_attributeset', 'm_product_po', 'c_bpartner', 'm_storageonhand', 'm_storagereservation', 'm_locator', 'm_warehouse', 'c_uom', 'm_product_bom'];
  const norm = (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v) ? v.replace('T', ' ').replace(/\.\d+$/, '') : (v && typeof v === 'object' ? JSON.stringify(v) : v);
  for (const t of TABLES) {
    const rows = PGROWS(`select * from ${t}`); if (!rows.length) { scratch.run(`CREATE TABLE "${t}" ("_empty")`); continue; }
    const cols = Object.keys(rows[0]); scratch.run(`CREATE TABLE "${t}" (${cols.map(c => `"${c}"`).join(',')})`);
    const st = scratch.prepare(`INSERT INTO "${t}" VALUES (${cols.map(() => '?').join(',')})`); rows.forEach(r => st.run(cols.map(c => { const v = norm(r[c]); return v === undefined ? null : v; }))); st.free();
  }
  const A = require(path.join(ERP, 'ad_callout.js')); ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(m => require(path.join(ERP, 'callouts', m + '.js')));
  A.RUNTIME.registerSqlFunctions((n, f) => scratch.create_function(n, f));
  A.bind((sql, params) => { const st = scratch.prepare(sql), out = []; try { if (params && params.length) st.bind(params); while (st.step()) { const o = st.getAsObject(), r = {}; for (const k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }, {});
  window.AdCallout = A;
  const def = IW.definition('M_Product', 11); if (!def) { log('§INFOWIN_SQL verdict=INCONCLUSIVE reason="no AD_InfoWindow row for M_Product in the seed"'); process.exit(3); }
  window.__idmpDb = scratch;                                  // from here the window's reads (column probe) hit the scratch rows
  const disp = def.cols.filter(c => c.isdisplayed === 'Y'), crit = def.cols.filter(c => c.isquerycriteria === 'Y'), hook = IW.hook('M_Product'), byName = (n) => crit.find(c => c.columnname === n);
  log('§INFOWIN_SQL-SEED infowindow=' + def.iw.ad_infowindow_id + ' "' + def.iw.name + '" displayed=' + disp.length + ' criteria=' + crit.length + ' scratchTables=' + TABLES.length);
  // 1. legacy semantic: an unresolvable context variable builds nothing
  const noCtx = IW.buildInfoSql(def, {}, [], hook, 11, disp);
  log('§INFOWIN_SQL case=unresolved-context built=' + (noCtx ? 'YES' : 'NO') + ' want=NO verdict=' + (noCtx ? 'FAIL' : 'PASS'));
  let failed = noCtx ? 1 : 0, judgedAny = 0;
  const num = (x) => x != null && x !== '' && typeof x !== 'boolean' && !isNaN(Number(x));
  const key = (r) => JSON.stringify(Object.keys(r).sort().map(k => { const v = r[k]; return [k, v == null ? null : (num(v) ? Math.round(Number(v) * 1e6) / 1e6 : String(v))]; }));
  const cases = [['wh103', { M_Warehouse_ID: 103 }, []], ['wh104', { M_Warehouse_ID: 104 }, []], ['wh103 Name like', { M_Warehouse_ID: 103 }, [{ def: byName('Name'), value: 'a' }]], ['wh103 Value like', { M_Warehouse_ID: 103 }, [{ def: byName('Value'), value: 'S' }]]];
  for (const [label, ctx, cv] of cases) {
    const b = IW.buildInfoSql(def, ctx, cv, hook, 11, disp); if (!b) { log('§INFOWIN_SQL case=' + label + ' verdict=FAIL reason="builder returned null"'); failed++; continue; }
    let i = 0; const legacySql = b.sql.replace(/\?/g, () => { const v = b.params[i++]; return typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'"; });
    if (i !== b.params.length) { log('§INFOWIN_SQL case=' + label + ' verdict=FAIL reason="placeholder/param count mismatch ' + i + '/' + b.params.length + '"'); failed++; continue; }
    let L, T; try { L = PGROWS(legacySql); } catch (e) { log('§INFOWIN_SQL case=' + label + ' verdict=FAIL reason="legacy rejected the SAME statement: ' + String(e.message).slice(0, 200) + '"'); failed++; continue; }
    try { const st = scratch.prepare(A.convertSql(b.sql)); st.bind(b.params); T = []; while (st.step()) T.push(st.getAsObject()); st.free(); } catch (e) { log('§INFOWIN_SQL case=' + label + ' verdict=FAIL reason="twin rejected: ' + String(e.message).slice(0, 200) + '"'); failed++; continue; }
    const lim = Number(def.iw.maxqueryrecords) || 1000, qcols = Object.keys(L[0] || T[0] || {}).filter(k => /^c\d+$/.test(k) && disp[Number(k.slice(1))] && /^(QtyAvailable|QtyOnHand|QtyReserved|QtyOrdered)$/.test(disp[Number(k.slice(1))].columnname));
    const nz = L.filter(r => qcols.some(k => num(r[k]) && Number(r[k]) !== 0)).length;
    const lm = new Map(); L.forEach(r => { const k = key(r); lm.set(k, (lm.get(k) || 0) + 1); }); let miss = 0; T.forEach(r => { const k = key(r); if (lm.get(k)) lm.set(k, lm.get(k) - 1); else miss++; });
    const left = [...lm.values()].reduce((a, b) => a + b, 0), hit = L.length >= lim || T.length >= lim;
    const v = (!L.length && !T.length) ? 'INCONCLUSIVE' : hit ? 'INCONCLUSIVE' : (L.length !== T.length || miss || left) ? 'FAIL' : nz === 0 ? 'INCONCLUSIVE' : 'PASS';
    log('§INFOWIN_SQL case=' + label + ' legacyRows=' + L.length + ' twinRows=' + T.length + ' unmatchedTwin=' + miss + ' unmatchedLegacy=' + left + ' nonZeroQtyRows=' + nz + ' verdict=' + v + (v === 'INCONCLUSIVE' ? (hit ? ' (LIMIT hit)' : ' (functions not exercised)') : ''));
    if (v === 'FAIL') { failed++; const ex = T.find(r => !L.some(l => key(l) === key(r))); if (ex) log('  §INFOWIN_SQL-DIFF twin row not in legacy: ' + JSON.stringify(ex)); }
    if (v === 'PASS') judgedAny++;
  }
  const verdict = failed ? 'FAIL' : judgedAny ? 'PASS' : 'INCONCLUSIVE';
  log('§INFOWIN_SQL summary judged=' + judgedAny + ' failed=' + failed + ' verdict=' + verdict); process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 3);
})().catch(e => { console.log('§INFOWIN_SQL ERROR ' + (e.stack || e)); process.exit(2); });
