/**
 * real_placement_resolver.js — ONE shared gate every leaf placement (fixture, pipe, future component) is
 * FORCED through before it renders a bbox. docs/internal/WalkerDoctrine.md §10 (2026-07-07, user directive):
 * §8/§9 found the SAME hardcoded-constant violation independently at 6+ call sites across TWO walker files
 * (routewalker.js's `RW_PIPE_NOMINAL_MM` cross-section AND its `_rwPlaceFromBOM` fixture box, both flat
 * constants standing in for real product data) — patching each site by hand only guarantees a third recurs.
 * This module is the structural fix: `resolveRealPlacement()` is the ONE function every leaf-placement call
 * site should route through instead of reading `ad_product_dim` (or inventing a box) independently.
 *
 * Contract (§10's own spec, verbatim):
 *   resolveRealPlacement({discipline, category, ifc_class, productHint, ...context})
 *     MATCH    -> {width, depth, height, anchor, matchedProductId, source} — real, sourced, citable.
 *     NO MATCH -> THROWS a WalkerGapError (code='WALKER_GAP') carrying full search context. The caller MUST
 *                 catch it, log it VISIBLY (console.error), and count the placement as refused. It must
 *                 NEVER catch-and-substitute a constant — that silent substitution is the exact violation
 *                 this gate exists to make structurally hard to reintroduce (§4/§8's REFUSE-beats-fabricate
 *                 rule, generalized here to every leaf placement, not just pipes or fixtures).
 *
 * Source of truth: library/component_library.db's `ad_product_dim` table (bim-compiler repo — NOT shipped
 * into this modeller's own served tree, so unlike a live sql.js DB read, its real width/depth/height/
 * conn_points rows are extracted here ONCE as a small, cited, non-invent table). This mirrors two already
 * doctrine-compliant precedents in this same codebase: disc_walker.js's `MEP_REAL_FITTINGS` (§7 — a real
 * mini-BOM RosettaStone extract, replayed + cited rather than recomputed) and bonsai_library.js's `CATALOG`
 * (real mesh components extracted NON-INVENT from the same component_library.db family). "Extract once,
 * replay, cite the source row" — not a live per-call DB read, and not a fuzzy/semantic guess.
 *
 * Extraction command (2026-07-07), every row below copied verbatim from its output — no value here was typed
 * from memory or "close enough" rounded:
 *   sqlite3 -header -column library/component_library.db "SELECT product_id, product_type, width, depth,
 *     height, requires_host, conn_points FROM ad_product_dim WHERE product_id IN ('FIXTURE_TOILET',
 *     'FIXTURE_SINK','FIXTURE_SHOWER','FIXTURE_WATER_HEATER','ELEC_OUTLET','ELEC_SWITCH','ELEC_LIGHT',
 *     'FP_SPRINKLER','FP_SMOKE');"
 */
(function (ROOT) {
  'use strict';
  var TAG = '§RPR';

  // REAL rows, verbatim from ad_product_dim (library/component_library.db). Dimensions are FULL extents in
  // metres (matches this codebase's own element_transforms.bbox_x/y/z convention — see routewalker.js's
  // `_rwAabbOverlap`, which halves whatever is passed in). `conn_points` is the real anchor/shim JSON column
  // ("[{"face":"BACK","type":"WASTE"},...]") — the same shape as `ad_assembly_connector`'s
  // face/connector_type rows, just embedded per-product instead of per-assembly.
  var REAL_PRODUCT_DIM = {
    FIXTURE_TOILET:       { product_type: 'FIXTURE',    width: 0.4,   depth: 0.7,  height: 0.4,
      requires_host: 'FLOOR',   conn_points: [{ face: 'BACK', type: 'WASTE' }, { face: 'LEFT', type: 'SUPPLY' }] },
    FIXTURE_SINK:         { product_type: 'FIXTURE',    width: 0.5,   depth: 0.45, height: 0.2,
      requires_host: 'WALL',    conn_points: [{ face: 'BACK', type: 'WASTE' }, { face: 'BACK', type: 'SUPPLY' }] },
    FIXTURE_SHOWER:       { product_type: 'FIXTURE',    width: 0.9,   depth: 0.9,  height: 2.1,
      requires_host: 'FLOOR',   conn_points: [{ face: 'WALL', type: 'SUPPLY' }, { face: 'FLOOR', type: 'WASTE' }] },
    FIXTURE_WATER_HEATER: { product_type: 'FIXTURE',    width: 0.55,  depth: 0.25, height: 0.55,
      requires_host: 'WALL',    conn_points: [] },
    ELEC_OUTLET:          { product_type: 'ELECTRICAL', width: 0.085, depth: 0.04, height: 0.085,
      requires_host: 'WALL',    conn_points: [{ face: 'BACK', type: 'ELEC' }] },
    ELEC_SWITCH:          { product_type: 'ELECTRICAL', width: 0.085, depth: 0.04, height: 0.085,
      requires_host: 'WALL',    conn_points: [{ face: 'BACK', type: 'ELEC' }] },
    ELEC_LIGHT:           { product_type: 'ELECTRICAL', width: 0.3,   depth: 0.3,  height: 0.1,
      requires_host: 'CEILING', conn_points: [{ face: 'TOP', type: 'ELEC' }] },
    FP_SPRINKLER:         { product_type: 'FP',         width: 0.1,   depth: 0.1,  height: 0.15,
      requires_host: 'CEILING', conn_points: [{ face: 'TOP', type: 'FP' }] },
    FP_SMOKE:             { product_type: 'FP',         width: 0.12,  depth: 0.12, height: 0.05,
      requires_host: 'CEILING', conn_points: [{ face: 'TOP', type: 'ELEC' }] }
  };

  // Curated ALIAS map: a caller's `productHint` (e.g. routewalker.js's `ad_space_type_mep_bom.mep_product_id`
  // values — 'TOILET','OUTLET',...) -> the real `ad_product_dim.product_id` it names the SAME physical item
  // as. This is a disclosed 1:1 IDENTITY map, not fuzzy/semantic matching. Deliberately NOT aliased (left to
  // hard-fail honestly): OUTLET_20A / OUTLET_GFCI (component_library.db has no dedicated row — a 20A or GFCI
  // faceplate may be a different real size, so reusing ELEC_OUTLET's numbers would be INVENTING an
  // equivalence, not extracting one), EMERGENCY_LIGHT (a battery-backup unit may differ physically from
  // ELEC_LIGHT — no real row to confirm either way), and AIRCON_POINT / CEILING_FAN / DATA_POINT /
  // EXHAUST_FAN / SUPPLY_DIFFUSER / FRIDGE / FLOOR_TRAP / WASHING_TAP (no product row in component_library.db
  // under any of these names at all — genuinely no real match today).
  var PRODUCT_ALIAS = {
    TOILET:    'FIXTURE_TOILET',
    SINK:      'FIXTURE_SINK',
    OUTLET:    'ELEC_OUTLET',
    SWITCH:    'ELEC_SWITCH',
    LIGHT:     'ELEC_LIGHT',
    SPRINKLER: 'FP_SPRINKLER'
  };

  function WalkerGapError(msg, gap) {
    var e = new Error(msg);
    e.name = 'WalkerGapError';
    e.code = 'WALKER_GAP';
    e.gap = gap;
    return e;
  }

  /**
   * resolveRealPlacement(ctx) — ctx: {discipline, category, ifc_class, productHint, assemblyHint}
   * `productHint`/`category` is the lookup key (either an exact ad_product_dim.product_id, e.g. 'FIXTURE_SINK',
   * or a curated PRODUCT_ALIAS key, e.g. 'SINK'). Returns real dims+anchor on match; THROWS WalkerGapError on
   * no match — see module header for the full contract. Never returns a fabricated default.
   */
  function resolveRealPlacement(ctx) {
    ctx = ctx || {};
    var productHint = ctx.productHint || ctx.category || null;
    var productId = null, dim = null;

    if (productHint && Object.prototype.hasOwnProperty.call(REAL_PRODUCT_DIM, productHint)) {
      productId = productHint; dim = REAL_PRODUCT_DIM[productId];
    } else if (productHint && Object.prototype.hasOwnProperty.call(PRODUCT_ALIAS, productHint)) {
      productId = PRODUCT_ALIAS[productHint]; dim = REAL_PRODUCT_DIM[productId];
    }

    if (!dim) {
      var gap = {
        discipline: ctx.discipline || null,
        category: ctx.category || null,
        ifc_class: ctx.ifc_class || null,
        productHint: productHint,
        searched: {
          exactProductIdTable: 'ad_product_dim (' + Object.keys(REAL_PRODUCT_DIM).length + ' rows embedded)',
          aliasTable: 'PRODUCT_ALIAS (' + Object.keys(PRODUCT_ALIAS).length + ' curated identities)',
          aliasHadKeyButNoRow: !!(productHint && Object.prototype.hasOwnProperty.call(PRODUCT_ALIAS, productHint) && !dim)
        }
      };
      console.error(TAG + ' §RPR-HARDFAIL no real ad_product_dim match for productHint=' + productHint +
        ' discipline=' + gap.discipline + ' category=' + gap.category + ' ifc_class=' + gap.ifc_class +
        ' — REFUSED (no fabricated box; caller must skip this placement, not substitute a constant)');
      throw new WalkerGapError('WALKER_GAP: no real placement data for productHint=' + (productHint || '(none)'), gap);
    }

    console.log(TAG + ' §RPR-MATCH productHint=' + productHint + ' -> product_id=' + productId +
      ' dims(w,d,h)=' + dim.width + ',' + dim.depth + ',' + dim.height + ' source=ad_product_dim');
    return {
      width: dim.width, depth: dim.depth, height: dim.height,
      anchor: { requires_host: dim.requires_host, conn_points: dim.conn_points },
      matchedProductId: productId,
      source: 'library/component_library.db:ad_product_dim:' + productId
    };
  }

  var API = {
    resolveRealPlacement: resolveRealPlacement,
    REAL_PRODUCT_DIM: REAL_PRODUCT_DIM,
    PRODUCT_ALIAS: PRODUCT_ALIAS,
    WalkerGapError: WalkerGapError
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  ROOT.RealPlacementResolver = API;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
