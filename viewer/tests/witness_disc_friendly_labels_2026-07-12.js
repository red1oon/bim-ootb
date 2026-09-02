// ⚠ DO NOT REMOVE — Scope guard
// Scope: prompts/Viewer/OUTLINER_TAXONOMY_REDESIGN.md §2 Layer 1 — the Find panel's Disc axis
// (and the Doc Canvas discipline popup in panels.js) rendered the RAW discipline CODE stored in
// elements_meta.discipline (ACMV/ELEC/PLB/FP/MEP/STR/ARC) straight to the user with no friendly
// word anywhere. Fix (navigate_find.js + panels.js, both DISPLAY-ONLY):
//   - navigate_find.js: DISC_LABELS/friendlyDisc(); _buildDiscTree() now calls
//     _treeNode(friendlyDisc(disc), discCnt, 0, { value: disc, ... }) — `_treeNode` gained an
//     `opts.value` (defaults to label) so the multi-select set / data-find-parent / SQL filter
//     keep keying off the RAW code while the rendered text is the friendly word. Every downstream
//     query (_axisGroupSelect → "WHERE discipline IN (...)") still receives raw codes.
//   - panels.js: same DISC_LABELS/friendlyDisc(), wired into the Doc Canvas discipline popup
//     label (`lbl.textContent`); DocCanvas.setActiveDisc(d,...) still gets the raw code `d`.
// This witness proves, on the REAL loaded Duplex building (light/fast, disciplines MEP/ARC/STR
// all present, all three in the fixed DISC_LABELS map so no "invented" fallback is exercised):
//   1. Real user path to open Find (rail pill -> drawer row Find), same convention as
//      witness_isolate_zoom_2026-07-12.js — do not invent a different open path.
//   2. Cycle the axis toggle to 'disc' — every top-level tree row's RENDERED TEXT is the friendly
//      word (e.g. "Structure"), never the raw code, while its `data-find-parent` attribute (the
//      actual multi-select/query identity) stays the RAW code (e.g. "STR") — proves the
//      label/value decoupling, not just a cosmetic string swap that would break filtering.
//   3. Tapping a disc row still filters correctly on the RAW code: [RP-TB] §FIND_MULTISEL logs
//      sel=[STR] (raw, not "Structure"), the #find-selected-text status bar shows the FRIENDLY
//      word, and the row's own count badge matches a direct SQL COUNT for that raw discipline
//      code (before/after: badge count is read from the SAME query the tree itself ran, so a
//      mismatch here would mean the display swap silently broke the underlying filter).
//   4. panels.js's friendlyDisc() (a separate, independently-scoped copy — panels.js is a plain
//      top-level script, not a closure like navigate_find.js) maps every DISC_LABELS key
//      correctly and falls back to the raw code for an unmapped one (never blank/invented).
// §-log first — READ tests/witness_disc_friendly_labels_2026-07-12.log before any conclusion.
// Run:  timeout 90 node viewer/tests/witness_disc_friendly_labels_2026-07-12.js
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

async function cycleAxisTo(page, targetAxis) {
  for (let i = 0; i < 6; i++) {
    const cur = await page.evaluate(() => {
      const b = document.getElementById('find-axis-toggle');
      return b ? b.getAttribute('data-axis') : null;
    });
    if (cur === targetAxis) return cur;
    const clicked = await page.evaluate(() => {
      const b = document.getElementById('find-axis-toggle');
      if (!b) return false;
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return true;
    });
    if (!clicked) return null;
    await page.waitForTimeout(300);
  }
  return page.evaluate(() => {
    const b = document.getElementById('find-axis-toggle');
    return b ? b.getAttribute('data-axis') : null;
  });
}

// The fixed mapping this witness expects (mirrors navigate_find.js/panels.js DISC_LABELS —
// kept here ONLY as the independent expected-value oracle, not shared code with the fix).
const EXPECT = { ACMV: 'Air-Conditioning', ELEC: 'Electrical', PLB: 'Plumbing', PLMB: 'Plumbing',
  FP: 'Fire Protection', STR: 'Structure', ARC: 'Architecture', MEP: 'Mechanical & Electrical' };

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const cons = [];
  page.on('console', m => cons.push(m.text()));

  S('── witness_disc_friendly_labels (Duplex) ──');
  await page.goto('http://127.0.0.1:' + server.address().port +
    '/viewer/viewer.html?db=buildings/Duplex_extracted.db',
    { waitUntil: 'networkidle' });
  const ready = await waitReady(page);
  verdict(ready, 'real model loaded + ready (Duplex)');
  if (!ready) {
    S('\n❌ ABORT — model never became ready');
    fs.writeFileSync(path.join(__dirname, 'witness_disc_friendly_labels_2026-07-12.log'), log.join('\n') + '\n');
    await browser.close(); server.close(); process.exit(1);
  }

  // 0. panels.js friendlyDisc() — plain top-level global, cheap to check directly without
  // driving the whole Doc Canvas UI (which needs BOM storeys/disciplines data to open its popup).
  const panelsCheck = await page.evaluate((expect) => {
    if (typeof window.friendlyDisc !== 'function') return { ok: false, reason: 'window.friendlyDisc missing' };
    const out = {};
    Object.keys(expect).forEach(k => { out[k] = window.friendlyDisc(k); });
    out['ZZZ_UNMAPPED'] = window.friendlyDisc('ZZZ_UNMAPPED'); // never blank/invented — falls back to itself
    return { ok: true, out: out };
  }, EXPECT);
  verdict(panelsCheck.ok, 'panels.js window.friendlyDisc() is a global function');
  if (panelsCheck.ok) {
    let allMatch = true;
    Object.keys(EXPECT).forEach(k => { if (panelsCheck.out[k] !== EXPECT[k]) allMatch = false; });
    verdict(allMatch, 'panels.js friendlyDisc() maps every DISC_LABELS code correctly', JSON.stringify(panelsCheck.out));
    verdict(panelsCheck.out['ZZZ_UNMAPPED'] === 'ZZZ_UNMAPPED', 'panels.js friendlyDisc() falls back to the raw code for an unmapped code (never blank/invented)');
  }

  // 1. Real user path: rail pill Navigate -> drawer row Find -> A.openFindPanel('')
  await page.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 }).catch(() => {});
  await page.click('#mobile-trigger', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  const railHit = await tap(page, 'pill-navigate');
  verdict(railHit, 'Navigate rail pill (#pill-navigate) present + tapped');
  const rowHit = await tap(page, 'drawer-row-find');
  verdict(rowHit, 'Find drawer row (#drawer-row-find) present + tapped (fires A.openFindPanel(""))');
  await page.waitForTimeout(500);

  // 2. Cycle to the Disc axis.
  const axisDisc = await cycleAxisTo(page, 'disc');
  verdict(axisDisc === 'disc', 'Disc axis reachable via toggle', 'axis=' + axisDisc);
  if (axisDisc !== 'disc') {
    S('\n❌ ABORT — could not reach Disc axis');
    fs.writeFileSync(path.join(__dirname, 'witness_disc_friendly_labels_2026-07-12.log'), log.join('\n') + '\n');
    await browser.close(); server.close(); process.exit(1);
  }
  await page.waitForTimeout(300);

  // 3. Every top-level disc row: rendered TEXT = friendly word, data-find-parent (the actual
  // multi-select/query identity) = RAW code. Also cross-check the badge count against a direct
  // SQL COUNT for that raw code (proves the underlying filter query is untouched by the relabel).
  const rows = await page.evaluate((expect) => {
    const els = Array.from(document.querySelectorAll('.find-tree-row[data-find-parent]'));
    return els.map(el => {
      const value = el.getAttribute('data-find-parent');
      const textSpan = el.children[1], badgeSpan = el.children[2];
      const sqlCount = window.APP.dbQuery('SELECT COUNT(*) FROM elements_meta WHERE discipline = ?', [value])[0][0];
      return {
        value: value,
        renderedText: textSpan ? textSpan.textContent : null,
        badgeText: badgeSpan ? badgeSpan.textContent : null,
        sqlCount: sqlCount
      };
    });
  }, EXPECT);
  verdict(rows.length > 0, 'Disc axis rendered at least one top-level row', 'n=' + rows.length);
  S('     [info] disc rows: ' + JSON.stringify(rows));

  rows.forEach(r => {
    const expected = EXPECT[r.value] || r.value;
    verdict(r.renderedText === expected, 'disc="' + r.value + '" renders friendly text "' + expected + '"',
      'got="' + r.renderedText + '"');
    verdict(r.renderedText !== r.value || !EXPECT[r.value] || EXPECT[r.value] === r.value,
      'disc="' + r.value + '" renders WORD not raw code (unless the mapping IS identity)',
      'rendered="' + r.renderedText + '" raw="' + r.value + '"');
    verdict(r.badgeText === '(' + r.sqlCount + ')', 'disc="' + r.value + '" badge count matches direct SQL COUNT (filter untouched)',
      'badge=' + r.badgeText + ' sql=' + r.sqlCount);
  });

  // 4. Tap one row (STR — Structure, Duplex's smallest disc group) and confirm the underlying
  // multi-select/filter still keys off the RAW code, while the status bar shows the friendly word.
  const strRow = rows.find(r => r.value === 'STR');
  if (strRow) {
    cons.length = 0;
    const tapped = await page.evaluate((val) => {
      const row = document.querySelector('.find-tree-row[data-find-parent="' + val + '"]');
      if (!row) return false;
      const text = row.children[1];
      text.dispatchEvent(new PointerEvent('pointerup', { bubbles: false }));
      return true;
    }, 'STR');
    verdict(tapped, 'STR disc row tapped (text/onTap = multi-select)');
    await page.waitForTimeout(400);

    const multiselLines = cons.filter(t => t.indexOf('§FIND_MULTISEL') >= 0);
    verdict(multiselLines.length >= 1, '§FIND_MULTISEL logged', 'lines=' + multiselLines.length);
    multiselLines.forEach(l => S('     [console] ' + l));
    const rawInLog = multiselLines.some(l => l.indexOf('sel=[STR]') >= 0);
    verdict(rawInLog, '§FIND_MULTISEL sel=[STR] uses the RAW code (not "Structure") — filter/query untouched');

    const selText = await page.evaluate(() => {
      const el = document.getElementById('find-selected-text');
      return el ? el.textContent : null;
    });
    verdict(!!selText && selText.indexOf('Structure') === 0, '#find-selected-text status bar shows the FRIENDLY word', 'text="' + selText + '"');
    verdict(!!selText && selText.indexOf('STR') !== 0, '#find-selected-text does NOT lead with the raw code', 'text="' + selText + '"');

    // data-active row after tap must be the SAME raw-code row (selection identity survived the relabel).
    const activeVal = await page.evaluate(() => {
      const el = document.querySelector('.find-tree-row[data-active="1"]');
      return el ? el.getAttribute('data-find-parent') : null;
    });
    verdict(activeVal === 'STR', 'the highlighted (data-active) row is keyed on RAW code "STR"', 'active=' + activeVal);
  } else {
    verdict(false, 'STR disc row present in Duplex to drive the tap check (unexpected building composition)');
  }

  await page.close(); await ctx.close();
  await browser.close();
  server.close();

  S('\n' + (fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAILED'));
  fs.writeFileSync(path.join(__dirname, 'witness_disc_friendly_labels_2026-07-12.log'), log.join('\n') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
