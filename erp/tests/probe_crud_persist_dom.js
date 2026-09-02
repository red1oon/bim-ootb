// ⚠ DO NOT REMOVE — DOM smoke (Playwright, BROWSER proof) for CRUD_EDIT_PERSIST.md Items 1+2.
// Logic is proven headless in scripts/poc_crud_persist.js (16/16); THIS closes the two gaps a node
// harness CANNOT reach, on the real glassbowl.html:
//   ITEM 1 — a REAL <input type=date>: the raw stored TIMESTAMP "2002-02-22 00:00:00" reads back BLANK
//            (reproduces the bug + emits the "does not conform" console warning); the normalized value
//            CORE.normDateValue produces reads back "2002-02-22" (the widget seeds — fix works).
//   ITEM 2 — drive the LIVE commit funnel __crud.applyOp(CRUD_UPDATE) → the REAL sql.js/KernelOps sidecar
//            persists the op; CORE.tipValues over __crud.kernelDb() returns the NEW value (read-the-tip).
// Self-contained: starts a static server for the worktree, launches headless chromium. READ the log.
// Run: node erp/tests/probe_crud_persist_dom.js   (from the bim-ootb worktree root)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const ROOT = path.join(__dirname, '..', '..');           // worktree root (serves /erp/glassbowl.html)
const PORT = process.env.PORT || 8231;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.css':'text/css',
               '.wasm':'application/wasm', '.db':'application/octet-stream', '.png':'image/png', '.svg':'image/svg+xml' };
function serve() {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const fp = path.join(ROOT, p);
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  }).listen(PORT);
}

let fail = 0;
function ok(c, m) { console.log((c ? '§W-CRUD-PERSIST-DOM PASS ' : '§W-CRUD-PERSIST-DOM FAIL ') + m); if (!c) fail++; }

(async () => {
  const server = serve();
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
    await page.goto('http://localhost:' + PORT + '/erp/glassbowl.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__crud && window.__crud.core && window.__crud.core.normDateValue,
                               { timeout: 60000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
    await sleep(1200);

    // ── ITEM 1 — a REAL <input type=date> in the live browser ───────────────────────────────────────
    const item1 = await page.evaluate(() => {
      const norm = window.__crud.core.normDateValue;
      const raw = '2002-02-22 00:00:00';
      // (a) the BUG: inject the raw stored timestamp → the browser REJECTS it → .value reads back ''.
      const bad = document.createElement('input'); bad.type = 'date'; bad.value = raw;
      document.body.appendChild(bad);
      const badRead = bad.value;
      // (b) the FIX: normalize first → the widget seeds, .value reads back the date.
      const good = document.createElement('input'); good.type = 'date'; good.value = norm('date', raw);
      document.body.appendChild(good);
      const goodRead = good.value;
      bad.remove(); good.remove();
      return { raw, badRead, normalized: norm('date', raw), goodRead };
    });
    console.log('§CRUD-DATE(dom) raw="' + item1.raw + '" rawWidgetReadsBack="' + item1.badRead + '" normalized="' + item1.normalized + '" fixedWidgetReadsBack="' + item1.goodRead + '"');
    ok(item1.badRead === '', 'control: raw timestamp blanks a real <input type=date> (the reported bug)');
    ok(item1.goodRead === '2002-02-22' && /^\d{4}-\d{2}-\d{2}$/.test(item1.goodRead),
       'normalized value seeds the real widget → reads back "2002-02-22" (fix works in-browser)');
    // Corroboration (NOT the test): Chromium MAY log "does not conform" for the raw value. It fires via
    // the HTML attribute parser, not reliably via the .value property setter — so it is informational.
    // The decisive root-cause proof is badRead==='' above (the real widget rejected the timestamp → blank).
    const conform = logs.find(l => /does not conform/.test(l));
    console.log('§CRUD-DATE(dom) corroboration: "does not conform" console warning ' + (conform ? 'emitted' : 'not emitted (setter path) — behavioral blank-readback is the proof'));

    // ── ITEM 2 — drive the live commit funnel; the real sidecar persists; read-the-tip returns NEW ───
    const item2 = await page.evaluate(async () => {
      const C = window.__crud.core;
      const E = { key: 'c_invoice', table: 'c_invoice', verbs: ['update'],
                  fields: [{ col: 'c_invoice_id', type: 'fk', readonly: true }, { col: 'description', type: 'string' }] };
      const op = C.buildOp('update', E, { c_invoice_id: 105, description: 'red1' },
                                          { c_invoice_id: 105, description: '(2)' }, { id: 105, opUuid: 'dom-inv-105' });
      window.__crud.applyOp(op, E);
      // commitCrud is async (withSidecar → commitGroup → persist). Poll the live sidecar for the tip.
      for (let i = 0; i < 50; i++) {
        const db = window.__crud.kernelDb();
        if (db) { const tip = C.tipValues(db, 'c_invoice', 105); if (tip.description) return { committed: op.op_type, tip: tip.description }; }
        await new Promise(r => setTimeout(r, 100));
      }
      return { committed: op.op_type, tip: '(none)' };
    });
    const persistLog = logs.find(l => l.includes('§CRUD-PERSIST'));
    console.log('§CRUD-PERSIST(dom) op=' + item2.committed + ' liveSidecarTip="' + item2.tip + '" log=' + (persistLog || '(none)'));
    ok(item2.tip === 'red1', 'live commit funnel persists CRUD_UPDATE → read-the-tip returns the NEW value "red1"');
    ok(!!persistLog && /source=sidecar/.test(persistLog), '§CRUD-PERSIST committed via the signed sidecar (not a dry-run)');

    console.log('--- PAGEERRORS ---');
    console.log(logs.filter(l => l.startsWith('PAGEERROR')).join('\n') || '(none)');
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(fail === 0 ? '§W-CRUD-PERSIST-DOM ALL PASS' : ('§W-CRUD-PERSIST-DOM ' + fail + ' FAILED'));
  process.exit(fail === 0 ? 0 : 1);
})();
