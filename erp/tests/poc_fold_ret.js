// ⚠ DO NOT REMOVE — Scope guard
// Scope: §-witness for FOLD RETURN VALUE (CONSISTENCY_FINISH.md §K-4b, W-FOLD-RET).
//   PROVES the issue: "crudFoldBack/crudFoldForward logged success but returned undefined — a caller
//   could not tell whether the signed sidecar op-log really flipped or the fold ran dry." After the
//   fix both return Promise<boolean> and the §FOLD-BACK/§FOLD-FORWARD lines carry ok=Y|N:
//     §A TYPE — on a live glassbowl page, await crudFoldForward(...) resolves to a boolean.
//     §B LOG  — the §FOLD-* line for that call carries the matching ok= suffix.
//     §C COMPAT — poc_a_grail (the call-contract witness) still passes — callers that ignore the
//                 return are unaffected (run separately as regression).
//   §-log first — READ tests/poc_fold_ret.log before any conclusion.
// Run:  node tests/poc_fold_ret.js 2>&1 | tee tests/poc_fold_ret.log   (cwd = bim-ootb/erp)
'use strict';
let chromium;
try { ({ chromium } = require(__dirname + '/../../tests/node_modules/playwright')); }
catch (e) { ({ chromium } = require(process.env.HOME + '/bim-ootb/tests/node_modules/playwright')); }
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/glassbowl.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  ✗ FAIL: ' + m); } else { console.log('  ✓ ' + m); } };

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port, base = `http://localhost:${port}/glassbowl.html`;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  console.log('\n══ W-FOLD-RET — the fold engine reports whether the sidecar really flipped ══\n');

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.crudFoldForward === 'function', null, { timeout: 15000 });
  await page.waitForTimeout(800);

  const res = await page.evaluate(async () => {
    const r = {};
    r.fwd = await window.crudFoldForward('w_fold_ret_probe', 'CO');
    r.back = await window.crudFoldBack('w_fold_ret_probe', 'DR', 'CO');
    return { fwdType: typeof r.fwd, fwd: r.fwd, backType: typeof r.back, back: r.back };
  });
  console.log('§FOLD-RET fwd=' + res.fwd + ' (' + res.fwdType + ') back=' + res.back + ' (' + res.backType + ')');
  ok(res.fwdType === 'boolean', 'crudFoldForward resolves to a boolean (was undefined)');
  ok(res.backType === 'boolean', 'crudFoldBack resolves to a boolean (was undefined)');

  const fwdLog = logs.filter(l => l.indexOf('§FOLD-FORWARD key=w_fold_ret_probe') >= 0).slice(-1)[0] || '';
  const backLog = logs.filter(l => l.indexOf('§FOLD-BACK key=w_fold_ret_probe') >= 0).slice(-1)[0] || '';
  console.log('  ' + (fwdLog || '(no §FOLD-FORWARD)'));
  console.log('  ' + (backLog || '(no §FOLD-BACK)'));
  ok(new RegExp('ok=' + (res.fwd ? 'Y' : 'N')).test(fwdLog), '§FOLD-FORWARD log ok= matches the returned boolean');
  ok(new RegExp('ok=' + (res.back ? 'Y' : 'N')).test(backLog), '§FOLD-BACK log ok= matches the returned boolean');

  console.log('\n' + (fails === 0 && errs.length === 0 ? '🟢 W-FOLD-RET PASS' : '🔴 W-FOLD-RET FAIL (' + fails + ' asserts, ' + errs.length + ' pageErrors)')
    + ' — fold calls now answer "did the signed op-log really flip?". pageErrors=' + (errs.length ? errs.join('|') : 0));
  await browser.close();
  server.close();
  process.exit(fails === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
