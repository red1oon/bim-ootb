// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — migrate/connectors/tenant_rows.mjs: connector kind "tenant-rows" — the rows of ONE legacy iDempiere tenant as a recorded fixture (tests/record_idempiere_tenant.js:
//   { source:{db,client,recorded}, tables:{ <table>:{ columns, count, rows } } }). Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §IDEMPIERE-FALSIFIER-SPEC — Witness:
//   W-IDEMPIERE-FALSIFIER (§IDF). TEST SIDE for now: not precached, not shipped. rows(table) returns ALL recorded rows of that table (the tenant's and the System rows its rows point at,
//   which `find` needs); the identity template keeps the tenant's own by `ad_client_id == @client`.
// Same questions as every connector: rows(set) · scalar(path) · model (columns per table) · report() · meta(set) · notes/problems. Pure: no I/O. Browser + node.
export function tenantRows(fx) {
  const T = (fx && fx.tables) || {}, S = (fx && fx.source) || {}, notes = [], problems = [];
  if (!fx || !fx.tables) problems.push('This is not a tenant-rows fixture (no "tables").');
  const model = {}; Object.keys(T).forEach((k) => { model[k] = (T[k].columns || []).slice(); });
  return {
    kind: 'tenant-rows', notes, problems, model, setsReportAs: null,
    rows: (table) => (T[table] && T[table].rows) || [],
    hasSet: (table) => !!T[table],
    meta: (table) => (T[table] ? { count: T[table].count, columns: T[table].columns } : undefined),
    scalar: (path) => (path === 'client' ? String(S.client) : String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), fx)),
    report: () => Object.keys(T).sort().map((k) => ({ set: k, count: T[k].count, rows: (T[k].rows || []).length }))
  };
}
