// author_5d_cost_witness.js — W-AUTHOR-5D-COST (FUSED_4D5D_WEDGE_LANE §AUTHOR-1 step ④)
//
// ISSUE PROVED: the wizard's 5D cost step is a FOLD, not hand-entry — phase cost = Σ of its
// assigned elements' 5D cost (quantity × rate), so reassigning an element MOVES its cost between
// phases (total invariant). NON-INVENT: the cost uses the shipped 5D model (compute5D quantity
// expressions + rates.js RATES/RATES_DEFAULT). The fold (foldCost) is cross-checked against an
// INDEPENDENT per-element sum computed in this witness — they must be identical.
//
// Real SampleHouse_extracted.db. Whitebox §-log proof only.

var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var ROOT = path.resolve(__dirname, '..', '..');
var VIEWER = path.join(ROOT, 'viewer');
var SH_DB = '/home/red1/bim-compiler/deploy/buildings/SampleHouse_extracted.db';
var SA = require(path.join(VIEWER, 'schedule_author.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-5D PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-5D FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function read(f) { return fs.readFileSync(path.join(VIEWER, f), 'utf8'); }

// Extract verbatim rate pack from rates.js (RATES + RATES_DEFAULT + SEQUENCE_RULES/DEFAULT).
function loadRates() {
  var t = read('rates.js');
  function block(startMarker, endAfter) {
    var s = t.indexOf(startMarker);
    var e = t.indexOf('};', s) + 2;
    return t.slice(s, e);
  }
  var src = block('var RATES = {') + '\n' + block('var RATES_DEFAULT') + '\n' +
    block('var SEQUENCE_RULES = {') + '\n' + block('var SEQUENCE_DEFAULT');
  // eslint-disable-next-line no-new-func
  return (new Function(src + '\n return {RATES:RATES, RATES_DEFAULT:RATES_DEFAULT, SEQUENCE_RULES:SEQUENCE_RULES, SEQUENCE_DEFAULT:SEQUENCE_DEFAULT};'))();
}

// Independent per-element 5D cost (mirrors compute5D/apply5DRates — NOT calling foldCost).
function dominantArea(x, y, z) {
  var lng = Math.max(x, y, z);
  var second = (x >= y && x >= z) ? Math.max(y, z) : (y >= x && y >= z) ? Math.max(x, z) : Math.max(x, y);
  return lng * second;
}
function elemCost(RATES, RD, cls, x, y, z) {
  var rt = RATES[cls] || RD;
  var unit = rt.unit || 'EA';
  var qty = unit === 'M' ? Math.max(x, y, z) : unit === 'M2' ? dominantArea(x, y, z) : unit === 'M3' ? (x * y * z) : 1;
  return Math.round((rt.rate || 0) * qty);
}

(async function () {
  var R = loadRates();
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(SH_DB)));

  var mat = SA.materializeDefault(db, R.SEQUENCE_RULES, { start: '2026-01-01', phaseDays: 30 });
  check('materialized', mat.phases.length >= 2, 'phases=' + mat.phases.length);

  // ── fold the cost ─────────────────────────────────────────────────────────────
  var cost = SA.foldCost(db, 'SCH_AUTHORED', R.RATES, R.RATES_DEFAULT, 'RM');
  check('total-positive', cost.total > 0, 'total=' + cost.total);
  check('phases-eq-leaves', cost.phases.length === mat.phases.length,
    'costPhases=' + cost.phases.length + ' leaves=' + mat.phases.length);
  var sumPhases = cost.phases.reduce(function (a, p) { return a + p.cost; }, 0);
  check('total-eq-sum-of-phases', sumPhases === cost.total, 'Σphases=' + sumPhases + ' total=' + cost.total);

  // ── independent cross-check: per-element sum computed here == fold ─────────────
  var allRows = db.exec(
    "SELECT m.ifc_class, t.bbox_x, t.bbox_y, t.bbox_z FROM task_elements te " +
    "JOIN tasks tk ON tk.task_id=te.task_id AND tk.schedule_id='SCH_AUTHORED' AND (tk.is_summary IS NULL OR tk.is_summary=0) " +
    "JOIN elements_meta m ON m.guid=te.guid JOIN element_transforms t ON t.guid=te.guid " +
    "WHERE t.bbox_x IS NOT NULL AND t.bbox_x>0")[0].values;
  var indep = allRows.reduce(function (a, r) { return a + elemCost(R.RATES, R.RATES_DEFAULT, r[0], r[1], r[2], r[3]); }, 0);
  check('fold-eq-independent', indep === cost.total, 'independent=' + indep + ' fold=' + cost.total);

  // honesty: unmapped classes (e.g. IfcFurniture is not a RATES key) are surfaced, not hidden.
  check('unmapped-surfaced', Array.isArray(cost.unmappedClasses), 'unmapped=[' + cost.unmappedClasses.join(',') + ']');

  // ── reassign moves cost A→B, total invariant ──────────────────────────────────
  // Pick a mapped, bbox'd IfcWall (rate 145/M2 → non-zero) currently in Architecture.
  var wall = db.exec("SELECT m.guid, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m " +
    "JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class='IfcWall' AND t.bbox_x>0 LIMIT 1");
  if (!wall.length || !wall[0].values.length) { check('wall-found', false, 'no bbox IfcWall'); }
  else {
    var wg = wall[0].values[0][0];
    var ec = elemCost(R.RATES, R.RATES_DEFAULT, 'IfcWall', wall[0].values[0][1], wall[0].values[0][2], wall[0].values[0][3]);
    var srcTask = db.exec("SELECT task_id FROM task_elements WHERE guid='" + wg + "'")[0].values[0][0];
    var dstTask = 'TASK_Superstructure';
    check('wall-mapped-cost', ec > 0 && srcTask !== dstTask, 'IfcWall cost=' + ec + ' src=' + srcTask);

    function costOf(c, tid) { var p = c.phases.filter(function (x) { return x.taskId === tid; })[0]; return p ? p.cost : 0; }
    var srcBefore = costOf(cost, srcTask), dstBefore = costOf(cost, dstTask);

    SA.assignElement(db, wg, dstTask);
    var cost2 = SA.foldCost(db, 'SCH_AUTHORED', R.RATES, R.RATES_DEFAULT, 'RM');
    check('total-invariant', cost2.total === cost.total, 'before=' + cost.total + ' after=' + cost2.total);
    check('src-decreased-by-elem', costOf(cost2, srcTask) === srcBefore - ec,
      'src ' + srcBefore + '→' + costOf(cost2, srcTask) + ' (−' + ec + ')');
    check('dst-increased-by-elem', costOf(cost2, dstTask) === dstBefore + ec,
      'dst ' + dstBefore + '→' + costOf(cost2, dstTask) + ' (+' + ec + ')');
  }

  console.log('§W-AUTHOR-5D-COST RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('§W-5D ERROR', e); process.exit(2); });
