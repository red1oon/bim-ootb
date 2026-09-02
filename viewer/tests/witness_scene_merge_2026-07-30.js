// ⚠ DO NOT REMOVE — Scope guard
// W-SCENE-MERGE — prompts/LANDING_MULTIMERGE_SAVEOPEN_RESURRECT.md §SM-3 / §SM-4 / §SM-7.2
//
// THE ISSUE THIS TEST EXPOSES: File Open used to `location.assign()` (scene.js, the old line 758).
// The page navigated, the scene was destroyed and rebuilt, and that — not memory, not a data limit —
// is why opening a second file reset the canvas. This witness proves the navigation was REPLACED,
// not papered over, and that the second building really joins the LIVE scene.
//
// Asserted programmatically from § log lines + live object state (no screenshots, per CLAUDE.md
// FUNDAMENTAL LAW). Test data: Duplex_extracted.db (A, 1119 el, 1 building) then
// Clinic_extracted.db (B, 16114 el, FIVE discipline buildings — the KUL070 shape).
//
// PHASE 1  Open A, Open→Merge B                → no navigation, centres 1→6, arithmetic, both rendered
// PHASE 2  Open→Merge the SAME B again         → INSERT OR IGNORE dedup: added=0, totals unchanged
// PHASE 3  Open→Esc (New)                      → today's replace/navigate path still intact
//
// §-log first — READ tests/witness_scene_merge_2026-07-30.log before any conclusion.
// Run:  timeout 900 node viewer/tests/witness_scene_merge_2026-07-30.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
// Duplex/Clinic are gitignored, so they live only in the primary checkout. Serve them as a FALLBACK
// root — never symlinked into the worktree (feedback_never_symlink_into_repo_worktree).
const DATA_ROOT = '/home/red1/bim-ootb';
const CLINIC = path.join(DATA_ROOT, 'buildings', 'Clinic_extracted.db');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream' };
const served = {};   // url → resolved physical path (DB-snapshot divergence is a REAL landmine here)
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  const real = (f) => { try { return fs.realpathSync(f); } catch (e) { return f; } };
  const send = (buf, from) => {
    try { if (/\.db$/.test(p)) served[p] = from + ' (' + (buf.length / 1048576).toFixed(1) + 'MB)'; } catch (e) {}
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  };
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (!e) return send(buf, real(path.join(ROOT, p)));
    fs.readFile(path.join(DATA_ROOT, p), (e2, buf2) => {
      if (e2) { res.writeHead(404); res.end('404 ' + p); return; }
      send(buf2, real(path.join(DATA_ROOT, p)));
    });
  });
});

const log = [];
let fails = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function save() { fs.writeFileSync(path.join(__dirname, 'witness_scene_merge_2026-07-30.log'), log.join('\n') + '\n'); }

async function waitReady(page, secs) {
  let ready = false;
  for (let i = 0; i < (secs || 120) && !ready; i++) {
    await page.waitForTimeout(1000);
    try {
      ready = await page.evaluate(() => !!(window.APP && window.APP.guidMap
        && Object.keys(window.APP.guidMap).length > 0 && window.APP.streaming === false));
    } catch (e) {}
  }
  return ready;
}

// State read straight out of the running page — the numbers, not a rendering of them.
function snap(page) {
  return page.evaluate(() => {
    const A = window.APP;
    const q = (sql) => { try { const r = A.db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return []; } };
    return {
      href: location.href,
      epoch: window.__mergeEpoch || null,
      centres: Object.keys(A.buildingCentres || {}),
      activeBuilding: A.activeBuilding,
      rendered: Array.from(A.buildingsRendered || []),
      guidMap: Object.keys(A.guidMap || {}).length,
      totalElements: A.totalElements,
      metaCount: (q('SELECT COUNT(*) FROM elements_meta')[0] || [null])[0],
      geoCount: (q('SELECT COUNT(*) FROM component_geometries')[0] || [null])[0],
      perBuilding: q('SELECT building, COUNT(*) FROM elements_meta GROUP BY building'),
      // does anything list-like/card-like exist? HARD CONSTRAINT check.
      modalHtml: (document.getElementById('merge-modal') || { innerHTML: '' }).innerHTML.length,
      modalSelects: document.querySelectorAll('#merge-modal select, #merge-modal .card').length,
    };
  });
}

// Real user path: click the Open pill's own code (A.openModelDb) → hidden <input type=file> →
// Playwright answers the file chooser → _openDbBytes → merge modal. FSA is removed first so the
// deterministic input branch is taken (headless Chromium cannot grant FSA user activation).
async function openFile(page, filePath) {
  await page.evaluate(() => { try { delete window.showOpenFilePicker; } catch (e) { window.showOpenFilePicker = undefined; } });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 30000 }),
    page.evaluate(() => { window.APP.openModelDb(); }),
  ]);
  await chooser.setFiles(filePath);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const PORT = server.address().port;
  const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=4096'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const cons = [];
  page.on('console', m => cons.push(m.text()));
  page.on('pageerror', e => cons.push('PAGEERROR ' + e.message));
  const grep = (needle) => cons.filter(l => l.indexOf(needle) >= 0);

  S('── W-SCENE-MERGE — witness_scene_merge_2026-07-30 ──');
  S('   ISSUE: does File Open still navigate the page away (destroying the scene)?');

  // ══ PHASE 1 ══ Open building A, then Open→Merge building B ═══════════════════════════════════
  S('\n── PHASE 1: Duplex loaded, then Open→Merge Clinic ──');
  await page.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=buildings/Duplex_extracted.db',
    { waitUntil: 'networkidle' });
  const readyA = await waitReady(page, 120);
  verdict(readyA, 'building A (Duplex) loaded + streaming complete');
  if (!readyA) {
    S('   [served] ' + JSON.stringify(served));
    S('   [console tail] ' + cons.slice(-30).join('\n     '));
    S('\n❌ ABORT — A never became ready'); save(); await browser.close(); server.close(); process.exit(1);
  }

  S('     [served] ' + JSON.stringify(served, null, 0));
  const histBefore = grep('§HIST_SESSION');
  S('     [console] ' + (histBefore[0] || 'NO §HIST_SESSION LINE'));
  // Plant an in-page marker. A page navigation wipes it; a merge cannot.
  await page.evaluate(() => { window.__mergeEpoch = 'E' + Date.now(); });
  const before = await snap(page);
  S('     [state] before: centres=' + JSON.stringify(before.centres) + ' meta=' + before.metaCount +
    ' geo=' + before.geoCount + ' guidMap=' + before.guidMap + ' epoch=' + before.epoch);

  cons.length = 0;
  await openFile(page, CLINIC);
  await page.waitForSelector('#merge-modal', { state: 'visible', timeout: 30000 });
  const promptLine = grep('§MERGE_PROMPT')[0];
  verdict(!!promptLine, 'merge prompt shown instead of navigating', promptLine || 'no §MERGE_PROMPT');
  const modalTxt = await page.textContent('#merge-target').catch(() => '');
  verdict(/Merge "Clinic_extracted\.db" into "Ifc2x3_Duplex_Federated"/.test(modalTxt),
    'prompt names the incoming file and the live target', 'text=' + JSON.stringify(modalTxt));
  const modalShape = await page.evaluate(() => ({
    selects: document.querySelectorAll('#merge-modal select').length,
    cards: document.querySelectorAll('#merge-modal .card, #merge-modal [data-open]').length,
    buttons: Array.from(document.querySelectorAll('#merge-modal button')).map(b => b.id),
  }));
  verdict(modalShape.selects === 0 && modalShape.cards === 0,
    'HARD CONSTRAINT: no card / no list / no target dropdown in the prompt', JSON.stringify(modalShape));

  await page.click('#merge-btn');
  // wait for §MERGE_DONE, then for every merged building to finish streaming
  let mergeDone = null;
  for (let i = 0; i < 240 && !mergeDone; i++) { await page.waitForTimeout(1000); mergeDone = grep('§MERGE_DONE')[0]; }
  S('     [console] ' + (grep('§MERGE_START')[0] || 'no §MERGE_START'));
  S('     [console] ' + (grep('§MERGE_TABLES')[0] || 'no §MERGE_TABLES'));
  grep('§MERGE_FAIL').concat(grep('§MERGE_READ_FAIL')).forEach(l => S('     [console] ' + l));
  verdict(!!mergeDone, '§MERGE_DONE emitted', mergeDone || 'never');
  verdict(!grep('§MERGE_FAIL').length && !grep('§MERGE_READ_FAIL').length,
    'no §MERGE_FAIL / §MERGE_READ_FAIL', 'fails=' + (grep('§MERGE_FAIL').length + grep('§MERGE_READ_FAIL').length));
  if (!mergeDone) { S('\n❌ ABORT — merge never completed'); S('   last console: ' + cons.slice(-25).join('\n     ')); save(); await browser.close(); server.close(); process.exit(1); }

  let settled = false;
  for (let i = 0; i < 420 && !settled; i++) {
    await page.waitForTimeout(1000);
    settled = await page.evaluate(() => !!(window.APP && window.APP.streaming === false
      && (!window.APP._mergePending || window.APP._mergePending.length === 0)
      && Array.from(window.APP.buildingsRendered || []).length >= 6));
  }
  const after = await snap(page);
  verdict(settled, 'all merged buildings finished streaming', 'rendered=' + JSON.stringify(after.rendered));

  // ── CLAIM 1 (the important one): NO PAGE NAVIGATION ──
  const histAfter = grep('§HIST_SESSION');
  const histAll = log.length && histBefore.length ? histBefore.concat(histAfter) : histAfter;
  verdict(after.epoch === before.epoch && after.epoch !== null,
    'CLAIM 1a: in-page epoch marker survived → the page was never navigated',
    'before=' + before.epoch + ' after=' + after.epoch);
  // The DOCUMENT url (origin+path+search) is what a navigation changes; the #hash is the viewer's own
  // live "last streamed building / camera" bookmark and is EXPECTED to move — its move to a Clinic
  // building is itself evidence the merged package streamed into this same document.
  const doc = (u) => u.split('#')[0];
  verdict(doc(after.href) === doc(before.href), 'CLAIM 1b: document URL (origin+path+search) unchanged', doc(after.href));
  verdict(/#bld=Clinic_/.test(after.href), 'CLAIM 1b2: and the live hash now bookmarks a merged Clinic building in the SAME document', after.href.split('#')[1]);
  verdict(histAfter.length === 0,
    'CLAIM 1c: §HIST_SESSION did NOT fire a second time (a reload mints a new id)',
    'post-merge §HIST_SESSION lines=' + histAfter.length + (histAfter[0] ? (' → ' + histAfter[0]) : ''));
  const sid = await page.evaluate(() => { try { return sessionStorage.getItem('bim.sess.buildings_Duplex_extracted.db'); } catch (e) { return null; } });
  S('     [state] session id in sessionStorage (still keyed on the ORIGINAL ?db) = ' + sid);
  verdict(!!sid && (histBefore[0] || '').indexOf('id=' + sid) >= 0,
    'CLAIM 1d: the live session id is still the one §HIST_SESSION logged at first load', 'sid=' + sid);

  // ── CLAIM 2: centres grew ──
  const centresLine = grep('§MERGE_CENTRES')[0];
  S('     [console] ' + centresLine);
  verdict(after.centres.length > before.centres.length && after.centres.length === 6,
    'CLAIM 2: A.buildingCentres has 6 keys (1 Duplex + 5 Clinic discipline buildings), not 1',
    'before=' + before.centres.length + ' after=' + after.centres.length + ' ' + JSON.stringify(after.centres));
  verdict(after.centres.indexOf(before.centres[0]) >= 0,
    'CLAIM 2b: building A is still present (merge ADDED, did not replace)', before.centres[0]);

  // ── CLAIM 3: element arithmetic = A + B − shared GUIDs ──
  const metaRow = grep('§MERGE_ROWS table=elements_meta')[0];
  S('     [console] ' + metaRow);
  const m = /src=(\d+) before=(\d+) after=(\d+) added=(\d+) dup=(\d+)/.exec(metaRow || '');
  if (m) {
    const src = +m[1], b4 = +m[2], aft = +m[3], added = +m[4], dup = +m[5];
    verdict(b4 === before.metaCount, 'CLAIM 3a: merge started from A\'s real row count', b4 + ' === ' + before.metaCount);
    verdict(aft === b4 + src - dup, 'CLAIM 3b: after = A + B − sharedGUIDs', aft + ' === ' + b4 + ' + ' + src + ' − ' + dup);
    verdict(aft === after.metaCount, 'CLAIM 3c: the live DB agrees', aft + ' === ' + after.metaCount);
    verdict(added === src, 'CLAIM 3d: Duplex∩Clinic GUID overlap is 0 (verified offline via ATTACH) so all B rows landed', 'added=' + added + ' src=' + src);
  } else { verdict(false, 'CLAIM 3: §MERGE_ROWS elements_meta parseable', metaRow || 'missing'); }
  const geoRow = grep('§MERGE_ROWS table=component_geometries')[0];
  S('     [console] ' + geoRow);
  const g = /src=(\d+) before=(\d+) after=(\d+) added=(\d+) dup=(\d+) errs=(\d+) cols=(\d+)\/src(\d+)\/dst(\d+)/.exec(geoRow || '');
  verdict(!!g && +g[5] === 4, 'CLAIM 3e: geometry dedup fired on the 4 hashes the two DBs really share (offline ATTACH of the two served files: 4)', geoRow ? ('dup=' + g[5]) : 'missing');
  verdict(!!g && +g[6] === 0 && +g[7] === 4 && +g[8] === 4 && +g[9] === 4,
    'CLAIM 3f: zero insert errors; these two files happen to agree on 4 columns (the real `normals` mismatch is PHASE 1b)',
    geoRow ? ('inserted=' + g[7] + ' src=' + g[8] + ' dst=' + g[9] + ' errs=' + g[6]) : 'missing');
  // Every streamable element of BOTH buildings must actually reach the GPU path.
  const normState = await page.evaluate(() => ({ hasNormals: window.APP._libHasNormals, streamed: window.APP.streamedCount,
    libCols: (() => { try { return window.APP.libDb.exec('PRAGMA table_info("component_geometries")')[0].values.map(v => v[1]); } catch (e) { return 'ERR'; } })() }));
  const streamable = await page.evaluate(() => {
    const r = window.APP.db.exec("SELECT COUNT(*) FROM elements_meta m JOIN element_instances i ON m.guid=i.guid JOIN element_transforms t ON t.guid=m.guid WHERE i.geometry_hash IS NOT NULL AND m.ifc_class != 'IfcOpeningElement'");
    return r.length ? r[0].values[0][0] : -1;
  });
  verdict(normState.streamed === streamable && normState.hasNormals === (normState.libCols.indexOf('normals') >= 0),
    'CLAIM 3g: every streamable element of BOTH buildings rendered, and the once-cached A._libHasNormals still matches the live libDb schema (merge never changed the destination schema)',
    'libHasNormals=' + normState.hasNormals + ' libCols=' + JSON.stringify(normState.libCols) +
    ' streamedCount=' + normState.streamed + ' streamableInMergedDb=' + streamable);

  // ── CLAIM 4: both buildings actually rendered, in ONE contract line ──
  const mc = grep('§MERGE_CONTRACT');
  const mcLast = mc[mc.length - 1];
  S('     [console] ' + mcLast);
  const cc = grep('§CONTRACT_CHECK');
  S('     [console] ' + (cc[cc.length - 1] || 'no §CONTRACT_CHECK'));
  let mcOk = false, mcDetail = 'missing';
  if (mcLast) {
    const j = /rendered=(\{.*?\}) centres=/.exec(mcLast);
    if (j) {
      try {
        const own = JSON.parse(j[1]);
        const dup2 = own['Ifc2x3_Duplex_Federated'] || 0;
        const clin = Object.keys(own).filter(k => /^Clinic_/.test(k));
        const clinTot = clin.reduce((s, k) => s + own[k], 0);
        mcOk = dup2 > 0 && clinTot > 0 && clin.length === 5;
        mcDetail = 'Duplex=' + dup2 + ' Clinic(' + clin.length + ' buildings)=' + clinTot;
      } catch (e) { mcDetail = 'unparseable: ' + e.message; }
    }
  }
  verdict(mcOk, 'CLAIM 4: both buildings non-zero in one §MERGE_CONTRACT (guidMap joined back to elements_meta.building)', mcDetail);
  verdict(!grep('§CONTRACT_FAIL').length, 'CLAIM 4b: no §CONTRACT_FAIL anywhere in the merged scene', 'fails=' + grep('§CONTRACT_FAIL').length);
  verdict(after.guidMap > before.guidMap, 'CLAIM 4c: guidMap grew (new pickable elements really registered)',
    before.guidMap + ' → ' + after.guidMap);

  // ── CLAIM 5: georef frame decision was made explicitly, not skipped silently ──
  const gr = grep('§MERGE_GEOREF')[0];
  S('     [console] ' + gr);
  verdict(!!gr, 'CLAIM 5: frame decision logged (neither test DB carries georef_offset_* → mode=none is correct)', gr || 'missing');

  // ══ PHASE 1b ══ the REAL schema mismatch: a 5-column source into a 4-column destination ══════
  // /home/red1/bim-ootb/buildings/Duplex_extracted.db (14.9MB, 1119 el, component_geometries HAS a
  // `normals` column) vs the served deploy copy the scene is holding (9.2MB, 1122 el, NO `normals`).
  // Offline ATTACH: the 14.9MB copy is a strict GUID/hash subset (1119/1119 and 814/814 shared), so
  // this merge must add nothing AND must not throw — an `INSERT … SELECT *` would.
  S('\n── PHASE 1b: merge a 5-column-source DB into the 4-column live scene (schema mismatch) ──');
  cons.length = 0;
  await openFile(page, path.join(DATA_ROOT, 'buildings', 'Duplex_extracted.db'));
  await page.waitForSelector('#merge-modal', { state: 'visible', timeout: 30000 });
  await page.click('#merge-btn');
  let doneMM = null;
  for (let i = 0; i < 180 && !doneMM; i++) { await page.waitForTimeout(1000); doneMM = grep('§MERGE_DONE')[0]; }
  verdict(!!doneMM, 'mismatch merge completed', doneMM || 'never');
  const mmGeo = grep('§MERGE_ROWS table=component_geometries')[0];
  S('     [console] ' + mmGeo);
  S('     [console] ' + (grep('§MERGE_ROWS table=elements_meta')[0] || 'missing'));
  const mm = /src=(\d+) before=(\d+) after=(\d+) added=(\d+) dup=(\d+) errs=(\d+) cols=(\d+)\/src(\d+)\/dst(\d+)/.exec(mmGeo || '');
  verdict(!!mm && +mm[8] === 5 && +mm[9] === 4 && +mm[7] === 4 && +mm[6] === 0,
    'CLAIM 8: src has 5 cols (`normals`), dst has 4 — the intersect dropped it and inserted on 4 with ZERO errors (a `SELECT *` merge throws here)',
    mmGeo ? ('inserted=' + mm[7] + ' src=' + mm[8] + ' dst=' + mm[9] + ' errs=' + mm[6]) : 'missing');
  verdict(!!mm && +mm[4] === 0 && +mm[5] === 814,
    'CLAIM 8b: and all 814 geometry rows deduped away (offline ATTACH: 814/814 shared hashes)',
    mmGeo ? ('added=' + mm[4] + ' dup=' + mm[5]) : 'missing');
  const afterMM = await snap(page);
  verdict(afterMM.epoch === before.epoch && afterMM.centres.length === 6,
    'CLAIM 8c: still the same document, still 6 centres', 'epoch=' + afterMM.epoch + ' centres=' + afterMM.centres.length);

  // ══ PHASE 2 ══ merge the SAME file again → INSERT OR IGNORE dedup ════════════════════════════
  S('\n── PHASE 2: Open→Merge the SAME Clinic again (proves INSERT OR IGNORE dedup) ──');
  cons.length = 0;
  await openFile(page, CLINIC);
  await page.waitForSelector('#merge-modal', { state: 'visible', timeout: 30000 });
  await page.click('#merge-btn');
  let done2 = null;
  for (let i = 0; i < 240 && !done2; i++) { await page.waitForTimeout(1000); done2 = grep('§MERGE_DONE')[0]; }
  verdict(!!done2, 'second merge completed', done2 || 'never');
  const dedupRow = grep('§MERGE_ROWS table=elements_meta')[0];
  S('     [console] ' + dedupRow);
  const d = /src=(\d+) before=(\d+) after=(\d+) added=(\d+) dup=(\d+)/.exec(dedupRow || '');
  verdict(!!d && +d[4] === 0 && +d[5] === +d[1],
    'CLAIM 6: re-merging the same DB adds 0 rows — every GUID collapsed (INSERT OR IGNORE)',
    dedupRow ? ('added=' + d[4] + ' dup=' + d[5] + ' src=' + d[1]) : 'missing');
  const after2 = await snap(page);
  verdict(after2.metaCount === after.metaCount && after2.centres.length === after.centres.length,
    'CLAIM 6b: totals and centres unchanged by the duplicate merge',
    'meta ' + after.metaCount + '→' + after2.metaCount + ', centres ' + after.centres.length + '→' + after2.centres.length);
  verdict(after2.epoch === before.epoch, 'CLAIM 6c: still no navigation after two merges', 'epoch=' + after2.epoch);

  // ══ PHASE 3 ══ Esc = New → today's replace/navigate path unchanged ═══════════════════════════
  S('\n── PHASE 3: Open→Esc (New) must still take the original replace/navigate path ──');
  cons.length = 0;
  await openFile(page, CLINIC);
  await page.waitForSelector('#merge-modal', { state: 'visible', timeout: 30000 });
  await page.keyboard.press('Escape');
  let navLine = null;
  for (let i = 0; i < 90 && !navLine; i++) { await page.waitForTimeout(1000); navLine = grep('§OPEN_DB')[0]; }
  const choiceNew = grep('§MERGE_CHOICE').find(l => l.indexOf('action=new') >= 0);
  verdict(!!choiceNew, 'CLAIM 7: Esc resolves the prompt as "new"', choiceNew || 'missing');
  verdict(!!navLine && navLine.indexOf('→ navigate') >= 0,
    'CLAIM 7b: falls through to the UNCHANGED cache+navigate replace path', navLine || 'missing');
  await page.waitForTimeout(4000);
  const hrefNow = await page.evaluate(() => location.href).catch(() => 'nav-in-flight');
  const epochNow = await page.evaluate(() => window.__mergeEpoch || null).catch(() => 'unreadable');
  verdict(/db=import%3A%2F%2FClinic_extracted/.test(hrefNow) || hrefNow === 'nav-in-flight',
    'CLAIM 7c: the browser really navigated to the import:// URL', hrefNow);
  verdict(epochNow === null || epochNow === 'unreadable',
    'CLAIM 7d: and THAT navigation DID wipe the in-page epoch — proving the marker used in CLAIM 1 is a real navigation detector, not a no-op',
    'epoch after navigate=' + epochNow);

  S('\n── VERDICT ──');
  S('   ' + (fails === 0 ? '🟢 W-SCENE-MERGE PASS' : '🔴 W-SCENE-MERGE FAIL (' + fails + ' failed assertion(s))'));
  save();
  await page.close().catch(() => {}); await ctx.close().catch(() => {}); await browser.close(); server.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch(async (e) => {
  S('\n💥 HARNESS ERROR: ' + (e && e.stack ? e.stack : e));
  save();
  try { server.close(); } catch (e2) {}
  process.exit(2);
});
