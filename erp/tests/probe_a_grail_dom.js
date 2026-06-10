// probe_a_grail_dom.js — W-FOLD-BACK-DOM: live glassbowl.html §A-GRAIL fold-back wiring check.
// Verifies: (1) window.crudFoldBack is defined, (2) recordDocMoment stores docOp on the viewHist
// entry, (3) scrubTo calls foldDocOps which fires crudFoldBack for DOC_ACTION dots, and
// (4) the §FOLD-BACK log line appears when scrubbing backward past a DOC_ACTION dot.
//
// Run: node erp/tests/probe_a_grail_dom.js (from bim-ootb root)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const path = require('path');

const GLASSBOWL = 'file://' + path.resolve(__dirname, '..', 'glassbowl.html');
const TIMEOUT = 20000;

(async function () {
  var fails = 0;
  function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

  console.log('═══ W-FOLD-BACK-DOM — live glassbowl.html A-GRAIL fold-back wiring ═══');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  var pageLogs = [];
  page.on('console', function (m) { pageLogs.push(m.text()); });
  page.on('pageerror', function (e) { /* pre-existing on plain load — not a test failure */ });

  await page.goto(GLASSBOWL, { timeout: TIMEOUT });
  await page.waitForTimeout(3000);

  // §A-GRAIL-1: crudFoldBack is exposed on window
  var hasFoldBack = await page.evaluate(function () { return typeof window.crudFoldBack === 'function'; });
  verdict(hasFoldBack, '§A-GRAIL-1 window.crudFoldBack is defined');

  // §A-GRAIL-2: recordDocMoment(label, op) stores docOp on the viewHist entry
  // GlassbowlHistoryReset() first so we start clean (ensures __viewHist ref is fresh too)
  var docOpStored = await page.evaluate(function () {
    window.GlassbowlHistoryReset();
    var op = { op_type: 'DOC_ACTION', key: 'c_order', from: 'DR', to: 'CO' };
    window.recordDocMoment('Test Complete', op);
    var hist = window.__viewHist;
    if (!hist || hist.length < 1) return 'viewHist empty (len=' + (hist ? hist.length : 'null') + ')';
    var last = hist[hist.length - 1];
    if (!last.docOp) return 'docOp missing on last entry';
    if (last.docOp.op_type !== 'DOC_ACTION') return 'wrong op_type: ' + last.docOp.op_type;
    return 'ok';
  });
  verdict(docOpStored === 'ok', '§A-GRAIL-2 recordDocMoment stores v.docOp in viewHist', docOpStored);

  // §A-GRAIL-3: §DOC-DOT log includes op= suffix
  var dotLog = pageLogs.find(function (l) { return l.indexOf('§DOC-DOT') >= 0 && l.indexOf('op=DOC_ACTION') >= 0; });
  verdict(!!dotLog, '§A-GRAIL-3 §DOC-DOT log includes op=DOC_ACTION', dotLog || 'not found');

  // §A-GRAIL-4: scrubTo backward past a DOC_ACTION dot calls crudFoldBack → §FOLD-BACK log
  // Reset history, build a 2-dot hist: view(0), DOC_ACTION(1), then scrub from 1→0
  var foldBackResult = await page.evaluate(function () {
    // override crudFoldBack to capture the call without the IDB path
    var foldCalls = [];
    window.crudFoldBack = function (key, from, to) {
      foldCalls.push({ key: key, from: from, to: to });
      console.log('§FOLD-BACK key=' + key + ' status=' + (to || '?') + '→' + from + ' undone_id=null (test)');
    };
    // clean reset via the public hook (also refreshes window.__viewHist ref)
    window.GlassbowlHistoryReset();
    // push a plain view dot at idx 0 via window.recordView
    if (typeof window.recordView === 'function') window.recordView();
    // push a DOC_ACTION dot at idx 1
    var op = { op_type: 'DOC_ACTION', key: 'c_order', from: 'DR', to: 'CO' };
    window.recordDocMoment('Complete Order', op);
    var preIdx = window.__viewHist.length - 1; // should be 1
    // call scrubTo(0) — should trigger foldDocOps(1, 0) → 1 crudFoldBack call
    if (typeof scrubTo === 'function') scrubTo(0); else return 'scrubTo not defined';
    return { foldCalls: foldCalls, preIdx: preIdx };
  });
  if (typeof foldBackResult === 'object' && foldBackResult !== null) {
    verdict(foldBackResult.preIdx === 1, '§A-GRAIL-4a viewHist at idx=1 before scrub', 'preIdx=' + foldBackResult.preIdx);
    verdict(foldBackResult.foldCalls.length === 1, '§A-GRAIL-4b scrubTo(0) fires 1 crudFoldBack call', 'calls=' + foldBackResult.foldCalls.length);
    verdict(foldBackResult.foldCalls[0] && foldBackResult.foldCalls[0].key === 'c_order', '§A-GRAIL-4c fold call key=c_order');
    verdict(foldBackResult.foldCalls[0] && foldBackResult.foldCalls[0].from === 'DR', '§A-GRAIL-4d fold call fromStatus=DR');
  } else {
    verdict(false, '§A-GRAIL-4 scrubTo evaluation failed', String(foldBackResult));
  }
  var foldLog = pageLogs.find(function (l) { return l.indexOf('§FOLD-BACK') >= 0 && l.indexOf('c_order') >= 0; });
  verdict(!!foldLog, '§A-GRAIL-5 §FOLD-BACK log appears for DOC_ACTION dot', foldLog || 'not found');

  await browser.close();

  console.log('\n═══ W-FOLD-BACK-DOM results ═══');
  console.log(fails === 0 ? '🟢 ALL PASS' : '🔴 ' + fails + ' FAIL(S)');
  process.exit(fails > 0 ? 1 : 0);
})();
