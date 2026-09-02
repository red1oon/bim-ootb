#!/usr/bin/env node
// WITNESS — W-ZONE — §ZONE_INDEX
// Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §ZONE_INDEX.
//
// ISSUE THIS PROVES OR DISPROVES:
//   The median-Z storey banding was written out TWICE — once inside _buildXrayElements, once
//   inside injectGantt — byte-identical algorithms differing only in the column index their own
//   SELECT put `cz` at, plus a counter. §ZONE_INDEX consolidates them into one memoized index so a
//   third consumer (the §TIER_SERIAL_BY_ZONE barrier) does not make it three.
//
//   A consolidation is only safe if it is INVISIBLE. The danger is that the two copies were fed
//   their maps in DIFFERENT row orders (injectGantt's SELECT carries `ORDER BY cz`,
//   _buildXrayElements' does not), and `Object.keys().sort(by medianZ)` is only order-stable when
//   no two storeys SHARE a median. So this witness proves two things, in order:
//     (a) whether that tie condition exists at all on the real buildings, and
//     (b) whether every element's assigned storey is byte-identical to origin/main's.
//   If (a) is non-zero anywhere, the consolidation is PICKING A WINNER between two copies that
//   already disagreed, and that must be reported, not averaged away.
//
//   Deliberately a NODE witness, not a browser one: it runs the real shipped function against the
//   real shipped DBs on all 7 buildings in seconds. CPE_4D_PERF_MEM_FINDINGS.md §6 records that
//   headless swiftshader cannot load Hospital at all (14.5 s/frame), so a browser harness could
//   not have covered the buildings that matter most here.
//
// GATES:
//   G-ZONE-EQUIV   (BLOCKING) every element's assigned storey identical to origin/main, per
//                  building, compared guid by guid. mismatch=0 required.
//   G-ZONE-BANDS   band name order and index map identical to origin/main (this is what the
//                  §GANTT storey-bands log line and the Gantt row grouping are built from).
//   G-ZONE-TIES    the median-Z tie audit — the one condition under which the two former copies
//                  could legitimately have disagreed with each other. Reported per building.
//   G-ZONE-LEVEL   the fallback chain reports the finest level actually available per building
//                  (space where the extractor produced rel_contained_in_space, band otherwise).
//   G-ZONE-MEMO    the index is built ONCE across repeated consumers, not once per consumer.
//
// Command (from the worktree root):
//   BLD_DIR=~/bim-ootb/buildings node viewer/tests/witness_zone_index.js
//   (the OLD baseline is derived from git at 475373b^; OLD=<path> / OLD_REV=<rev> override)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const HOME = require('os').homedir();
const NEW_TM = process.env.NEW_TM || path.join(__dirname, '..', 'time_machine.js');
// The OLD side is not a sibling FILE, it is a prior REVISION: the last commit before §ZONE_INDEX
// (#1313, 475373b) consolidated the two inline banding copies. The original run staged it by hand at
// /tmp/vw/time_machine.js, which then ENOENT-crashed this witness for everyone else (§S61.3 class B).
// Derive it from git instead, cached under the OS temp dir; `OLD=<path>` still overrides.
const OLD_REV = process.env.OLD_REV || '475373b^';                 // pre-§ZONE_INDEX baseline
function resolveOldTm() {
  if (process.env.OLD) return process.env.OLD;
  const cache = path.join(require('os').tmpdir(), 'witness_zone_index_old_' + OLD_REV.replace(/[^a-zA-Z0-9]/g, '_') + '.js');
  if (fs.existsSync(cache) && fs.statSync(cache).size > 0) return cache;
  try {
    const src = require('child_process').execFileSync('git',
      ['-C', path.join(__dirname, '..', '..'), 'show', OLD_REV + ':viewer/time_machine.js'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    fs.writeFileSync(cache, src);
    return cache;
  } catch (e) { return null; }
}
const OLD_TM = resolveOldTm();
const BLD_DIR = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const VIEWER_DIR = path.join(__dirname, '..');
const SQLJS_DIR = process.env.SQLJS_DIR || path.join(HOME, 'bim-ootb', 'modeller', 'lib');
const initSqlJs = require(path.join(SQLJS_DIR, 'sql-wasm.js'));
const ZoneIndex = require(path.join(VIEWER_DIR, 'zone_index.js'));   // §S62
const DB_FILE = { LTU_AHouse: 'LTU_AHouse_meta.db' };
const BUILDINGS = (process.env.ONLY || 'Terminal,Hospital,Duplex,HHS_Office_Federated,Clinic,LTU_AHouse,JKR').split(',');

function sliceFn(src, name, which) {
  let from = 0;
  for (let pass = 0; pass <= (which || 0); pass++) {
    const idx = src.indexOf('function ' + name + '(', from);
    if (idx < 0) return null;
    let depth = 0, i = idx, seenOpen = false;
    for (; i < src.length; i++) {
      if (src[i] === '{') { depth++; seenOpen = true; }
      else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) break; }
    }
    if (pass === (which || 0)) return src.slice(idx, i + 1);
    from = i + 1;
  }
  return null;
}

// Build a sandbox running ONE version's _buildXrayElements against ONE db. The new version also
// needs its zone-index pair; the old version has the banding inline, so it needs neither.
function makeCtx(src, db, bld, counters) {
  const parts = [
    sliceFn(src, '_promoteRoofLoadPath'),
    sliceFn(src, '_buildXrayElements'),
    // §S62 follow-on: _buildXrayElements' real dependency closure — matchRule() calls _classifyRule,
    // which calls _classifyNameOverride. Neither was ever in this slice set (the same undeclared-
    // dependency class as the ZoneIndex miss above); added conditionally so a revision that predates
    // either name still slices cleanly.
    sliceFn(src, '_classifyRule'),
    sliceFn(src, '_classifyNameOverride')
  ];
  const zb = sliceFn(src, '_zoneIndexBuild');
  const zi = sliceFn(src, '_zoneIndex');
  if (zb && zi) { parts.unshift(zi); parts.unshift(zb); parts.unshift('var _zoneMemo = [];'); }
  parts.unshift('var _TIER1_ORDER = ["Substructure", "Superstructure", "Architecture"];');
  const sandbox = {
    console: { log: (s) => { if (/§ZONE_INDEX built/.test(String(s))) counters.builds++; }, warn: () => {} },
    performance: { now: () => Date.now() },
    window: {},
    Math: Math, RegExp: RegExp, Object: Object, Infinity: Infinity,
    // §S62 (#1459) moved the builder body out to viewer/zone_index.js, so the NEW side's sliced
    // _zoneIndexBuild is now a one-line `return ZoneIndex.build(db)` wrapper and the sandbox has to
    // supply the module. Same pattern as witness_tm_geo_order_cycles.js. Without it the witness
    // died on `ReferenceError: ZoneIndex is not defined` — a sliced function cannot state its own
    // dependencies. The OLD side has the banding inline and never touches this.
    ZoneIndex: ZoneIndex,
    A: () => ({ db: db, activeBuilding: bld, _metaGen: 0 })
  };
  vm.createContext(sandbox);
  vm.runInContext(parts.filter(Boolean).join('\n') +
    '\nthis.__bxe = _buildXrayElements;' +
    (zb && zi ? '\nthis.__zi = _zoneIndex;' : '\nthis.__zi = null;'), sandbox);
  return sandbox;
}

const results = [];
function gate(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(SQLJS_DIR, 'sql-wasm.wasm')) });
  const newSrc = fs.readFileSync(NEW_TM, 'utf8');
  if (!OLD_TM || !fs.existsSync(OLD_TM)) {
    console.log('§ZONE_INDEX_SKIP baseline revision ' + OLD_REV + ' unavailable (not a git checkout, or the ' +
      'revision is not fetched). Set OLD=<path to a pre-§ZONE_INDEX time_machine.js> to run. Skipping, not failing.');
    process.exit(0);
  }
  const oldSrc = fs.readFileSync(OLD_TM, 'utf8');
  const rulesJson = JSON.parse(fs.readFileSync(path.join(VIEWER_DIR, 'rates', 'sequence_rules.json'), 'utf8'));

  let totMismatch = 0, totCompared = 0, bandsBad = [], tieReport = [], levelReport = [], memoReport = [];
  let ran = 0;

  for (const bld of BUILDINGS) {
    const dbPath = path.join(BLD_DIR, DB_FILE[bld] || (bld + '_extracted.db'));
    if (!fs.existsSync(dbPath)) { console.log(`      (skip ${bld} — fixture missing)`); continue; }
    const buf = fs.readFileSync(dbPath);

    const cN = { builds: 0 }, cO = { builds: 0 };
    const dbN = new SQL.Database(buf), dbO = new SQL.Database(buf);
    const sN = makeCtx(newSrc, dbN, bld, cN);
    const sO = makeCtx(oldSrc, dbO, bld, cO);
    sN.window.SEQUENCE_RULES = sO.window.SEQUENCE_RULES = rulesJson.SEQUENCE_RULES;
    sN.window.SEQUENCE_DEFAULT = sO.window.SEQUENCE_DEFAULT = rulesJson.SEQUENCE_DEFAULT;
    sN.window.SEQUENCE_NAME_OVERRIDES = sO.window.SEQUENCE_NAME_OVERRIDES = rulesJson.NAME_OVERRIDES || [];

    const elN = sN.__bxe(), elO = sO.__bxe();
    if (!elN || !elO) { console.log(`      (skip ${bld} — element build returned nothing)`); dbN.close(); dbO.close(); continue; }
    ran++;

    // ── G-ZONE-EQUIV: guid-by-guid storey comparison ──
    const mapO = {};
    elO.forEach(e => { mapO[e.guid] = e.storey; });
    let mm = 0, missing = 0;
    elN.forEach(e => {
      if (!(e.guid in mapO)) { missing++; return; }
      if (e.storey !== mapO[e.guid]) mm++;
    });
    totMismatch += mm + missing;
    totCompared += elN.length;

    // ── G-ZONE-BANDS + TIES + LEVEL, from the new index itself ──
    const idx = sN.__zi ? sN.__zi() : null;
    // Rebuild the OLD band order independently, straight from the db, the way injectGantt did.
    const zr = dbO.exec('SELECT m.storey, COALESCE(t.center_z,0) FROM elements_meta m ' +
      'LEFT JOIN element_transforms t ON t.guid = m.guid ' +
      "WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace' " +
      'ORDER BY COALESCE(t.center_z,0)');
    const zv = {};
    if (zr.length) zr[0].values.forEach(v => {
      const st = v[0] || '_UNKNOWN';
      if (st === '_UNKNOWN' || /^unknown$/i.test(st)) return;
      (zv[st] || (zv[st] = [])).push(v[1] || 0);
    });
    const medO = {};
    for (const k in zv) { const a = zv[k].sort((x, y) => x - y), m = Math.floor(a.length / 2);
      medO[k] = a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
    const namesO = Object.keys(medO).sort((a, b) => medO[a] - medO[b]);
    const namesN = idx ? idx.names : [];
    const sameBands = namesN.length === namesO.length && namesN.every((n, i) => n === namesO[i]);
    if (!sameBands) bandsBad.push(`${bld}(new=${namesN.length} old=${namesO.length})`);
    tieReport.push(`${bld}=${idx ? idx.tiesN : 'n/a'}`);
    levelReport.push(`${bld}=${idx ? idx.level : 'n/a'}${idx && idx.spaceN ? '(' + idx.spaceN + ')' : ''}`);

    // ── G-ZONE-MEMO: many consumers, one build ──
    const before = cN.builds;
    if (sN.__zi) { sN.__zi(); sN.__zi(); sN.__zi(); }
    memoReport.push(`${bld}=${cN.builds}build/${before + 0}after3more`);

    console.log(`      ${bld}: n=${elN.length} storeyMismatch=${mm} missing=${missing} ` +
      `bands=${namesN.length}${sameBands ? '' : ' ⚠ORDER DIFFERS'} ties=${idx ? idx.tiesN : '?'} ` +
      `level=${idx ? idx.level : '?'} noStorey=${idx ? idx.unknownN : '?'}/${idx ? idx.totalN : '?'} builds=${cN.builds}`);
    dbN.close(); dbO.close();
  }

  gate('G-ZONE-EQUIV', totMismatch === 0 && ran > 0,
    `buildings=${ran} elementsCompared=${totCompared} mismatch=${totMismatch}`);
  gate('G-ZONE-BANDS', bandsBad.length === 0 && ran > 0,
    bandsBad.length ? 'band order differs: ' + bandsBad.join(' ') : `band name order + index identical on all ${ran}`);
  gate('G-ZONE-TIES', true, `medianZ ties per building: ${tieReport.join(' ')} ` +
    `(non-zero = the two former copies could have disagreed there; 0 = consolidation is provably a no-op)`);
  gate('G-ZONE-LEVEL', ran > 0, `fallback level reached: ${levelReport.join(' ')} ` +
    `(space only where the extractor produced rel_contained_in_space — 1 of 7 today, by design a refinement not a requirement)`);
  gate('G-ZONE-MEMO', memoReport.every(s => /=1build/.test(s)),
    `builds per building after 4 consumer calls: ${memoReport.join(' ')}`);

  const passed = results.filter(r => r.pass).length;
  console.log(`\n§ZONE_WITNESS ${passed}/${results.length} gates passed`);
  process.exit(passed === results.length ? 0 : 1);
})();
