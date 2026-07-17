// room_type_classifier.js — §ROOM-TYPE size+aspect-ratio TEMPLATE classifier
// (prompts/ROOM_TYPE_TEMPLATE_CLASSIFIER.md, 2026-07-11, MANAGER-assigned).
//
// PORTED VERBATIM from bim-compiler build/room_type_classifier.js (2026-07-11,
// prompts/DISC_WALK_ROOM_TYPE_AWARE.md) — byte-identical, same dual-mode module, no logic changed.
// Consumer: modeller/disc_walker.js's _spaceTypeFor() geometry-classifier FALLBACK (only for
// disciplines with a real MEASURED density signal — see disc_walker.js's ROOM_TYPE_MEASURED_DISCS
// comment and bim-compiler build/measure_disc_room_type_density.js for the measurement).
//
// Scores an already-compiled, already-habitability-filtered room (area + aspect ratio, computed
// from spatial_structure size_x/size_y — summed across a §MULTI-RECT rect-set when room_guid
// groups multiple rows) against config/room_templates.yaml's PROBABILISTIC templates — a soft
// independent-Gaussian likelihood per feature, NOT a hard lookup table or a fixed cutoff. Returns
// the best-matching type WITH a confidence number; low-confidence rooms are explicitly refused
// (`(unclassified)`), never forced into a category — same refuse-to-guess discipline as bim-ootb
// `common/room_habitability.js`'s `spaceHabitable()`.
//
// NON-INVENT: every template's mean/std in config/room_templates.yaml is either FITTED from this
// project's own real compiled room geometry (`confidence: measured`) or, if ever added later, an
// explicitly cited external source (`confidence: prior`) — this module never invents a number of
// its own; see config/room_templates.yaml's header comment for the full discipline and the
// landmine (3 already-conflicting hand-typed "UBBL bedroom size" values elsewhere in this repo)
// it exists to not repeat.
//
// Dual-mode (Node `require` + browser `<script>` global), same convention as room_walker.js /
// bim-ootb common/room_habitability.js — module.exports when present, window.RoomTypeClassifier
// otherwise. Depends only on a pre-parsed templates object (see loadTemplateConfig below); no
// direct file/DB I/O here so it can run identically in-browser (fetch+js-yaml) or in Node (fs+
// js-yaml, see build/witness_room_type_classifier.js for the Node-side loader).
//
// §DOOR-ACCESS (prompts/ROOM_TYPE_DOOR_ACCESS_SIGNAL.md, 2026-07-11): a SECOND signal —
// countAdjacentDoors() + an optional 3rd quadrature dimension in scoreTemplate()/classifyRoom() —
// added alongside the original area+aspect scorer (unchanged math when door data isn't supplied).
// See build/measure_door_counts.js for how config/room_templates.yaml's `door_count` bands were
// measured from Duplex/SampleHouse ground truth, same non-invent discipline as area/aspect.
(function () {
  'use strict';
  var TAG = '§ROOM-TYPE';
  var ROOT = (typeof window !== 'undefined') ? window : {};

  // Same trailing-mirrored-digit-strip convention as bim-ootb common/room_habitability.js's
  // spaceHabitable() label normalization (ported, not re-derived) + a leading-ordinal-prefix
  // strip for SampleHouse's "1 - Living room" LongName convention. See config/room_templates.yaml
  // METHODOLOGY comment for why this does NOT become a synonym dictionary across different words.
  function normalizeLabel(label) {
    var s = String(label == null ? '' : label).trim();
    s = s.replace(/^\d+\s*[-.]\s*/, '');             // leading "1 - " / "2. "
    s = s.toUpperCase().replace(/\s+/g, '_');
    s = s.replace(/_?\d+$/, '');                      // trailing "_1"/"1" mirrored-unit suffix
    return s;
  }

  // area + aspect ratio from a rect-set (array of {size_x, size_y}) — §8 MULTI-RECT: area is a
  // plain sum (sub-rects are non-overlapping by construction, verified W-ROOM-FILL), aspect ratio
  // is computed on the BOUNDING ENVELOPE of the set (ROOM_INJECTION_HYBRID.md §8 recipe), not any
  // single sub-rect. For a single-rect room the envelope IS that one rect, so the two paths agree.
  function featuresFromRects(rects) {
    if (!rects || !rects.length) return null;
    var area = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (r.size_x == null || r.size_y == null) continue;
      area += r.size_x * r.size_y;
      var cx = r.center_x, cy = r.center_y;
      if (cx != null) { x0 = Math.min(x0, cx - r.size_x / 2); x1 = Math.max(x1, cx + r.size_x / 2); }
      if (cy != null) { y0 = Math.min(y0, cy - r.size_y / 2); y1 = Math.max(y1, cy + r.size_y / 2); }
    }
    if (area <= 0) return null;
    var envX = (x1 > x0) ? (x1 - x0) : rects[0].size_x;
    var envY = (y1 > y0) ? (y1 - y0) : rects[0].size_y;
    var aspect = (envX > 0 && envY > 0) ? Math.max(envX, envY) / Math.min(envX, envY) : null;
    return { area: area, aspect: aspect, envX: envX, envY: envY };
  }

  // §DOOR-ACCESS (prompts/ROOM_TYPE_DOOR_ACCESS_SIGNAL.md, 2026-07-11): count of real doors
  // adjacent to a room's rect-set — the SECOND discriminating signal, alongside area+aspect.
  // Reuses scripts/compile_rooms.py's own door-adjacency buffer test (_door_adjacent: buf =
  // max(door.bbox_x, door.bbox_y)/2 + DOOR_BUFFER_SLACK), extended from a boolean "has-door" check
  // to a COUNT — this does NOT rebuild compile_rooms.py's door-rescue/door-partition DECISION logic
  // (which walls get rasterized into which pocket, §4 non-goal); it only reads the already-decided
  // room footprint + real IfcDoor geometry. DOOR_BUFFER_SLACK below is PORTED as-is (0.20m =
  // compile_rooms.py's RES constant), not a new invented number.
  //
  // Caller contract (this module stays DB/file-I/O-free, same convention as featuresFromRects):
  // `doors` must already be pre-filtered to the room's OWN STOREY (mirrors compile_rooms.py's
  // storey_doors() grouping doors by storey before testing adjacency — an un-storey-filtered test
  // was measured to badly over-count on Duplex, see build/measure_door_counts.js log). A door
  // counts once even if it touches multiple sub-rects of a §MULTI-RECT room.
  var DOOR_BUFFER_SLACK = 0.20; // ported from scripts/compile_rooms.py DOOR_BUFFER_SLACK/RES
  function countAdjacentDoors(rects, doors) {
    if (!rects || !rects.length || !doors || !doors.length) return 0;
    var count = 0;
    for (var i = 0; i < doors.length; i++) {
      var d = doors[i];
      if (d.center_x == null || d.center_y == null) continue;
      var buf = Math.max(d.bbox_x || 0, d.bbox_y || 0) / 2 + DOOR_BUFFER_SLACK;
      var hit = false;
      for (var j = 0; j < rects.length && !hit; j++) {
        var r = rects[j];
        if (r.center_x == null || r.center_y == null || r.size_x == null || r.size_y == null) continue;
        var rx0 = r.center_x - r.size_x / 2, rx1 = r.center_x + r.size_x / 2;
        var ry0 = r.center_y - r.size_y / 2, ry1 = r.center_y + r.size_y / 2;
        if (rx0 - buf <= d.center_x && d.center_x <= rx1 + buf && ry0 - buf <= d.center_y && d.center_y <= ry1 + buf)
          hit = true;
      }
      if (hit) count++;
    }
    return count;
  }

  // Effective std at classify time: smooths a degenerate/underestimated measured std toward
  // std_floor_fraction * mean. See config/room_templates.yaml header — the stored std is always
  // the RAW measured value; this floor is applied here only, never baked into the config.
  function effStd(measuredStd, mean, floorFraction) {
    var floor = Math.abs(mean) * floorFraction;
    return Math.max(measuredStd, floor, 1e-6); // 1e-6 absolute floor: never literally divide by 0
  }

  // Independent-feature Gaussian likelihood (unnormalized) + combined quadrature z-distance.
  // §DOOR-ACCESS: a 3rd dimension (zDoor) joins the quadrature IFF the template carries a measured
  // `door_count` stat AND the caller supplied `features.doorCount` — graceful degradation to the
  // original 2D area+aspect score otherwise (e.g. a caller that hasn't wired door adjacency, or a
  // template with no promoted door_count band). Never a hard filter/veto — same soft-likelihood
  // shape as the existing 2 dimensions, per ROOM_TYPE_DOOR_ACCESS_SIGNAL.md §2's "second dimension
  // in the confidence score" option (picked over a hard filter: see that doc's write-up for why).
  function scoreTemplate(features, tmpl, floorFraction) {
    var aStd = effStd(tmpl.area_m2.std, tmpl.area_m2.mean, floorFraction);
    var pStd = effStd(tmpl.aspect_ratio.std, tmpl.aspect_ratio.mean, floorFraction);
    var zArea = (features.area - tmpl.area_m2.mean) / aStd;
    var zAspect = (features.aspect - tmpl.aspect_ratio.mean) / pStd;
    var zSq = zArea * zArea + zAspect * zAspect;
    var zDoor = null;
    if (tmpl.door_count && features.doorCount != null) {
      var dStd = effStd(tmpl.door_count.std, tmpl.door_count.mean, floorFraction);
      zDoor = (features.doorCount - tmpl.door_count.mean) / dStd;
      zSq += zDoor * zDoor;
    }
    var z = Math.sqrt(zSq);
    var likelihood = Math.exp(-0.5 * zSq);
    return { z: z, zArea: zArea, zAspect: zAspect, zDoor: zDoor, likelihood: likelihood };
  }

  // classifyRoom(features, config) -> { type, confidence, z, scores:[{type,likelihood,z,posterior}],
  //   unclassified: bool, why }
  // features = { area, aspect } (m^2, dimensionless). config = parsed config/room_templates.yaml
  // (templates + std_floor_fraction + unclassified_z_threshold — see loadTemplateConfig).
  function classifyRoom(features, config) {
    if (!features || features.area == null || features.aspect == null)
      return { type: null, confidence: 0, unclassified: true, why: 'no-features', scores: [] };
    var floorFraction = config.std_floor_fraction != null ? config.std_floor_fraction : 0.15;
    var names = Object.keys(config.templates || {});
    var scores = names.map(function (name) {
      var s = scoreTemplate(features, config.templates[name], floorFraction);
      return { type: name, likelihood: s.likelihood, z: s.z, zArea: s.zArea, zAspect: s.zAspect };
    });
    if (!scores.length) return { type: null, confidence: 0, unclassified: true, why: 'no-templates', scores: [] };
    var sumLik = scores.reduce(function (a, s) { return a + s.likelihood; }, 0);
    scores.forEach(function (s) { s.posterior = sumLik > 0 ? s.likelihood / sumLik : 0; });
    scores.sort(function (a, b) { return b.likelihood - a.likelihood; });
    var best = scores[0];
    var threshold = config.unclassified_z_threshold != null ? config.unclassified_z_threshold : 2.0;
    if (best.z > threshold) {
      return { type: null, confidence: best.posterior, unclassified: true, z: best.z,
        why: 'z=' + best.z.toFixed(2) + '>' + threshold + ' (nearest=' + best.type + ')',
        nearest: best.type, scores: scores };
    }
    return { type: best.type, confidence: best.posterior, unclassified: false, z: best.z, scores: scores };
  }

  // §FIXTURE-SIGNAL (2026-07-13, RosettaStone discipline — extract real evidence before
  // inferring from statistics): a named IfcFurnishingElement/IfcBuildingElementProxy INSIDE a
  // room's own rect-set is direct extracted proof of that room's function, not a guess from
  // size/aspect. Reverse-engineered from the Stones (ground truth), forward-replayed against the
  // same Stone before use: checked every real sink/vanity fixture's XY position against Duplex's
  // own human-labeled ground-truth rooms — 7/7 landed in the CORRECT real room (2/2 "Counter Top
  // w Sink Hole" -> Kitchen, 5/5 "Vanity Cabinet...Sink Unit" -> Bathroom), 0 misses, 0 invented.
  // "toilet"/"urinal"/"bidet" added from Terminal's own real extraction (4x "Asian_Toilet" proxy
  // elements) — not asserted, a second building's real element-naming convention.
  // This signal WINS over the Gaussian area/aspect template when both fire: extracted evidence
  // outranks statistical inference from a 2-5 sample residential fit, same PRIME RULE priority
  // as every other decision in this codebase (extract/compile over invent).
  var FIXTURE_KEYWORDS = {
    BATHROOM: ['vanity', 'toilet', 'urinal', 'bidet'],
    KITCHEN: ['sink hole', 'hob', 'cooktop', 'stove top']
  };
  function fixtureRoomType(fixtureNames) {
    if (!fixtureNames || !fixtureNames.length) return null;
    var types = Object.keys(FIXTURE_KEYWORDS);
    for (var i = 0; i < fixtureNames.length; i++) {
      var n = String(fixtureNames[i] || '').toLowerCase();
      for (var t = 0; t < types.length; t++) {
        var kws = FIXTURE_KEYWORDS[types[t]];
        for (var k = 0; k < kws.length; k++) {
          if (n.indexOf(kws[k]) >= 0) return types[t];
        }
      }
    }
    return null;
  }

  // fixturesInRoom(rects, fixtures) — fixtures: [{name, center_x, center_y}]. Point-in-rect
  // containment, no buffer (furniture is placed INSIDE a room, unlike a door which sits ON the
  // boundary and needs compile_rooms.py's DOOR_BUFFER_SLACK). Returns the matched names found.
  function fixturesInRoom(rects, fixtures) {
    var hits = [];
    if (!rects || !rects.length || !fixtures || !fixtures.length) return hits;
    for (var i = 0; i < fixtures.length; i++) {
      var f = fixtures[i];
      if (f.center_x == null || f.center_y == null) continue;
      for (var j = 0; j < rects.length; j++) {
        var r = rects[j];
        if (r.center_x == null || r.size_x == null) continue;
        var rx0 = r.center_x - r.size_x / 2, rx1 = r.center_x + r.size_x / 2;
        var ry0 = r.center_y - r.size_y / 2, ry1 = r.center_y + r.size_y / 2;
        if (f.center_x >= rx0 && f.center_x <= rx1 && f.center_y >= ry0 && f.center_y <= ry1) {
          hits.push(f.name); break;
        }
      }
    }
    return hits;
  }

  // classifyRoomWithFixtures(features, fixtureNames, config) — SYMBIOTIC combination, not a
  // one-sided override (2026-07-13, corrected after a real forward-replay miss on Duplex ground
  // truth: 2 real UTILITY rooms both contain a "Counter Top w Sink Hole" fixture, which naively
  // matched the KITCHEN keyword — a laundry/utility sink is real, "sink hole" alone isn't
  // kitchen-exclusive). Extracted fixture evidence and the Gaussian area/aspect score must AGREE:
  // a fixture only confirms its suggested type if that type's OWN z-score is still plausible for
  // the room's actual measured size (checked against config.unclassified_z_threshold, the same
  // gate classifyRoom uses) — both mismatched Utility rooms are ~1.4m^2, UTILITY's own template
  // is a near-exact match (mean 1.408 std 0.012) while KITCHEN's z is enormous (mean 12.95) at
  // that size, so the symbiotic gate correctly defers to the Gaussian's UTILITY answer instead of
  // trusting the ambiguous keyword alone. When they DO agree, the extracted fixture is still the
  // stronger claim (real evidence, not inference), so confidence is reported high but the
  // underlying z is always shown, never hidden.
  function classifyRoomWithFixtures(features, fixtureNames, config) {
    var fType = fixtureRoomType(fixtureNames);
    var gaussian = features ? classifyRoom(features, config) : null;
    var threshold = config.unclassified_z_threshold != null ? config.unclassified_z_threshold : 2.0;
    if (fType && gaussian && gaussian.scores && gaussian.scores.length) {
      var fScore = null;
      for (var i = 0; i < gaussian.scores.length; i++) {
        if (gaussian.scores[i].type === fType) { fScore = gaussian.scores[i]; break; }
      }
      if (fScore && fScore.z <= threshold) {
        var why = 'fixture:' + fType + ' confirmed by size (z=' + fScore.z.toFixed(2) + '<=' + threshold + ')';
        if (gaussian.type && gaussian.type !== fType) why += ' (gaussian alone preferred ' + gaussian.type + ')';
        return { type: fType, confidence: 0.95, unclassified: false, why: why, z: fScore.z, source: 'fixture+size' };
      }
      gaussian.why = (gaussian.why || '') + ' | fixture ' + fType + ' rejected: z=' +
        (fScore ? fScore.z.toFixed(2) : '?') + '>' + threshold + ' (keyword ambiguous for this room size)';
      gaussian.source = 'gaussian (fixture keyword overruled by size)';
      return gaussian;
    }
    if (fType && !gaussian) {
      // no geometry available to cross-check against — fixture evidence alone, lower confidence
      return { type: fType, confidence: 0.7, unclassified: false, why: 'fixture:' + fType + ' (no geometry to cross-check)', source: 'fixture-only' };
    }
    var g = gaussian || classifyRoom(features, config);
    g.source = 'gaussian';
    return g;
  }

  // loadTemplateConfig(parsedYaml) — thin validation/normalization pass over a js-yaml-parsed
  // config/room_templates.yaml object. Does NOT parse YAML itself (kept dependency-free/dual-mode
  // — caller supplies the already-parsed object, e.g. via js-yaml in Node or a browser YAML lib).
  function loadTemplateConfig(parsed) {
    if (!parsed || typeof parsed !== 'object') throw new Error(TAG + ' loadTemplateConfig: empty config');
    if (!parsed.templates) throw new Error(TAG + ' loadTemplateConfig: no templates{} block');
    return parsed;
  }

  var API = {
    normalizeLabel: normalizeLabel,
    featuresFromRects: featuresFromRects,
    countAdjacentDoors: countAdjacentDoors,
    DOOR_BUFFER_SLACK: DOOR_BUFFER_SLACK,
    scoreTemplate: scoreTemplate,
    classifyRoom: classifyRoom,
    loadTemplateConfig: loadTemplateConfig,
    FIXTURE_KEYWORDS: FIXTURE_KEYWORDS,
    fixtureRoomType: fixtureRoomType,
    fixturesInRoom: fixturesInRoom,
    classifyRoomWithFixtures: classifyRoomWithFixtures,
  };
  ROOT.RoomTypeClassifier = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
