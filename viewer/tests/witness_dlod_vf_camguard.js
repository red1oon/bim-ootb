#!/usr/bin/env node
// witness_dlod_vf_camguard.js — §DLOD_VF_CAMGUARD (2026-08-05). Cross-session finding, root-caused
// independently in both 4D_SCHEDULE_PERFECTION.md (this session) and CINEMA_PATH_EDITOR.md's own
// SESSION HANDOFF (concurrent cinema session): Time Machine's buildup-visibility DLOD gate
// (_dlodInView) was hardcoded to the MAIN camera even while CPE's POV panel scrubs its own `vfCam`
// independently. Proves the extracted `_dlodResolveCamera(app)` picks the POV camera while CPE's
// viewfinder is genuinely on, and falls back to the main camera in every other case (viewfinder
// off, CPE module not loaded at all, or loaded with no cinemaPathEditor exposed) — sliced by
// balanced braces from the real shipped function, never reimplemented.
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

console.log('\n§DLOD_VF_CAMGUARD SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
