// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-EINVOICE witness (prompts/RESUME_HR_BIM_ASSET.md §PILLAR 3). Each check NAMES the
//   issue it proves. THE LOAD-BEARING CLAIM is E0 — every regulatory value traces to mock_rates.js with an
//   honest `_gate` tag (sourced/partial/open), never silently presented as authoritative. Run:
//   node hr_bim_asset/tests/witness_einvoice.js
'use strict';
var E = require('../einvoice'), MockRates = require('../mock_rates'), C = require('../connectors');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-EINVOICE ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ---- E0: NON-INVENT GATE — every mock_rates entry is honestly tagged, box 3 stays OPEN not asserted --------
var gates = MockRates.gateSummary();
ok('E0-all-gated', gates.every(function (g) { return ['sourced', 'partial', 'open'].indexOf(g.gate) >= 0 && !!g.citation; }),
  'every regulatory placeholder carries an explicit _gate + _citation — none silently presented as fact');
ok('E0-box3-stays-open', MockRates.MOCK_RATES.CLEARANCE_LEGAL_STATUS._gate === 'open' && MockRates.MOCK_RATES.CLEARANCE_LEGAL_STATUS.supportedModes.length === 2,
  'the load-bearing clearance-vs-self-attestation question is tagged OPEN, not forced to an answer; both modes are demo-able');
ok('E0-box7-sourced', MockRates.MOCK_RATES.PDPA_CROSSBORDER._gate === 'sourced', 'PDPA cross-border is the one genuinely sourced box, tagged accordingly');

// ---- E1: UBL-2.1-shaped document (box 2, sourced schema, not mock) ------------------------------------------
var supplier = { tin: 'C1234567890', name: 'Contoh Sdn Bhd', annualTurnover: 3000000 };
var buyer = { tin: 'IG12345678901', name: 'Pelanggan A' };
var doc = E.buildInvoice({ id: 'INV-T1', issueDate: '2026-06-15', supplier: supplier, buyer: buyer,
  lines: [{ item: 'Widget', qty: 2, unitPrice: 100 }], mode: 'CLEARANCE' });
ok('E1-ubl-shape', doc.invoiceTypeCode === '01' && doc.documentCurrencyCode === 'MYR' && doc.invoiceLine.length === 1 && doc.legalMonetaryTotal.payableAmount === 200,
  'buildInvoice() produces the MyInvois/UBL-shaped fields (invoiceTypeCode/currency/lines/legalMonetaryTotal), amount folds correctly (2×100=200)');
ok('E1-watermarked', doc._watermark === 'SAMPLE — NOT OFFICIAL', 'every built invoice is watermarked — impossible to mistake for a real filing');
ok('E1-mfrs-note-flagged', doc._mfrsNote._gate === 'partial', 'the MFRS compliance note carries its own honest gate tag, not asserted as verified');

// ---- E2: signed locally (the counter-proposal's first move — sign, don't stream) ----------------------------
var issuedA = E.issue(doc);
ok('E2-signed', !!issuedA.doc._signed.op_hash && !!issuedA.doc._signed.sig, 'issue() produces a locally-signed op (op_hash+sig), no central server round-trip');
ok('E2-clearance-uin', /^MOCK-UIN-/.test(issuedA.doc.uniqueIdentifierNumber), 'CLEARANCE mode stamps a mock UIN (demonstrates the operationally-confirmed pattern, box 3 legal status stays open)');
var docSelf = E.buildInvoice({ id: 'INV-T2', issueDate: '2026-06-16', supplier: supplier, buyer: buyer, lines: [{ item: 'Gadget', qty: 1, unitPrice: 50 }], mode: 'SELF_ATTESTED' });
var issuedSelf = E.issue(docSelf, issuedA.op.op_hash);
ok('E2-self-attested-no-uin', issuedSelf.doc.uniqueIdentifierNumber === undefined, 'SELF_ATTESTED mode issues without a UIN — the alternative the demo does NOT force a legal answer on');

// ---- E3: tamper-evident (amending the signed doc breaks the chain) ------------------------------------------
var forged = { op: Object.assign({}, issuedA.op, { params: Object.assign({}, issuedA.op.params) }) };
forged.op.params.doc = Object.assign({}, forged.op.params.doc, { legalMonetaryTotal: { payableAmount: 999999 } });
ok('E3-tamper-evident', C.verifyChain([forged.op]).ok === false, 'amending the signed invoice after issue breaks verifyChain');

// ---- E4: selective disclosure — sampler sees only the commitment, full detail needs explicit grant ----------
var samplerView = E.disclose(issuedA.doc, 'sampler');
var fullView = E.disclose(issuedA.doc, 'full');
ok('E4-sampler-no-lines', samplerView.full === undefined && !!samplerView.commitment, 'default (sampler) disclosure has NO line-item detail, only the commitment hash');
ok('E4-full-grant-has-lines', Array.isArray(fullView.full.invoiceLine) && fullView.full.invoiceLine.length === 1, 'an explicit "full" grant discloses the real line items');
ok('E4-commitment-matches-recompute', samplerView.commitment === E.commitment(issuedA.doc), 'the disclosed commitment == recomputed commitment over the full doc (provable without full disclosure)');
var tamperedTotal = Object.assign({}, issuedA.doc, { legalMonetaryTotal: Object.assign({}, issuedA.doc.legalMonetaryTotal, { payableAmount: issuedA.doc.legalMonetaryTotal.payableAmount + 1 }) });
ok('E4-commitment-detects-total-tamper', E.commitment(tamperedTotal) !== samplerView.commitment, 'changing the payable amount changes the commitment — a sampler CAN detect tampering without seeing line items');

// ---- E5: deterministic replay-hash audit (trust = recompute, not "the platform saw it") ---------------------
var seed1 = E.demoSeed(); var seed2 = E.demoSeed();
var audit1 = E.auditReplay(seed1.issued); var audit2 = E.auditReplay(seed2.issued);
ok('E5-replay-chain-ok', audit1.chainOk, 'the demo-seeded signed chain verifies end-to-end');
ok('E5-deterministic', audit1.fingerprint === audit2.fingerprint, 'two independent runs of the same spec → identical audit fingerprint (replay==replay)');
ok('E5-two-modes-seeded', seed1.issued[0].doc.mode === 'CLEARANCE' && seed1.issued[1].doc.mode === 'SELF_ATTESTED', 'demoSeed() exercises BOTH modes, not just one');

// ---- E6: box 1 mandate-phase lookup is a lookup only, never enforced/asserted --------------------------------
var phase = E.mandatePhaseFor(3000000);
ok('E6-mandate-phase-lookup', phase && phase.phase === 4 && phase._gate === 'partial', 'RM3,000,000 turnover (>1M, <=5M) resolves to Phase 4 (partial-sourced), gate-tagged, not silently asserted');
ok('E6-mandate-phase-honest-miss', E.mandatePhaseFor(0) === null, 'a non-positive turnover is honestly un-classified, never defaulted to a phase');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-EINVOICE ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
