#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PLUGIN-AD-ACTIONS (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §BIMDOC-ADPASS step 3, §LENS-REGISTER). READ THE LOG: §PAA lines; the exit code is not the evidence.
// THE ISSUE it proves/disproves: a staged plugin can give the user record ACTIONS through a side door (ctx.lens.register with an actions() function) that the AD dictionary does not
//   list, so the gear, role access, the process log and the dictionary-generated verb layer never see them (owner 2026-11-09: "extra process lens should be avoided ... It is precisely
//   the idea of legacy plugins to be adopting the AD"). The BIM Document shipped two such actions (FB1). This witness, for EVERY bundle in erp/plugins:
//   (1) activates it against a RECORDING ctx (every seam a no-op that records; nothing is written) and records each lens it registers with an actions() function = a SIDE DOOR;
//   (2) a bundle that does not activate in node is still judged from its source (a "ctx.lens.register(" call), so it cannot pass by failing to start (scope-blind guard);
//   (3) counts the bundle's AD-enumerable actions: staged AD_Process rows + Button columns (AD_Reference_ID 28) carrying an AD_Process_ID.
//   Verdict per bundle: PASS (no side door) | FINDING (side door, listed). Expected findings are named in §LENS-REGISTER (friendly-ops): reported, not failed.
//   FAIL = a bundle not on the expected list has a side door, or the BIM Document bundle has one, or the red control is not caught.
//   RED CONTROL: a planted fixture bundle with one lens action must be judged FINDING. INCONCLUSIVE when no bundle was judged.
// Command: node erp/tests/witness_plugin_ad_actions.js
'use strict';
const fs = require('fs'), path = require('path'), url = require('url');
const PL = path.join(__dirname, '..', 'plugins');
const EXPECTED = { 'friendly_ops.mjs': '§LENS-REGISTER row friendly-ops (shortcuts to AD paths; Preview and Receive payment to be checked)' };
const MUST_PASS = ['bim_document.mjs'];

function recordingCtx(rec) {
  const noop = () => undefined;
  const deep = () => new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : deep()), apply: () => undefined });
  const db = { query: () => [], run: noop, exec: () => [] };
  const seams = {
    db,
    dict: { insert: () => 0, stage: () => 0, rollback: noop },
    lens: { register: (id, desc) => { rec.lens.push({ id, hasActions: !!(desc && typeof desc.actions === 'function'), desc }); return 1; } },
    process: { defineProcess: (cn) => { rec.classes.push(cn); return function () {}; }, registerHandler: (cn) => { rec.classes.push(cn); } },
    docAction: { registerModel: noop, registerDocAction: noop },
    docFsm: { register: noop }
  };
  return new Proxy(seams, { get: (t, k) => (k in t ? t[k] : (k === 'then' ? undefined : deep())) });
}
function adActions(mod) {
  const d = (mod && mod.manifest && mod.manifest.dictionary) || [], out = [];
  d.forEach((x) => (x.rows || []).forEach((r) => {
    if (x.table === 'ad_process') out.push('AD_Process ' + r.ad_process_id + ' ' + r.name);
    if (x.table === 'ad_column' && Number(r.ad_reference_id) === 28 && r.ad_process_id) out.push('Button ' + r.columnname + ' -> AD_Process ' + r.ad_process_id);
  }));
  return out;
}
async function judgeBundle(file, src, mod) {
  const rec = { lens: [], classes: [] }; let activated = false, err = null;
  if (mod && typeof mod.activate === 'function') {
    const log = console.log; console.log = () => {};
    try { await Promise.race([Promise.resolve(mod.activate(recordingCtx(rec))), new Promise((_, j) => setTimeout(() => j(new Error('timeout')), 3000))]); activated = true; }
    catch (e) { err = e && e.message; } finally { console.log = log; }
  }
  const staticDoor = /ctx\.lens\.register\s*\(/.test(src);
  const doors = rec.lens.filter((l) => l.hasActions).map((l) => l.id);
  if (!activated && staticDoor && !doors.length) doors.push('(source) ctx.lens.register');
  const labels = [];
  rec.lens.filter((l) => l.hasActions).forEach((l) => { try { const a = l.desc.actions({ tab: { tableName: 'c_order' }, keyVal: 1, legal: ['CO'], rec: {}, related: () => [] }) || []; a.forEach((x) => labels.push(l.id + ':' + x.id)); } catch (e) { labels.push(l.id + ':(actions threw)'); } });
  return { file, activated, err, doors, labels, ad: adActions(mod), classes: rec.classes };
}
(async () => {
  const files = fs.readdirSync(PL).filter((f) => /\.mjs$/.test(f)).sort(), res = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(PL, f), 'utf8');
    let mod = null; try { mod = await import(url.pathToFileURL(path.join(PL, f)).href); } catch (e) { /* a chunk needing the browser: judged from source */ }
    res.push(await judgeBundle(f, src, mod));
  }
  let fails = 0, judged = 0, findings = 0;
  res.forEach((r) => {
    judged++;
    const finding = r.doors.length > 0, expected = !!EXPECTED[r.file], must = MUST_PASS.indexOf(r.file) >= 0;
    if (finding) findings++;
    const bad = finding && (!expected || must);
    if (bad) fails++;
    console.log('§PAA bundle=' + r.file + ' activated=' + (r.activated ? 'Y' : 'N' + (r.err ? '(' + String(r.err).slice(0, 60) + ')' : '')) + ' adActions=' + r.ad.length + (r.ad.length ? ' [' + r.ad.join('; ') + ']' : '') +
      ' processClasses=' + r.classes.length + ' sideDoors=' + r.doors.length + (r.doors.length ? ' [' + r.doors.join(',') + '] actions=[' + r.labels.join(',') + ']' : '') +
      ' -> ' + (finding ? (expected && !must ? 'FINDING expected: ' + EXPECTED[r.file] : 'FAIL side door not in the dictionary') : 'PASS'));
  });
  // RED CONTROL: a planted bundle with one lens action must be judged a finding
  const planted = await judgeBundle('planted_lens.mjs', 'ctx.lens.register(', { manifest: { dictionary: [] }, activate(ctx) { ctx.lens.register('planted', { actions: () => [{ id: 'go', label: 'Go' }], run() {} }); } });
  const redOk = planted.doors.length === 1 && planted.labels.join() === 'planted:go';
  if (!redOk) fails++;
  console.log('§PAA red-control planted bundle sideDoors=' + planted.doors.length + ' actions=[' + planted.labels + '] -> ' + (redOk ? 'caught' : 'NOT CAUGHT'));
  const bim = res.find((r) => r.file === 'bim_document.mjs');
  console.log('§PAA bimdoc activated=' + (bim && bim.activated) + ' adActions=' + (bim ? bim.ad.length : 0) + ' sideDoors=' + (bim ? bim.doors.length : '?'));
  if (!bim || !bim.activated) fails++;
  const pass = res.filter((r) => !r.doors.length).length;
  console.log('§PAA-VERDICT ' + (judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' bundles=' + judged + ' noSideDoor=' + pass + ' findings=' + findings + ' (expected: ' + Object.keys(EXPECTED).join(',') + ') failed=' + fails);
  process.exit(judged === 0 ? 3 : fails ? 1 : 0);
})();
