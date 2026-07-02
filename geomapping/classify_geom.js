// classify_geom.js — IFC→BOM geomapping runtime (bim-compiler prompts/RESUME_IFC_BOM_GEOMAPPING.md
// §DELIVERABLE). Witnesses: W-GEOMAP-TIER1/TIER2/EXPLAIN/NONINVENT (geomapping/tests/witness_geomap.js).
//
// Maps an extracted element (guid / ifc_class / dims) to a BOM object description as a CHEAP DETERMINISTIC
// FUNCTION CALL — replacing "eyeball the screenshot and guess" reasoning. Three tiers, honest-refuse:
//   Tier 1  relationship-walk over the mined sidecar (relations_<TAG>.json — REAL IFC relations only,
//           storey/space/type/fills-host/aggregates; ground truth match measured 100%:
//           bim-compiler scripts/witness_geomap_tier1.py).
//   Tier 2  per-BUILDING per-class measured dimension bands (geomap_rules.json). Confidence is the
//           building's MEASURED split-half top-1 rate — never an asserted number. Cross-building
//           classification REFUSES (measured 8-17% top-1 pooled — geomap_rules.json.cross_building).
//   Tier 0  honest refuse: unknown building / no signal / out of every band → 'unknown', never a guess
//           (same honest-refuse pattern as arc_editable.js LOD300 mirror).
//
// Every result carries {tier, class_or_fact, confidence, why, frame} — `why` cites the exact relation
// instance or measured band; `frame` echoes the building's F5 frame contract from the artifact
// ({frame, units, rotation_semantics}) so no consumer can silently mix frames.
//
// Data files live in geomapping/data/ — VERBATIM copies of bim-compiler geomap/* (one source of
// truth = bim-compiler miner tools/mine_geomap.py (artifacts geomap/); plain-copy doctrine, never re-derive here).
//
// Dual-export (window + node) like arc_editable.js/cross_edges.js, so witnesses run pure-node.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ClassifyGeom = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var TAG = '§GEOMAP';
  var EPS = 1e-4; // 0.1mm floor, mirrors tools/mine_geomap.py

  var _rules = null;       // geomap_rules.json
  var _relations = {};     // TAG -> relations_<TAG>.json
  var _aliases = null;     // alias_map.json (§ALIAS-SPEC — mined type_class -> ifc_class distribution)

  // ── §ALIAS-SPEC rename table: DOCUMENTED IFC schema facts only (not mined, not guessed) — each row
  // carries its citation. Used when a band lookup misses because the corpus and the queried element sit on
  // opposite sides of a schema-generation rename. Bidirectional by construction below.
  var RENAMES = [
    { a: 'IfcWallStandardCase', b: 'IfcWall',
      cite: 'IFC4 schema: IfcWallStandardCase deprecated/merged into IfcWall (buildingSMART IFC4 release notes)' }
  ];
  function _renamesOf(cls) {
    var out = [];
    RENAMES.forEach(function (r) {
      if (r.a === cls) out.push({ cls: r.b, cite: r.cite });
      if (r.b === cls) out.push({ cls: r.a, cite: r.cite });
    });
    return out;
  }

  // ── data wiring: browser host INJECTS loaded JSON; node lazy-loads from ./data ──
  function init(opts) {
    opts = opts || {};
    if (opts.rules) _rules = opts.rules;
    if (opts.relations) _relations = opts.relations;
    if (opts.aliases) _aliases = opts.aliases;
  }
  function _nodeLoad(rel) {
    var fs = require('fs'), path = require('path');
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', rel), 'utf8'));
  }
  function _rulesFor(building) {
    if (!_rules) {
      if (typeof module === 'undefined' || !module.exports) return null; // browser: must init()
      _rules = _nodeLoad('geomap_rules.json');
    }
    return (_rules.buildings && _rules.buildings[building]) || null;
  }
  function _relFor(building) {
    if (!(building in _relations)) {
      if (typeof module === 'undefined' || !module.exports) return null;
      try { _relations[building] = _nodeLoad('relations_' + building + '.json'); }
      catch (e) { _relations[building] = null; } // honest absence (e.g. Terminal: no source IFC)
    }
    return _relations[building];
  }

  function _log3(dims) {
    var out = [];
    for (var i = 0; i < 3; i++) out.push(Math.log(Math.max(dims[i], EPS)));
    return out;
  }
  function _sorted(dims) { return dims.slice(0, 3).map(Number).sort(function (a, b) { return a - b; }); }
  function _round(x, k) { var m = Math.pow(10, k); return Math.round(x * m) / m; }
  function _bandM(b) { // band bounds back in metres, for humans in `why`
    return b.lo.map(function (x) { return _round(Math.exp(x), 3); })
      .concat(['..'])
      .concat(b.hi.map(function (x) { return _round(Math.exp(x), 3); }));
  }

  function _refuse(why, frame) {
    return { tier: 0, class_or_fact: 'unknown', confidence: 0, why: why, frame: frame || null };
  }

  function _aliasMap() {
    if (!_aliases) {
      if (typeof module === 'undefined' || !module.exports) return null; // browser: must init()
      try { _aliases = _nodeLoad('alias_map.json'); } catch (e) { _aliases = null; }
    }
    return _aliases;
  }

  // ── §ALIAS-SPEC alias(): graph-context class infusion for unknown/badly-annotated elements. ──
  // Source is ONLY (a) the element's REAL IfcRelDefinesByType type_class through the MINED observed
  // distribution (measured LOBO in-set 98.3-100% across all 7 buildings — alias_map.json.measured), or
  // (b) the documented schema-rename table. No geometry guessing; no match -> honest null.
  // Returns { candidates: {cls: count}|null, winner, ambiguous, why } or null.
  function alias(typeClass, ifcClass) {
    var am = _aliasMap();
    if (typeClass && am && am.map[typeClass]) {
      var row = am.map[typeClass];
      return {
        candidates: row.classes, winner: row.winner, ambiguous: row.ambiguous,
        why: 'IfcRelDefinesByType type_class=' + typeClass + ' -> mined observed distribution (n=' + row.n +
          (row.ambiguous ? ', AMBIGUOUS ' + Object.keys(row.classes).join('|') : '') + ') — alias_map.json'
      };
    }
    if (ifcClass) {
      var rn = _renamesOf(ifcClass);
      if (rn.length) {
        var cands = {};
        rn.forEach(function (r) { cands[r.cls] = null; });
        return { candidates: cands, winner: rn[0].cls, ambiguous: rn.length > 1, why: rn[0].cite };
      }
    }
    return null; // honest: nothing real to infuse from
  }

  // resolve a class that has NO band in this building to one that does, via alias/rename — or null.
  function _aliasToBanded(entry, ifcClass, typeClass) {
    var a = alias(typeClass, ifcClass);
    if (!a) return null;
    // try winner first, then remaining candidates deterministically (sorted)
    var tries = [a.winner].concat(Object.keys(a.candidates).sort().filter(function (c) { return c !== a.winner; }));
    for (var i = 0; i < tries.length; i++) {
      if (entry.classes[tries[i]]) return { cls: tries[i], ambiguous: a.ambiguous, why: a.why };
    }
    return null;
  }

  // ── Tier 1: relationship facts for a guid (REAL mined relations only) ──
  function tier1(building, guid) {
    var rel = _relFor(building);
    var entry = _rulesFor(building);
    var frame = entry ? entry.frame : null;
    if (!rel) return _refuse('no relation sidecar mined for building "' + building + '" (honest absence — see F4/F6)', frame);
    var e = rel.elements[guid];
    if (!e) return _refuse('guid not present in relations_' + building + '.json — no relation exists in source IFC, refusing to fabricate', frame);
    var facts = {}, cites = [];
    if (e.storey) { facts.storey = e.storey; cites.push('IfcRelContainedInSpatialStructure→storey'); }
    if (e.space) {
      facts.space = e.space;
      var sp = rel.spaces[e.space];
      if (sp) facts.space_name = sp.name;
      cites.push('IfcRelContainedInSpatialStructure→IfcSpace');
    }
    if (e.type_name) { facts.type_name = e.type_name; facts.type_class = e.type_class; cites.push('IfcRelDefinesByType'); }
    if (e.fills_host) { facts.fills_host = e.fills_host; cites.push('IfcRelVoidsElement+IfcRelFillsElement chain'); }
    if (e.aggregates_parent) { facts.aggregates_parent = e.aggregates_parent; cites.push('IfcRelAggregates'); }
    if (!cites.length) return _refuse('guid joined but carries zero relations in source IFC — refusing to fabricate', frame);
    return {
      tier: 1,
      class_or_fact: facts,
      confidence: 1.0, // relational read-through; ground-truth agreement measured 100% (witness_geomap_tier1.py)
      why: 'mined from ' + rel.sources.map(function (s) { return s.file; }).join('+') + ' via ' + cites.join(', '),
      frame: frame
    };
  }

  // ── Tier 2: per-building measured band ranking / validation ──
  function tier2(building, dims, claimedClass, typeClass) {
    var entry = _rulesFor(building);
    if (!entry) return _refuse('no measured bands for building "' + building + '" — cross-building bands are REFUSED (' + (_rules ? _rules.cross_building : 'rules not loaded') + ')', null);
    var frame = entry.frame;
    var lf = _log3(_sorted(dims));
    var scored = [];
    Object.keys(entry.classes).sort().forEach(function (cls) {
      var b = entry.classes[cls];
      var z = 0;
      for (var i = 0; i < 3; i++) z += Math.abs(lf[i] - b.med[i]) / b.sig[i];
      var inBand = true;
      for (var j = 0; j < 3; j++) if (lf[j] < b.lo[j] || lf[j] > b.hi[j]) { inBand = false; break; }
      scored.push({ cls: cls, z: _round(z, 6), in_band: inBand, count: b.count });
    });
    scored.sort(function (a, b) { return a.z - b.z || (a.cls < b.cls ? -1 : 1); });

    var m = entry.measured;
    var top1Rate = m.n ? _round(m.top1 / m.n, 3) : 0;
    var inBandRate = m.n ? _round(m.own_class_in_band / m.n, 3) : 0;

    if (claimedClass) { // validator use — the extraction-correctness check
      var aliasNote = null, effClass = claimedClass;
      var b = entry.classes[claimedClass];
      if (!b) {
        // §ALIAS-SPEC: unknown/proxy/renamed class — try graph-context alias to a banded class,
        // never silently: the result carries alias_of/alias_why.
        var al = _aliasToBanded(entry, claimedClass, typeClass);
        if (!al) return _refuse('class "' + claimedClass + '" has no measured band in ' + building + ' (<3 samples or absent) and no real alias signal (type relation / documented rename) — cannot validate, refusing to guess', frame);
        effClass = al.cls;
        b = entry.classes[effClass];
        aliasNote = al;
      }
      var ok = scored.filter(function (s) { return s.cls === effClass; })[0];
      var res = {
        tier: 2,
        class_or_fact: { validate: effClass, in_band: ok.in_band, z: ok.z },
        confidence: inBandRate, // measured own-class in-band rate = expected true-accept rate
        why: 'measured band for ' + effClass + ' in ' + building + ' (n=' + b.count + ', dims_m ' + _bandM(b).join(' ') + '); own-class in-band measured ' + m.own_class_in_band + '/' + m.n,
        frame: frame
      };
      if (aliasNote) {
        res.alias_of = claimedClass;
        res.alias_ambiguous = aliasNote.ambiguous;
        res.alias_why = aliasNote.why;
        res.why = 'ALIAS ' + claimedClass + '->' + effClass + ' (' + aliasNote.why + '); ' + res.why;
      }
      return res;
    }

    var anyBand = scored.some(function (s) { return s.in_band; });
    if (!anyBand) return _refuse('dims ' + _sorted(dims).join('x') + 'm fall outside EVERY measured band in ' + building + ' — no honest candidate', frame);
    return {
      tier: 2,
      class_or_fact: scored[0].cls,
      candidates: scored.slice(0, 3),
      confidence: top1Rate, // the building's MEASURED split-half top-1 — never asserted
      why: 'rank-1 by robust-z against ' + building + ' measured bands (class n=' + scored[0].count + ', split-half top-1 ' + m.top1 + '/' + m.n + ')',
      frame: frame
    };
  }

  // ── public: one call, tiers in priority order ──
  function classify(input) {
    input = input || {};
    var building = input.building;
    if (!building) return _refuse('no building given — bands/relations are per-building (cross-building REFUSED)', null);
    if (input.guid) {
      var t1 = tier1(building, input.guid);
      if (t1.tier === 1) return t1;
      if (!input.dims) return t1; // nothing else to fall to — honest refuse from tier 1
    }
    if (input.dims) return tier2(building, input.dims, input.ifc_class || null, input.type_class || null);
    return _refuse('no usable signal (need guid for Tier 1 or dims for Tier 2)', (_rulesFor(building) || {}).frame);
  }

  // BOM object description for a class (LOD300_CATALOG replacement seam)
  function describe(building, ifcClass) {
    var entry = _rulesFor(building);
    if (!entry || !entry.classes[ifcClass]) return null;
    var b = entry.classes[ifcClass];
    return {
      building: building, ifc_class: ifcClass, count: b.count,
      dims_m: { lo: b.lo.map(function (x) { return _round(Math.exp(x), 4); }), hi: b.hi.map(function (x) { return _round(Math.exp(x), 4); }), med: b.med.map(function (x) { return _round(Math.exp(x), 4); }) },
      frame: entry.frame,
      why: 'measured band mined from ' + entry.db + ' (md5 ' + entry.db_md5.slice(0, 8) + ', n=' + b.count + ')'
    };
  }

  var api = { init: init, classify: classify, describe: describe, alias: alias, RENAMES: RENAMES, TAG: TAG };

  // ── CLI: node geomapping/classify_geom.js '{"building":"DX","dims":[0.1,0.9,2.1]}' ──
  if (typeof module !== 'undefined' && module.exports && typeof require !== 'undefined' &&
      typeof process !== 'undefined' && require.main === module) {
    var arg = process.argv[2];
    if (!arg) {
      console.log('usage: node classify_geom.js \'{"building":"DX","guid":"..."|"dims":[x,y,z],"ifc_class":"IfcDoor"?}\'');
      process.exit(2);
    }
    console.log(JSON.stringify(classify(JSON.parse(arg)), null, 1));
  }

  return api;
});
