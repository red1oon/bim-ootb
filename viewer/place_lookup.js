/**
 * # ⚠ DO NOT REMOVE — §PLACE offline place lookup
 *   (bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §13)
 *
 * Resolves a site's WGS84 coordinate to the nearest real settlement, from a VENDORED table.
 * OFFLINE. No fetch, no XMLHttpRequest, no network of any kind — that invariant is the whole
 * reason §13 supersedes §9's Open-Meteo answer, and witness_place_lookup.js asserts it against
 * this file's own bytes. The caller hands in the table's text; this module never goes and gets it.
 *
 * NOTHING HERE INVENTS A NUMBER. Every field returned is a column of rates/cities.tsv.gz, whose
 * header carries the source, licence, URL, download date and a hash of the original.
 *
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT
 */
(function () {
  'use strict';

  // §13.2 — NEAREST WITH A BOUND, NEVER NEAREST. Past this, the answer is "no match" and the caller
  // shows the raw coordinate. A silent snap to whatever happened to be closest is how a rural site
  // becomes a confident lie, so the distance is returned on EVERY hit and the bound is explicit.
  var DEFAULT_MAX_KM = 25;
  var EARTH_R_KM = 6371.0088;          // IUGG mean radius
  var DEG = Math.PI / 180;

  function haversineKm(lat1, lon1, lat2, lon2) {
    var dLat = (lat2 - lat1) * DEG, dLon = (lon2 - lon1) * DEG;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  // The table is sorted by latitude and its latitude column is DELTA-encoded (§13, measured: it
  // takes the 150k-row shape from 1.68 MB to 1.51 MB gzipped and buys the band prune below at the
  // same time). Parsing reconstructs the absolute latitude by running sum, in file order.
  function parse(text) {
    if (typeof text !== 'string' || !text) return null;
    var lines = text.split('\n');
    var meta = { tz: [] }, lat = 0, rows = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (!ln) continue;
      if (ln.charCodeAt(0) === 35) {                       // '#' header
        var h = ln.slice(1).split('\t');
        if (h[0] === 'tz') meta.tz = (h[1] || '').split(',');
        else if (h[0] === 'rows') meta.rows = +h[1];
        else meta[h[0]] = h[1];
        continue;
      }
      var p = ln.split('\t');
      if (p.length < 9) continue;
      lat = Math.round((lat + parseFloat(p[0])) * 100) / 100;
      rows.push({ lat: lat, lon: parseFloat(p[1]), name: p[2], cc: p[3], admin1: p[4],
                  elevation_m: +p[5], elevSrc: p[6], tz: meta.tz[+p[7]] || '', population: +p[8] });
    }
    return rows.length ? { meta: meta, rows: rows } : null;
  }

  // First index whose latitude is >= v. The table is sorted, so the band prune below is a pair of
  // binary searches rather than a sweep of 69,735 rows per query.
  function lowerBound(rows, v) {
    var lo = 0, hi = rows.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (rows[mid].lat < v) lo = mid + 1; else hi = mid; }
    return lo;
  }

  function nearest(table, lat, lon, maxKm) {
    if (!table || !table.rows || !table.rows.length) return null;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !isFinite(lat) || !isFinite(lon)) return null;
    var bound = (typeof maxKm === 'number' && maxKm > 0) ? maxKm : DEFAULT_MAX_KM;
    // One degree of latitude is ~111.32 km everywhere; longitude narrows with latitude but the
    // LATITUDE band alone is a sound prune — anything outside it is already further than `bound`.
    var dLat = bound / 111.32;
    var rows = table.rows;
    var i0 = lowerBound(rows, lat - dLat), i1 = lowerBound(rows, lat + dLat);
    var best = null, bestKm = Infinity;
    for (var i = i0; i < i1; i++) {
      var km = haversineKm(lat, lon, rows[i].lat, rows[i].lon);
      if (km < bestKm) { bestKm = km; best = rows[i]; }
    }
    if (!best || bestKm > bound) {
      return { match: false, km: (best ? bestKm : null), boundKm: bound,
               reason: best ? 'nearest settlement is ' + bestKm.toFixed(1) + ' km away, past the ' +
                              bound + ' km bound' : 'no row within the latitude band' };
    }
    return { match: true, name: best.name, cc: best.cc, admin1: best.admin1,
             km: bestKm, boundKm: bound, elevation_m: best.elevation_m, elevSrc: best.elevSrc,
             tz: best.tz, population: best.population,
             source: (table.meta && table.meta.source) || 'unknown' };
  }

  // §13.3 — THREE ELEVATIONS THAT DISAGREE, AND NONE OF THEM IS SILENTLY PREFERRED.
  // Hospital: ifc_site says 165.81 m and the bake's own datum says groundZ=165.36, while the
  // matched city sits near sea level. That disagreement IS the finding — it says the IFC
  // "elevation" is a project datum, not height above sea level. So this returns all three, names
  // which one it would quote, and reports the spread. It never averages them.
  function elevations(ifcSiteM, bakeGroundZM, cityM) {
    var have = [];
    if (typeof ifcSiteM === 'number' && isFinite(ifcSiteM)) have.push(['ifc_site', ifcSiteM]);
    if (typeof bakeGroundZM === 'number' && isFinite(bakeGroundZM)) have.push(['bake_groundZ', bakeGroundZM]);
    if (typeof cityM === 'number' && isFinite(cityM)) have.push(['city_table', cityM]);
    if (!have.length) return { quoted: null, spread_m: null, all: [] };
    var vals = have.map(function (h) { return h[1]; });
    var spread = Math.max.apply(null, vals) - Math.min.apply(null, vals);
    // The city table is the only one of the three that IS height above sea level by definition;
    // the other two are model datums. So it is quoted when present — and when it disagrees with
    // them by more than this, the caller is expected to say so rather than bury it.
    var pick = have.filter(function (h) { return h[0] === 'city_table'; })[0] || have[0];
    return { quoted: { src: pick[0], m: pick[1] }, spread_m: spread,
             all: have.map(function (h) { return { src: h[0], m: h[1] }; }) };
  }

  var API = { parse: parse, nearest: nearest, elevations: elevations,
              haversineKm: haversineKm, DEFAULT_MAX_KM: DEFAULT_MAX_KM };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.PlaceLookup = API;
})();
