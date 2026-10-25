// ⚠ DO NOT REMOVE — Scope: the amended §13.12.J.2 (event versioning) on the kernel op-log. Spec: prompts/TEAMWORK_FRAMEWORK.md §16.30. Witness: scripts/poc_op_versions.js (W-OP-VERSIONS). READ THE LOG after every run.
// Layers on the kernel's op rows (replayOps) and the existing signed `_sv` stamp (build/erp/op_upcaster.js, NOT edited). Nothing here rewrites a stored op: every upcast is done on a COPY, at read time.
// What it adds to op_upcaster.js: upcasters as SIGNED DATA (fixed vocabulary, no code), parking instead of throwing, `min_v` retirement, dependency parking, a tolerant reader, a provisional ledger hash, chain-gap checks at load.
// Reading of J.2 (spec §16.30): appV[op] = the shape the app's reducer reads (changes with an app release); a loaded set only supplies the old -> appV steps. v > appV -> PARKED needs-upgrade; a missing rung -> PARKED needs-mapping.
//   OpVersions.create({trust:{<signerId>: verify(hashHex, sigHex) -> Promise<bool>}} | {verifySet: async set -> null|'unsigned'|'untrusted-signer'|'bad-signature'}) -> R
//     R.setApp(op, v) · R.setPolicy({min_v:{op:n}}) · R.setShape(op, {defaults:{k:v}}) · await R.loadSet(set) -> {ok, reason?}
//     R.fold(rows) -> {folded, parked:[{id,op_uuid,reason}], refused:[…], parked_count, provisional}      (sync, deterministic; call it again after loading a set / changing appV — there is no timer)
//     await R.ledgerOf(result) -> sha256 hex over the folded ops only
//   OpVersions.setHash(set) -> sha256 hex of the canonical JSON of the set without `sig` (what the admin signs) · OpVersions.canonical(x)
'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.ERP = root.ERP || {}; root.ERP.OpVersions = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {

  var VERBS = { rename: 1, default: 1, drop: 1, split: 1, merge: 1 };
  function canonical(x) {
    if (x === null || typeof x !== 'object') return JSON.stringify(x);
    if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
    return '{' + Object.keys(x).sort().map(function (k) { return JSON.stringify(k) + ':' + canonical(x[k]); }).join(',') + '}';
  }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function sha256(text) {
    var c = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto : require('crypto').webcrypto;
    return c.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(hex);
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function paramsOf(o) { var p = o.parameters; return (typeof p === 'string') ? JSON.parse(p) : p; }
  function isVersion(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 1; }
  function setHash(set) { var s = clone(set); delete s.sig; return sha256(canonical(s)); }

  // one map entry = { at?: "<array>[]", <one verb>: args }
  function validEntry(e) {
    if (!e || typeof e !== 'object') return false;
    var verbs = Object.keys(e).filter(function (k) { return k !== 'at'; });
    if (verbs.length !== 1 || !VERBS[verbs[0]]) return false;
    if (e.at !== undefined && !(typeof e.at === 'string' && /^[A-Za-z_][A-Za-z0-9_]*(\[\])?$/.test(e.at))) return false;
    var a = e[verbs[0]];
    switch (verbs[0]) {
      case 'rename': return Array.isArray(a) && a.length === 2 && typeof a[0] === 'string' && typeof a[1] === 'string';
      case 'default': return Array.isArray(a) && a.length === 2 && typeof a[0] === 'string';
      case 'drop': return typeof a === 'string';
      case 'split': return a && typeof a.from === 'string' && Array.isArray(a.into) && a.into.length === 2 && typeof a.sep === 'string';
      case 'merge': return a && Array.isArray(a.from) && a.from.length === 2 && typeof a.into === 'string' && typeof a.sep === 'string';
    }
    return false;
  }
  function applyEntry(o, e) {
    var verb = Object.keys(e).filter(function (k) { return k !== 'at'; })[0], a = e[verb];
    if (verb === 'rename') { if (a[0] in o) { o[a[1]] = o[a[0]]; delete o[a[0]]; } }
    else if (verb === 'default') { if (!(a[0] in o)) o[a[0]] = a[1]; }
    else if (verb === 'drop') { delete o[a]; }
    else if (verb === 'split') { if (typeof o[a.from] === 'string') { var parts = o[a.from].split(a.sep); o[a.into[0]] = parts[0]; o[a.into[1]] = parts.slice(1).join(a.sep); delete o[a.from]; } }
    else if (verb === 'merge') { if (a.from[0] in o || a.from[1] in o) { o[a.into] = [o[a.from[0]], o[a.from[1]]].join(a.sep); delete o[a.from[0]]; delete o[a.from[1]]; } }
  }
  function applyMap(p, map) {
    map.forEach(function (e) {
      if (e.at && /\[\]$/.test(e.at)) { var arr = p[e.at.slice(0, -2)]; if (Array.isArray(arr)) arr.forEach(function (el) { if (el && typeof el === 'object') applyEntry(el, e); }); }   // 'lines[]' = every element of that array
      else if (e.at) { var sub = p[e.at]; if (sub && typeof sub === 'object' && !Array.isArray(sub)) applyEntry(sub, e); }                                                      // 'fields' = that nested object (the CRUD ops' own shape)
      else applyEntry(p, e);
    });
  }

  function create(opts) {
    var trust = (opts && opts.trust) || {}, appVs = {}, steps = {}, policy = { min_v: {} }, shapes = {};

    function setApp(op, v) { appVs[op] = v; }
    function setPolicy(p) { policy = { min_v: (p && p.min_v) || {} }; }
    function setShape(op, shape) { shapes[op] = shape || {}; }

    async function loadSet(set) {
      function refuse(reason) { console.log('§OPV_SET_REFUSED ' + reason + ' op=' + (set && set.op)); return { ok: false, reason: reason }; }
      if (!set || set.kind !== 'upcasters' || typeof set.op !== 'string' || !Array.isArray(set.steps) || !set.steps.length) return refuse('bad-set');
      if (opts && typeof opts.verifySet === 'function') {          // the host decides how a set is signed and who is trusted (§16.32: the Modeller uses the plan's own scheme and key list)
        var why = await opts.verifySet(set); if (why) return refuse(why);
      } else {
        if (!set.sig) return refuse('unsigned');
        var verify = trust[set.signer];
        if (!verify) return refuse('untrusted-signer');
        var sigOk = await verify(await setHash(set), set.sig);
        if (!sigOk) return refuse('bad-signature');
      }
      for (var j = 0; j < set.steps.length; j++) {
        var st = set.steps[j];
        if (!st || !isVersion(st.from) || !Array.isArray(st.map) || !st.map.every(validEntry)) return refuse('bad-vocabulary');
      }
      var ordered = set.steps.slice().sort(function (a, b) { return a.from - b.from; });
      for (var i = 0; i < ordered.length; i++) {
        if (ordered[i].from !== ordered[0].from + i) return refuse('chain-gap');
      }
      var have = steps[set.op] || {};
      for (var c = 0; c < ordered.length; c++) { var old = have[ordered[c].from]; if (old && canonical(old) !== canonical(ordered[c].map)) return refuse('step-conflict'); }
      steps[set.op] = have; ordered.forEach(function (s) { have[s.from] = clone(s.map); });
      console.log('§OPV_SET_LOADED op=' + set.op + ' steps=' + ordered.map(function (s) { return s.from + '->' + (s.from + 1); }).join(',') + ' signer=' + set.signer);
      return { ok: true };
    }

    // the two version judgements, split so fold() can put the dependency checks between them (spec §16.30 rule 3)
    function retireReason(t, v, minV) {
      if (!isVersion(v)) return 'bogus-version';
      if (v < minV) return 'retired-version';
      return null;
    }
    function parkReason(t, v) {
      var appV = appVs[t] || 1, chain = steps[t] || {};
      if (v > appV) return 'needs-upgrade';
      for (var n = v; n < appV; n++) { if (!chain[n]) return 'needs-mapping'; }
      return null;
    }
    function minOf(t, policyParams) { var a = (policy.min_v[t]) || 1, b = policyParams && policyParams.min_v && policyParams.min_v[t]; return Math.max(a, b || 1); }
    // a version marker: an envelope body carries `sv` (the envelope itself has its own `v:3` format number — a different thing); a kernel op carries `_sv` inside its params; neither = shape 1 (legacy)
    function versionOfBody(body) { return body.sv !== undefined ? body.sv : (body.params && body.params._sv !== undefined ? body.params._sv : 1); }
    // judge(body, policyParams) -> null (judge it as usual) | {verdict:'REFUSED'|'PARKED', reason}. Dependencies are the caller's (the comm fold already parks what reads a parked op).
    function judge(body, policyParams) {
      var t = body.op_type, v = versionOfBody(body), why = retireReason(t, v, minOf(t, policyParams));
      if (why) return { verdict: 'REFUSED', reason: why };
      why = parkReason(t, v);
      return why ? { verdict: 'PARKED', reason: why } : null;
    }
    function upcastInto(t, v, q) {
      var chain = steps[t] || {}, appV = appVs[t] || 1;
      for (var s = v; s < appV; s++) applyMap(q, chain[s]);
      var d = (shapes[t] && shapes[t].defaults) || {};
      Object.keys(d).forEach(function (k) { if (!(k in q)) q[k] = d[k]; });
    }
    // upcast(body) -> a COPY of the body with params in the app's current shape (call only for ops judge() let through)
    function upcast(body) {
      var t = body.op_type, v = versionOfBody(body), out = clone(body), appV = appVs[t] || 1;
      out.params = out.params || {}; upcastInto(t, v, out.params);
      if (v < appV) { if (out.sv !== undefined) out.sv = appV; else out.params._sv = appV; }
      return out;
    }

    function fold(rows) {
      var folded = [], parked = [], refused = [], parkedG = {}, refusedG = {};
      (rows || []).forEach(function (o) {
        var p = paramsOf(o), t = o.op_type, v = (p._sv === undefined) ? 1 : p._sv, appV = appVs[t] || 1, minV = minOf(t, null);
        var inputs = o.input_guids ? (typeof o.input_guids === 'string' ? JSON.parse(o.input_guids) : o.input_guids) : [];
        var dep = { parked: inputs.some(function (g) { return parkedG[g]; }), refused: inputs.some(function (g) { return refusedG[g]; }) };
        var rec = { id: o.id, op_uuid: o.op_uuid };
        function refuse(reason) { refused.push({ id: rec.id, op_uuid: rec.op_uuid, reason: reason }); if (o.output_guid) refusedG[o.output_guid] = 1; return null; }
        function park(reason) { parked.push({ id: rec.id, op_uuid: rec.op_uuid, reason: reason }); if (o.output_guid) parkedG[o.output_guid] = 1; return null; }
        var why = retireReason(t, v, minV);
        if (why) return refuse(why);
        if (dep.refused) return refuse('dep-refused');
        why = parkReason(t, v);
        if (why) return park(why);
        if (dep.parked) return park('dep-parked');
        var q = clone(p); upcastInto(t, v, q);
        if (v < appV) q._sv = appV;
        var out = {}; Object.keys(o).forEach(function (k) { out[k] = o[k]; }); out.parameters = q;          // a COPY: the stored row is never touched
        folded.push(out); return null;
      });
      return { folded: folded, parked: parked, refused: refused, parked_count: parked.length, provisional: parked.length > 0 };
    }

    // what a UI says instead of a spinning wheel: "N items need an update", and why (J.2 parking policy 2)
    function summary(result) {
      var by = function (list) { var o = {}; list.forEach(function (x) { o[x.reason] = (o[x.reason] || 0) + 1; }); return o; };
      return { parked_count: result.parked_count, provisional: result.provisional, parked_by_reason: by(result.parked), refused_by_reason: by(result.refused),
               text: result.parked_count ? result.parked_count + ' item' + (result.parked_count === 1 ? '' : 's') + ' need an update: ' + Object.keys(by(result.parked)).sort().map(function (k) { return by(result.parked)[k] + ' ' + k; }).join(', ') : '' };
    }

    function ledgerOf(result) {
      return sha256(canonical(result.folded.map(function (o) { return { uuid: o.op_uuid, type: o.op_type, params: paramsOf(o) }; })));
    }

    return { setApp: setApp, setPolicy: setPolicy, setShape: setShape, loadSet: loadSet, fold: fold, ledgerOf: ledgerOf, summary: summary, judge: judge, upcast: upcast };
  }

  console.log('§OP_VERSIONS_LOADED v1 (J.2 amended: signed declarative upcasters, parking, min_v, provisional hash)');
  return { create: create, setHash: setHash, canonical: canonical };
}));
