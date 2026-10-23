#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SLAB-OUTLINE (rule D44, prompts/DXF2BIM_FOUNDATION_LANE.md §D44). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: every storey's slab was the rectangle inside the outermost walls, also on an L / notched plan (HHS 3 x 3,491 m2 against the model's 3,975 m2 of
 * floor slabs, no gap): 5D priced a floor that is not there. Now the rectangle is kept only when the walls draw it.
 *   S1 RECT KEPT   — a storey whose four envelope faces are each covered >= 0.9 by pieces on the face plane keeps its slab (Duplex: every storey has its slab).
 *   S2 LEFT OUT    — a storey with a face below 0.9 has NO slab element and ONE advisory GAP:slab_outline_not_rectangular naming the faces, their cover and the rectangle area.
 *   S3 FALSIFIER   — the first storey with its wall pieces and openings on the middle half of the minX face taken away (a notch): the rule refuses that storey.
 *   S4 ONLY SLABS  — with BASE=<an older checkout's modeller dir>: every non-slab element is identical (guid + vertices) to BASE's on the same set; S1 sets are byte-identical in full.
 * Since §D51 a storey with an undrawn rectangle gets a best-effort slab by default (W-SLAB-ESTIMATE); this witness proves D44's own rule with that default set to 'none'.
 * Usage: NODE_PATH=<dir with better-sqlite3> [BASE=<old modeller dir>] node modeller/tests/witness_dxf_slab_outline.js <Node model .db> [<more .db>]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js')), SH = require(D + 'dxf2shell.js');
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const BASE = process.env.BASE ? require(path.join(process.env.BASE, 'dxf2bim_import.js')) : null;
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const dbs = process.argv.slice(2); if (!dbs.length) { say('MISSING input: a Node model .db (e.g. /tmp/db2/HHSM2.db, scripts/extractIFC2DB.js)'); process.exit(2); }
dbs.forEach(db => {
  const name = path.basename(db, '.db'), con = new Database(db, { readonly: true }), q = s => con.prepare(s).all();
  const R = S.writeStdSet(q, 'X', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' });
  const files = Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] })), conv = Imp => Imp.convert(Imp.readSheets(files), { defaultsRef: { defaults: { 'slab.outline_when_not_rect': { value: 'none' } } } });   // §D51: D44's rule itself (the best-effort default off)
  const o = conv(I); if (!o.ST) { check('S0[' + name + ']', 'the marked set converts to a verdict', false, JSON.stringify(o.refused).slice(0, 200)); return; }
  const slabOf = st => o.els.filter(e => e.class === 'IfcSlab' && e.storey === st.name), adv = o.verdict.advisory.filter(a => a.code === 'GAP:slab_outline_not_rectangular');
  let kept = 0, out = 0; const bad = [];
  o.ST.forEach(st => { const g = (st.ring.gaps || []).filter(x => x.code === 'GAP:slab_outline_not_rectangular');
    if (st.ring.outline) { kept++; if (!slabOf(st).length && st.ring.outline && o.slabZ[st.name] && typeof o.slabZ[st.name].thickness === 'number') bad.push(st.name + ':rect_without_slab');
      if (st.ring.cover === undefined) { /* the rule ran and passed, or an earlier gap */ } }
    else if (g.length) { out++; if (slabOf(st).length) bad.push(st.name + ':slab_written'); if (!(g[0].faces.length && g[0].rect_m2 > 0 && g[0].cover)) bad.push(st.name + ':gap_without_numbers'); } });
  const covers = o.ST.map(st => st.name + ':' + (st.ring.cover ? Object.values(st.ring.cover).join('/') : st.ring.outline ? 'rect' : (st.ring.gaps || []).map(x => x.code).join('+'))).join(' ');
  check('S1/S2[' + name + ']', 'a drawn rectangle keeps its slab; an undrawn one has no slab and one advisory gap with its numbers', !bad.length && adv.length === out, `kept=${kept} left_out=${out} advisories=${adv.length} ${covers} ${bad.join(' ')}`);
  // S3: the falsifier on the first storey with a ring rectangle: a notch = every wall piece and opening on the middle half of the minX face taken away
  const st = o.ST.find(s => s.ring.outline), E = st && st.ring.envelope;
  if (!st) say('INCONCLUSIVE S3[' + name + '] | no storey of this set keeps a rectangle, so a notch cannot be cut into one');
  if (E) { const y0 = E[1] + (E[3] - E[1]) / 4, y1 = E[3] - (E[3] - E[1]) / 4, onFace = r => r && Math.abs(r[0] - E[0]) <= 0.001 && (r[1] + r[3]) / 2 > y0 && (r[1] + r[3]) / 2 < y1;
    const ob = b => !b || !b.along ? null : b.axis === 'x' ? [b.along[0], b.band[0], b.along[1], b.band[1]] : [b.band[0], b.along[0], b.band[1], b.along[1]];
    const walls = st.after.filter(x => x.op_type === 'DXF_WALL' && onFace(x.params.rect)), hs = walls.map(x => x.params.handle);   // their openings go with them (windows carry no opening box)
    const gone = walls.concat(st.after.filter(x => x.op_type === 'DXF_OPENING' && (onFace(ob(x.params.opening_box)) || hs.indexOf(x.params.host_handle) >= 0)));
    const cut = st.after.filter(x => gone.indexOf(x) < 0), br = SH.bridgeOpenings(cut, SHC.CFG, { level: st.level, hashHex }).infill, r = SH.innerRing(cut, SHC.CFG, { bridges: br });
    check('S3[' + name + ']', 'a notch (the middle half of the minX face taken away) makes the rule refuse that storey', gone.length > 0 && !r.outline && (r.gaps || []).some(x => /slab_/.test(x.code)), `storey=${st.name} removed=${gone.length} cover=${JSON.stringify(r.cover || null)} gaps=${JSON.stringify((r.gaps || []).map(x => x.code))}`); }
  if (BASE) { const b = conv(BASE), key = e => e.guid + '|' + JSON.stringify(e.vertices), A = new Set(o.els.filter(e => e.class !== 'IfcSlab').map(key)), Bs = new Set(b.els.filter(e => e.class !== 'IfcSlab').map(key));
    const diff = [...A].filter(k => !Bs.has(k)).length + [...Bs].filter(k => !A.has(k)).length, full = !out ? JSON.stringify(o.els.map(e => [e.guid, e.class, e.vertices])) === JSON.stringify(b.els.map(e => [e.guid, e.class, e.vertices])) : null;
    check('S4[' + name + ']', 'nothing but slabs changes against BASE (and a set with no slab left out is byte-identical)', diff === 0 && full !== false, `non_slab=${A.size} differ=${diff} slabs ${b.els.filter(e => e.class === 'IfcSlab').length}->${o.els.filter(e => e.class === 'IfcSlab').length} full_identical=${full}`); }
  else say('INFO S4[' + name + '] | no BASE given');
});
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
