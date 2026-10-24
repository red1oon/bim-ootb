// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* team_people.js — the people strip's PURE maths (no DOM, no storage, no clock, no pipe): who is active, who is on what, whose role is near mine.
 * Implementing bim-compiler prompts/TEAMWORK_FRAMEWORK.md §13.12.G + §13.12.G.1 (build spec) + §13.12.H uses (1) strip filtered by role scope and (2) inbox.
 * Witnesses: W-PEOPLE-PURE (common/tests/witness_people_pure.js), W-SCOPE-DERIVE (common/tests/witness_scope_derive.js), W-PEOPLE-STRIP / W-SCOPE-STRIP / W-SCOPE-INBOX
 * (erp/tests/witness_people_strip.js), W-PEOPLE-MODELLER (modeller/tests/witness_people_modeller.js).
 *
 * Every function takes `now` or its options explicitly (injectable clock — a witness never sleeps). Nothing here is stored: ranking and history are
 * folds over the ops/heads/focus objects a device already holds; role scope is derived from the AD dictionary the adapter already has.
 * Depends on nothing (the AD access maths is injected as `AdAccess` into dictFromDb). */
(function (global) {
  'use strict';
  var TTL_DEFAULT = 30 * 60 * 1000;                       // §13.12.G: a stale focus expires by its `since` + a policy TTL, default 30 min
  var FLOW_DEFAULT = [['c_order', 'm_inout'], ['m_inout', 'c_invoice'], ['c_invoice', 'c_payment']];   // §13.12.H document flow (user, 2026-10-24)

  function uniq(a) { var s = {}, o = []; (a || []).forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }
  function sortV(a) { return uniq(a).sort(function (x, y) { return typeof x === 'number' && typeof y === 'number' ? x - y : (String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0); }); }
  function setOf(a) { var s = {}; (a || []).forEach(function (x) { s[x] = 1; }); return s; }
  function has(a, x) { return (a || []).indexOf(x) >= 0; }
  function inter(a, b) { var s = setOf(b); return (a || []).some(function (x) { return s[x]; }); }

  function initials(name) {
    var w = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return '?';
    var t = w.length > 1 ? w[0].charAt(0) + w[1].charAt(0) : w[0].slice(0, 2);
    return t.toUpperCase();
  }
  function ageText(ms) {
    if (ms == null || isNaN(ms)) return '';
    var m = Math.floor(Math.max(0, ms) / 60000);
    if (m < 1) return 'just now';
    if (m < 120) return m + ' min ago';
    return Math.floor(m / 60) + ' h ago';
  }

  // roster = CommRoster.fold output ({devices:{kid:{person}}, persons:{uu:{name}}, roleAt(kid, seq)}); roleName(id) → string|null
  function directoryFrom(roster, roleName) {
    var by = {};
    Object.keys((roster && roster.devices) || {}).sort().forEach(function (kid) {
      var d = roster.devices[kid], p = d.person, per = (roster.persons || {})[p] || {};
      if (!by[p]) { var role = roster.roleAt ? roster.roleAt(kid, 1e12).ad_role_id : null; by[p] = { person: p, name: per.name || p.slice(0, 8), role: role == null ? null : role, roleName: role == null ? null : (roleName ? roleName(role) : null) || ('role ' + role), kids: [] }; }
      by[p].kids.push(kid);
    });
    return Object.keys(by).sort().map(function (k) { return by[k]; });
  }

  // ── role scope (§13.12.H): derived from the dictionary, identical on every device ─────────────────────────────────
  // dict = { roleIds() → [id], reads(id) → [table], writes(id) → [table], wf?() → [{table, roleId}] }; over = { edges: [[from, to]…] } replaces the default flow.
  function roleScope(roleId, dict, over) {
    over = over || {}; var edges = over.edges || FLOW_DEFAULT, memo = {};
    function wOf(r) { if (memo[r]) return memo[r]; var w = (dict.writes(r) || []).slice();
      if (dict.wf) dict.wf().forEach(function (x) { if (x.roleId === r) w.push(x.table); });
      return (memo[r] = sortV(w)); }
    var reads = sortV(dict.reads(roleId)), writes = wOf(roleId), ws = setOf(writes);
    var upT = sortV(edges.filter(function (e) { return ws[e[1]] && !ws[e[0]]; }).map(function (e) { return e[0]; }));
    var dnT = sortV(edges.filter(function (e) { return ws[e[0]] && !ws[e[1]]; }).map(function (e) { return e[1]; }));
    var up = [], dn = [];
    sortV(dict.roleIds()).forEach(function (r) { if (r === roleId) return; var w = wOf(r); if (inter(w, upT)) up.push(r); if (inter(w, dnT)) dn.push(r); });
    return { role: roleId, reads: reads, writes: writes, upstreamTables: upT, downstreamTables: dnT, upstream: up, downstream: dn };
  }
  // is a person of role `role` (scope `sc`, may be null = unknown → not hidden) in MY scope `me`?
  function inScope(me, role, sc) {
    if (!me) return true;
    if (!sc) return true;
    return me.role === role || has(me.upstream, role) || has(me.downstream, role) || inter(me.writes, sc.writes);
  }

  // dictFromDb(db, AdAccess) — the dict above over an AD database. db = better-sqlite3-shaped ({prepare(sql).get/all}); AdAccess = erp/ad_access.js.
  function dictFromDb(db, AD) {
    var tbl = {}, wt = {}, cache = {}, names = {};
    db.prepare('SELECT ad_table_id AS id, lower(tablename) AS name, accesslevel AS lvl FROM ad_table').all().forEach(function (r) { tbl[r.id] = { name: r.name, lvl: r.lvl }; });
    db.prepare("SELECT ad_window_id AS w, ad_table_id AS t, isreadonly AS ro FROM ad_tab WHERE isactive='Y'").all().forEach(function (r) { (wt[r.w] = wt[r.w] || []).push({ t: r.t, ro: r.ro === 'Y' }); });
    db.prepare("SELECT ad_role_id AS id, name FROM ad_role WHERE isactive='Y' ORDER BY ad_role_id").all().forEach(function (r) { names[r.id] = r.name; });
    function canW(ctx, tableId, lvl) {                    // the SAME rule admission uses (MRole.canUpdate port), tried for each read-write org the role holds and org 0
      var orgs = [0]; (ctx.orgAccess || []).forEach(function (a) { if (!a.readOnly && orgs.indexOf(a.org) < 0) orgs.push(a.org); });
      ctx.orgs.forEach(function (o) { if (orgs.indexOf(o) < 0) orgs.push(o); });
      return orgs.some(function (o) { return ctx.canUpdate(ctx.clientId, o, Number(tableId), lvl).allowed; });
    }
    function of(r) {
      if (cache[r]) return cache[r];
      var ctx; try { ctx = AD.buildRole(db, r); } catch (e) { return (cache[r] = { reads: [], writes: [] }); }
      var rd = [], wr = [];
      ctx.win.forEach(function (rw, wid) { (wt[wid] || []).forEach(function (t) { var ti = tbl[t.t]; if (!ti) return; rd.push(ti.name); if (rw && !t.ro && canW(ctx, t.t, ti.lvl)) wr.push(ti.name); }); });
      return (cache[r] = { reads: sortV(rd), writes: sortV(wr) });
    }
    return { roleIds: function () { return sortV(Object.keys(names).map(Number)); }, reads: function (r) { return of(r).reads; }, writes: function (r) { return of(r).writes; },
             roleName: function (r) { return names[r] || null; }, wf: function () { return []; } };   // L3: the browser seed has no ad_wf_node/ad_wf_responsible
  }

  // ── ranking ────────────────────────────────────────────────────────────────────────────────────────────────────────
  // ops: envelopes {author, ts}; heads: [{author, ts}]; focusObjs: verified focus objects; now: ms.
  // opts: { directory, ttlMs, mode:'all'|'scope', scope (mine), scopeOf(roleId) → scope|null, selfPerson }
  function rank(ops, heads, focusObjs, now, opts) {
    opts = opts || {}; var dir = opts.directory || [], ttl = opts.ttlMs == null ? TTL_DEFAULT : opts.ttlMs, byKid = {}, acc = {};
    dir.forEach(function (p) { acc[p.person] = { last: null, src: null, foc: {}, off: false }; p.kids.forEach(function (k) { byKid[k] = p; }); });
    function bump(a, ts, src) { if (typeof ts !== 'number' || isNaN(ts)) return; if (a.last == null || ts > a.last) { a.last = ts; a.src = src; } }
    (ops || []).forEach(function (o) { var p = byKid[o.author]; if (p) bump(acc[p.person], o.ts, 'op'); });
    (heads || []).forEach(function (h) { var p = byKid[h.author]; if (p) bump(acc[p.person], h.ts, 'head'); });
    (focusObjs || []).forEach(function (f) { var p = byKid[f.kid]; if (!p) return; var a = acc[p.person];
      if (f.off) { a.off = true; return; }
      (f.focus || []).forEach(function (e) { var age = now - e.since; if (age > ttl) return;      // TTL basis: the entry's own `since`
        var k = e.uu; if (!a.foc[k] || e.since > a.foc[k].since) a.foc[k] = { table: e.table, uu: e.uu, label: e.label, since: e.since, ageMs: Math.max(0, age) }; }); });
    var list = dir.map(function (p) { var a = acc[p.person], sc = opts.scopeOf ? opts.scopeOf(p.role) : null;
      var foc = a.off ? [] : Object.keys(a.foc).map(function (k) { return a.foc[k]; }).sort(function (x, y) { return y.since - x.since || (x.uu < y.uu ? -1 : 1); });
      return { person: p.person, name: p.name, role: p.role, roleName: p.roleName, kids: p.kids, self: p.person === opts.selfPerson, lastActive: a.last, lastSource: a.src, ageMs: a.last == null ? null : Math.max(0, now - a.last),
               focus: foc, off: a.off, writes: sc ? sc.writes : null, inScope: opts.mode === 'scope' && opts.scope ? (p.person === opts.selfPerson || inScope(opts.scope, p.role, sc)) : true }; });
    list.sort(function (x, y) {
      if (opts.mode === 'scope' && opts.scope && x.inScope !== y.inScope) return x.inScope ? -1 : 1;
      var lx = x.lastActive == null ? -Infinity : x.lastActive, ly = y.lastActive == null ? -Infinity : y.lastActive;
      return ly !== lx ? (ly > lx ? 1 : -1) : (x.person < y.person ? -1 : 1);
    });
    return list;
  }
  // scope mode hides the people outside my scope behind "+N others"; Everyone shows all. I am always shown.
  function collapse(list, mode) {
    if (mode !== 'scope') return { shown: list, others: [] };
    return { shown: list.filter(function (p) { return p.inScope || p.self; }), others: list.filter(function (p) { return !(p.inScope || p.self); }) };
  }

  // ── history: the log, grouped by record — nothing stored ───────────────────────────────────────────────────────────
  // ops = [{author, ts, seq?, target:{table,uu}, body:{op_type, params}}]; opts.directory (to find the person's devices).
  function labelFromFields(f) { f = f || {}; var v = f.documentno || f.name || f.value; return v == null || v === '' ? null : String(v); }
  function historyOf(personUu, ops, n, opts) {
    opts = opts || {}; var p = (opts.directory || []).filter(function (x) { return x.person === personUu; })[0], kids = setOf(p ? p.kids : []);
    var label = {}; (ops || []).forEach(function (o) { if (o.body && o.body.op_type === 'CRUD_CREATE' && o.target) { var l = (opts.labelOf && opts.labelOf(o)) || labelFromFields(o.body.params && o.body.params.fields); if (l) label[o.target.uu] = l; } });   // opts.labelOf: a host names its own records (the Modeller has no documentno/name)
    var mine = (ops || []).filter(function (o) { return kids[o.author] && o.target && !/^comm_/.test(o.target.table); })
      .sort(function (a, b) { return (b.ts - a.ts) || ((b.seq || 0) - (a.seq || 0)); }).slice(0, n == null ? 10 : n), g = {}, order = [];
    mine.forEach(function (o) { var k = o.target.table + '|' + o.target.uu;
      if (!g[k]) { g[k] = { table: o.target.table, uu: o.target.uu, label: label[o.target.uu] || null, count: 0, last: o.ts, ops: [] }; order.push(k); }
      g[k].count++; g[k].ops.push(o.body.op_type); if (o.ts > g[k].last) g[k].last = o.ts; });
    return order.map(function (k) { return g[k]; }).sort(function (a, b) { return b.last - a.last || (a.uu < b.uu ? -1 : 1); });
  }

  // ── heads-up: the OTHER people whose live focus lists this record and who could write its table ────────────────────
  function headsUpFor(uu, selfPerson, people, opts) {
    opts = opts || {}; var out = [];
    (people || []).forEach(function (p) { if (p.person === selfPerson) return;
      (p.focus || []).forEach(function (e) { if (e.uu !== uu) return;
        if (!opts.ignoreWriters && p.writes && !has(p.writes, e.table)) return;                  // only people who could write that table (§13.12.H use 1)
        out.push({ person: p.person, name: p.name, table: e.table, label: e.label, since: e.since, ageMs: e.ageMs }); }); });
    return out.sort(function (a, b) { return a.ageMs - b.ageMs || (a.person < b.person ? -1 : 1); });
  }

  // ── inbox (§13.12.H use 2): items entering my role's queue ─────────────────────────────────────────────────────────
  // scope = my roleScope; ops = PLACED business envelopes; opts: { roleOfKid(kid), selfPerson, personOfKid(kid), nameOfKid(kid) }
  function refsOf(env, out) {
    var p = (env.body && env.body.params) || {};
    [p.fields, p.changes].forEach(function (m) { Object.keys(m || {}).forEach(function (c) { var v = m[c]; if (v && v.new !== undefined) v = v.new; if (v && typeof v === 'object' && typeof v.uu === 'string') out[v.uu] = 1; }); });
  }
  function inboxFor(scope, ops, opts) {
    opts = opts || {}; if (!scope) return [];
    var handled = {}, wr = setOf(scope.writes), upT = setOf(scope.upstreamTables), items = [];
    (ops || []).forEach(function (o) { if (o.body && o.body.op_type === 'CRUD_CREATE' && wr[o.target.table]) refsOf(o, handled); });
    (ops || []).forEach(function (o) {
      if (!o.body || o.body.op_type !== 'CRUD_CREATE' || !upT[o.target.table] || handled[o.target.uu]) return;
      var role = opts.roleOfKid ? opts.roleOfKid(o.author) : null, per = opts.personOfKid ? opts.personOfKid(o.author) : null;
      if (per && per === opts.selfPerson) return;
      if (!has(scope.upstream, role)) return;
      items.push({ table: o.target.table, uu: o.target.uu, label: labelFromFields(o.body.params && o.body.params.fields), author: opts.nameOfKid ? opts.nameOfKid(o.author) : o.author, kid: o.author, ts: o.ts });
    });
    return items.sort(function (a, b) { return b.ts - a.ts || (a.uu < b.uu ? -1 : 1); });
  }

  var API = { rank: rank, collapse: collapse, historyOf: historyOf, headsUpFor: headsUpFor, roleScope: roleScope, inScope: inScope, inboxFor: inboxFor, dictFromDb: dictFromDb,
              directoryFrom: directoryFrom, initials: initials, ageText: ageText, FLOW_DEFAULT: FLOW_DEFAULT, TTL_DEFAULT: TTL_DEFAULT };
  global.TeamPeople = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
