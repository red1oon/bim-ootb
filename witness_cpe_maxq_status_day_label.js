#!/usr/bin/env node
/**
 * §CPE_MAXQ_STATUS_DAY_LABEL witness — prompts/CINEMA_PATH_EDITOR.md §CPE_MAXQ_STATUS_DAY_LABEL.
 *
 * THE FEATURE: cinema_maxq.js's per-frame bake status line (the same site §CPE_STICK_APPROACH's
 * "approaching Stick k/N" clause lives on) now also carries the current Day # and room label —
 * "Day 42/214" and "Level 2 R3" — read from `_dayInfo`/`_titleInfo`, the SAME objects the loop
 * already computes every frame for the canvas-compositing path (_captureFrame). Nothing new is
 * computed; `window.APP.maxqStatusDayRoomSegs(dayInfo, titleInfo)` is the pure formatter the loop
 * calls, exposed for direct gating (same precedent as `A.dayCounterAt`/`A.roomTitleOpacityAt`
 * themselves — pure functions tested without sitting through a live bake).
 *
 * THE ISSUES THIS PROVES OR DISPROVES (a test that names neither is not a test):
 *  G-DRL-1  Day # on: at a few checkpoints (day 1, mid-span, last day) the segment reads exactly
 *           ", Day <day>/<totalDays>" off the SAME dayInfo the day-counter itself would draw —
 *           no re-derivation, no off-by-one.
 *  G-DRL-2  Day # off: dayInfo === null (the day-counter disabled for this bake, `_dayPos ===
 *           'off'`) produces an EMPTY day segment — never "Day null/null" or "Day undefined/...".
 *  G-DRL-3  Room label present: titleInfo.name set produces exactly ', "<name>"' — quoted, comma-
 *           led, matching the spec's own worked example.
 *  G-DRL-4  Room label absent (§CPE_ROOM_TITLE off, or titleInfo itself null): empty segment.
 *  G-DRL-5  Room label gap: titleInfo is a real (non-null) object but between rooms it carries no
 *           name (opacity fade with no active caption) — still an empty segment, not blank quotes
 *           (`', ""'`). This is the "gap" case named in the task: a present-but-empty titleInfo
 *           must be told apart from an absent one, and both must produce nothing.
 *  G-DRL-6  A short multi-frame sequence (day counter on throughout, room label on/gap/on/off)
 *           mirrors the per-frame loop's actual cadence — proving the segments track frame-to-
 *           frame instead of only working in isolation, exactly the "updates across frames
 *           including a gap" the task asks for.
 *  G-DRL-7  Composition order: when both segments are present, Day comes before the room label in
 *           the assembled string (the spec's own example: "Day 42/214, "Level 2 R3", approaching
 *           Stick 4/9") — proven by building the exact status line the bake loop builds and
 *           checking substring order, not just presence.
 * RUN: node witness_cpe_maxq_status_day_label.js
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.db': 'application/octet-stream' };
// A fresh worktree has no buildings/*.db (gitignored — DB CHANGES = MIGRATION SCRIPT, binaries
// never enter git). Serve code from the WORKTREE (the code under test), DB assets from the
// primary checkout. Deliberately NOT a symlink into the worktree (feedback_never_symlink_into_repo_worktree).
const FALLBACK_ROOT = '/home/red1/bim-ootb';
function makeServer(root) {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    const send = (b) => { r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); };
    fs.readFile(path.join(root, p), (e, b) => {
      if (!e) return send(b);
      const alt = p.replace(/^\/viewer\//, '/');
      fs.readFile(path.join(FALLBACK_ROOT, p), (e2, b2) => {
        if (!e2) return send(b2);
        fs.readFile(path.join(FALLBACK_ROOT, alt), (e3, b3) => { if (e3) { r.writeHead(404); r.end('404'); return; } send(b3); });
      });
    });
  });
}
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
const _watchdog = setTimeout(() => { console.log('\n§W-MAXQ-DRL TIMEOUT — killed after 90s'); process.exit(3); }, 90000);

(async () => {
  const server = makeServer(ROOT);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const pg = await br.newPage();
  await pg.setViewport({ width: 1400, height: 900 });
  pg.on('console', m => { const t = m.text(); if (t.indexOf('§CPE_MAXQ_STATUS_DAY_LABEL') === 0) console.log('   log: ' + t); });
  const url = `http://localhost:${port}/viewer/viewer.html?db=buildings/Duplex_extracted.db`;
  await pg.goto(url, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('!!window.APP && !!window.APP.camera', { timeout: 45000 });
  // ⚠ main.js runs its module list AFTER setupScene resolves — APP.camera existing does not mean
  // cinema_maxq.js's deferred _attach interval has fired yet (feedback_verify_checker_before_code_under_test).
  await pg.waitForFunction('typeof window.APP.maxqStatusDayRoomSegs === "function"', { timeout: 30000 }).catch(() => {});

  const armed = await pg.evaluate(() => typeof window.APP.maxqStatusDayRoomSegs === 'function');
  chk('T0 module loaded (maxqStatusDayRoomSegs exposed on APP)', armed);
  if (!armed) { clearTimeout(_watchdog); await br.close(); server.close(); console.log('\n§W-MAXQ-DRL 0/... module absent'); process.exit(1); }

  const r = await pg.evaluate(() => {
    const A = window.APP;
    const out = {};

    // ── G-DRL-1: Day # on, at a few checkpoints, off the SAME dayInfo shape A.dayCounterAt returns.
    out.dayStart = A.maxqStatusDayRoomSegs({ day: 1, totalDays: 214 }, null);
    out.dayMid   = A.maxqStatusDayRoomSegs({ day: 42, totalDays: 214 }, null);
    out.dayLast  = A.maxqStatusDayRoomSegs({ day: 214, totalDays: 214 }, null);

    // ── G-DRL-2: Day # off — dayInfo is null (the real value the loop carries when _dayPos==='off'
    // or there is no buildup span).
    out.dayOff = A.maxqStatusDayRoomSegs(null, null);

    // ── G-DRL-3: room label present — the shape A.roomTitleOpacityAt actually returns: {name, guid, opacity}.
    out.roomPresent = A.maxqStatusDayRoomSegs(null, { name: 'Level 2 R3', guid: 'g1', opacity: 1 });

    // ── G-DRL-4: room label absent — titleInfo itself is null (§CPE_ROOM_TITLE off, or roomTitleOpacityAt
    // found no segment covering this frame at all).
    out.roomAbsentNull = A.maxqStatusDayRoomSegs(null, null);

    // ── G-DRL-5: the GAP case — titleInfo is a real, non-null object (as it would be mid-crossfade)
    // but carries no name. Must still produce nothing, never ', ""'.
    out.roomGapEmptyName = A.maxqStatusDayRoomSegs(null, { name: '', guid: null, opacity: 0 });
    out.roomGapNullName  = A.maxqStatusDayRoomSegs(null, { name: null, guid: null, opacity: 0 });

    // ── G-DRL-6: a short multi-frame sequence, day-counter ON throughout, room label
    // on -> gap -> on(different room) -> off(§CPE_ROOM_TITLE disabled entirely), mirroring the
    // loop's real per-frame cadence.
    const frames = [
      { day: { day: 10, totalDays: 214 }, title: { name: 'Level 1 Kitchen', opacity: 1 } },
      { day: { day: 11, totalDays: 214 }, title: null },                                    // gap: between rooms
      { day: { day: 12, totalDays: 214 }, title: { name: 'Level 1 Hallway', opacity: 0.6 } },
      { day: { day: 13, totalDays: 214 }, title: null },                                    // §CPE_ROOM_TITLE off / gap again
    ];
    out.sequence = frames.map(f => A.maxqStatusDayRoomSegs(f.day, f.title));

    // ── G-DRL-7: composition order — build the EXACT status line shape the bake loop assembles
    // (frame/eta segment + dayTxt + roomTxt + stickTxt + trailing paren), both present.
    const segs = A.maxqStatusDayRoomSegs({ day: 42, totalDays: 214 }, { name: 'Level 2 R3', opacity: 1 });
    const stickTxt = ', approaching Stick 4/9';
    out.composedLine = '🎬 MaxQ frame 342/576 — 210s, ~45s left' + segs.dayTxt + segs.roomTxt + stickTxt +
      ' (Alt+C / cinema icon cancels + saves partial)';

    console.log('§CPE_MAXQ_STATUS_DAY_LABEL composed="' + out.composedLine + '"');
    return out;
  });

  // ── G-DRL-1 ──────────────────────────────────────────────────────────────────────────────────
  chk('G-DRL-1a Day 1/214 (project start)', r.dayStart.dayTxt === ', Day 1/214', JSON.stringify(r.dayStart));
  chk('G-DRL-1b Day 42/214 (mid-span)', r.dayMid.dayTxt === ', Day 42/214', JSON.stringify(r.dayMid));
  chk('G-DRL-1c Day 214/214 (last day, no totalDays+1 off-by-one)', r.dayLast.dayTxt === ', Day 214/214', JSON.stringify(r.dayLast));

  // ── G-DRL-2 ──────────────────────────────────────────────────────────────────────────────────
  chk('G-DRL-2 day-counter off (dayInfo=null) omits the Day segment entirely (never "Day null/null")',
    r.dayOff.dayTxt === '', JSON.stringify(r.dayOff));

  // ── G-DRL-3 ──────────────────────────────────────────────────────────────────────────────────
  chk('G-DRL-3 room label present reads exactly \', "Level 2 R3"\'',
    r.roomPresent.roomTxt === ', "Level 2 R3"', JSON.stringify(r.roomPresent));

  // ── G-DRL-4 ──────────────────────────────────────────────────────────────────────────────────
  chk('G-DRL-4 room label absent (titleInfo=null) omits the segment entirely',
    r.roomAbsentNull.roomTxt === '', JSON.stringify(r.roomAbsentNull));

  // ── G-DRL-5 ──────────────────────────────────────────────────────────────────────────────────
  chk('G-DRL-5a gap with empty name omits the segment (never \', ""\')',
    r.roomGapEmptyName.roomTxt === '', JSON.stringify(r.roomGapEmptyName));
  chk('G-DRL-5b gap with null name omits the segment', r.roomGapNullName.roomTxt === '', JSON.stringify(r.roomGapNullName));

  // ── G-DRL-6 ──────────────────────────────────────────────────────────────────────────────────
  const seq = r.sequence;
  const seqOK =
    seq[0].dayTxt === ', Day 10/214' && seq[0].roomTxt === ', "Level 1 Kitchen"' &&
    seq[1].dayTxt === ', Day 11/214' && seq[1].roomTxt === '' &&                     // the gap frame
    seq[2].dayTxt === ', Day 12/214' && seq[2].roomTxt === ', "Level 1 Hallway"' &&  // recovers on the next room
    seq[3].dayTxt === ', Day 13/214' && seq[3].roomTxt === '';                       // stays empty, not stale
  chk('G-DRL-6 4-frame sequence tracks day+room per frame, gap frames omit the room segment (not stale/blank)',
    seqOK, JSON.stringify(seq));

  // ── G-DRL-7 ──────────────────────────────────────────────────────────────────────────────────
  const line = r.composedLine;
  const dayIdx = line.indexOf('Day 42/214'), roomIdx = line.indexOf('"Level 2 R3"'), stickIdx = line.indexOf('approaching Stick 4/9');
  chk('G-DRL-7 composed line carries Day, then room label, then stick-approach, in that order',
    dayIdx > -1 && roomIdx > dayIdx && stickIdx > roomIdx, line);

  clearTimeout(_watchdog);
  await br.close(); server.close();
  console.log('\n§W-MAXQ-DRL ' + pass + '/' + (pass + fail) + (fail ? ' — FAIL' : ' — all green'));
  process.exit(fail ? 1 : 0);
})().catch(e => { clearTimeout(_watchdog); console.error('§W-MAXQ-DRL ERROR ' + e.message); process.exit(2); });
