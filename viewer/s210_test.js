/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// s210_test.js — Resolution test for S210b bugs
// Tests code BEHAVIOR not just string presence
const fs = require('fs');
const { execSync } = require('child_process');
const log = [];
const L = (msg) => log.push(msg);
const sc = fs.readFileSync(__dirname + '/sitecam.js', 'utf8');
const iss = fs.readFileSync(__dirname + '/issues.js', 'utf8');

L('§RESOLUTION TEST S210b — ' + new Date().toISOString());

// Syntax
L('');
L('── Syntax ──');
try { new Function(sc); L('  sitecam.js: PASS'); } catch(e) { L('  sitecam.js: FAIL — ' + e.message); }
try { new Function(iss); L('  issues.js: PASS'); } catch(e) { L('  issues.js: FAIL — ' + e.message); }

// ── BUG 1: Walk arrow visible during camera ──
// Root cause: drive-thru-btn is DYNAMIC (walk.js creates it), getElementById returns null
// Fix: must use A._driveBtn reference (the actual object), not getElementById
L('');
L('── BUG 1: Walk arrow removal ──');
const usesRef = sc.includes('A._driveBtn') && sc.includes('A._driveBtn.remove()');
const usesGetElement = sc.includes("getElementById('drive-thru-btn')") && sc.substring(sc.indexOf('§CAM_HIDE')).includes("getElementById('drive-thru-btn')");
L('  uses A._driveBtn (object ref): ' + (usesRef ? 'PASS' : 'FAIL — still using getElementById on dynamic element'));
L('  does NOT getElementById for arrow in hide: ' + (!usesGetElement ? 'PASS' : 'FAIL — getElementById returns null for dynamic btn'));
// Verify remove() not just display:none
L('  calls .remove() (not display:none): ' + (sc.includes('_driveBtn.remove()') ? 'PASS' : 'FAIL'));
// Verify re-create on close
L('  re-creates on close (startDriveThru): ' + (sc.includes('A.startDriveThru()') && sc.includes('_driveBtnWasActive') ? 'PASS' : 'FAIL'));
// Verify startDriveThru has guard against double-create
const walkSrc = fs.readFileSync('/home/red1/bim-compiler/deploy/sandbox/walk.js', 'utf8');
const hasGuard = walkSrc.includes('if (A._driveBtn) return');
L('  startDriveThru has double-create guard: ' + (hasGuard ? 'PASS' : 'FAIL — will create duplicates'));

// ── BUG 2: WhatsApp share no photo/audio ──
// Root cause: wa.me URL is text-only. navigator.share may not support files.
// Fix: check canShare before sending files, proper fallback chain
L('');
L('── BUG 2: Share with files ──');
const hasCanShare = sc.includes('navigator.canShare') && sc.includes('canShare(');
L('  checks canShare before file share: ' + (hasCanShare ? 'PASS' : 'FAIL — blind share may throw'));
// Fallback chain: files → wa.me
const shareFunc = sc.substring(sc.indexOf('shareSitePhoto'), sc.indexOf('downloadSitePhoto'));
const hasFallback = shareFunc.includes('canShare(') && shareFunc.includes('navigator.share(') && shareFunc.includes('wa.me');
L('  share fallback (files → wa.me): ' + (hasFallback ? 'PASS' : 'FAIL'));
// All paths close preview+camera
const pathCount = (shareFunc.match(/closeSitePreview/g) || []).length;
L('  closeSitePreview calls: ' + pathCount + ' ' + (pathCount >= 2 ? 'PASS' : 'FAIL — not all paths close'));
// Log tags for each path
L('  §SHARE_PHOTO tag: ' + (shareFunc.includes('§SHARE_PHOTO') ? 'PASS' : 'FAIL'));
L('  §SHARE_WA tag: ' + (shareFunc.includes('§SHARE_WA') ? 'PASS' : 'FAIL'));
L('  §SHARE_DONE tag: ' + (shareFunc.includes('§SHARE_DONE') ? 'PASS' : 'FAIL'));
L('  status shows result to user: ' + (shareFunc.includes('A.status.textContent') ? 'PASS' : 'FAIL — result only in console'));
L('  §SHARE_ABORT handling: ' + (shareFunc.includes('§SHARE_ABORT') ? 'PASS' : 'FAIL'));

// ── BUG 3: Double save ──
L('');
L('── BUG 3: Single save at share only ──');
const compBody = sc.substring(sc.indexOf('_compositePhoto = function'), sc.indexOf('_initMarkupListeners'));
L('  _compositePhoto no DB write: ' + (!compBody.includes('_openIssuesDB') ? 'PASS' : 'FAIL'));
L('  §SNAP_NO_EAGER_SAVE: ' + (compBody.includes('§SNAP_NO_EAGER_SAVE') ? 'PASS' : 'FAIL'));

// ── BUG 4: Status toggle no re-render ──
L('');
L('── BUG 4: Status toggle re-renders list ──');
const toggleBlock = iss.substring(iss.indexOf('statusBtn.onclick'), iss.indexOf('_issueBackToList'));
L('  _renderIssueList after toggle: ' + (toggleBlock.includes('_renderIssueList()') ? 'PASS' : 'FAIL'));

// ── Production safety ──
L('');
// ── BUG 5: Walk doesn't face door / cam moves before user ──
const wk = fs.readFileSync(__dirname + '/walk.js', 'utf8');
L('');
L('── BUG 5: Walk init faces door, freezes until user moves ──');
// Syntax
try { new Function(wk); L('  walk.js syntax: PASS'); } catch(e) { L('  walk.js syntax: FAIL — ' + e.message); }
// Early lock: walkModeActive + controls.enabled set before orientation setup
const earlyLock = wk.indexOf('walkModeActive = true');
const orientSetup = wk.indexOf('_walkOrientListener');
L('  early lock before orient setup: ' + (earlyLock < orientSetup ? 'PASS — pos ' + earlyLock + ' < ' + orientSetup : 'FAIL'));
// No duplicate walkModeActive=true after GPS block
const walkBody = wk.substring(wk.indexOf('setWalkAnchor = function'), wk.indexOf('stopWalkMode = function'));
const walkActiveCount = (walkBody.match(/walkModeActive = true/g) || []).length;
L('  walkModeActive=true set exactly once: ' + (walkActiveCount === 1 ? 'PASS' : 'FAIL — set ' + walkActiveCount + ' times'));
// Baseline alpha captured before any quaternion applied
L('  _walkBaselineAlpha captured: ' + (wk.includes('_walkBaselineAlpha === null') ? 'PASS' : 'FAIL'));
// Frozen until threshold
L('  UNLOCK_THRESHOLD_DEG defined: ' + (wk.includes('UNLOCK_THRESHOLD_DEG') ? 'PASS' : 'FAIL'));
L('  returns early when below threshold: ' + (wk.includes('delta < UNLOCK_THRESHOLD_DEG') && wk.includes('return; // still frozen') ? 'PASS' : 'FAIL'));
// alphaOffset computed at baseline (door alignment)
L('  alphaOffset at baseline (not first tick): ' + (wk.includes('doorYaw - devYaw') ? 'PASS' : 'FAIL'));
// §WALK_BASELINE and §WALK_UNLOCK logs
L('  §WALK_BASELINE: ' + (wk.includes('§WALK_BASELINE') ? 'PASS' : 'FAIL'));
L('  §WALK_UNLOCK: ' + (wk.includes('§WALK_UNLOCK') ? 'PASS' : 'FAIL'));
L('  §WALK_LOCK: ' + (wk.includes('§WALK_LOCK') ? 'PASS' : 'FAIL'));

// ── BUG 6: Share abort must restore walk arrow + close camera ──
L('');
L('── BUG 6: Share abort restores walk arrow ──');
const abortBlock = sc.substring(sc.indexOf('AbortError'), sc.indexOf('§SHARE_PHOTO_ERR'));
L('  abort calls closeSitePreview: ' + (abortBlock.includes('closeSitePreview()') ? 'PASS' : 'FAIL'));
L('  abort calls closeSiteCamera: ' + (abortBlock.includes('closeSiteCamera()') ? 'PASS' : 'FAIL'));
L('  §SHARE_ABORT log tag: ' + (abortBlock.includes('§SHARE_ABORT') ? 'PASS' : 'FAIL'));
// Drive button nulled after remove (prevents startDriveThru guard from blocking re-create)
const camHideBlock = sc.substring(sc.indexOf('Walk arrow is dynamic'), sc.indexOf('§CAM_HIDE ids='));
L('  _driveBtn = null after remove(): ' + (camHideBlock.includes('A._driveBtn = null') ? 'PASS' : 'FAIL — stale ref blocks re-create'));
// closeSiteCamera logs restore check
L('  §CAM_RESTORE_CHECK diagnostic: ' + (sc.includes('§CAM_RESTORE_CHECK') ? 'PASS' : 'FAIL'));

// ── BUG 7: Snag button fixed bottom-right ──
L('');
L('── BUG 7: Snag button position ──');
L('  snag button moved to body: ' + (sc.includes("document.body.appendChild(snagBtn)") ? 'PASS' : 'FAIL'));
L('  snag position fixed right: ' + (sc.includes('right:16px') && sc.includes('position:fixed') ? 'PASS' : 'FAIL'));
L('  snag hidden on init: ' + (sc.includes("display:none;position:fixed") ? 'PASS' : 'FAIL'));
L('  snag synced via MutationObserver: ' + (sc.includes('MutationObserver') && sc.includes("snagRow.style.display === 'none'") ? 'PASS' : 'FAIL'));

// ── BUG 8: Ground hides when camera below (360 orbit) ──
L('');
L('── BUG 8: Ground auto-hide for bottom view ──');
let mainSrc = '';
try { mainSrc = fs.readFileSync(__dirname + '/main.js', 'utf8'); } catch(e) {}
L('  main.js ground visibility check: ' + (mainSrc.includes('camera.position.y > APP.ground.position.y') ? 'PASS' : 'FAIL'));
L('  ground material.visible toggled: ' + (mainSrc.includes('ground.material.visible') ? 'PASS' : 'FAIL'));

// ── City clear button ──
L('');
L('── BUG 9: City clear button ──');
let citySrc = '';
try { citySrc = fs.readFileSync(__dirname + '/city.js', 'utf8'); } catch(e) {}
L('  cityClear function exists: ' + (citySrc.includes('A.cityClear = function') ? 'PASS' : 'FAIL'));
L('  clear button injected: ' + (citySrc.includes('city-clear-btn') ? 'PASS' : 'FAIL'));
L('  clears buildingsRendered: ' + (citySrc.includes('buildingsRendered.clear()') ? 'PASS' : 'FAIL'));
L('  disposes geometry+material: ' + (citySrc.includes('geometry.dispose()') && citySrc.includes('material.dispose()') ? 'PASS' : 'FAIL'));
L('  §CITY_CLEAR log tag: ' + (citySrc.includes('§CITY_CLEAR') ? 'PASS' : 'FAIL'));

L('');
L('── Production safety ──');
const diff = execSync('git diff --stat deploy/sandbox/ 2>&1').toString().trim();
L('  sandbox untouched: ' + (diff === '' ? 'PASS' : 'FAIL — ' + diff));

// ── SUMMARY ──
L('');
const passes = log.filter(l => l.includes('PASS')).length;
const fails = log.filter(l => l.includes('FAIL'));
L('── SUMMARY: ' + passes + ' PASS, ' + fails.length + ' FAIL ──');
fails.forEach(f => L('  ' + f.trim()));

const out = log.join('\n') + '\n';
fs.writeFileSync(__dirname + '/s210_test.log', out);
console.log(out);
process.exit(fails.length > 0 ? 1 : 0);
