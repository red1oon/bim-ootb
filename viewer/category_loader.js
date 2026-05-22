// category_loader.js — Implementing SpatialERP_POC.md §0b P1 — Witness: W-SERP-P1
// Registry reader: loads category_registry rows, returns actions/heatmap/labels.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
(function () {
  'use strict';

  /**
   * Get a category definition from the registry.
   * @param {Object} db       sql.js database
   * @param {string} category e.g. 'SITE', 'PLOT', 'BUILDING', 'PHASE'
   * @returns {{ category, domain, json_schema, default_geometry, actions, heatmap_rule, label_template }|null}
   */
  function getCategory(db, category) {
    console.log('§CATEGORY_LOADER getCategory cat=' + category);
    var r = db.exec(
      'SELECT category, domain, json_schema, default_geometry, actions, heatmap_rule, label_template ' +
      'FROM category_registry WHERE category = ?', [category]
    );
    if (!r.length || !r[0].values.length) {
      console.log('§CATEGORY_LOADER not found cat=' + category);
      return null;
    }
    var row = r[0].values[0];
    var entry = {
      category:         row[0],
      domain:           row[1],
      json_schema:      row[2] ? JSON.parse(row[2]) : null,
      default_geometry: row[3],
      actions:          row[4] ? JSON.parse(row[4]) : [],
      heatmap_rule:     row[5] ? JSON.parse(row[5]) : null,
      label_template:   row[6]
    };
    console.log('§CATEGORY_LOADER found cat=' + category +
                ' actions=' + JSON.stringify(entry.actions));
    return entry;
  }

  /**
   * List all categories for a domain.
   * @param {Object} db     sql.js database
   * @param {string} domain e.g. 'CONSTRUCTION'
   * @returns {Array} array of category entries
   */
  function listCategories(db, domain) {
    console.log('§CATEGORY_LOADER listCategories domain=' + domain);
    var r = db.exec(
      'SELECT category, domain, json_schema, default_geometry, actions, heatmap_rule, label_template ' +
      'FROM category_registry WHERE domain = ?', [domain]
    );
    if (!r.length) {
      console.log('§CATEGORY_LOADER no categories for domain=' + domain);
      return [];
    }
    var cats = r[0].values.map(function (row) {
      return {
        category:         row[0],
        domain:           row[1],
        json_schema:      row[2] ? JSON.parse(row[2]) : null,
        default_geometry: row[3],
        actions:          row[4] ? JSON.parse(row[4]) : [],
        heatmap_rule:     row[5] ? JSON.parse(row[5]) : null,
        label_template:   row[6]
      };
    });
    console.log('§CATEGORY_LOADER listCategories domain=' + domain + ' count=' + cats.length);
    return cats;
  }

  /**
   * Render a label template with container data.
   * Template tokens: {name}, {metadata.field}, {category}
   * @param {string} template e.g. 'Plot {metadata.plot_no} — {metadata.area}'
   * @param {Object} container row with name, category, metadata (JSON string or object)
   * @returns {string}
   */
  function renderLabel(template, container) {
    if (!template) return container.name || '';
    var meta = container.metadata;
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch (e) { meta = {}; }
    }
    return template.replace(/\{([^}]+)\}/g, function (_, key) {
      if (key === 'name') return container.name || '';
      if (key === 'category') return container.category || '';
      if (key.indexOf('metadata.') === 0) {
        var field = key.substring(9);
        return meta[field] !== undefined ? String(meta[field]) : '';
      }
      return '';
    });
  }

  var CategoryLoader = {
    getCategory:    getCategory,
    listCategories: listCategories,
    renderLabel:    renderLabel
  };

  if (typeof window !== 'undefined') window.CategoryLoader = CategoryLoader;
  if (typeof module !== 'undefined' && module.exports) module.exports = CategoryLoader;

  console.log('§CATEGORY_LOADER_LOADED v1');
})();
