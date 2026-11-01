// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * ⚠ DO NOT REMOVE — Scope: test infrastructure for ghPipe (common/comm/comm_pipe.js:79-141). Moved here 2026-11-02 from BIMCompiler scripts/sme100_net.js (unchanged code)
 * so the relay client and its stand-in live in one tree. Used by common/tests/witness_pipe_retry.js (in-process: start()) and BIMCompiler scripts/witness_scale_star.js
 * (forked: `node common/tests/gh_standin.js serve`, port over IPC). Spec: BIMCompiler prompts/TEAMWORK_FRAMEWORK.md §45.14 / §45.14a.
 * It serves the GitHub git-data endpoints ghPipe calls, ETag/304, x-ratelimit-remaining, and ACCOUNTS every request per token and per minute against GitHub's
 * PUBLISHED limits (read 2026-11-02, https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api): 5,000 requests/hour per token; secondary:
 * 100 concurrent, 900 points/minute (GET 1, POST/PATCH/PUT/DELETE 5), 80 content-generating requests/minute, 500/hour. It COUNTS, it does not throttle.
 * It is NOT GitHub: ref propagation delay and abuse detection are not reproduced.
 */
'use strict';
var http = require('http'), crypto = require('crypto');
var GH_LIMITS = { per_hour_token: 5000, concurrent: 100, points_per_min: 900, content_per_min: 80, content_per_hour: 500, src: 'docs.github.com rate-limits-for-the-rest-api, read 2026-11-02' };
// ═════════ the GitHub stand-in (git data API subset ghPipe uses) ═════════
function serve(cb) {
  var T0 = Date.now(), blobs = {}, trees = {}, commits = {}, refs = {}, A = { total: 0, points: 0, content: 0, conc: 0, maxConc: 0, byToken: {}, byMinute: {}, byRoute: {}, notModified: 0, refused: 0 };
  var sha = function (s) { return crypto.createHash('sha1').update(s).digest('hex'); };
  function acct(token, method, route) {
    var pts = method === 'GET' ? 1 : 5, content = method !== 'GET', min = Math.floor((Date.now() - T0) / 60000);
    A.total++; A.points += pts; if (content) A.content++; A.byRoute[method + ' ' + route] = (A.byRoute[method + ' ' + route] || 0) + 1;
    var t = A.byToken[token] || (A.byToken[token] = { reqs: 0, points: 0, content: 0 }); t.reqs++; t.points += pts; if (content) t.content++;
    var m = A.byMinute[min] || (A.byMinute[min] = { reqs: 0, points: 0, content: 0, tokens: {} }); m.reqs++; m.points += pts; if (content) m.content++;
    var mt = m.tokens[token] || (m.tokens[token] = { reqs: 0, points: 0, content: 0 }); mt.reqs++; mt.points += pts; if (content) mt.content++;
    return t.reqs;
  }
  function summary() {
    var mins = Object.keys(A.byMinute).map(Number).sort(function (a, b) { return a - b; }), peak = { reqs: 0, points: 0, content: 0, token_points: 0, token_content: 0 };
    mins.forEach(function (k) { var m = A.byMinute[k]; peak.reqs = Math.max(peak.reqs, m.reqs); peak.points = Math.max(peak.points, m.points); peak.content = Math.max(peak.content, m.content);
      Object.keys(m.tokens).forEach(function (tk) { peak.token_points = Math.max(peak.token_points, m.tokens[tk].points); peak.token_content = Math.max(peak.token_content, m.tokens[tk].content); }); });
    var tk = Object.keys(A.byToken).map(function (k) { return A.byToken[k]; }), maxTok = tk.reduce(function (z, t) { return { reqs: Math.max(z.reqs, t.reqs), content: Math.max(z.content, t.content) }; }, { reqs: 0, content: 0 });
    return { total: A.total, points: A.points, content: A.content, not_modified: A.notModified, refused: A.refused, max_concurrent: A.maxConc, tokens: tk.length, max_token_reqs: maxTok.reqs, max_token_content: maxTok.content,
      minutes: mins.length, peak_minute: peak, by_route: A.byRoute, branches: Object.keys(refs).length, blobs: Object.keys(blobs).length, limits: GH_LIMITS };
  }
  var srv = http.createServer(function (req, res) {
    var chunks = []; req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () {
      A.conc++; if (A.conc > A.maxConc) A.maxConc = A.conc;
      var u = new URL(req.url, 'http://x'), p = u.pathname, body = null, tok = String(req.headers.authorization || 'none').replace(/^Bearer /, '');
      try { if (chunks.length) body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) {}
      function send(status, obj, etag) {
        var h = { 'Content-Type': 'application/json' }, js = obj == null ? '' : JSON.stringify(obj);
        if (etag) { h.ETag = '"' + sha(js) + '"'; if (req.headers['if-none-match'] === h.ETag) { A.notModified++; status = 304; js = ''; } }
        h['x-ratelimit-remaining'] = String(Math.max(0, GH_LIMITS.per_hour_token - ((A.byToken[tok] || {}).reqs || 0)));
        A.conc--; res.writeHead(status, h); res.end(js);
      }
      if (p === '/__acct') { A.conc--; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(summary())); return; }
      var m = /^\/repos\/[^/]+\/[^/]+(\/.*)$/.exec(p); if (!m) return send(404, { message: 'not found' });
      var r = m[1], M = req.method, x;
      var route = r.replace(/[0-9a-f]{40}/g, ':sha').replace(/dev\/[0-9a-f]+/g, 'dev/:kid');
      acct(tok, M, route);
      if (M === 'GET' && r === '/git/matching-refs/heads/dev/') return send(200, Object.keys(refs).sort().map(function (b) { return { ref: 'refs/heads/' + b, object: { sha: refs[b] } }; }), true);
      if (M === 'GET' && (x = /^\/git\/ref\/heads\/(dev\/.+)$/.exec(r))) return refs[x[1]] ? send(200, { ref: 'refs/heads/' + x[1], object: { sha: refs[x[1]] } }, true) : send(404, { message: 'Not Found' });
      if (M === 'GET' && (x = /^\/git\/commits\/([0-9a-f]{40})$/.exec(r))) return commits[x[1]] ? send(200, { sha: x[1], tree: { sha: commits[x[1]].tree }, parents: commits[x[1]].parents.map(function (s) { return { sha: s }; }) }, true) : send(404, {});
      if (M === 'GET' && (x = /^\/git\/trees\/([0-9a-f]{40})$/.exec(r))) { var tsha = commits[x[1]] ? commits[x[1]].tree : x[1], t = trees[tsha]; if (!t) return send(404, {});
        return send(200, { sha: tsha, tree: Object.keys(t).sort().map(function (pth) { return { path: pth, mode: '100644', type: 'blob', sha: t[pth].sha, size: t[pth].size }; }), truncated: false }, true); }
      if (M === 'GET' && (x = /^\/git\/blobs\/([0-9a-f]{40})$/.exec(r))) return blobs[x[1]] ? send(200, { sha: x[1], encoding: 'base64', content: blobs[x[1]].toString('base64'), size: blobs[x[1]].length }, true) : send(404, {});
      if (M === 'POST' && r === '/git/blobs') { var b = Buffer.from(String(body.content || ''), body.encoding === 'base64' ? 'base64' : 'utf8'), bs = sha('blob ' + b.length + '\0' + b.toString('base64')); blobs[bs] = b; return send(201, { sha: bs }); }
      if (M === 'POST' && r === '/git/trees') { var nt = Object.assign({}, body.base_tree && trees[body.base_tree] ? trees[body.base_tree] : {});
        (body.tree || []).forEach(function (e) { nt[e.path] = { sha: e.sha, size: blobs[e.sha] ? blobs[e.sha].length : 0 }; });
        var ts = sha('tree ' + JSON.stringify(Object.keys(nt).sort().map(function (k) { return [k, nt[k].sha]; }))); trees[ts] = nt; return send(201, { sha: ts }); }
      if (M === 'POST' && r === '/git/commits') { var cs = sha('commit ' + body.tree + ' ' + (body.parents || []).join(',') + ' ' + body.message + ' ' + process.hrtime.bigint()); commits[cs] = { tree: body.tree, parents: body.parents || [] }; return send(201, { sha: cs }); }
      if (M === 'PATCH' && (x = /^\/git\/refs\/heads\/(dev\/.+)$/.exec(r))) { var cur = refs[x[1]], nc = commits[body.sha];
        if (!cur || !nc || (!body.force && nc.parents.indexOf(cur) < 0)) { A.refused++; return send(422, { message: 'Update is not a fast forward' }); }
        refs[x[1]] = body.sha; return send(200, { ref: 'refs/heads/' + x[1], object: { sha: body.sha } }); }
      if (M === 'POST' && r === '/git/refs') { var rn = String(body.ref || '').replace('refs/heads/', ''); if (refs[rn]) { A.refused++; return send(422, { message: 'Reference already exists' }); } refs[rn] = body.sha; return send(201, { ref: body.ref, object: { sha: body.sha } }); }
      send(404, { message: 'stand-in: unsupported ' + M + ' ' + r });
    });
  });
  srv.listen(0, '127.0.0.1', function () { var port = srv.address().port; if (cb) return cb({ port: port, close: function () { srv.close(); }, acct: summary }); if (process.send) process.send({ port: port }); else console.log('§GH-STANDIN port=' + port); });
}

function start() { return new Promise(function (res) { serve(res); }); }
module.exports = { start: start, GH_LIMITS: GH_LIMITS };
if (require.main === module && process.argv[2] === 'serve') serve();
