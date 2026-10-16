#!/usr/bin/env node
// witness_tm_office_snapshot.js — §TM_SNAPSHOT (2026-08-24, bim-compiler
// prompts/TM_OFFICE_SNAPSHOT_LANE.md §3 SETTLED: plain PNG + deep-link, no OOXML/OLE).
// Proves the TM Office Snapshot feature: a share-sheet row that captures the canvas, bakes the
// TM panel's own caption text onto it, and puts image + deep-link into the user's hands as TWO
// explicit clipboard actions (Copy Image / Copy Link) — the shape Word/Excel can actually consume.
//
// Names the issues it tests:
//   TOS-1  Conditional row: the share sheet must offer the snapshot ONLY while the Time Machine
//          is active — a snapshot option with nothing to snapshot is a broken affordance.
//          (a) tmSnapshotSectionHtml(false) === '' — no rows rendered when TM inactive.
//          (b) tmSnapshotSectionHtml(true) carries both data-share-tm-snapshot and
//              data-share-tm-link rows in the house share-section structure.
//          (c) openShareSheet actually calls it gated on tmSnapshotActive() and null-guards the
//              handler bindings (rows may not exist).
//          (d) tmSnapshotActive() is false with no tmGetState, false when inactive, true when active.
//   TOS-2  Regression-proof: A.buildShareUrl() still emits tm=<cursor> when TM active and omits
//          it when inactive — the deep-link half of the feature (spec §2, pre-existing).
//   TOS-3  The caption is actually DRAWN onto the composed canvas, not just "no exception":
//          recording mock ctx proves (in order) a fresh renderer.render, drawImage of A.canvas,
//          a full-width caption bar fillRect at the bottom edge, and fillText of the TM panel's
//          exact counter + label + status text with y-coords INSIDE the bar region.
//          (No node-canvas lib exists in this repo, so a literal pixel diff is not possible
//          headlessly — call-level recording is the equivalent proof, and stronger than
//          exception-free execution: it asserts the text and region, not merely survival.)
//   TOS-4  The copy actions do what they log:
//          (a) Copy Image writes ONE ClipboardItem carrying image/png and logs
//              §TM_SNAPSHOT_COPY kind=image method=clipboard.
//          (b) With ClipboardItem unavailable (older Firefox) it falls back to a local .png save
//              (click on a download anchor) and logs method=download — never silently no-ops.
//          (c) Copy Link routes A.buildShareUrl() (tm= included) through the existing
//              A.shareUrl pattern and logs §TM_SNAPSHOT_COPY kind=link.
//
// §S73 lesson (witness_gantt_lock_integrity.js / G-COH-6): all slicing below is LINE-ANCHORED and
// brace-balanced — a plain indexOf can match a comment that merely mentions the function.
// Read the § log lines, not exit code alone.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const shareSrc = fs.readFileSync(path.join(__dirname, '..', 'share.js'), 'utf8');

// Line-anchored, brace-balanced slice. `head` is the exact start-of-line text of the definition,
// e.g. 'function tmSnapshotSectionHtml(' or 'A.buildShareUrl = function'.
function slice(src, head) {
  const esc = head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('^[ \\t]*' + esc, 'm').exec(src);
  if (!m) throw new Error('no line-anchored definition for: ' + head);
  const start = m.index + m[0].search(/\S/);
  let depth = 0, seenOpen = false;
  for (let i = m.index; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces for: ' + head);
}

/* ── TOS-1a/b: tmSnapshotSectionHtml is conditional and carries both rows ─────────────────── */
{
  const fn = slice(shareSrc, 'function tmSnapshotSectionHtml(');
  const sb = {};
  vm.runInNewContext(fn + '; __out = tmSnapshotSectionHtml;', sb);
  const off = sb.__out(false), on = sb.__out(true);
  assert(off === '', 'TOS-1a inactive TM renders NO section (got ' + JSON.stringify(off.slice(0, 40)) + ')');
  assert(on.indexOf('data-share-tm-snapshot') >= 0 && on.indexOf('data-share-tm-link') >= 0,
    'TOS-1b active TM renders both rows (snapshot=' + (on.indexOf('data-share-tm-snapshot') >= 0) +
    ' link=' + (on.indexOf('data-share-tm-link') >= 0) + ')');
  assert(on.indexOf('share-section-label') >= 0 && on.indexOf('share-divider') >= 0,
    'TOS-1b2 section uses the house share-section-label/share-divider structure');
}

/* ── TOS-1c: openShareSheet wires the section + guards the bindings ───────────────────────── */
{
  const sheetFn = slice(shareSrc, 'A.openShareSheet = async function');
  assert(sheetFn.indexOf('tmSnapshotSectionHtml(tmSnapshotActive())') >= 0,
    'TOS-1c1 openShareSheet renders the section via tmSnapshotSectionHtml(tmSnapshotActive())');
  assert(sheetFn.indexOf('if (tmSnapBtn)') >= 0 && sheetFn.indexOf('if (tmLinkBtn)') >= 0,
    'TOS-1c2 handler bindings are null-guarded (rows absent when TM inactive)');
  // Existing rows untouched — additive contract
  ['data-share-ifc', 'data-share-db', 'data-share-ootb', 'data-share-link'].forEach(function(r) {
    assert(sheetFn.indexOf(r) >= 0, 'TOS-1c3 existing row ' + r + ' still present');
  });
}

/* ── TOS-1d: tmSnapshotActive gates on tmGetState().active ────────────────────────────────── */
{
  const fn = slice(shareSrc, 'function tmSnapshotActive(');
  function run(win) {
    const sb = { window: win };
    vm.runInNewContext(fn + '; __out = tmSnapshotActive();', sb);
    return sb.__out;
  }
  assert(run({}) === false, 'TOS-1d1 no tmGetState → inactive (no crash)');
  assert(run({ tmGetState: () => ({ active: false }) }) === false, 'TOS-1d2 tmGetState().active=false → inactive');
  assert(run({ tmGetState: () => ({ active: true }) }) === true, 'TOS-1d3 tmGetState().active=true → active');
}

/* ── TOS-2: buildShareUrl regression — tm= in, tm= out ────────────────────────────────────── */
{
  const fn = slice(shareSrc, 'A.buildShareUrl = function');
  function build(tmState) {
    const logs = [];
    const sb = {
      A: { camera: { position: { x: 1, y: 2, z: 3 } }, controls: { target: { x: 4, y: 5, z: 6 } },
           activeStoreyFilter: null, xrayOn: false, _currentClashes: null, flyActive: false,
           measureActive: false, walkModeActive: false },
      window: { tmGetState: () => tmState },
      location: { origin: 'http://x', pathname: '/v', search: '' },
      document: { getElementById: () => null },
      URLSearchParams: URLSearchParams,
      console: { log: (s) => logs.push(s) },
    };
    vm.runInNewContext(fn + '; __url = A.buildShareUrl();', sb);
    return { url: sb.__url, logs };
  }
  const on = build({ active: true, cursor: 86400000 });
  assert(on.url.indexOf('tm=86400000') >= 0, 'TOS-2a TM active → tm=86400000 in URL: ' + on.url);
  assert(on.url.indexOf('cam=1.0,2.0,3.0') >= 0, 'TOS-2a2 camera still captured alongside tm');
  const off = build({ active: false, cursor: 86400000 });
  assert(off.url.indexOf('tm=') === -1, 'TOS-2b TM inactive → no tm= param: ' + off.url);
}

/* ── TOS-3: caption actually drawn onto the composed canvas, inside the bar region ────────── */
{
  const capFn = slice(shareSrc, 'A._tmSnapshotCaption = function');
  const compFn = slice(shareSrc, 'A._tmComposeSnapshot = function');
  const seq = [];            // ordered event log
  const rects = [], texts = [];
  const W = 1280, H = 720;   // s=1 → barH=48, bar spans y∈[672,720]
  const mockCtx = {
    font: '', fillStyle: '',
    measureText: (t) => ({ width: String(t).length * 7 }),
    fillRect: (x, y, w, h) => { seq.push('fillRect'); rects.push({ x, y, w, h }); },
    fillText: (t, x, y) => { seq.push('fillText'); texts.push({ t: String(t), x, y }); },
    drawImage: (img) => { seq.push(img === srcCanvas ? 'drawImage:src' : 'drawImage:other'); },
  };
  const srcCanvas = { width: W, height: H };
  const madeCanvas = { width: 0, height: 0, getContext: () => mockCtx };
  const tmText = { 'tm-big-counter': 'DAY 64 | HR 0', 'tm-label': 'Foundation — footings', 'tm-status': '32 of 214 built' };
  const logs = [];
  const sb = {
    A: { canvas: srcCanvas, activeBuilding: 'Duplex_A',
         renderer: { render: () => seq.push('render') }, scene: {}, camera: {} },
    document: {
      getElementById: (id) => (id in tmText ? { textContent: tmText[id] } : null),
      createElement: (tag) => (tag === 'canvas' ? madeCanvas : null),
    },
    Math: Math,
    console: { log: (s) => logs.push(s) },
  };
  vm.runInNewContext(capFn + ';\n' + compFn + ';\n__out = A._tmComposeSnapshot();', sb);

  assert(sb.__out === madeCanvas && madeCanvas.width === W && madeCanvas.height === H,
    'TOS-3a composed canvas is a NEW canvas at source size ' + madeCanvas.width + 'x' + madeCanvas.height);
  assert(seq.indexOf('render') >= 0 && seq.indexOf('render') < seq.indexOf('drawImage:src'),
    'TOS-3b fresh renderer.render BEFORE reading the WebGL canvas (seq=' + seq.slice(0, 3).join(',') + ')');
  const bar = rects.find((r) => r.x === 0 && r.w === W && r.y === H - 48 && r.h === 48);
  assert(!!bar, 'TOS-3c full-width caption bar fillRect at bottom edge (rects=' + JSON.stringify(rects) + ')');
  const inBar = (e) => e.y > H - 48 && e.y <= H;
  const counter = texts.find((e) => e.t === 'DAY 64 | HR 0');
  const label = texts.find((e) => e.t === 'Foundation — footings');
  const status = texts.find((e) => e.t === '32 of 214 built');
  assert(counter && inBar(counter), 'TOS-3d tm-big-counter text drawn INSIDE the bar (y=' + (counter && counter.y) + ')');
  assert(label && inBar(label), 'TOS-3e tm-label text drawn INSIDE the bar (y=' + (label && label.y) + ')');
  assert(status && inBar(status) && status.x > W / 2, 'TOS-3f tm-status drawn right-aligned in the bar (x=' + (status && status.x) + ')');
  const bld = texts.find((e) => e.t === 'Duplex_A');
  assert(bld && inBar(bld), 'TOS-3g building name drawn in the bar');
  assert(logs.some((l) => l.indexOf('§TM_SNAPSHOT_COMPOSE') === 0), 'TOS-3h §TM_SNAPSHOT_COMPOSE logged: ' + logs[0]);
}

/* ── TOS-4a/b: Copy Image — clipboard primary, local-save fallback ────────────────────────── */
async function runCopyImage(withClipboardItem) {
  const fn = slice(shareSrc, 'A.tmCopySnapshotImage = async function');
  const logs = [], writes = [], clicks = [];
  function CI(o) { this.parts = o; }
  const anchor = { href: '', download: '', click: () => clicks.push(1) };
  const sb = {
    A: { activeBuilding: 'Duplex A',
         _tmComposeSnapshot: () => ({ width: 1280, height: 720, toBlob: (cb) => cb({ size: 4321 }) }) },
    navigator: { clipboard: { write: async (items) => { writes.push(items); } } },
    window: withClipboardItem ? { ClipboardItem: CI } : {},
    document: { createElement: () => anchor, body: { appendChild: () => {}, removeChild: () => {} } },
    URL: { createObjectURL: () => 'blob:tm', revokeObjectURL: () => {} },
    setTimeout: () => {},
    Error: Error, Object: Object, Promise: Promise,
    console: { log: (s) => logs.push(s) },
  };
  vm.runInNewContext(fn + ';\n__p = A.tmCopySnapshotImage(null);', sb);
  const ok = await sb.__p;
  return { ok, logs, writes, clicks, anchor, CI };
}
(async function() {
  const a = await runCopyImage(true);
  assert(a.ok === true && a.writes.length === 1 && a.writes[0].length === 1 &&
    a.writes[0][0] instanceof a.CI && 'image/png' in a.writes[0][0].parts,
    'TOS-4a ONE ClipboardItem written carrying image/png');
  assert(a.logs.some((l) => l.indexOf('§TM_SNAPSHOT_COPY kind=image method=clipboard') === 0),
    'TOS-4a2 §TM_SNAPSHOT_COPY kind=image method=clipboard logged: ' + a.logs.filter((l) => l.indexOf('§TM_SNAPSHOT_COPY') === 0));
  const b = await runCopyImage(false);
  assert(b.ok === true && b.clicks.length === 1 && /\.png$/.test(b.anchor.download),
    'TOS-4b no ClipboardItem → local .png save clicked (download=' + b.anchor.download + ')');
  assert(b.logs.some((l) => l.indexOf('§TM_SNAPSHOT_COPY kind=image method=download') === 0),
    'TOS-4b2 fallback logged method=download: ' + b.logs.filter((l) => l.indexOf('§TM_SNAPSHOT_COPY') === 0));

  /* ── TOS-4c: Copy Link — buildShareUrl through the existing shareUrl pattern ─────────────── */
  {
    const fn = slice(shareSrc, 'A.tmCopySnapshotLink = function');
    const logs = [], shared = [];
    const sb = {
      A: { activeBuilding: 'Duplex A',
           buildShareUrl: () => 'http://x/v#cam=1.0,2.0,3.0&tm=86400000',
           shareUrl: (url, title) => shared.push({ url, title }) },
      console: { log: (s) => logs.push(s) },
    };
    vm.runInNewContext(fn + ';\nA.tmCopySnapshotLink(null);', sb);
    assert(shared.length === 1 && shared[0].url.indexOf('tm=86400000') >= 0,
      'TOS-4c link routed through A.shareUrl with tm= intact: ' + (shared[0] && shared[0].url));
    assert(logs.some((l) => l.indexOf('§TM_SNAPSHOT_COPY kind=link') === 0 && l.indexOf('has_tm=true') > 0),
      'TOS-4c2 §TM_SNAPSHOT_COPY kind=link has_tm=true logged: ' + logs);
  }

  /* ── TOS-1e: quickShare desktop card offers Copy Image only while TM active ──────────────── */
  {
    const prevFn = slice(shareSrc, 'function showSharePreview(');
    const gateIdx = prevFn.indexOf('if (tmSnapshotActive())');
    const btnIdx = prevFn.indexOf('tmImgBtn');
    assert(gateIdx >= 0 && btnIdx > gateIdx,
      'TOS-1e showSharePreview adds the Copy Image button INSIDE the tmSnapshotActive() gate');
  }

  console.log('\n§TM_SNAPSHOT witness: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail > 0 ? 1 : 0);
})();
