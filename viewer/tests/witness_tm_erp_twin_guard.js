#!/usr/bin/env node
// witness_tm_erp_twin_guard.js — §S54 (bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S54.2, item F2).
//
// ISSUE this witness proves/disproves: with NO active building, do time_machine.js's two ERP-twin
// loaders still guess one? They used to read `(app && app.activeBuilding) || 'Hospital'`, so an
// arbitrary IFC opened straight into the viewer silently got HOSPITAL's cost and phase figures
// attached to it — the single real per-building hardcoding left in the 4D path (§S52.1).
//
// A guard like this is exactly the kind that rots quietly: nothing throws, no number goes red, the
// dashboard just shows another project's money. So it is asserted three ways — the resolved value,
// the FETCH (the guard must fire before the 25.8MB ad_seed.db read, not after), and the source
// itself (no fallback expression may creep back in a different shape).
//
//   W-TET-1  no active building -> _loadTwin resolves null AND never fetches ad_seed.db
//   W-TET-2  no active building -> _loadShopfloor resolves null AND never fetches
//   W-TET-3  WITH an active building both still fetch and still resolve — the guard did not
//            disable the feature (a guard that always skips would pass W-TET-1/2 trivially)
//   W-TET-4  no quoted building-name fallback survives in either function's live source
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

function sliceFn(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) break; }
  }
  return src.slice(idx, i + 1);
}
const twinSrc = sliceFn(tmSrc, '_loadTwin');
const shopSrc = sliceFn(tmSrc, '_loadShopfloor');

// A sandbox with the module state both functions close over, and a cachedFetch that COUNTS instead
// of fetching — reaching it at all is the failure this witness exists to catch.
function mkSandbox(activeBuilding) {
  const state = { fetches: 0 };
  const sandbox = {
    console: { log: () => {}, warn: () => {} }, Promise: Promise, Number: Number, Date: Date, Math: Math,
    A: () => ({ activeBuilding: activeBuilding, _SQL: { Database: function () { throw new Error('unreachable in this witness'); } } }),
    APP: { cachedFetch: () => { state.fetches++; return Promise.reject(new Error('§WITNESS fetch blocked')); } },
    window: {},
    _twin: null, _twinLoading: false, _twinMiss: null,
    _shopfloor: null, _shopfloorLoading: false, _shopfloorMiss: null
  };
  sandbox.window.SQL = sandbox.A()._SQL;
  vm.createContext(sandbox);
  vm.runInContext(twinSrc + '\n' + shopSrc + '\nthis.__twin = _loadTwin; this.__shop = _loadShopfloor;', sandbox);
  return { sandbox, state };
}

(async () => {
  // ── W-TET-1 / W-TET-2 — the real state this fixes: an arbitrary IFC, no active building.
  {
    const { sandbox, state } = mkSandbox(undefined);
    const t = await sandbox.__twin().catch(e => '(threw: ' + e.message + ')');
    assert(t === null && state.fetches === 0,
      'W-TET-1 no active building: _loadTwin resolves null (got ' + JSON.stringify(t) +
      ') and never fetched ad_seed.db (fetches=' + state.fetches + ') — the guess is gone, and gone BEFORE the 25.8MB read');

    const s = await sandbox.__shop().catch(e => '(threw: ' + e.message + ')');
    assert(s === null && state.fetches === 0,
      'W-TET-2 no active building: _loadShopfloor resolves null (got ' + JSON.stringify(s) +
      ') and never fetched (fetches=' + state.fetches + ')');
  }

  // ── W-TET-3 — the control. A guard that skips unconditionally would pass the two above while
  // silently killing the ERP twin for every building; this proves the loaders still run.
  {
    const { sandbox, state } = mkSandbox('Duplex');
    await sandbox.__twin().catch(() => {});
    assert(state.fetches === 1,
      'W-TET-3a WITH an active building _loadTwin still reaches the ad_seed.db fetch (fetches=' + state.fetches + ')');
    const before = state.fetches;
    await sandbox.__shop().catch(() => {});
    assert(state.fetches === before + 1,
      'W-TET-3b WITH an active building _loadShopfloor still reaches the fetch (fetches=' + state.fetches + ')');
  }

  // ── W-TET-4 — source, comments stripped: no quoted building-name fallback in either function.
  // Comments are stripped ON PURPOSE — the fix's own comment quotes the retired `|| 'Hospital'`
  // expression to record what it replaced, and a naive scan would match that and pass/fail on prose.
  {
    const strip = src => src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    const live = strip(twinSrc) + '\n' + strip(shopSrc);
    assert(live.indexOf("'Hospital'") < 0 && live.indexOf('"Hospital"') < 0,
      'W-TET-4a no quoted building name survives in the live source of either loader');
    assert(!/activeBuilding\s*\)?\s*\|\|\s*['"]/.test(live),
      'W-TET-4b activeBuilding is never OR-ed into a string literal fallback — the shape cannot come back under another name');
  }

  console.log('\n§TM_ERP_TWIN_GUARD_SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
