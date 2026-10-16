#!/usr/bin/env node
// witness_dlod_vf_camguard.js — §DLOD_VF_CAMGUARD (2026-08-05). Cross-session finding, root-caused
// independently in both 4D_SCHEDULE_PERFECTION.md (this session) and CINEMA_PATH_EDITOR.md's own
// SESSION HANDOFF (concurrent cinema session): Time Machine's buildup-visibility DLOD gate
// (_dlodInView) was hardcoded to the MAIN camera even while CPE's POV panel scrubs its own `vfCam`
// independently. Proves the extracted `_dlodResolveCamera(app)` picks the POV camera while CPE's
// viewfinder is genuinely on, and falls back to the main camera in every other case (viewfinder
// off, CPE module not loaded at all, or loaded with no cinemaPathEditor exposed) — sliced by
// balanced braces from the real shipped function, never reimplemented.
//
// §DLOD_VF_CAMGUARD_SIG (2026-08-05, follow-on): the resolver fix above was a real fix but left a
// gap — _dlodCamMoved (the "did the camera move, force a full DLOD pass" edge-detector) still hard-
// coded app.camera in _giHoldCamSig, so during a POV-only scrub/play (main parked, §CPE_SCRUB_
// POV_ONLY) it never saw vfCam moving and could let the incremental-delta path skip re-evaluating
// visibility for geometry entering/leaving vfCam's own moving frustum — stale buildup in the POV
// inset. Cases 5-7 prove _giHoldCamSig now takes an explicit camera override (main-camera default
// unchanged, so the two pre-existing GI hold-converge call sites are untouched) and that the DLOD
// call site inside renderAtTime passes the SAME resolved camera the frustum was built from.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

function sliceFn(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');
const sliced = sliceFn(tmSrc, '_dlodResolveCamera');

function run(windowObj) {
  const sandbox = { console: console, window: windowObj };
  vm.createContext(sandbox);
  vm.runInContext(sliced + '\nglobalThis.__resolve = _dlodResolveCamera;', sandbox);
  return sandbox.__resolve;
}

const mainCam = { position: { x: 0, y: 0, z: 0 }, tag: 'main' };
const povCam = { position: { x: 9, y: 9, z: 9 }, tag: 'pov' };
const app = { camera: mainCam };

// ── Case 1: no window.APP at all (module loaded outside a browser / CPE not loaded) — main camera ──
{
  const resolve = run({});
  const r = resolve(app);
  assert(r === mainCam, 'no window.APP: falls back to the main camera');
}

// ── Case 2: window.APP exists but no cinemaPathEditor (CPE module never opened) — main camera ──
{
  const resolve = run({ APP: {} });
  const r = resolve(app);
  assert(r === mainCam, 'no cinemaPathEditor on window.APP: falls back to the main camera');
}

// ── Case 3: cinemaPathEditor exists, viewfinder OFF (activePOVCamera returns null) — main camera ──
{
  const resolve = run({ APP: { cinemaPathEditor: { activePOVCamera: function () { return null; } } } });
  const r = resolve(app);
  assert(r === mainCam, 'viewfinder off (activePOVCamera returns null): falls back to the main camera');
}

// ── Case 4: viewfinder ON — the REAL bug case. Must return the POV camera, not main. ──
{
  const resolve = run({ APP: { cinemaPathEditor: { activePOVCamera: function () { return povCam; } } } });
  const r = resolve(app);
  assert(r === povCam, 'viewfinder on: resolves to the POV camera, not the parked main camera');
  assert(r !== mainCam, 'RED CONTROL: without this fix, resolve(app) === mainCam always — proves the branch is live');
}

// ── Case 5: _giHoldCamSig(app) with NO override — byte-identical to before, reads app.camera ──
{
  const sliced = sliceFn(tmSrc, '_giHoldCamSig');
  const sandbox = { console: console };
  vm.createContext(sandbox);
  vm.runInContext(sliced + '\nglobalThis.__sig = _giHoldCamSig;', sandbox);
  const sig = sandbox.__sig;
  const mc5 = { position: { x: 1, y: 2, z: 3 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
  const mainOnly = { camera: mc5 };
  const r = sig(mainOnly);
  const expected = '1.0000,2.0000,3.0000,';
  assert(typeof r === 'string' && r.indexOf(expected) === 0, 'no override: signature is built from app.camera (GI call sites unaffected) got=' + r);
}

// ── Case 6: _giHoldCamSig(app, cam) WITH an explicit camera — signature reflects THAT camera, ──
// not app.camera, and a signature built from vfCam differs from one built from main.
{
  const sliced = sliceFn(tmSrc, '_giHoldCamSig');
  const sandbox = { console: console };
  vm.createContext(sandbox);
  vm.runInContext(sliced + '\nglobalThis.__sig = _giHoldCamSig;', sandbox);
  const sig = sandbox.__sig;
  const mainQ = { x: 0, y: 0, z: 0, w: 1 };
  const povQ = { x: 0.1, y: 0.2, z: 0.3, w: 0.9 };
  const mc = { position: { x: 0, y: 0, z: 0 }, quaternion: mainQ };
  const pc = { position: { x: 9, y: 9, z: 9 }, quaternion: povQ };
  const app2 = { camera: mc };
  const sigMain = sig(app2);
  const sigPov = sig(app2, pc);
  assert(sigMain !== sigPov, 'explicit cam override: vfCam signature differs from main-camera signature');
  assert(sigPov.indexOf('9.0000,9.0000,9.0000,') === 0, 'explicit cam override: signature is built from the passed camera, not app.camera got=' + sigPov);
}

// ── Case 7: static — the renderAtTime call site passes the resolved active camera, not bare app ──
// (the real bug: main parked + vfCam moving during a POV scrub was invisible to the OLD call).
{
  const callSiteRe = /_dlodCamSigNow\s*=\s*_giHoldCamSig\(app,\s*_dlodActiveCam\)/;
  assert(callSiteRe.test(tmSrc), 'renderAtTime\'s _dlodCamMoved edge-detector calls _giHoldCamSig(app, _dlodActiveCam), not _giHoldCamSig(app) alone');
}

// ── Case 8: §DLOD_VF_MATRIX_STALE (2026-08-05, follow-on) — static: renderAtTime must force
// _dlodActiveCam.updateMatrixWorld() BEFORE reading matrixWorldInverse for the frustum. renderAtTime
// runs off Time Machine's OWN setTimeout ticker, never synchronized with the rAF loop that normally
// refreshes a camera's matrix via renderer.render() — app.camera gets refreshed every rAF frame
// regardless, but vfCam ONLY via cinema_path_editor.js's _vfRender(), itself gated behind the same
// rAF loop. Without the explicit update, a POV rehearsal can build the DLOD frustum from a stale
// vfCam pose one or more _applyVFPose() moves behind — user-reported as the inset "ends up looking
// at nothing" mid-rehearsal.
{
  const psmIdx = tmSrc.indexOf('_dlodPSM.multiplyMatrices(_dlodActiveCam.projectionMatrix');
  const resolveIdx = tmSrc.indexOf('var _dlodActiveCam = _dlodResolveCamera(app);');
  const updateIdx = tmSrc.indexOf('_dlodActiveCam.updateMatrixWorld();');
  assert(resolveIdx > 0 && updateIdx > resolveIdx && psmIdx > updateIdx,
    '_dlodActiveCam.updateMatrixWorld() is called after resolving the camera and before the PSM/frustum build ' +
    `(resolveIdx=${resolveIdx} updateIdx=${updateIdx} psmIdx=${psmIdx})`);
}

console.log('\n§DLOD_VF_CAMGUARD SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
