#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-SHEET-RENDER (prompts/DXF2BIM_FOUNDATION_LANE.md §D82 SV1-SV2). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the sheet renderer (viewer/dxf_sheet_view.js) left 152 of the raw shed's 3,043 entities undrawn (LEADER 85, MTEXT 59, SOLID 8), so a "full frame" view of a
// CAD office's sheet was not the sheet; and teaching it new types must not change a page the Viewer's 2D wing already draws.
//   SV1 the 9 raw shed sheets: unsupported = 0, and every MTEXT / LEADER / SOLID read is in the draw list (drawn_by_type = by_type for each); the module before §D82 (SHEET_BASE_REF, default 9b6c339d^) reports the 152 (falsifier).
//   SV2 the Duplex standard set written from the model (std2d, what the Viewer's 2D wing draws): draw list JSON and SVG byte-identical between origin/main's module and this one.
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
  return JSON.stringify(a) !== JSON.stringify(b) || OLD.toSVG(a.list, ba) !== V.toSVG(b.list, bb); }).map(f => path.basename(f));
ok('SV2 a sheet the 2D wing already draws is unchanged (draw list + SVG byte-identical to main)', std.length > 0 && !diff.length, 'std sheets=' + std.length + (diff.length ? ' DIFFER ' + diff.join(',') : ' identical'));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('§W-SHEET-RENDER ' + (fails ? 'FAIL' : 'PASS')); process.exit(fails ? 1 : 0);
