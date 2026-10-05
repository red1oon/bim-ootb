#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-HISTORY-THREADS: category / element threads on the Modeller dotline (READ-ONLY). Read the log after every run.
 * SPEC: bim-compiler prompts/HISTORY_PARALLEL_TIMELINE.md §THREADS step 1 + §THREADS-IMPL (category map, hook contract).
 * ISSUE: red1 2026-10-02 — "history of a particular category? … double click a '+' expands its timeline according to type …
 *   touch one category line, hiliting it blue glowing thread". Before this change the Modeller never MOUNTED the dotline and no
 *   chip/strip/thread existed (RED-first: run with E2E_URL=<live modeller.html> on unmodified main → H1 fails, no #hist-thr-chips).
 * Real Open Duplex → real edits (wall A gizmo move WITH its hosted riders, wall B move, a disc walk, a catalog insert) → then:
 *   H1 CHIPS     a chip `+ <Cat> (n)` per category, n == entries of that category in the log (the bar's own model) AND == an
 *                independent count from kernel_ops (rows grouped by gid, classed from each target's own GEOM_INSERT row)
 *   H2 STRIP     a real double-click on the Walls chip opens a strip listing EXACTLY the Walls entries, in log order
 *   H3 MULTI     the wall-with-riders gesture appears in BOTH the Walls and the Openings strips
 *   H4 ELEMENT   `+ Wall #A (1)` double-click → an element strip listing exactly the entries that targeted wall A
 *   H5 GLOW      a real click on the strip → it glows blue (box-shadow rgb(79, 195, 247)) and the badge reads "Viewing: Walls"
 *                (read-only scrubber — red1 2026-10-02 scope cut: no badge may promise a scoped undo)
 *   H5b SCRUB    while it glows, real clicks on ‹ / › step the view cursor ONLY through the Walls entries (§THREAD_SCRUB),
 *                skipping the walk + insert in between; kernel_ops untouched
 *   H6 JUMP      a click on a strip dot = read-only jump-to-view (§HIST_VIEWNAV idx=<that entry> opLogMutated=NO, kernel unchanged):
 *                the selection becomes exactly that entry's own targets and the orbit target = their bbox centre (≤1e-6 m)
 *   H7 EXIT      tap-again → off(tap-again); Esc → off(esc); a new edit → off(new-edit)
 *   H8 NO-HOOK   with NO categorize hook the bar renders byte-for-byte as before: OLD history_bar.js (base cbb7e355) vs the
 *                served one, same configure + same pushes/undo → identical #universal-hist-btns outerHTML and §-line sequence
 * A run that could not make the edits prints INCONCLUSIVE (nothing judged), never PASS.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const Dr = require('./threads_drive');
const { execSync } = require('child_process');
const path = require('path'), http = require('http'), https = require('https');
const URL_ = process.env.E2E_URL || undefined;
const BASE = process.env.THREADS_BASE || 'cbb7e355';

function fetchText(u) { return new Promise((res, rej) => { (u.startsWith('https') ? https : http).get(u, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(b)); }).on('error', rej); }); }

runE2E('W-HISTORY-THREADS', async (t) => {
  const pg = t.pg;
  // GUIDE_OUT=<dir>: one tight frame of the history bar per guide step (docs/ModellerFirstSteps.md Part 5), from THIS run
  const gshot = async (name) => { if (!process.env.GUIDE_OUT) return; const r = await pg.evaluate(() => { const b = document.getElementById('universal-hist-btns'); if (!b) return null; const q = b.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height }; });
    if (!r) return; const pad = 10, x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad);
    await pg.screenshot({ path: path.join(process.env.GUIDE_OUT, name + '.png'), clip: { x, y, width: Math.min(1400 - x, r.w + 2 * pad), height: Math.min(900 - y, r.h + 2 * pad) } }); console.log('  §GUIDE-SHOT ' + name + ' ' + Math.round(r.w) + 'x' + Math.round(r.h)); };
  await Dr.openDuplex(t);
  const hasApi = await pg.evaluate(() => !!(window.HistoryBar && window.HistoryBar.threads && document.getElementById('hist-dots')));
  console.log('  §THREADS api=' + hasApi);

  // ── the edits ───────────────────────────────────────────────────────────────
  const cands = await Dr.wallCandidates(t);
  const hosting = cands.filter(c => c.riders.length), plain = cands.filter(c => !c.riders.length);
  console.log('  §THREADS walls hosting=' + hosting.length + ' plain=' + plain.length);
  let A = null, rowsA = null;
  for (const c of hosting) { rowsA = await Dr.moveByGizmo(t, c.fid, 0.4); if (rowsA && rowsA.length >= 2) { A = c; break; } }
  let B = null, rowsB = null;
  const triedB = new Set();
  for (let round = 0; round < 3 && !B; round++) {   // up to 3 Fit → re-read rounds (the visible top-40 set moves with the camera)
    await pg.evaluate(() => window.Bonsai.select(null)); await pg.click('#b-fit'); await t.sleep(1000);
    const candsB = await Dr.wallCandidates(t);
    for (const c of candsB.filter(c => c.riders.length).concat(candsB.filter(c => !c.riders.length))) {
      if ((A && c.fid === A.fid) || triedB.has(c.fid)) continue; triedB.add(c.fid);
      rowsB = await Dr.moveByGizmo(t, c.fid, -0.3); if (rowsB && rowsB.length) { B = c; break; }
    }
  }
  const walkLine = await Dr.walk(t, 'ELEC');
  const insId = await Dr.insertOne(t);
  console.log('  §THREADS edits wallA=' + (A && A.fid) + ' rows=' + JSON.stringify((rowsA || []).map(r => r.op_type + '#' + r.id + '(' + (r.p.induced || 'p' + r.p.parent) + ')')) +
    ' wallB=' + (B && B.fid) + ' rows=' + (rowsB || []).length + ' walk=' + (walkLine ? walkLine.slice(0, 90) : 'none') + ' insert=' + insId);
  if (!A || !B) { console.log('W-HISTORY-THREADS: INCONCLUSIVE — could not land the two wall gestures by real input; nothing judged'); t.assert('H0 EDITS (two real wall gestures landed)', false, 'INCONCLUSIVE'); return; }

  // ── H1 chips vs the bar's model vs an independent kernel_ops count ─────────────
  const L = await Dr.line(t);
  L.forEach(e => console.log('    line seq=' + e.seq + ' "' + e.label + '" cats=' + e.cats.join('+') + ' els=' + JSON.stringify(e.els)));
  const dom = await pg.evaluate(() => Array.from(document.querySelectorAll('#hist-thr-chips .hist-thr-chip')).map(c => ({ cat: c.getAttribute('data-thr-cat'), n: +c.getAttribute('data-thr-n'), text: c.textContent })));
  const model = {}; L.forEach(e => e.cats.forEach(c => { model[c] = (model[c] || 0) + 1; }));
  // independent: group the session's kernel rows by gid (all dw* gids of one walk = one group), class each row from its target's row
  const indep = await pg.evaluate(() => {
    const db = window.Bonsai.oplog.db, rows = db.exec("SELECT id, op_type, parameters, gid FROM kernel_ops WHERE gid NOT LIKE 'arcseed-%' ORDER BY id")[0];
    const P = id => { const r = db.exec('SELECT op_type, parameters FROM kernel_ops WHERE id=' + id); return r.length ? { t: r[0].values[0][0], p: JSON.parse(r[0].values[0][1]) } : null; };
    const groups = {};
    (rows ? rows.values : []).forEach(v => { const gid = /^dw(walk|chain|fit)-/.test(v[3]) ? 'WALK' : v[3]; (groups[gid] = groups[gid] || []).push({ id: v[0], t: v[1], p: JSON.parse(v[2]) }); });
    const out = {};
    Object.keys(groups).forEach(g => {
      const cats = new Set();
      groups[g].forEach(r => {
        if (g === 'WALK') { cats.add('MEP'); return; }
        if (r.t === 'GEOM_INSERT') { if (r.p._dw) { cats.add('MEP'); return; } cats.add('Inserts'); const lib = r.p.hash && window.Bonsai.library.get(r.p.hash), cls = r.p.ifc_class || (lib && lib.ifc_class) || ''; if (/Door|Window/.test(cls)) cats.add('Openings'); return; }
        if (r.t === 'GEOM_MOVE') { const tg = P(r.p.parent), cls = tg && tg.p && tg.p.ifc_class || ''; cats.add(/Wall/.test(cls) ? 'Walls' : /Door|Window/.test(cls) ? 'Openings' : 'class:' + cls); return; }
        if (r.t === 'GEOM_CUT_MOVE') { cats.add('Openings'); return; }
        cats.add('op:' + r.t);
      });
      cats.forEach(c => { out[c] = (out[c] || 0) + 1; });
    });
    return out;
  });
  console.log('  §THREADS chips(dom)=' + JSON.stringify(dom.map(d => d.text)) + ' model=' + JSON.stringify(model) + ' kernel=' + JSON.stringify(indep));
  const domOk = dom.length > 0 && dom.length === Object.keys(model).length && dom.every(d => model[d.cat] === d.n && d.text === '+ ' + d.cat + ' (' + d.n + ')');
  const kOk = ['Walls', 'Openings', 'MEP', 'Inserts'].every(c => (model[c] || 0) === (indep[c] || 0)) && (model.Walls || 0) >= 2;
  t.assert('H1 CHIPS (one `+ Cat (n)` chip per category; n == log entries of that category == independent kernel_ops count)', domOk && kOk,
    'dom=' + JSON.stringify(dom.map(d => d.cat + ':' + d.n)) + ' kernel=' + JSON.stringify(indep));

  await gshot('first-steps-thread1-chips');
  // ── H2 strip via a real double-click ─────────────────────────────────────────
  const chipPt = async (sel) => pg.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  const dbl = async (sel) => { const p = await chipPt(sel); if (!p) return false; await pg.mouse.click(p[0], p[1], { clickCount: 1 }); await pg.mouse.click(p[0], p[1], { clickCount: 2 }); await t.sleep(250); return true; };
  await dbl('#hist-thr-chips .hist-thr-chip[data-thr-cat="Walls"]');
  const wantW = L.filter(e => e.cats.includes('Walls')).map(e => e.seq);
  const gotW = await pg.evaluate(() => { const s = document.querySelector('#hist-thr-strips .hist-thr-strip[data-thr-cat="Walls"]:not([data-thr-el])'); return s ? Array.from(s.querySelectorAll('.hist-thr-dot')).map(d => +d.getAttribute('data-seq')) : null; });
  console.log('  §THREADS strip Walls dom=' + JSON.stringify(gotW) + ' want=' + JSON.stringify(wantW) + ' app: ' + (t.slog.filter(l => /§THREAD_EXPAND cat=Walls/.test(l)).slice(-1)[0] || 'none'));
  t.assert('H2 STRIP (double-click Walls → strip lists exactly the Walls entries, in log order)', !!gotW && JSON.stringify(gotW) === JSON.stringify(wantW) && wantW.length >= 2, JSON.stringify(gotW));

  // ── H3 multi-category ─────────────────────────────────────────────────────────
  await dbl('#hist-thr-chips .hist-thr-chip[data-thr-cat="Openings"]');
  const seqA = L.find(e => e.els && e.els.includes(A.fid) && e.cats.includes('Walls'));
  const inOpen = await pg.evaluate(() => { const s = document.querySelector('#hist-thr-strips .hist-thr-strip[data-thr-cat="Openings"]:not([data-thr-el])'); return s ? Array.from(s.querySelectorAll('.hist-thr-dot')).map(d => +d.getAttribute('data-seq')) : null; });
  t.assert('H3 MULTI (wall A + its riding fillings = one gesture, listed in BOTH Walls and Openings)', !!seqA && gotW.includes(seqA.seq) && !!inOpen && inOpen.includes(seqA.seq),
    'seqA=' + (seqA && seqA.seq) + ' cats=' + (seqA && seqA.cats) + ' openings=' + JSON.stringify(inOpen));

  // ── H4 element thread ────────────────────────────────────────────────────────
  await dbl('#hist-thr-strips .hist-thr-strip[data-thr-cat="Walls"]:not([data-thr-el]) .hist-thr-elchip[data-thr-el="' + A.fid + '"]');
  const wantEl = L.filter(e => e.cats.includes('Walls') && e.els && e.els.includes(A.fid)).map(e => e.seq);
  const gotEl = await pg.evaluate(f => { const s = document.querySelector('#hist-thr-strips .hist-thr-strip[data-thr-cat="Walls"][data-thr-el="' + f + '"]'); return s ? Array.from(s.querySelectorAll('.hist-thr-dot')).map(d => +d.getAttribute('data-seq')) : null; }, A.fid);
  const elChipText = await pg.evaluate(f => { const c = document.querySelector('.hist-thr-elchip[data-thr-el="' + f + '"]'); return c ? c.textContent : null; }, A.fid);
  t.assert('H4 ELEMENT (`' + elChipText + '` → strip of exactly the entries that targeted wall ' + A.fid + ')', !!gotEl && JSON.stringify(gotEl) === JSON.stringify(wantEl) && wantEl.length >= 1, JSON.stringify(gotEl) + ' want ' + JSON.stringify(wantEl));
  await t.shot('threads-expanded'); await gshot('first-steps-thread2-strip');

  // ── H5 glow + badge (real click on the strip's label) ─────────────────────────
  const stripLabelPt = async () => pg.evaluate(() => { const s = document.querySelector('#hist-thr-strips .hist-thr-strip[data-thr-cat="Walls"]:not([data-thr-el]) span'); if (!s) return null; const r = s.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const tapStrip = async () => { const p = await stripLabelPt(); if (p) { await pg.mouse.click(p[0], p[1]); await t.sleep(250); } return !!p; };
  await tapStrip();
  const glow = await pg.evaluate(() => { const s = document.querySelector('#hist-thr-strips .hist-thr-strip[data-thr-cat="Walls"]:not([data-thr-el])'), b = document.getElementById('hist-thr-badge');
    return { cls: s && s.className, shadow: s && getComputedStyle(s).boxShadow, badge: b && b.style.display !== 'none' ? b.textContent : null, scope: window.HistoryBar.getScope() }; });
  console.log('  §THREADS glow=' + JSON.stringify(glow) + ' app: ' + (t.slog.filter(l => /§THREAD_SCOPE on/.test(l)).slice(-1)[0] || 'none'));
  t.assert('H5 GLOW (tap → strip glows blue + badge "Viewing: Walls")', !!glow.cls && /hist-thr-glow/.test(glow.cls) && /rgb\(79, 195, 247\)/.test(glow.shadow || '') && glow.badge === 'Viewing: Walls' && glow.scope && glow.scope.cat === 'Walls', glow.badge);
  await t.shot('threads-glow'); await gshot('first-steps-thread3-glow');

  // ── H5b category scrubber: ‹ › step along the Walls thread only ──────────────
  const k0 = await pg.evaluate(() => window.Bonsai.oplog.db.exec('SELECT COALESCE(SUM(undone),0), COUNT(*) FROM kernel_ops')[0].values[0]);
  const visited = [], nS = t.slog.length;
  const clickBtn = async (id) => { await t.flySettle(); const p = await chipPt('#' + id); if (p) { const hit = await pg.evaluate((x, y) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.tagName) : 'none'; }, p[0], p[1]); if (hit !== id) console.log('  §THREADS click ' + id + ' covered by ' + hit); await pg.mouse.click(p[0], p[1]); await t.sleep(350); } };
  for (let i = 0; i < wantW.length + 1; i++) { await clickBtn('hist-back'); if (i === 0) await gshot('first-steps-thread4-scrub'); }
  for (let i = 0; i < wantW.length + 1; i++) { await clickBtn('hist-fwd'); }
  t.slog.slice(nS).filter(l => /§HIST_VIEWNAV/.test(l)).forEach(l => visited.push(+((/idx=(-?\d+)/.exec(l) || [])[1])));
  const scrubLines = t.slog.slice(nS).filter(l => /§THREAD_SCRUB/.test(l));
  const k1 = await pg.evaluate(() => window.Bonsai.oplog.db.exec('SELECT COALESCE(SUM(undone),0), COUNT(*) FROM kernel_ops')[0].values[0]);
  // line index = 1 + position in L (the line is [Opened Duplex, …every categorized entry in seq order])
  const nLine = await pg.evaluate(() => window.HistoryBar.list().length);
  const wIdx = L.map((e, i) => e.cats.includes('Walls') ? i + 1 : -1).filter(i => i >= 0);
  const want = wIdx.slice().reverse().concat(wIdx.slice(1));
  const onlyWalls = nLine === L.length + 1 && JSON.stringify(visited) === JSON.stringify(want);
  const backOrder = true; const wLabels = wIdx;
  console.log('  §THREADS scrub visited=' + JSON.stringify(visited) + ' wallsLabels=' + JSON.stringify(wLabels) + ' scrub=' + JSON.stringify(scrubLines.map(l => l.slice(13, 80))) + ' kernel ' + k0 + '→' + k1);
  t.assert('H5b SCRUB (‹ › with the glow on visit ONLY the Walls entries, newest→oldest then back; walk/insert skipped; kernel untouched)',
    onlyWalls && backOrder && scrubLines.length >= 2 && k0[0] === k1[0] && k0[1] === k1[1], JSON.stringify(visited));

  // ── H6 jump-to-view from a strip dot ─────────────────────────────────────────
  const und0 = await pg.evaluate(() => window.Bonsai.oplog.db.exec('SELECT COALESCE(SUM(undone),0), COUNT(*) FROM kernel_ops')[0].values[0]);
  const target = wantW[0];
  const dotPt = await pg.evaluate(s => { const d = document.querySelector('#hist-thr-strips .hist-thr-strip[data-thr-cat="Walls"]:not([data-thr-el]) .hist-thr-dot[data-seq="' + s + '"]'); if (!d) return null; const r = d.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, target);
  const nNav = t.slog.length;
  if (dotPt) { await pg.mouse.click(dotPt[0], dotPt[1]); await t.sleep(400); }
  const nav = t.slog.slice(nNav).find(l => /§HIST_VIEWNAV/.test(l)) || '';
  const und1 = await pg.evaluate(() => window.Bonsai.oplog.db.exec('SELECT COALESCE(SUM(undone),0), COUNT(*) FROM kernel_ops')[0].values[0]);
  const wantLbl = L.find(e => e.seq === target).label, wantEls = L.find(e => e.seq === target).els || [];
  await t.flySettle();
  const view = await pg.evaluate(els => { const B = window.Bonsai, sel = Array.from(B._selSet || []).sort((a, b) => a - b), box = new window.THREE.Box3();
    els.forEach(f => { const m = B.meshFor(f); if (m) box.union(new window.THREE.Box3().setFromObject(m)); }); const c = new window.THREE.Vector3(); box.getCenter(c);
    const tg = window.A.controls.target; return { sel, d: Math.hypot(tg.x - c.x, tg.y - c.y, tg.z - c.z) }; }, wantEls);
  const tv = t.slog.slice(nNav).find(l => /§THREAD_VIEW/.test(l)) || '';
  console.log('  §THREADS jump ' + tv.slice(0, 160) + ' sel=' + JSON.stringify(view.sel) + ' want=' + JSON.stringify(wantEls) + ' |target−centre|=' + view.d.toExponential(2));
  t.assert('H6 JUMP (strip dot = read-only jump-to-view: §HIST_VIEWNAV opLogMutated=NO, kernel unchanged, selection = the entry\'s targets, framed)',
    /opLogMutated=NO/.test(nav) && nav.indexOf('label="' + wantLbl + '"') >= 0 && und0[0] === und1[0] && und0[1] === und1[1] &&
    JSON.stringify(view.sel) === JSON.stringify(wantEls.slice().sort((a, b) => a - b)) && wantEls.length > 0 && view.d < 1e-6, nav + ' undone ' + und0 + '→' + und1);

  // ── H7 exits ─────────────────────────────────────────────────────────────────
  const offReason = () => (t.slog.filter(l => /§THREAD_SCOPE off/.test(l)).slice(-1)[0] || '').replace(/.*reason=/, '');
  await tapStrip(); const r1 = offReason(), s1 = await pg.evaluate(() => window.HistoryBar.getScope());
  await tapStrip(); await Dr.blurAll(pg); await pg.keyboard.press('Escape'); await t.sleep(250); const r2 = offReason(), s2 = await pg.evaluate(() => window.HistoryBar.getScope());
  await tapStrip(); const s3on = await pg.evaluate(() => window.HistoryBar.getScope());
  const ins2 = await Dr.insertOne(t); const r3 = offReason(), s3 = await pg.evaluate(() => window.HistoryBar.getScope());
  console.log('  §THREADS exits tap-again=' + r1 + ' esc=' + r2 + ' new-edit=' + r3 + ' (insert ' + ins2 + ', scope before=' + JSON.stringify(s3on) + ')');
  t.assert('H7 EXIT (tap-again / Esc / a new edit each leave the scope)', r1 === 'tap-again' && !s1 && r2 === 'esc' && !s2 && !!s3on && r3 === 'new-edit' && !s3 && ins2 != null, r1 + '/' + r2 + '/' + r3);

  // ── H8 no hook ⇒ byte-identical to the base file ────────────────────────────
  const newUrl = new URL('../common/history_bar.js', await pg.evaluate(() => location.href)).href;
  const newSrc = await fetchText(newUrl);
  const oldSrc = execSync('git show ' + BASE + ':common/history_bar.js', { cwd: path.join(__dirname, '..', '..') }).toString();
  const runBar = async (src) => {   // (H8)
    const p2 = await pg.browser().newPage(); const lines = [];
    p2.on('console', m => { const x = m.text(); if (/^§/.test(x)) lines.push(x.replace(/ts=\d+/g, '')); });
    await p2.setContent('<!doctype html><html><head></head><body><div id="host"></div></body></html>');
    await p2.addScriptTag({ content: src });
    const html = await p2.evaluate(() => {
      const HB = window.HistoryBar;
      HB.configure({ source: 'viewer-ctl', mountHostId: 'host', profiles: { high: { op: { GRID_MOVE: true }, view: { NAVIGATE: true } } }, defaultDepth: () => 'high', ignorePersistedDepth: true, skipKeyboard: true });
      HB.open();
      HB.push({ bucket: 'op', kind: 'op', type: 'GRID_MOVE', label: 'Grid 1 move', opId: 1, sigKey: 'a' });
      HB.push({ bucket: 'view', kind: 'view', type: 'NAVIGATE', label: 'Look', readonly: true, sigKey: 'b' });
      HB.push({ bucket: 'op', kind: 'op', type: 'GRID_MOVE', label: 'Grid 2 move', opId: 2, sigKey: 'c' });
      HB.undo(); HB.push({ bucket: 'op', kind: 'op', type: 'GRID_MOVE', label: 'Grid 3 move', opId: 3, sigKey: 'd' });
      HB.dumpTree();
      return document.getElementById('universal-hist-btns').outerHTML;
    });
    await p2.close(); return { html, lines };
  };
  const o = await runBar(oldSrc), n = await runBar(newSrc);
  const h = s => require('crypto').createHash('sha1').update(s).digest('hex').slice(0, 12);
  console.log('  §THREADS no-hook old=' + h(o.html) + ' new=' + h(n.html) + ' bytes ' + o.html.length + '/' + n.html.length + ' §lines old=' + h(o.lines.join('\n')) + ' new=' + h(n.lines.join('\n')) + ' (' + n.lines.length + ' lines; new src ' + newSrc.length + ' B from ' + newUrl + ')');
  t.assert('H8 NO-HOOK (no categorize ⇒ bar outerHTML + §-line sequence identical to base ' + BASE + ')', o.html === n.html && o.lines.join('\n') === n.lines.join('\n') && newSrc.indexOf('categorize') >= 0, h(o.html) + ' vs ' + h(n.html));

  t.slog.filter(l => /§THREAD/.test(l)).slice(-14).forEach(l => console.log('    app: ' + l.slice(0, 230)));
}, { width: 1400, height: 900, dpr: 1, url: URL_ });
