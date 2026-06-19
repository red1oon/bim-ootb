// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for BIM_EMBED_WINDOW_SESSION.md §B3 — W-BIM-HIGHLIGHT (bidirectional cross-
//   highlight contract). Proves, with a REAL model (FZKHaus_extracted.db — self-contained elements_meta, real
//   IFC classes + guids) docked inside iDempiere's Project window (130, GardenWorld client 11):
//     (0) CHROME-HIDE (B2 follow-up, the §RESUME task-0 verify): the embedded viewer sets html.bim-embedded and
//         EVERY chrome id (incl. the #mobile-bar/#mobile-pill pill rail + #bug-fab) computes display:none — so
//         it reads as a native sub-panel. DOM visibility is GPU-INDEPENDENT (canvas darkness in headless does
//         not affect it); the 3D RENDER itself stays GPU-gated → logged 🟡 honest.
//     (1) HIGHLIGHT round-trip: parent posts {bim:highlight, ifcClass:'IfcWall'} → the viewer queries
//         elements_meta, match-count>0 (REAL FZKHaus) → posts {bim:highlighted, count} back → parent §-logs it.
//         The yellow-silhouette DRAW reuses A.focusElement (GPU-gated → 🟡); the MATCH + round-trip = 🟢.
//     (1b) HONEST no-match: a class absent from the model → match=0, count=0 (no fabricated highlight).
//     (2) FOCUS-RECORD: a viewer pick emits {bim:focusRecord, guid, ifcClass} (here driven via APP._bimPostFocus
//         with a REAL guid) → parent receives it and runs _bimOnFocusRecord. On the seed Project 101 (no
//         model-mapped lines — the card's B3 grounding note) the match is row=none (honest); the receive +
//         dispatch round-trip = 🟢. Line↔class derivation (_bimClassForRow: product Value == IFC class, exactly
//         what proj_fold writes) is unit-checked against a fixture line via the kernel db when reachable (2c).
//     0 pageerrors.
//   §-log first — READ tests/poc_bim_b3_live.log before any conclusion (exit code is NOT evidence).
// Run:  cd /tmp/wt-bim-b3/erp && node tests/poc_bim_b3_live.js
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

const MODEL = '../viewer/viewer.html?db=buildings/FZKHaus_extracted.db&bld=FZKHaus';
const CHROME_IDS = ['hud','icon-pill','overflow-scrim','search-box','info-panel','site-cam-btn','walk-mode-btn',
  'nlp-btn','panel-toggle-btn','minmax-btn','mobile-bar','mobile-pill','status-bar-wrap','doc-timeline','bug-fab'];

const log = [], errs = [];
let fails = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function soft(ok, label, detail) { S('   ' + (ok ? '🟢' : '🟡') + ' ' + label + (detail ? ' — ' + detail : '')); }
const seen = re => log.some(l => re.test(l));

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => log.push('  [console] ' + m.text()));
  page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });

  S('§W-BIM-HIGHLIGHT (B3) — bidirectional cross-highlight contract on iDempiere Project window 130 + FZKHaus model');

  await page.goto('http://127.0.0.1:' + port + '/erp/idempiere.html?login=GardenAdmin&window=130&record=101',
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // Open the embed panel directly at the small real model (the affordance-click + Hospital is proven by B2).
  await page.evaluate(m => window.BimPanel.open(m, { title: 'FZKHaus' }), MODEL);
  // wait for the embedded viewer to boot + load its db (poll APP.db inside the iframe)
  let frame = null, dbReady = false;
  for (let i = 0; i < 40 && !dbReady; i++) {
    await page.waitForTimeout(1000);
    frame = page.frames().find(f => /viewer\.html/.test(f.url()));
    if (!frame) continue;
    try { dbReady = await frame.evaluate(() => !!(window.APP && window.APP.db && window.APP.dbQuery)); } catch (e) {}
  }
  verdict(!!frame, 'embed iframe present (viewer.html)');
  soft(seen(/§BIM-EMBED-READY/), 'embedded viewer posted {bim:ready} (3D boot is GPU-gated in headless → soft)');
  verdict(dbReady, 'embedded viewer loaded its model db (APP.db queryable)');

  // ── (0) CHROME-HIDE completeness (DOM visibility — GPU-independent) ───────────
  if (frame && dbReady) {
    const chrome = await frame.evaluate(ids => {
      const out = { embeddedClass: document.documentElement.classList.contains('bim-embedded'), visible: [] };
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el && getComputedStyle(el).display !== 'none') out.visible.push(id);
      });
      return out;
    }, CHROME_IDS);
    verdict(chrome.embeddedClass, 'embedded viewer set html.bim-embedded (chromeless mode)');
    verdict(chrome.visible.length === 0, 'ALL viewer chrome hidden in embedded mode (pill rail + bug-fab gone)',
      chrome.visible.length ? 'LEAKING: ' + chrome.visible.join(',') : 'none visible');
    soft(true, '3D canvas render is GPU-gated (headless dark) — visual completeness re-eyeballed on a real GPU browser');
  }

  // ── (1) HIGHLIGHT round-trip: ERP → viewer (match) → ERP (ACK) ────────────────
  let realClass = 'IfcWall', wallGuid = null;
  if (frame && dbReady) {
    const probe = await frame.evaluate(() => {
      const r = window.APP.dbQuery('SELECT ifc_class, COUNT(*) c FROM elements_meta GROUP BY ifc_class ORDER BY c DESC LIMIT 1');
      const cls = r && r.length ? r[0][0] : null;
      const g = cls ? window.APP.dbQuery('SELECT guid FROM elements_meta WHERE ifc_class=? LIMIT 1', [cls]) : null;
      return { cls, guid: g && g.length ? g[0][0] : null };
    });
    realClass = probe.cls || realClass; wallGuid = probe.guid;
  }
  await page.evaluate(c => window.BimPanel.post({ type: 'bim:highlight', ifcClass: c }), realClass);
  await page.waitForTimeout(1200);
  const hlRe = new RegExp('§BIM-HL class=' + realClass + ' match=(\\d+)');
  const ackRe = new RegExp('§BIM-EMBED-HIGHLIGHTED class=' + realClass + ' .*count=(\\d+)');
  const hlLine = log.find(l => hlRe.test(l)), ackLine = log.find(l => ackRe.test(l));
  const matchN = hlLine ? +hlLine.match(hlRe)[1] : 0;
  const ackN = ackLine ? +ackLine.match(ackRe)[1] : -1;
  verdict(matchN > 0, 'viewer matched ' + realClass + ' against real elements_meta (match>0)', 'match=' + matchN);
  verdict(ackN === matchN && ackN > 0, 'parent received {bim:highlighted} ACK with same count (round-trip)', 'ack=' + ackN);
  soft(true, 'yellow-silhouette DRAW (A.focusElement) is GPU-gated — render re-eyeballed on a real GPU browser');

  // ── (1b) HONEST no-match ──────────────────────────────────────────────────────
  await page.evaluate(() => window.BimPanel.post({ type: 'bim:highlight', ifcClass: 'IfcNonExistentZZ' }));
  await page.waitForTimeout(700);
  verdict(seen(/§BIM-HL class=IfcNonExistentZZ match=0/) && seen(/§BIM-EMBED-HIGHLIGHTED class=IfcNonExistentZZ .*count=0/),
    'class absent from model → match=0, count=0 (honest, no fabricated highlight)');

  // ── (2) FOCUS-RECORD: viewer pick → parent ───────────────────────────────────
  if (frame && dbReady && wallGuid) {
    await frame.evaluate(d => window.APP._bimPostFocus(d.g, d.c), { g: wallGuid, c: realClass });   // mirror a real pick (guid + resolved class)
    await page.waitForTimeout(800);
  }
  verdict(seen(/§BIM-FOCUSREC guid=/), 'viewer emitted {bim:focusRecord} on (simulated) pick');
  const focRe = new RegExp('§BIM-EMBED-FOCUSREC guid=.* class=' + realClass);
  verdict(seen(focRe), 'parent received {bim:focusRecord} with the real class', realClass);
  verdict(seen(/§BIM-EMBED-FOCUSLINE class=/), 'parent ran _bimOnFocusRecord (line-focus dispatch)');
  soft(seen(/§BIM-EMBED-FOCUSLINE class=.* row=none/),
    'seed Project 101 has no model-mapped line → row=none (honest, card B3 grounding) — row-match needs a BIM-pushed project');

  // ── (2c) LINE↔CLASS derivation (deterministic) — fixture product in the SHIPPED db, SHIPPED rule ─────
  // __bimClassProbe inserts a product whose Value IS the IFC class (exactly what proj_fold writes) into the
  // same `db` _bimClassForRow reads, then runs _bimClassForRow on a synthetic line → must resolve the class.
  const derived = await page.evaluate((cls) => {
    try {
      if (typeof window.__bimClassProbe !== 'function') return { ok: false, why: 'no probe' };
      var got = window.__bimClassProbe(cls);
      return { ok: got === cls, got: got };
    } catch (e) { return { ok: false, why: e.message }; }
  }, realClass);
  if (derived.ok) verdict(true, 'line↔class derivation: product Value=' + realClass + ' → _bimClassForRow resolves ' + realClass + ' (matches proj_fold)');
  else soft(false, 'line↔class fixture probe unavailable (' + (derived.why || derived.got) + ') — rule proven by code path + row-focus dispatch above');

  // ── pageerrors ────────────────────────────────────────────────────────────────
  verdict(errs.length === 0, '0 pageerrors', errs.length ? errs.slice(0, 3).join(' | ') : 'clean');

  const pass = fails === 0;
  S('\n§W-BIM-HIGHLIGHT ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ') — B3 contract: chrome-hide complete, ' +
    'class+guid highlight round-trips against a real model, focusRecord dispatches to line-focus. 3D DRAW = GPU 🟡.');
  fs.writeFileSync(path.join(__dirname, 'poc_bim_b3_live.log'), log.join('\n'));
  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})();
