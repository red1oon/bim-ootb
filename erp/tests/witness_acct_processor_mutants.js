// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — the mutant table of W-ACCT-PROCESSOR (witness_acct_processor.js, ACCTP_MUTANTS=1). Each entry rewrites the SHIPPED source in a mirror dir of COPIES (the text must be found exactly `count` times, default 1,
//   else NOT-APPLIED = proves nothing), then the witness re-runs in a child; one of the named checks ("case.key") must print FAIL. A child that crashes without its § verdict line is NOT a kill. READ THE LOG: §ACCTP-MUTANT lines.
'use strict';
var P = 'processes/ClientAcctProcessor.js', ML = 'model_layer.js';
module.exports = [
 { name: 'A01-switch-ignored', kills: ['SWITCH.queued-env', 'SWITCH.queued-sysconfig'], what: 'Complete posts whatever CLIENT_ACCOUNTING says (the switch is ignored)',
   edits: [{ file: ML, from: "!trx.env.noPost && ca.mode === 'I') {", to: '!trx.env.noPost) {' }] },
 { name: 'A02-table-filter-ignored', kills: ['RUN.x1-posted'], what: 'the AD_Table_ID parameter filter is ignored: the payment is posted by the Invoice-only run',
   edits: [{ file: P, from: 'self.p_AD_Table_ID !== 0 && self.p_AD_Table_ID !== Number(tb.id)', to: 'false', count: 2 }] },
 { name: 'A03-posted-filter-widened', kills: ['RUN.x1-posted'], what: "the Posted IN ('N','d') filter also takes Posted Y: every posted invoice is re-presented",
   edits: [{ file: P, from: "posted IN ('N','d')", to: "posted IN ('N','d','Y')", count: 2 }] },
 { name: 'A04-disabled-not-refused', kills: ['SWITCH.disabled'], what: 'MClient.isClientAccounting() guard dropped: the processor runs with CLIENT_ACCOUNTING=D',
   edits: [{ file: P, from: "if (!(ca.mode === 'I' || ca.mode === 'Q')) throw", to: 'if (false) throw' }] },
 { name: 'A05-processedon-not-sorted', kills: ['RUN.processedon-order'], what: 'the ProcessedOn values are not sorted: documents post in discovery order',
   edits: [{ file: P, from: 'processedOns.sort(function (a, b) { return a - b; });', to: '' }] },
 { name: 'A06-first-error-aborts', kills: ['RUN.all-run', 'RUN.rerun'], what: 'one document that cannot be posted aborts the whole run (no per-document transaction)',
   edits: [{ file: P, from: 'if (!ok) countError[tb.name]++;', to: "if (!ok) { countError[tb.name]++; throw new Error('abort on first error'); }" }] },
 { name: 'A07-errors-not-counted-in-answer', kills: ['RUN.all-run', 'RUN.rerun'], what: 'the (Errors=n) suffix of the answer is dropped',
   edits: [{ file: P, from: "(countError[tb.name] > 0 ? '(Errors=' + countError[tb.name] + ')' : '')", to: "''" }] },
 { name: 'A08-two-second-guard-dropped', kills: ['RUN.two-second-guard'], what: 'the "go back 2 seconds" guard is dropped: a document completed a second ago is posted',
   edits: [{ file: P, from: 'var value = nowMs - 2000;', to: 'var value = nowMs + 1e12;' }] },
 { name: 'A09-sql-skips-silent', kills: ['RUN.skips-named'], what: 'the failing-SELECT tables are skipped without a § line',
   edits: [{ file: P, from: "trx.say('§ACCTP-SQL-ERROR '", to: "trx.say('§ACCTP-X '" }] },
 { name: 'A10-missing-row-defaults-to-I', kills: ['SWITCH.queued-sysconfig'], what: 'a table with no CLIENT_ACCOUNTING row is treated as I instead of the Java default Q',
   edits: [{ file: ML, from: "if (hasTable) return { mode: 'Q'", to: "if (hasTable) return { mode: 'I'" }] },
 { name: 'A11-system-row-beats-client-row', kills: ['SWITCH.queued-sysconfig'], what: 'the System row wins over the client row (ORDER BY ad_client_id ASC)',
   edits: [{ file: ML, from: 'ORDER BY ad_client_id DESC", [trx.env.client]', to: 'ORDER BY ad_client_id ASC", [trx.env.client]' }] },
 { name: 'A12-env-override-ignored', kills: ['SWITCH.queued-env', 'SWITCH.disabled'], what: 'trx.env.clientAccounting is ignored',
   edits: [{ file: ML, from: "if (trx.env.clientAccounting != null && trx.env.clientAccounting !== '') return", to: 'if (false) return' }] },
 { name: 'A13-two-edits-one-file', kills: ['SWITCH.disabled', 'RUN.processedon-order'], what: 'HARNESS PROOF: two edits of ONE file (guard dropped AND sort dropped) both apply',
   edits: [{ file: P, from: "if (!(ca.mode === 'I' || ca.mode === 'Q')) throw", to: 'if (false) throw' }, { file: P, from: 'processedOns.sort(function (a, b) { return a - b; });', to: '' }] }
];
