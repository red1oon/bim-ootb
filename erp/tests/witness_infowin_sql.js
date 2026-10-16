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
  const scratch = new SQL.Database(), TABLES0 = ['m_product', 'm_productprice', 'm_attributeset', 'm_product_po', 'c_bpartner', 'm_storageonhand', 'm_storagereservation', 'm_locator', 'm_warehouse', 'c_uom', 'm_product_bom', 'm_locatortype', 'c_order', 'c_orderline', 'm_relatedproduct', 'm_substitute', 'ad_org', 'm_pricelist', 'm_productprice', 'c_doctype', 'c_bpartner', 'm_pricelist_version', 'm_attributesetinstance', 'm_attributeinstance', 'm_attribute'];
  const TABLES = [...new Set(TABLES0)];
  const norm = (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v) ? v.replace('T', ' ').replace(/\.\d+$/, '') : (v && typeof v === 'object' ? JSON.stringify(v) : v);
  for (const t of TABLES) {
    const rows = PGROWS(`select * from ${t}`); if (!rows.length) { const cs = PGROWS(`select column_name as c from information_schema.columns where table_schema='adempiere' and table_name='${t}' order by ordinal_position`).map(x => x.c); scratch.run(`CREATE TABLE "${t}" (${cs.map(c => `"${c}"`).join(',')})`); continue; }   // an empty table keeps its columns
    const cols = Object.keys(rows[0]); scratch.run(`CREATE TABLE "${t}" (${cols.map(c => `"${c}"`).join(',')})`);
    const st = scratch.prepare(`INSERT INTO "${t}" VALUES (${cols.map(() => '?').join(',')})`); rows.forEach(r => st.run(cols.map(c => { const v = norm(r[c]); return v === undefined ? null : v; }))); st.free();
  }
  const patch = fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8'), vs = patch.slice(patch.indexOf('-- >>> VIEWS'), patch.indexOf('-- <<< VIEWS')).split(/;\s*\n/).map(x => x.replace(/^\s*--[^\n]*\n?/gm, '').trim()).filter(x => /^(DROP VIEW IF EXISTS (m_storage|m_product_stock_v|m_product_substituterelated_v)|CREATE VIEW (m_storage|m_product_stock_v|m_product_substituterelated_v) )/i.test(x)).map(x => process.env.INFOWIN_NEG === 'substrel' ? x.replace(/sum\(ms\.qtyonhand\) AS qtyonhand/g, 'sum(ms.qtyonhand) + 1 AS qtyonhand') : x);   // negative control: INFOWIN_NEG=substrel must turn the Substitute/Related rows FAIL
  vs.forEach(x => { try { scratch.run(x); } catch (e) {} });                                        // the views exactly as the self-heal loader creates them
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
  const nd = (v) => String(v).replace(/^(\d{4}-\d\d-\d\d)T/, '$1 ').replace(/\.\d+/, '').replace(/[+-]00(:00)?$/, '').replace(/\s+$/, '');   // psql timestamps vs the twin's stored text
  const key = (r) => JSON.stringify(Object.keys(r).map(k => k.toLowerCase()).sort().map(k => { const v = r[Object.keys(r).find(x => x.toLowerCase() === k)]; return [k, v == null ? null : (num(v) ? Math.round(Number(v) * 1e6) / 1e6 : nd(v))]; }));
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
  // 2. the detail tabs (InfoProductWindow.renderContentPane / initAtpTab): the SAME statement text on legacy and twin
  const prods = PGROWS("select distinct m_product_id as p from (select m_product_id from m_storageonhand union select m_product_id from m_storagereservation) x order by 1 limit 24").map(r => r.p).concat(PGROWS('select distinct m_product_id as p from m_product_substituterelated_v').map(r => r.p)).filter((v, i, a) => a.indexOf(v) === i);   // + every product that HAS substitutes/related rows
  const sub = (b) => { let i = 0; return b.sql.replace(/\?/g, () => { const v = b.params[i++]; return typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'"; }); };
  const runPair = (label, b) => {
    let L, T; try { L = PGROWS(sub(b)); } catch (e) { log('§INFOWIN_SQL tab=' + label + ' verdict=FAIL reason="legacy rejected: ' + String(e.message).slice(0, 160) + '"'); return 'FAIL'; }
    try { const st = scratch.prepare(A.convertSql(b.sql)); st.bind(b.params); T = []; while (st.step()) T.push(st.getAsObject()); st.free(); } catch (e) { log('§INFOWIN_SQL tab=' + label + ' verdict=FAIL reason="twin rejected: ' + String(e.message).slice(0, 160) + '"'); return 'FAIL'; }
    const lm = new Map(); L.forEach(r => { const k = key(r); lm.set(k, (lm.get(k) || 0) + 1); }); let miss = 0; T.forEach(r => { const k = key(r); if (lm.get(k)) lm.set(k, lm.get(k) - 1); else miss++; });
    const left = [...lm.values()].reduce((a, b2) => a + b2, 0), nz = L.filter(r => Object.values(r).some(v => num(v) && Number(v) !== 0 && typeof v !== 'string')).length;
    if ((L.length !== T.length || miss || left) && process.env.INFOWIN_DEBUG) log('  §INFOWIN_SQL-DIFF ' + label + ' legacy0=' + JSON.stringify(L[0]) + ' twin0=' + JSON.stringify(T[0]));
    return { L: L.length, T: T.length, miss: miss, left: left, nz: nz, v: (!L.length && !T.length) ? 'EMPTY' : (L.length !== T.length || miss || left) ? 'FAIL' : 'PASS' };
  };
  const plvs = PGROWS('select distinct m_pricelist_version_id as v from m_product_substituterelated_v order by 1').map(r => r.v).concat([0]);
  const tabStats = { PASS: 0, FAIL: 0, EMPTY: 0, rows: 0, nz: 0 }, sr = { PASS: 0, FAIL: 0, EMPTY: 0, rows: 0 };
  for (const p of prods) {
    const cases = [['stock', { sql: IW.stockSql(), params: [p] }]];
    [[true, 0], [false, 0], [true, 103], [false, 103], [false, 104]].forEach(([d, w]) => cases.push(['atp detail=' + d + ' wh=' + w, IW.atpSql(d, w, 0, p)]));
    [0, 103, 104].forEach(w => cases.push(['atp orders wh=' + w, IW.atpOrdersSql(w, 0, p)]));
    cases.push(['price', { sql: IW.priceSql(), params: [p] }]);
    plvs.forEach(v => ['S', 'R'].forEach(t => cases.push(['subst/related ' + t + ' plv=' + v, IW.substRelSql(t, p, v)])));
    for (const [label, b] of cases) {
      const r = runPair('p' + p + ' ' + label, b); if (r === 'FAIL') { tabStats.FAIL++; failed++; continue; }
      if (/subst\/related/.test(label)) { sr[r.v]++; sr.rows += r.L; }
      tabStats[r.v]++; tabStats.rows += r.L; tabStats.nz += r.nz; if (r.v === 'FAIL') { failed++; log('§INFOWIN_SQL tab=p' + p + ' ' + label + ' legacyRows=' + r.L + ' twinRows=' + r.T + ' unmatchedTwin=' + r.miss + ' unmatchedLegacy=' + r.left + ' verdict=FAIL'); }
    }
  }
  log('§INFOWIN_SQL tabs products=' + prods.length + ' statements=' + (tabStats.PASS + tabStats.FAIL + tabStats.EMPTY) + ' PASS=' + tabStats.PASS + ' FAIL=' + tabStats.FAIL + ' EMPTY=' + tabStats.EMPTY + ' legacyRows=' + tabStats.rows + ' withNonZero=' + tabStats.nz);
  log('§INFOWIN_SQL substrel PASS=' + sr.PASS + ' FAIL=' + sr.FAIL + ' EMPTY=' + sr.EMPTY + ' legacyRows=' + sr.rows + (sr.PASS + sr.FAIL ? '' : ' verdict=INCONCLUSIVE (no non-empty Substitute/Related statement judged)'));
  if (tabStats.PASS) judgedAny++;
  const verdict = failed ? 'FAIL' : judgedAny ? 'PASS' : 'INCONCLUSIVE';
  log('§INFOWIN_SQL summary judged=' + judgedAny + ' failed=' + failed + ' verdict=' + verdict); process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 3);
})().catch(e => { console.log('§INFOWIN_SQL ERROR ' + (e.stack || e)); process.exit(2); });
