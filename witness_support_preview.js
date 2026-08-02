#!/usr/bin/env node
/**
 * §SUPPORT_PREVIEW witness — prompts/GANTT_ACCURACY.md §SUPPORT_PREVIEW.
 *
 * THE ISSUE IT PROVES OR DISPROVES (user, 2026-08-02): "Z support importance as no fallback fails
 * during Preview will be good so that faster cycle of pasting console log to u back."
 *
 * The three blind spots this probe exists to close, each one gated here:
 *  T1 IT RUNS AT ALL on a Preview arm. §SUPPORT_CHECK lives inside gantt GENERATION, so on a
 *     §GANTT_CACHE_HIT it never runs — the user's own log had no support line whatsoever.
 *  T2 IT IS NOT VACUOUS. It must audit ~every element with a reveal time, not a handful. A probe
 *     that audits 3 elements and prints "PASS" is the failure mode this lane has already paid for.
 *  T3 IT CAN REPORT A VIOLATION. Hospital is KNOWN to carry thousands of elements bearing on walls
 *     scheduled after them (audit_support_roleblind.js: 6,778 on the generated order). A line that
 *     can only ever print 0 proves nothing, so a non-zero here is the point — this gate FAILS if the
 *     probe reports a clean building we know is not clean.
 *  T4 IT NAMES THE ORDER IT AUDITED (source=captured|timeline|derived) — auditing the generated
 *     schedule while the film plays a captured one is blind spot #3 and must be visible in the line.
 *  T5 IT ONLY PRINTS. The op count and the project window are identical before and after the probe
 *     runs — an instrument that perturbs the schedule it measures is worse than no instrument.
 *
 * RUN: node witness_support_preview.js      (self-serving; no external port needed)
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = __dirname, FALLBACK_ROOT = '/home/red1/bim-ootb';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.db': 'application/octet-stream' };
const BLD = process.env.BLD || 'Hospital';
function makeServer(root) {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    const send = b => { r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); };
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
const _wd = setTimeout(() => { console.log('\n§W-SUPPORT-PREVIEW TIMEOUT — killed after 900s'); process.exit(3); }, 900000);

(async () => {
  const server = makeServer(ROOT);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const pg = await br.newPage();
  await pg.setViewport({ width: 1200, height: 800 });
  const logs = [];
  pg.on('console', m => logs.push(m.text()));
  await pg.goto(`http://localhost:${port}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction('!!window.APP && !!window.APP.dbQuery', { timeout: 90000 });
  await pg.waitForFunction('typeof window.tmActivateForBake === "function" && typeof window.tmFollowTimeline === "function"',
    { timeout: 60000 });

  const res = await pg.evaluate(async () => {
    const ok = await window.tmActivateForBake();
    const before = window.tmScheduleSource ? JSON.parse(JSON.stringify(window.tmScheduleSource())) : null;
    const st = window.tmFollowTimeline();
    const after = window.tmScheduleSource ? JSON.parse(JSON.stringify(window.tmScheduleSource())) : null;
    return { ok, st, before, after };
  });

  const line = logs.filter(l => l.startsWith('§SUPPORT_PREVIEW ')).pop() || '';
  const verdict = logs.filter(l => l.startsWith('§SUPPORT_PREVIEW_VERDICT')).pop() || '';
  chk('T1 the probe RAN on a buildup arm (§SUPPORT_PREVIEW printed)', !!line, line.slice(0, 150));
  if (!line) {
    clearTimeout(_wd); await br.close(); server.close();
    console.log('\n§W-SUPPORT-PREVIEW ' + pass + '/' + (pass + fail) + ' — the probe is absent (RED on origin/main, as intended)');
    process.exit(1);
  }
  const audited = +(line.match(/audited=(\d+)/) || [])[1];
  const total = +(line.match(/audited=\d+\/(\d+)/) || [])[1];
  const viol = +(line.match(/violations=(\d+)/) || [])[1];
  const src = (line.match(/source=(\w+)/) || [])[1];
  chk('T2 NOT VACUOUS — it audited most of the model, not a handful',
    audited > 0 && total > 0 && audited / total > 0.5, `audited=${audited}/${total}`);
  chk('T3 it CAN report a violation — Hospital is known dirty (6,778 on the generated order)',
    viol > 0, `violations=${viol}` + (viol ? '' : ' ← a probe that only ever prints 0 proves nothing'));
  chk('T4 it NAMES the order it audited', !!src && /captured|timeline|derived/.test(src), `source=${src}`);
  chk('T5 IT ONLY PRINTS — op count and window unchanged across the probe',
    !!res.before && !!res.after && res.before.capOps === res.after.capOps && res.before.total === res.after.total,
    `capOps ${res.before && res.before.capOps} → ${res.after && res.after.capOps}`);
  chk('T6 a verdict line is emitted for the paste-back cycle', /FAIL|PASS/.test(verdict), verdict.slice(0, 110));

  clearTimeout(_wd);
  await br.close(); server.close();
  console.log('\n§W-SUPPORT-PREVIEW ' + pass + '/' + (pass + fail) + (fail ? ' — FAIL' : ' — all green'));
  process.exit(fail ? 1 : 0);
})().catch(e => { clearTimeout(_wd); console.error('§W-SUPPORT-PREVIEW ERROR ' + e.message); process.exit(2); });
