// ⚠ DO NOT REMOVE — Scope: how many checks a suite ran, from what it printed (witness_log/HYPOTHESES.md Level 3a). Used by witness_all.js (ledger field n_checks) and witness_floors.js.
// JSON result with n_checks or a checks array -> that count; otherwise the number of lines starting with PASS or FAIL (stdout + stderr); otherwise "all N checks pass"; otherwise null (the suite prints no count).
function countChecks(out, err) {
  const o = String(out || ''), e = String(err || '');
  try { const j = JSON.parse(o); if (typeof j.n_checks === 'number') return j.n_checks; if (Array.isArray(j.checks)) return j.checks.length; } catch (x) {}
  const lines = (o + '\n' + e).split('\n'), pf = lines.filter((l) => /^(PASS|FAIL)\b/.test(l)).length; if (pf) return pf;
  const m = (o + '\n' + e).match(/all (\d+) checks pass/); return m ? +m[1] : null;
}
module.exports = { countChecks };
