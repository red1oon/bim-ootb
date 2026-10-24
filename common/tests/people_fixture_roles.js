// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// TEST FIXTURE (labelled as such): the GardenWorld seed has no Sales / Warehouse / Accounts clerk roles, only Admin (102) and User (103). The role-scope witnesses
// (TEAMWORK_FRAMEWORK §13.12.G.1) need three roles whose window sets follow the document flow, so this clones role 102's org access into three NEW roles (client 11,
// ' CO', all orgs) and grants each its windows from the REAL seed: 143 Sales Order | 169 Shipment (Customer) | 167 Sales Invoice + 195 Payment and Receipt.
// Nothing here is shipped: only the witnesses run it, against an in-memory copy of the dictionary.
(function (g) {
  var ROLES = [[9001, 'Sales Clerk (fixture)', [143]], [9002, 'Warehouse Clerk (fixture)', [169]], [9003, 'Accounts Clerk (fixture)', [167, 195]]];
  function statements() {
    var out = [];
    ROLES.forEach(function (r) {
      out.push("CREATE TEMP TABLE _fx AS SELECT * FROM ad_role WHERE ad_role_id=102");
      out.push("UPDATE _fx SET ad_role_id=" + r[0] + ", name='" + r[1] + "', ad_role_uu='fixture-role-" + r[0] + "'");
      out.push("INSERT INTO ad_role SELECT * FROM _fx");
      out.push("DROP TABLE _fx");
      out.push("INSERT INTO ad_role_orgaccess (ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadonly) SELECT " + r[0] + ", ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadonly FROM ad_role_orgaccess WHERE ad_role_id=102");
      r[2].forEach(function (w) { out.push("INSERT INTO ad_window_access (ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite) VALUES (" + w + "," + r[0] + ",11,0,'Y','2026-01-01',0,'2026-01-01',0,'Y')"); });
    });
    return out;
  }
  var API = { ROLES: ROLES, statements: statements, WINDOWS: { sales: 143, warehouse: 169, invoice: 167, payment: 195 } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else g.PeopleFixtureRoles = API;
})(typeof window !== 'undefined' ? window : globalThis);
