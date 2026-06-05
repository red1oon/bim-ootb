/**
 * BIM OOTB — analysis_sidecar.js
 * Implementing ANALYSIS_SIDECAR.md §T3 — Witness: W-5D-SIDECAR
 *
 * Per-building analysis sidecars, lazily baked to OPFS. The expensive geometry
 * (bbox) is already frozen in the DB; this caches the AGGREGATE so a page opens
 * without re-fetching/re-opening the meta.db.
 *
 *  - 5D sidecar holds CURRENCY-FREE quantities only (count/length/area/vol).
 *    The live rate pack is applied at runtime (apply5DRates) → currency-flexible,
 *    no re-bake when the locale changes. Same bbox basis as the shipped BOQ, so
 *    the numbers stay consistent with export_5d.js / cost_panel.js.
 *  - Persisted via the plain async OPFS API (no COOP/COEP, works on GitHub Pages,
 *    single-tab, offline). OPFS-absent → graceful: compute every time, no cache.
 *
 * NOTE on money: cost = rate × qty in JS Number, ROUNDED to match the existing
 * indicative BOQ exactly (consistency invariant). The ERP authoritative money-fold
 * uses BigDecimal; the viewer's indicative cost mirrors the shipped BOQ basis.
 */
(function () {
  'use strict';

  var OPFS_DIR = 'bim_analysis';

  // ── OPFS JSON store (async API) ─────────────────────────────────────────
  function _opfsDir() {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) {
      return Promise.resolve(null);
    }
    return navigator.storage.getDirectory()
      .then(function (root) { return root.getDirectoryHandle(OPFS_DIR, { create: true }); })
      .catch(function () { return null; });
  }

  // Read a sidecar object, or null if not baked / OPFS unavailable.
  function sidecarRead(name) {
    return _opfsDir().then(function (dir) {
      if (!dir) return null;
      return dir.getFileHandle(name)                 // rejects if absent
        .then(function (fh) { return fh.getFile(); })
        .then(function (f) { return f.text(); })
        .then(function (t) { return JSON.parse(t); })
        .catch(function () { return null; });        // not baked yet
    });
  }

  // Persist a sidecar object. Returns true on success, false if OPFS unavailable.
  function sidecarWrite(name, obj) {
    return _opfsDir().then(function (dir) {
      if (!dir) return false;
      return dir.getFileHandle(name, { create: true })
        .then(function (fh) { return fh.createWritable(); })
        .then(function (w) { return w.write(JSON.stringify(obj)).then(function () { return w.close(); }); })
        .then(function () { return true; })
        .catch(function () { return false; });
    });
  }

  // ── 5D quantities (currency-free) ───────────────────────────────────────
  // Longest dim = length_m; longest × second-longest = dominant face area_m2;
  // bbox envelope = vol_m3. Same expressions as mep_report.html / cost_panel.js.
  function compute5D(db, building) {
    var bld = String(building).replace(/'/g, "''");
    var areaExpr =
      "MAX(t.bbox_x,t.bbox_y,t.bbox_z) * CASE " +
      "WHEN t.bbox_x>=t.bbox_y AND t.bbox_x>=t.bbox_z THEN MAX(t.bbox_y,t.bbox_z) " +
      "WHEN t.bbox_y>=t.bbox_x AND t.bbox_y>=t.bbox_z THEN MAX(t.bbox_x,t.bbox_z) " +
      "ELSE MAX(t.bbox_x,t.bbox_y) END";
    var sql =
      "SELECT m.discipline, m.ifc_class, m.storey, COUNT(*) AS cnt, " +
      "ROUND(SUM(MAX(t.bbox_x,t.bbox_y,t.bbox_z)),3) AS length_m, " +
      "ROUND(SUM(" + areaExpr + "),3) AS area_m2, " +
      "ROUND(SUM(t.bbox_x*t.bbox_y*t.bbox_z),3) AS vol_m3 " +
      "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
      "WHERE m.building='" + bld + "' AND t.bbox_x IS NOT NULL AND t.bbox_x>0 " +
      "GROUP BY m.discipline, m.ifc_class, m.storey";
    var res = db.exec(sql);
    var rows = (res.length ? res[0].values : []).map(function (r) {
      return {
        disc: r[0], cls: r[1], storey: r[2],
        count: r[3] || 0, length_m: r[4] || 0, area_m2: r[5] || 0, vol_m3: r[6] || 0
      };
    });
    return { building: building, basis: 'bbox', schema: '5d.v1', rows: rows };
  }

  // Lazy bake: OPFS hit → return it; else compute, persist, return.
  function get5D(db, building) {
    var name = building + '_5d.json';
    return sidecarRead(name).then(function (sc) {
      if (sc && sc.rows) {
        console.log('§5D_SIDECAR source=opfs building=' + building + ' rows=' + sc.rows.length);
        return sc;
      }
      var fresh = compute5D(db, building);
      return sidecarWrite(name, fresh).then(function (ok) {
        console.log('§5D_SIDECAR source=computed building=' + building +
          ' rows=' + fresh.rows.length + ' baked=' + ok);
        return fresh;
      });
    });
  }

  // ── Runtime rate apply (live pack × currency-free quantities) ────────────
  // RATES: { IfcDoor:{rate,unit,desc}, ... } (rates.js global, set by active pack).
  // unit drives which quantity is billed: EA→count, M→length, M2→area, M3→vol.
  function apply5DRates(sidecar, RATES, currency) {
    RATES = RATES || {};
    return sidecar.rows.map(function (r) {
      var rt = RATES[r.cls];
      var unit = rt ? rt.unit : 'EA';
      var rate = rt ? rt.rate : 0;
      var qty;
      if (unit === 'M') qty = r.length_m;
      else if (unit === 'M2') qty = r.area_m2;
      else if (unit === 'M3') qty = r.vol_m3;
      else { unit = rt ? unit : 'EA'; qty = r.count; }   // EA / KG / unmapped → count
      var cost = Math.round(rate * qty);
      return {
        disc: r.disc, cls: r.cls, storey: r.storey, count: r.count,
        unit: unit, qty: qty, rate: rate, cost: cost, currency: currency || ''
      };
    });
  }

  // ── 4D schedule (captured-or-CPM default, kernel_ops override) ──────────
  // Orchestration ONLY — the algorithms stay single-source in the page:
  //   capturedFn() → native IFC tasks[] (IfcWorkSchedule) or null/[]   [extract]
  //   cpmFn(qtoData, start) → deterministic forward-pass tasks[]        [compile]
  // Priority: captured > CPM default. kernel_ops is a runtime OVERRIDE (resolve4D),
  // never a dependency → TM's drone regenerate can't break the Gantt.
  function compute4D(building, capturedFn, cpmFn, qtoData, startDate) {
    var cap = null;
    try { cap = capturedFn ? capturedFn() : null; } catch (e) { cap = null; }
    if (cap && cap.length) {
      return { building: building, schema: '4d.v1', source: 'captured', tasks: cap };
    }
    var tasks = cpmFn(qtoData, startDate || '2025-01-06');
    return { building: building, schema: '4d.v1', source: 'generated', tasks: tasks };
  }

  // Lazy bake: OPFS hit → return; miss → compute default, persist, return.
  function get4D(building, capturedFn, cpmFn, qtoData, startDate) {
    var name = building + '_4d.json';
    return sidecarRead(name).then(function (sc) {
      if (sc && sc.tasks) {
        console.log('§4D_SIDECAR source=opfs building=' + building +
          ' schedule=' + sc.source + ' tasks=' + sc.tasks.length);
        return sc;
      }
      var fresh = compute4D(building, capturedFn, cpmFn, qtoData, startDate);
      return sidecarWrite(name, fresh).then(function (ok) {
        console.log('§4D_SIDECAR source=computed building=' + building +
          ' schedule=' + fresh.source + ' tasks=' + fresh.tasks.length + ' baked=' + ok);
        return fresh;
      });
    });
  }

  // Override resolution — the baked default is the ALWAYS-VALID base; kernel_ops
  // overlays only if it actually yields tasks. A broken/empty/throwing kernel_ops
  // falls to the default → the Gantt is never broken (the regression guard).
  function resolve4D(default4D, kernelOps, buildFromOpsFn) {
    if (kernelOps && kernelOps.length && typeof buildFromOpsFn === 'function') {
      try {
        var ot = buildFromOpsFn(kernelOps);
        if (ot && ot.length) {
          console.log('§4D_RESOLVE source=kernel_ops tasks=' + ot.length + ' overridden=true');
          return { tasks: ot, source: 'kernel_ops', overridden: true };
        }
      } catch (e) { /* fall through to the baked default */ }
    }
    console.log('§4D_RESOLVE source=' + default4D.source + ' tasks=' + default4D.tasks.length + ' overridden=false');
    return { tasks: default4D.tasks, source: default4D.source, overridden: false };
  }

  var API = {
    sidecarRead: sidecarRead, sidecarWrite: sidecarWrite,
    compute5D: compute5D, get5D: get5D, apply5DRates: apply5DRates,
    compute4D: compute4D, get4D: get4D, resolve4D: resolve4D
  };
  if (typeof window !== 'undefined') window.AnalysisSidecar = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
