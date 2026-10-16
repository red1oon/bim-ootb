/**
 * BIM OOTB — Ask sentence grammar: typed/spoken words → confirmable sentences from fixed templates.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * // Implementing prompts/FIND_ASK_ANSWERS.md §H — Witness: witness_find_ask_answers.js W6
 * Slot values come ONLY from the loaded building (vocab()); an unmatched word is ignored, never
 * placed in a sentence. Pure except vocab(A), which reads the DB / room graph.
 */
(function () {
  'use strict';

  var INTENT = {
    cost_total: /\b(cost|5d|price|budget|spend|money)\b/i,
    schedule_4d: /\b(4d|schedule|timeline|duration|gantt|programme|program|when)\b|how long/i,
    clash_pair: /\b(clash\w*|collid\w*|conflict\w*|interfer\w*)\b/i,
    largest_room: /\b(rooms?|largest|biggest|area|space)\b/i,
    exit_path: /\b(exit|egress|escape|evacuat\w*)\b/i,
    counts: /\b(count|number|elements?)\b|how many/i
  };
  var CTYPE = [['all', /\b(all|total)\b/i], ['materials', /\bmaterials?\b/i],
    ['labour', /\b(labou?r|personnel|manpower|crew|workers?)\b/i], ['equipment', /\b(equipment|plant|machine\w*)\b/i]];
  var FILLER = /^(find|the|of|for|on|in|at|by|and|to|from|a|an|what|is|show|me|between|with|level?s?)$/i;

  function q(A, sql) { try { return A.dbQuery(sql) || []; } catch (e) { return []; } }
  function hasTable(A, t) { return +((q(A, "SELECT count(*) FROM sqlite_master WHERE name='" + t + "'")[0] || [0])[0]) > 0; }
  function col(rows) { return rows.map(function (r) { return r[0]; }).filter(function (v) { return v !== null && v !== undefined && v !== ''; }).map(String); }

  // ── vocabulary of THIS building (the only source of slot values) ──
  function vocab(A, clashRules) {
    var V = { building: A.activeBuilding };
    V.discs = col(q(A, 'SELECT DISTINCT discipline FROM elements_meta ORDER BY 1'));
    V.storeys = col(q(A, 'SELECT DISTINCT storey FROM elements_meta ORDER BY 1'));
    V.hasQto = hasTable(A, 'qto_cache');
    V.qtoDiscs = V.hasQto ? col(q(A, 'SELECT DISTINCT discipline FROM qto_cache ORDER BY 1')) : [];
    V.qtoStoreys = V.hasQto ? col(q(A, 'SELECT DISTINCT storey FROM qto_cache ORDER BY 1')) : [];
    V.qtoClasses = V.hasQto ? col(q(A, 'SELECT DISTINCT ifc_class FROM qto_cache ORDER BY 1')) : [];
    V.hasRaster = hasTable(A, 'storey_walkable_raster');
    var ph = {}, st = {}, tr = {}, n = 0;
    q(A, "SELECT parameters FROM kernel_ops WHERE undone = 0 AND op_type = 'ELEMENT_PLACE'").forEach(function (r) {
      var p; try { p = r[0] ? JSON.parse(r[0]) : {}; } catch (e) { p = {}; }
      n++; if (p.phase) ph[p.phase] = 1; if (p.storey) st[p.storey] = 1; if (p.resource) tr[p.resource] = 1;
    });
    V.opsCount = n; V.opsPhases = Object.keys(ph).sort(); V.opsStoreys = Object.keys(st).sort(); V.opsTrades = Object.keys(tr).sort();
    V.pairs = [];
    ((clashRules && clashRules.clash_rules) || []).forEach(function (r) {
      var a = r.source.discipline, b = r.target.discipline;
      if (V.discs.indexOf(a) >= 0 && V.discs.indexOf(b) >= 0) V.pairs.push([a, b]);
    });
    var rooms = {};
    try { (A.allRoomVolumes ? A.allRoomVolumes() : []).forEach(function (b) { if (!rooms[b.guid]) rooms[b.guid] = { guid: b.guid, name: String(b.name) }; }); } catch (e) { /* none */ }
    V.rooms = Object.keys(rooms).map(function (k) { return rooms[k]; });
    V.roomStorey = {};
    V.discMap = A._nlpDiscMap || {};
    return V;
  }
  // room → storey needs the room graph (heavy on big buildings) — only built when a room sentence needs it
  function roomStoreys(A, V) {
    if (V._roomStoreysDone) return;
    V._roomStoreysDone = true;
    try {
      var g = A.getRoomGraph ? A.getRoomGraph() : null;
      (g && g.nodes || []).forEach(function (n) { if (n.storey) V.roomStorey[n.guid] = String(n.storey); });
    } catch (e) { /* none */ }
    var s = {}; V.rooms.forEach(function (r) { if (V.roomStorey[r.guid]) s[V.roomStorey[r.guid]] = 1; });
    V.roomStoreys = Object.keys(s).sort();
  }

  // ── word → slot matching: (a) whole phrase, (b) discipline synonym, (c) prefix ≥2 of a value word ──
  function words(text) { return (text || '').toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean); }
  function matchValues(text, values, free, synonyms) {
    var low = ' ' + (text || '').toLowerCase().replace(/[^a-z0-9_ ]+/g, ' ') + ' ';
    var a = values.filter(function (v) { return low.indexOf(' ' + v.toLowerCase().replace(/[^a-z0-9_ ]+/g, ' ').trim() + ' ') >= 0; });
    if (a.length) return a;
    if (synonyms) {
      var b = [];
      free.forEach(function (w) { var d = synonyms[w]; if (d && values.indexOf(d) >= 0 && b.indexOf(d) < 0) b.push(d); });
      if (b.length) return b;
    }
    return values.filter(function (v) {
      var vw = words(v);
      return free.some(function (w) { return w.length >= 2 && !/^\d+$/.test(w) && vw.some(function (x) { return x.indexOf(w) === 0; }); });
    });
  }

  // ── render (the grammar itself) ──
  function render(tpl, s) {
    switch (tpl) {
      case 'cost_total': return 'Find 5D cost of ' + s.ctype + (s.disc ? ' for ' + s.disc : '') + (s.storey ? ' on ' + s.storey : '') + (s.cls ? ' for ' + s.cls : '');
      case 'schedule_4d': return 'Find 4D schedule' + ((s.storey || s.phase || s.trade) ? (s.storey ? ' on ' + s.storey : '') + (s.phase ? ' for phase ' + s.phase : '') + (s.trade ? ' by ' + s.trade : '') : ' for the whole building');
      case 'clash_pair': return 'Find clashes between ' + s.a + ' and ' + s.b;
      case 'largest_room': return 'Find largest rooms' + (s.storey ? ' on ' + s.storey : '');
      case 'exit_path': return 'Find path to exit' + (s.roomName ? ' from ' + s.roomName : ' (worst-case room)');
      case 'counts': return 'Find element count by ' + s.by;
    }
    return '';
  }
  function mk(tpl, slots, V) {
    var avail = true, reason = '';
    if (tpl === 'cost_total' && !V.hasQto) { avail = false; reason = 'no costed quantities (qto_cache) in this building'; }
    if (tpl === 'exit_path' && !V.hasRaster) { avail = false; reason = 'no walkable raster in this building — exits cannot be found'; }
    return { tpl: tpl, slots: slots, text: render(tpl, slots), available: avail, reason: reason };
  }
  function opt(list) { return list.length ? list : [null]; }

  // ── suggest(text) → ranked sentences ──
  function suggest(A, V, text, cap) {
    cap = cap || 10;
    var ws = words(text);
    var intents = Object.keys(INTENT).filter(function (k) { return INTENT[k].test(text || ''); });
    var ctypeHit = CTYPE.filter(function (c) { return c[1].test(text || ''); }).map(function (c) { return c[0]; });
    if (ctypeHit.length && intents.indexOf('cost_total') < 0) intents.push('cost_total');
    var free = ws.filter(function (w) {
      if (FILLER.test(w)) return false;
      if (Object.keys(INTENT).some(function (k) { return INTENT[k].test(w); })) return false;
      return !CTYPE.some(function (c) { return c[1].test(w); });
    });
    var syn = V.discMap;
    var m = {
      qdisc: matchValues(text, V.qtoDiscs, free, syn), qst: matchValues(text, V.qtoStoreys, free), qcls: matchValues(text, V.qtoClasses, free),
      disc: matchValues(text, V.discs, free, syn), ost: matchValues(text, V.opsStoreys, free), oph: matchValues(text, V.opsPhases, free),
      otr: matchValues(text, V.opsTrades, free), room: matchValues(text, V.rooms.map(function (r) { return r.name; }), free), est: matchValues(text, V.storeys, free)
    };
    var anySlot = Object.keys(m).some(function (k) { return m[k].length; });
    if (!intents.length) {
      if (!ws.length) return ['cost_total', 'schedule_4d', 'clash_pair', 'largest_room', 'exit_path', 'counts'].map(function (t) { return mk(t, defaults(t, V), V); });
      if (!anySlot) return [];
      if (m.qdisc.length || m.qst.length || m.qcls.length) intents.push('cost_total');
      if (m.ost.length || m.oph.length || m.otr.length) intents.push('schedule_4d');
      if (m.disc.length) intents.push('clash_pair');
      if (m.room.length) intents.push('exit_path');
    }
    var out = [];
    intents.forEach(function (t) {
      if (t === 'cost_total') {
        (ctypeHit.length ? ctypeHit : ['all', 'materials', 'labour', 'equipment']).forEach(function (ct) {
          opt(m.qdisc).forEach(function (d) { opt(m.qst).forEach(function (st) { opt(m.qcls).forEach(function (c) {
            out.push(mk(t, { ctype: ct, disc: d, storey: st, cls: c }, V)); }); }); });
        });
      } else if (t === 'schedule_4d') {
        opt(m.ost).forEach(function (st) { opt(m.oph).forEach(function (ph) { opt(m.otr).forEach(function (tr) {
          out.push(mk(t, { storey: st, phase: ph, trade: tr }, V)); }); }); });
      } else if (t === 'clash_pair') {
        var pairs = V.pairs.filter(function (p) { return m.disc.every(function (d) { return p.indexOf(d) >= 0; }) || (m.disc.length > 2 && m.disc.indexOf(p[0]) >= 0 && m.disc.indexOf(p[1]) >= 0); });
        if (!m.disc.length) pairs = V.pairs.slice();
        pairs.forEach(function (p) {
          var a = m.disc.length && p[1] === m.disc[0] ? p[1] : p[0], b = a === p[0] ? p[1] : p[0];
          out.push(mk(t, { a: a, b: b }, V));
        });
      } else if (t === 'largest_room') {
        roomStoreys(A, V);
        var rs = matchValues(text, V.roomStoreys || [], free);
        opt(rs).forEach(function (st) { out.push(mk(t, { storey: st }, V)); });
      } else if (t === 'exit_path') {
        if (m.room.length) m.room.slice(0, 8).forEach(function (nm) { var r = V.rooms.filter(function (x) { return x.name === nm; })[0]; out.push(mk(t, { roomName: nm, roomGuid: r.guid }, V)); });
        else out.push(mk(t, {}, V));
      } else if (t === 'counts') {
        out.push(mk(t, { by: 'discipline' }, V)); out.push(mk(t, { by: 'storey' }, V));
      }
    });
    // rank: available first, then more filled slots (more of the user's words used)
    out.forEach(function (s, i) { s._i = i; s._fill = Object.keys(s.slots).filter(function (k) { return s.slots[k] && k !== 'ctype' && k !== 'by' && k !== 'roomGuid'; }).length; });
    out.sort(function (x, y) { return (y.available - x.available) || (y._fill - x._fill) || (x._i - y._i); });
    var seen = {}, res = [];
    out.forEach(function (s) { if (!seen[s.text] && res.length < cap) { seen[s.text] = 1; delete s._i; delete s._fill; res.push(s); } });
    return res;
  }
  function defaults(t, V) {
    if (t === 'cost_total') return { ctype: 'all' };
    if (t === 'clash_pair') { var p = V.pairs.filter(function (x) { return x.indexOf('ARC') >= 0 && x.indexOf('MEP') >= 0; })[0] || V.pairs[0] || ['ARC', 'MEP']; return { a: p.indexOf('ARC') >= 0 ? 'ARC' : p[0], b: p.indexOf('ARC') >= 0 ? (p[0] === 'ARC' ? p[1] : p[0]) : p[1] }; }
    if (t === 'counts') return { by: 'discipline' };
    return {};
  }

  window.FindAskGrammar = { vocab: vocab, suggest: suggest, render: render, defaults: defaults, make: mk, roomStoreys: roomStoreys, INTENT: INTENT };
})();
