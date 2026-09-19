#!/usr/bin/env node
/* ⚠ WITNESS — W-SUN-PATH, §SUN_PATH (bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §5 + §8).
 *
 * THE ISSUE IT PROVES OR DISPROVES:
 *   viewer/sun_path.js is a TRANSCRIPTION of the NOAA low-precision solar-position algorithm.
 *   The failure mode of a transcription is not a crash — it is a dropped term. A missing
 *   equation-of-time term, a wrong obliquity constant, or a flipped azimuth branch produces a
 *   sun that still rises in the east, still climbs at midday, still sets, and is wrong by hours
 *   or by tens of degrees in a way nobody spots on a film. "It compiled and the sun moved" is
 *   NOT evidence, so this witness never asserts that.
 *
 * HOW IT JUDGES, given there is no network and no second library shipped here:
 *   It pins the algorithm against ASTRONOMICAL FACTS that exist independently of any code —
 *   the obliquity of the ecliptic, the dates of the 2026 solstices and equinoxes, the analemma's
 *   two extremes, the geometry of solar noon, and the north/south hemisphere azimuth flip. Each
 *   one is a DIFFERENT term of the algorithm, so a dropped term fails a specific assertion and
 *   says which. Values are quoted from published astronomy in the comment beside each check, not
 *   read back out of this implementation.
 *
 * THE CROSS-CHECK THAT IS NOT IN THIS FILE, and how to re-run it:
 *   The absolute accuracy claim was MEASURED against pysolar (an independent implementation of
 *   the NREL SPA algorithm — a different, higher-precision algorithm, not a second copy of this
 *   one), 2,968 samples: 7 real fleet locations x every 7th day of 2026 x 8 times of day.
 *   MEASURED 2026-09-18, with the sun more than 5 deg above the horizon (1,484 of the samples):
 *       max |d elevation| = 0.019 deg      max |d azimuth| = 0.034 deg
 *   Across ALL samples, including the sun at and below the horizon where the two refraction
 *   models legitimately differ:
 *       max |d elevation| = 0.382 deg      max |d azimuth| = 0.052 deg
 *   Reproduce with viewer/tests/witness_sun_path_oracle.py (it prints INCONCLUSIVE, never PASS,
 *   when pysolar is absent). That script is the provenance for those four numbers; they are not
 *   folklore and they are not asserted here as if this file had measured them.
 *
 * CAN THIS WITNESS FAIL, BE VACUOUS, OR NO-OP?
 *   FAIL: yes — each check below is a one-line numeric assertion with its own tolerance.
 *   VACUOUS: cannot be. It depends on no DB, no fixture, no network and no browser; the
 *            population is generated here. If sun_path.js fails to load, that is a hard FAIL,
 *            not a skip.
 *   NO-OP: the "sun is below the horizon at local midnight" and "azimuth flips hemisphere"
 *          checks are the ones that catch a change that alters nothing visible at midday.
 * RUN: node viewer/tests/witness_sun_path.js
 */
var path = require('path');
var setupSunPath;
try {
  setupSunPath = require(path.join(__dirname, '..', 'sun_path.js')).setupSunPath;
} catch (e) {
  console.log('§SUN_PATH_WITNESS FAIL — cannot load viewer/sun_path.js: ' + e.message);
  process.exit(1);
}
if (typeof setupSunPath !== 'function') {
  console.log('§SUN_PATH_WITNESS FAIL — sun_path.js exported no setupSunPath');
  process.exit(1);
}

var A = {};
var _log = console.log;
console.log = function () {};          // swallow the module's own ready line
setupSunPath(A);
console.log = _log;

var fails = 0, checks = 0;
function check(name, got, want, tol, note) {
  checks++;
  var ok = (want === null) ? (got === null)
         : (typeof got === 'number' && isFinite(got) && Math.abs(got - want) <= tol);
  if (!ok) fails++;
  var shown = (typeof got === 'number') ? got.toFixed(6) : String(got);
  console.log('  §SUN ' + (ok ? 'ok   ' : 'WRONG') + ' ' + name + ' = ' + shown +
              ' (want ' + want + ' +-' + tol + ')' + (note ? '   ' + note : ''));
}
function truth(name, cond, detail) {
  checks++;
  if (!cond) fails++;
  console.log('  §SUN ' + (cond ? 'ok   ' : 'WRONG') + ' ' + name + (detail ? '   ' + detail : ''));
}

var at = function (lat, lon, iso) { return A.sunPositionAt(lat, lon, new Date(iso)); };

// Scan a whole UTC year hourly once; several checks read off this one sweep.
var sweep = { decMin: 99, decMax: -99, eotMin: 99, eotMax: -99,
              decMinIso: '', decMaxIso: '', eotMinIso: '', eotMaxIso: '', crossings: [] };
(function () {
  var prev = null;
  for (var h = 0; h < 365 * 24; h++) {
    var d = new Date(Date.UTC(2026, 0, 1, h));
    var p = A.sunPositionAt(0, 0, d);
    if (p.declination < sweep.decMin) { sweep.decMin = p.declination; sweep.decMinIso = d.toISOString(); }
    if (p.declination > sweep.decMax) { sweep.decMax = p.declination; sweep.decMaxIso = d.toISOString(); }
    if (p.eqOfTimeMin < sweep.eotMin) { sweep.eotMin = p.eqOfTimeMin; sweep.eotMinIso = d.toISOString(); }
    if (p.eqOfTimeMin > sweep.eotMax) { sweep.eotMax = p.eqOfTimeMin; sweep.eotMaxIso = d.toISOString(); }
    if (prev !== null && (prev < 0) !== (p.declination < 0)) sweep.crossings.push(d.toISOString().slice(0, 10));
    prev = p.declination;
  }
})();

function solarNoon(lat, lon, y, mo, day) {
  var best = null;
  for (var m = 0; m < 1440; m++) {
    var d = new Date(Date.UTC(y, mo, day, 0, m));
    var p = A.sunPositionAt(lat, lon, d);
    if (!best || p.elevation > best.p.elevation) best = { d: d, p: p };
  }
  return best;
}

console.log('§SUN_PATH_WITNESS — NOAA low-precision solar position, pure arithmetic, no network');

// ── 1. OBLIQUITY OF THE ECLIPTIC, via the declination extremes. ──────────────────────────────
// Published: Earth's axial tilt is 23.4366 deg (IAU, epoch 2000, drifting ~0.00013 deg/yr).
// The sun's declination reaches exactly +/- that at the solstices. This is the obliquity term;
// drop it and the seasons vanish, mis-transcribe it and every shadow is the wrong length.
check('declination max (June solstice)', sweep.decMax, 23.4366, 0.01, 'at ' + sweep.decMaxIso);
check('declination min (Dec solstice)', sweep.decMin, -23.4366, 0.01, 'at ' + sweep.decMinIso);

// ── 2. SOLSTICE AND EQUINOX DATES. These fix the orbital phase (mean anomaly + equation of ──
// centre). Published 2026 dates (UTC): Jun solstice 21 Jun, Dec solstice 21 Dec,
// Mar equinox 20 Mar, Sep equinox 23 Sep.
truth('June solstice lands on 2026-06-21', sweep.decMaxIso.slice(0, 10) === '2026-06-21', sweep.decMaxIso);
truth('December solstice lands on 2026-12-21', sweep.decMinIso.slice(0, 10) === '2026-12-21', sweep.decMinIso);
truth('exactly two equinoxes in the year', sweep.crossings.length === 2, JSON.stringify(sweep.crossings));
truth('March equinox is 2026-03-20', sweep.crossings[0] === '2026-03-20', String(sweep.crossings[0]));
truth('September equinox is 2026-09-23', sweep.crossings[1] === '2026-09-23', String(sweep.crossings[1]));

// ── 3. THE EQUATION OF TIME — the analemma. This is the term most likely to be dropped, and ──
// the one whose absence is least visible: without it the sun is simply up to a quarter of an
// hour off, all year, in a smoothly plausible way. Published extremes: about -14.2 min around
// 11 February and about +16.4 min around 3 November.
check('equation of time minimum', sweep.eotMin, -14.2, 0.3, 'at ' + sweep.eotMinIso);
check('equation of time maximum', sweep.eotMax, 16.4, 0.3, 'at ' + sweep.eotMaxIso);
truth('EoT minimum falls in early-to-mid February', sweep.eotMinIso.slice(0, 7) === '2026-02', sweep.eotMinIso);
truth('EoT maximum falls in early November', sweep.eotMaxIso.slice(0, 7) === '2026-11', sweep.eotMaxIso);

// ── 4. THE GEOMETRY OF SOLAR NOON: elevation = 90 - |latitude - declination|. ────────────────
// An identity, so it holds at any latitude and pins the hour-angle/zenith assembly. Boston is
// Hospital_IFC2x3_ARC.ifc's own extracted site, so this is the real fleet coordinate.
var bos = solarNoon(42.35842896, -71.05977631, 2026, 5, 21);
check('Boston solar-noon elevation, June solstice', bos.p.elevation,
      90 - Math.abs(42.35842896 - bos.p.declination), 0.02,
      'decl=' + bos.p.declination.toFixed(4) + ' at ' + bos.d.toISOString());
check('Boston solar-noon azimuth is due south', bos.p.azimuth, 180, 0.2);
check('Boston solar-noon hour angle is ~0', bos.p.hourAngleDeg, 0, 0.3);

// At the Tropic of Cancer on the June solstice the sun is overhead — the one place and day where
// elevation reaches 90. Catches a latitude/declination sign or swap error that the identity above
// would absorb.
var trop = solarNoon(23.4366, 0, 2026, 5, 21);
check('Tropic of Cancer solar-noon elevation, June solstice', trop.p.elevation, 90, 0.05,
      'at ' + trop.d.toISOString());

// ── 5. HEMISPHERE FLIP. At southern-hemisphere solar noon the sun is due NORTH, not south. ───
// A NO-OP GUARD: an azimuth branch that always returns 180-ish passes every check above and
// fails here. Sydney, chosen because it is far enough south that the answer is unambiguous.
var syd = solarNoon(-33.8688, 151.2093, 2026, 11, 21);
truth('Sydney solar noon points due NORTH (az within 1 deg of 0/360)',
      Math.min(syd.p.azimuth, 360 - syd.p.azimuth) < 1.0, 'az=' + syd.p.azimuth.toFixed(4));
check('Sydney solar-noon elevation, Dec solstice', syd.p.elevation,
      90 - Math.abs(-33.8688 - syd.p.declination), 0.02, 'at ' + syd.d.toISOString());

// ── 6. MORNING/AFTERNOON SYMMETRY about solar noon. Pins the two-branch azimuth split: a ─────
// single-branch acos gives the same azimuth either side of noon and fails here immediately.
(function () {
  var noonMs = bos.d.getTime(), lat = 42.35842896, lon = -71.05977631;
  [1, 2, 3].forEach(function (dh) {
    var a = A.sunPositionAt(lat, lon, new Date(noonMs - dh * 3600000));
    var b = A.sunPositionAt(lat, lon, new Date(noonMs + dh * 3600000));
    check('elevation symmetric at noon -+' + dh + 'h', Math.abs(a.elevation - b.elevation), 0, 0.05);
    check('azimuths mirror at noon -+' + dh + 'h (sum=360)', a.azimuth + b.azimuth, 360, 0.3,
          a.azimuth.toFixed(2) + ' / ' + b.azimuth.toFixed(2));
    truth('morning is east of south at -' + dh + 'h', a.azimuth < 180, 'az=' + a.azimuth.toFixed(2));
    truth('afternoon is west of south at +' + dh + 'h', b.azimuth > 180, 'az=' + b.azimuth.toFixed(2));
  });
})();

// ── 7. THE SUN IS DOWN AT LOCAL SOLAR MIDNIGHT. Another NO-OP guard: elevation must go ───────
// NEGATIVE, and `isUp` must say so rather than clamping to a always-daylight answer.
(function () {
  var mid = new Date(bos.d.getTime() + 12 * 3600000);
  var p = A.sunPositionAt(42.35842896, -71.05977631, mid);
  truth('Boston solar midnight: sun is below the horizon',
        p.elevation < 0 && p.isUp === false, 'el=' + p.elevation.toFixed(3));
})();

// ── 8. REFRACTION IS REPORTED SEPARATELY, NOT FOLDED IN. ─────────────────────────────────────
// Geometry (rays, shadows, angle of attack) needs the true elevation; only a "what you would
// see" readout wants the refracted one. If a later change folds refraction into `elevation`,
// every shadow silently tilts — these two catch it.
(function () {
  var high = at(42.35842896, -71.05977631, bos.d.toISOString());
  truth('refraction is ~0 with the sun high', Math.abs(high.elevationApparent - high.elevation) < 0.01,
        'd=' + (high.elevationApparent - high.elevation).toFixed(5) + ' deg at el=' + high.elevation.toFixed(1));
  // At the horizon refraction lifts the sun by roughly half a degree — the reason the sun is
  // visibly up when it is geometrically already down.
  var lat = 42.35842896, lon = -71.05977631, found = null;
  for (var m = 0; m < 1440 && !found; m++) {
    var p = A.sunPositionAt(lat, lon, new Date(Date.UTC(2026, 5, 21, 0, m)));
    if (Math.abs(p.elevation) < 0.05) found = p;
  }
  truth('a near-horizon sample exists to judge', found !== null);
  if (found) check('horizon refraction lift', found.elevationApparent - found.elevation, 0.48, 0.10,
                   'el=' + found.elevation.toFixed(4));
})();

// ── 9. §4 CONTRACT — an unknown location returns null, never a plausible 0. ──────────────────
// The whole point of §4: "we do not know where this building is" must survive all the way to
// the renderer so it draws nothing, instead of a confident compass pointed at the Gulf of Guinea.
truth('null latitude -> null position', A.sunPositionAt(null, 10, new Date()) === null);
truth('undefined longitude -> null position', A.sunPositionAt(10, undefined, new Date()) === null);
truth('NaN latitude -> null position', A.sunPositionAt(NaN, 10, new Date()) === null);
truth('invalid date -> null position', A.sunPositionAt(10, 10, new Date('nonsense')) === null);
truth('0,0 IS a valid request (it is a real place)', A.sunPositionAt(0, 0, new Date()) !== null);

// ── 10. DAY OF THE YEAR (§6's label). Leap years are the only interesting case. ──────────────
check('doy 2026-01-01', A.sunDayOfYear(new Date('2026-01-01T00:00:00Z')), 1, 0);
check('doy 2026-12-31', A.sunDayOfYear(new Date('2026-12-31T23:59:59Z')), 365, 0);
check('doy 2024-12-31 (leap year)', A.sunDayOfYear(new Date('2024-12-31T00:00:00Z')), 366, 0);
check('doy 2024-02-29 (leap day)', A.sunDayOfYear(new Date('2024-02-29T12:00:00Z')), 60, 0);
check('doy 2026-03-01 (non-leap, same ordinal)', A.sunDayOfYear(new Date('2026-03-01T00:00:00Z')), 60, 0);

// ── 11. §8 ANGLE OF ATTACK. Pure vector arithmetic, judged on cases with an exact answer. ────
(function () {
  var up = { x: 0, y: 1, z: 0 };                        // three-space up == IFC +Z
  var sunOverhead = A.sunDirectionThree(180, 90, 0);    // straight up, whatever the azimuth
  var r = A.sunIncidenceDeg(sunOverhead, up);
  check('overhead sun on a flat roof: incidence', r.incidence, 0, 0.001);
  check('overhead sun on a flat roof: attack', r.attack, 90, 0.001);
  truth('overhead sun lights the roof', r.lit === true);

  var horiz = A.sunDirectionThree(180, 0, 0);           // on the horizon, due true south
  check('horizon sun on a flat roof: incidence', A.sunIncidenceDeg(horiz, up).incidence, 90, 0.001);

  // A wall running east-west (rotation_z = 0) faces true north and true south. The sun due
  // south on the horizon hits the south face square on and the north face not at all.
  var faces = A.wallFaceNormalsThree(0);
  var f0 = A.sunIncidenceDeg(horiz, faces[0]), f1 = A.sunIncidenceDeg(horiz, faces[1]);
  truth('a wall has exactly one lit face with the sun on the horizon',
        (f0.lit ? 1 : 0) + (f1.lit ? 1 : 0) === 1, 'inc=' + f0.incidence.toFixed(2) + '/' + f1.incidence.toFixed(2));
  check('the lit face is square on (incidence 0)', Math.min(f0.incidence, f1.incidence), 0, 0.001);
  check('the dark face is fully turned away (incidence 180)', Math.max(f0.incidence, f1.incidence), 180, 0.001);

  // TRUE NORTH ROTATES THE SUN IN THE MODEL. This is the check that ties §5 back to §1: with
  // true_north_angle = 5 deg (the real Hospital_IFC2x3_ARC value), the same sun must land 5 deg
  // differently on the same wall. If true north is ignored, these two are identical.
  var s0 = A.sunDirectionThree(180, 30, 0), s5 = A.sunDirectionThree(180, 30, 5);
  var i0 = A.sunIncidenceDeg(s0, faces[0]), i5 = A.sunIncidenceDeg(s5, faces[0]);
  truth('true north actually moves the sun in model space',
        Math.abs(i0.incidence - i5.incidence) > 0.1,
        'incidence ' + i0.incidence.toFixed(3) + ' vs ' + i5.incidence.toFixed(3) + ' deg');

  // Degenerate inputs are null, not 0 — a zero-length normal has no angle to report.
  truth('zero-length normal -> null', A.sunIncidenceDeg(sunOverhead, { x: 0, y: 0, z: 0 }) === null);
  truth('missing sun direction -> null', A.sunIncidenceDeg(null, up) === null);
})();

// ── 12. THE COMPASS NEEDLE. bearing 0 with true north 0 must point at model north (IFC +Y), ──
// which is three-space -Z. Guards the axis convention the rose is drawn with.
(function () {
  var n = A.bearingDirectionThree(0, 0);
  check('north needle x', n.x, 0, 1e-9);
  check('north needle y', n.y, 0, 1e-9);
  check('north needle z', n.z, -1, 1e-9);
  var e = A.bearingDirectionThree(90, 0);
  check('east needle x', e.x, 1, 1e-9);
  check('east needle z', e.z, 0, 1e-9);
  // With true north at +5 deg, TRUE north sits 5 deg the other way round in model space.
  var n5 = A.bearingDirectionThree(0, 5);
  check('true-north needle swings by the true-north angle',
        Math.atan2(n5.x, -n5.z) * 180 / Math.PI, -5, 1e-6);
})();

var verdict = fails === 0 ? 'PASS' : 'FAIL';
console.log('§SUN_PATH_WITNESS ' + verdict + ' checks=' + checks + ' wrong=' + fails +
            ' (no DB, no network, no browser — cannot be VACUOUS)');
process.exit(fails === 0 ? 0 : 1);
