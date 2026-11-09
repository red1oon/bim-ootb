// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEST ORACLE, NOT SHIPPED (frozen 2026-11-10, bim-compiler MIGRATE_INSTALL_TENANT.md §ENGINE-D-SPEC): the hand-written Business Central converter as it
//   shipped on main @802d9514, kept ONLY so W-MIGRATE-ENGINE can prove the engine + templates/bc-w1.json give the same cells. Do not edit it to make a diff pass.
import { HEADERS, ORDER, uuid5, finishBook } from '../../migrate/workbook.mjs';
import { enumName } from '../../migrate/connectors/bc_package.mjs';
export { HEADERS, ORDER };
const WORKBOOK = 'bc_migration.xlsx';
const bool = (v) => /^(true|yes|1|ja|oui|sí|si)$/i.test(String(v || '').trim());

// convert(pkg, model, { cutover }) -> { book: [{name, rows}], manifest, report[] }
export function convert(pkg, model, opts) {
  opts = opts || {}; const CUT = opts.cutover || '';
  const T = (id) => (pkg.tables[id] ? pkg.tables[id].rows : []), has = (id) => !!pkg.tables[id];
  const sheets = {}; ORDER.forEach((t) => { sheets[t] = []; });
  const patches = [], renamed = [], notes = [], refused = [], prov = {};
  ORDER.forEach((t) => { prov[t] = []; });
  function put(t, row, src) { sheets[t].push(row); prov[t].push(src); }
  function patch(table, column, cellText, rule, rows) { if (rows) patches.push({ table, column, cell: cellText, rule, rows }); }
  const problems = [];
  if (!has(98)) problems.push('Add the table General Ledger Setup (98) to the package: its LCY Code is the currency of the sale prices (not guessed).');
  const lcy = (T(98)[0] || {})['LCY Code'] || '';
  if (has(98) && !lcy) problems.push('General Ledger Setup (98) in the package has no LCY Code.');
  const co = T(79)[0] || null, coCountry = co ? co['Country/Region Code'] || '' : '';

  // keys: the ERP needs one Value per company; BC keeps customers and vendors in separate tables, so one No. can be both
  const usedBP = {};
  function bpKey(no, tableId) { let v = String(no); if (usedBP[v]) { const v2 = v + ' (' + model.tables[tableId].caption + ')'; renamed.push({ table: 'C_BPartner', column: 'Value', bc: model.tables[tableId].caption + ' ' + v, erp: v2, why: 'the same No. is a ' + usedBP[v] + ' too' }); v = v2; } usedBP[v] = model.tables[tableId].caption; return v; }

  // 01 C_UOM ← Unit of Measure (204). X12DE355 = BC's International Standard Code (UN/ECE Rec. 20) — the form SUGGESTS the ERP unit with that code; the user confirms.
  T(204).forEach((u) => put('C_UOM', { Name: u.Code, UOMSymbol: u.Code, StdPrecision: '', X12DE355: u['International Standard Code'] || '' }, { bc: 204, key: u.Code, description: u.Description }));
  // 02 C_PaymentTerm ← Payment Terms (3). NetDays only from a plain day formula ("30D" / "<30D>"); other formulas (CM, 1M+8D …) are named, not converted.
  const complex = [];
  T(3).forEach((p) => { const f = String(p['Due Date Calculation'] || '').replace(/[<>]/g, ''), m = /^(\d+)D$/i.exec(f); if (f && !m) complex.push(p.Code + '=' + f);
    put('C_PaymentTerm', { Value: p.Code, Name: p.Description || p.Code, NetDays: m ? m[1] : '' }, { bc: 3, key: p.Code, due: f }); });
  if (complex.length) notes.push(complex.length + ' payment term(s) have a due-date formula the ERP terms do not carry as days (' + complex.join(', ') + '): imported as the term, the formula kept in the manifest.');
  // 03 M_Product_Category ← Item Category (5722), parents first
  const cats = T(5722).slice(), byCat = {}; cats.forEach((c) => { byCat[c.Code] = c; });
  const depth = (c) => { let d = 0, x = c; while (x && x['Parent Category'] && byCat[x['Parent Category']] && d < 20) { x = byCat[x['Parent Category']]; d++; } return d; };
  cats.sort((a, b) => depth(a) - depth(b)).forEach((c) => put('M_Product_Category', { Value: c.Code, Name: c.Description || c.Code, 'M_Product_Category_Parent_ID>Value': c['Parent Category'] || '' }, { bc: 5722, key: c.Code }));
  // 04 C_ElementValue ← G/L Account (15). Account Category → iDempiere AccountType; Account Type other than Posting → a summary account; flat (BC totals by Totaling ranges, no parent).
  const CAT = { Assets: 'A', Liabilities: 'L', Equity: 'O', Income: 'R', CostofGoodsSold: 'E', Expense: 'E' }, noCat = [];
  T(15).forEach((g) => { const cat = String(enumName(model, 15, 'Account Category', g['Account Category']) || '').replace(/[^A-Za-z]/g, ''), at = enumName(model, 15, 'Account Type', g['Account Type']);
    if (!CAT[cat]) noCat.push(g['No.']);
    put('C_ElementValue', { Value: g['No.'], Name: g.Name, AccountType: CAT[cat] || '', AccountSign: 'N', IsSummary: at && at !== 'Posting' ? 'Y' : 'N', 'C_Element_ID>ElementType': 'A' }, { bc: 15, key: g['No.'], category: g['Account Category'], type: g['Account Type'] }); });
  patch('C_ElementValue', 'C_Element_ID', 'C_Element_ID>ElementType = A', 'ImportAccount.java:130-143 — the account element of the tenant', T(15).length);
  if (noCat.length) notes.push(noCat.length + ' G/L account(s) have no Account Category in BC (' + noCat.slice(0, 8).join(', ') + (noCat.length > 8 ? ' …' : '') + '): AccountType left to the ERP default.');
  // 05-08 partners: Customer (18) + Vendor (23); their address and Ship-to Address (222) → C_Location (+ C_BPartner_Location); the card's Contact / E-Mail / Phone → AD_User
  const locKey = {}, noCountry = [];
  function addr(r) { return !!(r.Address || r['Address 2'] || r.City || r['Post Code'] || r['Country/Region Code']); }
  function addLoc(r, uuName) { const uu = uuid5('bc/' + uuName); if (locKey[uu]) return uu; locKey[uu] = 1;
    let cty = r['Country/Region Code'] || ''; if (!cty) { cty = coCountry; noCountry.push(uuName); }
    put('C_Location', { Address1: r.Address || '', Address2: r['Address 2'] || '', City: r.City || '', Postal: r['Post Code'] || '', RegionName: r.County || '', 'C_Country_ID>CountryCode': cty, C_Location_UU: uu }, { bc: uuName });
    return uu; }
  const bpOf = {}, blockedPart = [];
  [[18, 'IsCustomer'], [23, 'IsVendor']].forEach(([tid, flag]) => T(tid).forEach((c) => {
    const v = bpKey(c['No.'], tid), bl = enumName(model, tid, 'Blocked', c.Blocked); bpOf[tid + '/' + c['No.']] = v;
    if (bl && bl !== ' ' && bl !== 'All') blockedPart.push(model.tables[tid].caption + ' ' + c['No.'] + ' blocked "' + c.Blocked + '"');
    put('C_BPartner', { Value: v, Name: c.Name, TaxID: c['VAT Registration No.'] || '', IsCustomer: flag === 'IsCustomer' ? 'Y' : 'N', IsVendor: flag === 'IsVendor' ? 'Y' : 'N', 'C_BP_Group_ID>IsDefault': 'Y', IsActive: bl === 'All' ? 'N' : 'Y' }, { bc: tid, key: c['No.'] });
    if (addr(c)) { const uu = addLoc(c, tid + '/' + c['No.']); put('C_BPartner_Location', { 'C_BPartner_ID>Value': v, 'C_Location_ID>C_Location_UU': uu, Name: '' }, { bc: tid, key: c['No.'], part: 'address' }); }
    if (c.Contact || c['E-Mail'] || c['Phone No.']) put('AD_User', { Name: c.Contact || c.Name, EMail: c['E-Mail'] || '', Phone: c['Phone No.'] || '', Phone2: c['Mobile Phone No.'] || '', 'C_BPartner_ID>Value': v, IsActive: 'Y' }, { bc: tid, key: c['No.'], part: 'contact' });
  }));
  patch('C_BPartner', 'C_BP_Group_ID', 'C_BP_Group_ID>IsDefault = Y', "ImportBPartner.java:129-132 — the client's default business partner group", sheets.C_BPartner.length);
  if (blockedPart.length) notes.push(blockedPart.length + ' partner(s) are partly blocked in BC (' + blockedPart.slice(0, 5).join('; ') + '): imported active; only Blocked = All becomes inactive.');
  const shipNoParent = [];
  T(222).forEach((s) => { const v = bpOf['18/' + s['Customer No.']]; if (!v) { shipNoParent.push(s['Customer No.'] + '/' + s.Code); return; }
    const uu = addLoc(s, '222/' + s['Customer No.'] + '/' + s.Code); put('C_BPartner_Location', { 'C_BPartner_ID>Value': v, 'C_Location_ID>C_Location_UU': uu, Name: s.Name || s.Code }, { bc: 222, key: s['Customer No.'] + '/' + s.Code }); });
  if (shipNoParent.length) refused.push({ sheet: 'C_BPartner_Location', why: 'ship-to address of a customer not in the package', n: shipNoParent.length });
  // 09-10 M_Product ← Item (27); M_Product_PO ← Item Vendor (99) + the card's Vendor No.
  T(27).forEach((i) => { const ty = enumName(model, 27, 'Type', i.Type);
    put('M_Product', { Value: i['No.'], Name: i.Description || i['No.'], Description: i['Description 2'] || '', 'M_Product_Category_ID>Value': i['Item Category Code'] || '',
      'M_Product_Category_ID>IsDefault': i['Item Category Code'] ? '' : 'Y', C_UOM_ID: i['Base Unit of Measure'] || '',
      ProductType: ty === 'Service' ? 'S' : 'I', UPC: i.GTIN || '', Weight: i['Net Weight'] || '', Volume: i['Unit Volume'] || '', 'C_TaxCategory_ID>IsDefault': 'Y', IsActive: bool(i.Blocked) ? 'N' : 'Y' }, { bc: 27, key: i['No.'], type: i.Type }); });
  patch('M_Product', 'C_TaxCategory_ID', 'C_TaxCategory_ID>IsDefault = Y', "ImportProduct.java:415 — the client's default tax category", T(27).length);
  // BC allows an item without an Item Category; iDempiere's M_Product_Category_ID is mandatory — legacy ImportProduct gives such a product the client's default category
  //   (ImportProduct.java:213-221: MAX(Value) of IsDefault='Y'); the second header column carries that lookup only on those rows (a blank cell sets nothing)
  patch('M_Product', 'M_Product_Category_ID', 'M_Product_Category_ID>IsDefault = Y', "ImportProduct.java:213-221 — the client's default product category for an item BC keeps without one", T(27).filter((i) => !i['Item Category Code']).length);
  const nonInv = T(27).filter((i) => enumName(model, 27, 'Type', i.Type) === 'Non-Inventory').length;
  if (nonInv) notes.push(nonInv + ' item(s) are Non-Inventory in BC: imported as items (ProductType I); stock is not kept for them in BC.');
  const itemByNo = {}; T(27).forEach((i) => { itemByNo[i['No.']] = i; });
  const poSeen = {}; let vpn = 0, poNoVendor = 0;
  function addPO(itemNo, vendorNo, vendorItemNo, src) { const k = itemNo + '|' + vendorNo; if (poSeen[k]) return; poSeen[k] = 1; const bp = bpOf['23/' + vendorNo], it = itemByNo[itemNo];
    if (!bp || !it) { poNoVendor++; return; } if (!vendorItemNo) vpn++;
    put('M_Product_PO', { 'M_Product_ID>Value': itemNo, 'C_BPartner_ID>Value': bp, PricePO: it['Last Direct Cost'] || '', VendorProductNo: vendorItemNo || itemNo, Order_Min: '', DeliveryTime_Promised: '' }, src); }
  T(99).forEach((iv) => addPO(iv['Item No.'], iv['Vendor No.'], iv['Vendor Item No.'], { bc: 99, key: iv['Item No.'] + '/' + iv['Vendor No.'] }));
  T(27).forEach((i) => { if (i['Vendor No.']) addPO(i['No.'], i['Vendor No.'], i['Vendor Item No.'], { bc: 27, key: i['No.'], field: 'Vendor No.' }); });
  if (sheets.M_Product_PO.length) patch('M_Product_PO', 'PricePO', "the item's Last Direct Cost", 'BC keeps purchase prices in Price List Lines (not read in this alpha); Last Direct Cost is the item card\'s last purchase price', sheets.M_Product_PO.length);
  if (vpn) patch('M_Product_PO', 'VendorProductNo', "the item's No.", 'ImportProduct.java:393-394 — VendorProductNo=Value when the vendor gave none', vpn);
  if (poNoVendor) refused.push({ sheet: 'M_Product_PO', why: 'a vendor or item not in the package', n: poNoVendor });
  // 11-13 the sale price list (Item."Unit Price") in the LCY Code, valid from the cutover
  const PL = 'BC Unit Price';
  if (lcy && T(27).length) {
    put('M_PriceList', { Name: PL, IsSOPriceList: 'Y', 'C_Currency_ID>ISO_Code': lcy }, { bc: 98, field: 'LCY Code' });
    put('M_PriceList_Version', { M_PriceList_ID: PL, Name: CUT, ValidFrom: CUT, 'M_DiscountSchema_ID>DiscountType': 'P' }, { cutover: CUT });
    T(27).forEach((i) => put('M_ProductPrice', { M_PriceList_Version_ID: CUT, 'M_Product_ID>Value': i['No.'], PriceList: i['Unit Price'] || '0', PriceStd: i['Unit Price'] || '0' }, { bc: 27, key: i['No.'], field: 'Unit Price' }));
    patch('M_PriceList', 'Name', PL, 'BC keeps the sale price on the item card (Unit Price): one list named after that field', 1);
    patch('M_PriceList_Version', 'M_DiscountSchema_ID', 'M_DiscountSchema_ID>DiscountType = P', 'ImportPriceList.java:97-98 — the first price-list schema of the client', 1);
  }
  // 14-15 M_Warehouse ← Location (14) (address: its own, else Company Information's — the ERP requires one); M_Locator = one per location + one per Bin (7354)
  const locs = T(14).slice(), noAddrLoc = [];
  const stockLoc = {}; T(32).forEach((e) => { stockLoc[e['Location Code'] || ''] = 1; });
  if (stockLoc[''] ) locs.push({ Code: 'BC-NOLOC', Name: 'Business Central: no location', _blank: true });
  locs.forEach((l) => { let uu = '';
    if (addr(l)) uu = addLoc(l, '14/' + l.Code); else if (co && addr(co)) { uu = addLoc(co, '79/company'); noAddrLoc.push(l.Code); } else noAddrLoc.push(l.Code + ' (no company address either)');
    put('M_Warehouse', { Value: l.Code, Name: l.Name || l.Code, 'C_Location_ID>C_Location_UU': uu }, { bc: l._blank ? 'blank location' : 14, key: l.Code }); });
  if (stockLoc['']) patch('M_Warehouse', 'Value', 'BC-NOLOC', 'BC keeps stock without a location (blank Location Code); the ERP keeps stock in a warehouse — one named for it', 1);
  if (noAddrLoc.length) patch('M_Warehouse', 'C_Location_ID', co ? 'the Company Information address' : '(none)', 'M_Warehouse.C_Location_ID is mandatory; these BC locations have no address: ' + noAddrLoc.join(', '), noAddrLoc.length);
  let z = 0; const locatorOf = {};
  locs.forEach((l) => { const v = l.Code; locatorOf[l._blank ? '' : l.Code] = v; put('M_Locator', { 'M_Warehouse_ID>Value': l.Code, Value: v, X: '0', Y: '0', Z: String(z++), IsActive: 'Y' }, { bc: l._blank ? 'blank location' : 14, key: l.Code, part: 'location locator' }); });
  const binNoLoc = [];
  T(7354).forEach((b) => { if (!locs.some((l) => l.Code === b['Location Code'])) { binNoLoc.push(b['Location Code'] + '/' + b.Code); return; }
    put('M_Locator', { 'M_Warehouse_ID>Value': b['Location Code'], Value: b['Location Code'] + '/' + b.Code, X: '0', Y: '0', Z: String(z++), IsActive: 'Y' }, { bc: 7354, key: b['Location Code'] + '/' + b.Code }); });
  if (sheets.M_Locator.length) patch('M_Locator', 'Z', 'a running number', 'legacy unique index m_location_where (M_Warehouse_ID, X, Y, Z); BC bins carry no X/Y/Z', sheets.M_Locator.length);
  if (binNoLoc.length) refused.push({ sheet: 'M_Locator', why: 'a bin whose location is not in the package', n: binNoLoc.length });
  // 16-17 opening stock = Σ Quantity of Item Ledger Entry (32) per item + location, Posting Date ≤ cutover (stock lands in the location's own locator; BC bins live in Warehouse Entries)
  const qty = {}, undated = [], later = [];
  T(32).forEach((e) => { const d = String(e['Posting Date'] || '').slice(0, 10); if (!d) { undated.push(e['Item No.']); return; } if (CUT && d > CUT) { later.push(e['Item No.']); return; }
    const k = (e['Location Code'] || '') + '|' + e['Item No.']; qty[k] = Math.round(((qty[k] || 0) + Number(e.Quantity || 0)) * 1e6) / 1e6; });
  const invWh = {}; Object.keys(qty).forEach((k) => { invWh[k.split('|')[0]] = 1; });
  const whCode = (lc) => lc || 'BC-NOLOC', docNo = (lc) => ('OPEN-' + whCode(lc) + '-' + CUT).slice(0, 30);
  Object.keys(invWh).sort().forEach((lc) => put('M_Inventory', { DocumentNo: docNo(lc), 'M_Warehouse_ID>Value': whCode(lc), MovementDate: CUT, 'C_DocType_ID>DocSubTypeInv': 'PI', Description: 'Opening stock from Business Central at ' + CUT }, { bc: 32, key: lc }));
  Object.keys(qty).sort().forEach((k) => { const [lc, it] = k.split('|'); if (!qty[k]) return;
    put('M_InventoryLine', { M_Inventory_ID: docNo(lc), 'M_Locator_ID>Value': locatorOf[lc] || whCode(lc), 'M_Product_ID>Value': it, QtyCount: String(qty[k]) }, { bc: 32, key: k }); });
  if (sheets.M_Inventory.length) { patch('M_Inventory', 'C_DocType_ID', 'C_DocType_ID>DocSubTypeInv = PI', 'MSetup.java:776 — the one Physical Inventory document type', sheets.M_Inventory.length);
    patch('M_Inventory', 'DocumentNo', 'OPEN-<location>-<cutover>', 'the lines find their header by DocumentNo (Ninja MigrateExcelData Line rule)', sheets.M_Inventory.length); }
  if (undated.length) refused.push({ sheet: 'M_InventoryLine', why: 'item ledger entries without a Posting Date', n: undated.length });
  if (later.length) notes.push(later.length + ' item ledger entr(y/ies) are after the cutover ' + CUT + ': not in the opening stock.');
  if (noCountry.length) patch('C_Location', 'C_Country_ID', coCountry ? "Company Information's country (" + coCountry + ')' : '(none: add Company Information (79))', 'C_Location.C_Country_ID is mandatory; BC leaves the country blank for a domestic address', noCountry.length);
  patch('C_Location', 'C_Location_UU', 'UUID v5 of "bc/<table>/<key>"', "iDempiere's record key for moving data between systems: the address is found by it, not by its street", sheets.C_Location.length);

  const book = finishBook(sheets, patch, renamed);
  const manifest = { tool: 'erp/plugins/bc_migrate_convert.mjs', format: 'ninja-workbook-v3', source: 'Dynamics 365 Business Central configuration package', alpha: true, workbook: WORKBOOK,
    package: pkg.code, cutover: CUT, currency: lcy, model: { source: model.source, commit: model.commit },
    bc_tables: Object.keys(pkg.tables).map((id) => ({ id: Number(id), caption: pkg.tables[id].caption, sheet: pkg.tables[id].sheet, rows: pkg.tables[id].rows.length, headers: pkg.tables[id].fields.length })),
    unknown_headers: pkg.unknown, skipped_sheets: pkg.skipped, problems,
    sheets: book.map((s, i) => ({ sheet: s.name, table: ORDER[i], rows: s.rows.length - 1, header: s.rows[0], source: 'bc' })), patches, renamed, refused, notes };
  return { book, manifest, provenance: prov };
}

