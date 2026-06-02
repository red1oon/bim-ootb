// user_names.js — LENS lane-3 worker `user:0-names`.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// DO NOT REMOVE — Scope guard
// SPEC (spec-first): fold AD_User display names into the chat sender — kill the `user:0`
//   placeholder rendered by the chat thread (build/erp/poc_chat.log §CHAT-THREAD: senders
//   render as `user:0` = createdby=0/System sentinel in seed).
//
// CONTRACT (the seam the chat chrome — F1 — integrates BY KEY, never by co-edit):
//   window.UserNames.resolveSender(userId, adUserRows) -> { id, name, resolved, source }
//     userId      : the AD_User_ID carried by the op (createdby / user_tag's numeric part).
//     adUserRows  : the REAL AD_User rows read (read-only) from ad_seed.db, each an object
//                   keyed by AD column name (AD_User_ID, Name, ...) as ADData.readRecords yields.
//     returns a DISPLAY NAME folded from the matching real AD_User row; when no row exists
//     (e.g. AD_User_ID=0 has NO row in this seed) it degrades to an HONEST labelled fallback:
//       id 0          -> "System (AD_User#0)"   (id 0 = iDempiere System/SuperUser sentinel)
//       any other id  -> "AD_User#<id>"
//     NEVER invents a name. resolved=true ONLY when a real row supplied the name.
//   window.UserNames.buildMap(adUserRows) -> { <id>: name } map (real rows only) — convenience.
//   window.UserNames.resolveTag(userTag, adUserRows) — parse a chat `user:<id>` tag then resolve.
//
// NON-INVENT: every returned `name` with resolved=true traces to a real AD_User.Name cell.
//   The fallback labels are explicitly NOT names — they advertise the missing row by AD id.
//
// KEY by AD ids only. Do NOT define nav/dispatch exposed-globals here (STEP-0 host-lane job).
(function () {
  'use strict';

  // System/SuperUser sentinel id in iDempiere: AD_User_ID = 0.
  var SYSTEM_ID = 0;

  function _num(v) { var n = Number(v); return (isNaN(n) ? null : n); }

  // Read AD_User_ID off a row regardless of column-name casing variants.
  function _rowId(row) {
    if (!row) return null;
    if (row.AD_User_ID != null) return _num(row.AD_User_ID);
    if (row.ad_user_id != null) return _num(row.ad_user_id);
    return null;
  }
  // Read the display Name cell off a row (case-tolerant); empty/whitespace => null.
  function _rowName(row) {
    if (!row) return null;
    var n = (row.Name != null) ? row.Name : (row.name != null ? row.name : null);
    if (n == null) return null;
    n = String(n).trim();
    return n.length ? n : null;
  }

  // Build { <numericId>: displayName } from REAL AD_User rows only (no fabricated entries).
  function buildMap(adUserRows) {
    var map = {};
    (adUserRows || []).forEach(function (row) {
      var id = _rowId(row);
      var name = _rowName(row);
      if (id != null && name != null) map[id] = name;
    });
    return map;
  }

  // Honest fallback label for an id with no real AD_User row — NOT a name, an advertised gap.
  function _fallback(id) {
    return (id === SYSTEM_ID) ? 'System (AD_User#0)' : 'AD_User#' + id;
  }

  // Resolve one sender id to a display name folded from the real AD_User rows.
  // Returns { id, name, resolved, source }. resolved=true ONLY when a real row supplied the name.
  function resolveSender(userId, adUserRows) {
    var id = _num(userId);
    if (id == null) {
      return { id: userId, name: 'AD_User#' + String(userId), resolved: false, source: 'fallback' };
    }
    var map = buildMap(adUserRows);
    var name = map[id];
    if (name != null) {
      return { id: id, name: name, resolved: true, source: 'ad_seed.AD_User' };
    }
    return { id: id, name: _fallback(id), resolved: false, source: 'fallback' };
  }

  // Parse a chat sender tag (`user:<id>` per scripts/poc_chat.js) then resolve it.
  function resolveTag(userTag, adUserRows) {
    var id = null;
    if (typeof userTag === 'string') {
      var m = /(?:^|:)(\d+)\s*$/.exec(userTag);  // tolerate "user:0", "0", "user:101"
      if (m) id = _num(m[1]);
    } else {
      id = _num(userTag);
    }
    if (id == null) {
      return { id: userTag, name: String(userTag), resolved: false, source: 'fallback' };
    }
    return resolveSender(id, adUserRows);
  }

  var UserNames = {
    resolveSender: resolveSender,
    resolveTag:    resolveTag,
    buildMap:      buildMap,
    SYSTEM_ID:     SYSTEM_ID
    // TODO(STEP-0): nav / dispatch exposed-globals are pinned with the host lane — NOT here.
  };

  if (typeof window !== 'undefined') window.UserNames = UserNames;
  if (typeof module !== 'undefined' && module.exports) module.exports = UserNames;
})();
