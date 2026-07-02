// geomap_bridge.js — modeller↔geomapping wiring seam (bim-compiler prompts/RESUME_IFC_BOM_GEOMAPPING.md
// §WIRE-SPEC deliverable 1). Witness: geomapping/tests/witness_wire.js (W-GEOMAP-WIRE W4/W5).
//
// classify_geom.js speaks geomap TAGs (SH/DX/SC/Terminal — the mined artifact keys); the modeller speaks
// resident keys (str_walker_outliner.js RESIDENTS). This bridge owns that map and NOTHING else clever:
// unknown key → honest null (never a guessed tag), all real work stays in ClassifyGeom.
//
// AUDIT-FIRST doctrine (§WIRE-SPEC): everything exposed here feeds a PARALLEL audit channel — logs, return
// blocks, window surfaces. Nothing here may gate/alter the signed op substrate; that flip is a later,
// separately-witnessed step.
//
// Dual-export (window + node) like classify_geom.js itself.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./classify_geom.js'));
  else root.GeomapBridge = factory(root.ClassifyGeom);
})(typeof window !== 'undefined' ? window : this, function (ClassifyGeom) {
  'use strict';
  var TAG = '§GEOMAP-BRIDGE';

  // Resident key → mined-artifact tag. SampleCastle-ARC maps to SC: it is the SAME building's rows
  // (SampleCastle_ARC_extracted.db is the ARC-discipline subset of SampleCastle_extracted.db, which is
  // what SC's bands were mined from) — same measured population, not a borrowed prior.
  var TAG_BY_BUILDING = {
    'SampleHouse': 'SH',
    'Duplex': 'DX',
    'SampleCastle': 'SC',
    'SampleCastle-ARC': 'SC',
    'Terminal': 'Terminal',
    // Viewer-side buildings (not modeller residents, mapped for gmValidate/gmSignal consumers there)
    'HHS_Office_Federated': 'HHS',
    'Clinic': 'CL',
    'Hospital': 'HO'
  };

  function gmTag(buildingKey) {
    return TAG_BY_BUILDING.hasOwnProperty(buildingKey) ? TAG_BY_BUILDING[buildingKey] : null;
  }

  // ── browser data init: fetch the mined artifacts once and hand them to ClassifyGeom.init(). ──
  // Node needs none of this (classify_geom lazy-loads from ./data itself). Failure-tolerant by design:
  // a caller that can't load data simply gets no audit (logged), never a broken seed.
  var _loaded = null; // Promise once started
  var _ready = false; // true only after a successful data init — callers gate best-effort audit on this
  function gmReady() { return _ready; }
  function gmLoad(baseUrl) {
    if (_loaded) return _loaded;
    if (typeof fetch !== 'function') { _loaded = Promise.resolve(false); return _loaded; }
    var base = (baseUrl || '../geomapping/') + 'data/';
    function j(rel) { return fetch(base + rel).then(function (r) { if (!r.ok) throw new Error(rel + ' ' + r.status); return r.json(); }); }
    var aliasP = j('alias_map.json').catch(function () { return null; }); // §ALIAS-SPEC (8KB; optional)
    _loaded = j('geomap_rules.json').then(function (rules) {
      // relation sidecars are per-tag and optional (Terminal has none yet — honest absence, F4/F11);
      // fetch what exists, tolerate what doesn't.
      var tags = ['SH', 'DX', 'SC'];
      return Promise.all(tags.map(function (t) {
        return j('relations_' + t + '.json').catch(function () { return null; });
      }).concat([aliasP])).then(function (rels) {
        var relations = {};
        tags.forEach(function (t, i) { relations[t] = rels[i]; });
        ClassifyGeom.init({ rules: rules, relations: relations, aliases: rels[tags.length] || undefined });
        _ready = true;
        _log(TAG + ' data loaded (rules + ' + rels.filter(Boolean).length + '/' + tags.length + ' relation sidecars)');
        return true;
      });
    }).catch(function (e) {
      _log(TAG + ' data load FAILED (' + (e && e.message) + ') — geomap audit unavailable, seeding unaffected');
      return false;
    });
    return _loaded;
  }

  // ── thin wrappers: resident key in, honest refuse out when the key/tag/data has no answer ──
  function gmDescribe(buildingKey, ifcClass) {
    var t = gmTag(buildingKey);
    return t ? ClassifyGeom.describe(t, ifcClass) : null;
  }
  // validator use (tier 2 claimedClass): is this element's measured dims inside its OWN class's measured band?
  function gmValidate(buildingKey, dims, ifcClass) {
    var t = gmTag(buildingKey);
    if (!t) return { tier: 0, class_or_fact: 'unknown', confidence: 0, why: 'building key "' + buildingKey + '" has no mined geomap tag — refusing to guess', frame: null };
    return ClassifyGeom.classify({ building: t, dims: dims, ifc_class: ifcClass });
  }
  // full per-element signal (Tier 1 first via guid, else Tier 2) — walker_confidence.wcGeomapSignal's input.
  function gmSignal(buildingKey, el) {
    var t = gmTag(buildingKey);
    if (!t) return { tier: 0, class_or_fact: 'unknown', confidence: 0, why: 'building key "' + buildingKey + '" has no mined geomap tag — refusing to guess', frame: null };
    return ClassifyGeom.classify({ building: t, guid: el.guid, dims: el.dims, ifc_class: el.ifc_class, type_class: el.type_class });
  }

  function _log(m) { if (typeof console !== 'undefined') console.log(m); }

  return { gmTag: gmTag, gmLoad: gmLoad, gmReady: gmReady, gmDescribe: gmDescribe, gmValidate: gmValidate,
    gmSignal: gmSignal, TAG_BY_BUILDING: TAG_BY_BUILDING, TAG: TAG };
});
