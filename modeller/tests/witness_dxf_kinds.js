// W-KINDS (prompts/DXF2BIM_MODELLER_LANE.md §L24): one body-kinds table. Issue: the editor menu, the structure judge and the marks grammar each had a private list; a kind added to one
// and not the others is accepted by one surface and refused (or invisible) in another. Read the log.
const P = require('../dxf2prep.js'), MK = require('../dxf2bim/dxf2marks.js'), ST = require('../dxf2structure.js'), fs = require('fs'), path = require('path');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const grammar = (MK.LAYER_TYPES || {}).BODY;
ok('K1 the marks grammar (BIMCompiler copy) lists exactly the table', Array.isArray(grammar) && JSON.stringify(grammar.slice().sort()) === JSON.stringify(P.BODY_KINDS.slice().sort()), 'table=' + P.BODY_KINDS.join() + ' grammar=' + (grammar || []).join());
ok('K2 every body kind has an IFC mapping (ifcType does not throw)', P.BODY_KINDS.every(k => { try { return !!P.ifcType(k).ifc_class; } catch (e) { return false; } }), '');
const ed = fs.readFileSync(path.join(__dirname, '..', 'dxf_meta_editor.js'), 'utf8'), stt = fs.readFileSync(path.join(__dirname, '..', 'dxf2structure.js'), 'utf8');
ok('K3 neither the editor nor the structure judge keeps a private list of kinds', !/BODY_KINDS = \[/.test(ed) && !/BODY_KINDS = \[/.test(stt) && /Dxf2Prep\.BODY_KINDS/.test(ed) && /PREP\.BODY_KINDS/.test(stt));
const sheet = k => ({ name: '0_P.dxf', role: 'plan', desc: { layers: [{ layer: 'X', type: k }] }, dxf: { entities: [] } });
ok('K4 the structure judge treats every table kind as a structure set', P.BODY_KINDS.every(k => ST.isStructure([sheet(k)], {})), '');
ok('K5 FALSIFIER: a kind outside the table is not a structure set', ST.isStructure([sheet("window_new")], {}) === false);
console.log('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
