// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for BIM_EMBED_WINDOW_SESSION.md §B2 — W-BIM-EMBED (host side).
//   PROVES on iDempiere's own Project window (130), GardenWorld (client 11), via
//   ?client=garden&window=130&record=<pk>:
//     (A) PRESENT: project 101 (owns a BIM-set AD_Attachment) → the "Open Model" affordance mounts in the
//         form view (§BIM-EMBED affordance ... bimSet=present), keyed off the AD — no if-window==130.
//     (B) ABSENT (honest): project 100 (Standard, no BIM set) → NO affordance (bimSet=absent).
//     (C) MOUNT: clicking Open Model mounts the dock/float/max embed panel — #bim-embed-panel + an iframe
//         whose src carries the viewer URL + &embedded=true (chromeless). Controls present; state toggles.
//     (D) READY (best-effort): the embedded viewer posts {bim:ready} → §BIM-EMBED-READY. Headless WebGL may
//         not fully boot the 3D viewer — if ready doesn't arrive it is logged 🟡 (NOT a fail; host wiring is
//         what B2 proves; ready round-trip re-checked on a real browser).
//     0 pageerrors.
//   §-log first — READ tests/poc_bim_embed_live.log before any conclusion (exit code is NOT evidence).
// Run:  cd /tmp/wt-bimembed/erp && node tests/poc_bim_embed_live.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');   // worktree root — serves BOTH /erp and /viewer
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/erp/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

const log = [], errs = [];
let fails = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function soft(ok, label, detail) { S('   ' + (ok ? '🟢' : '🟡') + ' ' + label + (detail ? ' — ' + detail : '')); }

async function openAt(page, port, pk, win) {
  win = win || 130;
  await page.goto('http://127.0.0.1:' + port + '/erp/idempiere.html?login=GardenAdmin&window=' + win + '&record=' + pk,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);   // let auto-login → openWindow(win) → land-on-record → renderBody settle
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => log.push('  [console] ' + m.text()));
  page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });

  S('§W-BIM-EMBED (host side) — Open-Model affordance + embed panel on iDempiere Project window 130');

  // ── (A) PRESENT on project 101 ───────────────────────────────────────────
  await openAt(page, port, 101);
  const aff101 = log.some(l => /§BIM-EMBED affordance .*record=101 .*bimSet=present/.test(l));
  const btn101 = await page.evaluate(() => !!document.querySelector('.idmp-bim-open'));
  if (btn101) { try { await page.screenshot({ path: require('os').homedir() + '/Pictures/Screenshots/bim_embed_b2_form.png' }); } catch (e) {} }
  verdict(aff101, 'project 101 → §BIM-EMBED affordance bimSet=present');
  verdict(btn101, 'project 101 → "Open Model" button rendered in the form');

  // ── (C) MOUNT: click Open Model → embed panel + iframe(embedded=true) ─────
  let mounted = { panel:false, src:'', ctrls:0 };
  if (btn101) {
    await page.evaluate(() => document.querySelector('.idmp-bim-open').click());
    await page.waitForTimeout(1500);
    mounted = await page.evaluate(() => {
      const p = document.getElementById('bim-embed-panel');
      const f = document.getElementById('bim-panel-frame');
      return { panel: !!p, src: f ? f.getAttribute('src') : '', ctrls: p ? p.querySelectorAll('.bim-panel-btn').length : 0 };
    });
  }
  verdict(mounted.panel, 'Open Model → embed panel mounted (#bim-embed-panel)');
  verdict(/embedded=true/.test(mounted.src) && /Hospital/.test(mounted.src),
    'iframe src = viewer URL + &embedded=true (chromeless)', mounted.src);
  verdict(mounted.ctrls >= 5, 'panel controls present (dock/float/max/popout/close)', 'count=' + mounted.ctrls);

  // ── (D) READY (best-effort) ───────────────────────────────────────────────
  await page.waitForTimeout(3500);
  try { await page.screenshot({ path: require('os').homedir() + '/Pictures/Screenshots/bim_embed_b2_panel.png' }); } catch (e) {}
  const ready = log.some(l => /§BIM-EMBED-READY/.test(l));
  soft(ready, 'embedded viewer posted {bim:ready} (headless WebGL may skip — host wiring proven regardless)');

  // ── (B) ABSENT on project 100 ─────────────────────────────────────────────
  await openAt(page, port, 100);
  const aff100present = log.some(l => /§BIM-EMBED affordance .*record=100 .*bimSet=present/.test(l));
  const aff100absent = log.some(l => /§BIM-EMBED affordance .*record=100 .*bimSet=absent/.test(l));
  const btn100 = await page.evaluate(() => !!document.querySelector('.idmp-bim-open'));
  verdict(!aff100present && !btn100, 'project 100 (Standard) → NO affordance (honest absent)',
    aff100absent ? 'logged bimSet=absent' : 'no affordance log');

  // ── (B4) GENERALITY: a SECOND, non-Project table lights up from an AD flag alone (ZERO new render code) ──
  await openAt(page, port, 103, 139);   // M_Warehouse "HQ Warehouse", window 139 (Warehouse and Locators)
  const affWh = log.some(l => /§BIM-EMBED affordance .*record=103 .*bimSet=present/.test(l));
  const btnWh = await page.evaluate(() => !!document.querySelector('.idmp-bim-open'));
  const whUrl = await page.evaluate(() => { var b = document.querySelector('.idmp-bim-open'); return b ? b.title : ''; });
  verdict(affWh && btnWh, 'M_Warehouse 103 (window 139) → "Open Model" lights from the AD flag alone (B4 generality)',
    whUrl || '');

  // ── pageerrors ────────────────────────────────────────────────────────────
  verdict(errs.length === 0, '0 pageerrors', errs.length ? errs.slice(0, 3).join(' | ') : 'clean');

  const pass = fails === 0;
  S('\n§W-BIM-EMBED ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ') — host-side affordance+panel proven on iDempiere; ' +
    'highlight/focusRecord round-trip = B3');
  fs.writeFileSync(path.join(__dirname, 'poc_bim_embed_live.log'), log.join('\n'));
  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})();
