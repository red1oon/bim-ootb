#!/usr/bin/env node
// §VERT_WELD offline tool: writes a welded COPY of a DB (never touches the input). Same weld as save/import (viewer/vertex_weld.js).
// Usage: node --max-old-space-size=12000 scripts/weld_db.js <in.db> <out.db>   — then run viewer/tests/witness_vertex_weld_parity.js before shipping it.
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb/node_modules/sql.js/dist/sql-asm.js'));
const VW = require('../viewer/vertex_weld.js');
(async () => { const SQL = await initSqlJs(), db = new SQL.Database(fs.readFileSync(process.argv[2]));
  const hasN = db.exec("SELECT COUNT(*) FROM pragma_table_info('component_geometries') WHERE name='normals'")[0].values[0][0];
  if (hasN && db.exec('SELECT COUNT(*) FROM component_geometries WHERE normals IS NOT NULL')[0].values[0][0]) { console.log('§VERT_WELD_TOOL REFUSED: stored normals present (drop them first — civil save path does)'); process.exit(2); }
  const W = VW.weldDb(db); console.log('§VERT_WELD_TOOL ' + JSON.stringify(W) + (W.changed ? '' : ' INCONCLUSIVE(nothing welded)'));
  db.run('VACUUM'); fs.writeFileSync(process.argv[3], db.export()); console.log('integrity ' + db.exec('PRAGMA integrity_check')[0].values[0][0] + ' bytes ' + fs.statSync(process.argv[2]).size + ' -> ' + fs.statSync(process.argv[3]).size);
})();
