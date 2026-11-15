#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// uat_pack.js — the tester's reference pack (prompts/CAPEX_DASHBOARD.md §5.87) from ONE W-UAT-CHAIN run written with UAT_OUT=<dir>.
// Nothing here measures: every expected value is a value that run read (its run.json), every file is a file that run wrote.
// usage: node capex/tools/uat_pack.js --from=<UAT_OUT dir> --out=<dir>     -> <dir>/Shed_UAT_pack_<yyyymmdd>.zip ; prints §UATPACK lines
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..'), PO = require(path.join(ROOT, 'erp', 'pipo_packout.js'));
// Node 18's CompressionStream lacks 'deflate-raw': the same shim as capex/tools/td_pack.js, so the house zip writer (pipo_packout.zip) runs unchanged
try { new CompressionStream('deflate-raw'); } catch (e) { const zlib = require('zlib'), Native = globalThis.CompressionStream; globalThis.CompressionStream = function (fmt) { if (fmt !== 'deflate-raw') return new Native(fmt); const parts = []; return new TransformStream({ transform(c) { parts.push(Buffer.from(c)); }, flush(ctl) { ctl.enqueue(new Uint8Array(zlib.deflateRawSync(Buffer.concat(parts)))); } }); }; }
const arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').slice(k.length + 3);
const EXCLUDE_TOLERANCE = { sheet: '3_BEAM_LAYOUT', x0: [-20908, -20873.6], x1: [-20850.7, -20843.3], y0max: -5577.3, y1min: -4965.3 };   // §5.84, measured on 3_BEAM_LAYOUT
(async () => {
  const FROM = arg('from'), OUTDIR = arg('out');
  if (!FROM || !OUTDIR) { console.log('usage: node capex/tools/uat_pack.js --from=<UAT_OUT dir> --out=<dir>'); process.exit(2); }
  const run = JSON.parse(fs.readFileSync(path.join(FROM, 'run.json'), 'utf8'));
  if (run.break || !/^§UATCH_VERDICT PASS/.test(run.verdict)) { console.log('§UATPACK REFUSED the run is not a passing W-UAT-CHAIN run: ' + run.verdict); process.exit(1); }
  if (run.dirty) console.log('§UATPACK NOTE the run was made from a worktree with uncommitted changes (commit ' + run.commit + ')');
  const files = [], sha = {};
  const add = (rel, abs) => { const b = fs.readFileSync(abs); files.push({ path: rel, data: new Uint8Array(b) }); sha[rel] = crypto.createHash('sha256').update(b).digest('hex'); };
  ['sheets', 'marked'].forEach(d => fs.readdirSync(path.join(FROM, d)).filter(f => /\.dxf$/i.test(f)).sort().forEach(f => add(d + '/' + f, path.join(FROM, d, f))));
  add('reference/SHED_extracted.db', path.join(FROM, 'reference', 'SHED_extracted.db'));
  const n = { sheets: files.filter(f => /^sheets\//.test(f.path)).length, marked: files.filter(f => /^marked\//.test(f.path)).length };
  if (n.sheets !== 9 || n.marked !== 9) { console.log('§UATPACK REFUSED expected 9 sheets + 9 marked, found ' + JSON.stringify(n)); process.exit(1); }
  const manifest = { format: 'capex-uat-pack/1', building: 'SHED (the Shed drawing set, 13 drawn bays)', built: run.date, commit: run.commit, made_by: run.verdict,
    expected: { 'B0.1': 'All defaults lists ' + run.tester['B0.1'] + ' yellow rows', 'B0.2': 'All defaults lists ' + run.tester['B0.2'] + ' yellow rows', 'B2.6': run.proven['B2.6'], 'B2.9': run.proven['B2.9'], 'B3.1': run.proven['B3.1'] },
    exclude_tolerance: EXCLUDE_TOLERANCE, sha256: sha,
    howto: 'Open capex/uat/check.html (bim-ootb), give it this zip, your nine saved ..._marked.dxf, your SHED_extracted.db and the two lines the Viewer showed. Guide chapter B5.' };
  files.unshift({ path: 'manifest.json', data: JSON.stringify(manifest, null, 1) });
  const bytes = await PO.zip(files), day = run.date.slice(0, 10).replace(/-/g, ''), file = path.join(OUTDIR, 'Shed_UAT_pack_' + day + '.zip');
  fs.mkdirSync(OUTDIR, { recursive: true }); fs.writeFileSync(file, Buffer.from(bytes));
  console.log('§UATPACK expected ' + JSON.stringify(manifest.expected));
  console.log('§UATPACK wrote ' + file + ' bytes=' + bytes.length + ' files=' + files.length + ' sha256=' + crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex'));
})().catch(e => { console.log('§UATPACK STOPPED ' + (e.stack || e)); process.exit(1); });
