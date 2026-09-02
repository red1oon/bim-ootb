#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-CHAT-IS-LOG (prompts/RESUME_DISTRIBUTED_BRANCHES.md §8/§11). The chat IS the
//   signed op-log: each line is one op, messages are author-written OR deterministically rendered
//   (never fabricated), badges come from the gate, and the history is tamper-evident.
//   node-only over teams/ via the stub seam. Read the log after every run.
//     §ONE-TO-ONE  — one chat line per op, ids preserved, in total order.
//     §DETERMINISM — an op with no message renders the SAME prose every time (pure f(verb,params)).
//     §AUTHOR-MSG  — an op WITH a message uses it verbatim.
//     §ANNOT/§GIT  — annotation + git ops carry their own badge class.
//     §VERDICT-RED — a clashing op's line shows the RED badge from the gate.
//     §TAMPER      — clean chain verifies; mutating any signed param breaks verifyChain at that op.
// Run: node teams/tests/poc_teams_chatlog.js 2>&1 | tee teams/teams_chatlog.log — then READ the log.
'use strict';
var path = require('path');
var RP = require(path.join(__dirname, '..', 'index.js'));
var E = RP.Engine, G = RP.Gate, L = RP.Chatlog;
var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
var T = 1719700000000;
function op(id, ts, br, au, cls, verb, tgt, p) { return { id: id, ts: ts, branch: br, author: au, cls: cls, verb: verb, target: tgt, params: p || {} }; }

(function () {
  console.log('\n═══ W-CHAT-IS-LOG — the chat is the signed op-log, projected to commit lines ═══\n');

  // a signed STR chain (for the tamper test) ...
  var strBr = E.makeBranch('STR', 'STR', { type: 'discipline', value: 'STR' }, 'walker');
  var str = [];
  str = E.append(str, strBr, op('s1', T + 40, 'STR', 'STR', E.GEOM, 'INSERT', 'Col-201', { box: { x: 3, y: 2, z: 0, w: .4, d: .4, h: 3 }, disc: 'STR', cost: 1000 })).log;
  str = E.append(str, strBr, op('s2', T + 50, 'STR', 'STR', E.GEOM, 'INSERT', 'Col-204', { box: { x: 7, y: 5, z: 0, w: .45, d: .45, h: 3 }, disc: 'STR', cost: 1200 })).log;
  str = E.append(str, strBr, op('s3', T + 60, 'STR', 'STR', E.GEOM, 'SIZE',   'Col-204', { w: 0.55, cost: 1400, message: 'Upsized W12→W14 for level-2 load' })).log;

  // ... plus referenced MEP geometry + an annotation + a git op for the feed
  var mep = op('m1', T + 30, 'MEP', 'MEP', E.GEOM, 'INSERT', 'Duct-7', { box: { x: 1, y: 5, z: 2.4, w: 8, d: .5, h: .5 }, disc: 'MEP' });
  var annot = op('a1', T + 70, 'MEP', 'MEP', E.ANNOT, 'POSTIT', 'Col-204', { message: 'crosses my riser — please move' });
  var git = op('g1', T + 80, 'STR', 'STR', E.GIT, 'PUSH', null, { n: 3 });
  var feed = [mep].concat(str).concat([annot, git]);

  var gate = G.settle(str, [mep], {});           // Col-204 overlaps Duct-7 → clash
  var lines = L.render(feed, gate);

  // §ONE-TO-ONE
  verdict(lines.length === feed.length, '§ONE-TO-ONE  one line per op', lines.length + '/' + feed.length);
  verdict(lines[0].id === 'm1' && lines[lines.length - 1].id === 'g1', '§ONE-TO-ONE  ids preserved in total order');

  // §DETERMINISM
  var d1 = L.describe(mep), d2 = L.describe(mep);
  verdict(d1 === d2 && d1 === 'Duct-7 placed (MEP)', '§DETERMINISM  no-message op renders pure prose', d1);

  // §AUTHOR-MSG (s3 carries a message, non-annot → used verbatim)
  var lineS3 = lines.filter(function (l) { return l.id === 's3'; })[0];
  verdict(lineS3.msg === 'Upsized W12→W14 for level-2 load', '§AUTHOR-MSG  message used verbatim');

  // §ANNOT / §GIT badges
  var la = lines.filter(function (l) { return l.id === 'a1'; })[0];
  var lg = lines.filter(function (l) { return l.id === 'g1'; })[0];
  verdict(la.verdict.kind === 'annotation' && la.msg.indexOf('📌') === 0, '§ANNOT  annotation badge + 📌 prose', la.msg);
  verdict(lg.verdict.kind === 'git' && lg.msg.indexOf('pushed') === 0, '§GIT  push badge', lg.msg);

  // §VERDICT-RED — the clashing element's op shows RED
  var redLine = lines.filter(function (l) { return l.id === 's3'; })[0];   // s3 targets Col-204 (in clash)
  verdict(redLine.verdict.kind === 'red', '§VERDICT-RED  Col-204 op = RED badge', redLine.verdict.text);

  // §TAMPER — clean chain verifies; mutate a signed param → chain breaks at that op
  verdict(L.tamperCheck(str).ok, '§TAMPER  clean STR chain verifies');
  var tampered = str.map(function (o) { return Object.assign({}, o, { params: Object.assign({}, o.params) }); });
  tampered[1].params.box = Object.assign({}, tampered[1].params.box, { x: 999 });   // edit a past op
  var tc = L.tamperCheck(tampered);
  verdict(!tc.ok && tc.at === 1, '§TAMPER  edited past op breaks verifyChain', 'at op #' + tc.at + ' (' + tc.why + ')');

  console.log('\n' + (fails === 0 ? '✅ W-CHAT-IS-LOG 9/9 PASS' : '❌ ' + fails + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
