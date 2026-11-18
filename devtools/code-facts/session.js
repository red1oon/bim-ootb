// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.37 (owner F-26: "token usage during VSC usage with Claude Code
//   … kept track with the URL load size … history too so that each session end user can see some session summary"; answer: terminal + code-facts command).
// WHAT:  one Claude Code session in numbers, from LOCAL files only (no network, no model call, no money figures):
//          tokens      — Claude Code's own transcript (~/.claude/projects/<cwd slug>/<session>.jsonl): per-reply message.usage, each reply once (message.id)
//          shipped     — the PR links in the session's tool output, and the witness scripts its shell commands ran
//          URL load    — for each bim-ootb PR, its squash commit on the local origin/main (subject ends "(#N)"), measured against its parent by
//                        Code Facts' deploy_cost (start-up bytes and offline-cache bytes, per app)
//        History: one JSON line per session in ~/.cache/bim_codefacts/sessions.jsonl (a re-run replaces its line).
// Witness: devtools/code-facts/tests/witness_codefacts_session.js (W-CODEFACTS-SESSION).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const cost = require(path.join(__dirname, '..', 'vscode', 'code-facts', 'lib', 'deploy_cost.js'));

const HIST = () => process.env.CODEFACTS_SESSION_HISTORY || path.join(os.homedir(), '.cache', 'bim_codefacts', 'sessions.jsonl');
const projectDir = cwd => path.join(os.homedir(), '.claude', 'projects', path.resolve(cwd).replace(/[^A-Za-z0-9]/g, '-'));
/** The newest transcript of the sessions started in `cwd`. */
function lastTranscript(cwd) {
  const d = projectDir(cwd); if (!fs.existsSync(d)) return null;
  const f = fs.readdirSync(d).filter(n => n.endsWith('.jsonl')).map(n => path.join(d, n)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return f[0] || null;
}

/** Read one transcript. */
function read(file) {
  const t = { id: path.basename(file, '.jsonl'), replies: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, models: new Set(), first: null, last: null, prs: new Set(), witnesses: new Set(), dupCopies: 0 };
  const seen = new Set();
  const texts = c => typeof c === 'string' ? [c] : Array.isArray(c) ? c.flatMap(x => x && typeof x === 'object' ? texts(x.text != null ? x.text : x.content) : []) : [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch (e) { continue; }
    if (o.timestamp) { t.first = t.first || o.timestamp; t.last = o.timestamp; }
    const m = o.message || {};
    if (m.usage && m.id) {
      if (seen.has(m.id)) t.dupCopies++;   // a streamed reply is written more than once: count it once
      else { seen.add(m.id); t.replies++; const u = m.usage; t.input += u.input_tokens || 0; t.cacheWrite += u.cache_creation_input_tokens || 0; t.cacheRead += u.cache_read_input_tokens || 0; t.output += u.output_tokens || 0; if (m.model && !m.model.startsWith('<')) t.models.add(m.model); }
    }
    for (const c of Array.isArray(m.content) ? m.content : []) {
      if (c && c.type === 'tool_use' && c.input && typeof c.input.command === 'string') for (const w of c.input.command.match(/\bwitness_[a-z0-9_]+\.js\b/g) || []) t.witnesses.add(w);
      if (c && c.type === 'tool_result') for (const s of texts(c.content)) for (const p of s.match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g) || []) t.prs.add(p);
    }
  }
  return t;
}

/** The URL load change of the session's bim-ootb PRs: each squash commit on the local origin/main against its parent. */
function loadDelta(ootb, prs, since) {
  const rows = [], apps = {};
  for (const url of prs) {
    const m = /github\.com\/[\w.-]+\/bim-ootb\/pull\/(\d+)$/i.exec(url); if (!m) continue;
    let sha = '';
    try { sha = cp.execFileSync('git', ['log', 'origin/main', '--format=%H %s', ...(since ? ['--since=' + since] : [])], { cwd: ootb, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(l => l.endsWith('(#' + m[1] + ')')).map(l => l.split(' ')[0])[0] || ''; } catch (e) { sha = ''; }
    if (!sha) { rows.push({ pr: +m[1], merged: false }); continue; }
    const now = cost.measure(ootb, cost.gitReader(ootb, sha)), base = cost.measure(ootb, cost.gitReader(ootb, sha + '^'));
    const r = cost.compare(now, base).filter(x => x.bootDelta || x.precacheDelta);
    r.forEach(x => { const a = apps[x.app] || (apps[x.app] = { boot: 0, precache: 0 }); a.boot += x.bootDelta; a.precache += x.precacheDelta; });
    rows.push({ pr: +m[1], merged: true, sha: sha.slice(0, 8), apps: r.map(x => ({ app: x.app, boot: x.bootDelta, precache: x.precacheDelta })) });
  }
  return { rows, apps };
}

const signed = n => (n > 0 ? '+' : n < 0 ? '-' : '±') + cost.kb(Math.abs(n));
const big = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);

/** Summarise one transcript; record it in the history. */
function summarise(file, ootb, o) {
  o = o || {};
  const t = read(file), ld = loadDelta(ootb, t.prs, t.first);
  const mins = t.first && t.last ? Math.round((Date.parse(t.last) - Date.parse(t.first)) / 60000) : 0;
  const byRepo = {}; for (const p of t.prs) { const r = p.split('/')[4]; (byRepo[r] = byRepo[r] || []).push(+p.split('/').pop()); }
  const rec = { id: t.id, start: t.first, end: t.last, minutes: mins, replies: t.replies, models: [...t.models], tokens: { input: t.input, cacheWrite: t.cacheWrite, cacheRead: t.cacheRead, output: t.output },
    prs: byRepo, witnesses: t.witnesses.size, load: ld.apps, notMerged: ld.rows.filter(r => !r.merged).map(r => r.pr), dupCopies: t.dupCopies };
  if (!o.noHistory) {
    const h = HIST(); fs.mkdirSync(path.dirname(h), { recursive: true });
    const keep = fs.existsSync(h) ? fs.readFileSync(h, 'utf8').split('\n').filter(l => l.trim() && (() => { try { return JSON.parse(l).id !== rec.id; } catch (e) { return false; } })()) : [];
    fs.writeFileSync(h, keep.concat(JSON.stringify(rec)).join('\n') + '\n');
  }
  const apps = Object.keys(ld.apps).sort();
  const text = [
    `Session ${t.id.slice(0, 8)} · ${mins} min · ${t.replies} replies · ${[...t.models].join(', ') || '-'}`,
    `  tokens   output ${big(t.output)} · input ${big(t.input)} · cache read ${big(t.cacheRead)} · cache write ${big(t.cacheWrite)}`,
    `  shipped  ${Object.keys(byRepo).sort().map(r => r + ' ' + byRepo[r].sort((a, b) => a - b).map(n => '#' + n).join(' ')).join(' · ') || 'no PR'} · ${t.witnesses.size} witness scripts run`,
    `  URL load ${apps.length ? apps.map(a => a + ' start-up ' + signed(ld.apps[a].boot) + ', offline ' + signed(ld.apps[a].precache)).join(' · ') : 'no change to what users load'}` +
      (rec.notMerged.length ? ` · not on origin/main (as of the last fetch): ${rec.notMerged.map(n => '#' + n).join(' ')}` : ''),
  ].join('\n');
  const line = `§CODEFACTS_SESSION id=${t.id} minutes=${mins} replies=${t.replies} tokens_in=${t.input} cache_write=${t.cacheWrite} cache_read=${t.cacheRead} tokens_out=${t.output} prs=${t.prs.size} witnesses=${t.witnesses.size} ` +
    `load=${apps.map(a => a + ':boot' + (ld.apps[a].boot >= 0 ? '+' : '') + ld.apps[a].boot + ',precache' + (ld.apps[a].precache >= 0 ? '+' : '') + ld.apps[a].precache).join(';') || '-'} not_merged=${rec.notMerged.length} dup_copies=${t.dupCopies}`;
  return { rec, text, line };
}

/** The last N lines of the history, as a table. */
function history(n) {
  const h = HIST(); if (!fs.existsSync(h)) return 'no session history yet (' + h + ')';
  const rows = fs.readFileSync(h, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean).slice(-(n || 10));
  return rows.map(r => `${(r.start || '').slice(0, 16).replace('T', ' ')}  ${r.id.slice(0, 8)}  ${String(r.minutes).padStart(4)} min  out ${big(r.tokens.output).padStart(6)}  cache read ${big(r.tokens.cacheRead).padStart(6)}  ` +
    `PRs ${Object.values(r.prs).reduce((a, b) => a + b.length, 0)}  load ${Object.keys(r.load).map(a => a + ' ' + signed(r.load[a].boot + r.load[a].precache)).join(', ') || '-'}`).join('\n');
}

module.exports = { read, loadDelta, summarise, history, lastTranscript, projectDir, HIST };
