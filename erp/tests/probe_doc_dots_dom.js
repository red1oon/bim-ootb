// ⚠ DO NOT REMOVE — DOM smoke (Playwright, WIRING check) for W-DOC-DOTS (HISTORY_SESSION_EVENTS.md §A1-DOC).
// Logic is proven in poc_doc_dots.js; THIS proves the live wiring on the real glassbowl.html: driving the
// __crud.applyOp commit funnel emits §DOC-DOT and the #scrub Z gains a labelled dot (page-local).
// Run: node tests/probe_doc_dots_dom.js   (server + chrome handled here; READ the log, not the exit code)
'use strict';
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8171;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let fail = 0;
function ok(c, m) { console.log((c ? '§W-DOC-DOTS-DOM PASS ' : '§W-DOC-DOTS-DOM FAIL ') + m); if (!c) fail++; }

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
    await page.goto('http://localhost:' + PORT + '/erp/glassbowl.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__crud && window.recordDocMoment, { timeout: 60000 })
      .catch(e => console.log('WAIT_FAIL ' + e.message));
    await sleep(1500);

    const r = await page.evaluate(() => {
      const dotsBefore = document.querySelectorAll('#scrub .scrubdot').length;
      const entry = { key: 'c_order', verbs: ['edit'], fields: [{ col: 'grandtotal', type: 'number' }] };
      const op = window.__crud.core.buildOp('update', entry, { grandtotal: '250' }, { grandtotal: '100' }, { id: 5 });
      window.__crud.applyOp(op, entry);
      const dotsAfter = document.querySelectorAll('#scrub .scrubdot').length;
      return { dotsBefore, dotsAfter };
    });
    const docDotLog = logs.find(l => l.includes('§DOC-DOT'));
    console.log('DOM: dots ' + r.dotsBefore + '→' + r.dotsAfter + ' log=' + (docDotLog || '(none)'));
    ok(!!docDotLog && /Save (Order|c_order)/.test(docDotLog), 'commit funnel emits §DOC-DOT "Save <friendly name>" on the live page');
    ok(r.dotsAfter === r.dotsBefore + 1, '#scrub Z gains exactly one dot: ' + r.dotsBefore + '→' + r.dotsAfter);
    console.log('--- PAGEERRORS ---');
    console.log(logs.filter(l => l.startsWith('PAGEERROR')).join('\n') || '(none)');
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(fail === 0 ? '§W-DOC-DOTS-DOM ALL PASS' : ('§W-DOC-DOTS-DOM ' + fail + ' FAILED'));
  process.exit(fail === 0 ? 0 : 1);
})();
