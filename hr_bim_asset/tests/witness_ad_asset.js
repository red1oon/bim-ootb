// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-AD-ASSET witness (prompts/RESUME_HR_BIM_ASSET.md §CRITICAL "Compile not Model").
//   Proves `models.toAssetRow()` projects the PM_Asset demo record onto the REAL native `a_asset` shape,
//   without touching timeline.js's own (unchanged, shipped, W-HBA-TIMELINE 7/7) consumption of that record.
//   Run: node hr_bim_asset/tests/witness_ad_asset.js
'use strict';
var M = require('../models'), T = require('../timeline');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-AD-ASSET ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ---- ground truth, independently sourced (sqlite3 build/erp/ad_full.db "PRAGMA table_info(a_asset);") --------
var REAL_COLS = ['a_asset_id', 'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated',
  'updatedby', 'value', 'name', 'description', 'help', 'a_asset_group_id', 'm_product_id', 'serno', 'lot',
  'versionno', 'guaranteedate', 'assetservicedate', 'isowned', 'assetdepreciationdate', 'uselifeyears',
  'uselifemonths', 'lifeuseunits', 'useunits', 'isdisposed', 'assetdisposaldate', 'isinposession',
  'locationcomment', 'm_locator_id', 'c_bpartner_id', 'c_bpartner_location_id', 'c_location_id', 'processing',
  'isdepreciated', 'isfullydepreciated', 'ad_user_id', 'm_attributesetinstance_id', 'qty', 'c_project_id',
  'c_bpartnersr_id', 'm_inoutline_id', 'lastmaintenencedate', 'nextmaintenencedate', 'lastmaintenanceuseunit',
  'nextmaintenanceuseunit', 'leaseterminationdate', 'lease_bpartner_id', 'lastmaintenancenote',
  'lastmaintenancedate', 'lastmaintenanceunit', 'nextmaintenenceunit', 'a_asset_createdate', 'a_asset_revaldate',
  'a_parent_asset_id', 'a_qty_current', 'a_qty_original', 'a_asset_uu', 'a_asset_class_id', 'a_asset_status',
  'a_asset_action', 'processed', 'assetactivationdate', 'inventoryno', 'a_asset_type_id', 'a_assettype',
  'c_activity_id', 'manufacturer', 'manufacturedyear'];

var demoAsset = M.records('Asset')[0];
var row = M.toAssetRow(demoAsset);

// ---- AD-ASSET0: NON-INVENT GATE — every REAL-table-bound key ⊆ real cols (vendor/personnel excluded — see below) ---
var nativeKeys = Object.keys(row).filter(function (k) { return k.indexOf('_vendor') !== 0 && k.indexOf('_personnel') !== 0 && k !== '_vendor' && k !== '_personnel'; });
ok('AD-ASSET0-shape', nativeKeys.every(function (k) { return REAL_COLS.indexOf(k) >= 0; }),
  'a_asset row uses ONLY real AD_Column names (vendor/personnel explicitly carried outside the row, see AD-ASSET2)');
ok('AD-ASSET1-values', row.m_product_id === demoAsset.bim_guid && row.nextmaintenencedate === demoAsset.next_due && row.c_bpartner_id === demoAsset.operator,
  'm_product_id = the REAL bim_guid (BOM PRINCIPLE: the BIM element already compiles to a Product), nextmaintenencedate/c_bpartner_id map correctly');

// ---- AD-ASSET2: honest gap — a_asset has ONE c_bpartner_id, not three; vendor/personnel are not forced into it ---
ok('AD-ASSET2-no-forced-3way', row._vendor === demoAsset.vendor && row._personnel === demoAsset.personnel && row.c_bpartner_id !== demoAsset.vendor,
  'vendor/personnel carried separately (_vendor/_personnel) — NOT forced into the single native c_bpartner_id column (a real native gap, not an HBA omission)');

// ---- AD-ASSET3: timeline.js's OWN consumption is UNCHANGED (still reads asset/bim_guid/pm_cycle/next_due) -----
var sched = T.buildSchedule([demoAsset], { from: demoAsset.next_due, months: 12, today: '2026-07-01' });
ok('AD-ASSET3-timeline-unaffected', sched.tasks.length > 0 && sched.task_elements[0].guid === demoAsset.bim_guid,
  'timeline.js (shipped, W-HBA-TIMELINE 7/7, merged into the 4D editor) still derives the PM schedule off the ORIGINAL record shape — this compile projection is additive, not a replacement');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-AD-ASSET ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
