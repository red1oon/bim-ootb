// WITNESS — §SCENE_STATE (prompts/Viewer/SAVE_DB_SCENE_STATE.md §1-4 combined-save addendum).
//
// THE CLAIM THIS PROVES OR DISPROVES: Alt+C movie-maker context, Alt+P staffage, and generic scene
// state (camera pos/target, xray, DLOD, walk mode, which panel was open, Find selection, Time
// Machine on/off) all land in the SAME exported .db on one Ctrl+S, and a FRESH load of that file
// (new navigation, no in-memory state carried over) restores all of it — not just staffage (already
// shipped) or cinema_path (already fixed, PR #1122), but the NEW scene_state table too.
//
//   G-SS-1  _exportBuildingDb() on a DB with no scene_state table skip creates one that IS SET, once
//           the camera/xray/find-selection are, and no error is thrown (the write side works).
//   G-SS-2  the written scene_state row matches ground truth captured at save time, byte-for-byte on
//           every field this witness sets (camera IFC coords, xray, dlod, find_guids).
//   G-SS-3  a FRESH load of the exported bytes (new navigation, in-memory state wiped) restores the
//           camera to the saved position/target (within float tolerance) via §SCENE_STATE_RESTORE.
//   G-SS-4  the same fresh load restores xray_on and the Find selection (activeGuidFilter) to what
//           was saved.
//   G-SS-5  staffage placed before save is STILL restored on first Alt+P after the fresh reload (no
//           regression to the existing shipped mechanism from adding scene_state alongside it).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8571;
const BLD = process.env.BLD || 'Duplex';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitReady(page) {
  await page.waitForFunction(() =>
    window.APP && window.APP.camera && window.APP.controls && window.APP._exportBuildingDb,
    { timeout: 120000 });
  await sleep(4000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 1000 });
}

async function goto(page) {
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitReady(page);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const checks = [];
  const P = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n          ${detail}`); };

  console.log(`\n${'='.repeat(78)}\n${BLD} — §SCENE_STATE combined save/restore\n${'='.repeat(78)}`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.evaluateOnNewDocument(() => {
    window.__ssLogs = [];
    var _log = console.log, _warn = console.warn;
    console.log = function() { try { window.__ssLogs.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return _log.apply(console, arguments); };
    console.warn = function() { try { window.__ssLogs.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return _warn.apply(console, arguments); };
  });

  await goto(page);

  // ══ Phase 1 — author a known scene state via real public APIs (not injected internals) ═══════
  const groundTruth = await page.evaluate(() => {
    const A = window.APP;
    // Camera to a known, distinctive pose.
    A.camera.position.set(12.5, 8.25, -4.75);
    A.controls.target.set(1.5, 0.5, 2.5);
    A.controls.update();
    // X-ray on.
    if (!A.xrayOn && typeof A.toggleXray === 'function') A.toggleXray();
    // Find selection: first two element GUIDs found in elements_meta.
    const rows = A.dbQuery('SELECT guid FROM elements_meta LIMIT 2');
    const guids = rows.map(r => r[0]);
    if (guids.length && typeof A.filterByGuids === 'function') A.filterByGuids(new Set(guids));
    const camIfc = A.three2ifc(A.camera.position.x, A.camera.position.y, A.camera.position.z);
    const tgtIfc = A.three2ifc(A.controls.target.x, A.controls.target.y, A.controls.target.z);
    return { camIfc, tgtIfc, xrayOn: A.xrayOn, guids,
             camThree: { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z },
             tgtThree: { x: A.controls.target.x, y: A.controls.target.y, z: A.controls.target.z } };
  });
  P('SETUP a known scene state was authored (camera moved, xray on, 2 elements Find-isolated)',
    groundTruth.xrayOn === true && groundTruth.guids.length === 2,
    `xrayOn=${groundTruth.xrayOn} guids=${JSON.stringify(groundTruth.guids)} camThree=${JSON.stringify(groundTruth.camThree)}`);

  // Time Machine: activate + park the cursor mid-project, same public setters the app itself uses
  // (window.tmActivateForBake / window.tmSetCursor — same as witness_cpe_path_portable.js's setup).
  const tmGroundTruth = await page.evaluate(async () => {
    if (typeof window.tmActivateForBake !== 'function' || typeof window.tmGetState !== 'function') return null;
    const ok = await window.tmActivateForBake();
    if (!ok) return null;
    const tm0 = window.tmGetState();
    const target = tm0.projectStart + Math.round((tm0.projectEnd - tm0.projectStart) * 0.42);
    window.tmSetCursor(target);
    const tm = window.tmGetState();
    return { target, cursor: tm.cursor, span: tm.projectEnd - tm.projectStart };
  });
  P('SETUP Time Machine activated and cursor parked mid-project',
    !!tmGroundTruth && Math.abs(tmGroundTruth.cursor - tmGroundTruth.target) < 2,
    tmGroundTruth ? `cursor=${tmGroundTruth.cursor} target=${tmGroundTruth.target} span=${tmGroundTruth.span}` : 'tmActivateForBake unavailable or no ops');

  // Place one staffage instance too, via the real Alt+P route — reuses the SAME shipped mechanism
  // §SCENE_STATE must not regress. togglePopulate is A.togglePopulate (effects.js).
  const staffagePlaced = await page.evaluate(async () => {
    const A = window.APP;
    if (typeof A.togglePopulate !== 'function') return { ok: false, reason: 'no togglePopulate' };
    A.togglePopulate();
    await new Promise(r => setTimeout(r, 3000));
    const rows = (A._getStaffageInstances && A._getStaffageInstances()) || [];
    return { ok: rows.length > 0, count: rows.length };
  });
  P('SETUP staffage placed via the real Alt+P route (A.togglePopulate)',
    staffagePlaced.ok, JSON.stringify(staffagePlaced));

  // ══ G-SS-1 / G-SS-2 — export and inspect the DB directly (write side) ═════════════════════════
  let mark = logs.length;
  const exportRes = await page.evaluate(() => {
    const A = window.APP;
    const bytes = A._exportBuildingDb();
    const Database = A.db.constructor;
    const d = new Database(bytes);
    const has = d.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='scene_state'");
    const hasTable = has.length > 0 && has[0].values.length > 0;
    let row = null;
    if (hasTable) {
      const r = d.exec('SELECT cam_ifc_x,cam_ifc_y,cam_ifc_z,tgt_ifc_x,tgt_ifc_y,tgt_ifc_z,xray_on,dlod_on,walk_mode,focused_panel,find_guids,tm_on,tm_cursor,tm_span FROM scene_state');
      row = r.length ? r[0].values[0] : null;
    }
    const hasStaffage = d.exec("SELECT COUNT(*) FROM staffage_instances");
    d.close();
    return { hasTable, row, bytesLen: bytes.byteLength, staffageCount: hasStaffage.length ? hasStaffage[0].values[0][0] : 0 };
  });
  const saveLine = logs.slice(mark).filter(l => l.startsWith('§SCENE_STATE_SAVE')).pop();
  P('G-SS-1 export creates a scene_state table with one row, no error',
    exportRes.hasTable && !!exportRes.row, `hasTable=${exportRes.hasTable} row=${JSON.stringify(exportRes.row)}  LOG: ${saveLine || 'none'}`);

  if (exportRes.row) {
    const [cx, cy, cz, tx, ty, tz, xray, , , , findGuids, , tmCursor, tmSpan] = exportRes.row;
    const maxErr = Math.max(
      Math.abs(cx - groundTruth.camIfc.ix), Math.abs(cy - groundTruth.camIfc.iy), Math.abs(cz - groundTruth.camIfc.iz),
      Math.abs(tx - groundTruth.tgtIfc.ix), Math.abs(ty - groundTruth.tgtIfc.iy), Math.abs(tz - groundTruth.tgtIfc.iz));
    const savedGuids = (findGuids || '').split(',').filter(Boolean).sort();
    const wantGuids = groundTruth.guids.slice().sort();
    P('G-SS-2 written scene_state matches ground truth (camera IFC coords, xray, find_guids)',
      maxErr < 1e-6 && xray === 1 && JSON.stringify(savedGuids) === JSON.stringify(wantGuids),
      `maxCamErr=${maxErr.toExponential(2)} xray=${xray} savedGuids=${JSON.stringify(savedGuids)} wantGuids=${JSON.stringify(wantGuids)}`);
    P('G-SS-2b written scene_state carries tm_cursor/tm_span matching the parked TM position',
      !!tmGroundTruth && tmCursor === tmGroundTruth.cursor && tmSpan === tmGroundTruth.span,
      tmGroundTruth ? `saved tmCursor=${tmCursor} tmSpan=${tmSpan}  want cursor=${tmGroundTruth.cursor} span=${tmGroundTruth.span}` : 'no TM ground truth to compare');
  } else {
    P('G-SS-2 written scene_state matches ground truth', false, 'no row to compare — depends on G-SS-1');
    P('G-SS-2b written scene_state carries tm_cursor/tm_span', false, 'no row to compare — depends on G-SS-1');
  }
  P('SETUP staffage_instances also present in the same export (no regression from adding scene_state)',
    exportRes.staffageCount > 0, `staffageCount=${exportRes.staffageCount}`);

  // ══ G-SS-3 / G-SS-4 / G-SS-5 — FRESH load of the exported bytes, in-memory state wiped ════════
  const dismissModal = (async () => {
    try { await page.waitForSelector('#merge-new-btn', { timeout: 8000, visible: true }); await page.click('#merge-new-btn'); }
    catch (e) { /* no modal (no building open at nav time) — fine */ }
  })();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
    page.evaluate(async () => {
      const A = window.APP;
      const bytes = A._exportBuildingDb();
      await A._openDbBytes('scene_state_roundtrip.db', bytes);
    }),
    dismissModal,
  ]);
  await waitReady(page);
  await sleep(3000); // §SCENE_STATE_RESTORE poll (1500ms cadence) + the tm_cursor 600ms follow-up delay

  const pageLogs = await page.evaluate(() => window.__ssLogs || []);
  const restoreLine = pageLogs.filter(l => l.startsWith('§SCENE_STATE_RESTORE ')).pop();
  const postState = await page.evaluate(() => {
    const A = window.APP;
    return {
      cam: { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z },
      tgt: { x: A.controls.target.x, y: A.controls.target.y, z: A.controls.target.z },
      xrayOn: A.xrayOn,
      findGuids: A.activeGuidFilter ? Array.from(A.activeGuidFilter).sort() : null,
    };
  });
  P('G-SS-3 fresh load restores the camera position/target from scene_state',
    !!restoreLine && /camera/.test(restoreLine) &&
    Math.hypot(postState.cam.x - groundTruth.camThree.x, postState.cam.y - groundTruth.camThree.y, postState.cam.z - groundTruth.camThree.z) < 0.01 &&
    Math.hypot(postState.tgt.x - groundTruth.tgtThree.x, postState.tgt.y - groundTruth.tgtThree.y, postState.tgt.z - groundTruth.tgtThree.z) < 0.01,
    `restoreLine=${restoreLine || 'MISSING'}  camNow=${JSON.stringify(postState.cam)} camWant=${JSON.stringify(groundTruth.camThree)}`);
  P('G-SS-4 fresh load restores xray_on and the Find selection',
    postState.xrayOn === true && JSON.stringify(postState.findGuids) === JSON.stringify(groundTruth.guids.slice().sort()),
    `xrayOn=${postState.xrayOn} findGuids=${JSON.stringify(postState.findGuids)} want=${JSON.stringify(groundTruth.guids.slice().sort())}`);

  const tmRestoreLine = pageLogs.filter(l => l.startsWith('§SCENE_STATE_RESTORE_TM')).pop();
  const postTm = await page.evaluate(() => (typeof window.tmGetState === 'function') ? window.tmGetState() : null);
  P('G-SS-6 fresh load restores the Time Machine cursor to the saved position',
    !!tmGroundTruth && !!tmRestoreLine && !!postTm && postTm.active === true &&
    Math.abs(postTm.cursor - tmGroundTruth.cursor) < 2,
    tmGroundTruth
      ? `restoreLine=${tmRestoreLine || 'MISSING'}  cursorNow=${postTm ? postTm.cursor : 'n/a'} cursorWant=${tmGroundTruth.cursor} tmActive=${postTm ? postTm.active : 'n/a'}`
      : 'no TM ground truth to compare');

  const staffageAfterReload = await page.evaluate(async (wantCount) => {
    const A = window.APP;
    if (typeof A.togglePopulate !== 'function') return { ok: false, reason: 'no togglePopulate' };
    A.togglePopulate();
    await new Promise(r => setTimeout(r, 3000));
    const rows = (A._getStaffageInstances && A._getStaffageInstances()) || [];
    return { ok: rows.length === wantCount, count: rows.length };
  }, staffagePlaced.count);
  const restoredLine = pageLogs.concat(await page.evaluate(() => window.__ssLogs || []))
    .filter(l => l.startsWith('§PHOTO_POPULATE') && /restored=/.test(l)).pop();
  P('G-SS-5 no regression: staffage placed before save is still restored on first Alt+P after reload',
    staffageAfterReload.ok, `${JSON.stringify(staffageAfterReload)}  LOG: ${restoredLine || 'none'}`);

  await browser.close();
  const allPass = checks.every(c => c.ok);
  console.log(`\n${allPass ? 'WITNESS PASS' : 'WITNESS FAIL'}  (${checks.filter(c => c.ok).length}/${checks.length})`);
  process.exit(allPass ? 0 : 1);
})();
