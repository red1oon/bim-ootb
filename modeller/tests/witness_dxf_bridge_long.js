#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-BRIDGE-LONG (rule D52, prompts/DXF2BIM_FOUNDATION_LANE.md §D52). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: bridgeOpenings bridged the whole distance between the two nearest wall pieces of an opening's strip, so a wall missing next to a door became a lintel the length
 * of the missing wall (Clinic: 6 bridges of 7.1 to 31.5 m over 1-2 openings; the Duplex control with a wall piece removed: 11.6 m).
 *   B1 LIMIT    — no bridge is longer than opening.gap_max; the openings of a longer gap are GAP:opening_gap_unbounded with the gap length.
 *   B2 SAME     — a set with no gap over the limit converts byte-identical to BASE (guid, class, vertices) for every element but the slabs (those are §D51's, W-SLAB-ESTIMATE).
 *   B3 FALSIFIER — the Duplex Level 1 with wall piece FB (and its window) removed: no bridge longer than the limit, the door beside it listed.
 * Usage: NODE_PATH=<dir with better-sqlite3> BASE=<old modeller dir> node modeller/tests/witness_dxf_bridge_long.js <Node model .db> [<more .db>]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js'), SH = require(D + 'dxf2shell.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const BASE = process.env.BASE ? require(path.join(process.env.BASE, 'dxf2bim_import.js')) : null, GMAX = SHC.CFG.opening.gap_max;
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const dbs = process.argv.slice(2); if (!dbs.length) { say('MISSING input: a Node model .db (e.g. /tmp/db2/CLINIC2.db)'); process.exit(2); }
dbs.forEach(db => {
  const name = path.basename(db, '.db'), con = new Database(db, { readonly: true }), q = s => con.prepare(s).all();
  const R = S.writeStdSet(q, 'X', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' }), files = Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }));
  const o = I.convert(I.readSheets(files), {}); if (!o.ST) { check('B0[' + name + ']', 'converts', false, JSON.stringify(o.refused).slice(0, 200)); return; }
  const long = [], listed = o.verdict.blocking.filter(b => b.code === 'GAP:opening_gap_unbounded' && b.detail && b.detail.gap > GMAX);
  o.ST.forEach(st => (st.bridge.infill || []).forEach(b => { if (b.params.length > GMAX + 1e-6) long.push(st.name + ':' + b.params.length); }));
  let b0 = null; if (BASE) { const ob = BASE.convert(BASE.readSheets(files), {}); b0 = []; ob.ST.forEach(st => (st.bridge.infill || []).forEach(b => { if (b.params.length > GMAX + 1e-6) b0.push(b.params.length); })); }
  check('B1[' + name + ']', 'no bridge longer than gap_max; a longer gap\'s openings are listed with its length', !long.length && (b0 === null || listed.length >= b0.length), `long=${long.length} listed=${listed.length} base_long=${b0 === null ? '-' : b0.length + ' ' + JSON.stringify(b0.map(v => +v.toFixed(2)))}`);
  if (BASE && b0 && !b0.length) { const ob = BASE.convert(BASE.readSheets(files), {}); const k = e => [e.guid, e.class, e.vertices], nb = a => JSON.stringify(a.filter(e => e.class !== 'IfcSlab').map(k));   // slabs: §D51's own business (W-SLAB-ESTIMATE)
    check('B2[' + name + ']', 'no gap over the limit: every non-slab element byte-identical to BASE', nb(o.els) === nb(ob.els), `els=${o.els.length} base=${ob.els.length}`); }
  if (name === 'DXARC') { const st = o.ST[0], cut = st.after.filter(x => !(x.op_type === 'DXF_WALL' && x.params.handle === 'FB') && !(x.op_type === 'DXF_OPENING' && x.params.host_handle === 'FB'));
    const br = SH.bridgeOpenings(cut, SHC.CFG, { level: st.level, hashHex }), lg = br.infill.filter(b => b.params.length > GMAX + 1e-6), un = br.gaps.filter(g => g.code === 'GAP:opening_gap_unbounded' && g.gap > GMAX);
    check('B3[DXARC]', 'the Level 1 wall piece FB removed: no bridge over the limit, the door beside it listed', lg.length === 0 && un.length >= 1, `long=${lg.length} listed=${un.map(g => g.handle + ':' + g.gap).join(',')}`); }
});
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
