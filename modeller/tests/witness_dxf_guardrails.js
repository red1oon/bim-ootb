#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-GUARD (prompts/DXF2BIM_FOUNDATION_LANE.md §3c, guardrails G1-G3). Issue it proves or disproves: the engine stays GENERAL as more drawing sets arrive. G1 no layer / sheet / building name is a string literal in the engine (a fix for one set must be a typed fact, a registry row, a convention reader or a tolerance rule, never a literal that names the set); G3 the number of silent inline reader thresholds can only go DOWN (a ratchet: moving one into the registry lowers the baseline; adding one fails until it is registered).
// Engine = modeller/dxf2*.js (own modules) + dxf_import_ui.js + dxf_meta_editor.js + dxf2bim_cli.js. NOT the verbatim BIMCompiler copies in modeller/dxf2bim/ (they carry the NCS/AIA standard layer maps: a standard convention, not a set).
// G1a the scan finds nothing outside the documented allowlist; G1b every allowlist entry still exists (a stale entry fails: the list cannot rot); G1c CONTROL: a file with a layer literal, a sheet name and a building word IS caught; G3 the per-module count of inline numeric thresholds is <= tests/tolerance_baseline.json (regenerate with --update only when the count went DOWN).
// usage: node modeller/tests/witness_dxf_guardrails.js [--update]
'use strict';
const fs = require('fs'), path = require('path'), M = path.join(__dirname, '..');
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§PASS ' : '§FAIL ') + id + ' ' + (m || '')); if (!c) fails++; };
const ENGINE = fs.readdirSync(M).filter(f => /^dxf2.*\.js$/.test(f)).concat(['dxf_import_ui.js', 'dxf_meta_editor.js']).filter(f => fs.existsSync(path.join(M, f))).sort();
const LAYERS = new Set(['Rod', 'Win', 'Fo', 'Col', 'Tex', 'Dim', 'Wall', 'Boundary Wall', 'Defpoints']);   // layer names seen in the real sets (not the product's own `DXF2BIM-MARK`)
const WORDS = /(^|[^A-Za-z])(shed|farm|farming|duplex|hospital|terminal|clinic|garage|castle|samplehouse|jkr)([^A-Za-z]|$)/i   /* letters-only boundary: 'subset_duplex.json' is a hit, 'dashed' is not */, SHEET = /(\b\d_[A-Z]+_[A-Z]+|FLOOR_PLAN|ELEV_(NORTH|SOUTH|EAST|WEST)|BEAM_LAYOUT|FOUNDATION_LAYOUT|SECTION_AA)/;
const CLIENT = process.env.FILM_REDACT_RE ? new RegExp(process.env.FILM_REDACT_RE, 'i') : null;   // private names live only in the environment, never in the repo
function strip(src) {   // code without comments, string contents kept
  let out = '', i = 0, q = null; const n = src.length;
  while (i < n) { const c = src[i];
    if (q) { out += c; if (c === '\\') { out += src[i + 1] || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; out += c; i++; continue; }
    if (src.startsWith('//', i)) { const j = src.indexOf('\n', i); i = j < 0 ? n : j; continue; }
    if (src.startsWith('/*', i)) { const j = src.indexOf('*/', i); i = j < 0 ? n : j + 2; continue; }
    out += c; i++; }
  return out;
}
function scan(name, src) {
  const code = strip(src), hits = [], re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g; let m;
  while ((m = re.exec(code))) { const lit = m[1] !== undefined ? m[1] : m[2];
    if (LAYERS.has(lit)) hits.push({ file: name, kind: 'layer', lit });
    else if (WORDS.test(lit)) hits.push({ file: name, kind: 'word', lit: lit.slice(0, 70) });
    else if (SHEET.test(lit)) hits.push({ file: name, kind: 'sheet', lit: lit.slice(0, 70) });
    else if (CLIENT && CLIENT.test(lit)) hits.push({ file: name, kind: 'client', lit: '(private word)' }); }
  return hits;
}
const ALLOW = [   // {file, includes, why}: each must still be present, each says when it goes away
  { file: 'dxf_meta_editor.js', includes: 'NCS/AIA, Duplex DX', why: 'the built-in layer-map set DX is the NCS/AIA convention (a standard); only its LABEL names the set it was first used on. Rename the label to the standard when the UI is next touched.' },
  { file: 'dxf_import_ui.js', includes: 'library_subset_duplex.json', why: 'the local-override file name of the DXF2BIM library subset; goes away with the unified mesh store (foundation lane F5).' }];
const all = ENGINE.flatMap(f => scan(f, fs.readFileSync(path.join(M, f), 'utf8'))), unexpected = all.filter(h => !ALLOW.some(a => a.file === h.file && h.lit.includes(a.includes)));
ok('G1a no layer / sheet / building / client literal in ' + ENGINE.length + ' engine files (allowlist: ' + ALLOW.length + ')', unexpected.length === 0, JSON.stringify(unexpected.slice(0, 5)) + (CLIENT ? '' : ' (client check off: set FILM_REDACT_RE to include private names)'));
const stale = ALLOW.filter(a => !all.some(h => h.file === a.file && h.lit.includes(a.includes))); ok('G1b every allowlist entry still exists (no stale exceptions)', stale.length === 0, JSON.stringify(stale.map(a => a.file + ':' + a.includes)));
const ctl = scan('control.js', "var a = 'Rod'; var b = '0_FLOOR_PLAN.dxf'; var c = 'the farm shed'; // 'Win' only in a comment\n"), kinds = ctl.map(h => h.kind).sort().join(',');
ok('G1c control: a layer literal, a sheet name and a building word ARE caught (a comment is not)', kinds === 'layer,sheet,word', kinds);
// G3 ratchet
const THR = /(?:<=?|>=?|===?|Math\.abs\([^)]*\)\s*<)\s*(-?\d*\.?\d+(?:e-?\d+)?)\b/g, count = src => { let n = 0, m; const code = strip(src); while ((m = THR.exec(code))) { const v = Math.abs(Number(m[1])); if (v !== 0 && v !== 1) n++; } THR.lastIndex = 0; return n; };
const now = {}; ENGINE.forEach(f => { now[f] = count(fs.readFileSync(path.join(M, f), 'utf8')); });
const BASE = path.join(__dirname, 'tolerance_baseline.json');
if (process.argv.includes('--update')) { fs.writeFileSync(BASE, JSON.stringify(now, null, 1) + '\n'); console.log('§NOTE baseline written (only do this when the numbers went DOWN)'); }
const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : null;
const over = base ? Object.keys(now).filter(f => (now[f] || 0) > (base[f] === undefined ? 0 : base[f])) : ['(no baseline file)'];
ok('G3 inline reader thresholds per module do not exceed the baseline (total now ' + Object.values(now).reduce((a, b) => a + b, 0) + ', baseline ' + (base ? Object.values(base).reduce((a, b) => a + b, 0) : '?') + ')', over.length === 0, over.map(f => f + ' ' + now[f] + ' > ' + (base && base[f])).join('; '));
console.log('§W-GUARD ' + (fails ? 'FAIL ' + fails : 'PASS')); process.exit(fails ? 1 : 0);
