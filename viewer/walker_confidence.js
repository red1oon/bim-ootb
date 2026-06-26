/**
 * BIM OOTB — Walker Confidence (the calibrated, earned confidence marker)
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * Implements prompts/WALKER_GUARDS_ROSETTASTONE_SPEC.md §4 — every walked element carries a
 * confidence ∈ [0,1]. The RAW number is f(guard margins + regulatory margin); but a raw number is
 * MEANINGLESS until it PREDICTS correctness. So this module CALIBRATES it against the RosettaStone:
 * bin walked elements by raw confidence, measure the ACTUAL walk-back match-rate per bin (the
 * reliability curve), compute Expected Calibration Error, and — because raw guard margins measure
 * GEOMETRIC safety, not oracle-match probability — fit a MONOTONIC (isotonic / PAV) recalibration
 * map so "0.8" means ~80% right. NEVER display the raw number un-calibrated (the fake-gauge trap).
 *
 * Witness: scripts/witness_walker_confidence.js (W-CONFIDENCE-CALIBRATED). The negative control —
 * a deliberately mis-set confidence — must FAIL the ECE bar (proves the test bites).
 * Oracle = pristine extracted.db, NEVER output.db. This file is NEW; it edits no existing file.
 */
'use strict';

function _clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

// ── SHIPPED calibration map (calibrate ONCE on the RosettaStone, apply LIVE where there is no oracle).
// These isotonic/PAV blocks are the FIT on REAL Terminal STR walked elements (columns+girders) — a
// DERIVED artifact, NOT an invented constant: scripts/witness_walker_confidence.js regenerates them
// from Terminal_extracted.db and ASSERTS this constant reproduces (the reproducibility gate). Each
// block = { xhi, p } : a raw confidence ≤ xhi maps to P(correct)=p (non-decreasing). The spec mandate:
// "confidence is CALIBRATED on the RosettaStone BEFORE it is ever shown." ── provenance: derived:terminal-fit
var WC_CALIBRATION = [
  { xhi: 0.117052, p: 0.666667 },
  { xhi: 0.911109, p: 0.929293 },
  { xhi: 1.000000, p: 1.000000 }
];

// Apply a calibration map (blocks of {xhi,p}) to a raw confidence → calibrated P(correct) ∈ [0,1].
// Defaults to the shipped Terminal map. This is what the live Outliner shows — never the raw number.
function wcCalibrated(rawConf, map) {
  var blocks = map || WC_CALIBRATION;
  var x = _clamp01(rawConf);
  for (var i = 0; i < blocks.length; i++) if (x <= blocks[i].xhi) return blocks[i].p;
  return blocks.length ? blocks[blocks.length - 1].p : x;
}

// ── RAW confidence: weakest-link of the geometric guard margin and the regulatory margin. ──
// guardMargin ∈ [0,1] (min guard margin from walker_guards.wgEvaluate); ruleMargin ∈ [0,1] (how far
// the member sits under its code limit — e.g. (maxSpan−span)/maxSpan). Product = a candidate that is
// both geometrically safe AND code-comfortable scores high. This is the number that is NOT yet
// trustworthy — calibration below makes it so.
function wcRaw(guardMargin, ruleMargin) {
  return _clamp01(guardMargin) * _clamp01(ruleMargin == null ? 1 : ruleMargin);
}

// ── Reliability curve + ECE. samples: [{ conf, correct(0|1) }]. Equal-width bins over [0,1]. ──
// ECE = Σ (n_bin/N) · |mean(conf in bin) − match-rate in bin| — the gap the marker is honest iff small.
function wcReliability(samples, nBins) {
  nBins = nBins || 10;
  var bins = [];
  for (var b = 0; b < nBins; b++) bins.push({ lo: b / nBins, hi: (b + 1) / nBins, n: 0, sumConf: 0, sumCorrect: 0 });
  samples.forEach(function (s) {
    var idx = Math.min(nBins - 1, Math.floor(s.conf * nBins));
    bins[idx].n++; bins[idx].sumConf += s.conf; bins[idx].sumCorrect += s.correct;
  });
  var N = samples.length || 1, ece = 0;
  bins.forEach(function (bin) {
    if (!bin.n) { bin.predicted = null; bin.actual = null; return; }
    bin.predicted = bin.sumConf / bin.n;     // mean confidence said in this bin
    bin.actual = bin.sumCorrect / bin.n;     // actual match-rate measured against the oracle
    ece += (bin.n / N) * Math.abs(bin.predicted - bin.actual);
  });
  return { bins: bins, ece: ece, n: samples.length };
}

// ── Isotonic recalibration via Pool-Adjacent-Violators. Fits a non-decreasing map rawConf→P(correct)
//    on the oracle-labelled samples. Returns a step function (and its blocks) you apply to any raw conf. ──
function wcFitIsotonic(samples) {
  var s = samples.slice().sort(function (a, b) { return a.conf - b.conf; });
  var blocks = [];   // each: { sum, n, xhi } ; mean = sum/n is non-decreasing across blocks
  s.forEach(function (p) {
    blocks.push({ sum: p.correct, n: 1, xhi: p.conf });
    while (blocks.length > 1) {
      var last = blocks[blocks.length - 1], prev = blocks[blocks.length - 2];
      if (prev.sum / prev.n >= last.sum / last.n) {   // violation of non-decreasing → pool
        blocks.pop(); blocks.pop();
        blocks.push({ sum: prev.sum + last.sum, n: prev.n + last.n, xhi: last.xhi });
      } else break;
    }
  });
  var map = function (x) {
    for (var i = 0; i < blocks.length; i++) if (x <= blocks[i].xhi) return blocks[i].sum / blocks[i].n;
    return blocks.length ? blocks[blocks.length - 1].sum / blocks[blocks.length - 1].n : x;
  };
  return { map: map, blocks: blocks };
}

// ── ECE of a sample set under an arbitrary confidence function (used for raw, calibrated, control). ──
function wcEce(samples, confFn, nBins) {
  var mapped = samples.map(function (s) { return { conf: _clamp01(confFn(s)), correct: s.correct }; });
  return wcReliability(mapped, nBins).ece;
}

var _wcApi = {
  WC_CALIBRATION: WC_CALIBRATION, wcCalibrated: wcCalibrated,
  wcRaw: wcRaw, wcReliability: wcReliability, wcFitIsotonic: wcFitIsotonic, wcEce: wcEce
};
if (typeof module !== 'undefined' && module.exports) module.exports = _wcApi;
if (typeof window !== 'undefined') Object.keys(_wcApi).forEach(function (k) { window[k] = _wcApi[k]; });
