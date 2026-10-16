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
  // §SUN_ONE film clock (red1, 2026-09-19: "the whole film is showing actually all days running and
  // capturing only a subset ie different times of the day to give a perception of a single half
  // day"). The film sweeps the solar hour from morning to late afternoon as it plays, while the
  // DATE advances with the 4D cursor underneath. So a viewer reads one half-day of sun arcing
  // over the building — which is what the old scripted 55°→6° arc was imitating — except every
  // frame is the real sun for this site, this date and that hour.
  // SOLAR hours, so only the longitude is needed: no timezone table, no DST, nothing that is wrong
  // in another country. Both numbers are a LOOK decision and live only here.
  var FILM_SOLAR_START = 9;    // mid-morning: the sun is up at any inhabited latitude, any season
  var FILM_SOLAR_END = 17;     // late afternoon, long shadows, still up in midwinter at Boston
  function _filmSolarHour(filmT) {
    var t = (typeof filmT === 'number' && isFinite(filmT)) ? Math.max(0, Math.min(1, filmT)) : 0.5;
    return FILM_SOLAR_START + (FILM_SOLAR_END - FILM_SOLAR_START) * t;
  }
  // §SUN_ONE_ALL_DARK tally (red1: "if all does end up dark, then it is a 'buggy' case where we
  // started too late in the day?"). Exactly right, and a film that is dark end to end must not
  // pass as a real answer — it is nearly always a wrong hour or a site nobody meant. Counted here,
  // reported by sunCompassDarkReport() once the frames are done.
  var _framesLit = 0, _framesDark = 0;
  // §SUN_DAY — the pinned day, or null to follow the 4D cursor. Set by the bake from the panel.
  var _sunDate = null;
  var _heldLogged = false;
  A.sunCompassSetDate = function (iso) {
    if (!iso) { _sunDate = null; console.log('§SUN_DAY following the 4D timeline (no date pinned)'); return null; }
    // yyyy-mm-dd, parsed as UTC so a browser timezone cannot shift the day by one.
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
    if (!m) { _sunDate = null; console.log('§SUN_DAY IGNORED "' + iso + '" — not yyyy-mm-dd; following the 4D timeline'); return null; }
    var y = +m[1], mo = +m[2] - 1, dd = +m[3];
    var cand = new Date(Date.UTC(y, mo, dd));
    // ⚠ ROUND-TRIP, because Date.UTC ROLLS OVER instead of failing. Caught by the witness:
    // "2026-13-45" matches the pattern, is not a real date, and Date.UTC turns it into
    // 14 Feb 2027 — a perfectly valid day that is not the one anybody typed. A silently wrong
    // date is the worst possible outcome for a feature whose whole claim is geo-ref TRUTH.
    if (isNaN(cand.getTime()) || cand.getUTCFullYear() !== y ||
        cand.getUTCMonth() !== mo || cand.getUTCDate() !== dd) {
      _sunDate = null;
      console.log('§SUN_DAY IGNORED "' + iso + '" — not a real date (it would have rolled over to ' +
        (isNaN(cand.getTime()) ? 'an invalid date' : cand.toISOString().slice(0, 10)) +
        '); following the 4D timeline');
      return null;
    }
    _sunDate = cand;
    console.log('§SUN_DAY pinned to ' + iso + ' — every frame is lit on that day, hour sweeping ' +
      FILM_SOLAR_START + ':00-' + FILM_SOLAR_END + ':00 solar. The BUILD still follows the 4D cursor.');
    return _sunDate;
  };
  var INK = 0xdbe4ee;          // same ink as cpe_flythru_datum.js's datum — one drawing language
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
    // §129.44 (2026-09-19, red1 on the Terminal film: "the North compass seems to hit underground
    // mistakenly, probably due to its substructure ... if u find back the ground that shadow could
    // locate, it be corrected?") — yes, and the number was already published.
    // This used to sit "a few centimetres proud of the LOWEST STRUCTURE" (ext.z0), which is the
    // bottom of the model's bounding box. On a building with no basement that IS the ground, which
    // is why HHS looked right (anchor z = -0.16). On one with a substructure it is the bottom of
    // the deepest pile: MEASURED on Terminal, the rose was placed at z = -30.64 while that model's
    // ground sits at z = +0.06 — thirty metres underground, exactly as red1 read it off the frame.
    // tools.js's _calcGroundY already owns this question and publishes A.groundIfcZ, deriving it
    // from the largest ground-floor slabs and only falling back to MIN(center_z) as a last resort
    // (Terminal resolves it as §GROUND_Y src=gf-storey-slab(Aras Tanah) z=0.06). Its own comment
    // says a second, independently-derived ground height "would be a way for the ghost to disagree
    // with what it is ghosting" — the same applies here, so this reads that number rather than
    // computing a rival one. ext.z0 stays as the fallback for a page where the ground plane has
    // not been resolved yet, and the log says which was used and by how much they differ.
    var _groundZ = (typeof A.groundIfcZ === 'number' && isFinite(A.groundIfcZ)) ? A.groundIfcZ : null;
    var _azSrc = _groundZ != null ? 'groundIfcZ' : 'bboxMin(ext.z0)';
    var az = (_groundZ != null ? _groundZ : ext.z0) + 0.05;
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

    // ── DUAL-INK LINES (red1, 2026-09-19: "its lines are not clear enough, should make them dual
    // margin color"). MEASURED on the orbit clip: the rose is 77 px across at that camera — big
    // enough — but every line is a 1-DEVICE-PIXEL hairline, because THREE's LineBasicMaterial
    // ignores linewidth on every desktop GL driver. A pale grey hairline over pale brown ground is
    // invisible whatever its size.
    // So each line is drawn TWICE: a DARK copy pushed radially outward, and the light copy on top.
    // The offset reads as a dark margin under a light core, which holds up over pale ground and
    // dark alike — the same reason a map's contour lines are haloed.
    // ⚠ THE OFFSET IS DERIVED FROM THE CAMERA, NOT PICKED. cpe_flythru_datum.js hit this exact
    // problem and solved it by sizing world-space width from the real camera distance to a stated
    // pixel target (§FLYTHRU_DATUM_LINES widthM=1.1506 src=[camera d=287.0m fov=60 h=720px]
    // px@287m=2.50). Same arithmetic here, same reason: a hardcoded metre value is right at one
    // distance and wrong at every other. Decided ONCE at build time, as the datum also does —
    // re-deriving per frame would make the halo breathe as the camera moves.
    var _haloM = _radius * 0.05;   // fallback: no camera yet, never invent a distance
    var _haloSrc = 'DEGRADED — no camera/viewport at build time';
    (function () {
      var cam = A.camera, rh = A.renderer && A.renderer.domElement && A.renderer.domElement.height;
      if (!cam || !cam.fov || !(rh > 0)) return;
      var dx = cam.position.x - centre.x, dy = cam.position.y - centre.y, dz = cam.position.z - centre.z;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!(dist > 0)) return;
      var TARGET_PX = 1.6;   // the halo, each side of a 1 px core -> ~4 px of line in total
      _haloM = TARGET_PX * (2 * dist * Math.tan(cam.fov * Math.PI / 360)) / rh;
      _haloSrc = 'camera d=' + dist.toFixed(1) + 'm fov=' + cam.fov.toFixed(0) + ' h=' + rh +
                 'px -> ' + TARGET_PX + 'px halo = ' + _haloM.toFixed(3) + 'm';
    })();
    var matHalo = new T.LineBasicMaterial({ color: 0x0d1117, transparent: true, opacity: 0.85 });
    function _outset(p, by) {
      var vx = p.x - centre.x, vz = p.z - centre.z;
      var len = Math.sqrt(vx * vx + vz * vz);
      if (!(len > 1e-6)) return p.clone();
      return new T.Vector3(centre.x + vx * (1 + by / len), p.y, centre.z + vz * (1 + by / len));
    }
    function addLine(mat, pts) {
      // The halo first, so the light core always paints over it.
      [_haloM, -_haloM].forEach(function (d) {
        var hg = new T.BufferGeometry().setFromPoints(pts.map(function (q) { return _outset(q, d); }));
        _grp.add(new T.Line(hg, matHalo));
      });
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
      ' halo=' + _haloM.toFixed(3) + 'm [' + _haloSrc + ']' +
      ' groundSrc=' + _azSrc + ' groundZ=' + (_groundZ != null ? _groundZ.toFixed(2) : 'n/a') +
      ' bboxMinZ=' + ext.z0.toFixed(2) + ' liftedBy=' + (_groundZ != null ? (_groundZ - ext.z0).toFixed(2) : '0.00') + 'm' +
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
  A.sunCompassAt = function (cursorMs, filmT) {
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
    // ⚠ THE DATE ADVANCES WITH THE FILM; THE TIME OF DAY DOES NOT. See sun_path.js
    // `sunInstantAtSolarHour`. A programme of 390 days played in 80 seconds puts consecutive
    // frames at unrelated times of day — measured on a real bake: elevation 30.4, -33.7 (night),
    // 18.2, 43.8 across four frames. Correct to the second, and a strobe. Holding the hour keeps
    // the sun real for this site on this date while making the SEASON the thing that moves, which
    // is the only part a construction film can actually show.
    // FILM_SOLAR_HOUR is one number and it is a look decision, not a fact — 10:00 solar gives a
    // sun that is up all year at any inhabited latitude (Boston: 18.7 deg midwinter to 58.7 deg
    // midsummer) and a low enough angle to model the facades. Change it here, nowhere else.
    // §SUN_DAY (red1, 2026-09-19: "a new day film scheme — as it gives rightfully, a whole daylight
    // sweep", plus a settable date field). When a date is pinned, EVERY frame is lit on that one
    // day and only the hour sweeps, so the film is one clean sunrise-to-late-afternoon arc.
    // Without it the date advances with the 4D cursor and the season fights the hour — MEASURED on
    // a real Hospital bake: 45 22 26 47 60 49 23 6, which climbs and dips because a winter morning
    // sits lower than a summer afternoon whatever the clock says. One day, one arc.
    // ⚠ The pinned day changes WHAT IS LIT, never what is BUILT. The 4D cursor still drives the
    // model, so the counter keeps counting real project days while the light stays on the chosen
    // date — which is the point ("show me this build as it would look on 21 June") and also why
    // the readout prints the lit date rather than the cursor's.
    var litDate = _sunDate || date;
    var solarHour = _filmSolarHour(filmT);
    var shown = A.sunInstantAtSolarHour(_geo.lon, litDate, solarHour) || litDate;
    // ⚠ THE FREEZE STOPS THIS OVERLAY DEAD — hidden AND held (red1, 2026-09-19: "Freeze removes
    // all other overlays including geo-ref", then "the clock is frozen too, and all resume as a
    // next proper frame"). §129.1's load-path beat holds one frame on the structural chain while
    // the film's own fraction keeps advancing underneath it.
    // Two different things are needed, and only one of them is the HUD fade:
    //   1. The ROSE is a scene object, so A._loadPathHudAlpha cannot reach it. Hidden here, or it
    //      is the one thing left standing on a deliberately cleared frame.
    //   2. The CLOCK must not keep ticking behind a frozen picture. Returning early leaves `_last`
    //      exactly as the last live frame left it, so the hands, the date and the sun all hold
    //      still — and the next unfrozen frame simply computes normally from the film's own
    //      fraction, which is what "resume as a next proper frame" means.
    // Frozen frames are also left OUT of the lit/dark tally: they are not evidence about the sun.
    var _holdAlpha = (typeof A._loadPathHudAlpha === 'number') ? A._loadPathHudAlpha : 1;
    if (_holdAlpha < 1) {
      if (_grp) _grp.visible = false;
      if (!_heldLogged) {
        _heldLogged = true;
        console.log('§SUN_COMPASS_HELD — the load-path freeze is up: rose hidden, clock and sun ' +
          'held at the last live frame. They resume on the next unfrozen frame.');
      }
      return _last;
    }
    if (_grp) _grp.visible = true;
    _heldLogged = false;

    var sun = A.sunPositionAt(_geo.lat, _geo.lon, shown);
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
    if (visible) _framesLit++; else _framesDark++;
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
      cursorMs: cursorMs, date: litDate, shownAt: shown, solarHour: solarHour,
      pinnedDate: !!_sunDate, dayOfYear: A.sunDayOfYear(litDate),
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
    // §PLACE — appended as a fourth row of the same plate, null when there is no table,
    // no coordinate, or nothing inside the match bound.
    // ⚠ NOT `info.lat`. The object reaching the compositor is A.sunCompassInfo() -> `_last`, the
    // PER-FRAME sun state, which carries no coordinate — guarding on info.lat silently skipped the
    // row on every frame of a real 1080p bake (§PLACE_RESOLVED never printed, measured 2026-09-20).
    // `_geo` is this module's own resolved site and is the thing the compass itself was built from.
    var _plat = (_geo && _geo.lat != null) ? _geo.lat : info.lat;
    var _plon = (_geo && _geo.lon != null) ? _geo.lon : info.lon;
    var place = (A.placeLabelFor && _plat != null) ? A.placeLabelFor(_plat, _plon) : null;
    return { day: day, sun: sun, attack: att, place: place };
  };

  // ══ §PLACE — THE NEAREST REAL SETTLEMENT, AND HOW FAR THE BUILDING IS FROM IT ═══════════════
  // red1, 2026-09-20: "Do a hi res snap ... with distance from nearest city positioned inwards
  // where the geo-ref row is." It belongs in THIS plate because it is the same kind of fact as the
  // day of the year and the sun angle — all three are what the site's coordinate implies.
  // THE DISTANCE IS NOT DECORATION. "Boston 0.2 km" and "Pendang 17.9 km" are different claims:
  // one is a city-centre site, the other is 18 km out. Printing the distance discloses the quality
  // of the match, which is what makes a place NAME safe to put on screen at all.
  // The fetch lives HERE, not in place_lookup.js — that module is asserted network-free by
  // W-PL-5, and the whole reason §13 supersedes §9's Open-Meteo answer is that the bake stays
  // offline. This reads a file the repo ships; it never leaves the machine.
  A._placeTable = A._placeTable || null;
  A.placeTableLoad = function (url) {
    if (A._placeTable || A._placeTableLoading) return A._placeTableLoading || Promise.resolve(A._placeTable);
    var src = url || 'rates/cities.tsv.gz';   // viewer.html's own folder
    A._placeTableLoading = fetch(src).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      // The table ships gzipped (1.14 MB against 2.96 MB raw, measured). DecompressionStream is
      // the browser's own; a page without it simply gets no place line rather than a broken one.
      if (typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
      return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
    }).then(function (txt) {
      A._placeTable = (window.PlaceLookup && window.PlaceLookup.parse) ? window.PlaceLookup.parse(txt) : null;
      console.log('§PLACE_TABLE rows=' + (A._placeTable ? A._placeTable.rows.length : 0) +
        ' source="' + (A._placeTable ? A._placeTable.meta.source : '?') + '" licence="' +
        (A._placeTable ? A._placeTable.meta.licence : '?') + '" — offline, no network beyond this repo file');
      return A._placeTable;
    }).catch(function (e) {
      console.log('§PLACE_TABLE absent (' + e.message + ') — the place line is simply not drawn;' +
        ' a missing table must never cost a frame');
      A._placeTable = null; return null;
    });
    return A._placeTableLoading;
  };
  var _placeLogged = false;
  A.placeLabelFor = function (lat, lon) {
    if (!A._placeTable || !window.PlaceLookup || typeof lat !== 'number' || typeof lon !== 'number') return null;
    var g = window.PlaceLookup.nearest(A._placeTable, lat, lon);
    if (!g) return null;
    if (!_placeLogged) {
      _placeLogged = true;
      console.log('§PLACE_RESOLVED ' + (g.match
        ? 'name="' + g.name + '" cc=' + g.cc + ' km=' + g.km.toFixed(2) + ' elev=' + g.elevation_m +
          'm(src=' + g.elevSrc + ') tz=' + g.tz + ' pop=' + g.population + ' bound=' + g.boundKm + 'km source="' + g.source + '"'
        : 'NO MATCH — ' + g.reason) +
        ' ⚠ §13.5s contested-coordinate gate is NOT built: this prints what the table says for the' +
        ' coordinate it was given, and says nothing about whether that coordinate is agreed.');
    }
    if (!g.match) return null;
    return g.name + ', ' + g.cc + ' · ' + (g.km < 1 ? (g.km * 1000).toFixed(0) + ' m' : g.km.toFixed(1) + ' km') + ' away';
  };

  // ── DRAW: the ONLY place any of this is drawn, so preview and export cannot diverge. ────────
  // Two pieces: an "N" and the day label pinned to the rose in world space (they move with it),
  // and a small fixed readout bottom-left for the sun angles.
  // ⚠ BOTTOM-LEFT is chosen because it is the one corner nothing else uses: cpe_day_counter.js
  // owns a corner of the caller's choosing and stacks the path box and resource panel under it,
  // and cpe_room_title.js's caption is a CENTRED plate in the lower band. A left-aligned pill
  // clears both. Same plate language as those two — 0.45 black, text-hugging, same font.
  // §HUD_ROW (2026-09-19) — `xOff`, as on the clock above: an X offset inward from the corner
  // so this readout can sit BESIDE the clock rather than under it. Optional, so the six- and
  // seven-argument callers in the witnesses are unaffected.
  A.sunCompassCompositeOntoCanvas = function (ctx, w, h, info, opacity, pos, stackY, xOff) {
    if (!ctx || !info) return 0;
    var op = (opacity == null) ? 1 : Math.min(1, opacity);
    if (!(op > 0)) return 0;
    var labels = A.sunCompassLabels(info);
    if (!labels) return 0;
    var cam = A.camera, T = window.THREE;
    ctx.save();
    ctx.globalAlpha = op;
    // §HUD_SCALE (2026-09-19, red1: "too big in low res and too small in hi res") — the size
    // now comes from the ONE law in cinema_maxq.js, which lets the FRACTION of frame height
    // rise gently with resolution instead of holding constant. The 1080 anchor below is this
    // overlay's own previous constant, so nothing moves at 1080 and every overlay keeps its
    // tuned size RELATIVE to its neighbours. The fallback is the old formula verbatim, for a
    // page that loads this module without cinema_maxq.
    var fontPx = (window.__hudFontPx ? window.__hudFontPx(h, 0.020, 9) : Math.max(9, Math.round(h * 0.020)));
    var font = '600 ' + fontPx + 'px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    ctx.font = font;
    ctx.textBaseline = 'middle';

    // ⚠ THE READOUT LIVES IN THE DAY-COUNTER COLUMN (red1, 2026-09-19, after seeing it drawn
    // UNDERNEATH the loadpath session's own bottom-left room box: "Put a guard to it or same line
    // as the Day counter? Clock, the azimuth thing, and the 4D day counter.").
    // It was bottom-left, and that corner now belongs to someone else's fixed panel. Chasing it
    // with a reservation was the wrong shape — the caption I reserved against has since been
    // deleted by that same work. Joining the column instead means ONE owner of that corner's
    // stacking, which cannot collide by construction: every box asks for its offset and returns
    // its height. Day counter -> clock -> THIS -> path box -> pie.
    // It belongs here anyway: the date it prints is the SAME 4D cursor the counter counts.
    var margin = Math.round(h * 0.028);
    var at = (pos && CLOCK_POS[pos]) ? pos : 'tr';
    var sy = stackY || 0;
    var lineH = Math.round(fontPx * 2.1);
    var lines = [labels.day, labels.sun]
      .concat(labels.attack ? [labels.attack] : [])
      .concat(labels.place ? [labels.place] : []);   // §PLACE — innermost row of the geo-ref plate
    var widest = 0;
    if (typeof ctx.measureText === 'function') {
      lines.forEach(function (t) { widest = Math.max(widest, ctx.measureText(t).width); });
    } else { lines.forEach(function (t) { widest = Math.max(widest, t.length * fontPx * 0.55); }); }
    var padX = Math.round(fontPx * 0.7), padY = Math.round(fontPx * 0.45);
    var bw = widest + padX * 2, bh = fontPx + padY * 2;
    var xo = xOff || 0;
    var x = (at === 'tl' || at === 'bl') ? margin + xo : w - margin - bw - xo;
    var y0 = (at === 'bl' || at === 'br') ? h - margin - bh / 2 - sy - (lines.length - 1) * lineH
                                          : margin + bh / 2 + sy;
    A.sunReadoutLastBox = { x: x, y: y0 - bh / 2, w: bw, h: bh + (lines.length - 1) * lineH };

    lines.forEach(function (t, i) {
      var y = y0 + i * lineH;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath(); ctx.roundRect(x, y - bh / 2, bw, bh, Math.round(bh * 0.22)); ctx.fill();
      } else { ctx.fillRect(x, y - bh / 2, bw, bh); }
      ctx.fillStyle = '#e8eef6';
      ctx.textAlign = 'left';
      ctx.fillText(t, x + padX, y);
    });

    // The "N" stays pinned to the rose in world space — it is part of the drawing on the ground,
    // not part of the readout.
    if (cam && T && info.trueNorthTip && typeof info.trueNorthTip.clone === 'function') {
      var p = info.trueNorthTip.clone().project(cam);
      var sx = (p.x * 0.5 + 0.5) * w, syy = (-p.y * 0.5 + 0.5) * h;
      if (p.z < 1 && sx > -w && sx < w * 2) {
        ctx.fillStyle = '#e8eef6';
        ctx.textAlign = 'center';
        ctx.font = '700 ' + Math.round(fontPx * 1.15) + 'px -apple-system,BlinkMacSystemFont,' +
                   '"Segoe UI",Roboto,sans-serif';
        ctx.fillText('N', sx, syy);
      }
    }
    ctx.restore();
    return lines.length * lineH;
  };

  // ── §SUN_CLOCK — an analogue face showing the hour this frame is lit at. ────────────────────
  // red1, 2026-09-19: "another 'clock' showing its hr/min hands... make it perhaps stay with a
  // corner together with the Day counter".
  //
  // WHAT IT SHOWS, precisely: the SOLAR hour the sun was computed at, not a wall clock. Those are
  // different — solar noon is when the sun actually crosses the meridian here, which is why the
  // film's light is the same height in Boston and in Penang at the same reading. Labelled
  // "solar" under the dial so it is never mistaken for local time.
  //
  // It joins the day counter's COLUMN rather than the bottom-left readout, per red1: that corner
  // is already a stack (cpe_day_counter, then §CPE_PATH_OVERVIEW, then §CPE_RESOURCE_PANEL) and
  // the caller owns the order — this function owns only its own drawing, exactly as
  // cpe_path_overview.js's header states the contract. Bottom-left would have collided with the
  // date/sun/facade lines that already live there.
  var CLOCK_POS = { tr: 1, tl: 1, br: 1, bl: 1 };
  A.sunClockBoxSize = function (h) { return Math.round(h * 0.105); };
  // §HUD_ROW (2026-09-19) — `xOff` shifts this dial INWARD from its corner along X so the caller
  // can lay the clock, the readout, the day counter and the path map in ONE row instead of a
  // column. Optional; every existing caller passes seven arguments and is unmoved. The drawn
  // rect goes on A.sunClockLastBox — the return value stays the HEIGHT it has always been,
  // because witness_sun_compass.js reads it as a number.
  A.sunClockCompositeOntoCanvas = function (ctx, w, h, info, opacity, pos, stackY, xOff) {
    if (!ctx || !info || info.noCursor || info.solarHour == null) return 0;
    var op = (opacity == null) ? 1 : Math.min(1, opacity);
    if (!(op > 0)) return 0;
    var d = A.sunClockBoxSize(h), r = d / 2;
    var margin = Math.round(h * 0.028);
    var at = (pos && CLOCK_POS[pos]) ? pos : 'tr';
    var sy = stackY || 0, xo = xOff || 0;
    var x = (at === 'tl' || at === 'bl') ? margin + xo : w - margin - d - xo;
    var y = (at === 'bl' || at === 'br') ? h - margin - d - sy : margin + sy;
    var cx = x + r, cy = y + r;
    // Width is the dial itself; the "HH:MM solar" caption is centred under it and can be wider, so
    // the row must reserve the WIDER of the two or the next box along will sit on the text.
    A.sunClockLastBox = { x: x, y: y, w: d, h: d };

    var hour = Math.floor(info.solarHour);
    var mins = Math.round((info.solarHour - hour) * 60);
    if (mins === 60) { mins = 0; hour += 1; }

    ctx.save();
    ctx.globalAlpha = op;
    // Same plate language as the counter above it: 0.45 black, no invented second style.
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,238,246,0.55)';
    ctx.lineWidth = Math.max(1, r * 0.035);
    ctx.stroke();

    // Twelve ticks; the quarters run longer so the dial reads at a glance on a 1280-wide frame.
    for (var t = 0; t < 12; t++) {
      var a = t * Math.PI / 6;
      var inner = r * ((t % 3 === 0) ? 0.72 : 0.84);
      ctx.beginPath();
      ctx.moveTo(cx + Math.sin(a) * inner, cy - Math.cos(a) * inner);
      ctx.lineTo(cx + Math.sin(a) * r * 0.92, cy - Math.cos(a) * r * 0.92);
      ctx.strokeStyle = 'rgba(232,238,246,' + ((t % 3 === 0) ? '0.85' : '0.45') + ')';
      ctx.lineWidth = Math.max(1, r * ((t % 3 === 0) ? 0.06 : 0.035));
      ctx.stroke();
    }
    // Hands. The hour hand carries the minutes too, or it would jump on the hour like a cheap
    // prop clock instead of creeping the way a real one does.
    function hand(angle, len, width, colour) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(angle) * len, cy - Math.cos(angle) * len);
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(1, width);
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    hand(((hour % 12) + mins / 60) * Math.PI / 6, r * 0.50, r * 0.11, '#e8eef6');
    hand((mins / 60) * Math.PI * 2, r * 0.76, r * 0.07, '#ffb74d');
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, r * 0.07), 0, Math.PI * 2);
    ctx.fillStyle = '#ffb74d';
    ctx.fill();

    // The reading in words, because hands at this size are an impression, not a measurement — and
    // "solar" is the part a viewer cannot infer from a dial.
    // §HUD_SCALE — same one law; 0.014 is this caption's own 1080 anchor.
    var fontPx = (window.__hudFontPx ? window.__hudFontPx(h, 0.014, 8) : Math.max(8, Math.round(h * 0.014)));
    ctx.font = '600 ' + fontPx + 'px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    ctx.fillStyle = '#e8eef6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var capTxt = (hour < 10 ? '0' : '') + hour + ':' + (mins < 10 ? '0' : '') + mins + ' solar';
    ctx.fillText(capTxt, cx, y + d + Math.round(fontPx * 0.25));
    var capW = (typeof ctx.measureText === 'function') ? ctx.measureText(capTxt).width
                                                       : capTxt.length * fontPx * 0.55;
    var totH = d + Math.round(fontPx * 1.4);
    // §HUD_ROW — the caption is centred on the dial, so it overhangs both sides when it is wider.
    // Publish the box that actually covers ink, not just the dial, or a row neighbour lands on it.
    if (capW > d) A.sunClockLastBox = { x: cx - capW / 2, y: y, w: capW, h: totH };
    else A.sunClockLastBox = { x: x, y: y, w: d, h: totH };
    ctx.restore();
    return totH;
  };

  A.sunCompassInfo = function () { return _last; };

  // ── Was the whole film dark? Called once after the frames, by cinema_maxq.js. ────────────────
  // A film with the sun below the horizon in EVERY frame is legitimate in exactly one situation —
  // polar winter, where the sun genuinely does not rise — and is otherwise a mistake worth saying
  // out loud: the wrong hours, or a site nobody meant. It cannot be judged frame by frame, only
  // over the whole run, which is why it is a separate report rather than a per-frame warning.
  A.sunCompassDarkReport = function () {
    var total = _framesLit + _framesDark;
    if (!total) {
      console.log('§SUN_ONE_ALL_DARK INCONCLUSIVE — no frame was judged (the compass never ran)');
      return null;
    }
    var allDark = _framesDark === total;
    var polar = _geo && _geo.lat != null && Math.abs(_geo.lat) > 66.5;
    console.log('§SUN_ONE_LIGHT frames=' + total + ' lit=' + _framesLit + ' dark=' + _framesDark +
      (allDark
        ? ' — ⚠ EVERY FRAME IS DARK. The sun is below the horizon for the whole film. ' +
          (polar
            ? 'This site is inside the polar circle (lat ' + _geo.lat.toFixed(2) + '), so in ' +
              'midwinter that is the truth and not a fault.'
            : 'This site is NOT polar (lat ' + (_geo && _geo.lat != null ? _geo.lat.toFixed(2) : '?') +
              '), so it almost certainly is NOT the truth — check the film hours (' +
              FILM_SOLAR_START + ':00-' + FILM_SOLAR_END + ':00 solar, cpe_sun_compass.js) and the ' +
              'site lat/long before believing this film.')
        : ''));
    return { total: total, lit: _framesLit, dark: _framesDark, allDark: allDark, polar: polar };
  };

  A.sunCompassDispose = function () {
    if (_grp && A.scene) {
      A.scene.remove(_grp);
      _grp.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    _grp = null; _built = false; _info = null; _last = null; _noCursorLogged = false;
    _framesLit = 0; _framesDark = 0; _sunDate = null; _heldLogged = false;
    _sunRay = _sunLift = _sunDrop = null; _disposed = true;
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { setupCpeSunCompass: setupCpeSunCompass };
}
