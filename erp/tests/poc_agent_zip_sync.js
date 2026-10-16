#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — prompts/AGENT_QUEUE.md §AGENT-ZIPS-BUILT (owns §ERP-SESSION-CLOSE-2 §C2.3 item 5).
// THE CLAIM UNDER TEST (W-AGENT-ZIP-SYNC):
//   A. Both shipped agent downloads BUILD from their source directories, and what a user extracts is
//      byte-for-byte the repo's own files — every file, no file missing, no file extra.
//   B. Each bundle keeps the SHAPE it already ships with (idempiere flat, odoo nested under odoo_agent/),
//      so building them changes nothing a user sees.
//   C. The build is DETERMINISTIC — the same sources produce byte-identical bytes twice — which is what
//      makes "did this drift" a hash comparison rather than a judgement.
//   D. The links that offer them still point at the files the builder writes.
// WHY IT EXISTS: erp/*_agent.zip were TRACKED BINARIES duplicating erp/*_agent/, and the duplication had
// already drifted — odoo_agent.zip shipped WITHOUT extract_model.js, the file the Odoo extraction step
// needs and the one poc_odoo_descriptor names as the artifact's producer. A duplicate that nothing checks
// is a stale copy waiting to happen; this makes it impossible by construction.
// Run:  node erp/tests/poc_agent_zip_sync.js       (cwd = bim-ootb)
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var B = require(path.join(__dirname, '..', 'tools', 'build_agent_zips.js'));

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function sha(b) { return crypto.createHash('sha256').update(b).digest('hex').slice(0, 16); }

console.log('═══ W-AGENT-ZIP-SYNC — the shipped agent downloads are their source directories ═══\n');

// A0 — judged BEFORE anything is rebuilt. TWO claims, and A0a exists because of a measured mistake:
// these zips were briefly UNTRACKED (#1675) on the assumption that deploy-pages.yml's generated files
// reach users the way erp/version.json was believed to. They do not. GitHub Pages for this repo is
// build_type "legacy", source {branch: main, path: /} — it serves the TRACKED FILES ON MAIN, and the
// Actions artifact is published by nothing. Both downloads 404'd live within the hour. So A0a asserts
// the zip is THERE, and A0b that it matches its source. §PZ.3 carries the measurement and the decision.
var pre = B.run(true);
pre.forEach(function (r) {
  verdict(r.present, r.zip + ' A0a: the zip is PRESENT and TRACKED — GitHub Pages serves the BRANCH, not the artifact', r.present ? 'present' : 'ABSENT — this 404s the live download');
  if (!r.present) return;
  verdict(!r.drift, r.zip + ' A0b: the STORED zip matches the directory it duplicates',
    r.drift ? 'stale=[' + r.stale.join(',') + ']' : 'in sync');
});

var res = B.run(false);                       // build both into erp/
res.forEach(function (r) {
  console.log('§AGENT-ZIP ' + r.zip + ' files=' + r.files.length + ' bytes=' + r.bytes + ' sha=' + r.sha);
});

res.forEach(function (r) {
  var zipPath = path.join(B.ERP, r.zip), dirPath = path.join(B.ERP, r.dir);
  var content = B.contentOf(fs.readFileSync(zipPath));
  var prefix = (B.BUNDLES.filter(function (b) { return b.zip === r.zip; })[0] || {}).prefix || '';
  var srcFiles = fs.readdirSync(dirPath).filter(function (n) { return fs.statSync(path.join(dirPath, n)).isFile(); }).sort();

  // A — every source file is IN the zip, with the same bytes
  var missing = [], wrong = [];
  srcFiles.forEach(function (n) {
    var key = prefix + n;
    if (content[key] === undefined) { missing.push(n); return; }
    if (content[key] !== sha(fs.readFileSync(path.join(dirPath, n)))) wrong.push(n);
  });
  verdict(missing.length === 0, r.zip + ' A1: every file of erp/' + r.dir + '/ is in the download (' + srcFiles.length + ' files)', missing.length ? 'MISSING ' + missing.join(',') : '');
  verdict(wrong.length === 0, r.zip + ' A2: and each one is byte-identical to the repo copy', wrong.length ? 'DIFFERENT ' + wrong.join(',') : '');
  // A3 — and nothing EXTRA that the repo does not have (a stale file left behind is the same defect)
  var extra = Object.keys(content).filter(function (k) {
    if (k.slice(-1) === '/') return false;
    return srcFiles.indexOf(k.slice(prefix.length)) < 0 || k.indexOf(prefix) !== 0;
  });
  verdict(extra.length === 0, r.zip + ' A3: and nothing in it that the repo does not have', extra.length ? 'EXTRA ' + extra.join(',') : '');
  // B — the shape it already shipped with
  var nested = Object.keys(content).every(function (k) { return k.indexOf(prefix) === 0; });
  verdict(nested, r.zip + ' B1: keeps its shipped shape (' + (prefix ? 'nested under ' + prefix : 'flat') + ')', Object.keys(content).slice(0, 3).join(','));
});

// C — determinism: build twice, compare bytes
var again = B.run(true);
verdict(again.every(function (r, i) { return r.sha === res[i].sha; }),
  'C1: the build is DETERMINISTIC (same sources → same bytes), so drift is a hash comparison',
  again.map(function (r) { return r.zip + '=' + r.sha; }).join(' '));

// D — the offers still point at what the builder writes
var about = fs.readFileSync(path.join(B.ERP, '..', 'common', 'about_diy.js'), 'utf8');
var picker = fs.readFileSync(path.join(B.ERP, 'erp_picker.js'), 'utf8');
res.forEach(function (r) {
  var offered = about.indexOf('erp/' + r.zip) >= 0 || picker.indexOf(r.zip) >= 0;
  verdict(offered, 'D1: ' + r.zip + ' is still offered by common/about_diy.js or erp/erp_picker.js');
});

// E — THE INSTRUCTION THE APP PRINTS MUST BE RUNNABLE ON THE FILE THE APP SERVES.
// This is the claim that was RED before §AZ.3 was answered: common/about_diy.js has ALWAYS told the user
// `cd idempiere_agent && …` while idempiere_agent.zip put migrate_agent.js at the ROOT — there was no
// directory to cd into, and the three files landed loose in the user's current directory. A download and
// the sentence next to it are one contract; checking only that the file exists is checking half of it.
res.forEach(function (r) {
  var block = (about.split('file: \'erp/' + r.zip + '\'')[1] || about.split(r.zip)[1] || '').slice(0, 400);
  var m = block.match(/cd ([A-Za-z0-9_.-]+)/);
  if (!m) { verdict(true, 'E1: ' + r.zip + ' — its offer prints no `cd`, so there is nothing to disagree with'); return; }
  var content = B.contentOf(fs.readFileSync(path.join(B.ERP, r.zip)));
  var tops = {};
  Object.keys(content).forEach(function (k) { tops[k.indexOf('/') >= 0 ? k.slice(0, k.indexOf('/')) : '(root)'] = 1; });
  var top = Object.keys(tops);
  verdict(top.length === 1 && top[0] === m[1],
    'E1: ' + r.zip + ' — the `cd ' + m[1] + '` the app prints is a real folder inside the zip',
    'instruction=cd ' + m[1] + ' zipTopLevel=[' + top.join(',') + ']');
});

console.log('\n' + (fails === 0 ? '🟢 W-AGENT-ZIP-SYNC PASS' : '🔴 W-AGENT-ZIP-SYNC FAIL (' + fails + ')') +
  ' — both downloads are built from their source directories, keep their shipped shape, and build deterministically.');
process.exit(fails === 0 ? 0 : 1);
