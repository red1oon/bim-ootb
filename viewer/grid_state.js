// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * grid_state.js — §S270 Grid State Module
 * Implementing REFACTOR_DOC_CANVAS.md §3.1
 *
 * Owns all grid position/label/original tracking. Single source of truth
 * for "where are the grid lines and where were they."
 *
 * Invariants:
 *   1. Originals are always label-keyed. No index-based lookup.
 *   2. addLine() registers the new line's original position immediately.
 *   3. getDeltas() returns only lines where |absDelta| > 0.01.
 *   4. Dedup: addLine() rejects positions within minGap of existing lines.
 *   5. Cap: max 15 lines per axis.
 */
(function(exports) {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────
  var _xPositions = [];
  var _zPositions = [];
  var _xLabels = [];
  var _zLabels = [];
  var _origByLabel = {};  // label → original position (immune to re-sort)
  var _ceilingY = null;   // Y-axis grid position (eave height), null = not placed

  // ── Init / Reset ──────────────────────────────────────────────────────────

  /**
   * init — set up grid state with initial positions and labels.
   * @param {number[]} xPositions
   * @param {number[]} zPositions
   * @param {string[]} [xLabels] — optional, auto-generated if omitted
   * @param {string[]} [zLabels] — optional, auto-generated if omitted
   */
  function init(xPositions, zPositions, xLabels, zLabels) {
    _xPositions = xPositions.slice();
    _zPositions = zPositions.slice();
    _xLabels = xLabels ? xLabels.slice() : _generateXLabels(xPositions.length);
    _zLabels = zLabels ? zLabels.slice() : _generateZLabels(zPositions.length);
    _origByLabel = {};
    _ceilingY = null;
  }

  /**
   * reset — clear all state (called on deactivate).
   */
  function reset() {
    _xPositions = [];
    _zPositions = [];
    _xLabels = [];
    _zLabels = [];
    _origByLabel = {};
    _ceilingY = null;
  }

  // ── Snapshot Originals ────────────────────────────────────────────────────

  /**
   * snapshotOriginals — record current positions as originals, keyed by label.
   * Called once at activate time. New lines added later get their insertion
   * position registered in addLine().
   */
  function snapshotOriginals() {
    _origByLabel = {};
    for (var i = 0; i < _xPositions.length; i++) {
      _origByLabel[_xLabels[i] || ('X' + i)] = _xPositions[i];
    }
    for (var j = 0; j < _zPositions.length; j++) {
      _origByLabel[_zLabels[j] || ('Z' + j)] = _zPositions[j];
    }
  }

  // ── Add / Remove Lines ────────────────────────────────────────────────────

  /**
   * addLine — insert a grid line at position, maintaining sorted order.
   * @param {string} axis — 'x' or 'z'
   * @param {number} position — world coordinate
   * @param {string} [label] — optional, auto-generated if omitted
   * @param {number} [minGap] — minimum distance from existing lines (default 2.0)
   * @returns {{label: string, index: number}|null} — null if rejected (too close or cap)
   */
  function addLine(axis, position, label, minGap) {
    var arr = axis === 'x' ? _xPositions : _zPositions;
    var labels = axis === 'x' ? _xLabels : _zLabels;
    minGap = minGap !== undefined ? minGap : 2.0;

    // Dedup: reject if too close to existing line
    for (var i = 0; i < arr.length; i++) {
      if (Math.abs(arr[i] - position) < minGap) return null;
    }

    // Cap at 15 per axis
    if (arr.length >= 15) return null;

    // Insert in sorted order
    var idx = 0;
    while (idx < arr.length && arr[idx] < position) idx++;
    arr.splice(idx, 0, position);

    // Generate label if not provided
    if (!label) {
      if (axis === 'x') {
        label = _nextXLabel(idx, labels);
      } else {
        label = String(idx + 1);
        // renumber all Z labels
        for (var j = 0; j < labels.length; j++) labels[j] = String(j + 1);
      }
    }
    labels.splice(idx, 0, label);

    // Register original position immediately
    _origByLabel[label] = position;

    return { label: label, index: idx };
  }

  /**
   * removeLine — remove a grid line by label.
   * @param {string} axis — 'x' or 'z'
   * @param {string} label
   * @returns {boolean} — true if removed
   */
  function removeLine(axis, label) {
    var arr = axis === 'x' ? _xPositions : _zPositions;
    var labels = axis === 'x' ? _xLabels : _zLabels;

    var idx = labels.indexOf(label);
    if (idx < 0) return false;

    arr.splice(idx, 1);
    labels.splice(idx, 1);
    delete _origByLabel[label];
    return true;
  }

  // ── Delta Computation ─────────────────────────────────────────────────────

  /**
   * @typedef {Object} GridDelta
   * @property {string} label — grid label (e.g. 'A', 'B', '1')
   * @property {string} axis — 'x' or 'z'
   * @property {number} absDelta — currentPos - originalPos
   * @property {number} currentPos
   * @property {number} originalPos
   * @property {number} index — current array index
   */

  /**
   * getDeltas — compute per-line deltas using label-keyed originals.
   * @param {number} [threshold] — minimum |delta| to include (default 0.01)
   * @returns {GridDelta[]}
   */
  function getDeltas(threshold) {
    threshold = threshold !== undefined ? threshold : 0.01;
    var deltas = [];

    for (var i = 0; i < _xPositions.length; i++) {
      var xLbl = _xLabels[i] || ('X' + i);
      var xOrig = _origByLabel[xLbl] !== undefined ? _origByLabel[xLbl] : _xPositions[i];
      var xDelta = _xPositions[i] - xOrig;
      if (Math.abs(xDelta) >= threshold) {
        deltas.push({
          label: xLbl, axis: 'x', absDelta: xDelta,
          currentPos: _xPositions[i], originalPos: xOrig, index: i
        });
      }
    }

    for (var j = 0; j < _zPositions.length; j++) {
      var zLbl = _zLabels[j] || ('Z' + j);
      var zOrig = _origByLabel[zLbl] !== undefined ? _origByLabel[zLbl] : _zPositions[j];
      var zDelta = _zPositions[j] - zOrig;
      if (Math.abs(zDelta) >= threshold) {
        deltas.push({
          label: zLbl, axis: 'z', absDelta: zDelta,
          currentPos: _zPositions[j], originalPos: zOrig, index: j
        });
      }
    }

    return deltas;
  }

  /**
   * getLines — build grid lines array for engine (using original positions).
   * @returns {Array<{id: string, axis: string, pos: number}>}
   */
  function getLines() {
    var lines = [];
    for (var i = 0; i < _xPositions.length; i++) {
      var xLbl = _xLabels[i] || ('X' + i);
      var xOrig = _origByLabel[xLbl] !== undefined ? _origByLabel[xLbl] : _xPositions[i];
      lines.push({ id: xLbl, axis: 'x', pos: xOrig });
    }
    for (var j = 0; j < _zPositions.length; j++) {
      var zLbl = _zLabels[j] || ('Z' + j);
      var zOrig = _origByLabel[zLbl] !== undefined ? _origByLabel[zLbl] : _zPositions[j];
      lines.push({ id: zLbl, axis: 'z', pos: zOrig });
    }
    if (_ceilingY !== null) {
      lines.push({ id: 'CEIL', axis: 'y', pos: _ceilingY });
    }
    return lines;
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  function getPositions() {
    return { x: _xPositions.slice(), z: _zPositions.slice() };
  }

  function getLabels() {
    return { x: _xLabels.slice(), z: _zLabels.slice() };
  }

  function setPosition(axis, index, newPos) {
    if (axis === 'x') _xPositions[index] = newPos;
    else _zPositions[index] = newPos;
  }

  function getOriginal(label) {
    return _origByLabel[label];
  }

  function getCeilingY() { return _ceilingY; }
  function setCeilingY(y) { _ceilingY = y; }

  /** getPosition(axis, index) — single-value read without copy overhead */
  function getPosition(axis, index) {
    return (axis === 'x' ? _xPositions : _zPositions)[index];
  }

  /** getLabel(axis, index) — single-value read */
  function getLabel(axis, index) {
    return (axis === 'x' ? _xLabels : _zLabels)[index];
  }

  /** getCount(axis) — number of lines on axis */
  function getCount(axis) {
    return (axis === 'x' ? _xPositions : _zPositions).length;
  }

  // ── Re-sort ───────────────────────────────────────────────────────────────

  /**
   * resortLabels — re-sort positions and regenerate clean label sequences.
   * Called after a drag that changes ordering.
   */
  function resortLabels() {
    // X: sort and regenerate A, B, C...
    var xPairs = _xPositions.map(function(p, i) { return { pos: p, lbl: _xLabels[i] }; });
    xPairs.sort(function(a, b) { return a.pos - b.pos; });

    _xPositions = xPairs.map(function(p) { return p.pos; });
    _xLabels = _generateXLabels(_xPositions.length);

    // Migrate originals: read old values first, then write new (avoid overwrite conflicts)
    var xOrigValues = [];
    for (var xi = 0; xi < xPairs.length; xi++) {
      xOrigValues.push(_origByLabel[xPairs[xi].lbl]);
      delete _origByLabel[xPairs[xi].lbl];
    }
    for (var xi2 = 0; xi2 < xPairs.length; xi2++) {
      if (xOrigValues[xi2] !== undefined) {
        _origByLabel[_xLabels[xi2]] = xOrigValues[xi2];
      }
    }

    // Z: sort and regenerate 1, 2, 3...
    var zPairs = _zPositions.map(function(p, i) { return { pos: p, lbl: _zLabels[i] }; });
    zPairs.sort(function(a, b) { return a.pos - b.pos; });

    _zPositions = zPairs.map(function(p) { return p.pos; });
    _zLabels = _generateZLabels(_zPositions.length);

    var zOrigValues = [];
    for (var zi = 0; zi < zPairs.length; zi++) {
      zOrigValues.push(_origByLabel[zPairs[zi].lbl]);
      delete _origByLabel[zPairs[zi].lbl];
    }
    for (var zi2 = 0; zi2 < zPairs.length; zi2++) {
      if (zOrigValues[zi2] !== undefined) {
        _origByLabel[_zLabels[zi2]] = zOrigValues[zi2];
      }
    }
  }

  // ── Internal Helpers ──────────────────────────────────────────────────────

  function _generateXLabels(count) {
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var labels = [];
    for (var i = 0; i < count; i++) {
      labels.push(i < 26 ? letters[i] : letters[Math.floor(i / 26) - 1] + letters[i % 26]);
    }
    return labels;
  }

  function _generateZLabels(count) {
    var labels = [];
    for (var i = 0; i < count; i++) labels.push(String(i + 1));
    return labels;
  }

  function _nextXLabel(idx, labels) {
    if (idx > 0 && idx < labels.length) {
      return labels[idx - 1] + "'";
    }
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return idx < 26 ? letters[idx] : letters[Math.floor(idx / 26) - 1] + letters[idx % 26];
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  exports.init = init;
  exports.reset = reset;
  exports.snapshotOriginals = snapshotOriginals;
  exports.addLine = addLine;
  exports.removeLine = removeLine;
  exports.getDeltas = getDeltas;
  exports.getLines = getLines;
  exports.getPositions = getPositions;
  exports.getLabels = getLabels;
  exports.setPosition = setPosition;
  exports.getOriginal = getOriginal;
  exports.getCeilingY = getCeilingY;
  exports.setCeilingY = setCeilingY;
  exports.getPosition = getPosition;
  exports.getLabel = getLabel;
  exports.getCount = getCount;
  exports.resortLabels = resortLabels;

})(typeof module !== 'undefined' ? module.exports : (window.GridState = {}));
