// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — team_releases.js: the Team panel's RELEASES screens (TEAMWORK_FRAMEWORK §46.5 corrected build order, Stage 4; spec STAGE4_SPEC): Trusted keys · Sync rules · Rollout · Updates · Publish.
// TWIN RULE: these screens live ONLY in the Team panel. They read the team store and the relay's pub/ area; they never touch a core AD window, tab, field, process or DocAction, and they name no table.
// Two layers: TeamReleases = PURE models (one function per screen, plain data in, rows out - the witness's seam) · TeamReleasesUI = the renderer over a host (window.TeamSync.releases).
// Every row carries data-* attributes holding the VALUES the witness compares with the store; every action prints a § line.
(function (global) {
  'use strict';
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var ROLE_WORDS = { owner: 'Owner (rotates and publishes)', 'rotate-only': 'Recovery (rotates only)', publish: 'Publisher (publishes only)' };
  var STATE_WORDS = { current: 'Up to date', 'update-available': 'Update available', 'not-downloaded': 'Update available, not yet downloaded', 'hash-mismatch': 'Does not match its list: not offered', withdrawn: 'Withdrawn',
    'refused-base-change': 'Changes the base: not accepted', 'apply-blocked-cap': 'Cannot apply yet: compact first', invalid: 'Invalid entry', expired: 'Update required' };
  var WARN_WORDS = function (w) { return /^depends-on-withdrawn:/.test(w) ? 'depends on ' + w.split(':')[1] + ', which was withdrawn' : (w === 'url-carrier-unchecked' ? 'downloaded from a link: not checked here' : w); };

  // ── Trusted keys ──
  function keysModel(info) {
    if (!info) return { rows: [], threshold: null, epoch: null, text: 'No trust list is pinned in this team.', sole: false };
    var rows = info.keys.map(function (k, i) { var role = k.role === undefined ? 'owner' : k.role;
      return { n: i + 1, id: String(k.x).slice(0, 8), role: role, words: ROLE_WORDS[role] || role, canRotate: role !== 'publish', canPublish: role !== 'rotate-only' }; });
    var owners = rows.filter(function (r) { return r.canRotate && r.canPublish; }).length;
    return { rows: rows, threshold: info.threshold, epoch: info.epoch == null ? null : info.epoch,
             text: info.threshold + ' of ' + rows.length + ' key' + (rows.length === 1 ? '' : 's') + ' must sign a change.',
             sole: owners === 1 && rows.length === 1, warn: rows.length === 1 ? 'Losing the only key ends all releases: list a recovery key.' : '' };
  }
  // ── Sync rules (read-only) ──
  function ms(n) { return n % 60000 === 0 ? (n / 60000) + ' min' : (n % 1000 === 0 ? (n / 1000) + ' s' : n + ' ms'); }
  function rulesModel(policy, plan, anchor) {
    var p = policy || {}, rows = [];
    function add(key, label, v) { rows.push({ key: key, label: label, value: v }); }
    if (p.visit_ms !== undefined) add('visit_ms', 'Visit period', ms(p.visit_ms));
    if (p.stagger !== undefined) add('stagger', 'Stagger', p.stagger === 'kid-hash-mod-V' ? 'each device offset by its id inside the period' : String(p.stagger));
    if (p.bundle_max_ops !== undefined) add('bundle_max_ops', 'Operations per bundle (at most)', String(p.bundle_max_ops));
    if (p.gate && p.gate.max_object_bytes !== undefined) add('gate.max_object_bytes', 'Largest object the relay accepts', p.gate.max_object_bytes + ' bytes');
    if (p.gate && p.gate.max_puts_per_hour !== undefined) add('gate.max_puts_per_hour', 'Writes per device per hour (at most)', String(p.gate.max_puts_per_hour));
    if (p.checkpoint && p.checkpoint.every_ops !== undefined) add('checkpoint.every_ops', 'Checkpoint every', p.checkpoint.every_ops + ' operations');
    if (p.checkpoint && p.checkpoint.cosigs !== undefined) add('checkpoint.cosigs', 'Checkpoint co-signers needed', String(p.checkpoint.cosigs));
    if (p.lease_ttl_ms !== undefined) add('lease_ttl_ms', 'Lease time', ms(p.lease_ttl_ms));
    if (p.number_prefix !== undefined) add('number_prefix', 'Document number prefix', String(p.number_prefix));
    if (p.min_v && typeof p.min_v === 'object') Object.keys(p.min_v).sort().forEach(function (k) { add('min_v.' + k, 'Oldest accepted shape of ' + k, String(p.min_v[k])); });
    if (plan) add('plan', 'Kind of team', plan === 'pos' ? 'Point of sale (star)' : 'Office (mesh)');
    add('anchor', 'Time anchor', typeof anchor === 'number' ? new Date(anchor).toISOString().slice(0, 10) + ' (set by the administrator)' : 'not set');
    return { rows: rows };
  }
  // ── Rollout ── (adopted-by-N-of-M is NOT built: it needs a device-reported state; no ack op exists - stated on the screen)
  function rolloutModel(v) {
    var fr = v.frontier || {}, rows = (v.devices || []).map(function (d) { var n = fr[d.kid] || 0; return { kid: d.kid, code: d.code, person: d.person || '', role: d.role, you: !!d.you, lastSeen: n, heard: n > 0, revoked: !!d.revoked }; });
    var heard = rows.filter(function (r) { return r.heard; }).length;
    return { rows: rows, heard: heard, total: rows.length, held: (v.held || []).slice(),
             header: 'Heard from ' + heard + ' of ' + rows.length + ' devices', note: 'Adopted-by counts are not shown: devices do not report what they installed yet.' };
  }
  // ── Updates ──
  function updatesModel(u) {
    if (!u || !u.list) return { has: false, rows: [], banner: 'No update list has been published.', rejected: (u && u.rejected) || [] };
    var rows = (u.rows || []).map(function (r) { var cl = []; if (r.changelog) Object.keys(r.changelog).forEach(function (sec) { (r.changelog[sec] || []).forEach(function (l) { cl.push({ section: sec, what: l.what, why: l.why, action: l.action || '' }); }); });
      return { id: r.id, installed: r.installed, current: r.current, state: r.state, words: STATE_WORDS[r.state] || r.state, yanked: !!r.yanked, reason: r.reason || '', warn: (r.warn || []).map(WARN_WORDS), changelog: cl }; });
    return { has: true, number: u.list.number, signedAt: u.list.signed_at, outOfDate: !!u.outOfDate, rows: rows, rejected: u.rejected || [],
             banner: 'Update list #' + u.list.number + ', signed ' + new Date(u.list.signed_at).toISOString().slice(0, 10) + '. It informs; it never applies anything and never stops business.' + (u.outOfDate ? ' Update list is out of date: connect to check.' : '') };
  }

  // ── renderer ──
  var SCREENS = [['keys', 'Trusted keys'], ['rules', 'Sync rules'], ['rollout', 'Rollout'], ['updates', 'Updates'], ['publish', 'Publish']];
  function row(attrs, html) { return '<div class="tp-rel-row" ' + Object.keys(attrs).map(function (k) { return 'data-' + k + '="' + esc(attrs[k]) + '"'; }).join(' ') + ' style="padding:6px 0;border-top:1px solid #eee">' + html + '</div>'; }
  async function render(box, host) {
    if (!box || !host) return;
    var v = await host.view(); if (!v) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.innerHTML = '<div style="font-weight:600;margin-bottom:6px">Releases</div><div id="tp-rel-buttons">' + SCREENS.filter(function (s) { return s[0] !== 'publish' || v.admin; }).map(function (s) {
      return '<button type="button" id="tp-rel-' + s[0] + '" style="min-height:40px;cursor:pointer;margin:0 6px 6px 0">' + s[1] + '</button>'; }).join('') + '</div><div id="tp-rel-body" style="margin-top:4px"></div>';
    var body = box.querySelector('#tp-rel-body');
    function show(name, html, extra) { body.setAttribute('data-screen', name); body.innerHTML = html; console.log('§TEAM_RELEASES screen=' + name + ' ' + (extra || '')); }
    box.querySelector('#tp-rel-keys').onclick = async function () { var v2 = await host.view(), m = keysModel(v2.keys);
      show('keys', '<div id="tp-keys-text" data-threshold="' + esc(m.threshold) + '" data-epoch="' + esc(m.epoch) + '">' + esc(m.text) + '</div>' + m.rows.map(function (r) { return row({ n: r.n, id: r.id, role: r.role, rotate: r.canRotate, publish: r.canPublish }, esc('Key ' + r.n + ' (' + r.id + '): ' + r.words)); }).join('') + (m.warn ? '<div class="tp-rel-warn" style="color:#b3261e">' + esc(m.warn) + '</div>' : ''),
        'rows=' + m.rows.length + ' threshold=' + m.threshold + ' epoch=' + m.epoch); };
    box.querySelector('#tp-rel-rules').onclick = async function () { var v2 = await host.view(), m = rulesModel(v2.policy, v2.plan, v2.anchor);
      show('rules', '<div id="tp-rules-head" data-epoch="' + esc(v2.epoch == null ? '' : v2.epoch) + '">Read-only: set by the administrator.</div>' + m.rows.map(function (r) { return row({ key: r.key, value: r.value }, esc(r.label + ': ' + r.value)); }).join(''), 'rows=' + m.rows.length + ' epoch=' + v2.epoch); };
    box.querySelector('#tp-rel-rollout').onclick = async function () { var v2 = await host.view(), m = rolloutModel(v2);
      show('rollout', '<div id="tp-rollout-head" data-heard="' + m.heard + '" data-total="' + m.total + '">' + esc(m.header) + '</div>' + m.rows.map(function (r) { return row({ kid: r.kid, 'last-seen': r.lastSeen, heard: r.heard, you: r.you }, esc(r.code + (r.person ? ' · ' + r.person : '') + (r.you ? ' (this device)' : '') + ' · ' + (r.heard ? 'last seen at op ' + r.lastSeen : 'never heard from'))); }).join('') +
        (m.held.length ? '<div class="tp-rel-warn">Waiting for a translation: ' + esc(m.held.map(function (h) { return h.author + ' from op ' + h.seq; }).join(', ')) + '</div>' : '') + '<div style="color:#666;margin-top:6px">' + esc(m.note) + '</div>', 'heard=' + m.heard + ' of ' + m.total); };
    box.querySelector('#tp-rel-updates').onclick = async function () { var m = updatesModel(await host.updates());
      show('updates', '<div id="tp-upd-banner" data-has="' + m.has + '" data-out-of-date="' + (m.has ? m.outOfDate : '') + '" data-number="' + esc(m.has ? m.number : '') + '">' + esc(m.banner) + '</div>' + m.rows.map(function (r) {
        return row({ id: r.id, state: r.state, yanked: r.yanked, installed: r.installed || '', current: r.current }, '<b>' + esc(r.id) + '</b> ' + esc((r.installed || 'not installed') + ' → ' + r.current) + ' · ' + esc(r.words) + (r.yanked ? ' <b class="tp-yanked">[YANKED]</b>' : '') + (r.reason ? ' · ' + esc(r.reason) : '') +
          (r.warn.length ? '<div class="tp-rel-warn" style="color:#8a5a00">' + esc(r.warn.join('; ')) + '</div>' : '') +
          (r.changelog.length ? '<details><summary>What changed and why</summary>' + r.changelog.map(function (l) { return '<div class="tp-cl" data-section="' + esc(l.section) + '">' + esc(l.section + ': ' + l.what + ' — because ' + l.why + (l.action ? ' — you: ' + l.action : '')) + '</div>'; }).join('') + '</details>' : '')); }).join('') +
        m.rejected.map(function (x) { return '<div class="tp-upd-rejected" style="color:#b3261e">Not used: ' + esc(x.reason) + '</div>'; }).join(''), 'has=' + m.has + ' rows=' + m.rows.length + ' outOfDate=' + m.outOfDate + ' rejected=' + m.rejected.length); };
    if (v.admin) box.querySelector('#tp-rel-publish').onclick = function () {
      show('publish', '<div>Choose the signed update list (made with sign_updatelist) and its release files.</div><input type="file" id="tp-pub-files" multiple style="margin:6px 0"><div><button type="button" id="tp-pub-go" style="min-height:40px;cursor:pointer">Publish</button> ' +
        '<button type="button" id="tp-pub-anchor" style="min-height:40px;cursor:pointer">Set the time anchor to now</button></div><div id="tp-pub-confirm" data-ts="" style="display:none;margin-top:6px;padding:6px;border:1px solid #b3261e"></div><div id="tp-pub-result" data-ok="" data-reason="" style="margin-top:6px"></div>', 'admin=true');
      var res = body.querySelector('#tp-pub-result');
      function say(r) { res.setAttribute('data-ok', String(!!r.ok)); res.setAttribute('data-reason', r.reason || ''); res.textContent = r.ok ? (r.message || 'Published.') : 'Refused: ' + r.reason; }
      body.querySelector('#tp-pub-go').onclick = async function () { var fl = body.querySelector('#tp-pub-files').files, files = [];
        for (var i = 0; i < fl.length; i++) files.push({ name: fl[i].name, bytes: new Uint8Array(await fl[i].arrayBuffer()) });
        var r = await host.publish(files); console.log('§TEAM_RELEASES publish ok=' + r.ok + ' reason=' + (r.reason || '') + ' files=' + files.length); say(r); };
      // Owner decision 2026-10-31: the anchor is signed only after an in-panel confirm that shows the exact moment (a wrong FIRST anchor can never be lowered). No browser dialog.
      var cbox = body.querySelector('#tp-pub-confirm');
      function closeConfirm() { cbox.style.display = 'none'; cbox.innerHTML = ''; cbox.setAttribute('data-ts', ''); }
      body.querySelector('#tp-pub-anchor').onclick = function () { var t = Date.now(), when = new Date(t).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
        cbox.setAttribute('data-ts', String(t)); cbox.style.display = 'block';
        cbox.innerHTML = '<div id="tp-anchor-when">You are about to sign the time anchor: <b>' + esc(when) + '</b> (' + esc(String(t)) + ' ms).</div><div id="tp-anchor-warn">The first anchor can never be lowered. Nothing is signed until you confirm.</div>' +
          '<button type="button" id="tp-anchor-yes" style="min-height:40px;cursor:pointer;margin-right:6px">Sign this time anchor</button><button type="button" id="tp-anchor-no" style="min-height:40px;cursor:pointer">Cancel</button>';
        console.log('§TEAM_RELEASES anchor-confirm ts=' + t + ' when=' + when);
        cbox.querySelector('#tp-anchor-no').onclick = function () { closeConfirm(); console.log('§TEAM_RELEASES anchor-cancel ts=' + t + ' signed=0'); say({ ok: false, reason: 'cancelled' }); res.textContent = 'Cancelled. Nothing was signed.'; };
        cbox.querySelector('#tp-anchor-yes').onclick = async function () { closeConfirm(); var r = await host.anchor(t); console.log('§TEAM_RELEASES anchor ok=' + r.ok + ' reason=' + (r.reason || '') + ' ts=' + t); say({ ok: r.ok, reason: r.reason, message: 'Time anchor set.' }); }; };
    };
    console.log('§TEAM_RELEASES opened admin=' + v.admin + ' buttons=' + box.querySelectorAll('#tp-rel-buttons button').length);
  }
  global.TeamReleases = { keysModel: keysModel, rulesModel: rulesModel, rolloutModel: rolloutModel, updatesModel: updatesModel };
  global.TeamReleasesUI = { render: render };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.TeamReleases;
})(typeof window !== 'undefined' ? window : globalThis);
