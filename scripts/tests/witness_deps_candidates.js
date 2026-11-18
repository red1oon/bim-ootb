#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-DEPS-CAND (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part B, "B1 BUILD SPEC" §3; bim-ootb #3244).
// Read the log after every run: exit code is not evidence. Verdict line: §DEPS_W … verdict=PASS|FAIL|INCONCLUSIVE.
// ISSUE THIS PROVES OR DISPROVES: "scripts/gen_deps_candidates.js cannot tell, from the code alone, which module must load before which
//   (load), which only needs the other by call time (call), and which reads are guarded" — the owner confirms the order edges it lists
//   by file:line (B1-Q3), so a wrong class or a wrong line would put a false dependency in front of him.
// INDEPENDENT SOURCE (never the tool's own output): the fixture scripts are RUN in a Node vm, in both orders:
//   reader first throws                              -> load          (order is forced)
//   reader first does not throw, but sees less       -> load-guarded  (order changes behaviour silently)
//   loading in any order is the same; R's function called before P throws -> call; returns a fallback -> call-guarded
//   nothing differs                                  -> no edge
//   The tool must print exactly that class for every case, and name the right publisher when two modules share a namespace.
// REAL APP (modeller): parse_fail=0; every `at=file:line` the tool cites really holds one of the names it lists on that line (a text
//   read of the file, so the owner's file:line list is checkable); two runs give the same sha; the tree is unchanged after the run.
// RED CONTROL (must be DETECTED): case BLIND reads a namespace through a local alias of window (`var W = window; W.PubZ.v`). The vm
//   says load; the tool cannot see it (a known blind spot, spec §3). The witness must report that row as a disagreement, which proves
//   the comparison can fail. It is counted as red, not as a case.
// INCONCLUSIVE: 0 fixture cases judged, the vm throws outside a reader, the real app read 0 modules or failed to parse one, or the
//   red control was not detected.
// Command: node scripts/tests/witness_deps_candidates.js   (~10 s)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..'), say = s => process.stdout.write(s + '\n');
const D = require(path.join(ROOT, 'scripts', 'gen_deps_candidates.js'));

// ---- fixture cases: { id, pubs: {name: src}, reader: src, probe?: global the reader sets, call?: function the reader exposes }
const CASES = [
  { id: 'TOP', pubs: { 'p_top.js': 'window.PubA = { v: 1 };' }, reader: 'var a1 = PubA.v;', want: 'load' },
  { id: 'WINDOT', pubs: { 'p_win.js': 'window.PubB = { v: 1 };' }, reader: 'var b1 = window.PubB.v;', want: 'load' },
  { id: 'IIFE', pubs: { 'p_iife.js': 'var PubC = { v: 1 };' }, reader: '(function () { var c1 = PubC.v; })();', want: 'load' },
  { id: 'UMD', pubs: { 'p_umd.js': 'window.PubD = { v: 1 };' }, reader: '(function (root, f) { root.RU = f(); })(this, function () { return PubD.v; });', want: 'load' },
  { id: 'ALIAS', pubs: { 'p_alias.js': 'window.PubE = { v: 1 };' }, reader: '(function (w) { w.RX = w.PubE.v; })(window);', want: 'load' },
  { id: 'ASSIGN', pubs: { 'p_assign.js': 'Object.assign(window, { PubM: { v: 1 } });' }, reader: 'var m1 = PubM.v;', want: 'load' },
  { id: 'TYPEOF', pubs: { 'p_typeof.js': 'window.PubF = { v: 1 };' }, reader: "window.__seen_F = typeof PubF !== 'undefined';", probe: '__seen_F', want: 'load-guarded' },
  { id: 'AND', pubs: { 'p_and.js': 'window.PubG = { v: 1 };' }, reader: 'window.__seen_G = !!(window.PubG && window.PubG.v);', probe: '__seen_G', want: 'load-guarded' },
  { id: 'IFBRANCH', pubs: { 'p_if.js': 'window.PubH = { v: 1 };' }, reader: 'window.__seen_H = 0; if (window.PubH) { window.__seen_H = PubH.v; }', probe: '__seen_H', want: 'load-guarded' },
  { id: 'OPTCHAIN', pubs: { 'p_opt.js': 'window.PubK = { v: 1 };' }, reader: 'window.__seen_K = window.PubK?.v === 1;', probe: '__seen_K', want: 'load-guarded' },
  { id: 'TRY', pubs: { 'p_try.js': 'window.PubL = { v: 1 };' }, reader: 'try { window.__seen_L = PubL.v; } catch (e) { window.__seen_L = 0; }', probe: '__seen_L', want: 'load-guarded' },
  { id: 'EARLYRET', pubs: { 'p_early.js': 'window.PubO = { v: 1 };' }, reader: "window.__seen_O = 0; (function () { if (!window.PubO) { return; } var o1 = window.PubO; window.__seen_O = o1.v; })();", probe: '__seen_O', want: 'load-guarded' },
  { id: 'CALL', pubs: { 'p_call.js': 'window.PubI = { v: 1 };' }, reader: 'window.R_I = function () { return PubI.v; };', call: 'R_I', want: 'call', readerFirstOnPage: true },
  { id: 'CALLG', pubs: { 'p_callg.js': 'window.PubJ = { v: 1 };' }, reader: "window.R_J = function () { return typeof PubJ !== 'undefined' ? PubJ.v : 0; };", call: 'R_J', want: 'call-guarded' },
  { id: 'MEMBER', pubs: { 'p_ns1.js': 'window.NS = window.NS || {}; NS.a = { v: 1 };', 'p_ns2.js': 'window.NS = window.NS || {}; NS.b = { v: 2 };' },
    reader: 'window.NS = window.NS || {}; var n1 = NS.b.v;', want: 'load', wantTo: 'p_ns2.js', loadFirst: ['p_ns1.js'] },
  { id: 'NONE', pubs: { 'p_none.js': 'window.PubN = { v: 1 };' }, reader: "var s1 = 'PubN'; function f1(PubN) { return PubN; } window.__seen_N = f1(2);", probe: '__seen_N', want: null },
];
const RED = { id: 'BLIND', pubs: { 'p_blind.js': 'window.PubZ = { v: 1 };' }, reader: 'var W = window; var z1 = W.PubZ.v;', want: 'load' };

// ---- the vm oracle
function runOrder(c, files, srcOf) {
  const ctx = vm.createContext({}); ctx.window = ctx; ctx.self = ctx;
  let threwAt = null;
  for (const f of files) { try { vm.runInContext(srcOf(f), ctx, { filename: f }); } catch (e) { if (f === 'r_' + c.id.toLowerCase() + '.js') { threwAt = f; break; } throw e; } }
  return { ctx, threwAt };
}
function oracle(c) {
  const R = 'r_' + c.id.toLowerCase() + '.js', pubs = Object.keys(c.pubs), pre = c.loadFirst || [];
  const target = pubs.filter(p => !pre.includes(p));
  const srcOf = f => f === R ? c.reader : c.pubs[f];
  const fwd = runOrder(c, [...pre, ...target, R], srcOf), rev = runOrder(c, [...pre, R, ...target], srcOf);
  if (fwd.threwAt) throw new Error(c.id + ': reader throws even after its publisher');
  if (rev.threwAt) return 'load';
  if (c.probe && JSON.stringify(fwd.ctx[c.probe]) !== JSON.stringify(rev.ctx[c.probe])) return 'load-guarded';
  if (c.call) {
    const solo = runOrder(c, [...pre, R], srcOf);
    let threw = false, got; try { got = solo.ctx[c.call](); } catch (e) { threw = true; }
    if (threw) return 'call';
    if (JSON.stringify(got) !== JSON.stringify(fwd.ctx[c.call]())) return 'call-guarded';
  }
  return null;
}

// ---- the fixture app, as a tiny git tree the tool reads exactly like a real one
function fixtureTree(cases) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w-deps-')), app = path.join(dir, 'fx');
  fs.mkdirSync(app);
  const tags = [], pre = [];
  for (const c of cases) { for (const [f, s] of Object.entries(c.pubs)) { fs.writeFileSync(path.join(app, f), s + '\n'); } fs.writeFileSync(path.join(app, 'r_' + c.id.toLowerCase() + '.js'), c.reader + '\n'); }
  for (const c of cases) { const R = 'r_' + c.id.toLowerCase() + '.js', P = Object.keys(c.pubs); (c.readerFirstOnPage ? [R, ...P] : [...P, R]).forEach(f => { tags.push(`<script src="${f}?v=1"></script>`); pre.push(`'${f}'`); }); }
  fs.writeFileSync(path.join(app, 'index.html'), '<!doctype html>\n<html><head>\n' + tags.join('\n') + '\n</head><body></body></html>\n');
  fs.writeFileSync(path.join(app, 'sw.js'), "const CACHE_VERSION = 'v1';\nconst PRECACHE_ASSETS = [\n  " + pre.join(',\n  ') + '\n];\n');
  cp.execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'init', '-q'], { cwd: dir });
  cp.execFileSync('git', ['add', '.'], { cwd: dir });
  return dir;
}
function judge(cases) {
  const dir = fixtureTree(cases), r = D.candidates(dir, 'fx'), rows = [];
  for (const c of cases) {
    const from = 'fx/r_' + c.id.toLowerCase() + '.js', mine = r.edges.filter(e => e.from === from);
    const want = oracle(c), wantTo = 'fx/' + (c.wantTo || Object.keys(c.pubs)[0]);
    const got = mine.find(e => e.to === wantTo), wrongTo = mine.filter(e => e.to !== wantTo);
    const ok = want == null ? mine.length === 0 : (!!got && got.cls === want && !wrongTo.length);
    rows.push({ id: c.id, ok, want, got: got ? got.cls : (mine.length ? mine.map(e => e.to + ':' + e.cls).join(',') : 'none'), spec: c.want, order: got ? got.order : '-' });
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return { rows, r };
}

const inconclusive = [];
let fx;
try { fx = judge(CASES); } catch (e) { inconclusive.push('fixture run: ' + e.message); fx = { rows: [], r: { fails: [] } }; }
for (const w of fx.rows) say(`  §DEPS_W_CASE id=${w.id} vm=${w.want || 'none'} tool=${w.got} spec_expects=${w.spec || 'none'} order=${w.order} ok=${w.ok ? 'Y' : 'N'}`);
const specAgree = fx.rows.filter(w => (w.want || null) === (w.spec || null)).length;   // the case table itself is checked by the vm, too
const againstSeen = fx.rows.some(w => w.id === 'CALL' && w.order === 'AGAINST');
let red;
try { red = judge([RED]).rows[0]; } catch (e) { inconclusive.push('red run: ' + e.message); red = { ok: true }; }
say(`  §DEPS_W_RED id=BLIND vm=${red.want} tool=${red.got} detected=${red.ok ? 'N' : 'Y'} (a local alias of window is the tool's known blind spot; the witness must catch it)`);
if (red.ok) inconclusive.push('red control BLIND not detected');

// ---- the real app
const before = cp.execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
const a = D.candidates(ROOT, 'modeller'), b = D.candidates(ROOT, 'modeller');
const after = cp.execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
a.fails.forEach(f => say('  §DEPS_W_FAIL ' + f));
if (a.fails.length) inconclusive.push('real app parse failure');
if (!a.summary.read) inconclusive.push('real app read 0 modules');
const cache = new Map(), lineOf = (file, n) => { if (!cache.has(file)) cache.set(file, fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')); return cache.get(file)[n - 1] || ''; };
let citedOk = 0; const citedBad = [];
for (const e of a.edges) {
  const [file, ln] = [e.at.slice(0, e.at.lastIndexOf(':')), +e.at.slice(e.at.lastIndexOf(':') + 1)], text = lineOf(file, ln);
  const keys = e.cls === 'import' ? [path.posix.basename(e.to)] : e.names.map(n => n.split('.').pop());
  if (keys.some(k => text.includes(k))) citedOk++; else citedBad.push(e.from + '->' + e.to + ' at ' + e.at);
}
citedBad.slice(0, 10).forEach(x => say('  §DEPS_W_CITE_MISS ' + x));
const s = a.summary;
say(`  §DEPS_W_REAL app=modeller modules=${s.modules} read=${s.read} inline_bodies=${s.inline_bodies} parse_fail=${s.parse_fail} candidates=${s.candidates} forces_order=${s.forces_order} against_load_unguarded=${s.against_load_unguarded} ambiguous=${s.ambiguous} at_cited=${citedOk}/${a.edges.length} same_sha=${a.summary.sha === b.summary.sha ? 'Y' : 'N'} tree_unchanged=${before === after ? 'Y' : 'N'}`);

const judged = fx.rows.length, agree = fx.rows.filter(w => w.ok).length;
if (!judged) inconclusive.push('0 fixture cases');
const pass = judged && agree === judged && specAgree === judged && againstSeen && citedOk === a.edges.length && a.edges.length > 0 && s.sha === b.summary.sha && before === after;
const verdict = inconclusive.length ? 'INCONCLUSIVE' : (pass ? 'PASS' : 'FAIL');
inconclusive.forEach(x => say('  §DEPS_W_INCONCLUSIVE ' + x));
say(`§DEPS_W cases=${judged} agree=${agree}/${judged} case_table_matches_vm=${specAgree}/${judged} against_seen=${againstSeen ? 'Y' : 'N'} red=${red.ok ? 0 : 1}/1 real_candidates=${a.edges.length} at_cited=${citedOk}/${a.edges.length} deterministic=${s.sha === b.summary.sha ? 'Y' : 'N'} wrote=${before === after ? 0 : 1} verdict=${verdict}`);
process.exit(verdict === 'PASS' ? 0 : 1);
