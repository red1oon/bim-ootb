// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — help_dym.js: the ONE "Did you mean" line of the help boxes (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.5 Step 5; design prompts/HELP_QUERY_CORE_DESIGN.md D5).
// READ THE LOG of W-HQ-DYM (common/help/tests/logs/witness_hq_dym.log) after every change; an exit code is not evidence.
// The ERP box (erp/help_search.js) and the shared help panel (common/help/help_panel.js: Viewer + Modeller) both call THIS file; there is no copy per app.
// It SUGGESTS, never acts: a pick puts a name in the box and the person's own search runs (the host's callback); nothing opens, nothing writes (design D5 option c is forbidden).
// The edit distance is NOT here: the one suggester is AssistCore.nearest(name, names, n) (common/door/assist_core.js, the CLI session's file, never edited from here).
//   names(records, opts)                -> distinct names of the records' n (+ a[] when opts.alt), only records opts.allowed(gate, rec) admits (the role gate, ERP)
//   suggest(typed, names, topTier)      -> [] when the top result is tier 0 (an exact name answered) or the typed text is empty; else up to 3 names, names of GUARD_MIN_CHARS-1 or fewer characters dropped first
//   render(host, items, label, onPick)  -> the one separate line "label: A · B · C" under the list (host = the element it lives in; removed when there is nothing to say); onPick(name)
// Falsifier: HQ_BREAK=nodym (read the way help_query.js reads it) -> suggest() returns nothing -> W-HQ-DYM D1 FAILs.
(function (root) {
  'use strict';
  function brk() { return (typeof process !== 'undefined' && process.env && process.env.HQ_BREAK) || (root && root.__HQ_BREAK) || ''; }
  // GUARD (§19.5): assist_core.js:29 still has `lim = Math.max(2, Math.floor(name.length / 3))` (CLI_ERP_IVR §42 S3 not landed), so a name of 2 or fewer characters is within the limit of
  // almost any typed text and would be suggested for everything. Names shorter than this are dropped from the pool until S3 lands. REMOVE THIS CONSTANT (set it to 1 / delete the filter) in the one-line follow-up
  // that follows S3's merge. Names are counted in characters (code points), so a 2-character Chinese name counts as 2, not 6.
  var GUARD_MIN_CHARS = 3;
  var N = 3;   // design D5: the suggester's own default (`n = n || 3`)
  function chars(s) { return Array.from(String(s)).length; }
  function assist() { return (typeof module !== 'undefined' && module.exports && typeof require === 'function') ? require('../door/assist_core.js') : (root && root.AssistCore); }
  function names(records, opts) {
    opts = opts || {}; var seen = {}, out = [];
    (records || []).forEach(function (r) {
      if (opts.allowed && r.gate !== undefined && !opts.allowed(r.gate, r)) return;
      [r.n].concat(opts.alt ? (r.a || []) : []).forEach(function (x) { if (x == null) return; x = String(x).replace(/\s+/g, ' ').trim(); if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    });
    return out;
  }
  function suggest(typed, pool, topTier) {
    typed = String(typed == null ? '' : typed).replace(/\s+/g, ' ').trim();
    if (!typed || topTier === 0 || brk() === 'nodym') return [];
    var AC = assist(); if (!AC || typeof AC.nearest !== 'function') return [];
    var kept = (pool || []).filter(function (nm) { return chars(nm) >= GUARD_MIN_CHARS; });
    return AC.nearest(typed, kept, N).map(function (x) { return x.name; });
  }
  function render(host, items, label, onPick) {
    if (!host) return null;
    var el = host.querySelector ? host.querySelector('.hq-dym') : null;
    if (!items || !items.length) { if (el) el.remove(); return null; }
    if (!el) { el = host.ownerDocument.createElement('div'); el.className = 'hq-dym'; host.appendChild(el); }
    el.textContent = '';
    var lab = el.ownerDocument.createElement('span'); lab.className = 'hq-dym-label'; lab.textContent = label; el.appendChild(lab);   // the label alone in its own node: the Modeller translates a WHOLE text node that equals a dictionary msgtext
    el.appendChild(el.ownerDocument.createTextNode(': '));
    items.forEach(function (nm, i) {
      if (i) el.appendChild(el.ownerDocument.createTextNode(' · '));
      var a = el.ownerDocument.createElement('a'); a.href = '#'; a.className = 'hq-dym-item'; a.textContent = nm; a.setAttribute('data-dym', nm);
      a.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); if (onPick) onPick(nm); });   // fills the box and searches (the host's callback); nothing else
      el.appendChild(a);
    });
    return el;
  }
  var api = { names: names, suggest: suggest, render: render, GUARD_MIN_CHARS: GUARD_MIN_CHARS, N: N };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else if (root) root.HelpDym = api;
})(typeof window !== 'undefined' ? window : globalThis);
