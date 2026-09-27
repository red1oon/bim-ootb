#!/usr/bin/env node
// WITNESS — bake_loads_once: cli_silent_bake.js's Z22-1 LOAD ONCE navigation order, driven against a
// MOCKED puppeteer `page` (no browser, no network, no GPU).
// Spec: bim-compiler prompts/ALTC_SHOWSTOPPERS.md "### Z22 SPEC" Z22-1.
//
// ISSUE THIS PROVES OR DISPROVES: the SW/cache purge must run on a lightweight LANDING page BEFORE
// the one and only navigation to the real bake URL. MEASURED before this fix (ALTC_SHOWSTOPPERS.md
// "§FILM_LAW v2 RESULT" row 9 / PHOTOREAL_STILL_RENDER.md "§ALTS_ALL_3 RESULT" F12): a Hospital
// 90-frame CLI bake staged the building TWICE — module *_INIT lines duplicated in the log, the first
// staging torn down at ~124.9-125 s — because the purge used to run AFTER page.goto(realUrl) (which
// starts fetching/staging immediately) and was followed by a page.reload() to actually run current
// code. This witness drives cli_silent_bake.js's exported loadPageOnce() and judges: exactly one
// goto to the real URL, the purge goto+evaluate precede it, reload() is NEVER called, loadsCount===1,
// and the captured log carries §CLI_BAKE_SW_PURGE + §CLI_BAKE_LOADS count=1.
// redControl: the PRE-FIX call shape (goto real -> evaluate -> reload, no purge landing page) must
// fail several of those rows (no purge-first ordering, a reload call, loadsCount!=1).
// It does NOT prove a REAL browser's service worker gets unregistered, nor the wall-clock saving —
// that is the GPU witness (ALTC_SHOWSTOPPERS.md "### Z22 SPEC" "Z22 GPU WITNESS", queued, not run here).
// Prints INCONCLUSIVE (never PASS) if cli_silent_bake.js does not export loadPageOnce.
//
// Command: node viewer/tests/witness_bake_loads_once.js
'use strict';
const path = require('path'), os = require('os');

// cli_silent_bake.js reads --log/--port/--out from process.argv at MODULE scope (it is a CLI, not a
// pure library) — point them at scratch values for the duration of the require() so pulling in
// loadPageOnce does not clobber /tmp/silent_bake.log or try to use a port anything else is bound to
// (main() itself is never invoked here: require.main !== module for this require).
const _origArgv = process.argv;
process.argv = _origArgv.slice(0, 2).concat([
  '--log', path.join(os.tmpdir(), 'witness_bake_loads_once.log'),
  '--port', '19997',
  '--out', path.join(os.tmpdir(), 'witness_bake_loads_once.mp4')
]);
let CLI = null, loadErr = null;
try { CLI = require(path.join(__dirname, '..', '..', 'cli_silent_bake.js')); } catch (e) { loadErr = e; }
process.argv = _origArgv;

if (!CLI || typeof CLI.loadPageOnce !== 'function') {
  console.log('§WITNESS_BAKE_LOADS_ONCE INCONCLUSIVE cli_silent_bake.js does not export loadPageOnce (' +
    (loadErr && loadErr.message || 'not found') + ') — nothing judged');
  process.exitCode = 2;
} else {
  const { Witness } = require('../../witness_kit/contract');
  const PURGE_URL = 'http://127.0.0.1:19997/viewer/sw.js';
  const REAL_URL = 'http://127.0.0.1:19997/viewer/viewer.html?db=x';

  function mockPage() {
    const calls = [];
    return {
      calls,
      goto: async (url, opts) => { calls.push({ type: 'goto', url, waitUntil: opts && opts.waitUntil }); },
      reload: async (opts) => { calls.push({ type: 'reload', url: REAL_URL, waitUntil: opts && opts.waitUntil }); },
      evaluate: async () => { calls.push({ type: 'evaluate' }); return { regs: 1, ks: 1, ctl: 0, urls: ['sw.js'] }; }
    };
  }

  // GOOD: drive the REAL loadPageOnce exported by cli_silent_bake.js.
  async function driveGood() {
    const page = mockPage(), lines = [];
    const res = await CLI.loadPageOnce(page, { purgeUrl: PURGE_URL, realUrl: REAL_URL, gotoTimeout: 120000, log: l => lines.push(l) });
    return { calls: page.calls, loadsCount: res.loadsCount, lines };
  }
  // BAD (redControl fixture): the PRE-Z22-1 shape this fix removed — navigate straight to the real
  // url, purge on that already-staging page, then reload() it (a second navigation to the same url).
  // Not a call into loadPageOnce (there is nothing left in it that CAN do this) — a hand-built
  // fixture of the shape the fix retired, judged the same way, to prove the witness can fail.
  async function driveLegacy() {
    const page = mockPage(), lines = [];
    await page.goto(REAL_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => ({}));
    lines.push('§CLI_BAKE_SW_PURGE unregistered=1 cachesDeleted=1 controllerAtLoad=0 regs=[sw.js] — reloading so the bake runs THIS build, not the precached one');
    await page.reload({ waitUntil: 'domcontentloaded' });
    return { calls: page.calls, loadsCount: 2, lines };   // 2: the real page really was navigated to twice
  }

  function judge(d) {
    const rows = [];
    function row(name, got, want, ok) { rows.push({ name, got: String(got), want: String(want), ok: !!ok }); }
    const gotoReal = d.calls.filter(c => c.type === 'goto' && c.url === REAL_URL);
    const gotoPurge = d.calls.filter(c => c.type === 'goto' && c.url === PURGE_URL);
    const idxPurge = d.calls.findIndex(c => c.type === 'goto' && c.url === PURGE_URL);
    const idxEval = d.calls.findIndex(c => c.type === 'evaluate');
    const idxReal = d.calls.findIndex(c => c.type === 'goto' && c.url === REAL_URL);
    const idxReload = d.calls.findIndex(c => c.type === 'reload');
    row('exactly one goto() to the real URL', gotoReal.length, 1, gotoReal.length === 1);
    row('exactly one goto() to the purge landing page', gotoPurge.length, 1, gotoPurge.length === 1);
    row('purge goto precedes evaluate precedes the real goto',
      idxPurge + '<' + idxEval + '<' + idxReal, 'true (all >= 0, strictly increasing)',
      idxPurge >= 0 && idxEval > idxPurge && idxReal > idxEval);
    row('reload() is NEVER called', idxReload, -1, idxReload === -1);
    row('loadsCount === 1', d.loadsCount, 1, d.loadsCount === 1);
    row('log carries §CLI_BAKE_SW_PURGE', d.lines.some(l => /§CLI_BAKE_SW_PURGE/.test(l)), true, d.lines.some(l => /§CLI_BAKE_SW_PURGE/.test(l)));
    row('log carries §CLI_BAKE_LOADS count=1', d.lines.some(l => /§CLI_BAKE_LOADS count=1/.test(l)), true, d.lines.some(l => /§CLI_BAKE_LOADS count=1/.test(l)));
    return rows;
  }

  (async () => {
    const good = judge(await driveGood());
    good.forEach(r => console.log('  ' + (r.ok ? 'ok  ' : 'FAIL') + ' ' + r.name + ' got=' + r.got + ' want=' + r.want));
    console.log('§BAKE_LOADS_ONCE rows=' + good.length + ' pass=' + good.filter(r => r.ok).length);

    const legacy = judge(await driveLegacy());

    Witness('bake_loads_once')
      .population(() => good)
      .schema({ type: 'object', required: ['name', 'got', 'want', 'ok'],
        properties: { name: { type: 'string' }, got: { type: 'string' }, want: { type: 'string' }, ok: { type: 'boolean' } } })
      .invariant('every navigation-order row holds', rs => rs.every(r => r.ok))
      .redControl(() => legacy)   // the pre-fix shape must fail (no purge-first order, a reload(), loadsCount!=1)
      .run();
  })();
}
