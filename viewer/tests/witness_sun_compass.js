#!/usr/bin/env node
/* ⚠ WITNESS — W-SUN-COMPASS, §SUN_COMPASS (bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §6-§8).
 *
 * THE ISSUES IT PROVES OR DISPROVES — four, each one a way this feature can ship looking fine:
 *   1. THE ROSE IGNORES TRUE NORTH. The whole feature exists because true_north_angle has been a
 *      stub. A rose drawn from MODEL north instead would look completely normal on every building
 *      in this fleet except the two that have a real non-zero TrueNorth. Checked by building the
 *      same building twice with different true_north_angle values and asserting the needle moves
 *      by exactly that difference.
 *   2. IT DRAWS A COMPASS FOR A BUILDING WITH NO KNOWN LOCATION. Spec §4: an absent lat/long is
 *      stored EMPTY, never 0/0. If the module treats that as 0/0 it draws a confident rose with a
 *      Gulf-of-Guinea sun path on it. Checked by building against a DB with the keys present and
 *      empty and asserting NOTHING is built.
 *   3. THE TEXT NEVER REACHES THE EXPORTED VIDEO. cpe_day_counter.js's header names this trap:
 *      cinema_maxq.js's _captureFrame grabs the RENDERER CANVAS only, so anything not composited
 *      onto the 2D context is invisible in every exported byte while looking perfect in preview.
 *      Checked by driving the real composite routine through a recording 2D-context stub and
 *      asserting the day-of-year and the sun angles are actually emitted as fillText calls.
 *   4. THE SUN IS NOT THE 4D CURSOR'S SUN. §6 forbids a second date source. Checked by asserting
 *      A.sunCompassAt(cursorMs) reports exactly what A.sunPositionAt gives for new Date(cursorMs).
 *
 * WHY THIS RUNS IN NODE AND NOT A BROWSER:
 *   cpe_sun_compass.js touches window.THREE, A.scene and A.dbQuery and nothing else — no DOM, no
 *   WebGL, no raycast. So the browser is not required, it was only assumed. THREE and the scene
 *   are stubbed here (a Vector3/Group/BufferGeometry/Line surface, ~40 lines), and A.dbQuery runs
 *   against a REAL shipped building DB through the sqlite3 CLI. Nothing about the geometry is
 *   mocked — the extent, the wall counts and the anchor arithmetic are this building's own.
 *
 * NO-OP / VACUOUS / WRONG:
 *   VACUOUS: no building DB, or no sqlite3 -> INCONCLUSIVE, exit 2, never PASS.
 *   NO-OP:   check 2 is the no-op guard — it asserts that nothing at all is built.
 *   WRONG:   every check is a numeric or string assertion printed with its expected value.
 *
 * RUN: node viewer/tests/witness_sun_compass.js
 *      SUN_COMPASS_TEST_DB=/path/to/<Building>_extracted.db node viewer/tests/witness_sun_compass.js
 */
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var execSync = cp.execSync, execFileSync = cp.execFileSync;

var SEP = '|~|';   // a separator no IFC class, guid or number in these tables contains
var DB_SRC = process.env.SUN_COMPASS_TEST_DB ||
  '/home/red1/bim-compiler/deploy/buildings/Hospital_extracted.db';

function inconclusive(why) {
  console.log('§SUN_COMPASS_WITNESS INCONCLUSIVE — ' + why + '. Nothing was judged; this is not a PASS.');
  process.exit(2);
}
if (!fs.existsSync(DB_SRC)) inconclusive('no building DB at ' + DB_SRC + ' (set SUN_COMPASS_TEST_DB)');
try { execSync('sqlite3 -version', { stdio: 'ignore' }); }
catch (e) { inconclusive('the sqlite3 CLI is not installed'); }

var setupSunPath, setupCpeSunCompass;
try {
  setupSunPath = require(path.join(__dirname, '..', 'sun_path.js')).setupSunPath;
  setupCpeSunCompass = require(path.join(__dirname, '..', 'cpe_sun_compass.js')).setupCpeSunCompass;
} catch (e) {
  console.log('§SUN_COMPASS_WITNESS FAIL — cannot load the modules: ' + e.message);
  process.exit(1);
}

// ── The REAL georef of Hospital_IFC2x3_ARC.ifc, as bim-compiler's own extractor reports it ──────
// (scripts/witness_georef_extract.py asserts these same numbers against the source IFC). Using the
// real values rather than round ones means a sign or unit slip lands somewhere recognisable.
var REAL = { tn: 5.0, lat: 42.35842896, lon: -71.05977631, elev: 165.8112 };

// ── A minimal THREE. Only what cpe_sun_compass.js actually calls. ───────────────────────────────
function makeThree() {
  function V3(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
  V3.prototype.clone = function () { return new V3(this.x, this.y, this.z); };
  // A deliberately trivial orthographic projection. The composite path's job under test is
  // "does the text reach the 2D context", not "is the perspective matrix right" — but returning
  // the world point unprojected (the first cut here) left z at the model's own Y of ~157, the
  // real `z < 1` in-front-of-camera guard rejected it, and three checks passed VACUOUSLY by
  // drawing nothing. A stub that makes the code under test skip itself is not a stub.
  V3.prototype.project = function (cam) {
    var c = cam || { tx: 0, ty: 0, s: 1 };
    return new V3((this.x - c.tx) / c.s, (this.y - c.ty) / c.s, 0.5);
  };
  function Group() { this.children = []; this.name = ''; }
  Group.prototype.add = function (o) { this.children.push(o); };
  Group.prototype.traverse = function (fn) { this.children.forEach(fn); fn(this); };
  function BufferGeometry() { this.points = []; }
  BufferGeometry.prototype.setFromPoints = function (p) { this.points = p.slice(); return this; };
  BufferGeometry.prototype.dispose = function () {};
  function Line(g, m) { this.geometry = g; this.material = m; this.visible = true; }
  function LineBasicMaterial(o) { this.opts = o; this.dispose = function () {}; }
  return { Vector3: V3, Group: Group, BufferGeometry: BufferGeometry, Line: Line,
           LineBasicMaterial: LineBasicMaterial };
}

// ── A real DB, with the georef rows this witness is about written into a throwaway copy. ────────
// The SHIPPED Hospital_extracted.db has no true_north_angle row at all (checked 2026-09-18) —
// which is itself the defect's fingerprint, and the reason buildings/patches/*.sql exists.
function makeApp(dbPath) {
  var A = {};
  A.modelOffset = { x: 0, y: 0, z: 0 };
  A.ifc2three = function (ix, iy, iz) {
    return { x: ix - A.modelOffset.x, y: iz - A.modelOffset.z, z: -(iy - A.modelOffset.y) };
  };
  A.ifc2threeDir = function (ix, iy, iz) { return { x: ix, y: iz, z: -iy }; };
  A.three2ifcDir = function (x, y, z) { return { ix: x, iy: -z, iz: y }; };
  A.scene = { objs: [], add: function (o) { this.objs.push(o); },
              remove: function (o) { this.objs = this.objs.filter(function (q) { return q !== o; }); } };
  A.camera = {};
  A.dbQuery = function (sql) {
    var out = execFileSync('sqlite3', ['-noheader', '-separator', SEP, dbPath, sql],
                           { maxBuffer: 1 << 28 }).toString();
    if (!out.trim()) return [];
    return out.replace(/\n$/, '').split('\n').map(function (l) { return l.split(SEP); });
  };
  setupSunPath(A);
  setupCpeSunCompass(A);
  return A;
}

function prepDb(rows) {
  var tmp = path.join(os.tmpdir(), 'wsc_' + process.pid + '_' + Math.random().toString(36).slice(2) + '.db');
  fs.copyFileSync(DB_SRC, tmp);
  var sql = 'CREATE TABLE IF NOT EXISTS project_metadata (key TEXT PRIMARY KEY, value TEXT);\n';
  Object.keys(rows).forEach(function (k) {
    sql += "INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('" + k + "','" +
           String(rows[k]).replace(/'/g, "''") + "');\n";
  });
  execFileSync('sqlite3', [tmp], { input: sql });
  return tmp;
}

var fails = 0, checks = 0, tmps = [];
function check(name, got, want, tol, note) {
  checks++;
  var ok = (typeof got === 'number' && isFinite(got) && Math.abs(got - want) <= tol);
  if (!ok) fails++;
  console.log('  §SC ' + (ok ? 'ok   ' : 'WRONG') + ' ' + name + ' = ' +
    (typeof got === 'number' ? got.toFixed(6) : String(got)) +
    ' (want ' + want + ' +-' + tol + ')' + (note ? '   ' + note : ''));
}
function truth(name, cond, detail) {
  checks++;
  if (!cond) fails++;
  console.log('  §SC ' + (cond ? 'ok   ' : 'WRONG') + ' ' + name + (detail ? '   ' + detail : ''));
}

global.window = { THREE: makeThree() };

console.log('§SUN_COMPASS_WITNESS db=' + DB_SRC);

// ── CASE A: a fully geo-referenced building. ────────────────────────────────────────────────────
var dbA = prepDb({ true_north_angle: REAL.tn, true_north_source: 'ifc_truenorth',
                   site_latitude: REAL.lat, site_longitude: REAL.lon,
                   site_elevation_m: REAL.elev, site_latlong_source: 'ifc_site' });
tmps.push(dbA);
var A = makeApp(dbA);
var built = A.sunCompassBuild();
truth('a geo-referenced building builds a rose', !!built);
if (!built) {
  console.log('§SUN_COMPASS_WITNESS FAIL — nothing built on a fully geo-referenced DB; ' +
              'the checks below cannot run');
  tmps.forEach(function (f) { try { fs.unlinkSync(f); } catch (e) {} });
  process.exit(1);
}
check('rose reads back the extracted latitude', built.lat, REAL.lat, 1e-8);
check('rose reads back the extracted longitude', built.lon, REAL.lon, 1e-8);
check('rose reads back the extracted true north', built.trueNorth, REAL.tn, 1e-9);
truth('the rose is a real object in the scene', A.scene.objs.length === 1 &&
      A.scene.objs[0].name === 'sunCompassRose',
      'scene objects=' + A.scene.objs.length);
truth('the rose has geometry (ring, ticks, needle, sun)', A.scene.objs[0].children.length > 20,
      'lines=' + A.scene.objs[0].children.length);

// The anchor must be OUTSIDE the building, or the rose is buried under it the moment it is built.
(function () {
  var ext = A.dbQuery('SELECT MIN(t.center_x-t.bbox_x/2),MAX(t.center_x+t.bbox_x/2),' +
    'MIN(t.center_y-t.bbox_y/2),MAX(t.center_y+t.bbox_y/2),MIN(t.center_z-t.bbox_z/2) ' +
    'FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid ' +
    "WHERE m.ifc_class IN ('IfcColumn','IfcPile','IfcWall','IfcWallStandardCase','IfcSlab'," +
    "'IfcBeam','IfcFooting','IfcCurtainWall','IfcRoof')")[0].map(Number);
  var a = built.anchor;
  var outside = a.ix < ext[0] || a.ix > ext[1] || a.iy < ext[2] || a.iy > ext[3];
  truth('the rose sits OUTSIDE the structural envelope', outside,
        'anchor=(' + a.ix.toFixed(1) + ',' + a.iy.toFixed(1) + ') envelope x[' +
        ext[0].toFixed(1) + ',' + ext[1].toFixed(1) + '] y[' + ext[2].toFixed(1) + ',' + ext[3].toFixed(1) + ']');
  check('the rose sits on the ground, not floating', a.iz, ext[4] + 0.05, 1e-6);
  // Northern hemisphere -> the equator-facing side is TRUE SOUTH. true_north_angle is the bearing
  // of MODEL north measured from TRUE north, so a TRUE bearing converts to a MODEL bearing by
  // SUBTRACTING it (the same relation sitecam.js:81 applies): true south, 180 deg, is model
  // bearing 180 - 5 = 175 deg here. Getting this backwards is the exact sign error the spec's §2
  // shipped, so it is asserted rather than eyeballed.
  var cx = (ext[0] + ext[1]) / 2, cy = (ext[2] + ext[3]) / 2;
  var bearing = (Math.atan2(a.ix - cx, a.iy - cy) * 180 / Math.PI + 360) % 360;
  check('the rose is placed on the equator-facing (true-south) side', bearing, 180 - REAL.tn, 0.5,
        'model bearing of the offset');
  truth('the rose radius is sized to this building', built.radius > 3 && built.radius <= 20,
        'radius=' + built.radius.toFixed(2) + 'm');
})();

// ── §8 facade source. Hospital's rotation_z is all zeros, so the bbox-aspect fallback must fire. ──
truth('a facade orientation was resolved', !!built.facade);
if (built.facade) {
  console.log('  §SC info  facade source=' + built.facade.source + ' walls=' + built.facade.walls +
              ' distinct_rotation_z=' + built.facade.distinct);
  truth('an all-zero rotation_z column falls back to the bbox aspect rather than claiming one bearing',
        built.facade.distinct > 1 ? built.facade.source === 'rotation_z'
                                  : built.facade.source === 'bbox_aspect',
        'distinct=' + built.facade.distinct + ' source=' + built.facade.source);
}

// ── CASE A checks 4: the sun IS the 4D cursor's sun, and nothing else. ──────────────────────────
(function () {
  // A real construction-calendar instant: 21 June 2026, mid-afternoon UTC.
  var cursor = Date.UTC(2026, 5, 21, 17, 30);
  var info = A.sunCompassAt(cursor);
  truth('the compass reports a frame at a real cursor', !!info);
  if (!info) { fails++; return; }
  // ⚠ Compared against the LIT INSTANT, not the raw cursor. Since the film clock landed, the
  // compass lights the cursor's DATE at a held solar hour (sun_path.js `sunInstantAtSolarHour`) —
  // the fix for the day/night strobe. These two used to compare against the cursor instant and
  // correctly failed the moment that changed; re-pointed at the contract, not loosened.
  // Built from the hour the compass SAYS it lit (info.solarHour), not from a hardcoded 10 — the
  // hour sweeps with the film fraction now, and hardcoding it made these fail the moment the sweep
  // landed. This is not circular: the claim under test is "the reported sun IS sun_path's answer
  // for the instant the compass reports lighting", and both halves are still checked.
  var lit = A.sunInstantAtSolarHour(REAL.lon, new Date(cursor), info.solarHour);
  var direct = A.sunPositionAt(REAL.lat, REAL.lon, lit);
  check('azimuth is exactly sun_path.js answer for the lit instant', info.azimuth, direct.azimuth, 1e-12);
  check('elevation is exactly sun_path.js answer for the lit instant', info.elevation, direct.elevation, 1e-12);
  check('day-of-year matches the cursor', info.dayOfYear, 172, 0, '21 June 2026');
  truth('the sun is up on a June afternoon in Boston', info.isUp === true,
        'elevation=' + info.elevation.toFixed(2));
  truth('an angle of attack is reported while the sun is up', !!info.attack,
        info.attack ? info.attack.attack.toFixed(1) + 'deg onto ' + info.attack.compass : 'none');
  if (info.attack) {
    truth('the angle of attack is a real angle in range',
          info.attack.attack >= 0 && info.attack.attack <= 90,
          'attack=' + info.attack.attack.toFixed(2) + ' incidence=' + info.attack.incidence.toFixed(2));
    check('attack and incidence are complements', info.attack.attack + info.attack.incidence, 90, 1e-9);
  }

  // BELOW THE HORIZON IS STILL REACHABLE AND MUST STILL BE HANDLED — but a held film hour means a
  // late cursor no longer produces it, so the old "cursor at 05:30" case became vacuous the moment
  // the film clock landed (it silently started asserting a sunlit frame). Retired and replaced by
  // the case that is real at a held hour: POLAR WINTER. Tromso at 10:00 solar on 21 December is
  // -5.5 deg — the sun genuinely does not rise. A rose with a sun ray on it there would be a
  // picture of something that is not happening.
  var down = A.sunPositionAt(69.65, 18.96, A.sunInstantAtSolarHour(18.96, new Date(Date.UTC(2026, 11, 21)), 10));
  truth('polar winter at the film hour really is below the horizon',
        down.isUp === false && down.elevation < 0, 'Tromso 21 Dec: ' + down.elevation.toFixed(2) + ' deg');
  var labelsDown = A.sunCompassLabels({ date: new Date(Date.UTC(2026, 11, 21)), dayOfYear: 355,
                                        isUp: false, attack: null });
  truth('and the readout says so rather than printing an altitude below ground',
        /below the horizon/.test(labelsDown.sun) && labelsDown.attack === null, labelsDown.sun);
})();

// ── CASE A check 3: the text really is composited onto the 2D context. ──────────────────────────
(function () {
  var cursor = Date.UTC(2026, 5, 21, 17, 30);
  var info = A.sunCompassAt(cursor);
  // Aim the stub camera at the rose, so the world-anchored labels project INSIDE the frame and
  // the in-front-of-camera guard passes. Scale is the rose radius, so the needle tip lands about
  // a third of the way out from centre — well inside, nowhere near a clamp.
  A.camera.tx = info.anchorThree.x;
  A.camera.ty = info.anchorThree.y;
  A.camera.s = info.radius * 4;
  var drawn = [];
  var ctx = {
    save: function () {}, restore: function () {}, beginPath: function () {},
    fill: function () {}, fillRect: function () {}, roundRect: function () {},
    measureText: function (t) { return { width: t.length * 7 }; },
    fillText: function (t) { drawn.push(t); },
    globalAlpha: 1, fillStyle: '', font: '', textAlign: '', textBaseline: ''
  };
  A.sunCompassCompositeOntoCanvas(ctx, 1920, 1080, info, 1);
  var joined = drawn.join(' | ');
  truth('the composite emitted text onto the 2D context (not a DOM badge)', drawn.length > 0,
        'drew: ' + joined);
  truth('the day-of-year reaches the exported frame', /day 172 of the year/.test(joined), joined);
  truth('the date reaches the exported frame', /21 Jun/.test(joined), joined);
  // THE COLLISION GUARD. cpe_day_counter.js owns "Day N" — the PROJECT day — in its own corner.
  // This label is the DAY OF THE YEAR. Both were labelled "Day" and appeared in the same frame,
  // which is unreadable. Asserted so the word cannot drift back.
  truth('the compass label does NOT open with "Day" (that word is the project counter\'s)',
        !/\|\s*Day \d/.test(' | ' + joined.replace(/Day \d+ \/ \d+/g, '')), joined);
  truth('the sun angles reach the exported frame', /Sun \d+° az/.test(joined) && /° alt/.test(joined), joined);
  truth('the angle of attack reaches the exported frame', /° onto the \w+ facade/.test(joined), joined);
  truth('the true-north letter N is drawn', drawn.indexOf('N') >= 0, joined);
  // ⚠ THE READOUT MUST NOT DEPEND ON THE ROSE BEING ON SCREEN. A real Hospital frame (camera
  // inside a washroom, ground not in view) showed the sun line present and the DATE gone, because
  // the date was pinned under the rose in world space. All three lines are fixed now. Driven here
  // with NO camera at all, which is the strongest form of "the rose cannot be projected".
  (function () {
    var noCam = [], savedCam = A.camera;
    A.camera = null;
    var ctx2 = {
      save: function () {}, restore: function () {}, beginPath: function () {},
      fill: function () {}, fillRect: function () {}, roundRect: function () {},
      measureText: function (t) { return { width: t.length * 7 }; },
      fillText: function (t) { noCam.push(t); },
      globalAlpha: 1, fillStyle: '', font: '', textAlign: '', textBaseline: ''
    };
    A.sunCompassCompositeOntoCanvas(ctx2, 1920, 1080, info, 1);
    A.camera = savedCam;
    var j2 = noCam.join(' | ');
    truth('with the rose unprojectable, the DATE still draws', /day 172 of the year/.test(j2), j2);
    truth('with the rose unprojectable, the SUN line still draws', /Sun \d+° az/.test(j2), j2);
    truth('with the rose unprojectable, the FACADE line still draws', /onto the \w+ facade/.test(j2), j2);
    truth('and the world-anchored N is correctly skipped', noCam.indexOf('N') < 0, j2);
  })();

  // A below-horizon frame must SAY so rather than print an altitude that reads as nonsense. Driven
  // through the real composite with a hand-built below-horizon info, because at a held film hour
  // this building never sees one — the state is still reachable (polar winter, above) and the
  // drawing path for it must not rot just because Boston cannot produce it.
  drawn.length = 0;
  A.sunCompassCompositeOntoCanvas(ctx, 1920, 1080,
    { date: new Date(Date.UTC(2026, 11, 21)), dayOfYear: 355, isUp: false, attack: null,
      anchorThree: info.anchorThree, trueNorthTip: info.trueNorthTip, radius: info.radius }, 1);
  truth('a below-horizon frame says the sun is below the horizon',
        /below the horizon/.test(drawn.join(' | ')), drawn.join(' | '));
})();

// ── CASE B: TRUE NORTH ACTUALLY DRIVES THE ROSE (issue 1). ──────────────────────────────────────
// Same building, same day, same everything except true_north_angle. If the rose ignored true north
// the needle would land in an identical place and this check is the only one that would notice.
(function () {
  var dbB = prepDb({ true_north_angle: REAL.tn + 30, true_north_source: 'ifc_truenorth',
                     site_latitude: REAL.lat, site_longitude: REAL.lon,
                     site_elevation_m: REAL.elev, site_latlong_source: 'ifc_site' });
  tmps.push(dbB);
  var B = makeApp(dbB);
  var b = B.sunCompassBuild();
  truth('the 30-degree-rotated twin also builds', !!b);
  if (!b) { fails++; return; }
  var cursor = Date.UTC(2026, 5, 21, 17, 30);
  var ia = A.sunCompassAt(cursor), ib = B.sunCompassAt(cursor);
  // The SUN does not move — it is a function of lat/long/time, not of the model's rotation.
  check('the sun itself is unchanged by the model rotation', ib.azimuth, ia.azimuth, 1e-12);
  // The NEEDLE does move, by exactly 30 degrees, in model space.
  function needleBearing(info, app) {
    var d = app.three2ifcDir(info.trueNorthTip.x - info.anchorThree.x,
                             info.trueNorthTip.y - info.anchorThree.y,
                             info.trueNorthTip.z - info.anchorThree.z);
    return (Math.atan2(d.ix, d.iy) * 180 / Math.PI + 360) % 360;
  }
  var na = needleBearing(ia, A), nb = needleBearing(ib, B);
  check('the true-north needle swings by exactly the true-north difference',
        ((na - nb) + 540) % 360 - 180, 30, 1e-6,
        'needle model bearing ' + na.toFixed(4) + ' vs ' + nb.toFixed(4));
  truth('and it is NOT simply model north in both cases', Math.abs(na - nb) > 1,
        'if this fails, true_north_angle is being ignored');
})();

// ── CASE T8: the end-to-end gate a peer session added to the spec as T8 (§10.8). ────────────────
// Two of its three bullets were NOT covered by the checks above, and both gaps are real:
//   T8.2 "extraction-to-render agreement" — the checks above prove the needle MOVES by the right
//        DIFFERENCE between two twins. They never assert its ABSOLUTE bearing against Hospital's
//        own extracted +5 deg. A renderer with a constant offset baked in would pass every one of
//        them and still point the wrong way on every building.
//   T8.3 "internal cross-consistency" — the day-of-year text, the angle-of-attack readout and the
//        rose's own orientation must all trace to ONE (date, lat, lon) read for that frame, not to
//        three reads that happen to agree today.
// ⚠ T8.2 as the spec words it asks for `compassGroup.rotation.y`. THERE IS NO SUCH PROPERTY HERE,
// and looking for one would read a permanent 0 and "pass". The rose is built from world-space
// points — the bearing is baked into the vertex positions, not carried on a group transform. So
// the assertion is made where the number actually lives: the needle tip's bearing relative to the
// anchor, converted back to model space. Same fact, read off the thing that really carries it.
(function () {
  var cursor = Date.UTC(2026, 5, 21, 17, 30);
  var info = A.sunCompassAt(cursor);
  if (!info) { truth('T8: a frame is available to judge', false); return; }

  // T8.2 — ABSOLUTE agreement between the extracted value and what was rendered.
  var d = A.three2ifcDir(info.trueNorthTip.x - info.anchorThree.x,
                         info.trueNorthTip.y - info.anchorThree.y,
                         info.trueNorthTip.z - info.anchorThree.z);
  var needleModelBearing = ((Math.atan2(d.ix, d.iy) * 180 / Math.PI) + 540) % 360 - 180;
  // true_north_angle is the bearing of MODEL north from TRUE north, so TRUE north sits at model
  // bearing -true_north_angle. Hospital's extracted value is +5 deg, so the needle must read -5.
  check('T8.2 the rendered true-north needle equals the EXTRACTED true north, absolutely',
        needleModelBearing, -REAL.tn, 1e-6,
        'needle model bearing vs -true_north_angle; a constant renderer offset dies here');
  truth('T8.2 the bearing is carried by geometry, not a group rotation that could read 0',
        A.scene.objs[0].rotation === undefined,
        'sunCompassRose has no .rotation — reading compassGroup.rotation.y would assert nothing');

  // T8.3 — ONE (date, lat, lon) behind all three readouts, asserted in a single pass.
  var labels = A.sunCompassLabels(info);
  var direct = A.sunPositionAt(built.lat, built.lon,
                               A.sunInstantAtSolarHour(built.lon, new Date(cursor), info.solarHour));
  truth('T8.3 the day-of-year label is the cursor\'s own day',
        labels.day.indexOf('day ' + A.sunDayOfYear(new Date(cursor)) + ' of the year') > 0,
        labels.day);
  check('T8.3 the rose\'s sun bearing is that same lit instant\'s azimuth', info.azimuth,
        direct.azimuth, 1e-12);
  // The angle of attack must be reproducible from the SAME sun direction the rose was drawn with
  // and the SAME facade the build resolved — recomputed here from first principles rather than
  // read back off the object that produced it.
  if (info.attack) {
    var sunDir = A.sunDirectionThree(direct.azimuth, direct.elevation, built.trueNorth);
    var faces = A.wallFaceNormalsThree(built.facade.rz);
    var r0 = A.sunIncidenceDeg(sunDir, faces[0]), r1 = A.sunIncidenceDeg(sunDir, faces[1]);
    var lit = (r0.incidence <= r1.incidence) ? r0 : r1;
    check('T8.3 the angle-of-attack readout recomputes from that same instant and facade',
          info.attack.attack, lit.attack, 1e-12);
    truth('T8.3 the readout text carries that same number',
          labels.attack.indexOf(info.attack.attack.toFixed(0) + '°') === 0, labels.attack);
  }
  // And the whole frame must move together: a different cursor must change the day AND the sun.
  var other = A.sunCompassAt(Date.UTC(2026, 11, 21, 17, 30));
  truth('T8.3 a different cursor moves the day AND the sun together',
        other.dayOfYear !== info.dayOfYear && Math.abs(other.elevation - info.elevation) > 1,
        'day ' + info.dayOfYear + '->' + other.dayOfYear +
        ', elevation ' + info.elevation.toFixed(1) + '->' + other.elevation.toFixed(1));
  A.sunCompassAt(cursor);   // leave the module on the cursor the later cases expect
})();

// ── CASE FILM CLOCK: the season moves, the hour does not. ──────────────────────────────────────
// THE DEFECT THIS EXISTS FOR, measured on a real 8-frame Hospital bake before the fix: feeding the
// 4D cursor straight to the sun gave elevation 30.4, then -33.7 (night), then 18.2, then 43.8 —
// day, night, day, day, in four consecutive frames. Astronomically perfect and a strobe, because
// 390 days of programme are played in 80 seconds so each frame lands at an unrelated hour.
(function () {
  var els = [], azs = [], days = [];
  for (var m = 0; m < 12; m++) {
    var info = A.sunCompassAt(Date.UTC(2026, m, 15, (m * 7) % 24, (m * 13) % 60));
    els.push(info.elevation); azs.push(info.azimuth); days.push(info.dayOfYear);
  }
  truth('every month of the film is lit with the sun UP — no day/night strobe',
        els.every(function (e) { return e > 0; }),
        'elevation range ' + Math.min.apply(null, els).toFixed(1) + '..' + Math.max.apply(null, els).toFixed(1));
  // The hour is held even though the cursors above deliberately carry wildly different times.
  var swing = Math.max.apply(null, els) - Math.min.apply(null, els);
  truth('the SEASON still moves the sun (that is the whole point)', swing > 20,
        'elevation swings ' + swing.toFixed(1) + ' deg across the year');
  truth('and the azimuth drifts with it too',
        Math.max.apply(null, azs) - Math.min.apply(null, azs) > 15,
        'azimuth ' + Math.min.apply(null, azs).toFixed(1) + '..' + Math.max.apply(null, azs).toFixed(1));
  // Frame-to-frame smoothness is the property the strobe violated: no two adjacent months may
  // jump the way 30.4 -> -33.7 did.
  var maxJump = 0;
  for (var i = 1; i < els.length; i++) maxJump = Math.max(maxJump, Math.abs(els[i] - els[i - 1]));
  truth('no frame-to-frame elevation jump anywhere near the 64 deg the strobe produced',
        maxJump < 20, 'largest month-to-month step ' + maxJump.toFixed(1) + ' deg');

  // The LABEL must still be the cursor's own calendar day — holding the hour must not move the date.
  var cur = Date.UTC(2026, 9, 12, 23, 30);
  var i2 = A.sunCompassAt(cur);
  truth('the date shown is still the cursor\'s date, not the lit instant\'s',
        i2.dayOfYear === A.sunDayOfYear(new Date(cur)) &&
        A.sunCompassLabels(i2).day.indexOf('12 Oct') === 0, A.sunCompassLabels(i2).day);
  truth('the instant actually lit is reported, so the log is not ambiguous',
        !!i2.shownAt && i2.solarHour >= 9 && i2.solarHour <= 17,
        String(i2.shownAt) + ' at ' + i2.solarHour + ':00 solar');

  // THE SWEEP. red1: "capturing only a subset ie different times of the day to give a perception
  // of a single half day". The film fraction moves the solar hour morning -> late afternoon, so
  // the sun must RISE, PEAK and FALL across the film rather than sit at one height.
  var arc = [];
  for (var f = 0; f <= 8; f++) {
    arc.push(A.sunCompassAt(Date.UTC(2026, 0, 1) + (f / 8) * 390 * 86400000, f / 8));
  }
  var elArc = arc.map(function (a) { return a.elevation; });
  var peak = elArc.indexOf(Math.max.apply(null, elArc));
  truth('the sun ARCS across the film — rises, peaks, falls', peak > 0 && peak < elArc.length - 1,
        'peak at frame ' + peak + ' of ' + (elArc.length - 1) + ': ' +
        elArc.map(function (e) { return e.toFixed(0); }).join(' '));
  truth('the solar hour really does sweep with the film fraction',
        arc[0].solarHour < arc[arc.length - 1].solarHour,
        arc[0].solarHour.toFixed(1) + ':00 -> ' + arc[arc.length - 1].solarHour.toFixed(1) + ':00 solar');
  truth('a bare call with no film fraction still works (mid-day, not a crash)',
        A.sunCompassAt(Date.UTC(2026, 5, 21)).solarHour === 13);

  // THE ALL-DARK GUARD. red1: "if all does end up dark, then it is a 'buggy' case". Boston is lit,
  // so the report must NOT cry wolf here — a guard that fires on a good film is worse than none.
  var rep = A.sunCompassDarkReport();
  truth('the light report counts real frames and does not cry wolf on a lit film',
        rep && rep.total > 0 && rep.lit > 0 && rep.allDark === false,
        rep ? 'lit=' + rep.lit + ' dark=' + rep.dark : 'no report');

  A.sunCompassAt(Date.UTC(2026, 5, 21, 17, 30), 0.5);
})();

// ── CASE §SUN_CLOCK: the analogue face in the day-counter column. ──────────────────────────────
// red1 asked for hour/minute hands showing the time the frame is lit at, in the counter's corner,
// and confirmed it "ties in with the compass toggled ON". So: it must read the SAME solar hour the
// sun was computed from (a clock that disagrees with its own sun is worse than no clock), it must
// report its drawn height so the boxes stacked below cannot land on top of it, and it must draw
// nothing at all when there is no cursor.
(function () {
  function recorder() {
    var rec = { text: [], lines: [], arcs: [] };
    var cx = 0, cy = 0;
    rec.ctx = {
      save: function () {}, restore: function () {}, beginPath: function () {},
      fill: function () {}, fillRect: function () {}, stroke: function () {},
      arc: function (x, y, r) { rec.arcs.push({ x: x, y: y, r: r }); },
      moveTo: function (x, y) { cx = x; cy = y; },
      lineTo: function (x, y) { rec.lines.push({ x0: cx, y0: cy, x1: x, y1: y }); },
      measureText: function (t) { return { width: t.length * 7 }; },
      fillText: function (t) { rec.text.push(t); },
      globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '',
      font: '', textAlign: '', textBaseline: ''
    };
    return rec;
  }
  function draw(info, pos, stackY) {
    var r = recorder();
    r.h = A.sunClockCompositeOntoCanvas(r.ctx, 1280, 720, info, 1, pos || 'tr', stackY || 0);
    return r;
  }

  var morning = A.sunCompassAt(Date.UTC(2026, 5, 21), 0.0);     // 09:00 solar
  var evening = A.sunCompassAt(Date.UTC(2026, 5, 21), 1.0);     // 17:00 solar
  var rm = draw(morning), re = draw(evening);

  truth('the clock draws a dial', rm.arcs.length >= 1 && rm.lines.length >= 12,
        rm.arcs.length + ' arcs, ' + rm.lines.length + ' lines');
  truth('it reads the SAME hour the sun was computed at, and says it is solar',
        rm.text.join(' ') === '09:00 solar', rm.text.join(' ') + ' vs solarHour=' + morning.solarHour);
  truth('and it moves with the film', re.text.join(' ') === '17:00 solar', re.text.join(' '));
  truth('it reports its drawn height so the stack below cannot overlap it', rm.h > 0, 'h=' + rm.h);

  // The HANDS must actually move, not just the caption — a dial with static hands beside a moving
  // caption is the kind of thing that ships and reads as broken.
  function handEnds(r) {
    // the last two lines drawn are the hour and minute hands (ticks come first)
    return r.lines.slice(-2).map(function (L) {
      return Math.round(Math.atan2(L.x1 - L.x0, L.y0 - L.y1) * 180 / Math.PI);
    });
  }
  var hm = handEnds(rm), he = handEnds(re);
  truth('the hour hand moves between morning and evening', hm[0] !== he[0],
        'hour hand ' + hm[0] + '° -> ' + he[0] + '°');
  // 09:00 -> hour hand at 270°(=-90), 17:00 -> 150°. Checked as a real bearing, not just "differs".
  truth('the hour hand points where 09:00 belongs on a dial', Math.abs(hm[0]) === 90,
        String(hm[0]));

  // Corner + stack offset must be honoured, or it lands on the counter.
  var top = draw(morning, 'tr', 0), lower = draw(morning, 'tr', 200);
  truth('a stack offset moves it down the column',
        lower.arcs[0].y - top.arcs[0].y === 200,
        'dy=' + (lower.arcs[0].y - top.arcs[0].y));
  var left = draw(morning, 'tl', 0);
  truth('the left corner really is a different corner', left.arcs[0].x < top.arcs[0].x,
        'tl x=' + left.arcs[0].x.toFixed(0) + '  tr x=' + top.arcs[0].x.toFixed(0));

  // No cursor -> no clock. There is no time to show, and a dial reading 13:00 would be invented.
  truth('no 4D cursor -> no clock at all', draw(A.sunCompassAt(null)).h === 0);
  A.sunCompassAt(Date.UTC(2026, 5, 21, 17, 30), 0.5);
})();

// ── CASE §HUD_COLUMN: the readout lives in the day-counter column now. ───────────────────────
// It used to be a fixed bottom-left block, and a real 1852x960 frame showed it drawn UNDERNEATH
// the loadpath session's own room box in that same corner. Reserving space against the centred
// caption was the wrong shape — that caption has since been deleted by that same work. Joining
// the column instead makes collision impossible by construction: one owner of the corner, every
// box asks for its offset and returns its height.
(function () {
  function rec() {
    var r={boxes:[],text:[]};
    r.ctx={save:function(){},restore:function(){},beginPath:function(){},fill:function(){},
      fillRect:function(x,y,w,h){r.boxes.push({x:x,y:y,w:w,h:h});},
      roundRect:function(x,y,w,h){r.boxes.push({x:x,y:y,w:w,h:h});},
      measureText:function(t){return {width:t.length*7};},fillText:function(t){r.text.push(t);},
      arc:function(){},moveTo:function(){},lineTo:function(){},stroke:function(){},
      globalAlpha:1,fillStyle:'',strokeStyle:'',lineWidth:1,font:'',textAlign:'',textBaseline:''};
    return r;
  }
  var info = A.sunCompassAt(Date.UTC(2026, 5, 21, 12, 0), 0.5);
  A.camera = null;   // no rose projection; only the readout draws

  var top = rec(); var h1 = A.sunCompassCompositeOntoCanvas(top.ctx, 1852, 960, info, 1, 'tr', 0);
  truth('the readout draws three plates', top.boxes.length === 3, top.boxes.length + ' plates');
  truth('it reports its own height so the column can stack under it', h1 > 0, 'h=' + h1);
  truth('it is in the TOP of the frame, not the bottom corner someone else owns',
        Math.max.apply(null, top.boxes.map(function (b) { return b.y + b.h; })) < 960 * 0.35,
        'lowest y=' + Math.max.apply(null, top.boxes.map(function (b) { return b.y + b.h; })).toFixed(0));

  var off = rec(); A.sunCompassCompositeOntoCanvas(off.ctx, 1852, 960, info, 1, 'tr', 300);
  truth('a stack offset moves it down the column by exactly that much',
        Math.round(off.boxes[0].y - top.boxes[0].y) === 300,
        'dy=' + Math.round(off.boxes[0].y - top.boxes[0].y));

  var left = rec(); A.sunCompassCompositeOntoCanvas(left.ctx, 1852, 960, info, 1, 'tl', 0);
  truth('it follows the counter to the other corner', left.boxes[0].x < top.boxes[0].x,
        'tl x=' + left.boxes[0].x.toFixed(0) + '  tr x=' + top.boxes[0].x.toFixed(0));

  // Right-aligned corners must not run off the edge — the plate is sized to the widest line.
  truth('the right-corner plate stays inside the frame',
        top.boxes[0].x > 0 && top.boxes[0].x + top.boxes[0].w <= 1852,
        'x=' + top.boxes[0].x.toFixed(0) + ' w=' + top.boxes[0].w.toFixed(0));
  A.camera = {};
})();

// ── CASE §129.1 FREEZE: the load-path hold clears this overlay too. ──────────────────────────
// red1, 2026-09-19: "Freeze removes all other overlays including geo-ref". The HUD half is handled
// by cinema_maxq wrapping both composites in _drawUnlessHold, like the other 15 overlays. The ROSE
// is the half a HUD fade CANNOT reach — it is a scene object, so without this it would be the one
// thing left standing on a deliberately cleared frame.
(function () {
  var saved = A._loadPathHudAlpha;
  var grp = A.scene.objs[0];
  A._loadPathHudAlpha = 1;
  A.sunCompassAt(Date.UTC(2026, 5, 21, 12, 0), 0.5);
  truth('outside the freeze the rose is visible', grp.visible === true);
  var live = A.sunCompassAt(Date.UTC(2026, 5, 21, 12, 0), 0.30);
  A._loadPathHudAlpha = 0;
  // The film's own fraction marches on underneath a held frame — feed it a LATER one and a LATER
  // cursor, which is exactly what the bake does during the freeze.
  var held = A.sunCompassAt(Date.UTC(2026, 8, 1, 12, 0), 0.80);
  truth('during the freeze the ROSE is hidden, not just the HUD', grp.visible === false);
  truth('the CLOCK is frozen too — the hour does not advance behind a held frame',
        held.solarHour === live.solarHour, live.solarHour + ' -> ' + held.solarHour);
  truth('and neither does the sun or the date',
        held.azimuth === live.azimuth && held.dayOfYear === live.dayOfYear,
        'az ' + live.azimuth.toFixed(2) + ' -> ' + held.azimuth.toFixed(2));
  A._loadPathHudAlpha = 0.4;
  A.sunCompassAt(Date.UTC(2026, 8, 1, 12, 0), 0.85);
  truth('mid-fade counts as the freeze — no half-drawn rose', grp.visible === false, 'alpha 0.4');
  A._loadPathHudAlpha = saved;
  var back = A.sunCompassAt(Date.UTC(2026, 8, 1, 12, 0), 0.90);
  truth('and it comes BACK afterwards — the hold is not a one-way latch', grp.visible === true);
  truth('resuming picks up the NEXT PROPER FRAME, not where it was held',
        back.solarHour !== held.solarHour && Math.abs(back.solarHour - (9 + 8 * 0.90)) < 1e-9,
        'resumed at ' + back.solarHour.toFixed(2) + ':00 solar for film t=0.90');
})();

// ── CASE §SUN_DAY: one pinned day, swept — red1's "new day film scheme". ───────────────────────
// Pinning a date must change WHAT IS LIT and nothing else. The build still follows the 4D cursor,
// so the counter keeps counting real project days while the light stays on the chosen day — and
// the readout must then print the LIT day, or it and the counter describe different days with no
// way to tell which is which.
(function () {
  A.sunCompassSetDate('2026-06-21');           // midsummer, northern hemisphere
  var arc = [];
  for (var f = 0; f <= 8; f++) {
    // cursors spread across a whole year — every one of them must be ignored for LIGHTING
    arc.push(A.sunCompassAt(Date.UTC(2026, 0, 1) + (f / 8) * 365 * 86400000, f / 8));
  }
  truth('a pinned date is reported as pinned', arc[0].pinnedDate === true);
  truth('every frame is lit on the pinned day, whatever the cursor says',
        arc.every(function (a) { return a.dayOfYear === 172; }),
        'day-of-year values: ' + arc.map(function (a) { return a.dayOfYear; }).join(','));
  truth('and the readout prints that day, not the cursor\'s',
        A.sunCompassLabels(arc[0]).day.indexOf('21 Jun') === 0, A.sunCompassLabels(arc[0]).day);

  // THE POINT OF PINNING: one clean arc instead of the season fighting the clock. Unpinned over a
  // year the elevations climb and dip (measured on a real bake: 45 22 26 47 60 49 23 6); on one
  // day they must rise to a single peak and fall.
  var el = arc.map(function (a) { return a.elevation; });
  var peak = el.indexOf(Math.max.apply(null, el));
  var rises = el.slice(0, peak + 1).every(function (v, i, A2) { return i === 0 || v >= A2[i - 1]; });
  var falls = el.slice(peak).every(function (v, i, A2) { return i === 0 || v <= A2[i - 1]; });
  truth('one pinned day gives ONE clean arc — rises to a single peak, then falls',
        rises && falls && peak > 0 && peak < el.length - 1,
        el.map(function (e) { return e.toFixed(0); }).join(' ') + ', peak at ' + peak);

  // Clearing it must restore the 4D-driven dates, or the field is a one-way door.
  A.sunCompassSetDate('');
  var back = A.sunCompassAt(Date.UTC(2026, 9, 12), 0.5);
  truth('clearing the date follows the 4D timeline again',
        back.pinnedDate === false && back.dayOfYear === A.sunDayOfYear(new Date(Date.UTC(2026, 9, 12))),
        'day ' + back.dayOfYear);

  // Junk must not become a silent wrong day. Parsed as UTC so a browser timezone cannot shift it.
  truth('a malformed date is refused, not guessed', A.sunCompassSetDate('21 June') === null);
  truth('and an impossible one too', A.sunCompassSetDate('2026-13-45') === null);
  truth('after a refusal the film follows the 4D timeline rather than a half-set date',
        A.sunCompassAt(Date.UTC(2026, 9, 12), 0.5).pinnedDate === false);
  A.sunCompassSetDate('2026-01-01');
  truth('the date is read as UTC, so no timezone can shift the day',
        A.sunCompassAt(Date.UTC(2026, 6, 4), 0.5).dayOfYear === 1);
  A.sunCompassSetDate('');
  A.sunCompassAt(Date.UTC(2026, 5, 21, 17, 30), 0.5);
})();

// ── CASE NO-CURSOR: a film with no buildup has no 4D date. Fixed 2026-09-19. ────────────────────
// THE DEFECT THIS EXISTS FOR, found by looking at a real baked frame and not by any witness:
// cinema_maxq.js called sunCompassAt from INSIDE `if (_buildup && _bkState)`, so a bake with the
// buildup off never called it at all — `§SUN_COMPASS built` printed at arm time, every witness
// passed, and the exported frames carried no overlay. The call is hoisted now, and it is handed
// null when there is no cursor. These checks pin the behaviour at that end.
(function () {
  var info = A.sunCompassAt(null);
  truth('no-cursor: the rose still reports (true north is a property of the building)', !!info);
  if (!info) { fails++; return; }
  truth('no-cursor: flagged as such rather than faked', info.noCursor === true);
  truth('no-cursor: NO date is invented', info.date === null && info.dayOfYear === null);
  truth('no-cursor: NO sun is invented', info.azimuth === null && info.elevation === null &&
        info.isUp === false && info.attack === null);
  truth('no-cursor: the needle is still positioned', !!info.trueNorthTip && !!info.anchorThree);

  var labels = A.sunCompassLabels(info);
  truth('no-cursor: the label says what IS true', labels.day === 'True north');
  truth('no-cursor: and says the sun is not shown, rather than going blank',
        /no 4d date/i.test(labels.sun) && labels.attack === null, labels.sun);

  // It must go back to a real reading on the next cursor — a latched no-cursor state would kill
  // the overlay for the rest of the film.
  var back = A.sunCompassAt(Date.UTC(2026, 5, 21, 17, 30));
  truth('no-cursor is not sticky — a real cursor restores the sun',
        back && back.noCursor !== true && back.isUp === true && !!back.attack);
  truth('an invalid date is treated as no-cursor, not as a crash',
        A.sunCompassAt(NaN) !== null && A.sunCompassAt(NaN).noCursor === true);
  A.sunCompassAt(Date.UTC(2026, 5, 21, 17, 30));   // leave it on a real cursor
})();

// ── CASE C: §4 — no known location means NOTHING is drawn (issue 2, the NO-OP guard). ───────────
(function () {
  var dbC = prepDb({ true_north_angle: 0, true_north_source: 'default_zero',
                     site_latitude: '', site_longitude: '',
                     site_elevation_m: '', site_latlong_source: 'unknown' });
  tmps.push(dbC);
  var C = makeApp(dbC);
  var c = C.sunCompassBuild();
  truth('a building with no known location builds NO rose', c === null);
  truth('and adds nothing at all to the scene', C.scene.objs.length === 0,
        'scene objects=' + C.scene.objs.length);
  truth('and reports nothing per frame', C.sunCompassAt(Date.UTC(2026, 5, 21, 17, 30)) === null);

  // The other half of §4: a literal 0/0 written into the DB would be a real place and WOULD draw.
  // That is correct behaviour and is asserted so nobody "fixes" it into a silent rejection — the
  // defence against 0/0 belongs in the WRITER, which never writes it, not in a reader that would
  // also refuse the Gulf of Guinea to a building genuinely there.
  var dbD = prepDb({ true_north_angle: 0, true_north_source: 'ifc_truenorth',
                     site_latitude: '0', site_longitude: '0',
                     site_elevation_m: '0', site_latlong_source: 'ifc_site' });
  tmps.push(dbD);
  var D = makeApp(dbD);
  truth('a building genuinely at 0,0 is still drawn (the guard is in the writer, not the reader)',
        !!D.sunCompassBuild());
})();

// ── CASE E: a legacy DB with no georef keys at all — the state every shipped DB is in today. ────
(function () {
  var tmp = path.join(os.tmpdir(), 'wsc_legacy_' + process.pid + '.db');
  fs.copyFileSync(DB_SRC, tmp);
  tmps.push(tmp);
  execFileSync('sqlite3', [tmp], { input: "DELETE FROM project_metadata WHERE key LIKE 'site_%' " +
    "OR key LIKE 'true_north%';" });
  var E = makeApp(tmp);
  truth('a DB that predates this feature builds no rose and does not throw', E.sunCompassBuild() === null);
})();

tmps.forEach(function (f) { try { fs.unlinkSync(f); } catch (e) {} });
var verdict = fails === 0 ? 'PASS' : 'FAIL';
console.log('§SUN_COMPASS_WITNESS ' + verdict + ' checks=' + checks + ' wrong=' + fails +
            ' db=' + path.basename(DB_SRC));
process.exit(fails === 0 ? 0 : 1);
