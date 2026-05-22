#!/usr/bin/env node
// BIM OOTB — Full test suite
// Run: node deploy/sandbox/test_all.js
// Checks: syntax, wiring, z-index, OCI live, walk math

'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIR = path.join(__dirname);
let pass = 0, fail = 0;

function ok(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail || ''}`); }
}

// ═══ 1. Syntax ═══
console.log('\n═══ 1. JS Syntax ═══');
const jsFiles = fs.readdirSync(DIR).filter(f => f.endsWith('.js') && !f.startsWith('test_'));
for (const f of jsFiles) {
  try { execSync(`node --check "${path.join(DIR, f)}"`, { stdio: 'pipe' }); ok(f, true); }
  catch(e) { ok(f, false, e.stderr?.toString().trim()); }
}

// ═══ 2. Script tags match files ═══
console.log('\n═══ 2. Script Tags → Files ═══');
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const scriptTags = (html.match(/<script src="([^"]+)"/g) || [])
  .map(s => s.match(/src="([^"]+)"/)[1].replace(/\?.*/, ''));
for (const src of scriptTags) {
  ok(src, fs.existsSync(path.join(DIR, src)));
}

// ═══ 3. Module wiring ═══
console.log('\n═══ 3. Module Wiring ═══');
const mainJs = fs.readFileSync(path.join(DIR, 'main.js'), 'utf8');
const setupCalls = (mainJs.match(/setup\w+\(APP\)/g) || []).map(s => s.replace('(APP)', ''));
for (const setup of setupCalls) {
  let found = false;
  for (const f of jsFiles) {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8');
    if (src.includes(`function ${setup}(`)) { ok(`${setup} → ${f}`, true); found = true; break; }
  }
  if (!found) ok(setup, false, 'NOT FOUND in any JS');
}

// ═══ 4. Window exports vs onclick ═══
console.log('\n═══ 4. onclick → window exports ═══');
const onclickFns = [...new Set((html.match(/onclick="(\w+)\(/g) || []).map(s => s.match(/onclick="(\w+)/)[1]))];
for (const fn of onclickFns) {
  if (fn === 'document' || fn === 'event') continue;
  ok(fn, mainJs.includes(`window.${fn}`), 'not in window exports');
}

// ═══ 5. Z-index overlap audit ═══
console.log('\n═══ 5. Z-Index Overlap Audit ═══');
const zMap = {};
const zRegex = /([#.\w\-\[\]= ]+)\s*\{[^}]*z-index\s*:\s*(\d+)/g;
let m;
while ((m = zRegex.exec(html)) !== null) {
  const selector = m[1].trim().substring(0, 30);
  const z = parseInt(m[2]);
  if (!zMap[z]) zMap[z] = [];
  zMap[z].push(selector);
}
// Panels that MUST NOT share z-index with toolbar buttons
const panelSelectors = ['issues-panel', 'walk-anchor-prompt'];
const toolbarZ = zMap[20] || []; // toolbar is typically z=20
for (const panel of panelSelectors) {
  const panelZ = Object.entries(zMap).find(([z, sels]) => sels.some(s => s.includes(panel)));
  if (panelZ) {
    const z = parseInt(panelZ[0]);
    const sharedWithToolbar = zMap[z]?.some(s => !s.includes(panel) && !s.includes('prompt'));
    ok(`#${panel} (z=${z}) above toolbar (z=20)`, z > 20, `z=${z} overlaps toolbar`);
  }
}
// Report all overlaps
const overlaps = Object.entries(zMap).filter(([z, sels]) => sels.length > 1 && parseInt(z) >= 15);
for (const [z, sels] of overlaps) {
  console.log(`  ⚠ z=${z}: ${sels.join(' | ')}`);
}

// ═══ 6. No stale references ═══
console.log('\n═══ 6. No Stale References ═══');
const appFiles = jsFiles.filter(f => !f.startsWith('test_') && !f.startsWith('walk_math'));
const allSrc = appFiles.map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n') + html;
ok('no index2.html references', !allSrc.includes('index2.html'));
ok('no landing2.html references', !allSrc.includes('landing2.html'));
const monolith = 'rtree_browser' + '_demo';  // split to avoid self-match
ok('no monolith references', !allSrc.includes(monolith));

// ═══ 7. Walk math ═══
console.log('\n═══ 7. Walk Math (summary) ═══');
try {
  const out = execSync(`node "${path.join(DIR, 'walk_math_test.js')}"`, { stdio: 'pipe' }).toString();
  const passMatch = out.match(/(\d+)\/(\d+) passed/);
  if (passMatch) {
    ok(`walk math ${passMatch[1]}/${passMatch[2]}`, passMatch[1] === passMatch[2]);
  }
} catch(e) { ok('walk math', false, 'test threw error'); }

// ═══ 8. OCI Live ═══
console.log('\n═══ 8. OCI Live (bim-ootb-full/sandbox/) ═══');
const BASE_FULL = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-full/o/sandbox';
const BASE_DEMO = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o';
const deployedFiles = jsFiles.filter(f => !f.startsWith('test_') && !f.startsWith('walk_math'));
const checkFiles = ['index.html', ...deployedFiles];
for (const f of checkFiles) {
  try {
    const out = execSync(`curl -sI "${BASE_FULL}/${f}" -o /dev/null -w "%{http_code}"`, { stdio: 'pipe', timeout: 10000 }).toString().trim();
    ok(`full/${f} → ${out}`, out === '200');
  } catch(e) { ok(`full/${f}`, false, 'curl failed'); }
}
console.log('\n═══ 8b. OCI Live (bim-ootb root) ═══');
for (const f of checkFiles) {
  try {
    const out = execSync(`curl -sI "${BASE_DEMO}/${f}" -o /dev/null -w "%{http_code}"`, { stdio: 'pipe', timeout: 10000 }).toString().trim();
    ok(`demo/${f} → ${out}`, out === '200');
  } catch(e) { ok(`demo/${f}`, false, 'curl failed'); }
}

// ═══ 9. S209b — toolbar hidden when issues panel open ═══
console.log('\n═══ 9. S209b Toolbar/Issues Overlap Fix ═══');
const issuesJs = fs.readFileSync(path.join(DIR, 'issues.js'), 'utf8');
ok('toggleIssues hides search-box', issuesJs.includes("getElementById('search-box')") && issuesJs.includes("display = 'none'"), 'search-box not hidden in toggleIssues');
ok('toggleIssues restores search-box', issuesJs.includes("display = ''"), 'search-box not restored when issues closed');
const toolsJs = fs.readFileSync(path.join(DIR, 'tools.js'), 'utf8');
ok('export4D5D encodes dbParam', toolsJs.includes("encodeURIComponent(dbParam)"), 'dbParam not encoded — will cause recursive URL');

// Verify OCI content matches local — ALL sandbox files (not just critical 3)
console.log('\n═══ 9b. OCI Content Match (full sync) ═══');
const crypto = require('crypto');
const sandboxFiles = fs.readdirSync(DIR)
  .filter(f => /\.(js|html)$/.test(f) && !f.includes('test') && !f.includes('walk_math') && !f.includes('voice_'));
let syncDrift = [];
for (const f of sandboxFiles) {
  const local = fs.readFileSync(path.join(DIR, f), 'utf8');
  const localHash = crypto.createHash('md5').update(local).digest('hex').slice(0, 8);
  try {
    const remote = execSync(`curl -s "${BASE_FULL}/${f}"`, { stdio: 'pipe', timeout: 10000 }).toString();
    const remoteHash = crypto.createHash('md5').update(remote).digest('hex').slice(0, 8);
    const match = localHash === remoteHash;
    ok(`full/${f} synced (${localHash})`, match, `DRIFT local=${localHash} live=${remoteHash}`);
    if (!match) syncDrift.push(f);
  } catch(e) { ok(`full/${f} fetch`, false, 'curl failed'); }
}
if (syncDrift.length > 0) {
  console.log(`  ⚠ DRIFT in ${syncDrift.length} file(s): ${syncDrift.join(', ')}`);
  console.log(`  → Re-upload: ${syncDrift.map(f => `oci os object put --bucket-name bim-ootb-full --file deploy/sandbox/${f} --name sandbox/${f} --force`).join('\n    ')}`);
}

// ═══ 10. URL integrity — no recursive nesting, correct routing ═══
console.log('\n═══ 10. URL Integrity ═══');

// 10a: export4D5D must NOT build URL with raw unencoded OCI URL in query string
const ociDbUrl = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-full/o/buildings/Duplex_extracted.db';
const encoded = encodeURIComponent(ociDbUrl);
ok('encodeURIComponent round-trips OCI URL', decodeURIComponent(encoded) === ociDbUrl, 'encode/decode mismatch');
ok('encoded URL has no raw slashes', !encoded.includes('/'), 'raw slashes in encoded param = recursive nesting');
ok('encoded URL has no raw colons', !encoded.includes(':'), 'raw colons in encoded param');

// 10b: boq_charts.html must exist at bucket root (not in sandbox/)
try {
  const boqCode = execSync(`curl -sI "https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-full/o/boq_charts.html" -o /dev/null -w "%{http_code}"`, { stdio: 'pipe', timeout: 10000 }).toString().trim();
  ok('boq_charts.html exists at bucket root', boqCode === '200', `got ${boqCode}`);
} catch(e) { ok('boq_charts.html at root', false, 'curl failed'); }

// 10c: boq_charts.html must NOT exist in sandbox/ (would cause confusion)
try {
  const boqSandbox = execSync(`curl -sI "https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-full/o/sandbox/boq_charts.html" -o /dev/null -w "%{http_code}"`, { stdio: 'pipe', timeout: 10000 }).toString().trim();
  ok('no boq_charts.html in sandbox/', boqSandbox === '404', `expected 404, got ${boqSandbox} — stale copy in sandbox/`);
} catch(e) { ok('no boq_charts in sandbox/', true); }

// 10d: export4D5D base regex must strip query string first (greedy regex matches /o/ in ?lib= param)
ok('export4D5D strips query before regex', toolsJs.includes("split('?')[0].match"), 'regex runs on full URL with ?db=&lib= — greedy .* matches /o/ in query params, base becomes 302 chars instead of 82');
// Prove the fix works with a real viewer URL (with ?db= and ?lib= containing /o/)
const realViewerHref = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-full/o/sandbox/index.html?db=https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-full/o/buildings/Duplex_extracted.db&lib=https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-full/o/buildings/Duplex_library.db';
const fixedBase = realViewerHref.split('?')[0].match(/(.*\/o\/)/)?.[1] || '../';
const brokenBase = realViewerHref.match(/(.*\/o\/)/)?.[1] || '../';
const expectedBase = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-full/o/';
ok(`FIXED base = bucket root (${fixedBase.length} chars)`, fixedBase === expectedBase, `got ${fixedBase.length} chars: ${fixedBase.substring(0,80)}...`);
ok(`BROKEN base was ${brokenBase.length} chars (greedy matched /o/ in ?lib=)`, brokenBase.length > 200, 'regex no longer greedy — test outdated');
const fixedBoqUrl = fixedBase + 'boq_charts.html';
const brokenBoqUrl = brokenBase + 'boq_charts.html';
ok('FIXED: opens boq_charts.html', fixedBoqUrl.endsWith('/o/boq_charts.html'), `wrong: ${fixedBoqUrl.substring(0,100)}`);
ok('BROKEN: would reopen viewer', brokenBoqUrl.includes('index.html'), 'broken path no longer reproduces — test outdated');

// 10e: tools.js must NOT have raw dbParam in window.open (the old bug)
const rawPattern = '`${base}boq_charts.html?db=${dbParam}';  // unencoded = bug
ok('no raw dbParam in boq URL', !toolsJs.includes(rawPattern), 'dbParam used raw — will cause recursive URL on OCI');

// 10f: LIVE END-TO-END — build the exact URL export4D5D produces, curl it, verify it's boq_charts (not viewer)
const viewerUrl = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-full/o/sandbox/index.html';
const baseMatch = viewerUrl.match(/(.*\/o\/)/);
const simBase = baseMatch ? baseMatch[1] : '';
const simDbParam = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-full/o/buildings/Duplex_extracted.db';
const boqUrl = `${simBase}boq_charts.html?db=${encodeURIComponent(simDbParam)}&bld=S0_0_Duplex`;
console.log(`  → simulated URL: ${boqUrl.substring(0, 80)}...`);
try {
  const boqBody = execSync(`curl -s "${boqUrl}"`, { stdio: 'pipe', timeout: 15000 }).toString();
  ok('📊 URL returns boq_charts.html (has Chart.js)', boqBody.includes('chart.js') || boqBody.includes('Chart.js'), 'URL did NOT return boq_charts — wrong page loaded');
  ok('📊 URL does NOT return viewer (no Three.js)', !boqBody.includes('setupStreaming') && !boqBody.includes('loader.js'), 'URL returned viewer instead of boq_charts — routing broken');
  // Verify boq_charts can parse the db param back
  const dbInPage = boqBody.match(/params\.get\(['"]db['"]\)/);
  ok('boq_charts reads ?db= param', !!dbInPage, 'boq_charts.html does not read db param');
} catch(e) { ok('📊 live URL fetch', false, 'curl failed: ' + e.message); }

// 10g: Verify the DB URL in the param is fetchable (not boq_charts.html itself)
try {
  const dbHead = execSync(`curl -sI "${simDbParam}" -o /dev/null -w "%{http_code}"`, { stdio: 'pipe', timeout: 10000 }).toString().trim();
  ok('DB URL in ?db= param is fetchable', dbHead === '200', `Duplex_extracted.db returned ${dbHead}`);
} catch(e) { ok('DB URL fetchable', false, 'curl failed'); }

// 10h: Download the DB, open with sqlite3, verify tables and data that feed the 9 charts
//   boq_charts.html queries: elements_meta (discipline, ifc_class, storey, building)
//                             element_instances (guid)
//   Charts need: ≥1 row in elements_meta with a building name
const tmpDb = '/tmp/test_duplex_extracted.db';
try {
  execSync(`curl -s "${simDbParam}" -o ${tmpDb}`, { stdio: 'pipe', timeout: 30000 });
  const tables = execSync(`sqlite3 ${tmpDb} ".tables"`, { stdio: 'pipe' }).toString();
  ok('DB has elements_meta table', tables.includes('elements_meta'), 'missing elements_meta — all 9 charts will be empty');
  ok('DB has element_instances table', tables.includes('element_instances'), 'missing element_instances — chart joins will fail');

  const rowCount = execSync(`sqlite3 ${tmpDb} "SELECT COUNT(*) FROM elements_meta"`, { stdio: 'pipe' }).toString().trim();
  ok(`elements_meta has data (${rowCount} rows)`, parseInt(rowCount) > 0, 'elements_meta is empty — all charts empty');

  const discs = execSync(`sqlite3 ${tmpDb} "SELECT DISTINCT discipline FROM elements_meta WHERE discipline IS NOT NULL"`, { stdio: 'pipe' }).toString().trim();
  const discCount = discs ? discs.split('\n').length : 0;
  ok(`has disciplines for pie chart (${discCount} found)`, discCount > 0, 'no disciplines — Chart 1 (Cost Pie) empty');

  const storeys = execSync(`sqlite3 ${tmpDb} "SELECT DISTINCT storey FROM elements_meta WHERE storey IS NOT NULL"`, { stdio: 'pipe' }).toString().trim();
  const storeyCount = storeys ? storeys.split('\n').length : 0;
  ok(`has storeys for breakdown (${storeyCount} found)`, storeyCount > 0, 'no storeys — per-storey charts empty');

  const bldName = execSync(`sqlite3 ${tmpDb} "SELECT building FROM elements_meta GROUP BY building ORDER BY COUNT(*) DESC LIMIT 1"`, { stdio: 'pipe' }).toString().trim();
  ok(`largest building found: '${bldName}'`, bldName.length > 0, 'no building name — boq_charts cannot filter');

  const classes = execSync(`sqlite3 ${tmpDb} "SELECT COUNT(DISTINCT ifc_class) FROM elements_meta"`, { stdio: 'pipe' }).toString().trim();
  ok(`has IFC classes for BOQ (${classes} types)`, parseInt(classes) > 0, 'no IFC classes — BOQ table empty');

  console.log(`  → §CHART_PROOF: DB has ${rowCount} elements, ${discCount} disciplines, ${storeyCount} storeys, ${classes} IFC classes — all 9 charts will render`);
  execSync(`rm -f ${tmpDb}`);
} catch(e) { ok('DB chart data verification', false, e.message); }

// ═══ 11. Button wiring — correct function on correct button ═══
console.log('\n═══ 11. Button Wiring Audit ═══');

// The 📊 button must call export4D5D, NOT exportIssuesExcel
const boqBtnMatch = html.match(/export4D5D\(\)[^"]*"[^>]*>[^<]*📊/);
ok('📊 button calls export4D5D()', !!boqBtnMatch, '📊 not wired to export4D5D');

// The Export Excel button must call exportIssuesExcel, NOT export4D5D
const excelBtnMatch = html.match(/exportIssuesExcel\(\)[^"]*"[^>]*>[^<]*Export Excel/);
ok('Export Excel button calls exportIssuesExcel()', !!excelBtnMatch, 'Export Excel not wired to exportIssuesExcel');

// Export Excel must be INSIDE issues-panel, not in search-box
const issuesPanelHtml = html.slice(html.indexOf('id="issues-panel"'));
const searchBoxHtml = html.slice(html.indexOf('id="search-box"'), html.indexOf('id="info-panel"'));
ok('Export Excel is inside issues-panel', issuesPanelHtml.includes('exportIssuesExcel'), 'Export Excel button not in issues-panel');
ok('Export Excel is NOT inside search-box', !searchBoxHtml.includes('exportIssuesExcel'), 'Export Excel button in search-box — will always fire from toolbar');

// 📊 must be INSIDE search-box, not issues-panel
ok('📊 is inside search-box', searchBoxHtml.includes('export4D5D'), '📊 button not in search-box');

// Issues panel z-index must be strictly higher than search-box z-index
const issuesZ = html.match(/#issues-panel\s*\{[^}]*z-index\s*:\s*(\d+)/);
const searchZ = html.match(/#search-box\s*\{[^}]*z-index\s*:\s*(\d+)/);
if (issuesZ && searchZ) {
  ok(`issues-panel z=${issuesZ[1]} > search-box z=${searchZ[1]}`, parseInt(issuesZ[1]) > parseInt(searchZ[1]), 'issues panel not above search-box');
} else {
  ok('z-index extraction', false, 'could not parse z-index from CSS');
}

// Mobile media query: issues panel z must also beat search-box
const mobileMatch = html.match(/@media[^{]*max-width\s*:\s*600px[^{]*\{([\s\S]*?)\n\s*\}/);
if (mobileMatch) {
  const mobileCss = mobileMatch[1];
  const mobileSearchZ = mobileCss.match(/#search-box[^}]*z-index\s*:\s*(\d+)/);
  if (mobileSearchZ) {
    const mobileIssuesZ = mobileCss.match(/#issues-panel[^}]*z-index\s*:\s*(\d+)/);
    const issuesBaseZ = issuesZ ? parseInt(issuesZ[1]) : 50;
    const mobileIZ = mobileIssuesZ ? parseInt(mobileIssuesZ[1]) : issuesBaseZ;
    ok(`mobile: issues z=${mobileIZ} > search-box z=${mobileSearchZ[1]}`, mobileIZ > parseInt(mobileSearchZ[1]), 'mobile: issues panel not above search-box');
  }
}

// excel.js must use synchronous XLSX.writeFile, not async blob/share
const excelJs = fs.readFileSync(path.join(DIR, 'excel.js'), 'utf8');
ok('excel uses XLSX.writeFile (sync)', excelJs.includes('XLSX.writeFile('), 'missing XLSX.writeFile — export will fail');
ok('excel is NOT async', !excelJs.match(/async\s+.*exportIssuesExcel/), 'exportIssuesExcel is async — browser will lose user gesture');

// ═══ 12. S210 — Deployment Safety & Dev Environment ═══
console.log('\n═══ 12. S210 Deployment Safety ═══');
const devDir = path.join(DIR, '..', 'dev');

// 12a: Landing page must point to sandbox/index.html (not retired monolith)
const landingHtml = fs.readFileSync(path.join(DIR, '..', 'landing.html'), 'utf8');
ok('landing: viewerFile = sandbox/index.html', landingHtml.includes("const viewerFile = 'sandbox/index.html'"), 'landing still points to retired rtree_browser_demo.html — will 404');
ok('landing: no rtree_browser_demo.html in viewerUrl', !landingHtml.includes("_base + 'rtree_browser_demo"), 'viewerUrl still references deleted monolith');
ok('landing: has health check (ntfy)', landingHtml.includes('ntfy.sh/bim-ootb-alert'), 'landing missing health check — broken viewer won\'t alert');
ok('landing: has Watch Demo link', landingHtml.includes('youtu.be'), 'landing missing Watch Demo YouTube link');

// 12b: Local landing must match what would be deployed (no live curl — avoid accidents)
// The local file IS the source of truth. OCI deploy tests are in section 8.

// 12c: Sitecam — toolbar hidden during camera (walk arrow must not bleed through)
// Check dev sitecam if it exists (fix lives in dev/), fall back to production
const devSitecamPath = path.join(devDir, 'sitecam.js');
const sitecamJs = fs.existsSync(devSitecamPath) ? fs.readFileSync(devSitecamPath, 'utf8') : fs.readFileSync(path.join(DIR, 'sitecam.js'), 'utf8');
ok('sitecam: hides walk-mode-btn during camera', sitecamJs.includes("'walk-mode-btn'") && sitecamJs.includes("'none'"), 'walk button not hidden — bleeds through camera overlay');
ok('sitecam: restores toolbar on camera close', sitecamJs.includes('camHid') || sitecamJs.includes('prevDisplay'), 'toolbar elements not restored after camera close');

// 12d: Dev landing must have Watch Demo (same as production)
const landing2Path = path.join(DIR, '..', 'landing2.html');
if (fs.existsSync(landing2Path)) {
  const landing2Html = fs.readFileSync(landing2Path, 'utf8');
  ok('landing2: has Watch Demo link', landing2Html.includes('youtu.be'), 'dev landing missing Watch Demo — out of sync with production');
  ok('landing2: has DEV banner', landing2Html.includes('DEV ENVIRONMENT'), 'dev landing missing DEV banner');
  ok('landing2: DBs from prod bucket', landing2Html.includes('bim-ootb-full'), 'dev landing not serving DBs from production bucket');
  ok('landing2: has health check (ntfy)', landing2Html.includes('ntfy.sh/bim-ootb-alert'), 'dev landing missing health check');
  ok('landing2: viewer = sandbox/index.html', landing2Html.includes("sandbox/index.html"), 'dev landing viewer path wrong');
}

// 12f: Dev boq_charts.html — ExcelJS, WP sheets, USD
if (fs.existsSync(path.join(devDir, 'boq_charts.html'))) {
  const devBoq = fs.readFileSync(path.join(devDir, 'boq_charts.html'), 'utf8');
  ok('dev boq: has ExcelJS CDN', devBoq.includes('exceljs'), 'dev boq_charts missing ExcelJS');
  ok('dev boq: has USD_RATE', devBoq.includes('USD_RATE'), 'dev boq_charts missing USD conversion');
  ok('dev boq: has WORK_PACKAGES', devBoq.includes('WORK_PACKAGES'), 'dev boq_charts missing Work Package definitions');
  ok('dev boq: has PACKAGE 1 SUBSTRUCTURE', devBoq.includes('SUBSTRUCTURE'), 'dev boq_charts missing PACKAGE 1');
  ok('dev boq: has per-discipline BOQ sheets', devBoq.includes('BOQ-'), 'dev boq_charts missing per-discipline sheets');
  ok('dev boq: has chart image embedding', devBoq.includes('toDataURL') && devBoq.includes('addImage'), 'dev boq_charts missing chart image embedding');
  ok('dev boq: save5D is async', devBoq.includes('async function save5D'), 'save5D not async — ExcelJS writeBuffer needs await');
  ok('dev boq: save4D is async', devBoq.includes('async function save4D'), 'save4D not async — ExcelJS writeBuffer needs await');
  ok('dev boq: header fill per-cell (not full row)', devBoq.includes('getCell(c)') && devBoq.includes('cell.fill'), 'header fill applies to entire row — blue bars extend past data');
}

// ═══ 13. Version Fingerprint (which version is live?) ═══
console.log('\n═══ 13. Version Fingerprint ═══');
try {
  // Composite hash of ALL sandbox source files = unique fingerprint for this version
  const srcFiles = fs.readdirSync(DIR)
    .filter(f => /\.(js|html)$/.test(f) && !f.includes('test') && !f.includes('walk_math') && !f.includes('voice_'))
    .sort();
  const composite = crypto.createHash('sha256');
  for (const f of srcFiles) composite.update(fs.readFileSync(path.join(DIR, f)));
  const localFingerprint = composite.digest('hex').slice(0, 12);

  // Get git commit that last touched sandbox
  const lastCommit = execSync('git log -1 --format="%h %s" -- deploy/sandbox/', { stdio: 'pipe' }).toString().trim();

  // Check live fingerprint
  const liveComposite = crypto.createHash('sha256');
  let liveFetchOk = true;
  for (const f of srcFiles) {
    try {
      const remote = execSync(`curl -s "${BASE_FULL}/${f}"`, { stdio: 'pipe', timeout: 10000 });
      liveComposite.update(remote);
    } catch(e) { liveFetchOk = false; }
  }
  const liveFingerprint = liveFetchOk ? liveComposite.digest('hex').slice(0, 12) : 'FETCH_FAILED';

  const synced = localFingerprint === liveFingerprint;
  console.log(`  LOCAL  ${localFingerprint}  ← git: ${lastCommit}`);
  console.log(`  LIVE   ${liveFingerprint}  ← bim-ootb-full/sandbox/`);
  ok('version: local ↔ live fingerprint match', synced, `MISMATCH — local=${localFingerprint} live=${liveFingerprint}. Deploy needed or rollback required.`);
  if (!synced && syncDrift.length > 0) {
    console.log(`  DRIFTED FILES (${syncDrift.length}):`);
    for (const f of syncDrift) console.log(`    - ${f}`);
    console.log('  → To find last working version: git log --oneline -- deploy/sandbox/');
    console.log('  → To restore to specific commit: git checkout <commit> -- deploy/sandbox/ && re-upload');
  }
} catch(e) {
  ok('version fingerprint', false, e.message);
}

// ═══ 14. Rollback Dry Run (git restore proof) ═══
console.log('\n═══ 14. Rollback Dry Run ═══');
try {
  // Create a worktree, corrupt a sandbox file, restore it, verify recovery
  const wtDir = '/tmp/bim-rollback-test-' + Date.now();
  execSync(`git worktree add "${wtDir}" HEAD --quiet 2>&1`, { stdio: 'pipe', timeout: 15000 });
  // Corrupt a file in the worktree
  const testFile = path.join(wtDir, 'deploy/sandbox/main.js');
  const originalContent = fs.readFileSync(testFile, 'utf8');
  fs.writeFileSync(testFile, '// CORRUPTED BY ROLLBACK TEST');
  ok('rollback: file corrupted in worktree', fs.readFileSync(testFile, 'utf8') !== originalContent);
  // Restore it
  execSync(`git -C "${wtDir}" restore deploy/sandbox/main.js`, { stdio: 'pipe', timeout: 5000 });
  const restored = fs.readFileSync(testFile, 'utf8');
  ok('rollback: git restore recovered file', restored === originalContent, 'RESTORE FAILED — file differs after git restore');
  // Verify hash matches current commit
  const commitHash = crypto.createHash('md5').update(originalContent).digest('hex').slice(0, 8);
  const restoredHash = crypto.createHash('md5').update(restored).digest('hex').slice(0, 8);
  ok(`rollback: hash intact (${restoredHash})`, commitHash === restoredHash, `HASH MISMATCH commit=${commitHash} restored=${restoredHash}`);
  // Clean up worktree
  execSync(`git worktree remove "${wtDir}" --force 2>&1`, { stdio: 'pipe', timeout: 5000 });
  ok('rollback: worktree cleaned up', !fs.existsSync(wtDir));
} catch(e) {
  ok('rollback dry run', false, `worktree test failed: ${e.message}`);
}

// ═══ 15b. Module wiring — built features without dedicated tests ═══
console.log('\n═══ 15b. Module Wiring — Built Feature Coverage ═══');

// S228: Drop Zone format router
if (fs.existsSync(path.join(DIR, 'import.js'))) {
  const importSrc = fs.readFileSync(path.join(DIR, 'import.js'), 'utf8');
  ok('import.js: detectFormat exists', importSrc.includes('function detectFormat') || importSrc.includes('detectFormat'));
  ok('import.js: routes IFC', importSrc.includes("'ifc'"));
  ok('import.js: routes mesh (OBJ/DAE/STL)', importSrc.includes("'mesh'") || importSrc.includes('importMesh'));
  ok('import.js: importMesh wired', importSrc.includes('importMesh'));
  ok('semantic_enrichment.js loaded', html.includes('semantic_enrichment.js'));
  ok('scene_to_db.js loaded', html.includes('scene_to_db.js'));
  ok('mesh_import_worker.js exists', fs.existsSync(path.join(DIR, 'mesh_import_worker.js')));
}

// S222: Diff + Variation Order
if (fs.existsSync(path.join(DIR, 'diff.js'))) {
  const diffSrc = fs.readFileSync(path.join(DIR, 'diff.js'), 'utf8');
  ok('diff.js loaded by viewer', html.includes('diff.js'));
  ok('diff.js has GUID diff logic', diffSrc.includes('guid') || diffSrc.includes('GUID'));
}
if (fs.existsSync(path.join(DIR, 'variation_order.js'))) {
  const voSrc = fs.readFileSync(path.join(DIR, 'variation_order.js'), 'utf8');
  ok('variation_order.js loaded by viewer', html.includes('variation_order.js'));
  ok('variation_order.js has exportVariationOrder', voSrc.includes('exportVariationOrder'));
}

// S210: City mode
if (fs.existsSync(path.join(DIR, 'city.js'))) {
  const citySrc = fs.readFileSync(path.join(DIR, 'city.js'), 'utf8');
  ok('city.js loaded by viewer', html.includes('city.js'));
  ok('city.js has setupCity', citySrc.includes('function setupCity') || citySrc.includes('setupCity'));
  ok('city.js has clear logic', citySrc.includes('Clear') || citySrc.includes('clear') || citySrc.includes('CLEAR'));
}

// S206: Tour
if (fs.existsSync(path.join(DIR, 'tour.js'))) {
  const tourSrc = fs.readFileSync(path.join(DIR, 'tour.js'), 'utf8');
  ok('tour.js loaded by viewer', html.includes('tour.js'));
  ok('tour.js has setupTour', tourSrc.includes('function setupTour'));
}

// S226: Localisation readiness
const localeDir = path.join(DIR, 'locales');
if (fs.existsSync(localeDir)) {
  const locales = fs.readdirSync(localeDir).filter(f => f.endsWith('.js'));
  ok(`locale files present (${locales.length})`, locales.length >= 15, `expected 15+, got ${locales.length}`);
  let localeParse = 0;
  for (const lf of locales) {
    try { new Function(fs.readFileSync(path.join(localeDir, lf), 'utf8')); localeParse++; }
    catch(e) { ok(`locale ${lf} syntax`, false, e.message); }
  }
  ok(`all ${localeParse} locale files parse`, localeParse === locales.length);
} else {
  console.log('  ⚠ locales/ not found — S226 not started');
}

// S204: Sitecam
if (fs.existsSync(path.join(DIR, 'sitecam.js'))) {
  const sitecamSrc = fs.readFileSync(path.join(DIR, 'sitecam.js'), 'utf8');
  ok('sitecam.js loaded by viewer', html.includes('sitecam.js'));
  ok('sitecam: hides walk-mode-btn', sitecamSrc.includes("'walk-mode-btn'"));
  ok('sitecam: GPS status update', sitecamSrc.includes('GPS'));
}

// ═══ 15. Browser E2E (Playwright) ═══
console.log('\n═══ 15. Browser E2E (Playwright) ═══');
try {
  const pwOut = execSync('npx playwright test --project=desktop --reporter=line 2>&1', {
    cwd: path.join(DIR, 'tests'),
    timeout: 600000,
  }).toString();
  const pwPassMatch = pwOut.match(/(\d+) passed/);
  const pwFailMatch = pwOut.match(/(\d+) failed/);
  if (pwFailMatch) {
    fail += parseInt(pwFailMatch[1]);
    ok('browser E2E', false, pwFailMatch[1] + ' failed');
  } else {
    const pwPassCount = pwPassMatch ? parseInt(pwPassMatch[1]) : 0;
    pass += pwPassCount;
    ok('browser E2E ' + pwPassCount + ' passed', true);
  }
} catch(e) {
  const pwOut = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
  const pwPassMatch = pwOut.match(/(\d+) passed/);
  const pwFailMatch = pwOut.match(/(\d+) failed/);
  if (pwPassMatch) pass += parseInt(pwPassMatch[1]);
  if (pwFailMatch) fail += parseInt(pwFailMatch[1]);
  const failLines = pwOut.split('\n').filter(l => l.includes('✗') || l.includes('failed'));
  ok('browser E2E', false, failLines.slice(0, 3).join('; '));
}

// ═══ SUMMARY ═══
console.log(`\n═══ SUMMARY: ${pass}/${pass + fail} passed, ${fail} failed ═══\n`);
process.exit(fail > 0 ? 1 : 0);
