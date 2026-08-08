// WITNESS — §CPE_WALK_WEBXR_VR (prompts/CPE_WALK_WEBXR_VR.md). This is a STOPGAP flag-plant, not a
// finished feature — see that file's own "Intent" section. There is no headset in this
// environment and navigator.xr session state cannot be faked from plain JS (same constraint the
// gamepad witness documents for navigator.getGamepads()), so this witness proves only what CAN be
// proven without hardware: feature-detection resolves cleanly, and the two intentional stub
// functions (_xrControllerMap, _xrReadWorldPose) return exactly what the spec's stub boundary
// requires. Session lifecycle (sessionstart/sessionend/_xrTick) is NOT witnessed here — it needs a
// real or emulated XR session, out of scope for this pass (see report).
//
// ISSUE EACH GATE PROVES OR DISPROVES:
//   G-XR-LOAD         cpe_xr.js loads cleanly and exposes the documented window.CpeXr surface.
//   G-XR-UNSUPPORTED  isSupported() resolves false (without throwing) when navigator.xr is absent
//                     — the expected, correct result in this environment (no headset).
//   G-XR-SUPPORTED    isSupported() resolves true when a fake navigator.xr.isSessionSupported
//                     resolves true — proves the function actually forwards the real API's answer
//                     rather than being hardcoded false.
//   G-XR-CONTROLLER-STUB  _xrControllerMap() returns the documented zero/false-shaped no-op object
//                     (not a guessed mapping) and logs §CPE_XR_CONTROLLER_STUB exactly ONCE across
//                     repeated calls (per-session warn-once, not a per-frame log flood).
//   G-XR-WORLDPOSE-STUB   _xrReadWorldPose() returns exactly null — confirms it is NOT wired to a
//                     guessed rig/camera object (spec §VERIFY 3's sharpest-named risk).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC_PATH = path.join(__dirname, 'viewer', 'cpe_xr.js');
const src = fs.readFileSync(SRC_PATH, 'utf8');

function makeSandbox(xrStub) {
  const logs = [];
  const sandbox = {
    window: {},
    navigator: { xr: xrStub },
    console: { log: function(s) { logs.push(String(s)); }, warn: function(s) { logs.push('WARN ' + s); } },
    Promise: Promise,
  };
  sandbox.window = sandbox;   // cpe_xr.js reads bare `window` — self-reference, same pattern as the gamepad witness
  sandbox.window.APP = {};    // A() returns window.APP; not exercised by the stub gates below
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: SRC_PATH });
  return { CpeXr: sandbox.window.CpeXr, logs };
}

const checks = [];
const P = (n, ok, d) => checks.push({ n, ok, d });

(async () => {
  // G-XR-LOAD + G-XR-UNSUPPORTED — navigator.xr absent entirely (typical non-VR browser)
  const noXr = makeSandbox(undefined);
  P('G-XR-LOAD module loaded, exposes documented window.CpeXr surface',
    !!noXr.CpeXr && typeof noXr.CpeXr.isSupported === 'function' && typeof noXr.CpeXr.enter === 'function' &&
    typeof noXr.CpeXr._xrTick === 'function' && typeof noXr.CpeXr._xrControllerMap === 'function' &&
    typeof noXr.CpeXr._xrReadWorldPose === 'function' &&
    noXr.logs.some(l => l.indexOf('§CPE_XR_MODULE_LOADED') === 0),
    `CpeXr=${!!noXr.CpeXr} logs=[${noXr.logs.join(' | ')}]`);

  let unsupportedResolved, unsupportedThrew = false;
  try { unsupportedResolved = await noXr.CpeXr.isSupported(); } catch (e) { unsupportedThrew = true; }
  P('G-XR-UNSUPPORTED isSupported() resolves false (no throw) when navigator.xr is absent — expected in this environment',
    unsupportedResolved === false && !unsupportedThrew,
    `resolved=${unsupportedResolved} threw=${unsupportedThrew}`);

  // G-XR-SUPPORTED — fake navigator.xr.isSessionSupported resolving true, proves isSupported()
  // forwards the real answer rather than being hardcoded.
  const fakeXr = { isSessionSupported: function(mode) { return Promise.resolve(mode === 'immersive-vr'); } };
  const withXr = makeSandbox(fakeXr);
  const supportedResolved = await withXr.CpeXr.isSupported();
  P('G-XR-SUPPORTED isSupported() resolves true when a fake navigator.xr reports immersive-vr supported',
    supportedResolved === true, `resolved=${supportedResolved}`);

  // G-XR-CONTROLLER-STUB
  const s1 = withXr.CpeXr._xrControllerMap({}, 0.016);
  const s2 = withXr.CpeXr._xrControllerMap({}, 0.016);   // second call — warn must NOT repeat
  const warnCount = withXr.logs.filter(l => l.indexOf('§CPE_XR_CONTROLLER_STUB') !== -1).length;
  const zeroShaped = s1.moveRight === 0 && s1.moveFwd === 0 && s1.yawDelta === 0 && s1.pitchDelta === 0 &&
    s1.snap === false && s1.stop === false;
  P('G-XR-CONTROLLER-STUB _xrControllerMap returns zero/false-shaped no-op, warns exactly once across 2 calls',
    zeroShaped && JSON.stringify(s1) === JSON.stringify(s2) && warnCount === 1,
    `s1=${JSON.stringify(s1)} s2=${JSON.stringify(s2)} warnCount=${warnCount}`);

  // G-XR-WORLDPOSE-STUB
  const pose = withXr.CpeXr._xrReadWorldPose();
  P('G-XR-WORLDPOSE-STUB _xrReadWorldPose() returns exactly null (not wired to a guessed rig/camera object)',
    pose === null, `pose=${JSON.stringify(pose)}`);

  console.log(`\n${'='.repeat(78)}\n§CPE_WALK_WEBXR_VR stub witness — no headset in this environment, session lifecycle NOT covered here\n${'='.repeat(78)}`);
  let allPass = true;
  checks.forEach(c => { if (!c.ok) allPass = false; console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`); });
  console.log(`\n${allPass ? checks.length + '/' + checks.length + ' PASS — WITNESS PASS' : 'WITNESS FAIL'}`);
  process.exit(allPass ? 0 : 1);
})();
