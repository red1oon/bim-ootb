#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-CURTAIN (rule D45, prompts/DXF2BIM_FOUNDATION_LANE.md §D45). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the curtain-wall band of the standard plan (A-WALL-CURT) came back as solid IfcWall (HHS 68 pieces, 721.2 m3, more than all real walls), so the bill
 * priced glass as masonry and the Viewer's cost / 4D sequence, which key on ifc_class, saw walls.
 *   C1 CLASS     — every converted element on the set's curtain layer is IfcCurtainWall; no element on another layer changes class (class per guid against BASE when given).
 *   C2 BILL      — Dxf2Bill prices an IfcCurtainWall body per m2 of face at the pack's IfcCurtainWall rate (cidb2024_my), with no thickness factor.
 *   C3 NO CURTAIN — a set with no curtain layer: every element's class equals BASE's (Duplex).
 *   C4 FALSIFIER — the same set with STD.CURTAIN emptied: C1 fails (the band is IfcWall again), so the witness can see the rule missing.
 * Usage: NODE_PATH=<dir with better-sqlite3> [BASE=<old modeller dir>] node modeller/tests/witness_dxf_curtain.js <Node model .db> [<more .db>]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), fs = require('fs'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js')), BL = require(path.join(M, 'dxf2bill.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const BASE = process.env.BASE ? require(path.join(process.env.BASE, 'dxf2bim_import.js')) : null;
const ref = JSON.parse(fs.readFileSync(path.join(M, 'synthetic_ref.json'), 'utf8')), pack = JSON.parse(fs.readFileSync(path.join(M, '..', 'viewer/rates/cidb2024_my.json'), 'utf8'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const dbs = process.argv.slice(2); if (!dbs.length) { say('MISSING input: a Node model .db (e.g. /tmp/db2/HHSM2.db, scripts/extractIFC2DB.js)'); process.exit(2); }
const CURT = SHC.STD.CURTAIN.slice();
dbs.forEach(db => {
  const name = path.basename(db, '.db'), con = new Database(db, { readonly: true }), q = s => con.prepare(s).all();
  const R = S.writeStdSet(q, 'X', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' });
  const files = Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] })), conv = Imp => Imp.convert(Imp.readSheets(files), {});
  const o = conv(I); if (!o.els) { check('C0[' + name + ']', 'the marked set converts', false, JSON.stringify(o.refused).slice(0, 200)); return; }
  const onCurt = o.els.filter(e => CURT.indexOf(e.layer) >= 0), wrong = onCurt.filter(e => e.class !== 'IfcCurtainWall');
  let other = 'no BASE';
  if (BASE) { const b = conv(BASE), cb = {}; b.els.forEach(e => { cb[e.guid] = e.class; });
    const moved = o.els.filter(e => CURT.indexOf(e.layer) < 0 && cb[e.guid] !== undefined && cb[e.guid] !== e.class); other = 'other_layers_changed=' + moved.length + ' base_curtain_as=' + JSON.stringify([...new Set(b.els.filter(e => CURT.indexOf(e.layer) >= 0).map(e => e.class))]);
    if (moved.length) wrong.push.apply(wrong, moved); }
  if (onCurt.length) {
    check('C1[' + name + ']', 'every element on the curtain layer is IfcCurtainWall, no other element changes class', !wrong.length, `on_curtain=${onCurt.length} wrong=${wrong.length} ${other}`);
    const bl = BL.bill(onCurt.slice(0, 3), { ref, pack, packName: 'cidb2024_my' }), ln = bl.lines, pe = pack.materials.IfcCurtainWall;
    const ok = ln.length === 3 && ln.every(l => l.unit === 'M2' && l.rate === pe.rate && l.factor === 1 && Math.abs(l.amount - l.measures.A * pe.rate) < 1e-3 && l.material === 'Curtain wall (glazed)');
    check('C2[' + name + ']', 'the bill prices a curtain body per m2 of face at the pack rate, no thickness factor', ok, ln.map(l => `A=${l.measures.A} t=${l.measures.t} rate=${l.rate} factor=${l.factor} amount=${l.amount} ${l.material}`).join(' ; '));
    SHC.STD.CURTAIN.length = 0; delete require.cache[require.resolve(path.join(M, 'dxf2bim_import.js'))]; const I2 = require(path.join(M, 'dxf2bim_import.js')), o2 = conv(I2);
    SHC.STD.CURTAIN.push.apply(SHC.STD.CURTAIN, CURT); delete require.cache[require.resolve(path.join(M, 'dxf2bim_import.js'))];
    const back = o2.els.filter(e => CURT.indexOf(e.layer) >= 0 && e.class !== 'IfcCurtainWall').length;
    check('C4[' + name + ']', 'with STD.CURTAIN emptied the band is IfcWall again (the rule is what changes it)', back === onCurt.length, `ifcwall_on_curtain_without_rule=${back} of ${onCurt.length}`);
  } else if (BASE) { const b = conv(BASE), cb = {}; b.els.forEach(e => { cb[e.guid] = e.class; }); const common = o.els.filter(e => cb[e.guid] !== undefined), moved = common.filter(e => cb[e.guid] !== e.class);
    check('C3[' + name + ']', 'a set with no curtain layer keeps every class (elements present in both)', common.length > 0 && !moved.length, `els=${o.els.length} common=${common.length} changed=${moved.length}`); }
  else say('INFO C3[' + name + '] | no curtain layer, no BASE');
});
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
