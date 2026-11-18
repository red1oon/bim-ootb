// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — lod_ui.js: the chooser dialog of the LOD Upgrade pill (#b-lodup). Lazy: loaded on the first press, never at boot (BROWSER_BOOT_WEIGHT.md). Read the §LODUP_* log after every run.
// Implementing prompts/MODELLER_LOD_UPGRADE_PILL.md §2 — Witness: W-LODUP-REBAR (node) + the real-Modeller run (prompts/MODELLER_LOD_UPGRADE_PILL.md §P1 RESULT).
// The dialog renders ONLY LodRegistry.describe(): one row per registered pack (applies-to count, stated/default rule counts, Rules link, Run). Packs are listed in lod/packs.json; a new pack
// = one file + one line there, no toolbar or dialog change. A run writes through the op-log as ONE gesture (Undo removes it all): GEOM_INSERT rows, provenance generated:<pack>, params.parts_of;
// element_parts + upgrade_changes are derived from the live ops after every op-log event (so Undo leaves no stale row).
(function () {
  'use strict';
  var TAG = '§LODUP', BASE = (function () { try { return new URL('.', document.currentScript.src).href; } catch (e) { return 'lod/'; } })();
  var state = { ready: false, panel: null, rules: {}, edits: {}, last: {}, open: {}, runs: [], busy: false, hidden: {}, inputs: {}, frame: null, schema: 'IFC2X3', ifcLast: null, data: {} };   // data[packId][fileId] = an editable data file a pack declares (P8: schedule formats)   // inputs[packId][inputId] = {json, name, summary}: a file the person loaded for a pack (P6)

  function log(m) { console.log(TAG + ' ' + m); }
  // the download names: the opened file's name without its .db / .sqlite / .ifc extension (was "JPAM_base.db_addon_IFC2X3.ifc"; spec MODELLER_LOD_UPGRADE_PILL.md "P7 NAME FIX")
  function modelName() { return String(window.__dwName || 'model').replace(/\.(db|sqlite|sqlite3|ifc)$/i, ''); }
  function load(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('load failed ' + src)); }; document.head.appendChild(s); }); }
  async function boot() {
    if (state.ready) return;
    var man = await (await fetch(BASE + 'packs.json')).json();
    for (var i = 0; i < man.packs.length; i++) await load(BASE + man.packs[i].file + '?v=5');
    await load(BASE + 'lod_ifc.js?v=1');   // P7: the Add-on IFC writer (pure; loaded with the engine, never at boot)
    await load(BASE + 'lod_schedule.js?v=1');   // P8: schedule tables read through a schedule format (pure)
    var Rg = window.LodRegistry, R = window.LodRules;
    for (var j = 0; j < Rg.list().length; j++) { var p = Rg.list()[j]; state.rules[p.id] = R.load(await (await fetch(BASE + p.rulesFile)).json()); state.edits[p.id] = {}; }
    for (var d = 0; d < Rg.list().length; d++) { var pk = Rg.list()[d]; for (var df = 0; df < (pk.dataFiles || []).length; df++) { var dfile = pk.dataFiles[df]; (state.data[pk.id] = state.data[pk.id] || {})[dfile.id] = await (await fetch(BASE + dfile.file)).json(); } }
    state.ready = true; log('ready packs=' + Rg.list().map(function (p) { return p.id; }).join(','));
    window.addEventListener('bonsai:oplog', function () { try { syncTables(); applyHostHide(); refreshIfcButton(); } catch (e) { console.warn(TAG + ' sync failed ' + (e && e.message)); } });
    window.addEventListener('bonsai:refold', function () { try { applyHostHide(); } catch (e) { console.warn(TAG + ' host hide failed ' + (e && e.message)); } });
  }
  function rowsOf(id) { return window.LodRules.merge(state.rules[id], state.edits[id]).rows; }
  async function input() {
    var db = await window.OpenBuildingDb.get(); if (!db) return null;
    var inp = window.LodReader.fromDb(db); inp.callouts = [];
    inp.inputs = {}; Object.keys(state.inputs).forEach(function (pid) { inp.inputs[pid] = {}; Object.keys(state.inputs[pid]).forEach(function (iid) { inp.inputs[pid][iid] = state.inputs[pid][iid].json; }); });
    inp.generated = liveGenerated(); return inp;
  }
  // P6: the live generated parts of every pack (undone = 0), world soups rebuilt from the op rows + the registered meshes. A pack seeds its clash neighbours from this (joint_pack kit.seedGenerated), so Run Joints
  // then Run Gussets cannot overlap. Lazy: read only when a run asks (rebar sets are megabytes), once per input().
  function liveGenerated() {
    var memo = null;
    return function () {
      if (memo) return memo; var B = window.Bonsai, O = B && B.oplog, db = O && O.db, Lb = B && B.library; if (!db || !Lb || !Lb._geom) return (memo = []);
      var r = db.exec("SELECT output_guid, parameters FROM kernel_ops WHERE undone=0 AND op_type='GEOM_INSERT' AND output_guid LIKE 'GEN-%' ORDER BY id"), rows = [];
      if (r.length) r[0].values.forEach(function (v) { try { rows.push({ guid: v[0], params: JSON.parse(v[1]) }); } catch (e) { /* an unreadable row is not a neighbour */ } });
      memo = window.LodOps.fromOps(rows, function (h) { return Lb._geom['rg:' + h]; }); log('§LODUP_NEIGHBOURS live_generated_parts=' + memo.length + ' (the model as read + these op-log parts are every pack\'s clash neighbours)'); return memo;
    };
  }

  // element_parts + upgrade_changes, derived from the live ops (Undo / Redo keep them honest)
  function syncTables() {
    var O = window.Bonsai && window.Bonsai.oplog, db = O && O.db; if (!db || !state.runs.length) return;
    var live = {}, parts = [];
    var r = db.exec("SELECT output_guid, parameters FROM kernel_ops WHERE undone=0 AND output_guid LIKE 'GEN-%'");
    if (r.length) r[0].values.forEach(function (v) { live[v[0]] = 1; var P; try { P = JSON.parse(v[1]); } catch (e) { return; } if (P.parts_of) P.parts_of.forEach(function (h) { parts.push([h, v[0], P.ifc_class]); }); });
    db.run('CREATE TABLE IF NOT EXISTS element_parts (parent_guid TEXT, child_guid TEXT, parent_class TEXT, child_class TEXT, PRIMARY KEY (parent_guid, child_guid))');
    db.run('CREATE TABLE IF NOT EXISTS upgrade_changes (seq INTEGER PRIMARY KEY, change TEXT, guid TEXT, ifc_class TEXT, host_guid TEXT, rule TEXT, detail TEXT)');
    db.run("DELETE FROM element_parts WHERE child_guid LIKE 'GEN-%'"); db.run('DELETE FROM upgrade_changes');
    var meta = state.metaLast || {}, seq = 0;
    parts.forEach(function (p) { db.run('INSERT OR REPLACE INTO element_parts VALUES (?,?,?,?)', [p[0], p[1], meta[p[0]] ? meta[p[0]].cls : null, p[2]]); });
    state.runs.forEach(function (run) {
      var hadAdded = run.changes.some(function (c) { return c.kind === 'ADDED'; }), anyLive = run.changes.some(function (c) { return c.kind === 'ADDED' && live[c.guid]; });
      if (hadAdded && !anyLive) return;   // the whole run was undone: its refused / not-built rows go with it (Redo brings them back)
      run.changes.forEach(function (c) { if (c.kind === 'ADDED' && !live[c.guid]) return; db.run('INSERT INTO upgrade_changes VALUES (?,?,?,?,?,?,?)', [++seq, c.kind, c.guid, c.cls, c.host, c.rule, c.detail]); });
    });
    log('§LODUP_TABLES element_parts=' + parts.length + ' upgrade_changes=' + seq + ' live_generated=' + Object.keys(live).length);
  }

  // The seed rule (#3232, arc_editable.js §MOD_PARTS_VIEW) applied LIVE: a parent with parts present is not drawn. Derived from the live ops after every op-log event and every re-fold,
  // so Undo shows the parent again and Redo hides it again (a re-fold rebuilds meshes visible; this puts the lens back). Uses Bonsai.setFeatureVisible, the Outliner eye seam.
  function applyHostHide() {
    var B = window.Bonsai, O = B && B.oplog, db = O && O.db; if (!db || typeof B.setFeatureVisible !== 'function') return;
    var want = {}, r = db.exec("SELECT parameters FROM kernel_ops WHERE undone=0 AND output_guid LIKE 'GEN-%'");
    if (r.length) r[0].values.forEach(function (v) { var P; try { P = JSON.parse(v[0]); } catch (e) { return; } (P.parts_of || []).forEach(function (h) { want[h] = 1; }); });
    var fm = window.__arcFidByGuid || {}, back = 0, hid = 0;
    Object.keys(state.hidden).forEach(function (h) { if (want[h]) return; var f = fm[h]; if (f != null && B.setFeatureVisible(f, true)) back++; delete state.hidden[h]; });
    Object.keys(want).forEach(function (h) { var f = fm[h]; if (f != null && B.setFeatureVisible(f, false)) { state.hidden[h] = 1; hid++; } });
    if (hid || back || Object.keys(state.hidden).length) log('§LODUP_HOSTS parents_with_parts=' + Object.keys(want).length + ' hidden_now=' + Object.keys(state.hidden).length + ' restored=' + back + ' (a parent with parts present is not drawn: the seed rule, live)');
  }

  async function runPack(id) {
    var Rg = window.LodRegistry, pack = Rg.get(id), O = window.Bonsai.oplog, Lb = window.Bonsai.library, st = state.panel.querySelector('[data-st="' + id + '"]');
    var say = function (t) { if (st) st.textContent = t; if (typeof window.setStat === 'function') window.setStat(t); };
    if (state.busy) return; state.busy = true;
    try {
      var t0 = performance.now(), inp = await input(); if (!inp) { say('Open a building first.'); return; }
      var rows = rowsOf(id), lines = [], res, drv = null, ropts = { log: function (l) { lines.push(l); console.log(l); } };
      // P7: a pack's run is a generator, driven in slices of 25 ms with a turn for the page between them (the §LOD400-STALL chunk-yield pattern); the same code the node witnesses drain in one go
      if (typeof pack.runSteps === 'function') {
        drv = await Rg.kit.drive(pack.runSteps(inp, rows, ropts), { budgetMs: 25, onProgress: function (pr, st) { say(pr && pr.label ? pr.label + ' ' + pr.done + ' of ' + pr.total : pack.label + ': working...'); } });
        res = drv.value; log('§LODUP_YIELD pack=' + id + ' slices=' + drv.stats.slices + ' maxSliceMs=' + Math.round(drv.stats.maxSliceMs) + ' budgetMs=25 computeMs=' + Math.round(drv.stats.totalMs) + ' (the longest stretch of this run on the page thread)');
      } else res = pack.run(inp, rows, ropts);
      state.metaLast = inp.meta;
      if (!res.parts.length) { log('§LODUP_RUN pack=' + id + ' VACUOUS nothing to add (applies_to=' + pack.appliesTo(inp) + ') -> INCONCLUSIVE'); say(res.stats.say || (pack.label + ': nothing to add (' + res.stats.refused + ' refused, ' + res.stats.notBuilt + ' not built).')); state.last[id] = res.stats; paint(); return; }
      var warn = res.stats.addedVerts > 1e6;   // PERF BUDGET: a phone-class tab holds about 4 M vertices whole
      if (warn && typeof window.confirm === 'function' && !window.confirm('This adds ' + res.stats.addedVerts.toLocaleString() + ' vertices (over 1 M). A phone-class device may not hold it. Continue?')) { say('Cancelled.'); return; }
      var built = window.LodOps.build(res.parts, id, inp.meta), db = await O._ensureDb();
      var lr = db.exec('SELECT output_guid FROM kernel_ops WHERE undone=0 AND output_guid IS NOT NULL'), live = {}; if (lr.length) lr[0].values.forEach(function (v) { live[v[0]] = 1; });
      var again = built.ops.filter(function (o) { return live[o.outputGuid]; }).length;
      if (again) { log('§LODUP_RUN pack=' + id + ' REFUSED already in the model: ' + again + ' of ' + built.ops.length); say(pack.label + ' refused: ' + again + ' parts are already in the model (Undo the earlier run first).'); return; }
      Lb.registerRealGeometry(built.assets); O.storeRealGeometry(built.assets);
      var mr = db.exec('SELECT COALESCE(MAX(id),0) FROM kernel_ops'), nextId = (mr.length ? Number(mr[0].values[0][0]) : 0) + 1;
      var cr = await O.commitGesture(built.ops);
      var okIds = cr.ids.length === built.ops.length && cr.ids.every(function (x, i) { return x === nextId + i; });
      var fid = {}, gbf = {}; built.ops.forEach(function (o, i) { fid[o.outputGuid] = cr.ids[i]; gbf[cr.ids[i]] = o.outputGuid; });
      window.__arcFidByGuid = Object.assign({}, window.__arcFidByGuid || {}, fid); window.__arcGuidByFid = Object.assign({}, window.__arcGuidByFid || {}, gbf);
      state.runs = state.runs.filter(function (r) { return r.pack !== id; }); state.runs.push({ pack: id, gid: cr.gid, changes: res.changes, rules: window.LodRules.counts(rows) });
      syncTables(); applyHostHide(); if (O._save) O._save();
      state.last[id] = Object.assign({}, res.stats, { ms: Math.round(performance.now() - t0), gid: cr.gid });
      var heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
      log('§LODUP_RUN pack=' + id + ' ops=' + built.ops.length + ' ids_contiguous=' + okIds + ' gid=' + cr.gid + ' verify=' + cr.verify + ' tip=' + String(cr.tip || '').slice(0, 12) + ' added=' + res.stats.added + ' refused=' + res.stats.refused + ' notBuilt=' + res.stats.notBuilt + ' element_parts=' + built.elementParts.length + ' ms=' + state.last[id].ms);
      log('§LODUP_COST pack=' + id + ' addedVerts=' + res.stats.addedVerts + ' heapMB=' + heap + ' warnOver1M=' + warn + ' ms=' + state.last[id].ms + (drv ? ' maxSliceMs=' + Math.round(drv.stats.maxSliceMs) : ''));
      say(pack.label + ': added ' + res.stats.added + ' (' + res.stats.refused + ' refused, ' + res.stats.notBuilt + ' not built). Ctrl+Z removes it all.');
      paint();
    } catch (e) { console.error(TAG + ' §LODUP_RUN failed ' + (e && e.stack || e)); say('Upgrade failed: ' + (e && e.message)); }
    finally { state.busy = false; }
  }

  function download(name, text) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function changeListText() {
    if (!state.runs.length) return null; syncTables();
    var O = window.Bonsai.oplog, rows = O.db.exec('SELECT seq, change, guid, ifc_class, host_guid, rule, detail FROM upgrade_changes ORDER BY seq'), ch = rows.length ? rows[0].values.map(function (v) { return { kind: v[1], guid: v[2], cls: v[3], host: v[4], rule: v[5], detail: v[6] }; }) : [];
    var rc = window.LodRules.counts(rowsOf(state.runs[state.runs.length - 1].pack));
    return window.LodOps.changeText(ch, { model: modelName(), pack: state.runs.map(function (r) { return r.pack; }).join('+'), rules: rc });
  }

  // P6: a file the person loads for a pack (the pack declares it: {id, label, accept, validate(json) -> {ok, summary, why}}). Read as JSON, checked by the pack, kept in the panel state; a refused file says why and changes nothing.
  function readFile(f) { return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result)); }; fr.onerror = function () { rej(new Error('read failed')); }; fr.readAsText(f); }); }
  // P8: what a pack's input `read` hook may use: its data files (the formats validated), the schedule reader, and the DXF table reader of the 2D import (loaded on first use, with its own limits row from element_defaults.json)
  async function inputCtx(pid) {
    var data = state.data[pid] || {}, fv = data.formats ? window.LodSchedule.validateFormats(data.formats) : null;
    return { data: data, formats: fv && fv.ok ? fv.list : [], formatsWhy: fv && !fv.ok ? fv.why : null, LodSchedule: window.LodSchedule,
      dxfSheet: async function (text, name) {
        try {
          if (!window.DxfParser) await load(BASE + '../lib/dxf-parser.js'); if (!window.Dxf2Prep) await load(BASE + '../dxf2prep.js'); if (!window.Dxf2Beams) await load(BASE + '../dxf2beams.js'); if (!window.Dxf2Tables) await load(BASE + '../dxf2tables.js');
          window.Dxf2Tables.setRef(await (await fetch(BASE + '../element_defaults.json')).json());
          var P = window.DxfParser.DxfParser || window.DxfParser, dxf = new P().parseSync(text); return { ok: true, sheet: window.Dxf2Tables.read({ name: name, dxf: dxf }) };
        } catch (e) { return { ok: false, why: 'the drawing could not be read (' + (e && e.message) + ')' }; }
      } };
  }
  // P8: a pack's data file (the schedule formats) as editable JSON: Save validates it (a malformed file is refused with its reason and changes nothing), Download gives the edited file to contribute
  function openData(key) {
    var p = key.split('|'), pid = p[0], id = p[1], cur = (state.data[pid] || {})[id], old = document.getElementById('lu-data-ed'); if (old) old.remove();
    var D = document.createElement('div'); D.id = 'lu-data-ed'; D.style.cssText = 'position:fixed;left:8%;right:8%;top:8%;bottom:8%;z-index:60;background:rgba(20,22,30,0.97);border:1px solid #2c303a;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;color:#c7cdd8;font:12px system-ui,sans-serif';
    D.innerHTML = '<div><b>' + esc(id) + '</b> (' + esc(pid) + ') <span class="lu-data-msg"></span></div><textarea spellcheck="false" style="flex:1;width:100%;background:#0b0f17;color:#e5e7eb;border:1px solid #334155;font:12px monospace"></textarea><div><button class="lu-data-save">Save</button> <button class="lu-data-dl">Download edits</button> <button class="lu-data-close">Close</button></div>';
    document.body.appendChild(D); var ta = D.querySelector('textarea'), msg = D.querySelector('.lu-data-msg'); ta.value = JSON.stringify(cur, null, 1);
    D.querySelector('.lu-data-close').onclick = function () { D.remove(); };
    D.querySelector('.lu-data-dl').onclick = function () { download(pid + '_' + id + '.json', ta.value); log('§LODUP_DATA downloaded ' + pid + '.' + id); };
    D.querySelector('.lu-data-save').onclick = function () { var j; try { j = JSON.parse(ta.value); } catch (e) { msg.textContent = 'refused: not valid JSON (' + e.message + ')'; log('§LODUP_DATA REFUSED ' + pid + '.' + id + ': not valid JSON'); return; }
      var v = id === 'formats' ? window.LodSchedule.validateFormats(j) : { ok: true, summary: 'saved' }; if (!v.ok) { msg.textContent = 'refused: ' + v.why; log('§LODUP_DATA REFUSED ' + pid + '.' + id + ': ' + v.why); return; }
      (state.data[pid] = state.data[pid] || {})[id] = j; msg.textContent = 'saved: ' + v.summary; log('§LODUP_DATA saved ' + pid + '.' + id + ' (' + v.summary + ')'); paint(); };
  }
  function loadInput(key, accept) {
    var p = key.split('|'), pid = p[0], iid = p[1], pack = window.LodRegistry.get(pid), spec = pack && (pack.inputs || []).filter(function (i) { return i.id === iid; })[0]; if (!spec) return;
    var f = document.createElement('input'); f.type = 'file'; f.accept = accept || ''; f.style.display = 'none'; document.body.appendChild(f);
    f.onchange = async function () {
      var file = f.files && f.files[0]; f.remove(); if (!file) return;
      if (spec.read) {   // P8: the pack reads the file itself (a marks JSON or a drawing's schedule sheet); refused files say why and change nothing
        var rr = await spec.read(await readFile(file), file.name, await inputCtx(pid)); (rr.lines || []).forEach(function (l) { log(l); });
        if (!rr.ok) { log('§LODUP_INPUT ' + pid + '.' + iid + ' REFUSED ' + file.name + ': ' + rr.why); if (typeof window.setStat === 'function') window.setStat(pack.label + ': ' + file.name + ' refused: ' + rr.why); return; }
        (state.inputs[pid] = state.inputs[pid] || {})[iid] = { json: rr.json, name: file.name, summary: rr.summary }; log('§LODUP_INPUT ' + pid + '.' + iid + ' loaded ' + file.name + ' (' + rr.summary + ')'); paint(); return;
      }
      try { var json = JSON.parse(await readFile(file)), v = spec.validate ? spec.validate(json) : { ok: true, summary: 'loaded' };
        if (!v.ok) { log('§LODUP_INPUT ' + pid + '.' + iid + ' REFUSED ' + file.name + ': ' + v.why); if (typeof window.setStat === 'function') window.setStat(pack.label + ': ' + file.name + ' refused: ' + v.why); return; }
        (state.inputs[pid] = state.inputs[pid] || {})[iid] = { json: json, name: file.name, summary: v.summary }; log('§LODUP_INPUT ' + pid + '.' + iid + ' loaded ' + file.name + ' (' + v.summary + ')');
      } catch (e) { log('§LODUP_INPUT ' + pid + '.' + iid + ' REFUSED ' + file.name + ': not valid JSON (' + (e && e.message) + ')'); if (typeof window.setStat === 'function') window.setStat(pack.label + ': ' + file.name + ' is not valid JSON.'); return; }
      paint();
    };
    f.click();
  }
  // ---- P7: the Add-on IFC. Writes ONLY the live generated parts of every pack (undone = 0), with the frame rules of the Python oracle (lod_ifc.js). The frame JSON is a file the person loads (site offsets are private:
  // it is read in the browser, never uploaded and never part of the repo); without one the DB frame is written as is and the file's description says so.
  function liveGenCount() { var O = window.Bonsai && window.Bonsai.oplog, db = O && O.db; if (!db) return 0; try { var r = db.exec("SELECT COUNT(*) FROM kernel_ops WHERE undone=0 AND op_type='GEOM_INSERT' AND output_guid LIKE 'GEN-%'"); return r.length ? Number(r[0].values[0][0]) : 0; } catch (e) { return 0; } }
  function refreshIfcButton() {
    var P = state.panel, b = P && P.querySelector('.lu-ifc'); if (!b) return; var n = liveGenCount(); b.disabled = !n || state.busy;
    b.title = n ? 'Exports out what was added from this upgrade (' + n + ' parts)' : 'Exports out what was added from this upgrade: run an upgrade first';   // owner 2026-11-18: the button is "Export (IFC)", this tip
  }
  function loadFrame() {
    var f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json'; f.style.display = 'none'; document.body.appendChild(f);
    f.onchange = async function () {
      var file = f.files && f.files[0]; f.remove(); if (!file) return;
      try { var json = JSON.parse(await readFile(file)), v = window.LodIfc.validateFrame(json);
        if (!v.ok) { log('§LODUP_IFC_FRAME REFUSED ' + file.name + ': ' + v.why); if (typeof window.setStat === 'function') window.setStat('Export (IFC): ' + file.name + ' refused: ' + v.why); return; }
        state.frame = { json: json, name: file.name, summary: v.summary }; log('§LODUP_IFC_FRAME loaded ' + file.name + ' (' + v.summary + ')');
      } catch (e) { log('§LODUP_IFC_FRAME REFUSED ' + file.name + ': not valid JSON (' + (e && e.message) + ')'); if (typeof window.setStat === 'function') window.setStat('Export (IFC): ' + file.name + ' is not valid JSON.'); return; }
      paint();
    };
    f.click();
  }
  async function exportIfc(o) {
    o = o || {}; var Ifc = window.LodIfc, say = function (t) { var el = state.panel && state.panel.querySelector('[data-st-ifc]'); if (el) el.textContent = t; if (typeof window.setStat === 'function') window.setStat(t); };
    if (state.busy) return { ok: false, why: 'busy' }; state.busy = true; refreshIfcButton();
    try {
      var t0 = performance.now(), inp = await input(); if (!inp) { say('Open a building first.'); return { ok: false, why: 'no model' }; }
      syncTables(); var O = window.Bonsai.oplog, gen = inp.generated(), ch = {}, r = O.db.exec("SELECT guid, host_guid, rule, detail FROM upgrade_changes WHERE change='ADDED' ORDER BY seq");
      if (r.length) r[0].values.forEach(function (v) { if (!ch[v[0]]) ch[v[0]] = { host: v[1], rule: v[2], detail: v[3] }; });
      var els = gen.map(function (p) { var c = ch[p.guid] || {}; return { guid: p.guid, cls: p.cls, name: p.name, storey: p.storey, host: c.host || (p.parents && p.parents[0]) || null, rule: c.rule || null, detail: c.detail === undefined ? null : c.detail, tris: p.tris }; });
      var bdb = await window.OpenBuildingDb.get(), elev = {}; try { if (bdb && window.LodReader.has(bdb, 'storey_elevation')) { var re = bdb.exec('SELECT name, elevation_attr_m FROM storey_elevation'); if (re.length) re[0].values.forEach(function (v) { if (v[1] !== null) elev[v[0]] = Number(v[1]); }); } } catch (e) { /* no storey table: only a frame JSON can name the elevations */ }
      var schema = o.schema || state.schema, frame = o.frame !== undefined ? o.frame : (state.frame ? state.frame.json : null), model = modelName();
      var gradeOf = function (h) { var sc = (inp.sched || {})[h]; return sc && sc.Note_fy_MPa !== undefined && sc.Note_fy_MPa !== null ? { fy: sc.Note_fy_MPa, src: sc.NoteSource_fy_MPa === undefined || sc.NoteSource_fy_MPa === null ? 'None' : sc.NoteSource_fy_MPa } : null; };
      var drv = await window.LodRegistry.kit.drive(Ifc.buildSteps(els, { schema: schema, frame: frame, elev: elev, gradeOf: gradeOf, fileName: model + '_upgrade_' + schema + '.ifc', breakGuid: !!o.breakGuid, kit: window.LodRegistry.kit }), { budgetMs: 25, onProgress: function (pr) { say(pr && pr.label ? pr.label + ' ' + pr.done + ' of ' + pr.total : 'Export (IFC): working...'); } });
      var res = drv.value, st = res.stats;
      if (!res.ok) { log('§LODUP_IFC_REFUSED ' + res.why); say(res.why); return { ok: false, why: res.why, stats: st }; }
      log('§LODUP_IFC_SELECT schema=' + schema + ' elements=' + st.elements + ' classes=' + JSON.stringify(st.classes) + ' frame=' + st.frame + (Object.keys(st.skipped).length ? ' skipped_unsupported=' + JSON.stringify(st.skipped) : ''));
      log('§LODUP_IFC_TRACE elements=' + st.elements + ' with_ADDED_row=' + (st.elements - st.untraced) + ' untraced=' + st.untraced + ' -> ' + (st.untraced ? 'FAIL (parts with no change row are written without Detail; run the upgrade in this session to trace them)' : 'PASS'));
      log('§LODUP_IFC_MESH components_closed=' + st.mesh.closed + ' open=' + st.mesh.open + ' of_which_every_edge_has_2_triangles_but_winding_inconsistent=' + st.mesh.openTwoSided + ' wound_inward_flipped=' + st.mesh.flipped + ' degenerate_triangles=' + st.mesh.degenerate + ' -> ' + (!st.mesh.closed ? 'INCONCLUSIVE' : (st.mesh.open || st.mesh.degenerate ? 'FAIL' : 'PASS')));
      var blob = new Blob(res.parts, { type: 'application/x-step' }), sha = null;
      try { var dg = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()); sha = Array.prototype.map.call(new Uint8Array(dg), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); } catch (e) { sha = null; }
      var ms = Math.round(performance.now() - t0), heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
      log('§LODUP_IFC_WRITTEN bytes=' + blob.size + ' sha256=' + sha + ' schema=' + schema + ' entities=' + st.entities + ' storeys=' + st.storeys + ' parts=' + st.parts + ' split=' + JSON.stringify(st.split) + ' ms=' + ms + ' maxSliceMs=' + Math.round(drv.stats.maxSliceMs) + ' slices=' + drv.stats.slices + ' heapMB=' + heap);
      if (o.download !== false) download2(model + '_upgrade_' + schema + '.ifc', blob);
      say('Export (IFC, ' + schema + '): ' + st.parts + ' parts, ' + (blob.size / 1048576).toFixed(1) + ' MB, ' + (frame ? 'your frame' : 'DB frame as is') + '.');
      state.ifcLast = { bytes: blob.size, sha: sha, stats: st, schema: schema };
      return { ok: true, bytes: blob.size, sha: sha, stats: st, schema: schema, blob: o.keepBlob ? blob : null, ms: ms, maxSliceMs: drv.stats.maxSliceMs };
    } catch (e) { console.error(TAG + ' §LODUP_IFC failed ' + (e && e.stack || e)); say('Export (IFC) failed: ' + (e && e.message)); return { ok: false, why: String(e && e.message) }; }
    finally { state.busy = false; refreshIfcButton(); }
  }
  function download2(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 60000); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  async function paint() {
    var P = state.panel; if (!P) return; var Rg = window.LodRegistry, inp = null; try { inp = await input(); } catch (e) { inp = null; }
    var body = P.querySelector('.lu-body');
    if (!inp) { body.innerHTML = '<div class="lu-note">Open a building first. Upgrades read the open model.</div>'; return; }
    var d = Rg.describe(inp, rowsOf, window.LodRules), h = '';
    d.forEach(function (e) {
      var l = state.last[e.id];
      h += '<div class="lu-row" data-id="' + esc(e.id) + '"><div class="lu-h"><b>' + esc(e.label) + '</b><button class="lu-run" data-run="' + esc(e.id) + '">Run</button></div>' +
        '<div class="lu-s">' + (e.appliesTo ? 'applies to <span data-k="applies">' + e.appliesTo + '</span> ' + esc(e.unit || 'elements') : '<span data-k="applies">0</span> not applicable here') + '</div>' +
        '<div class="lu-s">rule rows: <span data-k="stated">' + e.stated + '</span> stated / <span data-k="default">' + e.default + '</span> defaults' + (e.unset ? ' / <span data-k="unset">' + e.unset + '</span> unset' : '') + ' <a href="#" class="lu-rules" data-rules="' + esc(e.id) + '">Rules</a></div>' +
        (e.inputs || []).map(function (i) { var got = (state.inputs[e.id] || {})[i.id]; return '<div class="lu-s"><button class="lu-load" data-load="' + esc(e.id) + '|' + esc(i.id) + '" data-accept="' + esc(i.accept || '') + '">' + esc(i.label) + '</button> <span data-k="input-' + esc(i.id) + '">' + (got ? esc(got.name) + ': ' + esc(got.summary) : 'not loaded') + '</span></div>'; }).join('') +
        (e.dataFiles || []).map(function (d) { var j = (state.data[e.id] || {})[d.id], fv = j && window.LodSchedule ? window.LodSchedule.validateFormats(j) : null; return '<div class="lu-s"><span data-k="data-' + esc(d.id) + '">' + (fv && fv.ok ? esc(fv.summary) : (fv ? 'formats refused: ' + esc(fv.why) : 'no ' + esc(d.label.toLowerCase()))) + '</span> <a href="#" class="lu-data" data-data="' + esc(e.id) + '|' + esc(d.id) + '">' + esc(d.label) + '</a></div>'; }).join('') +
        '<div class="lu-s" data-st="' + esc(e.id) + '">' + (l ? 'last run: added ' + l.added + ' / refused ' + l.refused + ' / not built ' + l.notBuilt : 'last run: none') + '</div>';
      if (state.open[e.id]) {
        var rows = rowsOf(e.id); h += '<table class="lu-t">';
        Object.keys(rows).sort().forEach(function (k) { var r = rows[k]; h += '<tr><td>' + esc(k) + '</td><td><input data-rk="' + esc(e.id) + '|' + esc(k) + '|v" value="' + esc(r.value === null ? '' : r.value) + '"></td><td>' + esc(r.unit) + '</td><td><input data-rk="' + esc(e.id) + '|' + esc(k) + '|s" value="' + esc(r.source) + '"></td></tr>'; });
        h += '</table>';
      }
      h += '</div>';
    });
    h += '<div class="lu-s lu-ifcrow">Export (IFC) as <select class="lu-schema"><option value="IFC2X3"' + (state.schema === 'IFC2X3' ? ' selected' : '') + '>IFC2X3</option><option value="IFC4"' + (state.schema === 'IFC4' ? ' selected' : '') + '>IFC4</option></select> <button class="lu-frame">Load frame…</button> <span data-k="frame">' + (state.frame ? esc(state.frame.name) + ': ' + esc(state.frame.summary) : 'no frame: the DB frame is written as is') + '</span></div>';
    h += '<div class="lu-dl"><button class="lu-cl">Change list (.txt)</button><button class="lu-ifc" title="Exports out what was added from this upgrade">Export (IFC)</button></div><div class="lu-s" data-st-ifc></div>';
    body.innerHTML = h;
    body.querySelectorAll('.lu-run').forEach(function (b) { b.onclick = function () { runPack(b.getAttribute('data-run')); }; });
    body.querySelectorAll('.lu-load').forEach(function (b) { b.onclick = function () { loadInput(b.getAttribute('data-load'), b.getAttribute('data-accept')); }; });
    body.querySelectorAll('.lu-data').forEach(function (a) { a.onclick = function (ev) { ev.preventDefault(); openData(a.getAttribute('data-data')); }; });
    body.querySelectorAll('.lu-rules').forEach(function (a) { a.onclick = function (ev) { ev.preventDefault(); var id = a.getAttribute('data-rules'); state.open[id] = !state.open[id]; paint(); }; });
    body.querySelectorAll('input[data-rk]').forEach(function (i) { i.onchange = function () {
      var p = i.getAttribute('data-rk').split('|'), id = p[0], k = p[1], cur = rowsOf(id)[k], e = Object.assign({}, state.edits[id][k] || cur);
      if (p[2] === 'v') { var n = parseFloat(i.value); e.value = (typeof cur.value === 'number' && !isNaN(n)) ? n : (i.value === '' ? null : i.value); if (cur.source.indexOf('unset') === 0 && !/^stated/.test(e.source)) e.source = 'stated: entered in the Upgrade panel'; } else e.source = i.value;
      var m = window.LodRules.merge(rowsOf(id), (function () { var o = {}; o[k] = e; return o; })());
      if (m.refused.length) log('§LODUP_RULES edit refused ' + k + ': ' + m.refused[0].why); else { state.edits[id][k] = e; log('§LODUP_RULES edit ' + id + '.' + k + ' = ' + JSON.stringify(e.value) + ' (' + e.source + ')'); }
      paint(); }; });
    body.querySelector('.lu-schema').onchange = function () { state.schema = this.value; };
    body.querySelector('.lu-frame').onclick = loadFrame; body.querySelector('.lu-ifc').onclick = function () { exportIfc({}); }; refreshIfcButton();
    body.querySelector('.lu-cl').onclick = function () { var t = changeListText(); if (!t) { if (typeof window.setStat === 'function') window.setStat('Change list: run an upgrade first.'); return; } download(modelName() + '_upgrade_changes.txt', t); log('§LODUP_CHANGELIST downloaded lines=' + t.split('\n').length); };
  }
  function buildPanel() {
    var P = document.createElement('div'); P.id = 'm-lodup-panel';
    P.style.cssText = 'position:fixed;bottom:74px;right:70px;z-index:41;width:340px;max-height:70vh;overflow:auto;display:none;padding:10px;background:rgba(20,22,30,0.94);border:1px solid #2c303a;border-radius:12px;color:#c7cdd8;font:12px system-ui,sans-serif;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 8px 30px rgba(0,0,0,0.5)';
    var css = document.createElement('style'); css.textContent = '#m-lodup-panel .lu-row{border-top:1px solid #2c303a;padding:8px 2px}#m-lodup-panel .lu-h{display:flex;justify-content:space-between;align-items:center}#m-lodup-panel .lu-s{color:#8a93a3;margin-top:3px}#m-lodup-panel button{background:#2a3140;color:#dfe5f0;border:1px solid #3a4254;border-radius:7px;padding:4px 10px;cursor:pointer}#m-lodup-panel button:disabled{opacity:.4;cursor:default}#m-lodup-panel a{color:#7fb2ff}#m-lodup-panel .lu-t{width:100%;margin-top:6px;font-size:10px}#m-lodup-panel .lu-t input{width:100%;background:#12151c;color:#c7cdd8;border:1px solid #2c303a;border-radius:4px}#m-lodup-panel .lu-dl{display:flex;gap:8px;border-top:1px solid #2c303a;padding-top:8px}#m-lodup-panel .lu-note{color:#8a93a3;padding:6px 2px}';
    document.head.appendChild(css);
    P.innerHTML = '<div style="font-size:10px;letter-spacing:.14em;color:#5b6473;margin:2px 4px 8px">UPGRADE</div><div class="lu-body"></div><div style="color:#5b6473;font-size:10px;margin-top:8px">Generated steel parts: configuration only, capacity not checked.</div>';
    document.body.appendChild(P); return P;
  }
  async function toggle() {
    var b = document.getElementById('b-lodup'); await boot();
    if (!state.panel) { state.panel = buildPanel(); document.addEventListener('mousedown', function (e) { var P = state.panel; if (P && P.style.display === 'block' && !P.contains(e.target) && !(b && b.contains(e.target))) { P.style.display = 'none'; if (b) b.classList.remove('on'); } }); }
    var open = state.panel.style.display !== 'block'; state.panel.style.display = open ? 'block' : 'none'; if (b) b.classList.toggle('on', open);
    if (open) await paint();
    log('§LODUP_PANEL open=' + open + ' rows=' + state.panel.querySelectorAll('.lu-row').length + ' packs=' + window.LodRegistry.list().length);
  }
  window.LodUI = { setInputText: async function (pid, iid, text, name) { var spec = window.LodRegistry.get(pid).inputs.filter(function (i) { return i.id === iid; })[0], rr = await spec.read(text, name, await inputCtx(pid)); if (rr.ok) (state.inputs[pid] = state.inputs[pid] || {})[iid] = { json: rr.json, name: name, summary: rr.summary }; return rr; }, openData: openData, setData: function (pid, id, j) { (state.data[pid] = state.data[pid] || {})[id] = j; }, setInput: function (pid, iid, json, name) { var spec = window.LodRegistry.get(pid).inputs.filter(function (i) { return i.id === iid; })[0], v = spec.validate(json); if (!v.ok) return v; var pk = window.LodRegistry.get(pid), df = (state.data[pid] || {}).formats; if (pk.attachFormat && df) { var fv = window.LodSchedule.validateFormats(df), at = pk.attachFormat(json, fv.ok ? fv.list : []); if (!at.ok) return at; json = at.json; } (state.inputs[pid] = state.inputs[pid] || {})[iid] = { json: json, name: name || 'file', summary: v.summary }; return v; }, applyHostHide: applyHostHide, exportIfc: exportIfc, setFrame: function (json, name) { var v = window.LodIfc.validateFrame(json); if (!v.ok) return v; state.frame = { json: json, name: name || 'frame', summary: v.summary }; return v; }, toggle: toggle, boot: boot, runPack: runPack, paint: paint, state: state, rowsOf: rowsOf, setRow: function (id, k, row) { var m = window.LodRules.merge(rowsOf(id), (function () { var o = {}; o[k] = row; return o; })()); if (!m.refused.length) state.edits[id][k] = row; return m; }, changeListText: changeListText, syncTables: syncTables };
})();
