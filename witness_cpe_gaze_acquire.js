#!/usr/bin/env node
/**
 * §CPE_GAZE_ACQUIRE witness — prompts/CINEMA_PATH_EDITOR.md §CPE_GAZE_ACQUIRE.
 *
 * THE ISSUE IT PROVES OR DISPROVES (user, 2026-08-02): "the cam head turning to face density*depth
 * ... Seems a bit slow during this baking. It be nice if it does so right away gracefully".
 *
 * The gaze was rate-limited to a FLAT CINEMA_TURN_DPS (45 deg/s), forward-only, so acquiring a
 * subject 90 deg off-axis cost a dead-constant 2.00 s at one unvarying speed. That is why it reads
 * as slow rather than smooth: a flat rate has no acquisition at all — no whip on, no settle in.
 *
 *  T1 the curve accelerates when far off-axis          — else nothing got faster
 *  T2 the curve is EXACTLY the base cap when settled   — a settled gaze must not gain new motion
 *  T3 the curve is monotone in residual angle          — no rate reversal mid-turn
 *  T4 the peak is BOUNDED                              — §CPE_GAZE_CONSTANT_RATE exists because an
 *                                                        unbounded swing measured 29.01 deg/sample
 *                                                        and was judged a whip. Do not reintroduce it.
 *  T5 RIGHT AWAY  — time-to-acquire a 90 deg subject drops below the flat-rate 2.00 s
 *  T6 GRACEFULLY  — the turn rate at ARRIVAL is strictly lower than at ONSET. This is the claim a
 *                   flat-rate implementation fails while still passing T5 by simply turning faster
 *                   everywhere, which would be a whip and not what the user asked for.
 *
 * T5 and T6 drive the REAL limiter (A.gazeAcquireStep, the same function the bake's gaze loop calls)
 * over a synthetic 90 deg step — not a reimplementation of it — and read the numbers back.
 * RUN: node witness_cpe_gaze_acquire.js
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.db': 'application/octet-stream' };
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
const _watchdog = setTimeout(() => { console.log('\n§W-GAZE-ACQ TIMEOUT — killed after 120s'); process.exit(3); }, 120000);

(async () => {
  const server = makeServer(ROOT);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const pg = await br.newPage();
  await pg.setViewport({ width: 1400, height: 900 });
  const url = `http://localhost:${port}/viewer/viewer.html?db=buildings/Duplex_extracted.db`;
  await pg.goto(url, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('!!window.APP && !!window.APP.camera', { timeout: 45000 });
  await pg.waitForFunction('typeof window.APP.gazeAcquireCap === "function"', { timeout: 30000 })
    .catch(() => {});

  const armed = await pg.evaluate(() => typeof window.APP.gazeAcquireCap === 'function' &&
                                        typeof window.APP.gazeAcquireStep === 'function');
  chk('T0 §CPE_GAZE_ACQUIRE is on APP (gazeAcquireCap + gazeAcquireStep)', armed);
  if (!armed) {
    clearTimeout(_watchdog); await br.close(); server.close();
    console.log('\n§W-GAZE-ACQ 0/6 — the acquisition curve does not exist (RED on origin/main, as intended)');
    process.exit(1);
  }

  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const DPS = 45;                       // CINEMA_TURN_DPS — the shared cap this multiplies over
  const STEP = 1 / 60;                  // one probe's worth of seconds
  const BASE = DPS * STEP * D2R;        // the flat per-probe allowance (0.75 deg at 60 probes/s)

  // ── T1..T4: the curve itself, sampled directly.
  const curve = await pg.evaluate((base, d2r) => {
    const A = window.APP, out = {};
    [0, 1, 2, 5, 10, 20, 30, 45, 60, 90, 120, 179].forEach(deg => {
      out[deg] = A.gazeAcquireCap(deg * d2r, base) / base;   // multiple of the flat cap
    });
    return out;
  }, BASE, D2R);
  const mult = d => curve[d];
  chk('T1 far off-axis the gaze ACCELERATES (>=2x the flat cap at 90 deg)',
    mult(90) >= 2, '90deg=' + mult(90).toFixed(2) + 'x  60deg=' + mult(60).toFixed(2) +
    'x  120deg=' + mult(120).toFixed(2) + 'x');
  chk('T2 a SETTLED gaze keeps exactly the flat cap (no new motion where it is already on target)',
    Math.abs(mult(0) - 1) < 1e-9 && Math.abs(mult(1) - 1) < 1e-9,
    '0deg=' + mult(0).toFixed(4) + 'x  1deg=' + mult(1).toFixed(4) + 'x  2deg=' + mult(2).toFixed(4) + 'x');
  const degs = [0, 1, 2, 5, 10, 20, 30, 45, 60, 90, 120, 179];
  const mono = degs.every((d, i) => i === 0 || mult(d) >= mult(degs[i - 1]) - 1e-9);
  chk('T3 monotone in residual angle (no rate reversal mid-turn)', mono,
    degs.map(d => d + ':' + mult(d).toFixed(2)).join(' '));
  const peak = Math.max(...degs.map(mult));
  chk('T4 the peak is BOUNDED (<=3x the shared cap — no return of the 29 deg/sample whip)',
    peak <= 3 + 1e-9, 'peakMult=' + peak.toFixed(2) + 'x = ' + (peak * DPS).toFixed(0) + ' deg/s');

  // ── T5/T6: drive the REAL limiter over a synthetic 90 deg acquisition and read the profile.
  const run = await pg.evaluate((base, step, d2r, r2d) => {
    const A = window.APP;
    // 90 deg apart in the XZ plane — a plain, checkable geometry, not a scene-dependent one.
    let cur = { x: 1, y: 0, z: 0 };
    const tgt = { x: 0, y: 0, z: 1 };
    const rates = [];
    let t = 0, acquiredAt = -1;
    for (let i = 0; i < 2000; i++) {
      const nxt = A.gazeAcquireStep(cur, tgt, base);
      const moved = Math.acos(Math.max(-1, Math.min(1, nxt.x * cur.x + nxt.y * cur.y + nxt.z * cur.z))) * r2d;
      rates.push(moved / step);                                  // deg per second this probe
      cur = nxt; t += step;
      const resid = Math.acos(Math.max(-1, Math.min(1, cur.x * tgt.x + cur.y * tgt.y + cur.z * tgt.z))) * r2d;
      if (acquiredAt < 0 && resid <= 5) acquiredAt = t;
      if (resid <= 0.05) break;
    }
    return { acquiredAt, onset: rates[0], peak: Math.max(...rates),
             arrival: rates[Math.max(0, rates.length - 1)], n: rates.length,
             first10: rates.slice(0, 10).map(v => +v.toFixed(1)),
             last10: rates.slice(-10).map(v => +v.toFixed(1)) };
  }, BASE, STEP, D2R, R2D);

  const FLAT = 90 / DPS;   // what the shipped flat cap costs for the same 90 deg: 2.00 s
  chk('T5 RIGHT AWAY — a 90 deg subject is acquired faster than the flat cap\'s ' + FLAT.toFixed(2) + 's',
    run.acquiredAt > 0 && run.acquiredAt < FLAT,
    'acquired(resid<=5deg) in ' + run.acquiredAt.toFixed(2) + 's vs flat ' + FLAT.toFixed(2) + 's');
  chk('T6 GRACEFULLY — the rate at ARRIVAL is strictly lower than at ONSET',
    run.arrival < run.onset,
    'onset=' + run.onset.toFixed(1) + 'dps  peak=' + run.peak.toFixed(1) +
    'dps  arrival=' + run.arrival.toFixed(1) + 'dps');
  chk('T7 the peak of the REAL run stays inside the bound (measured, not just the curve)',
    run.peak <= 3 * DPS + 0.5, 'peak=' + run.peak.toFixed(1) + 'dps cap=' + (3 * DPS) + 'dps');
  console.log('   profile first10 dps: ' + run.first10.join(' '));
  console.log('   profile  last10 dps: ' + run.last10.join(' '));

  clearTimeout(_watchdog);
  await br.close(); server.close();
  console.log('\n§W-GAZE-ACQ ' + pass + '/' + (pass + fail) + (fail ? ' — FAIL' : ' — all green'));
  process.exit(fail ? 1 : 0);
})().catch(e => { clearTimeout(_watchdog); console.error('§W-GAZE-ACQ ERROR ' + e.message); process.exit(2); });
