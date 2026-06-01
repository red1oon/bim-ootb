#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// S208 — Walk orientation math test
//
// KNOWN FACTS (W3C spec + Three.js source + Chrome docs):
//   - e.alpha: 0-360, increases CCW from above. Turn RIGHT → alpha DECREASES.
//   - Same on Android Chrome AND iOS Safari.
//   - Three.js DeviceOrientationControls uses e.alpha directly, no inversion.
//   - Post-Chrome 50: alpha is RELATIVE (0 = page load direction) unless
//     using deviceorientationabsolute event.
//
// This test uses W3C-correct mock data to verify the formula direction.

'use strict';

// ── Minimal Three.js math ──────────────────────────────────────────────────

class Vector3 {
  constructor(x=0, y=0, z=0) { this.x=x; this.y=y; this.z=z; }
  applyQuaternion(q) {
    const {x,y,z} = this;
    const qx=q.x, qy=q.y, qz=q.z, qw=q.w;
    const ix=qw*x+qy*z-qz*y, iy=qw*y+qz*x-qx*z;
    const iz=qw*z+qx*y-qy*x, iw=-qx*x-qy*y-qz*z;
    this.x=ix*qw+iw*-qx+iy*-qz-iz*-qy;
    this.y=iy*qw+iw*-qy+iz*-qx-ix*-qz;
    this.z=iz*qw+iw*-qz+ix*-qy-iy*-qx;
    return this;
  }
}

class Quaternion {
  constructor(x=0,y=0,z=0,w=1) { this.x=x; this.y=y; this.z=z; this.w=w; }
  setFromEuler(e) {
    const c1=Math.cos(e.x/2), c2=Math.cos(e.y/2), c3=Math.cos(e.z/2);
    const s1=Math.sin(e.x/2), s2=Math.sin(e.y/2), s3=Math.sin(e.z/2);
    this.x=s1*c2*c3+c1*s2*s3; this.y=c1*s2*c3-s1*c2*s3;
    this.z=c1*c2*s3-s1*s2*c3; this.w=c1*c2*c3+s1*s2*s3;
    return this;
  }
  setFromAxisAngle(axis, angle) {
    const h=angle/2, s=Math.sin(h);
    this.x=axis.x*s; this.y=axis.y*s; this.z=axis.z*s; this.w=Math.cos(h);
    return this;
  }
  multiply(b) {
    const ax=this.x,ay=this.y,az=this.z,aw=this.w;
    const bx=b.x,by=b.y,bz=b.z,bw=b.w;
    this.x=ax*bw+aw*bx+ay*bz-az*by; this.y=ay*bw+aw*by+az*bx-ax*bz;
    this.z=az*bw+aw*bz+ax*by-ay*bx; this.w=aw*bw-ax*bx-ay*by-az*bz;
    return this;
  }
  clone() { return new Quaternion(this.x,this.y,this.z,this.w); }
}

class Euler {
  constructor(x=0,y=0,z=0,order='XYZ') { this.x=x; this.y=y; this.z=z; this.order=order; }
}

// ── Exact walk.js formula (lines 85-88) ────────────────────────────────────

const _q1 = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const _zee = new Vector3(0, 0, 1);
const DEG = Math.PI / 180;

function formula(alphaDeg, betaDeg, gammaDeg, screenOrient) {
  const euler = new Euler(betaDeg*DEG, alphaDeg*DEG, -gammaDeg*DEG, 'YXZ');
  const q = new Quaternion().setFromEuler(euler);
  q.multiply(_q1.clone());
  q.multiply(new Quaternion().setFromAxisAngle(_zee, -screenOrient*DEG));
  return q;
}

function cameraDir(q) { return new Vector3(0, 0, -1).applyQuaternion(q); }

// compass bearing: 0=N, 90=E, 180=S, 270=W (Three.js: -Z=N, +X=E)
function bearing(dir) {
  let d = Math.atan2(dir.x, -dir.z) * (180/Math.PI);
  return ((d % 360) + 360) % 360;
}

function compass(b) {
  const names = ['N','NE','E','SE','S','SW','W','NW'];
  return names[Math.round(b/45) % 8];
}

// ── Test harness ───────────────────────────────────────────────────────────

let pass=0, fail=0;
function ok(label, cond, detail) {
  if(cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail||''}`); }
}
function near(a, b, tol) { return Math.abs(a - b) < tol || Math.abs(a - b - 360) < tol || Math.abs(a - b + 360) < tol; }


// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 1: Alpha → camera compass bearing (upright, portrait) ═══');
console.log('  W3C: alpha=0 → North. alpha increases CCW from above.\n');

for (const a of [0, 90, 180, 270]) {
  const b = bearing(cameraDir(formula(a, 90, 0, 0)));
  console.log(`  alpha=${a}° → bearing ${b.toFixed(0)}° (${compass(b)})`);
}

const b0 = bearing(cameraDir(formula(0, 90, 0, 0)));
const b90 = bearing(cameraDir(formula(90, 90, 0, 0)));
const b180 = bearing(cameraDir(formula(180, 90, 0, 0)));
const b270 = bearing(cameraDir(formula(270, 90, 0, 0)));

ok('alpha=0 → North (0°)', near(b0, 0, 2));
ok('alpha=90 → West (270°)', near(b90, 270, 2));
ok('alpha=180 → South (180°)', near(b180, 180, 2));
ok('alpha=270 → East (90°)', near(b270, 90, 2));


// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 2: Turn RIGHT = alpha DECREASES (W3C) ═══');
console.log('  Start: facing South (alpha=180). Turn right 45° → SW (bearing 225°)\n');

const base = bearing(cameraDir(formula(180, 90, 0, 0)));  // South
const right45 = bearing(cameraDir(formula(180-45, 90, 0, 0)));  // alpha decreases
const left45 = bearing(cameraDir(formula(180+45, 90, 0, 0)));   // alpha increases

console.log(`  Baseline (α=180): ${base.toFixed(0)}° (${compass(base)})`);
console.log(`  Right 45 (α=135): ${right45.toFixed(0)}° (${compass(right45)})`);
console.log(`  Left 45  (α=225): ${left45.toFixed(0)}° (${compass(left45)})`);

ok('right 45° from S → SW (225°)', near(right45, 225, 2), `got ${right45.toFixed(0)}`);
ok('left 45° from S → SE (135°)', near(left45, 135, 2), `got ${left45.toFixed(0)}`);


// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 3: Full 360° sweep ═══');
console.log('  Facing North (α=0), turning right (α decreasing = 360,350,340...)\n');

const sweep = [0, 350, 340, 315, 270, 225, 180, 135, 90, 45];
const expectedBearings = [0, 10, 20, 45, 90, 135, 180, 225, 270, 315];
let sweepOK = true;

for (let i = 0; i < sweep.length; i++) {
  const b = bearing(cameraDir(formula(sweep[i], 90, 0, 0)));
  const match = near(b, expectedBearings[i], 2);
  if (!match) sweepOK = false;
  console.log(`  α=${sweep[i].toString().padStart(3)}° → ${b.toFixed(0).padStart(3)}° (${compass(b).padEnd(2)}) expected ${expectedBearings[i]}° ${match ? '✓' : '✗'}`);
}
ok('full 360° sweep: alpha-- maps to bearing++ (rightward)', sweepOK);


// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 4: AlphaOffset — door correction ═══');
console.log('  Door faces bearing 45° (NE). Phone starts at α=200 (facing ~SSW).\n');

// The alphaOffset formula from walk.js lines 91-98:
// 1) Compute camera dir from raw device alpha
// 2) Extract devYaw = atan2(dir.x, dir.z)
// 3) Extract doorYaw = atan2(doorDir.x, doorDir.z)
// 4) offset = doorYaw - devYaw (added to alpha in radians)

// Simulate: door quaternion from OrbitControls facing NE (bearing 45°)
// In Three.js, bearing 45° (NE) = dir with +X and -Z components
const doorDirX = Math.sin(45 * DEG);   // +X (east component)
const doorDirZ = -Math.cos(45 * DEG);  // -Z (north component)
const doorYaw = Math.atan2(doorDirX, doorDirZ);

// Device raw at α=200
const devQ = formula(200, 90, 0, 0);
const devDir = cameraDir(devQ);
const devYaw = Math.atan2(devDir.x, devDir.z);
const alphaOffset = doorYaw - devYaw;

console.log(`  doorYaw=${(doorYaw/DEG).toFixed(1)}° devYaw=${(devYaw/DEG).toFixed(1)}° offset=${(alphaOffset/DEG).toFixed(1)}°`);

// Apply offset: same as walk.js line 79
const correctedAlpha = 200 * DEG + alphaOffset;
const corrEuler = new Euler(90*DEG, correctedAlpha, 0, 'YXZ');
const corrQ = new Quaternion().setFromEuler(corrEuler);
corrQ.multiply(_q1.clone());
corrQ.multiply(new Quaternion().setFromAxisAngle(_zee, 0));
const corrDir = cameraDir(corrQ);
const corrBearing = bearing(corrDir);

console.log(`  Corrected bearing: ${corrBearing.toFixed(0)}° (${compass(corrBearing)})`);
ok('alphaOffset corrects to door bearing (45° NE)', near(corrBearing, 45, 3), `got ${corrBearing.toFixed(0)}`);

// After offset, turn right 30° (alpha decreases by 30)
const turnAlpha = (200 - 30) * DEG + alphaOffset;
const turnEuler = new Euler(90*DEG, turnAlpha, 0, 'YXZ');
const turnQ = new Quaternion().setFromEuler(turnEuler);
turnQ.multiply(_q1.clone());
turnQ.multiply(new Quaternion().setFromAxisAngle(_zee, 0));
const turnBearing = bearing(cameraDir(turnQ));

console.log(`  After right 30° (α=170): bearing=${turnBearing.toFixed(0)}° (${compass(turnBearing)})`);
ok('right turn after offset → bearing increases (75° ENE)', near(turnBearing, 75, 3), `got ${turnBearing.toFixed(0)}`);


// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 5: Pitch / tilt ═══');

const dLevel = cameraDir(formula(180, 90, 0, 0));
const dUp = cameraDir(formula(180, 60, 0, 0));
const dDown = cameraDir(formula(180, 110, 0, 0));
ok('tilt up (β=60) → Y decreases (look up)', dUp.y < dLevel.y);
ok('tilt down (β=110) → Y increases (look down)', dDown.y > dLevel.y);


// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 6: controls.update() conflict ═══');
console.log('  walk.js advanceWalkStep() calls controls.update() on every step.');
console.log('  OrbitControls.update() resets camera.quaternion from position→target.');
console.log('  Even with enabled=false, update() still overwrites the quaternion.');
console.log('  This would flip the camera to the OrbitControls target direction,');
console.log('  creating a visible snap or persistent wrong orientation.');
console.log('');
console.log('  walk.js line 133: controls.enabled = false');
console.log('  walk.js line 364: controls.update()  ← CALLED DURING WALK');
console.log('');
console.log('  If the user walks (shake-to-step), every step calls controls.update()');
console.log('  which fights the device orientation quaternion.');
console.log('');
console.log('  BUT the user reports CONSTANT reversal, not just on steps.');
console.log('  So the animate loop must also be calling controls.update().\n');


// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 7: Relative alpha (post-Chrome 50) ═══');
console.log('  Post-Chrome 50 on Android: alpha=0 means "direction at page load"');
console.log('  NOT "facing North". This means the alphaOffset calculation is');
console.log('  correct in principle (it calibrates to the door), but the absolute');
console.log('  compass mapping is broken.');
console.log('');
console.log('  For walk mode this is fine — we only need relative turns.');
console.log('  The alphaOffset handles the initial calibration.\n');

const relBase = formula(0, 90, 0, 0);  // alpha=0 = page load direction
const relRight = formula(350, 90, 0, 0);  // turned right 10° → alpha=350
const bBase = bearing(cameraDir(relBase));
const bRight = bearing(cameraDir(relRight));
const delta = ((bRight - bBase + 360) % 360);
console.log(`  Relative: α=0 → bearing ${bBase.toFixed(0)}°, α=350 (right 10°) → bearing ${bRight.toFixed(0)}°`);
console.log(`  Delta: ${delta.toFixed(0)}° clockwise`);
ok('relative alpha: right 10° → bearing increases by 10°', near(delta, 10, 2), `got ${delta.toFixed(0)}`);


// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ SUMMARY ═══');
console.log(`  ${pass}/${pass+fail} passed, ${fail} failed\n`);

if (fail === 0) {
  console.log('  ALL PASS — formula is correct for W3C alpha (both Android & iOS).');
  console.log('  Alpha decreasing on right turn → camera bearing increases → correct.');
  console.log('');
  console.log('  The reversal on the phone is NOT in the formula math.');
  console.log('  Prime suspect: controls.update() in advanceWalkStep() (line 364)');
  console.log('  and/or the animate loop guard checking the wrong variable.');
  console.log('');
  console.log('  NEXT: inspect main.js animate loop — is controls.update() truly guarded?');
} else {
  console.log('  FAILURES — review above.');
}

process.exit(fail > 0 ? 1 : 0);
