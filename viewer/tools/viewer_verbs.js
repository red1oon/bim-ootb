#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — Viewer verbs 8 and 9 (W-VIEWER-VERBS). Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §19.4. Read the log after every run.
// SCOPE: READ ONLY. Two verbs that open a building in the Viewer (headless, SwiftShader/CPU via viewer_driver.js) and run the Viewer's OWN Find-panel
// "Ask" answer for it (viewer/find_ask.js, A.askRun): the answer returned is the one the Viewer shows a person, with the Viewer's own
// `§ASK_ANSWER` console line carried beside it as the evidence. Nothing is re-derived here. No DB write, no bake, no GPU.
//   viewer_counts(building, by)            = Find ▸ Ask ▸ "Find element count by discipline|storey"      (find_ask.js runCounts)
//   viewer_clashes(building, discA, discB) = Find ▸ Ask ▸ "Find clashes between A and B"                 (find_ask.js runClash)
// Run: node viewer/tools/viewer_verbs.js counts --building Duplex [--by storey]
//      node viewer/tools/viewer_verbs.js clashes --building Clinic --a ARC --b MEP
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const VD = require('./viewer_driver');

const NAME = /^[A-Za-z0-9_-]{1,64}$/, DISC = /^[A-Za-z0-9_]{1,16}$/;
const say = (s) => process.stderr.write('§VIEWER_VERB ' + s + '\n');

// building name -> the DB the Viewer opens. Dirs: $VIEWER_BLD_DIR, this checkout's buildings/, the primary checkout's (read only).
function resolveDb(building) {
  if (typeof building !== 'string' || !NAME.test(building)) throw new Error('building must be a name such as "Duplex" (letters, digits, _ and - only)');
  const dirs = [process.env.VIEWER_BLD_DIR, path.join(VD.ROOT, 'buildings'), path.join(os.homedir(), 'bim-ootb', 'buildings')].filter(Boolean);
  for (const d of dirs) for (const f of [building + '_extracted.db', building + '.db']) {
    const p = path.join(d, f); if (fs.existsSync(p) && fs.statSync(p).size > 100000) return p;
  }
  throw new Error('unknown building "' + building + '": no ' + building + '_extracted.db in ' + dirs.join(', '));
}

// Opens the building, waits for it as the Viewer's own load does, mounts Find (A.loadNavigate), then runs one Ask template. Returns the Viewer's answer
// and the Viewer's own §ASK_ANSWER line from the page console (the same line a person's console shows).
async function ask(building, tpl, slots, text) {
  const db = resolveDb(building), pageLog = [], t0 = Date.now();
  const d = await VD.start({ db, pageLog });
  try {
    await d.open(); await d.waitLoaded();
    await d.page.evaluate(() => window.APP.loadNavigate());
    await d.page.waitForFunction(() => typeof window.APP.askRun === 'function', { timeout: 120000 });
    const ans = await d.page.evaluate((tpl, slots, text) => window.APP.askRun({ tpl, slots, text }).then(a => JSON.parse(JSON.stringify(a))), tpl, slots, text);
    const line = pageLog.filter(l => l.indexOf('§ASK_ANSWER id=' + tpl + ' ') === 0).pop() || null;
    const lines = pageLog.filter(l => /^§(ASK_|CLASH_QUERY|CLASH_NARROW)/.test(l)).map(l => l.slice(0, 300));
    say(tpl + ' building=' + building + ' verdict=' + ans.verdict + ' ms=' + (Date.now() - t0));
    return { ans, line, lines, pageErrors: d.pageErrors.slice(), db };
  } finally { await d.close(); }
}

// VOLATILE inputs are checked before any browser starts.
async function viewerCounts(a) {
  const by = a.by === undefined ? 'discipline' : a.by;
  if (by !== 'discipline' && by !== 'storey') throw new Error('by must be "discipline" or "storey"');
  const r = await ask(a.building, 'counts', { by }, 'Find element count by ' + by);
  if (r.ans.verdict !== 'OK') throw new Error('the Viewer says ' + r.ans.verdict + ': ' + r.ans.summary);
  return pack('viewer_counts', a.building, r, 0);
}
async function viewerClashes(a) {
  for (const k of ['discA', 'discB']) if (typeof a[k] !== 'string' || !DISC.test(a[k])) throw new Error(k + ' must be a discipline code such as "ARC" or "MEP"');
  resolveDb(a.building);   // unknown building: error before the browser starts
  const r = await ask(a.building, 'clash_pair', { a: a.discA, b: a.discB }, 'Find clashes between ' + a.discA + ' and ' + a.discB);
  if (r.ans.verdict !== 'OK') throw new Error('the Viewer says ' + r.ans.verdict + ': ' + r.ans.summary);
  return pack('viewer_clashes', a.building, r, 20);
}
function pack(verb, building, r, rowCap) {
  const a = r.ans, value = JSON.parse(JSON.stringify(a.value));
  if (process.env.VIEWER_VERB_BREAK === '1') {   // the witness's falsifier: the verb lies about the Viewer's number
    if (typeof value.total === 'number') value.total -= 1; else if (typeof value.bboxOverlaps === 'number') value.bboxOverlaps += 1;
  }
  const out = { verb, building, verdict: a.verdict, question: a.question, summary: a.summary, value, viewerLine: r.line, viewerLog: r.lines, source: a.sources };
  if (a.cols) { out.cols = a.cols; out.rowsTotal = (a.rows || []).length; out.rows = rowCap ? (a.rows || []).slice(0, rowCap) : a.rows; }
  if (r.pageErrors.length) out.pageErrors = r.pageErrors;
  return out;
}

module.exports = { viewerCounts, viewerClashes, resolveDb };

if (require.main === module) {
  const argv = process.argv.slice(2), verb = argv[0], arg = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
  const f = verb === 'counts' ? () => viewerCounts({ building: arg('building'), by: arg('by') })
    : verb === 'clashes' ? () => viewerClashes({ building: arg('building'), discA: arg('a'), discB: arg('b') }) : null;
  if (!f) { console.error('usage: node viewer/tools/viewer_verbs.js counts --building B [--by discipline|storey] | clashes --building B --a ARC --b MEP'); process.exit(2); }
  f().then(r => { console.log(JSON.stringify(r)); process.exit(0); }).catch(e => { console.error('§VIEWER_VERB FAIL ' + (e && e.message || e)); process.exit(1); });
}
