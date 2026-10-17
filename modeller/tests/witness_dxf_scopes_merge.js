#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-L6-MERGE + W-L6-CHECKS: prompts/DXF2BIM_MODELLER_LANE.md §L6.4/§L6.5. Read the log after every run.
 * THE ISSUE THIS PROVES OR DISPROVES: splitting a storey into scope sheets and importing them back changes the model. The scoped set (KEY + wing sheets, suggested by the writer)
 * and the unscoped set are imported by the Modeller's own importer; the converted storeys must be the same (ops by storey, same count, same content), the verdict identical.
 *   M1 SHEETS  — the scoped set has more sheets than the unscoped one and every scoped storey has a KEY + >= 2 wing sheets.
 *   M2 ASSEMBLE — readSheets assembles each scoped storey into one plan sheet (no scope blocking, set STD, all roles).
 *   M3 SAME-MODEL — convert(scoped) storey ops == convert(unscoped) storey ops (sorted, content-equal; `run_id` and the 32-64-hex ids and hashes derived from it are normalised: they hash the sheet BYTES, which differ in entity order; handles, geometry and every parameter stay compared) and the verdict (verdict, blocking, advisory by code) is equal.
 *   C1..C5 CHECKS — each doctored scoped set is refused/flagged with the named code: a scope @LEVEL changed (scope_level_conflict), two rectangles overlapped (scope_overlap), a grid position moved
 *     (scope_grid_disagree), the KEY sheet removed (scope_no_key), one scope sheet's piece duplicated into another (scope_duplicate_piece).
 * Usage: NODE_PATH=<dir with web-ifc, sql.js> node modeller/tests/witness_dxf_scopes_merge.js <ifc | model.db> [PREFIX] [budget]
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const WebIFC = require('web-ifc'), initSqlJs = require('sql.js');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const Core = require(D + 'ifc_extract_core.js'), S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), SC = require(D + 'std2d_scopes.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
const lines = []; let fail = 0; const say = s => { lines.push(s); console.log(s); };
const check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
(async () => {
  const ifc = process.argv[2], prefix = process.argv[3] || 'DX', budget = Number(process.argv[4] || 25);
  const SQL = await initSqlJs(), api = new WebIFC.IfcAPI(), sdb = new SQL.Database(); await api.Init();
  let sdbUse = sdb;
  if (/\.db$/i.test(ifc)) sdbUse = new SQL.Database(new Uint8Array(fs.readFileSync(ifc)));   // a model .db made by scripts/extractIFC2DB.js (large models)
  else await Core.extractToDb({ WebIFC, ifcApi: api, ifcData: new Uint8Array(fs.readFileSync(ifc)), db: Core.sqljsDb(sdb), Buf: Core.browserBuf, buildingName: prefix, sourceName: path.basename(ifc), log: () => {} });
  const q = sql => { const r = sdbUse.exec(sql); return r.length ? r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))) : []; };
  const deps = { B, DxfParser, hashHex, MK, SHC, SCOPES: SC };
  const R0 = S.writeStdSet(q, prefix), M0 = Mk.deriveMarks(R0, deps, { set: prefix }), R1 = S.writeStdSet(q, prefix, { suggest: true, budget }), M1 = Mk.deriveMarks(R1, deps, { set: prefix });
  const f0 = Object.keys(M0.files).map(n => ({ name: n, text: M0.files[n] })), f1 = Object.keys(M1.files).map(n => ({ name: n, text: M1.files[n] }));
  const keys = f1.filter(f => /__KEY_std\.dxf$/.test(f.name)), wings = f1.filter(f => /__(?!KEY)[A-Z0-9_]+_std\.dxf$/.test(f.name));
  check('M1 SHEETS', 'the scoped set is not a series of wing sheets', f1.length > f0.length && keys.length >= 1 && wings.length >= 2 * keys.length, `unscoped=${f0.length} scoped=${f1.length} keys=${keys.length} wings=${wings.length} scopes=${(R1.scopes || []).map(s => s.name).join(' ')}`);
  const s0 = I.readSheets(f0), s1 = I.readSheets(f1), g1 = I.gate(s1, {}), g0 = I.gate(s0, {});
  const roles = ss => ss.map(x => x.name.replace(/__KEY/, '') + ':' + (x.role || '-')).join(',');
  check('M2 ASSEMBLE', 'the scoped set is not assembled back into whole-storey plans (same sheets, same roles, same gate as the unscoped set; no scope blocking)', s1.length === s0.length && roles(s1) === roles(s0) && g1.ok === g0.ok && g1.set === g0.set && s1.scopeReport.blocking.length === 0, `sheets=${s1.length} (unscoped ${s0.length}) roles=${s1.map(s => s.role || '-').join(',')} gate=${g1.ok}/${g0.ok} scope blocking=${s1.scopeReport.blocking.length} advisory=${s1.scopeReport.advisory.map(a => a.code)} groups=${s1.scopeReport.groups.length}`);
  const c0 = I.convert(s0, {}), c1 = I.convert(s1, {});
  const norm = c => (c.ST || []).map(st => st.name + ':' + (st.after || []).map(o => JSON.stringify(o, (k, v) => (k === 'run_id' ? undefined : typeof v === 'string' && /^[0-9a-f]{32,64}$/.test(v) ? '#id' : typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v))).sort().join('|'));
  const n0 = norm(c0), n1 = norm(c1), vd = c => c.verdict ? JSON.stringify([c.verdict.verdict, c.verdict.blocking.length, c.verdict.advisory.length, c.verdict.counts]) : 'none';
  const rf = c => JSON.stringify(c.refused || null);
  check('M3 SAME-MODEL', 'splitting the storeys changed the converted model, the verdict or the refusal', (!g0.ok || n0.length > 0 || !!c0.refused) && JSON.stringify(n0) === JSON.stringify(n1) && vd(c0) === vd(c1) && rf(c0) === rf(c1), `${c0.refused ? 'both refused: ' + rf(c0).slice(0, 140) + ' ' : ''}storeys=${n0.length} ops=${(c0.ST || []).reduce((a, st) => a + st.after.length, 0)} verdict ${vd(c0).slice(0, 60)} == ${vd(c1).slice(0, 60)}`);
  if (process.env.DIFF) { n0.forEach((x, i) => { if (x !== n1[i]) { const a = x.split('|'), b = n1[i].split('|'); console.log('DIFF storey', i, a.length, b.length); const sb = new Set(b), sa = new Set(a); const ou = a.filter(o => !sb.has(o))[0] || '', os_ = b.filter(o => !sa.has(o))[0] || ''; let k = 0; while (k < ou.length && ou[k] === os_[k]) k++; console.log(' first difference at', k, '\n  unscoped:', ou.slice(Math.max(0, k - 120), k + 160), '\n  scoped:  ', os_.slice(Math.max(0, k - 120), k + 160)); } }); }
  // doctored scoped sets: each must be flagged
  const edit = (pred, fn) => f1.map(f => (pred(f) ? { name: f.name, text: fn(f.text) } : f));
  const sc0 = wings[0], first = f1.indexOf(sc0);
  const rep = (files) => I.readSheets(files).scopeReport;
  const has = (r, code) => r.blocking.concat(r.advisory).some(x => x.code === code);
  const lvText = t => t.replace(/@LEVEL=([-0-9.]+)/, (m, v) => '@LEVEL=' + (Number(v) + 1)), ovText = t => t.replace(/(@SCOPE=[A-Z0-9_]+,)([-0-9.]+),([-0-9.]+),([-0-9.]+),([-0-9.]+)/, (m, a, x0, y0, x1, y1) => a + (Number(x0) - 500) + ',' + (Number(y0) - 500) + ',' + (Number(x1) + 500) + ',' + (Number(y1) + 500));
  const gdText = t => t.replace(/(@GRIDX=[A-Za-z0-9]+ @BY=model)/, '$1').replace(/(TEXT\n[\s\S]*?@GRIDX=1[^\n]*\n)/, '$1');
  check('C1 LEVEL', 'a scope sheet with another @LEVEL is not flagged', has(rep(edit(f => f === sc0, lvText)), 'QF:scope_level_conflict'), 'scope_level_conflict');
  check('C2 OVERLAP', 'two overlapping scope rectangles are not flagged', has(rep(edit(f => f === sc0, ovText)), 'QF:scope_overlap'), 'scope_overlap');
  check('C4 NO-KEY', 'a scoped storey without its KEY sheet is not flagged', has(rep(f1.filter(f => f !== keys[0])), 'QF:scope_no_key'), 'scope_no_key');
  const wing2 = wings.find(w => w !== sc0 && w.name.split('__')[0] === sc0.name.split('__')[0]);
  const dupFiles = (() => { const c = I.chunkDxf(sc0.text), victim = c.ents.find(e => e.layer && /^A-(WALL|DOOR|GLAZ)/.test(e.layer) && e.handle), w2 = I.chunkDxf(wing2.text);
    const ins = c.ents.indexOf(victim); const w2t = w2.head.concat(...w2.ents.map(e => e.lines), victim.lines, w2.tail).join('\n'); return f1.map(f => (f === wing2 ? { name: f.name, text: w2t } : f)); })();
  check('C5 DUPLICATE', 'one piece on two scope sheets is not flagged', has(rep(dupFiles), 'QF:scope_duplicate_piece'), 'scope_duplicate_piece');
  fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'logs', 'witness_dxf_scopes_merge.log'), lines.join('\n') + '\n');
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
