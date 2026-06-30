// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS HTTP FACILITATOR (Tier-2 transport adapter, DESIGN.md §7 "Demo topology").
//   A facilitator-over-HTTP: the SAME trustless interface as facilitator.makeFacilitator(), but every
//   read/write is store-and-forward over an INJECTED transport (get/put) → durable, cross-network,
//   async (GitHub / OCI). It bakes in NO fetch: the caller supplies get/put, so it is testable WITHOUT
//   network (a mock in-memory map). It holds NO truth — truth is signed (Connectors.verifyChain) and
//   content-addressed (Protocol.casKey). It can only mirror signed ops + CAS blobs + presence. It CANNOT
//   forge an op (verifyChain rejects on pull/push), alter a blob (casKey mismatch rejects on get), or
//   rewrite history (no-history-rewrite extends the stored prefix). Reuses connectors/protocol crypto +
//   CAS VERBATIM — never re-implements them, never forks the frozen engine. Pure given the transport:
//   no Date.now / Math.random. Methods return Promises (I/O is async). Read the log after every run.
//
//   ── opts (the injected transport seam) ─────────────────────────────────────────────────────────
//     makeHttpFacilitator({
//       get(path) -> Promise<string|null>,   // fetch a stored doc body (null if absent)
//       put(path, body, contentType) -> Promise<void>,   // store a doc body (caller obeys MIME)
//       base?,                               // optional path prefix (e.g. repo/Pages subtree)
//       auth?                                // opaque token the caller's put may use (GH API / OCI)
//     })
//
//   ── Path layout (dumb + content-addressed; one doc per key) ─────────────────────────────────────
//     branches/<branch>.log.json   — the FULL signed op array (the branch chain from GENESIS)
//     cas/<key>.json               — one content-addressed shared-datum blob (key = Protocol.casKey)
//     tips.json                    — { branch: tipHash } ref directory (rebuilt sorted on read)
//     presence/<branch>.json       — latest heartbeat for a branch (awareness only, carries tip)
//     presence/index.json          — sorted [branch] set (the transport has no LIST primitive)
//
//   ── Live binding examples (NOT baked in — the caller wires these to fetch) ───────────────────────
//   GitHub (raw = read, API = write; GH is natively content-addressed = our CAS, §7):
//     get: async p => { const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${REF}/${p}`);
//                       return r.ok ? await r.text() : null; }                    // 404 → null
//     put: async (p, body) => {                                                   // GH Contents API
//       const url = `https://api.github.com/repos/${REPO}/contents/${p}`;
//       const cur = await fetch(url, { headers: { Authorization: `token ${TOKEN}` } });
//       const sha = cur.ok ? (await cur.json()).sha : undefined;                  // update vs create
//       await fetch(url, { method: 'PUT', headers: { Authorization: `token ${TOKEN}` },
//         body: JSON.stringify({ message: `facilitator ${p}`, content: btoa(body), sha }) }); }
//
//   OCI object storage (second remote user; EVERY put MUST set --content-type, deploy/OCI_UPLOAD.md §RULES):
//     get: async p => { const r = await fetch(`${PAR_BASE}/${p}`); return r.ok ? await r.text() : null; }
//     put: async (p, body, ct) => { await fetch(`${PAR_WRITE}/${p}`, { method: 'PUT',
//            headers: { 'Content-Type': ct || 'application/json' }, body }); }     // ct REQUIRED (nosniff)
'use strict';
var C = (typeof require !== 'undefined') ? require('./connectors') : (self.TeamsConnectors);
var P = (typeof require !== 'undefined') ? require('./protocol')   : (self.TeamsProtocol);
var F = (typeof require !== 'undefined') ? require('./facilitator'): (self.TeamsFacilitator);

var JSON_CT = 'application/json';

// op_hash sequence of a log (the identity of a branch chain prefix).
function _hashes(log) { return (log || []).map(function (o) { return o.op_hash; }); }

// no-op logger seam (the witness asserts the WHY, not console noise). Reasons are logged here so a
// withheld/tampered doc is never SILENTLY served — it is rejected with a named cause.
function _reject(reason, detail) {
  if (typeof console !== 'undefined' && console.warn)
    console.warn('   ⛔ transport reject — ' + reason + (detail ? ' (' + detail + ')' : ''));
  return reason;
}

function makeHttpFacilitator(opts) {
  opts = opts || {};
  if (typeof opts.get !== 'function' || typeof opts.put !== 'function')
    throw new Error('makeHttpFacilitator: opts.get and opts.put are required (the injected transport seam)');
  var base = opts.base ? String(opts.base).replace(/\/+$/, '') + '/' : '';
  // §S8 (teams/ROADMAP.md Phase E): the chain verifier is INJECTABLE. Default = Connectors.verifyChain
  // (the BIM teams canonical) — UNCHANGED for every existing caller. An ERP caller passes the kernel_ops
  // canonical verifier (teams/erp/erp_sync.erpVerifyChain) so the SAME transport store-and-forwards a real
  // ERP kernel_ops branch. The transport still holds NO truth — it only runs whichever verifier it's given.
  var verifyChain = (typeof opts.verifyChain === 'function') ? opts.verifyChain : C.verifyChain;

  function path(p) { return base + p; }
  function logPath(branch)   { return path('branches/' + branch + '.log.json'); }
  function casPath(key)      { return path('cas/' + key + '.json'); }
  function presPath(branch)  { return path('presence/' + branch + '.json'); }
  var TIPS_PATH = path('tips.json');
  var PRES_INDEX = path('presence/index.json');

  // ── transport helpers (parse JSON or null; write JSON) ──────────────────────
  function readJson(p) {
    return Promise.resolve(opts.get(p)).then(function (body) {
      if (body == null) return null;
      try { return JSON.parse(body); } catch (e) { _reject('corrupt-json', p); return null; }
    });
  }
  function writeJson(p, value) {
    return Promise.resolve(opts.put(p, JSON.stringify(value), JSON_CT));
  }

  // tips.json index (rebuilt SORTED on read → deterministic regardless of write order, §convergence).
  function readTips() { return readJson(TIPS_PATH).then(function (t) { return t || {}; }); }
  function sortedTips(t) {
    var out = {}; Object.keys(t).sort().forEach(function (b) { out[b] = t[b]; }); return out;
  }
  function updateTip(branch, tipHash) {
    return readTips().then(function (t) { t[branch] = tipHash; return writeJson(TIPS_PATH, sortedTips(t)); });
  }

  return {
    _isHttp: true,
    _opts: opts,

    // ── store-and-forward signed ops ────────────────────────────────────────
    // pushOps: GET stored log → verifyChain the incoming log → enforce no-history-rewrite (must extend
    // the stored prefix) → PUT. Idempotent on replay (accepted 0, tip unchanged). Returns {accepted,
    // rejected:[{at,why}]} — the SAME shape as facilitator.makeFacilitator().pushOps.
    pushOps: function (branch, ops) {
      ops = ops || [];
      var self = this;
      return readJson(logPath(branch)).then(function (prev) {
        prev = prev || [];
        var v = verifyChain(ops);
        if (!v.ok) { _reject('verifyChain:' + v.why, branch + '@' + v.at); return { accepted: 0, rejected: [{ at: v.at, why: v.why }] }; }
        if (!F._extendsPrefix(_hashes(prev), _hashes(ops))) {
          _reject('rewrite', branch + ' prev=' + prev.length + ' next=' + ops.length);
          return { accepted: 0, rejected: [{ at: prev.length, why: 'rewrite' }] };
        }
        var accepted = ops.length - prev.length;
        if (accepted === 0) return { accepted: 0, rejected: [] }; // replay: nothing new, no write needed
        var tip = ops.length ? ops[ops.length - 1].op_hash : 'GENESIS';
        return writeJson(logPath(branch), ops.slice())
          .then(function () { return updateTip(branch, tip); })
          .then(function () { return { accepted: accepted, rejected: [] }; });
      });
    },

    // pullOps: GET the branch log, RE-VERIFY the chain (a tampered/withheld doc is REJECTED, returns []
    // + a logged reason — never silently served). Honor sinceHash: return ops AFTER the matching tip
    // (whole log on GENESIS/unknown — the puller re-detects gaps via prev_hash).
    pullOps: function (branch, sinceHash) {
      return readJson(logPath(branch)).then(function (log) {
        log = log || [];
        var v = verifyChain(log);
        if (!v.ok) { _reject('verifyChain:' + v.why, 'pull ' + branch + '@' + v.at); return []; }
        if (!sinceHash || sinceHash === 'GENESIS') return log.slice();
        for (var i = 0; i < log.length; i++) if (log[i].op_hash === sinceHash) return log.slice(i + 1);
        return log.slice();
      });
    },

    // tips: GET the ref directory (sorted keys → deterministic). A joining peer pulls each branch.
    tips: function () { return readTips().then(function (t) { return sortedTips(t); }); },

    // ── CAS blob store (content-addressed, immutable, dedup) ─────────────────
    // putBlob: key = Protocol.casKey(datum); skip the PUT if the key already resolves (dedup). The
    // facilitator cannot alter the blob — any change moves the key.
    putBlob: function (datum) {
      var key = P.casKey(datum);
      return Promise.resolve(opts.get(casPath(key))).then(function (existing) {
        if (existing != null) return key; // dedup: identical content already stored
        return writeJson(casPath(key), datum).then(function () { return key; });
      });
    },

    // getBlob: GET cas/<key>.json, RECOMPUTE Protocol.casKey and REJECT if it ≠ key (content-addressing
    // check → a corrupted/substituted blob is never served). Missing key → null.
    getBlob: function (key) {
      return readJson(casPath(key)).then(function (datum) {
        if (datum == null) return null;
        var recomputed = P.casKey(datum);
        if (recomputed !== key) { _reject('cas-mismatch', 'want=' + key + ' got=' + recomputed); return null; }
        return datum;
      });
    },

    // ── Tier-1 presence broker (awareness only — carries tips, never ops) ────
    // announce: store the LATEST heartbeat per branch (keep max ts), maintain a sorted branch index
    // (the transport has no LIST primitive). Returns the present-branch count (deterministic).
    announce: function (hb) {
      if (!hb || hb.kind !== 'heartbeat' || hb.branch == null)
        return readJson(PRES_INDEX).then(function (idx) { return (idx || []).length; });
      var branch = hb.branch;
      return readJson(presPath(branch)).then(function (cur) {
        var keep = (!cur || hb.ts > cur.ts) ? hb : cur;
        return writeJson(presPath(branch), keep).then(function () {
          return readJson(PRES_INDEX).then(function (idx) {
            idx = idx || [];
            if (idx.indexOf(branch) < 0) { idx = idx.concat([branch]).sort(); return writeJson(PRES_INDEX, idx).then(function () { return idx.length; }); }
            return idx.length;
          });
        });
      });
    },

    // presence: read the branch index → read each branch's latest heartbeat → summarize (latest per
    // branch) via Protocol.summarizeHeartbeats (reused, not re-implemented). Deterministic map.
    presence: function () {
      return readJson(PRES_INDEX).then(function (idx) {
        idx = (idx || []).slice().sort();
        return Promise.all(idx.map(function (b) { return readJson(presPath(b)); })).then(function (beats) {
          return P.summarizeHeartbeats(beats.filter(function (h) { return h != null; }));
        });
      });
    }
  };
}

var T = { makeHttpFacilitator: makeHttpFacilitator };
if (typeof module === 'object' && module.exports) module.exports = T;
else (typeof self !== 'undefined' ? self : this).TeamsTransport = T;
