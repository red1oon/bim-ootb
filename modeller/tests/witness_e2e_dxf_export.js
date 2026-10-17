#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-DXF-EXPORT: prompts/DXF2BIM_MODELLER_LANE.md §L5.1/§L5.4. Real user path, numbers not eyes.
 * ISSUE IT PROVES OR DISPROVES: the Modeller's Export ▸ "2D drawings (DXF)" really runs in the browser (web-ifc wasm + sql.js, lazy scripts), shows the
 * drawable report BEFORE any download, and the .zip it hands over is valid and holds exactly the sheets the Node pipeline writes from the same IFC.
 *   D1 ENTRY    — the Export panel has the "2D drawings (DXF)" row (real #b-export click, real row click).
 *   D2 REPORT   — the report panel shows Drawable + the storeys/hosts/grid rows (text read from the live DOM).
 *   D3 ZIP      — the downloaded bytes pass Info-ZIP `unzip -t` (independent of our writer).
 *   D4 NO-SIDECAR — the zip entries are exactly the .dxf sheets.
 *   D6 DB-INPUT — §L5.9: a Node-schema model .db handed to the same entry skips extraction and writes the same sheets as the Node pipeline on that .db; an old-schema .db is refused with the command to run.
 *   D5 PARITY   — every entry's text equals the Node run (modeller/dxf2bim modules, better-sqlite3-free sql.js path) on the same IFC, byte for byte.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/', IFC = path.join(M, '..', 'IFC', 'Duplex_ARC.ifc');
runE2E('W-E2E-DXF-EXPORT', async (t) => {
  await t.open(null, { rowText: 'Duplex · ARC' });
  await t.sleep(3000);
  await t.pg.evaluate(() => {   // capture the blob handed to the download anchor (the real click path), instead of a file dialog
    window.__dl = null; const o = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { window.__dl = b; return o(b); };
  });
  await t.pg.click('#b-export'); await t.sleep(300);
  const row = await t.pg.evaluate(() => { const r = document.querySelector('#m-export-panel .me-row[data-key="dxf"]'); return r ? r.textContent.replace(/\s+/g, ' ').trim() : null; });
  t.assert('D1 ENTRY (Export panel row "2D drawings (DXF)")', !!row && /2D drawings/.test(row), String(row));
  await t.pg.click('#m-export-panel .me-row[data-key="dxf"]');
  await t.pg.waitForFunction(() => { const p = document.getElementById('m-dxfexp-panel'); return p && p.style.display !== 'none' && /Drawable|Not drawable|Could not/.test(p.textContent); }, { timeout: 180000 });
  const txt = await t.pg.evaluate(() => document.getElementById('m-dxfexp-panel').textContent.replace(/\s+/g, ' '));
  t.assert('D2 REPORT (Drawable + storeys + hosts + grid rows)', /Drawable: the standard set was written/.test(txt) && /Plan Level 1/.test(txt) && /Openings with a stated host wall/.test(txt) && /Building grid/.test(txt), txt.slice(0, 260));
  await t.shot('report');
  await t.pg.click('#dxfexp-dl'); await t.sleep(800);
  const b64 = await t.pg.evaluate(async () => { const b = window.__dl; if (!b) return null; const u = new Uint8Array(await b.arrayBuffer()); let s = ''; const CH = 8192; for (let i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH)); return btoa(s); });
  if (!b64) { t.assert('D3 ZIP (download produced)', false, 'no blob'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wdxfexp-')), zp = path.join(dir, 'x.zip'); fs.writeFileSync(zp, Buffer.from(b64, 'base64'));
  let ok = false, out = ''; try { out = execSync('unzip -t ' + JSON.stringify(zp) + ' 2>&1').toString(); ok = true; } catch (e) { out = String(e.stdout || e); }
  t.assert('D3 ZIP (Info-ZIP unzip -t exits 0)', ok, out.trim().split('\n').pop());
  const names = execSync('unzip -Z1 ' + JSON.stringify(zp)).toString().trim().split('\n').sort();
  t.assert('D4 NO-SIDECAR (only .dxf sheets)', names.length >= 8 && names.every(n => /\.dxf$/.test(n)), names.join(' '));
  execSync('cd ' + JSON.stringify(dir) + ' && unzip -o -q x.zip');
  // Node run of the same pipeline (sql.js path) on the same IFC
  const WebIFC = require('web-ifc'), initSqlJs = require('sql.js'), Core = require(D + 'ifc_extract_core.js'), S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js');
  const MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
  const SQL = await initSqlJs(), api = new WebIFC.IfcAPI(); await api.Init(); const sdb = new SQL.Database();
  await Core.extractToDb({ WebIFC, ifcApi: api, ifcData: new Uint8Array(fs.readFileSync(IFC)), db: Core.sqljsDb(sdb), Buf: Core.browserBuf, buildingName: 'DUPLEX', sourceName: 'Duplex_ARC.ifc' });
  const q = sql => { const r = sdb.exec(sql); return r.length ? r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))) : []; };
  const R = S.writeStdSet(q, 'DUPLEX'), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex: I.sha256Hex, MK, SHC }, { set: 'DUPLEX' });
  const want = Object.keys(Dm.files).sort(); let diff = [];
  want.forEach(n => { const p = path.join(dir, n); if (!fs.existsSync(p)) diff.push(n + ' missing'); else if (fs.readFileSync(p, 'utf8') !== Dm.files[n]) diff.push(n + ' differs'); });
  t.assert('D5 PARITY (browser zip == Node pipeline, byte for byte, ' + want.length + ' sheets)', diff.length === 0 && JSON.stringify(names) === JSON.stringify(want), diff.slice(0, 4).join('; ') || 'identical');
  // D6: the same IFC extracted to a model .db (browser path export), handed to DxfExportUI.run(File('.db')) in the live page
  const bytes = sdb.export(), b64db = Buffer.from(bytes).toString('base64');
  const rr = await t.pg.evaluate(async (b64) => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i);
    const B = await window.DxfExportUI.run(new File([u], 'DUPLEX.db'));
    return B ? { files: Object.keys(B.marked || {}).sort(), sample: B.marked ? B.marked[Object.keys(B.marked).sort()[0]] : null, drawable: B.report.drawable } : null;
  }, b64db);
  const sameSample = rr && rr.sample === Dm.files[want[0]];
  t.assert('D6 DB-INPUT (.db skips extraction; same sheets as the Node pipeline on that .db)', !!rr && rr.drawable && JSON.stringify(rr.files) === JSON.stringify(want) && sameSample, rr ? rr.files.length + ' sheets, first sheet ' + (sameSample ? 'identical' : 'differs') : 'null');
  const bad = await t.pg.evaluate(async () => {   // an old-schema db (no element_world_bbox) is refused, not misread
    const SQL = window.SQL, d = new SQL.Database(); d.run('CREATE TABLE elements_meta (guid TEXT)'); const u = d.export(); d.close();
    await window.DxfExportUI.run(new File([u], 'OLD.db')); const p = document.getElementById('m-dxfexp-panel'); return p ? p.textContent : '';
  });
  t.assert('D6b OLD-SCHEMA REFUSED (names the extractor command)', /no element_world_bbox/.test(bad) && /extractIFC2DB/.test(bad), bad.replace(/\s+/g, ' ').slice(0, 160));
});
