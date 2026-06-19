// W-SEED-RESET — the surgical "Reset demo / seed ERPs" transform (SYSTEM_ADMIN_LANE §6, user 2026-06-19).
//   Proves SystemMonitor._rebuildSeed restores the SHIPPED seed/demo clients to pristine WITHOUT touching the
//   tenants the user created. Issue under test: a blunt full-wipe also nukes born tenants; the surgical reset must
//   (a) drop dirty edits + demo-band installs (AD_Client_ID < 17), (b) KEEP born/resident tenants (>= 17) and all
//   their data, (c) be column-INTERSECT (drops unknown cols) + idempotent (INSERT OR IGNORE). §-log first.
// Run: node tests/poc_seed_reset.js
'use strict';
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SM = require('../system_monitor.js');

var FLOOR = 17;                                  // born/resident tenants start here (genesis nextClientId floor)
var TABLES = ['AD_Client', 'C_Order', 'AD_User'];
var pass = 0, fail = 0;
function ok(name, cond, got) { (cond ? pass++ : fail++); console.log('§SEED-RESET ' + (cond ? 'PASS' : 'FAIL') + ' ' + name + (got !== undefined ? ' got=' + got : '')); }
function n(db, sql) { var r = db.exec(sql); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }

(async function () {
  var SQL = await initSqlJs({ locateFile: function (f) { return require('path').join('/home/red1/bim-ootb/node_modules/sql.js/dist', f); } });

  // ── pristine shipped seed: System(0) + GardenWorld(11) with one CLEAN GardenWorld order ──
  function buildPristine() {
    var db = new SQL.Database();
    db.run('CREATE TABLE AD_Client (AD_Client_ID INTEGER PRIMARY KEY, Name TEXT NOT NULL)');
    db.run('CREATE TABLE C_Order  (C_Order_ID INTEGER PRIMARY KEY, AD_Client_ID INTEGER NOT NULL, DocStatus TEXT, GrandTotal REAL)');
    db.run('CREATE TABLE AD_User  (AD_User_ID INTEGER PRIMARY KEY, AD_Client_ID INTEGER NOT NULL, Name TEXT NOT NULL)');
    db.run("INSERT INTO AD_Client VALUES (0,'System'),(11,'GardenWorld')");
    db.run("INSERT INTO C_Order  VALUES (1,11,'CO',100)");                 // GardenWorld's clean, completed order
    db.run("INSERT INTO AD_User  VALUES (50,0,'SuperUser'),(51,11,'GardenAdmin')");
    return db;
  }

  // ── live (dirty) db = pristine + user activity: a GW draft, a demo-band install (14), a born tenant (17) ──
  var live = buildPristine();
  live.run("UPDATE AD_Client SET Name='GardenWorld-DIRTY' WHERE AD_Client_ID=11");  // dirty edit on a seed client
  live.run("INSERT INTO C_Order VALUES (2,11,'DR',0)");                              // dirty GardenWorld DRAFT
  live.run("INSERT INTO AD_Client VALUES (14,'SAP')");                              // demo-band install (12-16)
  live.run("INSERT INTO C_Order VALUES (3,14,'CO',500)");                           // demo data
  live.run("ALTER TABLE C_Order ADD COLUMN Memo TEXT");                             // a col ABSENT in pristine seed
  live.run("INSERT INTO AD_Client VALUES (17,'AcmeCo')");                           // born/resident tenant (>= floor)
  live.run("INSERT INTO AD_User  VALUES (1700017,17,'jdoe')");                      // its user
  live.run("INSERT INTO C_Order  (C_Order_ID,AD_Client_ID,DocStatus,GrandTotal,Memo) VALUES (1700001,17,'CO',999,'born-note')"); // its invoice/data

  // ── re-fetch pristine (simulated) + rebuild with the resident (>= floor) snapshot ──
  var fresh = buildPristine();
  var c = SM._rebuildSeed(live, fresh, TABLES, FLOOR);
  console.log('§SEED-RESET counts snapTbls=' + c.snapTbls + ' snapRows=' + c.snapRows + ' reinsTbls=' + c.reinsTbls + ' reins=' + c.reins);

  // ── assertions on the rebuilt seed ──
  ok('system-kept',        n(fresh, "SELECT Name FROM AD_Client WHERE AD_Client_ID=0") === 'System');
  ok('gardenworld-kept',   n(fresh, "SELECT COUNT(*) FROM AD_Client WHERE AD_Client_ID=11") === 1);
  ok('gardenworld-pristine', n(fresh, "SELECT Name FROM AD_Client WHERE AD_Client_ID=11") === 'GardenWorld', n(fresh, "SELECT Name FROM AD_Client WHERE AD_Client_ID=11"));   // dirty edit GONE
  ok('gw-draft-gone',      n(fresh, "SELECT COUNT(*) FROM C_Order WHERE AD_Client_ID=11") === 1, n(fresh, "SELECT COUNT(*) FROM C_Order WHERE AD_Client_ID=11"));               // only the pristine order
  ok('demo-client-gone',   n(fresh, "SELECT COUNT(*) FROM AD_Client WHERE AD_Client_ID=14") === 0);
  ok('demo-data-gone',     n(fresh, "SELECT COUNT(*) FROM C_Order WHERE AD_Client_ID=14") === 0);
  ok('born-tenant-kept',   n(fresh, "SELECT Name FROM AD_Client WHERE AD_Client_ID=17") === 'AcmeCo');
  ok('born-user-kept',     n(fresh, "SELECT COUNT(*) FROM AD_User WHERE AD_Client_ID=17") === 1);
  ok('born-data-intact',   n(fresh, "SELECT GrandTotal FROM C_Order WHERE C_Order_ID=1700001") === 999, n(fresh, "SELECT GrandTotal FROM C_Order WHERE C_Order_ID=1700001"));
  // col-intersect: pristine C_Order has no Memo column; the born row still landed (extra col dropped, not errored)
  var freshHasMemo = fresh.exec("PRAGMA table_info(C_Order)")[0].values.some(function (r) { return String(r[1]).toLowerCase() === 'memo'; });
  ok('col-intersect-dropped-memo', freshHasMemo === false && n(fresh, "SELECT COUNT(*) FROM C_Order WHERE C_Order_ID=1700001") === 1);
  ok('snapshot-floor-rows', c.snapRows === 3, c.snapRows);   // exactly the 3 client-17 rows (client+user+order)
  ok('reinsert-all',        c.reins === 3, c.reins);

  // ── idempotency: a SECOND rebuild over the same fresh adds nothing (INSERT OR IGNORE) ──
  var before = n(fresh, "SELECT COUNT(*) FROM C_Order");
  SM._rebuildSeed(live, fresh, TABLES, FLOOR);
  ok('idempotent-rerun', n(fresh, "SELECT COUNT(*) FROM C_Order") === before, n(fresh, "SELECT COUNT(*) FROM C_Order"));

  console.log('§SEED-RESET TOTAL pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
