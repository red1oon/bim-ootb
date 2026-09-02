// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — §PILLAR 3 E-INVOICE STUB (prompts/RESUME_HR_BIM_ASSET.md §PILLAR 3). MOCKUP, NOT A
//   CERTIFIED LHDN FILER (user decision 2026-07-03) — demonstrates the local-first counter-proposal
//   MECHANISM against a MyInvois-shaped document, not a real filing. Every regulatory value comes from
//   `mock_rates.js` (the single seam a later real interested party overwrites); this file never inlines a
//   statutory number. Document field names follow the box-2 SOURCED UBL 2.1 / MyInvois Invoice shape
//   (sdk.myinvois.hasil.gov.my) — that part is real schema, not mock; only the RATES/legal-mode are mock.
//   The counter-proposal thesis (§PILLAR 3 table): sign locally instead of streaming to a central server;
//   gov = verifier+sampler instead of ingesting every line; selective disclosure instead of full real-time
//   visibility; replay-hash audit instead of "the platform saw it"; MFRS-reconciled books either way.
//   Read the log after any run.
'use strict';
(function () {
var _r = (typeof require !== 'undefined');
var C = _r ? require('./connectors') : (self.HrConnectors);
var W = _r ? require('./watermark') : (self.HbaWatermark);
var MOCK = (_r ? require('./mock_rates') : (self.HbaMockRates)).MOCK_RATES;

// ---- box 2 (sourced): a MyInvois-shaped Invoice document, UBL 2.1 field names, minimal representative subset ----
// spec = { id, issueDate, supplier:{tin,name}, buyer:{tin,name}, lines:[{item,qty,unitPrice}], mode, locale }
function buildInvoice(spec) {
  var lines = (spec.lines || []).map(function (l) {
    var lineTotal = C._util ? Math.round(l.qty * l.unitPrice * 100) / 100 : l.qty * l.unitPrice;
    return { item: l.item, invoicedQuantity: l.qty, unitPrice: l.unitPrice, lineExtensionAmount: lineTotal };
  });
  var taxExclusiveAmount = round2(lines.reduce(function (s, l) { return s + l.lineExtensionAmount; }, 0));
  var doc = {
    id: spec.id, invoiceTypeCode: '01', documentCurrencyCode: 'MYR', issueDate: spec.issueDate,
    accountingSupplierParty: spec.supplier, accountingCustomerParty: spec.buyer,
    invoiceLine: lines,
    legalMonetaryTotal: { taxExclusiveAmount: taxExclusiveAmount, taxInclusiveAmount: taxExclusiveAmount, payableAmount: taxExclusiveAmount },
    // box 6 (MFRS) — attached as a compliance note, not asserted as a verified claim (see mock_rates._gate).
    _mfrsNote: { standard: 'MFRS 15', applicableDate: MOCK.MFRS_NOTE.applicableDate, steps: MOCK.MFRS_NOTE.steps, _gate: MOCK.MFRS_NOTE._gate, _citation: MOCK.MFRS_NOTE._citation },
    // box 1 (mandate) — a lookup, not enforced (this is a demo; a real filer would gate submission on it).
    _mandatePhase: mandatePhaseFor(spec.supplier && spec.supplier.annualTurnover),
    mode: spec.mode === 'SELF_ATTESTED' ? 'SELF_ATTESTED' : 'CLEARANCE' // box 3 — caller's choice, not asserted by us
  };
  return W ? W.stamp(doc, spec.locale || 'en') : doc;
}
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// box 1 lookup — which MOCK_RATES.MANDATE_PHASES band a turnover falls into (partial-sourced, see mock_rates.js).
function mandatePhaseFor(turnover) {
  if (!(turnover > 0)) return null;
  var hit = MOCK.MANDATE_PHASES.table.filter(function (p) { return turnover > p.turnoverAbove && (!p.turnoverUpTo || turnover <= p.turnoverUpTo); })[0];
  return hit ? { phase: hit.phase, from: hit.from, _gate: MOCK.MANDATE_PHASES._gate, _citation: MOCK.MANDATE_PHASES._citation } : null;
}

// ---- the counter-proposal mechanism: sign locally instead of streaming every line to a central server -------
// mode='CLEARANCE': stamps a UIN as if LHDN validated it (near-real-time, per the FAQ's operational description).
// mode='SELF_ATTESTED': no UIN — the invoice is valid at local signing, submission is a separate reporting step.
// Neither mode asserts which the LAW requires (box 3 is OPEN) — the demo can run either way.
function issue(doc, prevHash) {
  var op = { id: doc.id, ts: 1, cls: 'EINVOICE', verb: 'ISSUE', target: doc.id, params: { doc: doc, mode: doc.mode } };
  C.sign(op, prevHash || 'GENESIS');
  var issued = Object.assign({}, doc, { _signed: { op_hash: op.op_hash, sig: op.sig, prev_hash: op.prev_hash } });
  if (doc.mode === 'CLEARANCE') issued.uniqueIdentifierNumber = 'MOCK-UIN-' + op.op_hash.slice(0, 12); // box 2/3: LHDN-style UIN, mock value
  return { op: op, doc: issued };
}

// ---- selective disclosure: the counter-proposal's core move — prove the legally-required commitment,   ----
// withhold line-item detail, unless the caller (owner/CAS capability) explicitly grants full access.
function commitment(doc) {
  return C._util.sha256(C._util.stableStringify({
    id: doc.id, issueDate: doc.issueDate, taxInclusiveAmount: doc.legalMonetaryTotal.taxInclusiveAmount,
    payableAmount: doc.legalMonetaryTotal.payableAmount, supplierTin: (doc.accountingSupplierParty || {}).tin
  }));
}
// grant='sampler' → commitment only (what a gov audit-sampler sees by default, per the thesis table).
// grant='full'    → full line-item detail (only when the owner/CAS capability explicitly discloses more).
function disclose(doc, grant) {
  var out = { id: doc.id, commitment: commitment(doc) };
  if (grant === 'full') out.full = doc;
  return out;
}

// ---- deterministic replay-hash audit: trust = recompute from the signed log, not "the platform saw it" ----
function auditReplay(issuedOps) {
  var chain = issuedOps.map(function (o) { return o.op; });
  var verify = C.verifyChain(chain);
  var fp = C._util.sha256(C._util.stableStringify(chain.map(function (o) { return { id: o.id, h: o.op_hash }; })));
  return { chainOk: verify.ok, fingerprint: fp };
}

// ---- demo seed: one CLEARANCE-mode and one SELF_ATTESTED-mode invoice, so both modes are exercised ----------
function demoSeed() {
  C.reset();
  var supplier = { tin: 'C1234567890', name: 'Contoh Sdn Bhd (mock)', annualTurnover: 3000000 };
  var buyerA = { tin: 'IG12345678901', name: 'Pelanggan A (mock)' };
  var docA = buildInvoice({ id: 'INV-0001', issueDate: '2026-06-15', supplier: supplier, buyer: buyerA,
    lines: [{ item: 'Design consultation', qty: 1, unitPrice: 1200 }], mode: 'CLEARANCE' });
  var issuedA = issue(docA);
  var buyerB = { tin: 'IG98765432109', name: 'Pelanggan B (mock)' };
  var docB = buildInvoice({ id: 'INV-0002', issueDate: '2026-06-16', supplier: supplier, buyer: buyerB,
    lines: [{ item: 'BIM model review', qty: 3, unitPrice: 450 }], mode: 'SELF_ATTESTED' });
  var issuedB = issue(docB, issuedA.op.op_hash);
  return { issued: [issuedA, issuedB], log: C.log() };
}

var E = { buildInvoice: buildInvoice, issue: issue, commitment: commitment, disclose: disclose,
  auditReplay: auditReplay, mandatePhaseFor: mandatePhaseFor, demoSeed: demoSeed };
if (typeof module === 'object' && module.exports) module.exports = E;
else (typeof self !== 'undefined' ? self : this).HbaEInvoice = E;
})();
