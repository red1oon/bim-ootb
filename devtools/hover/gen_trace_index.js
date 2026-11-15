#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — SPEC (W-DXF-HOVER H1), bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.21 slice 2
// ISSUE: the canvas hover needs key -> file:line, and a hand-kept table would go stale the first time a line moves.
// WHAT:  writes devtools/hover/trace_index.json {format, root, keys: {key: 'modeller/<file>.js:<line>'}, defaults: {key: 'modeller/element_defaults.json:<line>'} (F.23)} from trace_sites.js (a parse). The file holds THIS machine's
//        absolute repo path (the vscode:// link needs it), so it is git-ignored; run this again after editing a builder. A key found at two lines is refused (exit 1).
// USE:   node devtools/hover/gen_trace_index.js [--root <bim-ootb dir>]
// LOG:   §DXF_HOVER_INDEX keys=N root=<dir> out=<file>   Read the log after every run - exit code is not evidence.
'use strict';
const fs = require('fs'), path = require('path');
const ai = process.argv.indexOf('--root'), ROOT = path.resolve(ai > 0 ? process.argv[ai + 1] : path.join(__dirname, '..', '..'));
const S = require('./trace_sites.js').sites(ROOT), keys = {}, dup = [];
Object.keys(S).sort().forEach(k => { if (S[k].length === 1) keys[k] = S[k][0]; else dup.push(k + '@' + S[k].join(',')); });
if (dup.length) { console.log('§DXF_HOVER_INDEX REFUSED a key at more than one line: ' + dup.join(' ')); process.exit(1); }
const out = path.join(__dirname, 'trace_index.json'), defaults = require('./trace_sites.js').defaultSites(ROOT);   // F.23 layer 3: default key -> its row in element_defaults.json
fs.writeFileSync(out, JSON.stringify({ format: 'dxf2bim-trace-index/1', root: ROOT, keys, defaults }, null, 1) + '\n');
console.log('§DXF_HOVER_INDEX keys=' + Object.keys(keys).length + ' defaults=' + Object.keys(defaults).length + ' root=' + ROOT + ' out=' + out);
