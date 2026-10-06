// _lp_family.js — the cpe_load_path family in viewer.html load order (one owner for every reader:
// W-LP-SURFACE, and the source-reading witnesses via readFamily()). Edit together with viewer.html + sw.js.
'use strict';
const fs = require('fs'), path = require('path');
const FAMILY = ['lp_chain.js', 'lp_geom_pick.js', 'lp_build.js', 'lp_backdrop_diag.js', 'lp_apply_restore.js', 'lp_hud.js', 'cpe_load_path.js'];
function readFamily(dir) { return FAMILY.map(f => fs.readFileSync(path.join(dir || path.join(__dirname, '..'), f), 'utf8')).join('\n'); }
module.exports = { FAMILY, readFamily };
