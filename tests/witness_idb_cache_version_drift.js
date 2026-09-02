// WITNESS: F2 (prompts/SEAM_IDENTITY_AUDIT.md) — "four modules still open the shared cache DB at
// hardcoded version 1 (canonical is 2)". Proves the exact failure mechanism numerically (no browser,
// no screenshot): once the shared bim_ootb_cache IndexedDB is at v2 (scene.js's canonical opener,
// which is how it looks in any real profile after the Viewer has been opened once), a hardcoded
// open(name, 1) throws VersionError forever — this is what made boq_charts.html's 4D/5D charts
// always miss the offline cache (full network re-download every open) and erp/kernel_ops.js's
// _idbPersist silently drop every ERP edit (never survives a refresh).
//
// Issue proved: OLD code (open(name, 1) after DB is at v2) → VersionError → cacheDb resolves null.
// Issue disproved for the fix: NEW code (open(name) — no version) → succeeds, reads back what v2 wrote.
require('fake-indexeddb/auto');

function log(s) { console.log(s); }

async function openAtVersion(name, version) {
  return new Promise((resolve) => {
    const req = version == null ? indexedDB.open(name) : indexedDB.open(name, version);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('dbs')) req.result.createObjectStore('dbs');
    };
    req.onsuccess = () => resolve({ ok: true, db: req.result });
    req.onerror = () => resolve({ ok: false, err: req.error && req.error.name });
  });
}

(async () => {
  const DB = 'bim_ootb_cache_witness';

  // Step 1: simulate scene.js's canonical opener — bumps the shared DB to v2, writes a value.
  const v2 = await openAtVersion(DB, 2);
  log('§W1 scene.js-style open(name,2): ok=' + v2.ok + ' version=' + v2.db.version);
  await new Promise((resolve) => {
    const tx = v2.db.transaction('dbs', 'readwrite');
    tx.objectStore('dbs').put(new ArrayBuffer(8), 'buildings/Hospital_extracted.db');
    tx.oncomplete = resolve;
  });
  v2.db.close();

  // Step 2: OLD boq_charts.html / erp/kernel_ops.js behaviour — hardcoded open(name, 1).
  const oldOpen = await openAtVersion(DB, 1);
  const oldBroken = oldOpen.ok === false && oldOpen.err === 'VersionError';
  log('§W2 OLD hardcoded open(name,1): ok=' + oldOpen.ok + ' err=' + oldOpen.err +
      '  → matches-reported-bug=' + oldBroken);

  // Step 3: NEW fixed behaviour — open(name) with no version, as applied in this commit.
  const newOpen = await openAtVersion(DB, null);
  let readBack = null;
  if (newOpen.ok) {
    readBack = await new Promise((resolve) => {
      const tx = newOpen.db.transaction('dbs', 'readonly');
      const req = tx.objectStore('dbs').get('buildings/Hospital_extracted.db');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }
  log('§W3 NEW versionless open(name): ok=' + newOpen.ok +
      ' readBackCachedEntry=' + (readBack !== null) +
      '  → offline-cache-hit-restored=' + (newOpen.ok && readBack !== null));

  const pass = oldBroken && newOpen.ok && readBack !== null;
  log('§WITNESS_RESULT F2_idb_version_drift ' + (pass ? 'PASS' : 'FAIL'));
  process.exit(pass ? 0 : 1);
})();
