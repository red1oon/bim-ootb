#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-MEP-OPENPATH: does "generate MEP from a blank ARC building" work on the REAL open path?
 * SCOPE: bim-compiler prompts/MODELLER_MASTER.md §STRATEGY 2026-09-24, lane L0 — the instrument every other lane
 * (L1 route, L2 bridge, L3 sign) is judged by. Drives the user's path: pill Open → resident → Outliner
 * "▶▶ Walk ALL Disciplines" row, then reads what was placed, routed, rendered and SIGNED. Waits on CONDITIONS,
 * never a duration. Read the log after every run.
 *
 * ISSUES this witness proves or disproves (each gate names one):
 *   M0 CONTROL      — the instrument sees what the shipped witnesses see: Duplex Walk-ALL places exactly 185
 *                     (ACMV 19 / ELEC 102 / PLB 18 / FP 46, W-E2E-WALK-ALL §AFTER). If this fails, the run is VOID.
 *   M1 NO-ERROR     — every resident opens + walks with 0 pageerror and the signed op-log verifies.
 *   M2 ROUTED (L1+L2) — a user Walk produces ≥1 routed PLB run on EVERY resident in the run. RED on main 2026-09-24:
 *                     only SampleCastle routes (32, via §SCHED-FALLBACK); Duplex/Terminal 0 — the schedule and
 *                     measured-band returns in dwWalk bypass the routePattern bridge.
 *   M3 RENDERED     — every routed run is drawn as a tube (userData.dwChain instances == chainSegs).
 *   M4 SIGNED (L3)  — ≥1 routed run lands in the signed op-log as GEOM_SWEEP. RED on main 2026-09-24: SampleCastle
 *                     refuses 32/32 (§ROUTER-CHAIN-REFUSE, no real cross-section product, WalkerDoctrine §8).
 * Residents: default Duplex,SampleCastle,Terminal (one of each path: schedule / legacy / measured-band);
 * pass a comma list as argv[2] for others. Baseline (main b8f844fb): M0 ✅ M1 ✅ M2 ❌ M3 ✅ M4 ❌ (8/5).
 * After §WALK-BRIDGE-ALL + §RW-RUNBOX (L1+L2): 10/3 — PLB runs Duplex 18 · SampleCastle 18 · Terminal 2,893, all drawn;
 * run length median 2.2–3 m, max 24.9 m (Terminal). M4 stays red until L3 (a real CW/SP cross-section product).
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..');
const RESIDENTS = process.argv[2] ? process.argv[2].split(',') : ['Duplex', 'SampleCastle', 'Terminal'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  console.log('═══ W-MEP-OPENPATH — generate-then-edit loop, real open path (' + RESIDENTS.join(',') + ') ═══');
  const R = {};
  for (const key of RESIDENTS) {
    const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850 });
    const errs = [], lines = [];
    pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    pg.on('console', m => { const t = m.text(); if (/§WALK |§WALK-PATTERN|§WALK-SCHED|§WALK-NOSPACES|§SCHED-FALLBACK|§ROUTER-CHAIN|§MEP-REROUTE/.test(t)) lines.push(t); });
    await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalkAll==="function" && !!window.SQL', { timeout: 60000 });
    await pg.click('#b-open');
    await pg.waitForSelector(`#m-open-panel .mo-row[data-key="${key}"]`, { timeout: 10000 });
    const t0 = Date.now();
    await pg.click(`#m-open-panel .mo-row[data-key="${key}"]`);
    const opened = await pg.waitForFunction(k => window.__dwName === k && !!window.__dwBuf && !!window.__arcFidByGuid &&
      window.Bonsai.oplog && window.Bonsai.oplog.length > 0 && window.DiscWalker && window.DiscWalker._ready() &&
      !!document.querySelector('[data-bnode="dw-all"]'), { timeout: 180000, polling: 500 }, key).then(() => true).catch(() => false);
    const openMs = Date.now() - t0;
    let walked = false, walkMs = 0, D = {}, chain = null;
    if (opened) {
      const t1 = Date.now();
      await pg.evaluate(() => { window.__dwAllDone = false; });
      await pg.click('[data-bnode="dw-all"]');
      walked = await pg.waitForFunction(() => window.__dwAllDone === true, { timeout: 300000, polling: 500 }).then(() => true).catch(() => false);
      walkMs = Date.now() - t1;
      if (walked) await pg.waitForFunction(() => Object.keys(window.__dwChainAnimating || {}).every(d => !window.__dwChainAnimating[d]), { timeout: 60000, polling: 250 }).catch(() => {});
      D = await pg.evaluate(() => {
        const out = {}, roster = window.DiscWalker.disciplines();
        const g = window.Bonsai.group(), root = g.children.find(o => o.userData && o.userData.dwRoot);
        const geom = window.Bonsai.oplog._geomOps();
        roster.forEach(d => {
          const pl = (window.__dwWalks && window.__dwWalks[d]) || [], segs = (window.__dwChains && window.__dwChains[d]) || [];
          const tubes = root ? root.children.filter(o => o.userData && o.userData.dwChain === d) : [];
          out[d] = { placed: pl.length, bound: pl.filter(p => p.host).length, segs: segs.length,
            bridge: segs.filter(s => s.mode === 'pattern-bridge').length,
            runLen: (() => { const L = segs.map(s => Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1], s.to[2] - s.from[2])).sort((a, b) => a - b);
              return L.length ? { median: +L[L.length >> 1].toFixed(2), p95: +L[Math.floor(L.length * 0.95)].toFixed(2), max: +L[L.length - 1].toFixed(2) } : null; })(),
            tubes: tubes.reduce((s, m) => s + (m.isInstancedMesh ? m.count : 1), 0),
            sweeps: geom.filter(o => o.op_type === 'GEOM_SWEEP' && o.parameters && o.parameters._dw && o.parameters._dw.disc === d).length };
        });
        return out;
      });
      chain = await pg.evaluate(async () => { try { const db = await window.Bonsai.oplog._ensureDb(); return !!(await window.KernelOps.verifyChain(db)).ok; } catch (e) { return 'ERR:' + e.message; } });
    }
    R[key] = { opened, walked, D, chain, errs };
    console.log('--- ' + key + ' open=' + openMs + 'ms walk=' + walkMs + 'ms verifyChain=' + chain);
    Object.keys(D).forEach(d => console.log('    ' + d + ' ' + JSON.stringify(D[d])));
    lines.filter(l => /§WALK-PATTERN|§ROUTER-CHAIN|§WALK disc=PLB|§WALK-SCHED disc=PLB|§WALK-NOSPACES disc=PLB|§MEP-REROUTE/.test(l)).forEach(l => console.log('    ' + l.slice(0, 300)));
    await pg.close();
  }
  console.log('--- gates ---');
  if (R.Duplex) {
    const d = R.Duplex.D, tot = ['ACMV', 'ELEC', 'PLB', 'FP'].reduce((s, k) => s + ((d[k] || {}).placed || 0), 0);
    chk('M0 CONTROL (Duplex Walk-ALL = 185, the W-E2E-WALK-ALL count — else this run is VOID)', tot === 185, 'placed=' + tot);
  } else console.log('  ⚠ M0 CONTROL not run (Duplex not in the resident list) — treat this run as UNCALIBRATED');
  for (const k of RESIDENTS) {
    const r = R[k];
    chk('M1 NO-ERROR ' + k + ' (opened, walked, 0 pageerror, op-log verifies)', r.opened && r.walked && r.errs.length === 0 && r.chain === true,
      'opened=' + r.opened + ' walked=' + r.walked + ' errs=' + r.errs.length + ' chain=' + r.chain + (r.errs.length ? ' ' + r.errs[0] : ''));
    const p = r.D.PLB || { segs: 0, tubes: 0, sweeps: 0 };
    chk('M2 ROUTED ' + k + ' (a user Walk routes ≥1 PLB run)', p.segs > 0, 'PLB segs=' + p.segs + ' (bridge ' + (p.bridge || 0) + ')');
    const allSegs = Object.values(r.D).reduce((s, x) => s + x.segs, 0), allTubes = Object.values(r.D).reduce((s, x) => s + x.tubes, 0);
    chk('M3 RENDERED ' + k + ' (every routed run drawn: tubes == segs)', allTubes === allSegs, 'segs=' + allSegs + ' tubes=' + allTubes);
    const allSw = Object.values(r.D).reduce((s, x) => s + x.sweeps, 0);
    chk('M4 SIGNED ' + k + ' (≥1 routed run is a GEOM_SWEEP in the signed op-log)', allSw > 0, 'sweeps=' + allSw);
  }
  console.log('W-MEP-OPENPATH: ' + pass + ' PASS / ' + fail + ' FAIL');
  await br.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
