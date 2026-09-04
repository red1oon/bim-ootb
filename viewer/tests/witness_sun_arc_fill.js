#!/usr/bin/env node
// witness_sun_arc_fill.js — W-SUN-ARC-FILL
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md, "Second open question":
// user, 2026-09-05: "during fly indoors, it seems it is not as bright as when we do a static alt-s").
// Read the log after every run — the exit code is not evidence; the § lines are.
//
// THE ISSUE THIS PROVES OR DISPROVES: cinema_maxq.js sweeps the sun 55°→6° across a bake (§SUN_ARC)
// while the interior fill (A.ambient, A.hemi, A._nightPLScale) is staged ONCE at the dusk angle and
// never moves — so the room reads dimmer under the high sun of the early/mid film than the dusk
// baseline a manual Alt+S always renders at. §SUN_ARC_FILL (effects.js) compensates on the fill side
// only. This witness bakes ONE fixed indoor pose through the REAL MaxQ pipeline (cli_silent_bake.js,
// tap_sun_arc_fill.js) at tNorm 0/.25/.5/.75/1 twice — compensation numerically OFF (k=0, the pre-fix
// bake) and ON (k = the shipped SUN_ARC_FILL_NOON_BOOST, or --k for a tuning run) — reads the interior
// luma back OUT OF THE EXPORTED FRAMES (ffmpeg raw RGB, glazing rectangles masked out), and asserts:
//   G1  the noon frame with the fix reads as the untouched dusk frame does (within a STATED tolerance);
//   G2  the dusk frame (tNorm=1) is unchanged by the fix — boost 1, same fill, same luma;
//   G3  A.sun.intensity, position, target, shadow camera, shadow matrix and the shadow-map BYTES are
//       identical with the fix on and off at every sample — the sun/shadow path was not touched;
//   G4  boost follows the SHIPPED formula (sliced out of effects.js, never re-typed) and the fill is
//       written from the staged base, not compounded;
//   G5  the pose is the same in all ten frames, the interior mask is not vacuous, glazing is in view.
// INCONCLUSIVE when the OFF bake does not exhibit the defect at this pose (nothing to compensate), or
// when a bake did not deliver five frames.
//
// Usage: node viewer/tests/witness_sun_arc_fill.js [--db Hospital_silent_local] [--k 1.0] [--gpu real]
//          [--out-dir ~/Downloads/sunarc] [--clip 0.5:0.5017] [--reuse] [--only on|off]
//   --reuse   re-analyse the bakes already in --out-dir instead of baking again
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const { execFileSync, spawnSync } = require('child_process');
const { Witness } = require(path.join(__dirname, '..', '..', 'witness_kit', 'contract.js'));

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
function arg(n, d) { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; }
function has(n) { return argv.indexOf('--' + n) >= 0; }
const DB = arg('db', 'Hospital_silent_local');
const OUT_DIR = path.resolve(arg('out-dir', path.join(os.homedir(), 'Downloads', 'sunarc')));
const GPU = arg('gpu', 'real');
// §CPE_CLIP scales the film's frame count by the window: the Hospital path is 1626 frames with the
// buildup off (§CPE_CLIP applied … frames=1626→N), so a 0.0032 span rounds to 5 → tNorm 0,.25,.5,.75,1.
// If a run comes back with N≠5 the bake is redone once with span = 5.2/N_full read off that log.
let CLIP = arg('clip', '0.5:0.5032');
const PORT0 = +arg('port', 8571);
const REUSE = has('reuse');
const ONLY = arg('only', null);
const CAND = +arg('cand', 0);                 // n-th ENCLOSED window candidate (0 = largest glazed face)
const FACING = arg('facing', null);           // sun | away — restrict candidates by the window's facing vs the arc's sun
const NOISE = 2.0;                            // luma units (0-255): codec + TAA noise floor on an unchanged frame

const EFFECTS = fs.readFileSync(path.join(ROOT, 'viewer', 'effects.js'), 'utf8');
const shippedK = +(EFFECTS.match(/var SUN_ARC_FILL_NOON_BOOST\s*=\s*([0-9.]+)/) || [])[1];
const K_ON = arg('k', null) != null ? +arg('k') : shippedK;
const RUNS = [{ name: 'off', k: 0 }, { name: 'on', k: K_ON }].filter(r => !ONLY || r.name === ONLY);
fs.mkdirSync(OUT_DIR, { recursive: true });
const WLOG = path.join(OUT_DIR, 'witness_sun_arc_fill_c' + CAND + (FACING ? '_' + FACING : '') + '_k' + K_ON + '.log');
fs.writeFileSync(WLOG, '');
function log(l) { console.log(l); fs.appendFileSync(WLOG, l + '\n'); }   // sync: process.exit must not lose the log
log('§SUN_ARC_FILL_WITNESS_ENV root=' + ROOT + ' db=' + DB + ' gpu=' + GPU + ' clip=' + CLIP + ' cand=' + CAND + ' facing=' + (FACING || 'any') +
  ' shippedK=' + shippedK + ' kOn=' + K_ON + ' reuse=' + REUSE + ' outDir=' + OUT_DIR);

// ── the shipped boost formula, SLICED out of effects.js (never re-typed) ──────────────────────────
function sliceFn(src, marker) {
  const i = src.indexOf(marker); if (i < 0) return null;
  let d = 0, open = false;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') { d++; open = true; } else if (src[j] === '}') { d--; if (open && d === 0) return src.slice(i, j + 1); } }
  return null;
}
const boostSrc = sliceFn(EFFECTS, 'function _sunArcFillBoost(');
const photoSunEl = +(EFFECTS.match(/var PHOTO_SUN_ELEVATION\s*=\s*([0-9.]+)/) || [])[1];
const photoSunAz = +(EFFECTS.match(/var PHOTO_SUN_AZIMUTH\s*=\s*([0-9.]+)/) || [])[1];
function shippedBoost(elevation, k) {
  const sb = { A: { _sunArcFillNoonBoost: k }, PHOTO_SUN_ELEVATION: photoSunEl, SUN_ARC_FILL_NOON_BOOST: shippedK, Math, isFinite };
  vm.createContext(sb); vm.runInContext(boostSrc + '; __r = _sunArcFillBoost(' + elevation + ');', sb);
  return sb.__r;
}

// ── bake driver: the SHIPPED CLI runner, one run per k ───────────────────────────────────────────
function bake(run, idx, attempt) {
  const tag = run.name + '_c' + CAND + (FACING ? '_' + FACING : '') + (run.name === 'on' ? '_k' + run.k : '');
  const out = path.join(OUT_DIR, 'sunarc_' + tag + '.mp4'), logf = out.replace(/\.mp4$/, '.log');
  const tapf = path.join(OUT_DIR, 'tap_' + tag + '.js'), prof = path.join(OUT_DIR, 'profile_' + run.name);
  const tapJson = out.replace(/\.mp4$/, '_tap.json');
  if (REUSE && !attempt && fs.existsSync(logf) && fs.existsSync(out) && fs.existsSync(tapJson)) { log('§SUN_ARC_FILL_BAKE run=' + run.name + ' REUSED ' + logf); return { out, logf, tapJson }; }
  fs.writeFileSync(tapf, 'window.__SUN_ARC_FILL_K = ' + run.k + ';\nwindow.__SUN_ARC_FILL_CAND = ' + CAND + ';\n' +
    (FACING ? 'window.__SUN_ARC_FILL_FACING = ' + JSON.stringify(FACING) + ';\nwindow.__SUN_ARC_FILL_AZ = ' + photoSunAz + ';\n' : '') +
    fs.readFileSync(path.join(__dirname, 'tap_sun_arc_fill.js'), 'utf8'));
  fs.rmSync(prof, { recursive: true, force: true });          // fresh profile per run (the rule)
  const args = [path.join(ROOT, 'cli_silent_bake.js'), '--root', ROOT, '--db', DB, '--out', out, '--log', logf, '--profile', prof,
    '--gpu', GPU, '--clip', CLIP, '--no-buildup', '--no-label', '--no-reveal', '--day', 'off', '--tap', tapf,
    '--port', String(PORT0 + idx), '--timeout-min', '25', '--stall-min', '8'];
  log('§SUN_ARC_FILL_BAKE run=' + run.name + ' k=' + run.k + ' cand=' + CAND + ' attempt=' + (attempt || 0) + ' cmd=node ' + args.join(' '));
  const t0 = Date.now();
  const r = spawnSync('node', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
  log('§SUN_ARC_FILL_BAKE run=' + run.name + ' exit=' + r.status + ' wallSec=' + ((Date.now() - t0) / 1000).toFixed(0) + ' log=' + logf);
  // the clip must have landed on exactly five frames — otherwise size the span off THIS film and redo once
  const clip = /§CPE_CLIP applied[^\n]*frames=(\d+)→(\d+)/.exec(fs.existsSync(logf) ? fs.readFileSync(logf, 'utf8') : '');
  if (clip && +clip[2] !== 5 && !attempt) {
    const span = 5.2 / +clip[1], m = CLIP.split(':').map(Number);
    CLIP = m[0] + ':' + (m[0] + span).toFixed(6);
    log('§SUN_ARC_FILL_BAKE run=' + run.name + ' clipFrames=' + clip[1] + '→' + clip[2] + ' ≠ 5 — re-baking once with --clip ' + CLIP);
    return bake(run, idx, 1);
  }
  return { out, logf, tapJson };
}

// ── read-back: the bake's own § lines, the tap rows, and the exported frames' pixels ─────────────
const RX_FILL = /§SUN_ARC_FILL tNorm=([\d.]+) elevation=([\d.]+) dayT=([\d.]+) u=([\d.]+) k=([-\d.e+]+) boost=([\d.]+) ambient=([\d.]+) hemi=([\d.]+) plScale=([-\d.]+) base=([\d.]+)\/([\d.]+)\/([-\d.]+) poolLit=(\d+) poolSum=([\d.]+) sun=([\d.]+) sunPos=([-\d.,]+)/;
function analyse(run, files) {
  const text = fs.existsSync(files.logf) ? fs.readFileSync(files.logf, 'utf8') : '';
  const lines = text.split('\n');
  const fill = lines.map(l => RX_FILL.exec(l)).filter(Boolean).map(m => ({
    tNorm: +m[1], elevation: +m[2], dayT: +m[3], u: +m[4], k: +m[5], boost: +m[6], ambient: +m[7], hemi: +m[8], plScale: +m[9],
    baseAmb: +m[10], baseHemi: +m[11], basePl: +m[12], poolLit: +m[13], poolSum: +m[14], sunI: +m[15], sunPos: m[16] }));
  const clip = /§CPE_CLIP applied[^\n]*frames=(\d+)→(\d+)/.exec(text);
  const probe = /§CLI_BAKE_FFPROBE codec=(\w+) (\d+)x(\d+) frames=(\d+)/.exec(text);
  const gl = /§CLI_BAKE_GL ([^\n]*)/.exec(text);
  const base = /§SUN_ARC_FILL_BASE ([^\n]*)/.exec(text);
  const tap = fs.existsSync(files.tapJson) ? JSON.parse(fs.readFileSync(files.tapJson, 'utf8')) : { lines: [], rows: [] };
  (tap.lines || []).forEach(l => log('  [' + run.name + '] ' + l));
  log('§SUN_ARC_FILL_RUN run=' + run.name + ' k=' + run.k + ' fillLines=' + fill.length + ' clipFrames=' + (clip ? clip[1] + '→' + clip[2] : '?') +
    ' ffprobe=' + (probe ? probe[2] + 'x' + probe[3] + ' frames=' + probe[4] : 'none') + ' tapRows=' + (tap.rows || []).length +
    ' base=' + (base ? base[1] : '?') + ' gl=' + (gl ? gl[1].slice(0, 90) : '?'));
  if (!probe) return { run, rows: [], reason: 'no §CLI_BAKE_FFPROBE — the bake delivered no file' };
  const W = +probe[2], H = +probe[3], NF = +probe[4];
  const rows = [];
  for (let i = 0; i < NF; i++) {
    const f = fill[i], t = (tap.rows || []).find(r => r.i === i);
    if (!f || !t) { log('§SUN_ARC_FILL_FRAME run=' + run.name + ' i=' + i + ' MISSING fill=' + !!f + ' tap=' + !!t); continue; }
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', files.out, '-vf', 'select=eq(n\\,' + i + ')', '-fps_mode', 'passthrough', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: W * H * 3 + 4096 });
    if (raw.length !== W * H * 3) { log('§SUN_ARC_FILL_FRAME run=' + run.name + ' i=' + i + ' rawBytes=' + raw.length + ' expected=' + (W * H * 3)); continue; }
    // mask: glazing rectangles (+1% margin for the codec's ringing / any halo) are NOT interior
    const margin = Math.round(0.01 * H), mask = new Uint8Array(W * H);
    for (const r of t.rects) {
      const x0 = Math.max(0, Math.floor(r.x0 * W) - margin), x1 = Math.min(W, Math.ceil(r.x1 * W) + margin);
      const y0 = Math.max(0, Math.floor(r.y0 * H) - margin), y1 = Math.min(H, Math.ceil(r.y1 * H) + margin);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * W + x] = 1;
    }
    let sumAll = 0, sumIn = 0, nIn = 0, sumWin = 0, nWin = 0;
    for (let p = 0, o = 0; p < W * H; p++, o += 3) {
      const Y = 0.299 * raw[o] + 0.587 * raw[o + 1] + 0.114 * raw[o + 2];
      sumAll += Y; if (mask[p]) { sumWin += Y; nWin++; } else { sumIn += Y; nIn++; }
    }
    rows.push({
      run: run.name, k: run.k, i, tNorm: f.tNorm, elevation: f.elevation, dayT: f.dayT, u: f.u, boost: f.boost,
      ambient: f.ambient, hemi: f.hemi, plScale: f.plScale, baseAmb: f.baseAmb, baseHemi: f.baseHemi, basePl: f.basePl,
      poolLit: f.poolLit, poolSum: f.poolSum, sunI: f.sunI, sunPos: f.sunPos,
      tapAmbient: t.ambient, tapHemi: t.hemi, tapPl: t.plScale, tapSunI: t.sunI, tapSunPos: (t.sunPos || []).join(','), tapSunTgt: (t.sunTgt || []).join(','),
      shadowCam: (t.shadowCam || []).join(','), shadowMat: (t.shadowMat || []).join(','), shadowHash: t.shadowHash || null, shadowNote: t.shadowNote || '',
      cam: t.cam.join(','), rects: t.rects.length, rectArea: t.rectArea, sunFacing: t.sunFacing, budget: t.budget,
      lumaInterior: +(sumIn / Math.max(1, nIn)).toFixed(3), lumaWindow: +(nWin ? sumWin / nWin : 0).toFixed(3), lumaAll: +(sumAll / (W * H)).toFixed(3),
      interiorPx: nIn, windowPx: nWin, w: W, h: H
    });
  }
  return { run, rows, W, H, NF };
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────
const results = RUNS.map((run, idx) => analyse(run, bake(run, idx)));
const rows = [].concat(...results.map(r => r.rows));
rows.forEach(r => log('§SUN_ARC_FILL_SAMPLE run=' + r.run + ' k=' + r.k + ' i=' + r.i + ' tNorm=' + r.tNorm.toFixed(3) + ' elevation=' + r.elevation.toFixed(2) +
  ' dayT=' + r.dayT.toFixed(4) + ' boost=' + r.boost.toFixed(4) + ' ambient=' + r.ambient.toFixed(4) + ' hemi=' + r.hemi.toFixed(4) + ' plScale=' + r.plScale.toFixed(4) +
  ' poolLit=' + r.poolLit + ' poolSum=' + r.poolSum.toFixed(3) + ' budget=' + r.budget + ' sun=' + r.sunI.toFixed(4) + ' sunPos=' + r.sunPos + ' sunFacing=' + r.sunFacing +
  ' lumaInterior=' + r.lumaInterior.toFixed(2) + ' lumaWindow=' + r.lumaWindow.toFixed(2) + ' lumaAll=' + r.lumaAll.toFixed(2) +
  ' interiorPx=' + r.interiorPx + ' windowPx=' + r.windowPx + ' rects=' + r.rects + ' shadowMap=' + (r.shadowHash || 'unreadable')));

const off = rows.filter(r => r.run === 'off'), on = rows.filter(r => r.run === 'on');
const byI = (set, i) => set.find(r => r.i === i);
const duskOff = byI(off, 4), noonOff = byI(off, 0), noonOn = byI(on, 0), duskOn = byI(on, 4);
const TOL = duskOff ? Math.max(3.0, 0.05 * duskOff.lumaInterior) : 3.0;
const near = (a, b, e) => Math.abs(a - b) <= e;

// the sun/shadow before-vs-after diff, one line per sample — the proof the sun path was untouched
for (let i = 0; i < 5; i++) {
  const a = byI(off, i), b = byI(on, i); if (!a || !b) continue;
  const same = (x, y) => x === y ? 'same' : 'DIFF';
  log('§SUN_ARC_FILL_SHADOW_DIFF i=' + i + ' tNorm=' + a.tNorm.toFixed(2) + ' sunI=' + same(a.tapSunI, b.tapSunI) + '(' + a.tapSunI + ')' +
    ' sunPos=' + same(a.tapSunPos, b.tapSunPos) + ' sunTgt=' + same(a.tapSunTgt, b.tapSunTgt) + ' shadowCam=' + same(a.shadowCam, b.shadowCam) +
    ' shadowMat=' + same(a.shadowMat, b.shadowMat) + ' shadowMapBytes=' + (a.shadowHash && b.shadowHash ? same(a.shadowHash, b.shadowHash) + '(' + a.shadowHash + ')' : 'unreadable(' + a.shadowNote + ')') +
    ' | fill: ambient ' + a.ambient + '→' + b.ambient + ' hemi ' + a.hemi + '→' + b.hemi + ' plScale ' + a.plScale + '→' + b.plScale +
    ' lumaInterior ' + a.lumaInterior + '→' + b.lumaInterior);
}
if (duskOff && noonOff) log('§SUN_ARC_FILL_DEFECT off: lumaInterior noon=' + noonOff.lumaInterior + ' dusk=' + duskOff.lumaInterior + ' delta=' + (duskOff.lumaInterior - noonOff.lumaInterior).toFixed(2) +
  ' tol=' + TOL.toFixed(2) + ' ' + (duskOff.lumaInterior - noonOff.lumaInterior > TOL ? 'DEFECT-PRESENT (noon interior dimmer than dusk before the fix)' : 'NOT-EXHIBITED at this pose'));
if (noonOn && duskOff && noonOff) {
  const gain = noonOn.lumaInterior - noonOff.lumaInterior, want = duskOff.lumaInterior - noonOff.lumaInterior;
  log('§SUN_ARC_FILL_TUNE k=' + K_ON + ' noonOff=' + noonOff.lumaInterior + ' noonOn=' + noonOn.lumaInterior + ' duskOff=' + duskOff.lumaInterior +
    ' residual=' + (noonOn.lumaInterior - duskOff.lumaInterior).toFixed(2) + ' tol=' + TOL.toFixed(2) +
    (Math.abs(gain) > 0.5 ? ' secantK=' + (K_ON * want / gain).toFixed(3) : ' secantK=n/a (no gain measured)'));
}

const schema = {
  type: 'object',
  required: ['run', 'k', 'i', 'tNorm', 'elevation', 'dayT', 'boost', 'ambient', 'hemi', 'plScale', 'sunI', 'tapSunI', 'cam', 'lumaInterior', 'interiorPx', 'windowPx', 'rects'],
  properties: { run: { enum: ['off', 'on'] }, k: { type: 'number' }, i: { type: 'integer', minimum: 0, maximum: 4 }, tNorm: { type: 'number' },
    elevation: { type: 'number' }, dayT: { type: 'number' }, boost: { type: 'number', minimum: 1 }, ambient: { type: 'number' }, hemi: { type: 'number' },
    plScale: { type: 'number' }, sunI: { type: 'number' }, tapSunI: { type: 'number' }, cam: { type: 'string' }, lumaInterior: { type: 'number' },
    interiorPx: { type: 'integer' }, windowPx: { type: 'integer' }, rects: { type: 'integer' } }
};
const w = Witness('SUN_ARC_FILL')
  .population(() => rows)
  .schema(schema)
  // G5a — five samples per run, at the five tNorms, on the shipped arc
  .invariant('five-samples-per-run-on-the-arc', rs => ['off', 'on'].every(n => [0, 1, 2, 3, 4].every(i => {
    const r = rs.find(x => x.run === n && x.i === i); return r && near(r.tNorm, i / 4, 1e-6) && near(r.elevation, 55 + (6 - 55) * i / 4, 0.01); })))
  // G5b — one pose, all ten frames, lit at the same point-light budget (the frame-0 quirk neutralised)
  .invariant('pose-fixed-across-frames-and-runs', rs => rs.every(r => r.cam === rs[0].cam))
  .invariant('same-light-budget-every-frame', rs => rs.every(r => r.budget === rs[0].budget && r.poolLit === rs[0].poolLit))
  // G5c — the interior mask is not vacuous, and glazing is actually in the frame
  .invariant('interior-mask-nonvacuous', rs => rs.every(r => r.interiorPx >= 0.25 * r.w * r.h))
  .invariant('glazing-in-view', rs => rs.every(r => r.rects > 0 && r.windowPx > 0))
  // G4a — boost is the SHIPPED formula (sliced from effects.js) at every sample; off run boost=1
  .invariant('boost-follows-shipped-formula', rs => rs.every(r => near(r.boost, shippedBoost(r.elevation, r.k).boost, 1e-4) && (r.run !== 'off' || near(r.boost, 1, 1e-9))))
  // G4b — fill written from the staged base × boost, never compounded
  .invariant('fill-from-staged-base-not-compounded', rs => rs.every(r => near(r.ambient, r.baseAmb * r.boost, 1e-4) && near(r.hemi, r.baseHemi * r.boost, 1e-4) && near(r.plScale, r.basePl * r.boost, 1e-4)))
  // G4c — what the frame was CAPTURED with equals what the § line says (nothing overwrote it later)
  .invariant('capture-state-equals-logged-state', rs => rs.every(r => near(r.tapAmbient, r.ambient, 1e-4) && near(r.tapHemi, r.hemi, 1e-4) && near(r.tapPl, r.plScale, 1e-4) && near(r.tapSunI, r.sunI, 1e-4)))
  // G3 — sun + shadow byte-identical on vs off at every sample
  .invariant('sun-and-shadow-identical-on-vs-off', rs => [0, 1, 2, 3, 4].every(i => {
    const a = rs.find(x => x.run === 'off' && x.i === i), b = rs.find(x => x.run === 'on' && x.i === i);
    return a && b && a.tapSunI === b.tapSunI && a.tapSunPos === b.tapSunPos && a.tapSunTgt === b.tapSunTgt && a.shadowCam === b.shadowCam &&
      a.shadowMat === b.shadowMat && (!(a.shadowHash && b.shadowHash) || a.shadowHash === b.shadowHash); }))
  // G2 — the dusk frame is unchanged by the fix
  .invariant('dusk-baseline-unchanged', rs => {
    const a = rs.find(x => x.run === 'off' && x.i === 4), b = rs.find(x => x.run === 'on' && x.i === 4);
    return a && b && near(b.boost, 1, 1e-9) && a.ambient === b.ambient && a.hemi === b.hemi && a.plScale === b.plScale && near(a.lumaInterior, b.lumaInterior, NOISE); })
  // G1 — THE claim: with the fix, the noon interior reads as the untouched dusk interior does
  .invariant('noon-interior-matches-dusk-within-tol', rs => {
    const d = rs.find(x => x.run === 'off' && x.i === 4), n = rs.find(x => x.run === 'on' && x.i === 0);
    return d && n && near(n.lumaInterior, d.lumaInterior, TOL); })
  // RED — the pre-fix picture put back (noon as dim as it was) AND a touched sun: both must be caught
  .redControl(rs => rs.map(r => (r.run === 'on' && r.i === 0)
    ? Object.assign({}, r, { lumaInterior: (rs.find(x => x.run === 'off' && x.i === 0) || r).lumaInterior, tapSunI: r.tapSunI + 0.5, boost: 1, ambient: r.baseAmb, hemi: r.baseHemi, plScale: r.basePl })
    : r));

const res = w.run();
const defect = duskOff && noonOff && (duskOff.lumaInterior - noonOff.lumaInterior > TOL);
const verdict = rows.length !== 10 ? 'INCONCLUSIVE — ' + rows.length + ' of 10 samples read back (' + results.map(r => r.run.name + ':' + (r.reason || r.rows.length)).join(' ') + ')'
  : !defect ? 'INCONCLUSIVE — the OFF bake does not exhibit the defect at this pose; nothing to compensate'
  : res.fail === 0 ? 'PASS' : 'FAIL';
log('§WITNESS_SUN_ARC_FILL_VERDICT ' + verdict + ' k=' + K_ON + ' tol=' + TOL.toFixed(2) + ' (max(3.0, 5% of dusk luma)) noise=' + NOISE +
  (noonOn && duskOff ? ' noonOn=' + noonOn.lumaInterior + ' duskOff=' + duskOff.lumaInterior + ' noonOff=' + (noonOff ? noonOff.lumaInterior : '?') : '') +
  ' rows=' + rows.length + ' pass=' + res.pass + ' fail=' + res.fail + ' log=' + WLOG);
process.exit(verdict === 'PASS' ? 0 : 1);
