#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-PD1 (prompts/PDF2BIM_VECTOR_PROBE.md §41, rules seam). Read the log after every run: exit code alone is not evidence, a SKIP or a VACUOUS only shows in the log.
// THE ISSUE THIS PROVES OR DISPROVES: the Modeller's "from PDF drawing" step needs the drawing-reader's RULES (sheet model -> the 7 typed DXF texts) in pure JavaScript, byte for byte what the Python chain
// (scripts/pdf2bim/*.py) produces from the SAME model. Does modeller/pdf2dxf/ (UMD modules, no fs, no child_process) reproduce, for EACH of the 9 oracle drawings (tb second Z B H S T G D):
//   (1) every one of the 7 sheets BYTE-IDENTICAL to the oracle's typed/*.dxf   (2) inferred.json deep-equal, incl. .values   (3) the effective rosetta (rooms included) and template deep-equal
//   (4) the §INFER / §ROOM(S) / §FILL log lines equal (and, reported separately, every other stage log line)   (5) the same result when loaded the way a page loads it (UMD, only `self`, no require)
// A first differing byte is reported with its sheet, line number and BOTH texts. It must be able to say NO: step (0) feeds it a sheet altered by one character and demands a FAIL.
// §VACUOUS (exit 2) if an oracle dir or an oracle sheet is missing, or a stage log judged nothing.  Final line: §RESULT judged=N fails=M.
// usage: node modeller/tests/witness_pdf2dxf_rules.js [oracleDir] > witness_pdf2dxf_rules.log ; then read the log.
//   oracleDir (or env PDF2DXF_ORACLE) holds <k>/{model.json,typed/*.dxf,inferred.json,rosetta.effective.json,template.effective.json,00_fill_blanks.log,03b_infer_type.log,06_emit_dxf_p1.log,06b_read_rooms.log,08_elev_emit.log,09_to_std.log,09b_section_emit.log,09c_roof_emit.log}
//   (made by scripts/pdf2bim/dump_sheet_model.py + run_p1.sh on the Python side; the oracle is never modified here).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.join(__dirname, '..', 'pdf2dxf');
const ORACLE = process.argv[2] || process.env.PDF2DXF_ORACLE || '/tmp/claude-1000/-home-red1-bim-compiler/823b42b8-c5a2-42a3-bf3e-463860e3cca1/scratchpad/oracle';
const KEYS = ['tb', 'second', 'Z', 'B', 'H', 'S', 'T', 'G', 'D'];
const SHEETS = ['plan.dxf', 'elev_front.dxf', 'elev_rear.dxf', 'elev_right.dxf', 'elev_left.dxf', 'roof.dxf', 'section_aa.dxf'];
const LOGS = { fill_blanks: '00_fill_blanks.log', infer_type: '03b_infer_type.log', emit_dxf_p1: '06_emit_dxf_p1.log', read_rooms: '06b_read_rooms.log', elev_emit: '08_elev_emit.log', to_std: '09_to_std.log', section_emit: '09b_section_emit.log', roof_emit: '09c_roof_emit.log' };
const MODULES = ['py_rt', 'type_template', 'tag_reader', 'fill_blanks', 'infer_type', 'emit_dxf_p1', 'read_rooms', 'add_plan_marks', 'elev_emit', 'to_std', 'section_emit', 'roof_emit', 'index'];
let fails = 0, judged = 0, vacuous = 0;
const say = s => console.log(s);
const ok = (id, c, m) => { judged++; say((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const vac = m => { vacuous++; say('§VACUOUS ' + m); };
const show = s => JSON.stringify(s === undefined ? '<missing>' : s);

// first differing line of two texts -> null when equal
function firstDiff(want, got) {
  if (want === got) return null;
  const a = want.split('\n'), b = got.split('\n'); let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return { line: i + 1, want: a[i], got: b[i] };
}
// first differing path of two JSON values -> null when deep-equal (key order is not compared; numbers by ===)
function jdiff(w, g, p) {
  p = p || '$';
  if (w === g) return null;
  if (typeof w === 'number' && typeof g === 'number') return (w === g || (Number.isNaN(w) && Number.isNaN(g))) ? null : { path: p, want: w, got: g };
  if (Array.isArray(w) && Array.isArray(g)) { if (w.length !== g.length) return { path: p + '.length', want: w.length, got: g.length }; for (let i = 0; i < w.length; i++) { const d = jdiff(w[i], g[i], p + '[' + i + ']'); if (d) return d; } return null; }
  if (w && g && typeof w === 'object' && typeof g === 'object' && !Array.isArray(w) && !Array.isArray(g)) {
    for (const k of Object.keys(w)) { if (!(k in g)) return { path: p + '.' + k, want: w[k], got: undefined }; const d = jdiff(w[k], g[k], p + '.' + k); if (d) return d; }
    for (const k of Object.keys(g)) if (!(k in w)) return { path: p + '.' + k, want: undefined, got: g[k] };
    return null;
  }
  return { path: p, want: w, got: g };
}
// a log line: the stage prints the absolute path it wrote; the in-memory port names the file. Everything before ' wrote ' (and after the file name) must still be equal.
const norm = l => l.replace(/ roof into \S*\/typed/, ' roof into typed').replace(/ wrote \S*?([^\/\s]+)(\s|$)/, ' wrote $1$2');
const STRICT = /^§(INFER|ROOMS?|FILL)\b/;
function cmpLogs(want, got) { // -> {n, bad:[{i,want,got}]}
  const bad = []; const n = Math.max(want.length, got.length);
  for (let i = 0; i < n; i++) if (want[i] !== got[i]) bad.push({ i: i + 1, want: want[i], got: got[i] });
  return { n, bad };
}

// ---- (0) the witness can say NO: an altered sheet must be caught, with its line and both texts
{
  const w = 'a\nb\n10\n-50.0\nz\n', g = 'a\nb\n10\n-50\nz\n'; const d = firstDiff(w, g);
  ok('SELFTEST-0 a one-character difference (-50.0 vs -50, the int/float trap) is reported with line and both texts', d && d.line === 4 && d.want === '-50.0' && d.got === '-50', JSON.stringify(d));
  ok('SELFTEST-0b deep-equal reports the first differing path', (jdiff({ a: [1, 2] }, { a: [1, 3] }) || {}).path === '$.a[1]');
}

// ---- (1) purity: no node-only API in the modules (they must load in a page)
for (const m of MODULES) {
  const f = path.join(R, m + '.js'); if (!fs.existsSync(f)) { vac('module missing: ' + f); continue; }
  const t = fs.readFileSync(f, 'utf8'); const bad = t.match(/require\(\s*['"](fs|child_process|path|os|vm|worker_threads|net|http|https|crypto)['"]\s*\)|\bprocess\.|\b__dirname\b|\bBuffer\b/g);
  ok('PURE ' + m + '.js: no fs/child_process/path/process/__dirname/Buffer', !bad, bad ? bad.join(',') : t.split('\n').length + ' lines');
}
if (vacuous) { say('§RESULT judged=' + judged + ' fails=' + fails + ' VACUOUS=' + vacuous); process.exit(2); }

const D = require(path.join(R, 'index.js'));
const TY = p => fs.readFileSync(path.join(R, 'types', p), 'utf8');
const INPUTS = { rosetta: TY('low_cost_house_rosetta.json'), template: TY('low_cost_single_storey_unit.json'), glyphs: TY('low_cost_house_tag_glyphs.json') };
const t0 = Date.now(); let browserDone = false;

for (const k of KEYS) {
  const dir = path.join(ORACLE, k);
  const need = ['model.json', 'inferred.json', 'rosetta.effective.json', 'template.effective.json'].concat(Object.values(LOGS)).map(f => path.join(dir, f)).concat(SHEETS.map(s => path.join(dir, 'typed', s)));
  const miss = need.filter(f => !fs.existsSync(f));
  if (!fs.existsSync(dir)) { vac(k + ': oracle dir missing: ' + dir); continue; }
  if (miss.length) { vac(k + ': oracle file(s) missing: ' + miss.map(f => path.relative(dir, f)).join(', ')); continue; }
  const model = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf8')); const pages = Object.keys(model.pages).length; const nPaths = Object.values(model.pages).reduce((s, p) => s + p.paths.length, 0);
  if (!pages || !nPaths) { vac(k + ': model has no pages/paths'); continue; }
  let out; const t1 = Date.now();
  try { out = D.run(model, INPUTS); } catch (e) { ok(k + ' run', false, 'threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e) + (e && e.log ? ' | log tail: ' + e.log.slice(-2).join(' / ') : '')); continue; }
  say('§RUN ' + k + ' model pages=' + pages + ' paths=' + nPaths + ' in ' + (Date.now() - t1) + ' ms');
  // (1) sheets, byte for byte
  for (const s of SHEETS) {
    const want = fs.readFileSync(path.join(dir, 'typed', s), 'utf8'); const got = out.sheets[s];
    if (!want.length) { vac(k + ' ' + s + ': oracle sheet is empty'); continue; }
    if (got === undefined) { ok(k + ' ' + s, false, 'sheet not produced'); continue; }
    const d = firstDiff(want, got);
    ok(k + ' ' + s, !d, d ? 'first difference at line ' + d.line + '  oracle: ' + show(d.want) + '  mine: ' + show(d.got) : 'byte-identical (' + want.length + ' bytes, ' + want.split('\n').length + ' lines)');
  }
  const extra = Object.keys(out.sheets).filter(s => SHEETS.indexOf(s) < 0); ok(k + ' sheets: exactly the 7', Object.keys(out.sheets).length === 7 && !extra.length, extra.length ? 'extra: ' + extra.join(',') : '');
  // (2) inferred
  const infO = JSON.parse(fs.readFileSync(path.join(dir, 'inferred.json'), 'utf8')); const infM = JSON.parse(JSON.stringify(require(path.join(R, 'py_rt.js')).plain(out.inferred)));
  let d = jdiff(infO.values, infM.values); ok(k + ' inferred.values deep-equal (' + Object.keys(infO.values).length + ' values)', !d && Object.keys(infO.values).length > 0, d ? JSON.stringify(d) : '');
  d = jdiff(infO, infM); ok(k + ' inferred (views, template, values) deep-equal', !d, d ? JSON.stringify(d) : '');
  // (3) effective dictionary and template
  const rosO = JSON.parse(fs.readFileSync(path.join(dir, 'rosetta.effective.json'), 'utf8')); const rosM = JSON.parse(JSON.stringify(require(path.join(R, 'py_rt.js')).plain(out.rosetta)));
  d = jdiff(rosO.rooms, rosM.rooms); ok(k + ' effective rooms deep-equal (' + rosO.rooms.length + ' rooms)', !d && rosO.rooms.length > 0, d ? JSON.stringify(d) : '');
  d = jdiff(rosO, rosM); ok(k + ' effective rosetta deep-equal', !d, d ? JSON.stringify(d) : '');
  const tplO = JSON.parse(fs.readFileSync(path.join(dir, 'template.effective.json'), 'utf8')); const tplM = JSON.parse(JSON.stringify(require(path.join(R, 'py_rt.js')).plain(out.template)));
  d = jdiff(tplO, tplM); ok(k + ' effective template deep-equal', !d, d ? JSON.stringify(d) : '');
  // (4) logs: the §INFER / §ROOM(S) / §FILL lines strictly, every other line reported on its own
  let strictN = 0, strictBad = 0;
  for (const st of Object.keys(LOGS)) {
    const want = fs.readFileSync(path.join(dir, LOGS[st]), 'utf8').split('\n').filter(x => x).map(norm), got = (out.logs[st] || []).map(norm);
    if (!want.length) { vac(k + ' ' + st + ': oracle log is empty'); continue; }
    const wS = want.filter(l => STRICT.test(l)), gS = got.filter(l => STRICT.test(l)); const c = cmpLogs(wS, gS); strictN += wS.length; strictBad += c.bad.length;
    if (c.bad.length) say('§FAIL ' + k + ' ' + st + ' strict line ' + c.bad[0].i + '  oracle: ' + show(c.bad[0].want) + '  mine: ' + show(c.bad[0].got));
    const a = cmpLogs(want, got);
    ok(k + ' log ' + st + ' all ' + want.length + ' lines equal (' + wS.length + ' strict §INFER/§ROOM/§FILL)', !a.bad.length, a.bad.length ? a.bad.length + ' differ, first at line ' + a.bad[0].i + '  oracle: ' + show(a.bad[0].want) + '  mine: ' + show(a.bad[0].got) : '');
  }
  ok(k + ' strict log lines §INFER/§ROOM/§FILL equal (' + strictN + ' judged)', strictN > 0 && strictBad === 0, strictN === 0 ? 'INCONCLUSIVE: no strict line judged' : '');
  // (5) the way a page loads it: UMD, only `self`, no require/module/process
  if (!browserDone) {
    browserDone = true;
    const ctx = { console }; ctx.self = ctx; vm.createContext(ctx); const names = ['py_rt', 'type_template', 'tag_reader', 'fill_blanks', 'infer_type', 'emit_dxf_p1', 'read_rooms', 'add_plan_marks', 'elev_emit', 'to_std', 'section_emit', 'roof_emit', 'index'];
    let loaded = true; try { for (const m of names) vm.runInContext(fs.readFileSync(path.join(R, m + '.js'), 'utf8'), ctx, { filename: m + '.js' }); } catch (e) { loaded = false; ok('BROWSER-UMD load without require/module', false, String(e && e.message)); }
    if (loaded) {
      const has = !!(ctx.Pdf2Dxf && typeof ctx.Pdf2Dxf.run === 'function'); ok('BROWSER-UMD window.Pdf2Dxf.run exists (self only)', has);
      if (has) { const b = ctx.Pdf2Dxf.run(model, INPUTS); const diffs = SHEETS.filter(s => b.sheets[s] !== out.sheets[s]); ok('BROWSER-UMD ' + k + ': all 7 sheets equal to the node run', diffs.length === 0 && Object.keys(b.sheets).length === 7, diffs.join(',')); }
    }
  }
}
say('§TIME ' + (Date.now() - t0) + ' ms for ' + KEYS.length + ' drawings');
if (vacuous) { say('§RESULT judged=' + judged + ' fails=' + fails + ' VACUOUS=' + vacuous + ' (INCONCLUSIVE: an oracle was missing)'); process.exit(2); }
if (!judged) { say('§RESULT judged=0 fails=0 INCONCLUSIVE'); process.exit(2); }
say('§RESULT judged=' + judged + ' fails=' + fails);
process.exit(fails ? 1 : 0);
