// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — ALPHA DISCLAIMER WATERMARK (§DISCLAIMER). Locale-aware; default EN. Stamped onto
//   EVERY output/record so "demonstrator, not official" is impossible to mistake. Read log after run.
'use strict';
var WATERMARK = { en: 'SAMPLE — NOT OFFICIAL', ms: 'CONTOH — TIDAK RASMI' };
function mark(locale) { return WATERMARK[locale] || WATERMARK.en; }
function stamp(obj, locale) { obj._watermark = mark(locale); return obj; }
var W = { WATERMARK: WATERMARK, mark: mark, stamp: stamp };
if (typeof module === 'object' && module.exports) module.exports = W;
else (typeof self !== 'undefined' ? self : this).HbaWatermark = W;
