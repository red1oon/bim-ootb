#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-LEGACY-CDATA (prompts/CAPEX_DASHBOARD.md §5.75 step 1). READ THE LOG after every run; the exit code is not evidence.
// THE ISSUE it proves/disproves: legacy's web service JSON answer drops a value its XML answer wraps in CDATA, so the page read the Health Amber rule (PA_MeasureCalc 1000024,
//   a 1,878-character WhereClause) as '' and counted EVERY project as Amber on the legacy source. adapters.js loadLegacy now restores such values from the XML answer.
// ORACLE = the server's own XML answer (not the adapter): every text value of every PA_MeasureCalc row, CDATA unwrapped and entities unescaped.
// C1 X of N rows: the loaded SelectClause and WhereClause equal the XML answer's · C2 at least one value was a CDATA value (else INCONCLUSIVE: nothing was at risk) ·
// C3 repairCdata refuses a row-count mismatch. Break LEGACY_CDATA_BREAK=1 (the repair skipped) -> C1 must FAIL. Needs the local pilot (:8088); unreachable -> INCONCLUSIVE.
'use strict';
const A = require('../adapters.js'), BREAK = process.env.LEGACY_CDATA_BREAK === '1', base = process.env.BRIDGE_BASE || 'http://localhost:8088';
const login = { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', ClientID: 11, RoleID: 102, OrgID: 11, WarehouseID: 103, stage: 0 }, log = console.log;
let judged = 0, fails = 0, inconc = 0;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §LEGACY_CDATA ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i).slice(0, 600) : '')); };
const inc = (n, why) => { inconc++; log('  §LEGACY_CDATA ' + n + ' INCONCLUSIVE ' + why); };
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
(async () => {
  let xml;
  try { xml = await (await fetch(base + '/ADInterface/services/rest/model_adservice/query_data', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/xml' }, body: JSON.stringify({ ModelCRUDRequest: { ModelCRUD: { serviceType: A.LEGACY_TYPES.pacalc }, ADLoginRequest: login } }) })).text(); }
  catch (e) { inc('C0', 'the pilot is not reachable at ' + base + ' (' + e.message + ')'); log('§LEGACY_CDATA_VERDICT INCONCLUSIVE judged=0 fail=0 inconclusive=1'); process.exit(2); }
  // the oracle: the XML answer, parsed here (independent of adapters.js)
  const want = {}; let cdataVals = 0;
  (xml.match(/<(?:\w+:)?DataRow>[\s\S]*?<\/(?:\w+:)?DataRow>/g) || []).forEach(dr => { const o = {}, re = /<(?:\w+:)?field column="([^"]*)"[^>]*>\s*<(?:\w+:)?val[^>]*>([\s\S]*?)<\/(?:\w+:)?val>/g; let m;
    while ((m = re.exec(dr))) { const cd = /<!\[CDATA\[/.test(m[2]); if (cd) cdataVals++; o[m[1]] = cd ? m[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t) => t) : unesc(m[2]); }
    want[String(o.PA_MeasureCalc_ID)] = o; });
  if (BREAK) A.repairCdata = null;
  const _f = global.fetch; let calls = 0; if (BREAK) global.fetch = (u, o) => { calls++; return o && o.headers && /xml/.test(o.headers.Accept || '') ? Promise.resolve({ text: () => Promise.resolve('<x/>') }) : _f(u, o); };   // the break: the XML re-read answers nothing, as before the fix
  const _l = console.log; console.log = () => {}; let d; try { d = await A.loadLegacy({ base, login }); } finally { console.log = _l; global.fetch = _f; }
  const rows = d.pacalc || [];
  log('§LEGACY_CDATA_DATA base=' + base + ' pacalc_rows=' + rows.length + ' xml_rows=' + Object.keys(want).length + ' cdata_values_in_xml=' + cdataVals + ' restored=' + (d.meta.cdata_pacalc || 0) + (BREAK ? ' (LEGACY_CDATA_BREAK=1: FAIL expected)' : ''));
  if (!rows.length) { inc('C1', 'the server gave no PA_MeasureCalc rows'); }
  else { let X = 0; const bad = []; rows.forEach(r => { const w = want[String(r.PA_MeasureCalc_ID)]; const ok = w && ['SelectClause', 'WhereClause'].every(c => String(r[c] == null ? '' : r[c]) === String(w[c] == null ? '' : w[c])); if (ok) X++; else bad.push({ id: r.PA_MeasureCalc_ID, got: String(r.WhereClause || '').length, want: w ? String(w.WhereClause || '').length : null }); });
    ck('C1 the loaded SelectClause and WhereClause equal the server\'s XML answer, ' + X + ' of ' + rows.length + ' rows', X === rows.length, { bad }); }
  if (!cdataVals) inc('C2', 'no value of this server\'s rows is a CDATA value: nothing was at risk'); else ck('C2 the population holds CDATA values (' + cdataVals + '), so C1 judged the defect', true);
  let threw = false; try { A.repairCdata ? A.repairCdata([{ a: '' }, { a: '' }], '<DataRow><field column="a"><val><![CDATA[x<y]]></val></field></DataRow>') : (threw = true); } catch (e) { threw = /§AD_CDATA/.test(e.message); }
  ck('C3 a row-count mismatch between the two answers is refused, never guessed', threw);
  const v = fails ? 'FAIL' : inconc ? 'INCONCLUSIVE' : 'PASS';
  log('§LEGACY_CDATA_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (BREAK ? ' (LEGACY_CDATA_BREAK=1: FAIL expected)' : ''));
  process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 2);
})().catch(e => { log('§LEGACY_CDATA_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
