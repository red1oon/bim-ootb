#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-VIEWER-EXPORT-MENU (bim-ootb prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md §(a) SPEC). Scope: the Viewer toolbar's ONE Export pill + menu. READ THE LOG after every run; the exit code is not evidence.
// ISSUE IT PROVES OR DISPROVES: "a user cannot find IFC or BCF export from the toolbar" (Save Building wrote a .db only; IFC lived in Share, BCF in the Issues panel).
//   E1 MENU    the real pill tap (#mobile-trigger -> #pill-save, real mouse) opens a panel whose rows are exactly db, ifc, bcf (judged from the DOM, population printed).
//   E2 DB      Building (.db) reaches A.saveModelDb: §SAVE_DONE mode=download name=<building>.db and a real file that starts with the SQLite magic.
//   E3 IFC     IFC (whole building) reaches A.exportIFC: §EXPORT_IFC and a real .ifc file (ISO-10303-21 header, IFC4).
//   E4 BCF     with no saved issue the row is disabled (data-disabled=1, reason no_saved_issues), a click is refused with a § line and NO file; after ONE issue saved through the
//              page's own A._saveIssueToLog the row is enabled and a click writes a real .bcfzip (zip magic, §BCF export topics=1).
//   E5 CTRL+S  the real Ctrl+S keystroke still runs the save (§KBD_ROUTE Ctrl+S -> §SAVE_DONE and a second .db file).
//   E6 WORDS   the pill title is "Export" (en) and the same dictionary rows resolve in de_DE (pill_export, ui_exp_db) - not English leaking through.
//   INCONCLUSIVE when the page never became ready, the pill/menu never opened, or no file could be judged. Software GL only (swiftshader), no GPU.
//   RED CONTROL  EXPORT_MENU_RED=nobcf removes the BCF row from the opened panel: E1 and E4 must FAIL (exit 1).
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
    page.on('console', (m) => { const t = m.text(); if (/§(VIEWER_EXPORT|SAVE_|EXPORT_IFC|BCF|ISSUE_SAVED|KBD_ROUTE|LOAD_FAIL)|\[S229\]|\[S205\]/.test(t)) { lines.push(t); log('  [con] ' + t.slice(0, 220)); } });
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
    const clickRow = async (key) => { const r = await page.evaluate((k) => { const d = document.querySelector('#v-export-panel .ve-row[data-key="' + k + '"]'); if (!d) return null; const b = d.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, key); if (!r) return false; await page.mouse.click(r.x, r.y); return true; };

    // E1 — the pill opens the menu with exactly the three items
    const opened = await openMenu();
    if (!opened && RED !== 'nobcf') return inconclusive('the Export pill tap never opened the menu');
    const R1 = await rows(); const keys = R1.map((r) => r.key).join(',');
    log('§VIEWER_EXPORT_MENU_WITNESS E1 rows=' + JSON.stringify(R1));
    const title = await page.evaluate(() => document.getElementById('pill-save').title);
    ck('E1', R1.length === 3 && keys === 'db,ifc,bcf', 'the Export menu lists exactly db, ifc, bcf (population ' + R1.length + ': ' + keys + '); pill title=' + JSON.stringify(title));

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

    // E6 — words through the dictionary, not English leaking
    const words = await page.evaluate(async () => {
      const en = { pill: _trl('pill_export', null, 'Export'), db: _trl('ui_exp_db', null, 'Building (.db)') };
      let de = null;
      try { if (window._TRL_LOADER && window._TRL_LOADER.setLocale) { await window._TRL_LOADER.setLocale('de_DE'); await new Promise((r) => setTimeout(r, 1500)); de = { pill: _trl('pill_export', null, 'Export'), db: _trl('ui_exp_db', null, 'Building (.db)'), bcfNone: _trl('ui_exp_bcf_none', null, 'no saved issues'), title: document.getElementById('pill-save').title }; } } catch (e) { de = { err: String(e) }; }
      return { en, de };
    });
    log('§VIEWER_EXPORT_MENU_WITNESS E6 words=' + JSON.stringify(words));
    ck('E6', !!(words.en.pill === 'Export' && title === 'Export' && words.de && words.de.pill === 'Exportieren' && words.de.db === 'Gebäude (.db)' && words.de.bcfNone === 'keine gespeicherten Probleme' && words.de.title === 'Exportieren'), 'en pill=' + words.en.pill + ' title(en)=' + title + '; de_DE pill=' + (words.de && words.de.pill) + ' db=' + (words.de && words.de.db) + ' title=' + (words.de && words.de.title));
    ck('E0', errs.length === 0, 'no page error (' + errs.length + ')');
  } catch (e) { log('§W-VIEWER-EXPORT-MENU ERROR ' + (e && e.stack || e)); return finish(3); }
  const fails = results.filter((r) => !r.ok); const judged = results.length;
  log('§W-VIEWER-EXPORT-MENU ' + (judged === 0 ? 'INCONCLUSIVE judged=0' : fails.length ? 'FAIL failed=[' + fails.map((f) => f.id).join(',') + '] of ' + judged : 'PASS ' + judged + ' of ' + judged) + ' red=' + (RED || 'none'));
  await finish(judged === 0 ? 2 : fails.length ? 1 : 0);
})();
