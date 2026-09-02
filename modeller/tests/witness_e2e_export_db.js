#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-EXPORT-DB: witness for the Export menu + native .db export
 * (prompts/EXPORT_MENU_NATIVE_DB.md — Item 6, FABLE5_WRAPUP_2026-07-03). Read the log after every run.
 *
 * ISSUE IT PROVES: #b-open loaded a local .db but there was NO symmetric save — the only writer of the
 * native format (sealChain → db.export().buffer) was kernel_ops' IndexedDB auto-persist. Only the two
 * LOSSY translations (IFC, BCF) had toolbar buttons. This proves the ONE Export menu ships the
 * FULL-fidelity native .db out of the app and back IN through the same door #b-open uses, losslessly.
 *
 * CLAIMS:
 *   E1 MENU        — #b-export in #bar + enabled; #b-ifc/#b-bcf GONE from the DOM; clicking opens
 *                    #m-export-panel with exactly the 3 rows native/ifc/bcf.
 *   E2 NATIVE ROW  — the real menu click (Export ▸ Native .db) runs the handler (#stat ".db exported",
 *                    §EXPORT-NATIVE logged with sealed count + tip).
 *   E3 CHAIN       — the exported bytes verify clean in a FRESH SQL.Database: KernelOps.verifyChain ok
 *                    AND every row carries op_hash (the seal was NOT skipped).
 *   E4 ROUND-TRIP  — the exported .db re-opens via the REAL #b-open ▸ "Open local .db…" file-chooser
 *                    path; after re-open: op count, chain tip and folded mesh census reproduce, and a
 *                    re-export is BYTE-IDENTICAL (sha256(b1) == sha256(b2)) — same standard as the IFC
 *                    re-import check (modeller.html ?ifc=demo).
 *   E5 IFC ROW     — Export ▸ IFC drives the UNCHANGED exportModel handler (#stat "IFC exported").
 *                    (Export ▸ BCF is proven by W-E2E-BCF B6, updated to the menu path.)
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const crypto = require('crypto');
const fs = require('fs'), path = require('path'), os = require('os');

runE2E('W-E2E-EXPORT-DB', async (t) => {
  await t.open('Duplex');

  // settle: the ARC seed group commits shortly after open — wait until the op-log length is stable.
  let len = -1;
  for (let i = 0; i < 40; i++) {
    const l = await t.pg.evaluate(() => window.Bonsai.oplog.length);
    if (l > 0 && l === len) break;
    len = l; await t.sleep(500);
  }
  // one REAL authored op beyond the seed, so the round-trip carries a user edit too (pill_declutter idiom).
  await t.pg.evaluate(async () => {
    await window.Bonsai.library.ready();
    const c = window.Bonsai.library.catalog().find(c => c.ifc_class === 'IfcDoor') || window.Bonsai.library.catalog()[0];
    await window.Bonsai.oplog.commit({ op_type: 'GEOM_INSERT', parameters: { hash: c.hash, placement: { x: 1, y: 1, z: 0, rot: 0 }, lod: '200' } });
  });
  const lenBefore = await t.pg.evaluate(() => window.Bonsai.oplog.length);
  console.log('  §EXPDB oplog settled ops=' + lenBefore);

  // E1 — the ONE Export menu (and the old flat buttons are gone)
  const ui0 = await t.pg.evaluate(() => ({
    exp: (() => { const b = document.getElementById('b-export'); return b ? { inBar: !!b.closest('#bar'), disabled: b.disabled } : null; })(),
    ifc: !!document.getElementById('b-ifc'), bcf: !!document.getElementById('b-bcf')
  }));
  await t.clickSel('#b-export'); await t.sleep(250);
  const menu = await t.pg.evaluate(() => {
    const p = document.getElementById('m-export-panel');
    if (!p || p.style.display !== 'block') return { open: false };
    return { open: true, rows: [].slice.call(p.querySelectorAll('.me-row')).map(d => d.getAttribute('data-key')) };
  });
  t.assert('E1 MENU (#b-export enabled in #bar, #b-ifc/#b-bcf GONE, 3 rows native/ifc/bcf)',
    ui0.exp && ui0.exp.inBar && !ui0.exp.disabled && !ui0.ifc && !ui0.bcf &&
    menu.open && JSON.stringify(menu.rows) === JSON.stringify(['native', 'ifc', 'bcf']),
    'exp=' + JSON.stringify(ui0.exp) + ' oldBtns=' + ui0.ifc + '/' + ui0.bcf + ' rows=' + JSON.stringify(menu.rows));

  // E2 — the real Native .db menu row runs the handler
  await t.clickSel('#m-export-panel .me-row[data-key="native"]'); await t.sleep(900);
  const stat2 = await t.pg.evaluate(() => document.getElementById('stat').textContent);
  const nativeLog = t.slog.filter(l => /^§EXPORT-NATIVE ops=/.test(l)).pop() || '';
  t.assert('E2 NATIVE ROW (menu click → ".db exported" + §EXPORT-NATIVE sealed log)',
    /\.db exported/.test(stat2) && /sealed=\d+ tip=/.test(nativeLog),
    'stat="' + stat2.slice(0, 60) + '" log="' + nativeLog.slice(0, 80) + '"');

  // bytes b1 through the SAME function the row calls (download suppressed — the exportModel seam idiom)
  const ex1 = await t.pg.evaluate(async () => {
    const r = await window.Bonsai.exportDb({ download: false });
    let b64 = ''; const u8 = r.bytes, CH = 32766;
    for (let i = 0; i < u8.length; i += CH) b64 += btoa(String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CH, u8.length))));
    return { b64, n: u8.length, tip: r.tip, sealed: r.sealed };
  });
  const b1 = Buffer.from(ex1.b64, 'base64');
  const sha1 = crypto.createHash('sha256').update(b1).digest('hex');
  console.log('  §EXPDB b1 bytes=' + ex1.n + ' sealed=' + ex1.sealed + ' tip=' + ex1.tip.slice(0, 12) + ' sha256=' + sha1.slice(0, 16));

  // E3 — the exported BYTES verify clean in a fresh db (seal not skipped)
  const chain = await t.pg.evaluate(async (b64) => {
    const bin = atob(b64); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const db = new window.SQL.Database(u8);
    const v = await window.KernelOps.verifyChain(db);
    const tot = db.exec('SELECT COUNT(*), COUNT(op_hash) FROM kernel_ops')[0].values[0];
    db.close();
    return { ok: !!(v && v.ok), len: v && v.len, rows: tot[0], sealedRows: tot[1] };
  }, ex1.b64);
  // rows = ALL kernel_ops rows (O.length counts only GEOM% ops — a superset check, every row sealed)
  t.assert('E3 CHAIN (verifyChain green on the exported bytes, every row sealed)',
    chain.ok && chain.rows >= lenBefore && chain.rows === chain.sealedRows,
    'ok=' + chain.ok + ' rows=' + chain.rows + ' (geomOps=' + lenBefore + ') sealed=' + chain.sealedRows);

  // E4 — ROUND-TRIP through the REAL #b-open ▸ "Open local .db…" file-chooser path.
  // The model is CLEARED first so everything that comes back provably comes from the exported FILE.
  const meshesBefore = await t.pg.evaluate(() => window.Bonsai.group().children.filter(o => o.isMesh && o.userData.featureId != null).length);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wexpdb-'));
  const dbPath = path.join(dir, 'Duplex.db');
  fs.writeFileSync(dbPath, b1);
  const cleared = await t.pg.evaluate(() => { window.Bonsai.oplog.clear(); return { len: window.Bonsai.oplog.length, meshes: window.Bonsai.group().children.filter(o => o.isMesh && o.userData.featureId != null).length }; });
  console.log('  §EXPDB cleared len=' + cleared.len + ' meshes=' + cleared.meshes + ' (scene provably rebuilt from the file next)');
  await t.clickSel('#b-open'); await t.sleep(250);
  const [chooser] = await Promise.all([
    t.pg.waitForFileChooser({ timeout: 10000 }),
    t.pg.click('#m-open-panel .mo-row[data-key="__local"]')
  ]);
  await chooser.accept([dbPath]);
  await t.pg.waitForFunction((n) => window.Bonsai.oplog.length === n, { timeout: 30000 }, lenBefore).catch(() => {});
  await t.sleep(1200);   // fold settles
  const importLog = t.slog.filter(l => /§EXPORT-NATIVE imported/.test(l)).pop() || '';
  const after = await t.pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    const r = await window.Bonsai.exportDb({ download: false });
    let b64 = ''; const u8 = r.bytes, CH = 32766;
    for (let i = 0; i < u8.length; i += CH) b64 += btoa(String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CH, u8.length))));
    return { len: O.length, tip: r.tip, b64, n: u8.length,
      meshes: window.Bonsai.group().children.filter(o => o.isMesh && o.userData.featureId != null).length };
  });
  const b2 = Buffer.from(after.b64, 'base64');
  const sha2 = crypto.createHash('sha256').update(b2).digest('hex');
  console.log('  §EXPDB round-trip len=' + after.len + '/' + lenBefore + ' tip=' + after.tip.slice(0, 12) +
    ' meshes=' + after.meshes + '/' + meshesBefore + ' sha256(b2)=' + sha2.slice(0, 16) + ' importLog="' + importLog.slice(0, 90) + '"');
  t.assert('E4 ROUND-TRIP (re-open via the real #b-open local door → ops+tip+mesh census reproduce, re-export BYTE-IDENTICAL)',
    /verify=true/.test(importLog) && after.len === lenBefore && after.tip === ex1.tip &&
    after.meshes === meshesBefore && sha1 === sha2 && b1.length === b2.length,
    'len=' + after.len + '/' + lenBefore + ' tipEq=' + (after.tip === ex1.tip) + ' meshEq=' + (after.meshes === meshesBefore) +
    ' bytes=' + b1.length + '/' + b2.length + ' shaEq=' + (sha1 === sha2));

  // E5 — Export ▸ IFC re-triggers the UNCHANGED handler
  await t.clickSel('#b-export'); await t.sleep(250);
  await t.clickSel('#m-export-panel .me-row[data-key="ifc"]');
  await t.pg.waitForFunction(() => /IFC exported|FAIL/.test(document.getElementById('stat').textContent), { timeout: 60000 }).catch(() => {});
  const stat5 = await t.pg.evaluate(() => document.getElementById('stat').textContent);
  t.assert('E5 IFC ROW (menu click → "IFC exported" via the unchanged exportModel handler)',
    /IFC exported/.test(stat5), 'stat="' + stat5.slice(0, 70) + '"');
}, { width: 1200, height: 850, dpr: 1 });
