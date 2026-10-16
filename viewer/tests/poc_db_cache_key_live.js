// ⚠ DO NOT REMOVE — Scope guard — W-DB-CACHE-KEY (live half)
// Scope: real-browser §-witness for the reported bug — "the ERP red pill re-fetches the same building
//   that is already in IndexedDB". Spec: prompts/HISTORY_PERSIST_RECALL.md §VERIFY-FIRST ITEM 1.
//   Against the REAL viewer.html + the REAL scene.js cachedFetch + a REAL building
//   (HHS_Office_Federated_extracted.db, 75MB, the largest checked in) — no mock, no stub.
//   ISSUE PROVED: the landing opens a building with one url form ('<prodBase>buildings/X') and the ERP
//   red pill opens the SAME building with another ('../buildings/X'). Keyed on the raw url, load #2
//   MISSED and re-downloaded the whole file. Both loads here run in ONE browser context so IndexedDB
//   carries over exactly as it does for a real user opening a second tab.
//   ASSERTS:
//     - load #1 (form A) → §CACHE_MISS_READ then §CACHE_WRITE_OK (cold, as expected)
//     - load #2 (form B, SAME bytes, different url string) → §CACHE_HIT, and §CACHE_KEY shows both
//       forms folding onto 'buildings/<file>'
//     - load #2 issues ZERO network requests for the .db — the number that IS the bug (0, not 75MB)
//     - 0 pageerrors on both loads
//   §-log first — READ viewer/tests/poc_db_cache_key_live.log before any conclusion (exit code is NOT evidence).
// Run:  node viewer/tests/poc_db_cache_key_live.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DBFILE = 'HHS_Office_Federated_extracted.db';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.bin': 'application/octet-stream', '.png': 'image/png',
  '.css': 'text/css', '.wasm': 'application/wasm', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

const log = [];
let fails = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(async () => {
  await new Promise(r => server.listen(0, r));
  const PORT = server.address().port;
  S('§CACHEKEY_LIVE server=http://localhost:' + PORT + ' db=' + DBFILE);

  const browser = await chromium.launch();
  // ONE context for both loads — IndexedDB persists across page.goto exactly like a real second tab.
  const ctx = await browser.newContext();

  // The two url forms a real user actually produces. Both resolve to the same file on this server:
  //   A = the landing/hub form (index.html:489 builds an absolute base + 'buildings/<file>')
  //   B = the ERP red-pill form (erp/idempiere.html:4716 builds '../buildings/<file>')
  const FORMS = [
    { id: 'A-landing', db: 'http://localhost:' + PORT + '/buildings/' + DBFILE },
    { id: 'B-redpill', db: '../buildings/' + DBFILE }
  ];

  const runs = [];
  for (const form of FORMS) {
    const page = await ctx.newPage();
    const lines = [], errs = [];
    let dbRequests = 0;
    page.on('console', m => lines.push(m.text()));
    page.on('pageerror', e => errs.push(e.message));
    page.on('request', r => { if (r.url().split('?')[0].endsWith(DBFILE)) dbRequests++; });

    const url = 'http://localhost:' + PORT + '/viewer/viewer.html?db=' + encodeURIComponent(form.db) + '&bld=HHS_Office_Federated';
    S('\n§CACHEKEY_LIVE load ' + form.id + ' → ?db=' + form.db);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    // Wait for the cache decision to be logged (hit or miss), then let the write settle.
    await page.waitForFunction(() => true, null, { timeout: 1000 }).catch(() => {});
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if (lines.some(l => /§CACHE_HIT|§CACHE_WRITE_OK|§CACHE_KEY_LEGACY_HIT|§CACHE_SKIP|§CACHE_EVICT_WRITE_FAIL/.test(l))) break;
      await new Promise(r => setTimeout(r, 500));
    }
    await new Promise(r => setTimeout(r, 2000));

    const cacheLines = lines.filter(l => /§CACHE_|§PERSIST|§DB_SIZE_CHECK/.test(l));
    cacheLines.forEach(l => S('   | ' + l));
    runs.push({ id: form.id, lines, errs, dbRequests, cacheLines });
    verdict(errs.length === 0, form.id + ' 0 pageerrors', errs.length ? errs[0] : '');
    await page.close();
  }

  const [a, b] = runs;
  S('\n§CACHEKEY_LIVE VERDICT');
  // Load #1 — cold, as expected. If this is already a hit the test proved nothing.
  verdict(a.lines.some(l => /§CACHE_MISS_READ/.test(l) && l.includes(DBFILE)),
    'load A (landing form) is COLD (§CACHE_MISS_READ)');
  verdict(a.lines.some(l => /§CACHE_WRITE_OK/.test(l)), 'load A wrote the blob (§CACHE_WRITE_OK)');
  verdict(a.dbRequests > 0, 'load A downloaded the .db', 'requests=' + a.dbRequests);

  // Load #2 — THE BUG. Different url string, same building. Must hit, must not touch the network.
  const bHit = b.lines.some(l => /§CACHE_HIT/.test(l) && l.includes(DBFILE)) ||
               b.lines.some(l => /§CACHE_KEY_LEGACY_HIT/.test(l) && l.includes(DBFILE));
  verdict(bHit, 'load B (red-pill form) HIT the cache written by load A',
    bHit ? '' : 'this is the reported bug: a second url form re-downloads the whole building');
  verdict(b.dbRequests === 0, 'load B made ZERO network requests for the .db',
    'requests=' + b.dbRequests + ' (was the full re-download before the fix)');
  verdict(!b.lines.some(l => /§CACHE_MISS_READ/.test(l) && l.includes(DBFILE)),
    'load B logged no §CACHE_MISS_READ for the building');
  const keyLine = b.lines.find(l => /§CACHE_KEY /.test(l) && l.includes(DBFILE));
  verdict(!!keyLine && /key=buildings\//.test(keyLine || ''),
    'load B folded onto the canonical key', keyLine || 'no §CACHE_KEY line');

  S('\n§CACHEKEY_LIVE-SUMMARY fails=' + fails);
  fs.writeFileSync(path.join(__dirname, 'poc_db_cache_key_live.log'), log.join('\n') + '\n');
  await browser.close(); server.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('§CACHEKEY_LIVE FATAL ' + e.message); server.close(); process.exit(1); });
