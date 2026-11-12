#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-ENTITYTYPE (spec prompts/CAPEX_DASHBOARD.md §5.57). READ THE LOG: verdict = §ENTITYTYPE_VERDICT; an arm that judged 0 rows prints INCONCLUSIVE, never PASS.
// ISSUE it proves/disproves: "dictionary rows our plugins ship are EntityType 'U' (User maintained), indistinguishable from a site's own customisations; they must be 'A' (Applications)".
// E1 twin: every row of every manifest table (erp/plugins/bim_document.mjs) that carries entitytype is 'A' · E2 workbook BIM_Document.xlsx (the ONE source of the 2Pack and the Java) · E3 legacy test instance
// (psql idempiere_bimdoc): the same rows read back, 'A' · E4 CAPEX migration scripts: the newest script re-labels every PA_MeasureCalc/PA_ColorSchema row the earlier scripts insert, and a pack carries it ·
// E5 pilot (psql idempiere_pilot): CAPEX rows 'A', stock rows ('D') untouched. ENTITY_BREAK=1 flips one judged row to 'U' in E1 and must FAIL.
// Usage: node capex/tests/witness_entitytype.js
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), log = console.log, BREAK = process.env.ENTITY_BREAK === '1';
const ROOT = path.join(__dirname, '..', '..'), MIG = path.join(ROOT, 'capex/legacy/migration/iD13/postgresql');
const arms = {}; let fails = 0;
const ck = (arm, n, ok, i) => { arms[arm] = arms[arm] || { j: 0, f: 0 }; arms[arm].j++; if (!ok) { arms[arm].f++; fails++; } log('  §ENTITYTYPE ' + arm + ' ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const inc = (arm, why) => { arms[arm] = arms[arm] || { j: 0, f: 0 }; log('  §ENTITYTYPE ' + arm + ' INCONCLUSIVE ' + why); };
const psql = (db, sql) => { const r = cp.spawnSync('docker', ['exec', 'postgres', 'psql', '-U', 'adempiere', '-d', db, '-Atc', sql], { encoding: 'utf8', timeout: 20000 }); return r.status === 0 ? r.stdout.trim() : null; };
(async () => {
  // E1 twin manifest
  const man = (await import(path.join(ROOT, 'erp/plugins/bim_document.mjs'))).manifest, tally = {};
  man.dictionary.forEach((d) => d.rows.filter((r) => 'entitytype' in r).forEach((r, i) => { const v = (BREAK && d.table === 'ad_table' && i === 0) ? 'U' : r.entitytype; tally[d.table] = tally[d.table] || { n: 0, bad: 0 }; tally[d.table].n++; if (v !== 'A') tally[d.table].bad++; }));
  const tn = Object.keys(tally), total = tn.reduce((s, t) => s + tally[t].n, 0), bad = tn.filter((t) => tally[t].bad);
  if (!total) inc('E1', 'no manifest row carries entitytype'); else ck('E1', 'twin manifest: ' + total + ' rows in ' + tn.length + ' tables all A; not A: ' + (bad.map((t) => t + ':' + tally[t].bad).join(',') || 'none'), bad.length === 0, tally);
  // E2 workbook
  const XP = require(path.join(ROOT, 'erp/tools/xlsx_pack.js')), model = XP.readWorkbook(path.join(ROOT, 'erp/plugins/models/BIM_Document.xlsx')), wb = {};
  Object.keys(model.sheets).forEach((t) => model.sheets[t].filter((r) => r.values && 'entitytype' in r.values).forEach((r) => { wb[t] = wb[t] || { n: 0, bad: 0 }; wb[t].n++; if (r.values.entitytype !== 'A') wb[t].bad++; }));
  const wt = Object.keys(wb), wtot = wt.reduce((s, t) => s + wb[t].n, 0), wbad = wt.filter((t) => wb[t].bad);
  if (!wtot) inc('E2', 'workbook has no entitytype rows'); else ck('E2', 'workbook: ' + wtot + ' rows in ' + wt.length + ' sheets all A; not A: ' + (wbad.map((t) => t + ':' + wb[t].bad).join(',') || 'none'), wbad.length === 0, wb);
  // E3 legacy test instance: the rows the workbook names, read back
  const S = model.sheets, names = (t, k) => (S[t] || []).map((r) => r.values[k] || r.key).map((x) => "'" + String(x).replace(/'/g, "''") + "'").join(',');
  const q = {
    ad_element: ['columnname IN (' + names('ad_element', 'columnname') + ')'],
    ad_reference: ['name IN (' + names('ad_reference', 'name') + ')'],
    ad_process: ['value IN (' + names('ad_process', 'value') + ')'],
    ad_window: ['name IN (' + names('ad_window', 'name') + ')'],
    ad_menu: ['name IN (' + names('ad_menu', 'name') + ') AND action=\'W\''],
    ad_table: ['tablename IN (' + names('ad_table', 'tablename') + ')']
  };
  q.ad_ref_list = ['ad_reference_id IN (SELECT ad_reference_id FROM ad_reference WHERE ' + q.ad_reference[0] + ')'];
  q.ad_column = ['ad_table_id IN (SELECT ad_table_id FROM ad_table WHERE ' + q.ad_table[0] + ')'];
  q.ad_tab = ['ad_window_id IN (SELECT ad_window_id FROM ad_window WHERE ' + q.ad_window[0] + ')'];
  q.ad_field = ['ad_tab_id IN (SELECT ad_tab_id FROM ad_tab WHERE ' + q.ad_tab[0] + ')'];
  let judged = 0, notA = []; const probe = psql('idempiere_bimdoc', 'select 1');
  if (probe === null) inc('E3', 'legacy test instance DB idempiere_bimdoc unreachable');
  else { Object.keys(q).forEach((t) => { const r = psql('idempiere_bimdoc', "select count(*), count(*) filter (where entitytype<>'A') from " + t + ' where ' + q[t][0]); if (r === null) { notA.push(t + ':query-failed'); return; } const [n, b] = r.split('|').map(Number); judged += n; if (b) notA.push(t + ':' + b + '/' + n); });
    if (!judged) inc('E3', 'the instance holds none of the workbook rows (not installed)'); else ck('E3', 'legacy test instance: ' + judged + ' plugin rows read back; not A: ' + (notA.join(',') || 'none'), notA.length === 0); }
  // E4 CAPEX scripts
  const files = fs.readdirSync(MIG).filter((f) => /\.sql$/.test(f)).sort(), ent = files.filter((f) => /ENTITYTYPE-A/.test(f)), earlier = files.filter((f) => !/ENTITYTYPE-A/.test(f));
  const mcNames = [], csIds = []; earlier.forEach((f) => { const L = fs.readFileSync(path.join(MIG, f), 'utf8').split('\n');
    L.forEach((ln, i) => { const ins = /^INSERT INTO (PA_MeasureCalc|PA_ColorSchema)\b/i.exec(ln); if (!ins) return; const sel = (L[i + 1] || '') + (L[i + 2] || '').replace(/^\s+/, '');
      if (/^PA_MeasureCalc$/i.test(ins[1])) { const m = /^(?:SELECT|VALUES \()\s*\d+,\d+,\d+,'Y',TO_TIMESTAMP\('[^']*','[^']*'\),\d+,TO_TIMESTAMP\('[^']*','[^']*'\),\d+,'((?:[^']|'')*)'/i.exec(sel); mcNames.push(m ? m[1] : '?unparsed:' + f + ':' + (i + 1)); }
      else { const m = /^(?:SELECT|VALUES \()\s*(\d+),/i.exec(sel); csIds.push(m ? +m[1] : -1); } }); });
  const upd = ent.length ? fs.readFileSync(path.join(MIG, ent[0]), 'utf8') : '', src = await import(path.join(ROOT, 'capex/plugin/capex_2pack_source.mjs')), packed = Object.keys(src.PACKS).filter((v) => ent.length && src.PACKS[v].indexOf(ent[0]) >= 0);
  if (!mcNames.length) inc('E4', 'no PA_MeasureCalc insert parsed from the earlier scripts');
  else { ck('E4', 'a script named ENTITYTYPE-A exists', ent.length === 1, ent);
    ck('E4', 'every one of the ' + mcNames.length + ' inserted PA_MeasureCalc names starts CAPEX (the UPDATE\'s LIKE covers it)', mcNames.every((n) => /^CAPEX/.test(n)) && /UPDATE PA_MeasureCalc SET EntityType='A' WHERE Name LIKE 'CAPEX%'/.test(upd), mcNames.filter((n) => !/^CAPEX/.test(n)));
    const own = csIds.filter((i) => i >= 1000000); ck('E4', 'every own PA_ColorSchema id (' + own.join(',') + ') is re-labelled; stock ids 100/101 are not named', own.every((i) => new RegExp('PA_ColorSchema_ID=' + i + '\\b').test(upd)) && !/PA_ColorSchema_ID=10[01]\b/.test(upd), csIds);
    ck('E4', 'idempotent (AND EntityType=\'U\' on both UPDATEs)', upd.split('\n').filter((l) => /^UPDATE /i.test(l)).length === 2 && upd.split('\n').filter((l) => /^UPDATE /i.test(l) && /AND EntityType='U'/.test(l)).length === 2);
    ck('E4', 'carried by exactly one pack version: ' + packed.join(','), packed.length === 1, packed); }
  // E5 pilot
  if (psql('idempiere_pilot', 'select 1') === null) inc('E5', 'pilot DB idempiere_pilot unreachable');
  else { const mc = psql('idempiere_pilot', "select count(*), count(*) filter (where entitytype<>'A') from pa_measurecalc where name like 'CAPEX%'"), cs = psql('idempiere_pilot', "select count(*), count(*) filter (where entitytype<>'A') from pa_colorschema where pa_colorschema_id>=1000000"),
      stock = psql('idempiere_pilot', "select count(*), count(*) filter (where entitytype='D') from pa_colorschema where pa_colorschema_id in (100,101)"), [mn, mb] = (mc || '0|0').split('|').map(Number), [cn, cb] = (cs || '0|0').split('|').map(Number), [sn, sd] = (stock || '0|0').split('|').map(Number);
    if (!mn + !cn === 2) inc('E5', 'the pilot holds no CAPEX PA rows'); else { ck('E5', 'pilot CAPEX PA_MeasureCalc ' + mn + ' rows, not A: ' + mb, mb === 0); ck('E5', 'pilot own PA_ColorSchema ' + cn + ' rows, not A: ' + cb, cb === 0); ck('E5', 'stock colour schemas 100/101 still D (' + sd + '/' + sn + ')', sn === 2 && sd === 2); } }
  const judgedAll = Object.keys(arms).filter((a) => arms[a].j > 0), v = fails ? 'FAIL' : (judgedAll.length === 5 ? 'PASS' : 'INCONCLUSIVE');
  log('§ENTITYTYPE_VERDICT ' + v + ' arms_judged=' + judgedAll.join(',') + ' fail=' + fails + (BREAK ? ' (BREAK)' : '')); process.exit(v === 'PASS' ? 0 : 1);
})();
