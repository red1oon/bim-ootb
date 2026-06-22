// panel_drag_wiring.js — W-PANEL-DRAG (FUSED_4D5D_WEDGE_LANE — user ask 2026-06-23)
// Both TM-owned panels (Author 4D, What-if) are repositionable by dragging their header. Live
// drag proven by Playwright (exact-px move, screenshots); this guards the wiring stays in place.
var fs = require('fs'), path = require('path');
var V = path.resolve(__dirname, '..', '..', 'viewer');
var pass = 0, fail = 0;
function ck(n, c, d) { if (c) { pass++; console.log('§W-DRAG PASS  ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('§W-DRAG FAIL  ' + n + (d ? '  ' + d : '')); } }
var sa = fs.readFileSync(path.join(V, 'schedule_author_ui.js'), 'utf8');
var wi = fs.readFileSync(path.join(V, 'whatif_panel.js'), 'utf8');

// Author panel: header handle id + drag wired + repositions via left/top.
ck('author-head-handle', /id="sa-head"[^>]*cursor:grab/.test(sa), 'sa-head grab handle');
ck('author-drag-wired', /dragByHandle\(_panel, document\.getElementById\('sa-head'\)\)/.test(sa), 'dragByHandle(panel, sa-head)');
ck('author-drag-impl', /function dragByHandle[\s\S]{0,900}panel\.style\.left/.test(sa), 'sets panel left/top');
ck('author-drag-ignores-controls', /closest\([^)]*button,input,select,a/.test(sa), 'ignores buttons/inputs');
// honest empty-state copy (the Hospital "no schedule" confusion fix).
ck('author-copy-editable', /No <b>editable<\/b> schedule here yet/.test(sa), 'wording clarifies generative≠editable');

// What-if panel: drag by its <h3> title bar, separate from the .wi-track slip drag.
ck('whatif-drag-wired', /_dragByHandle\(panel, panel\.querySelector\('h3'\)\)/.test(wi), '_dragByHandle(panel, h3)');
ck('whatif-drag-impl', /function _dragByHandle[\s\S]{0,900}panel\.style\.left/.test(wi), 'sets panel left/top');
ck('whatif-drag-skips-tracks', /closest\([^)]*\.wi-track/.test(wi), 'header drag ignores phase tracks');

console.log('§W-PANEL-DRAG RESULT ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
