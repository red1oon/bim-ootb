// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ws_policy.js - what an AI identity may do over time, enforced by the HOST, never by the model (bim-compiler prompts/ERP_WS_API.md S7, docs/ERP_AI_ADVISORY.md).
//   Written from the expert guidance gathered 2026-10-17 (OWASP LLM06:2025 / AI Agent Security cheat sheet, MCP security best practices, NSA/CISA "Careful Adoption of Agentic AI Services"):
//     - short-lived identities            -> expires_at; at expiry the host DEACTIVATES the user (the same effect as a revoke) and says nothing more than legacy's "Error login - User invalid"
//     - rate / volume limits              -> max_calls_per_minute, max_writes_per_hour (sliding windows); a refused call writes nothing and raises a §WS-ALERT line
//     - approval bound to the exact action-> approve_writes: a write is STAGED, not run; a person approves by the request's DIGEST (sha256 of the exact body), so an approval cannot be replayed on a different request
//   Policy rows come from ws_agent.js (table ws_agent_policy). An identity WITHOUT a row (the stock WebService user) is left exactly as legacy has it - nothing is invented for it.
// Pure of HTTP. The host gives { q, run(sql), now() }.
'use strict';
const crypto = require('crypto');
const WRITE_METHODS = /^(create_data|update_data|delete_data|set_docaction|run_process|create_update_data)$/;
function create(host) {
  const q = host.q, now = host.now || (() => Date.now());
  const calls = {}, writes = {}, pending = [], alerts = [];   // userId -> [timestamps]
  let nextId = 1;
  function alert(kind, who, detail) { const a = { at: new Date(now()).toISOString(), kind: kind, who: who, detail: detail }; alerts.push(a); if (host.onAlert) host.onAlert(a); return a; }
  function policyOf(userId) { try { return (q('SELECT * FROM ws_agent_policy WHERE ad_user_id=?', [userId]) || [])[0] || null; } catch (e) { return null; } }
  function within(map, key, windowMs) { const t = now(), a = (map[key] = (map[key] || []).filter(x => t - x < windowMs)); return a; }
  const digest = (body) => crypto.createHash('sha256').update(String(body)).digest('hex');
  // before(session, method, body) -> null (go on) | { error } (refuse, nothing written) | { staged: id, digest }
  function before(session, method, body, opts) {
    opts = opts || {};
    const pol = policyOf(session.userId); if (!pol) return null;
    const who = session.actor, t = now();
    // on-behalf-of: the person the agent acts for must SIGN the exact request (HMAC-SHA256 over sha256(body) with the key issued to that person at create time);
    // a stated name is never taken on trust. Verified -> opts.principal (journalled); bad signature -> refused; absent -> allowed unless the identity was created with --require-principal.
    const ob = opts.onBehalf;
    if (opts.approved) { /* the signature was checked when the request was staged; the person approving is journalled apart */ }
    else if (ob && ob.name) {
      const row = (function () { try { return (q('SELECT key FROM ws_agent_principal WHERE ad_user_id=? AND principal=?', [session.userId, ob.name]) || [])[0]; } catch (e) { return null; } })();
      const want = row ? crypto.createHmac('sha256', row.key).update(digest(ob.raw != null ? ob.raw : body)).digest('hex') : null;
      if (!want || String(ob.sig || '') !== want) { alert('principal-mismatch', who, 'on-behalf-of "' + ob.name + '" ' + (row ? 'signature does not match the request' : 'is not a registered person for this identity')); return { error: 'Web Service Error: on-behalf-of signature invalid' }; }
      opts.principal = ob.name;
    } else if (pol.require_principal === 'Y') { alert('principal-missing', who, 'request without a signed on-behalf-of person'); return { error: 'Web Service Error: this identity must name, and sign for, the person it acts for' }; }
    if (pol.expires_at && t >= Date.parse(pol.expires_at)) {                       // short-lived identity: expiry = revoke
      try { host.run("UPDATE ad_user SET isactive='N' WHERE ad_user_id=" + Number(session.userId) + ";\nUPDATE ad_role SET isactive='N' WHERE ad_role_id=" + Number(session.roleId) + ";\n"); } catch (e) { /* kernel absent */ }
      alert('expired', who, 'identity expired at ' + pol.expires_at + ' and was deactivated');
      return { error: 'Error login - User invalid', login: true };
    }
    const c = within(calls, session.userId, 60000);
    if (pol.max_calls_per_minute && c.length >= Number(pol.max_calls_per_minute)) { alert('call-limit', who, c.length + ' calls in the last minute (limit ' + pol.max_calls_per_minute + ')'); return { error: 'Web Service Error: call limit reached for this identity (' + pol.max_calls_per_minute + ' per minute)' }; }
    c.push(t);
    if (!WRITE_METHODS.test(method)) return null;
    const w = within(writes, session.userId, 3600000);
    if (pol.max_writes_per_hour && w.length >= Number(pol.max_writes_per_hour)) { alert('write-limit', who, w.length + ' writes in the last hour (limit ' + pol.max_writes_per_hour + ')'); return { error: 'Web Service Error: write limit reached for this identity (' + pol.max_writes_per_hour + ' per hour); nothing was written' }; }
    if (pol.approve_writes === 'Y' && !opts.approved) {                            // approval bound to the exact action
      const id = nextId++, d = digest(body);
      pending.push({ id: id, principal: opts.principal || null, at: new Date(t).toISOString(), actor: who, userId: session.userId, method: method, digest: d, body: body, state: 'PENDING' });
      alert('staged', who, 'request #' + id + ' ' + method + ' staged for a person (digest ' + d.slice(0, 12) + ')');
      return { staged: id, digest: d, error: 'Pending approval: request #' + id + ' (' + method + ') was staged for a person and NOTHING was written. Do not retry; a person approves it by its digest ' + d.slice(0, 12) + '.' };
    }
    w.push(t);
    return null;
  }
  function list() { return pending.map(p => ({ id: p.id, at: p.at, actor: p.actor, method: p.method, digest: p.digest.slice(0, 12), state: p.state })); }
  // approve(id, digestPrefix, approver, run) -> { ok, error, result }: runs the STAGED body exactly once, only if the digest matches what the person was shown
  function approve(id, digestPrefix, approver, run) {
    const p = pending.find(x => x.id === Number(id));
    if (!p) return { ok: false, error: 'no such pending request #' + id };
    if (p.state !== 'PENDING') return { ok: false, error: 'request #' + id + ' is already ' + p.state };
    if (!digestPrefix || digestPrefix.length < 8 || p.digest.indexOf(digestPrefix) !== 0) { alert('approval-mismatch', approver, 'digest does not match request #' + id); return { ok: false, error: 'digest does not match request #' + id + ' (an approval is bound to the exact request)' }; }
    p.state = 'APPROVED'; p.approver = approver;
    const result = run(p); alert('approved', approver, 'request #' + id + ' ' + p.method + ' executed as ' + p.actor);
    return { ok: true, result: result, actor: p.actor };
  }
  function reject(id, approver) { const p = pending.find(x => x.id === Number(id)); if (!p || p.state !== 'PENDING') return { ok: false, error: 'no pending request #' + id }; p.state = 'REJECTED'; p.approver = approver; alert('rejected', approver, 'request #' + id + ' rejected'); return { ok: true }; }
  return { before: before, list: list, approve: approve, reject: reject, alerts: alerts, pending: pending, digest: digest };
}
module.exports = { create: create, WRITE_METHODS: WRITE_METHODS };
