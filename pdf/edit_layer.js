// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// edit_layer.js - "Edit as a sheet" on the ORIGINAL page: pdf.js draws the page as it is; this layer sits on top and offers, where the writer can write back,
//   every text run (and every table cell whose runs are all writable) for editing in place. Everything else is LOCKED and a tap says why: text the writer
//   cannot write (pdf_write.js lockOf, the one owner), pictures, text it does not reach. Table cells behave like a sheet: the totals the report reader found
//   are marked on the page (adds up / does not, with the gap), a total shows its formula and lights its rows, a mouse drag over numbers gives sum and count.
//   A substituted font gets a red "font not same" box, on screen only (never written into the PDF).
// Implementing bim-compiler prompts/SHEET_FRONT_DOOR.md §18.5 (one page, the original kept) + §18.6 (closest font, red box, undo) - Witness: W-EDIT-SHEET
//   (pdf/tests/witness_edit_sheet.js). No PDF code here: the runs come from PdfWrite.listRuns, the cells from ReportReader.read, the edits go back to the page.
// targets(runs, R, imageBoxes, fileWhy, items) -> { list:[{ id, kind:'cell'|'run'|'image', cell, run, box, text, num, lock, why }], stats }
// mount(div, size, layer, hooks) -> draws the layer into the page's div (positions in % of the page, so it follows any width)
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.EditLayer = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TOL = 0.5, ASC = 0.8, DESC = 0.2;
  // a run's box, drawn in by up to 0.6 pt at each side: the writer takes a run whose CENTRE is within 0.5 pt of a box, so a zero-width mark touching the
  //   run (a Thai vowel sign beside " : ") would otherwise fall into the edit and get it refused
  function runBox(r) { var i = Math.min(0.6, (r.x1 - r.x0) / 4); return [r.x0 + i, r.y - ASC * r.h, r.x1 - i, r.y + DESC * r.h]; }
  // the box handed to the writer for a run: around its BASELINE only (the writer matches baselines), so the line above or below never falls into it
  function editBox(r) { var b = runBox(r); return [b[0], r.y - 0.3, b[2], r.y + 0.3]; }
  function inBox(r, b) { var cx = (r.x0 + r.x1) / 2; return cx >= b[0] - TOL && cx <= b[2] + TOL && r.y >= b[1] - TOL && r.y <= b[3] + TOL; }   // the writer's own rule (pdf_write.js plan)
  function itemBox(it) { return [it.x0, it.top, it.x1, it.bot]; }

  function targets(runs, R, imageBoxes, fileWhy, items) {
    var list = [], used = {}, st = { runs: 0, writableRuns: 0, lockedRuns: 0, cells: 0, cellTargets: 0, runTargets: 0, locked: 0, images: (imageBoxes || []).length, reasons: {} };
    var lock = function (t, reason, why) { t.lock = reason; t.why = why; st.reasons[reason] = (st.reasons[reason] || 0) + 1; return t; };
    if (fileWhy) {   // the writer cannot open this file at all (e.g. a cross-reference stream): every text the reader sees is locked, with the file's reason
      (items || []).forEach(function (it, i) { list.push(lock({ id: 'i' + i, kind: 'run', cell: null, run: null, box: itemBox(it), text: it.s, num: false }, fileWhy.reason, fileWhy.message)); });
    } else {
      var live = (runs || []).filter(function (r) { return r.n > 0; }); st.runs = live.length;
      live.forEach(function (r) { if (r.lock) st.lockedRuns++; else st.writableRuns++; });
      var sheet = (R && R.sheet) || {}, map = (R && R.map) || {};
      Object.keys(sheet).forEach(function (a) {
        st.cells++;
        var all = live.filter(function (r) { return inBox(r, map[a].box); }), mine = all.filter(function (r) { return !used[r.i]; });   // ALL runs in the box decide: the engine refuses a box that holds a locked run
        if (!mine.length) { list.push(lock({ id: 'c' + a, kind: 'cell', cell: a, run: null, box: map[a].box, text: sheet[a].text, num: sheet[a].t === 'n' }, 'not-in-page-content', 'the editor finds no text run of the page here (text inside a form XObject is not in this cut)')); return; }
        mine.forEach(function (r) { used[r.i] = 1; });
        if (all.every(function (r) { return !r.lock; })) { st.cellTargets++; list.push({ id: 'c' + a, kind: 'cell', cell: a, run: null, box: map[a].box, text: sheet[a].text, num: sheet[a].t === 'n', f: sheet[a].f || null, lock: null, why: null }); return; }
        mine.forEach(function (r) { var t = { id: 'r' + r.i, kind: 'run', cell: a, run: r.i, box: runBox(r), edit: editBox(r), text: r.text, num: false }; if (r.lock) list.push(lock(t, r.lock, r.why)); else { t.lock = null; t.why = null; st.runTargets++; list.push(t); } });   // a cell mixing locked and writable runs: each run on its own
      });
      live.forEach(function (r) { if (used[r.i]) return; var t = { id: 'r' + r.i, kind: 'run', cell: null, run: r.i, box: runBox(r), edit: editBox(r), text: r.text, num: false }; if (r.lock) list.push(lock(t, r.lock, r.why)); else { t.lock = null; t.why = null; st.runTargets++; list.push(t); } });
      // a run whose box also holds a locked run (a Thai mark of zero width beside it) is not offered: the engine would refuse that box
      list.forEach(function (t) { if (t.lock || t.kind !== 'run') return; var o = live.filter(function (r) { return r.lock && r.i !== t.run && inBox(r, t.edit); })[0]; if (o) { st.runTargets--; lock(t, 'shares-box', 'its place on the page also holds locked text (' + o.why + ')'); } });
    }
    (imageBoxes || []).forEach(function (b, i) { list.push(lock({ id: 'm' + i, kind: 'image', cell: null, run: null, box: b, text: '', num: false }, 'image', 'a picture: its pixels are kept exactly as they are (text inside a picture is pixels, not editable)')); });
    list.forEach(function (t) { if (t.lock) st.locked++; });
    return { list: list, stats: st };
  }
  function fmtGap(v, dp) { var p = Math.abs(v).toFixed(dp).split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+$)/g, ','); return p.join('.'); }
  function dpOf(R) { var dp = 0; Object.keys((R && R.sheet) || {}).forEach(function (a) { var k = R.sheet[a]; if (k.t === 'n') { var m = /\.(\d+)/.exec(k.text); if (m && m[1].length > dp) dp = m[1].length; } }); return dp; }
  // the totals as marks: one per SUM check and per row-rule failure (E3)
  function marks(R) {
    var dp = dpOf(R), out = [];
    ((R && R.checks) || []).forEach(function (c) {
      if (c.kind !== 'SUM' && c.kind !== 'ROWCELL') return;
      var gap = Math.round((c.computed - c.printed) * Math.pow(10, dp)) / Math.pow(10, dp);
      out.push({ cell: c.cell, ok: !!c.ok, kind: c.kind, printed: c.printed, computed: c.computed, gap: Math.abs(gap), range: c.range || null, formula: c.kind === 'SUM' ? 'SUM(' + c.range + ')' : c.formula, gapText: fmtGap(gap, dp), sumText: fmtGap(c.computed, dp) });
    });
    return out;
  }
  function cellsOf(range) {   // D5:D27 -> D5 ... D27 (one column)
    var m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range || ''); if (!m || m[1] !== m[3]) return [];
    var out = []; for (var r = Number(m[2]); r <= Number(m[4]); r++) out.push(m[1] + r); return out;
  }

  // ── the DOM half (browser only) ──
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function place(e, b, W, H) { e.style.left = (b[0] / W * 100) + '%'; e.style.top = (b[1] / H * 100) + '%'; e.style.width = (Math.max(0.5, b[2] - b[0]) / W * 100) + '%'; e.style.height = (Math.max(0.5, b[3] - b[1]) / H * 100) + '%'; }
  // hooks: edit(t, typed) -> Promise, locked(t), total(t, mark), select(cells, sum, count), empty(), accept(key), pick(t)
  function mount(div, size, L, hooks) {
    var old = div.querySelector('.el-layer'); if (old) old.remove();
    var W = size[0], H = size[1], lay = el('div', 'el-layer'), byId = {}, R = L.R, mk = marks(R), touch = false;
    lay.dataset.page = L.page;
    L.targets.list.forEach(function (t) {
      /*MUT-DROPTARGET*/
      var e = el('div', 'el-t' + (t.lock ? ' lk' : '') + (t.kind === 'image' ? ' img' : '')); e.dataset.id = t.id; e.dataset.kind = t.kind; if (t.cell) e.dataset.cell = t.cell; if (t.run != null) e.dataset.run = t.run; if (t.lock) e.dataset.lock = t.lock;
      e.title = t.lock ? 'Locked: ' + t.why : (t.num ? 'Double-click (or tap) to change this number' : 'Double-click (or tap) to change this text'); place(e, t.box, W, H); lay.appendChild(e); byId[t.id] = t;
    });
    mk.forEach(function (m) {
      var b = R.map[m.cell] && R.map[m.cell].box; if (!b) return;
      var e = el('div', 'el-mark ' + (m.ok ? 'ok' : 'bad')); e.dataset.cell = m.cell; e.dataset.ok = String(m.ok); e.dataset.gap = String(m.gap); e.dataset.computed = String(m.computed); e.dataset.printed = String(m.printed); e.dataset.kind = m.kind;
      place(e, b, W, H); e.appendChild(el('span', 'lbl', m.ok ? '✓' : (m.kind === 'SUM' ? 'rows ' + m.sumText : m.formula + ' gives ' + m.sumText) + ', gap ' + m.gapText)); lay.appendChild(e);
    });
    (L.subs || []).forEach(function (s) {   // §18.6 H5: on screen only
      var e = el('div', 'el-sub'); e.dataset.key = s.key; if (s.cell) e.dataset.cell = s.cell; place(e, s.box, W, H);
      var lb = el('span', 'lbl', 'font not same: ' + s.from + ' → ' + s.to + ' '), ok = el('button', '', 'Accept'); ok.type = 'button'; ok.dataset.accept = s.key; lb.appendChild(ok); e.appendChild(lb); lay.appendChild(e);
    });
    div.appendChild(lay);
    var down = null, sel = null, pending = null;
    var pagePt = function (ev) { var r = lay.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width * W, (ev.clientY - r.top) / r.height * H]; };
    var targetOf = function (ev) { var e = ev.target && ev.target.closest ? ev.target.closest('.el-t') : null; return e ? byId[e.dataset.id] : null; };
    var markOf = function (t) { return t && t.cell ? mk.filter(function (m) { return m.cell === t.cell; })[0] : null; };
    lay.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest && (ev.target.closest('.el-ed') || ev.target.dataset.accept)) return;
      touch = ev.pointerType !== 'mouse'; down = { x: ev.clientX, y: ev.clientY, p: pagePt(ev), t: targetOf(ev), moved: false };
    });
    lay.addEventListener('pointermove', function (ev) {
      if (!down || touch) return; if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 5) return;
      down.moved = true; var p = pagePt(ev), b = [Math.min(down.p[0], p[0]), Math.min(down.p[1], p[1]), Math.max(down.p[0], p[0]), Math.max(down.p[1], p[1])];
      if (!sel) { sel = el('div', 'el-sel'); lay.appendChild(sel); } place(sel, b, W, H); sel.dataset.box = b.join(',');
    });
    lay.addEventListener('pointerup', function (ev) {
      var d = down; down = null; if (!d) return;
      if (sel) {   // a drag over numbers: their sum and count (mouse)
        var b = sel.dataset.box.split(',').map(Number), cells = Object.keys(R.sheet).filter(function (a) { var k = R.sheet[a], c = R.map[a].box, cx = (c[0] + c[2]) / 2, cy = (c[1] + c[3]) / 2; return k.t === 'n' && cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3]; }), sum = 0;
        cells.forEach(function (a) { sum += R.sheet[a].v; }); hooks.select(cells, Math.round(sum * 1e6) / 1e6, cells.length); sel.remove(); sel = null; return;
      }
      if (d.moved || (touch && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 8)) return;   // a finger that scrolled is not a tap
      var t = d.t; if (!t) { hooks.empty(); return; }
      if (t.lock) { hooks.locked(t); return; }
      var m = markOf(t); if (m) lit(m);
      if (touch) { if (m) hooks.total(t, m); pending = t; setTimeout(function () { if (pending === t) { pending = null; open(t); } }, 350); } else if (m) hooks.total(t, m); else hooks.pick(t);
    });
    // a finger's tap: the browser would move the focus after it (the editor would close at once); the touchend is taken and the editor opened then
    lay.addEventListener('touchend', function (ev) { if (!pending) return; var t = pending; pending = null; if (ev.cancelable) ev.preventDefault(); open(t); }, { passive: false });
    lay.addEventListener('dblclick', function (ev) { var t = targetOf(ev); if (t && !t.lock) open(t); });
    lay.addEventListener('click', function (ev) { var k = ev.target && ev.target.dataset && ev.target.dataset.accept; if (k) { ev.stopPropagation(); hooks.accept(k); } });
    function lit(m) {
      lay.querySelectorAll('.el-lit').forEach(function (x) { x.remove(); });
      cellsOf(m.range).forEach(function (a) { var b = R.map[a] && R.map[a].box; if (!b) return; var e = el('div', 'el-lit'); e.dataset.cell = a; place(e, b, W, H); lay.appendChild(e); });
    }
    function open(t) {
      if (lay.querySelector('.el-ed') || hooks.busy()) return;
      var host = el('div', 'el-ed'), inp = el('input'), b = t.box; inp.value = t.text; inp.setAttribute('aria-label', 'New text for ' + (t.cell || 'this text'));
      host.style.top = (b[3] / H * 100) + '%'; host.appendChild(inp); lay.appendChild(host);
      var lw = lay.clientWidth, hw = host.offsetWidth; host.style.left = Math.max(0, Math.min(b[0] / W * lw, lw - hw)) + 'px';   // inside the page, whatever its width (a phone)
      var y0 = window.scrollY; try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } inp.select();
      var done = false, end = function (commit) { if (done) return; done = true; var v = inp.value; host.remove(); if (commit && v !== t.text) hooks.edit(t, v); };
      inp.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); end(true); } else if (e.key === 'Escape') end(false); });
      inp.addEventListener('blur', function () { end(false); });
      hooks.opened(t, window.scrollY - y0);
    }
    return { open: function (id) { if (byId[id]) open(byId[id]); }, lit: lit, marks: mk };
  }
  return { targets: targets, marks: marks, mount: mount, runBox: runBox, cellsOf: cellsOf };
});
