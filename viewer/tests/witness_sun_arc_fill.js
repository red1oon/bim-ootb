#!/usr/bin/env node
// witness_sun_arc_fill.js — W-SUN-ARC-FILL (§BAKE_FILL_PIN)
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md, "Second open question":
// user, 2026-09-05: "during fly indoors, it seems it is not as bright as when we do a static alt-s";
// ruling, verbatim: "I know shadowed outside walls are darker but indoors we reverse it, letting
// alt-s normal, and sunlite is brighter... do it."). Read the log after every run — the exit code is
// not evidence; the § lines are.
//
// THE ISSUE THIS PROVES OR DISPROVES: cinema_maxq.js sweeps the sun 55°→6° across a bake (§SUN_ARC)
// while the interior fill (A.ambient, A.hemi, A._nightPLScale, the point-light budget) is staged once
// and, on frame 0, not even at the still budget (§NIGHT_STILL_LIGHTS_ORDER: the budget block ran
// before _applyPhotoStaging, so frame 0 — and a cold Alt+S — lit at the 30-light navigation budget).
// §BAKE_FILL_PIN (effects.js A._sunArcFillPin) re-asserts the Alt+S baseline on every frame. This
// witness bakes the SAME five frames (tNorm 0/.25/.5/.75/1, --clip sized to five frames of the stored
// Hospital path) through the real MaxQ pipeline twice — BEFORE (pin replaced by a no-op via the tap)
// and AFTER (pin live) — and asserts, from the tap's capture-moment readout and the bake's own § lines:
//   G1  AFTER: ambient / hemi / _nightPLScale / budget / near-fade floor / lit-light count are EXACTLY
//       the staged Alt+S baseline at every one of the five samples (flat equality, no tolerance);
//   G2  the frame-0 ordering fix stands on its own: BEFORE (no pin) frame 0 already lights at the
//       still budget, and `§NIGHT_STILL_LIGHTS raised` precedes `§MAXQ_FRAME i=0` in the log;
//   G3  A.sun.intensity, position, target, shadow camera, shadow matrix and the shadow-map BYTES are
//       identical BEFORE vs AFTER at every sample — the sun/shadow path was not touched;
//   G4  the frames compared are the same frames: identical plan poses and elevations BEFORE vs AFTER;
//   G5  what the frame was captured with equals what the pin's own § line says it set.
// The pin reports what it corrected (drift=…); the verdict line carries the count, so a run where the
// pin changed nothing is stated as a NO-OP guard, not hidden. INCONCLUSIVE when either bake did not
// deliver five frames.
//
// Usage: node viewer/tests/witness_sun_arc_fill.js [--db Hospital_silent_local] [--gpu real]
//          [--out-dir ~/Downloads/sunarc] [--clip 0.5:0.5032] [--port 8571] [--reuse] [--only before|after]
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const { Witness } = require(path.join(__dirname, '..', '..', 'witness_kit', 'contract.js'));

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
function arg(n, d) { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; }
function has(n) { return argv.indexOf('--' + n) >= 0; }
const DB = arg('db', 'Hospital_silent_local');
const OUT_DIR = path.resolve(arg('out-dir', path.join(os.homedir(), 'Downloads', 'sunarc')));
const GPU = arg('gpu', 'real');
// §CPE_CLIP scales the film's frame count by the window: the Hospital path is 1626 frames with the
// buildup off, so a 0.0032 span rounds to 5 → tNorm 0,.25,.5,.75,1. A run that comes back with N≠5
// is redone once with span = 5.2/N_full read off its own log.
let CLIP = arg('clip', '0.5:0.5032');
const PORT0 = +arg('port', 8571);
const REUSE = has('reuse');
const ONLY = arg('only', null);
const RUNS = [{ name: 'before', pinOff: true }, { name: 'after', pinOff: false }].filter(r => !ONLY || r.name === ONLY);

const TOOLS = fs.readFileSync(path.join(ROOT, 'viewer', 'tools.js'), 'utf8');
const EFFECTS = fs.readFileSync(path.join(ROOT, 'viewer', 'effects.js'), 'utf8');
// the shipped still-budget constants, READ from tools.js — never re-typed here
const stillBudget = +(TOOLS.match(/A\._nightMaxLightsStill\s*=\s*([0-9.]+)/) || [])[1];
const stillFloor = +(TOOLS.match(/A\._nightNearFadeFloorStill\s*=\s*([0-9.]+)/) || [])[1];
const stillPl = +(TOOLS.match(/A\._nightPLScaleStill\s*=\s*([0-9.]+)/) || [])[1];
const orderFixShipped = EFFECTS.indexOf('§NIGHT_STILL_LIGHTS_ORDER') > 0 &&
  EFFECTS.indexOf('    _applyPhotoStaging();\n    // §NIGHT_STILL_LIGHTS_ORDER') > 0;
fs.mkdirSync(OUT_DIR, { recursive: true });
const WLOG = path.join(OUT_DIR, 'witness_sun_arc_fill_pin.log');
fs.writeFileSync(WLOG, '');
function log(l) { console.log(l); fs.appendFileSync(WLOG, l + '\n'); }   // sync: process.exit must not lose the log
log('§SUN_ARC_FILL_WITNESS_ENV root=' + ROOT + ' db=' + DB + ' gpu=' + GPU + ' clip=' + CLIP + ' reuse=' + REUSE + ' outDir=' + OUT_DIR +
  ' stillBudget=' + stillBudget + ' stillFloor=' + stillFloor + ' stillPl=' + stillPl + ' orderFixShipped=' + orderFixShipped);

// ── bake driver: the SHIPPED CLI runner, one run per mode ────────────────────────────────────────
function bake(run, idx, attempt) {
  const out = path.join(OUT_DIR, 'sunarc_pin_' + run.name + '.mp4'), logf = out.replace(/\.mp4$/, '.log');
  const tapf = path.join(OUT_DIR, 'tap_pin_' + run.name + '.js'), prof = path.join(OUT_DIR, 'profile_' + run.name);
  const tapJson = out.replace(/\.mp4$/, '_tap.json');
  if (REUSE && !attempt && fs.existsSync(logf) && fs.existsSync(tapJson)) { log('§SUN_ARC_FILL_BAKE run=' + run.name + ' REUSED ' + logf); return { out, logf, tapJson }; }
  fs.writeFileSync(tapf, (run.pinOff ? 'window.__SUN_ARC_FILL_PIN_OFF = true;\n' : '') + fs.readFileSync(path.join(__dirname, 'tap_sun_arc_fill.js'), 'utf8'));
  fs.rmSync(prof, { recursive: true, force: true });          // fresh profile per run (the rule)
  const args = [path.join(ROOT, 'cli_silent_bake.js'), '--root', ROOT, '--db', DB, '--out', out, '--log', logf, '--profile', prof,
    '--gpu', GPU, '--clip', CLIP, '--no-buildup', '--no-label', '--no-reveal', '--day', 'off', '--tap', tapf,
    '--port', String(PORT0 + idx), '--timeout-min', '25', '--stall-min', '8'];
  log('§SUN_ARC_FILL_BAKE run=' + run.name + ' pinOff=' + run.pinOff + ' attempt=' + (attempt || 0) + ' cmd=node ' + args.join(' '));
  const t0 = Date.now();
  const r = spawnSync('node', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
  log('§SUN_ARC_FILL_BAKE run=' + run.name + ' exit=' + r.status + ' wallSec=' + ((Date.now() - t0) / 1000).toFixed(0) + ' log=' + logf);
  const clip = /§CPE_CLIP applied[^\n]*frames=(\d+)→(\d+)/.exec(fs.existsSync(logf) ? fs.readFileSync(logf, 'utf8') : '');
  if (clip && +clip[2] !== 5 && !attempt) {
    const span = 5.2 / +clip[1], m = CLIP.split(':').map(Number);
    CLIP = m[0] + ':' + (m[0] + span).toFixed(6);
    log('§SUN_ARC_FILL_BAKE run=' + run.name + ' clipFrames=' + clip[1] + '→' + clip[2] + ' ≠ 5 — re-baking once with --clip ' + CLIP);
    return bake(run, idx, 1);
  }
  return { out, logf, tapJson };
}

// ── read-back: the bake's own § lines + the tap rows ─────────────────────────────────────────────
const RX_PIN = /§SUN_ARC_FILL_PIN tNorm=([\d.]+) elevation=([\d.]+) ambient=([\d.]+) hemi=([\d.]+) plScale=([-\d.]+) budget=(\d+) nearFloor=([\d.]+) poolLit=(\d+) poolSum=([\d.]+) sun=([\d.]+) sunPos=([-\d.,]+) drift=(\S+)/;
const RX_STEP = /§SUN_ARC_STEP tNorm=([\d.]+) elevation=([\d.]+)/;
function analyse(run, files) {
  const text = fs.existsSync(files.logf) ? fs.readFileSync(files.logf, 'utf8') : '';
  const lines = text.split('\n');
  const steps = lines.map(l => RX_STEP.exec(l)).filter(Boolean).map(m => ({ tNorm: +m[1], elevation: +m[2] }));
  const pins = lines.map(l => RX_PIN.exec(l)).filter(Boolean).map(m => ({ tNorm: +m[1], elevation: +m[2], ambient: +m[3], hemi: +m[4], plScale: +m[5],
    budget: +m[6], nearFloor: +m[7], poolLit: +m[8], poolSum: +m[9], sunI: +m[10], sunPos: m[11], drift: m[12] }));
  const baseLines = lines.filter(l => l.includes('§SUN_ARC_FILL_BASE'));
  const base = /ambient=([\d.]+) hemi=([\d.]+) plScaleStaged=([-\d.]+) nightWasOn=(\w+)/.exec(baseLines[baseLines.length - 1] || '');
  const iRaised = lines.findIndex(l => l.includes('§NIGHT_STILL_LIGHTS raised'));
  const iFrame0 = lines.findIndex(l => /§MAXQ_FRAME i=0\//.test(l));
  const clip = /§CPE_CLIP applied[^\n]*frames=(\d+)→(\d+)/.exec(text);
  const probe = /§CLI_BAKE_FFPROBE codec=(\w+) (\d+)x(\d+) frames=(\d+)/.exec(text);
  const gl = /§CLI_BAKE_GL ([^\n]*)/.exec(text);
  const tap = fs.existsSync(files.tapJson) ? JSON.parse(fs.readFileSync(files.tapJson, 'utf8')) : { lines: [], rows: [] };
  (tap.lines || []).forEach(l => log('  [' + run.name + '] ' + l));
  log('§SUN_ARC_FILL_RUN run=' + run.name + ' pinOff=' + run.pinOff + ' stepLines=' + steps.length + ' pinLines=' + pins.length +
    ' clipFrames=' + (clip ? clip[1] + '→' + clip[2] : '?') + ' ffprobe=' + (probe ? probe[2] + 'x' + probe[3] + ' frames=' + probe[4] : 'none') +
    ' tapRows=' + (tap.rows || []).length + ' base=' + (base ? base[1] + '/' + base[2] + '/' + base[3] + ' nightWasOn=' + base[4] : '?') +
    ' stillLightsRaisedLine=' + iRaised + ' frame0Line=' + iFrame0 + ' raisedBeforeFrame0=' + (iRaised >= 0 && iFrame0 >= 0 && iRaised < iFrame0) +
    ' gl=' + (gl ? gl[1].slice(0, 90) : '?'));
  const rows = [];
  (tap.rows || []).forEach(t => {
    const st = steps[t.i], pn = pins.find(p => Math.abs(p.tNorm - (st ? st.tNorm : -1)) < 1e-6) || null;
    if (!st) { log('§SUN_ARC_FILL_FRAME run=' + run.name + ' i=' + t.i + ' MISSING §SUN_ARC_STEP line'); return; }
    rows.push({
      // elevation: the tap's exact A._sunArcElevationDeg (§SUN_ARC_STEP logs it to one decimal)
      run: run.name, pinOff: !!run.pinOff, i: t.i, tNorm: st.tNorm, elevation: t.elevation != null ? t.elevation : st.elevation,
      ambient: t.ambient, hemi: t.hemi, plScale: t.plScale, budget: t.budget, nearFloor: t.nearFloor, poolLit: t.poolLit, poolSum: t.poolSum,
      fixtures: t.fixtures, baseAmbient: base ? +base[1] : t.baseAmbient, baseHemi: base ? +base[2] : t.baseHemi, plStaged: t.plStaged,
      pinAmbient: pn ? pn.ambient : null, pinHemi: pn ? pn.hemi : null, pinPl: pn ? pn.plScale : null, pinBudget: pn ? pn.budget : null,
      pinPoolLit: pn ? pn.poolLit : null, pinSunI: pn ? pn.sunI : null, drift: pn ? pn.drift : (run.pinOff ? 'pin-off' : 'no-line'),
      sunI: t.sunI, sunPos: (t.sunPos || []).join(','), sunTgt: (t.sunTgt || []).join(','), shadowCam: (t.shadowCam || []).join(','),
      shadowMat: (t.shadowMat || []).join(','), shadowHash: t.shadowHash || null, shadowNote: t.shadowNote || '',
      cam: t.cam.join(','), planPose: t.planPose.join(','), raisedBeforeFrame0: iRaised >= 0 && iFrame0 >= 0 && iRaised < iFrame0
    });
  });
  return { run, rows, probe: probe ? +probe[4] : 0 };
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────
const results = RUNS.map((run, idx) => analyse(run, bake(run, idx)));
const rows = [].concat(...results.map(r => r.rows));
rows.forEach(r => log('§SUN_ARC_FILL_SAMPLE run=' + r.run + ' i=' + r.i + ' tNorm=' + r.tNorm.toFixed(3) + ' elevation=' + r.elevation.toFixed(2) +
  ' ambient=' + r.ambient + ' hemi=' + r.hemi + ' plScale=' + r.plScale + ' budget=' + r.budget + ' nearFloor=' + r.nearFloor + ' poolLit=' + r.poolLit +
  ' poolSum=' + r.poolSum + ' | baseline ambient=' + r.baseAmbient + ' hemi=' + r.baseHemi + ' plScale=' + stillPl + ' budget=' + stillBudget + ' floor=' + stillFloor +
  ' | sun=' + r.sunI + ' sunPos=' + r.sunPos + ' shadowMap=' + (r.shadowHash || 'unreadable') + ' drift=' + r.drift));

const before = rows.filter(r => r.run === 'before'), after = rows.filter(r => r.run === 'after');
const byI = (set, i) => set.find(r => r.i === i);
for (let i = 0; i < 5; i++) {
  const a = byI(before, i), b = byI(after, i); if (!a || !b) continue;
  const same = (x, y) => x === y ? 'same' : 'DIFF';
  log('§SUN_ARC_FILL_SHADOW_DIFF i=' + i + ' tNorm=' + a.tNorm.toFixed(2) + ' sunI=' + same(a.sunI, b.sunI) + '(' + a.sunI + ')' +
    ' sunPos=' + same(a.sunPos, b.sunPos) + ' sunTgt=' + same(a.sunTgt, b.sunTgt) + ' shadowCam=' + same(a.shadowCam, b.shadowCam) +
    ' shadowMat=' + same(a.shadowMat, b.shadowMat) + ' shadowMapBytes=' + (a.shadowHash && b.shadowHash ? same(a.shadowHash, b.shadowHash) + '(' + a.shadowHash + ')' : 'unreadable(' + a.shadowNote + ')') +
    ' pose=' + same(a.cam, b.cam) + ' | fill before→after: ambient ' + a.ambient + '→' + b.ambient + ' hemi ' + a.hemi + '→' + b.hemi +
    ' plScale ' + a.plScale + '→' + b.plScale + ' budget ' + a.budget + '→' + b.budget + ' poolLit ' + a.poolLit + '→' + b.poolLit);
}
const corrections = after.filter(r => r.drift && r.drift !== 'none' && r.drift !== 'no-line');
log('§SUN_ARC_FILL_PIN_EFFECT afterFrames=' + after.length + ' pinCorrections=' + corrections.length +
  (corrections.length ? ' [' + corrections.map(r => 'i=' + r.i + ':' + r.drift).join(' ') + ']' : ' — the ordering fix alone already holds the baseline; the pin is a standing guard (NO-OP this run)'));

const eq = (a, b) => Math.abs(a - b) < 1e-9;
// Lit count: tools.js _nightUpdateLights never TRUNCATES the in-frustum set during a still (it tops a
// short set UP to the budget, §BAKE_INTERIOR_TOPUP; a wide exterior pose can light all 200 pool slots),
// so the baseline for the count is "never below the still budget" — and identical BEFORE vs AFTER.
const pinned = r => eq(r.ambient, r.baseAmbient) && eq(r.hemi, r.baseHemi) && eq(r.plScale, stillPl) && r.budget === stillBudget &&
  eq(r.nearFloor, stillFloor) && r.poolLit >= Math.min(stillBudget, r.fixtures);
const schema = {
  type: 'object',
  required: ['run', 'pinOff', 'i', 'tNorm', 'elevation', 'ambient', 'hemi', 'plScale', 'budget', 'nearFloor', 'poolLit', 'fixtures', 'baseAmbient', 'baseHemi', 'sunI', 'cam', 'drift'],
  properties: { run: { enum: ['before', 'after'] }, pinOff: { type: 'boolean' }, i: { type: 'integer', minimum: 0, maximum: 4 }, tNorm: { type: 'number' },
    elevation: { type: 'number' }, ambient: { type: 'number' }, hemi: { type: 'number' }, plScale: { type: 'number' }, budget: { type: 'integer' },
    nearFloor: { type: 'number' }, poolLit: { type: 'integer' }, fixtures: { type: 'integer' }, baseAmbient: { type: 'number' }, baseHemi: { type: 'number' },
    sunI: { type: 'number' }, cam: { type: 'string' }, drift: { type: 'string' } }
};
const w = Witness('SUN_ARC_FILL')
  .population(() => rows)
  .schema(schema)
  // G4a — five samples per run, at the five tNorms, on the shipped arc
  .invariant('five-samples-per-run-on-the-arc', rs => ['before', 'after'].every(n => [0, 1, 2, 3, 4].every(i => {
    const r = rs.find(x => x.run === n && x.i === i); return r && eq(r.tNorm, i / 4) && Math.abs(r.elevation - (55 + (6 - 55) * i / 4)) < 0.01; })))
  // G4b — the same frames: identical plan pose + camera BEFORE vs AFTER, per sample
  .invariant('same-frames-before-vs-after', rs => [0, 1, 2, 3, 4].every(i => {
    const a = rs.find(x => x.run === 'before' && x.i === i), b = rs.find(x => x.run === 'after' && x.i === i);
    return a && b && a.cam === b.cam && a.planPose === b.planPose; }))
  // G1 — THE claim: with the pin, every sample holds the Alt+S baseline EXACTLY
  .invariant('after-pinned-to-alt-s-baseline-every-sample', rs => rs.filter(r => r.run === 'after').length === 5 && rs.filter(r => r.run === 'after').every(pinned))
  // G1b — the pin never changes WHICH/HOW MANY fixtures light: lit count identical BEFORE vs AFTER
  .invariant('lit-count-identical-before-vs-after', rs => [0, 1, 2, 3, 4].every(i => {
    const a = rs.find(x => x.run === 'before' && x.i === i), b = rs.find(x => x.run === 'after' && x.i === i);
    return a && b && a.poolLit === b.poolLit && a.poolSum === b.poolSum; }))
  // G2a — the frame-0 ordering fix stands without the pin: BEFORE frame 0 carries the still budget
  // and near-fade floor (the two values the old ordering left at the navigation 30 / 0.3)
  .invariant('frame0-at-still-budget-without-pin', rs => { const r = rs.find(x => x.run === 'before' && x.i === 0); return r && r.budget === stillBudget && r.poolLit >= Math.min(stillBudget, r.fixtures) && eq(r.nearFloor, stillFloor); })
  // G2b — and in the log the raise precedes frame 0, both runs
  .invariant('still-lights-raised-before-frame0', rs => rs.every(r => r.raisedBeforeFrame0))
  // G3 — sun + shadow byte-identical BEFORE vs AFTER at every sample
  .invariant('sun-and-shadow-identical-before-vs-after', rs => [0, 1, 2, 3, 4].every(i => {
    const a = rs.find(x => x.run === 'before' && x.i === i), b = rs.find(x => x.run === 'after' && x.i === i);
    return a && b && a.sunI === b.sunI && a.sunPos === b.sunPos && a.sunTgt === b.sunTgt && a.shadowCam === b.shadowCam &&
      a.shadowMat === b.shadowMat && !!a.shadowHash && !!b.shadowHash && a.shadowHash === b.shadowHash; }))
  // G5 — what the frame was CAPTURED with equals what the pin's § line says it set
  .invariant('capture-state-equals-pin-line', rs => rs.filter(r => r.run === 'after').every(r => r.pinAmbient != null &&
    Math.abs(r.pinAmbient - r.ambient) < 1e-4 && Math.abs(r.pinHemi - r.hemi) < 1e-4 && Math.abs(r.pinPl - r.plScale) < 1e-4 &&
    r.pinBudget === r.budget && r.pinPoolLit === r.poolLit && Math.abs(r.pinSunI - r.sunI) < 1e-4))
  // RED — a frame that slipped below the baseline (ambient halved, budget/floor back at nav, fewer lights)
  // AND a touched sun: each must be caught
  .redControl(rs => rs.map(r => (r.run === 'after' && r.i === 0)
    ? Object.assign({}, r, { ambient: r.ambient * 0.5, budget: 30, nearFloor: 0.3, poolLit: 30, sunI: r.sunI + 0.5 })
    : r));

const res = w.run();
const verdict = rows.length !== 10 ? 'INCONCLUSIVE — ' + rows.length + ' of 10 samples read back (' + results.map(r => r.run.name + ':' + r.rows.length + ' frames=' + r.probe).join(' ') + ')'
  : res.fail === 0 ? 'PASS' : 'FAIL';
log('§WITNESS_SUN_ARC_FILL_VERDICT ' + verdict + ' pinCorrections=' + corrections.length + (corrections.length ? '' : ' (pin is a NO-OP guard on this run — the ordering fix holds the baseline)') +
  ' orderFixShipped=' + orderFixShipped + ' rows=' + rows.length + ' pass=' + res.pass + ' fail=' + res.fail + ' log=' + WLOG);
process.exit(verdict === 'PASS' ? 0 : 1);
