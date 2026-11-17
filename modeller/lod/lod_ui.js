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
  var state = { ready: false, panel: null, rules: {}, edits: {}, last: {}, open: {}, runs: [], busy: false };

  function log(m) { console.log(TAG + ' ' + m); }
  function load(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('load failed ' + src)); }; document.head.appendChild(s); }); }
  async function boot() {
    if (state.ready) return;
    var man = await (await fetch(BASE + 'packs.json')).json();
    for (var i = 0; i < man.packs.length; i++) await load(BASE + man.packs[i].file + '?v=1');
    var Rg = window.LodRegistry, R = window.LodRules;
    for (var j = 0; j < Rg.list().length; j++) { var p = Rg.list()[j]; state.rules[p.id] = R.load(await (await fetch(BASE + p.rulesFile)).json()); state.edits[p.id] = {}; }
    state.ready = true; log('ready packs=' + Rg.list().map(function (p) { return p.id; }).join(','));
    window.addEventListener('bonsai:oplog', function () { try { syncTables(); } catch (e) { console.warn(TAG + ' sync failed ' + (e && e.message)); } });
  }
  function rowsOf(id) { return window.LodRules.merge(state.rules[id], state.edits[id]).rows; }
  async function input() {
    var db = await window.OpenBuildingDb.get(); if (!db) return null;
    var inp = window.LodReader.fromDb(db); inp.callouts = []; return inp;
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

  async function runPack(id) {
    var Rg = window.LodRegistry, pack = Rg.get(id), O = window.Bonsai.oplog, Lb = window.Bonsai.library, st = state.panel.querySelector('[data-st="' + id + '"]');
    var say = function (t) { if (st) st.textContent = t; if (typeof window.setStat === 'function') window.setStat(t); };
    if (state.busy) return; state.busy = true;
    try {
      var t0 = performance.now(), inp = await input(); if (!inp) { say('Open a building first.'); return; }
      var rows = rowsOf(id), lines = [], res = pack.run(inp, rows, { log: function (l) { lines.push(l); console.log(l); } });
      state.metaLast = inp.meta;
      if (!res.parts.length) { log('§LODUP_RUN pack=' + id + ' VACUOUS nothing to add (applies_to=' + pack.appliesTo(inp) + ') -> INCONCLUSIVE'); say(pack.label + ': nothing to add (' + res.stats.refused + ' refused, ' + res.stats.notBuilt + ' not built).'); state.last[id] = res.stats; paint(); return; }
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
      syncTables(); if (O._save) O._save();
      state.last[id] = Object.assign({}, res.stats, { ms: Math.round(performance.now() - t0), gid: cr.gid });
      var heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
      log('§LODUP_RUN pack=' + id + ' ops=' + built.ops.length + ' ids_contiguous=' + okIds + ' gid=' + cr.gid + ' verify=' + cr.verify + ' tip=' + String(cr.tip || '').slice(0, 12) + ' added=' + res.stats.added + ' refused=' + res.stats.refused + ' notBuilt=' + res.stats.notBuilt + ' element_parts=' + built.elementParts.length + ' ms=' + state.last[id].ms);
      log('§LODUP_COST pack=' + id + ' addedVerts=' + res.stats.addedVerts + ' heapMB=' + heap + ' warnOver1M=' + warn);
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
    return window.LodOps.changeText(ch, { model: window.__dwName || 'model', pack: state.runs.map(function (r) { return r.pack; }).join('+'), rules: rc });
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  async function paint() {
    var P = state.panel; if (!P) return; var Rg = window.LodRegistry, inp = null; try { inp = await input(); } catch (e) { inp = null; }
    var body = P.querySelector('.lu-body');
    if (!inp) { body.innerHTML = '<div class="lu-note">Open a building first. Upgrades read the open model.</div>'; return; }
    var d = Rg.describe(inp, rowsOf, window.LodRules), h = '';
    d.forEach(function (e) {
      var l = state.last[e.id];
      h += '<div class="lu-row" data-id="' + esc(e.id) + '"><div class="lu-h"><b>' + esc(e.label) + '</b><button class="lu-run" data-run="' + esc(e.id) + '">Run</button></div>' +
        '<div class="lu-s">applies to <span data-k="applies">' + e.appliesTo + '</span> elements</div>' +
        '<div class="lu-s">rule rows: <span data-k="stated">' + e.stated + '</span> stated / <span data-k="default">' + e.default + '</span> defaults' + (e.unset ? ' / <span data-k="unset">' + e.unset + '</span> unset' : '') + ' <a href="#" class="lu-rules" data-rules="' + esc(e.id) + '">Rules</a></div>' +
        '<div class="lu-s" data-st="' + esc(e.id) + '">' + (l ? 'last run: added ' + l.added + ' / refused ' + l.refused + ' / not built ' + l.notBuilt : 'last run: none') + '</div>';
      if (state.open[e.id]) {
        var rows = rowsOf(e.id); h += '<table class="lu-t">';
        Object.keys(rows).sort().forEach(function (k) { var r = rows[k]; h += '<tr><td>' + esc(k) + '</td><td><input data-rk="' + esc(e.id) + '|' + esc(k) + '|v" value="' + esc(r.value === null ? '' : r.value) + '"></td><td>' + esc(r.unit) + '</td><td><input data-rk="' + esc(e.id) + '|' + esc(k) + '|s" value="' + esc(r.source) + '"></td></tr>'; });
        h += '</table>';
      }
      h += '</div>';
    });
    h += '<div class="lu-dl"><button class="lu-cl">Change list (.txt)</button><button class="lu-ifc" disabled title="Add-on IFC arrives in P7">Add-on IFC</button></div>';
    body.innerHTML = h;
    body.querySelectorAll('.lu-run').forEach(function (b) { b.onclick = function () { runPack(b.getAttribute('data-run')); }; });
    body.querySelectorAll('.lu-rules').forEach(function (a) { a.onclick = function (ev) { ev.preventDefault(); var id = a.getAttribute('data-rules'); state.open[id] = !state.open[id]; paint(); }; });
    body.querySelectorAll('input[data-rk]').forEach(function (i) { i.onchange = function () {
      var p = i.getAttribute('data-rk').split('|'), id = p[0], k = p[1], cur = rowsOf(id)[k], e = Object.assign({}, state.edits[id][k] || cur);
      if (p[2] === 'v') { var n = parseFloat(i.value); e.value = (typeof cur.value === 'number' && !isNaN(n)) ? n : (i.value === '' ? null : i.value); if (cur.source.indexOf('unset') === 0 && !/^stated/.test(e.source)) e.source = 'stated: entered in the Upgrade panel'; } else e.source = i.value;
      var m = window.LodRules.merge(rowsOf(id), (function () { var o = {}; o[k] = e; return o; })());
      if (m.refused.length) log('§LODUP_RULES edit refused ' + k + ': ' + m.refused[0].why); else { state.edits[id][k] = e; log('§LODUP_RULES edit ' + id + '.' + k + ' = ' + JSON.stringify(e.value) + ' (' + e.source + ')'); }
      paint(); }; });
    body.querySelector('.lu-cl').onclick = function () { var t = changeListText(); if (!t) { if (typeof window.setStat === 'function') window.setStat('Change list: run an upgrade first.'); return; } download((window.__dwName || 'model') + '_upgrade_changes.txt', t); log('§LODUP_CHANGELIST downloaded lines=' + t.split('\n').length); };
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
  window.LodUI = { toggle: toggle, boot: boot, runPack: runPack, paint: paint, state: state, rowsOf: rowsOf, setRow: function (id, k, row) { var m = window.LodRules.merge(rowsOf(id), (function () { var o = {}; o[k] = row; return o; })()); if (!m.refused.length) state.edits[id][k] = row; return m; }, changeListText: changeListText, syncTables: syncTables };
})();
