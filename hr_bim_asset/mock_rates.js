// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — §PILLAR 3 REGULATORY PLACEHOLDER SEAM (prompts/RESUME_HR_BIM_ASSET.md §RESEARCH GATE).
//   Pillar 3 (E-Invoice/PCB/EPF/SOCSO/EIS/MFRS/PDPA) is a MOCKUP, not a certified filer (user decision
//   2026-07-03: stub it, don't chase lawyer-grade closure for a demo). EVERY value below is a MOCK_ constant:
//   either a genuinely-sourced fact (cited) or an unverified placeholder (flagged) — never silently presented
//   as authoritative. `_gate` mirrors the §RESEARCH GATE checklist state: 'sourced' | 'partial' | 'open'.
//   A later interested party (accountant / Malaysian tax lawyer / MyInvois integration partner) is the
//   intended seam to overwrite these with the real mapping — that's why every entry is one flat object here,
//   not scattered through the engine files. Read the log after any run.
'use strict';

var MOCK_RATES = {
  // box 1 — MyInvois mandate phase/turnover bands. _gate=partial: corroborated by multiple independent
  // secondary sources (vatcalc.com, ifca.asia, cleartax.com, goldsoft.com.my); a primary-source LHDN citation
  // for the FULL grid failed adversarial re-verification (research pass 2026-07-03) — only Phase 3's band
  // was directly confirmed against hasil.gov.my. Re-fetch the LHDN timeline page fresh before quoting dates publicly.
  MANDATE_PHASES: {
    _gate: 'partial',
    _citation: 'hasil.gov.my/en/e-invoice/implementation-of-e-invoicing-in-malaysia/e-invoice-implementation-timeline/ (Phase 3 band directly confirmed; full grid secondary-sourced only)',
    table: [
      { phase: 1, turnoverAbove: 100000000, from: '2024-08-01' },
      { phase: 2, turnoverAbove: 25000000, turnoverUpTo: 100000000, from: '2025-01-01' },
      { phase: 3, turnoverAbove: 5000000, turnoverUpTo: 25000000, from: '2025-07-01' },
      { phase: 4, turnoverAbove: 1000000, turnoverUpTo: 5000000, from: '2026-01-01' }
    ]
  },

  // box 3 — the load-bearing legal question: does the statute MANDATE real-time clearance, or is a
  // deferred/self-attested model legally reachable? _gate=open. A 2026-07-03 follow-up pass found a genuine
  // primary-source fragment — Income Tax Act 1967 §82C(1) — creating a codified DUTY to issue an e-invoice,
  // but did NOT resolve whether validation/clearance is a condition of legal validity or a separate reporting
  // step. NOT resolvable by further research alone per the user's own gate note — needs qualified legal
  // opinion before any public claim. The demo therefore supports BOTH modes rather than asserting an answer.
  CLEARANCE_LEGAL_STATUS: {
    _gate: 'open',
    _citation: 'Income Tax Act 1967 §82C(1) (via myttx.customs.gov.my finance-act text, 2026-07-03 pass) — duty to issue confirmed; clearance-vs-self-attestation legality NOT resolved',
    note: 'OPEN — requires qualified Malaysian tax legal opinion, not resolvable by research alone',
    supportedModes: ['CLEARANCE', 'SELF_ATTESTED']
  },

  // box 4 — PCB (Potongan Cukai Bulanan). _gate=partial: formula STRUCTURE + YA2026 relief-item changes are
  // primary-sourced (LHDN's official spec PDF); the numeric bracket table below is the SAME placeholder the
  // module has used since the payroll-alpha baseline (ad_payroll.js/witness_run.js) — reused, not re-invented,
  // but the actual e-Jadual PCB numeric schedule was never primary-confirmed. Keep these exact numbers: they
  // are the accepted witness baseline (AD1: EMP001 gross=5200/net=4234) — any change must re-derive that fixture.
  PCB_BRACKETS: {
    _gate: 'partial',
    _citation: 'hasil.gov.my/media/arvlrzh5/spesifikasi-kaedah-pengiraan-berkomputer-pcb-2026.pdf (formula structure confirmed; numeric bracket table below is an UNVERIFIED placeholder, reused from the pre-existing payroll-alpha baseline)',
    table: [[2000, 0], [4000, 0.03], [6000, 0.08], [1e12, 0.13]]
  },

  // box 5a — EPF (KWSP). _gate=open: NOT researched at all in either pass — the flat 11% below is the
  // pre-existing payroll-alpha placeholder (ad_payroll.js), carried forward unchanged, not a sourced rate.
  EPF_RATE: { _gate: 'open', _citation: 'NOT RESEARCHED — kwsp.gov.my official Third Schedule rate table never pulled', pct: 0.11 },

  // box 5b — SOCSO + EIS (PERKESO). _gate=partial: the wage ceiling change (RM5,000→RM6,000, eff. 1 Oct 2024)
  // is primary-confirmed (perkeso.gov.my); the %-rates below are secondary-source only (PERKESO's own page
  // links out to Act 4/Act 800 PDFs that were never fetched) — genuinely unverified against the primary schedule.
  SOCSO_RATE: { _gate: 'partial', _citation: 'perkeso.gov.my/en/rate-of-contribution.html (ceiling confirmed; %-rate below is SECONDARY-SOURCE ONLY, not pulled from Act 4)', wageCeiling: 6000, employeePct: 0.005, employerPct: 0.0175 },
  EIS_RATE: { _gate: 'partial', _citation: 'perkeso.gov.my/en/rate-of-contribution.html (ceiling confirmed; %-rate below is SECONDARY-SOURCE ONLY, not pulled from Act 800)', wageCeiling: 6000, employeePct: 0.002, employerPct: 0.002 },

  // box 6 — MFRS 15 (Revenue from Contracts with Customers, IFRS-15-aligned). _gate=partial: the applicable
  // date is primary-confirmed (masb.org.my); the substantive 5-step recognition model text was never fetched
  // (only a 1-page ancillary staff FAQ was found, twice) — the note below states the model as commonly known,
  // NOT independently re-verified against MASB's full standard text.
  MFRS_NOTE: {
    _gate: 'partial',
    _citation: 'masb.org.my/pages.php?id=89 (applicable date confirmed 1 Jan 2018; the 5-step model text below is UNVERIFIED against the actual standard — only an ancillary 1-page staff FAQ was ever fetched)',
    applicableDate: '2018-01-01',
    steps: ['identify the contract', 'identify performance obligations', 'determine transaction price', 'allocate transaction price', 'recognize revenue as/when obligations are satisfied']
  },

  // box 7 — PDPA Malaysia cross-border transfer. _gate=sourced: primary-confirmed (JPDP consultation paper +
  // multiple law-firm corroboration) — the old Minister-gazetted whitelist was deleted; transfer is now a
  // controller self-assessed two-limb adequacy test (no pre-approval). This is the one box that's genuinely
  // ready to build against, not a mock.
  PDPA_CROSSBORDER: {
    _gate: 'sourced',
    _citation: 'pdp.gov.my JPDP-FSB-241001-Cross-Border-PCP-ENG-TC.pdf — PDPA §129 as amended by the Personal Data Protection (Amendment) Act 2024, effective 2025-04-01',
    whitelistRemoved: true,
    adequacyTest: 'self-assessed: destination law substantially similar to PDPA, OR adequate protection at least equivalent',
    selfAssessmentValidYears: 3
  }
};

function gateSummary() {
  return Object.keys(MOCK_RATES).map(function (k) { return { key: k, gate: MOCK_RATES[k]._gate, citation: MOCK_RATES[k]._citation }; });
}

var M = { MOCK_RATES: MOCK_RATES, gateSummary: gateSummary };
if (typeof module === 'object' && module.exports) module.exports = M;
else (typeof self !== 'undefined' ? self : this).HbaMockRates = M;
