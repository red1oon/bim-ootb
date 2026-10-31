// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — team_updates.js: the UPDATE LIST — a tiny signed document in the relay's published area (`pub/`), NOT folded into the log, that tells people which modules have an update,
// which were withdrawn, and exactly WHAT changed and WHY. For people to SEE; it never applies anything and never stops business.
// Spec: prompts/TEAMWORK_FRAMEWORK.md §46.3 / §46.4 as corrected by §46.5 F7 F8 F9 F12 (Stage 3, STAGE3_SPEC). Witness: erp/tests/witness_team_updates.js (W-UPDATE-LIST).
// Signing/quorum/time anchor come from team_keys.js (Stage 2): the list is signed by `publish`-capable keys, T of them; freshness is judged against the admin-signed anchor, NEVER the device clock.
// Relay contract unchanged (put / get / list): names are s/<space>/pub/<kid>/update-list-<NNNNNNNN>.json and s/<space>/pub/<kid>/release-<sha256>.json (one writer per name).
(function (global) {
  'use strict';
  var TK = global.TeamKeys || (typeof require === 'function' ? require('./team_keys.js') : null);
  var ENV = global.CommEnvelope || (typeof require === 'function' ? require('./comm_envelope.js') : null);
  var V = global.VersionRange || (typeof require === 'function' ? require('./semver_strict.js') : null);
  var LIMITS = { list_entries: 64, list_bytes: 65536, release_bytes: 2097152, policy_upcaster_sets: 16 };
  var STATUS = ['current', 'update-available', 'expired', 'withdrawn'], SECTIONS = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'], KINDS = ['plugin', 'release', 'plan'];
  var HEX64 = /^[0-9a-f]{64}$/;
  function pad8(n) { return ('00000000' + n).slice(-8); }
  function listName(space, kid, n) { return 's/' + space + '/pub/' + kid + '/update-list-' + pad8(n) + '.json'; }
  function releaseName(space, kid, hash) { return 's/' + space + '/pub/' + kid + '/release-' + hash + '.json'; }
  function bodyOf(l) { return TK.bodyOf(l); }
  async function bodyHash(l) { return TK.sha256hex(ENV.canonical(bodyOf(l))); }
  function ok(v) { try { return V.valid(v); } catch (e) { return false; } }
  function str(x, max) { return typeof x === 'string' && x.length >= 1 && x.length <= (max || 300); }

  // ── shape ──
  function changelogProblem(e, prevCurrent) {
    var c = e.changelog;
    if (e.status === 'withdrawn' && c === undefined) return null;       // a withdrawal is explained by its reason
    if (!c || typeof c !== 'object' || Array.isArray(c)) return 'changelog-empty';
    var keys = Object.keys(c); if (keys.some(function (k) { return SECTIONS.indexOf(k) < 0; })) return 'changelog-section';
    var total = 0, breaking = false;
    for (var i = 0; i < keys.length; i++) { var ls = c[keys[i]]; if (!Array.isArray(ls)) return 'changelog-section';
      for (var j = 0; j < ls.length; j++) { var ln = ls[j]; total++;
        if (!ln || typeof ln !== 'object' || !str(ln.what)) return 'changelog-what';
        /*UL:WHY*/ if (!str(ln.why)) return 'changelog-why';
        if (ln.action !== undefined && !str(ln.action)) return 'changelog-action';
        if (keys[i] === 'Removed' || (keys[i] === 'Changed' && ln.breaking === true)) breaking = true; } }
    if (!total) return 'changelog-empty';
    if (breaking && prevCurrent && ok(prevCurrent) && ok(e.current) && V.major(e.current) <= V.major(prevCurrent)) return 'changelog-needs-major';
    return null;
  }
  function entryProblem(e) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return 'entry';
    if (!str(e.id, 100)) return 'id'; if (KINDS.indexOf(e.kind) < 0) return 'kind';
    if (!ok(e.current)) return 'current'; if (!ok(e.minimum) || V.compare(e.minimum, e.current) > 0) return 'minimum';
    if (STATUS.indexOf(e.status) < 0) return 'status';
    if ((e.status === 'expired' || e.status === 'withdrawn') && !str(e.reason, 200)) return 'reason';
    if (e.reason !== undefined && !str(e.reason, 200)) return 'reason';
    if (!HEX64.test(String(e.hash || ''))) return 'hash';
    if (!Number.isInteger(e.size) || e.size < 0 || e.size > LIMITS.release_bytes) return 'size';
    if (e.carrier !== 'pub' && e.carrier !== 'url') return 'carrier'; if (e.carrier === 'url' && !str(e.url, 500)) return 'url';
    if (e.apply !== undefined && e.apply !== 'none' && e.apply !== 'policy') return 'apply';
    if (e.base !== undefined && (!e.base || !HEX64.test(String(e.base.sha256 || '')))) return 'base';
    if (e.requires !== undefined) { if (!e.requires || typeof e.requires !== 'object' || Array.isArray(e.requires)) return 'requires';
      try { Object.keys(e.requires).forEach(function (d) { V.parseRange(e.requires[d]); }); } catch (x) { return 'requires'; } }
    return null;
  }
  function listProblem(l) {
    if (!l || typeof l !== 'object' || Array.isArray(l) || l.kind !== 'update-list') return 'kind';
    if (!HEX64.test(String(l.space || ''))) return 'space';
    if (!Number.isInteger(l.number) || l.number < 1) return 'number';
    if (!(l.prev === null || HEX64.test(String(l.prev || '')))) return 'prev';
    if (!Number.isInteger(l.signed_at) || l.signed_at < 0) return 'signed_at'; if (!Number.isInteger(l.expires) || l.expires < l.signed_at) return 'expires';
    if (!Array.isArray(l.entries)) return 'entries';
    if (typeof l.sig !== 'string' || !l.signer) return 'sig';
    var seen = {}; for (var i = 0; i < l.entries.length; i++) { var x = l.entries[i]; if (x && seen[x.id]) return 'duplicate-id'; if (x) seen[x.id] = 1; }
    return null;
  }

  // ── verification of ONE list (the signed document itself; entries are judged by classify) ──
  // ctx = { space, trust:{keys, threshold}, anchor (roster.anchor | null), state:{last:{number,hash}|null} }
  // -> { ok, reason, hash, effAnchor, outOfDate }     reasons: list-malformed:<f> list-wrong-space list-too-large list-signer list-role list-signature list-threshold list-skew list-replayed list-fork
  async function verify(list, ctx) {
    var pb = listProblem(list); if (pb) return { ok: false, reason: 'list-malformed:' + pb };
    if (list.space !== ctx.space) return { ok: false, reason: 'list-wrong-space' };
    if (list.entries.length > LIMITS.list_entries || ENV.canonical(list).length > LIMITS.list_bytes) return { ok: false, reason: 'list-too-large' };
    var why = TK.quorumReason(ctx.trust.keys, await TK.verifyAll(list), 'publish', ctx.trust.threshold || 1);
    if (why) return { ok: false, reason: { 'untrusted-signer': 'list-signer', role: 'list-role', signature: 'list-signature', threshold: 'list-threshold' }[why] };
    /*UL:SKEW*/ if (typeof ctx.anchor === 'number' && list.signed_at > ctx.anchor + TK.ANCHOR_MAX_SKEW_MS) return { ok: false, reason: 'list-skew' };       // §46.5 F7: an admin-asserted time may not jump
    var hash = await bodyHash(list), last = ctx.state && ctx.state.last;
    if (last) {
      /*UL:REPLAY*/ if (list.number < last.number) return { ok: false, reason: 'list-replayed' };
      if (list.number === last.number && hash !== last.hash) return { ok: false, reason: 'list-fork' };
      if (list.number === last.number + 1 && list.prev !== last.hash) return { ok: false, reason: 'list-fork' };
    }
    var eff = typeof ctx.anchor === 'number' ? Math.max(ctx.anchor, list.signed_at) : list.signed_at;
    return { ok: true, reason: null, hash: hash, effAnchor: eff, outOfDate: TK.isExpired(list.expires, eff) };
  }
  function commit(ctx, list, hash) { ctx.state = ctx.state || {}; ctx.state.last = { number: list.number, hash: hash }; }

  // ── what a person sees: one row per entry ──
  // ctx adds: installed {id: version}, release(entry) -> bytes | null (async; what this device holds), base {sha256} | null, policySets (count in the POLICY now), prev (the previous accepted list, for the major-bump rule), log
  async function classify(list, ctx) {
    var log = ctx.log || function () {}, rows = [], byId = {}, prev = {}; ((ctx.prev && ctx.prev.entries) || []).forEach(function (e) { prev[e.id] = e.current; });
    list.entries.forEach(function (e) { byId[e.id] = e; });
    for (var i = 0; i < list.entries.length; i++) {
      var e = list.entries[i], row = { id: e.id, kind: e.kind, current: e.current, minimum: e.minimum, installed: (ctx.installed || {})[e.id] || null, reason: e.reason || null, yanked: e.status === 'withdrawn', warn: [], state: null, changelog: e.changelog || null };
      var inst = row.installed, bad = entryProblem(e) || changelogProblem(e, prev[e.id]);
      var held = null;
      if (bad) { row.state = 'invalid'; row.reason = bad; }
      else if (e.status === 'withdrawn') row.state = 'withdrawn';
      else if (inst && ok(inst) && V.compare(inst, e.current) >= 0) row.state = 'current';
      else if (e.base && ctx.base && /*UL:BASE*/ e.base.sha256 !== ctx.base.sha256) { row.state = 'refused-base-change'; row.reason = 'this package changes the base; re-found the space to adopt it'; }
      else {
        var bytes = typeof ctx.release === 'function' ? await ctx.release(e) : null;
        if (bytes == null) { row.state = e.carrier === 'pub' ? 'not-downloaded' : 'update-available'; if (e.carrier === 'url') row.warn.push('url-carrier-unchecked'); }
        else if (/*UL:HASH*/ (await TK.sha256hex(bytes)) !== e.hash || bytes.length !== e.size) { row.state = 'hash-mismatch'; row.reason = 'the release does not match the list'; }
        else row.state = e.status === 'expired' ? 'expired' : 'update-available';
        /*UL:CAP*/ if (e.apply === 'policy' && (row.state === 'update-available' || row.state === 'expired') && (ctx.policySets || 0) >= LIMITS.policy_upcaster_sets) { row.state = 'apply-blocked-cap'; row.reason = 'the policy already carries ' + LIMITS.policy_upcaster_sets + ' translation sets: compact before applying'; }
      }
      rows.push(row);
    }
    rows.forEach(function (r) { var e = byId[r.id]; Object.keys((e && e.requires) || {}).forEach(function (d) { if (byId[d] && byId[d].status === 'withdrawn') r.warn.push('depends-on-withdrawn:' + d); }); });
    rows.forEach(function (r) { log('§UPD_ENTRY id=' + r.id + ' state=' + r.state + (r.yanked ? ' [YANKED]' : '') + ' installed=' + r.installed + ' current=' + r.current + (r.reason ? ' reason=' + r.reason : '') + (r.warn.length ? ' warn=' + r.warn.join(',') : '')); });
    return rows;
  }
  // A flag warns; it never stops business. Only PUBLISHING is held back for a module that is withdrawn / expired / does not match its list.
  function businessAllowed(row) { return true; }
  function publishAllowed(row) { return !!row && ['withdrawn', 'expired', 'hash-mismatch', 'refused-base-change', 'invalid', 'apply-blocked-cap'].indexOf(row.state) < 0; }

  // ── the pub area ──
  async function putRelease(pipe, space, kid, bytes) {
    var u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), hash = await TK.sha256hex(u), name = releaseName(space, kid, hash);
    if (u.length > LIMITS.release_bytes) return { ok: false, reason: 'release-too-large' };
    var r = typeof pipe.putIfAbsent === 'function' ? await pipe.putIfAbsent(name, u) : await pipe.put(name, u);
    return { ok: r !== false, name: name, hash: hash };
  }
  async function getRelease(pipe, space, entry, kids) {       // the bytes a device can fetch for an entry (name = content hash, so a name cannot lie)
    var names = await pipe.list('s/' + space + '/pub/'), want = '/release-' + entry.hash + '.json';
    for (var i = 0; i < names.length; i++) if (names[i].slice(-want.length) === want) { var b = await pipe.get(names[i]); if (b) return b; }
    return null;
  }
  async function publish(pipe, space, kid, signed, ctx) {
    var v = await verify(signed, Object.assign({}, ctx, { space: space }));
    if (!v.ok) return { ok: false, reason: v.reason };
    var prev = {}; ((ctx.prev && ctx.prev.entries) || []).forEach(function (e) { prev[e.id] = e.current; });
    for (var i = 0; i < signed.entries.length; i++) { var e = signed.entries[i], pr = entryProblem(e) || changelogProblem(e, prev[e.id]);
      if (pr) return { ok: false, reason: 'entry-' + e.id + ':' + pr };
      if (e.base && ctx.base && e.base.sha256 !== ctx.base.sha256) return { ok: false, reason: 'entry-' + e.id + ':refused-base-change' }; }       // D7: the publisher refuses too
    var name = listName(space, kid, signed.number), bytes = new TextEncoder().encode(JSON.stringify(signed));
    var r = typeof pipe.putIfAbsent === 'function' ? await pipe.putIfAbsent(name, bytes) : await pipe.put(name, bytes);
    if (r === false) return { ok: false, reason: 'name-taken' };
    commit(ctx, signed, v.hash); return { ok: true, name: name, hash: v.hash };
  }
  // read the pub area, highest number first, return the first list that verifies; the invalid ones are reported (never fatal)
  async function pickBest(pipe, ctx) {
    var names = (await pipe.list('s/' + ctx.space + '/pub/')).filter(function (n) { return /\/update-list-\d{8}\.json$/.test(n); });
    names.sort(function (a, b) { return b.slice(-13, -5) < a.slice(-13, -5) ? -1 : 1; });
    var rejected = [];
    for (var i = 0; i < Math.min(names.length, 8); i++) {
      var bytes = await pipe.get(names[i]); if (!bytes) { rejected.push({ name: names[i], reason: 'list-missing' }); continue; }
      var list; try { list = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { rejected.push({ name: names[i], reason: 'list-malformed:json' }); continue; }
      if (list && Number(names[i].slice(-13, -5)) !== list.number) { rejected.push({ name: names[i], reason: 'list-name-mismatch' }); continue; }
      var v = await verify(list, ctx);
      if (v.ok) return { list: list, name: names[i], hash: v.hash, outOfDate: v.outOfDate, effAnchor: v.effAnchor, rejected: rejected };
      rejected.push({ name: names[i], reason: v.reason });
    }
    return { list: null, rejected: rejected };
  }
  var API = { LIMITS: LIMITS, STATUS: STATUS, SECTIONS: SECTIONS, listName: listName, releaseName: releaseName, bodyHash: bodyHash, entryProblem: entryProblem, changelogProblem: changelogProblem, listProblem: listProblem,
              verify: verify, commit: commit, classify: classify, businessAllowed: businessAllowed, publishAllowed: publishAllowed, putRelease: putRelease, getRelease: getRelease, publish: publish, pickBest: pickBest };
  global.TeamUpdates = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
