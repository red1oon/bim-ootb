// ⚠ DO NOT REMOVE — how every Node-side witness in this repo gets sql.js.
//
// WHY THIS FILE EXISTS: the bench and the three rule suites each hard-required
// `$HOME/bim-compiler/node_modules/sql.js` — a SIBLING CHECKOUT, outside this project, under a
// path that only exists on one developer's machine. Anyone who clones bim-ootb and runs
// `node tests/bench_rule_artifacts.js` got MODULE_NOT_FOUND with a path they have no reason to
// own. bim-ootb declares `sql.js` in its OWN package.json (^1.14.1) and ships it in
// node_modules at the identical version, so the sibling was never needed.
//
// Resolution order, most-local first, and the last step EXPLAINS itself rather than throwing a
// raw MODULE_NOT_FOUND:
//   1. SQLJS_PATH        — an explicit override, for an unusual layout
//   2. `sql.js`          — this project's own dependency (`npm install`)
//   3. the sibling bim-compiler checkout — kept so existing dev machines keep working
//
// rtree: the shipped viewer loads `rtree-sql.js`, an R-tree-enabled build, because
// buildings/patches/LTU_AHouse_meta.db.sql reads `elements_rtree`. Plain sql.js has no rtree
// module and that patch fails on it with "no such module: rtree" — SILENTLY, if a caller
// swallows the error. Nothing under tests/ applies a patch today, so plain sql.js is correct
// here; `requireSqlJs({ rtree: true })` is for anything that ever does.
'use strict';
const path = require('path');

function _try(id) { try { return require(id); } catch (e) { return null; } }

function requireSqlJs(opts) {
  const wantRtree = !!(opts && opts.rtree);
  const pkg = wantRtree ? 'rtree-sql.js' : 'sql.js';
  const tried = [];

  const override = process.env.SQLJS_PATH;
  if (override) { tried.push(override); const m = _try(override); if (m) return m; }

  tried.push(pkg);
  const local = _try(pkg);
  if (local) return local;

  const sibling = path.join(process.env.HOME || '', 'bim-compiler', 'node_modules', pkg);
  tried.push(sibling);
  const sib = _try(sibling);
  if (sib) return sib;

  throw new Error(
    '§SQLJS_MISSING could not load "' + pkg + '". Tried: ' + tried.join(', ') + '\n' +
    '  Fix: run `npm install` in the repo root (' + pkg + ' is a declared dependency), or set\n' +
    '  SQLJS_PATH=/abs/path/to/' + pkg + ' if you keep it somewhere unusual.');
}

module.exports = { requireSqlJs: requireSqlJs };
