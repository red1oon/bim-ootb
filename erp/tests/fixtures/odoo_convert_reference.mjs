// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEST ORACLE, NOT SHIPPED (frozen 2026-11-10, bim-compiler MIGRATE_INSTALL_TENANT.md §ODOO-ENGINE-SPEC step O1): the mapping half of erp/odoo_agent/export.js
//   as it shipped in bim-ootb main bf7cfe6d, MOVED here statement for statement so it reads ONLY the agent's raw odoo_export.json (exp.sets / exp.manifest) — no RPC, no fs, no clock,
//   no process. It is the ORACLE for the template templates/odoo-17.json (W-MIGRATE-ENGINE cases ODOO-REF*). Do not edit it to make a diff pass — a change of behaviour goes in the template.
//   Differences from the original, all mechanical: an Odoo many2one [id, name] arrives flattened (<f> = id, <f>__name = name) and Odoo's `false` arrives as null (cell() and m2o() treat both
//   alike, as before); the reads are the raw sets of the same name as the Odoo model; console output is gone; uuid5 is the sync one of migrate/workbook.mjs (same namespace constant).
//   The result: { book: [{ name, rows: [header, ...rows] }], manifest, provenance } — the three files the agent writes (odoo_migration.xlsx, manifest.json, provenance.json).
import { uuid5 } from '../../migrate/workbook.mjs';

function cell(v) { return (v === null || v === undefined || v === false) ? '' : v; }
function m2o(v) { return v === null || v === undefined || v === false ? null : v; }   // the agent flattens a many2one to its id: nothing to unpack here

var LEN = { 'AD_User.EMail': 60, 'AD_User.Name': 60, 'AD_User.Phone': 40, 'AD_User.Phone2': 40, 'C_BPartner_Location.Name': 60, 'C_BPartner.Name': 120, 'C_BPartner.TaxID': 20,
  'C_BPartner.Value': 40, 'C_ElementValue.Name': 120, 'C_ElementValue.Value': 40, 'C_Location.Address1': 60, 'C_Location.Address2': 60, 'C_Location.City': 60, 'C_Location.Postal': 10,
  'C_Location.RegionName': 40, 'C_PaymentTerm.Name': 60, 'C_PaymentTerm.Value': 40, 'C_UOM.Name': 60, 'C_UOM.UOMSymbol': 10, 'M_Inventory.Description': 255, 'M_Inventory.DocumentNo': 30,
  'M_Locator.Value': 40, 'M_Locator.X': 60, 'M_Locator.Y': 60, 'M_Locator.Z': 60, 'M_PriceList.Name': 60, 'M_PriceList_Version.Name': 60, 'M_Product_Category.Name': 60,
  'M_Product_Category.Value': 40, 'M_Product.Description': 255, 'M_Product.Name': 255, 'M_Product.UPC': 30, 'M_Product.Value': 510, 'M_Product_PO.VendorProductNo': 40,
  'M_Warehouse.Name': 60, 'M_Warehouse.Value': 40 };
// Odoo account_type → iDempiere AccountType (A asset, L liability, O owner's equity, R revenue, E expense, M memo)
function acctType(t) {
  if (/^asset/.test(t)) return 'A'; if (/^liability/.test(t)) return 'L'; if (/^equity/.test(t)) return 'O';
  if (/^income/.test(t)) return 'R'; if (/^expense/.test(t)) return 'E'; if (t === 'off_balance') return 'M'; return '';
}
// Odoo detailed_type → iDempiere ProductType (I item, S service)
function prodType(t) { return t === 'service' ? 'S' : (t === 'consu' || t === 'product') ? 'I' : ''; }

export function convert(exp) {
  const X = (exp && exp.sets) || {}, M = (exp && exp.manifest) || {}, T = (k) => X[k] || [];
  const DB = M.db, CUTOVER = M.cutover, iso = M.currency, version = M.odoo_version, coId = M.company_id, coCountry = M.company_country_code || '';
  const others = M.other_companies || [], otherCmd = M.other_company_commands || [];
  var fails = 0, sheets = [], counts = {}, notes = [], patches = [], held = [], provenance = {};
  function ok(c) { if (!c) fails++; }
  // the live count of every slice, keyed as the agent keyed it (model + domain + "(archived too)"), in the order the agent read them
  ['uom.uom', 'account.payment.term', 'product.category', 'account.account', 'res.partner', 'stock.warehouse', 'product.product', 'product.supplierinfo', 'stock.location', 'stock.quant'].forEach(function (k) {
    const ms = M.sets[k]; counts[ms.model + ' ' + ms.domain + (ms.archived_too ? ' (archived too)' : '')] = ms.count; });
  var company = T('res.company').filter(function (c) { return c.id === coId; });   // the chosen company (the agent read the login's, or --company)
  var heldCo = T('res.company');   // every company's own partner is held (H4: the others too)
    // H3 + lengths: the final key per Odoo record. Lowest Odoo id keeps its code; a repeat gets "<code>-<id>"; a key longer than the ERP column is cut and keeps "~<id>".
    var renamed = [];
    function keys(table, column, recs, rawOf) {
      var L = LEN[table + '.' + column] || 1e9, out = {}, seen = {};
      recs.slice().sort(function (a, b) { return a.id - b.id; }).forEach(function (r) {
        var raw = String(rawOf(r)), v = raw, why = '';
        if (v.length > L) { v = v.slice(0, L - String(r.id).length - 1) + '~' + r.id; why = 'longer than ' + L; }
        if (seen[v]) { v = (raw + '-' + r.id); why = 'repeats ' + JSON.stringify(raw); if (v.length > L) v = raw.slice(0, L - String(r.id).length - 1) + '-' + r.id; }
        seen[v] = 1; out[r.id] = v;
        if (why) renamed.push({ table: table, column: column, odoo_id: r.id, odoo: raw, erp: v, why: why });
      });
      return out;
    }
    // A sheet = { table, header (AD column names, `Col>Alt` lookups), rows (objects keyed by header), prov (Odoo record per row) }.
    function sheet(table, header, rows, source) {
      var name = String(sheets.length + 1).padStart(2, '0') + table;
      sheets.push({ name: name, table: table, header: header, rows: rows.map(function (r) { return header.map(function (h) { return cell(r[h]); }); }), source: source });
      provenance[name] = rows.map(function (r) { return r._odoo; });
    }
    // A patch = a column iDempiere requires that Odoo has no field for, filled by the legacy Import process's own rule.
    function patch(table, column, cellText, rule, rows) { patches.push({ table: table, column: column, cell: cellText, rule: rule, rows: rows }); }

    // 01 C_UOM. X12DE355 (mandatory, 4 chars) has no Odoo source → left blank for the ERP form's UoM-mapping step.
    var uoms = T('uom.uom');
    function prec(r) { if (!(r > 0)) return ''; var p = Math.round(-Math.log10(r)); return p >= 0 ? p : 0; }   // Odoo rounding 0.01 → 2 decimals
    sheet('C_UOM', ['Name', 'UOMSymbol', 'StdPrecision', 'X12DE355'],
      uoms.map(function (u) { return { Name: u.name, UOMSymbol: u.name.slice(0, 10), StdPrecision: prec(u.rounding), X12DE355: '',
        _odoo: { model: 'uom.uom', id: u.id, category: u.category_id ? u.category_id__name : false, uom_type: u.uom_type, factor: u.factor } }; }), 'uom.uom []');
    patch('C_UOM', 'X12DE355', '(blank)', 'no Odoo field: the ERP "Migrate from Odoo" form maps each Odoo UoM to an iDempiere UoM (§B4-SPEC step 2)', uoms.length);

    // 02 C_PaymentTerm. Single-line terms carry NetDays; multi-installment terms are named (C_PaySchedule is not in this set).
    var terms = T('account.payment.term');
    var tlines = T('account.payment.term.line');
    var multi = [];
    sheet('C_PaymentTerm', ['Value', 'Name', 'NetDays'], terms.map(function (t) {
      var ls = tlines.filter(function (l) { return m2o(l.payment_id) === t.id; });
      if (ls.length > 1) multi.push(t.name);
      return { Value: t.name.slice(0, 40), Name: t.name, NetDays: ls.length === 1 ? ls[0].nb_days : '',
        _odoo: { model: 'account.payment.term', id: t.id, lines: ls.map(function (l) { return [l.value, l.value_amount, l.nb_days]; }) } };
    }), 'account.payment.term []');
    if (multi.length) notes.push(multi.length + ' payment term(s) have several installments (' + multi.join('; ') + '): imported as the term only; the installments are in provenance.json for C_PaySchedule.');

    // 03 M_Product_Category, parent by Value (Odoo complete_name is unique; Name is not — two "Saleable"), parents first.
    var cats = T('product.category').slice();
    var catById = {}; cats.forEach(function (c) { catById[c.id] = c; });
    cats.sort(function (a, b) { return a.complete_name.split(' / ').length - b.complete_name.split(' / ').length || a.id - b.id; });
    var catKey = keys('M_Product_Category', 'Value', cats, function (c) { return c.complete_name; });
    sheet('M_Product_Category', ['Value', 'Name', 'M_Product_Category_Parent_ID>Value'], cats.map(function (c) { return { Value: catKey[c.id], Name: c.name,
      'M_Product_Category_Parent_ID>Value': c.parent_id ? catKey[m2o(c.parent_id)] : '', _odoo: { model: 'product.category', id: c.id } }; }), 'product.category []');

    // 04 C_ElementValue (chart of accounts). Parent only from account.group rows; the element = the tenant's account element.
    var accts = T('account.account');
    var groups = M.sets['account.group'].count;
    sheet('C_ElementValue', ['Value', 'Name', 'AccountType', 'AccountSign', 'IsSummary', 'C_Element_ID>ElementType'], accts.map(function (a) { return { Value: a.code, Name: a.name,
      AccountType: acctType(a.account_type), AccountSign: 'N', IsSummary: 'N', 'C_Element_ID>ElementType': 'A', _odoo: { model: 'account.account', id: a.id, account_type: a.account_type } }; }), 'account.account []');
    patch('C_ElementValue', 'C_Element_ID', 'C_Element_ID>ElementType = A', 'ImportAccount.java:130-143 — the account element of the tenant (legacy: the element the user names)', accts.length);
    if (!groups) notes.push('account.group has 0 rows: the chart of accounts imports flat (no summary parents in the source).');

    // 05-08 partners. Commercial partners (no parent) → C_BPartner; their address → C_Location + C_BPartner_Location;
    //   child partners → AD_User under the parent (+ their own address when Odoo type is not "contact", which copies the parent's).
    //   Own company + internal users' partners are HELD (manifest.held) — the user decides on the summary screen (§B1-SPEC).
    // H2: archived partners come along INACTIVE (Odoo active=False = iDempiere IsActive=N), so a contact of an archived company keeps its company
    var pf = ['id', 'name', 'ref', 'is_company', 'parent_id', 'commercial_partner_id', 'type', 'email', 'phone', 'mobile', 'street', 'street2', 'city',
      'state_id', 'zip', 'country_id', 'vat', 'customer_rank', 'supplier_rank', 'active'];
    var partners = T('res.partner');
    var users = T('res.users');
    var internal = {}; heldCo.forEach(function (c) { internal[m2o(c.partner_id)] = 'company'; }); users.forEach(function (u) { internal[m2o(u.partner_id)] = internal[m2o(u.partner_id)] || 'user'; });
    var countryIds = [], stateIds = [];
    partners.forEach(function (p) { if (p.country_id) countryIds.push(m2o(p.country_id)); if (p.state_id) stateIds.push(m2o(p.state_id)); });
    var cc = {}, st = {};
    T('res.country').forEach(function (c) { cc[c.id] = c.code; });
    T('res.country.state').forEach(function (s) { st[s.id] = s.name; });
    var byId = {}; partners.forEach(function (p) { byId[p.id] = p; });
    // a contact belongs to its COMMERCIAL partner (Odoo's commercial_partner_id: the top company, also for an address under a person under a company)
    function top(p) { return byId[m2o(p.commercial_partner_id)] || p; }
    function isHeld(p) { return internal[p.id] || internal[top(p).id]; }
    var bpKey = keys('C_BPartner', 'Value', partners.filter(function (p) { return !isHeld(p) && top(p).id === p.id; }), function (p) { return p.ref || String(p.id); });
    function val(p) { return bpKey[p.id]; }
    function hasAddr(p) { return !!(p.street || p.street2 || p.city || p.zip || p.country_id); }
    var locRows = [], bplRows = [], userRows = [], bpRows = [], noCountry = [];
    function addLoc(p, bpValue) {   // one C_Location per Odoo address, identified by C_Location_UU (H1)
      var country = p.country_id ? cc[m2o(p.country_id)] : coCountry;
      if (!p.country_id) noCountry.push(p.id);
      locRows.push({ Address1: p.street, Address2: p.street2, City: p.city, Postal: p.zip, RegionName: p.state_id ? st[m2o(p.state_id)] : '',
        'C_Country_ID>CountryCode': country, C_Location_UU: uuid5(DB + '/res.partner/' + p.id), _odoo: { model: 'res.partner', id: p.id, part: 'address' } });
      if (bpValue) bplRows.push({ 'C_BPartner_ID>Value': bpValue, 'C_Location_ID>C_Location_UU': uuid5(DB + '/res.partner/' + p.id), Name: p.type && p.type !== 'contact' ? p.name || p.type : '',
        _odoo: { model: 'res.partner', id: p.id, part: 'bp-location', type: p.type || 'contact' } });
    }
    partners.forEach(function (p) {
      if (isHeld(p)) { held.push({ model: 'res.partner', id: p.id, name: p.name, why: internal[p.id] ? 'internal-' + internal[p.id] : 'contact of internal-' + internal[top(p).id] }); return; }
      if (top(p).id === p.id) {
        bpRows.push({ Value: val(p), Name: p.name, TaxID: p.vat, IsCustomer: p.customer_rank > 0 ? 'Y' : 'N', IsVendor: p.supplier_rank > 0 ? 'Y' : 'N',
          'C_BP_Group_ID>IsDefault': 'Y', IsActive: p.active ? 'Y' : 'N', _odoo: { model: 'res.partner', id: p.id, part: 'partner', active: p.active } });
        if (hasAddr(p)) addLoc(p, val(p));
      } else {
        var par = top(p);
        userRows.push({ Name: p.name, EMail: p.email, Phone: p.phone, Phone2: p.mobile, 'C_BPartner_ID>Value': val(par), IsActive: p.active ? 'Y' : 'N',
          _odoo: { model: 'res.partner', id: p.id, part: 'contact', type: p.type, parent: m2o(p.parent_id), active: p.active } });
        if (p.type && p.type !== 'contact' && hasAddr(p)) addLoc(p, val(par));
      }
    });
    sheet('C_BPartner', ['Value', 'Name', 'TaxID', 'IsCustomer', 'IsVendor', 'C_BP_Group_ID>IsDefault', 'IsActive'], bpRows, 'res.partner [] (archived too)');
    var archivedBP = bpRows.filter(function (r) { return r.IsActive === 'N'; }).length + userRows.filter(function (r) { return r.IsActive === 'N'; }).length;
    if (archivedBP) notes.push(archivedBP + ' partner(s)/contact(s) are archived in Odoo: they come in INACTIVE (kept for history; nobody can pick them on new documents).');
    patch('C_BPartner', 'C_BP_Group_ID', 'C_BP_Group_ID>IsDefault = Y', "ImportBPartner.java:129-132 — the client's default business partner group", bpRows.length);

    // warehouses' addresses (stock.warehouse.partner_id) are C_Location rows too: M_Warehouse.C_Location_ID is required (§SHEET-CONTRACT)
    var whs = T('stock.warehouse');
    var whAddr = {};
    whs.forEach(function (w) {
      var p = w.partner_id && (byId[m2o(w.partner_id)]);
      if (p && hasAddr(p)) { whAddr[w.id] = uuid5(DB + '/res.partner/' + p.id); if (!locRows.some(function (l) { return l._odoo.id === p.id; })) addLoc(p, null); }
    });
    sheet('C_Location', ['Address1', 'Address2', 'City', 'Postal', 'RegionName', 'C_Country_ID>CountryCode', 'C_Location_UU'], locRows, 'res.partner [] (addresses)');
    patch('C_Location', 'C_Location_UU', 'UUID v5 of "<db>/res.partner/<id>"', "iDempiere's record key for moving data between systems (2Pack resolves by the _UU column): the address is found by it, not by its street", locRows.length);
    if (noCountry.length) patch('C_Location', 'C_Country_ID', "your Odoo company's country (" + coCountry + ')', 'C_Location.C_Country_ID is mandatory; Odoo left the country empty on res.partner ' + noCountry.join(', ') + ' — check them after the move', noCountry.length);
    sheet('C_BPartner_Location', ['C_BPartner_ID>Value', 'C_Location_ID>C_Location_UU', 'Name'], bplRows, 'res.partner [] (addresses)');
    sheet('AD_User', ['Name', 'EMail', 'Phone', 'Phone2', 'C_BPartner_ID>Value', 'IsActive'], userRows, 'res.partner [] (contacts)');

    // 09 M_Product, 10 M_Product_PO (one row per product.supplierinfo)
    var prods = T('product.product');
    var sellers = T('product.supplierinfo');
    var tmplOf = {}; prods.forEach(function (p) { tmplOf[p.id] = m2o(p.product_tmpl_id); });
    var prodKey = keys('M_Product', 'Value', prods, function (p) { return p.default_code || String(p.id); });
    function pval(p) { return prodKey[p.id]; }
    sheet('M_Product', ['Value', 'Name', 'Description', 'M_Product_Category_ID>Value', 'C_UOM_ID', 'ProductType', 'UPC', 'Weight', 'Volume', 'C_TaxCategory_ID>IsDefault', 'IsActive'],
      prods.map(function (p) { return { Value: pval(p), Name: p.name, Description: p.description, 'M_Product_Category_ID>Value': catKey[m2o(p.categ_id)] || '',
        C_UOM_ID: p.uom_id ? p.uom_id__name : false, ProductType: prodType(p.detailed_type), UPC: p.barcode, Weight: p.weight, Volume: p.volume, 'C_TaxCategory_ID>IsDefault': 'Y',
        IsActive: p.active ? 'Y' : 'N', _odoo: { model: 'product.product', id: p.id, active: p.active } }; }), 'product.product [] (archived too)');
    var archivedPr = prods.filter(function (p) { return !p.active; }).length;
    if (archivedPr) notes.push(archivedPr + ' product(s) are archived in Odoo: they come in INACTIVE (their stock and vendor prices keep a product to point at).');
    patch('M_Product', 'C_TaxCategory_ID', 'C_TaxCategory_ID>IsDefault = Y', "ImportProduct.java:415 — the client's default tax category", prods.length);
    // ONE row per (product, vendor): legacy has one M_Product_PO per vendor (unique index m_product_po_vendorprodno on C_BPartner_ID+VendorProductNo, found by W-NINJA-MIGRATE);
    //   Odoo's quantity price breaks for the same vendor fold into the row of the lowest minimum quantity, the others stay in provenance (ids) and are named in the notes.
    var poRows = [], vpnPatched = 0, breaks = [];
    prods.forEach(function (p) {
      var byVendor = {};
      sellers.filter(function (s) { return (s.product_id && m2o(s.product_id) === p.id) || (!s.product_id && m2o(s.product_tmpl_id) === tmplOf[p.id]); }).forEach(function (s) {
        var bp = byId[m2o(s.partner_id)], k = bp ? (val(top(bp)) || '') : '';
        (byVendor[k] = byVendor[k] || []).push(s);
      });
      Object.keys(byVendor).sort().forEach(function (k) {
        var ss = byVendor[k].slice().sort(function (a, b) { return (a.min_qty - b.min_qty) || (a.id - b.id); }), s = ss[0];
        if (ss.length > 1) breaks.push(pval(p) + '/' + k + ' ×' + ss.length);
        if (!s.product_code) vpnPatched++;
        poRows.push({ 'M_Product_ID>Value': pval(p), 'C_BPartner_ID>Value': k, PricePO: s.price, VendorProductNo: s.product_code || pval(p),
          Order_Min: s.min_qty, DeliveryTime_Promised: s.delay, _odoo: { model: 'product.supplierinfo', id: s.id, ids: ss.map(function (x) { return x.id; }), product: p.id } });
      });
    });
    if (breaks.length) notes.push(breaks.length + ' product/vendor pair(s) have Odoo quantity price breaks (' + breaks.join(', ') + '): the lowest-quantity price is the vendor price; the breaks are in provenance.json (M_ProductPriceVendorBreak is not in this set).');
    sheet('M_Product_PO', ['M_Product_ID>Value', 'C_BPartner_ID>Value', 'PricePO', 'VendorProductNo', 'Order_Min', 'DeliveryTime_Promised'], poRows, 'product.supplierinfo []');
    if (vpnPatched) patch('M_Product_PO', 'VendorProductNo', "the product's Value", 'ImportProduct.java:393-394 — VendorProductNo=Value when the vendor gave none', vpnPatched);

    // 11-13 the sale price list (Odoo product.list_price) at the cutover date
    var PLNAME = 'Odoo list_price';
    sheet('M_PriceList', ['Name', 'IsSOPriceList', 'C_Currency_ID>ISO_Code'], [{ Name: PLNAME, IsSOPriceList: 'Y', 'C_Currency_ID>ISO_Code': iso, _odoo: { model: 'product.product', field: 'list_price' } }], 'product.product [] (list_price)');
    patch('M_PriceList', 'Name', PLNAME, 'Odoo keeps the sale price on the product (list_price), not in a named list: one list named after that field', 1);
    sheet('M_PriceList_Version', ['M_PriceList_ID', 'Name', 'ValidFrom', 'M_DiscountSchema_ID>DiscountType'],
      [{ M_PriceList_ID: PLNAME, Name: CUTOVER, ValidFrom: CUTOVER, 'M_DiscountSchema_ID>DiscountType': 'P', _odoo: { cutover: CUTOVER } }], 'cutover');
    patch('M_PriceList_Version', 'Name', CUTOVER, 'the cutover date — what the AD default @#Date@ gives a new version in the window', 1);
    patch('M_PriceList_Version', 'M_DiscountSchema_ID', 'M_DiscountSchema_ID>DiscountType = P', 'ImportPriceList.java:97-98 — the first price-list schema of the client', 1);
    sheet('M_ProductPrice', ['M_PriceList_Version_ID', 'M_Product_ID>Value', 'PriceList', 'PriceStd'],
      prods.map(function (p) { return { M_PriceList_Version_ID: CUTOVER, 'M_Product_ID>Value': pval(p), PriceList: p.list_price, PriceStd: p.list_price, _odoo: { model: 'product.product', id: p.id, field: 'list_price' } }; }), 'product.product []');

    // 14-15 warehouses + locators
    var locs = T('stock.location');
    var locKey = keys('M_Locator', 'Value', locs, function (l) { return l.complete_name; });
    var whById = {}; whs.forEach(function (w) { whById[w.id] = w; });
    sheet('M_Warehouse', ['Value', 'Name', 'C_Location_ID>C_Location_UU'], whs.map(function (w) { return { Value: w.code, Name: w.name, 'C_Location_ID>C_Location_UU': whAddr[w.id] || '',
      _odoo: { model: 'stock.warehouse', id: w.id, partner: m2o(w.partner_id) } }; }), 'stock.warehouse []');
    // X/Y/Z (aisle/bin/level) are unique per warehouse in legacy (index m_location_where, found by W-NINJA-MIGRATE); Odoo's posx/posy/posz are usually all 0. Where a warehouse
    //   repeats a triple, Z takes the Odoo location id (traceable, unique) — a named patch.
    var xyzSeen = {}, zPatched = 0;
    sheet('M_Locator', ['M_Warehouse_ID>Value', 'Value', 'X', 'Y', 'Z', 'IsActive'], locs.map(function (l) {
      var w = l.warehouse_id && whById[m2o(l.warehouse_id)] ? whById[m2o(l.warehouse_id)].code : '', key = w + '|' + l.posx + '|' + l.posy + '|' + l.posz, z = String(l.posz);
      if (xyzSeen[key]) { z = String(l.id); zPatched++; } xyzSeen[key] = 1;
      return { 'M_Warehouse_ID>Value': w, Value: locKey[l.id], X: String(l.posx), Y: String(l.posy), Z: z, IsActive: l.active ? 'Y' : 'N', _odoo: { model: 'stock.location', id: l.id, posz: l.posz, active: l.active } }; }), 'stock.location [["usage","=","internal"]] (archived too)');
    if (zPatched) patch('M_Locator', 'Z', 'the Odoo stock.location id', 'legacy unique index m_location_where (M_Warehouse_ID, X, Y, Z); Odoo repeats posx/posy/posz within the warehouse', zPatched);

    // 16-17 opening stock at cutover: one physical inventory per warehouse, one line per stock.quant
    var quants = T('stock.quant');
    var prodById = {}; prods.forEach(function (p) { prodById[p.id] = p; });
    var locById = {}; locs.forEach(function (l) { locById[l.id] = l; });
    function whOfQuant(q) { var l = locById[m2o(q.location_id)]; return l && l.warehouse_id ? whById[m2o(l.warehouse_id)] : null; }
    var invWh = whs.filter(function (w) { return quants.some(function (q) { var x = whOfQuant(q); return x && x.id === w.id; }); });
    function docNo(w) { return 'OPEN-' + w.code + '-' + CUTOVER; }
    sheet('M_Inventory', ['DocumentNo', 'M_Warehouse_ID>Value', 'MovementDate', 'C_DocType_ID>DocSubTypeInv', 'Description'],
      invWh.map(function (w) { return { DocumentNo: docNo(w), 'M_Warehouse_ID>Value': w.code, MovementDate: CUTOVER, 'C_DocType_ID>DocSubTypeInv': 'PI',
        Description: 'Opening stock from Odoo ' + DB + ' at ' + CUTOVER, _odoo: { model: 'stock.warehouse', id: w.id } }; }), 'stock.warehouse [] (with stock)');
    patch('M_Inventory', 'C_DocType_ID', 'C_DocType_ID>DocSubTypeInv = PI', 'MInventory.java:301-304 refuses none; MSetup.java:776 makes ONE Physical Inventory type (DocBaseType MMI, DocSubTypeInv PI) — MMI alone also matches Internal Use and Cost Adjustment', invWh.length);
    patch('M_Inventory', 'DocumentNo', 'OPEN-<warehouse>-<cutover>', 'the lines find their header by DocumentNo (Ninja MigrateExcelData Line rule); legacy would number it from the sequence', invWh.length);
    // ONE line per (locator, product): legacy's unique index m_inventoryline_productlocattr (M_Inventory_ID, M_Locator_ID, M_Product_ID, M_AttributeSetInstance_ID), found by
    //   W-NINJA-MIGRATE. Odoo splits a product's stock by lot; without the lot → attribute-set-instance step the lot quants are SUMMED (every quant id + lot kept in provenance).
    var qLines = [], qByKey = {};
    quants.forEach(function (q) { var l = locById[m2o(q.location_id)], p = prodById[m2o(q.product_id)], w = whOfQuant(q), key = m2o(q.location_id) + '|' + m2o(q.product_id);
      var e = qByKey[key];
      if (!e) { e = qByKey[key] = { M_Inventory_ID: w ? docNo(w) : '', 'M_Locator_ID>Value': l ? locKey[l.id] : '', 'M_Product_ID>Value': p ? pval(p) : '', QtyCount: 0,
        _odoo: { model: 'stock.quant', ids: [], lots: [], cost: p ? p.standard_price : null } }; qLines.push(e); }
      e.QtyCount = Math.round((e.QtyCount + q.quantity) * 1e6) / 1e6; e._odoo.ids.push(q.id); if (q.lot_id) e._odoo.lots.push(q.lot_id__name); });
    sheet('M_InventoryLine', ['M_Inventory_ID', 'M_Locator_ID>Value', 'M_Product_ID>Value', 'QtyCount'], qLines, 'stock.quant [["location_id.usage","=","internal"]]');
    var summed = qLines.filter(function (e) { return e._odoo.ids.length > 1; });
    if (summed.length) notes.push(summed.length + ' stock line(s) sum several Odoo quants of one product in one location (lots: ' + summed.map(function (e) { return e['M_Product_ID>Value'] + ' ×' + e._odoo.ids.length; }).join(', ') + ').');
    var lots = quants.filter(function (q) { return q.lot_id; }).length, neg = quants.filter(function (q) { return q.quantity < 0; });
    if (lots) notes.push(lots + ' stock line(s) carry an Odoo lot (in provenance.json): the lot → attribute set instance step is not in this set yet.');
    if (neg.length) notes.push(neg.length + ' stock line(s) are NEGATIVE in Odoo (' + neg.map(function (q) { return prodById[m2o(q.product_id)] ? pval(prodById[m2o(q.product_id)]) : q.id; }).join(', ') + '): exported as Odoo has them; the summary screen shows them.');

  // ── the open balances' sanity (the raw trial balance the agent also ships): its lines are every posted line up to the cut-over, and it sums to zero ──
  var tbRows = T('tb'), tbCount = M.sets.tb.count;
  var tbSum = tbRows.reduce(function (n, r) { return n + r.balance; }, 0), tbLines = tbRows.reduce(function (n, r) { return n + r.__count; }, 0);
  ok(tbLines === tbCount, 'every posted account.move.line up to the cut-over is in exactly one trial-balance row', tbLines + '==' + tbCount);
  if (Math.abs(tbSum) >= 0.005) notes.push('The trial balance at ' + CUTOVER + ' does not sum to zero (' + tbSum.toFixed(2) + '): the opening journal will be refused as unbalanced until that is explained.');

    // ── lengths + renamed keys (H3): text longer than the ERP column is cut as legacy PO.set_Value cuts it (PO.java:1079-1082); keys were already shortened consistently ──
    sheets.forEach(function (s) {
      s.header.forEach(function (h, hi) {
        var L = LEN[s.table + '.' + h]; if (!L) return; var cut = [];
        s.rows.forEach(function (r, ri) { if (typeof r[hi] === 'string' && r[hi].length > L) { cut.push(provenance[s.name][ri] && provenance[s.name][ri].id); r[hi] = r[hi].slice(0, L); } });
        if (cut.length) patch(s.table, h, 'cut to ' + L + ' characters', 'legacy PO.set_Value cuts a value longer than the column (PO.java:1079-1082); Odoo ids ' + cut.join(', '), cut.length);
      });
    });
    var byCol = {}; renamed.forEach(function (r) { (byCol[r.table + '.' + r.column] = byCol[r.table + '.' + r.column] || []).push(r); });
    Object.keys(byCol).forEach(function (k) { var rs = byCol[k], t = k.split('.');
      patch(t[0], t[1], '<code>-<odoo id> or <cut>~<odoo id>', 'the ERP needs one ' + t[1] + ' per company (unique index) and at most ' + (LEN[k] || '-') + ' characters; Odoo has ' +
        rs.map(function (r) { return JSON.stringify(r.odoo) + ' → ' + JSON.stringify(r.erp) + ' (' + r.why + ')'; }).join('; '), rs.length);
   });

    // ── self-check: every source row is in exactly one place, every lookup finds exactly one row of an earlier sheet ──
    var placed = bpRows.length + userRows.length + held.length;
    ok(placed === partners.length, 'every res.partner is a partner, a contact or held', placed + '==' + partners.length + ' (' + bpRows.length + ' partners, ' + userRows.length + ' contacts, ' + held.length + ' held)');
    ok(sheets.filter(function (s) { return s.table === 'M_Product'; })[0].rows.length === prods.length, 'every product.product is one M_Product row', prods.length);
    var qIn = qLines.reduce(function (n, e) { return n + e._odoo.ids.length; }, 0);
    ok(qIn === quants.length, 'every stock.quant is in exactly one M_InventoryLine row', qIn + '==' + quants.length + ' in ' + qLines.length + ' lines');
    var keyOf = { C_UOM: 'Name', C_PaymentTerm: 'Value', M_Product_Category: 'Value', C_BPartner: 'Value', C_Location: 'Address1', M_Product: 'Value',
      M_PriceList: 'Name', M_PriceList_Version: 'Name', M_Warehouse: 'Value', M_Locator: 'Value', M_Inventory: 'DocumentNo' };
    var bad = [];
    sheets.forEach(function (s, si) {
      s.header.forEach(function (h, hi) {
        var tgt = h.replace(/>.*$/, ''); if (!/_ID$/.test(tgt)) return;
        var t = tgt.replace(/_ID$/, '').replace(/_Parent$/, ''), alt = h.indexOf('>') > 0 ? h.split('>')[1] : (keyOf[t] || 'Name');
        var src = sheets.slice(0, si + 1).filter(function (x) { return x.table === t; })[0];
        if (!src) return;   // a tenant lookup (group, tax category, element, doc type, country, currency, schema): patch / reference data
        var ki = src.header.indexOf(alt);
        if (ki < 0) { bad.push(s.name + '.' + h + ': ' + t + ' has no column ' + alt + ' in its sheet'); return; }
        var vals = {}; src.rows.forEach(function (r) { var v = r[ki]; if (v !== '') vals[v] = (vals[v] || 0) + 1; });
        s.rows.forEach(function (r, ri) { var v = r[hi]; if (v === '' && /Parent/.test(h)) return;
          if (v === '' || vals[v] !== 1) bad.push(s.name + ' row ' + (ri + 2) + ' ' + h + '="' + v + '" matches ' + (vals[v] || 0) + ' row(s) of ' + src.name); });
      });
    });
    ok(bad.length === 0, 'every in-workbook lookup finds exactly one row of an earlier sheet', bad.length + ' bad' + (bad.length ? ': ' + bad.slice(0, 6).join(' | ') : ''));


  if (others.length) notes.push('This Odoo has ' + (others.length + 1) + ' companies; this export is ONLY ' + JSON.stringify(company[0].name) + '. Each company moves into its own ERP company — export the others with: ' + otherCmd.join(' | '));
  const book = sheets.map(function (s) { return { name: s.name, rows: [s.header].concat(s.rows) }; });
  var manifest = { tool: 'odoo_agent/export.js', format: 'ninja-workbook-v3', workbook: 'odoo_migration.xlsx', odoo_version: version, db: DB, cutover: CUTOVER, currency: iso,
    company: company.map(function (c) { return c.name; }), company_id: coId, other_companies: others.map(function (c) { return { id: c.id, name: c.name }; }), sheets: sheets.map(function (s) { return { sheet: s.name, table: s.table, rows: s.rows.length, header: s.header, source: s.source }; }),
    source_counts: counts, patches: patches, renamed: renamed, held: held, notes: notes, self_check_fails: fails };
  return { book: book, manifest: manifest, provenance: provenance };
}
