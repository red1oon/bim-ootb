// ⚠ DO NOT REMOVE — Scope guard
// W-OPEN-SPLIT-PAIR — prompts/LTU_TERMINAL_CLINIC_RENDER_CORRUPTION.md §R follow-up
//
// THE ISSUE THIS TEST EXPOSES: the "Open" door (A.openModelDb) let a user multi-select a meta.db +
// geo.db pair (exactly what a browser download of a split-mode import produces), but the code only
// ever read the FIRST file — file-picker order isn't guaranteed, so "geo.db" (no elements_meta table
// at all) could load ALONE while "meta.db" (the real data) was silently discarded. Separately,
// _openIfcFiles took a split-mode importMultiIFC() result's metaDb and dropped its geoDb entirely,
// so even the in-app "drop IFC while a building is open" merge path lost all mesh geometry for large
// (split) buildings. Both symptoms reproduced live: §DB_SPLIT_DETECT meta=...geo.db geo=...geo.db
// (same file twice), §CENTRES_RESULT rows=0 (geo.db alone has no elements_meta).
//
// Fix: A._openSplitDbBytes / A._mergeSplitDbIntoScene — split-aware siblings of the existing,
// already-witnessed A._openDbBytes / A._mergeDbIntoScene (W-SCENE-MERGE), reusing the same
// _mergeTable/_georefPin helpers with TWO sources (meta, geo) instead of one.
//
// PHASE A  Nothing open, select meta.db+geo.db together → real elements load (not 0), real geo mesh
//          data cached under the correct _meta.db/_geo.db sibling URLs §DB_SPLIT_DETECT expects.
// PHASE B  A building (Clinic) already open, select the SAME split pair → merge modal → Merge →
//          building added to the LIVE scene, no navigation, both meta AND geo tables folded in.
//
// §-log first — READ tests/witness_open_split_db_pair_2026-08-29.log before any conclusion.
// Run:  timeout 300 node viewer/tests/witness_open_split_db_pair_2026-08-29.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_ROOT = '/home/red1/bim-ootb';
const SCRATCH = '/tmp/claude-1000/-home-red1-bim-compiler/f18d6fef-97cb-4266-802e-ce981b8dd210/scratchpad/split_test';
const CLINIC = path.join(DATA_ROOT, 'buildings', 'Clinic_extracted.db');
const META = path.join(SCRATCH, 'Duplex_meta.db');
const GEO = path.join(SCRATCH, 'Duplex_geo.db');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  const send = (buf) => { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); };
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (!e) return send(buf);
    fs.readFile(path.join(DATA_ROOT, p), (e2, buf2) => {
      if (!e2) return send(buf2);
      res.writeHead(404); res.end('404 ' + p);
    });
  });
});

const log = [];
let fails = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function save() { fs.writeFileSync(path.join(__dirname, 'witness_open_split_db_pair_2026-08-29.log'), log.join('\n') + '\n'); }

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

function snap(page) {
  return page.evaluate(() => {
    const A = window.APP;
    const q = (sql) => { try { const r = A.db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return []; } };
    return {
      href: location.href,
      centres: Object.keys(A.buildingCentres || {}),
      guidMap: Object.keys(A.guidMap || {}).length,
      totalElements: A.totalElements,
      metaCount: (q('SELECT COUNT(*) FROM elements_meta')[0] || [null])[0],
    };
  });
}

// Same real-user path as W-SCENE-MERGE: FSA removed → hidden <input multiple> → Playwright answers
// the chooser with an ARRAY of files (both meta.db and geo.db at once, exactly a real multi-select).
async function openFiles(page, filePaths) {
  await page.evaluate(() => { try { delete window.showOpenFilePicker; } catch (e) { window.showOpenFilePicker = undefined; } });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 30000 }),
    page.evaluate(() => { window.APP.openModelDb(); }),
  ]);
  await chooser.setFiles(filePaths);
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

  S('── W-OPEN-SPLIT-PAIR — witness_open_split_db_pair_2026-08-29 ──');
  S('   ISSUE: does selecting meta.db+geo.db together actually load/merge BOTH halves?');

  // ══ PHASE A ══ replace path — select the split pair, force "New" if a default building is already
  // auto-loaded (a blank viewer.html isn't guaranteed empty state; same "Esc = New" pattern
  // W-SCENE-MERGE's own Phase 3 already relies on) ══════════════════════════════════════════════
  S('\n── PHASE A: select Duplex_meta.db + Duplex_geo.db together (replace path) ──');
  await page.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html', { waitUntil: 'networkidle' });
  await waitReady(page, 30);   // let any default auto-load settle before touching the picker
  cons.length = 0;
  await openFiles(page, [META, GEO]);
  try {
    await page.waitForSelector('#merge-modal', { state: 'visible', timeout: 5000 });
    S('     [note] a building was already open (auto-loaded default) — clicking New to force replace');
    await page.click('#merge-new-btn');
  } catch (e) { /* no modal — nothing was open, straight replace, as originally expected */ }
  const readyA = await waitReady(page, 90);
  verdict(readyA, 'split pair loaded + streaming complete (not stuck/blank)');
  if (!readyA) {
    S('   [console tail] ' + cons.slice(-40).join('\n     '));
    S('\n❌ ABORT — Phase A never became ready'); save(); await browser.close(); server.close(); process.exit(1);
  }
  const pickLine = grep('§OPEN_PICK_SPLIT')[0];
  verdict(!!pickLine, 'the picker detected the pair by name (not silently using file[0] alone)', pickLine || 'no §OPEN_PICK_SPLIT');
  const splitDetect = grep('§DB_SPLIT_DETECT')[0] || '';
  verdict(/found=true/.test(splitDetect), 'streaming.js confirmed real split mode (both halves present)', splitDetect || 'no §DB_SPLIT_DETECT line');
  verdict(!/meta=.*geo\.db.*geo=.*geo\.db/.test(splitDetect), 'meta URL and geo URL are DIFFERENT files (the original bug: both pointed at geo.db)', splitDetect);
  const snapA = await snap(page);
  verdict(snapA.metaCount === 1193, 'real element count loaded from META (not 0 — the original bug loaded geo.db alone, which has no elements_meta)', 'metaCount=' + snapA.metaCount);
  verdict(snapA.guidMap > 0, 'geometry actually streamed (guidMap has real pickable elements)', 'guidMap=' + snapA.guidMap);
  S('     [state] Phase A: href=' + snapA.href + ' centres=' + JSON.stringify(snapA.centres) + ' metaCount=' + snapA.metaCount + ' guidMap=' + snapA.guidMap);
S('     [console tail 15] ' + cons.slice(-15).join('\n' + '       '));

  // ══ PHASE B ══ Clinic already open, select the split pair → MERGE into the live scene ══════════
  S('\n── PHASE B: Clinic loaded, then Open→Merge the same Duplex split pair ──');
  await page.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=buildings/Clinic_extracted.db', { waitUntil: 'networkidle' });
  const readyB0 = await waitReady(page, 120);
  verdict(readyB0, 'building Clinic loaded + streaming complete (Phase B setup)');
  if (!readyB0) { S('\n❌ ABORT — Clinic never became ready'); save(); await browser.close(); server.close(); process.exit(1); }
  await page.evaluate(() => { window.__mergeEpoch = 'E' + Date.now(); });
  const beforeB = await snap(page);
  S('     [state] before: centres=' + JSON.stringify(beforeB.centres) + ' metaCount=' + beforeB.metaCount);

  cons.length = 0;
  await openFiles(page, [META, GEO]);
  await page.waitForSelector('#merge-modal', { state: 'visible', timeout: 30000 });
  const promptLine = grep('§MERGE_PROMPT')[0];
  verdict(!!promptLine, 'merge prompt shown instead of silently replacing the live scene', promptLine || 'no §MERGE_PROMPT');
  await page.click('#merge-btn');
  let mergeDone = null;
  for (let i = 0; i < 120 && !mergeDone; i++) { await page.waitForTimeout(1000); mergeDone = grep('§MERGE_SPLIT_DONE')[0]; }
  S('     [console] ' + (grep('§MERGE_SPLIT_START')[0] || 'no §MERGE_SPLIT_START'));
  S('     [console] ' + (grep('§MERGE_SPLIT_TABLES')[0] || 'no §MERGE_SPLIT_TABLES'));
  grep('§MERGE_SPLIT_FAIL').forEach(l => S('     [console] ' + l));
  verdict(!!mergeDone, '§MERGE_SPLIT_DONE emitted (the new split-aware merge path actually ran)', mergeDone || 'never');
  verdict(!grep('§MERGE_SPLIT_FAIL').length, 'no §MERGE_SPLIT_FAIL', 'fails=' + grep('§MERGE_SPLIT_FAIL').length);
  if (!mergeDone) { S('\n❌ ABORT — split merge never completed'); S('   last console: ' + cons.slice(-25).join('\n     ')); save(); await browser.close(); server.close(); process.exit(1); }

  const tablesLine = grep('§MERGE_SPLIT_TABLES')[0] || '';
  verdict(/"elements_meta"/.test(tablesLine), 'META tables folded from the meta.db source (not lost)', tablesLine);
  verdict(/"component_geometries"/.test(tablesLine), 'GEO tables folded from the geo.db source — THIS is the exact thing the old code dropped', tablesLine);

  let settled = false;
  for (let i = 0; i < 300 && !settled; i++) {
    await page.waitForTimeout(1000);
    settled = await page.evaluate(() => !!(window.APP && window.APP.streaming === false
      && (!window.APP._mergePending || window.APP._mergePending.length === 0)));
  }
  const afterB = await snap(page);
  verdict(settled, 'merged building finished streaming');
  verdict(afterB.href.split('#')[0] === beforeB.href.split('#')[0], 'no page navigation (real merge, not a replace)', afterB.href);
  verdict(afterB.centres.length > beforeB.centres.length, 'new building really joined the live scene', 'before=' + beforeB.centres.length + ' after=' + afterB.centres.length + ' ' + JSON.stringify(afterB.centres));
  verdict(afterB.metaCount > beforeB.metaCount, 'element count grew by the merged building (data really landed, not just the prompt)', 'before=' + beforeB.metaCount + ' after=' + afterB.metaCount);

  S('\n── VERDICT ──');
  S('   ' + (fails === 0 ? '🟢 W-OPEN-SPLIT-PAIR PASS' : '🔴 W-OPEN-SPLIT-PAIR FAIL (' + fails + ' failed assertion(s))'));
  save();
  await browser.close(); server.close();
  process.exit(fails === 0 ? 0 : 1);
})();
