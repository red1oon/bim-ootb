#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-IFC-EXPORT-SEL, step (b): the shared writer for any element, adopted by the Viewer, Whole building. Spec: bim-ootb prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md "(b) SPEC". READ THE LOG after every run; the exit code is not evidence.
// ISSUE IT PROVES OR DISPROVES: "the Viewer's IFC is not valid IFC and cannot export a split (meta+geo) building."
//   S2 VALID        ifcopenshell.validate reports 0 errors on IFC4 and IFC2X3, on a real MONOLITH building (warehouse GardenWorld, HHS Office) and on SPLIT meta+geo buildings: the real Clinic pair
//                   (IFC4; $IFC_SEL_SPLIT_DIR or ~/bim-ootb/buildings; INCONCLUSIVE when absent) and a pair the witness splits out of a real monolith the way the extractor does (every geometry table in the _geo half).
//   S6 DETERMINISM  two exports of each, one SHA-256.
//   COUNT           per source class: written + generalised/proxied (already inside written) + no-geometry = the DB's elements_meta rows; the products actually in the FILE (read back by python) = written; the
//                   source class of every generalised / proxied element is in the file's ObjectType; the elements with no geometry are listed by class, never dropped silently.
//   SPLIT_EQ_MONO   the file written from the split pair is byte-identical to the one written from the monolith it was split from (the reader fed from two DBs reads the same mesh as from one).
//   LIVE            the real Viewer page (software GL): the Export pill's IFC item downloads <building>_IFC4.ifc, its status line shows the counts, the file equals the node writer's bytes; the schema toggle gives
//                   a _IFC2X3.ifc; the item is ENABLED for a split building (it was greyed before). Judged from page state and § lines, never from a screenshot.
//   RED CONTROL     IFC_EXPORT_RED=nopredefined drops PredefinedType from every IFC4 product: S2 must FAIL (exit 1).
//   INCONCLUSIVE    printed (never PASS) when nothing was judged; a sub-check whose input is absent is listed under inconclusive=.
// Run:  node viewer/tests/witness_ifc_export_sel.js            (python3 + ifcopenshell for S2; puppeteer from ~/bim-compiler/node_modules for LIVE; starts its own python http.server and kills it by PID)
//       IFC_SEL_SKIP_LIVE=1 / IFC_SEL_SKIP_BIG=1 shorten the run (the skipped parts are listed as inconclusive, never PASS).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const RED = process.env.IFC_EXPORT_RED || '';
const LOGF = process.env.LOG || path.join(__dirname, 'logs', 'witness_ifc_export_sel' + (RED ? '_red_' + RED : '') + '.log');
fs.mkdirSync(path.dirname(LOGF), { recursive: true });
const OUT = []; const log = (s) => { OUT.push(s); console.log(s); };
const sl = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [], inconclusive = [];
const ck = (id, ok, msg) => { results.push({ id, ok }); log((ok ? '§PASS ' : '§FAIL ') + id + ' ' + msg); };
const inc = (id, why) => { inconclusive.push(id); log('§INCONCLUSIVE ' + id + ' ' + why); };
const initSqlJs = require(require.resolve('sql.js', { paths: [path.join(ROOT, 'node_modules'), path.join(os.homedir(), 'bim-ootb', 'node_modules'), path.join(os.homedir(), 'bim-compiler', 'node_modules')] }));
const X = require('../ifc_export_shared.js');
const OUTDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ifcsel-'));
const isSqlite = (p) => { try { const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(16); fs.readSync(fd, b, 0, 16, 0); fs.closeSync(fd); return b.toString('latin1', 0, 15) === 'SQLite format 3' && fs.statSync(p).size > 8192; } catch (e) { return false; } };

// ---- helpers
function hashParts(parts, file) {   // the file and its SHA-256 written part by part (a 130 MB file is past the single-string limit)
  const h = crypto.createHash('sha256'); let n = 0, fd = file ? fs.openSync(file, 'w') : null;
  for (const p of parts) { const b = Buffer.from(p, 'utf8'); h.update(b); n += b.length; if (fd !== null) fs.writeSync(fd, b); }
  if (fd !== null) fs.closeSync(fd); return { sha: h.digest('hex'), bytes: n };
}
function dbCounts(db) { const r = db.exec('SELECT ifc_class, COUNT(*) FROM elements_meta GROUP BY 1'); const o = {}; (r.length ? r[0].values : []).forEach((v) => { o[v[0]] = v[1]; }); return o; }
function splitDb(SQL, bytes) {   // the extractor's split: every geometry table in the _geo half, everything else in _meta
  const meta = new SQL.Database(new Uint8Array(bytes)), geo = new SQL.Database(new Uint8Array(bytes));
  const GEO = ['component_geometries', 'base_geometries'];
  GEO.forEach((t) => { try { meta.run('DROP TABLE IF EXISTS ' + t); } catch (e) { } });
  const names = geo.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.map((v) => v[0]);
  names.forEach((t) => { if (GEO.indexOf(t) < 0 && !/^sqlite_/.test(t)) geo.run('DROP TABLE IF EXISTS "' + t + '"'); });
  meta.run('VACUUM'); geo.run('VACUUM'); return { meta, geo, metaBytes: meta.export(), geoBytes: geo.export() };
}
function py(file) {
  const r = cp.spawnSync('python3', [path.join(__dirname, 'witness_ifc_export_sel_check.py'), file], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 1800000 });
  if (r.status === 77) return { skip: true, why: (r.stdout || '').trim() };
  const m = /§IFC_SEL_PY_JSON (.*)/.exec(r.stdout || ''); if (!m) return { error: 'python half gave no result: status=' + r.status + ' ' + (r.stderr || '').slice(0, 400) };
  return JSON.parse(m[1]);
}
const fmtMap = (o) => '{' + Object.keys(o).sort().map((k) => k + ':' + o[k]).join(',') + '}';

// one case: export twice (S6), validate the first (S2), count (COUNT); returns the first export
function runCase(label, SQL, mono, geoDb, rows, schemas, red) {
  const out = {}, kind = geoDb ? 'split' : 'mono', tag0 = label + ':' + kind;
  for (const schema of schemas) {
    const name = label + '_' + schema + '.ifc', opts = { schema, name, buildingName: label, breakPredefined: red };
    const t0 = Date.now(), col = X.collect(mono, geoDb), res = X.build(col, opts);
    if (!res.ok) { ck('S2:' + tag0 + ':' + schema, false, 'the writer refused: ' + res.why); continue; }
    const file = path.join(OUTDIR, name), h1 = hashParts(res.parts, file), t1 = Date.now();
    log(X.selLine(col, res, schema));
    log('§IFC_SEL_EXPORT label=' + label + ' kind=' + kind + ' schema=' + schema + ' elements=' + res.stats.written + ' bytes=' + h1.bytes + ' sha256=' + h1.sha + ' ms=' + (t1 - t0));
    // S6
    const res2 = X.build(X.collect(mono, geoDb), opts), h2 = hashParts(res2.parts, null);
    { const estMB = X.estimateMB(col.tris, schema), actMB = h1.bytes / 1048576; ck('CAP:' + tag0 + ':' + schema, estMB + 1 >= actMB, 'the size estimate that gates the browser export (' + Math.round(col.tris) + ' triangles x ' + X.BYTES_PER_TRI[schema] + ' B) = ' + estMB + ' MB is not below the file written (' + actMB.toFixed(1) + ' MB, 1 MB fixed overhead allowed); limit ' + X.MAX_MB + ' MB'); }
    ck('S6:' + tag0 + ':' + schema, h1.sha === h2.sha && h1.bytes === h2.bytes, 'two exports: ' + h1.sha.slice(0, 16) + ' / ' + h2.sha.slice(0, 16) + ' (' + h1.bytes + ' B)');
    // S2 + COUNT read back from the file
    const p = py(file);
    if (p.skip) { inc('S2:' + tag0 + ':' + schema, 'ifcopenshell not importable (' + p.why + '): validity NOT judged'); }
    else if (p.error) { ck('S2:' + tag0 + ':' + schema, false, p.error); }
    else {
      log('§IFC_SEL_PY label=' + label + ' kind=' + kind + ' schema=' + p.schema + ' validate_errors=' + p.validate_errors + ' products=' + p.products + ' dupGlobalIds=' + p.dupGlobalIds + ' styled=' + p.styledItems + ' storeys=' + p.storeys + ' first=' + JSON.stringify(p.first_errors.slice(0, 2)));
      ck('S2:' + tag0 + ':' + schema, p.validate_errors === 0 && p.schema === schema && p.dupGlobalIds === 0, 'ifcopenshell.validate on ' + schema + ' ' + label + ' (' + kind + '): ' + p.validate_errors + ' errors (0 required), ' + p.products + ' products, dup GlobalIds ' + p.dupGlobalIds);
      // COUNT: the DB's rows per source class = written (+ in-file) + no-geometry
      const st = res.stats, bc = st.byClass || {}, ng = col.noGeometry, db = rows, bad = [];
      let sumDb = 0, sumW = 0, sumNg = 0;
      Object.keys(db).forEach((c) => { const w = bc[c] ? bc[c].n : 0, n = ng[c] || 0; sumDb += db[c]; sumW += w; sumNg += n; if (w + n !== db[c]) bad.push(c + ':' + w + '+' + n + '!=' + db[c]); });
      Object.keys(bc).forEach((c) => { if (!(c in db)) bad.push(c + ':written but not in the DB'); });
      const prox = Object.values(st.proxied || {}).reduce((a, b) => a + b, 0), gen = Object.values(st.generalised || {}).reduce((a, b) => a + b, 0);
      const objtOk = Object.keys(st.proxied || {}).concat(Object.keys(st.generalised || {})).every((c) => (p.objectTypes[c] || 0) >= ((st.proxied || {})[c] || 0) + ((st.generalised || {})[c] || 0));
      const fileClassSum = Object.values(p.classes).reduce((a, b) => a + b, 0);
      ck('COUNT:' + tag0 + ':' + schema, bad.length === 0 && sumDb === col.census.rows && sumW === st.written && p.products === st.written && fileClassSum === st.written && sumW + sumNg === sumDb && col.noGeometryList.length === sumNg && objtOk,
        'DB rows ' + sumDb + ' = written ' + sumW + ' + no-geometry ' + sumNg + '; file holds ' + p.products + ' products; proxied ' + prox + ' ' + fmtMap(st.proxied || {}) + ', generalised ' + gen + ' ' + fmtMap(st.generalised || {}) + ', ObjectType kept=' + objtOk + (bad.length ? ' MISMATCH ' + bad.join(' ') : '') + '; no-geometry listed: ' + fmtMap(ng));
    }
    out[schema] = { sha: h1.sha, bytes: h1.bytes, file, written: res.stats.written, col };
  }
  return out;
}

(async () => {
  const SQL = await initSqlJs(); let browser = null, srv = null; const temp = [];
  const cleanup = () => { temp.forEach((f) => { try { fs.unlinkSync(f); } catch (e) { } }); };
  const finish = async (code) => { cleanup(); fs.writeFileSync(LOGF, OUT.join('\n') + '\n'); try { if (browser) await browser.close(); } catch (e) { } try { if (srv) srv.kill(); } catch (e) { } process.exit(code); };
  try {
    const GW = path.join(ROOT, 'buildings', 'warehouse_gardenworld.db'), HHS = path.join(ROOT, 'buildings', 'HHS_Office_Federated_extracted.db');
    const CDIR = process.env.IFC_SEL_SPLIT_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings'), CM = path.join(CDIR, 'Clinic_meta.db'), CG = path.join(CDIR, 'Clinic_geo.db');
    log('§W-IFC-EXPORT-SEL start red=' + (RED || 'none') + ' out=' + OUTDIR + ' gw=' + isSqlite(GW) + ' hhs=' + isSqlite(HHS) + ' clinic_pair=' + (isSqlite(CM) && isSqlite(CG)));
    if (!isSqlite(GW)) { inc('ALL', 'the warehouse DB is absent: nothing judged'); }
    else {
      const gwBytes = fs.readFileSync(GW), gw = new SQL.Database(new Uint8Array(gwBytes)), gwRows = dbCounts(gw);
      // --- 1. MONOLITH, small (both schemas) -------------------------------------------------------
      const m1 = runCase('GardenWorld', SQL, gw, null, gwRows, RED ? ['IFC4'] : ['IFC4', 'IFC2X3'], RED === 'nopredefined');
      // --- 2. SPLIT derived from it, same bytes -----------------------------------------------------
      if (!RED) {
        const sp = splitDb(SQL, gwBytes), m2 = runCase('GardenWorld', SQL, sp.meta, sp.geo, gwRows, ['IFC4', 'IFC2X3'], false);
        ['IFC4', 'IFC2X3'].forEach((s) => ck('SPLIT_EQ_MONO:GardenWorld:' + s, !!(m1[s] && m2[s] && m1[s].sha === m2[s].sha), 'split pair (meta ' + sp.metaBytes.length + ' B + geo ' + sp.geoBytes.length + ' B) vs monolith: ' + (m2[s] && m2[s].sha.slice(0, 16)) + ' / ' + (m1[s] && m1[s].sha.slice(0, 16))));
        // --- 3. HHS monolith (real, bigger) and its split ------------------------------------------
        if (process.env.IFC_SEL_SKIP_BIG) inc('BIG', 'IFC_SEL_SKIP_BIG=1: HHS and Clinic not judged');
        else {
          if (isSqlite(HHS)) {
            const hb = fs.readFileSync(HHS), hdb = new SQL.Database(new Uint8Array(hb)), hrows = dbCounts(hdb);
            const mh = runCase('HHS_Office', SQL, hdb, null, hrows, ['IFC4'], false);
            const hsp = splitDb(SQL, hb), ms = runCase('HHS_Office', SQL, hsp.meta, hsp.geo, hrows, ['IFC4', 'IFC2X3'], false);
            ck('SPLIT_EQ_MONO:HHS_Office:IFC4', !!(mh.IFC4 && ms.IFC4 && mh.IFC4.sha === ms.IFC4.sha), 'split pair vs monolith: ' + (ms.IFC4 && ms.IFC4.sha.slice(0, 16)) + ' / ' + (mh.IFC4 && mh.IFC4.sha.slice(0, 16)));
          } else inc('MONO_HHS', 'buildings/HHS_Office_Federated_extracted.db is absent or an LFS pointer');
          // --- 4. the REAL split pair (Clinic) ------------------------------------------------------
          if (isSqlite(CM) && isSqlite(CG)) {
            const cm = new SQL.Database(new Uint8Array(fs.readFileSync(CM))), cg = new SQL.Database(new Uint8Array(fs.readFileSync(CG)));
            runCase('Clinic', SQL, cm, cg, dbCounts(cm), ['IFC4'], false);
          } else inc('SPLIT_REAL', 'Clinic_meta.db + Clinic_geo.db not found in ' + CDIR + ' (set IFC_SEL_SPLIT_DIR): the derived pairs above were judged, the real pair was not');
        }
      }
    }
    // --- 5. LIVE: the real Viewer page --------------------------------------------------------------
    if (RED) inc('LIVE', 'red control run: the live page is not part of it');
    else if (process.env.IFC_SEL_SKIP_LIVE) inc('LIVE', 'IFC_SEL_SKIP_LIVE=1');
    else if (!isSqlite(GW)) inc('LIVE', 'no building to open');
    else {
      const puppeteer = require(require.resolve('puppeteer', { paths: [path.join(os.homedir(), 'bim-compiler', 'node_modules'), path.join(ROOT, 'node_modules')] }));
      const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
      const port = await freePort();
      // the derived split pair is served as /buildings/_wit_ifcsel_meta.db + _geo.db (untracked, deleted at the end)
      const gwB = fs.readFileSync(GW), sp = splitDb(SQL, gwB), MP = path.join(ROOT, 'buildings', '_wit_ifcsel_meta.db'), GP = path.join(ROOT, 'buildings', '_wit_ifcsel_geo.db'), BP = path.join(ROOT, 'buildings', '_wit_ifcsel.db');
      fs.writeFileSync(MP, Buffer.from(sp.metaBytes)); fs.writeFileSync(GP, Buffer.from(sp.geoBytes)); fs.writeFileSync(BP, Buffer.from(sp.metaBytes)); temp.push(MP, GP, BP);
      srv = cp.spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' }); await sl(900);
      const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ifcsel-prof-'));
      browser = await puppeteer.launch({ headless: true, userDataDir: prof, protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
      const liveCase = async (tag, url, expectSplit) => {
        const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'ifcsel-dl-')), cdp = await browser.target().createCDPSession();
        const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); const c2 = await ctx.browser().target().createCDPSession(); await c2.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl, browserContextId: ctx.id });
        await page.setViewport({ width: 1280, height: 800 }); const lines = [], errs = [];
        page.on('console', (m) => { const t = m.text(); if (/§(IFC_EXPORT|VIEWER_EXPORT|EXPORT_IFC|LOAD_FAIL|DB_SPLIT)|\[S229\]/.test(t)) { lines.push(t); log('  [' + tag + ' con] ' + t.slice(0, 260)); } });
        page.on('pageerror', (e) => { errs.push(e.message); log('  [' + tag + ' pageerror] ' + e.message.slice(0, 200)); });
        await page.evaluateOnNewDocument(() => { try { delete window.showSaveFilePicker; } catch (e) { } window.showSaveFilePicker = undefined; });
        await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=' + url, { waitUntil: 'domcontentloaded', timeout: 180000 });
        let ready = false; for (let i = 0; i < 240 && !ready; i++) { await sl(500); try { ready = await page.evaluate(() => !!(window.APP && APP.db && APP.streaming === false && APP.openExportMenu && APP.exportIfcShared && document.getElementById('pill-save'))); } catch (e) { } }
        if (!ready) { inc('LIVE:' + tag, 'page never became ready (APP.db + A.exportIfcShared + #pill-save)'); return; }
        await sl(1500);
        for (let i = 0; i < 40; i++) { const on = await page.evaluate(() => { const w = document.getElementById('wh-close'); return !!(w && w.getBoundingClientRect().width > 0); }); if (on) { await page.click('#wh-close'); log('  [' + tag + ' step] walk engaged -> left with its own X'); break; } const t = await page.evaluate(() => getComputedStyle(document.getElementById('mobile-trigger')).display); if (t !== 'none' && i > 12) break; await sl(500); }
        await sl(1200);
        const st = await page.evaluate(() => ({ ab: APP.activeBuilding, split: !!(APP.libDb && APP.libDb !== APP.db), lod: !!(window.LodIfc && window.LodReader) }));
        log('§IFC_EXPORT_SEL_LIVE tag=' + tag + ' building=' + st.ab + ' split=' + st.split + ' writerLoaded=' + st.lod);
        ck('LIVE_SPLIT:' + tag, st.split === expectSplit, 'the open building is ' + (st.split ? 'a split pair (A.libDb != A.db)' : 'a monolith') + ', expected ' + (expectSplit ? 'split' : 'monolith'));
        const files = () => fs.readdirSync(dl).filter((f) => !/\.crdownload$|\.tmp$/.test(f) && fs.statSync(path.join(dl, f)).isFile());
        const waitFile = async (re, n0, ms) => { for (let i = 0; i < ms / 500; i++) { const hit = files().filter((f) => re.test(f)); if (hit.length > n0) return hit[hit.length - 1]; await sl(500); } return null; };
        const panelShown = () => page.evaluate(() => { const p = document.getElementById('v-export-panel'); return !!(p && p.style.display === 'block'); });
        const openMenu = async () => {   // the real pill: the trigger, then the Export button, with the mouse; retried (a loaded machine can miss the first tap)
          if (await panelShown()) return true;
          const vis = () => page.evaluate(() => { const r = document.getElementById('pill-save').getBoundingClientRect(); return r.width > 4 && r.height > 4; });
          for (let attempt = 0; attempt < 4; attempt++) {
            for (let i = 0; i < 40 && !(await vis()); i++) { try { await page.click('#mobile-trigger'); } catch (e) { /* not shown yet: wait */ } await sl(500); }
            if (await vis()) {
              const r = await page.evaluate(() => { const b = document.getElementById('pill-save').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }); await page.mouse.click(r.x, r.y);
              for (let i = 0; i < 24; i++) { await sl(250); if (await panelShown()) return true; }
            }
            await sl(1500);
          }
          log('  [' + tag + ' note] pill rects: ' + JSON.stringify(await page.evaluate(() => { const g = (id) => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return [r.x | 0, r.y | 0, r.width | 0, r.height | 0, cs.display, cs.visibility]; }; return { save: g('pill-save'), trig: g('mobile-trigger'), panel: g('v-export-panel') }; })));
          return false;
        };
        const clickSel = async (sel) => { const r = await page.evaluate((s) => { const d = document.querySelector(s); if (!d) return null; const b = d.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, sel); if (!r) return false; await page.mouse.click(r.x, r.y); return true; };
        if (!(await openMenu())) { inc('LIVE:' + tag, 'the Export pill never opened the menu'); return; }
        const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#v-export-panel .ve-row')).map((d) => ({ key: d.getAttribute('data-key'), disabled: d.getAttribute('data-disabled') === '1', why: d.getAttribute('data-why'), title: d.getAttribute('title') || '', text: d.textContent.trim().replace(/\s+/g, ' ') })));
        const ifcRow = rows.find((r) => r.key === 'ifc');
        ck('LIVE_MENU:' + tag, rows.map((r) => r.key).join(',') === 'db,ifc,bcf' && !!ifcRow && !ifcRow.disabled && /whole building/.test(ifcRow.title) && /IFC4/.test(ifcRow.text) && /IFC2X3/.test(ifcRow.text), 'menu rows ' + JSON.stringify(rows.map((r) => r.key)) + '; IFC row enabled=' + (ifcRow && !ifcRow.disabled) + ' why=' + (ifcRow && ifcRow.why) + ' tip=' + JSON.stringify(ifcRow && ifcRow.title) + ' text=' + JSON.stringify(ifcRow && ifcRow.text));
        // IFC4 (default)
        let n0 = files().filter((f) => /\.ifc$/.test(f)).length; await clickSel('#v-export-panel .ve-row[data-key="ifc"] .ve-label');
        const f4 = await waitFile(/_IFC4\.ifc$/, 0, 180000);
        const last = await page.evaluate(() => ({ last: APP._ifcExportLast || null, status: (document.getElementById('import-status') || document.getElementById('status') || {}).textContent })); const mb = f4 ? fs.statSync(path.join(dl, f4)).size : 0;
        const nodeX = (() => { const dbN = tag === 'monolith' ? new SQL.Database(new Uint8Array(gwB)) : sp.meta, geoN = tag === 'monolith' ? null : sp.geo, nm = st.ab.replace(/\.(ifc|db)$/i, '').replace(/_(extracted|meta)$/i, ''); const col = X.collect(dbN, geoN), res = X.build(col, { schema: 'IFC4', name: nm + '_IFC4.ifc', buildingName: nm, projectName: nm }); return Object.assign({ n: res.stats.written }, hashParts(res.parts, null)); })();
        const liveSha = f4 ? crypto.createHash('sha256').update(fs.readFileSync(path.join(dl, f4))).digest('hex') : null;
        log('§IFC_EXPORT_SEL_LIVE tag=' + tag + ' file=' + f4 + ' bytes=' + mb + ' status=' + JSON.stringify(last.status) + ' last=' + JSON.stringify(last.last && { file: last.last.file, schema: last.last.schema, elements: last.last.elements, noGeometry: last.last.noGeometry }));
        const stRe = new RegExp('^IFC \\(IFC4\\): ' + nodeX.n + ' elements, \\d+\\.\\d MB$');
        ck('LIVE_IFC4:' + tag, !!(f4 && f4 === st.ab.replace(/\.(ifc|db)$/i, '').replace(/_(extracted|meta)$/i, '') + '_IFC4.ifc' && last.last && last.last.ok && last.last.schema === 'IFC4' && stRe.test(last.status || '') && lines.filter((l) => /§IFC_EXPORT_SEL mode=whole/.test(l)).length === 1),
          'download ' + f4 + ' (' + mb + ' B); status line ' + JSON.stringify(last.status) + ' (expected IFC (IFC4): ' + nodeX.n + ' elements, X MB); one §IFC_EXPORT_SEL line');
        ck('LIVE_EQ_NODE:' + tag, !!(liveSha && liveSha === nodeX.sha), 'the page file equals the node writer\'s bytes: ' + (liveSha && liveSha.slice(0, 16)) + ' / ' + nodeX.sha.slice(0, 16));
        const pv = f4 ? py(path.join(dl, f4)) : { error: 'no file' };
        if (pv.skip) inc('LIVE_VALID:' + tag, 'ifcopenshell not importable'); else ck('LIVE_VALID:' + tag, !pv.error && pv.validate_errors === 0, 'the downloaded file: ' + (pv.error || pv.validate_errors + ' validate errors, ' + pv.products + ' products'));
        // IFC2X3 through the schema toggle
        await openMenu(); await clickSel('#v-export-panel .ve-sch[data-schema="IFC2X3"]'); await sl(300);
        const pressed = await page.evaluate(() => Array.from(document.querySelectorAll('#v-export-panel .ve-sch')).map((b) => b.getAttribute('data-schema') + ':' + b.getAttribute('aria-pressed')).join(','));
        await clickSel('#v-export-panel .ve-row[data-key="ifc"] .ve-label');
        const f2 = await waitFile(/_IFC2X3\.ifc$/, 0, 180000); const head2 = f2 ? fs.readFileSync(path.join(dl, f2)).slice(0, 2000).toString() : '';
        ck('LIVE_IFC2X3:' + tag, !!(f2 && /FILE_SCHEMA\(\('IFC2X3'\)\)/.test(head2) && /IFC4:false/.test(pressed) && /IFC2X3:true/.test(pressed)), 'toggle ' + pressed + ' -> ' + f2 + ' header ' + JSON.stringify((/FILE_SCHEMA\(\([^)]*\)\)/.exec(head2) || [''])[0]));
        await page.evaluate(() => { try { APP.setIfcSchemaChoice('IFC4'); } catch (e) { } });
        // the refusal path: a building over the limit is refused with its reason in the status line and writes NO file
        const nBefore = files().length, ref = await page.evaluate(async () => { const r = await APP.exportIfcShared({ schema: 'IFC4', maxMB: -1, download: true }); return { ok: r.ok, why: r.why, status: (document.getElementById('import-status') || document.getElementById('status') || {}).textContent }; }); await sl(800);
        ck('LIVE_REFUSE:' + tag, ref.ok === false && ref.why === 'too_large' && /too large for the browser/.test(ref.status || '') && files().length === nBefore, 'over-limit export refused: ' + JSON.stringify(ref) + '; files before/after ' + nBefore + '/' + files().length);
        ck('LIVE_NOERR:' + tag, errs.length === 0, 'no page error (' + errs.length + ')');
        await ctx.close();
      };
      await liveCase('monolith', '/buildings/warehouse_gardenworld.db', false);
      await liveCase('split', '/buildings/_wit_ifcsel.db', true);
    }
  } catch (e) { log('§W-IFC-EXPORT-SEL ERROR ' + (e && e.stack || e)); return finish(3); }
  const fails = results.filter((r) => !r.ok), judged = results.length;
  const verdict = judged === 0 ? 'INCONCLUSIVE judged=0' : fails.length ? 'FAIL failed=[' + fails.map((f) => f.id).join(',') + '] of ' + judged : 'PASS ' + judged + ' of ' + judged;
  log('§W-IFC-EXPORT-SEL ' + verdict + ' inconclusive=[' + inconclusive.join(',') + '] red=' + (RED || 'none') + (judged && !fails.length && inconclusive.length ? ' (PASS covers only what was judged; see inconclusive)' : ''));
  await finish(judged === 0 ? 2 : fails.length ? 1 : 0);
})();
