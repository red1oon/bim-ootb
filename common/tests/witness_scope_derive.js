#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-SCOPE-DERIVE, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §13.12.G.1 / §13.12.H use 1. READ THE LOG after every run — the exit code is not evidence.
//   Role scope S(role) = reads / writes / upstream / downstream is DERIVED from the real AD dictionary (erp/ad_seed.db) by TeamPeople.dictFromDb + roleScope, with the same
//   AdAccess maths the admission check uses. The seed has no Sales/Warehouse/Accounts roles, so three fixture roles are cloned in (common/tests/people_fixture_roles.js) and granted
//   REAL windows 143 / 169 / 167+195. Issues proved or disproved:
//   §SD-SAME     "two devices derive different scopes from the same dictionary" — two independent loads give byte-identical JSON for every role
//   §SD-HAND     the derived writes/flow equal (a) an independent raw-SQL derivation written in this file and (b) the hand-listed tables of the real windows
//   §SD-RULE     "a window grant alone makes a table writable" is FALSE: role 103 (org-level user) has read-write windows yet loses tables whose AccessLevel it cannot update;
//                role 102 keeps them (CONTROL: the same windows, a different role)
//   §SD-RO       a role with only read-only window grants has reads but EMPTY writes (CONTROL)
//   §SD-OVERRIDE the override edge list moves the flow; the default flow is restored without it
// Run: node common/tests/witness_scope_derive.js 2>&1 | tee /tmp/witness_scope_derive.log
'use strict';
var path = require('path'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
function req(m) { try { return require(m); } catch (e) { return require('/home/red1/bim-ootb/node_modules/' + m); } }
var initSqlJs = req('sql.js'), AD = require(path.join(ROOT, 'erp', 'ad_access.js')), P = require('../comm/team_people.js'), FX = require('./people_fixture_roles.js');
var fails = 0, judged = 0, inconclusive = [];
function verdict(ok, label, detail) { judged++; if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function incon(label, why) { inconclusive.push(label); console.log('   ⚪ INCONCLUSIVE ' + label + ' — ' + why); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function shim(db) { return { prepare: function (sql) { return {
  get: function () { var st = db.prepare(sql); st.bind([].slice.call(arguments)); var r = st.step() ? st.getAsObject() : undefined; st.free(); return r; },
  all: function () { var st = db.prepare(sql); st.bind([].slice.call(arguments)); var o = []; while (st.step()) o.push(st.getAsObject()); st.free(); return o; } }; } }; }
function q(db, sql) { var st = db.prepare(sql), o = []; while (st.step()) o.push(st.getAsObject()); st.free(); return o; }

(async function () {
  console.log('═══ W-SCOPE-DERIVE — role scope derived from the AD dictionary (TEAMWORK_FRAMEWORK §13.12.G.1 / §13.12.H) ═══\n');
  var SQL = await initSqlJs(), bytes = fs.readFileSync(path.join(ROOT, 'erp', 'ad_seed.db'));
  function load(extra) { var d = new SQL.Database(new Uint8Array(bytes)); FX.statements().forEach(function (s) { d.run(s); }); (extra || []).forEach(function (s) { d.run(s); }); return d; }
  var d1 = load(), d2 = load();
  var dict1 = P.dictFromDb(shim(d1), AD), dict2 = P.dictFromDb(shim(d2), AD);
  var roles = dict1.roleIds();
  console.log('   dictionary: ' + roles.length + ' active roles, fixture roles ' + FX.ROLES.map(function (r) { return r[0]; }).join(','));
  if (roles.length < 5) { incon('W-SCOPE-DERIVE', 'dictionary produced fewer than 5 roles — nothing meaningful to derive'); }

  console.log('§SD-SAME');
  var s1 = roles.map(function (r) { return P.roleScope(r, dict1); }), s2 = dict2.roleIds().map(function (r) { return P.roleScope(r, dict2); });
  var nonEmpty = s1.filter(function (s) { return s.writes.length; }).length;
  verdict(JSON.stringify(s1) === JSON.stringify(s2) && nonEmpty >= 5, 'every role\'s scope is byte-identical on two independently loaded dictionaries', roles.length + ' roles, ' + nonEmpty + ' with writes, bytes=' + JSON.stringify(s1).length);

  console.log('\n§SD-HAND');
  function indep(roleId) {      // raw SQL, no AdAccess: tables of non-read-only tabs of the role's read-write windows whose AccessLevel a client+org user may update
    return q(d1, "SELECT DISTINCT lower(tb.tablename) AS n FROM ad_window_access wa JOIN ad_tab t ON t.ad_window_id=wa.ad_window_id AND t.isactive='Y' AND t.isreadonly='N' JOIN ad_table tb ON tb.ad_table_id=t.ad_table_id " +
      "WHERE wa.ad_role_id=" + roleId + " AND wa.isactive='Y' AND wa.isreadwrite='Y' AND tb.accesslevel IN ('1','2','3','6','7') ORDER BY 1").map(function (r) { return r.n; });
  }
  var HAND = { 9001: ['c_order', 'c_orderline', 'c_orderpayschedule', 'c_pospayment'], 9002: ['m_inout', 'm_inoutline', 'm_inoutlinema', 'm_package', 'm_packageline', 'm_packagemps'],
               9003: ['c_invoice', 'c_invoiceline', 'c_invoicepayschedule', 'c_payment', 'c_paymentallocate'] };
  [9001, 9002, 9003].forEach(function (r) {
    var w = dict1.writes(r), i = indep(r), h = HAND[r].slice().sort();
    verdict(same(w, i) && same(w, h), 'role ' + r + ' writes = independent SQL = hand-listed tables of the real window(s)', w.join(','));
  });
  var sc = { 9001: P.roleScope(9001, dict1), 9002: P.roleScope(9002, dict1), 9003: P.roleScope(9003, dict1) };
  var F = [9001, 9002, 9003];
  function inF(a) { return a.filter(function (x) { return F.indexOf(x) >= 0; }); }
  verdict(same(inF(sc[9001].upstream), []) && same(inF(sc[9001].downstream), [9002]) && same(sc[9001].downstreamTables, ['m_inout']), 'hand-derived flow, sales: nothing upstream; warehouse downstream through m_inout', JSON.stringify([sc[9001].upstream.length, sc[9001].downstream.length]));
  verdict(same(inF(sc[9002].upstream), [9001]) && same(inF(sc[9002].downstream), [9003]) && same(sc[9002].upstreamTables, ['c_order']) && same(sc[9002].downstreamTables, ['c_invoice']), 'hand-derived flow, warehouse: sales upstream (c_order), accounts downstream (c_invoice)', '');
  verdict(same(inF(sc[9003].upstream), [9002]) && same(inF(sc[9003].downstream), []) && same(sc[9003].upstreamTables, ['m_inout']) && same(sc[9003].downstreamTables, []), 'hand-derived flow, accounts: warehouse upstream (m_inout); nothing downstream', '');
  verdict([102, 1300102].every(function (a) { return sc[9001].downstream.indexOf(a) >= 0 && sc[9002].upstream.indexOf(a) >= 0 && sc[9003].upstream.indexOf(a) >= 0; }), 'the GardenWorld Admin roles (full scope) appear on both sides of every clerk — hot for everyone, as §13.12.H says', 'admin writes=' + dict1.writes(102).length + ' tables');
  verdict(inF(sc[9001].upstream).concat(inF(sc[9001].downstream)).indexOf(9003) < 0, 'CONTROL: accounts is NOT adjacent to sales (so a sales device can collapse it)', '');

  console.log('\n§SD-RULE');
  var w102 = dict1.writes(102), w103 = dict1.writes(103);
  var lvlOf = {}; q(d1, "SELECT lower(tablename) AS n, accesslevel AS l FROM ad_table").forEach(function (r) { lvlOf[r.n] = r.l; });
  var lost = w102.filter(function (t) { return w103.indexOf(t) < 0 && ['2', '4', '6'].indexOf(String(lvlOf[t])) >= 0; });
  var i103 = indep103();
  function indep103() { return q(d1, "SELECT DISTINCT lower(tb.tablename) AS n FROM ad_window_access wa JOIN ad_tab t ON t.ad_window_id=wa.ad_window_id AND t.isactive='Y' AND t.isreadonly='N' JOIN ad_table tb ON tb.ad_table_id=t.ad_table_id WHERE wa.ad_role_id=103 AND wa.isactive='Y' AND wa.isreadwrite='Y' AND tb.accesslevel IN ('1','3','7') ORDER BY 1").map(function (r) { return r.n; }); }
  var windowOnly103 = q(d1, "SELECT DISTINCT lower(tb.tablename) AS n FROM ad_window_access wa JOIN ad_tab t ON t.ad_window_id=wa.ad_window_id AND t.isactive='Y' AND t.isreadonly='N' JOIN ad_table tb ON tb.ad_table_id=t.ad_table_id WHERE wa.ad_role_id=103 AND wa.isactive='Y' AND wa.isreadwrite='Y'").length;
  if (!lost.length) incon('§SD-RULE', 'no table separates role 102 from role 103 by AccessLevel — the canUpdate rule could not be shown to bite');
  else verdict(lost.length > 0 && same(w103, i103) && windowOnly103 > w103.length, 'role 103 (org-level user) writes ' + w103.length + ' tables though its read-write windows reach ' + windowOnly103 + ': the AccessLevel 2/4/6 tables are dropped (e.g. ' + lost.slice(0, 3).join(',') + '); role 102 keeps them', 'lost=' + lost.length + ' indep=' + i103.length);

  console.log('\n§SD-RO');
  var d3 = load(["CREATE TEMP TABLE _r AS SELECT * FROM ad_role WHERE ad_role_id=9001", "UPDATE _r SET ad_role_id=9099, name='Read-only Clerk (fixture)', ad_role_uu='fixture-role-9099'", "INSERT INTO ad_role SELECT * FROM _r",
    "INSERT INTO ad_window_access (ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite) VALUES (143,9099,11,0,'Y','2026-01-01',0,'2026-01-01',0,'N')"]);
  var dict3 = P.dictFromDb(shim(d3), AD), ro = P.roleScope(9099, dict3);
  verdict(ro.reads.indexOf('c_order') >= 0 && ro.writes.length === 0 && ro.upstream.length === 0 && ro.downstream.length === 0, 'a role with ONLY a read-only grant on the Sales Order window reads c_order, writes nothing, has no flow neighbours', 'reads=' + ro.reads.length + ' writes=' + ro.writes.length);
  var rw = P.roleScope(9001, dict3);
  verdict(rw.writes.length > 0 && rw.reads.length === ro.reads.length, 'CONTROL: the read-write twin on the same window writes ' + rw.writes.length + ' tables and reads the same ' + rw.reads.length, '');

  console.log('\n§SD-OVERRIDE');
  var ov = P.roleScope(9001, dict1, { edges: [['c_order', 'c_invoice']] });
  verdict(same(ov.downstreamTables, ['c_invoice']) && inF(ov.downstream).join() === '9003' && P.roleScope(9001, dict1).downstreamTables.join() === 'm_inout', 'override edge c_order→c_invoice moves sales\' downstream to accounts; without it the default flow (m_inout) returns', JSON.stringify(inF(ov.downstream)));

  console.log('\n──────────────────────────────────────────────');
  console.log('§W-SCOPE-DERIVE ' + (fails || !judged ? (judged ? 'FAIL' : 'INCONCLUSIVE') : (inconclusive.length ? 'PASS-WITH-INCONCLUSIVE(' + inconclusive.length + ')' : 'PASS')) + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconclusive.length);
  process.exit(fails || !judged ? 1 : 0);
})().catch(function (e) { console.log('🔴 CRASH ' + (e && e.stack || e)); process.exit(2); });
