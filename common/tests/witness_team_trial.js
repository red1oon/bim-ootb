#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-TEAM-TRIAL-LIMIT, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §13.8 T4. READ THE LOG after every run.
//   Pure rule (common/comm/team_trial.js). Each arm names the issue it proves or disproves; an empty population prints INCONCLUSIVE.
//   §TRIAL-OPEN     before the first Complete a trial space may author (disproves "the trial blocks before the cycle is done").
//   §TRIAL-CLOSED   after one SET_STATUS→CO the trial is finished (disproves "the trial never ends").
//   §TRIAL-OWN      a user on their own repo/key is never limited, even with many Completes (disproves "the limit leaks onto own setups").
//   §TRIAL-CAP      the op cap closes a trial that never Completes (disproves "an endless draft loop is free").
//   §TRIAL-NOTCO    SET_STATUS to another status (e.g. IP) does not count as the cycle.
'use strict';
var T = require('../comm/team_trial.js'), fails = 0, judged = 0;
function verdict(ok, label, detail) { judged++; if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function op(t, to) { return { body: { op_type: t, params: to ? { to: to } : {} } }; }
console.log('═══ W-TEAM-TRIAL-LIMIT — the one-cycle trial rule (TEAMWORK_FRAMEWORK §13.8) ═══\n');
var draft = [op('CRUD_CREATE'), op('CRUD_CREATE'), op('CRUD_UPDATE')], done = draft.concat([op('SET_STATUS', 'CO')]);
console.log('§TRIAL-OPEN');   var a = T.status(draft, { trial: true }); verdict(!a.finished && a.reason === 'trial-open' && a.businessOps === 3, 'order + line + edits, no Complete: still open', JSON.stringify(a));
console.log('\n§TRIAL-CLOSED'); var b = T.status(done, { trial: true }); verdict(b.finished && b.reason === 'trial-finished' && b.cycles === 1, 'one SET_STATUS→CO finishes the trial', JSON.stringify(b));
console.log('\n§TRIAL-OWN');    var many = done.concat(done, done), c = T.status(many, { trial: false }); verdict(!c.finished && c.reason === 'not-a-trial' && c.cycles === 3, 'own repo/key: 3 Completes, never limited', JSON.stringify(c));
console.log('\n§TRIAL-CAP');    var spam = []; for (var i = 0; i < 60; i++) spam.push(op('CRUD_UPDATE')); var d1 = T.status(spam.slice(0, 59), { trial: true }), d2 = T.status(spam, { trial: true });
verdict(!d1.finished && d2.finished && d2.reason === 'trial-cap', 'cap 60: 59 ops open, 60 ops closed', d1.reason + ' / ' + d2.reason);
console.log('\n§TRIAL-NOTCO');  var e = T.status(draft.concat([op('SET_STATUS', 'IP')]), { trial: true }); verdict(!e.finished && e.cycles === 0, 'SET_STATUS→IP is not the cycle', JSON.stringify(e));
console.log('\n§TRIAL-EMPTY');  var z = T.status([], { trial: true }); if (z.businessOps === 0 && !z.finished) console.log('   ⚪ INCONCLUSIVE-by-design: empty space judged "open" (nothing to limit) — not counted as a pass'); else verdict(false, 'empty space must be open', JSON.stringify(z));
console.log('\n──────────────────────────────────────────────');
console.log('§W-TEAM-TRIAL-LIMIT ' + (fails || !judged ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails);
process.exit(fails || !judged ? 1 : 0);
