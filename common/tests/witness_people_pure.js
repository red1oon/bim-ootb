#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-PEOPLE-PURE, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §13.12.G.1 (+ §13.12.H uses 1,2). READ THE LOG after every run — the exit code is not evidence.
//   The pure maths of common/comm/team_people.js on FIXED inputs, with an injected clock (no sleeps). Every arm names the issue it proves or disproves and has a CONTROL
//   (the same input with the one thing that matters changed/removed) that must come out DIFFERENT — a pass that a control would also pass is not a pass.
//   §PP-RANK     ranking = newest op OR head first (disproves "ranking ignores heads": control without heads orders differently)
//   §PP-TTL      a focus entry older than ttlMs is dropped, the boundary is kept, a longer ttl keeps it
//   §PP-OFF      off:true hides the details (disproves "off still leaks the label"); control: same input without off
//   §PP-MERGE    a person's devices merge; a duplicate record keeps the newest since
//   §PP-HIST     historyOf = the person's ops grouped by record, identity ops and other people's ops excluded, n honoured
//   §PP-HEADSUP  the others only; only people who could write the table; control: ignoreWriters
//   §PP-SCOPE    roleScope on a fixed dictionary: reads/writes/up/down; the wf path; the override-edge list; empty role = empty scope (control)
//   §PP-STRIP    scope mode puts in-scope people first and collapses the rest; Everyone shows all; I am always shown
//   §PP-INBOX    inbox = upstream-authored CREATEs on upstream tables not yet handled; a handled item leaves; self / non-upstream not listed
// Run: node common/tests/witness_people_pure.js 2>&1 | tee /tmp/witness_people_pure.log
'use strict';
var P = require('../comm/team_people.js');
var fails = 0, judged = 0, inconclusive = [];
function verdict(ok, label, detail) { judged++; if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function incon(label, why) { inconclusive.push(label); console.log('   ⚪ INCONCLUSIVE ' + label + ' — ' + why); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
var MIN = 60000, NOW = 1000 * 60 * 60 * 24;            // a fixed clock

// ── the fixed world: three people (sales role 1, warehouse role 2, accounts role 3), sales has a second device ──
var DIR = [
  { person: 'pa', name: 'Aisha', role: 1, roleName: 'Sales', kids: ['ka', 'ka2'] },
  { person: 'pb', name: 'Bilal', role: 2, roleName: 'Warehouse', kids: ['kb'] },
  { person: 'pc', name: 'Chen', role: 3, roleName: 'Accounts', kids: ['kc'] }];
function env(author, ts, table, uu, type, fields, seq) { return { author: author, ts: ts, seq: seq || 0, target: { table: table, uu: uu }, body: { op_type: type, params: type === 'CRUD_CREATE' ? { fields: fields || {} } : { changes: fields || {} } } }; }

(function main() {
  console.log('═══ W-PEOPLE-PURE — team_people.js on fixed inputs (TEAMWORK_FRAMEWORK §13.12.G.1) ═══\n');

  console.log('§PP-RANK');
  var ops = [env('ka', NOW - 50 * MIN, 'c_order', 'o1', 'CRUD_CREATE', { documentno: 'SO-1' }), env('kb', NOW - 20 * MIN, 'm_inout', 'i1', 'CRUD_CREATE', {}), env('kc', NOW - 40 * MIN, 'c_invoice', 'v1', 'CRUD_CREATE', {})];
  var heads = [{ author: 'ka2', ts: NOW - 5 * MIN }, { author: 'kc', ts: NOW - 41 * MIN }];
  // independent expectation: newest of (ops, heads) per person  → pa 5min (head of ka2), pb 20, pc 40 (op)
  var r1 = P.rank(ops, heads, [], NOW, { directory: DIR });
  verdict(same(r1.map(function (p) { return p.person; }), ['pa', 'pb', 'pc']) && r1[0].lastSource === 'head' && r1[2].lastSource === 'op' && r1[0].ageMs === 5 * MIN, 'order = newest activity first; the newest of a person\'s devices counts; source op/head reported', r1.map(function (p) { return p.person + ':' + p.lastSource + ':' + p.ageMs / MIN; }).join(' '));
  var r1b = P.rank(ops, [], [], NOW, { directory: DIR }).map(function (p) { return p.person; });
  verdict(!same(r1b, ['pa', 'pb', 'pc']), 'CONTROL: without the heads the order differs (pa falls to the op at 50 min) — so the heads input is not decorative', r1b.join(','));
  var r1c = P.rank(ops, heads, [], NOW, { directory: [] });
  verdict(r1c.length === 0, 'an empty directory ranks nobody (a vacuous population — any "ordered correctly" verdict built on it would be meaningless; the browser witness refuses to judge an empty strip)', 'people=' + r1c.length);

  console.log('\n§PP-TTL');
  var foc = [{ kid: 'ka', person: 'pa', ts: NOW, since: NOW, off: false, focus: [
    { table: 'c_order', uu: 'o29', label: 'Order 29', since: NOW - 29 * MIN }, { table: 'c_order', uu: 'o30', label: 'Order 30', since: NOW - 30 * MIN }, { table: 'c_order', uu: 'o31', label: 'Order 31', since: NOW - 31 * MIN }] }];
  var t1 = P.rank([], [], foc, NOW, { directory: DIR }).filter(function (p) { return p.person === 'pa'; })[0].focus.map(function (e) { return e.uu; });
  verdict(same(t1, ['o29', 'o30']), 'default ttl 30 min: 29 and exactly 30 min are shown, 31 min is not', t1.join(','));
  var t2 = P.rank([], [], foc, NOW, { directory: DIR, ttlMs: 5 * MIN }).filter(function (p) { return p.person === 'pa'; })[0].focus.length;
  verdict(t2 === 0, 'ttlMs option: with 5 min nothing of 29/30/31 min survives', 'shown=' + t2);
  var t3 = P.rank([], [], foc, NOW, { directory: DIR, ttlMs: 60 * MIN }).filter(function (p) { return p.person === 'pa'; })[0].focus.length;
  verdict(t3 === 3, 'CONTROL: with a 60 min ttl all three are shown (the drop above is the ttl, not a lost entry)', 'shown=' + t3);
  var tc = P.rank([], [], foc, NOW + 31 * MIN, { directory: DIR }).filter(function (p) { return p.person === 'pa'; })[0].focus.length;
  verdict(tc === 0, 'the injected clock moves the TTL: the same objects 31 min later show nothing', 'shown=' + tc);

  console.log('\n§PP-OFF');
  var offObj = [{ kid: 'ka', person: 'pa', ts: NOW, since: NOW, off: true, focus: [] }, foc[0]];
  var o1 = P.rank([], [{ author: 'ka', ts: NOW - MIN }], offObj, NOW, { directory: DIR }).filter(function (p) { return p.person === 'pa'; })[0];
  verdict(o1.off === true && o1.focus.length === 0 && o1.lastActive === NOW - MIN, 'a person with off:true shows no focus (even if another of their devices lists some) but still "active"', 'off=' + o1.off + ' focus=' + o1.focus.length + ' active=' + o1.ageMs / MIN + 'min');
  var o2 = P.rank([], [], [foc[0]], NOW, { directory: DIR }).filter(function (p) { return p.person === 'pa'; })[0];
  verdict(o2.off === false && o2.focus.length === 2, 'CONTROL: without the off object the same focus is shown', 'focus=' + o2.focus.length);

  console.log('\n§PP-MERGE');
  var mg = [{ kid: 'ka', person: 'pa', focus: [{ table: 'c_order', uu: 'x', label: 'old', since: NOW - 10 * MIN }] }, { kid: 'ka2', person: 'pa', focus: [{ table: 'c_order', uu: 'x', label: 'new', since: NOW - 2 * MIN }, { table: 'c_orderline', uu: 'y', label: 'L', since: NOW - 3 * MIN }] }, { kid: 'zzz', person: 'ghost', focus: [{ table: 'c_order', uu: 'g', label: 'g', since: NOW }] }];
  var m1 = P.rank([], [], mg, NOW, { directory: DIR }).filter(function (p) { return p.person === 'pa'; })[0].focus;
  verdict(m1.length === 2 && m1[0].uu === 'x' && m1[0].label === 'new' && m1[1].uu === 'y', 'two devices of one person merge; the same record keeps the NEWEST since; newest entry first', JSON.stringify(m1.map(function (e) { return e.uu + ':' + e.label; })));
  verdict(P.rank([], [], mg, NOW, { directory: DIR }).every(function (p) { return p.person !== 'ghost'; }), 'a focus object from a kid that is not in the directory is ignored', 'people=' + P.rank([], [], mg, NOW, { directory: DIR }).length);

  console.log('\n§PP-HIST');
  var hops = [env('ka', NOW - 30 * MIN, 'c_order', 'o1', 'CRUD_CREATE', { documentno: 'SO-1' }, 1), env('ka', NOW - 20 * MIN, 'c_order', 'o1', 'CRUD_UPDATE', { description: { old: null, new: 'x' } }, 2),
              env('ka2', NOW - 10 * MIN, 'c_orderline', 'l1', 'CRUD_CREATE', {}, 1), env('kb', NOW - 5 * MIN, 'c_order', 'o1', 'CRUD_UPDATE', { description: { old: 'x', new: 'y' } }, 1),
              env('ka', NOW - 40 * MIN, 'comm_person', 'p1', 'PERSON', {}, 0)];
  var h1 = P.historyOf('pa', hops, 10, { directory: DIR });
  verdict(h1.length === 2 && h1[0].uu === 'l1' && h1[0].count === 1 && h1[1].uu === 'o1' && h1[1].count === 2 && h1[1].label === 'SO-1' && h1[0].label === null, 'pa: 3 ops on 2 records (order SO-1 ×2, a line ×1), newest record first, label from the CREATE; pb\'s op and the identity op are excluded', JSON.stringify(h1.map(function (g) { return g.table + ':' + g.count + ':' + g.label; })));
  var h2 = P.historyOf('pa', hops, 1, { directory: DIR });
  verdict(h2.length === 1 && h2[0].uu === 'l1' && h2[0].count === 1, 'n=1 keeps only the newest op (CONTROL: the n limit is real)', JSON.stringify(h2.map(function (g) { return g.uu + ':' + g.count; })));
  var h3 = P.historyOf('pa', hops, 10, { directory: DIR, labelOf: function (o) { return o.target.uu === 'l1' ? 'Line L1' : null; } });
  verdict(h3[0].label === 'Line L1' && h3[1].label === 'SO-1', 'a host labelOf hook names a record (the Modeller has no documentno); records it returns null for fall back to the CREATE fields', JSON.stringify(h3.map(function (g) { return g.label; })));
  verdict(P.historyOf('pc', hops, 10, { directory: DIR }).length === 0, 'a person with no ops has an empty history (CONTROL: not everyone gets pa\'s list)', '');

  console.log('\n§PP-SCOPE');
  var DICT = { roleIds: function () { return [1, 2, 3, 4, 9]; },
    reads: function (r) { return ({ 1: ['c_order', 'c_orderline', 'c_ordertax'], 2: ['m_inout', 'm_inoutline'], 3: ['c_invoice', 'c_payment'], 4: [], 9: ['c_order', 'm_inout', 'c_invoice', 'c_payment'] })[r] || []; },
    writes: function (r) { return ({ 1: ['c_order', 'c_orderline'], 2: ['m_inout', 'm_inoutline'], 3: ['c_invoice', 'c_payment'], 4: [], 9: ['c_order', 'm_inout', 'c_invoice', 'c_payment', 'c_orderline', 'm_inoutline'] })[r] || []; } };
  var s1 = P.roleScope(1, DICT), s2 = P.roleScope(2, DICT), s3 = P.roleScope(3, DICT), s4 = P.roleScope(4, DICT), s9 = P.roleScope(9, DICT);
  verdict(same(s1.writes, ['c_order', 'c_orderline']) && same(s1.reads, ['c_order', 'c_orderline', 'c_ordertax']) && same(s1.downstreamTables, ['m_inout']) && same(s1.upstreamTables, []) && same(s1.downstream, [2, 9]) && same(s1.upstream, []), 'sales(1): writes order+line, flows DOWN to m_inout; downstream roles = warehouse(2) and the full-scope role(9)', JSON.stringify([s1.upstream, s1.downstream]));
  verdict(same(s2.upstreamTables, ['c_order']) && same(s2.downstreamTables, ['c_invoice']) && same(s2.upstream, [1, 9]) && same(s2.downstream, [3, 9]), 'warehouse(2): up = sales(+9) via c_order, down = accounts(+9) via c_invoice', JSON.stringify([s2.upstream, s2.downstream]));
  verdict(same(s3.upstreamTables, ['m_inout']) && same(s3.downstreamTables, []) && same(s3.upstream, [2, 9]) && same(s3.downstream, []), 'accounts(3): up = warehouse(+9) via m_inout; nothing downstream (the c_invoice→c_payment edge is internal)', JSON.stringify([s3.upstream, s3.downstream]));
  verdict(same(s9.upstreamTables, []) && same(s9.downstreamTables, []), 'CONTROL: the full-scope role has no flow edges leaving it (it is hot for everyone through shared tables instead)', '');
  verdict(s4.writes.length === 0 && s4.reads.length === 0 && s4.upstream.length === 0 && s4.downstream.length === 0, 'CONTROL: a role with no access has an empty scope', JSON.stringify(s4));
  var w1 = P.roleScope(4, Object.assign({}, DICT, { wf: function () { return [{ table: 'm_inout', roleId: 4 }]; } }));
  verdict(same(w1.writes, ['m_inout']) && same(w1.upstreamTables, ['c_order']) && w1.upstream.indexOf(1) >= 0, 'the AD_WF_Node-responsibility path: a role made responsible for m_inout gets it in writes and c_order upstream', JSON.stringify([w1.writes, w1.upstream]));
  var ov = P.roleScope(1, DICT, { edges: [['c_order', 'c_invoice']] });
  verdict(same(ov.downstreamTables, ['c_invoice']) && same(ov.downstream, [3, 9]), 'the override edge list replaces the default flow: sales now flows to accounts, not warehouse', JSON.stringify(ov.downstream));
  verdict(JSON.stringify(P.roleScope(2, DICT)) === JSON.stringify(P.roleScope(2, DICT)), 'deterministic: the same dictionary gives byte-identical scope twice', '');

  console.log('\n§PP-HEADSUP');
  var people = P.rank([], [], [{ kid: 'ka', person: 'pa', focus: [{ table: 'c_order', uu: 'o1', label: 'Order SO-1', since: NOW - 3 * MIN }] },
                                { kid: 'kc', person: 'pc', focus: [{ table: 'c_order', uu: 'o1', label: 'Order SO-1', since: NOW - MIN }] }], NOW,
    { directory: DIR, selfPerson: 'pb', mode: 'all', scopeOf: function (r) { return r === 1 ? s1 : r === 3 ? s3 : null; } });
  var hu = P.headsUpFor('o1', 'pb', people);
  verdict(hu.length === 1 && hu[0].person === 'pa' && hu[0].ageMs === 3 * MIN, 'warehouse opens o1: sees ONLY sales (who can write c_order); accounts opened it too but cannot write c_order → no heads-up', JSON.stringify(hu.map(function (h) { return h.name + ':' + P.ageText(h.ageMs); })));
  var hu2 = P.headsUpFor('o1', 'pb', people, { ignoreWriters: true }).map(function (h) { return h.person; });
  verdict(same(hu2, ['pc', 'pa']), 'CONTROL: without the writers filter accounts is listed too (the filter is what removed it)', hu2.join(','));
  verdict(P.headsUpFor('o1', 'pa', people).every(function (h) { return h.person !== 'pa'; }), 'I am never in my own heads-up', '');
  verdict(P.headsUpFor('nobody', 'pb', people).length === 0, 'CONTROL: a record nobody has open has an empty heads-up', '');

  console.log('\n§PP-STRIP');
  var pdir = DIR;   // me = sales (pa)
  var st = P.rank(ops, heads, [], NOW, { directory: pdir, selfPerson: 'pa', mode: 'scope', scope: s1, scopeOf: function (r) { return ({ 1: s1, 2: s2, 3: s3 })[r]; } });
  var cs = P.collapse(st, 'scope');
  verdict(same(cs.shown.map(function (p) { return p.person; }), ['pa', 'pb']) && same(cs.others.map(function (p) { return p.person; }), ['pc']), 'sales device, role scope: shown = me + warehouse (flows down to it), "+1 others" = accounts (no shared table, not adjacent)', 'shown=' + cs.shown.map(function (p) { return p.person; }) + ' others=' + cs.others.map(function (p) { return p.person; }));
  var ce = P.collapse(P.rank(ops, heads, [], NOW, { directory: pdir, selfPerson: 'pa', mode: 'all', scope: s1, scopeOf: function (r) { return ({ 1: s1, 2: s2, 3: s3 })[r]; } }), 'all');
  verdict(ce.shown.length === 3 && ce.others.length === 0, 'CONTROL: Everyone mode shows all three, collapses none', 'shown=' + ce.shown.length);
  var wh = P.rank(ops, heads, [], NOW, { directory: pdir, selfPerson: 'pb', mode: 'scope', scope: s2, scopeOf: function (r) { return ({ 1: s1, 2: s2, 3: s3 })[r]; } });
  verdict(wh.every(function (p) { return p.inScope; }), 'warehouse device: sales (upstream) and accounts (downstream) are both in scope — the stated adjacency rule, not the §13.12.H example wording', wh.map(function (p) { return p.person + ':' + p.inScope; }).join(' '));
  var recency = P.rank([env('kc', NOW - MIN, 'c_invoice', 'v', 'CRUD_CREATE', {})], [], [], NOW, { directory: pdir, selfPerson: 'pa', mode: 'scope', scope: s1, scopeOf: function (r) { return ({ 1: s1, 2: s2, 3: s3 })[r]; } });
  verdict(recency[recency.length - 1].person === 'pc' && recency[0].inScope, 'in-scope people stay ahead of an out-of-scope person even when the out-of-scope one is the most recently active', recency.map(function (p) { return p.person; }).join(','));

  console.log('\n§PP-INBOX');
  var iops = [env('ka', NOW - 30 * MIN, 'c_order', 'o1', 'CRUD_CREATE', { documentno: 'SO-1' }), env('kc', NOW - 25 * MIN, 'c_order', 'o2', 'CRUD_CREATE', { documentno: 'SO-X' }),
              env('ka', NOW - 20 * MIN, 'c_order', 'o3', 'CRUD_CREATE', { documentno: 'SO-3' }), env('ka', NOW - 15 * MIN, 'c_orderline', 'l1', 'CRUD_CREATE', {}),
              env('kb', NOW - 10 * MIN, 'm_inout', 'i1', 'CRUD_CREATE', { c_order_id: { uu: 'o3' } })];
  var ctxo = { roleOfKid: function (k) { return ({ ka: 1, ka2: 1, kb: 2, kc: 3 })[k]; }, personOfKid: function (k) { return ({ ka: 'pa', ka2: 'pa', kb: 'pb', kc: 'pc' })[k]; }, nameOfKid: function (k) { return ({ ka: 'Aisha', kb: 'Bilal', kc: 'Chen' })[k]; } };
  var ib = P.inboxFor(s2, iops, Object.assign({ selfPerson: 'pb' }, ctxo));
  verdict(ib.length === 1 && ib[0].uu === 'o1' && ib[0].label === 'SO-1' && ib[0].author === 'Aisha', 'warehouse inbox = exactly o1: o2 is by accounts (not an upstream role), o3 is already handled by a shipment that references it, the order LINE is not an upstream table', JSON.stringify(ib.map(function (i) { return i.uu + ':' + i.label; })));
  var ib0 = P.inboxFor(s2, iops.filter(function (o) { return o.target.uu !== 'i1'; }), Object.assign({ selfPerson: 'pb' }, ctxo)).map(function (i) { return i.uu; });
  verdict(same(ib0, ['o3', 'o1']), 'CONTROL: remove the shipment and o3 is back in the inbox (so "handled" is what removed it), newest first', ib0.join(','));
  verdict(P.inboxFor(s1, iops, Object.assign({ selfPerson: 'pa' }, ctxo)).length === 0, 'sales has nothing upstream of it → empty inbox', '');
  var ic = P.inboxFor(s3, iops, Object.assign({ selfPerson: 'pc' }, ctxo));
  verdict(ic.length === 1 && ic[0].uu === 'i1' && ic[0].author === 'Bilal', 'accounts inbox = the warehouse shipment i1 only (its upstream table is m_inout); no order appears there', JSON.stringify(ic.map(function (i) { return i.uu + ':' + i.author; })));
  var ibSelf = P.inboxFor(s2, iops, Object.assign({ selfPerson: 'pa' }, ctxo)).map(function (i) { return i.uu; });
  verdict(ibSelf.indexOf('o1') < 0, 'CONTROL: items a person authored themselves never enter their own inbox', ibSelf.join(','));
  verdict(same(P.inboxFor(null, iops, ctxo), []), 'no scope (Modeller: no dictionary) → empty inbox, not a crash', '');

  console.log('\n§PP-HELPERS');
  verdict(P.initials('Aisha Rahman') === 'AR' && P.initials('founder') === 'FO' && P.initials('') === '?', 'initials', P.initials('Aisha Rahman') + ' ' + P.initials('founder'));
  verdict(P.ageText(30 * 1000) === 'just now' && P.ageText(3 * MIN) === '3 min ago' && P.ageText(125 * MIN) === '2 h ago', 'ageText', P.ageText(3 * MIN));

  console.log('\n──────────────────────────────────────────────');
  console.log('§W-PEOPLE-PURE ' + (fails || !judged ? (judged ? 'FAIL' : 'INCONCLUSIVE') : (inconclusive.length ? 'PASS-WITH-INCONCLUSIVE(' + inconclusive.length + ')' : 'PASS')) + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconclusive.length);
  process.exit(fails || !judged ? 1 : 0);
})();
