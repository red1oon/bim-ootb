// capex/tools/legacy_snapshot.js — Source B: read the legacy iDempiere through its stock WebServices (query_data) and write capex/legacy_snapshot.json
// (git-ignored; the browser cannot call the pilot — no CORS rule, and server config is not ours to change). Read-only.
// Env: BRIDGE_BASE (default http://localhost:8088) BRIDGE_USER BRIDGE_PASS BRIDGE_CLIENT BRIDGE_ROLE BRIDGE_ORG (defaults = the local pilot, as scripts/bridge/ad_client.js)
// Usage: node capex/tools/legacy_snapshot.js [out.json]
const fs = require('fs'), path = require('path'), A = require('../adapters.js');
const env = process.env, base = env.BRIDGE_BASE || 'http://localhost:8088';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base) && !(env.BRIDGE_USER && env.BRIDGE_PASS)) { console.error('§CFG BRIDGE_USER/BRIDGE_PASS required for a non-localhost base'); process.exit(2); }
const cfg = { base, login: { user: env.BRIDGE_USER || 'GardenAdmin', pass: env.BRIDGE_PASS || 'GardenAdmin', lang: 'en_US', ClientID: +(env.BRIDGE_CLIENT || 11), RoleID: +(env.BRIDGE_ROLE || 102), OrgID: +(env.BRIDGE_ORG || 11), WarehouseID: +(env.BRIDGE_WH || 103), stage: 0 } };
const out = process.argv[2] || path.join(__dirname, '..', 'legacy_snapshot.json');
// --add <entity> <file.json> (§5.75 step 1): read ONE entity from the server and put its rows into an existing snapshot, leaving every other row of that file as it is.
//   Used to give capex/sample/pilot_snapshot.json the server's PA_MeasureCalc rows (entity pacalc), so the sample page computes from PA rows like every other source.
if (process.argv[2] === '--add') {
  const ent = process.argv[3], file = process.argv[4];
  if (!ent || !file || A.ENTITIES.indexOf(ent) < 0 || !fs.existsSync(file)) { console.error('usage: legacy_snapshot.js --add <entity> <existing snapshot.json>   entity one of ' + A.ENTITIES.join(',')); process.exit(2); }
  A.loadLegacy(cfg).then(d => {
    if ((d.unavailable || []).indexOf(ent) >= 0 || !(d[ent] || []).length) { console.error('§DASH_LEGACY_SNAPSHOT_ADD FAIL the server gave no ' + ent + ' rows (unavailable=[' + d.unavailable.join(',') + '])'); process.exit(1); }
    const snap = JSON.parse(fs.readFileSync(file, 'utf8')), before = (snap[ent] || []).length;
    snap[ent] = d[ent]; snap.unavailable = (snap.unavailable || []).filter(u => u !== ent); snap.meta = snap.meta || {}; snap.meta.added = Object.assign({}, snap.meta.added, { [ent]: new Date().toISOString() });
    fs.writeFileSync(file, JSON.stringify(snap));
    console.log('§DASH_LEGACY_SNAPSHOT_ADD base=' + base + ' entity=' + ent + ' rows ' + before + ' -> ' + d[ent].length + ' in ' + file + ' (no other entity touched)');
  }).catch(e => { console.error('§DASH_LEGACY_SNAPSHOT_ADD FAIL ' + e.message); process.exit(1); });
} else
// out = capex/site_copy.json → the twin's capex plugin mirrors it at boot (§5.26, every whitelisted column kept). The password stays in this process: the file carries the base URL and the client only.
A.loadLegacy(cfg, null, { all: /site_copy\.json$/.test(out) }).then(d => {
  d.meta.takenAt = new Date().toISOString();
  fs.writeFileSync(out, JSON.stringify(d));
  console.log('§DASH_LEGACY_SNAPSHOT base=' + base + ' ' + A.ENTITIES.map(e => e + '=' + d[e].length).join(' ') + ' unavailable=[' + d.unavailable.join(',') + '] -> ' + out);
}).catch(e => { console.error('§DASH_LEGACY_SNAPSHOT FAIL ' + e.message + (e.cause ? ' (' + e.cause.code + ')' : '')); process.exit(1); });
