// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* team_focus.js — the FOCUS BOARD: one small signed object per device, s/<space>/f/<kid>, overwritten at every Visit (TEAMWORK_FRAMEWORK §13.12.G.1 G.1.1).
 * It rides the pipe's existing verbs (put / get / list) and adds NO post-office logic; the engine (build/comm, common/comm/comm_*.js) is not touched.
 *   publish(entries, opts) — writes my focus object, signed with this device's key (CommEnvelope.sign, same ECDSA as heads and ops).
 *   collect()              — lists s/<space>/f/ and s/<space>/h/, keeps only objects whose signature verifies against an ENROLLED device of the roster.
 * NAMED LIMITS: L1 the object is signed but NOT sealed (the engine's seal helper is private; see the spec) — the pipe operator can read which records a person has open.
 * DEP-GHPIPE-F: ghPipe._kidOfName accepts name classes o/h/r only, so on the GitHub pipe publish() is refused at the pipe ("not under my prefix"); it is caught and reported
 * once as unsupported — the Visit itself is unaffected and the strip degrades to ops+heads (no focus badges).
 * Depends on CommEnvelope. Host-neutral (ERP and Modeller share it). */
(function (global) {
  'use strict';
  var ENV = global.CommEnvelope || (typeof require === 'function' ? require('./comm_envelope.js') : null);
  var MAX_ENTRIES = 5;
  function _json(o) { return new TextEncoder().encode(JSON.stringify(o)); }
  function _unjson(b) { return JSON.parse(new TextDecoder().decode(b)); }

  // o = { store, pipe, self (device: kid, privateKey), space, person, log?, now?() }
  function create(o) {
    var SP = 's/' + o.space + '/', log = o.log || function (m) { console.log(m); }, now = o.now || function () { return Date.now(); }, unsupported = null, lastSig = null;

    async function publish(entries, opts) {
      opts = opts || {}; var off = !!opts.off, list = off ? [] : (entries || []).slice(0, MAX_ENTRIES).map(function (e) { return { table: String(e.table), uu: String(e.uu), label: e.label == null ? null : String(e.label), since: Number(e.since) }; });
      if (unsupported) return { ok: false, reason: 'unsupported', detail: unsupported };
      var obj = { v: 1, kind: 'focus', space: o.space, kid: o.self.kid, author: o.self.kid, person: String(o.person || ''), ts: now(), since: opts.since == null ? null : Number(opts.since), focus: list, off: off };
      if (typeof opts.avatar === 'string' && /^[a-z0-9]{1,8}$/.test(opts.avatar)) obj.avatar = opts.avatar;   // §15.15.2: only the ID of a built-in avatar travels (also when off: an avatar is not 'what I am on'); the signature covers it
      var signed = await ENV.sign(obj, o.self), name = SP + 'f/' + o.self.kid;
      try { await o.pipe.put(name, _json(signed)); }
      catch (e) {
        var msg = String(e && e.message || e);
        if (/not under my prefix/.test(msg)) { unsupported = o.pipe.id + ' (' + msg + ')'; log('§PEOPLE_FOCUS_PUBLISH unsupported pipe=' + o.pipe.id + ' (this pipe accepts name classes o/h/r only — DEP-GHPIPE-F; the strip shows activity without focus badges)'); return { ok: false, reason: 'unsupported', detail: unsupported }; }
        log('§PEOPLE_FOCUS_PUBLISH FAILED pipe=' + o.pipe.id + ' ' + msg); return { ok: false, reason: 'error', detail: msg };
      }
      log('§PEOPLE_FOCUS_PUBLISH kid=' + o.self.kid + ' entries=' + list.length + ' off=' + off + (obj.avatar ? ' avatar=' + obj.avatar : '') + (list.length ? ' [' + list.map(function (e) { return e.table + ':' + String(e.uu).slice(0, 8) + ':' + (e.label || '-'); }).join(', ') + ']' : '') + ' sealed=false (L1)');
      return { ok: true, obj: signed };
    }

    // roster = (await store.order()).roster ; → { focus:[verified focus objects], heads:[{author, ts}], rejected:[{name, why}] }
    async function collect(roster) {
      var out = { focus: [], heads: [], rejected: [] }, dev = (roster && roster.devices) || {};
      async function good(name, cls) {
        var b = await o.pipe.get(name); if (!b) return null; var ob; try { ob = _unjson(b); } catch (e) { out.rejected.push({ name: name, why: 'unparseable' }); return null; }
        var kid = name.split('/')[3], d = dev[kid];
        if (!ob || ob.space !== o.space || ob.author !== kid || (cls === 'f' && ob.kid !== kid)) { out.rejected.push({ name: name, why: 'identity-mismatch' }); return null; }
        if (!d || !(await ENV.verify(ob, d.jwk))) { out.rejected.push({ name: name, why: d ? 'signature' : 'not-enrolled' }); return null; }
        return ob;
      }
      for (var n of await o.pipe.list(SP + 'f/')) { var f = await good(n, 'f'); if (f && f.kind === 'focus' && Array.isArray(f.focus)) out.focus.push(f); }
      for (var h of await o.pipe.list(SP + 'h/')) { var hd = await good(h, 'h'); if (hd && typeof hd.ts === 'number') out.heads.push({ author: hd.author, ts: hd.ts }); }
      out.rejected.forEach(function (r) { log('§PEOPLE_FOCUS_REJECT ' + r.name + ' ' + r.why); });
      return out;
    }
    return { publish: publish, collect: collect, unsupported: function () { return unsupported; } };
  }

  var API = { create: create, MAX_ENTRIES: MAX_ENTRIES };
  global.TeamFocus = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
