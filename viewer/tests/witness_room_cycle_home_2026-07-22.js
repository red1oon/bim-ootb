// ⚠ DO NOT REMOVE — Scope guard
// Scope: bim-compiler prompts/Viewer/ROOM_CYCLE_HOME_SHORTCUTS.md — two new global keyboard
// shortcuts (plain R = cycle camera to progressively smaller rooms by real area; plain Home =
// reset the R-cycle + fit a tight/zero-margin exterior view), landed in viewer/scene.js. This
// witness proves, on the real HHS_Office_Federated_extracted.db fixture (headless Chromium, the
// project's standard fixture for room/entrance work), the 5 assertions in the spec's Witness plan:
//   (a) first R press lands on the DB-verified largest room — cross-checked against an
//       INDEPENDENTLY-written aggregation (fetch every IfcSpace row, group/sum/filter SUSPECT_ in
//       plain JS in THIS script) rather than re-running scene.js's own SQL string.
//   (b) 3 successive R presses produce strictly non-increasing area, no duplicate room_guid.
//   (c) Home mid-cycle, then R again, returns to the SAME largest-room guid as (a).
//   (d) Home while the Find panel has keyboard focus still moves ITS OWN list cursor to the top
//       (§KBD_ROUTE panel=find key=Home fires) — NOT stolen by the new §ROOM_HOME handler.
//   (e) Home while corridor-nav (A._nav.active) is running still resets the route to its start
//       (real §NAV_MOVE_CAM wp=0 fires via navigate_engine.js's own separate listener) — NOT
//       stolen either.
// §-log first — READ tests/witness_room_cycle_home_2026-07-22.log before any conclusion. No
// screenshots — log values + DB cross-check only, per the FUNDAMENTAL LAW.
// Run:  node viewer/tests/witness_room_cycle_home_2026-07-22.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm' };
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
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '\u{1F7E2}' : '\u{1F534}') + ' ' + label + (detail ? ' — ' + detail : '')); }

// Poll the live `cons` buffer until at least `count` NEW lines (indices >= sinceIdx) contain
// `matchSubstr`, or `timeoutMs` elapses — the first R press is slow (A.loadNavigate() fetches
// ~10 lazy JS modules + A.ensureRooms()'s first-call room-graph build), a fixed short sleep races
// it. Returns the matching lines found (may be fewer than `count` on timeout).
async function waitForLines(page, cons, sinceIdx, matchSubstr, count, timeoutMs) {
  const start = Date.now();
  let found = [];
  while (Date.now() - start < timeoutMs) {
    found = cons.slice(sinceIdx).filter(t => t.indexOf(matchSubstr) >= 0);
    if (found.length >= count) return found;
    await page.waitForTimeout(150);
  }
  return found;
}

async function waitReady(page) {
  let ready = false;
  for (let i = 0; i < 90 && !ready; i++) {
    await page.waitForTimeout(1000);
    try { ready = await page.evaluate(() => !!(window.APP && window.APP.guidMap && Object.keys(window.APP.guidMap).length > 0
      && window.APP.streaming === false)); } catch (e) {}
  }
  return ready;
}

// Parse a §ROOM_CYCLE line into {press,guid,area,name,facing}.
function parseRoomCycle(line) {
  const m = /§ROOM_CYCLE press=(\d+) guid=(\S+) area=([\d.]+) name=(.*?) facing=(\S+)/.exec(line);
  if (!m) return null;
  return { press: +m[1], guid: m[2], area: +m[3], name: m[4], facing: m[5] };
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const cons = [];
  page.on('console', m => { cons.push(m.text()); });

  S('── witness_room_cycle_home (HHS_Office_Federated) ──');
  await page.goto('http://127.0.0.1:' + server.address().port +
    '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated',
    { waitUntil: 'load', timeout: 60000 });
  const ready = await waitReady(page);
  verdict(ready, 'real model loaded + ready (HHS_Office_Federated)');
  if (!ready) {
    S('\n❌ ABORT — model never became ready');
    fs.writeFileSync(path.join(__dirname, 'witness_room_cycle_home_2026-07-22.log'), log.join('\n') + '\n');
    await browser.close(); server.close(); process.exit(1);
  }

  // ══ Independent ground-truth: fetch every IfcSpace row, aggregate/filter in THIS script's own
  // plain-JS logic (not scene.js's SQL string) — a real cross-check, not a rubber-stamp of the
  // production query. Runs against the SAME live self-healed A.db (A.ensureRooms already ran once
  // via the first 'r' press below) — the on-disk fixture has no room_guid column until the
  // in-browser self-heal ALTERs it in; that's the fixture's real, current, on-disk state, per
  // ROOM_CYCLE_HOME_SHORTCUTS.md's own Confirmed facts, not an assumption.
  async function independentLargestRooms() {
    return page.evaluate(() => {
      const A = window.APP;
      const cols = A.dbQuery('PRAGMA table_info(spatial_structure)');
      const hasRoomGuid = cols.some(c => c[1] === 'room_guid');
      const rgIdx = hasRoomGuid ? 'has' : 'no';
      const rows = A.dbQuery('SELECT guid, ' + (hasRoomGuid ? 'room_guid' : 'guid') +
        ', size_x, size_y, predefined_type FROM spatial_structure WHERE type=\'IfcSpace\'');
      const groups = {};
      for (const r of rows) {
        const rg = r[1];
        const ptype = r[4] || '';
        if (!rg) continue;
        if (ptype.indexOf('SUSPECT_') === 0) continue;
        const area = (r[2] || 0) * (r[3] || 0);
        groups[rg] = (groups[rg] || 0) + area;
      }
      const list = Object.keys(groups).map(g => ({ guid: g, area: groups[g] })).filter(x => x.area > 0);
      list.sort((a, b) => b.area - a.area);
      return { rgIdx, list };
    });
  }

  // ── §ROOM_CYCLE press 1: R ──
  let sinceIdx = cons.length;
  await page.keyboard.press('r');
  let raw = await waitForLines(page, cons, sinceIdx, '§ROOM_CYCLE', 1, 15000); // slow first call: A.loadNavigate() + A.ensureRooms()
  let lines = raw.map(parseRoomCycle).filter(Boolean);
  verdict(lines.length >= 1, 'first R press emitted a §ROOM_CYCLE line', 'lines=' + lines.length);
  const p1 = lines[0];
  if (p1) S('     [console] press=1 guid=' + p1.guid + ' area=' + p1.area + ' name="' + p1.name + '" facing=' + p1.facing);

  const gt = await independentLargestRooms();
  S('     [info] independent cross-check: room_guid column ' + gt.rgIdx + ', ' + gt.list.length + ' rooms, top=' +
    (gt.list[0] ? gt.list[0].guid + '@' + gt.list[0].area.toFixed(1) : 'none'));

  // (a) first R press lands on the DB-verified largest room
  const aOk = !!p1 && !!gt.list[0] && p1.guid === gt.list[0].guid && Math.abs(p1.area - gt.list[0].area) < 0.5;
  verdict(aOk, '(a) first R press == independently-computed largest room',
    p1 && gt.list[0] ? 'scene.js=' + p1.guid + '@' + p1.area.toFixed(1) + ' independent=' + gt.list[0].guid + '@' + gt.list[0].area.toFixed(1) : 'missing data');

  // ── §ROOM_CYCLE presses 2 and 3: R, R ──
  sinceIdx = cons.length;
  await page.keyboard.press('r');
  await waitForLines(page, cons, sinceIdx, '§ROOM_CYCLE', 1, 3000);
  await page.keyboard.press('r');
  await waitForLines(page, cons, sinceIdx, '§ROOM_CYCLE', 2, 3000);
  lines = cons.slice(sinceIdx).filter(t => t.indexOf('§ROOM_CYCLE') >= 0).map(parseRoomCycle).filter(Boolean);
  verdict(lines.length === 2, '2 more R presses each emitted one §ROOM_CYCLE line', 'lines=' + lines.length);
  lines.forEach(l => S('     [console] press=' + l.press + ' guid=' + l.guid + ' area=' + l.area + ' name="' + l.name + '" facing=' + l.facing));
  const seq = [p1, ...lines].filter(Boolean);

  // (b) 3 successive R presses: strictly non-increasing area, no duplicate guid
  let nonIncreasing = true;
  for (let i = 1; i < seq.length; i++) if (seq[i].area > seq[i - 1].area + 1e-6) nonIncreasing = false;
  const guids = seq.map(s => s.guid);
  const noDup = new Set(guids).size === guids.length;
  verdict(seq.length === 3, '(b) captured all 3 presses', 'count=' + seq.length);
  verdict(nonIncreasing, '(b) area is non-increasing across the 3 presses', JSON.stringify(seq.map(s => s.area)));
  verdict(noDup, '(b) no duplicate room_guid across the 3 presses', JSON.stringify(guids));

  // ── (c) Home mid-cycle, then R again → back to the SAME largest-room guid as (a) ──
  sinceIdx = cons.length;
  await page.keyboard.press('Home');
  const homeLines1 = await waitForLines(page, cons, sinceIdx, '§ROOM_HOME', 1, 3000);
  verdict(homeLines1.length >= 1, '(c) Home (no panel focus, no active nav) emitted §ROOM_HOME', 'lines=' + homeLines1.length);
  if (homeLines1[0]) S('     [console] ' + homeLines1[0]);

  sinceIdx = cons.length;
  await page.keyboard.press('r');
  raw = await waitForLines(page, cons, sinceIdx, '§ROOM_CYCLE', 1, 3000);
  lines = raw.map(parseRoomCycle).filter(Boolean);
  const p1b = lines[0];
  verdict(!!p1b && p1b.press === 1, '(c) R after Home is press=1 again (cycle index reset)', p1b ? 'press=' + p1b.press : 'no line');
  verdict(!!p1b && !!p1 && p1b.guid === p1.guid, '(c) R after Home returns to the SAME largest-room guid as (a)',
    p1b && p1 ? 'after-home=' + p1b.guid + ' step-a=' + p1.guid : 'missing data');

  // ── (d) Home while the Find panel has keyboard focus — real user path: rail pill →
  // Navigate drawer → Find row → click inside the panel to focus it (pointerdown, same
  // convention _registerPanel's own listener uses), same as witness_room_box_purple_2026-07-12.js. ──
  await page.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 }).catch(() => {});
  await page.click('#mobile-trigger', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  async function tap(id) {
    return page.evaluate((eid) => {
      const el = document.getElementById(eid);
      if (!el) return false;
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return true;
    }, id);
  }
  const railHit = await tap('pill-navigate');
  const rowHit = await tap('drawer-row-find');
  verdict(railHit && rowHit, 'Find panel opened via real rail-pill → drawer-row path', 'rail=' + railHit + ' row=' + rowHit);
  await page.waitForTimeout(400);
  const focusHit = await page.evaluate(() => {
    const el = document.getElementById('find-name');
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return true;
  });
  await page.waitForTimeout(200);
  const focusedId = await page.evaluate(() => (window._panels || []).find(p => p.el && p.el.style.boxShadow) ?
    (window._panels.find(p => p.el.style.boxShadow) || {}).id : null);
  verdict(focusHit && focusedId === 'find', 'Find panel is the keyboard-focused panel (_focusedPanel.id==="find")', 'focusedId=' + focusedId);

  cons.length = 0;
  await page.keyboard.press('Home');
  await page.waitForTimeout(400);
  const dHomeStolen = cons.filter(t => t.indexOf('§ROOM_HOME') >= 0);
  const dPanelRoute = cons.filter(t => t.indexOf('§KBD_ROUTE panel=find key=Home') >= 0);
  verdict(dHomeStolen.length === 0, '(d) §ROOM_HOME did NOT fire (not stolen from the focused panel)', 'lines=' + dHomeStolen.length);
  verdict(dPanelRoute.length >= 1, '(d) Home was routed to the Find panel\'s own list-nav (§KBD_ROUTE panel=find key=Home), existing behavior preserved',
    'lines=' + dPanelRoute.length);
  if (dPanelRoute[0]) S('     [console] ' + dPanelRoute[0]);

  // Blur the panel before the corridor-nav case so it doesn't shadow that guard too.
  await page.evaluate(() => { if (window._blurPanel) window._blurPanel(); });
  await page.waitForTimeout(200);

  // ── (e) Home while A._nav.active (real corridor-nav session) — call the SAME production
  // A.startNavigation() the Find panel's own ▶ Navigate button calls, with a real target row
  // pulled from element_transforms/elements_meta (never invented), trying a few real doors until
  // one produces a real walkable path (§NAV_START / nav.active===true). ──
  const navResult = await page.evaluate(async () => {
    const A = window.APP;
    if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
    const rows = A.dbQuery(
      "SELECT m.guid, m.ifc_class, m.element_name, m.storey, t.center_x, t.center_y, t.center_z " +
      "FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid " +
      "WHERE m.ifc_class IN ('IfcDoor','IfcDoorStandardCase') AND m.building = ? LIMIT 12", [A.activeBuilding || '']);
    for (const r of rows) {
      const target = { guid: r[0], ifc_class: r[1], element_name: r[2], storey: r[3], cx: r[4], cy: r[5], cz: r[6] };
      A.startNavigation(target);
      if (A._nav && A._nav.active) return { ok: true, guid: r[0], storey: r[3], candidates: rows.length };
    }
    return { ok: false, candidates: rows.length };
  });
  verdict(navResult.ok, '(e) real corridor-nav session started (A.startNavigation succeeded on a real door target)',
    JSON.stringify(navResult));

  if (navResult.ok) {
    // Advance a step first so resetToStart (stepIdx -> 0) is an observable, non-trivial change.
    await page.evaluate(() => { if (window.APP.advanceNavStep) window.APP.advanceNavStep(); });
    await page.waitForTimeout(300);
    const stepBefore = await page.evaluate(() => window.APP._nav ? window.APP._nav.stepIdx : null);

    cons.length = 0;
    await page.keyboard.press('Home');
    await page.waitForTimeout(400);
    const eHomeStolen = cons.filter(t => t.indexOf('§ROOM_HOME') >= 0);
    const eNavReset = cons.filter(t => t.indexOf('§NAV_MOVE_CAM wp=0/') >= 0);
    const stepAfter = await page.evaluate(() => window.APP._nav ? window.APP._nav.stepIdx : null);
    const activeAfter = await page.evaluate(() => window.APP._nav ? window.APP._nav.active : null);
    verdict(eHomeStolen.length === 0, '(e) §ROOM_HOME did NOT fire (not stolen while corridor-nav is active)', 'lines=' + eHomeStolen.length);
    verdict(eNavReset.length >= 1, '(e) corridor-nav\'s own Home handler fired (§NAV_MOVE_CAM wp=0/… — real resetToStart)',
      'lines=' + eNavReset.length);
    verdict(activeAfter === true, '(e) A._nav.active is still true after Home (route reset, not exited)', 'active=' + activeAfter);
    verdict(stepBefore > 0 && stepAfter === 0, '(e) A._nav.stepIdx actually reset to 0 (real state change, not just a log line)',
      'before=' + stepBefore + ' after=' + stepAfter);
    if (eNavReset[0]) S('     [console] ' + eNavReset[0]);
  }

  await page.close(); await ctx.close();
  await browser.close();
  server.close();

  S('\n' + (fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAILED'));
  fs.writeFileSync(path.join(__dirname, 'witness_room_cycle_home_2026-07-22.log'), log.join('\n') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
