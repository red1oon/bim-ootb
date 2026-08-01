#!/usr/bin/env node
/**
 * §CPE_DAY_COUNTER witness — prompts/CINEMA_PATH_EDITOR.md §CPE_DAY_COUNTER.
 *
 * THE ISSUES THIS PROVES OR DISPROVES (a test that names neither is not a test):
 *  T1 "Day 1 is day one"      — an off-by-one on the FIRST frame is the one a client screening
 *                               notices. Gates dayCounterAt at projectStart, mid-span, and exactly
 *                               projectEnd (which must read totalDays, never totalDays+1).
 *  T2 "no span, no badge"     — a film with no buildup must draw NOTHING rather than a fabricated
 *                               "Day 1". Gates the null return.
 *  T3 "it reaches the EXPORTED bytes" — the trap cpe_room_title.js's header names and the whole
 *                               reason this is a canvas composite and not a DOM badge. Draws onto a
 *                               real 2D canvas and asserts pixels actually changed IN THE TOP-RIGHT
 *                               and did NOT change in the lower-third (where §CPE_ROOM_TITLE lives).
 *                               A DOM implementation passes T1/T2 and FAILS T3 — that is the point.
 *  T4 "monotonic across a film" — the badge must never go backwards as the cursor advances, which is
 *                               what a viewer reads as "progress".
 * RUN: node witness_cpe_day_counter.js
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.db': 'application/octet-stream' };
// A fresh worktree has no buildings/*.db (they are gitignored — DB CHANGES = MIGRATION SCRIPT, the
// binaries never enter git). Serve code from the WORKTREE (the code under test) and fall back to the
// primary checkout for those read-only assets. Deliberately NOT a symlink into the worktree: a
// tracked symlink target gets committed and kills the deploy (feedback_never_symlink_into_repo_worktree).
const FALLBACK_ROOT = '/home/red1/bim-ootb';
function makeServer(root) {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    const send = (b) => {
      r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      r.end(b);
    };
    fs.readFile(path.join(root, p), (e, b) => {
      if (!e) return send(b);
      // viewer.html resolves ?db= relative to viewer/, so the request arrives as
      // /viewer/buildings/X.db while the file lives at buildings/X.db — try both.
      const alt = p.replace(/^\/viewer\//, '/');
      fs.readFile(path.join(FALLBACK_ROOT, p), (e2, b2) => {
        if (!e2) return send(b2);
        fs.readFile(path.join(FALLBACK_ROOT, alt), (e3, b3) => {
          if (e3) { r.writeHead(404); r.end('404'); return; }
          send(b3);
        });
      });
    });
  });
}
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
const _watchdog = setTimeout(() => { console.log('\n§W-DAYCOUNT TIMEOUT — killed after 90s'); process.exit(3); }, 90000);

(async () => {
  const server = makeServer(ROOT);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const pg = await br.newPage();
  await pg.setViewport({ width: 1400, height: 900 });
  pg.on('console', m => { const t = m.text(); if (t.indexOf('§CPE_DAY_COUNTER') === 0) console.log('   log: ' + t); });
  const url = `http://localhost:${port}/viewer/viewer.html?db=buildings/Duplex_extracted.db`;
  await pg.goto(url, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('!!window.APP && !!window.APP.camera', { timeout: 45000 });
  // ⚠ main.js runs its module list AFTER setupScene resolves, so APP.camera existing does NOT mean
  // setupCpeDayCounter has run. Gating on APP.camera reported "module absent" for a module that was
  // present — the checker was wrong, not the code (feedback_verify_checker_before_code_under_test).
  await pg.waitForFunction('typeof window.APP.dayCounterAt === "function"', { timeout: 30000 })
    .catch(() => {});

  const armed = await pg.evaluate(() => typeof window.APP.dayCounterAt === 'function' &&
                                        typeof window.APP.dayCounterCompositeOntoCanvas === 'function');
  chk('T0 module loaded (dayCounterAt + compositor on APP)', armed);
  if (!armed) { clearTimeout(_watchdog); await br.close(); server.close(); console.log('\n§W-DAYCOUNT 0/... module absent'); process.exit(1); }

  const DAY = 86400000;
  // ── T1/T2: the arithmetic, at exact cursors. 180-day span, the same shape as the user's
  // §AUTHOR_UI_DATES start=2026-01-01 span=180d.
  const r1 = await pg.evaluate((DAY) => {
    const A = window.APP, s = Date.UTC(2026, 0, 1), e = s + 180 * DAY;
    return {
      atStart: A.dayCounterAt(s, s, e),
      atMid: A.dayCounterAt(s + 90 * DAY, s, e),
      atEndExact: A.dayCounterAt(e, s, e),
      justUnderDay2: A.dayCounterAt(s + DAY - 1, s, e),
      noSpan: A.dayCounterAt(s, s, s),
      inverted: A.dayCounterAt(s, e, s)
    };
  }, DAY);
  chk('T1a projectStart reads Day 1 (not Day 0)', r1.atStart && r1.atStart.day === 1, JSON.stringify(r1.atStart));
  chk('T1b one ms before day 2 still reads Day 1', r1.justUnderDay2 && r1.justUnderDay2.day === 1, JSON.stringify(r1.justUnderDay2));
  chk('T1c mid-span reads Day 91', r1.atMid && r1.atMid.day === 91, JSON.stringify(r1.atMid));
  chk('T1d projectEnd clamps to totalDays (no 181/180)', r1.atEndExact && r1.atEndExact.day === 180 && r1.atEndExact.totalDays === 180, JSON.stringify(r1.atEndExact));
  chk('T2a zero span -> null (no fabricated Day 1)', r1.noSpan === null);
  chk('T2b inverted span -> null', r1.inverted === null);

  // ── T4: monotonic across a whole film's worth of cursors.
  const mono = await pg.evaluate((DAY) => {
    const A = window.APP, s = Date.UTC(2026, 0, 1), e = s + 180 * DAY;
    let last = 0, ok = true, seen = [];
    for (let i = 0; i <= 820; i++) {
      const d = A.dayCounterAt(s + (i / 820) * (e - s), s, e);
      if (!d || d.day < last) ok = false;
      last = d ? d.day : last;
      if (i % 205 === 0) seen.push(d.day);
    }
    return { ok, last, seen };
  }, DAY);
  chk('T4 never goes backwards over 821 frames, ends on the last day', mono.ok && mono.last === 180, 'checkpoints=' + mono.seen.join(','));

  // ── T3: the pixels. This is the one a DOM badge cannot pass.
  const px = await pg.evaluate(() => {
    const A = window.APP, w = 1852, h = 960;   // the real bake size from the user's §MAXQ_MP4 line
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#123456'; ctx.fillRect(0, 0, w, h);   // known flat background
    const before = ctx.getImageData(0, 0, w, h).data;
    A.dayCounterCompositeOntoCanvas(ctx, w, h, { day: 137, totalDays: 180 }, 1);
    const after = ctx.getImageData(0, 0, w, h).data;
    function changedIn(x0, y0, x1, y1) {
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2]) n++;
      }
      return n;
    }
    return {
      topRight: changedIn(Math.floor(w * 0.5), 0, w, Math.floor(h * 0.25)),
      topLeft: changedIn(0, 0, Math.floor(w * 0.5), Math.floor(h * 0.25)),
      lowerThird: changedIn(0, Math.floor(h * 0.75), w, h)
    };
  });
  chk('T3a badge writes pixels in the TOP RIGHT (reaches exported bytes)', px.topRight > 500, 'changedPx=' + px.topRight);
  chk('T3b nothing drawn top-LEFT (it is where the user asked, not just "a corner")', px.topLeft === 0, 'changedPx=' + px.topLeft);
  chk('T3c nothing drawn in the lower third (no collision with §CPE_ROOM_TITLE)', px.lowerThird === 0, 'changedPx=' + px.lowerThird);

  clearTimeout(_watchdog);
  await br.close(); server.close();
  console.log('\n§W-DAYCOUNT ' + pass + '/' + (pass + fail) + (fail ? ' — FAIL' : ' — all green'));
  process.exit(fail ? 1 : 0);
})().catch(e => { clearTimeout(_watchdog); console.error('§W-DAYCOUNT ERROR ' + e.message); process.exit(2); });
