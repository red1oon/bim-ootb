#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-VIEWER-EXPORT-MENU (bim-ootb prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md §(a) SPEC, extended by §(b2) SPEC: Schedule + 5D cost rows). Scope: the Viewer toolbar's ONE Export pill + menu. READ THE LOG after every run; the exit code is not evidence.
// ISSUE IT PROVES OR DISPROVES: "a user cannot find IFC or BCF export from the toolbar" (Save Building wrote a .db only; IFC lived in Share, BCF in the Issues panel).
//   E1 MENU    the real pill tap (#mobile-trigger -> #pill-save, real mouse) opens a panel whose rows are exactly db, ifc, bcf, schedule, cost5d (judged from the DOM, population printed).
//   E2 DB      Building (.db) reaches A.saveModelDb: §SAVE_DONE mode=download name=<building>.db and a real file that starts with the SQLite magic.
//   E3 IFC     IFC (whole building) reaches A.exportIFC: §EXPORT_IFC and a real .ifc file (ISO-10303-21 header, IFC4).
//   E4 BCF     with no saved issue the row is disabled (data-disabled=1, reason no_saved_issues), a click is refused with a § line and NO file; after ONE issue saved through the
//              page's own A._saveIssueToLog the row is enabled and a click writes a real .bcfzip (zip magic, §BCF export topics=1).
//   E5 CTRL+S  the real Ctrl+S keystroke still runs the save (§KBD_ROUTE Ctrl+S -> §SAVE_DONE and a second .db file).
//   E6 WORDS   the pill title is "Export" (en) and the same dictionary rows resolve in de_DE (pill_export, ui_exp_db, and the two (b2) labels ui_exp_sched / ui_exp_5d) - not English leaking through.
//   E7a NOSCHED on a building with NO schedule (ScheduleAuthor.wbsTree empty) the Schedule row is disabled with why=no_schedule, a tap logs `blocked reason=no_schedule`, writes no file, and the menu did not
//              generate a schedule (wbsTree still empty after the tap and after the menu was opened twice).
//   E7b SCHED   after the page's OWN Time Machine (the real 't' key) makes the schedule, the Schedule row is enabled; MSP / PMXML / XER from the menu (the chips choose the format, a chip tap writes nothing)
//              are byte-equal to what the drawer's own #tm-p6-export-msp / -pmxml / -xer buttons write on the same page (ONE writer each); the MSP file re-read by ForeignSchedule.parseForeign holds
//              the task count of the page's §TM_EXPORT_MSP tasks=; the XER starts ERMHDR; the PMXML holds APIBusinessObjects.
//   E8 5D       the cost5d tap opens boq_charts.html with export=5d (the new tab's URL), that page logs §BOQ_AUTO_EXPORT kind=5d file=BIM_OOTB_<bld>_5D_BOQ_<date>.xlsx and the download starts with PK; the same
//              page opened WITHOUT export=5d writes no file and logs no §BOQ_AUTO_EXPORT (non-impact control).
//   INCONCLUSIVE when the page never became ready, the pill/menu never opened, no file could be judged, or the Time Machine never produced a schedule (E7b). Software GL only (swiftshader), no GPU.
//   RED CONTROL  EXPORT_MENU_RED=nobcf removes the BCF row from the opened panel: E1 and E4 must FAIL (exit 1).   EXPORT_MENU_RED=noschedgate stubs ScheduleAuthor.wbsTree non-empty while E7a runs (the no_schedule gate no longer
//               sees an empty schedule): E7a must FAIL (exit 1).
// Run:  node viewer/tests/witness_viewer_export_menu.js     (starts its own python http.server on a free port, kills it by PID)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net'), cp = require('child_process');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.join(__dirname, '..', '..');
const RED = process.env.EXPORT_MENU_RED || '';
const LOGF = process.env.LOG || path.join(__dirname, 'logs', 'witness_viewer_export_menu' + (RED ? '_red_' + RED : '') + '.log');
fs.mkdirSync(path.dirname(LOGF), { recursive: true });
const OUT = []; const log = (s) => { OUT.push(s); console.log(s); };
const sl = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const results = []; const ck = (id, ok, msg) => { results.push({ id, ok }); log((ok ? '§PASS ' : '§FAIL ') + id + ' ' + msg); };

(async () => {
  const port = await freePort();
  const srv = cp.spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'vexp-dl-')), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'vexp-prof-'));
  let browser = null;
  const finish = async (code) => { fs.writeFileSync(LOGF, OUT.join('\n') + '\n'); try { if (browser) await browser.close(); } catch (e) { } try { srv.kill(); } catch (e) { } process.exit(code); };
  const inconclusive = async (why) => { log('§W-VIEWER-EXPORT-MENU INCONCLUSIVE ' + why + ' — nothing judged'); await finish(2); };
  try {
    await sl(800);
    browser = await puppeteer.launch({ headless: true, userDataDir: prof, protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const cdp = await browser.target().createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
    const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 800 });
    const lines = []; const errs = [];
    page.on('console', (m) => { const t = m.text(); if (/§(VIEWER_EXPORT|SAVE_|EXPORT_IFC|BCF|ISSUE_SAVED|KBD_ROUTE|LOAD_FAIL|TM_EXPORT|TM_P6)|\[S229\]|\[S205\]/.test(t)) { lines.push(t); log('  [con] ' + t.slice(0, 220)); } });
    page.on('pageerror', (e) => { errs.push(e.message); log('  [pageerror] ' + e.message.slice(0, 200)); });
    await page.evaluateOnNewDocument(() => { try { delete window.showSaveFilePicker; } catch (e) { } window.showSaveFilePicker = undefined; });   // the native Save-As picker cannot be driven headless: the download fallback of the same function runs
    await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=/buildings/warehouse_gardenworld.db', { waitUntil: 'domcontentloaded', timeout: 180000 });
    let ready = false; for (let i = 0; i < 240 && !ready; i++) { await sl(500); try { ready = await page.evaluate(() => !!(window.APP && APP.db && APP.streaming === false && APP.openExportMenu && document.getElementById('pill-save'))); } catch (e) { } }
    if (!ready) return inconclusive('page never became ready (APP.db + A.openExportMenu + #pill-save)');
    await sl(1500);
    const building = await page.evaluate(() => APP.activeBuilding);
    // GardenWorld is a warehouse: the Viewer auto-engages the pick-walk (wh_walk.js §C-1) which hides the ⋯ pill while it runs. A user leaves it with the walk's own X, so the witness does the same (real click).
    for (let i = 0; i < 40; i++) { const on = await page.evaluate(() => { const w = document.getElementById('wh-close'); return !!(w && w.getBoundingClientRect().width > 0); }); if (on) { await page.click('#wh-close'); log('  [step] walk engaged -> left with its own X (#wh-close)'); break; } const t = await page.evaluate(() => getComputedStyle(document.getElementById('mobile-trigger')).display); if (t !== 'none' && i > 12) break; await sl(500); }
    await sl(1500);
    log('§VIEWER_EXPORT_MENU_WITNESS building=' + building + ' port=' + port + ' red=' + (RED || 'none'));

    const files = () => fs.readdirSync(dl).filter((f) => !/\.crdownload$|\.tmp$/.test(f) && fs.statSync(path.join(dl, f)).isFile()).map((f) => ({ f, buf: fs.readFileSync(path.join(dl, f)) }));
    const waitFile = async (re, n0, ms) => { for (let i = 0; i < ms / 500; i++) { const hit = files().filter((x) => re.test(x.f)); if (hit.length > n0) return hit[hit.length - 1]; await sl(500); } return null; };
    const count = (re) => files().filter((x) => re.test(x.f)).length;
    const openMenu = async () => {   // the real pill: ⋯ trigger, then the Export button, with the mouse
      const shown = await page.evaluate(() => { const p = document.getElementById('v-export-panel'); return !!(p && p.style.display === 'block'); });
      if (shown) return true;
      const vis = async () => page.evaluate(() => { const r = document.getElementById('pill-save').getBoundingClientRect(); return r.width > 4 && r.height > 4; });
      if (!(await vis())) { log('  [note] pill not yet visible (rect,display,visibility,opacity): ' + JSON.stringify(await page.evaluate(() => { const g = (id) => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return [r.x | 0, r.y | 0, r.width | 0, r.height | 0, cs.display, cs.visibility, cs.opacity]; }; return { save: g('pill-save'), pill: g('mobile-pill'), trig: g('mobile-trigger'), cls: document.getElementById('mobile-pill').className, bar: g('mobile-bar'), html: document.documentElement.className, body: document.body.className, mm: g('minmax-btn') }; })));
        await page.click('#mobile-trigger'); for (let i = 0; i < 20 && !(await vis()); i++) await sl(250); }
      if (!(await vis())) return false;
      const r = await page.evaluate(() => { const b = document.getElementById('pill-save').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
      await page.mouse.click(r.x, r.y);
      for (let i = 0; i < 40; i++) { await sl(250); if (await page.evaluate(() => { const p = document.getElementById('v-export-panel'); return !!(p && p.style.display === 'block'); })) break; }
      if (RED === 'nobcf') await page.evaluate(() => { const r = document.querySelector('#v-export-panel .ve-row[data-key="bcf"]'); if (r) r.remove(); });   // RED CONTROL: the BCF item is not there
      return page.evaluate(() => { const p = document.getElementById('v-export-panel'); return !!(p && p.style.display === 'block'); });
    };
    const rows = () => page.evaluate(() => Array.from(document.querySelectorAll('#v-export-panel .ve-row')).map((d) => ({ key: d.getAttribute('data-key'), disabled: d.getAttribute('data-disabled') === '1', why: d.getAttribute('data-why'), text: d.textContent.trim().replace(/\s+/g, ' ') })));
    const clickChip = async (cls, val) => { const r = await page.evaluate((c, v) => { const d = Array.from(document.querySelectorAll('#v-export-panel .' + c)).find((e) => e.textContent.trim() === v); if (!d) return null; const b = d.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, cls, val); if (!r) return false; await page.mouse.click(r.x, r.y); return true; };
    const closeMenu = () => page.evaluate(() => { const p = document.getElementById('v-export-panel'); if (p) p.style.display = 'none'; });
    const schedTree = () => page.evaluate(() => { try { const SA = window.ScheduleAuthor, a = SA.activeSchedule(APP.db); return SA.wbsTree(APP.db, (a && a.id) || 'SCH_AUTHORED').length; } catch (e) { return -1; } });
    const clickRow = async (key) => { const r = await page.evaluate((k) => { const d = document.querySelector('#v-export-panel .ve-row[data-key="' + k + '"]'); if (!d) return null; const b = d.getBoundingClientRect(); return { x: b.x + 28, y: b.y + b.height / 2 }; }, key); if (!r) return false; await page.mouse.click(r.x, r.y); return true; };   // the label end of the row, as a finger would: the format chips sit at the right

    if (RED === 'noschedgate') await page.evaluate(() => { window.__origWbs = window.ScheduleAuthor.wbsTree; window.ScheduleAuthor.wbsTree = () => [{ id: 'RED', name: 'RED', children: [] }]; });   // RED CONTROL: the empty-schedule gate sees a schedule
    const sch0 = await schedTree();   // the population E7a judges: the building's schedule BEFORE anything of ours touched it
    // E1 — the pill opens the menu with the five items
    const opened = await openMenu();
    if (!opened && RED !== 'nobcf') return inconclusive('the Export pill tap never opened the menu');
    const R1 = await rows(); const keys = R1.map((r) => r.key).join(',');
    log('§VIEWER_EXPORT_MENU_WITNESS E1 rows=' + JSON.stringify(R1));
    const title = await page.evaluate(() => document.getElementById('pill-save').title);
    ck('E1', R1.length === 5 && keys === 'db,ifc,bcf,schedule,cost5d', 'the Export menu lists exactly db, ifc, bcf, schedule, cost5d (population ' + R1.length + ': ' + keys + '); pill title=' + JSON.stringify(title));

    // E7a — no schedule yet: the Schedule row is greyed with its reason, a tap writes nothing, the menu makes nothing
    const schRow0 = R1.find((r) => r.key === 'schedule'), cost0 = R1.find((r) => r.key === 'cost5d');
    const nXml0 = count(/_schedule\.(xml|xer)$/), blk0 = lines.filter((l) => /item=schedule blocked reason=no_schedule/.test(l)).length;
    await clickRow('schedule'); await sl(1200);
    const blk1 = lines.filter((l) => /item=schedule blocked reason=no_schedule/.test(l)).length, nXml1 = count(/_schedule\.(xml|xer)$/);
    await closeMenu(); await openMenu(); await closeMenu();   // opening the menu again must not make one either
    const sch1 = await schedTree();
    if (RED === 'noschedgate') await page.evaluate(() => { window.ScheduleAuthor.wbsTree = window.__origWbs; });
    if (!RED && sch0 !== 0) return inconclusive('E7a population: the building already holds a schedule (wbsTree rows=' + sch0 + '), nothing to judge for no_schedule');
    ck('E7a', !!(schRow0 && schRow0.disabled && schRow0.why === 'no_schedule' && /Time Machine/.test(schRow0.text) && blk1 === blk0 + 1 && nXml1 === nXml0 && sch1 === 0 && cost0 && !cost0.disabled),
      'no schedule (wbsTree rows before=' + sch0 + ' after=' + sch1 + '): Schedule disabled=' + (schRow0 && schRow0.disabled) + ' why=' + (schRow0 && schRow0.why) + ' text=' + JSON.stringify(schRow0 && schRow0.text) + ' blockedLines+' + (blk1 - blk0) + ' files+' + (nXml1 - nXml0) + '; 5D cost enabled=' + (cost0 && !cost0.disabled));
    await openMenu();

    // E2 — Building (.db)
    let n0 = count(/\.db$/); let saved0 = lines.filter((l) => /§SAVE_DONE/.test(l)).length;
    const okDbRow = R1.find((r) => r.key === 'db'); await clickRow('db');
    const fdb = await waitFile(/\.db$/, n0, 60000);
    const doneL = lines.filter((l) => /§SAVE_DONE mode=download/.test(l)); const menuL = lines.filter((l) => /§VIEWER_EXPORT_MENU item=db action=saveModelDb/.test(l));
    ck('E2', !!(okDbRow && !okDbRow.disabled && fdb && fdb.buf.slice(0, 15).toString() === 'SQLite format 3' && fdb.f === building + '.db' && doneL.length > saved0 - 0 && menuL.length === 1), 'Building (.db) -> §SAVE_DONE mode=download, file=' + (fdb ? fdb.f + ' ' + fdb.buf.length + 'B magic=' + JSON.stringify(fdb.buf.slice(0, 15).toString()) : 'NONE') + ' menuLines=' + menuL.length);

    // E3 — IFC (whole building)
    await openMenu(); const R3 = await rows(); const ifcRow = R3.find((r) => r.key === 'ifc');
    n0 = count(/\.ifc$/); await clickRow('ifc');
    const fifc = await waitFile(/\.ifc$/, n0, 90000);
    const ifcL = lines.filter((l) => /§EXPORT_IFC/.test(l));
    const head = fifc ? fifc.buf.slice(0, 200).toString() : '';
    ck('E3', !!(ifcRow && !ifcRow.disabled && fifc && /^ISO-10303-21/.test(head) && /FILE_SCHEMA\(\('IFC4'\)\)/.test(fifc.buf.slice(0, 2000).toString()) && ifcL.length === 1), 'IFC (whole building) -> §EXPORT_IFC x' + ifcL.length + ', file=' + (fifc ? fifc.f + ' ' + fifc.buf.length + 'B' : 'NONE') + ' header=' + JSON.stringify(head.slice(0, 13)));

    // E4 — BCF: disabled with its reason first, then one real issue, then a real .bcfzip
    await openMenu(); const R4a = await rows(); const bcfA = R4a.find((r) => r.key === 'bcf');
    n0 = count(/\.bcfzip$/); const blockedBefore = lines.filter((l) => /item=bcf blocked reason=no_saved_issues/.test(l)).length;
    if (bcfA) await clickRow('bcf'); await sl(1200);
    const blockedAfter = lines.filter((l) => /item=bcf blocked reason=no_saved_issues/.test(l)).length, filesAfterBlocked = count(/\.bcfzip$/);
    const reasonShown = bcfA ? /no saved issues/.test(bcfA.text) : false;
    ck('E4a', !!(bcfA && bcfA.disabled && bcfA.why === 'no_saved_issues' && reasonShown && blockedAfter === blockedBefore + 1 && filesAfterBlocked === n0), 'BCF with no issue: disabled=' + (bcfA && bcfA.disabled) + ' why=' + (bcfA && bcfA.why) + ' text=' + JSON.stringify(bcfA && bcfA.text) + ' blockedLines+' + (blockedAfter - blockedBefore) + ' files=' + filesAfterBlocked);
    await page.evaluate(async () => { APP._getMarkupBlob = async () => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }); await APP._saveIssueToLog(); });
    await sl(600);
    const nIssues = await page.evaluate(async () => (await APP._getAllIssues()).length);
    await page.evaluate(() => { const p = document.getElementById('v-export-panel'); if (p) p.style.display = 'none'; });   // close; the menu recomputes its states on every open
    await openMenu(); const R4b = await rows(); const bcfB = R4b.find((r) => r.key === 'bcf');
    n0 = count(/\.bcfzip$/); await clickRow('bcf');
    const fbcf = await waitFile(/\.bcfzip$/, n0, 30000); const bcfL = lines.filter((l) => /§BCF export topics=/.test(l));
    ck('E4b', !!(nIssues === 1 && bcfB && !bcfB.disabled && fbcf && fbcf.buf.slice(0, 2).toString() === 'PK' && bcfL.length === 1 && /topics=1 /.test(bcfL[0])), 'BCF after 1 saved issue (store holds ' + nIssues + '): enabled=' + (bcfB && !bcfB.disabled) + ' file=' + (fbcf ? fbcf.f + ' ' + fbcf.buf.length + 'B magic=' + JSON.stringify(fbcf.buf.slice(0, 2).toString()) : 'NONE') + ' line=' + JSON.stringify(bcfL[0] || ''));

    // E5 — Ctrl+S, the real keystroke
    await page.evaluate(() => { const p = document.getElementById('v-export-panel'); if (p) p.style.display = 'none'; try { document.activeElement && document.activeElement.blur(); } catch (e) { } });
    fs.mkdirSync(path.join(dl, 'old'), { recursive: true }); fs.readdirSync(dl).forEach((f) => { if (f !== 'old' && !/\.crdownload$/.test(f)) fs.renameSync(path.join(dl, f), path.join(dl, 'old', f)); });   // same name twice: judge only what this keystroke writes
    n0 = count(/\.db$/); const k0 = lines.filter((l) => /§KBD_ROUTE Ctrl\+S/.test(l)).length;
    await page.keyboard.down('Control'); await page.keyboard.press('KeyS'); await page.keyboard.up('Control');
    const fdb2 = await waitFile(/\.db$/, n0, 60000); const k1 = lines.filter((l) => /§KBD_ROUTE Ctrl\+S/.test(l)).length;
    ck('E5', !!(k1 === k0 + 1 && fdb2 && fdb2.buf.slice(0, 15).toString() === 'SQLite format 3'), 'Ctrl+S -> §KBD_ROUTE x' + (k1 - k0) + ', second .db file=' + (fdb2 ? fdb2.f + ' ' + fdb2.buf.length + 'B' : 'NONE (dir=' + JSON.stringify(fs.readdirSync(dl)) + ')'));

    // E7b — the page's own Time Machine makes the schedule (the real 't' key, as a user would); the menu then exports it byte-for-byte as the drawer does
    await page.evaluate(() => { const p = document.getElementById('v-export-panel'); if (p) p.style.display = 'none'; try { document.activeElement && document.activeElement.blur(); } catch (e) { } });
    await page.keyboard.press('KeyT');
    let tmOn = false; for (let i = 0; i < 20 && !tmOn; i++) { await sl(500); tmOn = await page.evaluate(() => !!APP._tmOn); }
    if (!tmOn) { log('  [note] the t key did not open the Time Machine; used window.toggleTimeMachine (the same function the pill and key call)'); await page.evaluate(() => window.toggleTimeMachine()); }
    let nTree = 0; for (let i = 0; i < 120 && nTree === 0; i++) { await sl(500); nTree = await schedTree(); }
    if (nTree <= 0) return inconclusive('E7b: the Time Machine never produced a schedule (wbsTree rows=' + nTree + ')');
    log('§VIEWER_EXPORT_MENU_WITNESS E7b schedule made by the page\'s own Time Machine: wbsTree roots=' + nTree);
    // the drawer: a real click on #tm-editor opens the P6/MSP section (this also lazy-loads the interop modules)
    const drawerOpen = async () => { for (let i = 0; i < 20; i++) { const ok = await page.evaluate(() => { const b = document.getElementById('tm-p6-box'); return !!(b && b.classList.contains('open') && window.ForeignSchedule); }); if (ok) return true; if (i === 0 || i === 8) { const r = await page.evaluate(() => { const e = document.getElementById('tm-editor'); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }); if (r) await page.mouse.click(r.x, r.y); } await sl(500); } return false; };
    if (!(await drawerOpen())) return inconclusive('E7b: the Time Machine P6/MSP drawer never opened (#tm-p6-box.open + ForeignSchedule)');
    const drawerBtn = async (id) => { const r = await page.evaluate((i) => { const e = document.getElementById(i); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width }; }, id); if (!r || r.w < 2) return false; await page.mouse.click(r.x, r.y); return true; };
    const FMT = [['msp', 'MSP', '_schedule.xml', '#tm-p6-export-msp', /§TM_EXPORT_MSP tasks=(\d+) links=(\d+) file=(\S+)/], ['pmxml', 'PMXML', '_schedule.xml', '#tm-p6-export-pmxml', /§TM_EXPORT_PMXML tasks=(\d+) links=(\d+) file=(\S+)/], ['xer', 'XER', '_schedule.xer', '#tm-p6-export-xer', /§TM_EXPORT_XER tasks=(\d+) links=(\d+) file=(\S+)/]];
    const sums = [];
    for (const [kind, chip, suffix, btn, re] of FMT) {
      const rx = new RegExp(suffix.replace('.', '\\.') + '$');
      fs.mkdirSync(path.join(dl, 'old'), { recursive: true }); fs.readdirSync(dl).forEach((f) => { if (f !== 'old' && !/\.crdownload$/.test(f)) fs.renameSync(path.join(dl, f), path.join(dl, 'old', Date.now() + '_' + f)); });
      await openMenu(); const rr = await rows(); const row = rr.find((r) => r.key === 'schedule');
      const chipFiles0 = count(rx), kl0 = lines.filter((l) => new RegExp('schedule_kind=' + kind).test(l)).length;
      await clickChip('ve-kind', chip); await sl(400);
      const chipPressed = await page.evaluate((c) => { const d = Array.from(document.querySelectorAll('#v-export-panel .ve-kind')).find((e) => e.textContent.trim() === c); return !!d && d.getAttribute('aria-pressed') === 'true'; }, chip);
      const chipWrote = count(rx) - chipFiles0;   // a chip tap chooses and exports nothing
      const e0 = lines.filter((l) => re.test(l)).length;
      await clickRow('schedule');
      const fMenu = await waitFile(rx, 0, 30000);
      for (let i = 0; i < 20 && lines.filter((l) => re.test(l)).length === e0; i++) await sl(250);
      const ml = lines.filter((l) => re.test(l)).slice(e0)[0] || '';
      const action = lines.filter((l) => /item=schedule action=tmExportSchedule kind=/.test(l)).pop() || '';
      const bytesMenu = fMenu ? fMenu.buf : null;
      fs.readdirSync(dl).forEach((f) => { if (f !== 'old' && !/\.crdownload$/.test(f)) fs.renameSync(path.join(dl, f), path.join(dl, 'old', 'menu_' + f)); });
      const e1 = lines.filter((l) => re.test(l)).length;
      const clicked = await drawerBtn(btn.slice(1));
      const fDrawer = await waitFile(rx, 0, 30000);
      for (let i = 0; i < 20 && lines.filter((l) => re.test(l)).length === e1; i++) await sl(250);
      const bytesDrawer = fDrawer ? fDrawer.buf : null;
      const eq = !!(bytesMenu && bytesDrawer && Buffer.compare(bytesMenu, bytesDrawer) === 0);
      const m = re.exec(ml); const txt = bytesMenu ? bytesMenu.toString('utf8') : '';
      let extra = '', extraOk = false;
      if (kind === 'msp') {
        const pr = await page.evaluate((t) => { try { const r = window.ForeignSchedule.parseForeign(t, 'x_schedule.xml'); return { format: r.format, wbs: r.parsed.wbs.length, acts: r.parsed.activities.length, rel: r.parsed.relationships.length }; } catch (e) { return { err: String(e) }; } }, txt);
        extra = ' reparse=' + JSON.stringify(pr); extraOk = !!(m && pr.format === 'MSPDI' && pr.wbs + pr.acts === +m[1] && pr.rel === +m[2]);
      } else if (kind === 'xer') { extra = ' head=' + JSON.stringify(txt.slice(0, 6)); extraOk = /^ERMHDR/.test(txt); }
      else { extra = ' APIBusinessObjects=' + /APIBusinessObjects/.test(txt); extraOk = /APIBusinessObjects/.test(txt); }
      sums.push({ kind, ok: !!(row && !row.disabled && chipPressed && chipWrote === 0 && fMenu && fDrawer && eq && extraOk && clicked && m && new RegExp('kind=' + kind).test(action) && lines.filter((l) => new RegExp('schedule_kind=' + kind).test(l)).length === kl0 + 1) });
      ck('E7b-' + kind, sums[sums.length - 1].ok, kind + ': Schedule row enabled=' + (row && !row.disabled) + ', chip tap wrote ' + chipWrote + ' files (pressed=' + chipPressed + '), menu file=' + (fMenu ? fMenu.f + ' ' + bytesMenu.length + 'B' : 'NONE') + ' drawer file=' + (fDrawer ? fDrawer.f + ' ' + bytesDrawer.length + 'B' : 'NONE') + ' bytes equal=' + eq + ' line=' + JSON.stringify(ml) + extra);
      await closeMenu();
    }
    ck('E7b', sums.length === 3 && sums.every((x) => x.ok), 'Schedule: MSP, PMXML and XER from the menu equal the drawer buttons\' bytes on the same page (' + sums.map((x) => x.kind + '=' + (x.ok ? 'ok' : 'NO')).join(' ') + ')');

    // E8 — 5D cost: the tap opens boq_charts.html?...&export=5d; that page writes the workbook once; the same page without the parameter writes nothing
    fs.mkdirSync(path.join(dl, 'old'), { recursive: true }); fs.readdirSync(dl).forEach((f) => { if (f !== 'old' && !/\.crdownload$/.test(f)) fs.renameSync(path.join(dl, f), path.join(dl, 'old', 'p_' + Date.now() + '_' + f)); });
    const boqLines = [], boqUrls = [];
    browser.on('targetcreated', async (t) => { try { const u = t.url(); if (!/boq_charts\.html/.test(u)) return; boqUrls.push(u); const p = await t.page(); if (p) p.on('console', (m) => { const x = m.text(); if (/§BOQ_AUTO_EXPORT/.test(x)) { boqLines.push(x); log('  [boq] ' + x.slice(0, 200)); } }); } catch (e) { } });
    await openMenu(); const R8 = await rows(); const costRow = R8.find((r) => r.key === 'cost5d');
    n0 = count(/\.xlsx$/); await clickRow('cost5d');
    const fx = await waitFile(/\.xlsx$/, n0, 120000);
    for (let i = 0; i < 20 && !boqLines.length; i++) await sl(250);
    const a8 = lines.filter((l) => /item=cost5d action=export4D5D export=5d/.test(l)).length;
    const bldNm = building;
    const urlOk = boqUrls.length === 1 && /[?&]export=5d(&|$)/.test(boqUrls[0]) && /[?&]db=/.test(boqUrls[0]);
    const nameRe = /^BIM_OOTB_.+_5D_BOQ_\d{4}-\d\d-\d\d\.xlsx$/;
    const lineName = ((boqLines.find((l) => /file=/.test(l)) || '').match(/file=(\S+)/) || [])[1] || '';
    ck('E8', !!(costRow && !costRow.disabled && a8 === 1 && urlOk && fx && fx.buf.slice(0, 2).toString() === 'PK' && nameRe.test(fx.f) && lineName === fx.f && boqLines.length === 1),
      '5D cost: menu line x' + a8 + ', new tab url=' + JSON.stringify(boqUrls[0] ? boqUrls[0].replace(/&v=\d+/, '&v=…') : null) + ', ' + JSON.stringify(boqLines) + ', file=' + (fx ? fx.f + ' ' + fx.buf.length + 'B magic=' + JSON.stringify(fx.buf.slice(0, 2).toString()) : 'NONE'));
    // non-impact control: the SAME page without export=5d writes no file and logs no auto export
    await sl(3000); const nX0 = count(/\.xlsx$/); const ctl = await browser.newPage(); const ctlLines = [];
    ctl.on('console', (m) => { const x = m.text(); if (/§BOQ_AUTO_EXPORT|§RENDER_CHARTS/.test(x)) ctlLines.push(x); });
    const ctlUrl = boqUrls[0] ? boqUrls[0].replace(/&export=5d/, '') : '';
    if (!ctlUrl || /export=/.test(ctlUrl)) return inconclusive('E8 control: no boq_charts url captured to reopen without export=5d');
    await ctl.goto('http://127.0.0.1:' + port + '/viewer/' + ctlUrl.replace(/^.*\/viewer\//, ''), { waitUntil: 'domcontentloaded', timeout: 120000 });
    for (let i = 0; i < 80 && !ctlLines.some((l) => /RENDER_CHARTS: (done|end|finish)|§RENDER_CHARTS/.test(l) && l !== '§RENDER_CHARTS: start'); i++) await sl(500);
    await sl(6000);
    const nX1 = count(/\.xlsx$/);
    ck('E8-ctl', ctlLines.some((l) => /§RENDER_CHARTS/.test(l)) && !ctlLines.some((l) => /§BOQ_AUTO_EXPORT/.test(l)) && nX1 === nX0, 'the same page WITHOUT export=5d: charts rendered=' + ctlLines.some((l) => /§RENDER_CHARTS/.test(l)) + ' autoExport lines=' + ctlLines.filter((l) => /§BOQ_AUTO_EXPORT/.test(l)).length + ' new .xlsx files=' + (nX1 - nX0));
    try { await ctl.close(); } catch (e) { }

    // E6 — words through the dictionary, not English leaking
    const words = await page.evaluate(async () => {
      const en = { pill: _trl('pill_export', null, 'Export'), db: _trl('ui_exp_db', null, 'Building (.db)'), sched: _trl('ui_exp_sched', null, 'Schedule'), cost: _trl('ui_exp_5d', null, '5D cost') };
      let de = null;
      try { if (window._TRL_LOADER && window._TRL_LOADER.setLocale) { await window._TRL_LOADER.setLocale('de_DE'); await new Promise((r) => setTimeout(r, 1500)); de = { sched: _trl('ui_exp_sched', null, 'Schedule'), cost: _trl('ui_exp_5d', null, '5D cost'), pill: _trl('pill_export', null, 'Export'), db: _trl('ui_exp_db', null, 'Building (.db)'), bcfNone: _trl('ui_exp_bcf_none', null, 'no saved issues'), title: document.getElementById('pill-save').title }; } } catch (e) { de = { err: String(e) }; }
      return { en, de };
    });
    log('§VIEWER_EXPORT_MENU_WITNESS E6 words=' + JSON.stringify(words));
    ck('E6', !!(words.en.pill === 'Export' && title === 'Export' && words.de && words.de.pill === 'Exportieren' && words.de.db === 'Gebäude (.db)' && words.de.bcfNone === 'keine gespeicherten Probleme' && words.de.title === 'Exportieren' && words.en.sched === 'Schedule' && words.en.cost === '5D cost' && words.de.sched === 'Terminplan' && words.de.cost === '5D-Kosten'), 'en sched=' + words.en.sched + ' cost=' + words.en.cost + '; de_DE sched=' + (words.de && words.de.sched) + ' cost=' + (words.de && words.de.cost) + '; en pill=' + words.en.pill + ' title(en)=' + title + '; de_DE pill=' + (words.de && words.de.pill) + ' db=' + (words.de && words.de.db) + ' title=' + (words.de && words.de.title));
    ck('E0', errs.length === 0, 'no page error (' + errs.length + ')');
  } catch (e) { log('§W-VIEWER-EXPORT-MENU ERROR ' + (e && e.stack || e)); return finish(3); }
  const fails = results.filter((r) => !r.ok); const judged = results.length;
  log('§W-VIEWER-EXPORT-MENU ' + (judged === 0 ? 'INCONCLUSIVE judged=0' : fails.length ? 'FAIL failed=[' + fails.map((f) => f.id).join(',') + '] of ' + judged : 'PASS ' + judged + ' of ' + judged) + ' red=' + (RED || 'none'));
  await finish(judged === 0 ? 2 : fails.length ? 1 : 0);
})();
