#!/usr/bin/env node
// WITNESS — s7_canvas_pick (W-S7-CANVAS-PICK). Spec: bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md
// §S7-OPEN (user ruling 2026-09-14, option 1: wire 4D only, leave S2's cost surface alone).
//
// ISSUE THIS PROVES OR DISPROVES — measured and recorded as §S7-OPEN after legs 2-4 shipped:
// `#info-4d` did NOT render on a plain 3D-canvas click. Both it and S2's `#info-cost` were wired
// only to navigate_find.js's pinpoint pick (`:4870`), and find_erp_push.js — where the renderer
// lived — sits inside `APP.loadNavigate()`'s LAZY bundle (main.js ~:187). So `A._show4DWindow`
// literally did not exist until the user had opened the Find panel once, and the headline
// interaction of the whole stage ("click an element, see when it gets built") was unreachable by
// the most common gesture there is. This witness fails if that regresses.
//
// WHICH LAYER THIS PROVES (WITNESS_INTERFACE_FRAMEWORK.md §CRISIS LESSON 1 requires naming it):
// the WIRING layer — that a real pointer click on the real canvas reaches the real renderer with
// the Find bundle NEVER loaded. It says nothing about whether the dates are right (that is
// W-S7-WINDOW's job, 13/13) nor about their grain (W-S7-TASK-GRAIN, 12/12). The three are
// deliberately separate; conflating them is how a green suite hides an unreachable feature.
//
// THE LOAD-ORDER ASSERTION IS THE POINT. `loadNavigate()` is never called here, and the witness
// asserts `window.APP._show4DWindow === undefined` BEFORE clicking. Without that assertion the test
// would pass even if the fix were reverted, because any incidental Find load would supply the
// renderer — i.e. it would gate nothing. That is the trap this file exists to avoid.
//
// Command: node viewer/tests/witness_s7_canvas_pick.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const REPO = path.resolve(__dirname, '..', '..');
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const BLD_ROOT = path.dirname(BLD_DIR);
const SCHED_DB_LIVE = path.join(BLD_DIR, 'HHS_Office_Federated_silent.db');

let pass = 0, fail = 0, skipped = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function skip(msg) { skipped++; console.log('  SKIP ' + msg); }

async function main() {
  let puppeteer;
  try { puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); }
  catch (e) { try { puppeteer = require('puppeteer'); } catch (e2) { puppeteer = null; } }
  if (!puppeteer) { skip('no puppeteer install found — this witness is browser-only, so there is NO evidence this run'); return; }
  if (!fs.existsSync(SCHED_DB_LIVE)) { skip('HHS_Office_Federated_silent.db not present — the only small DB with a persisted schedule'); return; }

  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    // Fleet DBs are not git-tracked, so /buildings/* comes from the shared checkout (read-only);
    // everything else — the code under test — comes from THIS worktree. Same split as witness_s7_gate.js.
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
  catch (e) { skip('Chromium failed to launch (' + e.message + ')'); server.close(); return; }

  try {
    const page = await browser.newPage();
    const logs = [], errs = [];
    page.on('console', (m) => logs.push(m.text()));
    page.on('pageerror', (e) => errs.push(String(e)));

    await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=../buildings/HHS_Office_Federated_silent.db&bld=HHS_Office_Federated', { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction('!!(window.APP && window.APP.camera && window.APP.db && window.APP.canvas)', { timeout: 90000 });
    await new Promise((r) => setTimeout(r, 3000));   // let streaming settle so meshes are really there

    // ── the gate that makes this witness mean something ─────────────────────────────────────────
    assert(await page.evaluate(() => typeof window.APP._show4DWindow === 'undefined'),
      'the LAZY Find bundle has NOT loaded (APP._show4DWindow undefined) — the exact state in which #info-4d used to render nothing');
    assert(await page.evaluate(() => !!(window.Info4DPanel && window.Info4DPanel.render)),
      'window.Info4DPanel.render IS available anyway (eager script tag, outside APP.loadNavigate)');
    assert(await page.evaluate(() => !!(window.ScheduleRead4D && window.ScheduleRead4D.windowForGuid)),
      'window.ScheduleRead4D.windowForGuid is loaded eagerly too (leg 1, the read this renders)');

    // ── real on-screen candidates, then CLICK UNTIL ONE LANDS ───────────────────────────────────
    // Occlusion-safe by construction, the same concession witness_s7_hover_budget.js documents: in a
    // dense BIM scene the element whose CENTRE projects to a pixel is very often not the front-most
    // thing under it. So we do not insist on picking the element we aimed at — we insist that a pick
    // HAPPENS and that whatever it resolved to renders the block. Demanding a specific guid would
    // make this a test of camera framing, not of the wire.
    const targets = await page.evaluate(() => {
      const A = window.APP;
      const rows = A.dbQuery(
        `SELECT DISTINCT t.guid, t.center_x, t.center_y, t.center_z FROM element_transforms t
         WHERE t.center_x IS NOT NULL ORDER BY RANDOM() LIMIT 4000`);
      const out = [];
      for (const r of rows) {
        const [guid, ix, iy, iz] = r;
        const c = A.ifc2three(ix, iy, iz);
        const v = new THREE.Vector3(c.x, c.y, c.z).project(A.camera);
        if (v.z < -1 || v.z > 1) continue;
        const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
        const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
        if (sx < 30 || sx > window.innerWidth - 30 || sy < 30 || sy > window.innerHeight - 30) continue;
        out.push({ guid, sx, sy });
        if (out.length >= 25) break;
      }
      return out;
    });
    assert(targets.length > 0, 'at least one real on-screen candidate pixel found (got ' + targets.length + ')');

    const box = await page.evaluate(() => { const r = window.APP.canvas.getBoundingClientRect(); return { x: r.x, y: r.y }; });
    let landed = null, afterLogs = [];
    for (const t of targets) {
      const before = logs.length;
      await page.mouse.click(box.x + t.sx, box.y + t.sy, { delay: 40 });
      await new Promise((r) => setTimeout(r, 450));
      const after = logs.slice(before);
      if (after.some((l) => l.indexOf('§PICK ') > -1)) { landed = t; afterLogs = after; break; }
    }

    if (!landed) {
      skip('no click landed on geometry across ' + targets.length + ' candidate pixels — occlusion/streaming, NOT evidence either way. Post-click log of the last attempt: ' + JSON.stringify(logs.slice(-6)));
    } else {
      assert(true, 'a plain canvas click landed on geometry (§PICK logged) at screen(' + Math.round(landed.sx) + ',' + Math.round(landed.sy) + ')');

      const state = await page.evaluate(() => {
        const b = document.getElementById('info-4d');
        return { present: !!b, display: b ? b.style.display : null, text: b ? b.textContent : '' };
      });
      assert(state.present, '#info-4d exists in the DOM');
      assert(state.display === 'block',
        '#info-4d is VISIBLE after a plain canvas click, with the Find bundle never loaded (display=' + state.display + ')');
      assert(/Construction window/.test(state.text), '#info-4d rendered its Construction window heading');
      assert(afterLogs.some((l) => l.indexOf('§4D_INFO_PANEL') > -1),
        'the renderer logged §4D_INFO_PANEL on this click — the wire is live, not a coincidental pre-existing DOM state');

      // The picked element either HAS a dated task or does not. Both are correct renders; what is
      // NOT acceptable is a visible-but-empty block, or a bare date with no task name beside it
      // (§S7-GRAIN: 41 windows over 63,415 elements on Hospital — a date alone reads as per-element).
      const hasWindow = /Task/.test(state.text) && /\d{4}-\d{2}-\d{2}\s*→\s*\d{4}-\d{2}-\d{2}/.test(state.text);
      const honestMiss = /Not yet assigned to a dated task/.test(state.text);
      assert(hasWindow || honestMiss,
        'the block says something TRUE: either a task name + start→finish range, or the honest "not yet assigned" line — never an empty box (text=' + JSON.stringify(state.text.slice(0, 140)) + ')');
      assert(!(/\d{4}-\d{2}-\d{2}/.test(state.text)) || hasWindow,
        'no date is ever rendered without its TASK name beside it (§S7-GRAIN)');

      assert(await page.evaluate(() => typeof window.APP._show4DWindow === 'undefined'),
        'APP._show4DWindow is STILL undefined after the click — the canvas path never needed the Find bundle');

      // ── option 1, explicitly: S2's cost surface must NOT have widened ────────────────────────
      const cost = await page.evaluate(() => { const b = document.getElementById('info-cost'); return b ? b.style.display : null; });
      assert(cost !== 'block',
        '#info-cost did NOT appear on this canvas click — S2\'s shipped cost surface is unchanged (§S7-OPEN option 1, user ruling)');

      console.log('  §4D_INFO_PANEL: ' + JSON.stringify(afterLogs.filter((l) => l.indexOf('§4D_INFO_PANEL') > -1)));
      console.log('  #info-4d text: ' + JSON.stringify(state.text.slice(0, 160)));
    }

    assert(errs.length === 0, 'no uncaught page errors during the run' + (errs.length ? ' — ' + JSON.stringify(errs.slice(0, 3)) : ''));
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
}

main().then(() => {
  console.log('§WITNESS_S7_CANVAS_PICK pass=' + pass + ' fail=' + fail + ' skipped=' + skipped);
  if (skipped && !pass) console.log('NO EVIDENCE — every leg skipped; do NOT read this as a pass');
  process.exit(fail ? 1 : 0);
}).catch((e) => { console.log('§WITNESS_S7_CANVAS_PICK THREW ' + e.message); process.exit(1); });
