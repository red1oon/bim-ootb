// # ⚠ DO NOT REMOVE — W-DB-404-OCI-RETRY
// ISSUE PROVED: a stale/relative building-db url (e.g. '../buildings/Ifc2x3_SampleCastle_extracted.db',
//   the resumed pwa_last_db that 404'd and bricked the viewer boot) is rewritten to the OCI prod base
//   and is therefore retryable — instead of dead-ending at §INIT_ERROR.
// METHOD: drive the REAL pure decision db_resolve.ociRetryUrl (require'd verbatim, no copy) across the
//   six spec rules R1–R6 + the exact failing url from the bug report. Whitebox §-log; no browser needed.
// Run: node viewer/tests/witness_db_404_oci_retry.js   → exit 0 = GREEN. Read the §-log, not the exit code.
const path = require('path');
const { ociRetryUrl } = require(path.join(__dirname, '..', 'db_resolve.js'));

const PROD = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/';
const BLD = PROD + 'buildings/';

const cases = [
  // R5 — the actual bug: relative ../buildings db + its sibling positions.bin both heal.
  { id: 'R5-bug-db',   url: '../buildings/Ifc2x3_SampleCastle_extracted.db', prod: PROD, want: BLD + 'Ifc2x3_SampleCastle_extracted.db' },
  { id: 'R5-bug-pos',  url: '../buildings/Ifc2x3_SampleCastle_positions.bin', prod: PROD, want: BLD + 'Ifc2x3_SampleCastle_positions.bin' },
  { id: 'R5-bare',     url: 'buildings/Duplex_extracted.db',                 prod: PROD, want: BLD + 'Duplex_extracted.db' },
  { id: 'R5-rooted',   url: '/bim-ootb/buildings/Clinic_meta.db',            prod: PROD, want: BLD + 'Clinic_meta.db' },
  // R6 — stale ABSOLUTE GH-Pages building link heals to OCI too.
  { id: 'R6-ghpages',  url: 'https://red1oon.github.io/bim-ootb/buildings/SampleCastle_extracted.db', prod: PROD, want: BLD + 'SampleCastle_extracted.db' },
  // R1 — no prod base → null (nothing to retry against).
  { id: 'R1-noprod',   url: '../buildings/Duplex_extracted.db',              prod: '',   want: null },
  // R2 — already on OCI / prod base → null (no loop).
  { id: 'R2-onoci',    url: BLD + 'Duplex_extracted.db',                     prod: PROD, want: null },
  { id: 'R2-objstor',  url: 'https://objectstorage.x.oraclecloud.com/n/a/b/c/o/buildings/X.db', prod: PROD, want: null },
  // R3 — import:// is IDB-only, never networked → null.
  { id: 'R3-import',   url: 'import://myhouse/myhouse_extracted.db',         prod: PROD, want: null },
  // R4 — not a buildings/ asset → leave it alone.
  { id: 'R4-lib',      url: 'mep_rw.db',                                     prod: PROD, want: null },
  { id: 'R4-asset',    url: '../viewer/scene.js',                            prod: PROD, want: null },
  { id: 'R4-citydir',  url: '../buildingsX/foo.db',                          prod: PROD, want: null }, // 'buildings' must be a path segment
];

let pass = 0, fail = 0;
for (const c of cases) {
  const got = ociRetryUrl(c.url, c.prod);
  const ok = got === c.want;
  ok ? pass++ : fail++;
  console.log(`§DB404 ${ok ? 'PASS' : 'FAIL'} ${c.id}  in=${c.url}  → ${got === null ? 'null' : got}` +
              (ok ? '' : `  EXPECTED ${c.want === null ? 'null' : c.want}`));
}
console.log(`§DB404-SUMMARY ${pass}/${pass + fail} pass`);
process.exit(fail === 0 ? 0 : 1);
