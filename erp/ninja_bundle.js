// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ninja_bundle.js — Phase C: wrap a staged Ninja model as a `.foldbundle` (emit + install)
//
// Implementing NINJA_MODE_LANE.md §Phase C — Witness: W-NINJA-BUNDLE
// A `.foldbundle` is the single-file unit the Plugin Engine (plugin_registry.js) installs:
//   { manifest, activate(ctx), deactivate(ctx) }
// Ninja's bundle carries the derived model in `manifest.ninjaModel` and on activate calls
// stageModels(ctx.db, model) — idempotent. On deactivate it rolls back (IsActive='N').
// This replaces the Java Ninja's 2Pack PackOut.xml: PackOut.xml ↔ the bundle's activate() apply leg.
//
// Two emit forms:
//   emitBundle(model)       → a live { manifest, activate, deactivate } object (install directly)
//   emitBundleSource(model) → an ESM source string (the shareable `.foldbundle` FILE artifact)
//                             — imports ./ninja_stage.js (the engine's apply leg, shipped alongside),
//                             carrying the model inline. Mirrors how PackOut.xml needs the iDempiere
//                             runtime to apply it — the file is the recipe, the engine is the cook.
//
// ctx.db CONTRACT: Ninja writes, so the host must inject a WRITABLE db (sql.js Database with .run/.exec).
// stageModels uses db.run/db.exec; engine bundles use db.query — a host serving both attaches .query
// to the same sql.js handle. No plugin_registry change (host decides what host.db exposes).

(function (global) {
  'use strict';

  var NinjaStage = (typeof module !== 'undefined' && module.exports)
    ? require('./ninja_stage.js')
    : global.NinjaStage;

  function slug(s) {
    return String(s || 'bundle').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // ── buildManifest(model) — the plugin manifest (id+version mandatory; ninjaModel carried) ─────────
  function buildManifest(model) {
    return {
      id: 'org.ninja.' + slug(model.bundleName),
      version: model.version || '1.0.0',
      engineVersion: '>=0.9.0',
      requires: {},
      contributions: { ad: { tables: (model.tables || []).length } },
      ninjaModel: model
    };
  }

  // ── emitBundle(model) — live bundle object for direct install ─────────────────────────────────────
  function emitBundle(model) {
    var manifest = buildManifest(model);
    return {
      manifest: manifest,
      activate: function (ctx) {
        var counts = NinjaStage.stageModels(ctx.db, model, 0);
        manifest._staged = counts;
        return Promise.resolve(counts);
      },
      deactivate: function (ctx) {
        return Promise.resolve(NinjaStage.rollbackModel(ctx.db, model.bundleName));
      }
    };
  }

  // ── emitBundleSource(model) — the `.foldbundle` FILE (ESM string) ─────────────────────────────────
  // Self-shareable: carries the model inline, imports the engine's ninja_stage apply leg.
  function emitBundleSource(model, opts) {
    opts = opts || {};
    var stagePath = opts.stagePath || './ninja_stage.js';
    var manifest = buildManifest(model);
    // The model lives in the MODEL const, NOT duplicated into the manifest literal.
    var manifestNoModel = Object.assign({}, manifest);
    delete manifestNoModel.ninjaModel;

    return [
      '// .foldbundle — emitted by Ninja mode (NINJA_MODE_LANE.md §Phase C). Do not hand-edit.',
      '// Install via the Plugin Engine pill; activate() stages the model into the loaded sql.js AD db.',
      'import NinjaStage from ' + JSON.stringify(stagePath) + ';',
      '',
      'export const MODEL = ' + JSON.stringify(model) + ';',
      '',
      'export const manifest = Object.assign(' + JSON.stringify(manifestNoModel) + ', { ninjaModel: MODEL });',
      '',
      'export async function activate(ctx) {',
      '  return NinjaStage.stageModels(ctx.db, MODEL, 0);',
      '}',
      '',
      'export async function deactivate(ctx) {',
      '  return NinjaStage.rollbackModel(ctx.db, MODEL.bundleName);',
      '}',
      ''
    ].join('\n');
  }

  // ── makeWritableDbHost(sqljsDb) — attach .query to a writable sql.js db (host glue helper) ────────
  // The host serves both Ninja (writes) and engine bundles (read .query) off ONE sql.js handle.
  function makeWritableDbHost(sqljsDb) {
    if (typeof sqljsDb.query !== 'function') {
      sqljsDb.query = function (sql, params) {
        var stmt = sqljsDb.prepare(sql);
        try {
          if (params && params.length) stmt.bind(params);
          var out = [];
          while (stmt.step()) out.push(stmt.getAsObject());
          return out;
        } finally { stmt.free(); }
      };
    }
    return sqljsDb;
  }

  var API = {
    buildManifest: buildManifest,
    emitBundle: emitBundle,
    emitBundleSource: emitBundleSource,
    makeWritableDbHost: makeWritableDbHost,
    slug: slug
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.NinjaBundle = API;

})(typeof self !== 'undefined' ? self : this);
