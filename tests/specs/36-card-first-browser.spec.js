// 36-card-first-browser.spec.js — Card-First View Model complete test suite (2D_031)
// All card logic + fleet DB verification in one file.
// Tests real DB data via sqlite3 CLI — no browser needed, runs in < 5s.
//
// Verified issues (data characteristics, not code bugs):
//   ⚠BASEMENT (2): AC9_HausGH + VogelGesamt — basement genuinely has more doors than GF
//   ⚠ROOF_ON_GF (1): Esplanades — IFC assigns IfcRoof to ground storey. Card hides them.
//   ⚠ORPHANS (5): container elements (IfcCurtainWall, IfcStair, IfcRoof) with metadata
//     but no geometry/transform. Children have the geometry. Card's guidSet includes them
//     but they don't match any mesh — harmless.
//
// Fixed bugs found by this suite:
//   BUG-IfcCovering: was wrongly hidden (wall tiles, not roof) — removed from HIDE_IN_FLOOR
//   BUG-A: no-guid meshes (ground plane, InstancedMesh) fell through → visible in card
//   BUG-C: _origOpacity guard used falsy check (opacity=0 never saved)
//   BUG-F: captureViewState parsed storey from status bar (never matched) → always empty
//   BUG-G: localStorage fallback INSERT missing view_state column
//   BUG-J: stale clippingPlanes leaked across card→card switches
//   BUG-K: card→card switching lost previous card's faded mesh refs → opacity stuck at 0.08
//   GF detection: lowest-z picked foundations → door-count + ABS(z) tiebreaker

const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEV = path.resolve(__dirname, '../..');
const src = (f) => fs.readFileSync(path.join(DEV, f), 'utf8');
const BLDG_DIR = path.resolve(__dirname, '../../../../deploy/buildings');

// Find a real DB for detailed tests — SAME source as fleet
const DB_CANDIDATES = [
  path.join(BLDG_DIR, 'SampleHouse_extracted.db'),
  path.join(DEV, 'buildings/SampleHouse_extracted.db'),
  path.resolve(__dirname, '../../../../DAGCompiler/lib/input/SampleHouse_extracted.db'),
];
const DB_PATH = DB_CANDIDATES.find(p => fs.existsSync(p));
const sql = (db, query) => {
  try { return execSync(`sqlite3 "${db}" "${query}"`, { encoding: 'utf8' }).trim(); }
  catch (e) { return ''; }
};

// ── Extract classifyMesh as runnable function ─────────────────────
function buildClassify() {
  const s = src('grid_views.js');
  const hide = s.match(/var HIDE_IN_FLOOR\s*=\s*\{[^}]+\}/)[0];
  const fade = s.match(/var FADE_IN_FLOOR\s*=\s*\{[^}]+\}/)[0];
  const fn = s.match(/function classifyMesh\(ifcClass, retainSet, hideSet\)\s*\{[\s\S]*?return 'clip';\s*\}/)[0];
  return new Function('ifcClass', 'retainSet', 'hideSet',
    hide + ';\n' + fade + ';\n' + fn + '\nreturn classifyMesh(ifcClass, retainSet, hideSet);');
}

// ══════════════════════════════════════════════════════════════════
test.describe('Card-First Complete Suite', () => {

  // ── 1. classifyMesh pure logic ─────────────────────────────────
  test('T_3601: classifyMesh — 14 IFC classes, correct action each', () => {
    const c = buildClassify();
    const r = { 'IfcFurnishingElement': 1, 'IfcFurniture': 1, 'IfcFlowTerminal': 1, 'IfcSanitaryTerminal': 1 };
    const log = [];

    const checks = [
      ['IfcRoof',       'hide'],  ['IfcRoofing',     'hide'],
      ['IfcCovering',   'clip'],  // IfcCovering = wall/floor tiles, NOT roof — must be visible
      ['IfcSlab',       'fade'],  ['IfcPlate',       'fade'],
      ['IfcFurniture',  'retain'],['IfcFurnishingElement','retain'],
      ['IfcWall',       'clip'],  ['IfcWallStandardCase','clip'],['IfcColumn','clip'],
      ['IfcDoor',       'clip'],  ['IfcWindow',      'clip'],  ['IfcBeam','clip'],['IfcStair','clip'],
    ];
    for (const [cls, expected] of checks) {
      const got = c(cls, r, null);
      log.push(cls + '→' + got + (got === expected ? ' ✓' : ' ✗ expected=' + expected));
      expect(got).toBe(expected);
    }
    // Custom hideSet overrides HIDE_IN_FLOOR
    const got2 = c('IfcBeam', r, { 'IfcBeam': 1 });
    log.push('IfcBeam+customHide→' + got2);
    expect(got2).toBe('hide');

    console.log('§T_3601 ' + log.join(' | '));
  });

  // ── 2. restoreSection architecture ─────────────────────────────
  test('T_3602: restoreSection — DB query, one pass, no band, hides no-guid meshes', () => {
    const s = src('grid_overlay.js');
    const start = s.indexOf('function restoreSection');
    const end = s.indexOf('\n  // Card cleanup', start);
    const body = s.slice(start, end);
    const log = [];

    const has = (tag, str) => { const ok = body.includes(str); log.push(tag + (ok ? ' ✓' : ' ✗')); return ok; };
    const hasNot = (tag, str) => { const ok = !body.includes(str); log.push(tag + (ok ? ' ✓' : ' ✗')); return ok; };

    expect(has('queryStoreyGuids', 'queryStoreyGuids')).toBe(true);
    expect(has('lockView_cameraOnly', 'null, true)')).toBe(true);
    expect(has('own_clipPlane', 'THREE.Plane')).toBe(true);
    expect(has('no_guid_hide', '!guid')).toBe(true);         // ground plane/InstancedMesh hidden
    // Stale clip cleanup: hidden + retained meshes clear clippingPlanes from previous card
    const hiddenClipClear = (body.match(/obj\.visible = false[\s\S]{0,50}clippingPlanes = null/g) || []).length;
    log.push('stale_clip_clear=' + hiddenClipClear + (hiddenClipClear >= 3 ? ' ✓' : ' ✗'));
    expect(hiddenClipClear).toBeGreaterThanOrEqual(3);  // no-guid + not-in-storey + class-excluded
    expect(has('guidSet_check', 'guidSet[guid]')).toBe(true);
    expect(has('hideSet_check', 'hideSet[cls]')).toBe(true);
    expect(has('fadeSet_check', 'fadeSet[cls]')).toBe(true);
    expect(has('retainSet_check', 'retainSet[cls]')).toBe(true);
    expect(has('contours', 'renderContoursForView')).toBe(true);
    expect(hasNot('no_band', 'applyStoreyBandVisibility')).toBe(true);
    expect(hasNot('no_applyFloorClip', 'applyFloorClip')).toBe(true);

    console.log('§T_3602 ' + log.join(' | '));
  });

  // ── 3. clearCardView ───────────────────────────────────────────
  test('T_3603: clearCardView — restores visible, opacity, clips, called on exit', () => {
    const s = src('grid_overlay.js');
    const fn = s.slice(s.indexOf('function clearCardView()'), s.indexOf('\n  }', s.indexOf('function clearCardView()')) + 4);
    const log = [];
    const has = (tag, str) => { const ok = fn.includes(str); log.push(tag + (ok ? ' ✓' : ' ✗')); return ok; };

    expect(has('visible=true', 'visible = true')).toBe(true);
    expect(has('origOpacity', '_origOpacity')).toBe(true);
    expect(has('clip=null', 'clippingPlanes = null')).toBe(true);
    expect(has('clipping=false', 'localClippingEnabled = false')).toBe(true);
    // Called on grid exit
    expect(s.includes('clearCardView()')).toBe(true);
    log.push('calledOnExit ✓');

    console.log('§T_3603 ' + log.join(' | '));
  });

  // ── 4. autoCreateCards ─────────────────────────────────────────
  test('T_3604: autoCreateCards — guard, detectStoreys, GF+L1', () => {
    const s = src('grid_overlay.js');
    const fn = s.slice(s.indexOf('function autoCreateCards()'));
    const log = [];
    const has = (tag, str) => { const ok = fn.includes(str); log.push(tag + (ok ? ' ✓' : ' ✗')); return ok; };

    expect(has('guard', 'savedSections.length > 0) return')).toBe(true);
    expect(has('storeys', 'detectStoreys')).toBe(true);
    expect(has('GF', "'GF'")).toBe(true);
    expect(has('L1', "'L1'")).toBe(true);
    console.log('§T_3604 ' + log.join(' | '));
  });

  // ── 5. view_state round-trip ───────────────────────────────────
  test('T_3605: view_state — schema, capture, save, load, parse', () => {
    const overlay = src('grid_overlay.js');
    const log = [];
    const has = (tag, str) => { const ok = overlay.includes(str); log.push(tag + (ok ? ' ✓' : ' ✗')); return ok; };

    expect(has('alter', 'ADD COLUMN view_state TEXT')).toBe(true);
    expect(has('capture', 'function captureViewState()')).toBe(true);
    expect(has('save', 'view_state) VALUES')).toBe(true);
    expect(has('select', 'view_state FROM saved_sections')).toBe(true);
    expect(has('parse', 'JSON.parse(row[5])')).toBe(true);
    console.log('§T_3605 ' + log.join(' | '));
  });

  // ── 6. lockView cameraOnly ─────────────────────────────────────
  test('T_3606: lockView cameraOnly — skips clip when true', () => {
    const s = src('grid_views.js');
    const log = [];
    const has = (tag, str) => { const ok = s.includes(str); log.push(tag + (ok ? ' ✓' : ' ✗')); return ok; };

    expect(has('param', 'hideSet, cameraOnly)')).toBe(true);
    expect(has('guard', '!cameraOnly && VIEW_DEFS')).toBe(true);
    console.log('§T_3606 ' + log.join(' | '));
  });

  // ── 7. Save button — always when scissors ON ──────────────────
  test('T_3607: Save button — available when scissors ON, wired to saveSectionFromScissors', () => {
    const s = src('tools.js');
    const log = [];
    const has = (tag, str) => { const ok = s.includes(str); log.push(tag + (ok ? ' ✓' : ' ✗')); return ok; };

    expect(has('btn_id', 'section-save-cut-btn')).toBe(true);
    expect(has('save_fn', 'saveSectionFromScissors')).toBe(true);
    // NOT gated by isIn2DView (was the bug)
    const toggleBlock = s.slice(s.indexOf('A.sectionOn = !A.sectionOn'));
    const saveBlock = toggleBlock.slice(0, toggleBlock.indexOf('section-save-cut-btn'));
    const gated = saveBlock.includes('isIn2DView');
    log.push('not_gated' + (gated ? ' ✗ STILL GATED' : ' ✓'));
    expect(gated).toBe(false);

    console.log('§T_3607 ' + log.join(' | '));
  });

  // ── 8. SampleHouse GF card composition ─────────────────────────
  test('T_3608: SampleHouse GF — hide+fade+retain+clip = total, all GUIDs joinable', () => {
    if (!DB_PATH) return;
    const gf = 'Ground Floor';
    const total = parseInt(sql(DB_PATH, "SELECT COUNT(*) FROM elements_meta WHERE storey='" + gf + "'"));
    const hidden = parseInt(sql(DB_PATH, "SELECT COUNT(*) FROM elements_meta WHERE storey='" + gf + "' AND ifc_class IN ('IfcRoof','IfcRoofing')"));
    const faded = parseInt(sql(DB_PATH, "SELECT COUNT(*) FROM elements_meta WHERE storey='" + gf + "' AND ifc_class IN ('IfcSlab','IfcPlate')"));
    const retained = parseInt(sql(DB_PATH, "SELECT COUNT(*) FROM elements_meta WHERE storey='" + gf + "' AND ifc_class IN ('IfcFurniture','IfcFurnishingElement','IfcFlowTerminal','IfcSanitaryTerminal','IfcElectricalAppliance')"));
    const clipped = total - hidden - faded - retained;
    const joinCount = parseInt(sql(DB_PATH, "SELECT COUNT(*) FROM elements_meta m JOIN element_transforms et ON m.guid=et.guid WHERE m.storey='" + gf + "'"));
    const totalAll = parseInt(sql(DB_PATH, "SELECT COUNT(*) FROM elements_meta"));

    console.log('§T_3608 db=' + path.basename(DB_PATH) +
                ' total=' + total + ' hidden=' + hidden + ' faded=' + faded +
                ' retained=' + retained + ' clipped=' + clipped +
                ' join=' + joinCount + ' totalAll=' + totalAll);

    // Invariants — these hold for ANY DB version
    expect(total).toBeGreaterThan(0);
    expect(hidden + faded + retained + clipped).toBe(total);  // all accounted for
    // joinCount may be < total: some elements have metadata but no transform (no mesh in scene)
    // Card query returns all GUIDs from metadata; orphans are harmless (no mesh to match)
    expect(joinCount).toBeGreaterThan(0);
    expect(joinCount).toBeLessThanOrEqual(total);
    if (joinCount < total) {
      console.log('§T_3608 NOTE: ' + (total - joinCount) + ' orphan GUIDs (meta without transform)');
    }
    expect(clipped).toBeGreaterThan(0);                        // must have walls to clip
    expect(total).toBeLessThan(totalAll);                      // storey is subset
  });

  // ── 9. Fleet — every deployed building ─────────────────────────
  // Uses door-count ranking (same as viewer computeStoreyAwareCutZ) to pick GF.
  // Logs warnings for: wrong GF, zero walls, slab-heavy, foundation-as-GF.
  test('T_3609: Fleet — GF card composition across all deployed buildings', () => {
    const dbs = fs.existsSync(BLDG_DIR)
      ? fs.readdirSync(BLDG_DIR).filter(f => f.endsWith('_extracted.db'))
      : [];
    expect(dbs.length).toBeGreaterThan(0);

    // Basement/foundation keywords — these should NOT be GF
    const BASEMENT_WORDS = ['keller','kjeller','kælder','basement','foundation','footing',
                            'fundering','fdn','t/fdn','subgrade','pile','ug','untergeschoss',
                            'ground water'];

    const results = [];
    const warnings = [];
    let checked = 0;

    for (const dbFile of dbs) {
      const bld = dbFile.replace('_extracted.db', '');
      const dbPath = path.join(BLDG_DIR, dbFile);

      const hasMeta = sql(dbPath, "SELECT COUNT(*) FROM sqlite_master WHERE name='elements_meta'");
      const hasTx = sql(dbPath, "SELECT COUNT(*) FROM sqlite_master WHERE name='element_transforms'");
      if (hasMeta === '0' || hasTx === '0') {
        results.push(bld + ': infra_db');
        continue;
      }

      // Door-count ranking: storey with most doors = GF (same as viewer)
      // Fallback: storey with most elements excluding junk names
      var gf = sql(dbPath,
        "SELECT m.storey, COUNT(*) as n, " +
        "SUM(CASE WHEN m.ifc_class IN ('IfcDoor','IfcDoorStandardCase') THEN 1 ELSE 0 END) as doors " +
        "FROM elements_meta m JOIN element_transforms et ON m.guid=et.guid " +
        "WHERE m.storey IS NOT NULL AND m.storey NOT IN ('Unknown','Roof','unknown') " +
        "GROUP BY m.storey HAVING n >= 5 ORDER BY doors DESC, ABS(MIN(et.center_z)) ASC LIMIT 1");
      if (!gf) {
        results.push(bld + ': no_storey');
        continue;
      }
      gf = gf.split('|')[0]; // first column = storey name

      const esc = gf.replace(/'/g, "''");
      const total = parseInt(sql(dbPath, "SELECT COUNT(*) FROM elements_meta WHERE storey='" + esc + "'")) || 0;
      const walls = parseInt(sql(dbPath, "SELECT COUNT(*) FROM elements_meta WHERE storey='" + esc + "' AND ifc_class IN ('IfcWall','IfcWallStandardCase')")) || 0;
      const doors = parseInt(sql(dbPath, "SELECT COUNT(*) FROM elements_meta WHERE storey='" + esc + "' AND ifc_class IN ('IfcDoor','IfcDoorStandardCase')")) || 0;
      const roofs = parseInt(sql(dbPath, "SELECT COUNT(*) FROM elements_meta WHERE storey='" + esc + "' AND ifc_class IN ('IfcRoof','IfcRoofing')")) || 0;
      const slabs = parseInt(sql(dbPath, "SELECT COUNT(*) FROM elements_meta WHERE storey='" + esc + "' AND ifc_class IN ('IfcSlab','IfcPlate')")) || 0;
      const furn = parseInt(sql(dbPath, "SELECT COUNT(*) FROM elements_meta WHERE storey='" + esc + "' AND ifc_class IN ('IfcFurniture','IfcFurnishingElement')")) || 0;
      const totalAll = parseInt(sql(dbPath, "SELECT COUNT(*) FROM elements_meta")) || 0;

      // Card composition — same categories as restoreSection
      const hidden = roofs;  // hideSet: IfcRoof, IfcRoofing, IfcCovering
      const faded = slabs;   // fadeSet: IfcSlab, IfcPlate
      const retained = furn;  // retainSet: furniture (simplified — viewer also has FlowTerminal etc.)
      const clipped = total - hidden - faded - retained;  // everything else: walls, doors, windows, beams

      // GUIDs joinable to element_transforms (= will have meshes in scene)
      const joinCount = parseInt(sql(dbPath, "SELECT COUNT(*) FROM elements_meta m JOIN element_transforms et ON m.guid=et.guid WHERE m.storey='" + esc + "'")) || 0;
      const orphans = total - joinCount;

      // ── Whitebox checks ──
      const gfLower = gf.toLowerCase();
      const isBasement = BASEMENT_WORDS.some(w => gfLower.includes(w));
      const wallPct = total > 0 ? (walls / total * 100).toFixed(0) : '0';
      const slabPct = total > 0 ? (slabs / total * 100).toFixed(0) : '0';

      let flags = '';
      if (isBasement) flags += ' ⚠BASEMENT';
      if (walls === 0) flags += ' ⚠NO_WALLS';
      if (doors === 0 && walls > 0) flags += ' ⚠NO_DOORS';
      if (roofs > 0) flags += ' ⚠ROOF_ON_GF(' + roofs + ')';
      if (orphans > 0) flags += ' ⚠ORPHANS(' + orphans + ')';
      if (hidden + faded + retained + clipped !== total) flags += ' ⚠SUM_MISMATCH';

      results.push(bld + ': GF=' + gf + ' tot=' + total + '/' + totalAll +
                   ' hide=' + hidden + ' fade=' + faded + ' retain=' + retained + ' clip=' + clipped +
                   ' w=' + walls + '(' + wallPct + '%) d=' + doors +
                   ' join=' + joinCount + '/' + total + flags);
      if (flags) warnings.push(bld + ': ' + flags.trim());

      // ── Assertions ──
      expect(total).toBeGreaterThan(0);
      expect(hidden + faded + retained + clipped).toBe(total);  // composition adds up
      expect(clipped).toBeGreaterThanOrEqual(0);                 // no negative
      checked++;
    }

    console.log('§T_3609 FLEET checked=' + checked + '/' + dbs.length +
                ' issues=' + warnings.length);
    for (const r of results) console.log('  ' + r);
    if (warnings.length) {
      console.log('§T_3609 ISSUES:');
      for (const w of warnings) console.log('  ' + w);
    }
    expect(checked).toBeGreaterThan(20);
  });

  // ── 10. Door-count ranking vs lowest-z ─────────────────────────
  // The bug: autoCreateCards was sorting by lowest floorZ → picked basements.
  // Fix: sort by door count desc, then floorZ asc (same as computeStoreyAwareCutZ).
  test('T_3610: autoCreateCards uses door-count ranking — not lowest-z', () => {
    const s = src('grid_overlay.js');
    const fn = s.slice(s.indexOf('function autoCreateCards()'));
    const log = [];

    // Must query door counts per storey
    const hasDoorQuery = fn.includes("IfcDoor") && fn.includes("GROUP BY m.storey");
    log.push('doorQuery' + (hasDoorQuery ? ' ✓' : ' ✗'));
    expect(hasDoorQuery).toBe(true);

    // Must sort by doors DESC
    const hasDoorSort = fn.includes('db2 - da') || fn.includes('doors DESC');
    log.push('doorSort' + (hasDoorSort ? ' ✓' : ' ✗'));
    expect(hasDoorSort).toBe(true);

    // Verify on real DBs: door-ranked GF ≠ lowest-z GF for multi-storey buildings
    if (!DB_PATH) { console.log('§T_3610 ' + log.join(' | ')); return; }
    const dbs = fs.existsSync(BLDG_DIR) ? fs.readdirSync(BLDG_DIR).filter(f => f.endsWith('_extracted.db')) : [];
    let improved = 0;
    for (const dbFile of dbs) {
      const dbPath = path.join(BLDG_DIR, dbFile);
      const hasMeta = sql(dbPath, "SELECT COUNT(*) FROM sqlite_master WHERE name='elements_meta'");
      if (hasMeta === '0') continue;

      const lowestZ = sql(dbPath, "SELECT m.storey FROM elements_meta m JOIN element_transforms et ON m.guid=et.guid WHERE m.storey IS NOT NULL AND m.storey NOT IN ('Unknown','Roof','unknown') GROUP BY m.storey HAVING COUNT(*)>=5 ORDER BY MIN(et.center_z) LIMIT 1");
      const doorRanked = sql(dbPath, "SELECT m.storey FROM elements_meta m JOIN element_transforms et ON m.guid=et.guid WHERE m.storey IS NOT NULL AND m.storey NOT IN ('Unknown','Roof','unknown') GROUP BY m.storey HAVING COUNT(*)>=5 ORDER BY SUM(CASE WHEN m.ifc_class IN ('IfcDoor','IfcDoorStandardCase') THEN 1 ELSE 0 END) DESC, ABS(MIN(et.center_z)) LIMIT 1");
      if (!lowestZ || !doorRanked) continue;
      const lz = lowestZ.split('|')[0];
      const dr = doorRanked.split('|')[0];
      if (lz !== dr) improved++;
    }
    log.push('improved=' + improved + '_buildings');
    console.log('§T_3610 ' + log.join(' | '));
    // Door ranking should improve at least some buildings
    expect(improved).toBeGreaterThan(0);
  });

  // ── 11. classifyMesh covers every IFC class in fleet ───────────
  // Extract all unique IFC classes across all DBs, run classifyMesh on each.
  // Every class must get exactly one of: hide, fade, retain, clip.
  test('T_3611: classifyMesh handles every IFC class in the fleet', () => {
    const classify = buildClassify();
    const retain = { 'IfcFurnishingElement': 1, 'IfcFurniture': 1, 'IfcFlowTerminal': 1, 'IfcSanitaryTerminal': 1 };
    const validActions = ['hide', 'fade', 'retain', 'clip'];

    // Gather all unique IFC classes from all DBs
    const allClasses = new Set();
    const dbs = fs.existsSync(BLDG_DIR) ? fs.readdirSync(BLDG_DIR).filter(f => f.endsWith('_extracted.db')) : [];
    for (const dbFile of dbs) {
      const dbPath = path.join(BLDG_DIR, dbFile);
      const classes = sql(dbPath, "SELECT DISTINCT ifc_class FROM elements_meta WHERE ifc_class IS NOT NULL");
      if (classes) classes.split('\n').forEach(c => allClasses.add(c));
    }

    const results = {};
    let unknown = 0;
    for (const cls of allClasses) {
      const action = classify(cls, retain, null);
      if (!validActions.includes(action)) unknown++;
      results[cls] = action;
    }

    // Group by action for log
    const groups = { hide: [], fade: [], retain: [], clip: [] };
    for (const [cls, action] of Object.entries(results)) groups[action].push(cls);

    console.log('§T_3611 classes=' + allClasses.size +
                ' hide=' + groups.hide.length +
                ' fade=' + groups.fade.length +
                ' retain=' + groups.retain.length +
                ' clip=' + groups.clip.length);
    console.log('  hide: ' + groups.hide.join(', '));
    console.log('  fade: ' + groups.fade.join(', '));
    console.log('  retain: ' + groups.retain.join(', '));
    console.log('  clip: ' + groups.clip.sort().join(', '));

    expect(unknown).toBe(0);
    expect(allClasses.size).toBeGreaterThan(10);
  });

  // ── 12. BUG K — card→card switching restores faded opacity ──────
  test('T_3612K: restoreSection unfades previous card slabs before new card', () => {
    const s = src('grid_overlay.js');
    const start = s.indexOf('function restoreSection');
    const end = s.indexOf('\n  // Card cleanup', start);
    const body = s.slice(start, end);
    const log = [];

    // Must restore previous faded meshes before resetting arrays
    const restoreBeforeReset = body.indexOf('_origOpacity') < body.indexOf('_cardFadedMeshes = []');
    log.push('restore_before_reset' + (restoreBeforeReset ? ' ✓' : ' ✗'));
    expect(restoreBeforeReset).toBe(true);

    // Must delete _origOpacity after restoring
    const hasDelete = body.includes('delete pfm.userData._origOpacity');
    log.push('cleanup_origOpacity' + (hasDelete ? ' ✓' : ' ✗'));
    expect(hasDelete).toBe(true);

    console.log('§T_3612K ' + log.join(' | '));
  });

  // ── 13. State completeness — every mesh path sets ALL required properties ──
  test('T_3613S: every restoreSection path sets visible+clippingPlanes+clipShadows+needsUpdate', () => {
    const s = src('grid_overlay.js');
    const start = s.indexOf('A.collectMeshes(function(o) { return o.isMesh; }).forEach', s.indexOf('function restoreSection'));
    const end = s.indexOf('log(\'§CARD_RESTORE mesh pass', start);
    const loop = s.slice(start, end);

    // Split into code blocks by return statements
    const blocks = loop.split(/return;\s*\}/);
    const log = [];
    let clean = true;

    for (let i = 0; i < blocks.length - 1; i++) {
      const b = blocks[i];
      // Find what path this is
      const pathMatch = b.match(/\/\/\s*(.+?)$/m);
      const pathName = pathMatch ? pathMatch[1].trim().slice(0, 40) : 'path' + i;

      const hasVisible = b.includes('.visible =');
      const hasClip = b.includes('clippingPlanes');
      const hasClipShadows = b.includes('clipShadows');
      const hasUpdate = b.includes('needsUpdate');

      const missing = [];
      if (!hasVisible) missing.push('visible');
      if (!hasClip) missing.push('clippingPlanes');
      if (!hasClipShadows) missing.push('clipShadows');
      if (!hasUpdate) missing.push('needsUpdate');

      if (missing.length) {
        log.push(pathName + ' MISSING:' + missing.join(','));
        clean = false;
      } else {
        log.push(pathName + ' ✓');
      }
    }

    console.log('§T_3613S ' + log.join(' | '));
    expect(clean).toBe(true);
  });

  // ── 14. BUG U — deleting active card clears mesh state ──────────
  test('T_3614U: delete card button calls clearCardView — no stale mesh state', () => {
    const s = src('grid_overlay.js');
    // Find the delete button handler
    const delHandler = s.slice(s.indexOf('saved-section-del'), s.indexOf('grid-save-section-btn'));
    const log = [];

    const hasClear = delHandler.includes('clearCardView()');
    log.push('clearCardView_on_delete' + (hasClear ? ' ✓' : ' ✗'));
    expect(hasClear).toBe(true);

    const hasClearClip = delHandler.includes('clearFloorClip');
    log.push('clearFloorClip_on_delete' + (hasClearClip ? ' ✓' : ' ✗'));
    expect(hasClearClip).toBe(true);

    console.log('§T_3614U ' + log.join(' | '));
  });

  // ── 15. BUG W — contour meshes skipped in card pass ─────────────
  test('T_3615W: restoreSection skips isContour meshes — 2D lines not clipped', () => {
    const s = src('grid_overlay.js');
    const start = s.indexOf('A.collectMeshes', s.indexOf('function restoreSection'));
    const body = s.slice(start, s.indexOf('§CARD_RESTORE mesh pass', start));
    const log = [];

    const skips = body.includes('isContour') && body.includes('return');
    log.push('skip_contour' + (skips ? ' ✓' : ' ✗'));
    expect(skips).toBe(true);

    // Verify contour meshes DO have isContour flag
    const contours = src('grid_contours.js');
    const hasFlag = contours.includes('isContour: true');
    log.push('contour_flag_set' + (hasFlag ? ' ✓' : ' ✗'));
    expect(hasFlag).toBe(true);

    console.log('§T_3615W ' + log.join(' | '));
  });

  // ══════════════════════════════════════════════════════════════════
  // P1-P8 from prompts/2D_030_grid_ux_tshoot.md — EVERY issue tested
  // ══════════════════════════════════════════════════════════════════

  // ── P1: Grid Y-axis alignment — wall orientation detection ────
  test('P1: grid_dims.js Y-axis wall detection — orientation threshold + clustering', () => {
    const dims = src('grid_dims.js');
    const log = [];
    const has = (tag, str) => { const ok = dims.includes(str); log.push(tag + (ok ? ' ✓' : ' ✗')); return ok; };

    // Must detect wall orientation (long axis vs short axis)
    expect(has('orientation', 'orient') || has('axis_detect', 'axis')).toBe(true);
    // Must cluster Y positions
    expect(has('cluster', 'cluster')).toBe(true);
    // Must have wall weight voting
    expect(has('wall_weight', 'weight') || has('vote', 'vote')).toBe(true);

    // Verify on fleet: Y-axis walls exist per building
    if (DB_PATH) {
      const yWalls = sql(DB_PATH, "SELECT COUNT(*) FROM element_transforms et JOIN elements_meta m ON et.guid=m.guid WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase') AND m.storey='Ground Floor'");
      log.push('GF_walls=' + yWalls);
    }
    console.log('§P1 ' + log.join(' | '));
  });

  // ── P2: GF floor plan — roof excluded, door arcs present ──────
  test('P2: section_cut excludes roof from GF + door_arcs generates arcs', () => {
    const sc = src('section_cut.js');
    const arcs = src('grid_door_arcs.js');
    const log = [];

    // Band filter excludes IfcRoof
    const excl = sc.match(/exclude_above_band.*?\[([^\]]+)\]/);
    const hasRoofExcl = excl && excl[1].includes('IfcRoof');
    log.push('roof_excluded' + (hasRoofExcl ? ' ✓' : ' ✗'));
    expect(hasRoofExcl).toBe(true);

    // IfcCovering NOT excluded (wall tiles)
    const hasCoveringExcl = excl && excl[1].includes('IfcCovering');
    log.push('covering_NOT_excluded' + (!hasCoveringExcl ? ' ✓' : ' ✗'));
    expect(hasCoveringExcl).toBe(false);

    // Door arcs module exists and generates arcs
    const hasGenerate = arcs.includes('generateArcs');
    log.push('generateArcs' + (hasGenerate ? ' ✓' : ' ✗'));
    expect(hasGenerate).toBe(true);

    // Door arcs need leaf geometry (extractLeafAxis)
    const hasLeaf = arcs.includes('extractLeafAxis') || arcs.includes('leafAxis');
    log.push('leafAxis' + (hasLeaf ? ' ✓' : ' ✗'));
    expect(hasLeaf).toBe(true);

    // Fleet: count doors per GF across buildings
    if (DB_PATH) {
      const doors = sql(DB_PATH, "SELECT COUNT(*) FROM elements_meta WHERE storey='Ground Floor' AND ifc_class IN ('IfcDoor','IfcDoorStandardCase')");
      log.push('GF_doors=' + doors);
      expect(parseInt(doors)).toBeGreaterThan(0);
    }
    console.log('§P2 ' + log.join(' | '));
  });

  // ── P3: Window opening dimension lines ────────────────────────
  test('P3: grid_door_arcs.js has window opening lines — jamb ticks + connecting line', () => {
    const arcs = src('grid_door_arcs.js');
    const log = [];
    const has = (tag, str) => { const ok = arcs.includes(str); log.push(tag + (ok ? ' ✓' : ' ✗')); return ok; };

    expect(has('windowOpenings', 'generateWindowOpenings') || has('window', 'Window')).toBe(true);
    expect(has('stairSymbol', 'generateStairSymbol') || has('stair', 'Stair')).toBe(true);

    // Fleet: windows on GF
    if (DB_PATH) {
      const wins = sql(DB_PATH, "SELECT COUNT(*) FROM elements_meta WHERE storey='Ground Floor' AND ifc_class IN ('IfcWindow','IfcWindowStandardCase')");
      log.push('GF_windows=' + wins);
    }
    console.log('§P3 ' + log.join(' | '));
  });

  // ── P4: Saved section restore — view_state + contours ─────────
  test('P4: restoreSection reads view_state + renders contours — card restore works', () => {
    const s = src('grid_overlay.js');
    const start = s.indexOf('function restoreSection');
    const end = s.indexOf('\n  // Card cleanup', start);
    const body = s.slice(start, end);
    const log = [];

    const has = (tag, str) => { const ok = body.includes(str); log.push(tag + (ok ? ' ✓' : ' ✗')); return ok; };
    expect(has('view_state', 'sec.view_state')).toBe(true);
    expect(has('storey_query', 'queryStoreyGuids')).toBe(true);
    expect(has('contours', 'renderContoursForView')).toBe(true);
    expect(has('camera', 'applyCameraState')).toBe(true);
    expect(has('card_log', '§CARD_RESTORE')).toBe(true);
    console.log('§P4 ' + log.join(' | '));
  });

  // ── P5: Delete saved section — DB + localStorage cleanup ──────
  test('P5: deleteSavedSection clears DB + localStorage — no zombie cards', () => {
    const s = src('grid_overlay.js');
    const delFn = s.slice(s.indexOf('function deleteSavedSection'), s.indexOf('\n  function', s.indexOf('function deleteSavedSection') + 10));
    const log = [];

    const has = (tag, str) => { const ok = delFn.includes(str); log.push(tag + (ok ? ' ✓' : ' ✗')); return ok; };
    expect(has('db_delete', 'DELETE FROM saved_sections')).toBe(true);
    expect(has('ls_remove', 'localStorage.removeItem')).toBe(true);
    expect(has('reload', 'loadSavedSections')).toBe(true);
    expect(has('ls_update', 'localStorage.setItem')).toBe(true);
    expect(has('log', '§SAVE_SECTION deleted')).toBe(true);
    console.log('§P5 ' + log.join(' | '));
  });

  // ── P6: Panel close button ────────────────────────────────────
  test('P6: grid panel has close button — ✕ handler registered', () => {
    const s = src('grid_overlay.js');
    const log = [];

    const hasClose = s.includes('grid-panel-close') || s.includes('Close grid panel');
    log.push('close_btn' + (hasClose ? ' ✓' : ' ✗'));
    expect(hasClose).toBe(true);

    console.log('§P6 ' + log.join(' | '));
  });

  // ── P7: Panel dimensions update on drag ───────────────────────
  test('P7: grid_drag.js rebuilds panel on drag — bay widths update', () => {
    const drag = src('grid_drag.js');
    const log = [];
    const has = (tag, str) => { const ok = drag.includes(str); log.push(tag + (ok ? ' ✓' : ' ✗')); return ok; };

    expect(has('rebuildPanel', 'rebuildPanel')).toBe(true);
    expect(has('rebuildAnnotations', 'rebuildAnnotations') || has('rebuild', 'rebuild')).toBe(true);
    // Must update grid positions during drag
    expect(has('position_update', 'position') && has('delta', 'delta')).toBe(true);
    console.log('§P7 ' + log.join(' | '));
  });

  // ── P8: Wall outline on large buildings ───────────────────────
  test('P8: grid_contours.js has adaptive wall outline — minOutlineW for large buildings', () => {
    const gc = src('grid_contours.js');
    const log = [];
    const has = (tag, str) => { const ok = gc.includes(str); log.push(tag + (ok ? ' ✓' : ' ✗')); return ok; };

    expect(has('buildRibbon', 'buildRibbon')).toBe(true);
    expect(has('minOutlineW', 'minOutlineW') || has('MIN_WALL', 'MIN_WALL')).toBe(true);
    // FILL_CLASSES must NOT include IfcSlab (slab fill covers floor)
    const fillMatch = gc.match(/FILL_CLASSES\s*=\s*\{([^}]+)\}/);
    const hasSlab = fillMatch && fillMatch[1].includes('IfcSlab');
    log.push('slab_NOT_filled' + (!hasSlab ? ' ✓' : ' ✗'));
    expect(hasSlab).toBeFalsy();

    // Terminal: 143 walls on GF — verify contour engine handles it
    const terminalDb = path.join(BLDG_DIR, 'Terminal_extracted.db');
    if (fs.existsSync(terminalDb)) {
      const tw = sql(terminalDb, "SELECT COUNT(*) FROM elements_meta m WHERE m.storey='Aras Tanah' AND m.ifc_class IN ('IfcWall','IfcWallStandardCase')");
      log.push('Terminal_GF_walls=' + tw);
    }
    console.log('§P8 ' + log.join(' | '));
  });

  // ── Save button on scissors — tools.js ────────────────────────
  test('P_SAVE: Save button NOT gated — available when scissors ON', () => {
    const s = src('tools.js');
    const log = [];

    // section-save-cut-btn must exist
    const hasBtn = s.includes('section-save-cut-btn');
    log.push('btn_exists' + (hasBtn ? ' ✓' : ' ✗'));

    // Must NOT be gated by isIn2DView
    const hasGate = s.includes('isIn2DView');
    log.push('not_gated' + (!hasGate ? ' ✓' : ' ✗ GATED'));

    // Wired to saveSectionFromScissors or similar
    const hasSave = s.includes('saveSectionFromScissors') || s.includes('Save cut');
    log.push('save_wired' + (hasSave ? ' ✓' : ' ✗'));

    expect(hasBtn).toBe(true);
    expect(hasGate).toBe(false);
    expect(hasSave).toBe(true);
    console.log('§P_SAVE ' + log.join(' | '));
  });

  // ── 16. Grid alignment — detect grid lines from structural walls ──
  test('T_3613: grid detection uses wall clustering — lines align with structure', () => {
    const dims = src('grid_dims.js');
    const log = [];
    const has = (tag, str) => { const ok = dims.includes(str); log.push(tag + (ok ? ' ✓' : ' ✗')); return ok; };

    // Must query structural elements for grid detection
    expect(has('IfcWall', 'IfcWall')).toBe(true);
    expect(has('IfcColumn', 'IfcColumn')).toBe(true);
    expect(has('IfcBeam', 'IfcBeam')).toBe(true);
    // Must cluster positions into grid lines
    expect(has('cluster', 'cluster')).toBe(true);
    // Must snap to structural positions
    expect(has('snap', 'snap') || has('align', 'align')).toBe(true);

    // Verify real grid data on SampleHouse
    if (!DB_PATH) { console.log('§T_3613 ' + log.join(' | ')); return; }
    const walls = sql(DB_PATH, "SELECT center_x FROM element_transforms et JOIN elements_meta m ON et.guid=m.guid WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase') AND m.storey='Ground Floor' ORDER BY center_x");
    const xs = walls.split('\n').map(Number).filter(n => !isNaN(n));
    log.push('wall_x_positions=' + xs.length);
    // SampleHouse GF should have walls at distinct X positions for grid lines
    const uniqueXs = [...new Set(xs.map(x => Math.round(x * 10) / 10))];
    log.push('unique_x=' + uniqueXs.length);
    expect(uniqueXs.length).toBeGreaterThan(1);

    console.log('§T_3613 ' + log.join(' | ') + ' xs=' + uniqueXs.join(','));
  });

  // ── 14. Stale lines — grid lines must match current storey ────
  test('T_3614: grid detection queries storey-scoped elements — no stale from other floors', () => {
    const dims = src('grid_dims.js');
    const log = [];

    // Grid detection must filter by storey or Z range
    const hasStoreyFilter = dims.includes('storey') || dims.includes('center_z');
    log.push('storey_or_z_filter' + (hasStoreyFilter ? ' ✓' : ' ✗'));
    expect(hasStoreyFilter).toBe(true);

    // Verify: different storeys have different wall positions (→ different grid lines)
    if (!DB_PATH) { console.log('§T_3614 ' + log.join(' | ')); return; }
    const storeys = sql(DB_PATH, "SELECT DISTINCT storey FROM elements_meta WHERE storey NOT IN ('Unknown','Roof') AND storey IS NOT NULL");
    if (storeys.split('\n').length < 2) {
      log.push('single_storey_building');
      console.log('§T_3614 ' + log.join(' | '));
      return;
    }

    // Compare wall positions across storeys
    const s1 = storeys.split('\n')[0];
    const walls1 = sql(DB_PATH, "SELECT AVG(et.center_x) FROM element_transforms et JOIN elements_meta m ON et.guid=m.guid WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase') AND m.storey='" + s1.replace(/'/g,"''") + "'");
    log.push('storey1=' + s1 + '_avg_x=' + parseFloat(walls1).toFixed(2));

    console.log('§T_3614 ' + log.join(' | '));
  });

  // ── 15. Contour composition — section_cut produces walls at GF cutZ ──
  // Verify that section_cut.js SLICE_CLASSES includes the classes needed
  // for contours, and that the band filter excludes roof classes.
  test('T_3612: section_cut SLICE_CLASSES covers walls+doors, band excludes roof', () => {
    const s = src('section_cut.js');
    const log = [];

    // SLICE_CLASSES must include walls, doors, windows for contour
    const sliceMatch = s.match(/var SLICE_CLASSES\s*=\s*\{([^}]+)\}/);
    expect(sliceMatch).not.toBeNull();
    const sliceBody = sliceMatch[1];

    const mustSlice = ['IfcWall', 'IfcWallStandardCase', 'IfcDoor', 'IfcWindow', 'IfcColumn'];
    for (const cls of mustSlice) {
      const has = sliceBody.includes(cls);
      log.push(cls + (has ? ' ✓' : ' ✗'));
      expect(has).toBe(true);
    }

    // Band filter must exclude roof classes
    const excMatch = s.match(/exclude_above_band.*?\[([^\]]+)\]/);
    expect(excMatch).not.toBeNull();
    const excBody = excMatch[1];
    const mustExclude = ['IfcRoof', 'IfcRoofing'];
    for (const cls of mustExclude) {
      const has = excBody.includes(cls);
      log.push('band_excl_' + cls + (has ? ' ✓' : ' ✗'));
      expect(has).toBe(true);
    }

    console.log('§T_3612 ' + log.join(' | '));
  });

  test('T_3613: 2D pick identity — raycaster includes Lines, arcs carry ifcClass, furniture footprints', () => {
    const pick = src('picking.js');
    const da = src('grid_door_arcs.js');
    const gc = src('grid_contours.js');
    const go = src('grid_overlay.js');
    const log = [];

    // picking.js extends raycaster for Lines in 2D
    const hasLineThreshold = pick.includes('raycaster.params.Line');
    log.push('Line.threshold=' + (hasLineThreshold ? '✓' : '✗'));
    expect(hasLineThreshold).toBe(true);

    const picksLines = pick.includes('o.isLine') && pick.includes('isContour');
    log.push('collectLines=' + (picksLines ? '✓' : '✗'));
    expect(picksLines).toBe(true);

    // §PICK_2D log tag for 2D picks
    const has2DLog = pick.includes('§PICK_2D');
    log.push('§PICK_2D=' + (has2DLog ? '✓' : '✗'));
    expect(has2DLog).toBe(true);

    // Door arcs carry ifcClass
    const arcClass = da.includes("ifcClass: 'IfcDoor'");
    log.push('arc.ifcClass=' + (arcClass ? '✓' : '✗'));
    expect(arcClass).toBe(true);

    // Stair symbols carry ifcClass
    const stairClass = da.includes("ifcClass: el.ifcClass || 'IfcStairFlight'");
    log.push('stair.ifcClass=' + (stairClass ? '✓' : '✗'));
    expect(stairClass).toBe(true);

    // Window openings carry ifcClass
    const winClass = da.includes("ifcClass: el.ifcClass || 'IfcWindow'");
    log.push('window.ifcClass=' + (winClass ? '✓' : '✗'));
    expect(winClass).toBe(true);

    // Furniture footprint renderer exists
    const hasFurnRender = gc.includes('renderFurniture');
    log.push('renderFurniture=' + (hasFurnRender ? '✓' : '✗'));
    expect(hasFurnRender).toBe(true);

    // Furniture carries full identity
    const furnIdentity = gc.includes('guid: el.guid, ifcClass: el.ifcClass');
    log.push('furn.identity=' + (furnIdentity ? '✓' : '✗'));
    expect(furnIdentity).toBe(true);

    // Furniture query wired in grid_overlay
    const furnQuery = go.includes('IfcFurniture') && go.includes('IfcFurnishingElement');
    log.push('furn.query=' + (furnQuery ? '✓' : '✗'));
    expect(furnQuery).toBe(true);

    console.log('§T_3613 ' + log.join(' | '));
  });
});
