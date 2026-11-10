// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — migrate/workbook.mjs: the TARGET contract every migration source writes — the 17-sheet Ninja workbook (HEADERS / ORDER), the iDempiere column lengths (LEN),
//   the address key (uuid5), the length rules + sheet order (finishBook) and the alpha-report masking. Moved here VERBATIM from plugins/bc_migrate_convert.mjs (2026-11-10,
//   bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §ENGINE-D-SPEC) so the engine and every converter read ONE copy; bc_migrate_convert.mjs re-exports it. Witness: W-MIGRATE-ENGINE.
// Pure: no I/O, no clock, no random. Browser + node.
export const LEN = { 'AD_User.EMail': 60, 'AD_User.Name': 60, 'AD_User.Phone': 40, 'C_BPartner_Location.Name': 60, 'C_BPartner.Name': 120, 'C_BPartner.TaxID': 20, 'C_BPartner.Value': 40,
  'C_ElementValue.Name': 120, 'C_ElementValue.Value': 40, 'C_Location.Address1': 60, 'C_Location.Address2': 60, 'C_Location.City': 60, 'C_Location.Postal': 10, 'C_Location.RegionName': 40,
  'C_PaymentTerm.Name': 60, 'C_PaymentTerm.Value': 40, 'C_UOM.Name': 60, 'C_UOM.UOMSymbol': 10, 'M_Inventory.Description': 255, 'M_Inventory.DocumentNo': 30, 'M_Locator.Value': 40,
  'M_PriceList.Name': 60, 'M_PriceList_Version.Name': 60, 'M_Product_Category.Name': 60, 'M_Product_Category.Value': 40, 'M_Product.Name': 255, 'M_Product.UPC': 30,
  'M_Product.Value': 510, 'M_Product_PO.VendorProductNo': 40, 'M_Warehouse.Name': 60, 'M_Warehouse.Value': 40 };   // AD_Column.FieldLength, iDempiere 13 pilot (same table as export.js)

export const HEADERS = {
  C_UOM: ['Name', 'UOMSymbol', 'StdPrecision', 'X12DE355'], C_PaymentTerm: ['Value', 'Name', 'NetDays'], M_Product_Category: ['Value', 'Name', 'M_Product_Category_Parent_ID>Value'],
  C_ElementValue: ['Value', 'Name', 'AccountType', 'AccountSign', 'IsSummary', 'C_Element_ID>ElementType'],
  C_BPartner: ['Value', 'Name', 'TaxID', 'IsCustomer', 'IsVendor', 'C_BP_Group_ID>IsDefault', 'IsActive'],
  C_Location: ['Address1', 'Address2', 'City', 'Postal', 'RegionName', 'C_Country_ID>CountryCode', 'C_Location_UU'], C_BPartner_Location: ['C_BPartner_ID>Value', 'C_Location_ID>C_Location_UU', 'Name'],
  AD_User: ['Name', 'EMail', 'Phone', 'Phone2', 'C_BPartner_ID>Value', 'IsActive'],
  M_Product: ['Value', 'Name', 'Description', 'M_Product_Category_ID>Value', 'M_Product_Category_ID>IsDefault', 'C_UOM_ID', 'C_UOM_ID>IsDefault', 'ProductType', 'UPC', 'Weight', 'Volume', 'C_TaxCategory_ID>IsDefault', 'IsActive'],
  M_Product_PO: ['M_Product_ID>Value', 'C_BPartner_ID>Value', 'PricePO', 'VendorProductNo', 'Order_Min', 'DeliveryTime_Promised'], M_PriceList: ['Name', 'IsSOPriceList', 'C_Currency_ID>ISO_Code'],
  M_PriceList_Version: ['M_PriceList_ID', 'Name', 'ValidFrom', 'M_DiscountSchema_ID>DiscountType'], M_ProductPrice: ['M_PriceList_Version_ID', 'M_Product_ID>Value', 'PriceList', 'PriceStd'],
  M_Warehouse: ['Value', 'Name', 'C_Location_ID>C_Location_UU'], M_Locator: ['M_Warehouse_ID>Value', 'Value', 'X', 'Y', 'Z', 'IsActive'],
  M_Inventory: ['DocumentNo', 'M_Warehouse_ID>Value', 'MovementDate', 'C_DocType_ID>DocSubTypeInv', 'Description'], M_InventoryLine: ['M_Inventory_ID', 'M_Locator_ID>Value', 'M_Product_ID>Value', 'QtyCount'] };
export const ORDER = Object.keys(HEADERS);

// §E3C-SPEC (b) — the OPEN-BALANCE sheets (and, §E3D-SPEC, the bank sheets that go with them) of the cut-over method (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §B3-SCOUT, §ENGINE-SPEC §3): legacy IMPORT tables, loaded as rows and
//   then turned into documents by the legacy import processes (ImportGLJournal 220 -> Complete; ImportInvoice 207 DocAction CO). OPTIONAL: the engine emits one, numbered after the
//   17 masters, only when a template has an entity for it - a source without open balances keeps its 17-sheet book byte for byte. Columns = AD_Column names of the I_ table.
export const OPEN_HEADERS = {
  I_GLJournal: ['BatchDocumentNo', 'BatchDescription', 'JournalDocumentNo', 'DocTypeName', 'CategoryName', 'PostingType', 'DateAcct', 'ISO_Code', 'AccountValue', 'AmtSourceDr', 'AmtSourceCr', 'Description', 'I_IsImported'],
  I_Invoice: ['DocumentNo', 'DocTypeName', 'IsSOTrx', 'BPartnerValue', 'DateInvoiced', 'DateAcct', 'ISO_Code', 'PaymentTermValue', 'ChargeName', 'QtyOrdered', 'PriceActual', 'TaxIndicator', 'Description', 'I_IsImported'],
  // §E3D-SPEC: the BANK. C_Bank / C_BankAccount are two optional MASTER sheets (rows of the tables themselves; AD_Column names, the lookup C_Bank_ID>Name is the dictionary's own identifier), listed here - after
  //   the two documents, so I_GLJournal / I_Invoice keep their sheet numbers - and BEFORE I_BankStatement, which the Ninja loader walks last: the statement row names its account by number (BankAccountNo, the
  //   AccountNo of a C_BankAccount row) and its charge by name (C_Charge_ID>Name, made by the open-balances prerequisites step). Mandatory per the dictionary: C_Bank Name + RoutingNo (IsOwnBank = Y is the dictionary default; the twin does not apply a dictionary default, and ImportBankStatement finds an account only on an OWN bank, :106); C_BankAccount Value +
  //   Name + AccountNo + BankAccountType + C_Currency_ID + C_Bank_ID (CurrentBalance / CreditLimit / IsDefault come from the legacy defaults, MBankAccount.java:120). A source with no bank keeps its book byte for byte.
  C_Bank: ['Name', 'RoutingNo', 'SwiftCode', 'IsOwnBank'], C_BankAccount: ['Value', 'Name', 'C_Bank_ID>Name', 'AccountNo', 'BankAccountType', 'C_Currency_ID>ISO_Code'],
  I_BankStatement: ['Name', 'BankAccountNo', 'RoutingNo', 'StatementDate', 'StatementLineDate', 'StmtAmt', 'ChargeAmt', 'C_Charge_ID>Name', 'LineDescription', 'I_IsImported'] };
export const OPEN_ORDER = Object.keys(OPEN_HEADERS);

// ── SHA-1 (sync; crypto.subtle is async and the form engine's rows() is not) for UUID v5 ──
function sha1(bytes) {
  const H = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0], l = bytes.length, n = ((l + 8) >> 6) + 1, w = new Uint32Array(n * 16);
  for (let i = 0; i < l; i++) w[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  w[l >> 2] |= 0x80 << (24 - (l % 4) * 8); w[n * 16 - 1] = l * 8;
  const W = new Uint32Array(80);
  for (let b = 0; b < n; b++) {
    for (let t = 0; t < 16; t++) W[t] = w[b * 16 + t];
    for (let t = 16; t < 80; t++) { const x = W[t - 3] ^ W[t - 8] ^ W[t - 14] ^ W[t - 16]; W[t] = (x << 1) | (x >>> 31); }
    let [a, bb, c, d, e] = H;
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? (bb & c) | (~bb & d) : t < 40 ? bb ^ c ^ d : t < 60 ? (bb & c) | (bb & d) | (c & d) : bb ^ c ^ d, k = t < 20 ? 0x5A827999 : t < 40 ? 0x6ED9EBA1 : t < 60 ? 0x8F1BBCDC : 0xCA62C1D6;
      const tmp = (((a << 5) | (a >>> 27)) + f + e + k + W[t]) >>> 0; e = d; d = c; c = (bb << 30) | (bb >>> 2); bb = a; a = tmp;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + bb) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0; H[4] = (H[4] + e) >>> 0;
  }
  const out = new Uint8Array(20); H.forEach((h, i) => { out[i * 4] = h >>> 24; out[i * 4 + 1] = (h >>> 16) & 255; out[i * 4 + 2] = (h >>> 8) & 255; out[i * 4 + 3] = h & 255; }); return out;
}
const UU_NS = 'b1d0f5e2-0d00-5c1a-9a51-6f646f6f6d69';   // the same namespace export.js uses for C_Location_UU
export function uuid5(name) {
  const ns = UU_NS.replace(/-/g, '').match(/../g).map((h) => parseInt(h, 16)), nm = Array.from(new TextEncoder().encode(String(name))), h = sha1(Uint8Array.from(ns.concat(nm)));
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80; const x = Array.from(h.slice(0, 16)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
}

// finishBook(sheets, patch, renamed) -> book: the length rules (keys over the ERP length cut keeping "~<n>", pointers to them follow; other text cut as legacy
//   PO.set_Value cuts it, PO.java:1079-1082), then the 17 sheets in ORDER. Shared by every source converter (Business Central, SAP Business One) — one implementation.
export function finishBook(sheets, patch, renamed, srcKey = 'bc') {
  const KEYS = { C_BPartner: 'Value', M_Product: 'Value', M_Product_Category: 'Value', M_Locator: 'Value', M_Warehouse: 'Value', C_PaymentTerm: 'Value', C_ElementValue: 'Value' }, cutMap = {};
  Object.keys(KEYS).forEach((t) => { const col = KEYS[t], L = LEN[t + '.' + col]; if (!L) return; let n = 0;
    sheets[t].forEach((r) => { const v = String(r[col]); if (v.length > L) { const v2 = v.slice(0, L - String(++n).length - 1) + '~' + n; cutMap[t + '|' + v] = v2; renamed.push({ table: t, column: col, [srcKey]: v, erp: v2, why: 'longer than ' + L }); r[col] = v2; } }); });
  const ptr = { 'C_BPartner_ID>Value': 'C_BPartner', 'M_Product_ID>Value': 'M_Product', 'M_Product_Category_ID>Value': 'M_Product_Category', 'M_Product_Category_Parent_ID>Value': 'M_Product_Category', 'M_Locator_ID>Value': 'M_Locator', 'M_Warehouse_ID>Value': 'M_Warehouse' };
  ORDER.forEach((t) => sheets[t].forEach((r) => Object.keys(ptr).forEach((h) => { if (r[h] !== undefined && cutMap[ptr[h] + '|' + r[h]]) r[h] = cutMap[ptr[h] + '|' + r[h]]; })));
  ORDER.forEach((t) => HEADERS[t].forEach((h) => { const L = LEN[t + '.' + h]; if (!L || KEYS[t] === h) return; let n = 0; sheets[t].forEach((r) => { if (typeof r[h] === 'string' && r[h].length > L) { r[h] = r[h].slice(0, L); n++; } });
    if (n) patch(t, h, 'cut to ' + L + ' characters', 'legacy PO.set_Value cuts a value longer than the column (PO.java:1079-1082)', n); }));

  return ORDER.map((t, i) => ({ name: String(i + 1).padStart(2, '0') + t, rows: [HEADERS[t]].concat(sheets[t].map((r) => HEADERS[t].map((h) => (r[h] == null ? '' : String(r[h]))))) }));
}

export function mask(s) { return String(s).replace(/"[^"]*"/g, '"…"').replace(/'[^']*'/g, "'…'"); }
