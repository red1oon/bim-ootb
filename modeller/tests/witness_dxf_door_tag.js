#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DOOR-TAG (rule D15, prompts/DXF2BIM_FOUNDATION_LANE.md). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: a door tag (@TAG=door) that is moved onto a drawn swing box must land on a box of ITS OWN door. Found on the Clinic: a 0865 x 1500 door with no
 * swing of its own had its tag moved to the neighbouring 0915 x 2134 door's box: two texts at one point, the reader refused the whole set (MARK:conflict). On the Hospital the same rule
 * stacked two same-label tags on one box 16 times (silent: same text). Boxes here are read back by the IMPORTER's reader from the marked plan, not taken from the tag placement code.
 *   T1 NO CONFLICT — no sheet is refused for two texts at one @TAG point.
 *   T2 OWN BOX     — a tag that lies in a drawn swing box lies in one that touches (1 mm) at least as many doors of that type as tags stand on it (tags in no box: FINDING count).
 *   T3 READ        — the reader takes the whole set (no refusal).
 * Usage: NODE_PATH=<dir with sql.js> node modeller/tests/witness_dxf_door_tag.js <Node model .db>
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), initSqlJs = require('sql.js');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
(async () => {
  const SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(process.argv[2])));
  const q = sql => { const r = db.exec(sql); if (!r.length) return []; return r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))); };
  const R = S.writeStdSet(q, 'W', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'W' });
  const sheets = I.readSheets(Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }))), conflicts = [];
  sheets.forEach(sh => (sh.errors || []).forEach(e => { if (/has two texts/.test(e.message || '') && /@TAG/.test(e.message || '')) conflicts.push(sh.name + ': ' + e.message); }));
  check('T1', 'no sheet is refused for two texts at one @TAG point', conflicts.length === 0, conflicts.length ? conflicts.slice(0, 2).join(' || ') : 'conflicts=0');
  const P = new DxfParser(); let tags = 0, nobox = 0, bad = [];
  R.views.plan.forEach(({ view, storey }) => {
    const name = Object.keys(Dm.files).find(n => n.endsWith('_' + view + '_std.dxf')); if (!name) return;
    const txt = Dm.files[name], ops = B.run(txt, SHC.STD.MAP_PLAN, SHC.CFG, { DxfParser, hashHex, library: [] }).ops.filter(o => o.op_type === 'DXF_OPENING' && o.params.kind === 'door' && o.params.hinge);
    const boxes = ops.map(o => { const p = o.params, H = p.hinge, pts = [H].concat([p.swing_start_deg, p.swing_end_deg].map(a => [H[0] + p.width * Math.cos(a * Math.PI / 180), H[1] + p.width * Math.sin(a * Math.PI / 180)])); const xs = pts.map(v => v[0] * 1000), ys = pts.map(v => v[1] * 1000); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; });
    const marks = MK.readMarks(P.parseSync(txt).entities).filter(m => /^@TAG=door,/.test(m.raw || '')), at = {};
    marks.forEach(m => { const k = m.x + ',' + m.y + '|' + m.raw; (at[k] = at[k] || []).push(m); });
    const doors = R.model.els.filter(e => e.cls === 'IfcDoor' && e.storey === storey.name);
    Object.keys(at).forEach(k => { const m = at[k][0], n = at[k].length, label = m.raw.replace(/^@TAG=door,/, '').replace(/ @BY.*$/, '').replace(/ \[.*\]$/, ''); tags += n;
      const box = boxes.find(b => m.x >= b.x0 && m.x <= b.x1 && m.y >= b.y0 && m.y <= b.y1);
      if (!box) { nobox += n; return; }   // the reader drew no swing here (e.g. a door in a non-orthogonal or curtain wall): the tag stays at the door's own centre; a FINDING count, not this issue
      const own = doors.filter(e => e.etype === label && box.x0 <= e.x1 * 1000 + 1 && box.x1 >= e.x0 * 1000 - 1 && box.y0 <= e.y1 * 1000 + 1 && box.y1 >= e.y0 * 1000 - 1).length;
      if (own < n) bad.push(view + ' ' + label + ' at ' + m.x + ',' + m.y + ': ' + n + ' tag(s), ' + own + ' door(s) of that type touch the box'); });
  });
  if (nobox) say('FINDING no-swing | ' + nobox + ' of ' + tags + ' door tags stand in no drawn swing box (the reader drew no swing there): they stay at the door centre');
  check('T2', 'a door tag that stands in a drawn swing box stands in a box that touches as many doors of its type as tags stand there (no tag on another door\'s box)', tags - nobox > 0 && bad.length === 0, `tags=${tags} in_box=${tags - nobox} bad=${bad.length} ${bad.slice(0, 3).join(' || ')}`);
  const out = I.convert(sheets, {});
  check('T3', 'the reader takes the whole set', !out.refused && !!out.verdict, 'blocking=' + (out.verdict ? out.verdict.blocking.length : '-') + ' refused=' + JSON.stringify(out.refused || null).slice(0, 160));
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
