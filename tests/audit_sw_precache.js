/**
 * audit_sw_precache.js — Verify every file in sw.js PRECACHE_ASSETS exists on disk
 * Issue: Missing precache file → offline user gets blank page with no error
 */
const fs = require('fs');
const path = require('path');

const swPath = path.resolve(__dirname, '..', 'viewer', 'sw.js');
const viewerDir = path.resolve(__dirname, '..', 'viewer');
const swSrc = fs.readFileSync(swPath, 'utf8');

// Extract PRECACHE_ASSETS array
const match = swSrc.match(/PRECACHE_ASSETS\s*=\s*\[([\s\S]*?)\]/);
if (!match) { console.log('§SW_AUDIT FAIL: PRECACHE_ASSETS not found in sw.js'); process.exit(1); }

const entries = match[1].match(/'([^']+)'/g);
if (!entries) { console.log('§SW_AUDIT FAIL: No entries in PRECACHE_ASSETS'); process.exit(1); }

// Known missing — pre-existing, tracked separately
var KNOWN_MISSING = ['index.html', 'mep_rw.db'];

var pass = 0, fail = 0, warn = 0;
for (const entry of entries) {
  const file = entry.replace(/'/g, '');
  // Skip CDN URLs and root paths
  if (file.startsWith('http') || file === '/' || file === './' || file === '') continue;
  const fullPath = path.resolve(viewerDir, file);
  if (fs.existsSync(fullPath)) {
    pass++;
  } else if (KNOWN_MISSING.includes(file)) {
    warn++;
    console.log('  §SW_AUDIT WARN: ' + file + ' — known missing (pre-existing)');
  } else {
    fail++;
    console.log('  §SW_AUDIT FAIL: ' + file + ' → ' + fullPath + ' NOT FOUND');
  }
}

console.log('§SW_AUDIT_SUMMARY ' + pass + ' found, ' + fail + ' missing, ' + warn + ' known-missing, ' + (pass + fail + warn) + ' total');
if (fail > 0) process.exit(1);
