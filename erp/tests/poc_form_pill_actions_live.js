// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser WIRING §-witness for FRONTEND_LANE_MASTER.md §OUTSTANDING item 5 (PROCESS +New/Save/Print
//   IN PILL FOR FORM VIEW). Spec: prompts/GRID_BATCH_FORM_PILL_SPEC.md item 5. Proves the LIVE idempiere.html
//   wires the relocated record toolbar onto the pill rail, form-view-gated:
//   (1) GRID view (or front door) → the three pills (pill-formnew/formsave/formproc) are OFF the bar (gate false);
//   (2) entering FORM view → the three pills mount (IdmpPillFormGate true, re-evaluated in renderBody);
//   (3) clicking Process ▶ opens #idmp-proc-ov listing the record's legal FSM actions (§FORM-PILL process-chooser);
//   (4) clicking New opens the CRUD ring (§FORM-PILL crud-ring); 0 pageerrors.
//   §-log first — READ tests/poc_form_pill_actions_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_form_pill_actions_live.js   (cwd = bim-ootb/erp)  → W-FORM-PILL-ACTIONS
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const FORM_PILLS = ['formnew', 'formsave', 'formproc'];
const mounted = (page) => page.evaluate((ids) => ids.filter(id => !!document.getElementById('pill-' + id)), FORM_PILLS);
// PillBuilder binds the action on 'pointerup' (not 'click') — a programmatic tap must dispatch a pointer sequence.
const tapPill = (page, id) => page.evaluate((pid) => {
  const b = document.getElementById('pill-' + pid); if (!b) return false;
  b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  return true;
}, id);

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  let logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(`http://localhost:${port}/idempiere.html?client=garden&window=167`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.click('#idmp-login-users .idmp-login-user:not(.disabled)');
  await page.waitForTimeout(400);
  await page.click('#idmp-login-ok');
  await page.waitForTimeout(1600);

  let pass = 0, fail = 0;
  const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

  // (1) GRID view → the three form-view pills are OFF the bar (gate false)
  const gridGate = await page.evaluate(() => (typeof window.IdmpPillFormGate === 'function') ? window.IdmpPillFormGate() : 'absent');
  const inGrid = await mounted(page);
  ok('GRID view: IdmpPillFormGate=false → formnew/formsave/formproc OFF the bar', gridGate === false && inGrid.length === 0, 'gate=' + gridGate + ' mounted=[' + inGrid.join(',') + ']');

  // (2) enter FORM view (click the first grid row) → the three pills mount
  await page.evaluate(() => { const tr = document.querySelector('.idmp-grid tbody tr'); if (tr) tr.click(); });
  await page.waitForTimeout(700);
  const formGate = await page.evaluate(() => window.IdmpPillFormGate());
  const inForm = await mounted(page);
  ok('FORM view: IdmpPillFormGate=true → all three pills mount', formGate === true && inForm.length === 3, 'gate=' + formGate + ' mounted=[' + inForm.join(',') + ']');

  // (3) click Process ▶ → chooser overlay lists the record's legal FSM actions
  logs = [];
  await tapPill(page, 'formproc');
  await page.waitForTimeout(400);
  const proc = await page.evaluate(() => {
    const ov = document.getElementById('idmp-proc-ov');
    return { present: !!ov, btns: ov ? ov.querySelectorAll('button').length : 0, text: ov ? ov.textContent.replace(/\s+/g, ' ').slice(0, 80) : '' };
  });
  const procLog = [...logs].reverse().find(l => l.startsWith('§FORM-PILL process-chooser')) || '(none)';
  console.log('§FORM-PILL ' + procLog);
  ok('Process ▶ pill opens the DocAction chooser (#idmp-proc-ov, ≥1 action)', proc.present && proc.btns >= 2, JSON.stringify({ btns: proc.btns, text: proc.text }));
  ok('§FORM-PILL process-chooser fired with a legal set', /legal=\[/.test(procLog), procLog);
  await page.evaluate(() => { const ov = document.getElementById('idmp-proc-ov'); if (ov) ov.remove(); });

  // (4) click New → the CRUD ring opens (§FORM-PILL crud-ring)
  logs = [];
  await tapPill(page, 'formnew');
  await page.waitForTimeout(900);
  const ringLog = [...logs].reverse().find(l => l.startsWith('§FORM-PILL crud-ring')) || '(none)';
  console.log('§FORM-PILL ' + ringLog);
  ok('New pill opens the CRUD ring (§FORM-PILL crud-ring)', /§FORM-PILL crud-ring/.test(ringLog), ringLog);

  // (5) no page errors
  ok('0 pageerrors', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : '');

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' W-FORM-PILL-ACTIONS: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); server.close(); process.exit(1); });
