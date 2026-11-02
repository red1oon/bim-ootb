// capex/tools/legacy_snapshot.js — Source B: read the legacy iDempiere through its stock WebServices (query_data) and write capex/legacy_snapshot.json
// (git-ignored; the browser cannot call the pilot — no CORS rule, and server config is not ours to change). Read-only.
// Env: BRIDGE_BASE (default http://localhost:8088) BRIDGE_USER BRIDGE_PASS BRIDGE_CLIENT BRIDGE_ROLE BRIDGE_ORG (defaults = the local pilot, as scripts/bridge/ad_client.js)
// Usage: node capex/tools/legacy_snapshot.js [out.json]
const fs = require('fs'), path = require('path'), A = require('../adapters.js');
const env = process.env, base = env.BRIDGE_BASE || 'http://localhost:8088';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base) && !(env.BRIDGE_USER && env.BRIDGE_PASS)) { console.error('§CFG BRIDGE_USER/BRIDGE_PASS required for a non-localhost base'); process.exit(2); }
const cfg = { base, login: { user: env.BRIDGE_USER || 'GardenAdmin', pass: env.BRIDGE_PASS || 'GardenAdmin', lang: 'en_US', ClientID: +(env.BRIDGE_CLIENT || 11), RoleID: +(env.BRIDGE_ROLE || 102), OrgID: +(env.BRIDGE_ORG || 11), WarehouseID: +(env.BRIDGE_WH || 103), stage: 0 } };
const out = process.argv[2] || path.join(__dirname, '..', 'legacy_snapshot.json');
A.loadLegacy(cfg).then(d => {
  d.meta.takenAt = new Date().toISOString();
  fs.writeFileSync(out, JSON.stringify(d));
  console.log('§DASH_LEGACY_SNAPSHOT base=' + base + ' ' + A.ENTITIES.map(e => e + '=' + d[e].length).join(' ') + ' unavailable=[' + d.unavailable.join(',') + '] -> ' + out);
}).catch(e => { console.error('§DASH_LEGACY_SNAPSHOT FAIL ' + e.message + (e.cause ? ' (' + e.cause.code + ')' : '')); process.exit(1); });
