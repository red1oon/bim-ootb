#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §TM_DRAWN_VS_SCHEDULED (2026-09-04)
// Scope: the RENDER side of the 4D buildup — does every element the timeline says is on screen at
// a cursor actually get DRAWN (single Mesh visible / BatchedMesh slot visible / InstancedMesh slot
// with a non-zero matrix)? Read the log after every run — the exit code is not evidence; the
// §-lines in --log (default /tmp/witness_tm_drawn_vs_scheduled.log) are the witness.
//
// ISSUE THIS PROVES OR DISPROVES (user, 2026-09-04, on the landed Hospital silent bake):
//   "some window glass panels not landed completely, leaving omissions … all this while they land
//   evenly and completely", and "light fixtures are missing during the Reveal".
//   The 4D pipeline was already exonerated on the exact DB the film played (63,415/63,415 placed,
//   every glass element has a place op + a transform). So the question left is render-side:
//   at a given cursor, SCHEDULED (the owner rule, time_machine.js renderAtTime: placed =
//   start<=c && end<=c, frontier = start<=c<end) vs DRAWN, per ifc_class, with the miss attributed
//   to the mechanism that hid it: the §XRAY staging gate (`_tmXraySolidifyTs`, a placed element hidden
//   until its last carrier's end_ts), an InstancedMesh slot left zero-scaled, a BatchedMesh slot left
//   invisible, a Mesh left invisible, or no representation in the scene at all.
//
// INSTRUMENT: the SHIPPED viewer, headless, on the SHIPPED DB the film played, driven through the
// SAME verbs the bake uses (tmActivateForBake → tmSetCursor per sample, monotonic, so the shipped
// delta path runs exactly as in a bake). Counts come from real object state (instanceMatrix,
// getVisibleAt, .visible up the parent chain) — never from a screenshot (FUNDAMENTAL LAW).
//
// CAN REPORT ITS OWN FAILURE (PRIMAL LAW clause 4):
//   INCONCLUSIVE — page/TM/ops did not come up, or the timeline has no span: nothing was judged.
//   VACUOUS      — a class with 0 scheduled elements at every sample is not judged (counted, named).
//   NO-OP        — the sweep never changed the drawn total: the cursor did not move the scene.
//   RED CONTROL  — witness_kit contract: a mutated population must fail, or the witness cannot fail.
//
// Command (Hospital, the film's own DB symlinked as buildings/Hospital_silent_local.db):
//   BLD=Hospital_silent_local GPU=real node viewer/tests/witness_tm_drawn_vs_scheduled.js
// Env: BLD (buildings/<BLD>.db) · BLD_DIR (fallback dir for /buildings/*) · GPU=real|sw ·
//      PORT · LOAD_MS · LOG · SAMPLES (t-steps across the timeline, default 100) ·
//      FINE="0.60:0.82:0.005" (extra t-range:step) · TOPOUT_SEC (film seconds at which the buildup
//      tops out, for the film-second annotation only — 70.7 measured on the 2026-09-04 bake).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');

const ROOT = path.resolve(__dirname, '..', '..');
const BLD = process.env.BLD || 'Hospital_silent_local';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const GPU = process.env.GPU || 'real';
const PORT = +(process.env.PORT || 8561);
const LOAD_MS = +(process.env.LOAD_MS || 900000);
const LOG = process.env.LOG || '/tmp/witness_tm_drawn_vs_scheduled.log';
const SAMPLES = +(process.env.SAMPLES || 100);
const FINE = process.env.FINE || '0.60:0.82:0.005';
const TOPOUT_SEC = +(process.env.TOPOUT_SEC || 70.7);
const FOCUS = (process.env.FOCUS || 'IfcPlate,IfcCurtainWall,IfcWindow,IfcMember,IfcLightFixture').split(',');
const REVEAL = process.env.REVEAL !== '0';

const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(line) { logStream.write(line + '\n'); console.log(line); }
function logRaw(line) { logStream.write(line + '\n'); }

// ── static server: the checkout, with /buildings/* falling back to BLD_DIR (a worktree carries no
// DBs). Same node-http streaming shape cli_silent_bake.js uses (python http.server never completes
// a Hospital load — scripts/_fast_static_server.js header).
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
  log('§TM_DRAWN_VS_SCHEDULED verdict=INCONCLUSIVE reason=' + reason + ' — nothing was judged');
  log('§WITNESS_TM_DRAWN_VS_SCHEDULED pass=0 fail=0 ran=0 INCONCLUSIVE');
}

// ── in-page instrument (serialised into the page once; reads real object state only) ─────────────
function pageInstrument() {
  const A = window.APP, THREE = window.THREE;
  const D = window.__dvs = {};
  // one-time index: schedule per guid from the SAME kernel_ops rows loadOps() reads, class from the
  // op's own parameters (what the schedule sees), discipline from elements_meta.
  D.index = function () {
    const sched = Object.create(null);
    const r = A.db.exec("SELECT output_guid, timestamp, parameters FROM kernel_ops WHERE op_type='ELEMENT_PLACE' AND undone=0");
    const rows = r.length ? r[0].values : [];
    for (const row of rows) {
      let p = {}; try { p = JSON.parse(row[2] || '{}'); } catch (e) {}
      sched[row[0]] = { s: row[1], e: p._end_ts || (row[1] + 60000), cls: p.cls || '?' };
    }
    const disc = Object.create(null);
    const r2 = A.db.exec('SELECT guid, discipline, ifc_class FROM elements_meta');
    for (const row of (r2.length ? r2[0].values : [])) { disc[row[0]] = row[1] || '_'; if (sched[row[0]] && sched[row[0]].cls === '?') sched[row[0]].cls = row[2] || '?'; }
    // representation per guid, from the scene (M single mesh / B batched slot / I instanced slot)
    const rep = Object.create(null);
    A.scene.traverse(function (o) {
      if (!o.userData) return;
      if (o.userData.guid) { rep[o.userData.guid] = 'M'; return; }
      if (o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id]) { for (const m of A._batchMeta[o.id]) rep[m.guid] = 'B'; return; }
      if (o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id]) { for (const m of A._instanceMeta[o.id]) rep[m.guid] = 'I'; }
    });
    const xr = (window.__tmXrayProbe && window.__tmXrayProbe('map')) || { map: {}, n: 0, staged: 0 };
    D.sched = sched; D.disc = disc; D.rep = rep; D.xray = xr.map || {};
    let ps = Infinity, pe = -Infinity, nOps = 0;
    for (const g in sched) { nOps++; if (sched[g].s < ps) ps = sched[g].s; if (sched[g].e > pe) pe = sched[g].e; }
    const repN = { M: 0, B: 0, I: 0, none: 0 };
    for (const g in sched) repN[rep[g] || 'none']++;
    return { ops: nOps, minStart: ps, maxEnd: pe, xrayN: xr.n, xrayStaged: xr.staged, rep: repN };
  };
  function treeVisible(o) { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; }
  // DRAWN set at the current scene state — the same three branches __tmSnapshotVisible reads.
  D.drawn = function () {
    const drawn = Object.create(null), m4 = new THREE.Matrix4();
    A.scene.traverse(function (o) {
      if (!o.userData) return;
      if (o.userData.guid) { if (treeVisible(o)) drawn[o.userData.guid] = 1; return; }
      if (o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id]) {
        if (!treeVisible(o)) return;
        for (const m of A._batchMeta[o.id]) if (o.getVisibleAt(m.slotId)) drawn[m.guid] = 1;
        return;
      }
      if (o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id]) {
        if (!treeVisible(o)) return;
        const metas = A._instanceMeta[o.id];
        for (let i = 0; i < metas.length; i++) {
          o.getMatrixAt(i, m4);
          const el = m4.elements;
          if (!(el[0] === 0 && el[5] === 0 && el[10] === 0)) drawn[metas[i].guid] = 1;
        }
      }
    });
    return drawn;
  };
  // census at cursor c: per class {sched, drawn, missing (renderable), staged, other by rep, absent, extra}
  D.census = function (c, opts) {
    opts = opts || {};
    if (opts.forceFull) window.__forceFull = true;
    window.tmSetCursor(c);
    const drawn = D.drawn();
    const per = Object.create(null);
    function row(cls) { return per[cls] || (per[cls] = { sched: 0, drawn: 0, missing: 0, staged: 0, othM: 0, othB: 0, othI: 0, absent: 0, extra: 0, frontier: 0 }); }
    let drawnTotal = 0;
    for (const g in drawn) drawnTotal++;
    for (const g in D.sched) {
      const s = D.sched[g], R = row(s.cls);
      const placed = s.s <= c && s.e <= c, frontier = s.s <= c && c < s.e;
      const rep = D.rep[g];
      if (placed || frontier) {
        R.sched++; if (frontier) R.frontier++;
        if (drawn[g]) { R.drawn++; continue; }
        if (!rep) { R.absent++; continue; }
        R.missing++;
        const st = D.xray[g];
        if (!frontier && st !== undefined && c < st) R.staged++;
        else R['oth' + rep]++;
      } else if (drawn[g]) R.extra++;
    }
    return { per, drawnTotal };
  };
  D.discCensus = function () {
    // at the current filter state, per discipline: elements with a representation vs drawn
    const drawn = D.drawn(), per = Object.create(null);
    for (const g in D.sched) {
      const d = D.disc[g] || '_', cls = D.sched[g].cls, rep = D.rep[g];
      const k = d + '|' + cls, R = per[k] || (per[k] = { disc: d, cls, renderable: 0, drawn: 0, missM: 0, missB: 0, missI: 0 });
      if (rep) R.renderable++;
      if (drawn[g]) R.drawn++; else if (rep) R['miss' + rep]++;
    }
    return per;
  };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = {
    sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist']
  }[GPU] || [];
  const gpuEnv = GPU === 'real' ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {};
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dvs-profile-'));
  const commit = (() => { try { return require('child_process').execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch (e) { return '?'; } })();
  log(`§DVS_ENV root=${ROOT} commit=${commit} bld=${BLD} gpu=${GPU} log=${LOG} samples=${SAMPLES} fine=${FINE}`);
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 15 * 60 * 1000,
    env: Object.assign({}, process.env, gpuEnv),
    args: ['--no-sandbox', '--hide-crash-restore-bubble', '--window-size=1300,840'].concat(gpuArgs) });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const claims = {};
  const CLAIM_RX = /§(TM_OPS_CHECK|GANTT_CACHE_HIT|GANTT_STALE_CACHE|KERNEL_OPS_SCHED_VERSION|XRAY_EDGES|XRAY_CACHE_BUILD|MEP_DISC_COVERAGE|PERF_INCR_INDEX|PERF_INCR_DEFER|CPE_BUILDUP_SOURCE|MOBILE_TM_TOGGLE|TM_STREAM_RESWEEP|S231|TPL_MODEL|SCHEDULE_SOURCE|CPE_BUILDUP_ARM_GATE|TIME_MACHINE)\b/;
  page.on('console', m => { const t = m.text(); logRaw('[con] ' + t); const mm = t.match(CLAIM_RX); if (mm) (claims[mm[1]] = claims[mm[1]] || []).push(t); });
  page.on('pageerror', e => logRaw('[pageerror] ' + e.message));

  let verdictRows = [];
  try {
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`;
    log('§DVS_NAV ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.renderer && window.APP.camera && typeof window.tmActivateForBake === 'function', { timeout: LOAD_MS });
    await page.waitForFunction(() => window.APP.activeBuilding && window.APP.db && window.APP.buildingsRendered &&
      window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: LOAD_MS, polling: 1000 });
    const gl = await page.evaluate(() => { const g = window.APP.renderer.getContext(); const d = g.getExtension('WEBGL_debug_renderer_info');
      return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); });
    log('§DVS_LOADED building=' + (await page.evaluate(() => window.APP.activeBuilding)) + ' gl="' + gl + '"');

    const tm = await page.evaluate(async () => { let ok = await window.tmActivateForBake(); if (!ok) ok = await window.tmActivateForBake(); return ok; });
    if (!tm) { inconclusive('tmActivateForBake=false'); process.exitCode = 2; return; }
    const bk = await page.evaluate(() => window.tmFollowTimeline());
    if (!bk || !(bk.projectEnd > bk.projectStart)) { inconclusive('no timeline span'); process.exitCode = 2; return; }
    log(`§DVS_TIMELINE ops=${bk.ops} placed=${bk.placed} noGeom=${bk.noGeom} projectStart=${bk.projectStart} projectEnd=${bk.projectEnd} spanDays=${((bk.projectEnd - bk.projectStart) / 86400000).toFixed(1)}`);
    for (const k of ['TM_OPS_CHECK', 'GANTT_CACHE_HIT', 'KERNEL_OPS_SCHED_VERSION', 'XRAY_EDGES', 'XRAY_CACHE_BUILD', 'MEP_DISC_COVERAGE', 'PERF_INCR_INDEX', 'CPE_BUILDUP_SOURCE', 'TPL_MODEL'])
      if (claims[k]) log('§DVS_SHIPPED_LINE ' + claims[k][claims[k].length - 1].slice(0, 300));
    if (claims.KERNEL_OPS_SCHED_VERSION) log('⚠ the DB\'s ops were REGENERATED in this run (genVersion stale) — the timeline judged is not byte-identical to the film\'s');

    await page.evaluate(pageInstrument);
    // the first census primes _savedInstanceMatrices / the delta index exactly as a bake's first frame does
    const idx = await page.evaluate(() => window.__dvs.index());
    log(`§DVS_INDEX ops=${idx.ops} rep=M:${idx.rep.M} B:${idx.rep.B} I:${idx.rep.I} none:${idx.rep.none} xrayMapN=${idx.xrayN} xrayStaged=${idx.xrayStaged}`);
    if (!idx.ops) { inconclusive('0 ELEMENT_PLACE ops in page'); process.exitCode = 2; return; }

    // ── sweep: t in [0,1] coarse + a fine band; monotonic so the shipped delta path runs as in a bake
    const ts = new Set();
    for (let i = 0; i <= SAMPLES; i++) ts.add(+(i / SAMPLES).toFixed(4));
    const fm = FINE.split(':').map(Number);
    if (fm.length === 3 && fm[2] > 0) for (let t = fm[0]; t <= fm[1] + 1e-9; t += fm[2]) ts.add(+t.toFixed(4));
    const tList = Array.from(ts).sort((a, b) => a - b);
    const span = bk.projectEnd - bk.projectStart;
    const perT = [];
    let firstDrawn = null, drawnChanged = false;
    for (const t of tList) {
      const c = Math.round(bk.projectStart + t * span);
      const r = await page.evaluate(cc => window.__dvs.census(cc), c);
      if (firstDrawn === null) firstDrawn = r.drawnTotal; else if (r.drawnTotal !== firstDrawn) drawnChanged = true;
      perT.push({ t, c, r });
      const tot = { sched: 0, drawn: 0, missing: 0, staged: 0, oth: 0, absent: 0, extra: 0 };
      for (const cls in r.per) { const R = r.per[cls]; tot.sched += R.sched; tot.drawn += R.drawn; tot.missing += R.missing; tot.staged += R.staged; tot.oth += R.othM + R.othB + R.othI; tot.absent += R.absent; tot.extra += R.extra; }
      const focus = FOCUS.map(cls => { const R = r.per[cls]; return R ? `${cls}=${R.drawn}/${R.sched}${R.missing ? ' miss=' + R.missing + '(staged=' + R.staged + ' M=' + R.othM + ' B=' + R.othB + ' I=' + R.othI + ')' : ''}` : `${cls}=n/a`; }).join(' ');
      log(`§DVS_SAMPLE t=${t.toFixed(3)} film_s=${(t * TOPOUT_SEC).toFixed(1)} day=${((c - bk.projectStart) / 86400000).toFixed(1)} sched=${tot.sched} drawn=${tot.drawn} missing=${tot.missing} staged=${tot.staged} other=${tot.oth} absent=${tot.absent} extra=${tot.extra} | ${focus}`);
    }
    // the end cursor, delta path (as the bake's last buildup frame) vs a forced FULL pass: a placed,
    // un-staged element the delta path left hidden is drawn by the full pass — that difference IS the
    // delta-index defect, isolated from the §XRAY gate (which hides nothing at the end).
    {
      const endC = bk.projectEnd;
      const d = await page.evaluate(cc => window.__dvs.census(cc), endC);
      const f = await page.evaluate(cc => window.__dvs.census(cc, { forceFull: true }), endC);
      const sum = r => { const o = { missing: 0, M: 0, B: 0, I: 0, staged: 0 }; for (const cls in r.per) { const R = r.per[cls]; o.missing += R.missing; o.M += R.othM; o.B += R.othB; o.I += R.othI; o.staged += R.staged; } return o; };
      const sd = sum(d), sf = sum(f);
      log(`§DVS_END_DELTA_VS_FULL delta: drawn=${d.drawnTotal} missing=${sd.missing} (staged=${sd.staged} M=${sd.M} B=${sd.B} I=${sd.I}) | full: drawn=${f.drawnTotal} missing=${sf.missing} (staged=${sf.staged} M=${sf.M} B=${sf.B} I=${sf.I})`);
    }
    // delta-vs-full equivalence at three cursors (W-INCR-EQUIV shape): a delta-path miss shows here
    for (const t of [0.5, 0.7, 0.9]) {
      const c = Math.round(bk.projectStart + t * span);
      const d = await page.evaluate(cc => window.__dvs.census(cc), c);
      const f = await page.evaluate(cc => window.__dvs.census(cc, { forceFull: true }), c);
      let diff = 0; for (const cls in f.per) { const a = d.per[cls] || { drawn: 0 }, b = f.per[cls]; if (a.drawn !== b.drawn) diff += Math.abs(a.drawn - b.drawn); }
      log(`§DVS_DELTA_VS_FULL t=${t} drawnDelta=${d.drawnTotal} drawnFull=${f.drawnTotal} perClassDiff=${diff}`);
    }

    // ── per-class verdict rows (VACUOUS classes named, not judged)
    const classes = new Set(); perT.forEach(p => Object.keys(p.r.per).forEach(c => classes.add(c)));
    const vacuous = [], rows = [];
    for (const cls of classes) {
      let anySched = 0, maxMissing = 0, maxStaged = 0, maxOther = 0, maxExtra = 0, maxAbsent = 0, tMissLo = null, tMissHi = null, worst = null;
      for (const p of perT) {
        const R = p.r.per[cls]; if (!R) continue;
        anySched += R.sched;
        if (R.missing > 0) { if (tMissLo === null) tMissLo = p.t; tMissHi = p.t; }
        if (R.missing > maxMissing) { maxMissing = R.missing; worst = p; }
        maxStaged = Math.max(maxStaged, R.staged); maxOther = Math.max(maxOther, R.othM + R.othB + R.othI);
        maxExtra = Math.max(maxExtra, R.extra); maxAbsent = Math.max(maxAbsent, R.absent);
      }
      if (!anySched) { vacuous.push(cls); continue; }
      rows.push({ kind: 'sweep', cls, maxMissing, maxStaged, maxOther, maxExtra, maxAbsent,
        tMissLo: tMissLo === null ? -1 : tMissLo, tMissHi: tMissHi === null ? -1 : tMissHi,
        worstT: worst ? worst.t : -1, worstSched: worst ? worst.r.per[cls].sched : 0 });
    }
    rows.sort((a, b) => b.maxMissing - a.maxMissing);
    for (const r of rows.slice(0, 25)) if (r.maxMissing || r.maxExtra || FOCUS.includes(r.cls))
      log(`§DVS_CLASS cls=${r.cls} maxMissing=${r.maxMissing} (staged=${r.maxStaged} other=${r.maxOther} absent=${r.maxAbsent}) extra=${r.maxExtra} missWindow_t=${r.tMissLo}..${r.tMissHi} film_s=${r.tMissLo < 0 ? 'none' : (r.tMissLo * TOPOUT_SEC).toFixed(1) + '..' + (r.tMissHi * TOPOUT_SEC).toFixed(1)} worst@t=${r.worstT} sched=${r.worstSched}`);
    if (vacuous.length) log(`§DVS_VACUOUS classes with 0 scheduled at every sample (not judged): ${vacuous.length}`);
    if (!drawnChanged) log('§DVS_NOOP the drawn total never changed across the sweep — the cursor did not move the scene');

    // ── reveal: the SAME verb the reveal calls (A.filterDiscs, cinema_maxq.js §CPE_DISCIPLINE_REVEAL) at the end cursor
    if (REVEAL) {
      const endC = bk.projectEnd;
      await page.evaluate(cc => window.__dvs.census(cc), endC);
      const discs = await page.evaluate(() => window.APP.cpeRevealDiscsPresent());
      log('§DVS_REVEAL_DISCS ' + JSON.stringify(discs));
      for (const d of discs) {
        const per = await page.evaluate(dd => { window.APP.filterDiscs([dd]); return window.__dvs.discCensus(); }, d);
        let own = { renderable: 0, drawn: 0 }, leak = 0; const ownCls = [];
        for (const k in per) { const R = per[k]; if (R.disc === d) { own.renderable += R.renderable; own.drawn += R.drawn; if (R.drawn !== R.renderable) ownCls.push(`${R.cls}=${R.drawn}/${R.renderable}(M${R.missM}/B${R.missB}/I${R.missI})`); } else leak += R.drawn; }
        log(`§DVS_REVEAL_SLOT disc=${d} drawn=${own.drawn}/${own.renderable} leakOtherDiscs=${leak}${ownCls.length ? ' short: ' + ownCls.join(' ') : ''}`);
        rows.push({ kind: 'reveal', cls: d, maxMissing: own.renderable - own.drawn, maxStaged: 0, maxOther: own.renderable - own.drawn, maxExtra: leak, maxAbsent: 0, tMissLo: -1, tMissHi: -1, worstT: 1, worstSched: own.renderable });
      }
      const all = await page.evaluate(() => { window.APP.filterDiscs(null); return window.__dvs.discCensus(); });
      let rn = 0, dn = 0, mM = 0, mB = 0, mI = 0; for (const k in all) { rn += all[k].renderable; dn += all[k].drawn; mM += all[k].missM; mB += all[k].missB; mI += all[k].missI; }
      log(`§DVS_REVEAL_ALL drawn=${dn}/${rn} after filterDiscs(null) missing M=${mM} B=${mB} I=${mI}`);
      rows.push({ kind: 'reveal', cls: 'ALL', maxMissing: rn - dn, maxStaged: 0, maxOther: rn - dn, maxExtra: 0, maxAbsent: 0, tMissLo: -1, tMissHi: -1, worstT: 1, worstSched: rn });
    }
    verdictRows = rows;
  } catch (e) {
    log('§DVS_ERROR ' + (e && e.stack || e));
    inconclusive('exception ' + String(e && e.message).slice(0, 120));
    process.exitCode = 2;
  } finally {
    try { await browser.close(); } catch (e) {}
    server.close();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
  if (!verdictRows.length) return;

  Witness('tm_drawn_vs_scheduled')
    .population(() => verdictRows)
    .schema({ type: 'object', required: ['kind', 'cls', 'maxMissing', 'maxStaged', 'maxOther', 'maxExtra', 'worstSched'],
      properties: { kind: { enum: ['sweep', 'reveal'] }, cls: { type: 'string', minLength: 1 },
        maxMissing: { type: 'integer', minimum: 0 }, maxStaged: { type: 'integer', minimum: 0 }, maxOther: { type: 'integer', minimum: 0 },
        maxExtra: { type: 'integer', minimum: 0 }, worstSched: { type: 'integer', minimum: 0 } } })
    // the issue: a scheduled element not drawn — split so the log names the mechanism, but BOTH halves fail the witness
    .invariant('scheduled-elements-are-drawn (no §XRAY-staged miss)', rs => rs.every(r => r.kind !== 'sweep' || r.maxStaged === 0))
    .invariant('scheduled-elements-are-drawn (no mesh/batched/instanced slot left hidden)', rs => rs.every(r => r.maxOther === 0))
    .invariant('no-future-element-drawn / no cross-discipline leak in a reveal slot', rs => rs.every(r => r.maxExtra === 0))
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); if (c[0]) { c[0].maxOther = 1; c[0].maxStaged = 1; } return c; })
    .run();
  logStream.end();
})();
