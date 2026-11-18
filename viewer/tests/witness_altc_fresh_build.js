#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — scope: W-ALTC-FRESH-BUILD (bim-compiler prompts/ALTC_FOUNDATION.md §ALTC_FRESH_BUILD). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: "Alt+C in a tab loaded before a deploy bakes the OLD build and nothing says so", and
// "the log cannot tell a film where the compass showed from one where it was only built".
// Node only, no browser: runs the shipped viewer/build_fresh.js and reads the shipped maxq_start.js / cpe_sun_compass.js source.
'use strict';
const fs = require('fs'), path = require('path');
const V = path.join(__dirname, '..');
const BF = require(path.join(V, 'build_fresh.js'));
let pass = 0, fail = 0, inc = 0;
const ok = (name, c, detail) => { console.log('§W_ALTC_FRESH ' + (c ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : '')); c ? pass++ : fail++; };
const html = v => '<html><script src="three.min.js"></script><script src="maxq_start.js?v=' + v + '" onerror="x"></script><script src="cpe_sun_compass.js?v=7"></script></html>';
const doc = (srcs) => ({ scripts: srcs.map(s => ({ getAttribute: () => s })) });
const fetchOf = (text, st) => async () => ({ ok: st == null || st === 200, status: st || 200, text: async () => text });
(async () => {
  // 1 stale: the page loaded maxq_start.js?v=1, the server now names v=2
  let r = await BF.check(doc(['three.min.js', 'maxq_start.js?v=1', 'cpe_sun_compass.js?v=7']), fetchOf(html(2)), '/viewer/viewer.html');
  ok('stale tab is named stale', r.state === 'stale' && r.stale.length === 1 && r.stale[0].file === 'maxq_start.js' && r.stale[0].loaded === '1' && r.stale[0].served === '2',
    JSON.stringify(r.stale));
  // 2 current: same versions -> ok, and it JUDGED something (compared > 0, not vacuous)
  r = await BF.check(doc(['three.min.js', 'maxq_start.js?v=2', 'cpe_sun_compass.js?v=7']), fetchOf(html(2)), '/viewer/viewer.html');
  ok('current tab is ok and judged scripts', r.state === 'ok' && r.compared === 2, 'compared=' + r.compared);
  // 3 offline / fetch throws -> unknown, never ok
  r = await BF.check(doc(['maxq_start.js?v=2']), async () => { throw new Error('offline'); }, '/x');
  ok('fetch failure is UNKNOWN, not ok', r.state === 'unknown' && /fetch-failed/.test(r.reason), r.reason);
  r = await BF.check(doc(['maxq_start.js?v=2']), fetchOf('', 404), '/x');
  ok('http error is UNKNOWN', r.state === 'unknown' && r.reason === 'http-404', r.reason);
  // 4 vacuous: no versioned scripts in common -> compared 0 (the caller prints INCONCLUSIVE)
  r = await BF.check(doc(['three.min.js']), fetchOf(html(2)), '/x');
  ok('nothing in common is compared=0 (vacuous, not a pass)', r.state === 'ok' && r.compared === 0);
  // 5 source: start() checks BEFORE MQS._active = true, and returns on stale
  const ms = fs.readFileSync(path.join(V, 'maxq_start.js'), 'utf8');
  const iStart = ms.indexOf('async function start(opts)'), iChk = ms.indexOf('BuildFresh.check', iStart), iAct = ms.indexOf('MQS._active = true', iStart);
  ok('start() awaits the check before going active', iStart > 0 && iChk > iStart && iAct > iChk, 'start=' + iStart + ' check=' + iChk + ' active=' + iAct);
  const blk = ms.slice(iChk, iAct);
  ok('stale returns without baking', /state === 'stale'[\s\S]*§ALTC_STALE_BUILD[\s\S]*return;/.test(blk));
  ok('compared=0 prints INCONCLUSIVE', /INCONCLUSIVE/.test(blk));
  // 6 compass shown/held tally is counted and printed at the end of the bake
  const sc = fs.readFileSync(path.join(V, 'cpe_sun_compass.js'), 'utf8');
  ok('compass counts shown and held frames', /_tally\.held\+\+/.test(sc) && /_tally\.shown\+\+/.test(sc));
  ok('end of bake prints §SUN_COMPASS_SHOWN with FAIL when on and never shown', /§SUN_COMPASS_SHOWN on=[\s\S]{0,200}shown > 0 \? 'PASS' : 'FAIL'/.test(ms));
  // 7 the page loads build_fresh.js before maxq_start.js, and the service worker precaches it
  const vh = fs.readFileSync(path.join(V, 'viewer.html'), 'utf8'), sw = fs.readFileSync(path.join(V, 'sw.js'), 'utf8');
  ok('viewer.html loads build_fresh.js before maxq_start.js', vh.indexOf('build_fresh.js?v=') > 0 && vh.indexOf('build_fresh.js?v=') < vh.indexOf('maxq_start.js?v='));
  ok('sw.js precaches build_fresh.js', /'build_fresh\.js'/.test(sw));
  // 8 against the REAL viewer.html: the page's own scripts compared with themselves must be ok with many compared (not vacuous)
  const srcs = []; vh.replace(/<script[^>]*\ssrc="([^"]+)"/g, (m, s) => srcs.push(s));
  r = await BF.check(doc(srcs), fetchOf(vh), '/viewer/viewer.html');
  ok('real viewer.html vs itself: ok, many compared', r.state === 'ok' && r.compared > 50, 'compared=' + r.compared + ' of ' + srcs.length + ' scripts');
  console.log('§W_ALTC_FRESH_VERDICT pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + '  ' + (fail ? 'FAIL' : 'PASS'));
  process.exit(fail ? 1 : 0);
})();
