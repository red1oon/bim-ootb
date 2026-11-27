// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// history.js - the page history.html: any .xlsx gets a memory. Open, Stamp, a cell's story, rewind to any step, merge two copies, download.
// Implementing bim-compiler prompts/SHEET_FRONT_DOOR.md §14 - Witness: W-HISTORY-PAGE (erp/tests/witness_history_page.js).
// The page owns the SCREEN only. Entries are made, verified, replayed, storied and merged by ../sheet_history.js; they are stored by host_shim.js (the Excel menu's own
// row-of-chunks writer); the workbook file is read and written by xlsx_host.js. Stamp is the shim's stamp(), the story is the shim's cellHistory().
// No kernel, no seed: verification here is the engine's own verify (WebCrypto). Nothing is uploaded: File API in, a download out.
(function () {
  'use strict';
  var W = window, XLSX = W.XLSX, SH = W.SheetHistory, SA = W.SheetAddin, XH = W.SheetAddinXlsx;
  var MAXR = 200, MAXC = 40, NAME_KEY = 'sheet_history_name';
  var st = { wb: null, name: null, lines: [], entries: [], check: null, state: '', snap: {}, pending: [], sheet: null, step: null, sel: null, story: null, other: null, busy: false, nameFrom: '', stamp: null, merged: null, downloads: 0, renders: 0, cost: null };
  function $(id) { return document.getElementById(id); }
  function log(s) { console.log(s); }
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }
  function heapMB() { return performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1; }
  function num(v) { return typeof v === 'number' ? String(Number(v.toPrecision(15))) : String(v); }
  function say(c) { return c == null ? '(empty)' : c.f != null ? '=' + c.f + (c.v != null ? ' (' + num(c.v) + ')' : '') : num(c.v); }
  function when(at) { return String(at).slice(0, 16).replace('T', ' ') + ' UTC'; }
  function who() { return $('who').value.trim(); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function key(o) { return o.sheet + '!' + o.cell; }
  function colOf(a) { var m = /^([A-Z]+)(\d+)$/.exec(a), c = 0; for (var i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64); return [Number(m[2]), c]; }
  function colName(c) { var s = ''; while (c > 0) { s = String.fromCharCode(65 + (c - 1) % 26) + s; c = Math.floor((c - 1) / 26); } return s; }
  function remembered() { try { return W.localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } }
  function remember(n) { try { W.localStorage.setItem(NAME_KEY, n); } catch (e) { /* a private window: the name is simply not remembered */ } }

  // the workbook through the lane's own layers: the file host and the shim (one history writer, one reader)
  function api(wb) {
    var host = XH.create(XLSX, wb || st.wb, { engineValue: function (v) { return v; }, userName: who() });
    return { host: host, shim: SA.create(host, { SheetHistory: SH }) };
  }
  async function snapshot(host) { var names = await host.visibleSheets(), out = {}; for (var i = 0; i < names.length; i++) out[names[i]] = await host.readSheetValues(names[i]); return out; }
  function read(bytes) { return XLSX.read(bytes, Object.assign({ type: 'array' }, XH.READ)); }
  function bytesOf(wb) { return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true })); }
  function count(snap) { return Object.keys(snap).reduce(function (n, s) { return n + Object.keys(snap[s]).length; }, 0); }

  // the history carried in a workbook: verified, then BOUND to the cells now in the file (replay to the last entry, diff with the sheet)
  async function bind(wb) {
    var a = api(wb), lines = await a.shim.history.lines(), snap = await snapshot(a.host), out = { lines: lines, snap: snap, entries: [], check: null, pending: [], state: 'none' };
    if (!lines.length) return out;
    out.check = await SH.verify(lines);
    if (!out.check.ok) { out.state = 'broken'; return out; }
    out.entries = lines.map(function (l) { return JSON.parse(l); });
    out.pending = SH.diff(SH.asOf(out.entries, out.entries.length), snap); /*MUT-BIND*/
    out.state = out.pending.length ? 'pending' : 'intact';
    return out;
  }
  async function refresh() {
    var b = await bind(st.wb);
    st.lines = b.lines; st.snap = b.snap; st.entries = b.entries; st.check = b.check; st.pending = b.pending; st.state = b.state;
    if (st.step != null && st.step > st.entries.length) st.step = null;
    log('§SHIST-PAGE-BIND state=' + st.state + ' entries=' + st.lines.length + ' cells=' + count(st.snap) + ' pending=' + st.pending.length + (st.pending.length ? ' cells=' + JSON.stringify(st.pending.map(key)) : '') +
      (st.state === 'broken' ? ' brokenAt=' + st.check.brokenAt + ' why="' + st.check.why + '"' : ''));
  }

  // ── what is on screen ──
  function view() {                                                              // the cells shown and the cells marked: now (marks = not stamped yet) or at a step (marks = what that step changed)
    if (st.step == null) return { snap: st.snap, marks: st.pending };
    return { snap: SH.asOf(st.entries, st.step /*MUT-STEP*/), marks: st.entries[st.step - 1].payload.ops };
  }
  function render() { paint(); st.renders++; }                                 // every action ends in ONE render: a witness waits on the count
  function paint() {
    var s = $('status'), open = !!st.wb, broken = st.state === 'broken', last = st.entries[st.entries.length - 1], p = $('pending');
    s.dataset.state = st.state; clear(p); p.hidden = true;
    if (!open) s.textContent = 'Open a workbook to see its history.';
    else if (st.state === 'none') s.textContent = 'This workbook has no history yet. Stamp starts one: it records every cell that holds something (' + plural(count(st.snap), 'cell', 'cells') + ' in ' + plural(Object.keys(st.snap).length, 'sheet', 'sheets') + ').';
    else if (broken) s.textContent = 'The history inside this file was edited by hand: entry ' + st.check.brokenAt + ' of ' + st.lines.length + ' does not verify (' + st.check.why + '). Nothing is shown and nothing can be stamped on top of it. Go back to a copy you trust.';
    else if (st.state === 'intact') s.textContent = 'History: ' + plural(st.entries.length, 'entry', 'entries') + ', verified. The sheet matches the last stamp (' + last.actor + ', ' + when(last.at) + '): nothing has changed since.';
    else {
      s.textContent = 'History: ' + plural(st.entries.length, 'entry', 'entries') + ', verified. ' + plural(st.pending.length, 'cell has', 'cells have') + ' changed since the last stamp (' + last.actor + ', ' + when(last.at) + '). The next Stamp records:';
      st.pending.forEach(function (o) { var li = el('li', key(o) + ': ' + say(o.before) + ' → ' + say(o.after) + (o.typedOverFormula ? ' (a number typed over a formula)' : '')); li.dataset.cell = key(o); if (o.typedOverFormula) li.dataset.typedOver = '1'; p.appendChild(li); });
      p.hidden = false;
    }
    $('b-stamp').disabled = !open || broken || st.busy;
    $('b-download').hidden = !open || broken || !st.lines.length;
    var sr = $('stamp-result'); sr.hidden = !st.stamp; if (st.stamp) { sr.dataset.verdict = st.stamp.verdict; sr.textContent = st.stamp.text; }
    $('sheet').hidden = $('story').hidden = !open || broken;
    $('merge').hidden = !open || broken || !st.entries.length;
    if (!open || broken) return;
    renderSteps(); renderGrid(); renderStory(); renderMerge();
  }
  function renderSteps() {
    var box = $('steps'); clear(box);
    st.entries.forEach(function (e, i) {
      var m = e.meta && e.meta.merge, b = el('button', '#' + e.seq + ' · ' + when(e.at) + ' · ' + e.actor + ' · ' + plural(e.payload.ops.length, 'cell', 'cells') + (e.meta && e.meta.genesis ? ' · first stamp' : '') + (m ? ' · merge of another copy (' + plural(m.otherEntries, 'entry', 'entries') + ')' : ''));
      b.type = 'button'; b.dataset.step = String(i + 1); b.setAttribute('aria-pressed', String(st.step === i + 1)); box.appendChild(b);
    });
    var now = el('button', 'Now'); now.type = 'button'; now.dataset.step = 'now'; now.setAttribute('aria-pressed', String(st.step == null)); box.appendChild(now);
    var e = st.step != null ? st.entries[st.step - 1] : null;
    $('view-note').textContent = !st.entries.length ? 'No steps yet. This is the sheet as it is in the file.' : e ? 'The sheet as it was after step ' + st.step + ' (' + e.actor + ', ' + when(e.at) + '). Marked: the ' + plural(e.payload.ops.length, 'cell', 'cells') + ' that step changed.' :
      'The sheet as it is in the file now.' + (st.pending.length ? ' Marked: changed since the last stamp.' : '');
    $('b-download-step').hidden = st.step == null;
  }
  function renderGrid() {
    var v = view(), names = Object.keys(v.snap), tabs = $('tabs'), tb = $('grid').tBodies[0];
    if (names.indexOf(st.sheet) < 0) st.sheet = names[0] || null;
    clear(tabs); clear(tb);
    names.forEach(function (n) { var marks = v.marks.filter(function (o) { return o.sheet === n; }).length, b = el('button', n + (marks ? ' (' + marks + ')' : '')); b.type = 'button'; b.dataset.sheet = n; b.setAttribute('aria-pressed', String(n === st.sheet)); tabs.appendChild(b); });
    var cells = (st.sheet && v.snap[st.sheet]) || {}, mark = {}, R = 0, C = 0;
    v.marks.forEach(function (o) { if (o.sheet === st.sheet) mark[o.cell] = 1; });
    Object.keys(cells).concat(Object.keys(mark)).forEach(function (a) { var x = colOf(a); R = Math.max(R, x[0]); C = Math.max(C, x[1]); });
    var rows = Math.min(R, MAXR), cols = Math.min(C, MAXC), head = el('tr'); head.appendChild(el('th', ''));
    for (var c = 1; c <= cols; c++) head.appendChild(el('th', colName(c)));
    tb.appendChild(head);
    for (var r = 1; r <= rows; r++) {
      var tr = el('tr'); tr.appendChild(el('th', String(r), 'r'));
      for (c = 1; c <= cols; c++) {
        var a = colName(c) + r, x = cells[a], td = el('td', x ? (x.v != null ? num(x.v) : '=' + x.f) : '');
        td.dataset.cell = a; td.tabIndex = 0;
        if (x) { td.dataset.v = JSON.stringify(x.v); if (x.f != null) { td.dataset.f = x.f; td.title = '=' + x.f; td.classList.add('f'); } if (typeof x.v === 'number') td.classList.add('n'); }
        if (mark[a]) td.classList.add('chg');
        if (st.sel && st.sel.sheet === st.sheet && st.sel.cell === a) td.classList.add('sel');
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
    var note = $('grid-note'); note.hidden = !(R > MAXR || C > MAXC || !R);
    note.textContent = !R ? 'This sheet holds no cells' + (st.step != null ? ' at this step.' : '.') : 'Showing the first ' + rows + ' rows and ' + cols + ' columns of ' + R + ' x ' + C + '. The history covers every cell.';
    if (st.step != null) log('§SHIST-PAGE-REWIND step=' + st.step + ' sheet=' + st.sheet + ' cells=' + Object.keys(cells).length + ' marked=' + Object.keys(mark).length);
  }
  function renderStory() {
    var head = $('story-head'), list = $('story-list'), r = st.story; clear(list);
    if (!st.sel || !r) { head.textContent = 'Click a cell in the sheet above.'; return; }
    head.textContent = r.story.length ? 'Every value ' + r.sheet + '!' + r.cell + ' has had, oldest first:' : (st.entries.length ? r.text + '.' : 'No history yet: stamp the workbook first.');
    r.story.forEach(function (s) {
      var li = el('li', '#' + s.seq + ' · ' + when(s.at) + ' · ' + s.actor + ': ' + say(s.before) + ' → ' + say(s.after) + (s.typedOverFormula ? ' (a number typed over a formula)' : '') + (s.mergedAt ? ' · made in the other copy, merged at #' + s.mergedAt : ''));
      li.dataset.seq = String(s.seq); li.dataset.actor = s.actor; li.dataset.at = s.at; li.dataset.before = JSON.stringify(s.before); li.dataset.after = JSON.stringify(s.after); if (s.typedOverFormula) li.dataset.typedOver = '1'; if (s.mergedAt) li.dataset.mergedAt = String(s.mergedAt);
      list.appendChild(li);
    });
    var p = st.pending.filter(function (o) { return o.sheet === r.sheet && o.cell === r.cell; })[0];
    if (p) { var li = el('li', 'Not stamped yet: ' + say(p.before) + ' → ' + say(p.after)); li.dataset.pending = '1'; list.appendChild(li); }
  }
  function lastSetter(entries, c) { var s = SH.cellStory(entries, c.sheet, c.cell); return s[s.length - 1] || { actor: 'unknown', at: '' }; }
  function renderMerge() {
    var o = st.other, ms = $('merge-status'), ap = $('merge-applied'), box = $('conflicts'), b = $('b-merge');
    clear(ap); clear(box); ap.hidden = true; b.hidden = true; ms.hidden = !o;
    if (!o) return;
    ms.dataset.verdict = o.verdict; ms.textContent = o.text;
    if (o.verdict !== 'READY' && o.verdict !== 'CONFLICTS') return;
    var theirs = o.m.applied.filter(function (x) { return x.from === 'b'; }), final = SH.asOf(o.entries, o.entries.length), mine = SH.asOf(st.entries, o.m.fork);
    theirs.forEach(function (x) {
      var w = lastSetter(o.entries.slice(o.m.fork), x), li = el('li', 'From the other copy: ' + key(x) + ': ' + say((mine[x.sheet] || {})[x.cell] || null) + ' → ' + say((final[x.sheet] || {})[x.cell] || null) + ' (' + w.actor + ', ' + when(w.at) + ')');
      li.dataset.cell = key(x); li.dataset.actor = w.actor; ap.appendChild(li);
    });
    ap.hidden = !theirs.length;
    o.m.conflicts.forEach(function (c) {
      var k = key(c), wa = lastSetter(st.entries.slice(o.m.fork), c), wb = lastSetter(o.entries.slice(o.m.fork), c), card = el('div', null, 'conflict'); card.dataset.cell = k;
      card.dataset.a = JSON.stringify(c.a); card.dataset.b = JSON.stringify(c.b); card.dataset.base = JSON.stringify(c.base); card.dataset.whoA = wa.actor; card.dataset.whoB = wb.actor;
      card.appendChild(el('p', k + ' was ' + say(c.base) + '. In this workbook ' + wa.actor + ' set it to ' + say(c.a) + ' (' + when(wa.at) + '). In the other copy ' + wb.actor + ' set it to ' + say(c.b) + ' (' + when(wb.at) + '). Which one stays?'));
      [['a', 'Keep ' + say(c.a) + ' (' + wa.actor + ')'], ['b', 'Take ' + say(c.b) + ' (' + wb.actor + ')'], ['base', 'Neither: back to ' + say(c.base)]].forEach(function (x) {
        var bt = el('button', x[1]); bt.type = 'button'; bt.dataset.conflict = k; bt.dataset.pick = x[0]; bt.setAttribute('aria-pressed', String(o.picks[k] === x[0])); card.appendChild(bt);
      });
      box.appendChild(card);
    });
    b.hidden = false; b.disabled = st.busy || o.m.conflicts.some(function (c) { return !o.picks[key(c)]; });
  }

  // ── actions ──
  async function open(bytes, name) {
    var t0 = performance.now();
    st.wb = read(bytes); st.name = name; st.step = null; st.sel = null; st.story = null; st.other = null; st.stamp = null; st.merged = null; st.sheet = null;
    await refresh();
    var last = st.entries[st.entries.length - 1], mine = remembered();
    if (mine) { $('who').value = mine; st.nameFrom = 'browser'; }
    else if (last && !who()) { $('who').value = last.actor; st.nameFrom = 'workbook'; }
    $('who-note').textContent = (st.nameFrom === 'workbook' ? 'Filled in from the last stamp in this workbook: change it if that is not you. ' : '') + 'Written into each stamp you make. It is a typed name, not a signature: anyone can type any name.';
    $('opened').textContent = 'Opened ' + name + ' (' + plural(Object.keys(st.snap).length, 'sheet', 'sheets') + ', ' + plural(count(st.snap), 'cell', 'cells') + ').';
    log('§SHIST-PAGE-OPEN name=' + name + ' bytes=' + bytes.length + ' sheets=' + Object.keys(st.snap).length + ' cells=' + count(st.snap) + ' state=' + st.state + ' ms=' + Math.round(performance.now() - t0) + ' heapMB=' + heapMB());
    render();
  }
  function needName() { if (who()) { remember(who()); return false; } st.stamp = { verdict: 'REFUSED', text: 'Type your name first: it is written into the entry.' }; render(); $('who').focus(); return true; }
  async function stamp() {
    if (!st.wb || st.busy || st.state === 'broken' || needName()) return;
    st.busy = true; var t0 = performance.now(), r;
    try { r = await api().shim.stamp(); } catch (e) { r = { verdict: 'ERROR', text: 'Could not stamp: ' + (e && e.message || e) }; }
    st.stamp = { verdict: r.verdict, text: r.verdict === 'RECORDED' ? 'Stamped. Entry ' + r.entry.seq + ' records ' + plural(r.cells, 'cell', 'cells') + ' as ' + r.entry.actor + '. Download the workbook to keep it.' : r.text + '.', entry: r.entry || null };
    var over = r.entry ? r.entry.payload.ops.filter(function (o) { return o.typedOverFormula; }).map(key) : [];
    log('§SHIST-PAGE-STAMP verdict=' + r.verdict + (r.entry ? ' entry=' + r.entry.seq + ' cells=' + r.cells + ' chunks=' + r.chunks + ' typedOverFormula=' + JSON.stringify(over) + ' lineChars=' + JSON.stringify(r.entry).length : '') + ' ms=' + Math.round(performance.now() - t0) + ' heapMB=' + heapMB());
    await refresh(); st.busy = false;
    if (st.sel) await story(st.sel); else render();
  }
  async function story(sel) {
    st.sel = sel; st.story = await api().shim.cellHistory(sel);
    log('§SHIST-PAGE-STORY sheet=' + sel.sheet + ' cell=' + sel.cell + ' verdict=' + st.story.verdict + ' lines=' + (st.story.story ? st.story.story.length : 0));
    if (!st.story.story) st.story.story = [];
    render();
  }
  function download(wb, name, kind) {
    var bytes = bytesOf(wb), blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    st.downloads++;
    log('§SHIST-PAGE-DOWNLOAD kind=' + kind + ' name=' + name + ' bytes=' + bytes.length);
  }
  function base() { return String(st.name).replace(/\.xlsx$/i, ''); }
  // "Download this version": a separate workbook holding the sheet as it was after step N and the history up to N only (it re-opens as intact at that step)
  async function downloadStep() {
    var n = st.step; if (n == null || st.busy) return;
    var wb2 = read(bytesOf(st.wb)), a = api(wb2), snap = SH.asOf(st.entries, n), names = await a.host.visibleSheets();
    Object.keys(snap).forEach(function (s) { if (names.indexOf(s) < 0) names.push(s); });
    for (var i = 0; i < names.length; i++) await a.host.writeSheetValues(names[i], snap[names[i]] || {});
    await a.shim.history.set(st.lines.slice(0, n /*MUT-KEEP*/));
    download(wb2, base() + '_as_of_step_' + n + '.xlsx', 'step-' + n);
  }

  // ── merge ──
  function refuse(text) { st.other = { verdict: 'REFUSED', text: text }; log('§SHIST-PAGE-MERGE verdict=REFUSED text="' + text.slice(0, 160) + '"'); render(); }
  function cellsList(ops) { return ops.slice(0, 8).map(key).join(', ') + (ops.length > 8 ? ' and ' + (ops.length - 8) + ' more' : ''); }
  async function openOther(bytes, name) {
    if (!st.wb || st.state === 'broken') return;
    st.merged = null;
    if (st.state === 'pending') return refuse('This workbook holds ' + plural(st.pending.length, 'change', 'changes') + ' not stamped yet (' + cellsList(st.pending) + '). Stamp first, then merge: a merge works on recorded history only.');
    var b; try { b = await bind(read(bytes)); } catch (e) { return refuse(name + ' is not a workbook this page can read: ' + (e && e.message || e)); }
    if (b.state === 'none') return refuse(name + ' has no history inside, so it cannot be merged.');
    if (b.state === 'broken') return refuse('The history inside ' + name + ' was edited by hand: entry ' + b.check.brokenAt + ' of ' + b.lines.length + ' does not verify (' + b.check.why + '). It is not merged.');
    var unstamped = b.pending; /*MUT-UNSTAMPED*/
    if (unstamped.length) return refuse(name + ' holds ' + plural(unstamped.length, 'change that was', 'changes that were') + ' never stamped (' + cellsList(unstamped) + '). Open it here, Stamp it, then merge.');
    var probe = await SH.mergeEntry(st.entries, b.entries, {}, 'probe', '1970-01-01T00:00:00.000Z'), m = probe.merge;
    if (!m.ok) return refuse(name + ' is not a copy of this workbook: ' + m.why + '.');
    if (probe.verdict === 'NO-OP') { st.other = { verdict: 'NO-OP', text: 'Nothing to merge: ' + probe.why + '.' }; log('§SHIST-PAGE-MERGE verdict=NO-OP why="' + probe.why + '"'); return render(); }
    var theirs = m.applied.filter(function (x) { return x.from === 'b'; }).length;
    st.other = { name: name, entries: b.entries, m: m, picks: {}, verdict: m.conflicts.length ? 'CONFLICTS' : 'READY',
      text: 'The two copies are the same up to step ' + m.fork + '. ' + plural(theirs, 'cell comes', 'cells come') + ' from the other copy' + (m.conflicts.length ? '. ' + plural(m.conflicts.length, 'cell was', 'cells were') + ' changed in BOTH copies to different values: choose for each. Nothing is written until you do.' : ', and no cell was changed differently in both. Finish the merge to record it.') };
    log('§SHIST-PAGE-MERGE verdict=' + st.other.verdict + ' other=' + name + ' fork=' + m.fork + ' mine=' + (st.entries.length - m.fork) + ' theirs=' + (b.entries.length - m.fork) + ' applied=' + JSON.stringify(m.applied.map(function (x) { return key(x) + ':' + x.from; })) + ' conflicts=' + JSON.stringify(m.conflicts.map(key)));
    render();
  }
  async function finishMerge() {
    var o = st.other; if (!o || !o.m || st.busy) return;
    if (!who()) { $('merge-status').textContent = 'Type your name first (section 1): it is written into the merge entry.'; $('who').focus(); return; }
    remember(who()); st.busy = true;
    var picks = o.picks; /*MUT-SILENT*/
    var r = await SH.mergeEntry(st.entries, o.entries, picks, who(), new Date().toISOString());
    if (r.verdict !== 'RECORDED') { st.busy = false; st.other = { verdict: r.verdict, text: 'Not merged: ' + r.why + '.' }; log('§SHIST-PAGE-MERGE verdict=' + r.verdict + ' why="' + r.why + '"'); return render(); }
    var a = api(), sheets = {}; r.entry.payload.ops.forEach(function (x) { sheets[x.sheet] = 1; });
    var names = Object.keys(sheets);
    for (var i = 0; i < names.length; i++) await a.host.writeSheetValues(names[i], r.snapshot[names[i]] || {});
    await a.shim.history.append(r.line);
    var m = r.entry.meta.merge;
    st.merged = { entry: r.entry, other: o.name };
    if (!/_merged\.xlsx$/i.test(st.name)) st.name = base() + '_merged.xlsx';
    st.other = { verdict: 'RECORDED', text: 'Merged. Entry ' + r.entry.seq + ' records ' + plural(r.entry.payload.ops.length, 'cell', 'cells') + ' changed in this workbook' + (m.picks.length ? ' and your ' + plural(m.picks.length, 'choice', 'choices') : '') + '. The other copy\'s ' + plural(m.otherEntries, 'entry is', 'entries are') + ' kept inside it. Download the workbook to keep it (' + st.name + ').' };
    log('§SHIST-PAGE-MERGE verdict=RECORDED entry=' + r.entry.seq + ' ops=' + r.entry.payload.ops.length + ' fork=' + m.fork + ' otherEntries=' + m.otherEntries + ' otherHead=' + m.other.slice(0, 12) + ' picks=' + JSON.stringify(m.picks.map(function (p) { return key(p) + ':' + p.pick; })) + ' lineChars=' + r.line.length);
    st.step = null; await refresh(); st.busy = false;
    if (st.sel) await story(st.sel); else render();
  }

  // ── wiring ──
  function pick(input, fn, where) {
    input.addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0]; if (!f) return;
      f.arrayBuffer().then(function (b) { return fn(new Uint8Array(b), f.name); }).catch(function (e) { where.hidden = false; where.textContent = f.name + ' is not a workbook this page can read: ' + (e && e.message || e); });
      ev.target.value = '';
    });
  }
  pick($('file'), open, $('opened')); pick($('file2'), openOther, $('merge-status'));
  $('b-stamp').addEventListener('click', stamp);
  $('b-download').addEventListener('click', function () { if (st.wb) download(st.wb, st.name, 'workbook'); });
  $('b-download-step').addEventListener('click', downloadStep);
  $('b-merge').addEventListener('click', finishMerge);
  $('steps').addEventListener('click', function (ev) { var b = ev.target.closest('button[data-step]'); if (!b) return; st.step = b.dataset.step === 'now' ? null : Number(b.dataset.step); render(); });
  $('tabs').addEventListener('click', function (ev) { var b = ev.target.closest('button[data-sheet]'); if (!b) return; st.sheet = b.dataset.sheet; render(); });
  function cellClick(ev) { var td = ev.target.closest('td[data-cell]'); if (!td || (ev.type === 'keydown' && ev.key !== 'Enter')) return; story({ sheet: st.sheet, cell: td.dataset.cell }); }
  $('grid').addEventListener('click', cellClick); $('grid').addEventListener('keydown', cellClick);
  $('conflicts').addEventListener('click', function (ev) { var b = ev.target.closest('button[data-pick]'); if (!b || !st.other || !st.other.picks) return; st.other.picks[b.dataset.conflict] = b.dataset.pick; renderMerge(); });
  $('who').value = remembered();

  // the page's own weight, once everything it needs is in (PERF BUDGET): no kernel, no seed
  W.addEventListener('load', function () {
    var res = performance.getEntriesByType('resource'), nav = performance.getEntriesByType('navigation')[0], bytes = (nav ? nav.encodedBodySize : 0) + res.reduce(function (n, r) { return n + (r.encodedBodySize || 0); }, 0);
    st.cost = { requests: res.length + 1, bytes: bytes, readyMs: Math.round(performance.now()), heapMB: heapMB(), kernel: !!(W.WsKernel || W.WsKernelWeb || W.initSqlJs) };
    log('§SHIST-PAGE-COST requests=' + st.cost.requests + ' bytes=' + bytes + ' readyMs=' + st.cost.readyMs + ' heapMB=' + st.cost.heapMB + ' kernelLoaded=' + st.cost.kernel + ' scripts=' + document.scripts.length);
  });

  // what a witness reads: the page's state (read-only use) and the open workbook's bytes as a download would write them
  W.HistoryPage = { state: st, bytes: function () { return st.wb ? bytesOf(st.wb) : null; } };
})();
