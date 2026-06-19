// W-SAVE-FOLD — proves A._exportBuildingDb folds a SPLIT (meta + geo) building into one
// monolith .db that round-trips with EVERY geometry table + row preserved (no-cubes gate).
// Issue under test: a split building saved as A.db.export() alone would lose geometry.
const initSqlJs = require('/home/red1/bim-ootb/viewer/lib/sql-wasm.js');
const fs = require('fs');
const wasm = fs.readFileSync('/home/red1/bim-ootb/viewer/lib/sql-wasm.wasm');

(async () => {
  const SQL = await initSqlJs({ wasmBinary: wasm });

  // META db (what A.db is on a split building): elements/instances, NO geometry table.
  const meta = new SQL.Database();
  meta.run("CREATE TABLE elements(guid TEXT, ifc_class TEXT)");
  meta.run("INSERT INTO elements VALUES ('g1','IfcWall'),('g2','IfcSlab'),('g3','IfcBeam')");

  // GEO db (what A.libDb is on a split building): component_geometries with mesh blobs.
  const geo = new SQL.Database();
  geo.run("CREATE TABLE component_geometries(hash TEXT, vertices BLOB, normals BLOB)");
  geo.run("INSERT INTO component_geometries VALUES ('h1','vvv','nnn'),('h2','www','mmm')");
  geo.run("CREATE TABLE transforms(guid TEXT, matrix TEXT)");
  geo.run("INSERT INTO transforms VALUES ('g1','I'),('g2','I')");

  // ── Replicate A._exportBuildingDb's split→monolith fold (verbatim logic) ──
  const Database = meta.constructor;
  const mono = new Database(meta.export());
  const have = {};
  const mres = mono.exec("SELECT name FROM sqlite_master WHERE type='table'");
  if (mres[0]) mres[0].values.forEach(r => have[r[0]] = 1);
  let copied = 0, rows = 0;
  const gres = geo.exec("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  if (gres[0]) gres[0].values.forEach(r => {
    const tname = r[0], tsql = r[1];
    if (have[tname]) return;
    mono.run(tsql);
    const data = geo.exec("SELECT * FROM " + tname);
    if (data[0] && data[0].values.length) {
      const ph = data[0].columns.map(() => '?').join(',');
      const stmt = mono.prepare("INSERT INTO " + tname + " VALUES (" + ph + ")");
      data[0].values.forEach(v => { stmt.run(v); rows++; });
      stmt.free();
    }
    copied++;
  });

  // ── Re-open the exported monolith and assert EVERYTHING is present ──
  const reopened = new Database(mono.export());
  const tbls = reopened.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0].values.map(r => r[0]).sort();
  const cE = reopened.exec("SELECT COUNT(*) FROM elements")[0].values[0][0];
  const cG = reopened.exec("SELECT COUNT(*) FROM component_geometries")[0].values[0][0];
  const cT = reopened.exec("SELECT COUNT(*) FROM transforms")[0].values[0][0];

  let pass = 0, fail = 0;
  const ck = (name, cond) => { if (cond) { pass++; console.log('§W-SAVE-FOLD PASS ' + name); } else { fail++; console.log('§W-SAVE-FOLD FAIL ' + name); } };
  ck('geoTablesCopied=2', copied === 2);
  ck('rowsCopied=4', rows === 4);
  ck('monolith has all 3 tables', JSON.stringify(tbls) === JSON.stringify(['component_geometries','elements','transforms']));
  ck('elements preserved=3', cE === 3);
  ck('geometry preserved=2 (NOT lost)', cG === 2);
  ck('transforms preserved=2', cT === 2);

  console.log('§W-SAVE-FOLD ' + pass + '/' + (pass + fail) + (fail ? ' — FAIL' : ' ALL PASS'));
  process.exit(fail ? 1 : 0);
})();
