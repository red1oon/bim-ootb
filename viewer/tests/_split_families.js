// _split_families.js — one owner for "which files make up a split module, in load order" (W-SPLIT-SURFACE and every
// test that reads a split module's source). bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md §LANES_RULING.
// Edit together with the loader (viewer.html <script> tags or main.js modules[]) and sw.js.
'use strict';
const fs = require('fs'), path = require('path');
const V = path.join(__dirname, '..');
const FAMILIES = {
  cpe_load_path: {
    shell: 'cpe_load_path.js', shared: 'LPS',
    files: ['lp_chain.js', 'lp_geom_pick.js', 'lp_build.js', 'lp_backdrop_diag.js', 'lp_apply_restore.js', 'lp_hud.js', 'cpe_load_path.js'],
    loader: { kind: 'html', file: 'viewer.html' },
    runtime: (win) => { if (typeof win.setupCpeLoadPath === 'function') win.setupCpeLoadPath(win.APP); },
  },
  effects: {
    shell: 'effects.js', shared: 'FXS',
    files: ['fx_composer.js', 'fx_props_staffage.js', 'fx_sun_shadow.js', 'fx_photo_staging.js', 'fx_still_refine.js', 'fx_cpe_reveal_bands.js', 'fx_cinema_path_plan.js', 'fx_cinema_orbit.js', 'effects.js'],
    loader: { kind: 'html', file: 'viewer.html' },
    runtime: (win) => (typeof win.setupEffects === 'function' ? win.setupEffects(win.APP, {}, {}, {}) : undefined),   // async
    // mobile: setupEffects' early `return` (§EFFECTS_SKIP) must still stop the WHOLE setup after the split
    scenarios: { mobile: (win) => { win.navigator = { maxTouchPoints: 5 }; win.screen = { width: 800 }; }, __keys: ['navigator', 'screen'] },
  },
  cinema_maxq: {
    shell: 'cinema_maxq.js', shared: 'MQS',
    files: ['maxq_buildup_ghost.js', 'maxq_infra.js', 'maxq_hud_layers.js', 'maxq_capture_stitch.js', 'maxq_start.js', 'cinema_maxq.js'],
    loader: { kind: 'html', file: 'viewer.html' },
    runtime: () => {},                                      // IIFE: everything it defines happens at load
  },
  navigate_find: {
    shell: 'navigate_find.js', shared: 'NF',
    files: ['nf_ui_history.js', 'nf_tree_lens.js', 'nf_highlight_cost.js', 'nf_room.js', 'nf_trees.js', 'nf_isolate_drill.js', 'nf_panel_search.js', 'navigate_find.js'],
    loader: { kind: 'modules', file: 'main.js' },          // lazy: main.js APP.loadNavigate() modules[] (sequential)
    // what to call after loading so the census sees what setup defines
    runtime: (win) => { if (win.NavigateFind && typeof win.NavigateFind.init === 'function') win.NavigateFind.init(win.APP, {}, function () { return null; }); },
  },
};
// readUnsplit — the ORIGINAL single-file text, rebuilt from the shell + parts: the driver between the <split-driver>
// markers is replaced by each part's statements after its `yield`, with the shared-object prefix removed (the only edit
// split_closure.js makes; scripts/split_verify.js proves that). For readers that slice functions out of the source and
// evaluate them with the original free names. Falls back to the plain file when the module is not split.
function readUnsplit(name, dir) {
  const f = FAMILIES[name], D = dir || V, shellSrc = fs.readFileSync(path.join(D, f.shell), 'utf8');
  const a = shellSrc.indexOf('// <split-driver>'), b = shellSrc.indexOf('// </split-driver>');
  if (a < 0 || b < 0) return shellSrc;
  const SH = f.shared, body = f.files.filter((x) => x !== f.shell).map((x) => {
    const t = fs.readFileSync(path.join(D, x), 'utf8'), y = t.indexOf('\n', t.indexOf('  yield;'));
    return t.slice(y + 1, t.lastIndexOf('\n};'));
  }).join('').replace(/return \{ __splitReturn: true(?:, value: ([\s\S]*?))? \};/g, (m, x) => x ? 'return ' + x + ';' : 'return;')   // early-exit marker
    .replace(new RegExp('\\b' + SH + '\\.', 'g'), '');   // a shorthand {x} comes back as {x: x}: same meaning
  const lineStart = shellSrc.lastIndexOf('\n', a) + 1, lineEnd = shellSrc.indexOf('\n', b) + 1;
  return shellSrc.slice(0, lineStart) + body + '\n' + shellSrc.slice(lineEnd);
}
// readSource(p, enc) — drop-in for fs.readFileSync in tests that read a module's source: a split module's shell comes
// back as readUnsplit() (the original text); every other file is passed straight through, unchanged.
function readSource(p, enc) {
  const base = path.basename(String(p));
  const fam = Object.keys(FAMILIES).find((k) => (FAMILIES[k].shell || FAMILIES[k].files[FAMILIES[k].files.length - 1]) === base);
  if (fam) { const raw = fs.readFileSync(p, 'utf8'); if (raw.indexOf('// <split-driver>') >= 0) { const u = readUnsplit(fam, path.dirname(String(p))); return enc ? u : Buffer.from(u); } }
  return fs.readFileSync(p, enc);
}
function readFamily(name, dir) { const f = FAMILIES[name]; return f.files.map((x) => fs.readFileSync(path.join(dir || V, x), 'utf8')).join('\n'); }
module.exports = { FAMILIES, readFamily, readUnsplit, readSource };
