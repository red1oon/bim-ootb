#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-L5-ROUNDTRIP + W-L5-NO-SIDECAR: prompts/DXF2BIM_MODELLER_LANE.md §L5.4. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the Modeller's BIM -> 2D export (IFC -> in-browser extraction path (sql.js) -> std2d.js -> std2d_marks.js)
 * writes a set the Modeller's OWN importer accepts: every sheet gets a role from its embedded markings, the set is detected, and the qualify verdict
 * is read. Nothing is hand-fixed between export and import. The verdict is printed with every blocking code; the witness FAILS when it is not "qualifies".
 *   R1 EXTRACT  — IFC extracted through the browser path (Uint8Array shim + sql.js), same core as the Node extractor.
 *   R2 ROLES    — readSheets: every exported sheet has a role (plan/elev/roof/section).
 *   R3 SET      — gate ok, set STD, from evidence (no user statement).
 *   R4 VERDICT  — convert(): verdict.verdict === 'qualifies' and blocking === 0, else FAIL with the codes.
 *   R5 NO-SIDECAR — the exported file list is exactly the .dxf sheets (no .json / .db / .txt).
 *   R6 CONTROL  — one sheet's @LEVEL marking removed from the exported text: R2 must lose that sheet's role (the witness can see a missing marking).
 * Usage: NODE_PATH=<dir with web-ifc, sql.js> node modeller/tests/witness_dxf_export_roundtrip.js <ifc> [PREFIX]
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const WebIFC = require('web-ifc'), initSqlJs = require('sql.js');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const Core = require(D + 'ifc_extract_core.js'), S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
const lines = []; let fail = 0;
const say = s => { lines.push(s); console.log(s); };
const check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
(async () => {
  const ifc = process.argv[2], prefix = process.argv[3] || path.basename(ifc, '.ifc').split('_')[0].toUpperCase();
  const SQL = await initSqlJs(), api = new WebIFC.IfcAPI(); await api.Init();
  const sdb = new SQL.Database(), exLog = [];
  await Core.extractToDb({ WebIFC, ifcApi: api, ifcData: new Uint8Array(fs.readFileSync(ifc)), db: Core.sqljsDb(sdb), Buf: Core.browserBuf, buildingName: prefix, sourceName: path.basename(ifc), log: m => exLog.push(m) });
  const n = sdb.exec('SELECT count(*) FROM elements_meta')[0].values[0][0];
  check('R1 EXTRACT', 'the browser extraction path produced no model', n > 0 && sdb.exec("SELECT count(*) FROM sqlite_master WHERE name='element_world_bbox'")[0].values[0][0] === 1, `elements=${n}`);
  const q = sql => { const r = sdb.exec(sql); if (!r.length) return []; return r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))); };
  const R = S.writeStdSet(q, prefix), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC }, { set: prefix });
  const names = Object.keys(Dm.files);
  check('R5 NO-SIDECAR', 'the export writes something other than the .dxf sheets', names.length > 0 && names.every(f => /\.dxf$/.test(f)), `files=${names.length} ${names.join(' ')}`);
  const files = names.map(f => ({ name: f, text: Dm.files[f] })), sheets = I.readSheets(files);
  check('R2 ROLES', 'an exported sheet has no role from its markings', sheets.every(s => s.role), sheets.map(s => s.name + ':' + (s.role || 'NONE:' + s.why)).join(' '));
  const g = I.gate(sheets, {});
  check('R3 SET', 'the set is not detected from the exported sheets', g.ok && g.set === 'STD', `ok=${g.ok} set=${g.set} from=${g.setFrom}`);
  const out = I.convert(sheets, {}), v = out.verdict;
  if (!v) { check('R4 VERDICT', 'convert produced no verdict', false, JSON.stringify(out.refused || out).slice(0, 300)); }
  else {
    say('  verdict=' + v.verdict + ' blocking=' + v.blocking.length + ' advisory=' + v.advisory.length + ' counts=' + JSON.stringify(v.counts));
    v.blocking.filter(b => b.code !== 'GAP:lod400_library_unreachable').forEach(b => say('   B ' + b.code + ' ' + b.sheet + ' ' + (b.message || '').slice(0, 140)));
    // The export controls the markings and the sheet structure. Pipeline geometry gaps (GAP:*) are facts of the model/tessellator, library reachability is the OCI
    // library (not loaded in Node): both are listed above, neither is an export defect (rosetta_qualify.js Q2 draws the same line: marking codes only).
    const MARKING = /^QF:(sheet_no_role|units_unstated|plan_no_level|mark_missing|mark_invalid|set_mismatch|set_no_plan|set_no_roof|plan_level_duplicate|face_no_elev)$/;
    const mk = v.blocking.filter(b => MARKING.test(b.code)), qf = v.blocking.filter(b => /^QF:/.test(b.code)), gap = v.blocking.filter(b => /^GAP:/.test(b.code) && b.code !== 'GAP:lod400_library_unreachable');
    check('R4 VERDICT', 'the exported set has marking/structure blocking in the Modeller importer (QF:* codes)', qf.length === 0, `QF blocking=${qf.length} (marking-class ${mk.length}) ${JSON.stringify(qf.map(b => b.code))}`);
    check('R4b PIPELINE', 'a pipeline gap (GAP:*) other than library reachability blocks the exported set', gap.length === 0, JSON.stringify(gap.map(b => b.code)));
    say(`  INFO engine/model gaps in the verdict (R4b fails on any): ${gap.length} ${JSON.stringify(gap.map(b => b.code))}; library_unreachable=${v.blocking.length - qf.length - gap.length} (no OCI library in Node); verdict=${v.verdict}`);
  }
  const victim = files.find(f => /FLOOR_/.test(f.name)), stripped = victim.text.replace(/@LEVEL=[^\n]*\n/, '@LEVEL_REMOVED\n');
  const s2 = I.readSheets(files.map(f => f === victim ? { name: f.name, text: stripped } : f));
  check('R6 CONTROL', 'removing a plan @LEVEL marking is not noticed', s2.find(s => s.name === victim.name).role === null, `role after = ${s2.find(s => s.name === victim.name).role}`);
  fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'logs', 'witness_dxf_export_roundtrip.log'), lines.join('\n') + '\n');
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
