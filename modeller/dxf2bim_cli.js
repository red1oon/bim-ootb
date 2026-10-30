#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2bim_cli.js — the DXF2BIM structure chain WITHOUT the Modeller (lane §L8): raw 2D sheets -> accepted suggestions -> the few facts a person states -> typed body layers -> bodies.
// The same pure modules the page uses (dxf2suggest.js, dxf2prep.js, dxf2bodies.js, dxf2structure.js, dxf2bim_import.js): nothing here knows a drawing; every rule is witnessed in Node.
//
// usage: node dxf2bim_cli.js --sheets a.dxf b.dxf ... --out <dir> [--accept-suggestions]
//          [--set NAME] [--level N] [--datum <sheet-substr>:<z m>@<drawing y>] [--haxis <sheet-substr>:<+X|-X|+Y|-Y>]
//          [--layer <plan|elev|section|roof>:<layer>=<kind>[@<sheet-substr>]] [--exclude <sheet-substr>:x0,y0,x1,y1] [--bodyz <kind>=<z0 m>,<z1 m>] [--size <body id>:<x|y|w|d>=<metres>] [--choice <key>=<value>] [--ifc]
//   --accept-suggestions  accept every suggestion (PR-*) until none is left (the page's "Accept all"), before and after the typed facts
//   --set / --level       @SET on every sheet without one / @LEVEL on every plan sheet            (the page's Set / Level (m) fields)
//   --datum               one @Z level datum: the sheet whose name contains <sheet-substr>        (the page's "Level datums (@Z)" add row)
//   --layer               @LAYER=<layer>,<kind> on every sheet of that role holding the layer (the page's pooled Layers select), or only on the sheets whose name contains <sheet-substr> (the page's per-sheet row)
//   --exclude             @EXCLUDE=x0,y0,x1,y1 (drawing units) on the sheet whose name contains <sheet-substr>: plan regions wholly inside are skipped and counted (the page's Exclude tool)
//   --bodyz               @BODYZ=<kind>,<z0>,<z1> on the first plan sheet                         (the page's "Body heights" add row)
//   --complete            add the floor slab and the gabled roof the drawings imply (derived, amber, yellow defaults; §L13.2)
//   --default             @DEFAULT=<key>,<value> on the first plan sheet (a setting for an element the drawings do not carry; §L18): --default door.height=2.4
//   --pack                rate pack name for bill.json (default cidb2024_my; viewer/rates/<name>.json)
//   --size                @SIZE=<body id>,<x|y|w|d>,<metres> on the first plan sheet              (the user's number for one body side, §L10.9)
//   --choice              a default the user changes, e.g. loops.snap_tol=0.1, column.type_name=
//   --ifc                 also write <out>/model.ifc (IFC4, typed bodies, via dxf2ifc.js + web-ifc: `require('web-ifc')`, else $WEB_IFC, else ~/bim-compiler/node_modules/web-ifc)
// writes <out>/marked/<sheet>_marked.dxf (the settings sheets), verdict.json, bodies.json, ops.json; prints §CLI lines; exit 0 = the set qualifies, 2 = it does not.
'use strict';
const fs = require('fs'), path = require('path'), { Buffer } = require('buffer');
const DxfParser = require('./lib/dxf-parser.js'), MK = require('./dxf2bim/dxf2marks.js'), I = require('./dxf2bim_import.js'), P = require('./dxf2prep.js'),
  B = require('./dxf2bodies.js'), SG = require('./dxf2suggest.js'), ST = require('./dxf2structure.js');

function parseArgs(argv) {
  const a = { sheets: [], layer: [], datum: [], haxis: [], bodyz: [], size: [], pack: [], default: [], choice: [], exclude: [], out: null, accept: false, set: null, level: null, ifc: false, complete: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--sheets') { while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) a.sheets.push(argv[++i]); }
    else if (k === '--accept-suggestions') a.accept = true;
    else if (k === '--ifc') a.ifc = true;
    else if (k === '--complete') a.complete = true;
    else if (['--out', '--set', '--level'].includes(k)) a[k.slice(2)] = argv[++i];
    else if (['--layer', '--datum', '--haxis', '--bodyz', '--size', '--pack', '--default', '--choice', '--exclude'].includes(k)) a[k.slice(2)].push(argv[++i]);
    else throw new Error('unknown argument ' + k);
  }
  if (!a.sheets.length || !a.out) throw new Error('need --sheets <dxf...> and --out <dir>');
  return a;
}
const ROLE_VIEW = { plan: 'PLAN', elev: 'ELEV', section: 'SECTION', roof: 'ROOF' };

function load(file) {
  const text = fs.readFileSync(file, 'utf8'), dxf = new DxfParser().parseSync(text);
  const marks = MK.readMarks(dxf.entities).map(m => { const r = /^@([A-Z]+)=(.*)$/.exec(m.raw.replace(/\s+@BY=\S+$/, '')); return { key: r[1], value: r[2], x: m.x, y: m.y, source: 'file' }; });
  const sh = { name: path.basename(file), text, dxf, marks };
  if (/\nHATCH\r?\n/.test(text)) { sh.hatchLayers = {}; require('./dxf2hatch.js').parseHatches(text).hatches.forEach(h => { if (h.layer) sh.hatchLayers[h.layer] = (sh.hatchLayers[h.layer] || 0) + 1; }); }   // layers that hold only hatches are typeable too (§L11)
  sh.fileSig = marks.map(m => [SG.markText(m, true), m.x, m.y]);
  return sh;
}

function run(args, log) {
  const say = log || (s => console.log(s));
  const sheets = args.sheets.map(load);
  const SETX = I.setWith('DX');
  const ctx = { MK, sheets: () => sheets,
    gridLayers: sh => SETX.QUALIFY.layers.grid.concat(sh.marks.filter(m => m.key === 'LAYER' && /,grid$/.test(m.value)).map(m => m.value.replace(/,grid$/, ''))),
    levelLayers: () => SETX.MAP_LEVL.rules.filter(r => r.type === 'levelline').map(r => r.pattern) };
  const sug = SG.create(ctx), get1 = SG.get1, viewOf = SG.viewOf;
  const put = (sh, key, value, x, y, rule) => {   // the page's confirm: a single key replaces, a multi key adds (once)
    const multi = SG.SINGLE_POS[key] !== undefined || ['EXCLUDE', 'WALLTOP', 'TAG', 'LAYER', 'BODYZ', 'SCHEDULE', 'LABEL', 'OPENING'].includes(key);
    if (!multi) sh.marks = sh.marks.filter(q => q.key !== key);
    else if (sh.marks.some(q => SG.canonOne(q) === SG.canonOne({ key, value, x: x || 0, y: y || 0 }))) return false;
    sh.marks.push({ key, value: String(value), x: x || 0, y: y || 0, source: 'user', rule: rule || null });
    say('§CLI mark sheet=' + sh.name + ' @' + key + '=' + value + (x || y ? ' at ' + x + ',' + y : '') + (rule ? ' (' + rule + ')' : ''));
    return true;
  };
  const acceptAll = (tag) => {
    let total = 0;
    for (let round = 1; round <= 8; round++) {
      let n = 0;
      sheets.forEach(sh => { sug.proposalsFor(sh).list.forEach(p => { if (put(sh, p.key, p.value, p.x, p.y, p.rule)) n++; }); });
      total += n; if (!n) break;
    }
    say('§CLI accept-all ' + tag + ' accepted=' + total); return total;
  };
  if (args.accept) acceptAll('1');
  if (args.set) sheets.forEach(sh => { if (!get1(sh, 'SET')) put(sh, 'SET', args.set); });
  if (args.level !== null) sheets.forEach(sh => { if (viewOf(sh) === 'PLAN') put(sh, 'LEVEL', args.level); });
  if (args.accept) acceptAll('2');
  args.haxis.forEach(h => { const [n, v] = h.split(':'); const sh = sheets.find(s => s.name.includes(n)); if (!sh) throw new Error('--haxis: no sheet ' + n); put(sh, 'HAXIS', v); });
  args.datum.forEach(d => { const m = /^(.+?):([-\d.]+)@([-\d.]+)$/.exec(d); if (!m) throw new Error('--datum <sheet>:<z>@<y>: ' + d); const sh = sheets.find(s => s.name.includes(m[1])); if (!sh) throw new Error('--datum: no sheet ' + m[1]); put(sh, 'Z', m[2], 0, Number(m[3])); });
  if (args.accept) acceptAll('3');
  args.layer.forEach(l => { const m = /^(plan|elev|section|roof):(.+)=([a-z]+)(?:@(.+))?$/.exec(l); if (!m) throw new Error('--layer <role>:<layer>=<kind>[@<sheet>]: ' + l);
    sheets.filter(sh => viewOf(sh) === ROLE_VIEW[m[1]] && (!m[4] || sh.name.includes(m[4])) && (sh.dxf.entities.some(e => e.layer === m[2]) || (sh.hatchLayers && sh.hatchLayers[m[2]]))).forEach(sh => { sh.marks = sh.marks.filter(q => !(q.key === 'LAYER' && q.value.startsWith(m[2] + ','))); put(sh, 'LAYER', m[2] + ',' + m[3]); }); });
  (args.exclude || []).forEach(x => { const m = /^(.+?):([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)$/.exec(x); if (!m) throw new Error('--exclude <sheet>:x0,y0,x1,y1: ' + x); const sh = sheets.find(s => s.name.includes(m[1])); if (!sh) throw new Error('--exclude: no sheet ' + m[1]); put(sh, 'EXCLUDE', m.slice(2, 6).join(',')); });
  args.bodyz.forEach(b => { const m = /^([a-z]+)=([-\d.]+),([-\d.]+)$/.exec(b); if (!m) throw new Error('--bodyz <kind>=<z0>,<z1>: ' + b); const sh = sheets.find(s => viewOf(s) === 'PLAN'); if (!sh) throw new Error('--bodyz: no plan sheet'); put(sh, 'BODYZ', m[1] + ',' + m[2] + ',' + m[3]); });
  (args.size || []).forEach(z => { const m = /^(.+):([xywd])=([\d.]+)$/.exec(z); if (!m) throw new Error('--size <body id>:<x|y|w|d>=<metres>: ' + z); const sh = sheets.find(s => viewOf(s) === 'PLAN'); if (!sh) throw new Error('--size: no plan sheet'); put(sh, 'SIZE', m[1] + ',' + m[2] + ',' + m[3]); });
  (args.default || []).forEach(z => { const m = /^([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)=(.+)$/.exec(z); if (!m) throw new Error('--default <dotted.key>=<value>: ' + z); const sh = sheets.find(s => viewOf(s) === 'PLAN'); if (!sh) throw new Error('--default: no plan sheet'); put(sh, 'DEFAULT', m[1] + ',' + m[2]); });
  const choices = {}; args.choice.forEach(c => { const i = c.indexOf('='); choices[c.slice(0, i)] = c.slice(i + 1); });

  // effective sheets -> the importer's own reader (with the pre-processor) -> the structure judgement
  const eff = sheets.map(sh => ({ name: sh.name, text: SG.effText(sh, MK, true) }));
  const read = I.readSheets(eff, { prep: P, prepChoices: choices });
  const packName = (args.pack && args.pack[0]) || 'cidb2024_my', packFile = path.join(__dirname, '..', 'viewer', 'rates', packName + '.json'), packJ = fs.existsSync(packFile) ? JSON.parse(fs.readFileSync(packFile, 'utf8')) : null;
  const BL0 = require('./dxf2bill.js'), complete = args.complete ? {} : null;
  const refJ = JSON.parse(fs.readFileSync(path.join(__dirname, 'synthetic_ref.json'), 'utf8'));
  const out = ST.judge(read, { I, B, choices, complete, ref: refJ });
  say('§CLI ' + out.log);
  // §L10.8 every typed dimension override against its own measured length (per sheet unit), one row per distinct conflict
  const PR = require('./dxf2pair.js'), audit = { rows: [], counts: {} };
  read.forEach(sh => { const k = sh.factor, u = Math.abs(k - 0.0254) < 1e-9 ? 'in' : Math.abs(k - 0.001) < 1e-12 ? 'mm' : Math.abs(k - 1) < 1e-12 ? 'm' : null; if (!u || !sh.dxf) return;
    const a = PR.auditDims(PR.dimsOf(sh.dxf.entities, sh.name), { unit: u }); a.rows.forEach(r => audit.rows.push(r)); Object.keys(a.counts).forEach(c => { audit.counts[c] = (audit.counts[c] || 0) + a.counts[c]; }); });
  say('§DIMAUDIT ' + Object.keys(audit.counts).map(c => c + '=' + audit.counts[c]).join(' ') + ' rows=' + audit.rows.length);
  // §L12 entity accounting: every model-space entity is read by the product or listed as dropped
  const AC = require('./dxf2account.js'), HT = require('./dxf2hatch.js'), account = { sheets: {}, dropped: {} };
  sheets.forEach(sh => { const a = AC.account(sh.text, sh.dxf.entities, { HATCH: HT.parseHatches(sh.text).hatches.length, LEADER: HT.parseLeaders(sh.text).length }); account.sheets[sh.name] = { total: a.total, dropped: a.dropped }; a.dropped.forEach(d => { account.dropped[d.type] = (account.dropped[d.type] || 0) + d.n; }); });
  say('§ACCOUNT entities=' + Object.keys(account.sheets).reduce((n, k) => n + account.sheets[k].total, 0) + ' dropped=' + (Object.keys(account.dropped).map(k => k + ':' + account.dropped[k]).join(',') || 'none'));
  // §L13.1 the bill: every body priced by the reference's stated formula x the rate pack's class rate (nothing guessed: no rate = 0 + flag)
  let billRes = null;
  { const BL = require('./dxf2bill.js'), pf = packFile;
    if (packJ && out.gate && out.gate.R && out.gate.R.els && out.gate.R.els.length) { // T14b: the defaults in force (values + where each came from) and each body's weight from load_summary.js (the one owner of a body's weight) feed the rows that state a quantity formula
      const DT = out.gate.R.defaults_table || [], values = {}, sources = {}; DT.forEach(r => { values[r.key] = r.value; sources[r.key] = r.source; });
      const LS = require('./load_summary.js').compute(out.gate.R.els, { values, sources }), weights = {}, assumed = {}; LS.rows.forEach(r => { if (r.kN != null && isFinite(r.kN)) weights[r.guid] = r.kN; if (r.assumed) assumed[r.guid] = r.sectionFrom; });
      billRes = BL.bill(out.gate.R.els, { ref: JSON.parse(fs.readFileSync(path.join(__dirname, 'synthetic_ref.json'), 'utf8')), pack: packJ, packName, weights, assumed, values, sources }); say(billRes.log); } }
  return { sheets, eff, read, out, choices, audit, account, bill: billRes };
}

function write(res, dir) {
  fs.mkdirSync(path.join(dir, 'marked'), { recursive: true });
  res.eff.forEach(f => fs.writeFileSync(path.join(dir, 'marked', f.name.replace(/\.dxf$/i, '') + '_marked.dxf'), f.text));
  const g = res.out.gate, R = g.R;
  const TY = require('./dxf2typology.js'), tRow = ((g.R && g.R.defaults_table) || []).find(r => r.key === 'building.type'), typology = TY.advise(R && R.els || [], tRow ? tRow.value : null, null);
  console.log('§TYPOLOGY type=' + (typology.type || 'none') + ' rows=' + typology.rows.length + (typology.rows.length ? ' ' + JSON.stringify(typology.measured) : ''));
  typology.rows.forEach(r => console.log('§TYPOLOGY ' + r.code + ' ' + r.message));
  if (res.out.ledger) { const L = res.out.ledger; console.log('§LEDGER ' + Object.keys(L.totals).sort().map(k => k + '=' + L.totals[k].layers + 'L/' + L.totals[k].geometry + 'e').join(' ')); L.flagged.forEach(r => console.log('§LEDGER_FLAG ' + r.status + ' ' + r.sheet + ' layer=' + r.layer + ' typed=' + (r.typed || '-') + ' geometry=' + r.geometry + ' used=' + r.used_entities + ' bodies=' + r.bodies)); }
  const RUNFMT = 'dxf2bim-run/1';   // §F2 the output contract (docs/DXF2BIM_FORMAT.md, modeller/schemas/): a reader checks this before reading anything else
  fs.writeFileSync(path.join(dir, 'verdict.json'), JSON.stringify({ format: RUNFMT, layer_ledger: res.out.ledger ? { totals: res.out.ledger.totals, rows: res.out.ledger.rows } : null, defaults_table: g.R && g.R.defaults_table, defaults_invalid: g.R && g.R.defaults_invalid, typology, entity_account: res.account, dimension_audit: res.audit, ok: g.ok, structure: g.structure, verdict: g.verdict, refused: g.refused, defaults: res.out.defaults.map(r => ({ key: r.key, value: r.value, kind: r.kind, why: r.why || null, evidence: r.evidence || null, basis: r.basis || null, element: r.element || null })), report: R && R.bodies && R.bodies.report, run_id: R && R.run_id }, null, 1));
  const bodies = (R && R.els || []).map(e => { const xs = e.vertices.map(v => v[0]), ys = e.vertices.map(v => v[1]); return { guid: e.guid, mark: e.mark || null, size: e.size || null, class: e.class, kind: e.kind, storey: e.storey, z0: e.z0, z1: e.z1, height_source: e.height_source, prov: e.prov, ifc: e.ifc, sheet: e.sheet, handle: e.handle, bbox: [Math.min(...xs), Math.min(...ys), e.z0, Math.max(...xs), Math.max(...ys), e.z1] }; });
  if (res.bill) fs.writeFileSync(path.join(dir, 'bill.json'), JSON.stringify(Object.assign({ format: RUNFMT }, res.bill), null, 1));
  fs.writeFileSync(path.join(dir, 'bodies.json'), JSON.stringify(bodies, null, 1));
  fs.writeFileSync(path.join(dir, 'format.json'), JSON.stringify({ format: RUNFMT, marks_format: 'dxf2bim-marks/1', files: { 'verdict.json': 'object', 'bodies.json': 'array of bodies (no wrapper: existing consumers read it as an array)', 'ops.json': 'object (when the set qualifies)', 'bill.json': 'object (when a pack is found)', 'model.ifc': 'IFC4 (with --ifc)', 'marked/*_marked.dxf': 'the settings sheets' } }, null, 1));
  if (g.ok) { const T = I.toOps(R, { hashHex: I.sha256Hex }); fs.writeFileSync(path.join(dir, 'ops.json'), JSON.stringify({ format: RUNFMT, run_id: R.run_id, inserts: T.inserts.map(o => ({ op_type: o.op_type, outputGuid: o.outputGuid, params: o.params })), assets: T.assets.length, skipped: T.skipped }, null, 1)); }
  return bodies;
}

function webIfc() {
  for (const m of ['web-ifc', process.env.WEB_IFC, path.join(process.env.HOME || '', 'bim-compiler/node_modules/web-ifc')]) { if (!m) continue; try { return require(m); } catch (e) { /* next */ } }
  throw new Error('--ifc needs web-ifc (npm i web-ifc, or set WEB_IFC=<dir>)');
}
// T13.5: the type counts as stated only when a file/sheet/editor choice gave it, never the registry default or a type override
function statedType(R) { const r = ((R && R.defaults_table) || []).find(x => x.key === 'building.type'); return r && /^(file|sheet|choice)$/.test(r.source) ? String(r.value) : null; }
async function writeIfc(res, dir) {
  const W = webIfc(), api = new W.IfcAPI(); await api.Init();
  const R = res.out.gate.R, IFC = require('./dxf2ifc.js'), r = IFC.build(IFC.fromEls(R.els, R.ST), { api, WebIFC: W, name: 'dxf2bim.ifc', buildingType: statedType(R) });
  fs.writeFileSync(path.join(dir, 'model.ifc'), Buffer.from(r.bytes));
  return r;
}

if (require.main === module) {
  (async () => {
  try {
    const args = parseArgs(process.argv.slice(2)), res = run(args), bodies = write(res, path.resolve(args.out)), g = res.out.gate;
    if (args.ifc && g.ok) { const r = await writeIfc(res, path.resolve(args.out)); console.log('§CLI ifc seeded=' + r.seeded + ' typed=' + r.typed + ' coloured=' + r.coloured + ' psets=' + r.withPset + ' styles=' + r.styles + ' byClass=' + JSON.stringify(r.byClass) + ' storeys=' + JSON.stringify(r.storeys)); }
    const by = {}; bodies.forEach(b => { const k = b.class; by[k] = (by[k] || 0) + 1; });
    console.log('§CLI result ok=' + g.ok + ' bodies=' + bodies.length + ' byClass=' + JSON.stringify(by) + ' left_out=' + (g.structure ? g.structure.left_out : '-') + ' out=' + path.resolve(args.out));
    process.exit(g.ok ? 0 : 2);
  } catch (e) { console.error('§CLI ERROR ' + (e && e.message)); process.exit(1); }
  })();
}
module.exports = { run, write, parseArgs, writeIfc };
