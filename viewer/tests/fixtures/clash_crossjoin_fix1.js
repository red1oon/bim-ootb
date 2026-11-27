// ⚠ DO NOT REMOVE — FROZEN RED-CONTROL FIXTURE for W-CLASH-COUNT-AGREE (R2), bim-compiler prompts/MOBILE_PERF.md §WO-20.
// This is the whole-building SQL cross-join that WO-20's FIRST fix put in measure.js (bim-ootb branch commit 093fdbde, REJECTED by the
// designer 2026-11-28: it freezes the tab on a large building — 33 s for one pair on a 16k-element model). It is NOT shipped code and nothing
// loads it but the witness: R2 puts it back in front of the R-tree path and K4 ("while the index is not ready, no statement joins
// element_transforms a to element_transforms b") must FAIL on it. Do not "fix" or reuse it.
'use strict';
// The list SQL of that fix for one pair (whole building, tolerance as the R-tree walk), LIMIT 1 so a red run stays cheap.
module.exports = function crossJoinListSql(tolerance, a, b) {
  const ov = ax => 'MIN(a.center_' + ax + ' + a.bbox_' + ax + '/2, b.center_' + ax + ' + b.bbox_' + ax + '/2) - MAX(a.center_' + ax + ' - a.bbox_' + ax + '/2, b.center_' + ax + ' - b.bbox_' + ax + '/2)';
  const overlap = 'MIN(' + ov('x') + ', ' + ov('y') + ', ' + ov('z') + ')';
  const join = ' AND (a.center_x - a.bbox_x/2) < (b.center_x + b.bbox_x/2) AND (a.center_x + a.bbox_x/2) > (b.center_x - b.bbox_x/2)' +
    ' AND (a.center_y - a.bbox_y/2) < (b.center_y + b.bbox_y/2) AND (a.center_y + a.bbox_y/2) > (b.center_y - b.bbox_y/2)' +
    ' AND (a.center_z - a.bbox_z/2) < (b.center_z + b.bbox_z/2) AND (a.center_z + a.bbox_z/2) > (b.center_z - b.bbox_z/2)' +
    (tolerance > 0 ? ' AND ' + overlap + ' >= ' + tolerance : '');
  const pairCond = "(ma.discipline = '" + a + "' AND mb.discipline = '" + b + "') OR (ma.discipline = '" + b + "' AND mb.discipline = '" + a + "')";
  return 'SELECT a.guid, b.guid, ma.ifc_class, mb.ifc_class, ma.discipline, mb.discipline, ma.element_name, mb.element_name, ' + overlap + ' AS overlap_m' +
    ' FROM element_transforms a JOIN elements_meta ma ON a.guid = ma.guid JOIN element_transforms b ON a.guid < b.guid JOIN elements_meta mb ON b.guid = mb.guid' +
    ' WHERE 1=1 AND (' + pairCond + ')' + join + ' LIMIT 1';
};
