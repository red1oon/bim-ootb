#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — SPEC (W-ERP-HOVER E1), bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.22
// ISSUE: the ERP field hover needs every registration's file:line; a hand-kept table would go stale the first time a line moves.
// WHAT:  writes devtools/hover/erp_index.json {format, root, entries, legacy} from erp_sites.js (a parse). It holds THIS machine's absolute repo path (the vscode:// link needs it), so it is
//        git-ignored; run this again after editing a registration.
// USE:   node devtools/hover/gen_erp_index.js [--root <bim-ootb dir>]
// LOG:   §ERP_HOVER_INDEX entries=N kinds={...} legacy_files=M parsed=P skipped=S root=<dir>   Read the log after every run - exit code is not evidence.
'use strict';
const fs = require('fs'), path = require('path');
const ai = process.argv.indexOf('--root'), ROOT = path.resolve(ai > 0 ? process.argv[ai + 1] : path.join(__dirname, '..', '..'));
const S = require('./erp_sites.js').sites(ROOT), kinds = {};
S.entries.forEach(e => { kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
fs.writeFileSync(path.join(__dirname, 'erp_index.json'), JSON.stringify({ format: 'erp-hover-index/1', root: ROOT, entries: S.entries, legacy: S.legacy }, null, 1) + '\n');
console.log('§ERP_HOVER_INDEX entries=' + S.entries.length + ' kinds=' + JSON.stringify(kinds) + ' legacy_files=' + Object.keys(S.legacy).length + ' parsed=' + S.parsed + ' skipped=' + S.skipped + ' root=' + ROOT);
