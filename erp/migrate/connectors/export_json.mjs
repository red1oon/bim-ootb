// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — migrate/connectors/export_json.mjs: connector kind "export-json" — a file an agent ALREADY wrote on the user's own machine, read only (today: the SAP
//   Business One agent's sap_export.json, erp/sap_agent/agent.js). Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §ENGINE-D-SPEC — Witness: W-MIGRATE-ENGINE.
//   The protocol stays in the agent (the user's door, already witnessed by W-SAP-MIGRATE); moving its OData reading into an "odata" connector is a later, named step.
// Every connector answers the same few questions: rows(set) · scalar(path) · model (the fields per set the source said it has) · report() · notes/problems it found.
// Pure: no I/O. Browser + node.
const s = (v) => (v == null ? '' : String(v));

// cfg = the template's "connector" block: { kind: "export-json", format, notThisFile, reportAs }
export function exportJson(exp, cfg) {
  cfg = cfg || {};
  const X = (exp && exp.sets) || {}, M = (exp && exp.manifest) || {}, notes = [], problems = [];
  if (!exp || M.format !== cfg.format) problems.push(s(cfg.notThisFile) || ('This is not a file in the format ' + cfg.format + '.'));
  Object.keys(M.sets || {}).forEach((k) => { const ms = M.sets[k]; if (ms.missing_set) notes.push('Your server publishes no ' + k + ': that part is empty.');
    else if ((ms.fields_missing || []).length) notes.push(k + ': your server lacks ' + ms.fields_missing.join(', ') + ' — those columns are empty.'); });
  const model = {}; Object.keys(M.sets || {}).forEach((k) => { const ms = M.sets[k]; model[k] = (ms.fields_read || []).concat(ms.fields_missing || []); });
  return {
    kind: 'export-json', notes, problems, model, setsReportAs: cfg.reportAs || null,
    rows: (set) => X[set] || [],
    scalar: (path) => String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), exp),
    report: () => Object.keys(M.sets || {}).map((k) => ({ set: k, count: M.sets[k].count, rows: (X[k] || []).length, read: (M.sets[k].fields_read || []).length,
      missing: M.sets[k].fields_missing || (M.sets[k].missing_set ? ['(set)'] : []) }))
  };
}
