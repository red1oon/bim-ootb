/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// ⚠ DO NOT REMOVE — §D82 the marked sheet, full frame, in the Modeller (prompts/DXF2BIM_FOUNDATION_LANE.md §D82, W-SHEET-FRAME). Read the log after every run.
// One loaded sheet as given (viewer/dxf_sheet_view.js, its DXF2BIM-MARK texts left out), its markings drawn where they sit (positional keys) or listed in a markings box (the rest:
// they are written at 0,0, a point that means nothing), the open yellow rows of the list as rings at their evidence point, and a frame + ISO 7200 title block ONLY when the sheet
// has no frame of its own (a CAD office's block is never doubled or blanked). Pure build (`build`) + a thin overlay (`open`); SVG at paper size and Print share the one draw list.
// Log tags: §SHEET-VIEW §SHEET-MARKS §SHEET-FRAME.
(function () {
  'use strict';
  var TAG = '§SHEET-VIEW', MARK_LAYER = 'DXF2BIM-MARK';
  var COL = { yours: '#f2f2f2', stated: '#ffd21f', read: '#ffd21f', inferred: '#ff8a1f', notstated: '#ffd21f', frame: '#9aa3b2' };
  var POS_X = { GRIDX: 1, GRIDH: 1 }, POS_Y = { GRIDY: 1, Z: 1 }, POS_PT = { TAG: 1, WALLTOP: 1 };   // x-only labels are written vertically (a grid bay can be narrower than its label); GRIDX/GRIDH a vertical line through x, GRIDY/Z a horizontal one through y, TAG/WALLTOP a point; EXCLUDE its box
  var PAPERS = [['A4', 297, 210], ['A3', 420, 297], ['A2', 594, 420], ['A1', 841, 594], ['A0', 1189, 841]], SCALES = [100, 200, 500, 50];   // ISO 216 landscape; 1:100 first (the std2d convention)
  var BORDER = 10, BAND = 50, TB = [180, 40], INSUNITS = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };
  var st = { si: null, view: null, marks: true, el: null, last: null };

  function ME() { return window.DxfMetaEditor; }
  function V() { return window.DxfSheetView; }
  function unitsOf(sh) {   // the sheet's stated @UNITS, else its file header ($INSUNITS); none -> null (no paper scale is guessed)
    var m = (sh.marks || []).filter(function (q) { return q.key === 'UNITS'; })[0]; if (m) return String(m.value);
    var h = /\$INSUNITS\s*\r?\n\s*70\s*\r?\n\s*(\d+)/.exec(sh.text || ''); return h && INSUNITS[h[1]] ? INSUNITS[h[1]] : null;
  }
  // a frame of its own: a closed polyline spanning more than 90 % of the drawing's extent both ways (measured: 8 of the 9 raw shed sheets carry one, 1S_ELEV_SOUTH does not)
  function ownFrame(list, b) { var W = b.x1 - b.x0, H = b.y1 - b.y0;
    return list.some(function (d) { if (d.k !== 'poly' || d.pts.length < 4) return false; var xs = d.pts.map(function (p) { return p[0]; }), ys = d.pts.map(function (p) { return p[1]; });
      return (Math.max.apply(null, xs) - Math.min.apply(null, xs)) > 0.9 * W && (Math.max.apply(null, ys) - Math.min.apply(null, ys)) > 0.9 * H; }); }
  function tierCol(rule) { var t = rule ? ME().tierOf(rule) : null; return COL[t] || COL.yours; }
  function line(a, b, c, o) { return Object.assign({ k: 'line', layer: MARK_LAYER, c: c, a: a, b: b, grp: 'marks', w: 2 }, o || {}); }
  function text(p, s, h, c, o) { return Object.assign({ k: 'text', layer: MARK_LAYER, c: c, p: p, h: h, s: s, rot: 0, mid: false, grp: 'marks' }, o || {}); }

  function build(si, opts) {
    opts = opts || {}; var E = ME(), sh = E.state.sheets[si]; if (!sh) return null;
    var dl = V().toDrawList(V().parse(sh.text || '')), drawing = dl.list.filter(function (d) { return d.layer !== MARK_LAYER; }), b = V().bounds(drawing) || { x0: 0, y0: 0, x1: 1, y1: 1 };
    var W = b.x1 - b.x0, H = b.y1 - b.y0, D = Math.max(W, H), th = D * 0.012, list = drawing.slice(), marks = [], box = [], rings = [], top = th * 2;
    var up = function (t) { top = Math.max(top, t.p[1] - b.y1 + String(t.s).length * 0.6 * t.h + th * 0.5); return t; };   // a vertical label's top end (0.6 x height per character, as the renderer's wrap)
    // the markings: positional at their place, the rest in the box (in the order the sheet holds them)
    (sh.marks || []).forEach(function (m, mi) { var c = tierCol(m.rule), lab = '@' + m.key + '=' + m.value, v;
      if (POS_X[m.key]) { list.push(line([m.x, b.y0], [m.x, b.y1], c, { dash: true, mk: mi })); list.push(up(text([m.x + th * 0.35, b.y1 + th * 0.6], lab, th, c, { mk: mi, rot: 90 }))); marks.push({ mi: mi, key: m.key, at: 'x', x: m.x }); }
      else if (POS_Y[m.key]) { list.push(line([b.x0, m.y], [b.x1, m.y], c, { dash: true, mk: mi })); list.push(text([b.x1 + th * 0.6, m.y], lab, th, c, { mk: mi })); marks.push({ mi: mi, key: m.key, at: 'y', y: m.y }); }
      else if (m.key === 'EXCLUDE' && (v = String(m.value).split(',').map(Number)).length >= 4 && v.slice(0, 4).every(isFinite)) {
        list.push({ k: 'poly', layer: MARK_LAYER, c: c, pts: [[v[0], v[1]], [v[2], v[1]], [v[2], v[3]], [v[0], v[3]]], closed: true, dash: true, grp: 'marks', w: 2, mk: mi }); list.push(text([v[0], v[3] + th * 0.4], lab, th, c, { mk: mi })); marks.push({ mi: mi, key: m.key, at: 'box', box: v.slice(0, 4) }); }
      else if (POS_PT[m.key] && (m.x || m.y)) { list.push({ k: 'circle', layer: MARK_LAYER, c: c, o: [m.x, m.y], r: th * 0.5, grp: 'marks', w: 2, mk: mi }); list.push(text([m.x + th * 0.7, m.y], lab, th, c, { mk: mi })); marks.push({ mi: mi, key: m.key, at: 'pt', x: m.x, y: m.y }); }
      else box.push({ mi: mi, s: lab, c: c }); });
    // the open rows of the list for this sheet: a ring at the evidence point the rule read; a row with no point (0,0) is listed in the box as open
    // a row's point means what its key means (as a marking's): GRIDX / GRIDH only an x (the ring at the drawing's top edge), GRIDY / Z only a y (at its right edge);
    // a point that still lies off the drawing is not drawn off the sheet: the row is listed in the box (measured 2026-10-26: the shed plan's 18 GRIDX rows carried y = 3,278 in off the sheet)
    var near = function (q) { var mx = W * 0.05, my = H * 0.05; return q[0] >= b.x0 - mx && q[0] <= b.x1 + mx && q[1] >= b.y0 - my && q[1] <= b.y1 + my; };
    E.openRows(si).forEach(function (r) { var c = COL[r.t] || COL.stated, lab = '@' + r.key + '=' + r.value + ' ?', q = POS_X[r.key] ? [r.x, b.y1] : POS_Y[r.key] ? [b.x1, r.y] : [r.x, r.y];
      if ((r.x || r.y) && near(q)) { list.push({ k: 'circle', layer: MARK_LAYER, c: c, o: q, r: th * 0.9, grp: 'marks', w: 2, ev: r.ev });
        if (POS_X[r.key]) list.push(line([r.x, b.y0], [r.x, b.y1], c, { dash: true, w: 1, ev: r.ev })); else if (POS_Y[r.key]) list.push(line([b.x0, r.y], [b.x1, r.y], c, { dash: true, w: 1, ev: r.ev }));
        list.push(POS_X[r.key] ? up(text([q[0] + th * 0.3, q[1] + th * 1.1], lab, th * 0.8, c, { ev: r.ev, rot: 90 })) : text([q[0] + th, q[1] + th * 0.4], lab, th * 0.8, c, { ev: r.ev })); rings.push(r.ev); }
      else box.push({ ev: r.ev, s: lab + ' (open: ' + r.g + (r.x || r.y ? ', its point is off the sheet' : '') + ')', c: c }); });
    // the frame: the sheet's own, else a drawn ISO 5457 border + ISO 7200 title block at the paper and scale that hold the drawing
    var own = ownFrame(drawing, b), u = unitsOf(sh), mmU = u && window.Dxf2Marks && window.Dxf2Marks.UNITS[u] ? window.Dxf2Marks.UNITS[u] * 1000 : null, fr = { own: own, units: u, paper: null, scale: null }, vb = b;
    if (!own && mmU) {
      var wmm = W * mmU, hmm = H * mmU, pick = null;
      SCALES.some(function (s) { return PAPERS.some(function (P) { if (wmm / s + 10 <= P[1] - 2 * BORDER && hmm / s + 10 <= P[2] - 2 * BORDER - BAND) { pick = { s: s, P: P }; return true; } return false; }); });
      if (pick) {
        var k = pick.s / mmU, Pw = pick.P[1], Ph = pick.P[2], cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, X0 = cx - Pw / 2 * k, Y0 = cy - (Ph + BAND) / 2 * k, at = function (x, y) { return [X0 + x * k, Y0 + y * k]; };
        var rect = function (x0, y0, x1, y1) { return { k: 'poly', layer: 'DXF2BIM-FRAME', c: COL.frame, pts: [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)], closed: true }; };
        list.push(rect(0, 0, Pw, Ph)); list.push(rect(BORDER, BORDER, Pw - BORDER, Ph - BORDER)); list.push(rect(Pw - BORDER - TB[0], BORDER, Pw - BORDER, BORDER + TB[1]));
        var set = (sh.marks || []).filter(function (q) { return q.key === 'SET'; })[0], tx = Pw - BORDER - TB[0] + 3, th2 = 3.2 * k;
        var fields = [['Title', sh.name.replace(/\.dxf$/i, '')], ['Drawing no.', sh.name], ['Scale', '1:' + pick.s], ['Paper', pick.P[0] + ' (' + Pw + ' x ' + Ph + ' mm)'], ['Units', u], ['Set', set ? set.value : null],
          ['Date of issue', null], ['Owner', null], ['Approved by', null], ['Revision', null]];   // ISO 7200: what the drawing does not state is shown as not stated, never filled in
        fields.forEach(function (f, i) { var col = i < 5 ? 0 : 1, row = i % 5, p = at(tx + col * 90, BORDER + TB[1] - 6 - row * 7.2);
          list.push({ k: 'text', layer: 'DXF2BIM-FRAME', c: f[1] === null ? COL.notstated : COL.frame, p: p, h: th2, s: f[0] + ': ' + (f[1] === null ? 'not stated' : f[1]), rot: 0, mid: false, tb: f[0], notStated: f[1] === null }); });
        fr.paper = pick.P[0]; fr.scale = pick.s; fr.mm = [Pw, Ph]; vb = { x0: X0, y0: Y0, x1: X0 + Pw * k, y1: Y0 + Ph * k };
        box.forEach(function (q, i) { list.push(text(at(BORDER + 4, BORDER + TB[1] - 6 - i * 6), q.s, 2.8 * k, q.c, { mk: q.mi, ev: q.ev })); });   // the markings box: the band left of the title block
      }
    }
    if (!fr.paper) { box.forEach(function (q, i) { list.push(text([b.x1 - W * 0.35, b.y0 - th * (1.6 + 1.3 * i)], q.s, th, q.c, { mk: q.mi, ev: q.ev })); });   // own frame (or no units): the box below the drawing, right
      vb = { x0: Math.min(b.x0, b.x1 - W * 0.35), y0: b.y0 - th * (2 + 1.3 * box.length), x1: b.x1 + th * 8, y1: b.y1 + top }; }
    if (opts.marks === false) list = list.filter(function (d) { return d.grp !== 'marks'; });
    var info = { si: si, sheet: sh.name, ents: Object.keys(dl.stats.by_type).reduce(function (a, k) { return a + dl.stats.by_type[k]; }, 0), drawn: Object.keys(dl.stats.drawn_by_type).reduce(function (a, k) { return a + dl.stats.drawn_by_type[k]; }, 0),
      unsupported: dl.stats.unsupported || 0, marks: (sh.marks || []).length, positional: marks.length, boxed: box.filter(function (q) { return q.mi !== undefined; }).length, boxedMarks: box.filter(function (q) { return q.mi !== undefined; }).map(function (q) { return q.mi; }), open: E.openRows(si).length, rings: rings, boxedOpen: box.filter(function (q) { return q.ev !== undefined; }).map(function (q) { return q.ev; }), boxedOpenText: box.filter(function (q) { return q.ev !== undefined; }).map(function (q) { return q.s; }),
      placed: marks, frame: fr, bounds: b, view: vb };
    return { list: list, info: info, svg: function () { return V().toSVG(list, vb, '#14171c', fr.mm ? { mm: fr.mm } : null); } };
  }

  function log(r) { var i = r.info;
    console.log(TAG + ' sheet=' + i.sheet + ' ents=' + i.ents + ' drawn=' + i.drawn + ' unsupported=' + i.unsupported);
    console.log('§SHEET-MARKS sheet=' + i.sheet + ' marks=' + i.marks + ' positional=' + i.positional + ' boxed=' + i.boxed + ' open_yellow=' + i.open + ' rings=' + i.rings.length + ' boxed_open=' + i.boxedOpen.length + (i.boxedOpenText.length ? ' open_box="' + i.boxedOpenText.join(' | ') + '"' : ''));   // the box's open rows, as written on the sheet (the film quotes them)
    console.log('§SHEET-FRAME sheet=' + i.sheet + ' own=' + (i.frame.own ? 1 : 0) + ' paper=' + (i.frame.paper || '-') + ' scale=' + (i.frame.scale ? '1:' + i.frame.scale : '-') + ' units=' + (i.frame.units || 'unknown')); }

  function paint() { if (!st.el) return; var cv = st.el.querySelector('canvas'), r = st.last, w = cv.clientWidth, h = cv.clientHeight; cv.width = w; cv.height = h;
    if (!st.view) st.view = V().fit(r.info.view, w, h, 24); V().paintCanvas(cv.getContext('2d'), r.list, st.view, w, h); }
  function refresh() { if (st.si === null || !st.el) return; st.last = build(st.si, { marks: st.marks }); log(st.last); paint(); }
  function close(why) { if (!st.el) return; st.el.remove(); st.el = null; st.si = null; st.view = null; document.removeEventListener('keydown', onKey, true); console.log(TAG + ' closed by=' + (why || 'close')); }
  function onKey(e) { if (e.key === 'Escape' && st.el) { e.stopPropagation(); close('esc'); } }
  function download(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0); }
  function open(si) {
    close('reopen'); if (!ME() || !V() || !ME().state.sheets[si]) { console.warn(TAG + ' refused: no such sheet ' + si); return null; }
    var pr = document.getElementById('dm-panel'), left = pr && pr.style.display !== 'none' ? Math.round(pr.getBoundingClientRect().right) : 0, el = document.createElement('div');
    el.id = 'dxf-sheet-frame'; el.style.cssText = 'position:fixed;top:0;bottom:0;right:0;left:' + left + 'px;z-index:60;background:#14171c;display:flex;flex-direction:column;font:12px system-ui,sans-serif;color:#c7cdd8';
    el.innerHTML = '<div style="display:flex;gap:8px;align-items:center;padding:6px 10px;border-bottom:1px solid #2c303a"><b id="dsf-name" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></b>' +
      '<label><input type="checkbox" id="dsf-marks"' + (st.marks ? ' checked' : '') + '> Markings</label><button class="dm-btn" id="dsf-svg">Save SVG</button><button class="dm-btn" id="dsf-print">Print</button><button class="dm-btn" id="dsf-close" title="Close (Esc)">✕</button></div>' +
      '<canvas style="flex:1;width:100%;min-height:0;cursor:grab"></canvas>';
    document.body.appendChild(el); st.el = el; st.si = si; st.view = null;
    el.querySelector('#dsf-name').textContent = ME().state.sheets[si].name;
    el.querySelector('#dsf-close').onclick = function () { close('close'); };
    el.querySelector('#dsf-marks').onchange = function (e) { st.marks = !!e.target.checked; refresh(); };
    el.querySelector('#dsf-svg').onclick = function () { download(ME().state.sheets[st.si].name.replace(/\.dxf$/i, '') + (st.marks ? '_marked' : '') + '.svg', st.last.svg(), 'image/svg+xml'); };
    el.querySelector('#dsf-print').onclick = function () { var f = document.createElement('iframe'), mm = st.last.info.frame.mm; f.style.cssText = 'position:fixed;width:0;height:0;border:0';
      f.srcdoc = '<style>@page{size:' + (mm ? mm[0] + 'mm ' + mm[1] + 'mm' : 'landscape') + ';margin:0}body{margin:0}svg{width:100%;height:auto}</style>' + st.last.svg(); f.onload = function () { f.contentWindow.print(); setTimeout(function () { f.remove(); }, 1000); }; document.body.appendChild(f); };
    var cv = el.querySelector('canvas'), drag = null;
    cv.onwheel = function (e) { e.preventDefault(); var f = e.deltaY < 0 ? 1.15 : 1 / 1.15, r = cv.getBoundingClientRect(), v = st.view, mx = e.clientX - r.left, my = e.clientY - r.top;
      var px = v.cx + (mx - r.width / 2) / v.s, py = v.cy - (my - r.height / 2) / v.s; v.s *= f; v.cx = px - (mx - r.width / 2) / v.s; v.cy = py + (my - r.height / 2) / v.s; paint(); };
    cv.onmousedown = function (e) { drag = [e.clientX, e.clientY]; }; window.addEventListener('mouseup', function () { drag = null; });
    cv.onmousemove = function (e) { if (!drag) return; st.view.cx -= (e.clientX - drag[0]) / st.view.s; st.view.cy += (e.clientY - drag[1]) / st.view.s; drag = [e.clientX, e.clientY]; paint(); };
    document.addEventListener('keydown', onKey, true);
    refresh(); return st.last;
  }
  window.DxfSheetFrame = { build: build, open: open, close: close, refresh: refresh, isOpen: function () { return !!st.el; }, state: st };
})();
