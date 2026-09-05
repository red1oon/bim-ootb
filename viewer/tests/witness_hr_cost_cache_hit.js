#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §HR_COST_CACHE_HIT (2026-09-05, bim-compiler
// prompts/MEP_CLASH_REVEAL_MOVIE.md item 8, "§HR_COST_CACHE_HIT — SPEC" section).
// Scope: `cpe_resource_panel.js`'s `A.bigStatsBuild` has two 5D HUD cards ("labour cost committed",
// "person-days of labour") gated on `A._hrCost`. `A._hrCost` was only ever SET inside
// `injectGantt()` — the slow, cold schedule-GENERATION path. The FAST, NORMAL path is
// `§GANTT_CACHE_HIT` (time_machine.js), where `injectGantt()` never runs at all, so on every
// ordinary (non-first) Time Machine open, `_hrCost` stayed unset and the two cards were silently,
// permanently DROPPED — correct behaviour for a missing source, but the source was never being
// populated on the common path. Read the log after every run — the exit code is not evidence.
//
// FIX: `time_machine.js` now persists `A()._hrCost` to the IDB cache (key 'hrCost', versioned
// alongside 'gantt' under `_GANTT_CACHE_VERSION`) the moment `injectGantt()` computes it
// (§HR_COST_CACHE_SAVE), and restores it from that cache on every `§GANTT_CACHE_HIT` fast-path open
// (§HR_COST_CACHE_HIT / §HR_COST_CACHE_MISS) — a pure cache round-trip, nothing recomputed or
// invented on the fast path.
//
// METHOD: same profile dir across TWO separate browser launches (probe_splitmode_persist_direct.js's
// pattern) — browser 1 does the first-ever open (cold generate, populates both IDB cache entries),
// browser 2 re-opens the SAME building under the SAME profile (a real §GANTT_CACHE_HIT) and must
// show the SAME two cost/labour cards with the SAME total, restored from cache, not recomputed.
//
// CAN REPORT ITS OWN FAILURE (PRIMAL LAW #4): INCONCLUSIVE (page/TM never came up on either open),
// VACUOUS (n/a — a card-count/total comparison is never vacuous once both opens produce a schedule),
// RED CONTROL (witness_kit: a mutated cache-hit row that never restored `_hrCost` must fail).
//
// Env: ROOT (checkout to serve, default this file's repo — point it at an unfixed tree to see RED)
//      BLD (buildings/<BLD>.db, default HHS_Office_Federated_extracted, already local in every
//      worktree — no BLD_DIR dependency) · BLD_DIR (fallback dir for /buildings/*, default
//      ~/bim-ootb/buildings) · GPU=sw|real (default sw — this witness never reads pixels) ·
//      PORT · LOAD_MS · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');

const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'HHS_Office_Federated_extracted';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const GPU = process.env.GPU || 'sw';
const PORT = +(process.env.PORT || 8577);
const LOAD_MS = +(process.env.LOAD_MS || 600000);
const LOG = process.env.LOG || '/tmp/witness_hr_cost_cache_hit.log';

const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
function logRaw(l) { logStream.write(l + '\n'); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream',
  '.gz': 'application/gzip', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  try {
    const u = decodeURIComponent(req.url.split('?')[0]);
    let fp = path.join(ROOT, u.replace(/^\/+/, ''));
    if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice('/buildings/'.length));
    if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
    if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
    const st = fs.statSync(fp);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(fp).pipe(res);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});

function inconclusive(reason) {
  log('§HR_COST_CACHE_HIT verdict=INCONCLUSIVE reason=' + reason + ' — nothing was judged');
  log('§WITNESS_HR_COST_CACHE_HIT pass=0 fail=0 ran=0 INCONCLUSIVE');
}

const gpuArgs = {
  sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist']
}[GPU] || [];
const gpuEnv = GPU === 'real' ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {};

async function openAndActivate(profile, label, claimRx, persistAfter) {
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 15 * 60 * 1000,
    env: Object.assign({}, process.env, gpuEnv),
    args: ['--no-sandbox', '--hide-crash-restore-bubble', '--window-size=1280,720'].concat(gpuArgs) });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const claims = [];
  page.on('console', m => { const t = m.text(); logRaw('[' + label + '] ' + t); if (claimRx.test(t)) claims.push(t); });
  page.on('pageerror', e => logRaw('[' + label + '][pageerror] ' + e.message));
  const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`;
  log('§HRC_NAV [' + label + '] ' + url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.renderer && window.APP.camera &&
    typeof window.tmActivateForBake === 'function', { timeout: LOAD_MS });
  await page.waitForFunction(() => window.APP.activeBuilding && window.APP.db && window.APP.buildingsRendered &&
    window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: LOAD_MS, polling: 1000 });
  log('§HRC_LOADED [' + label + '] building=' + (await page.evaluate(() => window.APP.activeBuilding)));

  const tm = await page.evaluate(async () => { let ok = await window.tmActivateForBake(); if (!ok) ok = await window.tmActivateForBake(); return ok; });
  if (!tm) { await browser.close(); return { ok: false, reason: 'tmActivateForBake=false' }; }
  const bk = await page.evaluate(() => window.tmFollowTimeline());
  if (!bk || !(bk.projectEnd > bk.projectStart)) { await browser.close(); return { ok: false, reason: 'no timeline span' }; }
  const ops = await page.evaluate(() => window.tmOpsSnapshot());

  const state = await page.evaluate((opsArg, ps, pe) => {
    const A = window.APP;
    const cards = A.bigStatsBuild(opsArg, ps, pe);
    return {
      cardLabels: cards.map(c => c.label),
      cardCount: cards.length,
      hrCost: A._hrCost ? { total: A._hrCost.total, personDays: A._hrCost.personDays, trades: A._hrCost.trades } : null
    };
  }, ops, bk.projectStart, bk.projectEnd);

  let persist = null;
  if (persistAfter) {
    // §GANTT_STALE_CACHE (time_machine.js, existing/unmodified behaviour, not part of this fix):
    // the 'gantt' IDB cache is only honoured on reload if the underlying app.db ALSO carries a
    // materialized native schedule (ScheduleAuthor.activeSchedule(db) truthy) — otherwise the cache
    // is correctly treated as stale-by-construction and dropped. A bare re-fetch of the static .db
    // file (what a fresh puppeteer page does) never carries that, so persist the just-generated
    // schedule into IDB the same way a real user edit does (_tmPersistEdit / this exact technique
    // in scripts/probe_splitmode_persist_direct.js §S78) so phase 2's reload actually loads a DB
    // with a schedule in it and can reach the real §GANTT_CACHE_HIT branch this fix targets.
    persist = await page.evaluate(() => {
      const SA = window.ScheduleAuthor, A = window.APP;
      if (!SA || !SA.persistDb) return { ok: false, reason: 'no ScheduleAuthor.persistDb' };
      const url = A._dbPersistUrl || A.DB_URL;
      return SA.persistDb(A.db, url, { immediate: true }).then(ok => ({ ok, url })).catch(e => ({ ok: false, err: String(e) }));
    });
    await new Promise(r => setTimeout(r, 500));
    log('§HRC_PERSIST [' + label + '] ' + JSON.stringify(persist));
  }

  await browser.close();
  return { ok: true, claims, state, bk, persist };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const commit = (() => { try { return require('child_process').execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch (e) { return '?'; } })();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hrc-profile-'));
  log(`§HRC_ENV root=${ROOT} commit=${commit} bld=${BLD} gpu=${GPU} log=${LOG} profile=${profile}`);

  let rows = [];
  try {
    // ── Phase 1: first-ever open under this profile — no IDB cache exists yet, so this is a genuine
    // COLD generate. injectGantt() runs, computes A()._hrCost, and (the fix) caches it via
    // §HR_COST_CACHE_SAVE alongside the 'gantt' ops it was derived from.
    const CLAIM_RX_COLD = /§(GANTT_CACHE_SAVE|HR_COST total|HR_COST_CACHE_SAVE|GANTT_CACHE_HIT|CPE_BIG_STATS)/;
    const p1 = await openAndActivate(profile, 'cold', CLAIM_RX_COLD, /*persistAfter*/ true);
    if (!p1.ok) { inconclusive('phase1 ' + p1.reason); process.exitCode = 2; return; }
    if (!p1.persist || p1.persist.ok !== true) { inconclusive('phase1 persistDb failed: ' + JSON.stringify(p1.persist)); process.exitCode = 2; return; }
    for (const c of p1.claims) log('§HRC_COLD_CLAIM ' + c.slice(0, 200));
    const cold = p1.state;
    log(`§HRCOST_PROBE_COLD cards=${cold.cardCount} [${cold.cardLabels.join(' | ')}] hrCost=${JSON.stringify(cold.hrCost)}`);
    const sawCacheSaveClaim = p1.claims.some(c => c.indexOf('§HR_COST_CACHE_SAVE') >= 0);

    // ── Phase 2: SAME profile, a fresh browser process — the IDB cache from phase 1 is on disk, so
    // this is a genuine §GANTT_CACHE_HIT open. injectGantt() must NOT run; A()._hrCost must be
    // restored from the 'hrCost' cache entry the fix wrote in phase 1.
    const CLAIM_RX_HIT = /§(GANTT_CACHE_HIT|HR_COST_CACHE_HIT|HR_COST_CACHE_MISS|HR_COST total|CPE_BIG_STATS)/;
    const p2 = await openAndActivate(profile, 'cacheHit', CLAIM_RX_HIT);
    if (!p2.ok) { inconclusive('phase2 ' + p2.reason); process.exitCode = 2; return; }
    for (const c of p2.claims) log('§HRC_HIT_CLAIM ' + c.slice(0, 200));
    const hit = p2.state;
    log(`§HRCOST_PROBE_CACHEHIT cards=${hit.cardCount} [${hit.cardLabels.join(' | ')}] hrCost=${JSON.stringify(hit.hrCost)}`);
    const gotCacheHitLog = p2.claims.some(c => c.indexOf('§GANTT_CACHE_HIT') >= 0);
    const gotHrCostCacheHitLog = p2.claims.some(c => c.indexOf('§HR_COST_CACHE_HIT') >= 0);
    const sawInjectGanttReRun = p2.claims.some(c => c.indexOf('§HR_COST total=') >= 0); // would mean injectGantt ran AGAIN on the "fast" path — wrong

    rows.push({ phase: 'cold', cards: cold.cardCount, hrCostTotal: (cold.hrCost && cold.hrCost.total) || 0,
      hasHrCost: !!(cold.hrCost && cold.hrCost.total > 0), gotCacheHitLog: false, gotHrCostCacheHitLog: false, sawInjectGanttReRun: false });
    rows.push({ phase: 'cacheHit', cards: hit.cardCount, hrCostTotal: (hit.hrCost && hit.hrCost.total) || 0,
      hasHrCost: !!(hit.hrCost && hit.hrCost.total > 0), gotCacheHitLog, gotHrCostCacheHitLog, sawInjectGanttReRun });

    log(`§HRC_SUMMARY sawCacheSaveClaim=${sawCacheSaveClaim} gotCacheHitLog=${gotCacheHitLog} gotHrCostCacheHitLog=${gotHrCostCacheHitLog} sawInjectGanttReRun=${sawInjectGanttReRun}`);
  } catch (e) {
    log('§HRC_ERROR ' + (e && e.stack || e));
    inconclusive('exception ' + String(e && e.message).slice(0, 160));
    process.exitCode = 2;
  } finally {
    server.close();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
  if (!rows.length) return;

  Witness('hr_cost_cache_hit')
    .population(() => rows)
    .schema({ type: 'object', required: ['phase', 'cards', 'hrCostTotal', 'hasHrCost'],
      properties: {
        phase: { type: 'string', enum: ['cold', 'cacheHit'] },
        cards: { type: 'integer', minimum: 1 },
        hrCostTotal: { type: 'number', minimum: 0 },
        hasHrCost: { type: 'boolean' }
      } })
    .invariant('cold generate produced a real 5D total (not a vacuous 0 — this building must have rated resources)',
      rs => { const c = rs.find(r => r.phase === 'cold'); return !!c && c.hasHrCost && c.hrCostTotal > 0; })
    .invariant('the cache-hit open is a REAL §GANTT_CACHE_HIT (not an accidental second cold generate)',
      rs => { const h = rs.find(r => r.phase === 'cacheHit'); return !!h && h.gotCacheHitLog && !h.sawInjectGanttReRun; })
    .invariant('§HR_COST_CACHE_HIT — the fix: a genuine cache-hit open restores the SAME hrCost total and the SAME card count the cold generate produced, without re-running injectGantt',
      rs => {
        const c = rs.find(r => r.phase === 'cold'), h = rs.find(r => r.phase === 'cacheHit');
        return !!c && !!h && h.hasHrCost && h.gotHrCostCacheHitLog &&
          h.hrCostTotal === c.hrCostTotal && h.cards === c.cards;
      })
    .redControl(rs => {
      const c = rs.map(r => Object.assign({}, r));
      const h = c.find(r => r.phase === 'cacheHit');
      if (h) { h.hasHrCost = false; h.hrCostTotal = 0; h.cards = Math.max(1, h.cards - 2); h.gotHrCostCacheHitLog = false; }
      return c;
    })
    .run();
  logStream.end();
})().catch(e => {
  console.error('§HRC_FATAL ' + (e && e.stack || e));
  process.exitCode = 1;
});
