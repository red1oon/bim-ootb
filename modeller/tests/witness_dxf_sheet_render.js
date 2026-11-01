#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-SHEET-RENDER (prompts/DXF2BIM_FOUNDATION_LANE.md §D82 SV1-SV2). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the sheet renderer (viewer/dxf_sheet_view.js) left 152 of the raw shed's 3,043 entities undrawn (LEADER 85, MTEXT 59, SOLID 8), so a "full frame" view of a
// CAD office's sheet was not the sheet; and teaching it new types must not change a page the Viewer's 2D wing already draws.
//   SV1 the 9 raw shed sheets: unsupported = 0, and every MTEXT / LEADER / SOLID read is in the draw list (drawn_by_type = by_type for each); the module before §D82 (SHEET_BASE_REF, default 9b6c339d^) reports the 152 (falsifier).
//   SV2 the Duplex standard set written from the model (std2d, what the Viewer's 2D wing draws): draw list JSON and SVG byte-identical between origin/main's module and this one.
//       (§D101: the stats compared are the pre-§D101 keys; §D101 adds counters block_parts / dim_block / dim_geom / dim_unmatched / insert_* / points / dim_text_unformatted.)
//   SV3 (§D101, owner: "I see thin stripes. Dimension failure?") the raw shed's 147 DIMENSIONs carry no block name: every one is drawn (its *D block found by its definition points, or, with no
//       block, from those points + its DIMSTYLE), dim_unmatched 0, each sheet draws dimension parts; falsifier: the module before §D101 (D101_BASE_REF, default the parent of the main commit that holds it) draws 0 parts.
//   SV4 (§D101) no DXF special code (%%c / %%d / %%p ...) is left in any drawn string; the DETAILS sheet's Ø count = its %%c count; falsifier: the module before §D101 leaves them.
//   SV5 (U4) a DIMENSION drawn from its own points whose DIMSTYLE is not in the file: lines drawn, value only if stated literally, else no text + stats.dim_style_missing (before U4: AutoCAD defaults, '4.0000').
// Inputs: SHED_RAW_DIR (the 9 raw shed sheets; absent -> MISSING input) and the Duplex db (argv[2] or ~/.cache/dxf2bim/db/DXARC.db, §D79).
// usage: SHED_RAW_DIR=<dir> NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_dxf_sheet_render.js [DXARC.db]
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), V = require(path.join(ROOT, 'viewer', 'dxf_sheet_view.js'));
const RAW = process.env.SHED_RAW_DIR || '', DB = process.argv[2] || path.join(os.homedir(), '.cache', 'dxf2bim', 'db', 'DXARC.db');
const raw = RAW && fs.existsSync(RAW) ? fs.readdirSync(RAW).filter(f => /\.dxf$/i.test(f)).sort() : [];
if (raw.length !== 9 || !fs.existsSync(DB)) { console.log('MISSING input: ' + (raw.length !== 9 ? 'the 9 raw shed sheets (SHED_RAW_DIR, found ' + raw.length + ')' : DB)); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sheetrender-')), oldPath = path.join(tmp, 'dxf_sheet_view_main.js');
// the falsifier's baseline = the renderer BEFORE §D82 (its parent commit), not origin/main: once #2399 merged, main draws them too and the falsifier read 0 (stale, measured 2026-10-28)
const BASE_REF = process.env.SHEET_BASE_REF || '9b6c339d^';
fs.writeFileSync(oldPath, cp.execFileSync('git', ['-C', ROOT, 'show', BASE_REF + ':viewer/dxf_sheet_view.js']));
const OLD = require(oldPath);
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§PASS ' : '§FAIL ') + id + '  ' + m); if (!c) fails++; };
const tally = (M, files) => { const t = { by: {}, drawn: {}, uns: 0 }; files.forEach(f => { const r = M.toDrawList(M.parse(fs.readFileSync(f, 'utf8'))); Object.keys(r.stats.by_type).forEach(k => { t.by[k] = (t.by[k] || 0) + r.stats.by_type[k]; });
  Object.keys(r.stats.drawn_by_type).forEach(k => { t.drawn[k] = (t.drawn[k] || 0) + r.stats.drawn_by_type[k]; }); t.uns += r.stats.unsupported || 0; }); return t; };
const rf = raw.map(f => path.join(RAW, f)), N = tally(V, rf), O = tally(OLD, rf), NEW = ['MTEXT', 'LEADER', 'SOLID'];
console.log('§SHEET-RENDER shed raw sheets=9 ents=' + Object.values(N.by).reduce((a, b) => a + b, 0) + ' unsupported new=' + N.uns + ' before_D82=' + O.uns + ' ' + NEW.map(k => k + '=' + (N.drawn[k] || 0) + '/' + (N.by[k] || 0)).join(' '));
ok('SV1 nothing on the raw shed is left undrawn; the new types are each drawn as read (falsifier: the renderer before §D82 reports them unsupported)', N.uns === 0 && NEW.every(k => N.by[k] > 0 && N.drawn[k] === N.by[k]) && O.uns === NEW.reduce((a, k) => a + (N.by[k] || 0), 0),
  'unsupported ' + O.uns + ' -> ' + N.uns + ' | ' + NEW.map(k => k + ' ' + (N.drawn[k] || 0) + ' of ' + (N.by[k] || 0)).join(', '));
const r = cp.spawnSync('node', [path.join(ROOT, 'prompts', 'film_dxf2bim_yellow_sets.js'), DB, path.join(tmp, 'dx')], { encoding: 'utf8', env: Object.assign({}, process.env, { NODE_PATH: path.join(process.env.HOME, 'bim-compiler', 'node_modules') }) });
const std = r.status === 0 ? fs.readdirSync(path.join(tmp, 'dx', 'plain')).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(tmp, 'dx', 'plain', f)) : [];
const diff = std.filter(f => { const t = fs.readFileSync(f, 'utf8'), a = OLD.toDrawList(OLD.parse(t)), b = V.toDrawList(V.parse(t)), ba = OLD.bounds(a.list), bb = V.bounds(b.list);
  const keep = st => { const o = {}; Object.keys(st).filter(k => !/^(block_parts|dim_block|dim_geom|dim_unmatched|dim_ambiguous|dim_text_unformatted|insert_parts|insert_skipped|points|dim_parts)$/.test(k)).forEach(k => { o[k] = st[k]; }); return o; };
  return JSON.stringify(a.list) !== JSON.stringify(b.list) || JSON.stringify(keep(a.stats)) !== JSON.stringify(keep(b.stats)) || OLD.toSVG(a.list, ba) !== V.toSVG(b.list, bb); }).map(f => path.basename(f));
ok('SV2 a sheet the 2D wing already draws is unchanged (draw list + SVG byte-identical to main)', std.length > 0 && !diff.length, 'std sheets=' + std.length + (diff.length ? ' DIFFER ' + diff.join(',') : ' identical'));
// SV3 + SV4 (§D101) against the module before §D101
const prePath = path.join(tmp, 'dxf_sheet_view_pre101.js'); fs.writeFileSync(prePath, cp.execFileSync('git', ['-C', ROOT, 'show', (process.env.D101_BASE_REF || 'cb25ff14~1') + ':viewer/dxf_sheet_view.js']));
const PRE = require(prePath), per = rf.map(f => { const t = fs.readFileSync(f, 'utf8'), a = V.toDrawList(V.parse(t)), b = PRE.toDrawList(PRE.parse(t)), str = L => L.filter(d => d.k === 'text' || d.k === 'mtext').flatMap(d => d.k === 'text' ? [d.s] : d.lines);
  return { f: path.basename(f), dims: a.stats.by_type.DIMENSION || 0, drawn: a.stats.drawn_by_type.DIMENSION || 0, block: a.stats.dim_block || 0, geom: a.stats.dim_geom || 0, un: a.stats.dim_unmatched || 0,
    parts: (a.stats.dim_parts || 0) + 3 * (a.stats.dim_geom || 0), preParts: b.stats.dim_parts || 0, pct: str(a.list).filter(s => /%%[cdpuo%\d]/i.test(s)).length, prePct: str(b.list).filter(s => /%%[cdpuo%\d]/i.test(s)).length,
    dia: str(a.list).join('').split('Ø').length - 1, codes: (t.match(/%%[cC]/g) || []).length }; });
per.forEach(q => console.log('§SHEET-DIM ' + q.f + ' dims=' + q.dims + ' drawn=' + q.drawn + ' via_block=' + q.block + ' from_points=' + q.geom + ' unmatched=' + q.un + ' parts=' + q.parts + ' before_D101=' + q.preParts + ' %%left=' + q.pct + ' (before ' + q.prePct + ') diameter=' + q.dia + '/' + q.codes));
const tot = k => per.reduce((a, q) => a + q[k], 0);
ok('SV3 every DIMENSION of the raw shed is drawn (' + tot('drawn') + ' of ' + tot('dims') + ': ' + tot('block') + ' via their *D block, ' + tot('geom') + ' from their own points), none unmatched, each sheet draws parts; before §D101 ' + tot('preParts') + ' parts',
  tot('dims') > 0 && per.every(q => q.drawn === q.dims && q.un === 0 && (q.dims === 0 || q.parts > 0)) && tot('preParts') === 0, '');
const det = per.find(q => /DETAILS/i.test(q.f));
ok('SV4 no DXF special code left in a drawn string (' + tot('pct') + '; before §D101 ' + tot('prePct') + '); DETAILS diameter signs ' + (det && det.dia) + ' = its %%c codes ' + (det && det.codes),
  tot('pct') === 0 && tot('prePct') > 0 && det && det.codes > 0 && det.dia === det.codes, '');
fs.rmSync(tmp, { recursive: true, force: true });
{ // SV5 (U4) fixtures: one linear DIMENSION with no block, from (0,0) to (4,0), dimension line at y = 1
  const dxf = (style, txt, withTable) => ['0', 'SECTION', '2', 'TABLES'].concat(withTable ? ['0', 'DIMSTYLE', '2', 'Standard', '271', '2', '277', '2', '140', '2.5', '40', '1'] : [], ['0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
    '0', 'DIMENSION', '8', 'Dim', '3', style, '1', txt, '70', '0', '10', '0', '20', '1', '13', '0', '23', '0', '14', '4', '24', '0', '0', 'ENDSEC', '0', 'EOF']).join('\n') + '\n';
  const run = t => { const r = V.toDrawList(V.parse(t)); return { lines: r.list.filter(d => d.k === 'line').length, texts: r.list.filter(d => d.k === 'text').map(d => d.s), miss: r.stats.dim_style_missing || 0 }; };
  const a = run(dxf('Standard', '', true)), b = run(dxf('NOPE', '', true)), c = run(dxf('NOPE', "10'-0\"", true)), preU4p = path.join(os.tmpdir(), 'dxf_sheet_view_preU4_' + process.pid + '.js');
  fs.writeFileSync(preU4p, cp.execFileSync('git', ['-C', ROOT, 'show', (process.env.U4_BASE_REF || '6e0abbeb') + ':viewer/dxf_sheet_view.js']));   // main before U4 (a main commit: survives the squash, landmine g)
  const P4 = require(preU4p), pre = P4.toDrawList(P4.parse(dxf('NOPE', '', true))).list.filter(d => d.k === 'text').map(d => d.s); fs.rmSync(preU4p, { force: true });
  console.log('§SHEET-DIMSTYLE present ' + JSON.stringify(a) + ' | missing ' + JSON.stringify(b) + ' | missing+literal ' + JSON.stringify(c) + ' | before U4 missing -> ' + JSON.stringify(pre));
  ok('SV5 style present -> "' + a.texts[0] + '"; style missing -> ' + b.lines + ' lines, no text, counted ' + b.miss + ' (before U4: ' + JSON.stringify(pre) + '); missing + literal -> "' + c.texts[0] + '", counted ' + c.miss,
    a.texts[0] === '4.00' && a.miss === 0 && b.lines === 3 && b.texts.length === 0 && b.miss === 1 && c.texts[0] === "10'-0\"" && c.miss === 0 && pre[0] === '4.0000', ''); }
console.log('§W-SHEET-RENDER ' + (fails ? 'FAIL' : 'PASS')); process.exit(fails ? 1 : 0);
