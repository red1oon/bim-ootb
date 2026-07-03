/**
 * BIM OOTB — Walked-Fixtures Outliner category (per-instance rows for disc-walker InstancedMesh buckets).
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// dw_instances_outliner.js — Implementing prompts/SPEC_INSTANCE_HIDE.md §I5d — Witness: W-E2E-INSTHIDE.
// (FABLE5_WRAPUP_2026-07-03 Item 5: the per-instance leg §POLISH3 §V1 deferred per §DECISIONS-2.)
//
// A REGISTERED Outliner category (the outliner's designed extension seam, Bonsai.outliner.addCategory) that
// folds window.__dwWalks — the disc-walker's live placement arrays, the SAME record objects every
// InstancedMesh bucket's userData.dwSub references (§Q2 identity) — into per-instance rows:
//
//   Walked Fixtures
//     ELEC · generated            (disc group — eye hides the whole walk, via child recursion)
//       LightFixture (230)        (class group)
//         LightFixture #17 …      (LEAF, id 'dwp|ELEC|17' → n.dwp={disc,idx}; eye hides THIS instance)
//
// The leaves render THROUGH bonsai_outliner's existing §V4 windowed path (OL_CHUNK=250 per sibling list +
// "… show N more") — only the open window's rows materialise eye elements; nothing here renders all rows.
// idx = index into window.__dwWalks[disc] (stable across redraws — a redraw re-renders the same records).
// NON-INVENT: rows are folded 1:1 from the walker's own records (ifc_class/storey/gate flags), nothing added.
// hideWhenEmpty: no walk ⇒ the category contributes no header (no dead chrome before the first walk).
(function () {
  'use strict';
  var TAG = '§DWINST';
  if (typeof window === 'undefined') return;

  // ONE disc group folder: class groups → leaves. asm=false folds a __dwWalks placement list
  // (id dwp|disc|idx), asm=true a __dwAssembly part list (id dwa|disc|idx — §I5b-ASM: pure-instanced
  // buckets, no authored twin; the leaf's eye hides the exact instanceId the same way).
  function discGroup(disc, list, asm) {
    var byCls = {}, order = [];
    list.forEach(function (p, idx) {
      var cls = (p && p.ifc_class) || (p && p.piece_type) || 'Unknown';
      if (!byCls[cls]) { byCls[cls] = []; order.push(cls); }
      byCls[cls].push({ p: p, idx: idx });
    });
    var pre = asm ? 'dwa|' : 'dwp|';
    var kids = order.map(function (cls) {
      var short = String(cls).replace(/^Ifc/, '');
      return {
        id: (asm ? 'dwac|' : 'dwc|') + disc + '|' + cls, label: short, kind: 'class',
        children: byCls[cls].map(function (e) {
          // gate flags surfaced 1:1 (⛔ clash / ⚠ gated) — same semantics as the 3-material render split
          return { id: pre + disc + '|' + e.idx, kind: 'element',
            dwp: { disc: disc, idx: e.idx, asm: asm },
            label: short + ' #' + e.idx + (e.p.clash ? ' ⛔' : (e.p.gated ? ' ⚠' : '')),
            sub: e.p.storey || (asm && e.p.guid ? String(e.p.guid).slice(0, 10) : '') };
        })
      };
    });
    return { id: (asm ? 'dwga|' : 'dwg|') + disc, label: disc + (asm ? ' · assembly' : ' · generated'),
      kind: 'disc-group', children: kids };
  }

  function tree() {
    var roots = [];
    var W = window.__dwWalks || {};
    Object.keys(W).forEach(function (disc) {
      if (W[disc] && W[disc].length) roots.push(discGroup(disc, W[disc], false));
    });
    var A = window.__dwAssembly || {};
    Object.keys(A).forEach(function (disc) {
      if (A[disc] && A[disc].length) roots.push(discGroup(disc, A[disc], true));
    });
    return roots;
  }

  window.DWInstancesOutliner = {
    register: function () {
      if (window.Bonsai && window.Bonsai.outliner)
        window.Bonsai.outliner.addCategory({ key: 'dwinst', label: 'Walked Fixtures', tree: tree, hideWhenEmpty: true });
      console.log(TAG + ' registered — per-instance rows for walked InstancedMesh buckets (eye = §I5 instance hide)');
    },
    _tree: tree
  };
})();
