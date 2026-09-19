#!/usr/bin/env node
// WITNESS — W-S7-HOVER-BUDGET — hovering N distinct elements issues N `windowForGuid` calls, not
// N-per-frame; hover_name.js's existing `_lastGuid` early-return still holds with the extra lookup
// attached.
// Spec: bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S7-DO item 3 / §S7-WITNESS.
//
// ISSUE THIS PROVES OR DISPROVES: hover_name.js's own header names the exact trap this leg could
// have reopened — "raycast per pointermove is not free at 63k elements... an earlier draft
// re-raycast on a perpetual rAF loop and was replaced" — and the fix was the `guid === _lastGuid`
// early-return: work happens once per TARGET CHANGE, not per frame. §S7-DO item 3 bolts ONE more
// DB read (windowForGuid) onto that same hover path. If it were placed OUTSIDE the early-return
// (e.g. in a raw rAF tick, or before the guid-changed check), it would re-open exactly the O(frames)
// budget problem HOVER_NAME.md already had to fix once — the SAME element sitting under a
// stationary cursor for 2 seconds at 60fps would issue ~120 lookups instead of 1. This witness
// proves it did not: it holds the cursor stationary over each of N real, distinct, on-screen
// elements for several animation frames each (repeated mousemove events at the IDENTICAL pixel,
// forcing multiple rAF ticks per target) and counts the ACTUAL `windowForGuid` invocations via a
// live instrumented wrapper — not an inferred count, not a timing proxy.
//
// POPULATION: HHS_Office_Federated_silent.db (the real, smaller of the two persisted-schedule
// buildings — 80MB vs Hospital's 315MB symlink) with REAL on-screen elements, screen-projected off
// their own element_transforms centre (the same technique witness_hover_name.js uses), never
// synthetic screen coordinates.
//
// Command: node viewer/tests/witness_s7_hover_budget.js
//   Needs a Chromium binary (raycasting/THREE.js genuinely requires a real DOM+WebGL context — this
//   cannot be node-testable per the repo's own convention). If Chromium cannot launch here, this
//   witness is SKIPPED with a loud, explicit line — never silently treated as a pass.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg); }
}

const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const BLD_ROOT = path.dirname(BLD_DIR);
const DB = path.join(BLD_DIR, 'HHS_Office_Federated_silent.db');
const REPO = path.join(__dirname, '..', '..');

(async () => {
  if (!fs.existsSync(DB)) {
    console.log('§WITNESS_S7_HOVER_BUDGET SKIPPED — ' + DB + ' not present on this machine (needs the real persisted-schedule fleet DB named in the spec\'s TEST DATA section)');
    process.exitCode = 0;
    return;
  }

  let puppeteer;
  try { puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); }
  catch (e) { try { puppeteer = require('puppeteer'); } catch (e2) { puppeteer = null; } }
  if (!puppeteer) {
    console.log('§WITNESS_S7_HOVER_BUDGET SKIPPED — no puppeteer install found (checked project + ~/bim-compiler/node_modules); this witness genuinely needs a real DOM+WebGL raycast, it is not node-testable');
    process.exitCode = 0;
    return;
  }

  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    // /buildings/* is not git-tracked (only buildings/patches/*.sql is) — served from the shared
    // checkout's real fleet, same convention as witness_s7_gate.js's Part B.
    const root = p.indexOf('/buildings/') === 0 ? BLD_ROOT : REPO;
    fs.readFile(path.join(root, p), (e, buf) => {
      if (e) { res.writeHead(404); res.end('404 ' + p); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  let browser;
  try { browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] }); }
  catch (e) {
    console.log('§WITNESS_S7_HOVER_BUDGET SKIPPED — Chromium failed to launch (' + e.message + ')');
    server.close();
    process.exitCode = 0;
    return;
  }

  const _watchdog = setTimeout(() => {
    console.log('§WITNESS_S7_HOVER_BUDGET TIMEOUT — killed after 280s');
    process.exit(3);
  }, 280000);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));

    await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=../buildings/HHS_Office_Federated_silent.db&bld=HHS_Office_Federated', { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction('!!(window.APP && window.APP.camera && window.APP.db && window.APP.toggleHoverName)', { timeout: 90000 });
    await new Promise((r) => setTimeout(r, 3000));   // let streaming settle so meshes are actually there
    await page.evaluate(() => (window.APP.loadNavigate ? window.APP.loadNavigate() : Promise.resolve()));
    await new Promise((r) => setTimeout(r, 500));

    assert(await page.evaluate(() => !!(window.ScheduleRead4D && window.ScheduleRead4D.windowForGuid)),
      'window.ScheduleRead4D.windowForGuid is loaded (eager script tag) before hover ever runs');

    // ---- instrument windowForGuid with a live counting wrapper (real invocation count, not a proxy) --
    await page.evaluate(() => {
      window.__wfgCount = 0;
      window.__wfgCalls = [];
      const orig = window.ScheduleRead4D.windowForGuid;
      window.ScheduleRead4D.windowForGuid = function (db, guid, opts) {
        window.__wfgCount++;
        window.__wfgCalls.push(guid);
        return orig.call(this, db, guid, opts);
      };
    });

    // Turn hover-name on via the SAME public API the checkbox/`'` key drive (HOVER_NAME.md: one state).
    await page.evaluate(() => window.APP.toggleHoverName('api', true));
    const onNow = await page.evaluate(() => window.APP._hoverNameState().on);
    assert(onNow === true, 'hover-name armed via A.toggleHoverName(\'api\', true)');

    // ---- real, distinct, on-screen targets — projected off their own DB centre, not synthetic ------
    const N = 10;
    const targets = await page.evaluate((n) => {
      const A = window.APP;
      const rows = A.dbQuery(
        `SELECT DISTINCT t.guid, t.center_x, t.center_y, t.center_z FROM element_transforms t
         JOIN elements_meta m ON m.guid = t.guid WHERE t.center_x IS NOT NULL ORDER BY RANDOM() LIMIT ?`, [n * 4]);
      const out = [];
      rows.forEach((r) => {
        const [guid, ix, iy, iz] = r;
        const c = A.ifc2three(ix, iy, iz);
        const v = new THREE.Vector3(c.x, c.y, c.z).project(A.camera);
        if (v.z < -1 || v.z > 1) return;
        const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
        const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
        if (sx < 10 || sx > window.innerWidth - 10 || sy < 10 || sy > window.innerHeight - 10) return;
        out.push({ guid, sx, sy });
      });
      return out.slice(0, n);
    }, N);
    assert(targets.length >= 5, 'at least 5 real on-screen candidate targets found (got ' + targets.length + ')');

    const canvasBox = await page.evaluate(() => { const r = window.APP.canvas.getBoundingClientRect(); return { x: r.x, y: r.y }; });

    // ---- sweep: hold the cursor at each target for SEVERAL frames (repeated mousemove at the ------
    // IDENTICAL pixel) — this is the part that would explode into N_FRAMES-per-target calls if the
    // extra windowForGuid lookup sat outside the `guid===_lastGuid` early-return.
    const FRAMES_PER_TARGET = 6;
    let distinctResolved = 0;
    const countAfterTarget = [];
    for (const t of targets) {
      const cx = canvasBox.x + t.sx, cy = canvasBox.y + t.sy;
      // Move OUTSIDE the canvas first (negative coords) so hover_name.js's own pointermove listener
      // — bound to A.canvas, not window/document — never fires during the hop. An in-canvas "move
      // away" pixel would itself be a coin-flip real target (dense BIM scenes have geometry almost
      // everywhere), adding a SECOND legitimate call per sweep step and confusing "one call per
      // target" with "one call per intermediate hop too". Off-canvas guarantees _lastGuid simply
      // holds its previous value across the hop, so landing on the NEW target below is the only
      // guid change that occurs.
      await page.mouse.move(-20, -20, { steps: 1 });
      await new Promise((r) => setTimeout(r, 40));
      for (let f = 0; f < FRAMES_PER_TARGET; f++) {
        await page.mouse.move(cx, cy, { steps: 1 });
        await new Promise((r) => setTimeout(r, 40));   // >= one rAF tick per repeated move at the SAME pixel
      }
      const resolved = await page.evaluate(() => !!window.APP._hoverNameState().guid);
      if (resolved) distinctResolved++;
      const cnt = await page.evaluate(() => window.__wfgCount);
      countAfterTarget.push(cnt);
    }
    console.log('  targets=' + targets.length + ' framesPerTarget=' + FRAMES_PER_TARGET + ' distinctResolved=' + distinctResolved +
      ' wfgCount progression=' + JSON.stringify(countAfterTarget));

    const finalCount = countAfterTarget.length ? countAfterTarget[countAfterTarget.length - 1] : 0;
    assert(distinctResolved > 0, 'at least one target actually resolved to a hovered guid (occlusion-safe — the ACTUAL resolved element, per witness_hover_name.js\'s own documented caveat)');
    assert(finalCount <= distinctResolved,
      'W-S7-HOVER-BUDGET: total windowForGuid calls (' + finalCount + ') <= distinct resolved target-changes (' + distinctResolved +
      ') across ' + (targets.length * FRAMES_PER_TARGET) + ' raw mousemove events (' + FRAMES_PER_TARGET + ' frames x ' + targets.length +
      ' targets) — NOT one call per frame');
    assert(finalCount > 0, 'at least one real windowForGuid call actually fired during the sweep (the instrumentation is live, not a vacuous zero)');

    // Every entry in countAfterTarget should only ever step by 0 or 1 vs the previous target's final
    // count (0 if this target failed to resolve a NEW guid worth logging a name for, e.g. it hit the
    // exact same element as before or resolved nothing; 1 for a genuine new target). It must NEVER
    // jump by FRAMES_PER_TARGET (6) — that would mean the early-return let repeated same-pixel frames
    // through.
    let noPerFrameBlowup = true;
    for (let i = 1; i < countAfterTarget.length; i++) {
      const step = countAfterTarget[i] - countAfterTarget[i - 1];
      if (step > 1) { noPerFrameBlowup = false; console.log('    STEP TOO LARGE at target ' + i + ': +' + step); }
    }
    assert(noPerFrameBlowup, 'no single target-hold ever added more than 1 windowForGuid call, despite ' + FRAMES_PER_TARGET + ' repeated same-pixel mousemove events per target');

    // ---- re-visit the FIRST target again — must cost exactly one more call (a genuine target ------
    // CHANGE back to it), proving the count tracks target changes, not merely "first visit ever".
    const before = await page.evaluate(() => window.__wfgCount);
    await page.mouse.move(-20, -20, { steps: 1 });   // off-canvas hop — see the sweep loop's comment above
    await new Promise((r) => setTimeout(r, 40));
    for (let f = 0; f < FRAMES_PER_TARGET; f++) {
      await page.mouse.move(canvasBox.x + targets[0].sx, canvasBox.y + targets[0].sy, { steps: 1 });
      await new Promise((r) => setTimeout(r, 40));
    }
    const after = await page.evaluate(() => window.__wfgCount);
    console.log('  re-visit target[0]: before=' + before + ' after=' + after);
    assert(after - before <= 1, 'revisiting an EARLIER target after moving away costs at most ONE more call (' + (after - before) + '), not ' + FRAMES_PER_TARGET);

    assert(errs.length === 0, 'zero pageerrors through the whole sweep (errs=' + errs.join(' | ') + ')');

    await page.close();
  } finally {
    await browser.close();
    server.close();
    clearTimeout(_watchdog);
  }

  console.log('§WITNESS_S7_HOVER_BUDGET pass=' + pass + ' fail=' + fail);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exitCode = 1; }
  else console.log('PASS — the extra windowForGuid lookup added to hover_name.js costs one call per DISTINCT target change, never one call per animation frame — HOVER_NAME.md\'s raycast/query budget is not reopened');
})().catch((e) => { console.error('§WITNESS_S7_HOVER_BUDGET CRASHED ' + (e && e.stack || e)); process.exitCode = 2; });
