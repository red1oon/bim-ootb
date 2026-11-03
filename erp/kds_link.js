// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — kds_link.js: how the till and the kitchen page learn that the OTHER one wrote something, at the lowest central cost (prompts/POS_PLUGIN_LOCAL_FIRST.md §19.5; owner 2026-11-03: batch with a base, minimise central use).
// A full Visit costs ~15 relay requests; ONE list of the branch box costs 1. So a device PEEKS (one list) every poll period and runs a full Visit only when the box holds a bundle written by ANOTHER device that it has not met.
// A device that has something to send runs ONE Visit right after the write (Send Order, bump), which carries whatever else is pending. Logged as §KDS_LINK; the witness counts the pipe requests (§KDS_RELAY).
(function (root) {
  'use strict';
  function create(o) {   // o { E (engine window), kid(), pollMs, log, onVisit(v) }
    var seen = {}, timer = null, busy = false, st = { peeks: 0, visits: 0, last: null };
    async function tick() {
      if (busy) return null; busy = true;
      try {
        var pk = await o.E.TeamSync.peekBranch(); st.peeks++;
        if (!pk) { st.last = 'no-branch'; return null; }
        var me = await o.kid(), fresh = pk.names.filter(function (n) { return n.split('/')[5] !== me && !seen[n]; });
        pk.names.forEach(function (n) { seen[n] = 1; });
        st.last = fresh.length ? 'visit' : 'quiet';
        if (!fresh.length) return null;
        var v = await o.E.TeamSync.visit(); st.visits++; if (o.onVisit) await o.onVisit(v); return v;
      } catch (e) { o.log('🔴 §KDS_LINK ' + (e && e.message)); return null; } finally { busy = false; }
    }
    function start(pred) { stop(); timer = setInterval(function () { if (!pred || pred()) tick(); }, o.pollMs); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    return { tick: tick, start: start, stop: stop, state: function () { return st; } };
  }
  root.KdsLink = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
