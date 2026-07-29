// # ⚠ DO NOT REMOVE — W-DB-CACHE-KEY
// ISSUE PROVED: the SAME building reached by two different routes was cached under two different
//   IndexedDB keys, so the ERP red-pill Zoom-Across re-downloaded 251MB of Hospital that the landing
//   had already cached. The landing builds '<prodBase>buildings/Hospital_extracted.db'
//   (index.html:489); the red pill builds '../buildings/Hospital_extracted.db'
//   (erp/idempiere.html:4716). scene.js cachedFetch keyed the blob on that raw string.
//   Spec: prompts/HISTORY_PERSIST_RECALL.md §VERIFY-FIRST ITEM 1.
// THIS TEST FAILS ON THE OLD CODE — the old key was the url itself, so K2-fold-* could never match.
// METHOD: drive the REAL pure decision db_resolve.cacheKey (require'd verbatim, no copy) across the
//   four spec rules K1–K4 + the exact url pair from the bug report. Whitebox §-log; no browser needed.
// Run: node viewer/tests/witness_db_cache_key.js   → exit 0 = GREEN. Read the §-log, not the exit code.
const path = require('path');
const { cacheKey } = require(path.join(__dirname, '..', 'db_resolve.js'));

const PROD = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/';
const BLD = PROD + 'buildings/';

const cases = [
  // K2 — every production form of the same building asset folds onto ONE key.
  { id: 'K2-redpill',  url: '../buildings/Hospital_extracted.db',        want: 'buildings/Hospital_extracted.db' },
  { id: 'K2-landing',  url: BLD + 'Hospital_extracted.db',              want: 'buildings/Hospital_extracted.db' },
  { id: 'K2-bare',     url: 'buildings/Hospital_extracted.db',          want: 'buildings/Hospital_extracted.db' },
  { id: 'K2-rooted',   url: '/bim-ootb/buildings/Hospital_extracted.db', want: 'buildings/Hospital_extracted.db' },
  { id: 'K2-ghpages',  url: 'https://red1oon.github.io/bim-ootb/buildings/Hospital_extracted.db', want: 'buildings/Hospital_extracted.db' },
  { id: 'K2-cachebust', url: '../buildings/Hospital_extracted.db?v=12', want: 'buildings/Hospital_extracted.db' },
  { id: 'K2-positions', url: '../buildings/Hospital_positions.bin',     want: 'buildings/Hospital_positions.bin' },
  // K3 — dev/authoring trees keep their FULL path. deploy/dev/buildings/Terminal_extracted.db and
  // deploy/buildings/Terminal_extracted.db are different bytes behind the same filename
  // (viewer/dlod_bench.html:29,33) — folding them would serve wrong geometry on a dev machine.
  { id: 'K3-devbench', url: '/bim-compiler/deploy/dev/buildings/Terminal_extracted.db', want: '/bim-compiler/deploy/dev/buildings/Terminal_extracted.db' },
  { id: 'K3-prodbench', url: '/bim-compiler/deploy/buildings/Terminal_extracted.db',    want: '/bim-compiler/deploy/buildings/Terminal_extracted.db' },
  { id: 'K3-modeller', url: '/modeller/Duplex_extracted.db',            want: '/modeller/Duplex_extracted.db' },
  // K1 — import:// is an IDB-only identity, never rewritten.
  { id: 'K1-import',   url: 'import://myhouse/myhouse_extracted.db',    want: 'import://myhouse/myhouse_extracted.db' },
  // K4 — anything that isn't a buildings/ asset is left exactly as it was.
  { id: 'K4-adseed',   url: '../erp/ad_seed.db',                        want: '../erp/ad_seed.db' },
  { id: 'K4-lib',      url: 'mep_rw.db',                                want: 'mep_rw.db' },
  { id: 'K4-nearmiss', url: '../buildingsX/foo.db',                     want: '../buildingsX/foo.db' }, // 'buildings' must be a path segment
];

let pass = 0, fail = 0;
for (const c of cases) {
  const got = cacheKey(c.url, PROD);
  const ok = got === c.want;
  ok ? pass++ : fail++;
  console.log(`§CACHEKEY ${ok ? 'PASS' : 'FAIL'} ${c.id}  in=${c.url}  → ${got}` +
              (ok ? '' : `  EXPECTED ${c.want}`));
}

// THE REGRESSION — this single assertion IS the reported bug. Two routes, one building, one key.
const kRedPill = cacheKey('../buildings/Hospital_extracted.db', PROD);
const kLanding = cacheKey(BLD + 'Hospital_extracted.db', PROD);
const folded = kRedPill === kLanding;
folded ? pass++ : fail++;
console.log(`§CACHEKEY ${folded ? 'PASS' : 'FAIL'} BUG-red-pill-vs-landing  redpill=${kRedPill}  landing=${kLanding}` +
            (folded ? '  → one key, no re-download' : '  → STILL TWO KEYS: the 251MB re-download is back'));

// And the guard that must NOT fold — dev vs prod bench, same filename, different bytes.
const kDev = cacheKey('/bim-compiler/deploy/dev/buildings/Terminal_extracted.db', PROD);
const kPrd = cacheKey('/bim-compiler/deploy/buildings/Terminal_extracted.db', PROD);
const kept = kDev !== kPrd;
kept ? pass++ : fail++;
console.log(`§CACHEKEY ${kept ? 'PASS' : 'FAIL'} GUARD-dev-vs-prod-bench  dev=${kDev}  prod=${kPrd}` +
            (kept ? '  → kept apart' : '  → COLLIDED: dev bench would serve prod geometry'));

console.log(`§CACHEKEY-SUMMARY ${pass}/${pass + fail} pass`);
process.exit(fail === 0 ? 0 : 1);
