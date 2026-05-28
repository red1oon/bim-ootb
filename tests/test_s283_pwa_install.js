/**
 * S283 PWA Offline Install — Whitebox tests
 * Issue: PWA install badge, offline download, CI-gated update, share, icons
 * Run: node tests/test_s283_pwa_install.js
 */
const fs = require('fs');
const path = require('path');

const VIEWER = path.join(__dirname, '..', 'viewer');
let pass = 0, fail = 0;

function ok(id, desc, cond) {
  if (cond) { console.log('  PASS ' + id + ' ' + desc); pass++; }
  else { console.log('  FAIL ' + id + ' ' + desc); fail++; }
}

// ── 1. Manifest ─────────────────────────────────────────────────────────────

console.log('\n=== 1. Manifest ===');

const manifest = JSON.parse(fs.readFileSync(path.join(VIEWER, 'manifest.webmanifest'), 'utf8'));

ok('1.1', 'display=standalone', manifest.display === 'standalone');
ok('1.2', 'start_url=index.html', manifest.start_url === 'index.html');
ok('1.3', 'has name', !!manifest.name);
ok('1.4', 'has theme_color', !!manifest.theme_color);
ok('1.5', 'icons array has 192 and 512', manifest.icons.length >= 2 &&
  manifest.icons.some(i => i.sizes === '192x192') &&
  manifest.icons.some(i => i.sizes === '512x512'));

// Shortcuts
ok('1.6', 'shortcuts array exists', Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 2);
var shortcutNames = (manifest.shortcuts || []).map(s => s.short_name);
ok('1.7', 'shortcut: Update', shortcutNames.includes('Update'));
ok('1.8', 'shortcut: Share', shortcutNames.includes('Share'));
ok('1.9', 'Update shortcut url has ?action=update',
  (manifest.shortcuts || []).some(s => s.url && s.url.includes('action=update')));
ok('1.10', 'Share shortcut url has ?action=share',
  (manifest.shortcuts || []).some(s => s.url && s.url.includes('action=share')));
ok('1.11', 'all shortcuts have icons',
  (manifest.shortcuts || []).every(s => Array.isArray(s.icons) && s.icons.length > 0));

// ── 2. Icons on disk ────────────────────────────────────────────────────────

console.log('\n=== 2. Icons ===');

var iconDir = path.join(VIEWER, 'icons');
ok('2.1', 'icon-192.png exists', fs.existsSync(path.join(iconDir, 'icon-192.png')));
ok('2.2', 'icon-512.png exists', fs.existsSync(path.join(iconDir, 'icon-512.png')));

// Verify PNG header (magic bytes: 89 50 4E 47)
function isPng(fpath) {
  if (!fs.existsSync(fpath)) return false;
  var buf = fs.readFileSync(fpath);
  return buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
}
ok('2.3', 'icon-192.png is valid PNG', isPng(path.join(iconDir, 'icon-192.png')));
ok('2.4', 'icon-512.png is valid PNG', isPng(path.join(iconDir, 'icon-512.png')));

// Shortcut icons reference existing files
(manifest.shortcuts || []).forEach(function(s, i) {
  (s.icons || []).forEach(function(ic) {
    var iconPath = path.join(VIEWER, ic.src);
    ok('2.5.' + i, 'shortcut icon exists: ' + ic.src, fs.existsSync(iconPath));
  });
});

// ── 3. Service Worker ───────────────────────────────────────────────────────

console.log('\n=== 3. Service Worker ===');

var swSrc = fs.readFileSync(path.join(VIEWER, 'sw.js'), 'utf8');

ok('3.1', 'CACHE_VERSION defined', /CACHE_VERSION\s*=\s*'v\d+'/.test(swSrc));
ok('3.2', 'GET_PRECACHE message handler', swSrc.includes("type === 'GET_PRECACHE'"));
ok('3.3', 'SKIP_WAITING message handler', swSrc.includes("type === 'SKIP_WAITING'"));
ok('3.4', 'GET_PRECACHE returns assets+libs+version',
  swSrc.includes('PRECACHE_ASSETS') && swSrc.includes('LOCAL_LIBS') && swSrc.includes('version: CACHE_VERSION'));

// Extract precache list and verify every file exists on disk
var precacheMatch = swSrc.match(/const PRECACHE_ASSETS\s*=\s*\[([\s\S]*?)\];/);
var localLibsMatch = swSrc.match(/const LOCAL_LIBS\s*=\s*\[([\s\S]*?)\];/);
var precacheFiles = [];
if (precacheMatch) {
  precacheMatch[1].replace(/'([^']+)'/g, function(_, f) { precacheFiles.push(f); });
}
var localLibFiles = [];
if (localLibsMatch) {
  localLibsMatch[1].replace(/'([^']+)'/g, function(_, f) { localLibFiles.push(f); });
}

console.log('\n=== 4. Precache files on disk (' + precacheFiles.length + ' assets + ' + localLibFiles.length + ' libs) ===');

var missingPrecache = [];
precacheFiles.forEach(function(f) {
  var full = path.join(VIEWER, f);
  if (!fs.existsSync(full)) missingPrecache.push(f);
});
ok('4.1', 'all PRECACHE_ASSETS exist on disk (' + precacheFiles.length + ' files)',
  missingPrecache.length === 0);
if (missingPrecache.length > 0) {
  console.log('    MISSING: ' + missingPrecache.join(', '));
}

var missingLibs = [];
localLibFiles.forEach(function(f) {
  var full = path.join(VIEWER, f);
  if (!fs.existsSync(full)) missingLibs.push(f);
});
ok('4.2', 'all LOCAL_LIBS exist on disk (' + localLibFiles.length + ' files)',
  missingLibs.length === 0);
if (missingLibs.length > 0) {
  console.log('    MISSING: ' + missingLibs.join(', '));
}

// ── 5. scene.js — PWA code paths ────────────────────────────────────────────

console.log('\n=== 5. scene.js — PWA install code ===');

var sceneSrc = fs.readFileSync(path.join(VIEWER, 'scene.js'), 'utf8');

// 5.1 beforeinstallprompt capture
ok('5.1', 'beforeinstallprompt listener', sceneSrc.includes("'beforeinstallprompt'"));
ok('5.2', '_installPrompt stashed', sceneSrc.includes('_installPrompt = e'));
ok('5.3', '§PWA_INSTALL prompt captured log', sceneSrc.includes("§PWA_INSTALL prompt captured"));

// 5.2 Badge rendering
ok('5.4', 'badge element id=cmd-install-badge', sceneSrc.includes('cmd-install-badge'));
ok('5.5', 'badge blue color #4fc3f7', sceneSrc.includes("'#4fc3f7'") || sceneSrc.includes('"#4fc3f7"'));
ok('5.6', 'badge green color #4caf50', sceneSrc.includes('#4caf50'));
ok('5.7', 'badge state debug log', sceneSrc.includes('§PWA_BADGE state='));
ok('5.8', 'badge rendered debug log', sceneSrc.includes('§PWA_BADGE rendered color='));
ok('5.9', 'badge always rendered (no conditional empty string)',
  !sceneSrc.includes("badgeHtml = _showBadge ?"));
ok('5.10', 'checkmark icon for green state', sceneSrc.includes('polyline points="20 6 9 17 4 12"'));
ok('5.11', 'download arrow icon for blue state', sceneSrc.includes('polyline points="7 10 12 15 17 10"'));

// 5.3 _isStandalone detection
ok('5.12', '_isStandalone checks display-mode: standalone', sceneSrc.includes('display-mode: standalone'));
ok('5.13', '_isStandalone checks navigator.standalone (iOS)', sceneSrc.includes('navigator.standalone'));

// 5.4 Download flow
ok('5.14', '_startOfflineDownload function', sceneSrc.includes('function _startOfflineDownload'));
ok('5.15', 'sends GET_PRECACHE to sw.js', sceneSrc.includes("type: 'GET_PRECACHE'"));
ok('5.16', 'uses MessageChannel', sceneSrc.includes('new MessageChannel'));

// 5.5 Asset caching
ok('5.17', '_cacheAllAssets function', sceneSrc.includes('function _cacheAllAssets'));
ok('5.18', 'opens cache by name', sceneSrc.includes('caches.open(cacheName)'));
ok('5.19', 'batched caching (6 at a time)', sceneSrc.includes('queue.splice(0, 6)'));
ok('5.20', 'progress update during cache', sceneSrc.includes('ov.setProgress(done / total'));
ok('5.21', '§PWA_CACHE skip log on error', sceneSrc.includes('§PWA_CACHE skip'));

// 5.6 Building DB cache
ok('5.22', '_ensureBuildingCached function', sceneSrc.includes('function _ensureBuildingCached'));
ok('5.23', '§PWA_CACHE building= log', sceneSrc.includes('§PWA_CACHE building='));

// 5.7 persist()
ok('5.24', 'navigator.storage.persist() call', sceneSrc.includes('navigator.storage.persist'));
ok('5.25', '§PWA_PERSIST log', sceneSrc.includes('§PWA_PERSIST granted='));

// 5.8 Install trigger
ok('5.26', '_triggerInstall function', sceneSrc.includes('function _triggerInstall'));
ok('5.27', '_installPrompt.prompt() call', sceneSrc.includes('_installPrompt.prompt()'));
ok('5.28', 'userChoice handler', sceneSrc.includes('_installPrompt.userChoice'));
ok('5.29', '§PWA_INSTALL choice= log', sceneSrc.includes('§PWA_INSTALL choice='));
ok('5.30', 'window._pwaAccepted set on accept', sceneSrc.includes('window._pwaAccepted = true'));

// 5.9 iOS guide
ok('5.31', '_showIOSGuide function', sceneSrc.includes('function _showIOSGuide'));
ok('5.32', 'iOS UA detection', sceneSrc.includes('iPhone|iPad|iPod'));
ok('5.33', '§PWA_INSTALL ios_guide_shown log', sceneSrc.includes('§PWA_INSTALL ios_guide_shown'));
ok('5.34', '3-step guide (numbered 1-2-3)', sceneSrc.includes('>1<') && sceneSrc.includes('>2<') && sceneSrc.includes('>3<'));
ok('5.35', 'Add to Home Screen text', sceneSrc.includes('Add to Home Screen'));

// 5.10 No-prompt fallback
ok('5.36', 'fallback message for consumed prompt', sceneSrc.includes('Reload page to retry install'));
ok('5.37', '§PWA_INSTALL no_prompt log', sceneSrc.includes('§PWA_INSTALL no_prompt'));

// ── 6. scene.js — CI-gated update ───────────────────────────────────────────

console.log('\n=== 6. scene.js — CI-gated update ===');

ok('6.1', '_checkUpdate function', sceneSrc.includes('function _checkUpdate'));
ok('6.2', 'fetches remote sw.js with cache:no-store', sceneSrc.includes("cache: 'no-store'"));
ok('6.3', 'parses remote CACHE_VERSION', sceneSrc.includes("CACHE_VERSION\\s*=\\s*") || sceneSrc.includes('CACHE_VERSION'));
ok('6.4', 'gets local version via GET_PRECACHE', sceneSrc.includes("resolve(ev.data.version"));
ok('6.5', 'GitHub Actions API call', sceneSrc.includes('api.github.com/repos/red1oon/bim-ootb/actions/runs'));
ok('6.6', 'checks status=success', sceneSrc.includes('status=success'));
ok('6.7', '"Not Ready, Try Later" on CI fail', sceneSrc.includes('Not Ready, Try Later'));
ok('6.8', '§PWA_UPDATE ci=no_success_runs log', sceneSrc.includes('§PWA_UPDATE ci=no_success_runs'));
ok('6.9', '§PWA_UPDATE ci=success log', sceneSrc.includes('§PWA_UPDATE ci=success'));

// Changelog
ok('6.10', '_fetchChangelog function', sceneSrc.includes('function _fetchChangelog'));
ok('6.11', 'fetches commits from GitHub API', sceneSrc.includes('api.github.com/repos/red1oon/bim-ootb/commits'));
ok('6.12', '§PWA_UPDATE changelog= log', sceneSrc.includes('§PWA_UPDATE changelog='));
ok('6.13', 'OK button in changelog', sceneSrc.includes('pwa-update-ok'));
ok('6.14', 'Cancel button in changelog', sceneSrc.includes('pwa-update-cancel'));
ok('6.15', 'Esc key cancels update', sceneSrc.includes("e.key === 'Escape'"));
ok('6.16', '§PWA_UPDATE confirmed log', sceneSrc.includes('§PWA_UPDATE confirmed'));
ok('6.17', '§PWA_UPDATE cancelled log', sceneSrc.includes('§PWA_UPDATE cancelled'));

// Apply update
ok('6.18', '_applyUpdate function', sceneSrc.includes('function _applyUpdate'));
ok('6.19', 'sends SKIP_WAITING message', sceneSrc.includes("type: 'SKIP_WAITING'"));
ok('6.20', 'registers sw.js for update', sceneSrc.includes("register('sw.js')"));
ok('6.21', 'reloads after update', sceneSrc.includes('window.location.reload()'));

// ── 7. scene.js — Share ─────────────────────────────────────────────────────

console.log('\n=== 7. scene.js — Share ===');

ok('7.1', '_shareProject function', sceneSrc.includes('function _shareProject'));
ok('7.2', 'navigator.share (Web Share API)', sceneSrc.includes('navigator.share'));
ok('7.3', 'clipboard fallback', sceneSrc.includes('navigator.clipboard.writeText'));
ok('7.4', '§PWA_SHARE native log', sceneSrc.includes('§PWA_SHARE native'));
ok('7.5', '§PWA_SHARE clipboard log', sceneSrc.includes('§PWA_SHARE clipboard'));

// ── 8. scene.js — ?action= param handling ───────────────────────────────────

console.log('\n=== 8. scene.js — Shortcut action params ===');

ok('8.1', 'URLSearchParams reads action', sceneSrc.includes("params.get('action')"));
ok('8.2', 'action=update triggers _checkUpdate', sceneSrc.includes("action === 'update'") && sceneSrc.includes('_checkUpdate'));
ok('8.3', 'action=share triggers _shareProject', sceneSrc.includes("action === 'share'") && sceneSrc.includes('_shareProject'));

// ── 9. scene.js — Exposed API ───────────────────────────────────────────────

console.log('\n=== 9. scene.js — Exposed API ===');

ok('9.1', 'A.checkUpdate exposed', sceneSrc.includes('A.checkUpdate = _checkUpdate'));
ok('9.2', 'A.shareProject exposed', sceneSrc.includes('A.shareProject = _shareProject'));
ok('9.3', 'A.startOfflineDownload exposed', sceneSrc.includes('A.startOfflineDownload = _startOfflineDownload'));

// ── 10. panels.js — Home pill standalone ─────────────────────────────────────

console.log('\n=== 10. panels.js — Home pill standalone ===');

var panelsSrc = fs.readFileSync(path.join(VIEWER, 'panels.js'), 'utf8');

ok('10.1', 'Home action checks display-mode: standalone', panelsSrc.includes('display-mode: standalone'));
ok('10.2', 'standalone opens external URL', panelsSrc.includes("window.open('https://red1oon.github.io/bim-ootb/'"));
ok('10.3', '§PWA_HOME opened log', panelsSrc.includes('§PWA_HOME opened'));
ok('10.4', 'non-standalone navigates to ../index.html', panelsSrc.includes("location.href = '../index.html'"));

// ── 11. Badge click routing ──────────────────────────────────────────────────

console.log('\n=== 11. Badge click routing ===');

ok('11.1', 'green badge click → _checkUpdate', sceneSrc.includes('§PWA_BADGE click=update (green)'));
ok('11.2', 'blue badge click → _startOfflineDownload', sceneSrc.includes('§PWA_BADGE click=download (blue)'));
ok('11.3', 'badge click uses _pwaInstalled to route',
  sceneSrc.includes('if (_pwaInstalled)') && sceneSrc.includes('_checkUpdate') && sceneSrc.includes('_startOfflineDownload'));

// ── 12. Progress overlay ─────────────────────────────────────────────────────

console.log('\n=== 12. Progress overlay ===');

ok('12.1', '_createProgressOverlay function', sceneSrc.includes('function _createProgressOverlay'));
ok('12.2', 'overlay has backdrop blur', sceneSrc.includes('backdrop-filter:blur'));
ok('12.3', 'progress bar element', sceneSrc.includes('pwa-bar'));
ok('12.4', 'status text element', sceneSrc.includes('pwa-status'));
ok('12.5', 'overlay returns setText/setProgress/close/showButtons',
  sceneSrc.includes('setText:') && sceneSrc.includes('setProgress:') &&
  sceneSrc.includes('close:') && sceneSrc.includes('showButtons:'));

// ── Summary ──────────────────────────────────────────────────────────────────

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL — ' + (pass + fail) + ' total\n');
process.exit(fail > 0 ? 1 : 0);
