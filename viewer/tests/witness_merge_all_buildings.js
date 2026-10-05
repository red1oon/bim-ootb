// ⚠ DO NOT REMOVE — Scope guard
// W-MERGE-ALL-BUILDINGS — bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §FB SPEC
//
// THE ISSUES THIS TEST EXPOSES (user, 2026-10-05, JELAPANG road + bridge merge):
//   I1. Reopening a SAVED merged DB streamed ONE building (camera-nearest) — the other building's
//       elements were in the DB but never drawn (§MERGE_CONTRACT buildings=1 … centres=2).
//   I2. Find's tree/search scoped to A.activeBuilding, so after a merge only the LAST streamed
//       building's disciplines were listed (road disciplines "lost").
//   I3. The live merge did not refresh an open Find panel.
//   I4. NON-IMPACT: a single-building DB (every hub building) must behave exactly as before.
// On origin/main (before §FB) phase B fails I1/I2 and phase C fails I3 — that is what makes it a test.
//
// Numbers read from live page state + § lines (no screenshots — CLAUDE.md FUNDAMENTAL LAW).
// Data: Duplex_extracted.db (1 building) · ~/bim-ootb/buildings/Clinic_extracted.db (5 buildings,
// the saved-merge shape) · optional JELAPANG=<path to JELAPANG_AFTER.db> (the user's own file).
// §-log first — READ tests/witness_merge_all_buildings.log before any conclusion.
// Run:  timeout 1500 node viewer/tests/witness_merge_all_buildings.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_ROOT = '/home/red1/bim-ootb';            // gitignored DBs live only in the primary checkout
const CLINIC5 = path.join(DATA_ROOT, 'buildings', 'Clinic_extracted.db');
const JELAPANG = process.env.JELAPANG || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  const send = (buf) => { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); };
  if (p === '/jelapang/JELAPANG_AFTER.db' && JELAPANG) {
    return fs.readFile(JELAPANG, (e, b) => { if (e) { res.writeHead(404); res.end(); } else send(b); });
  }
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (!e) return send(buf);
    fs.readFile(path.join(DATA_ROOT, p), (e2, buf2) => {
      if (e2) { res.writeHead(404); res.end('404 ' + p); return; }
      send(buf2);
    });
  });
});

const log = [];
let fails = 0, judged = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function save() { fs.writeFileSync(path.join(__dirname, 'witness_merge_all_buildings.log'), log.join('\n') + '\n'); }

// settled = not streaming, merge queue empty, rendered >= want buildings
async function waitSettled(page, want, secs) {
  for (let i = 0; i < secs; i++) {
    await page.waitForTimeout(1000);
    try {
      const ok = await page.evaluate((w) => { const A = window.APP; return !!(A && A.guidMap && Object.keys(A.guidMap).length > 0
        && A.streaming === false && (!A._mergePending || A._mergePending.length === 0)
        && Array.from(A.buildingsRendered || []).length >= w); }, want);
      if (ok) return true;
    } catch (e) {}
  }
  return false;
}

function dbTruth(page) {
  return page.evaluate(() => {
    const A = window.APP;
    const q = (sql) => { try { const r = A.db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return []; } };
    return {
      centres: Object.keys(A.buildingCentres || {}),
      rendered: Array.from(A.buildingsRendered || []),
      active: A.activeBuilding,
      scope: A.sceneScopeBuilding ? A.sceneScopeBuilding() : '(no owner)',
      perBuilding: q('SELECT building, COUNT(*) FROM elements_meta GROUP BY building'),
      allDiscs: q('SELECT DISTINCT discipline FROM elements_meta WHERE discipline IS NOT NULL ORDER BY 1').map(r => r[0]),
      activeDiscs: q("SELECT DISTINCT discipline FROM elements_meta WHERE discipline IS NOT NULL AND building = '" +
        String(A.activeBuilding || '').replace(/'/g, "''") + "' ORDER BY 1").map(r => r[0]),
      guidMap: Object.keys(A.guidMap || {}).length + Object.keys(A._mergedIndex || {}).length,
    };
  });
}

// Real user path: Find pill code → axis toggle button (pointerup) until the Discipline axis → read parent rows.
async function findDiscParents(page, alreadyOpen) {
  if (!alreadyOpen) await page.evaluate(() => window.APP.openFindPanel());
  await page.waitForSelector('#find-axis-toggle', { timeout: 60000 });
  for (let i = 0; i < 6; i++) {
    const ax = await page.getAttribute('#find-axis-toggle', 'data-axis');
    if (ax === 'disc') break;
    await page.dispatchEvent('#find-axis-toggle', 'pointerup');
    await page.waitForTimeout(400);
  }
  return page.evaluate(() => Array.from(document.querySelectorAll('[data-find-parent]')).map(e => e.getAttribute('data-find-parent')).sort());
}

async function openFile(page, filePath) {
  await page.evaluate(() => { try { delete window.showOpenFilePicker; } catch (e) { window.showOpenFilePicker = undefined; } });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 30000 }),
    page.evaluate(() => { window.APP.openModelDb(); }),
  ]);
  await chooser.setFiles(filePath);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  await new Promise(r => server.listen(0, r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=6144'] });
  const newPage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    const cons = [];
    page.on('console', m => cons.push(m.text()));
    page.on('pageerror', e => cons.push('PAGEERROR ' + e.message));
    return { page, cons, grep: (n) => cons.filter(l => l.indexOf(n) >= 0) };
  };
  S('── W-MERGE-ALL-BUILDINGS ──');

  // ══ A: NON-IMPACT — single-building DB (I4) ══
  S('\n── A: Duplex alone (1 building) — must be unchanged ──');
  {
    const { page, grep } = await newPage();
    await page.goto(BASE + '/viewer/viewer.html?db=buildings/Duplex_extracted.db', { waitUntil: 'domcontentloaded' });
    const ok = await waitSettled(page, 1, 180);
    verdict(ok, 'A0 Duplex streamed');
    const t = await dbTruth(page);
    S('     [state] centres=' + JSON.stringify(t.centres) + ' active=' + t.active + ' scope="' + t.scope + '"');
    verdict(t.centres.length === 1, 'A1 population is a 1-building DB (else this phase judges nothing)', 'centres=' + t.centres.length);
    verdict(t.scope === t.active && !!t.active, 'A2 scope owner returns the active building (old behaviour)', 'scope=' + t.scope);
    verdict(grep('§OPEN_ALL_BUILDINGS').length === 0, 'A3 no §OPEN_ALL_BUILDINGS on a 1-building DB', grep('§OPEN_ALL_BUILDINGS')[0] || 'none');
    S('     [console] ' + (grep('§SCENE_SCOPE')[0] || 'no §SCENE_SCOPE'));
    const parents = await findDiscParents(page);
    S('     [find] disc parents=' + JSON.stringify(parents));
    verdict(parents.length > 0 && same(parents, t.activeDiscs), 'A4 Find disc parents = DB disciplines of that building',
      'find=' + parents.length + ' db=' + t.activeDiscs.length);
    await page.context().close();
  }

  // ══ B: reopen a SAVED merged DB (I1, I2) ══
  const reopen = async (tag, url, want) => {
    S('\n── ' + tag + ': open saved merged DB ' + url + ' ──');
    const { page, grep } = await newPage();
    await page.goto(BASE + '/viewer/viewer.html?db=' + url, { waitUntil: 'domcontentloaded' });
    const ok = await waitSettled(page, want, 900);
    const t = await dbTruth(page);
    S('     [console] ' + (grep('§OPEN_ALL_BUILDINGS')[0] || 'no §OPEN_ALL_BUILDINGS'));
    grep('§MERGE_CONTRACT').forEach(l => S('     [console] ' + l));
    S('     [state] centres=' + t.centres.length + ' rendered=' + JSON.stringify(t.rendered) + ' perBuilding=' + JSON.stringify(t.perBuilding));
    verdict(t.centres.length === want, tag + '0 population: DB holds ' + want + ' buildings', 'centres=' + t.centres.length);
    verdict(ok && t.rendered.length === want, tag + '1 every building streamed (I1)', 'rendered=' + t.rendered.length + '/' + want);
    const total = t.perBuilding.reduce((s, r) => s + r[1], 0);
    verdict(t.guidMap === total, tag + '2 registered elements = DB elements', 'guidMap+merged=' + t.guidMap + ' db=' + total);
    const last = grep('§MERGE_CONTRACT').slice(-1)[0] || '';
    verdict(/verdict=COMPLETE/.test(last), tag + '3 §MERGE_CONTRACT verdict=COMPLETE', last.slice(0, 160));
    verdict(t.scope === '', tag + '4 scope owner = all buildings', 'scope="' + t.scope + '"');
    const parents = await findDiscParents(page);
    S('     [find] disc parents=' + JSON.stringify(parents) + ' dbAll=' + JSON.stringify(t.allDiscs));
    verdict(same(parents, t.allDiscs), tag + '5 Find disc parents = disciplines of ALL buildings (I2)',
      'find=' + parents.length + ' db=' + t.allDiscs.length + ' (active-building-only would be ' + t.activeDiscs.length + ')');
    await page.context().close();
  };
  await reopen('B', '/buildings/Clinic_extracted.db', 5);

  // ══ C: LIVE merge with Find already open (I3) ══
  S('\n── C: Duplex + Find open, then Open→Merge Clinic (5 buildings) ──');
  {
    const { page, grep } = await newPage();
    await page.goto(BASE + '/viewer/viewer.html?db=buildings/Duplex_extracted.db', { waitUntil: 'domcontentloaded' });
    verdict(await waitSettled(page, 1, 180), 'C0 Duplex streamed');
    const before = await findDiscParents(page);
    S('     [find] before merge disc parents=' + JSON.stringify(before));
    await openFile(page, CLINIC5);
    await page.waitForSelector('#merge-modal', { state: 'visible', timeout: 30000 });
    await page.click('#merge-btn');
    const ok = await waitSettled(page, 6, 900);
    const t = await dbTruth(page);
    S('     [state] rendered=' + JSON.stringify(t.rendered));
    verdict(ok, 'C1 all 6 buildings streamed after merge', 'rendered=' + t.rendered.length);
    const refresh = grep('§FIND_REFRESH why=merge-complete');
    verdict(refresh.length > 0, 'C2 open Find rebuilt when the merge completed (I3)', refresh.slice(-1)[0] || 'no §FIND_REFRESH');
    const after = await page.evaluate(() => Array.from(document.querySelectorAll('[data-find-parent]')).map(e => e.getAttribute('data-find-parent')).sort());
    S('     [find] after merge (no reopen) disc parents=' + JSON.stringify(after) + ' dbAll=' + JSON.stringify(t.allDiscs));
    verdict(same(after, t.allDiscs), 'C3 without reopening, Find lists the disciplines of both models', 'find=' + after.length + ' db=' + t.allDiscs.length);
    await page.context().close();
  }

  // ══ D (optional): the user's own file ══
  if (JELAPANG) await reopen('D', '/jelapang/JELAPANG_AFTER.db', 2);
  else S('\n── D: skipped (set JELAPANG=<path> to run on JELAPANG_AFTER.db) ──');

  S('\n' + (judged === 0 ? 'INCONCLUSIVE — nothing judged' : (fails === 0 ? '✅ PASS ' : '❌ FAIL ') + (judged - fails) + '/' + judged));
  save(); await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})().catch(e => { S('CRASH ' + (e && e.stack || e)); save(); process.exit(2); });
