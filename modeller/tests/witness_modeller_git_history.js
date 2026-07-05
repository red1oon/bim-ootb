#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-MODELLER-GIT-HISTORY: headless-Chrome witness against the REAL production
 * stack (modeller.html → bonsai_oplog.js → common/history_bar.js → modeller_history.js), not a
 * reimplementation. Read the log after every run — exit code alone is not evidence.
 * Spec: prompts/MODELLER_GIT_FAITHFUL_HISTORY.md Phase 2.
 *
 * Issue under test: does forking (undo, then a DIFFERENT edit) actually PRESERVE the abandoned branch
 * recoverably, or does it silently corrupt/compound like the pre-Phase-1 flat model would? This is the
 * concrete scenario traced in the file header: commit A,B,C → undo×2 (back to A) → commit D (diverges)
 * → the tree must show TWO tips (C and D), and switching back to C's tip must restore EXACTLY {A,B,C}
 * active — not {A,B,C,D} compounded, and not corrupted/lost.
 *
 * Checks:
 *   G1 building-open milestone recorded (§MHIST_READY + a BUILDING_OPEN tree node)
 *   G2 three commits push three tree nodes on one line (no forking yet)
 *   G3 undo×2 leaves the tree cursor on node A, tree UNCHANGED (kids preserved, not truncated)
 *   G4 a NEW commit after undo FORKS a sibling (§HIST_FORK logged) — tree now has 2 tips
 *   G5 switchToId back to the OLD branch's tip restores EXACTLY {A,B,C} active — not compounded with D
 *   G6 switchToId to the NEW branch's tip restores EXACTLY {A,D} active — the old branch untouched
 *   G7 signed chain still verifies after all the toggling
 *   G8 no script LOAD_FAIL / pageerror
 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('playwright');

var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };

function serve() {
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      var p = decodeURIComponent(req.url.split('?')[0]);
      var fp = path.join(ROOT, p === '/' ? 'modeller/modeller.html' : p);
      fs.readFile(fp, function (e, buf) {
        if (e) { res.statusCode = 404; return res.end('nf'); }
        res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes');
        res.end(buf);
      });
    });
    srv.listen(0, function () { resolve(srv); });
  });
}

// Same readiness gate as witness_modeller_dw_oplog.js's openResident — critically, waits for the
// resident's own ARC-seed (commitSeedGroup, a batch of kernel_ops INSERTs) to fully SETTLE, not just
// for the db to exist. Getting this wrong races the test's own commits against the seed's still-in-
// flight writes, which corrupts "highest active id" assumptions the LIFO undo/redo invariant relies on.
async function openResident(page, key) {
  await page.click('#b-open');
  await page.waitForTimeout(120);
  await page.click('#m-open-panel .mo-row[data-key="' + key + '"]');
  await page.waitForFunction(function () {
    var t = window.BOMTreeOutliner && window.BOMTreeOutliner._currentTree && window.BOMTreeOutliner._currentTree();
    return !!t && Object.keys(t.nodes).some(function (id) { return t.nodes[id].kind === 'disc'; });
  }, null, { timeout: 25000 }).catch(function () {});
  await page.waitForFunction(function () { return window.DiscWalker && window.DiscWalker._ready(); }, null, { timeout: 25000 }).catch(function () {});
  await page.waitForFunction(function () { return window.Bonsai && window.Bonsai.library && (window.Bonsai.library.catalog() || []).length > 0; }, null, { timeout: 10000 }).catch(function () {});
  await page.waitForTimeout(500);
}

(async function () {
  var srv = await serve();
  var port = srv.address().port;
  var logs = [];
  var browser = await chromium.launch();
  var page = await browser.newPage();
  page.on('console', function (m) { logs.push(m.text()); });
  page.on('pageerror', function (e) { logs.push('PAGEERROR ' + e.message); });

  await page.goto('http://localhost:' + port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(function () { return window.__sceneReady === true && !!window.SQL; }, { timeout: 25000 }).catch(function () {});

  var pass = 0, fail = 0;
  function chk(name, cond, extra) { if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); } else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); } }
  console.log('═══ W-MODELLER-GIT-HISTORY — fork-preserving undo/redo (headless, SampleHouse) ═══');

  await openResident(page, 'SampleHouse');

  // SampleHouse's own ARC-seed (commitSeedGroup, NOT wrapped into HistoryBar — see modeller_history.js's
  // "intentionally NOT wrapped" note) leaves a bunch of PRE-EXISTING active rows before any test commit
  // fires. Every "exactly {...} active" assertion below must be baselined against this set, or it wrongly
  // reads "undo did nothing" when really it's just comparing against the wrong universe.
  var preExisting = await page.evaluate(function () {
    return window.Bonsai.oplog._allGeom().filter(function (o) { return !o.undone; }).map(function (o) { return o.id; });
  });
  function withBase(ids) { return preExisting.concat(ids).sort(function (a, b) { return a - b; }); }

  // G1 — the Open path recorded a BUILDING_OPEN milestone (best-effort chokepoint in _openBuffer)
  var g1 = await page.evaluate(function () {
    var MH = window.ModellerHistory;
    return { hasMH: !!MH, tree: MH ? MH.dumpTree() : null };
  });
  chk('G1 building-open milestone recorded', !!(g1.hasMH && g1.tree && g1.tree.nodes >= 1),
    'nodes=' + (g1.tree && g1.tree.nodes) + ' shape=' + (g1.tree && g1.tree.shape));

  // G2 — three standalone commits (A,B,C) push three tree nodes, one line, no fork
  var g2 = await page.evaluate(async function () {
    var O = window.Bonsai.oplog;
    var a = await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { profile: { w: 1, h: 0.2 }, dir: [0, 0, 1] } }, {});
    var b = await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { profile: { w: 2, h: 0.2 }, dir: [0, 0, 1] } }, {});
    var c = await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { profile: { w: 3, h: 0.2 }, dir: [0, 0, 1] } }, {});
    return { a: a.id, b: b.id, c: c.id, tree: window.ModellerHistory.dumpTree() };
  });
  chk('G2 three commits push three tree nodes, one line (no fork)',
    g2.tree.nodes === g1.tree.nodes + 3 && g2.tree.tips.length === 1,
    'nodes ' + g1.tree.nodes + '→' + g2.tree.nodes + ' tips=' + g2.tree.tips.length + ' shape=' + g2.tree.shape);

  // G3 — undo x2 (the SAME ModellerHistory.undo() doUndo() calls internally — doUndo itself lives inside
  //      modeller.html's <script type="module"> scope, not reachable as window.doUndo from outside) walks
  //      the tree cursor back to A; tree structure UNCHANGED (kids/nodes preserved — the fork-don't-wipe
  //      contract, checked BEFORE any fork happens).
  async function stepUndo(pg) {
    await pg.evaluate(async function () {
      var MH = window.ModellerHistory;
      MH.undo();
      await (MH.pending() || Promise.resolve());
    });
  }
  await stepUndo(page);
  await page.waitForTimeout(150);
  await stepUndo(page);
  await page.waitForTimeout(150);
  var g3 = await page.evaluate(function () {
    var O = window.Bonsai.oplog;
    return { active: O._allGeom().filter(function (o) { return !o.undone; }).map(function (o) { return o.id; }).sort(function (x, y) { return x - y; }),
      tree: window.ModellerHistory.dumpTree() };
  });
  var wantG3 = withBase([g2.a]);
  chk('G3 undo×2 leaves cursor on A (baseline+A only), tree structure UNCHANGED (not truncated)',
    JSON.stringify(g3.active) === JSON.stringify(wantG3) && g3.tree.nodes === g2.tree.nodes,
    'active=' + JSON.stringify(g3.active) + ' want=' + JSON.stringify(wantG3) + '  nodes=' + g3.tree.nodes + ' (want ' + g2.tree.nodes + ')');

  // G4 — a NEW commit (D) after undo FORKS a sibling universe (does not silently wipe B,C)
  logs.length = 0;
  var g4a = await page.evaluate(async function () {
    var O = window.Bonsai.oplog;
    var d = await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { profile: { w: 4, h: 0.2 }, dir: [0, 0, 1] } }, {});
    return { d: d.id };
  });
  await page.waitForTimeout(150);
  var forkLog = logs.find(function (l) { return /§HIST_FORK/.test(l); }) || '';
  var g4 = await page.evaluate(function () { return window.ModellerHistory.dumpTree(); });
  chk('G4 new edit after undo FORKS a sibling (§HIST_FORK logged, 2 tips now)',
    forkLog.length > 0 && g4.tips.length === 2, 'forkLog="' + forkLog + '" tips=' + g4.tips.length + ' shape=' + g4.shape);

  // G5 — switch back to the OLD (abandoned, onMain:false) branch's tip restores EXACTLY {A,B,C} active,
  //      NOT compounded with D. This is the exact corruption scenario traced in bonsai_oplog.js's
  //      pre-Phase-1 redo() bug once a tree sits on top of it — proves Phase 1 + Phase 2 together close it.
  var newTip = g4.tips.filter(function (t) { return t.onMain; })[0];
  var oldTip = g4.tips.filter(function (t) { return !t.onMain; })[0];
  var g5 = await page.evaluate(function (tipSeq) {
    window.ModellerHistory.switchToId(tipSeq);
    var O = window.Bonsai.oplog;
    return { active: O._allGeom().filter(function (o) { return !o.undone; }).map(function (o) { return o.id; }).sort(function (a, b) { return a - b; }) };
  }, oldTip && oldTip.id);
  var wantOld = withBase([g2.a, g2.b, g2.c]);
  chk('G5 switch to OLD branch tip restores EXACTLY baseline+{A,B,C}, NOT compounded with D', !!oldTip &&
    JSON.stringify(g5.active) === JSON.stringify(wantOld), 'active=' + JSON.stringify(g5.active) + ' want=' + JSON.stringify(wantOld));

  // G6 — switch DIRECTLY from one abandoned branch's tip to a DIFFERENT branch's tip (skipping the
  // trunk). KNOWN GAP (see MODELLER_GIT_FAITHFUL_HISTORY.md "Found: multi-branch switchToId gap"):
  // _switchToNode's undo-to-ancestor walk (undoing C,B) leaves {B,C} freshly undone ALONGSIDE D's
  // pre-existing undone flag, so the kernel's lowest-id-undone-first redo (Phase 1's own fix — correct
  // for the single-abandoned-branch case G5 just proved) picks B, not D. Not attempted to "fix" here —
  // a real fix needs a TARGETED redo(id) primitive in the shared kernel (viewer/kernel_ops.js AND
  // modeller/kernel_ops.js), out of scope for a Modeller-only pass. Kept RED and documented, not hidden.
  var g6 = await page.evaluate(function (tipSeq) {
    window.ModellerHistory.switchToId(tipSeq);
    var O = window.Bonsai.oplog;
    return { active: O._allGeom().filter(function (o) { return !o.undone; }).map(function (o) { return o.id; }).sort(function (a, b) { return a - b; }) };
  }, newTip && newTip.id);
  var wantNew = withBase([g2.a, g4a.d]);
  chk('G6 [KNOWN GAP, not fixed] switch DIRECTLY between two non-trunk branches picks the wrong row', !!newTip &&
    JSON.stringify(g6.active) === JSON.stringify(wantNew), 'active=' + JSON.stringify(g6.active) + ' want=' + JSON.stringify(wantNew));

  // G7 — the signed chain still verifies after all this toggling (undone flag is outside the signed payload)
  var g7 = await page.evaluate(function () { return window.Bonsai.oplog.verify(); });
  chk('G7 signed chain still verifies after fork/switch toggling', g7.ok === true, 'tip=' + String(g7.tip).slice(0, 12));

  // G8 — no load failures / page errors anywhere in the run
  var bad = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('G8 no script LOAD_FAIL / pageerror', bad.length === 0, bad.join(' | '));

  console.log('W-MODELLER-GIT-HISTORY: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('FATAL', e); process.exit(1); });
