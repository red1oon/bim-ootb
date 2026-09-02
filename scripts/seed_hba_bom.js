/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// ⚠ DO NOT REMOVE — seed_hba_bom.js — W-HBA-BOM-SEED reproducible seed + self-witness.
//
// Implementing bim-compiler prompts/RESUME_HBA_ERP_GOVERNED_DISPLAY.md §BOM-ERP-CENTERED (user directive
// 2026-07-03: "the Java era is not source of truth, the ERP is; all BIM data models are ERP-centered; set it
// right at source, exact mapping to iDempiere"). Makes iDempiere the AUTHORITY for the BIM BOM: the recipe tree
// LIVES in the NATIVE stock tables pp_product_bom/pp_product_bomline (already present in ad_seed.db — NOT
// Ninja-staged, unlike C_Attendance), sourced from the REAL IFC extraction (a building's own
// rel_contained_in_space room→elements containment), NOT from the Java m_bom transient. The BIM BOM panel is a
// LENS (ad_bom.readBom / the AD_InfoWindow declared below) over these rows. Read the log after every run.
//
//   1. AD_Ref_List 'B'=BIM for AD_Reference 347 ("M_BOM Type") — the missing master value (stock has
//      A/C/F/K/M/O/P/R/S, no BIM). EXACT MAP: cloned from a real AD_Ref_List row of 347 (every column the real
//      table populates), only Value/Name/id/UU overridden — never a hand-built partial row.
//   2. M_Product_Category per distinct ifc_class among the contained elements (Value=ifc_class) — the element's
//      real category. (M_Product_Category.IFC_Class is a runtime-ERP bolt-on ABSENT from ad_seed.db's pristine
//      mirror, so the ifc_class rides Value/Name — exact to what THIS db has.)
//   3. M_Product for every room (the ASSEMBLY: IsBOM='Y', M_Locator_ID = the Stage-1 seeded locator, category
//      IfcSpace) + every contained element (the LEAF: IsBOM='N', category=its ifc_class). Value=guid — so
//      ad_tenancy.js toProductRow's match-by-guid ALSO resolves to these now (tenancy product governance,
//      completed as a side effect). Proto-cloned from a real M_Product row → exact column set.
//   4. pp_product_bom header per room (m_product_id=room-product, BOMType='B', BOMUse='M') + pp_product_bomline
//      per contained element (m_product_id=element-product, QtyBOM=1, Line ordinal, ComponentType='CO'). Row
//      SHAPE from ad_bom.js's OWN toBomRow/toBomLineRow builders (one shape definition, reused) with REAL DB ids.
//   5. AD_InfoWindow BOM lens (ad_bom.readBom's exact JOIN) + AD_InfoColumn rows — the panel's data source.
//   6. SELF-WITNESS (W-HBA-BOM-SEED): AD_Ref_List 'B' present; every seeded BOMType='B' resolves in the
//      dictionary (FK integrity); the lens JOIN is LOSSLESS (every pp_product_bomline resolves
//      pp_product_bom→M_Product→M_Locator→M_Warehouse to the pinned HHS building); header count == rooms with
//      members. NAMES the issue it proves: the BIM BOM is now an iDempiere-native store read as a lens.
//
// IDEMPOTENT: find-or-create everywhere (a 2nd run adds 0). Deterministic: fixed NOW, no Date.now/random.
// EXTRACT-only: the BOM tree is the building's OWN rel_contained_in_space; every AD row proto-cloned from a
// real row of the target table (exact iDempiere mapping, per the user's "set right at source" directive).
//
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node scripts/seed_hba_bom.js   (writes erp/ad_seed.db in place)
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const ROOT = path.join(__dirname, '..');
const SEED = path.join(ROOT, 'erp', 'ad_seed.db');
const BUILDING_DB = path.join(ROOT, 'buildings', 'HHS_Office_Federated_extracted.db');
const LOCS = require(path.join(ROOT, 'hr_bim_asset', 'fixtures', 'hhs_room_locators.json'));
const AdBom = require(path.join(ROOT, 'hr_bim_asset', 'ad_bom.js'));

const NOW = '2026-07-03 00:00:00';
const REF_BOMTYPE = 347;                       // AD_Reference "M_BOM Type"
const C_UOM_EACH = 100;                        // stock 'Each' UOM (verified live)
const INFO_BASE = 7700000;                     // BOM lens id (attendance used 7600000)

function scalar(db, sql, p) { var r = db.exec(sql, p || []); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }
function rows(db, sql, p) {
  var r = db.exec(sql, p || []); if (!r.length) return [];
  var cs = r[0].columns;
  return r[0].values.map(function (v) { var o = {}; cs.forEach(function (c, i) { o[c] = v[i]; }); return o; });
}
function ins(db, table, obj) {
  var ks = Object.keys(obj);
  db.run('INSERT INTO ' + table + ' (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')',
    ks.map(function (k) { return obj[k]; }));
}
// proto-clone: read a REAL row of `table` (matching whereSql), keep its populated columns, apply overrides.
// Guarantees EXACT iDempiere mapping — every column the real table actually populates is present, no partial row.
function protoClone(db, table, whereSql, params, overrides) {
  var r = db.exec('SELECT * FROM ' + table + (whereSql ? (' WHERE ' + whereSql) : '') + ' LIMIT 1', params || []);
  if (!r.length || !r[0].values.length) return null;
  var proto = {}; r[0].columns.forEach(function (c, i) { if (r[0].values[0][i] != null) proto[c] = r[0].values[0][i]; });
  return Object.assign({}, proto, overrides);
}
function nextIdFactory(db, table, idCol) {
  var n = Number(scalar(db, 'SELECT COALESCE(MAX(' + idCol + '),0) FROM ' + table)) || 0;
  return function () { return ++n; };
}

(async function () {
  var fails = 0;
  function L(m) { console.log(m); }
  function must(tag, cond, msg) { L('§W-HBA-BOM-SEED ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); if (!cond) fails++; }

  if (!fs.existsSync(SEED)) { L('§SEED_HBA_BOM FAIL — erp/ad_seed.db not found'); process.exit(1); }
  if (!fs.existsSync(BUILDING_DB)) { L('§SEED_HBA_BOM FAIL — building DB not found: ' + BUILDING_DB); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(SEED));
  const bdb = new SQL.Database(fs.readFileSync(BUILDING_DB));
  var added = { reflist: 0, categories: 0, products: 0, headers: 0, lines: 0, info: 0 };

  // ── 1. AD_Ref_List 'B'=BIM for AD_Reference 347 ──────────────────────────────────────────────────────────
  var refBid = scalar(db, 'SELECT AD_Ref_List_ID FROM AD_Ref_List WHERE AD_Reference_ID=? AND Value=?', [REF_BOMTYPE, 'B']);
  if (refBid == null) {
    var nextRef = nextIdFactory(db, 'AD_Ref_List', 'AD_Ref_List_ID');
    var row = protoClone(db, 'AD_Ref_List', 'AD_Reference_ID=?', [REF_BOMTYPE],
      { AD_Ref_List_ID: nextRef(), Value: 'B', Name: 'BIM', Description: 'BIM structural/spatial recipe (BIM OOTB)',
        Created: NOW, Updated: NOW, CreatedBy: 100, UpdatedBy: 100, AD_Ref_List_UU: 'hba-refl-bomtype-b' });
    if (!row) { must('REFLIST-PROTO', false, 'no proto AD_Ref_List row for AD_Reference 347'); }
    else { ins(db, 'AD_Ref_List', row); added.reflist++; L('§SEED_BOM_REFLIST ADD Value=B (BIM) → AD_Reference 347, id=' + row.AD_Ref_List_ID); }
  } else L('§SEED_BOM_REFLIST SKIP Value=B exists id=' + refBid);

  // ── 2. read the REAL BOM source: the building's rel_contained_in_space (room→elements) ───────────────────
  var contain = rows(bdb, 'SELECT space_guid, element_guid FROM rel_contained_in_space');
  var metaRows = rows(bdb, 'SELECT guid, ifc_class, element_name FROM elements_meta');
  var metaByGuid = {}; metaRows.forEach(function (m) { metaByGuid[m.guid] = m; });
  // rooms = containment spaces that ARE Stage-1 seeded locators (real, resolvable). members per room.
  var roomMembers = {};
  contain.forEach(function (c) {
    if (LOCS.locators[c.space_guid] == null) return;   // only rooms with a real seeded M_Locator
    (roomMembers[c.space_guid] = roomMembers[c.space_guid] || []).push(c.element_guid);
  });
  var roomGuids = Object.keys(roomMembers).sort();
  L('§SEED_BOM_SOURCE rooms=' + roomGuids.length + ' (with real locators) containment_rows=' + contain.length
    + ' total_members=' + roomGuids.reduce(function (s, g) { return s + roomMembers[g].length; }, 0));

  // ── 3a. M_Product_Category per distinct ifc_class (+ IfcSpace for rooms) ─────────────────────────────────
  var nextCat = nextIdFactory(db, 'M_Product_Category', 'M_Product_Category_ID');
  var catByClass = {};
  function ensureCategory(ifcClass) {
    if (catByClass[ifcClass] != null) return catByClass[ifcClass];
    var id = scalar(db, 'SELECT M_Product_Category_ID FROM M_Product_Category WHERE Value=?', [ifcClass]);
    if (id == null) {
      id = nextCat();
      var row = protoClone(db, 'M_Product_Category', null, [], { M_Product_Category_ID: id, Value: ifcClass,
        Name: ifcClass, Description: 'BIM element category (ifc_class) — BIM OOTB', Created: NOW, Updated: NOW,
        CreatedBy: 100, UpdatedBy: 100, M_Product_Category_UU: 'hba-cat-' + ifcClass.toLowerCase() });
      ins(db, 'M_Product_Category', row); added.categories++;
    }
    catByClass[ifcClass] = id; return id;
  }
  var classes = {};
  roomGuids.forEach(function (g) { roomMembers[g].forEach(function (e) { var m = metaByGuid[e]; if (m && m.ifc_class) classes[m.ifc_class] = 1; }); });
  Object.keys(classes).forEach(ensureCategory);
  ensureCategory('IfcSpace');   // room assembly category
  L('§SEED_BOM_CAT categories added=' + added.categories + ' (' + Object.keys(catByClass).length + ' distinct ifc_class incl IfcSpace)');

  // ── 3b. M_Product for rooms (assembly) + elements (leaf) — proto-cloned, Value=guid ──────────────────────
  var nextProd = nextIdFactory(db, 'M_Product', 'M_Product_ID');
  var prodByGuid = {};
  function ensureProduct(guid, name, isBom, catId, locatorId) {
    if (prodByGuid[guid] != null) return prodByGuid[guid];
    var id = scalar(db, 'SELECT M_Product_ID FROM M_Product WHERE Value=?', [guid]);
    if (id == null) {
      id = nextProd();
      var ov = { M_Product_ID: id, Value: guid, Name: name || guid, IsBOM: isBom, C_UOM_ID: C_UOM_EACH,
        M_Product_Category_ID: catId, ProductType: 'I', IsStocked: 'N', IsPurchased: 'N', IsSold: 'N',
        IsSummary: 'N', Description: 'BIM element (BIM OOTB) — real extraction guid', Created: NOW, Updated: NOW,
        CreatedBy: 100, UpdatedBy: 100, M_Product_UU: 'hba-prod-' + guid.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 28) };
      if (locatorId != null) ov.M_Locator_ID = locatorId;
      var row = protoClone(db, 'M_Product', null, [], ov);
      ins(db, 'M_Product', row); added.products++;
    }
    prodByGuid[guid] = id; return id;
  }
  var spaceCat = catByClass['IfcSpace'];
  roomGuids.forEach(function (g) {
    ensureProduct(g, g, 'Y', spaceCat, LOCS.locators[g]);   // room = assembly (IsBOM='Y'), bound to its locator
    roomMembers[g].forEach(function (e) {
      var m = metaByGuid[e]; var cls = (m && m.ifc_class) || 'IfcBuildingElementProxy';
      ensureProduct(e, (m && m.element_name) || e, 'N', ensureCategory(cls), null);
    });
  });
  L('§SEED_BOM_PROD M_Product added=' + added.products + ' (rooms + distinct contained elements, Value=guid)');

  // ── 4. pp_product_bom header per room + pp_product_bomline per element — ad_bom.js builders, REAL ids ─────
  var nextHdr = nextIdFactory(db, 'PP_Product_BOM', 'PP_Product_BOM_ID');
  var nextLn = nextIdFactory(db, 'PP_Product_BOMLine', 'PP_Product_BOMLine_ID');
  function stdCols(o) { o.AD_Client_ID = 11; o.AD_Org_ID = 0; o.IsActive = 'Y'; o.Created = NOW; o.CreatedBy = 100; o.Updated = NOW; o.UpdatedBy = 100; return o; }
  roomGuids.forEach(function (g) {
    var roomProd = prodByGuid[g];
    var existing = scalar(db, "SELECT PP_Product_BOM_ID FROM PP_Product_BOM WHERE M_Product_ID=? AND BOMType='B'", [roomProd]);
    var hdrId = existing != null ? existing : nextHdr();
    if (existing == null) {
      // ad_bom.toBomRow = the ONE shape definition; feed it the real header id + the resolved parent product.
      var hrow = AdBom.toBomRow({ bom_id: g, bom_name: g }, roomProd, function () { return hdrId; });
      hrow.c_uom_id = C_UOM_EACH;
      // ad_bom emits lowercase; the physical table is case-insensitive — normalise to the seed's PascalCase idiom.
      ins(db, 'PP_Product_BOM', stdCols({ PP_Product_BOM_ID: hdrId, M_Product_ID: hrow.m_product_id,
        Value: hrow.value, Name: hrow.name, BOMType: hrow.bomtype, BOMUse: hrow.bomuse, C_UOM_ID: C_UOM_EACH,
        Description: 'BIM room recipe (BIM OOTB)', ValidFrom: NOW, PP_Product_BOM_UU: 'hba-bom-' + g.toLowerCase() }));
      added.headers++;
    }
    roomMembers[g].forEach(function (e, i) {
      var childProd = prodByGuid[e];
      if (scalar(db, 'SELECT PP_Product_BOMLine_ID FROM PP_Product_BOMLine WHERE PP_Product_BOM_ID=? AND M_Product_ID=?', [hdrId, childProd]) != null) return;
      var lnId = nextLn();
      var lrow = AdBom.toBomLineRow({ qty: 1, component_type: 'CO' }, hdrId, childProd, function () { return lnId; }, i + 1);
      ins(db, 'PP_Product_BOMLine', stdCols({ PP_Product_BOMLine_ID: lnId, PP_Product_BOM_ID: hdrId,
        M_Product_ID: lrow.m_product_id, QtyBOM: lrow.qtybom, Line: lrow.line, ComponentType: lrow.componenttype,
        C_UOM_ID: C_UOM_EACH, PP_Product_BOMLine_UU: 'hba-bomln-' + hdrId + '-' + lnId }));
      added.lines++;
    });
  });
  L('§SEED_BOM_ROWS pp_product_bom headers added=' + added.headers + ' pp_product_bomline added=' + added.lines);

  // ── 5. AD_InfoWindow BOM lens (ad_bom.readBom's exact JOIN) ───────────────────────────────────────────────
  var FROM = 'PP_Product_BOM H JOIN M_Product HP ON H.M_Product_ID=HP.M_Product_ID'
    + ' LEFT JOIN M_Locator L ON HP.M_Locator_ID=L.M_Locator_ID'
    + ' LEFT JOIN M_Warehouse W ON L.M_Warehouse_ID=W.M_Warehouse_ID'
    + ' JOIN PP_Product_BOMLine BL ON BL.PP_Product_BOM_ID=H.PP_Product_BOM_ID'
    + ' JOIN M_Product CP ON BL.M_Product_ID=CP.M_Product_ID';
  var attTableId = scalar(db, "SELECT AD_Table_ID FROM AD_Table WHERE lower(TableName)='pp_product_bom'");
  if (scalar(db, 'SELECT ad_infowindow_id FROM ad_infowindow WHERE ad_infowindow_id=?', [INFO_BASE]) == null) {
    ins(db, 'ad_infowindow', { ad_infowindow_id: INFO_BASE, ad_client_id: 11, ad_org_id: 0, isactive: 'Y',
      created: NOW, createdby: 100, updated: NOW, updatedby: 100, name: 'BIM BOM',
      description: 'BIM recipe lens — assembly/component over the real MRP BOM (ERP-centered)',
      ad_table_id: attTableId, entitytype: 'U', fromclause: FROM, whereclause: "H.BOMType='B'",
      orderbyclause: 'H.PP_Product_BOM_ID, BL.Line', isvalid: 'Y', isdefault: 'N', isdistinct: 'N', seqno: 10,
      ad_infowindow_uu: 'hba-infowin-bom' });
    added.info++;
    L('§SEED_BOM_INFOWIN ADD id=' + INFO_BASE + ' fromclause = ad_bom.readBom JOIN');
  } else L('§SEED_BOM_INFOWIN SKIP exists id=' + INFO_BASE);
  var INFO_COLS = [
    { name: 'Assembly', sel: 'HP.Name', col: 'AssemblyName' },
    { name: 'Building', sel: 'W.Name', col: 'WarehouseName' },
    { name: 'Room', sel: 'L.Value', col: 'LocatorValue' },
    { name: 'Component', sel: 'CP.Name', col: 'ComponentName' },
    { name: 'Component GUID', sel: 'CP.Value', col: 'ComponentValue' },
    { name: 'Qty', sel: 'BL.QtyBOM', col: 'QtyBOM' }
  ];
  INFO_COLS.forEach(function (c, i) {
    var id = INFO_BASE + 1 + i;
    if (scalar(db, 'SELECT ad_infocolumn_id FROM ad_infocolumn WHERE ad_infocolumn_id=?', [id]) != null) return;
    ins(db, 'ad_infocolumn', { ad_infocolumn_id: id, ad_client_id: 11, ad_org_id: 0, isactive: 'Y', created: NOW,
      createdby: 100, updated: NOW, updatedby: 100, name: c.name, ad_infowindow_id: INFO_BASE, entitytype: 'U',
      selectclause: c.sel, columnname: c.col, seqno: (i + 1) * 10, isdisplayed: 'Y', isquerycriteria: 'N',
      ad_infocolumn_uu: 'hba-bominfocol-' + c.col.toLowerCase() });
    added.info++;
  });
  L('§SEED_BOM_INFOCOL cols=' + INFO_COLS.length);

  // ── 6. SELF-WITNESS ──────────────────────────────────────────────────────────────────────────────────────
  must('REFLIST-B', scalar(db, 'SELECT COUNT(*) FROM AD_Ref_List WHERE AD_Reference_ID=? AND Value=?', [REF_BOMTYPE, 'B']) == 1,
    "AD_Ref_List carries Value='B' (BIM) for AD_Reference 347 (exact-mapped dictionary extension)");
  var badType = Number(scalar(db, "SELECT COUNT(*) FROM PP_Product_BOM H WHERE H.BOMType IS NOT NULL AND NOT EXISTS (SELECT 1 FROM AD_Ref_List r WHERE r.AD_Reference_ID=" + REF_BOMTYPE + " AND r.Value=H.BOMType)"));
  must('BOMTYPE-FK', badType === 0, 'every PP_Product_BOM.BOMType resolves in the AD_Ref_List dictionary (0 orphans) — no deviating enum');

  // lens JOIN LOSSLESS — every bomline for a 'B' BOM resolves through the full chain to the pinned HHS building.
  var joined = rows(db, 'SELECT BL.PP_Product_BOMLine_ID AS line, W.Name AS building, L.Value AS room, CP.Value AS comp'
    + ' FROM ' + FROM + " WHERE H.BOMType='B' ORDER BY BL.PP_Product_BOMLine_ID");
  var totalLines = Number(scalar(db, "SELECT COUNT(*) FROM PP_Product_BOMLine BL JOIN PP_Product_BOM H ON BL.PP_Product_BOM_ID=H.PP_Product_BOM_ID WHERE H.BOMType='B'"));
  must('LENS-JOIN-LOSSLESS', joined.length === totalLines && totalLines > 0,
    'BOM lens JOIN resolves ALL ' + totalLines + ' pp_product_bomline rows (assembly→M_Product→M_Locator→M_Warehouse + component) — joined=' + joined.length);
  must('LENS-BUILDING', joined.length > 0 && joined.every(function (r) { return r.building === LOCS.warehouse_value; }),
    'every BOM line lands in the pinned HHS building (' + LOCS.warehouse_value + ')');
  var hdrCount = Number(scalar(db, "SELECT COUNT(*) FROM PP_Product_BOM WHERE BOMType='B'"));
  must('HEADER-PER-ROOM', hdrCount === roomGuids.length,
    'ONE pp_product_bom header per room-with-members (' + hdrCount + '/' + roomGuids.length + ')');

  // readBom lens read (the panel's actual data path) covers every line
  function erpQuery(sql, params) {
    var r = db.exec(sql, params || []); if (!r.length) return [];
    var cs = r[0].columns; return r[0].values.map(function (v) { var o = {}; cs.forEach(function (c, i) { o[c] = v[i]; }); return o; });
  }
  var lensOut = AdBom.readBom(erpQuery, { m_warehouse_id: LOCS.m_warehouse_id });
  var lensLines = lensOut.assemblies.reduce(function (s, a) { return s + a.lines.length; }, 0);
  must('READBOM-LENS', lensOut.assemblies.length === roomGuids.length && lensLines === totalLines,
    'ad_bom.readBom returns ' + lensOut.assemblies.length + ' assemblies / ' + lensLines + ' component lines == the seeded rows (the panel reads the ERP as a lens)');

  // ── write-back + summary ────────────────────────────────────────────────────────────────────────────────
  var changed = added.reflist + added.categories + added.products + added.headers + added.lines + added.info;
  if (changed > 0 && fails === 0) { fs.writeFileSync(SEED, Buffer.from(db.export())); L('§SEED_HBA_BOM WROTE erp/ad_seed.db (' + changed + ' additions)'); }
  else if (fails === 0) L('§SEED_HBA_BOM NO-OP — seed already current (idempotent 2nd run)');
  else L('§SEED_HBA_BOM NOT WRITTEN — ' + fails + ' witness failure(s), DB left untouched');
  L('§W-HBA-BOM-SEED ' + (fails === 0 ? 'PASS' : 'FAIL') + ' — summary ' + JSON.stringify(added));
  db.close(); bdb.close();
  process.exit(fails === 0 ? 0 : 1);
})();
