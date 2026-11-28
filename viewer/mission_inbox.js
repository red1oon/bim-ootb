// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/MOBILE_PERF.md WO-26 "the mission reaches the phone". Witness: viewer/tests/witness_mission_delivery.js (W-MISSION-DELIVERY). READ THE LOG after every run:
//   §MISSION_LIST  §MISSION_LOAD  §MISSION_PICKUP  (HQ side: §MISSION_SEND  §MISSION_ONSITE)
// ISSUE: HQ seals a prepared mission into the team folder (viewer/mission_processor.js A.sendMission: the Send-to-HQ outbox, one drop format, sealed label 'bim-mission', file key kind:'mission'). A paired
//   phone lists the mission drops of its team, opens one with the existing APP.loadMission, and tells HQ it did (a 'pickup' report through the same outbox) so HQ moves that mission's Requests Prepared -> On site.
// THE DRAWER ROW: "Missions" (viewer/panels.js, platform 'mobile', Navigate drawer) loads this file on the first tap (APP.lazy row `missioninbox`); nothing of it at boot. It opens ONE sheet (#missions-sheet, an adapter of
//   A.sheets) with a "Get" button, a one-line status and the list. The list is read from the team folder only on "Get": no pairing, offline, or no mission each give ONE line and nothing else happens.
// A.listMissions() -> { rows:[{ kid, id, name, role, tasks, made_at, file }], reason:''|'unpaired'|'offline'|'nokey'|'none'|'error', drops }
//   the phone lists the drops of OTHER devices (HQ's), reads each drop's sealed label with TeamDrop.open(metaOnly) and opens only those labelled 'bim-mission' (a site photo drop is never fetched); newest first.
// A.openMissionRow(row) -> the loaded mission (APP.loadMission) or null; queues ONE pickup report { v:1, kind:'pickup', mission, requests:[R_Request_UU...], by:<this device's key id>, at } labelled 'bim-pickup' in the
//   Send-to-HQ outbox (kept offline, sent when online). `requests` = the Requests the file's tasks belong to (a task id is the R_Request_UU, or R_Request_UU#guid) so HQ moves exactly those.
(function (root) {
  'use strict';
  function log(s) { console.log(s); }

  function setupMissionInbox(A) {
    if (A.listMissions) return;
    var ROWS = [], BUSY = false;

    function sheet() {
      var el = document.getElementById('missions-sheet');
      if (!el) {
        el = document.createElement('div'); el.id = 'missions-sheet';
        el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:70vh;overflow:auto;z-index:1500;box-sizing:border-box;padding:18px 14px calc(14px + env(safe-area-inset-bottom,0px));background:#1c1c20;color:#eee;font:15px sans-serif;border-radius:14px 14px 0 0;box-shadow:0 -4px 18px rgba(0,0,0,.5);display:none;';
        var h = document.createElement('div'); h.style.cssText = 'font-weight:600;margin-bottom:8px'; h.textContent = 'Site missions'; el.appendChild(h);
        var b = document.createElement('button'); b.id = 'missions-get'; b.textContent = 'Get';
        b.style.cssText = 'padding:10px 18px;border:0;border-radius:8px;background:#2a6fb0;color:#fff;font:600 15px sans-serif;margin-right:8px';
        b.onclick = function () { A.getMissions(); }; el.appendChild(b);
        var c = document.createElement('button'); c.id = 'missions-close'; c.textContent = 'Close';
        c.style.cssText = 'padding:10px 18px;border:0;border-radius:8px;background:#555;color:#fff;font:15px sans-serif'; c.onclick = function () { A.missionsSheetClosed(); }; el.appendChild(c);
        var st = document.createElement('div'); st.id = 'missions-status'; st.style.cssText = 'margin:10px 0 6px;font-size:13px;color:#9ec9a0'; st.textContent = 'Tap Get to see the missions HQ sent your team.'; el.appendChild(st);
        var ls = document.createElement('div'); ls.id = 'missions-list'; el.appendChild(ls);
        document.body.appendChild(el);
      }
      return el;
    }
    function say(t) { var e = document.getElementById('missions-status'); if (e) e.textContent = t; if (A.status) A.status.textContent = t; }
    A.missionsSheetClosed = function () { var el = document.getElementById('missions-sheet'); if (el) el.style.display = 'none'; };
    if (A.sheets && A.sheets.adapters) A.sheets.adapters.push({ id: 'missions-sheet', get: function () { return document.getElementById('missions-sheet'); }, close: function () { A.missionsSheetClosed(); } });

    A.openMissionInbox = function () {
      var el = sheet(); el.style.display = el.style.display === 'none' ? 'block' : 'none';
      log('§MISSION_INBOX open=' + (el.style.display !== 'none'));
    };

    function dateText(iso) { try { var d = new Date(iso); return isNaN(d) ? '' : d.toISOString().slice(0, 16).replace('T', ' '); } catch (e) { return ''; } }

    // the drops of the team's other devices that are missions; one open of the comm store, serialised with send/get like every other team-folder read
    A.listMissions = function () {
      return A._hq.exclusive(async function () {
        var res = { rows: [], reason: '', drops: 0 }, T = await A._hq.team();
        if (!T) { res.reason = 'unpaired'; return res; }
        if (navigator.onLine === false) { res.reason = 'offline'; return res; }
        try {
          var O = await A._hq.open(T), TD = window.TeamDrop, space = T.cfg.space, roster = (await O.S.order()).roster, ring = await O.S.keyring();
          if (!TD.newestKey(ring)) { res.reason = 'nokey'; return res; }
          var list = (await TD.list(O.pipe, space)).filter(function (d) { return d.kid !== T.dev.kid; });
          res.drops = list.length;
          for (var i = 0; i < list.length; i++) {
            var d = list[i], ctx = { space: space, kid: d.kid, id: d.id, roster: roster, ring: ring };
            var pk = await TD.open(O.pipe, Object.assign({ metaOnly: true }, ctx));
            if (!pk.ok || pk.label !== 'bim-mission') continue;
            var o = await TD.open(O.pipe, ctx); if (!o.ok) continue;
            var jf = o.files.filter(function (f) { return /\.json$/.test(f.name); })[0], obj = null;
            try { obj = jf ? JSON.parse(new TextDecoder().decode(jf.bytes)) : null; } catch (e) { obj = null; }
            if (!obj || obj.kind !== 'mission' || obj.v !== 1 || !obj.mission || !Array.isArray(obj.tasks)) continue;
            res.rows.push({ kid: d.kid, id: d.id, name: obj.mission.name, role: obj.mission.role || null, tasks: obj.tasks.length, made_at: o.manifest.made_at, file: obj });
          }
          res.rows.sort(function (a, b) { return String(a.made_at) < String(b.made_at) ? 1 : -1; });
          if (!res.rows.length) res.reason = 'none';
        } catch (e) { res.reason = 'error'; log('§MISSION_LIST_ERR ' + (e && e.message)); }
        return res;
      });
    };

    A.getMissions = async function () {
      if (BUSY) return null; BUSY = true;
      var ls = document.getElementById('missions-list'); if (ls) ls.innerHTML = '';
      say('Looking in your team folder…');
      var r; try { r = await A.listMissions(); } finally { BUSY = false; }
      ROWS = r.rows;
      log('§MISSION_LIST n=' + r.rows.length + ' drops=' + r.drops + (r.reason ? ' reason=' + r.reason : '') + (r.rows.length ? ' missions=' + r.rows.map(function (x) { return x.file.mission.id + '[' + (x.role || 'no role') + ',' + x.tasks + ']'; }).join(';') : ''));
      var msg = { unpaired: 'This phone is not paired with a team folder — there are no missions to get.', offline: 'You are offline — missions cannot be fetched now.',
        nokey: 'This phone holds no team key yet — ask HQ to approve it.', none: 'No mission from HQ yet.', error: 'Could not reach your team folder — try again when online.' }[r.reason];
      say(msg || (r.rows.length + ' mission(s) from HQ — tap one to open it.'));
      if (ls) r.rows.forEach(function (row, i) {
        var b = document.createElement('button'); b.className = 'mission-row'; b.setAttribute('data-mission', row.file.mission.id);
        b.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0;padding:10px 12px;border:0;border-radius:8px;background:#2b2b31;color:#eee;font:14px sans-serif';
        b.textContent = row.name + ' · ' + (row.role || 'no role') + ' · ' + row.tasks + ' task' + (row.tasks === 1 ? '' : 's') + ' · ' + dateText(row.made_at);
        b.onclick = function () { A.openMissionRow(ROWS[i]); }; ls.appendChild(b);
      });
      return r;
    };

    // open the mission with the existing loader, then tell HQ (ONE small report through the Send-to-HQ outbox)
    A.openMissionRow = async function (row) {
      if (!row || !row.file) return null;
      await A.lazy('tasks');
      var M = await A.loadMission(row.file, { via: 'team' });
      if (!M) { say('That mission file could not be opened.'); return null; }
      A.missionsSheetClosed();
      var dev = await A._hq.kv('device'), seen = {}, reqs = [];
      row.file.tasks.forEach(function (t) { var u = String(t.id).split('#')[0]; if (!seen[u]) { seen[u] = 1; reqs.push(u); } });
      var rep = { v: 1, kind: 'pickup', mission: M.id, requests: reqs, by: dev && dev.kid || null, at: new Date().toISOString() };
      var f = new File([JSON.stringify(rep)], 'pickup_' + String(M.id).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) + '.json', { type: 'application/json' });
      var q = null; try { q = await A.queueHqFiles([f], 'bim-pickup'); } catch (e) { log('§MISSION_PICKUP_ERR ' + (e && e.message)); }
      log('§MISSION_PICKUP mission=' + M.id + ' queued=' + !!(q && q.id) + ' sent=' + !!(q && q.sent) + ' requests=' + reqs.length + (q && q.reason ? ' reason=' + q.reason : ''));
      return M;
    };
    log('§MISSION_INBOX_READY');
  }

  if (root) root.setupMissionInbox = setupMissionInbox;
})(typeof window !== 'undefined' ? window : null);
