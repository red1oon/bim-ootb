/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// semantic_enrichment.js — S228: Classify geometry into IFC semantics
// PURE FUNCTIONS. No dependencies. Testable anywhere.
// Implementing S228_import_format_to_db.md §File 1 — Witness: W-CLASSIFY

var NAME_TO_IFC = [
  // Ordered by specificity — first match wins
  // ARC
  { pattern: /\b(exterior.?wall|ext.?wall)\b/i,              ifcClass: 'IfcWall',           disc: 'ARC' },
  { pattern: /\b(interior.?wall|int.?wall|partition)\b/i,     ifcClass: 'IfcWall',           disc: 'ARC' },
  { pattern: /\bwall\b/i,                                     ifcClass: 'IfcWall',           disc: 'ARC' },
  { pattern: /\bdoor\b/i,                                     ifcClass: 'IfcDoor',           disc: 'ARC' },
  { pattern: /\bwindow\b/i,                                   ifcClass: 'IfcWindow',         disc: 'ARC' },
  { pattern: /\b(slab|floor)\b/i,                             ifcClass: 'IfcSlab',           disc: 'ARC' },
  { pattern: /\broof\b/i,                                     ifcClass: 'IfcRoof',           disc: 'ARC' },
  { pattern: /\bceiling\b/i,                                  ifcClass: 'IfcCovering',       disc: 'ARC' },
  { pattern: /\bstair/i,                                      ifcClass: 'IfcStairFlight',    disc: 'ARC' },
  { pattern: /\brailing\b/i,                                  ifcClass: 'IfcRailing',        disc: 'ARC' },
  { pattern: /\bramp\b/i,                                     ifcClass: 'IfcRamp',           disc: 'ARC' },
  { pattern: /\bcurtain.?wall\b/i,                            ifcClass: 'IfcCurtainWall',    disc: 'ARC' },
  // STR
  { pattern: /\bcolumn\b/i,                                   ifcClass: 'IfcColumn',         disc: 'STR' },
  { pattern: /\bbeam\b/i,                                     ifcClass: 'IfcBeam',           disc: 'STR' },
  { pattern: /\b(footing|foundation)\b/i,                     ifcClass: 'IfcFooting',        disc: 'STR' },
  { pattern: /\bpile\b/i,                                     ifcClass: 'IfcPile',           disc: 'STR' },
  // PLB
  { pattern: /\bpipe\b/i,                                     ifcClass: 'IfcPipeSegment',    disc: 'PLB' },
  { pattern: /\b(sink|toilet|basin|shower|bath|faucet)\b/i,   ifcClass: 'IfcSanitaryTerminal', disc: 'PLB' },
  // ACMV
  { pattern: /\bduct\b/i,                                     ifcClass: 'IfcDuctSegment',    disc: 'ACMV' },
  // ELEC
  { pattern: /\b(cable|wire)\b/i,                             ifcClass: 'IfcCableSegment',   disc: 'ELEC' },
  { pattern: /\blight\b/i,                                    ifcClass: 'IfcLightFixture',   disc: 'ELEC' },
  { pattern: /\b(outlet|socket|switch)\b/i,                   ifcClass: 'IfcOutlet',         disc: 'ELEC' },
  { pattern: /\b(appliance|fridge|oven|washer|dryer)\b/i,     ifcClass: 'IfcElectricAppliance', disc: 'ELEC' },
  // FP
  { pattern: /\bsprinkler\b/i,                                ifcClass: 'IfcFireSuppressionTerminal', disc: 'FP' },
  // Furnishing (last — broad patterns)
  { pattern: /\b(furniture|sofa|table|chair|desk|bed|cabinet|shelf)\b/i, ifcClass: 'IfcFurnishingElement', disc: 'ARC' },
];

var MATERIAL_TO_IFC = [
  { pattern: /\bconcrete\b/i,   ifcClass: 'IfcSlab',           disc: 'STR' },
  { pattern: /\bsteel\b/i,      ifcClass: 'IfcBeam',           disc: 'STR' },
  { pattern: /\bbrick\b/i,      ifcClass: 'IfcWall',           disc: 'ARC' },
  { pattern: /\bglass\b/i,      ifcClass: 'IfcWindow',         disc: 'ARC' },
  { pattern: /\bcopper\b/i,     ifcClass: 'IfcPipeSegment',    disc: 'PLB' },
  { pattern: /\bpvc\b/i,        ifcClass: 'IfcPipeSegment',    disc: 'PLB' },
];

var STOREY_BANDS = [
  { min: -Infinity, max: -0.5,      name: 'Basement' },
  { min: -0.5,      max: 3.5,       name: 'Ground Floor' },
  { min: 3.5,       max: 6.5,       name: 'Level 1' },
  { min: 6.5,       max: 9.5,       name: 'Level 2' },
  { min: 9.5,       max: 12.5,      name: 'Level 3' },
  { min: 12.5,      max: Infinity,  name: 'Upper Levels' },
];

var DEFAULT_CLASS = { ifcClass: 'IfcBuildingElementProxy', disc: 'ARC' };

// Normalize underscores/hyphens/dots to spaces so \b word boundaries work
function normalizeName(name) {
  return name ? name.replace(/[_\-\.]/g, ' ') : '';
}

function matchTable(table, name) {
  if (!name) return null;
  var norm = normalizeName(name);
  for (var i = 0; i < table.length; i++) {
    if (table[i].pattern.test(norm)) {
      return { ifcClass: table[i].ifcClass, disc: table[i].disc };
    }
  }
  return null;
}

function classify(nodeName, materialName, parentName) {
  // 4-tier cascade: node name → material name → parent name → default
  var hit;
  hit = matchTable(NAME_TO_IFC, nodeName);
  if (hit) return hit;
  hit = matchTable(MATERIAL_TO_IFC, materialName);
  if (hit) return hit;
  hit = matchTable(NAME_TO_IFC, materialName);
  if (hit) return hit;
  hit = matchTable(NAME_TO_IFC, parentName);
  if (hit) return hit;
  return { ifcClass: DEFAULT_CLASS.ifcClass, disc: DEFAULT_CLASS.disc };
}

function classifyStorey(elevationZ) {
  for (var i = 0; i < STOREY_BANDS.length; i++) {
    var b = STOREY_BANDS[i];
    if (elevationZ >= b.min && elevationZ < b.max) {
      return b.name;
    }
  }
  return 'Upper Levels';
}

function generateGUID(prefix, nodeName, vertexCount, bboxMin, bboxMax) {
  // Deterministic hash from input signature
  var input = prefix + '|' + nodeName + '|' + vertexCount +
    '|' + bboxMin[0].toFixed(6) + ',' + bboxMin[1].toFixed(6) + ',' + bboxMin[2].toFixed(6) +
    '|' + bboxMax[0].toFixed(6) + ',' + bboxMax[1].toFixed(6) + ',' + bboxMax[2].toFixed(6);
  // Simple but deterministic hash (FNV-1a inspired)
  var hash = 0x811c9dc5;
  for (var i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  // Generate 16 hex chars from two rounds
  var hash2 = 0x27d4eb2d;
  for (var j = 0; j < input.length; j++) {
    hash2 ^= input.charCodeAt(j);
    hash2 = (hash2 * 0x01000193) >>> 0;
  }
  var hex = ('00000000' + hash.toString(16)).slice(-8) +
            ('00000000' + hash2.toString(16)).slice(-8);
  return prefix + '_' + hex;
}

function extractRGBA(material) {
  if (!material) return '0.700,0.700,0.700,1.000';
  var mat = Array.isArray(material) ? material[0] : material;
  if (!mat) return '0.700,0.700,0.700,1.000';
  var r = 0.7, g = 0.7, b = 0.7, a = 1.0;
  if (mat.color) {
    r = mat.color.r !== undefined ? mat.color.r : 0.7;
    g = mat.color.g !== undefined ? mat.color.g : 0.7;
    b = mat.color.b !== undefined ? mat.color.b : 0.7;
  }
  if (mat.opacity !== undefined) a = mat.opacity;
  return r.toFixed(3) + ',' + g.toFixed(3) + ',' + b.toFixed(3) + ',' + a.toFixed(3);
}

// Export
if (typeof self !== 'undefined') {
  self.SemanticEnrichment = { classify: classify, classifyStorey: classifyStorey, generateGUID: generateGUID, extractRGBA: extractRGBA };
}
if (typeof module !== 'undefined') {
  module.exports = { classify: classify, classifyStorey: classifyStorey, generateGUID: generateGUID, extractRGBA: extractRGBA, NAME_TO_IFC: NAME_TO_IFC, MATERIAL_TO_IFC: MATERIAL_TO_IFC };
}
