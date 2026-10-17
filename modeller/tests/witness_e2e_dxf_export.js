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
 *   D7 SPLIT — §L6: Suggest a split (budget 25) in the live panel lists wings; a merge and a split through the panel selects keep a partition; the downloaded zip (KEY + wing sheets per storey) is valid, and importing it back with the Modeller's importer assembles the SAME model as the unscoped set (ops by storey, `run_id`/derived hashes normalised).
 *   D8 TIMER — the panel shows a real elapsed clock and a per-step time list (Reading / Extracting / Drawing / Markings) for the run, and the time of the last action (Suggest / merge / split).
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
  // D7: suggest -> merge -> split through the real panel controls, download, re-import, same model
  await t.pg.evaluate(async () => { const inp = document.getElementById('dxfexp-budget'); if (!inp) { const B0 = await window.DxfExportUI.run(window.__lastIfcFile); } });
  await t.pg.waitForFunction(() => !!document.getElementById('dxfexp-suggest'), { timeout: 120000 });
  await t.pg.evaluate(() => { const i = document.getElementById('dxfexp-budget'); i.value = '25'; document.getElementById('dxfexp-suggest').click(); });
  await t.pg.waitForFunction(() => /wings by grid line/.test(document.getElementById('m-dxfexp-panel').textContent), { timeout: 120000 });
  const n1 = await t.pg.evaluate(() => document.querySelectorAll('#dxfexp-scopes select[data-act="mg"]').length);
  const rows1 = await t.pg.evaluate(() => (document.getElementById('m-dxfexp-panel').textContent.match(/(\d+) wings by grid line/) || [])[1]);
  t.assert('D7a SUGGEST (panel lists wings with merge/split controls)', Number(rows1) >= 2 && n1 >= 1, rows1 + ' wings, ' + n1 + ' rows with a merge control');
  await t.shot('scopes-suggested');
  await t.pg.evaluate(() => { const el = document.querySelector('#dxfexp-scopes select[data-act="mg"]'); el.value = el.options[1].value; el.dispatchEvent(new Event('change')); });
  await t.sleep(1500);
  const rows2 = await t.pg.evaluate(() => (document.getElementById('m-dxfexp-panel').textContent.match(/(\d+) wings by grid line/) || [])[1] || '1');
  t.assert('D7b MERGE (two wings sharing an edge become one)', Number(rows2) === Number(rows1) - 1 || Number(rows2) === 1, rows1 + ' -> ' + rows2);
  const sx = await t.pg.evaluate(() => !!document.querySelector('#dxfexp-scopes select[data-act="sx"], #dxfexp-scopes select[data-act="sy"]'));
  if (sx) { await t.pg.evaluate(() => { const el = document.querySelector('#dxfexp-scopes select[data-act="sx"], #dxfexp-scopes select[data-act="sy"]'); el.value = el.options[1].value; el.dispatchEvent(new Event('change')); }); await t.sleep(1500); }
  const rows3 = await t.pg.evaluate(() => (document.getElementById('m-dxfexp-panel').textContent.match(/(\d+) wings by grid line/) || [])[1] || '1');
  t.assert('D7c SPLIT (a wing is cut at a grid line)', !sx || Number(rows3) === Number(rows2) + 1, rows2 + ' -> ' + rows3);
  await t.pg.evaluate(() => { window.__dl = null; }); await t.pg.click('#dxfexp-dl'); await t.sleep(1200);
  const b64s = await t.pg.evaluate(async () => { const b = window.__dl; if (!b) return null; const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); });
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'wdxfscope-')), zp2 = path.join(dir2, 's.zip'); fs.writeFileSync(zp2, Buffer.from(b64s, 'base64'));
  let ok2 = false; try { execSync('unzip -t ' + JSON.stringify(zp2) + ' 2>&1'); ok2 = true; } catch (e) { ok2 = false; }
  const names2 = execSync('unzip -Z1 ' + JSON.stringify(zp2)).toString().trim().split('\n').sort(); execSync('cd ' + JSON.stringify(dir2) + ' && unzip -o -q s.zip');
  const keysN = names2.filter(n => /__KEY_std\.dxf$/.test(n)).length, wingN = names2.filter(n => /__(?!KEY)[A-Z0-9_]+_std\.dxf$/.test(n)).length;
  t.assert('D7d ZIP (valid; KEY + wing sheets; no sidecar)', ok2 && keysN === 2 && wingN >= 2 && names2.every(n => /\.dxf$/.test(n)), names2.length + ' files, ' + keysN + ' KEY, ' + wingN + ' wing sheets');
  const f2 = names2.map(n => ({ name: n, text: fs.readFileSync(path.join(dir2, n), 'utf8') })), f0 = Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }));
  const s2 = I.readSheets(f2), s0 = I.readSheets(f0), g2 = I.gate(s2, {}), c2 = I.convert(s2, {}), c0 = I.convert(s0, {});
  const norm = c => (c.ST || []).map(st => st.name + ':' + (st.after || []).map(o => JSON.stringify(o, (k, v) => (k === 'run_id' ? undefined : typeof v === 'string' && /^[0-9a-f]{32,64}$/.test(v) ? '#' : typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v))).sort().join('|'));
  t.assert('D7e ASSEMBLE-BACK (the downloaded wings import to the same model as the unscoped set)', g2.ok && s2.scopeReport.blocking.length === 0 && norm(c0).length > 0 && JSON.stringify(norm(c0)) === JSON.stringify(norm(c2)), 'gate=' + g2.ok + ' scope blocking=' + s2.scopeReport.blocking.length + ' storeys=' + norm(c2).length + ' ops=' + (c2.ST || []).reduce((a, st) => a + st.after.length, 0));
  const tm = await t.pg.evaluate(() => ({ total: window.DxfExportUI.timer.total, steps: window.DxfExportUI.timer.steps.map(x => x.label + '=' + Math.round(x.ms) + 'ms'), clock: (document.getElementById('dxfexp-clock') || {}).textContent, last: window.DxfExportUI.timer.last && window.DxfExportUI.timer.last.label }));
  t.assert('D8 TIMER (elapsed clock + step list + last action)', tm.total >= 0 && tm.steps.length >= 3 && /\d/.test(tm.clock || '') && !!tm.last, `clock=${(tm.clock || '').trim()} steps=${tm.steps.join(', ')} last=${tm.last}`);
});
