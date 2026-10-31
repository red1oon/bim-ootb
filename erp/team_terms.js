// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: the TEST HARNESS button, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §48.3 step 3. Witness: erp/tests/witness_team_terms.js. READ THE LOG after every run.
// Answers "are the terms enforced?" from a RECORDED run of `node scripts/witness_terms.js --json` (erp/team_terms.json, schema terms-v1). The browser cannot run the node witnesses, so the panel
// says so, shows when the run was made, and prints the command that reproduces it. Rules: an OPEN term is never green and is listed first; a row is green only if its status is ENFORCED,
// every witness says PASS and every control was found; an empty or unreadable record is INCONCLUSIVE, never green. Twin rule: Team lane only — no core window or DocAction is touched.
(function (G) {
  'use strict';
  var CMD = 'node scripts/witness_terms.js --json out.json';
  function green(r) { return r.status === 'ENFORCED' && (r.witnesses || []).length > 0 && r.witnesses.every(function (w) { return w.verdict === 'PASS'; }) && (r.controls || []).length > 0 && r.controls.every(function (c) { return c.found === true; }); }
  // pure: record -> what the panel shows (rows ordered open first; colour decided here, nowhere else)
  function model(rec) {
    if (!rec || rec.schema !== 'terms-v1' || !Array.isArray(rec.rows) || !rec.rows.length) return { verdict: 'INCONCLUSIVE', rows: [], counts: {}, why: 'no terms-v1 record with rows' };
    var rank = { OPEN: 0, 'WITNESS-FAILED': 1, UNCONTROLLED: 2, ENFORCED: 3 }, counts = {};
    var rows = rec.rows.map(function (r) {
      var colour = r.status === 'OPEN' ? 'amber' : (green(r) ? 'green' : 'red'), st = (r.status === 'ENFORCED' && colour !== 'green') ? 'UNCONTROLLED' : r.status;
      counts[st] = (counts[st] || 0) + 1;
      return { id: r.id, term: r.term, guarantee: r.guarantee, status: st, colour: colour, roadmap: r.roadmap || null, note: r.note || null,
               witnesses: (r.witnesses || []).map(function (w) { return w.file + ' ' + w.verdict; }), controls: (r.controls || []).map(function (c) { return { id: c.id, found: !!c.found, evidence: c.evidence || null }; }) };
    });
    rows.sort(function (a, b) { return (rank[a.status] == null ? 9 : rank[a.status]) - (rank[b.status] == null ? 9 : rank[b.status]); });
    var bad = rows.some(function (r) { return r.colour === 'red'; });
    return { verdict: bad ? 'FAIL' : 'PASS', rows: rows, counts: counts, at: rec.at || null, node: rec.node || null };
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var COL = { green: '#1a7f37', amber: '#9a6700', red: '#b3261e' };
  function html(m, ageDays) {
    var h = '<div style="font:12px sans-serif;padding:8px"><b>Terms — are they enforced?</b> <span id="tt-verdict">' + esc(m.verdict) + '</span><br>' +
      '<span>Recorded run' + (m.at ? ' of ' + esc(m.at) + (ageDays != null ? ' (' + ageDays + ' d ago)' : '') : '') + ' — the browser cannot run the witnesses. Reproduce: <code>' + CMD + '</code></span>';
    if (m.verdict === 'INCONCLUSIVE') return h + '<p style="color:' + COL.red + '">INCONCLUSIVE — ' + esc(m.why) + '. Nothing is shown green.</p></div>';
    h += '<table style="border-collapse:collapse;margin-top:6px"><tr><th align=left>Term</th><th align=left>Status</th><th align=left>Witness</th><th align=left>Broken control (must fail)</th><th align=left>Closes with</th></tr>';
    m.rows.forEach(function (r) {
      h += '<tr class="tt-row" data-id="' + esc(r.id) + '" data-status="' + r.status + '" data-colour="' + r.colour + '"><td>' + esc(r.term) + '<br><small>' + esc(r.guarantee) + '</small></td><td style="color:' + COL[r.colour] + ';font-weight:bold">' + r.status + '</td><td>' +
        (r.status === 'OPEN' ? '—' : esc(r.witnesses.join('; '))) + '</td><td>' + (r.status === 'OPEN' ? '—' : r.controls.map(function (c) { return (c.found ? '✔ ' : '✘ MISSING ') + esc(c.id); }).join('<br>')) + '</td><td>' + esc(r.roadmap || '') + (r.note ? '<br><small>' + esc(r.note) + '</small>' : '') + '</td></tr>';
    });
    return h + '</table><p><button id="tt-export" type="button">Export JSON</button> <a href="team_objectives.html" target="_blank" rel="noopener">Project quality objectives</a></p></div>';
  }
  async function load() { try { var r = await fetch('team_terms.json', { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
  async function open() {
    var rec = await load(), m = model(rec), age = m.at ? Math.floor((Date.now() - Date.parse(m.at)) / 86400000) : null, box = document.getElementById('team-terms-panel');
    if (!box) { box = document.createElement('div'); box.id = 'team-terms-panel'; box.style.cssText = 'position:fixed;right:12px;bottom:36px;max-width:min(900px,95vw);max-height:70vh;overflow:auto;background:#fff;border:1px solid #1f5fd6;border-radius:6px;z-index:9999'; document.body.appendChild(box); }
    box.innerHTML = html(m, age); box.setAttribute('data-verdict', m.verdict);
    var ex = document.getElementById('tt-export'); if (ex) ex.addEventListener('click', function () { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(rec, null, 1)], { type: 'application/json' })); a.download = 'terms-v1.json'; a.click(); });
    console.log('§TEAM_TERMS open verdict=' + m.verdict + ' counts=' + JSON.stringify(m.counts) + ' at=' + m.at);
    return m;
  }
  function ensureButton() {
    var c = document.getElementById('team-chip'); if (!c || document.getElementById('team-terms')) return;
    var b = document.createElement('button'); b.id = 'team-terms'; b.type = 'button'; b.textContent = 'Terms'; b.title = 'Are the terms enforced? (recorded witness run)';
    b.style.cssText = 'cursor:pointer;margin-left:6px;font:inherit;padding:0 8px;border:1px solid #1f5fd6;border-radius:8px;background:#fff;color:#1f5fd6';
    b.addEventListener('click', function () { var p = document.getElementById('team-terms-panel'); if (p) p.remove(); else open(); }); c.appendChild(b);
  }
  var API = { model: model, html: html, green: green, open: open, ensureButton: ensureButton, CMD: CMD };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else { G.TeamTerms = API; if (G.document) setInterval(ensureButton, 1000); }
})(typeof window !== 'undefined' ? window : globalThis);
