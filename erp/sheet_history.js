// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// sheet_history.js - the spreadsheet's MEMORY: a tamper-evident, replayable, mergeable cell history that lives inside the file.
// Implementing bim-compiler prompts/SHEET_FRONT_DOOR.md §6 (slice S9) - Witness: W-SHEET-HISTORY (erp/tests/witness_sheet_history.js).
// Host-neutral: a host (Excel / WPS / LibreOffice / Google Sheets menu) hands in SNAPSHOTS { "<sheet>": { "B6": { v, f } } } at each
//   recording point (save / close / Stamp); the engine diffs against the last recorded state (§6.2: catches macro, paste and formula
//   changes; edits between two points fold into one step - a stated limit). The host keeps the returned lines in the hidden sheet
//   _door_history.
// ONE entry format with the ERP journal (ws_kernel.js journalOf): { seq, actor, at, meta, ops, opsDigest, prev, hash, payload.ops },
//   hash = sha256(prev + JSON.stringify([seq, actor, meta, opsDigest])), opsDigest = sha256(JSON.stringify(ops)) - so the kernel's
//   own verifyJournal verifies a sheet history (H2). Hashing is async (WebCrypto) so the same file runs in a browser and in node.
// A MERGE is one more entry on the open copy's own chain (§14.1, witness W-HISTORY-PAGE case E1): mergeEntry() - meta.merge names the other copy's head hash (inside
//   the entry hash), payload.theirs carries the other copy's entries after the fork; verify() checks them, cellStory() shows them. The chain stays linear.
// "actor" is the name the host reports; it is not a signed identity until W-SIGN is wired (§6.2, stated not claimed).
(function (global) {
  'use strict';
  var ZERO = '0000000000000000000000000000000000000000000000000000000000000000';
  var META = { kind: 'sheet-history', v: 1 };

  function subtle() {
    var c = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto : (typeof require === 'function' ? require('crypto').webcrypto : null);
    if (!c || !c.subtle) throw new Error('sheet_history: no WebCrypto (crypto.subtle) on this host');
    return c.subtle;
  }
  async function sha256(str) {
    var buf = await subtle().digest('SHA-256', new TextEncoder().encode(str)), b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }

  // ── cells: normalise one cell to { v, f } (f = formula text without '=' or null); an empty cell is null ──
  function norm(c) {
    if (c == null) return null;
    var v = c.v === undefined || c.v === '' ? null : c.v, f = c.f == null || c.f === '' ? null : String(c.f).replace(/^=/, '');
    return v == null && f == null ? null : { v: v, f: f };
  }
  function same(a, b) { return (a == null && b == null) || (a != null && b != null && a.v === b.v && a.f === b.f); }
  function addr(cell) { var m = /^([A-Z]+)(\d+)$/.exec(cell) || ['', 'A', '0']; var c = 0; for (var i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64); return [Number(m[2]), c]; }
  function order(a, b) { if (a.sheet !== b.sheet) return a.sheet < b.sheet ? -1 : 1; var x = addr(a.cell), y = addr(b.cell); return x[0] - y[0] || x[1] - y[1]; }

  // diff(prev, next) -> CELL_SET ops for every cell whose value or formula differs (added, changed, cleared), in sheet/row/col order
  function diff(prev, next) {
    prev = prev || {}; next = next || {};
    var ops = [], sheets = {};
    Object.keys(prev).concat(Object.keys(next)).forEach(function (s) { sheets[s] = 1; });
    Object.keys(sheets).forEach(function (s) {
      var P = prev[s] || {}, N = next[s] || {}, cells = {};
      Object.keys(P).concat(Object.keys(N)).forEach(function (c) { cells[c] = 1; });
      Object.keys(cells).forEach(function (c) {
        var b = norm(P[c]), a = norm(N[c]);
        if (same(b, a)) return;
        var op = { op_type: 'CELL_SET', sheet: s, cell: c, before: b, after: a };
        if (b && b.f != null && a && a.f == null && a.v != null) op.typedOverFormula = true;            // H7: a formula overwritten by a typed value
        ops.push(op);
      });
    });
    return ops.sort(order);
  }

  // record(history, prevSnap, nextSnap, actor, at) -> { verdict: 'RECORDED'|'NO-OP', entry, line }
  //   history = the parsed entries so far (the new one chains on the last); prevSnap = null for the genesis entry.
  async function record(history, prevSnap, nextSnap, actor, at) {
    var ops = diff(prevSnap, nextSnap);
    if (!ops.length) return { verdict: 'NO-OP', entry: null, line: null };
    var e = await seal(history, ops, actor, at, prevSnap ? {} : { genesis: true });
    return { verdict: 'RECORDED', entry: e, line: JSON.stringify(e) };
  }
  // seal(history, ops, actor, at, meta) -> the next entry of the chain: the ONE place an entry is built and hashed
  async function seal(history, ops, actor, at, meta) {
    var last = history.length ? history[history.length - 1] : null, prev = last ? last.hash : ZERO;
    var e = { seq: (last ? last.seq : 0) + 1, actor: String(actor || 'unknown'), at: at || new Date().toISOString(), meta: Object.assign({}, META, meta),
      ops: ops.length, opsDigest: await sha256(JSON.stringify(ops)), prev: prev };
    e.hash = await sha256(prev + JSON.stringify([e.seq, e.actor, e.meta, e.opsDigest]));
    e.payload = { ops: ops };                                                     // as in the ERP journal: not in the chain, its digest is
    return e;
  }

  // verify(lines) -> { ok, entries, brokenAt, why } - chain (prev + hash) AND every payload against its opsDigest
  //   a merge entry also carries the other copy's entries: the shared start + those entries must verify and end at the head hash the entry names
  async function verify(lines) {
    var prev = ZERO, seen = [];
    for (var i = 0; i < lines.length; i++) {
      var e; try { e = typeof lines[i] === 'string' ? JSON.parse(lines[i]) : lines[i]; } catch (x) { return { ok: false, entries: i, brokenAt: i + 1, why: 'unparseable' }; }
      if (e.prev !== prev) return { ok: false, entries: i, brokenAt: i + 1, why: 'prev-hash (an entry was removed, reordered or inserted)' };
      if (e.hash !== await sha256(prev + JSON.stringify([e.seq, e.actor, e.meta, e.opsDigest]))) return { ok: false, entries: i, brokenAt: i + 1, why: 'content (seq/actor/meta/digest edited)' };
      if (!e.payload || await sha256(JSON.stringify(e.payload.ops)) !== e.opsDigest) return { ok: false, entries: i, brokenAt: i + 1, why: 'payload (a recorded cell value was edited)' };
      if (e.meta && e.meta.merge) { var bad = await carried(seen, e); if (bad) return { ok: false, entries: i, brokenAt: i + 1, why: bad }; }
      seen.push(e); prev = e.hash;
    }
    return { ok: true, entries: lines.length, brokenAt: null, why: null };
  }

  async function carried(before, e) {
    var m = e.meta.merge, th = e.payload.theirs;
    if (!Array.isArray(th) || !th.length || !(m.fork >= 1) || m.fork > before.length) return 'merge (the entries carried from the other copy are missing)';
    var ok = true; /*MUT-CARRIED*/ ok = (await verify(before.slice(0, m.fork).concat(th))).ok && th[th.length - 1].hash === m.other;
    return ok ? null : 'merge (an entry carried from the other copy was edited)';
  }

  function apply(snap, ops) {
    ops.forEach(function (o) { var s = snap[o.sheet] = snap[o.sheet] || {}; if (o.after == null) delete s[o.cell]; else s[o.cell] = { v: o.after.v, f: o.after.f }; });
    return snap;
  }
  // asOf(history, n) -> the sheet exactly as recorded after entry n (1 = genesis)
  function asOf(history, n) {
    var snap = {};
    for (var i = 0; i < n && i < history.length; i++) apply(snap, history[i].payload.ops);
    return snap;
  }
  // cellStory(history, sheet, cell) -> every value the cell had, in order, with who and when
  function cellStory(history, sheet, cell) {
    var out = [];
    history.forEach(function (e) {
      if (e.meta && e.meta.merge) cellStory(e.payload.theirs || [], sheet, cell).forEach(function (s) { s.mergedAt = s.mergedAt || e.seq; out.push(s); });   // the other copy's own lines, then the merge entry's
      e.payload.ops.forEach(function (o) { if (o.sheet === sheet && o.cell === cell) out.push({ seq: e.seq, actor: e.actor, at: e.at, before: o.before, after: o.after, typedOverFormula: !!o.typedOverFormula }); });
    });
    return out;
  }

  // merge(a, b) - two copies of one history (they share a prefix of entries, then diverged).
  //   -> { ok, fork, merged (snapshot), applied: [{sheet, cell, from}], conflicts: [{sheet, cell, base, a, b}] }
  //   A cell changed on one side only takes that side's value; the same final value on both sides is not a conflict; different
  //   final values are a CONFLICT showing both, and the merged snapshot keeps the BASE value there (neither side overwrites).
  function merge(a, b) {
    var k = 0; while (k < a.length && k < b.length && a[k].hash === b[k].hash) k++;
    if (k === 0) return { ok: false, fork: 0, why: 'the two copies share no history (not copies of one sheet)' };
    var base = asOf(a, k), finalA = asOf(a, a.length), finalB = asOf(b, b.length);
    var dA = diff(base, finalA), dB = diff(base, finalB), byKey = {};
    dA.forEach(function (o) { byKey[o.sheet + '!' + o.cell] = { a: o }; });
    dB.forEach(function (o) { var x = byKey[o.sheet + '!' + o.cell] = byKey[o.sheet + '!' + o.cell] || {}; x.b = o; });
    var merged = asOf(a, k), applied = [], conflicts = [];
    Object.keys(byKey).forEach(function (key) {
      var x = byKey[key], o = x.a || x.b;
      if (x.a && x.b && !same(x.a.after, x.b.after)) { conflicts.push({ sheet: o.sheet, cell: o.cell, base: o.before, a: x.a.after, b: x.b.after }); return; }
      apply(merged, [o]); applied.push({ sheet: o.sheet, cell: o.cell, from: x.a && x.b ? 'both' : x.a ? 'a' : 'b' });
    });
    applied.sort(order); conflicts.sort(order);
    return { ok: true, fork: k, merged: merged, applied: applied, conflicts: conflicts };
  }

  // mergeEntry(a, b, picks, actor, at) - the merge of copy b INTO copy a, as ONE entry on a's chain (§14.1).
  //   picks = { "<sheet>!<cell>": 'a' | 'b' | 'base' }, one per conflict of merge(a, b); a conflict without a pick -> REFUSED, nothing made.
  //   -> { verdict: 'RECORDED'|'NO-OP'|'REFUSED', why, unresolved, entry, line, snapshot, merge }
  //   entry.payload.ops = what changes in a (b's edits + the picks); entry.meta.merge = { fork, other (b's head hash), otherEntries, picks };
  //   entry.payload.theirs = b's entries after the fork. A copy with nothing new, or one already merged, is a NO-OP.
  async function mergeEntry(a, b, picks, actor, at) {
    var m = merge(a, b); picks = picks || {};
    if (!m.ok) return { verdict: 'REFUSED', why: m.why, merge: m };
    var head = b[b.length - 1].hash;
    if (b.length === m.fork) return { verdict: 'NO-OP', why: 'the other copy holds no entry this one lacks', merge: m };
    if (a.some(function (e) { return e.meta && e.meta.merge && e.meta.merge.other === head; })) return { verdict: 'NO-OP', why: 'that copy was already merged into this one', merge: m };
    var unresolved = m.conflicts.filter(function (c) { return ['a', 'b', 'base'].indexOf(picks[c.sheet + '!' + c.cell]) < 0; });
    if (unresolved.length) return { verdict: 'REFUSED', why: unresolved.length + ' conflict(s) have no pick', unresolved: unresolved, merge: m };
    var final = m.merged, taken = [];
    m.conflicts.forEach(function (c) {
      var p = picks[c.sheet + '!' + c.cell]; /*MUT-PICK*/
      apply(final, [{ sheet: c.sheet, cell: c.cell, after: p === 'base' ? c.base : c[p] }]); taken.push({ sheet: c.sheet, cell: c.cell, pick: p });
    });
    var ops = diff(asOf(a, a.length), final);
    var e = await seal(a, ops, actor, at, { merge: { fork: m.fork, other: head, otherEntries: b.length - m.fork, picks: taken } });
    e.payload.theirs = b.slice(m.fork);
    return { verdict: 'RECORDED', entry: e, line: JSON.stringify(e), snapshot: final, merge: m };
  }

  var api = { record: record, verify: verify, diff: diff, asOf: asOf, cellStory: cellStory, merge: merge, mergeEntry: mergeEntry, sha256: sha256 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.SheetHistory = api;
})(typeof window !== 'undefined' ? window : this);
