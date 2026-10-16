// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// overlay/quick_input.js — QUICK SETUP derivation (pure). Moved OUT of core genesis.js (prompts/ERP_DEPTH_FILM.md §EXTENSION-LAYER LAW): the overlay never edits core; it FILLS the legacy-identical
// Initial Client Setup form (see quicksetup_ui.js) and the core wizard's own handler runs unchanged.
(function (global) {
  'use strict';
  // §QUICKSETUP (bim-compiler prompts/ERP_DEPTH_FILM.md §QUICKSETUP — Witness: W-QUICKSETUP-EQUALS-WIZARD). OPTIONAL path beside the legacy-identical wizard: the user types only the company name
  // and the country; every other InitialClientSetup answer (process 53161) is DERIVED from the dictionary, never invented, and ASKED when the dictionary has none:
  //   currency  = C_Country.C_Currency_ID of the chosen country (must be an active C_Currency; ~18 countries carry none => ask 'currency'),
  //   adminUser = AD_Process_Para(53161, AdminUserName).DefaultValue ('clientAdmin'),   chart = the iDempiere default (UseDefaultCoA),   year = the date's year (MYear.java:110-115).
  // PURE: ctx = { countries:{id:{currencyId}}, currencies:{id:{iso,prec,active}}, processDefaults:{AdminUserName} } read by the host from the dictionary. Returns the SAME input shape birthTenant takes.
  function quickInput(ctx, ans) {
    ctx = ctx || {}; ans = ans || {};
    var ask = [], name = String(ans.clientName == null ? '' : ans.clientName).trim(), cid = ans.countryId != null ? Number(ans.countryId) : null;
    if (!name) ask.push('clientName');
    var ctry = cid != null && ctx.countries ? ctx.countries[cid] : null;
    if (!ctry) ask.push('countryId');
    var cur = ctry && ctry.currencyId != null && ctx.currencies ? ctx.currencies[ctry.currencyId] : null;
    if (ctry && !(cur && cur.active)) ask.push('currency');
    var admin = ctx.processDefaults && ctx.processDefaults.AdminUserName;
    if (!admin) ask.push('adminUser');
    if (ask.length) return { ok: false, ask: ask, input: null, typed: ['clientName', 'countryId'], source: null };
    return { ok: true, ask: [], typed: ['clientName', 'countryId'],
      input: { clientName: name, currencyId: ctry.currencyId, currencyIso: cur.iso, currencyPrecision: cur.prec, adminUser: admin, dateAcct: ans.dateAcct, countryId: cid },
      source: { currency: 'C_Country.C_Currency_ID', adminUser: 'AD_Process_Para 53161 AdminUserName DefaultValue', chart: 'default (UseDefaultCoA)', year: 'dateAcct' } };
  }
  var api = { quickInput: quickInput };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.OverlayQuickInput = api;
})(typeof window !== 'undefined' ? window : this);
