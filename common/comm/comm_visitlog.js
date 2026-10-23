// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* comm_visitlog.js — note each post-office visit in the Gmail visit log (the BIM Team Postbox Apps Script).
 * Implementing prompts/TEAMWORK_FRAMEWORK.md §11.19a + §12.14 — Witness: W-GMAIL-LOG.
 * The note is a pointer, never truth: my signed head + links to the bundle files this device has in the pipe repo.
 * A failed note never blocks a visit (the pipe is the delivery; Gmail is the visit book).
 * Google's reply to a POST arrives through a redirect that intermittently 404s even though the note WAS written
 * (W-GMAIL-LOG, 2026-10-23). So each note carries its own id (in the subject); when the reply is lost the device reads the
 * log back and confirms by id, and only re-posts when the note is really absent — never a blind duplicate.
 *   noteVisit(store, report, cfg) — cfg = { url, secret, owner, repo } → { ok, id?, error? }
 */
(function (global) {
  'use strict';
  async function noteVisit(store, report, cfg) {
    if (!cfg || !cfg.url || !cfg.secret) return { ok: false, error: 'not-configured' };
    var head = await store.signedHead(), me = store.kid;
    var links = store.query("SELECT bundle_name FROM cl_outbox WHERE state='SENT' ORDER BY to_seq DESC LIMIT 5").map(function (r) {
      return 'https://github.com/' + cfg.owner + '/' + cfg.repo + '/blob/dev/' + me + '/' + r.bundle_name; });
    var summary = 'visit by ' + me + ' · seq ' + head.seq + ' · sent ' + (report.sent || 0) + ' · fetched ' + (report.fetched || 0) +
                  ' · placed ' + (report.placed || 0) + ' · parked ' + (report.parked || 0) + ' · refused ' + (report.refused || 0) + ' · gaps ' + (report.gaps || 0);
    var hb = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(head)));
    var noteId = Array.prototype.map.call(new Uint8Array(hb), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('').slice(0, 16);
    var body = JSON.stringify({ secret: cfg.secret, space: store.space, kid: me, seq: head.seq, note_id: noteId, summary: summary, links: links, head: head });
    for (var attempt = 0; attempt < 2; attempt++) {
      var res = await _post(cfg, body);
      if (res.ok || res.error === 'secret') return res;
      try { var lg = await readLog(cfg, 15), hit = (lg.entries || []).filter(function (e) { return (e.subject || '').indexOf('#' + noteId) >= 0; })[0];
        if (hit) return { ok: true, id: hit.id, subject: hit.subject, confirmedBy: 'read-back', postError: res.error }; } catch (e) {}
    }
    return res;
  }
  async function _post(cfg, body) {
    try {
      var r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, redirect: 'follow' });   // text/plain = no CORS preflight
      var t = await r.text(), j = null; try { j = JSON.parse(t); } catch (e) {}
      if (!j) {                                   // an Apps Script error page: keep its message, never a bare parse error
        var msg = t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
        return { ok: false, error: 'http ' + r.status + ' page: ' + msg };
      }
      return j.ok ? { ok: true, id: j.id, subject: j.subject } : { ok: false, error: j.error || ('http ' + r.status) };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }
  async function readLog(cfg, max) {
    var r = await fetch(cfg.url + '?secret=' + encodeURIComponent(cfg.secret) + '&max=' + (max || 20), { redirect: 'follow' });
    return r.json();
  }
  var API = { noteVisit: noteVisit, readLog: readLog };
  global.CommVisitLog = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
