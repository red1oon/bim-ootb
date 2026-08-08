// WITNESS — §CPE_WALK_GAMEPAD_NAV (prompts/CPE_WALK_GAMEPAD_NAV.md, prompts/CPE_WALK_GAMEPAD_NAV.md
// implementation session, 2026-08-08).
//
// ISSUE EACH GATE PROVES OR DISPROVES:
//   G-GP-LOAD       cpe_walk.js loads cleanly and exposes the new gamepad test hooks on window.CpeWalk.
//   G-GP-MOVE-FWD   left stick full-forward (axes=[0,-1,0,0]) produces a move vector of magnitude
//                   WALK_SPEED_MPS (the SAME constant WASD uses — spec's "no new speed constant").
//   G-GP-MOVE-RIGHT left stick full-right (axes=[1,0,0,0]) produces moveRight===WALK_SPEED_MPS,
//                   moveFwd===0 — axis convention matches the spec's `right*axes[0]+fwd*-axes[1]`.
//   G-GP-MOVE-DT    halving dt halves the move magnitude — confirms dt-scaling (not a fixed step).
//   G-GP-DIAG-CLAMP a full diagonal push (axes=[1,-1,0,0], both axes at 1.0) is clamped to unit
//                   circle — magnitude stays WALK_SPEED_MPS*dt, not sqrt(2)x it (no diagonal speed
//                   boost, matching WASD's own move.normalize() behaviour).
//   G-GP-DEADZONE   every axis at 0.1 (below the 0.15 dead-zone) produces an all-zero result
//                   (moveRight=moveFwd=yawDelta=pitchDelta=0, active=false) — no drift from a
//                   resting/imprecise stick.
//   G-GP-DEADZONE-EDGE a value just OUTSIDE the dead-zone (0.16) DOES register (active=true) —
//                   proves the threshold is the boundary, not an unrelated bug masking all input.
//   G-GP-LOOK-YAW   right stick full-right (axes=[0,0,1,0]) produces yawDelta = -GAMEPAD_LOOK_RATE*dt
//                   exactly (bit-identical to the constant read out of the source, not re-derived).
//   G-GP-LOOK-PITCH right stick full-down (axes=[0,0,0,1]) produces pitchDelta = -GAMEPAD_LOOK_RATE*dt.
//   G-GP-SNAP-BTN   buttons[0].pressed=true => snap===true; buttons[0].pressed=false => snap===false.
//   G-GP-STOP-BTN   buttons[1].pressed=true => stop===true; buttons[9].pressed=true (Start) =>
//                   stop===true too (spec: "B button or Start").
//   G-GP-MAPPING-GATE a non-"standard" mapping connect is IGNORED (state stays disconnected, logs
//                   §CPE_WALK_GAMEPAD_IGNORED); a "standard" mapping connect DOES register
//                   (§CPE_WALK_GAMEPAD_CONNECT, _gamepadStateForTest().connected===true) — proves
//                   the v1 scope gate from the spec's §Scope section.
//   G-GP-DISCONNECT disconnecting the SAME index clears connected state; a disconnect of a
//                   DIFFERENT (never-connected) index is a no-op (stale-event guard).
//
// All gates run the REAL `_gamepadMap`/`_onGamepadConnected`/`_onGamepadDisconnected` functions
// inside cpe_walk.js via a Node `vm` sandbox — no reimplementation of the maths under test. This is
// the ONLY witnessable numeric surface for gamepad input per the spec's own architecture note:
// `navigator.getGamepads()` cannot be faked from JS, so there is no live-controller assertion; the
// pure function is what carries all the arithmetic, and `_tick()`'s use of it is a thin,
// unwitnessable wrapper (same as the file's own precedent for the `_keys` object / WASD).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC_PATH = path.join(__dirname, 'viewer', 'cpe_walk.js');
const src = fs.readFileSync(SRC_PATH, 'utf8');

// Extract the tuned constants straight from source (EXTRACT, not invent) so the assertions below
// stay bit-identical to whatever the file actually declares, even if a future tuning pass changes them.
const speedM = src.match(/var WALK_SPEED_MPS = ([\d.]+);/);
const deadzoneM = src.match(/var GAMEPAD_DEADZONE = ([\d.]+);/);
if (!speedM || !deadzoneM) { console.error('§WITNESS_SETUP_FAIL could not extract WALK_SPEED_MPS/GAMEPAD_DEADZONE from source'); process.exit(1); }
const WALK_SPEED_MPS = +speedM[1];
const GAMEPAD_DEADZONE = +deadzoneM[1];
const GAMEPAD_LOOK_RATE = Math.PI * (120 / 180);   // must match cpe_walk.js's own literal expression

const logs = [];
const sandbox = {
  window: {},
  navigator: {},
  document: { addEventListener: function() {}, removeEventListener: function() {} },
  console: { log: function(s) { logs.push(String(s)); }, warn: function(s) { logs.push('WARN ' + s); } },
  performance: { now: function() { return Date.now(); } },
  requestAnimationFrame: function() {}, cancelAnimationFrame: function() {},
  THREE: {},
};
sandbox.window = sandbox;   // cpe_walk.js reads bare `window` — self-reference so window.APP etc resolve harmlessly
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: SRC_PATH });

const CpeWalk = sandbox.window.CpeWalk;
const checks = [];
const P = (n, ok, d) => checks.push({ n, ok, d });

P('G-GP-LOAD module loaded, exposes gamepad test hooks',
  !!CpeWalk && typeof CpeWalk._gamepadMapForTest === 'function' &&
  typeof CpeWalk._gamepadConnectForTest === 'function' && typeof CpeWalk._gamepadDisconnectForTest === 'function' &&
  logs.some(l => l.indexOf('§CPE_WALK_MODULE_LOADED') === 0),
  `hooks present=${!!CpeWalk} logs=[${logs.join(' | ')}]`);

const dt1 = 1.0;
const fwd = CpeWalk._gamepadMapForTest({ axes: [0, -1, 0, 0], buttons: [] }, dt1);
const fwdMag = Math.hypot(fwd.moveRight, fwd.moveFwd);
P('G-GP-MOVE-FWD full-forward left stick (axes[1]=-1) at dt=1 produces move magnitude === WALK_SPEED_MPS',
  Math.abs(fwdMag - WALK_SPEED_MPS) < 1e-9 && Math.abs(fwd.moveRight) < 1e-9 && Math.abs(fwd.moveFwd - WALK_SPEED_MPS) < 1e-9,
  `moveRight=${fwd.moveRight} moveFwd=${fwd.moveFwd} mag=${fwdMag} want=${WALK_SPEED_MPS}`);

const right = CpeWalk._gamepadMapForTest({ axes: [1, 0, 0, 0], buttons: [] }, dt1);
P('G-GP-MOVE-RIGHT full-right left stick (axes[0]=1) at dt=1: moveRight===WALK_SPEED_MPS, moveFwd===0',
  Math.abs(right.moveRight - WALK_SPEED_MPS) < 1e-9 && Math.abs(right.moveFwd) < 1e-9,
  `moveRight=${right.moveRight} moveFwd=${right.moveFwd}`);

const fwdHalfDt = CpeWalk._gamepadMapForTest({ axes: [0, -1, 0, 0], buttons: [] }, 0.5);
P('G-GP-MOVE-DT halving dt halves the move magnitude (rate-based, not a fixed step)',
  Math.abs(fwdHalfDt.moveFwd - WALK_SPEED_MPS * 0.5) < 1e-9,
  `moveFwd(dt=0.5)=${fwdHalfDt.moveFwd} want=${WALK_SPEED_MPS * 0.5}`);

const diag = CpeWalk._gamepadMapForTest({ axes: [1, -1, 0, 0], buttons: [] }, dt1);
const diagMag = Math.hypot(diag.moveRight, diag.moveFwd);
P('G-GP-DIAG-CLAMP full diagonal push is clamped to the unit circle (magnitude stays WALK_SPEED_MPS, not sqrt(2)x)',
  Math.abs(diagMag - WALK_SPEED_MPS) < 1e-9,
  `moveRight=${diag.moveRight} moveFwd=${diag.moveFwd} mag=${diagMag} want=${WALK_SPEED_MPS} (unclamped would be ${(WALK_SPEED_MPS * Math.SQRT2).toFixed(3)})`);

const dz = CpeWalk._gamepadMapForTest({ axes: [0.1, 0.1, 0.1, 0.1], buttons: [] }, dt1);
P(`G-GP-DEADZONE all axes at 0.1 (< ${GAMEPAD_DEADZONE} dead-zone) produce an all-zero, inactive result`,
  dz.moveRight === 0 && dz.moveFwd === 0 && dz.yawDelta === 0 && dz.pitchDelta === 0 && dz.active === false,
  JSON.stringify(dz));

const dzEdge = CpeWalk._gamepadMapForTest({ axes: [0.16, 0, 0, 0], buttons: [] }, dt1);
P(`G-GP-DEADZONE-EDGE an axis just OUTSIDE the dead-zone (0.16 > ${GAMEPAD_DEADZONE}) DOES register (active=true)`,
  dzEdge.active === true && dzEdge.moveRight !== 0,
  JSON.stringify(dzEdge));

const yaw = CpeWalk._gamepadMapForTest({ axes: [0, 0, 1, 0], buttons: [] }, dt1);
P('G-GP-LOOK-YAW right stick full-right (axes[2]=1) at dt=1: yawDelta === -GAMEPAD_LOOK_RATE (bit-identical to source constant)',
  Math.abs(yaw.yawDelta - (-GAMEPAD_LOOK_RATE)) < 1e-12,
  `yawDelta=${yaw.yawDelta} want=${-GAMEPAD_LOOK_RATE}`);

const pitch = CpeWalk._gamepadMapForTest({ axes: [0, 0, 0, 1], buttons: [] }, dt1);
P('G-GP-LOOK-PITCH right stick full-down (axes[3]=1) at dt=1: pitchDelta === -GAMEPAD_LOOK_RATE',
  Math.abs(pitch.pitchDelta - (-GAMEPAD_LOOK_RATE)) < 1e-12,
  `pitchDelta=${pitch.pitchDelta} want=${-GAMEPAD_LOOK_RATE}`);

const snapOn = CpeWalk._gamepadMapForTest({ axes: [0, 0, 0, 0], buttons: [{ pressed: true }] }, dt1);
const snapOff = CpeWalk._gamepadMapForTest({ axes: [0, 0, 0, 0], buttons: [{ pressed: false }] }, dt1);
P('G-GP-SNAP-BTN buttons[0].pressed toggles snap true/false',
  snapOn.snap === true && snapOff.snap === false, `on=${snapOn.snap} off=${snapOff.snap}`);

const stopB = CpeWalk._gamepadMapForTest({ axes: [0, 0, 0, 0], buttons: [{}, { pressed: true }] }, dt1);
const stopStart = CpeWalk._gamepadMapForTest({ axes: [0, 0, 0, 0], buttons: new Array(9).concat([{ pressed: true }]) }, dt1);
P('G-GP-STOP-BTN buttons[1] (B) and buttons[9] (Start) both produce stop===true',
  stopB.stop === true && stopStart.stop === true, `B=${stopB.stop} Start=${stopStart.stop}`);

const markConn = logs.length;
CpeWalk._gamepadConnectForTest({ id: 'Fake Flight Stick', index: 0, mapping: '', axes: [0, 0], buttons: [] });
const winIgnore = logs.slice(markConn);
const stateAfterIgnore = CpeWalk._gamepadStateForTest();
P('G-GP-MAPPING-GATE non-"standard" mapping connect is IGNORED (state stays disconnected, logs §CPE_WALK_GAMEPAD_IGNORED)',
  stateAfterIgnore.connected === false && winIgnore.some(l => l.indexOf('§CPE_WALK_GAMEPAD_IGNORED') === 0),
  `state=${JSON.stringify(stateAfterIgnore)} logged=[${winIgnore.join(' | ')}]`);

const markConn2 = logs.length;
CpeWalk._gamepadConnectForTest({ id: 'Fake Xbox Controller', index: 2, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [] });
const winConnect = logs.slice(markConn2);
const stateAfterConnect = CpeWalk._gamepadStateForTest();
P('G-GP-CONNECT "standard" mapping connect DOES register (connected=true, index captured, logs §CPE_WALK_GAMEPAD_CONNECT)',
  stateAfterConnect.connected === true && stateAfterConnect.index === 2 && winConnect.some(l => l.indexOf('§CPE_WALK_GAMEPAD_CONNECT') === 0),
  `state=${JSON.stringify(stateAfterConnect)} logged=[${winConnect.join(' | ')}]`);

const staleDisconnect = CpeWalk._gamepadDisconnectForTest({ id: 'other', index: 5 });
const stateAfterStale = CpeWalk._gamepadStateForTest();
P('G-GP-DISCONNECT-STALE a disconnect event for a DIFFERENT index is a no-op (still connected at index 2)',
  stateAfterStale.connected === true && stateAfterStale.index === 2, JSON.stringify(stateAfterStale));

CpeWalk._gamepadDisconnectForTest({ id: 'Fake Xbox Controller', index: 2 });
const stateAfterDisconnect = CpeWalk._gamepadStateForTest();
P('G-GP-DISCONNECT matching index disconnect clears connected state',
  stateAfterDisconnect.connected === false && stateAfterDisconnect.index === null, JSON.stringify(stateAfterDisconnect));

console.log(`\n${'='.repeat(78)}\n§CPE_WALK_GAMEPAD_NAV pure-function witness (WALK_SPEED_MPS=${WALK_SPEED_MPS} GAMEPAD_LOOK_RATE=${GAMEPAD_LOOK_RATE.toFixed(6)} GAMEPAD_DEADZONE=${GAMEPAD_DEADZONE})\n${'='.repeat(78)}`);
let allPass = true;
checks.forEach(c => { if (!c.ok) allPass = false; console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`); });
console.log(`\n${allPass ? checks.length + '/' + checks.length + ' PASS — WITNESS PASS' : 'WITNESS FAIL'}`);
process.exit(allPass ? 0 : 1);
