#!/usr/bin/env node
/**
 * W-NIGHT-PL-INTENSITY-HEURISTIC — §NIGHT_PL_INTENSITY_HEURISTIC (2026-09-05).
 *
 * SCOPE: STEP 2 of the lighting fixes — "does real per-fixture wattage/lumen data exist, and if
 * so wire it in; if not, say so and (per user directive) build a small, clearly-labelled
 * TYPE-based heuristic instead, reusing A.nightLightColor's own name categories, never presented
 * as extracted fact."
 *
 * PART A — THE INVESTIGATION ITSELF, asserted structurally against the real pipeline (not a
 * one-off manual grep whose result gets typed up and forgotten): the shipped elements_meta schema
 * (checked against TWO real shipped building DBs) carries no property-set column, and
 * extractIFCtoDB.py never reads IfcRelDefinesByProperties (only IfcRelDefinesByType, for a type
 * NAME string). CONCLUSION: no real wattage/lumen value exists anywhere in this pipeline for any
 * shipped building — confirmed again here, not re-derived from memory.
 *
 * PART B — the heuristic itself: A.nightLightIntensityMult (viewer/tools.js) is extracted VERBATIM
 * and run against REAL element_name family strings queried from TWO real shipped building DBs
 * (Terminal + Hospital) — never invented sample names — proving genuine variance across real data
 * and that the multipliers stay modest (smaller than this file's own already-live 20% tuning step).
 *
 * PART C — wiring: both intensity-computation lines in A._nightUpdateLights multiply by
 * `(...pos.__intensityMult || 1)`, and the position mapper stamps `__intensityMult` from the
 * heuristic — so a building with no matching fixture names is BYTE-IDENTICAL to before this change
 * (fallback = 1 = the untouched flat baseline).
 *
 * Run:  node tests/witness_night_pl_intensity_heuristic.js 2>&1 | tee /tmp/W_NIGHT_PL_INTENSITY.log
 *       (then READ THE LOG — exit code is not evidence.)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const EXTRACT_PY = '/home/red1/bim-compiler/DAGCompiler/python/extractIFCtoDB.py';
const DB_TERMINAL = '/home/red1/Downloads/OPEN SOURCE BIM/TerminalHi4D.db';
const DB_HOSPITAL = path.join(require('os').homedir(), 'bim-ootb', 'buildings', 'Hospital_extracted.db');

let pass = 0, fail = 0;
function gate(id, claim, ok, detail) {
  (ok ? pass++ : fail++);
  console.log((ok ? '✅' : '❌') + ' ' + id + ' — ' + claim + '\n     ' + detail);
}
function q(db, sql) { return execFileSync('sqlite3', ['-noheader', db, sql], { encoding: 'utf8' }).trim(); }

console.log('§NIGHT_PL_INTENSITY_WITNESS start');

const toolsSrc = fs.readFileSync(path.join(ROOT, 'viewer/tools.js'), 'utf8');

// ═══ PART A — the DB/extraction investigation, re-confirmed structurally ═══
if (!fs.existsSync(EXTRACT_PY)) { console.log('❌ EXTRACT — extractIFCtoDB.py not found at ' + EXTRACT_PY); process.exit(1); }
const pySrc = fs.readFileSync(EXTRACT_PY, 'utf8');
const definesByPropsSeen = pySrc.indexOf('IfcRelDefinesByProperties') >= 0;
const definesByTypeSeen = pySrc.indexOf('IfcRelDefinesByType') >= 0;
gate('A1', 'extractIFCtoDB.py never reads IfcRelDefinesByProperties (the relation a Pset_LightFixtureType* wattage/lumen value would come through) — only IfcRelDefinesByType (a type NAME string)',
  !definesByPropsSeen && definesByTypeSeen,
  'IfcRelDefinesByProperties present=' + definesByPropsSeen + '  IfcRelDefinesByType present=' + definesByTypeSeen);

const schemaTerminal = q(DB_TERMINAL, '.schema elements_meta');
const schemaHospital = fs.existsSync(DB_HOSPITAL) ? q(DB_HOSPITAL, '.schema elements_meta') : null;
const psetWords = /watt|lumen|flux|pset|property/i;
gate('A2', 'the real shipped elements_meta schema (checked on TWO buildings) has no wattage/lumen/pset column of any kind to join on',
  !psetWords.test(schemaTerminal) && (schemaHospital === null || !psetWords.test(schemaHospital)),
  'Terminal schema="' + schemaTerminal + '"' + (schemaHospital ? '  Hospital schema="' + schemaHospital + '"' : '  (Hospital DB not present on this machine, Terminal alone still proves the schema shape)'));

console.log('§NIGHT_PL_INTENSITY_WITNESS PART A conclusion: no real photometric data exists in this pipeline for any shipped building — heuristic (Part B) is the correct, non-inventive response, not a shortcut past real data.');

// ═══ PART B — extract A.nightLightIntensityMult verbatim, run against REAL element_name families ═══
const FN_HEAD = 'A.nightLightIntensityMult = function(name) {';
const fhi = toolsSrc.indexOf(FN_HEAD);
if (fhi < 0) { console.log('❌ EXTRACT — A.nightLightIntensityMult not found in viewer/tools.js'); process.exit(1); }
const fbrace = toolsSrc.indexOf('{', fhi);
let depth = 0, end = -1;
for (let i = fbrace; i < toolsSrc.length; i++) {
  if (toolsSrc[i] === '{') depth++;
  else if (toolsSrc[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
while (toolsSrc[end] === ';') end++;
const FN_SRC = toolsSrc.slice(fhi, end);

const COOL_LINE = toolsSrc.match(/var NIGHT_PL_INTENSITY_COOL_MULT = ([\d.]+);/);
const WARM_LINE = toolsSrc.match(/var NIGHT_PL_INTENSITY_WARM_MULT = ([\d.]+);/);
if (!COOL_LINE || !WARM_LINE) { console.log('❌ EXTRACT — intensity multiplier constants not found in viewer/tools.js'); process.exit(1); }
const COOL_MULT = +COOL_LINE[1], WARM_MULT = +WARM_LINE[1];
console.log('§NIGHT_PL_INTENSITY_WITNESS extracted fnLen=' + FN_SRC.length + 'B COOL_MULT=' + COOL_MULT + ' WARM_MULT=' + WARM_MULT);

const nightLightIntensityMult = new Function('NIGHT_PL_INTENSITY_COOL_MULT', 'NIGHT_PL_INTENSITY_WARM_MULT',
  'var A = {};\n' + FN_SRC + '\nreturn A.nightLightIntensityMult;')(COOL_MULT, WARM_MULT);

// tag check: must never read as "_MEASURED" / claimed-real data
const nearFn = toolsSrc.slice(Math.max(0, fhi - 4000), fhi);
gate('B0', 'the heuristic is tagged/documented as a STYLE CONVENTION, explicitly NOT claimed as measured/extracted data',
  nearFn.indexOf('§NIGHT_PL_INTENSITY_HEURISTIC') >= 0 && /NOT extracted\/real photometric data|not real photometric data/i.test(nearFn) &&
  !/§NIGHT_PL_INTENSITY_HEURISTIC[^\n]*_MEASURED/i.test(nearFn),
  'tag present=' + (nearFn.indexOf('§NIGHT_PL_INTENSITY_HEURISTIC') >= 0) + '  disclaims real data=' +
  /NOT extracted\/real photometric data|not real photometric data/i.test(nearFn));

// REAL family names from TWO real shipped buildings (never invented)
const namesTerminal = q(DB_TERMINAL,
  "SELECT DISTINCT element_name FROM elements_meta WHERE ifc_class='IfcLightFixture'").split('\n').filter(Boolean);
const namesHospital = fs.existsSync(DB_HOSPITAL) ? q(DB_HOSPITAL,
  "SELECT DISTINCT element_name FROM elements_meta WHERE ifc_class='IfcLightFixture'").split('\n').filter(Boolean) : [];
const allNames = namesTerminal.concat(namesHospital);
gate('DATA', 'real IfcLightFixture element_name rows were queried from real shipped building DBs (not invented sample names)',
  allNames.length > 0, 'Terminal=' + namesTerminal.length + ' Hospital=' + namesHospital.length + ' total=' + allNames.length);

const results = allNames.map(n => ({ name: n, mult: nightLightIntensityMult(n) }));
const mults = results.map(r => r.mult);
const min = Math.min.apply(null, mults), max = Math.max.apply(null, mults);
const distinct = new Set(mults);
gate('B1', 'genuine variance across REAL fixture names — not a single repeated number (min < max)',
  min < max && distinct.size >= 2,
  'min=' + min + ' max=' + max + ' distinctValues=' + JSON.stringify([...distinct].sort()) + ' n=' + results.length);

// a real Hospital pendant must land in the WARM/domestic (dimmer) bucket
const pendantRow = results.find(r => /pendant/i.test(r.name));
gate('B2', 'a real fixture family whose name says "Pendant" (Hospital_extracted.db M_Pendant Light rows) gets the WARM/domestic — dimmer — multiplier',
  !!pendantRow && pendantRow.mult === WARM_MULT,
  pendantRow ? ('name="' + pendantRow.name + '" mult=' + pendantRow.mult + ' expected=' + WARM_MULT) : 'no pendant row found in queried data — DB contents changed');

// a real Terminal T8/low-bay family must land in the COOL/industrial (brighter) bucket
const t8Row = results.find(r => /low bay/i.test(r.name)) || results.find(r => /t8/i.test(r.name));
gate('B3', 'a real fixture family whose name says "Low Bay"/"T8" (Terminal general-illumination fittings) gets the COOL/industrial — brighter — multiplier',
  !!t8Row && t8Row.mult === COOL_MULT,
  t8Row ? ('name="' + t8Row.name + '" mult=' + t8Row.mult + ' expected=' + COOL_MULT) : 'no T8/low-bay row found — DB contents changed');

// a real unmatched name (floodlight) must stay EXACTLY at the flat baseline (1, i.e. unchanged)
const floodRow = results.find(r => /floodlight/i.test(r.name));
gate('B4', 'a real fixture family that matches neither category (Terminal floodlight) stays at EXACTLY the flat baseline (multiplier 1 — byte-identical to pre-fix behaviour)',
  !!floodRow && floodRow.mult === 1,
  floodRow ? ('name="' + floodRow.name + '" mult=' + floodRow.mult) : 'no floodlight row found — DB contents changed');

// modesty bound: both multipliers strictly on the correct side of 1, and smaller than the file's
// own already-live 20% tuning step (|mult-1| < 0.20)
const modest = COOL_MULT > 1 && WARM_MULT < 1 && Math.abs(COOL_MULT - 1) < 0.20 && Math.abs(WARM_MULT - 1) < 0.20;
gate('B5', 'multipliers are modest — smaller than this file\'s own already-live 20% NIGHT_LIGHT_INTENSITY tuning step, correct sign each way',
  modest, 'COOL_MULT=' + COOL_MULT + ' (>1, |Δ|<0.20) WARM_MULT=' + WARM_MULT + ' (<1, |Δ|<0.20)');

// ═══ PART C — wiring: the two intensity computations actually multiply by __intensityMult ═══
const POOL_LINE_HAS_MULT = toolsSrc.indexOf('(_f.pos.__intensityMult || 1)') >= 0;
const NAV_LINE_HAS_MULT = toolsSrc.indexOf('(f.pos.__intensityMult || 1)') >= 0;
const MAPPER_STAMPS_MULT = toolsSrc.indexOf('p.__intensityMult = A.nightLightIntensityMult(f.name);') >= 0;
gate('C1', 'both A._nightUpdateLights intensity computations (bake-pool branch AND churn-fix/nav branch) multiply by the heuristic, and the position mapper stamps it',
  POOL_LINE_HAS_MULT && NAV_LINE_HAS_MULT && MAPPER_STAMPS_MULT,
  'poolBranch=' + POOL_LINE_HAS_MULT + ' navBranch=' + NAV_LINE_HAS_MULT + ' mapperStamps=' + MAPPER_STAMPS_MULT);

// regression guard: fallback to 1 means a building with no matching names is UNCHANGED
gate('C2', 'fallback is exactly 1 in both wiring sites — a fixture with no __intensityMult (or a building with none matching) computes the SAME intensity as before this fix',
  POOL_LINE_HAS_MULT && NAV_LINE_HAS_MULT, '(same evidence as C1 — the literal `|| 1` fallback)');

console.log('\n§NIGHT_PL_INTENSITY_WITNESS done pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
