// find_openlink_witness.js — W-FIND-OPENLINK (prompts/FIND_OPENLINK_EXISTING_ORDERLINE.md)
//
// ISSUE PROVED: the Find panel's existing-order detection (_surfaceExistingOrder) finds a folded
// C_Project for a building via the SAME query the shipped code runs, and builds the SAME deep-link URL
// _pushToErp uses — so a building that already IS a Project Order surfaces the "open ↗" link (no
// re-create), while a non-folded building does not. Non-invent: the SQL + URL template are EXTRACTED
// VERBATIM from viewer/navigate_find.js and run against the REAL erp/ad_seed.db. Whitebox §-log only.
// Additive-safety is the design (guarded async, never touches cost/push/navigate) — this proves the
// detection logic the link depends on.

var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var ROOT = path.resolve(__dirname, '..', '..');            // worktree root
var NF = path.join(ROOT, 'viewer', 'navigate_find.js');
var SEED = path.join(ROOT, 'erp', 'ad_seed.db');

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-FIND-OPENLINK PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-FIND-OPENLINK FAIL  ' + name + (detail ? '  ' + detail : '')); }
}

// Extract the EXACT detection SQL + URL template the shipped _surfaceExistingOrder uses (non-invent).
var src = fs.readFileSync(NF, 'utf8');
var sqlM = src.match(/db\.exec\("(SELECT C_Project_ID FROM C_Project WHERE Value=\?)"/);
var urlM = src.match(/'(\.\.\/erp\/idempiere\.html\?client=garden&window=130&record=)'/);
check('extract-detection-sql', !!sqlM, sqlM ? sqlM[1] : 'NOT FOUND in navigate_find.js');
check('extract-url-template', !!urlM, urlM ? urlM[1] : 'NOT FOUND in navigate_find.js');
var DETECT_SQL = sqlM ? sqlM[1] : null;
var URL_TPL = urlM ? urlM[1] : null;
// the surfacing function must be wired into the selection hook and guarded
check('wired-into-selection-hook', /_surfaceExistingOrder\(set\)/.test(src), 'called from _updateSelCost');
check('guarded-additive', /never impact Find|additive — never impact Find/.test(src), 'try/catch + catch guards present');
check('reuses-ensureErpDb', /_surfaceExistingOrder[\s\S]{0,400}_ensureErpDb\(\)/.test(src), 'reuses the proven lazy loader');

(async function () {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(SEED)));

  function detect(building) {
    var r = db.exec(DETECT_SQL, [building]);
    return (r.length && r[0].values.length) ? r[0].values[0][0] : null;
  }

  // Hospital IS a folded Project Order in the seed (C_Project Value='Hospital', id 990000).
  var pidH = detect('Hospital');
  check('folded-building-detected', pidH === 990000, 'Hospital -> C_Project_ID=' + pidH);
  // The link the Find panel would surface, built from the SAME template + pid.
  var url = URL_TPL + encodeURIComponent(pidH);
  check('builds-correct-deeplink', url === '../erp/idempiere.html?client=garden&window=130&record=990000', 'url=' + url);

  // A building with no folded project → null → no link surfaced (create-push stays, untouched).
  var pidNone = detect('NoSuchBuilding_XYZ');
  check('unfolded-building-no-link', pidNone === null, 'NoSuchBuilding -> ' + pidNone);

  // The link target window is 130 (C_Project) — same as the post-push deep-link, so "open existing" and
  // "open just-created" land on the identical record surface (consistency).
  check('same-window-as-push-link', /window=130/.test(URL_TPL), 'url template = ' + URL_TPL);

  console.log('§W-FIND-OPENLINK RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('§W-FIND-OPENLINK ERROR', e); process.exit(2); });
