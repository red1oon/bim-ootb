// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — help_guid.js: what `#<typed>` means in the Viewer and Modeller help panels (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.6 step 6b, owner decision 2026-11-17).
//   The typed run is a case-sensitive PREFIX of the element's GlobalId (elements_meta.guid; IFC GlobalIds are case-sensitive base64), at least MIN characters; the list shows at most MAX hits.
//   Witness W-HQ-GUID (common/help/tests/witness_hq_guid.js). READ THE LOG after every run; an exit code is not evidence.
// PURE: no require, no DOM. It only builds the two SQL texts and shapes the answer; the app's adapter runs them over its own DB handle (the Viewer's A.dbQuery, the Modeller's OpenBuildingDb).
//   plan(typed)  -> {kind:'usage'} when fewer than MIN characters | {kind:'query', sql, countSql, params, max}
//   answer(rows, total) -> {hits:[{guid, cls, name}], total, more}    rows = [guid, ifc_class, element_name] arrays
// SQLite compares TEXT with `=` case-sensitively (BINARY collation) and `LIKE` case-insensitively, so the prefix test is substr(guid,1,n) = ?. Falsifier HQ_BREAK=caseless lower-cases both sides.
(function (root) {
  'use strict';
  var MIN = 4, MAX = 20;
  function brk() { return (typeof process !== 'undefined' && process.env && process.env.HQ_BREAK) || (root && root.__HQ_BREAK) || ''; }
  function plan(typed) {
    typed = String(typed == null ? '' : typed);
    if (Array.from(typed).length < MIN) return { kind: 'usage', min: MIN };
    var n = typed.length, cond = brk() === 'caseless' ? 'lower(substr(guid,1,' + n + ')) = lower(?)' : 'substr(guid,1,' + n + ') = ?';
    return { kind: 'query', min: MIN, max: MAX, params: [typed],
      sql: 'SELECT guid, ifc_class, element_name FROM elements_meta WHERE ' + cond + ' ORDER BY ifc_class, element_name, guid LIMIT ' + MAX,
      countSql: 'SELECT count(*) FROM elements_meta WHERE ' + cond };
  }
  function answer(rows, total) {
    var hits = (rows || []).map(function (r) { return { guid: r[0], cls: r[1] || '', name: r[2] || '' }; });
    total = Number(total); if (!(total >= hits.length)) total = hits.length;
    return { hits: hits, total: total, more: Math.max(0, total - hits.length) };
  }
  var api = { MIN: MIN, MAX: MAX, plan: plan, answer: answer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HelpGuid = api;
})(typeof window !== 'undefined' ? window : globalThis);
