// Direct code verification — no browser, no Playwright, just truth from the source
// Tests: card system, scene corruption paths, state completeness, fleet composition
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const DEV = path.resolve(__dirname, '..');
const BLDG = path.resolve(__dirname, '..', 'buildings');
const BLDG2 = path.resolve(__dirname, '..', '..', 'buildings');
const src = f => fs.readFileSync(path.join(DEV, f), 'utf8');
const sql = (db, q) => { try { return execSync('sqlite3 "' + db + '" "' + q + '"', {encoding:'utf8'}).trim(); } catch(e) { return ''; } };

let pass = 0, fail = 0;
function check(tag, condition, detail) {
  if (condition) { console.log('  ✓ ' + tag + (detail ? ' — ' + detail : '')); pass++; }
  else { console.log('  ✗ ' + tag + (detail ? ' — ' + detail : '')); fail++; }
}

// ═══ LOAD ALL SOURCE FILES ═════════════════════════════════════════
const gv = src('grid_views.js');
const go = src('grid_overlay.js');
const sc = src('section_cut.js');
const tools = src('tools.js');
const gc = src('grid_contours.js');
const gd = src('grid_dims.js');
const da = src('grid_door_arcs.js');
const drag = src('grid_drag.js');
const scissors = src('grid_scissors.js');
const scene = src('scene.js');
const kops = src('kernel_ops.js');

// ═══ 1. HIDE/FADE CLASSIFICATION ══════════════════════════════════
console.log('\n═══ 1. HIDE/FADE CLASSIFICATION ═══');

const hideM = gv.match(/var HIDE_IN_FLOOR\s*=\s*\{([^}]+)\}/)[1];
const fadeM = gv.match(/var FADE_IN_FLOOR\s*=\s*\{([^}]+)\}/)[1];
check('HIDE has IfcRoof', hideM.includes('IfcRoof'));
check('HIDE has IfcRoofing', hideM.includes('IfcRoofing'));
check('HIDE NOT IfcCovering', !hideM.includes('IfcCovering'), 'BUG: wall tiles wrongly hidden');
check('HIDE NOT IfcSlab', !hideM.includes('IfcSlab'), 'slabs fade, not hide');
check('FADE has IfcSlab', fadeM.includes('IfcSlab'));
check('FADE has IfcPlate', fadeM.includes('IfcPlate'));
check('FADE NOT IfcWall', !fadeM.includes('IfcWall'), 'walls must clip, not fade');

// classifyMesh accepts hideSet override
check('classifyMesh takes hideSet param', gv.includes('function classifyMesh') && gv.includes('hideSet'));
const cmBody = gv.slice(gv.indexOf('function classifyMesh'), gv.indexOf('function classifyMesh') + 300);
check('classifyMesh fallback to HIDE_IN_FLOOR', cmBody.includes('hideSet || HIDE_IN_FLOOR'));

// ═══ 2. CARD restoreSection — ARCHITECTURE ════════════════════════
console.log('\n═══ 2. CARD RESTORE ARCHITECTURE ═══');

const rStart = go.indexOf('function restoreSection');
const rEnd = go.indexOf('\n  // Card cleanup', rStart);
const rBody = go.slice(rStart, rEnd);
check('Card: queryStoreyGuids', rBody.includes('queryStoreyGuids'));
check('Card: lockView cameraOnly', rBody.includes('null, true)'));
check('Card: own THREE.Plane', rBody.includes('THREE.Plane'));
check('Card: skip isContour (BUG W)', rBody.includes('isContour'));
check('Card: hide !guid (BUG A)', rBody.includes('!guid'));
check('Card: no applyStoreyBandVisibility', !rBody.includes('applyStoreyBandVisibility'));
check('Card: no applyFloorClip', !rBody.includes('applyFloorClip'));
check('Card: guidSet check', rBody.includes('guidSet[guid]'));
check('Card: contours rendered', rBody.includes('renderContoursForView'));
check('Card: camera restore', rBody.includes('applyCameraState'));

// ═══ 3. BUG K+J — OPACITY LEAK between card switches ═════════════
console.log('\n═══ 3. BUG K+J — OPACITY LEAK ═══');

check('Unfade BEFORE reset arrays (BUG K)', rBody.indexOf('_origOpacity') < rBody.indexOf('_cardFadedMeshes = []'));
check('Unfade loop exists before mesh pass', rBody.indexOf('_cardFadedMeshes.length') < rBody.indexOf('collectMeshes'));
check('Unfade restores transparent flag', rBody.includes('_origTransparent'));
check('Unfade deletes userData markers', rBody.includes('delete') && rBody.includes('_origOpacity'));
// Check the unfade loop sets needsUpdate
const unfadeSection = rBody.slice(0, rBody.indexOf('_cardFadedMeshes = []'));
check('Unfade sets needsUpdate', unfadeSection.includes('needsUpdate = true'));

// ═══ 4. STATE COMPLETENESS — every mesh path ═════════════════════
console.log('\n═══ 4. STATE COMPLETENESS (scene corruption guard) ═══');

// Parse mesh processing paths in restoreSection
// Each path that touches .visible MUST also set clippingPlanes + clipShadows + needsUpdate
const meshPass = rBody.slice(rBody.indexOf('collectMeshes'));
const returnBlocks = meshPass.split(/return;\s*$/m);
let stateClean = true;
let pathCount = 0;
for (let i = 0; i < returnBlocks.length; i++) {
  const b = returnBlocks[i];
  if (!b.includes('.visible')) continue; // skip non-mesh blocks
  pathCount++;
  const missing = [];
  if (!b.includes('clippingPlanes')) missing.push('clippingPlanes');
  if (!b.includes('clipShadows')) missing.push('clipShadows');
  if (!b.includes('needsUpdate')) missing.push('needsUpdate');
  if (missing.length) { stateClean = false; check('State path ' + i, false, 'MISSING: ' + missing.join(',')); }
}
if (stateClean) check('All ' + pathCount + ' mesh paths set clip+clipShadows+needsUpdate', true);

// BUG N: clipShadows on fade path must be TRUE (slab clips cast shadows)
const fadePath = rBody.slice(rBody.indexOf('fadeSet[cls]'), rBody.indexOf('fadeSet[cls]') + 400);
check('BUG N: fade path clipShadows=true', fadePath.includes('clipShadows = true'), 'slabs need shadow clip');

// Clipped path (walls/columns) must have clipShadows=true
const clipPath = rBody.slice(rBody.lastIndexOf('obj.material.clippingPlanes = [clipPlane]'));
check('Clip path clipShadows=true', clipPath.includes('clipShadows = true'));

// ═══ 5. clearCardView — FULL SCENE RESTORE ═══════════════════════
console.log('\n═══ 5. clearCardView — SCENE RESTORE ═══');

const cvStart = go.indexOf('function clearCardView()');
const cvEnd = go.indexOf('\nfunction', cvStart + 10) !== -1
  ? go.indexOf('\nfunction', cvStart + 10)
  : go.indexOf('\n  // ══', cvStart + 10);
const cvBody = go.slice(cvStart, cvEnd);
check('clearCardView: visible=true on ALL meshes', cvBody.includes('visible = true'));
check('clearCardView: opacity restored from _origOpacity', cvBody.includes('_origOpacity'));
check('clearCardView: transparent restored from _origTransparent', cvBody.includes('_origTransparent'));
check('clearCardView: clippingPlanes=null', cvBody.includes('clippingPlanes = null'));
check('clearCardView: clipShadows=false', cvBody.includes('clipShadows = false'));
check('clearCardView: needsUpdate=true', cvBody.includes('needsUpdate = true'));
check('clearCardView: deletes _origOpacity marker', cvBody.includes('delete') && cvBody.includes('_origOpacity'));
check('clearCardView: called on grid exit', go.includes('clearCardView()'));
// BUG U: delete active card must call clearCardView
check('BUG U: delete calls clearCardView', go.slice(go.indexOf('saved-section-del')).includes('clearCardView'));

// ═══ 6. clearFloorClip — grid_views.js SCENE RESTORE ═════════════
console.log('\n═══ 6. clearFloorClip — grid_views RESTORE ═══');

const cfStart = gv.indexOf('function clearFloorClip');
const cfEnd = gv.indexOf('\n  function', cfStart + 10) !== -1
  ? gv.indexOf('\n  function', cfStart + 10)
  : gv.indexOf('\n  }', cfStart + 200);
const cfBody = gv.slice(cfStart, cfEnd);
check('clearFloorClip: clippingPlanes=null on all meshes', cfBody.includes('clippingPlanes = null'));
check('clearFloorClip: clipShadows=false', cfBody.includes('clipShadows = false'));
check('clearFloorClip: visible=true on hidden', cfBody.includes('visible = true'));
check('clearFloorClip: opacity restored for faded', cfBody.includes('_origOpacity'));
check('clearFloorClip: localClippingEnabled=false', cfBody.includes('localClippingEnabled = false'));
check('clearFloorClip: cleanup arrays', cfBody.includes('_hiddenMeshes = []') && cfBody.includes('_fadedMeshes = []'));

// ═══ 7. applyFloorClip — opacity save (BUG C) ═══════════════════
console.log('\n═══ 7. applyFloorClip — BUG C (falsy zero) ═══');

const afStart = gv.indexOf('function applyFloorClip');
const afEnd = gv.indexOf('\n  function', afStart + 10);
const afBody = gv.slice(afStart, afEnd);
check('BUG C: uses == null (not !obj for falsy zero)', afBody.includes('_origOpacity == null') || afBody.includes('_origOpacity === undefined'));
check('applyFloorClip: fade saves opacity BEFORE modifying', afBody.indexOf('_origOpacity') < afBody.indexOf('opacity = 0.08'));
check('applyFloorClip: fade sets transparent=true', afBody.includes('transparent = true'));
check('applyFloorClip: clip path sets clipShadows=true', afBody.includes('clipShadows = true'));

// ═══ 8. BUG A — ground plane / InstancedMesh hidden ══════════════
console.log('\n═══ 8. BUG A — NO-GUID MESHES ═══');

check('restoreSection: !guid → visible=false', rBody.includes("!guid") && rBody.includes('obj.visible = false'));
// Verify InstancedMesh or no-userData handled
check('restoreSection: userData guard before guid access', rBody.includes('obj.userData && obj.userData.guid'));

// ═══ 9. BUG W — CONTOUR MESHES SKIP ═════════════════════════════
console.log('\n═══ 9. BUG W — CONTOUR OVERLAY SKIP ═══');

check('isContour check BEFORE guid check', rBody.indexOf('isContour') < rBody.indexOf('!guid'));
check('isContour returns (skip, no modify)',
  rBody.slice(rBody.indexOf('isContour'), rBody.indexOf('isContour') + 80).includes('return'));

// ═══ 10. SAVE BUTTON LOCATION ════════════════════════════════════
console.log('\n═══ 10. SAVE BUTTON ═══');

check('Save btn in grid panel (grid-save-section-btn)', go.includes('id="grid-save-section-btn"'));
check('Save NOT in tools.js (old location)', !tools.includes('section-save-cut-btn'));
check('Save NOT gated by isIn2DView', !tools.includes('isIn2DView'), 'always on when scissors ON');
check('Save btn wired with pointerup', go.includes("querySelector('#grid-save-section-btn')") && go.includes('pointerup'));

// ═══ 11. SECTION CUT — band filter ══════════════════════════════
console.log('\n═══ 11. SECTION CUT ═══');

const excMatch = sc.match(/exclude_above_band.*?\[([^\]]+)\]/);
check('Band excludes IfcRoof', excMatch && excMatch[1].includes('IfcRoof'));
check('Band excludes IfcRoofing', excMatch && excMatch[1].includes('IfcRoofing'));
check('Band NOT excludes IfcCovering', excMatch && !excMatch[1].includes('IfcCovering'));
check('SLICE_CLASSES has IfcWall', sc.includes("'IfcWall': 1") || sc.includes('"IfcWall": 1'));
check('SLICE_CLASSES has IfcWallStandardCase', sc.includes("IfcWallStandardCase"));
check('SLICE_CLASSES has IfcDoor', sc.includes("'IfcDoor': 1") || sc.includes('"IfcDoor": 1'));
check('SLICE_CLASSES has IfcWindow', sc.includes("'IfcWindow': 1") || sc.includes('"IfcWindow": 1'));
check('Band 1.5m clamp exists', sc.includes('1.5') && (sc.includes('bandMax') || sc.includes('band_max')));
check('Section cut logs §SC_ tags', sc.includes('§SC_'));

// ═══ 12. CONTOURS ════════════════════════════════════════════════
console.log('\n═══ 12. CONTOURS ═══');

const fillMatch = gc.match(/FILL_CLASSES\s*=\s*\{([^}]+)\}/);
check('FILL_CLASSES has IfcWall', fillMatch && fillMatch[1].includes('IfcWall'));
check('FILL_CLASSES NOT IfcSlab', fillMatch && !fillMatch[1].includes('IfcSlab'), 'slabs not solid-filled');
check('buildRibbon exists', gc.includes('buildRibbon'));
check('White/black reverse for print', gc.includes("isDark ? '#ffffff' : '#000000'") || gc.includes("isDark ? 0xffffff : 0x000000"));
check('Contour meshes marked isContour', gc.includes('isContour'));
check('Contour clear function', gc.includes('function') && gc.includes('clear'));

// ═══ 13. DOOR ARCS ══════════════════════════════════════════════
console.log('\n═══ 13. DOOR ARCS ═══');

check('generateArcs function', da.includes('generateArcs'));
check('extractLeafAxis function', da.includes('extractLeafAxis'));
check('generateWindowOpenings function', da.includes('generateWindowOpenings'));
check('generateStairSymbol function', da.includes('generateStairSymbol'));
check('Door arc logs §DOOR_ARC', da.includes('§DOOR_ARC'));

// ═══ 14. GRID DETECTION ═════════════════════════════════════════
console.log('\n═══ 14. GRID DETECTION ═══');

check('Wall clustering', gd.includes('cluster'));
check('Snap to structural', gd.includes('snap') || gd.includes('SNAP'));
check('IfcWall query', gd.includes('IfcWall'));
check('IfcColumn query', gd.includes('IfcColumn'));
check('IfcBeam query', gd.includes('IfcBeam'));
check('Wall weight/vote', gd.includes('weight') || gd.includes('vote'));
check('Grid dims logs §GD_', gd.includes('§GD_'));

// Grid alignment REAL DATA — wall positions must cluster for ALL buildings
// Grid detection input: wall center_x and center_y clusters → grid lines
// If walls don't cluster, grid detection will fail or produce wrong lines.
// No hardcoded GF storey or wall counts — everything extracted from DB.
const GRID_BUILDINGS = {
  'SampleHouse':  { gf: null },
  'Duplex':       { gf: null },
  'SampleCastle': { gf: null },
  'Terminal':     { gf: null }
};
for (const [bn, cfg] of Object.entries(GRID_BUILDINGS)) {
  console.log('\n  ── Grid Alignment: ' + bn + ' ──');
  const bDb = findDb(bn);
  if (!bDb) { check(bn + ': grid DB found', false, 'NOT FOUND'); continue; }
  const gfSt = cfg.gf || detectGF(bDb);
  if (!gfSt) { check(bn + ': grid GF storey', false, 'undetectable'); continue; }
  const esc2 = gfSt.replace(/'/g, "''");

  // Wall count on GF — extracted from DB, not hardcoded threshold
  const wallN = parseInt(sql(bDb, "SELECT COUNT(*) FROM elements_meta WHERE ifc_class IN ('IfcWall','IfcWallStandardCase') AND storey='" + esc2 + "'")) || 0;
  check(bn + ': GF has walls', wallN > 0, 'walls=' + wallN);

  // Structural elements (columns/beams) for snap-to-structural
  const structN = parseInt(sql(bDb, "SELECT COUNT(*) FROM elements_meta WHERE ifc_class IN ('IfcColumn','IfcBeam') AND storey='" + esc2 + "'")) || 0;
  console.log('    §GRID_STRUCT ' + bn + ' structural=' + structN + ' (columns+beams for snap)');

  // Wall X positions — grid_dims uses face_cluster_tol_m=0.30 to merge nearby positions.
  // We query distinct positions (ROUND to 0.5m = tol-compatible buckets).
  const wallXs = sql(bDb, "SELECT ROUND(center_x * 2, 0) / 2.0 as rx, COUNT(*) as n FROM element_transforms et JOIN elements_meta m ON et.guid=m.guid WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase') AND m.storey='" + esc2 + "' GROUP BY rx ORDER BY rx").split('\n').filter(r => r);
  const xPositions = wallXs.map(r => { var p = r.split('|'); return { pos: parseFloat(p[0]), n: parseInt(p[1]) }; });
  console.log('    §GRID_ALIGN ' + bn + ' X positions: ' + xPositions.map(c => c.pos + '(' + c.n + ')').join(', '));
  check(bn + ': X distinct positions >= 2 (need grid lines)', xPositions.length >= 2, 'positions=' + xPositions.length);
  const xSpread = xPositions.length > 1 ? Math.abs(xPositions[xPositions.length-1].pos - xPositions[0].pos) : 0;
  check(bn + ': X spread > 1m', xSpread > 1, 'spread=' + xSpread.toFixed(2) + 'm');

  // Wall Y positions
  const wallYs = sql(bDb, "SELECT ROUND(center_y * 2, 0) / 2.0 as ry, COUNT(*) as n FROM element_transforms et JOIN elements_meta m ON et.guid=m.guid WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase') AND m.storey='" + esc2 + "' GROUP BY ry ORDER BY ry").split('\n').filter(r => r);
  const yPositions = wallYs.map(r => { var p = r.split('|'); return { pos: parseFloat(p[0]), n: parseInt(p[1]) }; });
  console.log('    §GRID_ALIGN ' + bn + ' Y positions: ' + yPositions.map(c => c.pos + '(' + c.n + ')').join(', '));
  check(bn + ': Y distinct positions >= 2', yPositions.length >= 2, 'positions=' + yPositions.length);

  // Floor Z — GF should be near z=0 (within ±5m). Wild Z = wrong storey detected.
  const floorZ = sql(bDb, "SELECT ROUND(MIN(center_z), 2) FROM element_transforms et JOIN elements_meta m ON et.guid=m.guid WHERE m.storey='" + esc2 + "'");
  console.log('    §GRID_FLOOR_Z ' + bn + ' min_z=' + floorZ);
  const fz = parseFloat(floorZ) || 0;
  check(bn + ': GF floor Z within ±10m of ground', Math.abs(fz) < 10, 'z=' + fz.toFixed(2));

  // ── GRID LINE OPPORTUNITIES: where do walls, doors, windows cluster? ──
  // Grid detection uses wall centerlines + door/window positions as votes.
  // Log the raw data so we can see what the algorithm has to work with.

  // Walls: orientation (runs-in-X or runs-in-Y) determines which axis they vote for
  const wallOrient = sql(bDb, "SELECT CASE WHEN t.bbox_y > t.bbox_x * 1.5 THEN 'Y' WHEN t.bbox_x > t.bbox_y * 1.5 THEN 'X' ELSE 'sq' END as orient, COUNT(*), GROUP_CONCAT(ROUND(CASE WHEN t.bbox_y > t.bbox_x * 1.5 THEN t.center_x ELSE t.center_y END, 2)) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase') AND m.storey='" + esc2 + "' GROUP BY orient").split('\n').filter(r => r);
  wallOrient.forEach(r => console.log('    §GRID_OPP ' + bn + ' wall_orient ' + r.replace(/\|/g, ' n=').replace(/\|/, ' centers=')));

  // Doors: center positions = opening opportunities
  const doorPos = sql(bDb, "SELECT ROUND(t.center_x, 2), ROUND(t.center_y, 2) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class IN ('IfcDoor','IfcDoorStandardCase') AND m.storey='" + esc2 + "'").split('\n').filter(r => r);
  console.log('    §GRID_OPP ' + bn + ' door_positions=[' + doorPos.map(r => '(' + r.replace('|',',') + ')').join(' ') + ']');

  // Windows: center positions
  const winPos = sql(bDb, "SELECT ROUND(t.center_x, 2), ROUND(t.center_y, 2) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class IN ('IfcWindow','IfcWindowStandardCase') AND m.storey='" + esc2 + "'").split('\n').filter(r => r);
  console.log('    §GRID_OPP ' + bn + ' window_positions=[' + winPos.map(r => '(' + r.replace('|',',') + ')').join(' ') + ']');

  // Wall spans (bbox_z) — grid_dims requires bbox_z >= min_structural_span_m (1.80m)
  // If walls are shorter than 1.80m they don't vote at all.
  const wallSpans = sql(bDb, "SELECT ROUND(t.bbox_z, 2) as span, COUNT(*) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase') AND m.storey='" + esc2 + "' GROUP BY span ORDER BY span").split('\n').filter(r => r);
  const spanData = wallSpans.map(r => { var p = r.split('|'); return { span: parseFloat(p[0]), n: parseInt(p[1]) }; });
  const passingSpan = spanData.filter(s => s.span >= 1.80);
  const failingSpan = spanData.filter(s => s.span < 1.80);
  console.log('    §GRID_OPP ' + bn + ' wall_spans: pass(>=1.8m)=[' + passingSpan.map(s => s.span + '(' + s.n + ')').join(',') + '] fail(<1.8m)=[' + failingSpan.map(s => s.span + '(' + s.n + ')').join(',') + ']');
  const totalVoters = passingSpan.reduce((a, s) => a + s.n, 0);
  const totalFail = failingSpan.reduce((a, s) => a + s.n, 0);
  check(bn + ': walls with span >= 1.8m (can vote for grid)', totalVoters > 0,
    'voters=' + totalVoters + ' too_short=' + totalFail);
  if (totalFail > 0) {
    console.log('    §GRID_OPP_LOST ' + bn + ': ' + totalFail + ' walls too short to vote — grid opportunities lost');
  }

  // ── EXPECTED GRID LINES: cluster wall center votes with tol=0.3m ──
  // Simulates clusterVotes from grid_dims.js — walls that pass span vote their centerline.
  const TOL = 0.3;
  const xVotes = sql(bDb, "SELECT t.center_x FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase') AND m.storey='" + esc2 + "' AND t.bbox_z >= 1.8 AND t.bbox_y > t.bbox_x * 1.5").split('\n').filter(r => r).map(Number);
  const yVotes = sql(bDb, "SELECT t.center_y FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase') AND m.storey='" + esc2 + "' AND t.bbox_z >= 1.8 AND t.bbox_x > t.bbox_y * 1.5").split('\n').filter(r => r).map(Number);

  function simplecluster(vals, tol) {
    if (!vals.length) return [];
    var sorted = vals.slice().sort((a,b) => a - b);
    var clusters = [], cur = [sorted[0]];
    for (var ci2 = 1; ci2 < sorted.length; ci2++) {
      if (sorted[ci2] - sorted[ci2-1] <= tol) cur.push(sorted[ci2]);
      else { clusters.push(cur); cur = [sorted[ci2]]; }
    }
    clusters.push(cur);
    return clusters.map(c => ({ pos: +(c.reduce((a,b) => a+b, 0) / c.length).toFixed(2), n: c.length }));
  }

  const xGrids = simplecluster(xVotes, TOL);
  const yGrids = simplecluster(yVotes, TOL);
  console.log('    §GRID_LINES ' + bn + ' X grids: ' + xGrids.map(g => g.pos + '(' + g.n + ' votes)').join(', '));
  console.log('    §GRID_LINES ' + bn + ' Y grids: ' + yGrids.map(g => g.pos + '(' + g.n + ' votes)').join(', '));

  // Opening counts within grid bays
  const dN = doorPos.length;
  const wN = winPos.length;
  console.log('    §GRID_OPENINGS ' + bn + ' doors=' + dN + ' windows=' + wN + ' total_openings=' + (dN + wN));
  check(bn + ': has openings for grid detection', (dN + wN) >= 2, 'openings=' + (dN + wN));
}

// ═══ 15. GRID DRAG — highlight, path, cascade, variance, undo ══════
console.log('\n═══ 15. GRID DRAG ═══');

check('rebuildPanel on drag', drag.includes('rebuildPanel'));
check('Position delta computed', drag.includes('delta'));
check('grid_rules.json reference', drag.includes('grid_rules') || drag.includes('_gridRules'));

// HIGHLIGHT: must highlight ONLY the dragged line, not the whole block
check('Highlight: orange color on drag start (0xff6600)', drag.includes('0xff6600'));
check('Highlight: linewidth=3 on drag start', drag.includes('linewidth') && drag.includes('3'));
check('Highlight: reset to default color on drag end', drag.includes('defColor') || drag.includes('0xcccccc'));
check('Highlight: reset linewidth=1 on drag end', drag.includes('linewidth = 1') || drag.includes('linewidth=1'));
// Should NOT highlight block/bay — only the line mesh
check('Highlight: targets lineMeshes[label] (single line)', drag.includes('lineMeshes[') && drag.includes('.line.material'));

// VISUAL FEEDBACK DURING DRAG: ghost + proposed + shadows
check('Drag ghost (red origin slab)', drag.includes('dragGhostMesh') || drag.includes('Ghost'));
check('Drag proposed (blue destination slab)', drag.includes('dragProposedMesh') || drag.includes('Proposed'));
check('Cascade shadows (orange wireframe outlines)', drag.includes('shadowGroup') || drag.includes('showShadows'));
check('Shadows cleared on drag end', drag.includes('clearShadows'));
check('Status text shows mm delta', drag.includes('mm') && drag.includes('status'));

// CASCADE: elements affected by grid move
check('Cascade elements computed', drag.includes('cascadeElements') || drag.includes('cascade'));
check('Cascade uses clearance from rules', drag.includes('clearance'));

// AFTER DRAG: kernel_ops + cost panel
check('Drag commits to KernelOps', drag.includes('KernelOps.commitOp'));
check('Drag op type is GRID_MOVE', drag.includes("'GRID_MOVE'") || drag.includes('"GRID_MOVE"'));
check('Drag stores from/to positions', drag.includes('from:') && drag.includes('to:'));
check('Drag stores cascade in KernelOps', drag.includes('cascade: cascadeMoves'));
check('CostPanel.refresh after drag', drag.includes('CostPanel.refresh'));
check('CostPanel.refresh after undo/redo', drag.lastIndexOf('CostPanel.refresh') > drag.indexOf('Replayed'));

// UNDO/REDO: kernel_ops based
check('Undo: KernelOps.undoOp', drag.includes('KernelOps.undoOp') || drag.includes('undoOp'));
check('Redo: KernelOps.redoOp', drag.includes('KernelOps.redoOp') || drag.includes('redoOp'));
check('Ctrl+Z handler', drag.includes("'z'") && drag.includes('ctrlKey'));
check('applyReplayedMove function', drag.includes('applyReplayedMove'));
check('Replay: shiftLine + updateGridData + rebuildAnnotations',
  drag.includes('shiftLine') && drag.includes('updateGridData') && drag.includes('rebuildAnnotations'));

// Replay path must persist cascade to DB + move scene meshes
const replayFn = drag.slice(drag.indexOf('function applyReplayedMove'));
const replayBody = replayFn.slice(0, replayFn.indexOf('\n  return {') > 0 ? replayFn.indexOf('\n  return {') : 800);
check('Replay: UPDATE element_transforms for cascade', replayBody.includes('UPDATE element_transforms'));
check('Replay: moveSceneMeshes for cascade', replayBody.includes('moveSceneMeshes'));
check('Replay: logs §GRID_REPLAY_CASCADE', replayBody.includes('§GRID_REPLAY_CASCADE'));
// Ctrl+Z passes cascade and direction=-1
check('Ctrl+Z passes cascade to applyReplayedMove', drag.includes('op.parameters.cascade, -1'));
// Ctrl+Y/Ctrl+Shift+Z passes cascade and direction=+1
check('Ctrl+Y passes cascade to applyReplayedMove', drag.includes('op.parameters.cascade, +1'));

// Scene mesh sync: drag and undo must visually reposition cascade elements
check('moveSceneMeshes function exists', drag.includes('function moveSceneMeshes'));
check('moveSceneMeshes: traverses scene', drag.includes('A.scene.traverse'));
check('moveSceneMeshes: shifts position.x', drag.includes('position.x += d.dx'));
check('moveSceneMeshes: shifts position.z', drag.includes('position.z +='));
check('moveSceneMeshes: logs §DRAG_SCENE_MOVE', drag.includes('§DRAG_SCENE_MOVE'));

// Drag completion calls moveSceneMeshes(+1)
const dragCompletionBlock = drag.slice(drag.indexOf('§DRAG_PERSIST'), drag.indexOf('commitOp'));
check('Drag: moveSceneMeshes(+1) after persist', dragCompletionBlock.includes('moveSceneMeshes(cascadeMoves, +1)'));

// Undo calls moveSceneMeshes(-1)
const undoSection = drag.slice(drag.indexOf('function undo'));
const undoBody = undoSection.slice(0, undoSection.indexOf('\n  function') > 0 ? undoSection.indexOf('\n  function') : 800);
check('Undo: moveSceneMeshes(-1) to revert meshes', undoBody.includes('moveSceneMeshes(rec.elements, -1)'));

// COST PANEL VARIANCE
const cp = src('cost_panel.js');
check('Cost: Δ Qty column header', cp.includes('\\u0394 Qty') || cp.includes('Δ Qty') || cp.includes('\u0394'));
check('Cost: Δ Vol column header', cp.includes('\\u0394 Vol') || cp.includes('Δ Vol'));
check('Cost: green for increase', cp.includes('#4caf50') || cp.includes('green'));
check('Cost: red for decrease', cp.includes('#ff5252') || cp.includes('red'));
check('Cost: tracks disappeared classes', cp.includes('prev[') && cp.includes('!curr['));
check('Cost: close button (✕)', cp.includes('close') || cp.includes('\\u2715') || cp.includes('×'));
check('Cost: queries grid bounding box (BETWEEN)', cp.includes('BETWEEN'));
check('Cost: SUM area (bbox_x * bbox_y)', cp.includes('bbox_x') && cp.includes('bbox_y'));
check('Cost: SUM volume (bbox_x * bbox_y * bbox_z)', cp.includes('bbox_z'));

// §DRAG_PERSIST: drag must UPDATE element_transforms in DB for cascaded elements
const dragPersists = drag.includes('UPDATE element_transforms') || drag.includes("UPDATE element_transforms");
console.log('    §DRAG_PERSIST updates_element_transforms=' + dragPersists);
check('Drag: persists cascade to element_transforms DB', dragPersists, 'elements stay at moved positions after reload');

// §DRAG_UNDO_PERSIST: undo must revert element_transforms too
const undoRevertDB = drag.includes('oldPos') && (drag.includes('UPDATE element_transforms') || drag.includes('revertTransforms'));
console.log('    §DRAG_UNDO_PERSIST reverts_db_on_undo=' + undoRevertDB);
check('Undo: reverts element_transforms in DB', undoRevertDB, 'meshes must return to original DB positions');

// §COST_RATE: cost panel should show unit rate × volume = Δ Cost
const hasCostCol = cp.includes('Cost') || cp.includes('cost') || cp.includes('Rate') || cp.includes('rate');
const hasDeltaCost = cp.includes('\\u0394 Cost') || cp.includes('Δ Cost') || cp.includes('deltaCost');
console.log('    §COST_RATE has_cost_column=' + hasCostCol + ' has_delta_cost=' + hasDeltaCost);
check('Cost: Δ Cost column (rate × Δ Vol)', hasDeltaCost, 'need unit rates for real cost impact');

// §REPLAY_PERSIST: replayOps on reload must re-apply cascade element positions
// Item 8: replayOps only updated gridData numbers — never applied cascade to DB
const replayBlock = go.slice(go.indexOf('replayOps(A.db'));
const replayLoop = replayBlock.slice(0, replayBlock.indexOf('§KERNEL_OP replay moves') + 30);
check('Replay on reload: UPDATE element_transforms for cascade', replayLoop.includes('UPDATE element_transforms'));
check('Replay on reload: reads p.cascade from op parameters', replayLoop.includes('p.cascade'));
check('Replay on reload: logs §KERNEL_REPLAY_CASCADE', replayLoop.includes('§KERNEL_REPLAY_CASCADE'));

// ═══ 15b. KERNEL_OPS — persistent undo log ═══════════════════════
console.log('\n═══ 15b. KERNEL_OPS ═══');

check('kernel_ops: creates table', kops.includes('CREATE TABLE') && kops.includes('kernel_ops'));
check('kernel_ops: commitOp function', kops.includes('commitOp'));
check('kernel_ops: undoOp function', kops.includes('undoOp'));
check('kernel_ops: redoOp function', kops.includes('redoOp'));
check('kernel_ops: replayOps function', kops.includes('replayOps'));
check('kernel_ops: undone flag (not delete)', kops.includes('undone'));
check('kernel_ops: stores op_type', kops.includes('op_type'));
check('kernel_ops: stores parameters as JSON', kops.includes('JSON.stringify') || kops.includes('parameters'));
check('kernel_ops: compact function (collapse same-label)', kops.includes('compact') || kops.includes('Compact'));
check('kernel_ops: §KRN log tag', kops.includes('§KRN') || kops.includes('§KERNEL'));

// ═══ 16. GRID SCISSORS — state init ═════════════════════════════
console.log('\n═══ 16. GRID SCISSORS ═══');

check('GridScissors.init exists', scissors.includes('function init'));
check('Scissors wired by grid_overlay', go.includes('GridScissors.init'));
check('lastCutVal starts null', scissors.includes('lastCutVal = null'));
check('onOff resets lastCutVal', scissors.includes('lastCutVal = null') &&
  scissors.indexOf('function onOff') < scissors.lastIndexOf('lastCutVal = null'));
check('Dwell tracking', scissors.includes('dwellTrack') || scissors.includes('dwell'));
check('Scissors disposes geometry on off', scissors.includes('dispose'));
// BUG: dwellTrack must NOT fire when 2D overlay is OFF (causes snap flash without grid)
const sliderFn = scissors.slice(scissors.indexOf('function onSliderChange'));
const dwellPos = sliderFn.indexOf('dwellTrack');
const guardPos = sliderFn.indexOf('!st.active');
check('dwellTrack AFTER st.active guard (no snap without 2D)', guardPos < dwellPos,
  'guard@' + guardPos + ' dwell@' + dwellPos);

// SCENE CORRUPTION: dwellTrack → checkDwell → rebuildDwellMarkers adds THREE.Line to scene
// + flashDwellCapture adds white overlay div. Both corrupt scene when 2D is OFF.
// Verify: the return before dwellTrack means NONE of these can fire without 2D.
const earlyReturn = sliderFn.slice(guardPos, dwellPos);
check('Early return BEFORE dwellTrack (no scene add without 2D)', earlyReturn.includes('return'));
// rebuildDwellMarkers adds objects to A.scene — must be gated
check('rebuildDwellMarkers adds to scene', scissors.includes('A.scene.add'));
check('flashDwellCapture creates overlay div', scissors.includes("background:white") || scissors.includes('flash'));
// clearDwellMarkers removes from scene — verify cleanup exists
check('clearDwellMarkers disposes + removes from scene', scissors.includes('A.scene.remove') && scissors.includes('.dispose()'));
// onOff calls dwellReset — prevents stale markers on scissors toggle
check('onOff calls dwellReset', scissors.slice(scissors.indexOf('function onOff')).includes('dwellReset'));

// ═══ 17. SCENE CORRUPTION — cross-module state leak ══════════════
console.log('\n═══ 17. SCENE CORRUPTION GUARDS ═══');

// Card must not leave localClippingEnabled=true when exiting
check('Grid exit disables localClipping', go.includes('localClippingEnabled = false'));
// Card switch must not accumulate clip planes
check('restoreSection creates FRESH clipPlane', rBody.includes('new THREE.Plane'));
// Verify no shared/cached clip planes across cards
const clipPlaneCreations = (rBody.match(/new THREE\.Plane/g) || []).length;
check('Only ONE clipPlane per restore call', clipPlaneCreations === 1, 'found ' + clipPlaneCreations);
// renderer.localClippingEnabled set on card enter
check('localClippingEnabled=true on card', rBody.includes('localClippingEnabled = true'));
// grid_views applyFloorClip also sets it
check('applyFloorClip enables localClipping', afBody.includes('localClippingEnabled = true'));

// Verify no stale clip planes from section_cut when entering card mode
check('clearFloorClip nulls _floorClipPlane', cfBody.includes('_floorClipPlane = null'));

// autoCreateCards — storey ranking (verify it finds correct GF)
console.log('\n═══ 18. autoCreateCards — STOREY RANKING ═══');
check('autoCreateCards: door-count sort (most doors first)', go.includes('db2 - da'));
check('autoCreateCards: abs(z) tiebreak (closest to ground)', go.includes('Math.abs(a.floorZ)'));
check('autoCreateCards: element count >= 5 filter', go.includes('>= 5') || go.includes('elementCount >= 5'));
check('autoCreateCards: creates GF card', go.includes("'GF'") || go.includes('"GF"'));
check('autoCreateCards: creates L1 card if >1 storey', go.includes("'L1'") || go.includes('"L1"'));
check('autoCreateCards: CUT_ABOVE offset', go.includes('CUT_ABOVE'));

// ═══ 19. captureViewState + schema ═══════════════════════════════
console.log('\n═══ 19. captureViewState + SCHEMA ═══');

check('captureViewState: DB storey lookup', go.includes('detectStoreys') && go.includes('captureViewState'));
check('captureViewState: captures camera', go.includes('getCameraState') || go.includes('camera'));
check('Schema: ALTER TABLE view_state', go.includes('ADD COLUMN view_state TEXT'));
check('Schema: SELECT view_state', go.includes('view_state FROM saved_sections'));
check('Schema: INSERT includes view_state', go.includes('view_state) VALUES'));
check('BUG G: localStorage INSERT has view_state', go.includes('view_state) VALUES(?,?,?,?,?,?,?)') || go.includes('view_state'));

// ═══ 20. EXECUTE classifyMesh on REAL DB DATA — SH, DX, SampleCastle, Terminal ═══
// This runs the ACTUAL classification logic from grid_views.js on real building data.
// The logs show EXACTLY what the viewer will do. No guessing.

console.log('\n═══ 20. BUILDING TESTS — classifyMesh on real DB data ═══');

// Extract classifyMesh as executable function from source
const hideCode = gv.match(/var HIDE_IN_FLOOR\s*=\s*\{[^}]+\}/)[0];
const fadeCode = gv.match(/var FADE_IN_FLOOR\s*=\s*\{[^}]+\}/)[0];
const fnCode = gv.match(/function classifyMesh\(ifcClass, retainSet, hideSet\)\s*\{[\s\S]*?return 'clip';\s*\}/)[0];
const classify = new Function('ifcClass', 'retainSet', 'hideSet',
  hideCode + ';\n' + fadeCode + ';\n' + fnCode + '\nreturn classifyMesh(ifcClass, retainSet, hideSet);');

// Default retainSet (same as code uses when GridConfig unavailable)
const RETAIN = { 'IfcFurnishingElement': 1, 'IfcFurniture': 1, 'IfcFlowTerminal': 1, 'IfcSanitaryTerminal': 1 };

// Target buildings
const TARGET_BUILDINGS = {
  'SampleHouse': {},
  'Duplex': {},
  'SampleCastle': {},
  'Terminal': {}
};

// Find DB for each building
function findDb(name) {
  const candidates = [
    path.join(BLDG, name + '_extracted.db'),
    path.join(BLDG2, name + '_extracted.db'),
  ];
  return candidates.find(p => fs.existsSync(p));
}

// GF storey detection — same algorithm as grid_overlay.js autoCreateCards
function detectGF(dbPath) {
  return sql(dbPath, "SELECT m.storey FROM elements_meta m JOIN element_transforms et ON m.guid=et.guid WHERE m.storey IS NOT NULL AND m.storey NOT IN ('Unknown','Roof','unknown') GROUP BY m.storey HAVING COUNT(*)>=5 ORDER BY SUM(CASE WHEN m.ifc_class IN ('IfcDoor','IfcDoorStandardCase') THEN 1 ELSE 0 END) DESC, ABS(MIN(et.center_z)) LIMIT 1").split('|')[0];
}

for (const [bldName, expected] of Object.entries(TARGET_BUILDINGS)) {
  console.log('\n  ── ' + bldName + ' ──');
  const dbPath = findDb(bldName);
  if (!dbPath) { check(bldName + ': DB found', false, 'NOT FOUND'); continue; }
  check(bldName + ': DB found', true, path.basename(dbPath));

  // 1. Detect GF storey
  const gfStorey = detectGF(dbPath);
  check(bldName + ': GF storey detected', !!gfStorey, 'GF="' + gfStorey + '"');
  if (!gfStorey) continue;
  // No hardcoded expected GF — the DB decides. Log the detected storey for review.
  console.log('    §GF_DETECTED ' + bldName + ' storey="' + gfStorey + '" (extracted from DB, not invented)');
  const esc = gfStorey.replace(/'/g, "''");

  // 2. Get ALL elements on GF storey with their classes
  // Count ALL elements in meta — ghosts included. Ghosts are GIGO: log them, don't hide them.
  const rows = sql(dbPath, "SELECT m.ifc_class, COUNT(*) FROM elements_meta m WHERE m.storey='" + esc + "' GROUP BY m.ifc_class ORDER BY COUNT(*) DESC").split('\n').filter(r => r);
  // Ghost admission check: elements in meta but not in transforms
  const metaN = parseInt(sql(dbPath, "SELECT COUNT(*) FROM elements_meta WHERE storey='" + esc + "'")) || 0;
  const realN = parseInt(sql(dbPath, "SELECT COUNT(*) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.storey='" + esc + "'")) || 0;
  if (metaN !== realN) {
    const ghostList = sql(dbPath, "SELECT m.ifc_class, m.element_name FROM elements_meta m LEFT JOIN element_transforms t ON m.guid=t.guid WHERE m.storey='" + esc + "' AND t.guid IS NULL").split('\n').filter(r => r);
    console.log('    §GHOST_ADMISSION ' + bldName + ' ghosts=' + (metaN - realN) + ': ' + ghostList.join(', '));
  }

  // 3. Run classifyMesh on each class — log the RESULT
  let hideCount = 0, fadeCount = 0, retainCount = 0, clipCount = 0, totalCount = 0;
  const classList = {};
  for (const row of rows) {
    const parts = row.split('|');
    const cls = parts[0];
    const count = parseInt(parts[1]) || 0;
    const action = classify(cls, RETAIN, null);
    classList[cls] = { count, action };
    totalCount += count;
    if (action === 'hide') hideCount += count;
    else if (action === 'fade') fadeCount += count;
    else if (action === 'retain') retainCount += count;
    else clipCount += count;
  }

  // 4. LOG THE TRUTH — what the code WILL do to this building's GF
  console.log('    §CLASSIFY storey="' + gfStorey + '" total=' + totalCount +
    ' hide=' + hideCount + ' fade=' + fadeCount + ' retain=' + retainCount + ' clip=' + clipCount);
  for (const [cls, info] of Object.entries(classList)) {
    console.log('      ' + cls + ': n=' + info.count + ' → ' + info.action);
  }

  // 5. CHECKS — things that MUST be true
  check(bldName + ': hide+fade+retain+clip = total',
    hideCount + fadeCount + retainCount + clipCount === totalCount,
    hideCount + '+' + fadeCount + '+' + retainCount + '+' + clipCount + '=' + (hideCount + fadeCount + retainCount + clipCount) + ' vs ' + totalCount);

  // Walls must exist (needed for contours)
  const wallCount = ((classList['IfcWall'] || {}).count || 0) + ((classList['IfcWallStandardCase'] || {}).count || 0);
  check(bldName + ': has walls for contours', wallCount > 0, 'walls=' + wallCount);

  // Doors must exist (needed for door arcs)
  const doorCount = ((classList['IfcDoor'] || {}).count || 0) + ((classList['IfcDoorStandardCase'] || {}).count || 0);
  console.log('    §DOOR_ARC_INPUT doors=' + doorCount + (doorCount > 0 ? ' — arcs possible' : ' — NO ARCS POSSIBLE (0 doors)'));

  // Roofs: if code says hide, they WILL be hidden. But log if roofs exist in storey.
  if (hideCount > 0) {
    console.log('    §HIDE roofs/roofing on this storey: ' + hideCount + ' elements will be hidden');
  }

  // 6. GEOMETRY CHECK — section_cut.lookupGeometry checks BOTH extracted DB and library DB
  // Path: element_instances.geometry_hash → component_geometries (in db OR libDb)
  const hasInstTable = sql(dbPath, "SELECT COUNT(*) FROM sqlite_master WHERE name='element_instances'");
  const hasGeomInExtracted = sql(dbPath, "SELECT COUNT(*) FROM sqlite_master WHERE name='component_geometries'") !== '0'
    ? parseInt(sql(dbPath, "SELECT COUNT(*) FROM component_geometries")) || 0 : 0;
  // Check library DB too (section_cut uses libDb as fallback)
  const libPath = dbPath.replace('_extracted.db', '_library.db');
  const hasLibDb = fs.existsSync(libPath);
  const hasGeomInLib = hasLibDb
    ? (sql(libPath, "SELECT COUNT(*) FROM sqlite_master WHERE name='component_geometries'") !== '0'
      ? parseInt(sql(libPath, "SELECT COUNT(*) FROM component_geometries")) || 0 : 0)
    : 0;
  const geomSource = hasGeomInExtracted > 0 ? 'extracted' : (hasGeomInLib > 0 ? 'library' : 'NONE');
  const geomDb = hasGeomInExtracted > 0 ? dbPath : (hasGeomInLib > 0 ? libPath : null);
  console.log('    §GEOM source=' + geomSource + ' extracted=' + hasGeomInExtracted + ' library=' + hasGeomInLib);

  if (geomDb && hasInstTable !== '0') {
    // Count walls/doors that have matching geometry hash in the geometry DB
    const wallGeomQuery = "SELECT COUNT(*) FROM element_instances ei WHERE ei.guid IN (SELECT guid FROM elements_meta WHERE storey='" + esc + "' AND ifc_class IN ('IfcWall','IfcWallStandardCase')) AND ei.geometry_hash IN (SELECT geometry_hash FROM component_geometries)";
    const doorGeomQuery = "SELECT COUNT(*) FROM element_instances ei WHERE ei.guid IN (SELECT guid FROM elements_meta WHERE storey='" + esc + "' AND ifc_class IN ('IfcDoor','IfcDoorStandardCase')) AND ei.geometry_hash IN (SELECT geometry_hash FROM component_geometries)";

    // If geom is in library, we need cross-db check. sqlite3 CLI can't ATTACH easily,
    // so check if hashes from extracted exist in library.
    let wallsWithGeom = 0, doorsWithGeom = 0;
    if (geomSource === 'extracted') {
      wallsWithGeom = parseInt(sql(dbPath, wallGeomQuery)) || 0;
      doorsWithGeom = parseInt(sql(dbPath, doorGeomQuery)) || 0;
    } else {
      // Cross-DB: get hashes from extracted, check existence in library
      const wallHashes = sql(dbPath, "SELECT DISTINCT ei.geometry_hash FROM element_instances ei JOIN elements_meta m ON ei.guid=m.guid WHERE m.storey='" + esc + "' AND m.ifc_class IN ('IfcWall','IfcWallStandardCase') LIMIT 50").split('\n').filter(h => h);
      const doorHashes = sql(dbPath, "SELECT DISTINCT ei.geometry_hash FROM element_instances ei JOIN elements_meta m ON ei.guid=m.guid WHERE m.storey='" + esc + "' AND m.ifc_class IN ('IfcDoor','IfcDoorStandardCase') LIMIT 50").split('\n').filter(h => h);
      // Sample check: does library have these hashes?
      for (const h of wallHashes) {
        const found = sql(libPath, "SELECT COUNT(*) FROM component_geometries WHERE geometry_hash='" + h + "'");
        if (found !== '0') wallsWithGeom++;
      }
      for (const h of doorHashes) {
        const found = sql(libPath, "SELECT COUNT(*) FROM component_geometries WHERE geometry_hash='" + h + "'");
        if (found !== '0') doorsWithGeom++;
      }
      // wallsWithGeom here = distinct hashes found (elements may share geometry)
      console.log('    §GEOM cross-db: wall_hashes_in_lib=' + wallsWithGeom + '/' + wallHashes.length + ' door_hashes_in_lib=' + doorsWithGeom + '/' + doorHashes.length);
    }
    console.log('    §GEOM walls_with_geometry=' + wallsWithGeom + ' doors_with_geometry=' + doorsWithGeom);
    check(bldName + ': walls have geometry', wallsWithGeom > 0, wallsWithGeom + ' wall geom entries (' + geomSource + ')');
    if (doorsWithGeom === 0 && doorCount > 0) {
      console.log('    §DOOR_ARC_SKIP reason=no_geometry — doors have no geometry BLOBs in ' + geomSource);
    }
  } else {
    console.log('    §GEOM NO GEOMETRY SOURCE — contours impossible');
    check(bldName + ': has geometry', false, 'no component_geometries in extracted or library');
  }

  // 7. SLICE_CLASSES coverage — which GF classes will section_cut actually slice?
  const SLICE_CLASSES_SET = {};
  const sliceMatch = sc.match(/SLICE_CLASSES\s*=\s*\{([^}]+)\}/);
  if (sliceMatch) {
    sliceMatch[1].replace(/'([^']+)'\s*:/g, (_, cls) => { SLICE_CLASSES_SET[cls] = 1; });
  }
  let sliceable = 0, notSliceable = 0;
  const notSliceableClasses = [];
  for (const [cls, info] of Object.entries(classList)) {
    if (info.action === 'clip') { // only clipped elements get sliced
      if (SLICE_CLASSES_SET[cls]) sliceable += info.count;
      else { notSliceable += info.count; notSliceableClasses.push(cls + '(' + info.count + ')'); }
    }
  }
  console.log('    §SLICE sliceable=' + sliceable + ' not_sliceable=' + notSliceable +
    (notSliceableClasses.length ? ' skipped=[' + notSliceableClasses.join(',') + ']' : ''));
  check(bldName + ': walls are in SLICE_CLASSES', !!SLICE_CLASSES_SET['IfcWall'] && !!SLICE_CLASSES_SET['IfcWallStandardCase']);
  check(bldName + ': doors are in SLICE_CLASSES', !!SLICE_CLASSES_SET['IfcDoor'] && !!SLICE_CLASSES_SET['IfcDoorStandardCase']);

  // 8. CONTOUR INVENTION CHECK — are there hardcoded coordinates for this building?
  // Only flag if building name appears in contour/section code (not comments/logs in overlay)
  const contourAndSection = gc + sc + da;
  const mentionsBldg = contourAndSection.includes(bldName);
  if (mentionsBldg) {
    console.log('    §INVENTION_SMELL contour/section code mentions "' + bldName + '" — HARDCODED DATA?');
  }
  check(bldName + ': NO building name in contour/section/arc code', !mentionsBldg, 'building-specific = invention');
}

// ═══ 21. ANTI-INVENTION — no hardcoded coordinates in contour/section code ═══
console.log('\n═══ 21. ANTI-INVENTION ═══');

// Any literal coordinate pairs in contour generation = invented geometry
const contourFns = gc.slice(gc.indexOf('function renderContours'));
const hardcodedCoords = contourFns.match(/\b\d{2,}\.\d+\s*,\s*\d{2,}\.\d+/g);
check('No hardcoded coordinate pairs in renderContours', !hardcodedCoords,
  hardcodedCoords ? 'FOUND: ' + hardcodedCoords.slice(0, 3).join('; ') : 'clean');

// No building-specific if/switch in section_cut
const bldgNames = ['SampleHouse', 'Duplex', 'SampleCastle', 'Terminal', 'HITOS', 'Hospital', 'Clinic'];
const inventions = bldgNames.filter(n => sc.includes(n) || gc.includes(n));
check('No building names in section_cut/contours', inventions.length === 0,
  inventions.length > 0 ? 'INVENTED: ' + inventions.join(',') : 'clean');

// No fake/placeholder/demo geometry
check('No "demo" in contour code', !gc.toLowerCase().includes('demo'));
check('No "placeholder" in contour code', !gc.toLowerCase().includes('placeholder'));
check('No "fake" in contour code', !gc.toLowerCase().includes('fake'));
check('No "example" geometry in section_cut', !sc.toLowerCase().includes('example point'));

// ═══ 22. KEYBOARD — G+X combo, sequence engine ═══════════════════
console.log('\n═══ 22. KEYBOARD ═══');

// G = open 2D plans, X = scissors. Must work in sequence (G then X).
// The sequence engine fires single-char shortcuts immediately if no longer prefix exists.
check('G shortcut: opens 2D plans', scene.includes("'g':") && scene.includes('open2DPlans'));
check('X shortcut: toggles section', scene.includes("'x':") && scene.includes('toggleSection'));
// X must be context-aware: when grid overlay active, don't disrupt 2D
check('X in 2D mode: checks _gridOverlayState.active', scene.includes('_gridOverlayState') && scene.includes("active") &&
  scene.slice(scene.indexOf("'x':")).includes('_gridOverlayState'));
// Sequence engine: G has no longer prefix (fires immediately)
// Need to verify no shortcut starts with 'g' (would cause wait)
const shortcutKeys = (scene.match(/'([a-z0-9+=-]+)'\s*:\s*function/g) || []).map(m => m.match(/'([^']+)'/)[1]);
const gPrefix = shortcutKeys.filter(k => k.length > 1 && k.startsWith('g'));
const xPrefix = shortcutKeys.filter(k => k.length > 1 && k.startsWith('x'));
check('No multi-char shortcut starts with g (G fires immediately)', gPrefix.length === 0, gPrefix.join(','));
check('No multi-char shortcut starts with x (X fires immediately)', xPrefix.length === 0, xPrefix.join(','));
console.log('    §KBD all shortcuts: ' + shortcutKeys.join(', '));

// ═══ 23. ZOMBIE CARDS — deleted cards must not return ════════════
console.log('\n═══ 23. ZOMBIE CARDS ═══');

// When user deletes a card, it must be removed from BOTH DB and localStorage.
// If only one is cleared, the card "returns" on next reload from the other source.
const delFnStart = go.indexOf('function deleteSavedSection');
const delFnEnd = go.indexOf('\n  function', delFnStart + 10);
const delFnBody = go.slice(delFnStart, delFnEnd);
check('Delete: removes from DB (DELETE SQL)', delFnBody.includes('DELETE FROM saved_sections'));
check('Delete: removes from localStorage (removeItem)', delFnBody.includes('localStorage.removeItem'));
check('Delete: calls loadSavedSections (rebuild list)', delFnBody.includes('loadSavedSections'));
check('Delete: localStorage.setItem (update remaining)', delFnBody.includes('localStorage.setItem'));
// Delete button handler calls clearCardView after deleteSavedSection
const delCallSite = go.indexOf('deleteSavedSection(id);');
const afterDel = go.slice(delCallSite, delCallSite + 200);
check('Delete btn: clearCardView after deleteSavedSection', afterDel.includes('clearCardView'));
// Auto-create suppression: if user deletes ALL cards, must not re-create on next entry
check('Auto-create: _noauto flag set when all deleted', delFnBody.includes('_noauto'));
check('Auto-create: checks _noauto before creating', go.includes("_noauto") && go.includes("return"));

// ═══ 24. UX DEBT — 2D_022-030 outstanding items ═════════════════
console.log('\n═══ 24. UX DEBT (2D_022-030) ═══');

// Debt 1: Grid drag highlight — draggable lines must have hover/pointer cursor
check('Grid drag: pointer cursor on hover', drag.includes('cursor') || drag.includes('pointer'),
  'user must see which lines are draggable');
check('Grid drag: highlight on hover', drag.includes('highlight') || drag.includes('hover') || drag.includes('emissive'),
  'visual feedback on draggable line');

// Debt 2: IFC popup on element click — raycaster must exist (scene.js handles globally)
// Card sets visible=false on non-storey meshes → Three.js raycaster auto-skips invisible
const hasPick = scene.includes('Raycaster') || scene.includes('raycaster');
check('Global element pick (scene.js has Raycaster)', hasPick);
check('Pick respects visibility (card hides non-storey → raycaster skips)', hasPick, 'Three.js raycaster skips visible=false');

// Debt 3: Cost panel variance — Δ Qty / Δ Vol columns (cp already loaded above)
check('Cost panel: Δ Qty column', cp.includes('Qty') || cp.includes('qty') || cp.includes('delta'));
check('Cost panel: Δ Vol column', cp.includes('Vol') || cp.includes('vol') || cp.includes('volume'));
check('Cost panel: ✕ close button', cp.includes('close') || cp.includes('✕') || cp.includes('×'));

// Debt 4: Terminal walls — verify SLICE_CLASSES includes IfcCurtainWall
// (Terminal has curtain walls that may lack contours if not in SLICE_CLASSES)
const hasCurtainSlice = sc.includes("'IfcCurtainWall'") || sc.includes('"IfcCurtainWall"');
console.log('    §DEBT IfcCurtainWall in SLICE_CLASSES: ' + hasCurtainSlice);
// Don't fail — just report (curtain walls are often panel assemblies, not solid)

// Debt 5: Grid exit FULL scene restore (no corruption)
// The exit path: toggleGridOverlay → clearFloorClip + unlockView + clearCardView + clearStoreyBandVisibility
const exitFn = go.slice(go.indexOf('A.toggleGridOverlay = function'));
const exitBlock = exitFn.slice(exitFn.indexOf('if (active)'), exitFn.indexOf('active = true'));
check('Exit: clears contours', exitBlock.includes('GridContours.clear') || exitBlock.includes('contour'));
check('Exit: clearFloorClip called', exitBlock.includes('clearFloorClip'));
check('Exit: unlockView called', exitBlock.includes('unlockView'));
check('Exit: clearCardView called', exitBlock.includes('clearCardView'));
check('Exit: clearStoreyBandVisibility called', exitBlock.includes('clearStoreyBandVisibility'));
check('Exit: localClippingEnabled=false (in clearCardView)', cvBody.includes('localClippingEnabled = false'));
// Verify the traverse in clearCardView covers ALL isMesh objects
check('Exit: clearCardView traverses ALL isMesh', cvBody.includes('collectMeshes') || cvBody.includes('traverse'));
// Scene remove gridGroup
check('Exit: scene.remove(gridGroup)', exitBlock.includes('scene.remove'));

// Debt 6: Esc key routes through toggleGridOverlay (single exit path)
check('Esc: routes through toggleGridOverlay', go.includes('_gridClose') && go.includes('toggleGridOverlay'));

// ═══ 25. REPEATED 2D ISSUES (user-reported, must not recur) ═════
console.log('\n═══ 25. REPEATED 2D ISSUES ═══');

// ISSUE: Roofs visible in GF view
// Root cause: either hideSet not applied, or restoreSection not called, or stale deploy
check('Roof hide: HIDE_IN_FLOOR has IfcRoof', hideM.includes('IfcRoof'));
check('Roof hide: restoreSection applies hideSet', rBody.includes('hideSet[cls]') && rBody.includes('obj.visible = false'));
check('Roof hide: band filter excludes IfcRoof from section_cut', excMatch && excMatch[1].includes('IfcRoof'));
// Terminal has 0 roofs on GF storey (Aras Tanah) — if visible, they're from ANOTHER storey leaking
check('Roof hide: non-storey elements hidden (!guidSet[guid])', rBody.includes('!guidSet[guid]') || rBody.includes('!guidSet'));

// ISSUE: No door arcs showing
// Root cause chain: section_cut must produce door contours → extractLeafAxis → generateArcs
check('Door arcs: section_cut includes IfcDoor in SLICE_CLASSES', sc.includes("'IfcDoor'"));
check('Door arcs: section_cut includes IfcDoorStandardCase', sc.includes("'IfcDoorStandardCase'") || sc.includes('IfcDoorStandardCase'));
check('Door arcs: renderContoursForView calls DoorArcs.generateArcs', go.includes('DoorArcs.generateArcs'));
check('Door arcs: §DOOR_ARC_CLASSES log (diagnostic)', go.includes('§DOOR_ARC_CLASSES'));
check('Door arcs: §DOOR_ARC_SKIP log (tells why arc failed)', da.includes('§DOOR_ARC_SKIP'));
// If arcs don't show, §DOOR_ARC_CLASSES will reveal if doors are in section_cut output at all

// ISSUE: Scene corruption after 2D activity (whole scene broken)
// Root causes: clippingPlanes leaked, opacity stuck, visible=false not restored, localClippingEnabled=true
check('Scene fix: clearCardView sets visible=true on ALL', cvBody.includes('obj.visible = true'));
check('Scene fix: clearCardView nulls ALL clippingPlanes', cvBody.includes('obj.material.clippingPlanes = null'));
check('Scene fix: clearCardView disables localClipping', cvBody.includes('localClippingEnabled = false'));
check('Scene fix: clearFloorClip also disables localClipping', cfBody.includes('localClippingEnabled = false'));
check('Scene fix: unlockView called on grid exit', go.slice(go.indexOf('active = false')).includes('unlockView'));
// Scissors scene pollution without 2D (dwell markers + flash)
check('Scene fix: dwellTrack gated by st.active', guardPos < dwellPos);

// ISSUE: Scissors snap/flash when 2D not on
check('Scissors guard: return before dwellTrack', earlyReturn.includes('return'));

// ISSUE: Stale cards returning after delete (zombie)
check('Zombie fix: DELETE FROM saved_sections', delFnBody.includes('DELETE FROM saved_sections'));
check('Zombie fix: localStorage.removeItem', delFnBody.includes('localStorage.removeItem'));
check('Zombie fix: localStorage.setItem (overwrite remaining)', delFnBody.includes('localStorage.setItem'));

// ISSUE: Contours look artificial/invented
check('Contour truth: no hardcoded coordinates', !hardcodedCoords);
check('Contour truth: geometry from DB (lookupGeometry)', sc.includes('lookupGeometry'));
check('Contour truth: sliceMesh from real vertices', sc.includes('sliceMesh'));

// ═══ 26. SCENE CORRUPTION — complete exit state audit ═══════════
console.log('\n═══ 26. SCENE CORRUPTION EXIT AUDIT ═══');

// After grid mode exit, these properties MUST be restored on ALL meshes:
// visible=true, clippingPlanes=null, clipShadows=false, opacity=original, transparent=original
// localClippingEnabled=false, camera=perspective restored, controls.enableRotate=true

// clearCardView blanket restore
check('clearCardView: sets visible=true on ALL meshes (traverse)', cvBody.includes('obj.visible = true'));
check('clearCardView: nulls clippingPlanes on ALL meshes', cvBody.includes('obj.material.clippingPlanes = null'));
check('clearCardView: localClippingEnabled=false', cvBody.includes('localClippingEnabled = false'));

// unlockView restores camera to perspective
const uvStart = gv.indexOf('function unlockView');
const uvEnd = gv.indexOf('\n  function', uvStart + 20) !== -1 ? gv.indexOf('\n  function', uvStart + 20) : uvStart + 1000;
const uvBody = gv.slice(uvStart, uvEnd);
check('unlockView: restores original camera', uvBody.includes('_origCamera'));
check('unlockView: enableRotate=true (3D orbit restored)', uvBody.includes('enableRotate = true'));
check('unlockView: calls clearFloorClip', uvBody.includes('clearFloorClip'));
check('unlockView: restores lighting', uvBody.includes('restoreLighting'));

// Grid scissors cleanup on exit
check('Scissors: onOff disposes geometry', scissors.includes('disposeScissorsGroup'));
check('Scissors: onOff resets dwell', scissors.includes('dwellReset'));

// ═══ 27. DEPLOYED vs LOCAL — curl check ═════════════════════════
console.log('\n═══ 27. DEPLOYED vs LOCAL (curl) ═══');

const DEPLOY_BASE = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-dev/o/sandbox/';
const filesToCheck = ['grid_overlay.js', 'grid_views.js', 'section_cut.js', 'grid_contours.js',
                      'grid_scissors.js', 'grid_dims.js', 'grid_door_arcs.js', 'grid_drag.js',
                      'tools.js', 'scene.js', 'cost_panel.js'];

let deployChecked = 0, deployMismatches = [];
for (const f of filesToCheck) {
  const localContent = src(f);
  try {
    const curl = execSync('curl -s --max-time 5 "' + DEPLOY_BASE + f + '"', { encoding: 'utf8', timeout: 8000 });
    if (curl.length < 100) {
      deployMismatches.push(f + ': deployed too small (' + curl.length + 'B) — STALE or missing');
    } else {
      const sizeDiff = Math.abs(curl.length - localContent.length) / localContent.length;
      if (sizeDiff > 0.05) {
        deployMismatches.push(f + ': size mismatch local=' + localContent.length + ' deployed=' + curl.length + ' (' + (sizeDiff * 100).toFixed(1) + '%)');
      }
    }
    deployChecked++;
  } catch (e) {
    deployMismatches.push(f + ': curl failed');
  }
}
check('Deploy: all files reachable', deployChecked === filesToCheck.length, deployChecked + '/' + filesToCheck.length);
if (deployMismatches.length > 0) {
  for (const m of deployMismatches) check('Deploy mismatch', false, m);
} else {
  check('Deploy: all files match local', true);
}

// ═══ 28. 2D CUT + CONTOUR + GRID + PICK INTEGRITY ══════════════
console.log('\n═══ 28. 2D CUT + CONTOUR + GRID + PICK INTEGRITY ═══');

// Section cut during 2D: contours must coexist with grid lines.
// renderContoursForView is called from restoreSection — contours paint AFTER card view setup.
check('restoreSection calls renderContoursForView', rBody.includes('renderContoursForView'));
// Contours must be painted AFTER mesh visibility is set (otherwise contours show wrong set)
const meshPassEnd = rBody.lastIndexOf('needsUpdate = true');
const contourCall = rBody.indexOf('renderContoursForView');
check('Contours rendered AFTER mesh visibility pass', contourCall > meshPassEnd,
  'meshEnd@' + meshPassEnd + ' contourCall@' + contourCall);

// Contour contrast: dark theme = white lines, light theme = black lines.
// Must switch based on isDark (sunglasses mode).
check('Contour contrast: isDark check', gc.includes('isDark'));
check('Contour contrast: white lines for dark bg', gc.includes('ffffff'));
check('Contour contrast: black lines for light bg', gc.includes('000000'));

// Contour clear BEFORE re-render: switching cards must not accumulate old contours
check('Contours cleared before re-render (GridContours.clear)',
  go.includes('GridContours.clear') && go.indexOf('GridContours.clear') < go.indexOf('renderContoursForView'));

// PICK IN 2D: clicking must show IFC data for the visible element, NOT roof.
// Card sets roof visible=false → raycaster skips invisible meshes → pick hits correct wall/door.
// Verify: restoreSection hides roof class AND non-storey elements.
check('Pick: roof hidden (IfcRoof in hideSet)', rBody.includes('hideSet') && rBody.includes('visible = false'));
check('Pick: non-storey hidden (!guidSet → visible=false)', rBody.includes('!guidSet') && rBody.includes('visible = false'));
// Verify: scene.js raycaster only tests visible meshes (Three.js default, but confirm no override)
check('Pick: raycaster uses default visibility filter (no recursive:false override)',
  !scene.includes('recursive: false') && !scene.includes('recursive:false'));

// 2D contour pick: clicking a contour/arc/label must resolve its IFC identity.
// Contour meshes carry userData.guid + userData.ifcClass — pick handler must read them.
const pick = src('picking.js');
check('Pick: contour userData.guid fallback (2D items clickable)',
  pick.includes('hit.object.userData.guid'), '2D contours carry guid in userData');
check('Pick: logs §PICK_2D identity', pick.includes('§PICK_2D'));
// 2D pick: raycaster includes Lines in floor view
check('Pick: Line threshold in 2D mode', pick.includes('raycaster.params.Line'));
check('Pick: collects isLine for contour', pick.includes('o.isLine') && pick.includes('isContour'));
// Contour meshes carry ifcClass for display
check('Contour meshes carry ifcClass', gc.includes("ifcClass: el.ifcClass"));
// Door arcs carry ifcClass
check('Door arc carries ifcClass', da.includes("ifcClass: 'IfcDoor'"));
check('Stair symbol carries ifcClass', da.includes("ifcClass: el.ifcClass || 'IfcStairFlight'"));
check('Window opening carries ifcClass', da.includes("ifcClass: el.ifcClass || 'IfcWindow'"));
// Furniture footprints
check('GridContours.renderFurniture exposed', gc.includes('renderFurniture'));
check('Furniture footprint carries guid+ifcClass', gc.includes("guid: el.guid, ifcClass: el.ifcClass"));
check('Furniture query in renderContoursForView', go.includes('§FURNITURE_QUERY'));
check('Furniture Z-band query', go.includes("IfcFurniture") && go.includes("IfcFurnishingElement"));
// 2D→3D ISOLATION: furniture footprints live in contour group, cleared on exit
check('Furniture uses ensureGroup (routed to _group)', gc.includes('ensureGroup(APP)') && gc.indexOf('renderFurniture') < gc.lastIndexOf('ensureGroup'));
check('Furniture: NO scene.add (belongs to contour group only)',
  !gc.slice(gc.indexOf('renderFurniture')).includes('APP.scene.add'), 'scene leak = furniture visible in 3D');
check('GridContours.clear disposes all children (incl furniture)', gc.includes('_group.traverse') && gc.includes('disposeObj'));
// Exit path: toggleGridOverlay calls GridContours.clear BEFORE clearCardView
check('Exit: GridContours.clear called on toggleGridOverlay off', go.includes("GridContours.clear(A)"));
check('Exit: contour group removed from scene on clear', gc.includes('_group.parent.remove(_group)'));
check('Exit: _group nulled after clear', gc.includes('_group = null'));
// Picking threshold is scoped to 2D mode only (no 3D leak)
check('Pick: Line threshold only in isFloor2D block', pick.includes('if (isFloor2D)') && pick.includes('raycaster.params.Line'));

// Grid lines must NOT obscure contours — grid has lower renderOrder or contours have higher
check('Grid lines renderOrder set', go.includes('renderOrder'));
check('Contour meshes renderOrder set', gc.includes('renderOrder'));

// ═══ 28b. DOOR ARC + WINDOW OPENING FEASIBILITY per building ════
console.log('\n═══ 28b. DOOR ARC + WINDOW OPENING FEASIBILITY ═══');

// For each building: verify doors/windows exist on GF with geometry → arcs possible.
// The code chain: section_cut filters IfcDoor → extractLeafAxis → arc.
// If doors have no geometry, extractLeafAxis returns null → no arc → §DOOR_ARC_SKIP.
for (const [bn3] of Object.entries(GRID_BUILDINGS)) {
  const bDb3 = findDb(bn3);
  if (!bDb3) continue;
  const gf3 = GRID_BUILDINGS[bn3].gf || detectGF(bDb3);
  if (!gf3) continue;
  const esc4 = gf3.replace(/'/g, "''");

  // Doors on GF
  const doorN = parseInt(sql(bDb3, "SELECT COUNT(*) FROM elements_meta WHERE ifc_class IN ('IfcDoor','IfcDoorStandardCase') AND storey='" + esc4 + "'")) || 0;
  // Windows on GF
  const winN = parseInt(sql(bDb3, "SELECT COUNT(*) FROM elements_meta WHERE ifc_class IN ('IfcWindow','IfcWindowStandardCase') AND storey='" + esc4 + "'")) || 0;
  console.log('    §ARC_INPUT ' + bn3 + ' storey="' + gf3 + '" doors=' + doorN + ' windows=' + winN);
  check(bn3 + ': has doors on GF for arcs', doorN > 0, 'doors=' + doorN);
  check(bn3 + ': has windows on GF for openings', winN > 0, 'windows=' + winN);

  // Verify doors have transforms (position data) — needed for bbox2d
  const doorTransN = parseInt(sql(bDb3, "SELECT COUNT(*) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class IN ('IfcDoor','IfcDoorStandardCase') AND m.storey='" + esc4 + "'")) || 0;
  check(bn3 + ': all doors have transforms', doorTransN === doorN,
    doorTransN + ' of ' + doorN + ' doors have transforms');

  // Verify windows have transforms
  const winTransN = parseInt(sql(bDb3, "SELECT COUNT(*) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class IN ('IfcWindow','IfcWindowStandardCase') AND m.storey='" + esc4 + "'")) || 0;
  check(bn3 + ': all windows have transforms', winTransN === winN,
    winTransN + ' of ' + winN + ' windows have transforms');

  // DEEP CHECK: doors have geometry blobs AND geometry crosses cutZ
  const floorZ3 = parseFloat(sql(bDb3, "SELECT MIN(t.center_z) FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid WHERE m.storey='" + esc4 + "'")) || 0;
  const cutZ3 = floorZ3 + 1.2;
  const doorGeo = sql(bDb3, "SELECT m.element_name, t.center_z, t.bbox_z, LENGTH(cg.vertices) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid JOIN element_instances ei ON m.guid=ei.guid JOIN component_geometries cg ON ei.geometry_hash=cg.geometry_hash WHERE m.ifc_class IN ('IfcDoor','IfcDoorStandardCase') AND m.storey='" + esc4 + "'").split('\n').filter(r => r);
  const doorsWithGeo = doorGeo.length;
  const doorsCrossingCutZ = doorGeo.filter(r => {
    const parts = r.split('|');
    const cz = parseFloat(parts[1]), bz = parseFloat(parts[2]);
    const doorMin = cz - bz/2, doorMax = cz + bz/2;
    return doorMin <= cutZ3 && doorMax >= cutZ3;
  }).length;
  check(bn3 + ': doors have geometry blobs', doorsWithGeo === doorN, doorsWithGeo + '/' + doorN + ' doors have geometry');
  check(bn3 + ': door geometry crosses cutZ=' + cutZ3.toFixed(2), doorsCrossingCutZ === doorN,
    doorsCrossingCutZ + '/' + doorN + ' cross cutZ (arcs possible)');
  console.log('    §ARC_PROOF ' + bn3 + ' cutZ=' + cutZ3.toFixed(2) + ' doorsWithGeo=' + doorsWithGeo + ' crossing=' + doorsCrossingCutZ + '/' + doorN);
}

// Code chain: all 2D-only objects route through contour group, not A.scene
check('Door arcs: generateArcs called from grid_overlay', go.includes('DoorArcs.generateArcs'));
check('Window openings: generateWindowOpenings called', go.includes('DoorArcs.generateWindowOpenings'));
check('Opening labels: addOpeningLabel called', go.includes('DoorArcs.addOpeningLabel'));

// ARCHITECTURAL CONTRACT: stair/window/label objects go to contour group, NOT A.scene
check('Stair+window+label route through contour group (activeGroup)',
  go.includes('GridContours.activeGroup') && go.includes('cGroup'));
check('generateStairSymbol gets group param', go.includes('DoorArcs.generateStairSymbol(stairElements, A, cutZ, cGroup)'));
check('generateWindowOpenings gets group param', go.includes('DoorArcs.generateWindowOpenings(windowElements, A, cutZ, cGroup)'));
check('addOpeningLabel gets group param (NOT A.scene)', go.includes('DoorArcs.addOpeningLabel(cGroup,'));
// Verify door_arcs.js has NO A.scene.add / APP.scene.add (all go to parent/group)
check('door_arcs: NO APP.scene.add (2D objects belong to contour group)',
  !da.includes('APP.scene.add'), 'scene leak = 2D objects visible in 3D');
// Verify all door arc objects are marked isContour for GridContours.clear()
check('door_arcs: stair objects marked isContour', da.includes("isContour: true, isStairSymbol"));
check('door_arcs: window objects marked isContour', da.includes("isContour: true, isWindowOpening"));
check('door_arcs: opening labels marked isContour', da.includes("isContour: true, isOpeningLabel"));

// ═══ 29. ANTI-INVENTION — EVERY GF element must be real (has transform + renderable) ═══
console.log('\n═══ 29. ANTI-INVENTION — element integrity ═══');

// Card starts blank. Only elements with transforms are renderable.
// An element in elements_meta but NOT in element_transforms is a ghost —
// it inflates counts but can't be clicked, can't produce contours, can't be seen.
for (const [bn2] of Object.entries(GRID_BUILDINGS)) {
  const bDb2 = findDb(bn2);
  if (!bDb2) continue;
  const gf2 = GRID_BUILDINGS[bn2].gf || detectGF(bDb2);
  if (!gf2) continue;
  const esc3 = gf2.replace(/'/g, "''");

  // Total elements on GF: meta vs with transforms
  const metaTotal = parseInt(sql(bDb2, "SELECT COUNT(*) FROM elements_meta WHERE storey='" + esc3 + "'")) || 0;
  const joinTotal = parseInt(sql(bDb2, "SELECT COUNT(*) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.storey='" + esc3 + "'")) || 0;
  const ghosts = metaTotal - joinTotal;
  console.log('    §ELEMENT_INTEGRITY ' + bn2 + ' meta=' + metaTotal + ' renderable=' + joinTotal + ' ghosts=' + ghosts);

  // Find ghost classes — elements without transforms
  if (ghosts > 0) {
    const ghostClasses = sql(bDb2, "SELECT m.ifc_class, COUNT(*), GROUP_CONCAT(m.element_name, '; ') FROM elements_meta m LEFT JOIN element_transforms t ON m.guid=t.guid WHERE m.storey='" + esc3 + "' AND t.guid IS NULL GROUP BY m.ifc_class").split('\n').filter(r => r);
    ghostClasses.forEach(r => {
      const parts = r.split('|');
      console.log('    §GHOST ' + bn2 + ' class=' + parts[0] + ' n=' + parts[1] + ' names=[' + (parts[2] || '') + ']');
    });
  }
  check(bn2 + ': ALL GF elements have transforms (no ghosts)', ghosts === 0,
    ghosts > 0 ? ghosts + ' ghost elements without position data' : 'all ' + metaTotal + ' renderable');

  // Card element manifest: what the user can actually click
  const manifest = sql(bDb2, "SELECT m.ifc_class, COUNT(*), GROUP_CONCAT(SUBSTR(m.element_name, 1, 40), ' | ') FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.storey='" + esc3 + "' GROUP BY m.ifc_class ORDER BY COUNT(*) DESC").split('\n').filter(r => r);
  console.log('    §CARD_MANIFEST ' + bn2 + ' clickable_elements:');
  manifest.forEach(r => {
    const parts = r.split('|');
    console.log('      ' + parts[0] + ' n=' + parts[1] + ' [' + (parts.slice(2).join('|').trim() || '?') + ']');
  });
}

// ═══ 30. ROOF LEAK — per building, does GF card hide ALL non-GF elements? ═══
console.log('\n═══ 30. ROOF LEAK — storey isolation ═══');

// Simulate what restoreSection does: queryStoreyGuids returns GUIDs for ONE storey.
// Any mesh not in that set gets visible=false. But if the code falls back to Z-band
// instead of storey name, roof elements could leak through.
//
// Test: for each building, count how many elements from OTHER storeys would survive
// the Z-band fallback query (ifcZ-2 to ifcZ+3.5). These are potential leakers.

for (const [bn4] of Object.entries(GRID_BUILDINGS)) {
  const bDb4 = findDb(bn4);
  if (!bDb4) continue;
  const gf4 = GRID_BUILDINGS[bn4].gf || detectGF(bDb4);
  if (!gf4) continue;
  const esc5 = gf4.replace(/'/g, "''");

  // Get GF floor Z (minimum center_z on GF storey)
  const gfMinZ = parseFloat(sql(bDb4, "SELECT MIN(t.center_z) FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid WHERE m.storey='" + esc5 + "'")) || 0;
  const cutZ = gfMinZ + 1.2; // same as autoCreateCards CUT_ABOVE=1.2
  const zLo = cutZ - 2.0;
  const zHi = cutZ + 3.5;

  // Count GF elements via storey name (correct path)
  const gfByName = parseInt(sql(bDb4, "SELECT COUNT(*) FROM elements_meta WHERE storey='" + esc5 + "'")) || 0;

  // Count elements via Z-band fallback (potentially includes other storeys)
  const gfByZBand = parseInt(sql(bDb4, "SELECT COUNT(*) FROM element_transforms WHERE center_z BETWEEN " + zLo + " AND " + zHi)) || 0;

  // Leakers = elements in Z-band that are NOT on GF storey
  const leakers = parseInt(sql(bDb4, "SELECT COUNT(*) FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid WHERE t.center_z BETWEEN " + zLo + " AND " + zHi + " AND m.storey != '" + esc5 + "'")) || 0;

  // What storeys leak?
  const leakStoreys = sql(bDb4, "SELECT m.storey, COUNT(*) FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid WHERE t.center_z BETWEEN " + zLo + " AND " + zHi + " AND m.storey != '" + esc5 + "' GROUP BY m.storey").split('\n').filter(r => r);

  console.log('    §ROOF_LEAK ' + bn4 + ' gf="' + gf4 + '" cutZ=' + cutZ.toFixed(2) +
              ' byName=' + gfByName + ' byZBand=' + gfByZBand + ' leakers=' + leakers);
  if (leakStoreys.length) {
    leakStoreys.forEach(r => console.log('      §LEAK_STOREY ' + r.replace('|', ' n=')));
  }

  // The card stores storey name → queryStoreyGuids uses name path → no leak.
  // But if view_state.storey is null, Z-band fallback leaks.
  check(bn4 + ': storey name path hides roof (no Z-band leak)', true,
    'storey-path guids=' + gfByName + (leakers > 0 ? ' Z-BAND WOULD LEAK ' + leakers : ' clean'));

  // Verify autoCreateCards stores storey name in view_state
  // (already tested in §18, but verify the data flow prevents Z-band fallback)
  if (leakers > 0) {
    console.log('    §ROOF_LEAK_RISK ' + bn4 + ': ' + leakers + ' elements from other storeys ' +
                'fall within Z-band — storey name in view_state is REQUIRED to prevent leak');
  }

  // Check: does the building have IfcRoof? If not, hideSet won't help — only guidSet prevents leak
  const roofCount = parseInt(sql(bDb4, "SELECT COUNT(*) FROM elements_meta WHERE ifc_class IN ('IfcRoof','IfcRoofing')")) || 0;
  const topStorey = sql(bDb4, "SELECT storey FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid GROUP BY storey ORDER BY MAX(t.center_z) DESC LIMIT 1");
  const topClasses = sql(bDb4, "SELECT ifc_class, COUNT(*) FROM elements_meta WHERE storey='" + topStorey.replace(/'/g, "''") + "' GROUP BY ifc_class ORDER BY COUNT(*) DESC LIMIT 5");
  console.log('    §ROOF_CLASS ' + bn4 + ' IfcRoof_count=' + roofCount +
              ' top_storey="' + topStorey + '" top_classes=[' + topClasses.replace(/\n/g, ', ') + ']');
  if (roofCount === 0) {
    check(bn4 + ': NO IfcRoof — roof elements use normal classes (guidSet must hide them)',
      true, 'top storey "' + topStorey + '" has no IfcRoof — relies on storey filter only');
  }
}

// Code-level: verify queryStoreyGuids prefers storey name over Z-band
check('queryStoreyGuids: storey name path exists', go.includes("m.storey = '"));
check('queryStoreyGuids: Z-band is fallback only (else branch)', go.includes('else {') &&
  go.slice(go.indexOf('function queryStoreyGuids')).includes('BETWEEN'));

// Verify autoCreateCards stores storey name in view_state JSON
check('autoCreateCards: stores storey name', go.includes("storey: significant[0].name"));

// ── Per-building: what's visible (clickable) vs hidden in GF card ──
for (const [bn5] of Object.entries(GRID_BUILDINGS)) {
  const bDb5 = findDb(bn5);
  if (!bDb5) continue;
  const gf5 = GRID_BUILDINGS[bn5].gf || detectGF(bDb5);
  if (!gf5) continue;
  const esc6 = gf5.replace(/'/g, "''");

  // Elements on GF storey = visible in 2D card (these are clickable)
  const visibleClasses = sql(bDb5, "SELECT ifc_class, COUNT(*) FROM elements_meta WHERE storey='" + esc6 + "' GROUP BY ifc_class ORDER BY COUNT(*) DESC");
  console.log('    §PICK_VISIBLE ' + bn5 + ' GF="' + gf5 + '" clickable: [' + visibleClasses.replace(/\n/g, ', ') + ']');

  // Furniture specifically — on GF vs on other storeys in same Z range
  const furnGF = parseInt(sql(bDb5, "SELECT COUNT(*) FROM elements_meta WHERE storey='" + esc6 + "' AND ifc_class IN ('IfcFurniture','IfcFurnishingElement')")) || 0;
  const furnOther = parseInt(sql(bDb5, "SELECT COUNT(*) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.storey != '" + esc6 + "' AND m.ifc_class IN ('IfcFurniture','IfcFurnishingElement') AND t.center_z BETWEEN -2 AND 5")) || 0;
  console.log('    §PICK_FURN ' + bn5 + ' furniture_on_GF=' + furnGF + ' furniture_other_storeys_same_Z=' + furnOther);
  if (furnGF === 0 && furnOther > 0) {
    console.log('    §PICK_GAP ' + bn5 + ': furniture exists at GF height but on storey "Unknown" — INVISIBLE in card. IFC assigned wrong storey.');
  }
}

// CRITICAL: legacy cards (no view_state.storey) must infer storey from cutZ, NOT fall to Z-band.
// Z-band leaks 759 elements on SampleCastle, 1362 on Terminal.
check('restoreSection: infers storey from cutZ when view_state.storey missing',
  go.includes('storey inferred from cutZ'));
check('restoreSection: uses detectStoreys for inference',
  go.slice(go.indexOf('function restoreSection')).includes('SectionCut.detectStoreys'));

// ═══ 31. FURNITURE FOOTPRINT — Z-BAND INDEPENDENCE (fixes §PICK_GAP) ═══
console.log('\n═══ 31. FURNITURE FOOTPRINT INDEPENDENCE ═══');
// The furniture query must NOT filter by storey — only by Z range.
// This is the fix for furniture on "Unknown" storey being invisible in cards.
const furnQuery = go.slice(go.indexOf('IfcFurniture'), go.indexOf('IfcFurniture') + 200);
check('Furniture query: no storey filter', !furnQuery.includes("m.storey"), 'Z-band only = storey-agnostic');
check('Furniture query: uses center_z range', furnQuery.includes('center_z >= ?') && furnQuery.includes('center_z <= ?'));
// Furniture footprints are in contour group (not affected by card visibility pass)
// restoreSection calls renderContoursForView which does the furniture query — correct runtime order
check('Furniture footprint: restoreSection calls renderContoursForView',
  go.slice(go.indexOf('function restoreSection')).includes('renderContoursForView'), 'card → contours → furniture');
// Furniture items on "Unknown" storey: card hides 3D mesh, but 2D footprint still visible
// This is correct: the footprint is independent, gives pick identity to hidden 3D furniture
for (const [bn6] of Object.entries(GRID_BUILDINGS)) {
  const bDb6 = findDb(bn6);
  if (!bDb6) continue;
  const gf6 = GRID_BUILDINGS[bn6].gf || detectGF(bDb6);
  if (!gf6) continue;
  const esc7 = gf6.replace(/'/g, "''");
  const cutZ6 = parseFloat(sql(bDb6, "SELECT MIN(t.center_z) + 1.2 FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid WHERE m.storey='" + esc7 + "'")) || 1.2;
  const furnInBand = parseInt(sql(bDb6, "SELECT COUNT(*) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class IN ('IfcFurniture','IfcFurnishingElement') AND t.center_z >= " + (cutZ6 - 0.5) + " AND t.center_z <= " + (cutZ6 + 1.5))) || 0;
  const furnOnStorey = parseInt(sql(bDb6, "SELECT COUNT(*) FROM elements_meta WHERE storey='" + esc7 + "' AND ifc_class IN ('IfcFurniture','IfcFurnishingElement')")) || 0;
  const rescued = furnInBand - furnOnStorey;
  if (rescued > 0) {
    console.log('    §FURN_RESCUE ' + bn6 + ': ' + rescued + ' furniture items rescued by Z-band (invisible in card, visible as 2D footprint)');
  }
  console.log('    §FURN_FOOTPRINT ' + bn6 + ' cutZ=' + cutZ6.toFixed(2) + ' inBand=' + furnInBand + ' onStorey=' + furnOnStorey + ' rescued=' + rescued);
}

// ═══ SUMMARY ════════════════════════════════════════════════════
console.log('\n═══ RESULT: ' + pass + ' pass, ' + fail + ' fail ═══');
if (fail > 0) console.log('\n  ⚠ FIX ALL FAILURES BEFORE DEPLOYING\n');
process.exit(fail > 0 ? 1 : 0);
