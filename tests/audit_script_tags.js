/**
 * audit_script_tags.js — Verify every <script src="..."> in viewer.html has a matching file
 * Issue: Typo in script tag → silent 404 → feature silently missing
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.resolve(__dirname, '..', 'viewer', 'viewer.html');
const viewerDir = path.resolve(__dirname, '..', 'viewer');
const htmlSrc = fs.readFileSync(htmlPath, 'utf8');

// Extract all <script src="..."> — strip ?v=N query params
const scriptTags = htmlSrc.match(/src="([^"]+\.js[^"]*)"/g) || [];

var pass = 0, fail = 0;
for (const tag of scriptTags) {
  const src = tag.match(/src="([^"]+)"/)[1];
  // Strip query params
  const file = src.split('?')[0];
  // Skip CDN URLs
  if (file.startsWith('http') || file.startsWith('//')) continue;
  // Skip lib/ subdirectory (third-party, may be loaded dynamically)
  if (file.startsWith('lib/')) continue;
  const fullPath = path.resolve(viewerDir, file);
  if (fs.existsSync(fullPath)) {
    pass++;
  } else {
    fail++;
    console.log('  §SCRIPT_AUDIT FAIL: <script src="' + src + '"> → ' + fullPath + ' NOT FOUND');
  }
}

console.log('§SCRIPT_AUDIT_SUMMARY ' + pass + ' found, ' + fail + ' missing, ' + (pass + fail) + ' total');
if (fail > 0) process.exit(1);
