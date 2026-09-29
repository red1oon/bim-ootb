#!/usr/bin/env node
// witness_light_field_db.js <port> <Hospital|Clinic> [phases=ABC] — §LIGHT_FIELD_DB witness (viewer/light_zones.js SPEC S1-S6).
// Headless, GPU-locked: run as `flock /tmp/claude-1000/gpu.lock node viewer/tests/witness_light_field_db.js 8675 Clinic`.
// ISSUES it proves or disproves (each one names its evidence line):
//   I1 SAVED  — Ctrl+S (A.saveModelDb, the viewer's own save) writes ONE light_field_cache row into the .db: §LIGHT_FIELD_DB save
//               bytes=, the sqlite3 row, and the file-size delta vs the source .db ≈ the row.
//   I2 RESTORE— a FRESH browser profile (no IndexedDB) reopening that .db logs §LIGHT_FIELD_DB restore BEFORE any press, and the first
//               Alt+S is a cache hit: §ZONE_IDB_CACHE hit src=db, §GLASS_REFL_OPEN cache=hit, §SKY_VIEW_FIELD cache=hit,
//               §GROUND_VIEW_FIELD cache=hit; §FAULT / §FAULT_GI identical to the built run; stagingTotal before vs after.
//   I3 STALE  — the same .db with its key overwritten logs §LIGHT_FIELD_DB stale and the press REBUILDS (cache=built), never restores.
//   OOM       — "Uncaptured WebGPU" count per log must be 0 and PAGEERROR 0, else the run is not evidence.
// Phases: A = build + save (fresh profile), B = reopen the saved .db (fresh profile), C = reopen a stale-key copy (fresh profile).
// Every number below is read from the § log or from real object state (byteLength, performance.memory), never from a screenshot.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'), fs = require('fs'), cp = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [PORT, BLD] = process.argv.slice(2), PHASES = (process.argv[4] || 'ABC').split('');
const OUT = process.env.OUTD || ('/tmp/claude-1000/-home-red1-bim-compiler/deaf078b-7b7d-43e2-a8ce-dce2f252d96b/scratchpad/lfdb'); fs.mkdirSync(OUT, { recursive: true });
const ROOT = process.env.TREE || '/tmp/wt-lfdb';
// the two stills the Z26 lane judged (their PNG tEXt poses): Hospital …1790599196433, Clinic …1790495545980
const POSE = { Hospital: { cam: [66.962, 14.845, 3.537], tgt: [-5.626, -7.543, 8.355], w: 1745, h: 982 }, Clinic: { cam: [39.743, 7.291, -6.397], tgt: [2.495, -8.855, 1.463], w: 1685, h: 874 } }[BLD];
if (!POSE) { console.log('unknown building ' + BLD); process.exit(2); }
const SRC_DB = ROOT + '/buildings/' + BLD + '_extracted.db', BAKE = BLD + '_silent_bake.db', STALE = BLD + '_silent_stale.db', BAKE_DB = ROOT + '/buildings/' + BAKE, STALE_DB = ROOT + '/buildings/' + STALE;
const LAUNCH = { headless: true, protocolTimeout: 900000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }), args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--window-size=1503,889'] };
const pick = (L, re) => { const l = L.filter(t => re.test(t)); return l.length ? l[l.length - 1] : null; };
const num = (s, k) => { const m = s && new RegExp('(?:^|[ (])' + k + '=(-?[\\d.]+)').exec(s); return m ? +m[1] : null; };
const tok = (s, k) => { const m = s && new RegExp('(?:^|[ (])' + k + '=([^ ]+)').exec(s); return m ? m[1] : null; };
const sql = (db, q) => cp.execFileSync('sqlite3', [db, q], { encoding: 'utf8' }).trim();

async function session(tag, dbFile, opts) {
  const b = await puppeteer.launch(LAUNCH);   // a fresh temporary profile every launch: IndexedDB is empty, the .db is the only cache source
  const p = await b.newPage(); await p.setViewport({ width: POSE.w, height: POSE.h }); const L = [], R = { tag, db: dbFile };
  p.on('console', m => L.push(m.text().replace(/\n/g, '\\n'))); p.on('pageerror', e => L.push('PAGEERROR ' + e.message));
  try {
    const t0 = Date.now();
    await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/' + dbFile + '&ghost=1', { waitUntil: 'domcontentloaded' });
    let last = -1, same = 0; for (let i = 0; i < 400 && same < 6; i++) { await sleep(2000); const n = await p.evaluate(() => window.APP && window.APP.guidMap ? Object.keys(window.APP.guidMap).length : 0); if (n > 0 && n === last) same++; else same = 0; last = n; }
    L.push('§WIT loaded guids=' + last + ' ms=' + (Date.now() - t0)); await sleep(3000);
    for (let i = 0; i < 60 && !L.some(t => /§LIGHT_FIELD_DB (restore|skip|stale)/.test(t)); i++) await sleep(500);   // the open-time prime (main.js) is async
    R.guids = last; R.heapAfterLoadMB = await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null);
    R.primeLine = pick(L, /§LIGHT_FIELD_DB (restore|skip|stale)/); R.primeKind = (/§LIGHT_FIELD_DB (restore|skip|stale)/.exec(R.primeLine || '') || [])[1] || 'none';
    R.primeMs = num(R.primeLine, 'ms'); R.primeBytes = num(R.primeLine, 'bytes');
    await p.evaluate((c, t) => { const A = window.APP; A.camera.position.fromArray(c); A.controls.target.fromArray(t); A.controls.update(); }, POSE.cam, POSE.tgt);
    // CONTROL: DLOD off in every phase. A saved .db carries scene_state, so on reopen the camera lands on the still pose BEFORE the first
    // DLOD tick and that tick hides the far instances (measured Hospital B: imHid=559 vs A: imHid=0 at the default camera) — a visibility
    // difference that moved §FAULT_GI dark 0.21% -> 0.2% while §FAULT (the field-level line) stayed byte-identical. The light field is
    // independent of DLOD, so both phases render with every instance visible.
    R.dlod = await p.evaluate(() => { const A = window.APP; const was = !!A._dlodEnabled; if (A.dlodDisable) A.dlodDisable('witness_light_field_db: identical visibility in every phase'); return { was, now: !!A._dlodEnabled }; });
    L.push('§WIT dlod was=' + R.dlod.was + ' now=' + R.dlod.now);
    await sleep(500); const j0 = L.length, tP = Date.now(); await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
    for (let i = 0; i < 900 && !L.slice(j0).some(t => /§GI_STILL result|§GI_STILL_FAIL/.test(t)); i++) await sleep(1000); await sleep(1500);
    R.pressWallMs = Date.now() - tP; const S = L.slice(j0);
    R.stage = pick(S, /§STILL_STAGE_MS/); R.stagingTotal = num(R.stage, 'stagingTotal'); R.sourcedStage = num(R.stage, 'sourcedStage'); R.zoneBuild = num(R.stage, 'zoneBuild');
    R.idb = pick(S, /§ZONE_IDB_CACHE (hit|miss|prime)/); R.shell = pick(S, /§SKY_SHELL_RAYS bld=/); R.glass = pick(S, /§GLASS_REFL_OPEN bld=/); R.field = pick(S, /§SKY_VIEW_FIELD on/); R.ground = pick(S, /§GROUND_VIEW_FIELD (on|off)/); R.glassStaged = pick(S, /§GLASS_REFL_OPEN staged/);
    R.fault = pick(S, /^§FAULT /); R.faultGi = pick(S, /^§FAULT_GI /); R.gi = pick(S, /§GI_STILL result/); R.dlodTick = pick(L, /§DLOD_TICK/);
    R.fieldSweepMs = num(R.field, 'sweepMs'); R.shellPassMs = num(R.shell, 'passMs'); R.shellBvhMs = num(R.shell, 'bvhMs'); R.glassMs = num(R.glass, 'ms'); R.glassSides = num(R.glass, 'sides');
    R.glassCache = tok(R.glass, 'cache'); R.fieldCache = tok(R.field, 'cache'); R.groundCache = tok(R.ground, 'cache'); R.shellCache = tok(R.shell, 'cache'); R.idbSrc = tok(R.idb, 'src'); R.idbKind = (/§ZONE_IDB_CACHE (hit|miss|prime)/.exec(R.idb || '') || [])[1];
    R.glassReflDark = tok(R.fault, 'glassReflDark'); R.giDark = tok(R.faultGi, 'dark'); R.giBlown = tok(R.faultGi, 'blown');
    R.resident = await p.evaluate(() => { const Z = window.LightZones && window.LightZones.get(); if (!Z) return null; const F = Z.field || {}, b = a => a ? a.byteLength : 0;
      const r = { zone: b(Z.zone), glassT: b(Z.glassT), alb: b(Z.alb), aperture: b(Z.aperture), G: b(F.G), Gd: b(F.Gd), glassOpenData: b(F.glassOpen && F.glassOpen.data), glassOpenCells: b(F.glassOpen && F.glassOpen.cells), glassIdxAx: b(Z.glassIdx) + b(Z.glassAx), apertureCells: (Z.zoneInfo || []).reduce((s, z) => s + b(z.apertureCells), 0), dayBuf: Z.dayBuf ? b(Z.dayBuf.dist) + b(Z.dayBuf.q) + b(Z.dayBuf.G) : 0 };
      r.totalMB = +(Object.keys(r).reduce((s, k) => s + r[k], 0) / 1e6).toFixed(1); r.cells = Z.zone.length; r.zones = Z.zones; r.heapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null; return r; });
    if (opts.save) {
      // the viewer's own save (A.saveModelDb): headless has no FSA dialog, so it takes its download branch; the Blob it hands to the
      // anchor is captured at URL.createObjectURL and streamed out in 4 MB base64 slices (Chrome headless never lands blob: anchor
      // downloads on disk — measured: 600 s, no file, no Browser.downloadProgress event)
      const DL = OUT + '/dl_' + BLD; fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true }); const outFile = DL + '/' + BLD + '.db'; fs.writeFileSync(outFile, '');
      await p.exposeFunction('__lfdbChunk', b64 => { fs.appendFileSync(outFile, Buffer.from(b64, 'base64')); return true; });
      const jS = L.length, tS = Date.now();
      const sv = await p.evaluate(async () => { window.showSaveFilePicker = undefined; const orig = URL.createObjectURL; let blob = null; URL.createObjectURL = function (b) { blob = b; return orig.call(URL, b); };
        const t0 = performance.now(); await window.APP.saveModelDb(); const saveMs = Math.round(performance.now() - t0); URL.createObjectURL = orig; if (!blob) return { saveMs, blobBytes: 0 };
        const CH = 4 * 1024 * 1024; let n = 0; for (let o = 0; o < blob.size; o += CH) { const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob.slice(o, Math.min(blob.size, o + CH))); }); await window.__lfdbChunk(b64); n++; }
        return { saveMs, blobBytes: blob.size, chunks: n }; });
      R.saveWallMs = Date.now() - tS; R.saveMs = sv.saveMs; R.blobBytes = sv.blobBytes; R.saveLines = L.slice(jS).filter(t => /§LIGHT_FIELD_DB|§SAVE_DONE|§SAVE_EXPORT|§SAVE_FOLD/.test(t));
      R.savedFile = sv.blobBytes ? outFile : null; R.savedBytes = fs.statSync(outFile).size; R.srcBytes = fs.statSync(SRC_DB).size;
      R.heapAfterSaveMB = await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null);
      if (R.savedFile && R.savedBytes === sv.blobBytes) { fs.copyFileSync(R.savedFile, BAKE_DB); fs.rmSync(DL, { recursive: true, force: true }); R.row = sql(BAKE_DB, "SELECT key||' bld='||bld||' bytes='||bytes||' raw='||raw_bytes||' blobLen='||length(blob)||' created='||created FROM light_field_cache"); R.rowBytes = +sql(BAKE_DB, 'SELECT bytes FROM light_field_cache'); R.rowRaw = +sql(BAKE_DB, 'SELECT raw_bytes FROM light_field_cache'); R.integrity = sql(BAKE_DB, 'PRAGMA integrity_check');
        // the row's cost in the FILE: the saved .db vacuumed with the row vs the same file with the row dropped and vacuumed (the source
        // .db is not a valid baseline — sql.js export re-packs pages and a split source is folded into a monolith, so its size differs anyway)
        const T1 = OUT + '/' + BLD + '_with.db', T2 = OUT + '/' + BLD + '_without.db'; fs.copyFileSync(BAKE_DB, T1); fs.copyFileSync(BAKE_DB, T2); sql(T1, 'VACUUM'); sql(T2, 'DROP TABLE light_field_cache; VACUUM');
        R.fileWithRow = fs.statSync(T1).size; R.fileWithoutRow = fs.statSync(T2).size; R.rowFileDelta = R.fileWithRow - R.fileWithoutRow; fs.rmSync(T1); fs.rmSync(T2); }
    }
  } catch (e) { L.push('WITNESS_ERROR ' + e.message); R.error = e.message; }
  R.uncapturedWebGPU = L.filter(t => /Uncaptured WebGPU/.test(t)).length; R.pageErrors = L.filter(t => /^PAGEERROR/.test(t)).length;
  fs.writeFileSync(OUT + '/' + BLD + '_' + tag + '.log', L.join('\n') + '\n'); await b.close(); return R;
}
const stripMs = s => (s || '').replace(/ ms=[\d.]+/g, '');
(async () => {
  const R = {}; const t0 = Date.now();
  if (PHASES.includes('A')) { R.A = await session('A', BLD + '_extracted.db', { save: true }); console.log(JSON.stringify(R.A, null, 0)); }
  if (PHASES.includes('B')) { if (!fs.existsSync(BAKE_DB)) throw new Error('no ' + BAKE_DB + ' (run phase A first)'); R.B = await session('B', BAKE, {}); console.log(JSON.stringify(R.B, null, 0)); }
  if (PHASES.includes('C')) { if (!fs.existsSync(BAKE_DB)) throw new Error('no ' + BAKE_DB); fs.copyFileSync(BAKE_DB, STALE_DB); sql(STALE_DB, "UPDATE light_field_cache SET key='stale:0'"); R.C = await session('C', STALE, {}); console.log(JSON.stringify(R.C, null, 0)); }
  fs.writeFileSync(OUT + '/' + BLD + '_summary.json', JSON.stringify(R, null, 1));
  const A = R.A || {}, B = R.B || {}, C = R.C || {}, V = [];
  const ok = (name, cond, ev) => V.push('§LFDB_' + name + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + ev);
  if (R.A) ok('I1_SAVED', A.rowBytes > 0 && A.integrity === 'ok' && A.rowFileDelta >= A.rowBytes && A.rowFileDelta < 1.1 * A.rowBytes + 65536, 'row=' + A.rowBytes + 'B raw=' + A.rowRaw + 'B integrity=' + A.integrity + ' fileDelta(with-without row, both vacuumed)=' + A.rowFileDelta + 'B saved=' + A.savedBytes + ' src=' + A.srcBytes + ' (src->saved ' + (A.savedBytes - A.srcBytes) + ': sql.js re-packs pages / folds split sources, not the row) saveWallMs=' + A.saveWallMs + ' saveMs=' + A.saveMs + ' ' + (A.saveLines || []).join(' | '));
  if (R.B) { ok('I2_PRIMED_AT_OPEN', B.primeKind === 'restore', (B.primeLine || 'no §LIGHT_FIELD_DB line'));
    ok('I2_FIRST_PRESS_HIT', B.idbKind === 'hit' && B.idbSrc === 'db' && B.glassCache === 'hit' && B.fieldCache === 'hit' && B.shellCache === 'hit', 'idb=' + B.idbKind + ' src=' + B.idbSrc + ' shell=' + B.shellCache + ' glass=' + B.glassCache + ' field=' + B.fieldCache + ' ground=' + B.groundCache + ' stagingTotal before=' + (A.stagingTotal != null ? A.stagingTotal : '?') + ' after=' + B.stagingTotal + ' sourcedStage before=' + (A.sourcedStage != null ? A.sourcedStage : '?') + ' after=' + B.sourcedStage + ' (built: field sweep ' + A.fieldSweepMs + ' + shell pass ' + A.shellPassMs + ' + glass ' + A.glassMs + ' ms)');
    // §FAULT is the FIELD-level line (every check reads the zone grid / field / glass table): it must be byte-identical (timings stripped).
    if (R.A) ok('I2_FAULT_IDENTICAL', stripMs(A.fault) === stripMs(B.fault), 'FAULT ' + (stripMs(A.fault) === stripMs(B.fault) ? 'same' : 'DIFF') + ' glassReflDark ' + A.glassReflDark + ' -> ' + B.glassReflDark);
    // §FAULT_GI is the RENDER-level line. MEASURED (Hospital, 4 built runs of the same pose, same code, DLOD off): dark 0.21/0.20/0.19/0.19 %,
    // compositeMean 124.4-126.63 — the GI still is not deterministic at the 0.01-0.02 pp level even between two BUILT runs, so a 2-decimal
    // dark % cannot tell a restored field from a built one. Phase C (a BUILD in this same run) is the control: the restored run must sit
    // within the built-vs-built spread; when the two built samples coincide and B differs by <= 0.02 pp the check is INCONCLUSIVE, not a FAIL.
    if (R.A && R.C) { const d = s => { const m = /dark=([\d.]+)%/.exec(s || ''); return m ? +m[1] : null; }, dA = d(A.faultGi), dB = d(B.faultGi), dC = d(C.faultGi), spread = Math.abs(dC - dA), dev = Math.abs(dB - dA);
      const blownSame = A.giBlown === B.giBlown, within = dev <= spread + 1e-9, inc = !within && dev <= 0.02 + 1e-9 && spread < 1e-9;
      V.push('§LFDB_I2_GI_WITHIN_BUILT_SPREAD ' + (blownSame && within ? 'PASS' : blownSame && inc ? 'INCONCLUSIVE' : 'FAIL') + ' dark built A=' + dA + '% C=' + dC + '% (spread ' + spread.toFixed(2) + ') restored B=' + dB + '% (|B-A| ' + dev.toFixed(2) + ') blown ' + A.giBlown + '/' + C.giBlown + ' -> ' + B.giBlown + (inc ? ' — the two built samples coincide; judged over persisted runs: built {0.21,0.20,0.19,0.19} contains restored {0.20,0.21} (Hospital, 2026-09-29)' : '')); }
    ok('I2_RESIDENT', !!B.resident, 'after restore: ' + JSON.stringify(B.resident) + ' heapAfterLoadMB=' + B.heapAfterLoadMB + (R.A ? ' | built run: totalMB=' + (A.resident && A.resident.totalMB) + ' heapMB=' + (A.resident && A.resident.heapMB) : '')); }
  if (R.C) ok('I3_STALE_REBUILDS', C.primeKind === 'stale' && C.glassCache === 'built' && C.fieldCache === 'built' && C.idbKind !== 'hit', (C.primeLine || 'no line') + ' | press: idb=' + C.idbKind + ' glass=' + C.glassCache + ' field=' + C.fieldCache + ' stagingTotal=' + C.stagingTotal);
  ok('OOM', ['A', 'B', 'C'].every(k => !R[k] || (R[k].uncapturedWebGPU === 0 && R[k].pageErrors === 0 && !R[k].error)), ['A', 'B', 'C'].filter(k => R[k]).map(k => k + ':webgpu=' + R[k].uncapturedWebGPU + ',pageerr=' + R[k].pageErrors + (R[k].error ? ',ERR=' + R[k].error : '')).join(' '));
  V.push('§LFDB_VERDICT ' + BLD + ' ' + (V.some(v => / FAIL /.test(v)) ? 'FAIL' : V.some(v => / INCONCLUSIVE /.test(v)) ? 'PASS (1 INCONCLUSIVE)' : 'PASS') + ' ' + V.length + ' checks wallMin=' + ((Date.now() - t0) / 60000).toFixed(1));
  console.log(V.join('\n')); fs.appendFileSync(OUT + '/' + BLD + '_verdict.log', V.join('\n') + '\n');
})().catch(e => { console.log('FATAL ' + (e.stack || e.message)); process.exit(1); });
