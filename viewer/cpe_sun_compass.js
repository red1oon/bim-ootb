/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * cpe_sun_compass.js — §SUN_COMPASS: a TRUE-north compass rose lying on the ground beside the
 * building, with the sun's real position for whatever calendar day the 4D timeline is scrubbed to.
 * Implementing bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §6 + §7 + §8.
 * Witness: W-SUN-COMPASS (viewer/tests/witness_sun_compass.js).
 *
 * ── WORLD-SPACE, NOT A HUD, AND THAT IS THE WHOLE POINT ──────────────────────────────────────
 * The rose is a real THREE group on the real ground plane, depth-tested so the building occludes
 * it. A screen-fixed compass badge would be easier and would prove nothing: it would sit in the
 * corner looking identical whether the true-north wiring worked or not. Anchored to the ground,
 * the alignment is VISIBLY provable — the camera orbits the building during the bake and the
 * needle holds its bearing while everything else swings past it.
 *
 * ── THE SPLIT: 3D GEOMETRY IN THE SCENE, TEXT AS A 2D COMPOSITE ──────────────────────────────
 * Same split cpe_flythru_datum.js uses (3D grid lines + projected 2D annotation), for the reason
 * cpe_day_counter.js's header names: cinema_maxq.js's `_captureFrame` grabs the RENDERER CANVAS
 * only, so a DOM badge looks perfect while editing and is absent from every exported byte. All
 * text here goes through ONE draw routine that both the live preview and the bake call, so the
 * two cannot disagree.
 *
 * ── IT DOES NOT OWN THE DATE, AND MUST NOT ───────────────────────────────────────────────────
 * §6 / Ownership Table discipline: `A.sunCompassAt(cursorMs)` is HANDED the cursor the buildup is
 * already showing (cinema_maxq.js's `_bkMs`, i.e. `_workCursorAt(...)` — the same value
 * cpe_day_counter.js reads). It never looks a date up and must never become a second opinion
 * about when something was built.
 *
 * ── IT DRAWS NOTHING RATHER THAN DRAW SOMETHING WRONG ────────────────────────────────────────
 * No `site_latitude` / `site_longitude` (spec §4: many IFCs carry none, and this project writes
 * that absence as an EMPTY value rather than 0/0) means no sun, so no rose. A compass rose with a
 * sun on it is a claim about a real place; drawing one from a defaulted coordinate would be a
 * confident lie at 24 frames a second. The verdict line says INCONCLUSIVE and says why.
 */
function setupCpeSunCompass(A) {
  if (!A) return;

  var RAD = Math.PI / 180;
  var INK = 0x8899aa;          // same ink as cpe_flythru_datum.js's datum — one drawing language
  var INK_N = 0xe8eef6;        // the true-north needle reads stronger by weight, not by hue
  var INK_SUN = 0xffcc66;      // the one warm colour in the frame; it is the sun
  var _grp = null, _built = false, _info = null, _geo = null, _site = null;
  var _sunRay = null, _sunLift = null, _sunDrop = null, _anchor = null, _radius = 0;
  var _facade = null, _last = null, _disposed = false, _noCursorLogged = false;

  function q(sql) { try { return (A.dbQuery && A.dbQuery(sql)) || []; } catch (e) { return []; } }

  // ── Read the georef the extractor wrote (GEOREF_SUNPATH_COMPASS.md §3). ─────────────────────
  // `true_north_source` / `site_latlong_source` are read too, NOT ignored: they are what tells a
  // real authored "north is north" apart from the hardcoded "0" this feature exists to replace,
  // and a real coordinate apart from an absent one. The §-log prints both so a bake's own log
  // answers "was this building really geo-referenced?" without anyone opening the DB.
  function readGeoref() {
    var out = { trueNorth: 0, trueNorthSource: 'absent', lat: null, lon: null,
                elevM: null, latLongSource: 'absent' };
    var rows = q("SELECT key,value FROM project_metadata WHERE key IN " +
                 "('true_north_angle','true_north_source','site_latitude','site_longitude'," +
                 "'site_elevation_m','site_latlong_source')");
    var m = {};
    rows.forEach(function (r) { m[r[0]] = r[1]; });
    if (m.true_north_angle != null && m.true_north_angle !== '') {
      var tn = parseFloat(m.true_north_angle);
      if (isFinite(tn)) out.trueNorth = tn;
    }
    if (m.true_north_source) out.trueNorthSource = m.true_north_source;
    else if (m.true_north_angle != null) out.trueNorthSource = 'legacy_no_source_key';
    if (m.site_latitude != null && m.site_latitude !== '' &&
        m.site_longitude != null && m.site_longitude !== '') {
      var la = parseFloat(m.site_latitude), lo = parseFloat(m.site_longitude);
      // A parse failure is NOT silently a 0 — 0/0 is a real place, and §4 exists to stop exactly
      // that substitution. Both must be finite and in range or the location stays unknown.
      if (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
        out.lat = la; out.lon = lo;
      }
    }
    if (m.site_elevation_m != null && m.site_elevation_m !== '') {
      var e = parseFloat(m.site_elevation_m);
      if (isFinite(e)) out.elevM = e;
    }
    if (m.site_latlong_source) out.latLongSource = m.site_latlong_source;
    return out;
  }

  // ── Where the building is and how big it is. Same structural-extent query cpe_flythru_datum.js
  // uses, deliberately: the rose must sit beside the SAME envelope the setting-out drawing frames,
  // not beside a second, differently-derived one.
  function readExtent() {
    var r = q("SELECT MIN(t.center_x-t.bbox_x/2),MAX(t.center_x+t.bbox_x/2)," +
              "MIN(t.center_y-t.bbox_y/2),MAX(t.center_y+t.bbox_y/2)," +
              "MIN(t.center_z-t.bbox_z/2),MAX(t.center_z+t.bbox_z/2) " +
              "FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid " +
              "WHERE m.ifc_class IN ('IfcColumn','IfcPile','IfcWall','IfcWallStandardCase'," +
              "'IfcSlab','IfcBeam','IfcFooting','IfcCurtainWall','IfcRoof')")[0];
    if (!r || r[0] == null) return null;
    // Number() every field. sql.js hands these back as numbers, but the sqlite3 CLI (which the
    // witness drives this through) hands back strings, and a string silently survives every
    // arithmetic operator here until it reaches .toFixed() — so the coercion belongs in the
    // reader, not in one of its two callers.
    var n = r.map(Number);
    if (!isFinite(n[0]) || !isFinite(n[4])) return null;
    return { x0: n[0], x1: n[1], y0: n[2], y1: n[3], z0: n[4], z1: n[5] };
  }

  // ── §8 FACADE ORIENTATION — and the spec assumption that turned out to be only half true. ───
  // GEOREF_SUNPATH_COMPASS.md §8 says facade normals are "already derivable from
  // element_transforms.rotation_z". MEASURED 2026-09-18 across the shipped fleet DBs:
  //     Terminal   82 distinct rotation_z, range +-pi   <- real
  //     Hospital    1 distinct (0.0), 63,182 rows       <- not populated
  //     Clinic      1 distinct (0.0)                    <- not populated
  //     Duplex      1 distinct (0.0)                    <- not populated
  //     HHS         1 distinct (0.0)                    <- not populated
  // So rotation_z carries orientation on ONE of five buildings. Rather than ship a readout that
  // silently reports "every facade faces north" on the other four, this falls back to the wall's
  // own BBOX ASPECT, which every one of them does have: a wall longer in X runs east-west and
  // therefore faces +-Y, and vice versa. That is coarse — axis-aligned families only — and it is
  // REAL, which the rotation_z answer on those buildings is not.
  // The chosen source is in the return value and in the §-log. Nothing here guesses.
  function readFacades() {
    var rot = q("SELECT COUNT(DISTINCT ROUND(t.rotation_z,4)) FROM element_transforms t " +
                "JOIN elements_meta m ON m.guid=t.guid " +
                "WHERE m.ifc_class LIKE 'IfcWall%' AND t.rotation_z IS NOT NULL")[0];
    var distinct = rot ? Number(rot[0]) : 0;
    if (distinct > 1) {
      // Bucket to 2 degrees and fold by pi — a wall plane at rz and at rz+pi is the SAME plane,
      // and counting them apart would split one facade family into two half-sized ones.
      var rows = q("SELECT t.rotation_z FROM element_transforms t " +
                   "JOIN elements_meta m ON m.guid=t.guid " +
                   "WHERE m.ifc_class LIKE 'IfcWall%' AND t.rotation_z IS NOT NULL");
      if (rows.length) {
        var bucket = {};
        rows.forEach(function (r) {
          var rz = Number(r[0]);
          if (!isFinite(rz)) return;
          var folded = ((rz % Math.PI) + Math.PI) % Math.PI;
          var k = Math.round(folded / (2 * RAD));
          bucket[k] = (bucket[k] || 0) + 1;
        });
        var bestK = null, bestN = 0, total = 0;
        Object.keys(bucket).forEach(function (k) {
          total += bucket[k];
          if (bucket[k] > bestN) { bestN = bucket[k]; bestK = Number(k); }
        });
        if (bestK != null) {
          return { source: 'rotation_z', rz: bestK * 2 * RAD, walls: total, dominant: bestN,
                   distinct: distinct };
        }
      }
    }
    var asp = q("SELECT SUM(CASE WHEN t.bbox_x>t.bbox_y THEN 1 ELSE 0 END)," +
                "SUM(CASE WHEN t.bbox_y>t.bbox_x THEN 1 ELSE 0 END),COUNT(*) " +
                "FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid " +
                "WHERE m.ifc_class LIKE 'IfcWall%' AND t.bbox_x IS NOT NULL " +
                "AND t.bbox_y IS NOT NULL")[0];
    if (!asp || !Number(asp[2])) return null;      // VACUOUS: no walls to orient anything from
    var alongX = Number(asp[0]), alongY = Number(asp[1]);
    // A wall running along X faces +-Y, which is rotation_z = 0 in wallFaceNormalsThree's terms.
    return { source: 'bbox_aspect', rz: alongX >= alongY ? 0 : Math.PI / 2,
             walls: Number(asp[2]), dominant: Math.max(alongX, alongY), distinct: distinct,
             alongX: alongX, alongY: alongY };
  }

  function V(T, o) { return new T.Vector3(o.x, o.y, o.z); }

  // ── BUILD: the rose, once per building load. ────────────────────────────────────────────────
  A.sunCompassBuild = function () {
    if (_built) return _info;
    _built = true;
    _disposed = false;
    var T = window.THREE;
    if (!T || !A.scene || typeof A.ifc2three !== 'function' || typeof A.sunPositionAt !== 'function') {
      console.log('§SUN_COMPASS INCONCLUSIVE — no THREE/scene/ifc2three/sun_path.js; nothing judged');
      return null;
    }
    _geo = readGeoref();
    if (_geo.lat == null || _geo.lon == null) {
      // The honest stop. Not a failure of this module — a statement about the source IFC.
      console.log('§SUN_COMPASS INCONCLUSIVE — no site latitude/longitude in project_metadata ' +
        '(site_latlong_source=' + _geo.latLongSource + '); a sun path needs a real place and this ' +
        'building has none. Nothing drawn — a rose from a defaulted coordinate would be a confident ' +
        'lie. Fix at the source: re-extract with DAGCompiler/python/extractIFCtoDB.py, or ship a ' +
        'buildings/patches/<name>_extracted.db.sql row.');
      _info = null;
      return null;
    }
    var ext = readExtent();
    if (!ext) {
      console.log('§SUN_COMPASS VACUOUS — no structural extent to place a rose beside');
      _info = null;
      return null;
    }

    var spanX = ext.x1 - ext.x0, spanY = ext.y1 - ext.y0;
    var diag = Math.sqrt(spanX * spanX + spanY * spanY);
    // Rose size, from THIS building rather than a constant: big enough to read on a 1080p frame
    // of a small house, capped so it does not become a landing pad next to a terminal.
    _radius = Math.max(3, Math.min(0.10 * diag, 20));
    var cx = (ext.x0 + ext.x1) / 2, cy = (ext.y0 + ext.y1) / 2;

    // WHERE THE ROSE SITS — derived, not picked. It goes on the EQUATOR-FACING side: true south
    // in the northern hemisphere, true north in the southern. That is the side the sun is on, so
    // it is the side a viewer following the sun path is already looking at, and it is the one
    // choice here that falls out of the site's own latitude instead of someone's taste.
    var faceBearing = _geo.lat >= 0 ? 180 : 0;
    var away = A.bearingDirectionThree(faceBearing, _geo.trueNorth);   // a three-space direction
    var offset = diag / 2 + _radius * 1.6;
    // Back through the DIRECTION converter's inverse: the anchor is wanted in IFC space so the
    // ground Z is the model's own ground, and three2ifcDir is the only owner of that mapping.
    var awayIfc = (typeof A.three2ifcDir === 'function')
      ? A.three2ifcDir(away.x, away.y, away.z)
      : { ix: away.x, iy: -away.z, iz: away.y };
    var ax = cx + awayIfc.ix * offset, ay = cy + awayIfc.iy * offset;
    // Sit a few centimetres proud of the lowest structure so the rose is not z-fighting the slab
    // or buried in the ground mesh.
    var az = ext.z0 + 0.05;
    _anchor = { ix: ax, iy: ay, iz: az };
    var c3 = A.ifc2three(ax, ay, az);
    var centre = new T.Vector3(c3.x, c3.y, c3.z);

    _grp = new T.Group();
    _grp.name = 'sunCompassRose';
    // ⚠ DEPTH-TESTED, deliberately. cpe_flythru_datum.js's header explains the same choice: a
    // ground drawing that shines THROUGH the building reads as painted on the lens. Occlusion is
    // what tells the viewer the rose is on the ground and the building is standing on it.
    var matRing = new T.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.85 });
    var matN = new T.LineBasicMaterial({ color: INK_N, transparent: true, opacity: 0.95 });
    var matSun = new T.LineBasicMaterial({ color: INK_SUN, transparent: true, opacity: 0.95 });

    function addLine(mat, pts) {
      var g = new T.BufferGeometry().setFromPoints(pts);
      var l = new T.Line(g, mat);
      _grp.add(l);
      return l;
    }
    // Ground-plane point at a TRUE bearing and a radius from the anchor.
    function ring(bearing, r) {
      var d = A.bearingDirectionThree(bearing, _geo.trueNorth);
      return new T.Vector3(centre.x + d.x * r, centre.y, centre.z + d.z * r);
    }

    var circle = [];
    for (var a = 0; a <= 360; a += 4) circle.push(ring(a, _radius));
    addLine(matRing, circle);
    var inner = [];
    for (var b = 0; b <= 360; b += 4) inner.push(ring(b, _radius * 0.72));
    addLine(matRing, inner);

    // Bearing ticks every 15 deg; the four cardinals run longer. These are TRUE bearings, so on a
    // building whose true_north_angle is non-zero they visibly do NOT line up with the model grid
    // — which is the feature, not a defect.
    for (var t = 0; t < 360; t += 15) {
      var isCard = (t % 90) === 0;
      addLine(isCard ? matN : matRing,
              [ring(t, _radius * (isCard ? 0.60 : 0.86)), ring(t, _radius)]);
    }
    // The true-north needle: a slim arrow head, so north is unmistakable at a glance.
    addLine(matN, [ring(0, _radius * 1.18), ring(6, _radius * 0.80),
                   ring(0, _radius * 0.92), ring(354, _radius * 0.80), ring(0, _radius * 1.18)]);

    // The sun: a ground ray at the sun's bearing, a lifted marker at its real 3D direction, and a
    // drop line between them. The drop line is what makes ELEVATION readable on a flat drawing —
    // a bearing ray alone shows only which way, never how high.
    _sunRay = addLine(matSun, [centre.clone(), ring(0, _radius)]);
    _sunLift = addLine(matSun, [centre.clone(), centre.clone()]);
    _sunDrop = addLine(matSun, [centre.clone(), centre.clone()]);

    A.scene.add(_grp);
    _facade = readFacades();
    _site = { centre: centre, ext: ext, diag: diag };

    console.log('§SUN_COMPASS built lat=' + _geo.lat.toFixed(6) + ' lon=' + _geo.lon.toFixed(6) +
      ' (src=' + _geo.latLongSource + ') trueNorth=' + _geo.trueNorth.toFixed(4) + 'deg (src=' +
      _geo.trueNorthSource + ') elev=' + (_geo.elevM == null ? 'n/a' : _geo.elevM.toFixed(2) + 'm') +
      ' radius=' + _radius.toFixed(2) + 'm anchor=ifc(' + ax.toFixed(2) + ',' + ay.toFixed(2) +
      ',' + az.toFixed(2) + ') side=' + (faceBearing === 180 ? 'true-south' : 'true-north') +
      ' envelope=' + spanX.toFixed(1) + 'x' + spanY.toFixed(1) + 'm');
    if (_geo.trueNorthSource === 'default_zero') {
      console.log('§SUN_COMPASS_NOTE true north is the DEFAULT 0, not an authored value — this ' +
        'IFC carries no IfcGeometricRepresentationContext.TrueNorth, so model north is being ' +
        'shown as true north. The rose is still correct about the SUN (that comes from lat/long); ' +
        'it is the BUILDING\'s rotation that is unverified.');
    }
    console.log('§SUN_COMPASS_FACADE ' + (_facade
      ? 'source=' + _facade.source + ' dominant_rz=' + (_facade.rz * 180 / Math.PI).toFixed(1) +
        'deg walls=' + _facade.walls + ' in_dominant=' + _facade.dominant +
        ' distinct_rotation_z=' + _facade.distinct +
        (_facade.source === 'bbox_aspect'
          ? ' — rotation_z is NOT populated in this DB (' + _facade.distinct +
            ' distinct value), so the angle of attack is taken from the wall bbox aspect instead'
          : '')
      : 'VACUOUS — no walls with usable orientation; the angle-of-attack readout is suppressed'));
    _info = { lat: _geo.lat, lon: _geo.lon, trueNorth: _geo.trueNorth, radius: _radius,
              anchor: _anchor, facade: _facade };
    return _info;
  };

  // ── PER FRAME: move the sun, and report what to draw. ───────────────────────────────────────
  // `cursorMs` is the 4D cursor, handed in. Returns null when there is nothing honest to draw,
  // and the caller then draws nothing — no placeholder, no "Day ?" .
  A.sunCompassAt = function (cursorMs) {
    if (!_built || !_grp || !_geo || _geo.lat == null || _disposed) return null;
    var T = window.THREE;
    if (!T) return null;
    // ⚠ NO CURSOR IS A REAL STATE, NOT A FAILURE. A film baked WITHOUT the buildup has no 4D
    // timeline at all — cinema_maxq.js only populates `_bkState` inside the buildup arm — so there
    // is no date, and §6 forbids inventing one. The rose still means something without a date (it
    // is the building's true orientation), so it stays on screen; the SUN does not, because a sun
    // drawn from a made-up date is a picture of a thing that is not happening. The sun lines hide
    // and the readout says why, once, rather than the whole overlay vanishing with no explanation.
    var date = (cursorMs == null) ? null : new Date(cursorMs);
    if (date !== null && isNaN(date.getTime())) date = null;
    if (date === null) {
      if (!_noCursorLogged) {
        _noCursorLogged = true;
        console.log('§SUN_COMPASS_NO_CURSOR — the rose is drawn (true north is a property of the ' +
          'building) but the sun and the day-of-year are NOT: this film has no 4D cursor, and a ' +
          'sun position needs a real date. Bake with the buildup on to get them.');
      }
      if (_sunRay) _sunRay.visible = false;
      if (_sunLift) _sunLift.visible = false;
      if (_sunDrop) _sunDrop.visible = false;
      var c0 = _site.centre;
      var d0 = A.bearingDirectionThree(0, _geo.trueNorth);
      _last = { cursorMs: null, date: null, dayOfYear: null, azimuth: null, elevation: null,
                elevationApparent: null, isUp: false, attack: null, anchorThree: c0,
                radius: _radius, noCursor: true,
                trueNorthTip: new T.Vector3(c0.x + d0.x * _radius * 1.30, c0.y,
                                            c0.z + d0.z * _radius * 1.30) };
      return _last;
    }
    var sun = A.sunPositionAt(_geo.lat, _geo.lon, date);
    if (!sun) return null;

    var centre = _site.centre;
    var ground = A.bearingDirectionThree(sun.azimuth, _geo.trueNorth);
    var gp = new T.Vector3(centre.x + ground.x * _radius, centre.y,
                           centre.z + ground.z * _radius);
    _sunRay.geometry.setFromPoints([centre.clone(), gp]);

    // The lifted marker sits on the REAL sun direction at rose radius. Below the horizon it is
    // clamped to the ground and the marker is hidden: a sun drawn underground at night would be
    // a picture of something that is not happening.
    var up = A.sunDirectionThree(sun.azimuth, Math.max(sun.elevation, 0), _geo.trueNorth);
    var lift = new T.Vector3(centre.x + up.x * _radius * 1.35,
                             centre.y + up.y * _radius * 1.35,
                             centre.z + up.z * _radius * 1.35);
    var visible = sun.elevation > 0;
    _sunLift.visible = _sunDrop.visible = _sunRay.visible = visible;
    if (visible) {
      _sunLift.geometry.setFromPoints([centre.clone(), lift]);
      _sunDrop.geometry.setFromPoints([lift, new T.Vector3(lift.x, centre.y, lift.z)]);
    }

    // §8 — the angle of attack on the building's dominant facade. Both faces of that plane are
    // tried and the LIT one is reported, which is well defined; `wallFaceNormalsThree` refuses to
    // guess which side is "outward" and this is the information that settles it.
    var att = null;
    if (_facade && visible) {
      var sunDir = A.sunDirectionThree(sun.azimuth, sun.elevation, _geo.trueNorth);
      var faces = A.wallFaceNormalsThree(_facade.rz);
      var r0 = A.sunIncidenceDeg(sunDir, faces[0]), r1 = A.sunIncidenceDeg(sunDir, faces[1]);
      var best = (r0 && r1) ? (r0.incidence <= r1.incidence ? r0 : r1) : (r0 || r1);
      if (best && best.lit) {
        // Name the facade by the TRUE bearing its normal points at, so the label agrees with the
        // rose the viewer is looking at rather than with the model grid.
        var n = (best === r0) ? faces[0] : faces[1];
        var ifcN = (typeof A.three2ifcDir === 'function')
          ? A.three2ifcDir(n.x, n.y, n.z) : { ix: n.x, iy: -n.z };
        var modelBearing = Math.atan2(ifcN.ix, ifcN.iy) * 180 / Math.PI;
        var trueBearing = (modelBearing + _geo.trueNorth + 360) % 360;
        att = { incidence: best.incidence, attack: best.attack, bearing: trueBearing,
                compass: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(trueBearing / 45) % 8],
                source: _facade.source };
      }
    }

    _last = {
      cursorMs: cursorMs, date: date,
      dayOfYear: A.sunDayOfYear(date),
      azimuth: sun.azimuth, elevation: sun.elevation,
      elevationApparent: sun.elevationApparent, isUp: sun.isUp,
      attack: att, anchorThree: centre, radius: _radius,
      trueNorthTip: (function () {
        var d = A.bearingDirectionThree(0, _geo.trueNorth);
        return new T.Vector3(centre.x + d.x * _radius * 1.30, centre.y, centre.z + d.z * _radius * 1.30);
      })()
    };
    return _last;
  };

  // ── The label strings. PURE, so the witness gates the wording and the arithmetic at exact ────
  // cursors instead of hoping a bake produces them — same shape as A.dayCounterAt.
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  A.sunCompassLabels = function (info) {
    if (!info) return null;
    if (info.noCursor) {
      // Says what IS true (the rose is real true north) and what is not being shown, rather than
      // leaving a bare compass the viewer would read as a full sun overlay that failed silently.
      return { day: 'True north', sun: 'No 4D date in this film — sun path not shown', attack: null };
    }
    var d = info.date;
    // ⚠ DOES NOT START WITH "Day", and that is the whole point of this wording.
    // It used to read "Day 212 · 31 Jul". Seen in a real baked frame, that sat on screen beside
    // cpe_day_counter.js's "Day 390 / 390" in the opposite corner — two different numbers, both
    // labelled "Day", both correct, and together unreadable: the counter's is the PROJECT day
    // (day N of the build), this one is the DAY OF THE YEAR (§7's "Day of the year, set by the 4D
    // timeline"). They are different quantities and must not share a word. The date leads, and the
    // ordinal is spelled out as "of the year" so it cannot be mistaken for the counter's.
    var day = d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' · day ' + info.dayOfYear +
              ' of the year';
    // Below the horizon is a real state and says so, rather than printing an elevation that is
    // technically correct and reads as nonsense on screen.
    var sun = info.isUp
      ? 'Sun ' + info.azimuth.toFixed(0) + '° az · ' + info.elevation.toFixed(0) + '° alt'
      : 'Sun below the horizon';
    var att = (info.isUp && info.attack)
      ? info.attack.attack.toFixed(0) + '° onto the ' + info.attack.compass + ' facade'
      : null;
    return { day: day, sun: sun, attack: att };
  };

  // ── DRAW: the ONLY place any of this is drawn, so preview and export cannot diverge. ────────
  // Two pieces: an "N" and the day label pinned to the rose in world space (they move with it),
  // and a small fixed readout bottom-left for the sun angles.
  // ⚠ BOTTOM-LEFT is chosen because it is the one corner nothing else uses: cpe_day_counter.js
  // owns a corner of the caller's choosing and stacks the path box and resource panel under it,
  // and cpe_room_title.js's caption is a CENTRED plate in the lower band. A left-aligned pill
  // clears both. Same plate language as those two — 0.45 black, text-hugging, same font.
  A.sunCompassCompositeOntoCanvas = function (ctx, w, h, info, opacity) {
    if (!ctx || !info) return;
    var op = (opacity == null) ? 1 : Math.min(1, opacity);
    if (!(op > 0)) return;
    var labels = A.sunCompassLabels(info);
    if (!labels) return;
    var cam = A.camera, T = window.THREE;
    ctx.save();
    ctx.globalAlpha = op;
    var fontPx = Math.max(12, Math.round(h * 0.020));
    var font = '600 ' + fontPx + 'px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    ctx.font = font;
    ctx.textBaseline = 'middle';

    function plate(x, y, text, align) {
      var tw = (typeof ctx.measureText === 'function') ? ctx.measureText(text).width
                                                       : text.length * fontPx * 0.55;
      var padX = Math.round(fontPx * 0.7), padY = Math.round(fontPx * 0.45);
      var bw = tw + padX * 2, bh = fontPx + padY * 2;
      var bx = align === 'center' ? x - bw / 2 : x;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath(); ctx.roundRect(bx, y - bh / 2, bw, bh, Math.round(bh * 0.22)); ctx.fill();
      } else {
        ctx.fillRect(bx, y - bh / 2, bw, bh);
      }
      ctx.fillStyle = '#e8eef6';
      ctx.textAlign = 'left';
      ctx.fillText(text, bx + padX, y);
      return bh;
    }

    // World-anchored text. `project` needs a live camera; without one the rose labels are simply
    // skipped and the fixed readout still draws — degrade, never throw, same contract as every
    // other overlay in the bake.
    if (cam && T && info.anchorThree && typeof info.anchorThree.clone === 'function') {
      var proj = function (v) {
        var p = v.clone().project(cam);
        return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, z: p.z };
      };
      var nTip = proj(info.trueNorthTip);
      if (nTip.z < 1 && nTip.x > -w && nTip.x < w * 2) {
        ctx.fillStyle = '#e8eef6';
        ctx.textAlign = 'center';
        ctx.font = '700 ' + Math.round(fontPx * 1.15) + 'px -apple-system,BlinkMacSystemFont,' +
                   '"Segoe UI",Roboto,sans-serif';
        ctx.fillText('N', nTip.x, nTip.y);
        ctx.font = font;
      }
    }

    // ── THE READOUT: date, sun, angle of attack, TOGETHER, bottom left. ─────────────────────────
    // ⚠ The date used to be a plate pinned UNDER THE ROSE in world space, and that was wrong for a
    // reason a still frame makes obvious. MEASURED on a real Hospital bake, frame 5 of 8: the
    // camera is inside a washroom, the ground is not in view, the rose is off-screen — and the
    // "Sun below the horizon" line was still there while the DATE had vanished. Two halves of one
    // readout, one of them disappearing whenever the film goes indoors or close-in, which is most
    // of a walkthrough. The film must not stop saying what day it is because of where the camera
    // happens to be.
    // So all three lines live in ONE fixed block now, and the rose keeps only its "N" — the graphic
    // is the graphic, the words are the words. The compass may be hidden, occluded by the building
    // during the closing orbit, or out of frame entirely; the readout is unaffected.
    // Bottom LEFT, per red1: it is the one corner nothing else uses — cpe_day_counter.js owns a
    // corner of the caller's choosing and stacks the path box and resource panel under it, and
    // cpe_room_title.js's caption is a CENTRED plate in the lower band.
    // Order is date, sun, facade — read top-down, drawn bottom-up.
    var mx = Math.round(w * 0.016), my = Math.round(h * 0.026);
    var lineH = Math.round(fontPx * 2.1);
    var y0 = h - my - lineH / 2;
    if (labels.attack) { plate(mx, y0, labels.attack, 'left'); y0 -= lineH; }
    plate(mx, y0, labels.sun, 'left'); y0 -= lineH;
    plate(mx, y0, labels.day, 'left');
    ctx.restore();
  };

  A.sunCompassInfo = function () { return _last; };

  A.sunCompassDispose = function () {
    if (_grp && A.scene) {
      A.scene.remove(_grp);
      _grp.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    _grp = null; _built = false; _info = null; _last = null; _noCursorLogged = false;
    _sunRay = _sunLift = _sunDrop = null; _disposed = true;
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { setupCpeSunCompass: setupCpeSunCompass };
}
