#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (W-VIEWER-ACTIONS)
// Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §19.1. Read the log after every run.
// SCOPE: one pure report — read the Viewer's own entry-point tables and write
//        internal/VIEWER_ACTIONS.md: every key and pill button a person can press, the
//        functions it calls, whether each has a definition, and a harm class by rule.
// WHY:   a CLI/connector verb list for the Viewer needs its denominator N from the code
//        (AD-LAYER law 2: "X of N"), never a hand list. §19.0 hand-counted 29 keys; there are 30.
// SOURCES (R1-R4): `_shortcuts` (viewer/scene.js) · direct branches of the scene.js keydown router
//        and of the other global listeners (DIRECT below) · `_actions` (viewer/panels.js).
//        Every keydown listener file under viewer/ and common/ is either SCANNED or in EXCLUDED
//        with a reason, so a new listener file cannot hide (R4).
// RULES: R5 class by the CLASS table only (cited per callee) · R6 PHANTOM callee, pill-key conflict ·
//        R7 counts recomputed each run · R8 output is a pure function of the tree.
// NON-INVENT: labels are the app's own strings (pill name/children, Help-palette label, the code
//        comment on the key's line). Comments are stripped by ONE tokenizer pass (strings, regex,
//        `//`, `/* */` in reading order) — NOT gen_app_surface.js's two-regex strip, which reads the
//        `/*` inside `// buildings/*.db` (viewer/tools.js:25) as a block comment (§19.1).
// Run: node scripts/gen_viewer_actions.js [--root DIR] [--out FILE] [--json]
'use strict';
const fs = require('fs'), path = require('path');

const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ROOT = path.resolve(opt('--root') || path.join(__dirname, '..'));
const OUT = opt('--out') || path.join(ROOT, 'internal/VIEWER_ACTIONS.md');
const JSON_OUT = argv.includes('--json');
const BREAK = process.env.VA_BREAK === '1';   // falsifier: drop the last _shortcuts key (must fail VA1)

// ── tokenizer: blank comments (keep length + newlines); optionally blank string/regex bodies ──
const REGEX_PREV = /[(,=:[!&|?{};+\-*%<>~^]$/;
const REGEX_KW = /(?:^|[^\w$])(?:return|typeof|case|in|of|delete|void|throw|new|else)$/;
function scan(src) {
  const code = src.split(''), mask = src.split('');
  const blank = (arr, a, b) => { for (let k = a; k < b; k++) if (arr[k] !== '\n') arr[k] = ' '; };
  let i = 0; const n = src.length; const tpl = []; let depth = 0;
  let lastSig = '';  // last significant code text (for regex detection)
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { let j = src.indexOf('\n', i); if (j < 0) j = n; blank(code, i, j); blank(mask, i, j); i = j; continue; }
    if (c === '/' && d === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; blank(code, i, j); blank(mask, i, j); i = j; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1; while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      blank(mask, i + 1, j); i = j + 1; lastSig = 'x'; continue;
    }
    if (c === '`' || (c === '}' && tpl.length && tpl[tpl.length - 1] === depth)) {
      if (c === '}') tpl.pop();
      let j = i + 1;
      while (j < n && src[j] !== '`') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '$' && src[j + 1] === '{') break; j++; }
      blank(mask, i + 1, j);
      if (src[j] === '$') { tpl.push(depth); i = j + 2; } else { i = j + 1; }
      lastSig = 'x'; continue;
    }
    if (c === '/') {
      const before = src.slice(Math.max(0, i - 12), i).replace(/\s+$/, '');
      if (before === '' || REGEX_PREV.test(before) || REGEX_KW.test(before)) {
        let j = i + 1, cls = false;
        while (j < n && src[j] !== '\n') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break; j++; }
        blank(mask, i + 1, j); i = j + 1; while (/[a-z]/.test(src[i] || '')) i++; lastSig = 'x'; continue;
      }
    }
    if (c === '{') depth++; else if (c === '}') depth--;
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }
  return { code: code.join(''), mask: mask.join('') };
}

const OPEN = { '(': ')', '[': ']', '{': '}' };
function match(mask, at) {   // index of the bracket closing the one at `at`
  const stack = [];
  for (let i = at; i < mask.length; i++) {
    const c = mask[i];
    if (OPEN[c]) stack.push(OPEN[c]);
    else if (c === ')' || c === ']' || c === '}') { if (stack.pop() !== c) return -1; if (!stack.length) return i; }
  }
  return -1;
}
function splitTop(mask, a, b) {   // [a,b) → segments split by commas at depth 0
  const out = []; let s = a, dep = 0;
  for (let i = a; i < b; i++) {
    const c = mask[i];
    if (OPEN[c]) dep++; else if (c === ')' || c === ']' || c === '}') dep--;
    else if (c === ',' && dep === 0) { out.push([s, i]); s = i + 1; }
  }
  if (mask.slice(s, b).trim()) out.push([s, b]);
  return out;
}
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

// ── callees at a handler's top level (nested function bodies are not followed) ──
const BUILTIN_ROOT = new Set(['console', 'document', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number',
  'Boolean', 'Date', 'Promise', 'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'setInterval', 'clearTimeout',
  'clearInterval', 'requestAnimationFrame', 'navigator', 'location', 'performance', 'THREE', 'e', 'err', 'ev',
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'async', 'await', 'Error', 'URLSearchParams']);
const WINDOW_BUILTIN = new Set(['matchMedia', 'addEventListener', 'removeEventListener', 'setTimeout',
  'requestAnimationFrame', 'getComputedStyle']);
const KEEP_BUILTIN = /\.(requestFullscreen|exitFullscreen)$/;   // a user-gesture call: kept, classed `leaves`
// DOM/Array methods on a local (`_dp.querySelector`, `_panels.splice`, `A._clashMatrixDiv.remove`) are not app actions
const DOM_METHOD = new Set(['remove', 'click', 'splice', 'push', 'querySelector', 'querySelectorAll', 'appendChild',
  'removeChild', 'setAttribute', 'getAttribute', 'forEach', 'focus', 'contains']);
function callees(src, code, mask, a, b) {
  const m = mask.slice(a, b).split('');
  // blank nested function bodies
  const fnRe = /\bfunction\b[^{]*\{|=>\s*\{/g; let f;
  const flat = m.join('');
  while ((f = fnRe.exec(flat))) {
    const open = a + f.index + f[0].length - 1, close = match(mask, open);
    if (close < 0) continue;
    for (let k = open + 1 - a; k < close - a; k++) if (m[k] !== '\n') m[k] = ' ';
    fnRe.lastIndex = close - a;
  }
  const body = m.join(''), cbody = code.slice(a, b);
  const out = [];
  const re = /(?<![\w$.])([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*\(/g; let r;
  while ((r = re.exec(body))) {
    let name = r[1].replace(/\s+/g, '');
    const root = name.split('.')[0];
    if (KEEP_BUILTIN.test(name)) { name = 'document.' + name.split('.').pop(); }
    else if (name.includes('.') && DOM_METHOD.has(name.split('.').pop())) continue;
    else if (BUILTIN_ROOT.has(root)) continue;
    else if (root === 'window') {
      const rest = name.slice(7);
      if (!rest) continue;
      if (WINDOW_BUILTIN.has(rest.split('.')[0])) continue;
      name = rest === 'open' ? 'window.open' : rest;
    }
    if (!out.includes(name)) out.push(name);
  }
  // delegation to another key: _shortcuts['c']()
  const dre = /_shortcuts\[\s*'([^']+)'\s*\]\s*\(/g; let dm;
  while ((dm = dre.exec(cbody))) { const t = '→key ' + dm[1]; if (!out.includes(t)) out.push(t); }
  return out;
}

// ── files ──
const SKIP = ['/lib/', '/node_modules/', '.min.', '/archive/', '/tests/', '/.git'];
function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP.some(s => p.includes(s))) continue;
    if (e.isDirectory()) walk(p, out); else if (/\.(js|html)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = [...walk(path.join(ROOT, 'viewer'), []), ...walk(path.join(ROOT, 'common'), [])].sort();
const rel = p => path.relative(ROOT, p);
const SRC = new Map();
for (const f of files) { const raw = fs.readFileSync(f, 'utf8'); SRC.set(rel(f), { raw, ...scan(raw) }); }

// ── R4: which keydown listener files are scanned, which excluded and why ──
const SCANNED = ['viewer/scene.js', 'viewer/panels.js', 'viewer/gi_still.js', 'viewer/precision_cam.js', 'common/history_bar.js'];
const EXCLUDED = {
  'common/comm/team_people_ui.js': 'Enter/Space on a person row inside the Team panel (panel-local)',
  'viewer/cinema_path_editor.js': 'keys while the Cinema Path Editor is open (mode-local, capture listener)',
  'viewer/cpe_walk.js': 'walk keys while a CPE walk is active (mode-local)',
  'viewer/doc_canvas.js': 'Escape deselects inside the document canvas (panel-local)',
  'viewer/fx_still_refine.js': 'Escape cancels a still in progress (mode-local lock)',
  'viewer/grid_drag.js': 'Ctrl+Z/Y only while the 2D grid drag is active (`st.active`), routed to UniversalHistory',
  'viewer/main.js': 'any key restarts the render loop (_startLoop); no action',
  'viewer/navigate_controls.js': 'Escape closes the Navigate panel (panel-local)',
  'viewer/navigate_engine.js': 'keys while corridor navigation is active (mode-local)',
  'viewer/nf_panel_search.js': 'Enter/Escape/arrows inside the Find input (panel-local)',
  'viewer/nlp.js': 'Enter/Escape/ArrowDown inside the typed-query input (panel-local)',
  'viewer/print_sheet.js': 'Escape closes the print overlay (panel-local)',
  'viewer/sfx.js': 'plays a tick for a pressed key; no action',
};
const LISTENER = /addEventListener\(\s*['"]keydown['"]|\.onkeydown\s*=/;
const listenerFiles = [...SRC.keys()].filter(k => LISTENER.test(SRC.get(k).code)).sort();
const unaccounted = listenerFiles.filter(k => !SCANNED.includes(k) && !EXCLUDED[k]);

// ── definitions index (A-namespace fields; globals: window.x =, function x(, var/let/const x =) ──
const defA = new Map(), defG = new Map(), ALIAS = new Map(), BODY = new Map();
const addDef = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
for (const [k, s] of SRC) {
  const lines = s.mask.split('\n');
  lines.forEach((ln, i) => {
    let r;
    const ra = /(?<![\w$.])(?:A|APP|app|window\.APP)\.([A-Za-z_$][\w$]*)\s*=(?![=>])/g;
    while ((r = ra.exec(ln))) addDef(defA, r[1], `${k}:${i + 1}`);
    // window.x = / UMD-style root.x = (whole_history.js `root.WholeHistory`, hba_lens.js `G.HBALens`)
    const rw = /(?<![\w$.])(?:window|root|G|global|globalThis|self)\.([A-Za-z_$][\w$]*)\s*=(?![=>])/g;
    while ((r = rw.exec(ln))) addDef(defG, r[1], `${k}:${i + 1}`);
    const ral = /(?<![\w$.])window\.([A-Za-z_$][\w$]*)\s*=\s*(?:A|APP)\.([A-Za-z_$][\w$]*)\s*;/g;
    while ((r = ral.exec(ln))) ALIAS.set(r[1], 'A.' + r[2]);   // main.js: window.toggleShadow = APP.toggleShadow
    const rf = /\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g;
    while ((r = rf.exec(ln))) addDef(defG, r[1], `${k}:${i + 1}`);
    const rv = /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/g;
    while ((r = rv.exec(ln))) addDef(defG, r[1], `${k}:${i + 1}`);
  });
}
// function bodies, for the one-level expansion used ONLY to decide whether a pill and a key do the
// same thing (R6/R7 join): `window.togglePrecisionFine = function(){ toggleFine(); … }` vs CapsLock → toggleFine().
for (const [k, s] of SRC) {
  const re = /(?<![\w$.])(?:(?:A|APP)\.([A-Za-z_$][\w$]*)|window\.([A-Za-z_$][\w$]*))\s*=\s*(?:async\s+)?function\b[^{]*\{|\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
  let r;
  while ((r = re.exec(s.mask))) {
    const name = r[1] ? 'A.' + r[1] : (r[2] || r[3]);
    const open = r.index + r[0].length - 1, close = match(s.mask, open);
    if (close < 0 || BODY.has(name)) continue;
    BODY.set(name, { k, a: open + 1, b: close });
  }
}
const canon = c => ALIAS.get(c) || c;
const expandOnce = c => { const b = BODY.get(canon(c)); if (!b) return []; const s = SRC.get(b.k); return callees(s.raw, s.code, s.mask, b.a, b.b).map(canon); };
const sameSet = calls => { const out = new Set(); for (const c of calls) { out.add(canon(c)); for (const x of expandOnce(c)) out.add(x); } return out; };
function defOf(callee, prefer) {
  if (callee.startsWith('→key ') || callee === 'window.open' || callee.startsWith('document.')) return 'builtin';
  callee = canon(callee);
  const parts = callee.split('.');
  const hits = (parts[0] === 'A' || parts[0] === 'APP') ? defA.get(parts[1]) : defG.get(parts[0]);
  if (!hits || !hits.length) return null;
  // same file first, then production .js over a POC/spike/probe page (window.S: history_tap.js, not comm_poc.html)
  const weak = h => /poc|spike|probe|demo|\.html:/i.test(h);
  return hits.find(h => h.startsWith(prefer + ':')) || hits.find(h => !weak(h)) || hits[0];
}

// ── R5: class by rule only. Each callee cites where its harm is stated. ──
const CLASS = [
  ['gpu', 'A.toggleStillRefineUI', 'Alt+S still: progressive TAA supersample (scene.js Alt+S comment); §19.0 item 4'],
  ['gpu', 'A.toggleStillRefine', 'Alt+S still fallback, same pass'],
  ['gpu', 'A.startMaxQualityOrbit', 'Alt+C MaxQ movie bake; §19.0 item 4'],
  ['gpu', 'A.startCinemaOrbit', 'Alt+C fallback, same bake'],
  ['gpu', 'A.toggleGIPreview', 'panels.js gi-preview: extra full-res GPU render targets'],
  ['gpu', 'A.toggleSSGIPreview', 'Alt+J SSGI spike, same GPU class as Alt+G'],
  ['gpu', 'giSupported', 'gi_still.js Alt+S: gates the WebGPU light-bounce pass rendered after the still (§GI_LIVE)'],
  ['writes', 'A.saveModelDb', 'writes a .db file (pill save: "Save the open building to a .db file")'],
  ['writes', 'LOD400.openPanel', 'welds + smooths the open building\'s geometry tables (pill lod400)'],
  ['writes', 'ScheduleInject.inject', 'generates a 4D programme into the open DB (pill sched4d, §S7-INJECT)'],
  ['writes', 'UniversalHistory.undo', 'steps the model\'s edit history back'],
  ['writes', 'UniversalHistory.redo', 'steps the model\'s edit history forward'],
  ['writes', '_doSceneUndo', 'legacy scene undo'],
  ['writes', '_doSceneRedo', 'legacy scene redo'],
  ['writes', 'undo', 'history_bar.js undo'],
  ['writes', 'redo', 'history_bar.js redo'],
  ['writes', '_worldHistDrawer', 'long-press = the bomb, clear history (pill worldhist comment)'],
  ['writes', 'A.screenshot', 'downloads a PNG to the user\'s disk (tools.js A.screenshot, link.download)'],
  ['leaves', 'A.openModelDb', 'native Open dialog, replaces the current scene (pill open)'],
  ['leaves', 'window.open', 'opens another page or tab'],
  ['leaves', 'A.export4D5D', 'opens boq_charts.html in a new tab (tools.js A.export4D5D, window.open)'],
  ['leaves', 'A.quickShare', 'native share sheet / clipboard (share.js A.quickShare)'],
  ['leaves', 'A.toggleFullscreen', 'needs a user gesture (tools.js §FULLSCREEN)'],
  ['leaves', 'document.requestFullscreen', 'needs a user gesture'],
  ['leaves', 'document.exitFullscreen', 'needs a user gesture'],
];
const RANK = { view: 0, leaves: 1, writes: 2, gpu: 3 };
const ruleOf = new Map(CLASS.map(([c, k, why]) => [k, { cls: c, why }]));

// ── rows ──
const rows = [];
const S = SRC.get('viewer/scene.js'), P = SRC.get('viewer/panels.js');
if (!S || !P) { console.error('§VIEWER_ACTIONS_FAIL missing viewer/scene.js or viewer/panels.js under ' + ROOT); process.exit(2); }

// Help-palette labels for keyboard-only entries: all.push({ seq: 'X', name: _hT('k', 'Label')
const PALETTE = new Map();
{ const re = /all\.push\(\{\s*seq:\s*(?:'([^']*)'|"([^"]*)")\s*,\s*name:\s*_hT\('[^']*',\s*'([^']*)'\)/g; let r;
  while ((r = re.exec(S.code))) PALETTE.set((r[1] !== undefined ? r[1] : r[2]).toLowerCase(), r[3]); }
const tailComment = (raw, line) => { const ln = raw.split('\n')[line - 1] || ''; const m = ln.match(/\/\/\s*(.+)$/); return m ? m[1].trim() : ''; };

// R1: _shortcuts
{
  const at = S.mask.indexOf('var _shortcuts = {');
  if (at < 0) { console.error('§VIEWER_ACTIONS_FAIL _shortcuts not found'); process.exit(2); }
  const open = S.mask.indexOf('{', at), close = match(S.mask, open);
  let segs = splitTop(S.mask, open + 1, close);
  if (BREAK) segs = segs.slice(0, -1);
  for (const [a, b] of segs) {
    const km = S.code.slice(a, b).match(/^\s*(['"])(.*?)\1\s*:/) || S.code.slice(a, b).match(/^\s*([A-Za-z_$][\w$]*)\s*:/);
    if (!km) continue;
    const key = km[2] !== undefined ? km[2] : km[1];
    const fo = S.mask.indexOf('{', a + km[0].length), fc = match(S.mask, fo);
    const line = lineOf(S.raw, a + km[0].search(/\S/));
    rows.push({ source: '_shortcuts', file: 'viewer/scene.js', line, lineEnd: lineOf(S.raw, fc), key, pill: '',
      paletteLabel: PALETTE.has(key.toLowerCase()), label: PALETTE.get(key.toLowerCase()) || tailComment(S.raw, line), calls: callees(S.raw, S.code, S.mask, fo + 1, fc) });
  }
}

// R3: direct branches — declared anchors, each resolved to a real line or the run fails (no invention)
const DIRECT = [
  ['viewer/scene.js', 'Alt+Z', /e\.altKey && \(e\.key === 'z'/],
  ['viewer/scene.js', 'Alt+S', /e\.altKey && \(e\.key === 's'/],
  ['viewer/scene.js', 'Alt+G', /e\.altKey && \(e\.key === 'g'/],
  ['viewer/scene.js', 'Alt+J', /e\.altKey && \(e\.key === 'j'/],
  ['viewer/scene.js', 'Alt+C', /e\.altKey && \(e\.key === 'c'/],
  ['viewer/scene.js', 'Alt+P', /e\.altKey && \(e\.key === 'p'/],
  ['viewer/scene.js', 'F1', /e\.key === 'F1'/],
  ['viewer/scene.js', 'F11', /e\.key === 'F11'/],
  ['viewer/scene.js', 'Ctrl+S', /\(e\.ctrlKey \|\| e\.metaKey\) && \(e\.key === 's'/],
  ['viewer/scene.js', 'Ctrl+O', /\(e\.ctrlKey \|\| e\.metaKey\) && \(e\.key === 'o'/],
  ['viewer/scene.js', 'Backspace', /noMod && notInput && e\.key === 'Backspace'/],
  ['viewer/scene.js', '\\', /noMod && notInput && e\.key === '\\\\'/],
  ['viewer/scene.js', 'Home', /noMod && notInput && e\.key === 'Home'/],
  ['viewer/scene.js', '?', /if \(e\.key === '\?'\)/],
  ['viewer/scene.js', 'Escape', /^\s*if \(e\.key === 'Escape'\) \{\s*$/m, 'router'],
  ['viewer/gi_still.js', 'Alt+S', /if \(!\(e\.altKey && \(e\.key === 's'/, 'listener'],   // the bounce pass after the app's own Alt+S
  ['viewer/gi_still.js', 'Alt+Shift+S', /e\.altKey && e\.shiftKey && \(e\.key === 'S'/],
  ['viewer/precision_cam.js', 'CapsLock', /e\.code === 'CapsLock'/],
  ['common/history_bar.js', 'Ctrl+Z', /if \(e\.ctrlKey && key === 'z' && !e\.shiftKey\)/],
  ['common/history_bar.js', 'Ctrl+Shift+Z / Ctrl+Y', /else if \(\(e\.ctrlKey && key === 'z' && e\.shiftKey\)/],
];
// Lines the witness's independent modifier scan will also hit, that are NOT app actions (panel navigation).
const IGNORED = [
  ['viewer/scene.js', /\(e\.ctrlKey && e\.key === ' '\)/, 'panel navigation: Ctrl+Space inside a focused panel'],
  ['viewer/scene.js', /\(e\.ctrlKey && e\.key === 'a'\)/, 'panel navigation: Ctrl+A select-all inside a focused panel'],
  ['viewer/panels.js', /if \(e\.ctrlKey && e\.key === 'a'\)/, 'list navigation (makeListKeyNav): Ctrl+A selects every row of a focused list'],
  ['viewer/panels.js', /if \(e\.ctrlKey && e\.key === ' '\)/, 'list navigation (makeListKeyNav): Ctrl+Space toggles one row of a focused list'],
];
const directMissing = [];
function resolveAnchor(file, re, which) {
  const s = SRC.get(file); if (!s) return -1;
  let idx;
  if (which === 'router') {   // the router's own universal Escape: the one after the router's '?' branch
    const q = s.code.search(/if \(e\.key === '\?'\)/); const sub = s.code.slice(q); const m = sub.search(re);
    idx = m < 0 ? -1 : q + m;
  } else idx = s.code.search(re);
  return idx;
}
for (const [file, key, re, which] of DIRECT) {
  const s = SRC.get(file); const idx = resolveAnchor(file, re, which);
  if (idx < 0) { directMissing.push(`${file} ${key}`); continue; }
  const ifAt = s.code.lastIndexOf('if', idx + 3) >= idx - 8 ? s.code.indexOf('if', idx - 8) : idx;
  const po = s.mask.indexOf('(', ifAt), pc = match(s.mask, po);
  let bo = pc + 1; while (/\s/.test(s.mask[bo])) bo++;
  let a, b;
  if (which === 'listener') {   // `if (!(key test)) return;` guard: the action is the rest of the enclosing listener
    const fo = s.mask.lastIndexOf('{', s.mask.lastIndexOf('function', idx)  >= 0 ? s.mask.indexOf('{', s.mask.lastIndexOf('function', idx)) : idx);
    a = idx; b = match(s.mask, fo);
  } else if (s.mask[bo] === '{') { a = bo + 1; b = match(s.mask, bo); }
  else { a = bo; b = s.mask.indexOf(';', bo) + 1; }   // single-statement branch: `if (c) toggleFine();`
  const line = lineOf(s.raw, idx);
  rows.push({ source: 'direct', file, line, lineEnd: lineOf(s.raw, b), key, pill: '',
    paletteLabel: PALETTE.has(key.toLowerCase()), label: PALETTE.get(key.toLowerCase()) || tailComment(s.raw, line) || '', calls: callees(s.raw, s.code, s.mask, a, b) });
}
const ignored = [];
for (const [file, re, why] of IGNORED) { const s = SRC.get(file); const i = s ? s.code.search(re) : -1; if (i >= 0) ignored.push({ file, line: lineOf(s.raw, i), why }); }

// R2: _actions
{
  const at = P.mask.indexOf('var _actions = [');
  if (at < 0) { console.error('§VIEWER_ACTIONS_FAIL _actions not found'); process.exit(2); }
  const open = P.mask.indexOf('[', at), close = match(P.mask, open);
  for (const [a, b] of splitTop(P.mask, open + 1, close)) {
    const oo = P.mask.indexOf('{', a); if (oo < 0 || oo >= b) continue;
    const oc = match(P.mask, oo);
    const props = {};
    for (const [pa, pb] of splitTop(P.mask, oo + 1, oc)) {
      const m = P.mask.slice(pa, pb).match(/^\s*([A-Za-z_$][\w$]*)\s*:/); if (!m) continue;
      props[m[1]] = [pa + m[0].length, pb];
    }
    const str = k => { if (!props[k]) return null; const t = P.code.slice(props[k][0], props[k][1]).trim(); const m = t.match(/^(['"])(.*)\1$/); return m ? m[2] : (t === 'null' ? null : t); };
    const id = str('id'); if (!id) continue;
    const line = lineOf(P.raw, oo);
    const kids = []; if (props.children) { const re = /name:\s*'((?:[^'\\]|\\.)*)'/g; let r; const t = P.code.slice(props.children[0], props.children[1]); while ((r = re.exec(t))) kids.push(r[1].replace(/\\'/g, "'")); }
    const when = [str('platform') && str('platform') !== 'null' ? str('platform') + ' only' : '', str('civilOnly') === 'true' ? 'civil model only' : ''].filter(Boolean).join(', ');
    const fnCalls = k => { if (!props[k]) return null; const fo = P.mask.indexOf('{', props[k][0]); if (fo < 0 || fo > props[k][1]) return []; return callees(P.raw, P.code, P.mask, fo + 1, match(P.mask, fo)); };
    const label = (str('name') || id) + (kids.length ? ' — ' + kids.join(' · ') : '');
    rows.push({ source: '_actions', file: 'viewer/panels.js', line, lineEnd: lineOf(P.raw, oc), key: str('key') || '', pill: id, when, label, calls: fnCalls('fn') || [] });
    if (props.hold) rows.push({ source: '_actions', file: 'viewer/panels.js', line: lineOf(P.raw, props.hold[0]), lineEnd: lineOf(P.raw, props.hold[1]), key: '', pill: id + ' (long-press)', when, label: (str('name') || id) + ' — long-press', calls: fnCalls('hold') || [] });
  }
}

// ── resolve defs, class, delegation ──
const normKey = k => k.replace(/\s+/g, '').toLowerCase();
const keyRows = rows.filter(r => r.source !== '_actions');
for (const r of rows) {
  r.defs = r.calls.map(c => ({ c, at: defOf(c, r.file) }));
  let cls = 'view', basis = [];
  const follow = c => {
    if (c.startsWith('→key ')) {
      const t = keyRows.find(k => k.source === '_shortcuts' && k.key === c.slice(5));
      return t ? t.calls.filter(x => !x.startsWith('→key ')) : [];
    }
    return [c];
  };
  for (const c of r.calls.flatMap(follow)) {
    const rule = ruleOf.get(c) || ruleOf.get(canon(c));
    if (rule) { basis.push(`${c}: ${rule.why}`); if (RANK[rule.cls] > RANK[cls]) cls = rule.cls; }
  }
  r.cls = cls; r.basis = basis.length ? basis.join('; ') : 'no gpu/writes/leaves callee found';
  r.verb = '';   // X: filled when a Viewer verb is added for this row (§19.0 step 3)
}
const phantoms = rows.flatMap(r => r.defs.filter(d => d.at === null).map(d => ({ row: r, callee: d.c })));
const usedRules = new Set(rows.flatMap(r => r.calls.flatMap(c => [c, canon(c)])));
const unusedRules = CLASS.map(c => c[1]).filter(k => !usedRules.has(k));

// R6: a pill's key bound to nothing, or to a handler sharing no callee with the pill
const conflicts = [];
for (const r of rows.filter(x => x.source === '_actions' && x.key)) {
  const bound = keyRows.filter(k => normKey(k.key) === normKey(r.key) || (k.key.length === 1 && r.key.length === 1 && k.key.toLowerCase() === r.key.toLowerCase()));
  if (!bound.length) { conflicts.push({ pill: r.pill, key: r.key, kind: 'UNBOUND', note: 'no keydown table binds this key' }); r.action = r.pill; continue; }
  const pillSet = sameSet(r.calls);
  const delegated = r.calls.filter(c => c.startsWith('→key ')).map(c => c.slice(5));
  const same = bound.filter(k => delegated.includes(k.key) || [...sameSet(k.calls)].some(c => pillSet.has(c)));
  if (!same.length) conflicts.push({ pill: r.pill, key: r.key, kind: 'DIFFERENT', note: 'key fires ' + bound.map(k => `${k.source} ${k.key} → ${k.calls.join(', ') || '(no call)'}`).join(' | ') });
  r.action = r.pill;
  for (const k of same) k.action = k.action || r.pill;
}
for (const r of rows) if (!r.action) r.action = r.source === '_actions' ? r.pill : 'key ' + r.key;
// label order for a key row: Help-palette label → the joined pill's name → the comment on the key's line
for (const r of rows.filter(x => x.source !== '_actions')) {
  if (r.paletteLabel) continue;
  const pill = rows.find(p => p.source === '_actions' && p.pill === r.action);
  if (pill) r.label = pill.label.split(' — ')[0] + ' *(pill ' + pill.pill + ')*';
}
const actions = new Set(rows.map(r => r.action));
const X = rows.filter(r => r.verb).length;
const by = s => rows.filter(r => r.source === s).length;

const summary = `§VIEWER_ACTIONS N_entry=${rows.length} N_actions=${actions.size} X=${X} shortcuts=${by('_shortcuts')} direct=${by('direct')} pills=${by('_actions')} phantom=${phantoms.length} conflicts=${conflicts.length} listeners=${listenerFiles.length} unaccounted=${unaccounted.length} direct_missing=${directMissing.length}`;

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ rows, phantoms: phantoms.map(p => ({ key: p.row.key, pill: p.row.pill, callee: p.callee })), conflicts, listenerFiles, scanned: SCANNED, excluded: EXCLUDED, unaccounted, directMissing, ignored, unusedRules, actions: actions.size, summary }, null, 1));
  process.exit(0);
}

// ── markdown ──
const esc = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const md = s => '`' + String(s).replace(/`/g, "'") + '`';
const L = [];
L.push('# Viewer actions — generated inventory', '');
L.push('> **Generated. Do not hand-edit.** `node scripts/gen_viewer_actions.js`');
L.push('> Spec: bim-compiler `prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md` §19.1 (W-VIEWER-ACTIONS). Witness: `tests/witness_viewer_actions.js`.', '');
L.push('Every key and pill button a person can press in the Viewer, from the app\'s own tables, the functions each calls, and a harm class by rule. The denominator for "X of N Viewer actions are offered as verbs" (§19.0). A **view** row means no gpu/writes/leaves callee was found at the handler\'s top level; it never means safe.', '');
L.push('| | |', '|---|---:|');
L.push(`| entry points (N_entry) | ${rows.length} |`);
L.push(`| — \`_shortcuts\` keys (viewer/scene.js) | ${by('_shortcuts')} |`);
L.push(`| — direct keydown branches | ${by('direct')} |`);
L.push(`| — pill entries incl. long-press (viewer/panels.js \`_actions\`) | ${by('_actions')} |`);
L.push(`| distinct actions (N_actions) | ${actions.size} |`);
L.push(`| offered as verbs (X) | ${X} |`);
for (const c of ['view', 'leaves', 'writes', 'gpu']) L.push(`| class ${c} | ${rows.filter(r => r.cls === c).length} |`);
L.push(`| callees with no definition (PHANTOM) | ${phantoms.length} |`);
L.push(`| pill key conflicts | ${conflicts.length} |`);
L.push(`| keydown listener files (scanned ${SCANNED.filter(f => listenerFiles.includes(f)).length}, excluded ${Object.keys(EXCLUDED).filter(f => listenerFiles.includes(f)).length}, unaccounted ${unaccounted.length}) | ${listenerFiles.length} |`);
L.push('');
L.push('**Rules:** a key row joins a pill\'s action when the pill shows that key and they share a callee, or the pill delegates to that key; otherwise it is its own action. Class = the highest of its callees in the CLASS table of the generator (gpu > writes > leaves > view), each callee cited there. Out of N: keys inside a focused panel (Tab, Space, PageUp/Down, Enter, typeahead) and the listeners excluded below.', '');
if (conflicts.length) {
  L.push('## Pill key conflicts', '', 'The pill shows a key that fires nothing, or fires a different action.', '');
  L.push('| pill | key shown | kind | what the key does |', '|---|---|---|---|');
  for (const c of conflicts) L.push(`| ${md(c.pill)} | ${md(c.key)} | **${c.kind}** | ${esc(c.note)} |`);
  L.push('');
}
if (phantoms.length) {
  L.push('## Phantom callees', '', 'Called by an entry point, defined nowhere in viewer/ or common/ (production files). The guard makes the press a no-op.', '');
  L.push('| entry | callee |', '|---|---|');
  for (const p of phantoms) L.push(`| ${esc(p.row.source)} ${md(p.row.key || p.row.pill)} | ${md(p.callee)} |`);
  L.push('');
}
L.push('## Entry points', '');
L.push('| # | source | key | pill | label (the app\'s own words) | calls → defined at | class | basis |', '|---:|---|---|---|---|---|---|---|');
rows.forEach((r, i) => {
  const calls = r.defs.map(d => md(d.c) + (d.at === 'builtin' ? '' : d.at ? ' ' + md(d.at) : ' **PHANTOM**')).join('<br>') || '—';
  L.push(`| ${i + 1} | ${md(r.file + ':' + r.line)} | ${r.key ? md(r.key) : ''} | ${r.pill ? md(r.pill) : ''}${r.when ? ' *(' + r.when + ')*' : ''} | ${esc(r.label)} | ${calls} | ${r.cls} | ${esc(r.basis)} |`);
});
L.push('');
L.push('## Keydown listener files (R4)', '');
L.push('| file | treatment |', '|---|---|');
for (const f of listenerFiles) L.push(`| ${md(f)} | ${SCANNED.includes(f) ? 'scanned' : EXCLUDED[f] ? 'excluded: ' + esc(EXCLUDED[f]) : '**UNACCOUNTED**'} |`);
L.push('');
if (ignored.length) {
  L.push('Ignored modifier lines inside a scanned file (panel navigation, not app actions):', '');
  for (const g of ignored) L.push(`- ${md(g.file + ':' + g.line)} ${esc(g.why)}`);
  L.push('');
}
if (unusedRules.length) { L.push('CLASS rules that match no callee (stale rule): ' + unusedRules.map(md).join(', '), ''); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, L.join('\n') + '\n');
console.log(summary);
for (const c of conflicts) console.log(`§VIEWER_ACTIONS_CONFLICT pill=${c.pill} key=${c.key} kind=${c.kind}`);
for (const p of phantoms) console.log(`§VIEWER_ACTIONS_PHANTOM entry=${p.row.key || p.row.pill} callee=${p.callee}`);
for (const u of unaccounted) console.log(`§VIEWER_ACTIONS_UNACCOUNTED listener=${u}`);
for (const d of directMissing) console.log(`§VIEWER_ACTIONS_DIRECT_MISSING ${d}`);
for (const u of unusedRules) console.log(`§VIEWER_ACTIONS_RULE_UNUSED ${u}`);
if (unaccounted.length || directMissing.length) process.exit(1);
