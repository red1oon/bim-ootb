// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — sap_migrate_convert.mjs: the SAP Business One agent's sap_export.json (erp/sap_agent/agent.js, read from the user's OWN Service Layer) → the SAME 17-sheet
//   Ninja workbook + manifest the Odoo export and the Business Central converter write, so the "Migrate from Odoo" plan/load and the Ninja loader apply unchanged.
//   Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §SAP-SPEC — Witness: W-SAP-MIGRATE. READ THE LOG: §SAP lines. ALPHA, a POC released early: never run against a
//   live Business One here; the alpha report is how a tester's run reports back. Field names: SAP's guide "Working with SAP Business One Service Layer" v1.26 + the user's
//   own $metadata (the agent lists what their server lacks).
// Pure: no I/O, no clock, no random. Browser + node. Length rules, the book and the masking are the Business Central converter's (imported, not copied).
import { HEADERS, ORDER, uuid5, mask, finishBook } from './bc_migrate_convert.mjs';
export const WORKBOOK = 'sap_b1_migration.xlsx';

const yes = (v) => v === 'tYES' || v === 'Y' || v === 1 || v === '1';   // BoYesNoEnum: the Service Layer answers the member name (tYES / tNO); the value is accepted too (guide §3.5.1)
const s = (v) => (v == null ? '' : String(v));

// convert(exp, { cutover, priceList }) -> { book, manifest, provenance }
export function convert(exp, opts) {
  opts = opts || {}; const CUT = opts.cutover || '', X = (exp && exp.sets) || {}, M = (exp && exp.manifest) || {}, admin = (exp && exp.admin) || {};
  const T = (k) => X[k] || [];
  const sheets = {}, prov = {}; ORDER.forEach((t) => { sheets[t] = []; prov[t] = []; });
  const patches = [], renamed = [], notes = [], refused = [], problems = [];
  const put = (t, row, src) => { sheets[t].push(row); prov[t].push(src); };
  const patch = (table, column, cell, rule, rows) => { if (rows) patches.push({ table, column, cell, rule, rows }); };
  if (!exp || M.format !== 'sap-b1-export-v1') problems.push('This is not a file the SAP Business One agent wrote (sap_export.json, format sap-b1-export-v1).');
  Object.keys(M.sets || {}).forEach((k) => { const ms = M.sets[k]; if (ms.missing_set) notes.push('Your server publishes no ' + k + ': that part is empty.');
    else if ((ms.fields_missing || []).length) notes.push(k + ': your server lacks ' + ms.fields_missing.join(', ') + ' — those columns are empty.'); });
  const country = s(admin.Country);

  // 01 C_UOM ← UnitOfMeasurements (X12DE355 = InternationalSymbol: the form suggests the ERP unit with that code, the user confirms)
  T('UnitOfMeasurements').forEach((u) => put('C_UOM', { Name: s(u.Code), UOMSymbol: s(u.Code), StdPrecision: '', X12DE355: s(u.InternationalSymbol) }, { sap: 'UnitOfMeasurements', key: u.AbsEntry }));
  // 02 C_PaymentTerm ← PaymentTermsTypes. NetDays only for "days, no months, no month-end start"; any other rule is imported as the term and named.
  const complex = [];
  T('PaymentTermsTypes').forEach((p) => { const months = Number(p.NumberOfAdditionalMonths || 0), start = s(p.StartFrom), plain = !months && (!start || start === 'pdt_None');
    if (!plain) complex.push(s(p.GroupNumber));
    put('C_PaymentTerm', { Value: s(p.GroupNumber), Name: s(p.PaymentTermsGroupName) || s(p.GroupNumber), NetDays: plain && p.NumberOfAdditionalDays != null ? s(p.NumberOfAdditionalDays) : '' }, { sap: 'PaymentTermsTypes', key: p.GroupNumber }); });
  if (complex.length) notes.push(complex.length + ' payment term(s) count months or start at a month end/half (' + complex.join(', ') + '): imported as the term without days.');
  // 03 M_Product_Category ← ItemGroups (flat in Business One)
  T('ItemGroups').forEach((g) => put('M_Product_Category', { Value: s(g.Number), Name: s(g.GroupName) || s(g.Number), 'M_Product_Category_Parent_ID>Value': '' }, { sap: 'ItemGroups', key: g.Number }));
  // 04 C_ElementValue ← ChartOfAccounts. AccountType at_Revenues → R, at_Expenses → E; at_Other (balance sheet) has no asset/liability/equity class in the Service Layer
  //   record — it lives in the company database's account table (owner's DB-engine point; not read in this alpha) → ERP default, named. ActiveAccount tNO = a title account → summary.
  const AT = { at_Revenues: 'R', at_Expenses: 'E' }; let other = 0;
  T('ChartOfAccounts').forEach((a) => { const at = AT[s(a.AccountType)] || ''; if (!at) other++;
    put('C_ElementValue', { Value: s(a.Code), Name: s(a.Name) || s(a.Code), AccountType: at, AccountSign: 'N', IsSummary: a.ActiveAccount != null && !yes(a.ActiveAccount) ? 'Y' : 'N', 'C_Element_ID>ElementType': 'A' }, { sap: 'ChartOfAccounts', key: a.Code, type: a.AccountType }); });
  patch('C_ElementValue', 'C_Element_ID', 'C_Element_ID>ElementType = A', 'ImportAccount.java:130-143 — the account element of the tenant', T('ChartOfAccounts').length);
  if (other) notes.push(other + ' account(s) are balance-sheet accounts (at_Other): the Service Layer does not say asset, liability or equity — AccountType left to the ERP default. (Next: read the class from the account table.)');
  // 05-08 BusinessPartners: cCustomer / cSupplier; cLid (a lead) is not a partner the ERP trades with → refused, counted. BPAddresses → C_Location + C_BPartner_Location; ContactEmployees → AD_User
  const locKey = {}, noCountry = [];
  const addLoc = (r, uuName) => { const uu = uuid5('sap/' + uuName); if (locKey[uu]) return uu; locKey[uu] = 1; let c = s(r.Country); if (!c) { c = country; noCountry.push(uuName); }
    put('C_Location', { Address1: s(r.Street), Address2: s(r.Block), City: s(r.City), Postal: s(r.ZipCode), RegionName: s(r.State || r.County), 'C_Country_ID>CountryCode': c, C_Location_UU: uu }, { sap: uuName }); return uu; };
  const hasAddr = (r) => !!(r.Street || r.Block || r.City || r.ZipCode || r.Country);
  let leads = 0;
  T('BusinessPartners').forEach((b) => { const ty = s(b.CardType); if (ty === 'cLid' || ty === 'L') { leads++; return; }
    const v = s(b.CardCode), cust = ty === 'cCustomer' || ty === 'C', vend = ty === 'cSupplier' || ty === 'S';
    put('C_BPartner', { Value: v, Name: s(b.CardName) || v, TaxID: s(b.FederalTaxID), IsCustomer: cust ? 'Y' : 'N', IsVendor: vend ? 'Y' : 'N', 'C_BP_Group_ID>IsDefault': 'Y',
      IsActive: yes(b.Frozen) || (b.Valid != null && !yes(b.Valid)) ? 'N' : 'Y' }, { sap: 'BusinessPartners', key: v, type: ty });
    (b.BPAddresses || []).forEach((a) => { if (!hasAddr(a)) return; const uu = addLoc(a, 'bp/' + v + '/' + s(a.AddressType) + '/' + s(a.AddressName));
      put('C_BPartner_Location', { 'C_BPartner_ID>Value': v, 'C_Location_ID>C_Location_UU': uu, Name: s(a.AddressName) }, { sap: 'BPAddresses', key: v + '/' + s(a.AddressName), type: a.AddressType }); });
    const cps = (b.ContactEmployees || []).filter((c) => c.Name);
    cps.forEach((c) => put('AD_User', { Name: s(c.Name), EMail: s(c.E_Mail), Phone: s(c.Phone1), Phone2: s(c.MobilePhone), 'C_BPartner_ID>Value': v, IsActive: c.Active != null && !yes(c.Active) ? 'N' : 'Y' }, { sap: 'ContactEmployees', key: v + '/' + s(c.Name) }));
    if (!cps.length && (b.EmailAddress || b.Phone1)) put('AD_User', { Name: s(b.ContactPerson) || s(b.CardName) || v, EMail: s(b.EmailAddress), Phone: s(b.Phone1), Phone2: s(b.Cellular || b.Phone2), 'C_BPartner_ID>Value': v, IsActive: 'Y' }, { sap: 'BusinessPartners', key: v, part: 'card contact' });
  });
  patch('C_BPartner', 'C_BP_Group_ID', 'C_BP_Group_ID>IsDefault = Y', "ImportBPartner.java:129-132 — the client's default business partner group", sheets.C_BPartner.length);
  if (leads) refused.push({ sheet: 'C_BPartner', why: 'a lead (CardType cLid), not a customer or vendor', n: leads });
  // 09-10 Items → M_Product; Mainsupplier → M_Product_PO
  let fixed = 0, nonInv = 0; const items = [], bpSet = {}; sheets.C_BPartner.forEach((r) => { bpSet[r.Value] = r; });
  T('Items').forEach((i) => { const ty = s(i.ItemType); if (ty === 'itFixedAssets') { fixed++; return; } items.push(i); if (i.InventoryItem != null && !yes(i.InventoryItem) && ty !== 'itLabor' && ty !== 'itTravel') nonInv++;
    put('M_Product', { Value: s(i.ItemCode), Name: s(i.ItemName) || s(i.ItemCode), Description: s(i.ForeignName), 'M_Product_Category_ID>Value': s(i.ItemsGroupCode), 'M_Product_Category_ID>IsDefault': i.ItemsGroupCode != null ? '' : 'Y',
      C_UOM_ID: s(i.InventoryUOM), 'C_UOM_ID>IsDefault': i.InventoryUOM ? '' : 'Y', ProductType: ty === 'itLabor' || ty === 'itTravel' ? 'S' : 'I', UPC: s(i.BarCode), Weight: s(i.SalesUnitWeight), Volume: s(i.SalesUnitVolume), 'C_TaxCategory_ID>IsDefault': 'Y',
      IsActive: yes(i.Frozen) || (i.Valid != null && !yes(i.Valid)) ? 'N' : 'Y' }, { sap: 'Items', key: i.ItemCode, type: ty }); });
  patch('M_Product', 'C_TaxCategory_ID', 'C_TaxCategory_ID>IsDefault = Y', "ImportProduct.java:415 — the client's default tax category", items.length);
  patch('M_Product', 'C_UOM_ID', 'C_UOM_ID>IsDefault = Y', "ImportProduct.java:304-311 — the client's default unit for an item Business One keeps without an inventory unit", items.filter((i) => !i.InventoryUOM).length);
  patch('M_Product', 'M_Product_Category_ID', 'M_Product_Category_ID>IsDefault = Y', "ImportProduct.java:213-221 — the client's default product category for an item without an item group", items.filter((i) => i.ItemsGroupCode == null).length);
  if (fixed) refused.push({ sheet: 'M_Product', why: 'a fixed asset item (ItemType itFixedAssets): assets are not core', n: fixed });
  if (nonInv) notes.push(nonInv + ' item(s) are not inventory items in Business One: imported as items (ProductType I).');
  let poMiss = 0, vpn = 0;
  items.forEach((i) => { if (!i.Mainsupplier) return; const bp = bpSet[s(i.Mainsupplier)]; if (!bp) { poMiss++; return; } if (!i.SupplierCatalogNo) vpn++;
    put('M_Product_PO', { 'M_Product_ID>Value': s(i.ItemCode), 'C_BPartner_ID>Value': s(i.Mainsupplier), PricePO: '', VendorProductNo: s(i.SupplierCatalogNo) || s(i.ItemCode), Order_Min: '', DeliveryTime_Promised: '' }, { sap: 'Items', key: i.ItemCode, field: 'Mainsupplier' }); });
  if (vpn) patch('M_Product_PO', 'VendorProductNo', "the item's code", 'ImportProduct.java:393-394 — VendorProductNo=Value when the vendor gave none', vpn);
  if (poMiss) refused.push({ sheet: 'M_Product_PO', why: 'a main supplier not in the export', n: poMiss });
  // 11-13 ONE sale price list: the B1 price list the user names (opts.priceList), else the lowest PriceListNo — in its DefaultPrimeCurrency, else the company's local currency
  const pls = T('PriceLists').slice().sort((a, b) => Number(a.PriceListNo) - Number(b.PriceListNo)), pl = pls.find((p) => s(p.PriceListNo) === s(opts.priceList)) || pls[0];
  const cur = pl ? s(pl.DefaultPrimeCurrency) || s(admin.LocalCurrency) : '';
  if (pl && !cur) problems.push('The price list has no currency and the company local currency was not readable: the currency is not guessed.');
  if (pl && cur && items.length) { const PLN = s(pl.PriceListName) || ('Price list ' + s(pl.PriceListNo));
    put('M_PriceList', { Name: PLN, IsSOPriceList: 'Y', 'C_Currency_ID>ISO_Code': cur }, { sap: 'PriceLists', key: pl.PriceListNo });
    put('M_PriceList_Version', { M_PriceList_ID: PLN, Name: CUT, ValidFrom: CUT, 'M_DiscountSchema_ID>DiscountType': 'P' }, { cutover: CUT });
    let n = 0; items.forEach((i) => { const p = (i.ItemPrices || []).find((x) => s(x.PriceList) === s(pl.PriceListNo)); if (!p) return; n++;
      put('M_ProductPrice', { M_PriceList_Version_ID: CUT, 'M_Product_ID>Value': s(i.ItemCode), PriceList: s(p.Price || 0), PriceStd: s(p.Price || 0) }, { sap: 'ItemPrices', key: i.ItemCode + '/' + pl.PriceListNo }); });
    if (pls.length > 1 && opts.priceList == null) patch('M_PriceList', 'Name', PLN, 'Business One keeps ' + pls.length + ' price lists; this alpha loads one: the lowest number (set another on the form)', 1);
    patch('M_PriceList_Version', 'M_DiscountSchema_ID', 'M_DiscountSchema_ID>DiscountType = P', 'ImportPriceList.java:97-98 — the first price-list schema of the client', 1); }
  // 14-15 Warehouses → M_Warehouse (+ address); BinLocations → M_Locator, else one locator per warehouse
  const whs = T('Warehouses'), whSet = {}, locatorOf = {}; let z = 0; const noAddrWh = [];
  // M_Warehouse.C_Location_ID is mandatory: a warehouse with no address and no readable company country is REFUSED here (named), so it cannot stop the whole load
  const okWh = whs.filter((w) => { const c = s(w.WarehouseCode); if (s(w.Country) || country) return true; noAddrWh.push(c); return false; });
  okWh.forEach((w) => { const c = s(w.WarehouseCode); whSet[c] = 1; const uu = addLoc(w, 'wh/' + c);
    put('M_Warehouse', { Value: c, Name: s(w.WarehouseName) || c, 'C_Location_ID>C_Location_UU': uu }, { sap: 'Warehouses', key: c }); });
  if (noAddrWh.length) refused.push({ sheet: 'M_Warehouse', why: 'a warehouse with no country, and the company country was not readable: add its country in Business One', n: noAddrWh.length });
  okWh.forEach((w) => { const c = s(w.WarehouseCode); locatorOf[c] = c; put('M_Locator', { 'M_Warehouse_ID>Value': c, Value: c, X: '0', Y: '0', Z: String(z++), IsActive: 'Y' }, { sap: 'Warehouses', key: c, part: 'warehouse locator' }); });
  let binNoWh = 0;
  T('BinLocations').forEach((b) => { const w = s(b.Warehouse); if (!whSet[w]) { binNoWh++; return; }
    put('M_Locator', { 'M_Warehouse_ID>Value': w, Value: s(b.BinCode) || (w + '/' + s(b.AbsEntry)), X: '0', Y: '0', Z: String(z++), IsActive: yes(b.Inactive) ? 'N' : 'Y' }, { sap: 'BinLocations', key: b.AbsEntry }); });
  if (sheets.M_Locator.length) patch('M_Locator', 'Z', 'a running number', 'legacy unique index m_location_where (M_Warehouse_ID, X, Y, Z); Business One bins carry no X/Y/Z', sheets.M_Locator.length);
  if (binNoWh) refused.push({ sheet: 'M_Locator', why: 'a bin whose warehouse is not in the export', n: binNoWh });
  // 16-17 opening stock = ItemWarehouseInfoCollection.InStock > 0 per item + warehouse. The Service Layer gives stock NOW, not at a date: it is the stock at the export, named.
  const qty = {}; let stockNoWh = 0;
  items.forEach((i) => (i.ItemWarehouseInfoCollection || []).forEach((w) => { const q = Number(w.InStock || 0); if (!q) return; if (!whSet[s(w.WarehouseCode)]) { stockNoWh++; return; }
    const k = s(w.WarehouseCode) + '|' + s(i.ItemCode); qty[k] = Math.round(((qty[k] || 0) + q) * 1e6) / 1e6; }));
  const docNo = (w) => ('OPEN-' + w + '-' + CUT).slice(0, 30), invWh = {}; Object.keys(qty).forEach((k) => { invWh[k.split('|')[0]] = 1; });
  Object.keys(invWh).sort().forEach((w) => put('M_Inventory', { DocumentNo: docNo(w), 'M_Warehouse_ID>Value': w, MovementDate: CUT, 'C_DocType_ID>DocSubTypeInv': 'PI', Description: 'Opening stock from SAP Business One (stock at the export)' }, { sap: 'ItemWarehouseInfoCollection', key: w }));
  Object.keys(qty).sort().forEach((k) => { const [w, it] = k.split('|'); put('M_InventoryLine', { M_Inventory_ID: docNo(w), 'M_Locator_ID>Value': locatorOf[w] || w, 'M_Product_ID>Value': it, QtyCount: String(qty[k]) }, { sap: 'ItemWarehouseInfoCollection', key: k }); });
  if (sheets.M_Inventory.length) { patch('M_Inventory', 'C_DocType_ID', 'C_DocType_ID>DocSubTypeInv = PI', 'MSetup.java:776 — the one Physical Inventory document type', sheets.M_Inventory.length);
    patch('M_Inventory', 'MovementDate', 'the cut-over date', 'the Service Layer item record gives the stock now (InStock), not at a date: this is the stock at the export, dated at the cut-over', sheets.M_Inventory.length); }
  if (stockNoWh) refused.push({ sheet: 'M_InventoryLine', why: 'stock in a warehouse not in the export', n: stockNoWh });
  if (noCountry.length) patch('C_Location', 'C_Country_ID', country ? "the company's country (" + country + ')' : '(none: the company country was not readable)', 'C_Location.C_Country_ID is mandatory; these addresses have no country', noCountry.length);
  patch('C_Location', 'C_Location_UU', 'UUID v5 of "sap/<kind>/<key>"', "iDempiere's record key for moving data between systems: the address is found by it, not by its street", sheets.C_Location.length);

  const book = finishBook(sheets, patch, renamed, 'sap');
  const manifest = { tool: 'erp/plugins/sap_migrate_convert.mjs', format: 'ninja-workbook-v3', source: 'SAP Business One Service Layer (sap_export.json)', alpha: true, workbook: WORKBOOK,
    company: M.company ? 'present' : '', version: M.version || '', metadata: M.metadata || null, cutover: CUT, currency: cur, priceList: pl ? s(pl.PriceListNo) : '',
    sap_sets: Object.keys(M.sets || {}).map((k) => ({ set: k, count: M.sets[k].count, rows: (X[k] || []).length, read: (M.sets[k].fields_read || []).length, missing: M.sets[k].fields_missing || (M.sets[k].missing_set ? ['(set)'] : []) })),
    problems, sheets: book.map((b, i) => ({ sheet: b.name, table: ORDER[i], rows: b.rows.length - 1, header: b.rows[0], source: 'sap' })), patches, renamed, refused, notes };
  return { book, manifest, provenance: prov };
}

// the ALPHA REPORT a tester pastes back: sets, counts, missing fields, sheets, refusals, patches — every quoted value masked, no customer value
export function alphaReport(manifest, result) {
  const L = ['§SAP-ALPHA version=' + (manifest.version || '?') + ' sets=' + manifest.sap_sets.length + ' metadata=' + String((manifest.metadata || {}).sha256 || '').slice(0, 16) + ' cutover=' + manifest.cutover + ' currency=' + (manifest.currency || '-')];
  manifest.sap_sets.forEach((x) => L.push('§SAP-ALPHA set=' + x.set + ' count=' + x.count + ' rows=' + x.rows + ' fields=' + x.read + (x.missing.length ? ' missing=' + JSON.stringify(x.missing) : '')));
  manifest.sheets.forEach((x) => L.push('§SAP-ALPHA sheet=' + x.sheet + ' rows=' + x.rows));
  (manifest.problems || []).forEach((p) => L.push('§SAP-ALPHA problem ' + mask(p)));
  (manifest.refused || []).forEach((r) => L.push('§SAP-ALPHA refused sheet=' + r.sheet + ' n=' + r.n + ' why=' + JSON.stringify(r.why)));
  const rn = {}; (manifest.renamed || []).forEach((r) => { const k = r.table + '.' + r.column + ' (' + r.why + ')'; rn[k] = (rn[k] || 0) + 1; });
  Object.keys(rn).forEach((k) => L.push('§SAP-ALPHA renamed ' + k + ' n=' + rn[k]));
  (manifest.patches || []).forEach((p) => L.push('§SAP-ALPHA patch ' + p.table + '.' + p.column + ' rows=' + p.rows));
  (manifest.notes || []).forEach((n) => L.push('§SAP-ALPHA note ' + mask(n).replace(/\([^)]*\)/g, '(…)')));   // a note's parentheses may list codes: masked
  if (result) L.push('§SAP-ALPHA result ' + mask(result));
  return L;
}
export { HEADERS, ORDER };
