// WITNESS — §CPE_PATH_NOT_PORTABLE.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_PATH_NOT_PORTABLE.
//
// THE DEFECT THIS PROVES OR DISPROVES (user, 2026-08-01, after saving Hospital's 'Ajaib' path and
// exporting the DB so it could be baked elsewhere: "if not extractable that means it is a faulty
// design on our part"):
//   1. scene.js `_writeCinemaPathTable(db)` writes `cinema_path` only if `A._cinemaPathEdit` is set
//      — in-memory, current-page-session state.
//   2. cinema_path_editor.js `_pathsApply` (opening a named plan from IndexedDB) used to set
//      `_state.staged = false` and never call `A.stageCinemaPath` — so after ANY reload,
//      `A._cinemaPathEdit` stays null even though the user just opened an authored plan.
//   3. The guard `if (!ov || !ov.bands || ov.bands.length < 2) return;` returned SILENTLY — no `§`
//      line, no warning that the save about to happen drops the path.
// Real user path: author a path -> "Save this path" (names it, IndexedDB) -> close the editor ->
// (maybe days later) reload the page -> Alt+C -> open the saved plan from the list -> Ctrl+S. A
// 260 MB file comes out with no `cinema_path` table and nothing said so.
//
//   G-PP-1  RED on origin/main: after the reload+reopen above, A._cinemaPathEdit is null and the
//           exported DB has NO cinema_path table. After the fix: staged immediately on open, and
//           the exported DB's cinema_path row count equals the authored band count.
//   G-PP-2  round-trip fidelity: cinema_path rows (IFC space) reproduce the authored bands' anchors/
//           directions/lengths, computed the SAME way _writeCinemaPathTable does (A.three2ifc/Dir),
//           within float tolerance.
//   G-PP-3  the skip is LOUD: with nothing staged, export logs a named reason instead of returning
//           silently; with fewer than 2 bands staged, same; a real staged path logs the existing
//           positive §CINEMA_PATH_SAVE line.
//   G-PP-4  end-to-end: load the written DB FRESH (new navigation) and confirm §CINEMA_PATH_RESTORE
//           reports a restored path AND the next plan build logs §CINEMA_BEATS route=authored.
//   G-PP-5  no regression: a save with nothing authored still produces a valid DB (openable, correct
//           element count) and does NOT create an empty cinema_path table.
//
// §CPE_PANEL_STATE gates (added 2026-08-02) — THE ISSUE: "Save this path" persisted only the
// path/override; the PANEL CONTEXT it was recorded under (checkbox states, Time Machine total span,
// the day the counter currently shows) was dropped, so reopening a saved plan did not restore the
// session. RED on pre-fix code proves the drop; GREEN proves restore matches save byte-for-byte.
//   G-PS-1  the saved IndexedDB record carries `panelState` — checkboxes {buildup, roomTitle}
//           (the CPE panel's full checkbox census), dayCounter corner, tmCursor / tmSpanMs from
//           window.tmGetState(). RED: rec.panelState === undefined — the context is dropped at save.
//   G-PS-2  after reload + open, the PANEL CONTROLS show the saved context (#cpe-buildup.checked,
//           #cpe-room-title.checked, #cpe-day-counter.value). RED: _state is restored from the
//           override but the DOM controls are not re-seeded — the panel lies about the plan.
//   G-PS-3  the day-counter position is restored: with TM active, tmGetState().cursor equals the
//           saved cursor (restored via the ONE public setter window.tmSetCursor). RED: cursor is
//           never touched on open — the counter shows whatever day the session happened to be at.
//   G-PS-4  byte-for-byte: every restored value equals the saved record's panelState exactly.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8461;
const BLD = process.env.BLD || 'Duplex';
const PLAN_NAME = 'CPE_WITNESS_PLAN';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitReady(page) {
  await page.waitForFunction(() =>
    window.APP && window.APP.camera && window.APP.cinemaPathEditor &&
    window.APP.startMaxQualityOrbit && window.APP._exportBuildingDb && window.APP.cinemaPathPlan,
    { timeout: 120000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });
}

async function goto(page) {
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitReady(page);
}

async function reload(page) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitReady(page);
}

// The REAL entry: Alt+C's own code path with the editor armed. Retried, because a bake left running
// from a previous OK makes start() a cancel request instead (cinema_maxq.js:420).
async function openEditor(page, tries = 8) {
  for (let t = 0; t < tries; t++) {
    await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1, frames: 4, editor: true }); });
    try {
      await page.waitForSelector('#cpe-ok', { timeout: 20000 });
      await sleep(800);
      return true;
    } catch (e) { await sleep(2500); }
  }
  return false;
}

const HANDLE_CLEAR_PX = 26;

// Same precedent as witness_cpe_reopen_node.js: the editor opens at the pre-dive orbit pose, where
// a small building's walk projects into a tiny smear on screen. Move in close so a pipe pixel exists
// outside every handle's grab radius.
async function lookCloser(page) {
  const ok = await page.evaluate(() => {
    const A = window.APP, hs = A.cinemaPathEditor._probeHandles();
    if (!hs || !hs.length) return false;
    const mid = hs[Math.floor(hs.length / 2)];
    A.controls.target.set(mid.x, mid.y, mid.z3);
    A.camera.position.set(mid.x + 7, mid.y + 6, mid.z3 + 7);
    A.controls.update();
    if (A.markDirty) A.markDirty();
    return true;
  });
  await sleep(700);
  return ok;
}

async function findPipePixel(page) {
  const diag = [];
  for (let f = 0.02; f <= 0.98; f += 0.01) {
    const spot = await page.evaluate((f, clear) => {
      const cpe = window.APP.cinemaPathEditor;
      if (!cpe || !cpe._pipePixel || !cpe._probePipe) return null;
      const p = cpe._pipePixel(f);
      if (!p || !cpe._probePipe(p.x, p.y)) return null;
      const hs = cpe._probeHandles() || [];
      let near = 1e9;
      for (const h of hs) { if (h.px == null) continue; near = Math.min(near, Math.hypot(h.px - p.x, h.py - p.y)); }
      if (near < clear) return { why: 'handle ' + near.toFixed(0) + 'px' };
      if (document.elementFromPoint(p.x, p.y) !== window.APP.canvas) return null;
      return { px: p.x, py: p.y, frac: f };
    }, f, HANDLE_CLEAR_PX);
    if (spot && spot.px !== undefined) return spot;
    if (spot && spot.why) diag.push(f.toFixed(2) + ':' + spot.why);
  }
  console.log('        no usable pipe pixel — ' + diag.slice(0, 10).join(', ') + (diag.length ? '' : '(nothing hit the pipe at all)'));
  return null;
}

async function clickPipe(page, px, py) {
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(px + 2, py);
  await sleep(60);
  await page.mouse.up();
  await sleep(900);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const checks = [];
  const P = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n          ${detail}`); };
  let inconclusive = false;

  console.log(`\n${'='.repeat(78)}\n${BLD} — §CPE_PATH_NOT_PORTABLE\n${'='.repeat(78)}`);

  let authoredOv = null, authoredIfc = null;   // stashed at authoring time, read back in later phases
  let savedTmTruth = null, savedRec = null;    // §CPE_PANEL_STATE ground truth captured at save time

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  page.on('dialog', d => d.accept(PLAN_NAME));
  // In-page log sink, re-installed before every document's own scripts run (evaluateOnNewDocument),
  // reset to [] at the top of each fresh load. Used ONLY around the G-PP-4 full-navigation reload:
  // Puppeteer's page.on('console') Node-side listener can miss the first console lines emitted right
  // after a hard navigation (CDP Runtime domain re-attach gap) — measured here, `§CINEMA_PATH_RESTORE`
  // went missing from the Node-side `logs` array while the state it set (route=authored) was real and
  // present. A page-internal sink cannot race that reattach.
  await page.evaluateOnNewDocument(() => {
    window.__cpeLogs = [];
    var _log = console.log, _warn = console.warn;
    console.log = function() { try { window.__cpeLogs.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return _log.apply(console, arguments); };
    console.warn = function() { try { window.__cpeLogs.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return _warn.apply(console, arguments); };
  });

  await goto(page);

  // ══ Phase 1 — author a real edit, "Save this path" under a name ══════════════════════════════
  if (!await openEditor(page)) { P('SETUP editor opens', false, 'no #cpe-ok — INCONCLUSIVE'); inconclusive = true; }
  if (!inconclusive) {
    await lookCloser(page);
    const spot = await findPipePixel(page);
    if (!spot) { P('SETUP pipe reachable on screen', false, 'no usable pipe pixel — INCONCLUSIVE'); inconclusive = true; }
    else {
      const before = await page.evaluate(() => window.APP.cinemaPathEditor._probeOverride().bands.length);
      await clickPipe(page, spot.px, spot.py);
      const afterEdit = await page.evaluate(() => window.APP.cinemaPathEditor._probeOverride());
      P('SETUP a real edit was authored (a stick spawned via a genuine pipe click, not injected)',
        !!afterEdit && afterEdit.bands.length === before + 1,
        `bands ${before} -> ${afterEdit ? afterEdit.bands.length : 'null'}`);

      if (!afterEdit || afterEdit.bands.length !== before + 1) { inconclusive = true; }
      else {
        authoredOv = afterEdit; // stash for later phases

        // Ground truth in IFC space, computed the SAME way _writeCinemaPathTable does.
        authoredIfc = await page.evaluate((ov) => {
          const A = window.APP;
          return ov.bands.map(b => {
            const p = A.three2ifc(b.c.x, b.c.y, b.c.z);
            const d = A.three2ifcDir(b.d.x, b.d.y, b.d.z);
            return { ix: p.ix, iy: p.iy, iz: p.iz, dx: d.ix, dy: d.iy, dz: d.iz, len: b.len };
          });
        }, afterEdit);

        // ── §CPE_PANEL_STATE setup: put the panel into a NON-DEFAULT context before saving, so a
        // dropped context is distinguishable from a default one. Real controls, real change events.
        await page.click('#cpe-buildup');       // buildup ON  (default off)
        await page.click('#cpe-room-title');    // room titles ON (default off)
        await page.select('#cpe-day-counter', 'bl');  // corner bottom-left (default tr)
        await sleep(600);
        // Time Machine context: activate (derived timeline) and park the cursor mid-project —
        // a value no default lands on — through the same public setter the app itself uses.
        savedTmTruth = await page.evaluate(async () => {
          if (typeof window.tmActivateForBake !== 'function' || typeof window.tmGetState !== 'function') return null;
          const ok = await window.tmActivateForBake();
          if (!ok) return null;
          const tm0 = window.tmGetState();
          const target = tm0.projectStart + Math.round((tm0.projectEnd - tm0.projectStart) * 0.37);
          window.tmSetCursor(target);
          const tm = window.tmGetState();
          return { target, cursor: tm.cursor, projectStart: tm.projectStart, projectEnd: tm.projectEnd,
                   spanMs: tm.projectEnd - tm.projectStart };
        });
        P('SETUP Time Machine context established (active, cursor parked mid-project)',
          !!savedTmTruth && Math.abs(savedTmTruth.cursor - savedTmTruth.target) < 2,
          savedTmTruth ? `cursor=${savedTmTruth.cursor} target=${savedTmTruth.target} spanMs=${savedTmTruth.spanMs}` : 'tmActivateForBake unavailable or no ops');

        let mark = logs.length;
        await page.click('#cpe-save');
        await sleep(1200);
        const savedLine = logs.slice(mark).filter(l => l.startsWith('§CPE_PATH_SAVED')).pop();
        P('SETUP plan named and saved to IndexedDB', !!savedLine, savedLine || 'no §CPE_PATH_SAVED line');

        // ── G-PS-1: the record itself carries panelState (read straight from IndexedDB) ──
        savedRec = await page.evaluate((name) => new Promise((res, rej) => {
          const rq = indexedDB.open('bim_ootb_cinema_paths', 1);
          rq.onsuccess = () => {
            const db = rq.result, g = db.transaction('paths', 'readonly').objectStore('paths').getAll();
            g.onsuccess = () => { db.close(); res((g.result || []).filter(r => r.name === name).pop() || null); };
            g.onerror = () => { db.close(); rej(g.error); };
          };
          rq.onerror = () => rej(rq.error);
        }), PLAN_NAME);
        const ps = savedRec && savedRec.panelState;
        P('G-PS-1 the saved record carries panelState (checkboxes + dayCounter + tmCursor/tmSpanMs) ' +
          '(THE drop: pre-fix, rec.panelState is undefined — the recording context never reaches the store)',
          !!ps && ps.checkboxes && ps.checkboxes.buildup === true && ps.checkboxes.roomTitle === true &&
          ps.dayCounter === 'bl' && savedTmTruth && ps.tmCursor === savedTmTruth.cursor &&
          ps.tmSpanMs === savedTmTruth.spanMs,
          ps ? `panelState=${JSON.stringify(ps)}` : `rec keys=${savedRec ? Object.keys(savedRec).join(',') : 'no record'} — panelState MISSING`);

        // Close via CANCEL, not OK — an untouched-vs-edited OK has its OWN pre-existing staging path
        // (finish() -> stageCinemaPath on an edited OK); using it here would mask exactly the bug
        // this witness exists to catch. Cancel is also the honest user action for "looked back at it".
        await page.click('#cpe-cancel');
        await sleep(400);
      }
    }
  }

  // ══ Phase 2 — RELOAD. The whole point: wipes in-memory A._cinemaPathEdit, IndexedDB survives. ══
  let preReloadStaged = null, postReloadEdit = 'skipped';
  if (!inconclusive) {
    preReloadStaged = await page.evaluate(() => !!(window.APP._getCinemaPathEdit && window.APP._getCinemaPathEdit()));
    await reload(page);
    postReloadEdit = await page.evaluate(() => window.APP._getCinemaPathEdit ? window.APP._getCinemaPathEdit() : 'no-hook');
    P('RED-SETUP the reload actually happened (in-memory staging wiped, exactly the user\'s path)',
      preReloadStaged === true && postReloadEdit === null,
      `staged before reload=${preReloadStaged}  A._cinemaPathEdit after reload=${JSON.stringify(postReloadEdit)}`);
  }

  // ══ Phase 3 — open the saved plan from IndexedDB, the real Alt+C -> dropdown -> open route ═════
  let stagedAfterOpen = 'skipped', exportRes = null, writeLineAfterOpen = null;
  if (!inconclusive) {
    if (!await openEditor(page)) { P('G-PP-1 editor reopens after reload', false, 'no #cpe-ok — INCONCLUSIVE'); inconclusive = true; }
  }
  if (!inconclusive) {
    const optIdx = await page.evaluate((name) => {
      const sel = document.getElementById('cpe-plans');
      for (let i = 0; i < sel.options.length; i++) if (sel.options[i].textContent === name) return i;
      return -1;
    }, PLAN_NAME);
    P('SETUP the saved plan is listed after reload (IndexedDB persisted across it)', optIdx >= 0, `option index=${optIdx}`);
    if (optIdx < 0) { inconclusive = true; }
    else {
      // §CPE_PANEL_STATE: re-activate TM BEFORE opening the plan — the cursor restore goes through
      // tmSetCursor and (by design) only writes when TM is active; the witness must be in the state
      // a buildup user actually is in. The reload wiped _active/_cursor — that is the RED condition.
      const tmReady = await page.evaluate(async () =>
        (typeof window.tmActivateForBake === 'function') ? await window.tmActivateForBake() : false);
      P('SETUP Time Machine re-activated after reload (cursor at whatever the activation left, NOT the saved day)',
        tmReady === true, `tmActivateForBake=${tmReady}`);
      await page.select('#cpe-plans', String(optIdx));
      let mark = logs.length;
      await page.click('#cpe-plan-open');
      await sleep(800);
      const loadedLine = logs.slice(mark).filter(l => l.startsWith('§CPE_PATH_LOADED')).pop();
      P('SETUP the plan opened successfully from IndexedDB', !!loadedLine, loadedLine || 'no §CPE_PATH_LOADED line');

      // ── §CPE_PANEL_STATE after the reload: does the reopened plan restore the recording context? ──
      const psLine = logs.slice(mark).filter(l => l.startsWith('§CPE_PANEL_STATE')).pop();
      const domState = await page.evaluate(() => ({
        buildup: !!document.getElementById('cpe-buildup').checked,
        roomTitle: !!document.getElementById('cpe-room-title').checked,
        dayCounter: document.getElementById('cpe-day-counter').value,
        tm: (typeof window.tmGetState === 'function') ? window.tmGetState() : null,
      }));
      P('G-PS-2 the PANEL CONTROLS show the saved context after reload+open ' +
        '(THE drop: pre-fix, _state is set from the override but the checkboxes/select are never re-seeded)',
        domState.buildup === true && domState.roomTitle === true && domState.dayCounter === 'bl',
        `#cpe-buildup=${domState.buildup} #cpe-room-title=${domState.roomTitle} #cpe-day-counter=${domState.dayCounter}` +
        `  LOG: ${psLine || 'no §CPE_PANEL_STATE line'}`);
      P('G-PS-3 the day-counter position (TM cursor) is restored through window.tmSetCursor ' +
        '(THE drop: pre-fix, opening a plan never touches the cursor)',
        !!savedTmTruth && !!domState.tm && domState.tm.active === true &&
        Math.abs(domState.tm.cursor - savedTmTruth.cursor) < 2,
        savedTmTruth && domState.tm
          ? `cursor now=${domState.tm.cursor} saved=${savedTmTruth.cursor} diff=${Math.abs(domState.tm.cursor - savedTmTruth.cursor)}ms tmActive=${domState.tm.active}`
          : 'no TM state to compare');
      const psSaved = savedRec && savedRec.panelState;
      // Byte-for-byte on every RESTORABLE value (checkboxes, corner, cursor — the values the feature
      // writes back). The span has NO setter (derived from the op-log — a reload re-derives it, and
      // TM's derived synthesis is not ms-identical across loads), so the CONTRACT there is a drift
      // check: equal spans stay silent, unequal spans are reported by the §CPE_PANEL_STATE span-drift
      // warn — never silently absorbed.
      const spanNow = domState.tm ? (domState.tm.projectEnd - domState.tm.projectStart) : null;
      const spanEqual = !!psSaved && spanNow != null && Math.abs(spanNow - psSaved.tmSpanMs) <= 1;
      const driftLine = logs.slice(mark).filter(l => l.indexOf('§CPE_PANEL_STATE span drift') >= 0).pop();
      P('G-PS-4 byte-for-byte: every restored value equals the saved panelState exactly; the ' +
        'non-settable span either matches or its drift is REPORTED, never silent',
        !!psSaved && domState.buildup === psSaved.checkboxes.buildup &&
        domState.roomTitle === psSaved.checkboxes.roomTitle &&
        domState.dayCounter === psSaved.dayCounter &&
        !!domState.tm && domState.tm.cursor === psSaved.tmCursor &&
        (spanEqual || !!driftLine),
        psSaved && domState.tm
          ? `saved={buildup:${psSaved.checkboxes.buildup},roomTitle:${psSaved.checkboxes.roomTitle},day:${psSaved.dayCounter},cursor:${psSaved.tmCursor},span:${psSaved.tmSpanMs}} ` +
            `restored={buildup:${domState.buildup},roomTitle:${domState.roomTitle},day:${domState.dayCounter},cursor:${domState.tm.cursor},span:${spanNow}}` +
            `  spanEqual=${spanEqual} DRIFT: ${driftLine || 'none logged'}`
          : `saved panelState=${JSON.stringify(psSaved)} — nothing to compare byte-for-byte`);

      // ── G-PP-1a: is the just-opened plan actually staged for Ctrl+S? ──
      stagedAfterOpen = await page.evaluate(() => {
        const ov = window.APP._getCinemaPathEdit ? window.APP._getCinemaPathEdit() : 'no-hook';
        return ov && ov.bands ? { bands: ov.bands.length } : ov;
      });
      const wantBands = authoredOv.bands.length;
      P('G-PP-1a opening a named plan RE-STAGES it (A._cinemaPathEdit reflects what was just opened)',
        stagedAfterOpen && stagedAfterOpen.bands === wantBands,
        `A._getCinemaPathEdit() = ${JSON.stringify(stagedAfterOpen)}  (want bands=${wantBands})`);

      // Close the way the user actually would after "looking back" — Cancel, not OK.
      await page.click('#cpe-cancel');
      await sleep(400);

      // ── G-PP-1b / G-PP-3 positive case: Ctrl+S (A._exportBuildingDb) now writes cinema_path. ──
      mark = logs.length;
      exportRes = await page.evaluate(() => {
        const A = window.APP;
        const bytes = A._exportBuildingDb();
        const Database = A.db.constructor;
        const d = new Database(bytes);
        const has = d.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='cinema_path'");
        const hasTable = has.length > 0 && has[0].values.length > 0;
        let rows = null;
        if (hasTable) { const r = d.exec("SELECT seq,ifc_x,ifc_y,ifc_z,dir_x,dir_y,dir_z,len FROM cinema_path ORDER BY seq"); rows = r.length ? r[0].values : []; }
        d.close();
        return { hasTable, rowCount: rows ? rows.length : 0, rows, bytesLen: bytes.byteLength };
      });
      writeLineAfterOpen = logs.slice(mark).filter(l => l.startsWith('§CINEMA_PATH_SAVE') || l.startsWith('§CINEMA_PATH_WRITE')).pop();
      P('G-PP-1 the exported DB actually contains cinema_path with the authored band count ' +
        '(THE bug: on origin/main this is hasTable=false — the path could not leave the machine)',
        exportRes.hasTable && exportRes.rowCount === wantBands,
        `hasTable=${exportRes.hasTable} rows=${exportRes.rowCount} (want ${wantBands}) bytes=${exportRes.bytesLen}  LOG: ${writeLineAfterOpen || 'none'}`);

      // ── G-PP-2: round-trip fidelity, IFC space, against the ground truth captured at authoring time.
      if (exportRes.hasTable && exportRes.rows && exportRes.rows.length === authoredIfc.length) {
        let maxErr = 0;
        exportRes.rows.forEach((r, i) => {
          const truth = authoredIfc[i];
          const [, ix, iy, iz, dx, dy, dz, len] = r;
          maxErr = Math.max(maxErr,
            Math.abs(ix - truth.ix), Math.abs(iy - truth.iy), Math.abs(iz - truth.iz),
            Math.abs(dx - truth.dx), Math.abs(dy - truth.dy), Math.abs(dz - truth.dz),
            Math.abs(len - truth.len));
        });
        P('G-PP-2 round-trip fidelity: cinema_path rows reproduce the authored bands (IFC space)',
          maxErr < 1e-6, `maxAbsErr=${maxErr.toExponential(2)} over ${exportRes.rows.length} bands`);
      } else {
        P('G-PP-2 round-trip fidelity: cinema_path rows reproduce the authored bands (IFC space)',
          false, `cannot compare — hasTable=${exportRes.hasTable} rows=${exportRes.rowCount} vs authored=${authoredIfc.length}`);
      }
    }
  }
  if (inconclusive) {
    P('G-PP-1', false, 'INCONCLUSIVE — a prerequisite step failed, see SETUP lines above');
    P('G-PP-2', false, 'INCONCLUSIVE — depends on G-PP-1');
  }

  // ══ G-PP-3 — the guard SPEAKS, both negative cases ═══════════════════════════════════════════
  const g3 = await page.evaluate(() => {
    const A = window.APP;
    const saved = A._cinemaPathEdit;
    A._cinemaPathEdit = null;
    A._exportBuildingDb();
    A._cinemaPathEdit = { bands: [{ c: { x: 0, y: 0, z: 0 }, d: { x: 1, y: 0, z: 0 }, len: 1 }],
                           diveSec: 1, spinSec: 1, outSec: 1, riseSec: 1, _total: 3 };
    A._exportBuildingDb();
    A._cinemaPathEdit = saved || null;
    return true;
  });
  const noStagedLine = logs.filter(l => /§CINEMA_PATH_WRITE skipped reason=no-staged-path/.test(l)).pop();
  const fewBandsLine = logs.filter(l => /§CINEMA_PATH_WRITE skipped reason=bands=1<2/.test(l)).pop();
  P('G-PP-3a the skip is LOUD with nothing staged (named reason, not a silent return)',
    !!noStagedLine, noStagedLine || 'no §CINEMA_PATH_WRITE skip line — silent as before the fix');
  P('G-PP-3b the skip is LOUD with < 2 bands staged (named reason, not a silent return)',
    !!fewBandsLine, fewBandsLine || 'no §CINEMA_PATH_WRITE skip line — silent as before the fix');
  P('G-PP-3c a real staged path still logs the existing positive line',
    !!writeLineAfterOpen && writeLineAfterOpen.startsWith('§CINEMA_PATH_SAVE'),
    writeLineAfterOpen || 'no §CINEMA_PATH_SAVE line on the real save above');

  // ══ G-PP-4 — end-to-end: load the WRITTEN bytes fresh, restore, and fly the authored route ═════
  if (!inconclusive && exportRes && exportRes.hasTable) {
    // _openDbBytes(): a building is already open, so it shows the merge-vs-replace modal before it
    // navigates (scene.js:990 `_showMergeModal`) — pick "New" (Escape / #merge-new-btn), the replace
    // path, same as witness_cinema_path_persist.js's round-trip which this mirrors.
    const dismissModal = (async () => {
      try { await page.waitForSelector('#merge-new-btn', { timeout: 8000, visible: true }); await page.click('#merge-new-btn'); }
      catch (e) { /* modal never appeared — fine, nothing to dismiss */ }
    })();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
      page.evaluate(async () => {
        const A = window.APP;
        const bytes = A._exportBuildingDb();
        A._cinemaPathEdit = null;   // nothing may survive in memory — must come from the file
        await A._openDbBytes('cpe_portable_roundtrip.db', bytes);
      }),
      dismissModal,
    ]);
    await waitReady(page);
    await page.evaluate(() => { window.APP.cinemaPathPlan(24); });
    await sleep(200);
    // Read from the in-page sink (see setup above) — immune to the Node-side console-listener gap
    // right after a hard navigation, which measurably dropped this exact line on a real run.
    const pageLogs = await page.evaluate(() => window.__cpeLogs || []);
    const restoreLine = pageLogs.filter(l => l.startsWith('§CINEMA_PATH_RESTORE')).pop();
    const beatsLine = pageLogs.filter(l => l.startsWith('§CINEMA_BEATS')).pop();
    P('G-PP-4 fresh load of the WRITTEN db restores the authored path',
      !!restoreLine && /bands=/.test(restoreLine) && !/none/.test(restoreLine),
      restoreLine || 'no §CINEMA_PATH_RESTORE line');
    P('G-PP-4 the restored path is what actually FLIES (route=authored, not derived)',
      !!beatsLine && /route=authored/.test(beatsLine),
      beatsLine || 'no §CINEMA_BEATS line');
  } else {
    P('G-PP-4 fresh load of the WRITTEN db restores the authored path', false, 'INCONCLUSIVE — no exported bytes with a table to load (depends on G-PP-1)');
    P('G-PP-4 the restored path is what actually FLIES (route=authored, not derived)', false, 'INCONCLUSIVE — depends on the line above');
  }

  // ══ G-PP-5 — no regression: a save with nothing authored is still a valid DB, no empty table ═══
  await goto(page); // fresh, unedited page
  const g5 = await page.evaluate(() => {
    const A = window.APP;
    A._cinemaPathEdit = null;
    const bytes = A._exportBuildingDb();
    const Database = A.db.constructor;
    const d = new Database(bytes);
    const has = d.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='cinema_path'");
    const hasTable = has.length > 0 && has[0].values.length > 0;
    const et = d.exec('SELECT COUNT(*) FROM element_transforms');
    const etCount = et.length ? et[0].values[0][0] : -1;
    d.close();
    return { hasTable, etCount, bytesLen: bytes.byteLength };
  });
  P('G-PP-5 no regression: an unedited save is a valid DB with no empty cinema_path table',
    g5.hasTable === false && g5.etCount > 0,
    `cinema_path present=${g5.hasTable} element_transforms=${g5.etCount} bytes=${g5.bytesLen}`);

  await browser.close();
  const allPass = checks.every(c => c.ok);
  console.log(`\n${allPass ? 'WITNESS PASS' : 'WITNESS FAIL'}  (${checks.filter(c => c.ok).length}/${checks.length})`);
  process.exit(allPass ? 0 : 1);
})();
