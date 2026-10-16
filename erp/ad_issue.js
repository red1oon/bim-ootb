// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// ad_issue.js — AD_Issue from SELECTED §-lines (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-5). Pure: line in, intents out.
//   Legacy: MIssue.create(LogRecord) (org.adempiere.base/.../MIssue.java :64-95) writes a row for EVERY SEVERE record when
//   AD_System.IsAutoErrorReport='Y'; MIssue(LogRecord) :187-235 (summary, source, stack, Record_ID=1); INFOLENGTH :278-294 (2000,
//   "java.lang."/"java.sql." stripped). The twin keeps that row shape but, by user decision 2026-10-16 ("not spammy, small size,
//   selective, from WITNESS logging"), only for qualifying § lines, deduplicated per key, capped per client.
//   Witness: W-UDP5-ENGINE (erp/tests/witness_udp5_issue_engine.js).
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
(function (global) {
  'use strict';
  var CAP = 50, INFOLENGTH = 2000;
  var NEVER = /^§(W-|XCL-|CU-|UDP5-)|-VERDICT\b/;
  var WORD = /\b(error|errors|fail|failed|failure|abort|aborted)\b(?!\s*[=:]\s*0\b)/i;
  var CALM = /\bstatus=(ok|na|pass)\b|\bno\s+(\w+\s+){0,2}(error|errors|fail\w*|failure)\b/i;   // a status/negation line reports health, not a failure
  // qualify(text, level) -> { ok, tag, reason }. level = 'error' for console.error / onerror / unhandledrejection.
  function qualify(text, level) {
    var s = String(text == null ? '' : text), m = /^(§[A-Za-z0-9_-]+)/.exec(s);
    if (!m) return { ok: false, tag: null, reason: 'no §tag' };
    var tag = m[1];
    if (NEVER.test(s)) return { ok: false, tag: tag, reason: 'harness/self' };
    if (level === 'error') return { ok: true, tag: tag, reason: 'console.error' };
    if (WORD.test(s.slice(tag.length)) && !CALM.test(s.slice(tag.length))) return { ok: true, tag: tag, reason: 'error word' };
    return { ok: false, tag: tag, reason: 'no error word' };
  }
  function cut(v, n) { if (v == null) return null; var s = String(v); return s.length > n ? s.substring(0, n - 1) : s; }   // MIssue: substring(0, INFOLENGTH-1)
  function summary(s) { return cut(String(s == null || s === '' ? '??' : s).replace(/java\.lang\./g, '').replace(/java\.sql\./g, ''), INFOLENGTH); }
  // dedup key: §TAG + the summary with every digit run as '#'
  function key(tag, text) { return String(tag) + '|' + summary(text).replace(/[0-9]+/g, '#'); }
  // fields(c) — the AD_Issue row (MIssue(LogRecord) + init, twin values; UserName '-' = no PII)
  function fields(c) {
    return { issuesummary: summary(c.text), sourceclassname: cut(c.tag, 255), sourcemethodname: cut(c.method || '-', 255), loggername: 'erp',
      stacktrace: c.stack ? cut(c.stack, INFOLENGTH) : null, errortrace: c.stack ? cut(String(c.stack).split('\n').slice(0, 6).join('\n'), INFOLENGTH) : null,
      record_id: 1, ad_window_id: c.windowId != null ? Number(c.windowId) : null, releaseno: cut(c.release || '-', 10), version: cut(c.release || '-', 40),
      name: cut(c.systemName || '-', 60), username: '-', local_host: cut(c.host || '-', 120), systemstatus: 'E', processed: 'N', isactive: 'Y' };
  }
  // plan(rows, cand, seen, cap) -> intents. rows = the client's AD_Issue rows (seed + tip); cand = { tag, text, ... };
  //   seen = per-page-session map key -> count (mutated). First sighting: existing key -> touch, else create (+ delete the oldest beyond cap).
  function plan(rows, cand, seen, cap) {
    var k = key(cand.tag, cand.text); cap = cap == null ? CAP : Number(cap);
    if (seen[k]) { seen[k]++; return { key: k, dup: seen[k] - 1, intents: [] }; }
    seen[k] = 1;
    var hit = (rows || []).filter(function (r) { return key(r.sourceclassname, r.issuesummary) === k; })[0];
    if (hit) return { key: k, dup: 0, intents: [{ op: 'touch', id: hit.ad_issue_id }] };
    var out = [{ op: 'create', fields: fields(cand) }];
    var keep = (rows || []).slice().sort(function (a, b) { var x = String(a.updated || a.created || ''), y = String(b.updated || b.created || ''); return x < y ? 1 : x > y ? -1 : 0; });
    keep.slice(Math.max(0, cap - 1)).forEach(function (r) { out.push({ op: 'delete', id: r.ad_issue_id }); });
    return { key: k, dup: 0, intents: out };
  }
  var API = { CAP: CAP, qualify: qualify, key: key, fields: fields, plan: plan, summary: summary };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.AdIssue = API;
  else if (global) global.AdIssue = API;
})(this);
