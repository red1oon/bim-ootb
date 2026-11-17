#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-CORE-CLOCK-READS (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part A, A2).
// The source scan this file used to carry (a hand list of 22 files + a regex) is now W-CORE-PURE (witness_core_pure.js, bim-ootb #3180): one scanner, one list.
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "the Env clock helpers fall back to a wall clock when the transaction env has none (A-3 says they must throw and log §ENV_NO_DATE)".
// POPULATION: the REAL Env.nowStamp / Env.nowMs of erp/ad_callout.js, called with envs that have, and lack, a clock.
// RED CONTROL: the same "does it refuse?" check on an env that HAS a clock must say "not refused"; a check that calls every env refused is not a witness.
// Command: node erp/tests/witness_core_clock_reads.js
'use strict';
const path = require('path');
const ERP = path.join(__dirname, '..'), say = s => process.stdout.write(s + '\n');
const rows = [];
const A = require(path.join(ERP, 'ad_callout.js'));
const logs = []; const keep = A.RUNTIME.log; A.RUNTIME.log = s => logs.push(String(s));
const thr = fn => { try { fn(); return false; } catch (e) { return true; } };
const beh = [
  ['nowStamp uses env.now', A.Env.nowStamp({ now: '2026-11-13 00:30:00', nowMillis: 1 }) === '2026-11-13 00:30:00'],
  ['nowStamp derives the LOCAL stamp from nowMillis', A.Env.nowStamp({ nowMillis: new Date(2026, 10, 13, 0, 30, 0).getTime() }) === '2026-11-13 00:30:00'],
  ['nowStamp with no clock throws', thr(() => A.Env.nowStamp({}))], ['nowMs reads env.nowMillis', A.Env.nowMs({ nowMillis: 7 }) === 7], ['nowMs with no clock throws', thr(() => A.Env.nowMs({}))],
];
A.RUNTIME.log = keep;
const noDateLogs = logs.filter(l => l.indexOf('§ENV_NO_DATE') === 0).length;
beh.forEach(b => { say('  §ENV_NOW_HELPER case="' + b[0] + '" ok=' + (b[1] ? 'Y' : 'N')); rows.push({ name: 'helper: ' + b[0], bad: b[1] ? 0 : 1 }); });
say('  §ENV_NOW_HELPER no_date_log_lines=' + noDateLogs + ' (expected 2)'); rows.push({ name: 'helper: §ENV_NO_DATE logged on both refusals', bad: noDateLogs === 2 ? 0 : 1 });
const { Witness } = require(path.join(__dirname, '..', '..', 'witness_kit', 'contract.js'));
Witness('CORE_CLOCK_READS')
  .population(() => rows)
  .schema({ type: 'object', required: ['name', 'bad'], properties: { name: { type: 'string', minLength: 1 }, bad: { type: 'integer', minimum: 0 } } })
  .invariant('the Env helpers read the env clock and refuse a missing one with §ENV_NO_DATE', rs => rs.every(r => r.bad === 0))
  .redControl(rs => rs.map((r, i) => i === 0 ? Object.assign({}, r, { bad: thr(() => A.Env.nowStamp({ now: '2026-11-13 00:30:00' })) ? 0 : 1 }) : r))
  .run();
