#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// user_value_rule.js — legacy MUser.setValue (org.adempiere.base/src/org/compiere/model/MUser.java:466-495, cleanValue :502, getName :592) ported, so an
// empty AD_User.Value is filled by LEGACY's rule, not by us (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §48.11d; Witness: W-DOCNO-TILL D16-D19).
//   rule(name, ldapUser) -> the Value legacy sets when setValue(null) is called on that user.
//   CLI: node erp/tools/user_value_rule.js [--sql]   lists (or writes the patch rows for) every seed user whose Value is empty, after the current patch file is applied.
'use strict';
function cleanValue(v) { var s = ''; for (var ch of String(v).toLowerCase()) if ((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'z')) s += ch; return s; }   // :502-515
function getName(name, getFirst) {                                                    // :592-635 — "Last, First" when a comma is present, else "First … Last"
  if (name == null || name.length === 0) return '';
  var first = null, last = null, lastFirst = name.indexOf(',') !== -1;
  var toks = name.split(lastFirst ? ',' : ' ').filter(function (t) { return t.length > 0; });   // java.util.StringTokenizer skips empty tokens
  toks.forEach(function (t) { var s = t.trim(); if (lastFirst) { if (last == null) last = s; else if (first == null) first = s; } else { if (first == null) first = s; else last = s; } });
  if (getFirst) return first == null ? '' : first.trim();
  return last == null ? '' : last.trim();
}
function rule(name, ldapUser) {                                                       // :466-495
  var Value = null;
  if (Value == null || Value.trim().length === 0) Value = ldapUser;
  if (Value == null || Value.length === 0) Value = name;
  if (Value == null || Value.length === 0) Value = 'noname';
  var result = cleanValue(Value);
  if (result.length > 8) {
    var first = getName(Value, true), last = getName(Value, false);
    if (last.length > 0) { var temp = last; if (first.length > 0) temp = first.substring(0, 1) + last; result = cleanValue(temp); }
    else result = cleanValue(first);
  }
  if (result.length > 8) result = result.substring(0, 8);
  return result;
}
module.exports = { rule: rule, cleanValue: cleanValue, getName: getName };

if (require.main === module) {
  (async function () {
    var fs = require('fs'), path = require('path'), os = require('os'), ERP = path.join(__dirname, '..');
    var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(os.homedir(), 'bim-ootb/tests/node_modules/sql.js')); }
    var SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
    fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) {} });
    var r = db.exec("SELECT ad_user_id, ad_client_id, name, ldapuser FROM ad_user WHERE value IS NULL OR value='' ORDER BY ad_user_id")[0], rows = r ? r.values : [];
    rows.forEach(function (x) { var v = rule(x[2], x[3]);
      if (process.argv.indexOf('--sql') >= 0) console.log("UPDATE ad_user SET value='" + v + "' WHERE ad_user_id=" + x[0] + " AND (value IS NULL OR value='');");
      else console.log(x[0] + '\tclient=' + x[1] + '\t' + JSON.stringify(x[2]) + '\t-> ' + v); });
    if (process.argv.indexOf('--sql') < 0) console.log('§USER_VALUE_RULE empty=' + rows.length);
  })();
}
