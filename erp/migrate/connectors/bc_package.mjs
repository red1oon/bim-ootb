// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — migrate/connectors/bc_package.mjs: connector kind "bc-package" — a Dynamics 365 Business Central configuration package (BC's own "Export to Excel", the
//   user's own door, read only) + the BC model pinned from Microsoft's published source (plugins/bc_model.mjs). readPackage + enumName moved here VERBATIM from
//   plugins/bc_migrate_convert.mjs (2026-11-10, bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §ENGINE-D-SPEC — Witness: W-MIGRATE-ENGINE, W-BC-MIGRATE): HOW rows are read is the
//   connector's one job. THE FILE (ConfigExcelExchange.Codeunit.al): one sheet per table; row 1 = A package code, B table caption, C TABLE ID (:662-684); row 3 = field captions
//   (or field names, :592); data from row 4 (:450); Option/Enum = the caption in the user's language (ConfigXMLExchange.FormatFieldValue :1900-1938).
// Pure: no I/O. Browser + node.
// ── reading the package (cells as text) ──
function colA1(c) { let s = ''; c++; while (c > 0) { const r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = Math.floor((c - 1) / 26); } return s; }
function cellText(sh, a1) { const c = sh[a1]; if (c == null || c.v == null) return ''; if (c.t === 'b') return c.v ? 'true' : 'false'; return String(c.t === 'n' ? c.v : (c.w != null ? c.w : c.v)); }
function rangeCols(sh) { const m = /^[A-Z]+\d+:([A-Z]+)(\d+)$/.exec(String(sh['!ref'] || '')); if (!m) return { c1: 0, r1: 0 }; let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return { c1: c - 1, r1: Number(m[2]) }; }
// readPackage(wb, model) -> { code, tables: { id: { caption, sheet, fields: [{h, field}], rows: [{<field name>: text}] } }, skipped: [sheet names], unknown: [{table, header}] }
export function readPackage(wb, model) {
  const out = { code: '', tables: {}, skipped: [], unknown: [] };
  (wb.SheetNames || []).forEach((name) => {
    const sh = wb.Sheets[name], id = Number(cellText(sh, 'C1')), code = cellText(sh, 'A1');
    if (!(id > 0) || !model.tables[id]) { out.skipped.push({ sheet: name, tableId: cellText(sh, 'C1'), why: !(id > 0) ? 'no table id in C1' : 'table ' + id + ' is not one this migration reads' }); return; }
    out.code = out.code || code;
    const t = model.tables[id], { c1, r1 } = rangeCols(sh), heads = [];
    for (let c = 0; c <= c1; c++) {
      const h = cellText(sh, colA1(c) + '3'); if (h === '') continue;
      const f = t.fields.find((x) => x.caption === h) || t.fields.find((x) => x.name === h) || t.fields.find((x) => x.caption.toLowerCase() === h.toLowerCase() || x.name.toLowerCase() === h.toLowerCase());
      if (f) heads.push({ c, h, field: f }); else out.unknown.push({ table: id, header: h });
    }
    const rows = [];
    for (let r = 4; r <= r1; r++) { const o = {}; let any = false; heads.forEach((hd) => { const v = cellText(sh, colA1(hd.c) + r); if (v !== '') { o[hd.field.name] = v; any = true; } }); if (any) rows.push(o); }
    out.tables[id] = { caption: t.caption, sheet: name, fields: heads.map((hd) => ({ h: hd.h, field: hd.field.name })), rows };
  });
  return out;
}

// an enum/option cell holds the CAPTION (user language): its value NAME from the model (by caption, then by name), else the text as it is (named by the caller)
export function enumName(model, tableId, field, v) {
  const f = model.tables[tableId].fields.find((x) => x.name === field); if (!f || v == null) return v;
  const vals = f.enumValues || (f.options || []).map((n, i) => ({ name: n, caption: (f.optionCaptions || [])[i] || n }));
  const hit = vals.find((x) => x.caption === v) || vals.find((x) => x.name === v); return hit ? hit.name : v;
}



// bcPackage(pkg, model, cfg) -> the connector the engine reads: rows(table id) · hasSet · scalar · enumName · caption · model (field names per table) · report()
export function bcPackage(pkg, model, cfg) {
  cfg = cfg || {};
  const fields = {}; Object.keys(model.tables).forEach((id) => { fields[id] = model.tables[id].fields.map((f) => f.name); });
  const S = { code: pkg.code, unknown: pkg.unknown, skipped: pkg.skipped, model: { source: model.source, commit: model.commit } };
  return {
    kind: 'bc-package', notes: [], problems: [], model: fields, setsReportAs: cfg.reportAs || null,
    rows: (id) => (pkg.tables[id] ? pkg.tables[id].rows : []),
    hasSet: (id) => !!pkg.tables[id],
    scalar: (path) => String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), S),
    enumName: (id, field, v) => enumName(model, Number(id), field, v),
    caption: (id) => model.tables[id].caption,
    report: () => Object.keys(pkg.tables).map((id) => ({ id: Number(id), caption: pkg.tables[id].caption, sheet: pkg.tables[id].sheet, rows: pkg.tables[id].rows.length, headers: pkg.tables[id].fields.length }))
  };
}
