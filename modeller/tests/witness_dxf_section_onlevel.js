#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SECTION-ONLEVEL (rule D33, prompts/DXF2BIM_FOUNDATION_LANE.md §F8). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the reader took a section slab only when its TOP sat at the level; HHS places its storeys at the slab UNDERSIDE, so its section (crossing all
 * 3 storeys' slabs after D30) gave no slab at all (`section_no_slab` 3, `slab_no_underside` 2).
 *   O1 ON LEVEL — every level with no slab topped there, but with drawn slabs whose bottom is at the level, takes that slab from the section: bottom = the level, top = the drawn top.
 *   O2 TOP WINS — a level with a slab topped at it never takes an on-level slab (Duplex: every section slab is topped at its level).
 *   O3 HEIGHTS  — no wall or opening of the read model changes base / height / sill against the same set read with on-level slabs ignored (test hook: the sheets' S-SLAB rectangles
 *                 whose bottom sits at a level are dropped from the section).
 * Usage: NODE_PATH=<dir with better-sqlite3> node modeller/tests/witness_dxf_section_onlevel.js <Node model .db>
 */
'use strict';
const path = require('path'), crypto = require('crypto'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js')), P = new DxfParser();
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const con = new Database(process.argv[2], { readonly: true }), q = s => con.prepare(s).all();
const R = S.writeStdSet(q, 'X', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC }, { set: 'X' }), sec = Object.keys(Dm.files).find(n => /_SECTION_std\.dxf$/.test(n));
const levels = R.views.plan.map(v => Number(v.storey.elev.toFixed(3))), slabs = sec ? P.parseSync(Dm.files[sec]).entities.filter(e => e.layer === 'S-SLAB').map(e => { const ys = e.vertices.map(v => v.y / 1000); return { b: Math.min(...ys), t: Math.max(...ys) }; }) : [];
const read = files => { const o = I.convert(I.readSheets(Object.keys(files).map(n => ({ name: n, text: files[n] }))), {}); const m = {}; (o.ST || []).forEach(st => (st.after || []).forEach(x => { if (x.op_type !== 'DXF_WALL' && x.op_type !== 'DXF_OPENING') return; const p = x.params; m[st.sheet + '|' + p.handle + '|' + (p.part || '') + '|' + x.op_type] = [p.base, p.height, p.sill].join(','); })); return { o, m }; };
const A = read(Dm.files), sz = A.o.slabZ || {}, sx = (A.o.section && A.o.section.slabs) || {};
const near = (a, b) => Math.abs(a - b) <= 0.0011;
let want = 0, got = 0, bad = [];
levels.forEach(L => { const topAt = slabs.some(s => near(s.t, L)), onAt = slabs.filter(s => near(s.b, L)); const e = sx[String(L)] || Object.values(sx).find(v => near(v.level, L));
  if (!topAt && onAt.length) { want++; if (e && e.on_level && near(e.bottom, L) && onAt.some(s => near(s.t, e.top))) got++; else bad.push(L); }
  if (topAt && e && e.on_level) bad.push(L + ':on_level_despite_top'); });
check('O1', 'a level with no slab topped there takes the slab sitting on it from the section (bottom = level, top = drawn top)', got === want && !bad.some(x => typeof x === 'number'), `levels=${levels.join(',')} on_level_expected=${want} read=${got} bad=${bad.join(' ')}`);
check('O2', 'a slab topped at its level always wins (no on-level slab where one is topped)', !bad.some(x => /despite/.test(String(x))), `section slabs: ${Object.values(sx).map(v => v.level + (v.on_level ? '(on)' : '')).join(',') || 'none'}`);
const ctl = {}; Object.keys(Dm.files).forEach(n => { ctl[n] = Dm.files[n]; });
if (sec && want) {   // the control drops the on-level slab rectangles from the section text
  const ents = P.parseSync(Dm.files[sec]).entities.filter(e => e.layer === 'S-SLAB' && levels.some(L => near(Math.min(...e.vertices.map(v => v.y / 1000)), L) && !slabs.some(s => near(s.t, L)))).map(e => e.handle);
  let t = Dm.files[sec]; ents.forEach(h => { t = t.replace(new RegExp('0\\nLWPOLYLINE\\n5\\n' + h + '\\n[\\s\\S]*?(?=\\n0\\n)'), ''); }); ctl[sec] = t;
  const Bm = read(ctl).m, ks = new Set([...Object.keys(A.m), ...Object.keys(Bm)]), diff = [...ks].filter(k => A.m[k] !== Bm[k]);
  check('O3', 'no wall or opening changes base / height / sill against the same set with the on-level slabs dropped', diff.length === 0, `ops=${ks.size} changed=${diff.length} dropped_rects=${ents.length} ${diff.slice(0, 2).join(' | ')}`);
} else say('INFO O3 | no on-level slab in this set');
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
