// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// team_docno.js — LOCAL NUMBERING (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §48.11b, build spec §48.11c pieces 3+4; Witness: W-DOCNO-TILL D7-D15).
// DocumentNo = OrgValue-UserValue-n: the legacy MSequence mechanism (Prefix with /K key variables, MSequence.java:70, :603-612), configured, no new numbering code.
//   ensure(q, run)  the Team boot overlay: every active auto-sequence a C_DocType numbers with and that has NO prefix gets FORMAT; an admin's own prefix is kept. Idempotent,
//                   a direct write to the live DB (not an op, never sent), so the Team BASE hash (seed bytes + patch texts) does not move.
//   judge(o)        the fold rule REFUSED:docno-station, judged the same way on every device: the format comes from the BASE row with the overlay applied in memory, plus any
//                   prefix set on that sequence by an op IN THE LOG; the station is the AD_User the author's roster person is bound to (§38.15 approve with AD_User_UU).
//   Twin rule: Team lane only; a solo device never calls either (its numbers come from one counter, legacy as shipped).
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_trade.js'));
  else root.TeamDocNo = factory(root.ModelTrade);
})(typeof window !== 'undefined' ? window : globalThis, function (MT) {
  var FORMAT = '@AD_Org_ID.Value/K@-@#AD_User_Value/K@-', STATION = '#AD_User_Value';
  // the globals the judge can derive from the AUTHOR and the document alone; a format naming any other global is not judged (UNJUDGED, logged), never guessed
  var DERIVABLE = { '#AD_User_Value': 1, '#AD_User_ID': 1, '#AD_Org_ID': 1, '#AD_Client_ID': 1 };
  function isEmpty(v) { return v == null || String(v).trim() === ''; }
  function lc(rows) { return rows.map(function (r) { var o = {}; for (var k in r) o[k.toLowerCase()] = r[k]; return o; }); }
  var TARGETS = "SELECT DISTINCT s.AD_Sequence_ID AS id, s.Prefix AS prefix FROM AD_Sequence s JOIN C_DocType d ON d.DocNoSequence_ID=s.AD_Sequence_ID " +
    "WHERE d.IsDocNoControlled='Y' AND s.IsActive='Y' AND s.IsAutoSequence='Y' AND s.IsTableID='N' ORDER BY s.AD_Sequence_ID";
  // q(sql, args) -> rows; run(sql, args) executes a write
  function ensure(q, run, log) {
    var rows = lc(q(TARGETS, [])), applied = 0, kept = 0;
    rows.forEach(function (r) { if (isEmpty(r.prefix)) { run('UPDATE AD_Sequence SET Prefix=? WHERE AD_Sequence_ID=?', [FORMAT, r.id]); applied++; } else kept++; });
    var vl = 0; try { vl = Number((lc(q("SELECT count(*) AS n FROM AD_User WHERE IsActive='Y' AND AD_Client_ID<>0 AND (Value IS NULL OR Value='')", []))[0] || {}).n || 0); } catch (e) { vl = -1; }
    (log || console.log)('§TEAM_DOCNO_PREFIX applied=' + applied + ' kept=' + kept + ' format=' + FORMAT + ' valueless_users=' + vl + ' (boot overlay, live DB only, base hash unchanged' +
      (vl > 0 ? '; a user with no Search Key numbers Org--n and shares that series with every other such user: give each station user a Value in the User window' : '') + ')');
    return { applied: applied, kept: kept, valueless: vl };
  }
  function overlaid(prefix) { return isEmpty(prefix) ? FORMAT : prefix; }   // the overlay applied in memory to a BASE row
  function globalsOf(fmt) { var m = String(fmt).replace(/\/K@/g, '@').match(/@[#$][^@]*@/g) || []; return m.map(function (x) { return x.slice(1, -1).split(/[.:<]/)[0]; }); }

  // o = { table, body, person, baseQ(sql,args) -> rows (async ok), logOps(table) -> [{uu, op_type, params}], log }
  // returns null (no number to judge / it matches) · { verdict:'REFUSED', reason:'docno-station', detail } · { unjudged: why }
  async function judge(o) {
    var b = o.body || {}, p = b.params || {}, t = String(o.table || '').toLowerCase();
    var dn = b.op_type === 'CRUD_CREATE' ? (p.fields || {}).documentno : b.op_type === 'CRUD_UPDATE' ? (p.changes || {}).documentno : undefined;
    if (dn == null || dn === '') return null;
    var bq = async function (sql, a) { return lc(await o.baseQ(sql, a || [])); };
    // the document as known deterministically: its CREATE in the log, else its base row; the UPDATE's own changes on top
    var doc = {}, cr = (o.logOps(t) || []).filter(function (x) { return x.op_type === 'CRUD_CREATE' && o.uu && String(x.uu).toLowerCase() === String(o.uu).toLowerCase(); })[0];
    if (cr) doc = Object.assign({}, cr.params.fields || {});
    else if (b.op_type === 'CRUD_UPDATE' && /^[a-z][a-z0-9_]*$/.test(t)) { try { doc = (await bq('SELECT * FROM "' + t + '" WHERE lower("' + t + '_uu")=?', [String(o.uu).toLowerCase()]))[0] || {}; } catch (e) { doc = {}; } }
    Object.assign(doc, b.op_type === 'CRUD_CREATE' ? (p.fields || {}) : (p.changes || {}));
    var dtId = Number(doc.c_doctypetarget_id || doc.c_doctype_id || 0);
    if (!(dtId > 0)) return { unjudged: 'no-doctype' };
    var dt = (await bq('SELECT DocNoSequence_ID AS s, IsDocNoControlled AS c FROM C_DocType WHERE C_DocType_ID=?', [dtId]))[0];
    if (!dt || !(Number(dt.s) > 0)) return { unjudged: 'doctype-not-in-base' };
    var seq = (await bq('SELECT * FROM AD_Sequence WHERE AD_Sequence_ID=?', [Number(dt.s)]))[0];
    if (!seq) return { unjudged: 'sequence-not-in-base' };
    var fmts = [overlaid(seq.prefix)];                                                      // base + overlay, then every prefix the log set on this sequence (an admin's edit, D15)
    (o.logOps('ad_sequence') || []).forEach(function (x) { var f = x.op_type === 'CRUD_UPDATE' ? (x.params.changes || {}) : {}; if (String(x.uu).toLowerCase() === String(seq.ad_sequence_uu || '').toLowerCase() && !isEmpty(f.prefix)) fmts.push(f.prefix); });
    fmts = fmts.filter(function (f) { return String(f).replace(/\/K@/g, '@').indexOf('@' + STATION) >= 0; });
    if (!fmts.length) return null;                                                          // this sequence carries no station key: nothing to judge
    var odd = fmts.map(globalsOf).reduce(function (a, g) { return a.concat(g); }, []).filter(function (g) { return !DERIVABLE[g]; });
    if (odd.length) return { unjudged: 'format-global ' + odd.join(',') };
    var user = isEmpty(o.person) ? null : (await bq('SELECT AD_User_ID AS id, Value AS v FROM AD_User WHERE lower(AD_User_UU)=?', [String(o.person).toLowerCase()]))[0];
    if (!user) { var uc = (o.logOps('ad_user') || []).filter(function (x) { return x.op_type === 'CRUD_CREATE' && String(x.uu).toLowerCase() === String(o.person).toLowerCase(); })[0]; if (uc) user = { id: null, v: (uc.params.fields || {}).value }; }
    if (!user || isEmpty(user.v)) return { unjudged: 'unbound' };                          // the author's person is not an AD_User record: §TEAM_DOCNO_UNBOUND
    var ctx = { getProperty: function (k, d) { var v = k === '#AD_User_Value' ? user.v : k === '#AD_User_ID' ? user.id : k === '#AD_Org_ID' ? doc.ad_org_id : k === '#AD_Client_ID' ? doc.ad_client_id : null; return v == null ? (d === undefined ? null : d) : String(v); } };
    var cache = {}, trx = { env: { ctx: ctx }, say: function () {},
      get: function (tb, id) { var k = tb + '|' + id; return cache[k]; } };
    // the reference (.) operator reads rows synchronously: pre-load the ones each format names (AD_Org for @AD_Org_ID.Value@ and any other X_ID.Column)
    for (var f of fmts) { var refs = String(f).match(/@([A-Za-z_]+_ID)\.[^@]*@/g) || [];
      for (var r of refs) { var col = r.slice(1).split('.')[0], tb = col.slice(0, -3).toLowerCase(), idv = Number(doc[col.toLowerCase()] || 0);
        if (idv > 0 && /^[a-z][a-z0-9_]*$/.test(tb) && !cache[tb + '|' + idv]) { try { cache[tb + '|' + idv] = (await bq('SELECT * FROM "' + tb + '" WHERE "' + tb + '_id"=?', [idv]))[0] || null; } catch (e) { cache[tb + '|' + idv] = null; } } } }
    var want = fmts.map(function (f) { return MT.parseVariable(trx, String(f).split('/K@').join('@'), doc); });
    if (want.some(function (w) { return String(dn).indexOf(w) === 0 && String(dn).length > w.length; })) return null;
    return { verdict: 'REFUSED', reason: 'docno-station', detail: 'documentno=' + dn + ' expected prefix ' + want.join(' or ') + ' (author user ' + user.v + ')' };
  }
  return { FORMAT: FORMAT, ensure: ensure, judge: judge, overlaid: overlaid, TARGETS: TARGETS };
});
