// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ninja_create.js — Phase D controller: the "Create" (author / PackOut) flow of the Plugin Engine pill.
//
// Implementing NINJA_MODE_LANE.md §Phase D. The pill has TWO faces (the user's PackOut/PackIn framing):
//   • Install (consume) — paste a `.foldbundle` URL → install. (the existing plugin_overlay.js flow)
//   • Create  (author)  — drop a sheet → PREVIEW the derived models → Emit & Install. (THIS module)
//
// Pure controller, DOM-free, so it is witnessable headless (poc_ninja_pill.js) and reusable by the pill.
// It chains the lane's own modules: ninja_excel (sheet read) → ninja_model (parse) → ninja_bundle (emit) →
// PluginRegistry (install/start, whose host.db must be the WRITABLE sql.js AD handle — see makeWritableDbHost).
//
// EXTRACT-DON'T-INVENT: the preview is exactly what stageModels will write — refType labels come from
// ninja_model.REF_TYPE, table/column names straight from the sheet. Nothing fabricated for display.

(function (global) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var NinjaModel  = isNode ? require('./ninja_model.js')  : global.NinjaModel;
  var NinjaBundle = isNode ? require('./ninja_bundle.js') : global.NinjaBundle;

  // ── workbookToRows(wb, XLSX, sheetName) → array-of-arrays for the named sheet ──────────────────────
  function workbookToRows(wb, XLSX, sheetName) {
    var ws = wb.Sheets[sheetName];
    if (!ws) return null;
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  }

  // Pick the model sheet: prefer 2_RO_ModelMaker (row format), else ModelMakerSource (columnar).
  function pickModelSheet(wb) {
    var names = wb.SheetNames || Object.keys(wb.Sheets || {});
    if (names.indexOf('2_RO_ModelMaker') !== -1) return { name: '2_RO_ModelMaker', format: 'romo' };
    if (names.indexOf('ModelMakerSource') !== -1) return { name: 'ModelMakerSource', format: 'columnar' };
    // fall back to the first sheet whose name looks like a model sheet
    for (var i = 0; i < names.length; i++) {
      if (/modelmaker|model/i.test(names[i])) return { name: names[i], format: 'romo' };
    }
    return null;
  }

  // ── previewSheet(wb, XLSX, opts) → { model, preview, warnings, error } ─────────────────────────────
  // preview: [{ table, master, workflow, kanban, columns:[{name, refType, isStandard}] }] — what Emit will stage.
  function previewSheet(wb, XLSX, opts) {
    opts = opts || {};
    if (!wb || !wb.Sheets) return { error: 'not a workbook' };
    var pick = opts.format ? { name: opts.sheet, format: opts.format } : pickModelSheet(wb);
    if (!pick || !pick.name) return { error: 'no model sheet (need 2_RO_ModelMaker or ModelMakerSource)' };

    var rows = workbookToRows(wb, XLSX, pick.name);
    if (!rows || !rows.length) return { error: 'model sheet "' + pick.name + '" is empty' };

    // Bundle name from 1_RO_ModelHeader if present
    var bundleName = opts.bundleName || '';
    if (!bundleName && wb.Sheets['1_RO_ModelHeader']) {
      var hr = workbookToRows(wb, XLSX, '1_RO_ModelHeader');
      if (hr && hr[1] && hr[1][0]) bundleName = String(hr[1][0]).trim();
    }

    var model = NinjaModel.parseSheet(rows, { format: pick.format, bundleName: bundleName });

    var preview = (model.tables || []).map(function (t) {
      return {
        table: t.name,
        master: t.master || null,
        workflow: !!t.workflow,
        kanban: !!t.kanban,
        columns: t.columns.map(function (c) {
          return { name: c.name, refType: NinjaModel.refType(c.refId), refId: c.refId, isStandard: !!c.isStandard };
        })
      };
    });

    return { model: model, preview: preview, warnings: model.warnings || [], sheet: pick.name, format: pick.format };
  }

  // ── emitAndInstall(reg, model, opts) → Promise<{ id, state, tables }> ──────────────────────────────
  // reg MUST be a PluginRegistry bound to a host whose db is the WRITABLE sql.js AD handle (so the bundle's
  // activate → stageModels can write). The caller builds that registry (the pill / the witness).
  function emitAndInstall(reg, model, opts) {
    opts = opts || {};
    var bundle = NinjaBundle.emitBundle(model);
    var id = bundle.manifest.id;

    // Idempotent re-emit: if already installed, uninstall first (re-Create overwrites).
    var pre = Promise.resolve();
    if (reg.get && reg.get(id)) pre = Promise.resolve(reg.uninstallBundle(id));

    return pre
      .then(function () { return reg.installBundle(bundle); })
      .then(function (ins) { return reg.startBundle(ins.id); })
      .then(function (st) {
        return { id: id, state: st.state, tables: (model.tables || []).length };
      });
  }

  var API = {
    workbookToRows: workbookToRows,
    pickModelSheet: pickModelSheet,
    previewSheet: previewSheet,
    emitAndInstall: emitAndInstall
  };

  if (isNode) module.exports = API;
  else global.NinjaCreate = API;

})(typeof self !== 'undefined' ? self : this);
