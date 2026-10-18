// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2library_types.js — which library records a Building Type is offered (prompts/DXF2BIM_MODELLER_LANE.md §L23). Pure, Node + browser.
// rows: library index rows with `building_types`; type: the type in force (null/unknown -> General only). Records tagged with the type come first (index order), then General ones;
// a record tagged only for another type is not offered.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Dxf2LibraryTypes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function offered(rows, type) {
    var has = function (r, t) { return (r.building_types || ['General']).indexOf(t) >= 0; };
    var typed = type && type !== 'General' ? rows.filter(function (r) { return has(r, type); }) : [];
    var gen = rows.filter(function (r) { return typed.indexOf(r) < 0 && has(r, 'General'); });
    return typed.concat(gen);
  }
  return { offered: offered };
});
