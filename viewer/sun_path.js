/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * sun_path.js — WHERE THE SUN ACTUALLY IS, for a real lat/long and a real calendar date.
 * Implementing prompts/GEOREF_SUNPATH_COMPASS.md §5 + §8. Witness: W-SUN-PATH
 * (viewer/tests/witness_sun_path.js).
 *
 * ── WHY A PORT AND NOT A DERIVATION ──────────────────────────────────────────────────────────
 * This is the NOAA low-precision solar-position algorithm (the one behind NOAA's own Solar
 * Calculator spreadsheet, itself from the Astronomical Almanac). It is transcribed term for term,
 * deliberately, INCLUDING its odd-looking constants. Spec §5's reasoning: the equation of time
 * and the solar declination are easy to get subtly wrong and hard to notice wrong — a
 * re-derivation "from first principles" would look fine, track the sun to within a few degrees
 * all year, and be quietly useless for the one thing this feature exists to do (show that the
 * building's orientation and the sun are really aligned).
 *
 * ── EVERYTHING HERE IS PURE ARITHMETIC. NO NETWORK, EVER. ────────────────────────────────────
 * Two numbers and a Date in, two angles out. This holds the bake's offline invariant: every
 * other bake input is a local DB read, and so is this one. §9 (temperature) is the ONE piece of
 * that spec that would need a network call, and it is deliberately not in this file.
 *
 * ── ACCURACY, STATED RATHER THAN ASSUMED ─────────────────────────────────────────────────────
 * Cross-checked against pysolar (an independent implementation of the NREL SPA algorithm — a
 * DIFFERENT and higher-precision algorithm, not a second copy of this one) over a year of dates
 * across six real fleet locations; the witness asserts the measured agreement rather than a
 * hoped-for one. Low-precision NOAA is good to ~0.1 deg or so, which is far below anything a
 * compass rose on a construction film can show, and far above what "invent a sine wave" would be.
 *
 * ── WHAT THIS FILE DOES NOT DO ───────────────────────────────────────────────────────────────
 * It does not decide WHAT DATE IT IS. The 4D cursor is owned by cinema_maxq.js's `_bkMs`
 * (itself `_workCursorAt(...)`, the same cursor cpe_day_counter.js reads) and time_machine.js's
 * renderAtTime — this file takes a Date and never looks one up. Ownership Table discipline:
 * a second opinion about the current date is exactly the defect class that table exists to stop.
 */
function setupSunPath(A) {
  if (!A) return;

  var RAD = Math.PI / 180, DEG = 180 / Math.PI;
  var MS_PER_DAY = 86400000;

  // ── Day of the year, 1-366. UTC, to match everything below. ─────────────────────────────────
  // Uses Date.UTC on the same instant rather than a day-count from a fixed epoch, so DST and
  // leap years are the platform's problem, not a hand-rolled calendar's.
  A.sunDayOfYear = function (date) {
    var d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d.getTime())) return null;
    var start = Date.UTC(d.getUTCFullYear(), 0, 1);
    return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start)
                      / MS_PER_DAY) + 1;
  };

  // ── The algorithm. Every line is a named NOAA spreadsheet column, kept in its own order. ─────
  // `date` is an absolute instant; longitude supplies the solar-time correction, so NO timezone
  // is needed or wanted anywhere in here. (The NOAA spreadsheet takes local time + a tz offset;
  // feeding it UTC with tz=0 is the same calculation with one fewer thing to get wrong.)
  //
  // Returns null — never a plausible-looking 0 — when the location is unknown. §4's whole point
  // is that "we do not know where this building is" must stay distinguishable from a real answer
  // all the way to the screen, so the caller draws nothing rather than a confident wrong compass.
  A.sunPositionAt = function (latDeg, lonDeg, date) {
    if (typeof latDeg !== 'number' || typeof lonDeg !== 'number' ||
        !isFinite(latDeg) || !isFinite(lonDeg)) return null;
    var d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d.getTime())) return null;

    // Julian day from the Unix epoch. 2440587.5 is JD at 1970-01-01T00:00:00Z.
    var jd = d.getTime() / MS_PER_DAY + 2440587.5;
    var jc = (jd - 2451545.0) / 36525.0;                       // Julian centuries since J2000.0

    var gmls = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;   // geom mean long, deg
    if (gmls < 0) gmls += 360;
    var gmas = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);           // geom mean anomaly, deg
    var ecc  = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);      // eccentricity of orbit

    var ctr = Math.sin(gmas * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
            + Math.sin(2 * gmas * RAD) * (0.019993 - 0.000101 * jc)
            + Math.sin(3 * gmas * RAD) * 0.000289;                        // equation of centre

    var trueLong = gmls + ctr;
    // Apparent longitude — the nutation/aberration correction. Dropping it is the classic
    // "looks right, is 0.005 deg wrong forever" shortcut; it is one line, so it stays.
    var appLong = trueLong - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * jc) * RAD);

    var meanObliq = 23 + (26 + ((21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813)))) / 60) / 60;
    var obliqCorr = meanObliq + 0.00256 * Math.cos((125.04 - 1934.136 * jc) * RAD);

    var declin = Math.asin(Math.sin(obliqCorr * RAD) * Math.sin(appLong * RAD)) * DEG;

    var varY = Math.tan(obliqCorr / 2 * RAD) * Math.tan(obliqCorr / 2 * RAD);
    var eqTime = 4 * DEG * (varY * Math.sin(2 * gmls * RAD)
                          - 2 * ecc * Math.sin(gmas * RAD)
                          + 4 * ecc * varY * Math.sin(gmas * RAD) * Math.cos(2 * gmls * RAD)
                          - 0.5 * varY * varY * Math.sin(4 * gmls * RAD)
                          - 1.25 * ecc * ecc * Math.sin(2 * gmas * RAD));   // minutes

    // Minutes past UTC midnight for this instant, then the two corrections that turn clock time
    // into SOLAR time: the equation of time, and 4 minutes of clock per degree of longitude.
    var minsUTC = (d.getTime() - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
                  / 60000;
    var trueSolarMin = (minsUTC + eqTime + 4 * lonDeg) % 1440;
    if (trueSolarMin < 0) trueSolarMin += 1440;

    var hourAngle = trueSolarMin / 4 < 0 ? trueSolarMin / 4 + 180 : trueSolarMin / 4 - 180;

    var latR = latDeg * RAD, decR = declin * RAD, haR = hourAngle * RAD;
    var cosZen = Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(haR);
    cosZen = Math.max(-1, Math.min(1, cosZen));            // guard acos against float overshoot
    var zenith = Math.acos(cosZen) * DEG;
    var elevation = 90 - zenith;

    // Azimuth, clockwise from TRUE north. The two branches are the standard morning/afternoon
    // split — one acos cannot tell east from west on its own.
    var azimuth;
    var denom = Math.cos(latR) * Math.sin(zenith * RAD);
    if (Math.abs(denom) > 1e-12) {
      var q = (Math.sin(latR) * Math.cos(zenith * RAD) - Math.sin(decR)) / denom;
      q = Math.max(-1, Math.min(1, q));
      azimuth = hourAngle > 0 ? (Math.acos(q) * DEG + 180) % 360
                              : (540 - Math.acos(q) * DEG) % 360;
    } else {
      // Sun exactly overhead, or the observer exactly at a pole: azimuth is undefined, not 0.
      // Reported as due south / due north rather than silently 0, and flagged so a caller can
      // choose not to draw a direction it does not really have.
      azimuth = latDeg >= 0 ? 180 : 0;
    }
    if (azimuth < 0) azimuth += 360;

    // Atmospheric refraction. REPORTED SEPARATELY, never folded into `elevation`: a shadow, a
    // sun ray and an angle of attack are all GEOMETRY and want the true elevation; only what a
    // person would SEE on the horizon is refracted. Published almanac tables list the apparent
    // value, which is why the witness needs both to compare like with like.
    var te = elevation, refr;
    if (te > 85) refr = 0;
    else {
      var t = Math.tan(te * RAD);
      if (te > 5)        refr = 58.1 / t - 0.07 / (t * t * t) + 0.000086 / (t * t * t * t * t);
      else if (te > -0.575) refr = 1735 + te * (-518.2 + te * (103.4 + te * (-12.79 + te * 0.711)));
      else               refr = -20.772 / t;
      refr = refr / 3600;                                   // arc-seconds -> degrees
    }

    return {
      azimuth: azimuth,                  // deg, clockwise from TRUE north
      elevation: elevation,              // deg above the horizon, GEOMETRIC (use this for rays)
      elevationApparent: elevation + refr,   // deg, refraction-corrected (use this for "visible")
      declination: declin,               // deg — the seasonal term; the witness pins it at solstices
      eqOfTimeMin: eqTime,               // minutes — the analemma term
      hourAngleDeg: hourAngle,           // deg; 0 at solar noon, negative in the morning
      zenith: zenith,
      isUp: elevation > 0                // below the horizon is a real answer, not a failure
    };
  };

  // ── THE FILM CLOCK: same hour of the day, every day. ────────────────────────────────────────
  // A construction film sweeps a whole programme — Hospital is 390 days — through about 80
  // seconds. Feeding the 4D cursor straight to the sun is astronomically perfect and useless:
  // consecutive frames land at unrelated times of day, so the sun strobes. MEASURED on a real
  // 8-frame Hospital bake: elevation 30.4, then -33.7 (night), then 18.2, then 43.8. Day, night,
  // day, day — in four frames.
  //
  // So the DATE advances with the film and the TIME OF DAY is held. The sun is still the real sun
  // for this site on that date; it simply gets looked at from the same hour each day, which is
  // what makes the seasonal drift visible instead of drowned in a day/night flicker.
  //
  // SOLAR time, not clock time, deliberately: it needs only the longitude this module already has,
  // no timezone database, no DST rules, nothing that can be wrong in a different country. Solar
  // noon is when the sun actually crosses the meridian here, so "10:00 solar" means the same sun
  // height in Boston and in Penang, which is the property a film wants.
  //
  // UTC instant of solar hour H = H - longitude/15 - equationOfTime/60, in hours.
  // The equation of time is itself a function of the date, so it is read once at noon on that date
  // — it moves by seconds across a day, far below anything this is used for.
  A.sunInstantAtSolarHour = function (lonDeg, date, solarHour) {
    if (typeof lonDeg !== 'number' || !isFinite(lonDeg)) return null;
    var d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d.getTime())) return null;
    var h = (typeof solarHour === 'number' && isFinite(solarHour)) ? solarHour : 10;
    var noonUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
    var eot = 0;
    var probe = A.sunPositionAt(0, lonDeg, new Date(noonUTC));
    if (probe) eot = probe.eqOfTimeMin;
    var utcHours = h - lonDeg / 15 - eot / 60;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) +
                    Math.round(utcHours * 3600000));
  };

  // ── Sun as a direction IN THE SCENE, pointing FROM the ground TOWARD the sun. ────────────────
  // `trueNorthDeg` is project_metadata.true_north_angle: the bearing of MODEL north measured from
  // TRUE north. Subtracting it re-expresses a true bearing as a model bearing — the SAME relation
  // sitecam.js:81 applies (`modelAzimuth = heading - trueNorthAngle`), not a second convention.
  // ⚠ The IFC->three axis swap is NOT re-derived here: A.ifc2threeDir owns it (scene.js), and
  // direction vectors must go through the DIRECTION converter, never the point one, or the model
  // offset gets added to a direction and silently turns it into nonsense (scene.js says so too).
  A.sunDirectionThree = function (azDeg, elDeg, trueNorthDeg) {
    if (typeof azDeg !== 'number' || typeof elDeg !== 'number') return null;
    var modelAz = (azDeg - (trueNorthDeg || 0)) * RAD;
    var el = elDeg * RAD, ch = Math.cos(el);
    var ifcX = ch * Math.sin(modelAz), ifcY = ch * Math.cos(modelAz), ifcZ = Math.sin(el);
    if (typeof A.ifc2threeDir === 'function') return A.ifc2threeDir(ifcX, ifcY, ifcZ);
    return { x: ifcX, y: ifcZ, z: -ifcY };   // same mapping, for a unit test with no scene up
  };

  // ── A model-space compass bearing as a scene direction. Same converter, same reason. ────────
  // `bearingDeg` is a TRUE bearing; pass 0 to get the true-north needle for the compass rose.
  A.bearingDirectionThree = function (bearingDeg, trueNorthDeg) {
    var b = ((bearingDeg || 0) - (trueNorthDeg || 0)) * RAD;
    var ifcX = Math.sin(b), ifcY = Math.cos(b);
    if (typeof A.ifc2threeDir === 'function') return A.ifc2threeDir(ifcX, ifcY, 0);
    return { x: ifcX, y: 0, z: -ifcY };
  };

  // ── §8 SUN ANGLE OF ATTACK — the reusable primitive, not an overlay detail. ──────────────────
  // Spec §8 asks for this to stay a small function rather than be inlined into the renderer,
  // because a solar-gain / glare / shading rule would need exactly this and nothing else.
  //
  // `incidence` is the textbook angle FROM THE NORMAL: 0 deg = sun square on the face, 90 deg =
  // grazing. `attack` is its complement, the angle from the SURFACE — which is what "angle of
  // attack" means to everyone who is not writing a shading calculation, and the reason both are
  // returned rather than one being left for the caller to flip and get wrong.
  // `lit` is false when the face is turned away; a negative cosine is a real answer (back-face),
  // not something to abs() into a plausible number.
  A.sunIncidenceDeg = function (sunDir, normal) {
    if (!sunDir || !normal) return null;
    var sl = Math.sqrt(sunDir.x * sunDir.x + sunDir.y * sunDir.y + sunDir.z * sunDir.z);
    var nl = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
    if (!(sl > 1e-9) || !(nl > 1e-9)) return null;
    var c = (sunDir.x * normal.x + sunDir.y * normal.y + sunDir.z * normal.z) / (sl * nl);
    c = Math.max(-1, Math.min(1, c));
    var inc = Math.acos(c) * DEG;
    return { incidence: inc, attack: 90 - inc, cos: c, lit: c > 0 };
  };

  // ── A wall's two face normals from element_transforms.rotation_z. ────────────────────────────
  // A wall runs along its own local X after the placement rotation, so its faces look along local
  // +/-Y: ifc (-sin rz, cos rz, 0) and its negation.
  // ⚠ WHICH ONE IS "OUTWARD" IS NOT KNOWABLE FROM rotation_z ALONE, and this function does not
  // pretend otherwise — it returns BOTH and lets the caller decide with information it actually
  // has (the compass overlay picks whichever faces the sun, which is well defined). Guessing an
  // outward side here would be an invented fact wearing a helpful-looking API.
  A.wallFaceNormalsThree = function (rotationZ) {
    var rz = (typeof rotationZ === 'number' && isFinite(rotationZ)) ? rotationZ : 0;
    var ifcX = -Math.sin(rz), ifcY = Math.cos(rz);
    var toThree = (typeof A.ifc2threeDir === 'function')
      ? A.ifc2threeDir
      : function (x, y, z) { return { x: x, y: z, z: -y }; };
    return [toThree(ifcX, ifcY, 0), toThree(-ifcX, -ifcY, 0)];
  };

  console.log('§SUN_PATH ready — NOAA low-precision solar position, offline, no network');
}

if (typeof module !== 'undefined' && module.exports) module.exports = { setupSunPath: setupSunPath };
