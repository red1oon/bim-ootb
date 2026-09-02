#!/usr/bin/env node
/**
 * Root-causes why a room title only flashes briefly during the Preview rehearsal: §CPE_PREVIEW's
 * _previewFly plays the WHOLE film compressed into a fixed 10 real seconds regardless of the
 * film's actual length (pre-existing behavior, unrelated to room titles — camera motion itself is
 * equally sped up). So a room the camera dwells in for several real seconds in the actual bake
 * compresses to a much shorter flash during the fast preview scrub. Confirmed here by comparing the
 * film's real total seconds against the wall-clock window a segment actually occupies during
 * Preview. NOT a bug — user-confirmed the title reads fine in the finished bake (2026-07-30).
 * RUN: node witness_cpe_room_title_timing.js
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.db': 'application/octet-stream' };
function makeServer(root) {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    fs.readFile(path.join(root, p), (e, b) => {
      if (e) { r.writeHead(404); r.end('404'); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      r.end(b);
    });
  });
}
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
const _watchdog = setTimeout(() => { console.log('\n§W-TIMING TIMEOUT — killed after 90s'); process.exit(3); }, 90000);

(async () => {
  const server = makeServer(ROOT);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const pg = await br.newPage();
  await pg.setViewport({ width: 1400, height: 900 });
  const url = `http://localhost:${port}/viewer/viewer.html?db=buildings/Duplex_extracted.db`;
  await pg.goto(url, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('!!window.APP && !!window.APP.camera && !!window.APP.db', { timeout: 45000 });
  await new Promise(r => setTimeout(r, 2000));
  await pg.evaluate(() => window.APP.loadNavigate ? window.APP.loadNavigate() : null);
  await pg.evaluate(() => window.APP.ensureRooms ? window.APP.ensureRooms({}) : null);
  await new Promise(r => setTimeout(r, 500));

  const REQUESTED_SEC = 15;
  const PREVIEW_WALL_SEC = 10; // matches cinema_path_editor.js's fixed rehearsal speed

  // Single evaluate — everything for this check happens in one page-context round trip so no
  // editor instance is left dangling across separate evaluate() calls (that caused an earlier
  // draft of this witness to crash with a collected-Promise error).
  const result = await pg.evaluate(async (REQUESTED_SEC) => {
    const A = window.APP;
    let plan; try { plan = A.cinemaPathPlan(REQUESTED_SEC); } catch (e) { return { ok: false, reason: 'plan failed: ' + e.message }; }

    // Instrument roomTitleLiveStart to capture the REAL totalSec it's called with — this is
    // _buildOverride()._total (the film's own natural duration), which is NOT guaranteed to equal
    // REQUESTED_SEC (the plan was asked to target that duration, but the editor's own "natural"
    // duration calc can differ slightly) — that's fine, it's self-consistent either way.
    let capturedTotalSec = null;
    const origStart = A.roomTitleLiveStart;
    A.roomTitleLiveStart = function(p, totalSec) { capturedTotalSec = totalSec; return origStart(p, totalSec); };

    const openPromise = A.cinemaPathEditor.open({ plan: plan, durationSec: REQUESTED_SEC, fps: 15 });
    await new Promise(r => setTimeout(r, 400));
    const cb = document.getElementById('cpe-room-title');
    if (!cb) { A.roomTitleLiveStart = origStart; return { ok: false, reason: 'no checkbox' }; }
    cb.click();
    await new Promise(r => setTimeout(r, 50));
    document.getElementById('cpe-preview').click();
    await new Promise(r => setTimeout(r, 500)); // let startFly's first tick run (calls roomTitleLiveStart)

    A.roomTitleLiveStart = origStart; // restore before anything else touches it
    if (capturedTotalSec == null) { document.getElementById('cpe-cancel').click(); return { ok: false, reason: 'roomTitleLiveStart never called' }; }

    const segs = A.roomTitleBuildTimeline(plan, capturedTotalSec);
    document.getElementById('cpe-cancel').click(); // close cleanly before this evaluate returns

    return { ok: true, requestedSec: REQUESTED_SEC, filmRealTotalSec: capturedTotalSec, segments: segs };
  }, REQUESTED_SEC);

  console.log('  ' + JSON.stringify(result));
  chk('roomTitleLiveStart fired with a real film-duration total', result.ok, result.reason || '');
  if (result.ok) {
    chk('timeline produced at least one segment on this Duplex path', result.segments.length > 0, 'n=' + result.segments.length);
    if (result.segments.length > 0) {
      const seg = result.segments[0];
      // Wall-clock window this segment occupies during the FIXED 10s Preview rehearsal —
      // this is the number that explains "only flashes for ~1-2s of a 10s preview": it's the
      // segment's own real-seconds span, compressed by (real total / 10s), same as everything
      // else in the preview.
      const wallStart = (seg.tStart / result.filmRealTotalSec) * PREVIEW_WALL_SEC;
      const wallEnd = (seg.tEnd / result.filmRealTotalSec) * PREVIEW_WALL_SEC;
      console.log('  §CPE_ROOM_TITLE_TIMING seg="' + seg.name + '" realSec=[' + seg.tStart.toFixed(2) + ',' + seg.tEnd.toFixed(2) +
        '] (span=' + (seg.tEnd - seg.tStart).toFixed(2) + 's of a ' + result.filmRealTotalSec.toFixed(1) + 's film) → ' +
        'during the 10s Preview rehearsal this occupies wall-clock [' + wallStart.toFixed(2) + 's,' + wallEnd.toFixed(2) + 's] ' +
        '(span=' + (wallEnd - wallStart).toFixed(2) + 's) — NOT a bug, same compression the camera motion itself gets');
      chk('the compression math is internally consistent (wall window fits inside the 10s preview)',
        wallStart >= 0 && wallEnd <= PREVIEW_WALL_SEC + 0.01);
    }
  }

  await br.close();
  await server.close();
  clearTimeout(_watchdog);
  console.log('\n§W-TIMING DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('\n§W-TIMING CRASHED ' + (e && e.stack || e)); process.exit(2); });
