// # ⚠ DO NOT REMOVE — SCOPE: run the REAL disc walk in node in the SAME order as modeller.html `_discWalkOne`, so a walk
// result measured here is the page's walk and not a bare dwWalk call (bim-compiler prompts/MODELLER_MASTER.md §G1 SPEC).
// The only thing replaced is `_rwFetchCached` (node has no IndexedDB): rwInit itself, the pairing and the clash gates are
// the shipped code. Read the log after every run; the exit code is not the evidence.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const MODELLER = process.env.WALK_TREE ? path.join(process.env.WALK_TREE, 'modeller') : path.join(__dirname, '..');   // WALK_TREE: run another tree's code through this harness

/**
 * Load the walker stack the way the page's script tags do (globals on `window`).
 * @param {Object} SQL - initSqlJs result.
 * @returns {Promise<{DW:Object, WalkRules:Object, rwReady:boolean}>} the loaded engines.
 */
async function loadStack(SQL) {
  global.window = global;                                    // disc_walker's ROOT is `window`: routePattern finds the engine there, as on the page
  global.RealPlacementResolver = require(path.join(MODELLER, 'real_placement_resolver.js'));
  vm.runInThisContext(fs.readFileSync(path.join(MODELLER, 'routewalker.js'), 'utf8'), { filename: 'routewalker.js' });
  global._rwFetchCached = async function (url) {             // node has no IndexedDB; the file the page would fetch
    const file = path.join(MODELLER, url.split('?')[0]);
    console.log('§WALKNODE fetch ' + url + ' -> ' + path.relative(path.join(MODELLER, '..'), file));
    return fs.readFileSync(file);
  };
  require(path.join(MODELLER, 'seed_trunk.js'));             // sets root.SeedTrunk
  const WalkRules = require(path.join(MODELLER, '..', 'common', 'walk_rules.js'));
  const DW = require(path.join(MODELLER, 'disc_walker.js'));
  const rwReady = await global.rwInit(SQL, '');              // the page's _rwReadyOnce
  return { DW, WalkRules, rwReady };
}

/** @param {Object} SQL @param {string} file - rules DB basename under modeller/ @returns {Object} an open sql.js DB. */
function openRules(SQL, file, DW, edit) {
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(MODELLER, file))));
  db._dwFile = file;
  // §12 rule 1: the page's self-heal rules patch, applied the same way here (DW.applyRulesPatch is the one applier)
  const pf = path.join(MODELLER, 'patches', file + '.sql');
  if (DW && DW.applyRulesPatch && !process.env.DW_NO_RULES_PATCH) DW.applyRulesPatch(db, file, fs.existsSync(pf) ? fs.readFileSync(pf, 'utf8') : null);
  // MODELLER_RULES_EDITOR.md §CLASS-SHARED (c2): a user's edit cells on THIS file, wherever it is opened (own, schedule source, FP borrow)
  if (edit && edit.file === file && DW && DW.applyCells) { const r = DW.applyCells(db, edit.cells || {}); edit.applied = (edit.applied || []).concat([{ file, done: r.done, skipped: r.skipped }]); console.log('§WALKNODE edit file=' + file + ' cells=' + r.done + ' skipped=' + r.skipped); }
  return db;
}

/**
 * Register the rules for a building, as `__ensureDiscWalker` + `_discWalkOne` do.
 * @param {Object} SQL @param {Object} stack - from loadStack @param {string} name - building name.
 * @param {{file:string, cells:Object}} [edit] - user edit cells applied to that rules file wherever it is opened.
 * @returns {{rules:string, schedule:(string|null), borrowFP:(string|null)}} which rule sets the name selected.
 */
function openBuildingRules(SQL, stack, name, edit) {
  const { DW, WalkRules } = stack;
  const rules = WalkRules.rulesDb(name), schedule = WalkRules.scheduleDb(name);
  DW.dwOpen(openRules(SQL, rules, DW, edit));
  DW.dwScheduleSource(schedule ? openRules(SQL, schedule, DW, edit) : null);
  let borrowFP = null;
  if (rules === WalkRules.FP_BORROW || (DW.hasRules && DW.hasRules('FP'))) DW.dwBorrow('FP', null);   // _dwEnsureBorrow
  else { borrowFP = WalkRules.FP_BORROW; DW.dwBorrow('FP', openRules(SQL, borrowFP, DW, edit)); }
  console.log('§WALKNODE rules=' + rules + ' schedule=' + schedule + ' borrowFP=' + borrowFP + ' building=' + name);
  return { rules, schedule, borrowFP };
}

/**
 * One discipline walk, the page's sequence: §ANCHOR-BLIND, dwWalk(schedule), §SCHED-FALLBACK. The DB buffer is opened
 * fresh in memory for each walk, exactly as the page re-opens `__dwBuf`, so the file on disk is never written.
 * @param {Object} SQL @param {Object} stack @param {string} disc @param {Uint8Array} buf - building DB bytes.
 * @param {string} name @param {Object[]} avoid - other disciplines' live placements (page: window.__dwWalks).
 * @param {Object} [extra] - added to the walk's opts (a geoDb, or a witness switch).
 * @returns {Object} the dwWalk result.
 */
function walkLive(SQL, stack, disc, buf, name, avoid, extra) {
  const bdb = new SQL.Database(buf);
  try { bdb.run("DELETE FROM element_transforms WHERE transform_source='void_anchor'"); } catch (e) { /* no such column on an older DB, same as the page */ }
  let w = stack.DW.dwWalk(disc, bdb, name, Object.assign({ schedule: true, avoid: avoid || [] }, extra || {}));
  if ((w.refused || !((w.placed || 0) + (w.provisional || 0))) && !w.verdict) {   // §11: a walk of provisional rows is not a refused walk
    console.log('§SCHED-FALLBACK ' + disc + ' schedule/measured-band yielded 0 (' + (w.reason || 'no placements') + ') -> legacy walk');
    w = stack.DW.dwWalk(disc, bdb, name, Object.assign({}, extra || {}));
  }
  bdb.close();
  return w;
}

module.exports = { loadStack, openBuildingRules, walkLive };
