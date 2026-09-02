// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// erp_descriptor.js — THE DESCRIPTOR SEAM ("one renderer, N dictionaries"; docs/IDEMPIERE_2.md §pivot,
// docs/IDEMPIERE_RENDERER_SPEC.md §descriptor-seam). The recorded decision: "I1 calls ADParser directly;
// build the descriptor seam WHEN renderer #2 starts." Renderer #2 (Odoo) has started → this is that seam.
//
// WHY: idempiere.html (the chrome) reached into window.ADParser / window.ADData / window.IdmpSession at
// 24 call sites — hardcoded to the AD dictionary. To let a 2nd ERP model (Odoo, ERPNext) drive the SAME
// chrome with ZERO per-model chrome code, the chrome must consume an ABSTRACT descriptor, not AD directly.
//
// THE CONTRACT (a descriptor = three facets; AD is the first implementation, its facets ARE the existing
// AD parsers VERBATIM — non-invent, zero behavior change):
//   descriptor = {
//     id, label,
//     structure: {                                   // the dictionary / window structure (← ADParser)
//       init(db),                                     //   prime per-window caches; returns void
//       getMenuTree(db),                              //   → [menu nodes] (action/windowId/processId/children)
//       getWindow(db, windowId)                       //   → { id, name, tabs:[{ name, tableName, tabLevel,
//                                                      //       fields:[{columnName, referenceType, isKey, …}],
//                                                      //       whereClause, orderByClause, fk }] }
//     },
//     data: {                                        // the rows + reference labels (← ADData)
//       readRecords(db, tableName, where, orderBy),   //   → [row objects]
//       resolveFK(db, columnName, value)              //   → display label for an FK value (or the value)
//     },
//     session: {                                     // identity / login context (← IdmpSession)
//       listUsers(db), listClients(db),
//       usersForClient(db, clientId), rolesForUser(db, userId),
//       clientFor(db, roleId), orgsForRole(db, roleId),
//       buildContext(db, userId, {roleId, orgId}),    //   → { user, role, client, org, roles, orgs,
//                                                      //       winSet, procSet, formSet }
//       scopeMenu(roots, winSet, procSet, formSet),
//       deleteClient(db, clientId)
//     }
//   }
// A 2nd descriptor implements the SAME method signatures, mapping its own model onto these shapes — the
// chrome never changes. The shapes above ARE the interface (return-shape compatibility is the contract).
//
// USAGE: idempiere.html resolves `ErpDescriptor.active.{structure,data,session}` into its ADP/ADD/SES
// aliases, so every existing call site keeps working unchanged. `ErpDescriptor.use('<name>')` repoints
// the whole chrome at another descriptor (read a ?erp= param BEFORE the chrome caches the aliases).
(function (global) {
  'use strict';

  var _reg = {};            // name -> descriptor
  var _active = null;       // active descriptor name

  var ErpDescriptor = {
    // register a descriptor; the first one registered becomes active by default.
    register: function (name, impl) {
      if (!name || !impl) return null;
      _reg[name] = impl;
      if (_active == null) _active = name;
      return impl;
    },
    // switch the active descriptor (no-op if unknown). Returns the now-active descriptor.
    use: function (name) {
      if (_reg[name]) { _active = name; console.log('§ERP-DESCRIPTOR use active=' + name); }
      else console.warn('§ERP-DESCRIPTOR use UNKNOWN name=' + name + ' (kept active=' + _active + ')');
      return _reg[_active] || null;
    },
    list: function () { return Object.keys(_reg); },
    activeName: function () { return _active; },
    get: function (name) { return _reg[name] || null; }
  };
  // `active` as a live getter (re-resolves on every read — `use()` takes effect immediately).
  Object.defineProperty(ErpDescriptor, 'active', { get: function () { return _active ? _reg[_active] : null; }, enumerable: true });

  global.ErpDescriptor = ErpDescriptor;

  // ── AD = the FIRST descriptor (renderer #1's dictionary). NON-INVENT: each facet IS the already-loaded
  // AD parser object, VERBATIM — no wrapping, no behavior change. AD must be loaded before this module.
  if (global.ADParser && global.ADData && global.IdmpSession) {
    ErpDescriptor.register('ad', {
      id: 'ad', label: 'iDempiere (AD)',
      structure: global.ADParser,    // init / getMenuTree / getWindow
      data:      global.ADData,      // readRecords / resolveFK
      session:   global.IdmpSession  // listUsers / … / buildContext / scopeMenu / deleteClient
    });
    console.log('§ERP-DESCRIPTOR registered=ad active=' + ErpDescriptor.activeName() + ' facets=structure/data/session');
  } else {
    console.warn('§ERP-DESCRIPTOR ad-parsers-absent — load ad_parser.js + ad_data.js + idmp_session.js BEFORE erp_descriptor.js');
  }

  // headless witness export
  if (typeof module !== 'undefined' && module.exports) module.exports = ErpDescriptor;
})(typeof window !== 'undefined' ? window : this);
