#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-QUALITY (rules D25-D29, prompts/DXF2BIM_FOUNDATION_LANE.md). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: "perfect the intrinsics: drawing standards conforming and quality from the round trip" (owner 2026-10-22): the reader's
 * drawing-QUALITY findings (`QF:` codes, dxf2qualify.js) on the standard set OUR writer draws (std2d.js + std2d_marks.js), read back through the importer.
 * Before D25-D29: Clinic 15 QF (grid_off_axis 3, elev_level_mismatch 4, elev_height_dim_missing 8), LTU 25 (grid_off_axis 24, grid_missing 1), Hospital wings
 * 46 / 37 / 17, HHS 1.
 *   Q1 GRID    — no QF:grid_* row: every grid line stands on a wall / column / curtain band some plan draws (D25), every exterior wall axis drawn has its line (D25, D29),
 *                no bubble sits on another line (D28).
 *   Q2 LEVELS  — no QF:elev_level_mismatch / QF:elev_height_dim_missing: every level the set states (plan @LEVEL, roof @LEVEL, @ROOF) is a level line with its
 *                height dimensions on every elevation (D26), and the writer log draws exactly those levels (§LEVEL_DRAWN == stated, per elevation).
 *   Q3 DIMS    — no QF:dim_missing / QF:dim_point_missing: the wall-run points come from the pieces the reader reads (D27).
 *   Q4 ALL     — no QF row of any code remains on this set (FAILS while one remains; each one listed).
 * Usage: NODE_PATH=<dir with sql.js> node modeller/tests/witness_dxf_quality.js <Node model .db> [FI]
 *   FI omitted / 'none' = the whole-building set; FI=0,1,2.. = the wing set of the FI-th angle family (S.wingAngles), as the Viewer's wing export.
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const dbPath = process.argv[2], fiArg = process.argv[3] === undefined ? 'none' : process.argv[3];
if (!dbPath || !fs.existsSync(dbPath)) { console.log('MISSING input: a Node model .db (usage: witness_dxf_quality.js <db> [FI])'); process.exit(2); }
(async () => {
  const SQL = await require('sql.js')();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath))), q = sql => { const r = db.exec(sql); if (!r.length) return []; return r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))); };
  const fam = S.wingAngles(S.loadModel(q, { add() {}, gap() {} }));
  if (fiArg !== 'none' && !fam[Number(fiArg)]) { console.log('MISSING input: wing family ' + fiArg + ' (the model has ' + fam.length + ')'); process.exit(2); }
  const opts = fiArg === 'none' ? undefined : { wing: { angle: fam[Number(fiArg)].deg, name: 'W' } }, tagd = path.basename(dbPath) + ' FI=' + fiArg + (opts ? ' (' + opts.wing.angle + ' deg)' : '');
  const R = S.writeStdSet(q, 'X', opts), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' });
  const out = I.convert(I.readSheets(Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }))), {}), v = out.verdict;
  if (!v) { check('Q0', `[${tagd}] the reader reads the set (no refusal)`, false, JSON.stringify(out.refused || out).slice(0, 300)); say('SUMMARY fail=' + fail); process.exit(1); }
  const qf = v.blocking.filter(b => /^QF:/.test(b.code)), cnt = {}; qf.forEach(b => { cnt[b.code] = (cnt[b.code] || 0) + 1; });
  const rows = re => qf.filter(b => re.test(b.code)), show = rs => rs.slice(0, 4).map(b => b.message).join(' ;; ');
  say(`INFO [${tagd}] blocking=${v.blocking.length} QF=${qf.length} ${JSON.stringify(cnt)}`);
  const g = rows(/^QF:grid_/); check('Q1', `[${tagd}] no QF:grid_* row (grid on drawn elements D25, outline axis D29, bubbles beyond every line D28)`, g.length === 0, `rows=${g.length} ${show(g)}`);
  // Q2: the reader rows + the writer's drawn levels == the levels the set states
  const stated = new Set(); let roofTop = null;
  Object.keys(Dm.files).forEach(n => { const t = Dm.files[n], view = /@VIEW=([A-Z]+)/.exec(t); if (!view) return; if (view[1] === 'PLAN' || view[1] === 'ROOF') { const m = /@LEVEL=(-?[0-9.]+)/.exec(t); if (m) stated.add(Number(m[1]).toFixed(3)); } const r = /@ROOF=(-?[0-9.]+)/.exec(t); if (r) roofTop = Number(r[1]).toFixed(3); });
  if (roofTop !== null) stated.add(roofTop);
  const want = Array.from(stated).sort().join(','), drawn = {};
  R.log.filter(l => /^§LEVEL_DRAWN (FRONT|REAR|LEFT|RIGHT) /.test(l)).forEach(l => { const m = /^§LEVEL_DRAWN (\S+) .* z=(-?[0-9.]+)$/.exec(l); (drawn[m[1]] = drawn[m[1]] || new Set()).add(Number(m[2]).toFixed(3)); });
  const bad = Object.keys(drawn).filter(f => Array.from(drawn[f]).sort().join(',') !== want);
  const lv = rows(/^QF:elev_(level_mismatch|height_dim_missing)$/);
  check('Q2', `[${tagd}] every stated level (plan / roof @LEVEL, @ROOF) is drawn with its height dimensions on every elevation, and only those (D26)`, lv.length === 0 && bad.length === 0 && Object.keys(drawn).length === 4,
    `rows=${lv.length} stated=${want} elevations=${Object.keys(drawn).length} differing=${bad.map(f => f + ':' + Array.from(drawn[f]).sort().join(',')).join(' ') || 0} unstated_skipped=${R.log.filter(l => /^§LEVEL_UNSTATED (FRONT) /.test(l)).length} ${show(lv)}`);
  const dm = rows(/^QF:dim_(missing|point_missing)$/), drop = R.log.filter(l => /^§FACE_RUN_DROP /.test(l));
  check('Q3', `[${tagd}] every wall-run dimension point the reader needs is drawn (D27: runs from the pieces the reader reads)`, dm.length === 0, `rows=${dm.length} plans_with_dropped_pieces=${drop.length} ${show(dm)}`);
  check('Q4', `[${tagd}] no QF row of any code remains on the set`, qf.length === 0, `QF=${qf.length} ${JSON.stringify(cnt)} ${show(qf)}`);
  say('SUMMARY fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL ' + e.stack); process.exit(1); });
