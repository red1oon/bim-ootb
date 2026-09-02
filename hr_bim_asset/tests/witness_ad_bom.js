// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-AD-BOM witness (bim-compiler RESUME_HBA_ERP_GOVERNED_DISPLAY.md §DESIGN-BOM-COMPILE +
//   §BOM-ERP-CENTERED). Proves the ad_bom.js TRANSFORM (toBomRow/toBomLineRow/compileBom) — the shape-builders
//   scripts/seed_hba_bom.js reuses to write the native pp_product_bom/pp_product_bomline rows — with the
//   non-invent discipline the whole thread rests on. (The BOM now LIVES in iDempiere, sourced from the REAL IFC
//   extraction, read back by ad_bom.readBom — proven end-to-end by W-HBA-BOM-GOVERNED against the shipped
//   ad_seed.db; THIS witness pins the transform in isolation against a real-shaped fixture.) Each check names
//   the issue it proves:
//     • BOM0 — every emitted row's keys ⊆ the REAL pp_product_bom / pp_product_bomline columns (independently
//       sourced via PRAGMA table_info against bim-compiler build/erp/ad_full.db, 2026-07-03).
//     • BOM1 — bomtype='B' (BIM), qtybom threads from the recipe qty, deterministic line ordinals.
//     • BOM2 — the TWO-M_Product LANDMINE: the BIM-catalog TEXT child_product_id is resolved to a DIFFERENT real
//       AD m_product_id via productResolver; a child that does not resolve is SKIPPED (never a fabricated FK).
//     • BOM3 — a node whose PARENT product does not resolve is SKIPPED (no orphan header).
//     • BOM4 — BIM-only geometry rides the view-trace wrapper (keyed by the header PK), never forced into an AD column.
//   Run: node hr_bim_asset/tests/witness_ad_bom.js
'use strict';
var ADB = require('../ad_bom');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-AD-BOM ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ground truth — REAL columns (PRAGMA table_info, bim-compiler build/erp/ad_full.db, 2026-07-03).
var REAL = {
  pp_product_bom: ['value', 'name', 'documentno', 'revision', 'description', 'copyfrom', 'created', 'createdby',
    'help', 'isactive', 'ad_client_id', 'm_changenotice_id', 'm_product_id', 'pp_product_bom_id', 'processing',
    'updated', 'updatedby', 'validfrom', 'validto', 'm_attributesetinstance_id', 'ad_org_id', 'bomtype', 'bomuse',
    'c_uom_id', 'pp_product_bom_uu'],
  pp_product_bomline: ['feature', 'ad_org_id', 'assay', 'backflushgroup', 'c_uom_id', 'componenttype', 'created',
    'createdby', 'description', 'forecast', 'help', 'isactive', 'iscritical', 'isqtypercentage', 'issuemethod',
    'leadtimeoffset', 'line', 'm_attributesetinstance_id', 'm_changenotice_id', 'm_product_id',
    'pp_product_bomline_id', 'pp_product_bom_id', 'qtybom', 'qtybatch', 'scrap', 'updated', 'updatedby',
    'validfrom', 'ad_client_id', 'validto', 'costallocationperc', 'pp_product_bomline_uu']
};
function keysSubset(row, t) { return Object.keys(row).every(function (k) { return REAL[t].indexOf(k) >= 0; }); }

// real-SHAPED fixture: a ROOM BOM (parent = the room's own element) with two furniture children — the shape
// BOMWalker flattens m_bom/m_bom_line into. child_product_id values are BIM-catalog TEXT ids (the landmine).
var nodes = [
  { bom_id: 'BOM-RM1', bom_name: 'Room 1 recipe', bom_type: 'ROOM', product_ref: 'GUID-ROOM-1',
    target_ifc_class: 'IfcSpace', origin_x: 1000, origin_y: 2000, origin_z: 0,
    aabb_width_mm: 4000, aabb_depth_mm: 3000, aabb_height_mm: 2800,
    lines: [{ child_product_id: 'CAT-CHAIR', qty: 4, component_type: 'Component' },
            { child_product_id: 'CAT-DESK', qty: 1, component_type: 'Component' },
            { child_product_id: 'CAT-UNKNOWN', qty: 9 }] },        // deliberately unresolvable → must SKIP
  { bom_id: 'BOM-NOPARENT', bom_name: 'orphan', bom_type: 'ROOM', product_ref: 'GUID-MISSING',
    lines: [{ child_product_id: 'CAT-CHAIR', qty: 1 }] }             // parent unresolvable → header SKIP
];
// the two-M_Product resolver: BIM-catalog TEXT id → real AD integer m_product_id (a DIFFERENT id space).
var AD_ID = { 'GUID-ROOM-1': 5001, 'CAT-CHAIR': 6001, 'CAT-DESK': 6002 };   // GUID-MISSING / CAT-UNKNOWN absent
function resolver(ref) { return AD_ID[ref] != null ? AD_ID[ref] : null; }

var out = ADB.compileBom(nodes, resolver);

ok('BOM0-header-cols', out.headers.length === 1 && out.headers.every(function (h) { return keysSubset(h, 'pp_product_bom'); }),
   'pp_product_bom header uses ONLY real AD_Column names');
ok('BOM0b-line-cols', out.lines.length === 2 && out.lines.every(function (l) { return keysSubset(l, 'pp_product_bomline'); }),
   'every pp_product_bomline row uses ONLY real AD_Column names');
var h0 = out.headers[0];
ok('BOM1-bimtype', h0.bomtype === 'B' && h0.bomuse === 'M' && h0.m_product_id === 5001 && h0.value === 'BOM-RM1',
   'header bomtype=B (BIM), parent m_product_id=5001 (the resolved real AD id, not the guid)');
ok('BOM1b-qty-line', out.lines[0].qtybom === 4 && out.lines[1].qtybom === 1
   && out.lines[0].line === 10 && out.lines[1].line === 20,
   'qtybom threads from the recipe qty (4,1); line ordinals deterministic (10,20)');
ok('BOM2-two-product-resolve', out.lines.every(function (l) { return l.m_product_id === 6001 || l.m_product_id === 6002; }),
   'child m_product_id is the RESOLVED real AD id (6001/6002), NEVER the BIM-catalog TEXT id — two-M_Product landmine handled');
var childSkips = out.skipped.filter(function (s) { return s.kind === 'line'; });
ok('BOM2b-child-skip', childSkips.length === 1 && childSkips[0].child === 'CAT-UNKNOWN',
   'the unresolvable child (CAT-UNKNOWN) is SKIPPED with a reason — no fabricated FK');
var headerSkips = out.skipped.filter(function (s) { return s.kind === 'header'; });
ok('BOM3-parent-skip', headerSkips.length === 1 && headerSkips[0].bom_id === 'BOM-NOPARENT' && out.headers.length === 1,
   'the parent-unresolvable node is SKIPPED (no orphan header emitted)');
var g0 = out.geometry[0];
ok('BOM4-geometry-viewtrace', out.geometry.length === 1 && g0.pp_product_bom_id === h0.pp_product_bom_id
   && g0.origin_x === 1000 && g0.aabb_width_mm === 4000 && h0.origin_x === undefined && h0.aabb_width_mm === undefined,
   'BIM geometry (origin/aabb) rides the view-trace wrapper keyed by the header PK — NOT forced onto the AD row');
ok('BOM5-watermarked', out._watermark != null, 'compile output carries the alpha watermark');

var passed = checks.filter(Boolean).length;
console.log('§W-HBA-AD-BOM ' + (passed === checks.length ? 'PASS' : 'FAIL') + ' ' + passed + '/' + checks.length);
process.exit(passed === checks.length ? 0 : 1);
