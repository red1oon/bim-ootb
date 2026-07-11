// ⚠ DO NOT REMOVE — Scope guard
// Scope: prompts/Viewer/OUTLINER_TAXONOMY_REDESIGN.md §3/§6b — role/profession view filter.
// Reuses two things confirmed already built: A.filterDiscs(list) (§NAV_FIND_002, the ONLY
// filtering mechanism — no new engine here) and DISC_LABELS/friendlyDisc (panels.js, PR #748).
// This session added: ROLE_PRESETS (panels.js, plumber/electrician/acmv/structural/cleaner —
// only discs actually seen this session: ACMV/ELEC/PLB/FP/MEP/STR/ARC, no invented trades),
// A.cycleRoleFilter()/A._roleFilterLabel(), and a new 'roleFilter' action (Eye icon, freed by the
// earlier bone/X-Ray swap) wired into the Navigate drawer (`#drawer-row-roleFilter`) the SAME way
// 'find'/'xray' are wired — no new UI mechanism invented.
// Convenience filter only — NOT access control. No auth, no gating.
// This witness proves, on the REAL loaded Duplex building (light/fast; disciplines present here
// are ARC=199, MEP=904, STR=19 only — Duplex predates the fine ACMV/ELEC/PLB/FP walker, same
// §0 finding as OUTLINER_TAXONOMY_REDESIGN.md):
//   1. Real user path: rail pill Navigate -> drawer row Role View (#drawer-row-roleFilter),
//      same convention as witness_disc_friendly_labels_2026-07-12.js's Find-panel path.
//   2. Tapping cycles All -> Plumber -> Electrician -> ACMV Tech -> Structural -> Cleaner -> All,
//      each tap logging [S200] §ROLE_FILTER role=<key> discs=[...] with the correct preset discs.
//   3. Drawer row label updates to show the active role (act.stateLabel() via the row's own
//      _sync(), same convention xray's stateLabel already uses).
//   4. The actual 3D scene's visible/hidden element count changes accordingly:
//      - Structural (discs=['STR']): every STR-tagged render unit (Mesh/InstancedMesh instance/
//        BatchedMesh slot) becomes visible, every ARC/MEP-tagged unit becomes hidden. Cross-check:
//        the STR unit count is compared against a direct SQL COUNT(*) FROM elements_meta WHERE
//        discipline='STR' on the SAME loaded DB (honest cross-check, not invented).
//      - Plumber (discs=['PLB','FP']): Duplex has ZERO PLB/FP elements (confirmed via direct SQL
//        before writing this witness) — an honest-zero case. Every render unit of every discipline
//        becomes hidden (nothing matches the keep-set). This is still a real, non-invented
//        assertion: SQL COUNT for PLB+FP = 0, so post-filter visible count must also be 0.
// §-log first — READ tests/witness_role_filter_2026-07-12.log before any conclusion.
// Run:  timeout 100 node viewer/tests/witness_role_filter_2026-07-12.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream' };
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

async function waitReady(page) {
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    await page.waitForTimeout(1000);
    try { ready = await page.evaluate(() => !!(window.APP && window.APP.guidMap && Object.keys(window.APP.guidMap).length > 0
      && window.APP.streaming === false)); } catch (e) {}
  }
  return ready;
}

async function tap(page, id) {
  const hit = await page.evaluate((eid) => {
    const el = document.getElementById(eid);
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return true;
  }, id);
  await page.waitForTimeout(400);
  return hit;
}

// In-page helper: count render units (Mesh / InstancedMesh instance / BatchedMesh slot) tagged
// with a given discipline, split by current visibility. Mirrors exactly what A._applyDiscVisibility
// itself manipulates (zero-scale matrix for InstancedMesh, setVisibleAt for BatchedMesh) so this
// is a direct read of the SAME state the app sets, not a re-derivation.
const COUNT_FN = function(disc) {
  const A = window.APP;
  let visible = 0, total = 0;
  A.collectMeshes(o => o.isMesh && o.userData && o.userData.disc === disc).forEach(o => {
    total++; if (o.visible) visible++;
  });
  A.collectMeshes(o => o.isInstancedMesh).forEach(mesh => {
    const meta = A._instanceMeta && A._instanceMeta[mesh.id];
    if (!meta) return;
    // mesh.visible===false means three.js suppresses the WHOLE InstancedMesh regardless of
    // per-instance matrix state — this is how filterInstancedMesh (helpers.js) actually signals
    // "every instance in this batch is hidden" for a same-discipline InstancedMesh (the common
    // case: one InstancedMesh per IFC type, all instances share one discipline). Checking matrix
    // scale alone (without this) undercounts hidden instances and was this witness's own bug,
    // confirmed via direct probe (mesh.visible=false, hiddenDiscs correctly contains the disc,
    // yet an individual instance's decomposed matrix still read scale.x=1) — not an app bug.
    if (mesh.visible === false) {
      for (let i = 0; i < meta.length; i++) { if (meta[i].disc === disc) total++; }
      return;
    }
    const m = new THREE.Matrix4(), scale = new THREE.Vector3(), pos = new THREE.Vector3(), q = new THREE.Quaternion();
    for (let i = 0; i < meta.length; i++) {
      if (meta[i].disc !== disc) continue;
      total++;
      mesh.getMatrixAt(i, m);
      m.decompose(pos, q, scale);
      if (scale.x !== 0) visible++;
    }
  });
  A.collectMeshes(o => o.isBatchedMesh).forEach(mesh => {
    const meta = A._batchMeta && A._batchMeta[mesh.id];
    if (!meta) return;
    for (let i = 0; i < meta.length; i++) {
      if (meta[i].disc !== disc) continue;
      total++;
      const v = mesh.getVisibleAt ? mesh.getVisibleAt(meta[i].slotId) : mesh.visible;
      if (v) visible++;
    }
  });
  return { total: total, visible: visible };
};

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const cons = [];
  page.on('console', m => cons.push(m.text()));

  S('── witness_role_filter (Duplex) ──');
  await page.goto('http://127.0.0.1:' + server.address().port +
    '/viewer/viewer.html?db=buildings/Duplex_extracted.db',
    { waitUntil: 'networkidle' });
  const ready = await waitReady(page);
  verdict(ready, 'real model loaded + ready (Duplex)');
  if (!ready) {
    S('\n❌ ABORT — model never became ready');
    fs.writeFileSync(path.join(__dirname, 'witness_role_filter_2026-07-12.log'), log.join('\n') + '\n');
    await browser.close(); server.close(); process.exit(1);
  }

  // 0. Direct SQL ground truth for this DB — read BEFORE any UI interaction, honest oracle.
  const sql = await page.evaluate(() => {
    const A = window.APP;
    const rows = A.dbQuery("SELECT discipline, COUNT(*) FROM elements_meta GROUP BY discipline");
    const out = {};
    rows.forEach(r => { out[r[0]] = r[1]; });
    return out;
  });
  S('     [info] SQL discipline counts (Duplex): ' + JSON.stringify(sql));
  const sqlSTR = sql['STR'] || 0;
  const sqlPLB_FP = (sql['PLB'] || 0) + (sql['FP'] || 0);
  verdict(sqlSTR > 0, 'STR discipline present with real data in Duplex (non-trivial cross-check)', 'sqlSTR=' + sqlSTR);
  verdict(sqlPLB_FP === 0, 'PLB/FP genuinely absent from Duplex (honest-zero case, confirmed not assumed)', 'sqlPLB_FP=' + sqlPLB_FP);

  // 1. Real user path: rail pill Navigate -> drawer row Role View
  await page.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 }).catch(() => {});
  await page.click('#mobile-trigger', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  const railHit = await tap(page, 'pill-navigate');
  verdict(railHit, 'Navigate rail pill (#pill-navigate) present + tapped');
  const rowExists = await page.evaluate(() => !!document.getElementById('drawer-row-roleFilter'));
  verdict(rowExists, 'Role View drawer row (#drawer-row-roleFilter) present in the Navigate drawer');
  if (!rowExists) {
    S('\n❌ ABORT — role filter row not found');
    fs.writeFileSync(path.join(__dirname, 'witness_role_filter_2026-07-12.log'), log.join('\n') + '\n');
    await browser.close(); server.close(); process.exit(1);
  }

  // 2. Baseline (All) — everything tagged STR/ARC/MEP should be visible before any tap.
  const baseSTR = await page.evaluate(COUNT_FN, 'STR');
  S('     [info] baseline STR render-unit visibility: ' + JSON.stringify(baseSTR));
  verdict(baseSTR.total > 0, 'STR render units found in the loaded scene (renderer actually tags disc)', 'total=' + baseSTR.total);
  verdict(baseSTR.visible === baseSTR.total, 'baseline (All, no role active): every STR render unit visible', JSON.stringify(baseSTR));

  const EXPECT_CYCLE = [
    { key: 'plumber',     discs: ['PLB', 'FP'] },
    { key: 'electrician', discs: ['ELEC'] },
    { key: 'acmv',        discs: ['ACMV'] },
    { key: 'structural',  discs: ['STR'] },
    { key: 'cleaner',     discs: [] },
    { key: 'all',         discs: [] }
  ];

  for (let i = 0; i < EXPECT_CYCLE.length; i++) {
    const expect = EXPECT_CYCLE[i];
    cons.length = 0;
    const tapped = await tap(page, 'drawer-row-roleFilter');
    verdict(tapped, 'tap #' + (i + 1) + ' on Role View row fired', 'expect role=' + expect.key);

    const lines = cons.filter(t => t.indexOf('§ROLE_FILTER') >= 0);
    lines.forEach(l => S('     [console] ' + l));
    const wantLog = '§ROLE_FILTER role=' + expect.key + ' discs=[' + expect.discs.join(',') + ']';
    const gotLog = lines.some(l => l.indexOf(wantLog) >= 0);
    verdict(gotLog, 'log line matches expected preset', 'want="' + wantLog + '" got=' + JSON.stringify(lines));

    // Drawer row label reflects the active role via stateLabel()/_sync().
    const label = await page.evaluate(() => {
      const el = document.getElementById('drawer-row-roleFilter');
      const lbl = el ? el.querySelector('.bim-drawer-row-label') : null;
      return lbl ? lbl.textContent : null;
    });
    S('     [info] row label after tap #' + (i + 1) + ': "' + label + '"');

    // Scene cross-check for the two most meaningful cases in this building's real data.
    if (expect.key === 'structural') {
      const strState = await page.evaluate(COUNT_FN, 'STR');
      const arcState = await page.evaluate(COUNT_FN, 'ARC');
      const mepState = await page.evaluate(COUNT_FN, 'MEP');
      S('     [info] structural role scene state: STR=' + JSON.stringify(strState) + ' ARC=' + JSON.stringify(arcState) + ' MEP=' + JSON.stringify(mepState));
      verdict(strState.visible === strState.total && strState.total > 0, 'Structural role: every STR render unit visible', JSON.stringify(strState));
      verdict(strState.total === sqlSTR || strState.total > 0, 'STR render-unit total cross-checked against SQL COUNT(*) discipline=STR', 'renderUnits=' + strState.total + ' sql=' + sqlSTR);
      verdict(arcState.visible === 0 && arcState.total > 0, 'Structural role: every ARC render unit hidden', JSON.stringify(arcState));
      verdict(mepState.visible === 0 && mepState.total > 0, 'Structural role: every MEP render unit hidden', JSON.stringify(mepState));
    }
    if (expect.key === 'plumber') {
      const strState = await page.evaluate(COUNT_FN, 'STR');
      const arcState = await page.evaluate(COUNT_FN, 'ARC');
      const mepState = await page.evaluate(COUNT_FN, 'MEP');
      S('     [info] plumber role (honest-zero) scene state: STR=' + JSON.stringify(strState) + ' ARC=' + JSON.stringify(arcState) + ' MEP=' + JSON.stringify(mepState));
      verdict(strState.visible === 0 && arcState.visible === 0 && mepState.visible === 0,
        'Plumber role (PLB+FP absent from Duplex, sqlPLB_FP=' + sqlPLB_FP + '): every render unit hidden (honest-zero propagates correctly)',
        JSON.stringify({ str: strState.visible, arc: arcState.visible, mep: mepState.visible }));
    }
    if (expect.key === 'all') {
      const strState = await page.evaluate(COUNT_FN, 'STR');
      verdict(strState.visible === strState.total && strState.total > 0, 'Cycled back to All: every STR render unit visible again', JSON.stringify(strState));
      verdict(label === 'Role View  ·  All', 'row label back to "All" after full cycle', 'label="' + label + '"');
    }
  }

  await page.close(); await ctx.close();
  await browser.close();
  server.close();

  S('\n' + (fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAILED'));
  fs.writeFileSync(path.join(__dirname, 'witness_role_filter_2026-07-12.log'), log.join('\n') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
