#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-DXF-WING: prompts/DXF2BIM_MODELLER_LANE.md §L1.16. Real user path, numbers not eyes. Read the log.
 * ISSUE IT PROVES OR DISPROVES: in the live Modeller, a building whose walls are not on X/Y can be exported as a straight WING (panel control), the .zip carries @FRAME on
 * every sheet, and importing that zip back puts the converted bodies where the building really is (turned back), not in the straight frame.
 *   W1 PANEL   — the export panel of a rotated building shows the WING control listing the angle family (read from the live DOM).
 *   W2 ZIP     — choosing the wing redraws; the downloaded zip is valid (Info-ZIP), only .dxf sheets, every sheet has @FRAME=<angle>.
 *   W3 PARITY  — every sheet equals the Node pipeline (writeStdSet wing + markings) on the same .db, byte for byte.
 *   W4 IMPORT  — the importer's gate sees the wing set, the frame is read (angle, centre), Convert commits ops.
 *   W5 PLACED  — the union bbox of the converted bodies in the live scene equals the Node wing import's bodies within 1e-3 m AND differs from the straight frame by > 1 m (the turn-back is visible).
 * Input: a rotated model .db from make_rotated_db.js (ROT_DB env, default /tmp/db2/DX_ROT30.db) and its angle (ROT_ANG, default 30).
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/', ROT = process.env.ROT_DB || '/tmp/db2/DX_ROT30.db', ANG = Number(process.env.ROT_ANG || 30);
runE2E('W-E2E-DXF-WING', async (t) => {
  await t.open(null, { rowText: 'Duplex · ARC' }); await t.sleep(3000);
  await t.pg.evaluate(() => { window.__dl = null; const o = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__dl = b; return o(b); }; });
  const b64db = fs.readFileSync(ROT).toString('base64');
  await t.pg.evaluate(async (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i); window.__B = await window.DxfExportUI.run(new File([u], 'ROT.db')); }, b64db);
  await t.pg.waitForFunction(() => !!document.getElementById('dxfexp-wing'), { timeout: 240000 });
  const opts = await t.pg.evaluate(() => Array.from(document.querySelectorAll('#dxfexp-wing option')).map(o => o.textContent + '=' + o.value));
  t.assert('W1 PANEL (the WING control lists the angle family of the rotated building)', opts.length === 2 && opts[1].indexOf('=' + ANG) > 0, JSON.stringify(opts));
  await t.shot('wing-offered');
  await t.pg.evaluate((a) => { const el = document.getElementById('dxfexp-wing'); el.value = String(a); el.dispatchEvent(new Event('change')); }, ANG);
  try { await t.pg.waitForFunction(() => /framed elements drawn straight/.test(document.getElementById('m-dxfexp-panel').textContent), { timeout: 120000 }); }
  catch (e) { console.log('  STALL panel=', (await t.pg.evaluate(() => document.getElementById('m-dxfexp-panel').textContent.replace(/\s+/g, ' ').slice(0, 700))), 'sel=', await t.pg.evaluate(() => { const s = document.getElementById('dxfexp-wing'); return s ? s.value + '/' + s.onchange : 'none'; }), 'logs=', JSON.stringify((t.slog || []).slice(-6))); throw e; }
  const info = await t.pg.evaluate(() => (document.getElementById('m-dxfexp-panel').textContent.match(/Wing at [^.]*\./) || [''])[0]);
  await t.shot('wing-chosen');
  await t.pg.evaluate(() => { window.__dl = null; }); await t.pg.click('#dxfexp-dl'); await t.sleep(1200);
  const b64 = await t.pg.evaluate(async () => { const b = window.__dl; if (!b) return null; const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wdxfwing-')), zp = path.join(dir, 'w.zip'); fs.writeFileSync(zp, Buffer.from(b64 || '', 'base64'));
  let ok = false, out = ''; try { out = execSync('unzip -t ' + JSON.stringify(zp) + ' 2>&1').toString(); ok = true; } catch (e) { out = String(e.stdout || e); }
  const names = execSync('unzip -Z1 ' + JSON.stringify(zp)).toString().trim().split('\n').sort(); execSync('cd ' + JSON.stringify(dir) + ' && unzip -o -q w.zip');
  const texts = names.map(n => ({ name: n, text: fs.readFileSync(path.join(dir, n), 'utf8') })), fr = texts.filter(f => new RegExp('@FRAME=' + ANG + ',').test(f.text)).length;
  t.assert('W2 ZIP (valid, only .dxf, @FRAME on every sheet)', ok && names.length >= 8 && names.every(n => /\.dxf$/.test(n)) && fr === names.length, `${out.trim().split('\n').pop()}; ${names.length} sheets, @FRAME on ${fr}; ${info}`);
  // Node pipeline on the same .db
  const initSqlJs = require('sql.js'), S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js');
  const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
  const SQL = await initSqlJs(), sdb = new SQL.Database(new Uint8Array(fs.readFileSync(ROT)));
  const q = sql => { const r = sdb.exec(sql); return r.length ? r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))) : []; };
  const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
  const pre = 'ROT', R = S.writeStdSet(q, pre, { wing: { angle: ANG, name: 'W' + ANG } }), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC }, { set: pre });
  const diff = []; Object.keys(Dm.files).forEach(n => { const f = texts.find(x => x.name === n); if (!f) diff.push(n + ' missing'); else if (f.text !== Dm.files[n]) diff.push(n + ' differs'); });
  t.assert('W3 PARITY (browser zip == Node wing pipeline, byte for byte)', diff.length === 0 && names.length === Object.keys(Dm.files).length, diff.slice(0, 3).join('; ') || `identical, ${names.length} sheets`);
  // The export does not tag window products (no family map in the model: lane §L5.7 item 3, same for a straight export). Supply the Duplex's stated round-trip labels as @TAG markings
  // (the same families the Duplex samples use: M_Fixed -> DUPLEX_SMALL_FIXED, M_Casement -> DUPLEX_CASEMENT) at each window's plan bbox centre in the WING frame, exactly as the sample set does.
  const WLAB = { M_Fixed: 'DUPLEX_SMALL_FIXED', M_Casement: 'DUPLEX_CASEMENT' }, pm = R.model; let tagged = 0;
  texts.forEach(f => { const m = /_(FLOOR_[A-Z0-9_]+)_std\.dxf$/.exec(f.name); if (!m) return; const st = pm.storeys.find(x => 'FLOOR_' + x.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') === m[1]); if (!st) return;
    const marks = pm.els.filter(e => e.cls === 'IfcWindow' && e.storey === st.name && e.etype === '819mm x 759mm' && WLAB[(e.name.split(':')[0])]).sort((a, b) => (a.guid < b.guid ? -1 : 1))
      .map(e => ({ text: '@TAG=window,z=' + Number(((e.z0 + e.z1) / 2).toFixed(4)) + ',' + WLAB[e.name.split(':')[0]] + ' @BY=model', x: Number(((e.x0 + e.x1) / 2 * 1000).toFixed(3)), y: Number(((e.y0 + e.y1) / 2 * 1000).toFixed(3)) }));
    if (marks.length) { f.text = MK.writeMarks(f.text, marks); tagged += marks.length; } });
  console.log('  window @TAG markings added (stated round-trip labels): ' + tagged);
  // import the downloaded zip in the live page (the real importer UI path), then Convert
  await t.pg.evaluate(() => { const p = document.getElementById('m-dxfexp-panel'); if (p) p.style.display = 'none'; });
  const gate = await t.pg.evaluate(async (fs) => { await window.DxfImportUI.openFiles(fs); const g = window.DxfImportUI.state.gate; return { ok: !!(g && g.ok), set: g && g.set, verdict: g && g.verdict && g.verdict.verdict, blocking: g && g.verdict && g.verdict.blocking.map(b => b.code), frame: g && g.R && g.R.frame }; }, texts);
  t.assert('W4a IMPORT (the wing set is read: roles + frame)', !!gate.frame && !gate.frame.error && Math.abs(gate.frame.angle - ANG) < 1e-9, JSON.stringify({ ok: gate.ok, set: gate.set, verdict: gate.verdict, frame: gate.frame, blocking: (gate.blocking || []).filter((c, i, a) => a.indexOf(c) === i) }));
  await t.shot('wing-imported');
  const NodeT = (() => { const sheets = I.readSheets(texts.map(f => ({ name: f.name, text: f.text }))), out = I.convert(sheets, {}); return { out, T: I.toOps(out, { hashHex, frame: out.frame }), S0: I.toOps(out, { hashHex, frame: { angle: 0, ox: 0, oy: 0 } }) }; })();
  const bbox = T => { const mn = [Infinity, Infinity], mx = [-Infinity, -Infinity]; T.assets.forEach(a => { for (let i = 0; i < a.v.length; i += 3) { const x = a.v[i] + a.centre[0], y = a.v[i + 1] + a.centre[1]; mn[0] = Math.min(mn[0], x); mx[0] = Math.max(mx[0], x); mn[1] = Math.min(mn[1], y); mx[1] = Math.max(mx[1], y); } }); return [mn[0], mn[1], mx[0], mx[1]]; };
  const enabled = await t.pg.evaluate(() => { const b = document.getElementById('dxf-convert'); return b ? !b.disabled : false; });
  if (!enabled) { t.assert('W4b CONVERT (Convert is enabled for the wing set)', false, 'convert disabled: gate ' + JSON.stringify({ ok: gate.ok, verdict: gate.verdict, blocking: [...new Set(gate.blocking || [])] })); return; }
  await t.pg.click('#dxf-convert'); await t.pg.waitForFunction('window.DxfImportUI.state.last', { timeout: 600000 }); await t.sleep(2500);
  const live = await t.pg.evaluate(() => { const T = window.THREE, g = window.Bonsai.group(), L = window.DxfImportUI.state.last, bx = new T.Box3(); let n = 0;
    const fids = new Set(Object.values(L.fidByGuid || {})); g.children.forEach(m => { if (m.isMesh && m.userData && fids.has(m.userData.featureId)) { bx.expandByObject(m); n++; } });
    return { n, bbox: bx.isEmpty() ? null : [bx.min.x, bx.min.y, bx.max.x, bx.max.y], counts: L.counts }; });
  t.assert('W4b CONVERT (bodies committed in the live scene)', live.n > 0, JSON.stringify({ meshes: live.n, counts: live.counts }));
  const eb = bbox(NodeT.T), sb = bbox(NodeT.S0), dev = live.bbox ? Math.max(...live.bbox.map((v, i) => Math.abs(v - eb[i]))) : Infinity, away = live.bbox ? Math.max(...live.bbox.map((v, i) => Math.abs(v - sb[i]))) : 0;
  t.assert('W5 PLACED (live scene bbox == Node turned-back bodies within 1e-3 m; > 1 m from the straight frame)', dev < 1e-3 && away > 1, `live=${JSON.stringify((live.bbox || []).map(v => +v.toFixed(3)))} node=${JSON.stringify(eb.map(v => +v.toFixed(3)))} dev=${dev.toExponential(2)} away_from_straight=${away.toFixed(2)} m`);
  await t.shot('wing-converted');
});
