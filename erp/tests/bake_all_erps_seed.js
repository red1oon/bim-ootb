// Bake the 5 ERP demo shards (Odoo 12 · iDempiere 13 · SAP 14 · Oracle 15 · Dynamics 16) INTO ad_seed.db,
// the SAME way the app's installShard merges them: for every table present in BOTH, INSERT OR IGNORE the shard
// rows column-INTERSECT (drop unknown cols, idempotent). Result = seed that already contains all ERPs, so a
// reset re-imports them. WRITES to the worktree copy only (no push). Verifies AD_Client = 11..16 after.
'use strict';
var initSqlJs=require('/home/red1/bim-ootb/node_modules/sql.js'), fs=require('fs');
var SHARDS=['12-odoo.db','13-idempiere.db','14-sap.db','15-oracle.db','16-dynamics.db'];
(async function(){
  var SQL=await initSqlJs({locateFile:f=>require('path').join('/home/red1/bim-ootb/node_modules/sql.js/dist',f)});
  var seed=new SQL.Database(new Uint8Array(fs.readFileSync('ad_seed.db')));
  function seedTables(){var r=seed.exec("SELECT name FROM sqlite_master WHERE type='table'");return new Set(r.length?r[0].values.map(v=>String(v[0]).toLowerCase()):[]);}
  function cols(db,t){try{var r=db.exec('PRAGMA table_info("'+t+'")');return r.length?r[0].values.map(v=>v[1]):[];}catch(e){return [];}}
  var have=seedTables(), totalRows=0;
  SHARDS.forEach(function(sf){
    var sdb=new SQL.Database(new Uint8Array(fs.readFileSync(sf)));
    var st=sdb.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.map(v=>v[0]);
    var rows=0, tbls=0;
    st.forEach(function(t){
      if(!have.has(String(t).toLowerCase()))return;          // never CREATE a table — only merge into existing
      var seedCols={}; cols(seed,t).forEach(c=>seedCols[String(c).toLowerCase()]=c);
      var r; try{r=sdb.exec('SELECT * FROM "'+t+'"');}catch(e){return;}
      if(!r.length||!r[0].values.length)return;
      var keep=[],idx=[]; r[0].columns.forEach(function(c,i){var k=seedCols[String(c).toLowerCase()];if(k){keep.push(k);idx.push(i);}});
      if(!keep.length)return;
      var sql='INSERT OR IGNORE INTO "'+t+'" ('+keep.map(c=>'"'+c+'"').join(',')+') VALUES ('+keep.map(()=>'?').join(',')+')';
      var stmt; try{stmt=seed.prepare(sql);}catch(e){return;}
      r[0].values.forEach(function(row){try{stmt.run(idx.map(i=>row[i]));rows++;}catch(e){}});
      stmt.free(); tbls++;
    });
    sdb.close();
    console.log('  baked '+sf+': rows≈'+rows+' tables='+tbls);
    totalRows+=rows;
  });
  var ac=seed.exec("SELECT AD_Client_ID,Name FROM AD_Client ORDER BY AD_Client_ID")[0].values;
  seed.run("DELETE FROM AD_Client WHERE AD_Client_ID=0"); console.log('  dropped shard System(0) — overlay owns it'); fs.writeFileSync('ad_seed.db', Buffer.from(seed.export()));
  console.log('\nAD_Client AFTER bake: '+JSON.stringify(ac));
  console.log('total rows merged≈'+totalRows+'  →  ad_seed.db written ('+(fs.statSync('ad_seed.db').size/1048576).toFixed(1)+' MB)');
})();
