// _split_families.js — one owner for "which files make up a split module, in load order" (W-SPLIT-SURFACE and every
// test that reads a split module's source). bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md §LANES_RULING.
// Edit together with the loader (viewer.html <script> tags or main.js modules[]) and sw.js.
'use strict';
const fs = require('fs'), path = require('path');
const V = path.join(__dirname, '..');
const FAMILIES = {
  navigate_find: {
    files: ['navigate_find.js'],
    loader: { kind: 'modules', file: 'main.js' },          // lazy: main.js APP.loadNavigate() modules[] (sequential)
    // what to call after loading so the census sees what setup defines
    runtime: (win) => { if (win.NavigateFind && typeof win.NavigateFind.init === 'function') win.NavigateFind.init(win.APP, {}, function () { return null; }); },
  },
};
function readFamily(name, dir) { const f = FAMILIES[name]; return f.files.map((x) => fs.readFileSync(path.join(dir || V, x), 'utf8')).join('\n'); }
module.exports = { FAMILIES, readFamily };
