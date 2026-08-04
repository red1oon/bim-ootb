// W-SW-SQL-ROUTE: does the SW route a .sql patch network-first (fresh on deploy) while keeping the
// offline fallback? Exercises the real isNetworkFirst() from viewer/sw.js — no browser needed, the
// function is pure string routing. Names the issue it proves: an UPDATED buildings/patches/*.sql must
// reach an already-installed client (cacheFirst never could).
const fs = require('fs');
const src = fs.readFileSync((process.argv[2] || require('path').join(__dirname, '..', '..')) + '/viewer/sw.js', 'utf8');
// isNetworkFirst + its two dependencies are self-contained; evaluate them in a tiny sandbox.
const body = src.slice(src.indexOf('function isNetworkFirst'), src.indexOf('self.addEventListener(\'fetch\''));
const pre = src.match(/const PRECACHE_ASSETS = \[[\s\S]*?\];/)[0];
const cdn = src.match(/const CDN_ASSETS = \[[\s\S]*?\];/)[0];
const setLine = src.match(/const _PRECACHE_SET = [^;]+;/)[0];
const fn = new Function(pre + '\n' + cdn + '\n' + setLine + '\n' + body + '\nreturn isNetworkFirst;')();
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
const B = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/';
chk('A1 a DB patch script is network-first (an updated raster patch reaches installed clients)',
  fn(B + 'buildings/patches/Hospital_meta.db.sql') === true);
chk('A2 the _extracted twin too', fn(B + 'buildings/patches/Hospital_extracted.db.sql') === true);
chk('A3 a local-served patch path too', fn('http://localhost:8901/buildings/patches/Terminal_meta.db.sql') === true);
chk('B1 .wasm stays cache-first (immutable, no regression)', fn(B + 'viewer/lib/sql-wasm.wasm') === false);
chk('B2 lib/ stays cache-first', fn(B + 'viewer/lib/three.min.js') === false);
chk('B3 CDN asset stays cache-first', fn('https://cdn.jsdelivr.net/npm/rtree-sql.js@1.7.0/dist/sql-wasm.js') === false);
chk('C1 .js still network-first', fn(B + 'viewer/navigate_find.js') === true);
console.log('\n§W-SW-SQL-ROUTE DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
