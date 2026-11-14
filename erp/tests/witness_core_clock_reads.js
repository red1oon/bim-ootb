#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-CORE-CLOCK-READS (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part A, A2; precursor of A3's W-CORE-PURE).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "the migrated core files still read a wall clock when the transaction env has none (A-3 says they must throw §ENV_NO_DATE)".
// POPULATION: the REAL source of every file migrated so far by A2 (list below) scanned for a zero-argument clock read (new Date(), Date.now(), performance.now(), Math.random,
//   randomUUID), plus the REAL Env.nowStamp / Env.nowMs called with envs that have, and lack, a clock.
// RED CONTROL: the same scan on a planted `new Date().getTime()` must count 1; a scan that cannot see a planted read is not a witness.
// INCONCLUSIVE if a listed file cannot be read (0 bytes scanned).
// Command: node erp/tests/witness_core_clock_reads.js
'use strict';
const fs = require('fs'), path = require('path');
const ERP = path.join(__dirname, '..'), say = s => process.stdout.write(s + '\n');
const MIGRATED = ['processes/ImportBankStatement.js', 'processes/ImportGLJournal.js', 'processes/ImportInventory.js', 'processes/ImportInvoice.js', 'processes/ImportOrder.js', 'processes/ImportPayment.js', 'processes/ImportProduct.js', 'processes/ClientAcctProcessor.js', 'processes/InvoiceGenerate.js', 'processes/InOutGenerate.js', 'model_asi.js', 'doc_poster.js'];
const CLOCK = /(?<![\w.])new Date\(\s*\)|\bDate\.now\(\s*\)|\bperformance\.now\(\s*\)|\bMath\.random\(\s*\)|\brandomUUID\(\s*\)/g;
const scan = src => (src.replace(/\/\/[^\n]*/g, '').match(CLOCK) || []).length;
const rows = MIGRATED.map(f => { const src = fs.readFileSync(path.join(ERP, f), 'utf8'); const n = scan(src); say('  §CORE_CLOCK file=erp/' + f + ' bytes=' + src.length + ' clockReads=' + n); return { name: f, bytes: src.length, clockReads: n }; });
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
beh.forEach(b => { say('  §ENV_NOW_HELPER case="' + b[0] + '" ok=' + (b[1] ? 'Y' : 'N')); rows.push({ name: 'helper: ' + b[0], bytes: 1, clockReads: b[1] ? 0 : 1 }); });
say('  §ENV_NOW_HELPER no_date_log_lines=' + noDateLogs + ' (expected 2)'); rows.push({ name: 'helper: §ENV_NO_DATE logged on both refusals', bytes: 1, clockReads: noDateLogs === 2 ? 0 : 1 });
const { Witness } = require(path.join(__dirname, '..', '..', 'witness_kit', 'contract.js'));
Witness('CORE_CLOCK_READS')
  .population(() => rows)
  .schema({ type: 'object', required: ['name', 'bytes', 'clockReads'], properties: { bytes: { type: 'integer', minimum: 1 }, clockReads: { type: 'integer', minimum: 0 } } })
  .invariant('no migrated core file reads a wall clock, and the Env helpers refuse a missing clock with §ENV_NO_DATE', rs => rs.every(r => r.clockReads === 0))
  .redControl(rs => rs.map((r, i) => i === 0 ? Object.assign({}, r, { clockReads: scan('var t = new Date().getTime();') }) : r))
  .run();
