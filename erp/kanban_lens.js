// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// kanban_lens.js — LENS-FAMILY lane-3 (F2): the KANBAN CHROME.
//
//   Implementing prompts/LENS_FAMILY.md §F2 — Witness: §KANBAN-CHROME-FOLD / -DRAG / -LEGALITY
//   (the engine fold is PROVEN: build/erp/poc_kanban.log §KANBAN-FOLD/SEND-EQ-DRAG/KANBAN-LEGALITY;
//    scripts/poc_kanban.js is the proven node POC — this chrome REUSES its fold + op construction,
//    it does NOT fork the engine).
//
// THE THESIS (lens = a cheap, swappable FOLD; the model is the asset):
//   A Kanban board is a FOLD over doc_status. Columns = the kernel's wfmc states (NOT hand-authored);
//   cards = REAL documents grouped by their docstatus; drop-zones = the LEGAL wfmc edges out of a
//   column. A card DRAG resolves target-column → action → dispatch(SET_STATUS …) — the SAME verb a
//   chat SEND emits (SEND == DRAG == VERB). The lens contributes NOTHING to the engine: it tags by
//   AD key, it does not own state, legality, identity, or the write path. Illegal drags are refused
//   at the board (no wfmc edge ⇒ snap-back) AND by the engine state-machine — the same guard both
//   lenses funnel through (ENGINE_CONTRACT.md §1 dispatch = the only write path).
//
// FACTORED into:
//   (a) buildBoard(folds, wfmc[, opts])  — PURE, node-requireable view-model builder (no DOM, no db).
//       Input = a status-grouped fold of real docs (the §read result) + the wfmc state-machine.
//       Output = { columns[], cards[], dropZones{}, sparse }. Every value is a fold; absent → honest.
//   (b) resolveDrag(board, cardKey, toCol, wfmc) — PURE: a column drag → {legal, action, from, to}.
//       Mirrors scripts/poc_kanban.js `actionToColumn` (a drag to column `to` is the action whose
//       transition lands there). null action ⇒ no edge ⇒ snap-back (engine still re-guards on dispatch).
//   (c) mount(opts) — a THIN DOM chrome (board columns + draggable cards + drop-zones) that, on drop,
//       calls resolveDrag then opts.dispatch(intent, ctx) — the ENGINE_CONTRACT.md §1 write path.
//       The chrome NEVER writes state itself; an illegal drop snaps the card back, untouched.
//
// NON-INVENT / KEY BY AD ids: a card is keyed by {table, id} (the AD record key). doc_status / actions
// come from wfmc (manifest.json). No exposed-globals invented here — send/dispatch + nav are TODO(STEP-0)
// stubs until the host lane pins them (prompts/UI_OVERLAY_GOVERNANCE.md §Lane separation, STEP 0).
//
// Run the witness:  node tests/poc_kanban_chrome.js 2>&1 | tee tests/poc_kanban_chrome.log   (cwd=bim-ootb/erp)

(function () {
  'use strict';

  // ── "Odoo-marvel" card optics (KANBAN_MARVEL_SPEC) — ALL deterministic, NON-INVENT ──────────────
  // Colour scheme = lifecycle status. The card's left rail + status chip read at a glance; a legal
  // drag re-colours the card to its destination state. Unknown status → neutral (never faked).
  var STATUS_COLORS = { DR: '#f5a623', IP: '#4a90e2', IN: '#4a90e2', CO: '#27c08a',
                        CL: '#8a94a6', VO: '#aab2bd', RE: '#e5604d' };
  function statusColor(s) { return STATUS_COLORS[s] || '#6c7a89'; }
  // deterministic colour from a table name (each absorbed model gets its own stable brand chip) — no Math.random
  function tableColor(t) {
    var h = 0, i; for (i = 0; i < (t || '').length; i++) { h = (h * 31 + t.charCodeAt(i)) >>> 0; }
    return 'hsl(' + (h % 360) + ',42%,46%)';
  }
  // 2-char monogram from a doc table: drop the AD prefix (C_Order→Order→OR), else first 2 alnum.
  function monogram(t) {
    var base = String(t || '').replace(/^[A-Za-z]+_/, '') || String(t || '');
    var alnum = base.replace(/[^A-Za-z0-9]/g, '');
    return (alnum.slice(0, 2) || '··').toUpperCase();
  }

  // ── (a) PURE view-model builder ──────────────────────────────────────────────
  // folds: [{ table, doc_status, count, ids? }]  — the status-grouped fold of REAL docs.
  //        (a row per (table,doc_status); `ids` optional = the actual record keys for that cell.)
  // wfmc:  the kernel state machine { states[], statusNames{}, actions{}, transitions[[from,act,to]] }.
  // opts:  { showEmptyStates:false } — by default render ONLY columns that have real cards (the seed
  //        is sparse: all-CO/CL; we render what is real and FLAG sparseness, never invent a column).
  // Returns { columns:[{status,label,count}], cards:[{key,table,id,status,label}],
  //           dropZones:{ fromStatus: [{ toStatus, action, label }] }, sparse:bool, source }.
  function buildBoard(folds, wfmc, opts) {
    opts = opts || {};
    folds = folds || [];
    var states = (wfmc && wfmc.states) || [];
    var statusNames = (wfmc && wfmc.statusNames) || {};

    // group the fold by doc_status → { status: { table: count, _ids: [{table,id}] } }
    var byStatus = {};
    folds.forEach(function (f) {
      var s = f.doc_status;
      if (s == null) return;
      var bucket = byStatus[s] || (byStatus[s] = { _total: 0, _ids: [] });
      bucket[f.table] = (bucket[f.table] || 0) + Number(f.count || 0);
      bucket._total += Number(f.count || 0);
      // expand explicit ids if supplied; else synthesise positional keys so the card is still real-keyed.
      var ids = f.ids || [];
      for (var i = 0; i < ids.length; i++) bucket._ids.push({ table: f.table, id: ids[i] });
    });

    // columns = wfmc states, in the state-machine's canonical order. Only states with real cards
    // unless showEmptyStates — every column is therefore a FOLD over (real docstatus ∩ wfmc), not authored.
    var orderedStates = states.filter(function (s) {
      return opts.showEmptyStates ? true : !!byStatus[s];
    });
    var columns = orderedStates.map(function (s) {
      return { status: s, label: statusNames[s] || s, count: byStatus[s] ? byStatus[s]._total : 0 };
    });

    // cards = real docs grouped by docstatus. Key by AD record key {table,id}; when explicit ids are
    // absent (count-only fold) we still emit `count` placeholder cards keyed positionally + flagged.
    var cards = [];
    orderedStates.forEach(function (s) {
      var bucket = byStatus[s]; if (!bucket) return;
      if (bucket._ids.length) {
        bucket._ids.forEach(function (rk) {
          cards.push({ key: rk.table + '#' + rk.id, table: rk.table, id: rk.id, status: s,
                       label: statusNames[s] || s, real: true });
        });
      } else {
        // count-only fold (the §KANBAN-FOLD shape from poc_kanban: COUNT(*) GROUP BY docstatus).
        Object.keys(bucket).forEach(function (t) {
          if (t === '_total' || t === '_ids') return;
          for (var i = 0; i < bucket[t]; i++) {
            cards.push({ key: t + '#?' + (i + 1), table: t, id: null, status: s,
                         label: statusNames[s] || s, real: true, idResolved: false });
          }
        });
      }
    });

    // drop-zones = the LEGAL wfmc edges out of each column (a card in column F may be dropped into
    // column T iff some action a has [F,a,T]). This is the board's own legality mirror of the engine.
    var dropZones = {};
    orderedStates.forEach(function (from) {
      dropZones[from] = (wfmc.transitions || [])
        .filter(function (tr) { return tr[0] === from; })
        .map(function (tr) {
          return { toStatus: tr[2], action: tr[1],
                   label: (wfmc.actions && wfmc.actions[tr[1]]) || tr[1] };
        });
    });

    var totalCards = cards.length;
    var sparse = columns.length <= 2;   // honest sparseness flag (seed is all-CO/CL).
    return {
      columns: columns, cards: cards, dropZones: dropZones,
      totalCards: totalCards, sparse: sparse, source: 'doc_status', handAuthored: 0
    };
  }

  // ── (b) PURE drag resolver — column drag → action (mirrors poc_kanban.js actionToColumn) ─────────
  // A drag of a card from its current column `from` to column `to` is the ACTION whose wfmc transition
  // [from, action, to] exists. null ⇒ no edge ⇒ illegal at the board (snap back). The engine state
  // machine re-checks on dispatch — the board's refusal is a fast mirror, NOT the authority.
  function resolveDrag(board, cardKey, toStatus, wfmc) {
    var card = (board.cards || []).filter(function (c) { return c.key === cardKey; })[0];
    if (!card) return { legal: false, reason: 'no-card', from: null, to: toStatus, action: null };
    var from = card.status;
    if (from === toStatus) return { legal: false, reason: 'same-column', from: from, to: toStatus, action: null };
    var hit = (wfmc.transitions || []).filter(function (tr) {
      return tr[0] === from && tr[2] === toStatus;
    });
    var action = hit.length ? hit[0][1] : null;
    return {
      legal: !!action,
      reason: action ? 'ok' : 'no-edge',
      from: from, to: toStatus, action: action,
      table: card.table, id: card.id, key: card.key
    };
  }

  // ── intent builder — the ENGINE_CONTRACT.md §1 dispatch payload a drag emits ─────────────────────
  // This is BYTE-IDENTICAL to the intent a chat SEND builds for the same record+action: the lens only
  // fills {docType, action, status, table, id, uuid}; the engine owns verb, identity-stamp, write.
  // (poc_kanban.js proves SEND==DRAG==VERB: same op + same op_hash + same committed row.)
  function dragIntent(res) {
    if (!res.legal) return null;
    var uuid = 'DOC:' + res.table + '#' + res.id;
    return { docType: res.table, table: res.table, id: res.id, uuid: uuid,
             status: res.from, action: res.action };
  }

  // ── (c) THIN DOM mount — board + draggable cards + drop-zones ─────────────────────────────────────
  // opts = {
  //   root,            // a DOM element to mount into
  //   board,           // the buildBoard(...) view-model
  //   wfmc,            // the state machine (for resolveDrag on drop)
  //   dispatch,        // ENGINE_CONTRACT §1 dispatch(intent, ctx) — the ONLY write path. // TODO(STEP-0)
  //   ctx,             // engine ctx {actor,pubKey,roleId,allowOrgs} — host-supplied.       // TODO(STEP-0)
  //   onResult         // optional (res, dispatchResult) callback for the host
  // }
  // The chrome NEVER mutates the board model or the db; on a legal drop it calls dispatch and lets the
  // engine return {ok|rejected}; on an illegal drop (or engine reject) the card SNAPS BACK to its column.
  function mount(opts) {
    if (typeof document === 'undefined') { console.log('§KANBAN-CHROME mount skipped (no DOM)'); return null; }
    opts = opts || {};
    var root = opts.root, board = opts.board, wfmc = opts.wfmc;
    if (!root || !board) { console.log('§KANBAN-CHROME mount missing root/board'); return null; }

    root.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'kanban-board';
    wrap.style.cssText = 'display:flex;gap:12px;align-items:flex-start;overflow-x:auto;padding:8px;';

    if (board.sparse) {
      var note = document.createElement('div');
      note.className = 'kanban-sparse-note';
      note.style.cssText = 'width:100%;color:#caa;font-size:12px;padding:4px 8px;';
      note.textContent = 'Sparse board: only ' + board.columns.length +
        ' doc_status column(s) present in this dataset (folded, not authored).';
      root.appendChild(note);
    }

    var colEls = {};   // status -> { body, cardEls:{key:el} }
    var _recolorOnMove = null;   // set by the card loop → _moveCardDom recolours a card to its new status
    board.columns.forEach(function (col) {
      var colEl = document.createElement('div');
      colEl.className = 'kanban-col';
      colEl.dataset.status = col.status;
      colEl.style.cssText = 'min-width:200px;background:rgba(40,44,58,0.6);border-radius:8px;padding:8px;';
      var head = document.createElement('div');
      head.className = 'kanban-col-head';
      head.style.cssText = 'font-weight:600;color:#cdd6e4;margin-bottom:8px;font-size:13px;';
      head.textContent = col.label + ' (' + col.status + ') · ' + col.count;
      colEl.appendChild(head);
      var body = document.createElement('div');
      body.className = 'kanban-col-body';
      body.dataset.status = col.status;
      body.style.cssText = 'min-height:40px;display:flex;flex-direction:column;gap:6px;';
      colEl.appendChild(body);

      // drop-zone wiring — the column accepts a drop; legality decided by resolveDrag on drop.
      body.addEventListener('dragover', function (e) { e.preventDefault(); });
      body.addEventListener('drop', function (e) {
        e.preventDefault();
        var cardKey = e.dataTransfer.getData('text/plain');
        _onDrop(cardKey, col.status);
      });
      colEls[col.status] = { el: colEl, body: body, cardEls: {} };
      wrap.appendChild(colEl);
    });

    // marvel optics: per-card meta {title,amount,date} (real values, host-supplied via opts.meta) drives
    // the avatar+title+meta layout; status drives the colour. Absent meta → the plain id chip (fallback).
    var meta = opts.meta || {};
    var _avatars = 0, _statusColors = 0, _enriched = 0;
    function _applyStatusColor(cardEl, status) {              // left rail + chip recolour (also on drag-move)
      var c = statusColor(status);
      cardEl.style.borderLeft = '3px solid ' + c;
      var chip = cardEl.querySelector('.kanban-chip'); if (chip) { chip.style.background = c; chip.textContent = status; }
    }
    board.cards.forEach(function (card) {
      var m = meta[card.key];
      var cardEl = document.createElement('div');
      cardEl.className = 'kanban-card';
      cardEl.draggable = true;
      cardEl.dataset.key = card.key;
      cardEl.style.cssText = 'background:rgba(108,159,255,0.10);border:1px solid rgba(108,159,255,0.22);' +
        'border-radius:7px;padding:7px 9px;font-size:12px;color:#e8e8ed;cursor:grab;display:flex;gap:8px;align-items:flex-start;';
      if (m) {
        _enriched++;
        // avatar — doctype monogram, deterministic table colour (each absorbed model = its own brand chip)
        var av = document.createElement('div'); av.className = 'kanban-avatar';
        av.style.cssText = 'flex:0 0 auto;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;' +
          'justify-content:center;font-size:10px;font-weight:700;color:#fff;background:' + tableColor(card.table) + ';';
        av.textContent = monogram(card.table); cardEl.appendChild(av); _avatars++;
        var col = document.createElement('div'); col.style.cssText = 'flex:1 1 auto;min-width:0;';
        // title (real DocumentNo/Name/key) + status chip
        var top = document.createElement('div'); top.style.cssText = 'display:flex;justify-content:space-between;gap:6px;align-items:center;';
        var ttl = document.createElement('span'); ttl.style.cssText = 'font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        ttl.textContent = (m.title != null && m.title !== '') ? String(m.title) : (card.table + ' #' + card.id);
        var chip = document.createElement('span'); chip.className = 'kanban-chip';
        chip.style.cssText = 'flex:0 0 auto;font-size:9px;font-weight:700;padding:1px 6px;border-radius:9px;color:#0e141f;';
        top.appendChild(ttl); top.appendChild(chip); col.appendChild(top);
        // meta line — amount + date, ONLY when the real column existed (NON-INVENT)
        var bits = [];
        if (m.amount != null && m.amount !== '') bits.push(String(m.amount));
        if (m.date != null && m.date !== '') bits.push(String(m.date));
        if (bits.length) { var sub = document.createElement('div');
          sub.style.cssText = 'font-size:11px;color:#9aa6b8;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          sub.textContent = bits.join('  ·  '); col.appendChild(sub); }
        cardEl.appendChild(col);
        _applyStatusColor(cardEl, card.status); _statusColors++;
      } else {
        cardEl.textContent = card.table + (card.id != null ? ' #' + card.id : ' (id absent)');
      }
      cardEl.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', card.key);
        e.dataTransfer.effectAllowed = 'move';
      });
      var dst = colEls[card.status];
      if (dst) { dst.body.appendChild(cardEl); dst.cardEls[card.key] = cardEl; }
    });
    if (_enriched) console.log('§KANBAN-CARD-RENDER enriched=' + _enriched + ' avatars=' + _avatars + ' statusColors=' + _statusColors + ' handAuthored=0');
    _recolorOnMove = _applyStatusColor;   // let _moveCardDom recolour the card to its new lifecycle state

    root.appendChild(wrap);

    function _onDrop(cardKey, toStatus) {
      var res = resolveDrag(board, cardKey, toStatus, wfmc);
      console.log('§KANBAN-CHROME drop key=' + cardKey + ' to=' + toStatus +
        ' legal=' + res.legal + ' action=' + (res.action || 'null') + ' reason=' + res.reason);
      if (!res.legal) { _snapBack(cardKey); if (opts.onResult) opts.onResult(res, null); return; }
      var intent = dragIntent(res);
      // ENGINE_CONTRACT.md §1: dispatch is the ONLY write path. The engine re-guards legality + owns
      // identity/signing; the lens just hands the SAME intent a chat SEND would. // TODO(STEP-0): the
      // host lane pins the live `dispatch`/`ctx`; until then opts.dispatch may be absent → snap-back.
      if (typeof opts.dispatch !== 'function') {
        console.log('§KANBAN-CHROME dispatch absent (TODO STEP-0) — card holds, no write');
        _snapBack(cardKey); if (opts.onResult) opts.onResult(res, { pending: true }); return;
      }
      var dr;
      try { dr = opts.dispatch(intent, opts.ctx || {}); } catch (e) { dr = { ok: false, error: e.message }; }
      if (dr && dr.ok) { _moveCardDom(cardKey, res.from, toStatus, res.to); }
      else { _snapBack(cardKey); }   // engine rejected → board obeys (legality is engine-owned)
      console.log('§KANBAN-CHROME dispatched verb=' + intent.action + ' ok=' + (dr && dr.ok));
      if (opts.onResult) opts.onResult(res, dr);
    }

    function _snapBack(cardKey) {
      // card stays where it is — DOM was never moved before dispatch confirmed. No-op by design,
      // logged so the snap-back is witnessed (the board refuses; it does not fake a move).
      console.log('§KANBAN-CHROME snapBack key=' + cardKey);
    }
    function _moveCardDom(cardKey, fromStatus, toStatus) {
      var card = (board.cards || []).filter(function (c) { return c.key === cardKey; })[0];
      var fromCol = colEls[fromStatus], toCol = colEls[toStatus];
      if (!fromCol || !toCol) return;
      var el = fromCol.cardEls[cardKey];
      if (!el) return;
      delete fromCol.cardEls[cardKey];
      toCol.body.appendChild(el);
      toCol.cardEls[cardKey] = el;
      if (card) card.status = toStatus;   // keep the model in step with the confirmed engine write
      if (_recolorOnMove) _recolorOnMove(el, toStatus);   // marvel: card re-colours to its new lifecycle state
    }

    console.log('§KANBAN-CHROME mounted columns=' + board.columns.length + ' cards=' + board.cards.length);
    return { root: root, board: board, _onDrop: _onDrop };
  }

  // ── exports — pure builders are node-requireable; mount is DOM-only ──────────────────────────────
  var KanbanLens = {
    buildBoard: buildBoard,
    resolveDrag: resolveDrag,
    dragIntent: dragIntent,
    mount: mount,
    // shared status colour language — Graph + Kanban use ONE palette for consistent L&F (KANBAN_MARVEL_SPEC)
    statusColor: statusColor, statusColors: STATUS_COLORS, tableColor: tableColor, monogram: monogram
  };
  if (typeof window !== 'undefined') window.KanbanLens = KanbanLens;
  if (typeof module !== 'undefined' && module.exports) module.exports = KanbanLens;

  if (typeof console !== 'undefined') console.log('§KANBAN_LENS_LOADED v1 (F2 kanban chrome)');
})();
