#!/usr/bin/env node
// witness_geomap.js — W-GEOMAP-TIER1 / W-GEOMAP-TIER2 / W-GEOMAP-EXPLAIN / W-GEOMAP-NONINVENT
// (bim-compiler prompts/RESUME_IFC_BOM_GEOMAPPING.md §WITNESS/ACCEPTANCE).
//
// ISSUES PROVED (each check names the failure it would expose):
//   TIER1     the lib returns EXACTLY what the mined sidecar says (no mutation, no addition),
//             deterministically (call twice -> deep-equal). DB-ground-truth agreement itself is
//             proven bim-compiler-side (scripts/witness_geomap_tier1.py, 100%).
//   TIER2     confidence is the artifact's MEASURED split-half number — not asserted, not invented;
//             feeding a class's own median dims back ranks that class #1.
//   EXPLAIN   every result (all tiers incl. refusals) carries non-empty `why` citing a real
//             relation/band/source — never "trust me".
//   NONINVENT unknown building / unknown guid / out-of-all-bands dims -> tier 0 'unknown';
//             the lib NEVER fabricates a classification without a matching signal.
// Read the §-log, not the exit code alone.
'use strict';
const CG = require('../classify_geom.js');
const fs = require('fs');
const path = require('path');

const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'geomap_rules.json'), 'utf8'));
const relDX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'relations_DX.json'), 'utf8'));

let fails = 0;
function check(name, cond, detail) {
  if (!cond) fails++;
  console.log(`§W-GEOMAP ${cond ? 'PASS' : 'FAIL'}: ${name} ${detail || ''}`);
}

// ── W-GEOMAP-TIER1: sidecar read-through, deterministic ──
const guids = Object.keys(relDX.elements).sort();
const rich = guids.find(g => {
  const e = relDX.elements[g];
  return e.storey && e.space && e.type_name;
});
check('TIER1 fixture exists (DX guid with storey+space+type)', !!rich, `(${rich})`);
const r1a = CG.classify({ building: 'DX', guid: rich });
const r1b = CG.classify({ building: 'DX', guid: rich });
check('TIER1 tier=1 with relational facts', r1a.tier === 1 && r1a.class_or_fact.storey === relDX.elements[rich].storey
  && r1a.class_or_fact.space === relDX.elements[rich].space
  && r1a.class_or_fact.type_name === relDX.elements[rich].type_name,
  `(storey=${r1a.class_or_fact.storey} type=${r1a.class_or_fact.type_name})`);
check('TIER1 deterministic re-run identical', JSON.stringify(r1a) === JSON.stringify(r1b));
check('TIER1 frame contract present', r1a.frame && r1a.frame.frame === 'world-zup' && r1a.frame.units === 'm',
  `(${JSON.stringify(r1a.frame)})`);

// ── W-GEOMAP-TIER2: measured confidence, median-dims sanity ──
const dxEntry = rules.buildings.DX;
const doorBand = dxEntry.classes.IfcDoor;
const doorMedDims = doorBand.med.map(Math.exp);
const r2 = CG.classify({ building: 'DX', dims: doorMedDims });
check('TIER2 median-dims rank-1 recovers own class', r2.tier === 2 && r2.class_or_fact === 'IfcDoor',
  `(got ${r2.class_or_fact})`);
const measuredTop1 = Math.round(dxEntry.measured.top1 / dxEntry.measured.n * 1000) / 1000;
check('TIER2 confidence == artifact measured top-1 (never invented)', r2.confidence === measuredTop1,
  `(${r2.confidence} vs measured ${dxEntry.measured.top1}/${dxEntry.measured.n})`);
const r2v = CG.classify({ building: 'DX', dims: doorMedDims, ifc_class: 'IfcDoor' });
check('TIER2 validator: own median dims are in own band', r2v.tier === 2 && r2v.class_or_fact.in_band === true,
  `(z=${r2v.class_or_fact.z})`);

// ── W-GEOMAP-EXPLAIN: every result cites, including refusals ──
const results = [r1a, r2, r2v,
  CG.classify({ building: 'DX', guid: 'NO_SUCH_GUID_000000000' }),
  CG.classify({ building: 'Atlantis', dims: [1, 1, 1] }),
  CG.classify({ building: 'DX', dims: [500, 500, 500] })];
check('EXPLAIN every result has non-empty why', results.every(r => typeof r.why === 'string' && r.why.length > 10));
check('EXPLAIN tier1 why cites source IFC + relation', /Ifc2x3_Duplex.*IfcRel/.test(r1a.why), `(${r1a.why.slice(0, 80)}...)`);
check('EXPLAIN tier2 why cites measured band', /measured|split-half/.test(r2.why) && /band/.test(r2.why), `(${r2.why.slice(0, 80)}...)`);

// ── W-GEOMAP-NONINVENT: refusals are refusals ──
check('NONINVENT unknown guid refuses (tier 0)', results[3].tier === 0 && results[3].class_or_fact === 'unknown');
check('NONINVENT unknown building refuses (cross-building REFUSE)', results[4].tier === 0 && /REFUSED/.test(results[4].why));
check('NONINVENT out-of-all-bands dims refuse', results[5].tier === 0 && /outside EVERY measured band/.test(results[5].why));
const proxy = CG.classify({ building: 'DX', dims: doorMedDims, ifc_class: 'IfcElephant' });
check('NONINVENT validating an unbanded class refuses', proxy.tier === 0 && /no measured band/.test(proxy.why));

// ── describe() seam for the LOD300_CATALOG replacement ──
const d = CG.describe('DX', 'IfcDoor');
check('DESCRIBE returns measured BOM description with provenance', !!d && d.count === doorBand.count && /md5/.test(d.why),
  `(n=${d && d.count}, med_m=${d && d.dims_m.med.join('x')})`);

console.log(`§W-GEOMAP RESULT: ${fails === 0 ? 'GREEN' : `RED (${fails} failures)`}`);
process.exit(fails ? 1 : 0);
