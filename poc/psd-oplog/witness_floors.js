// ⚠ DO NOT REMOVE — Scope: check-count floors for the witness suites (spec: witness_log/HYPOTHESES.md Level 3a). A suite's own gate says PASS when no check FAILS, so a suite that quietly runs fewer checks stays green; this pins each suite's check count (from witness_log/latest/<suite>.json|.txt) and trips when it drops or the suite's result is missing.
// usage: node witness_floors.js            check latest against witness_log/floors.json (exit 1 on any trip)
//        node witness_floors.js --init     write floors.json from latest when it does not exist
//        node witness_floors.js --raise    raise floors to the latest counts (NEVER lowers; lowering = edit floors.json by hand, it shows in the diff)
//        --latest <dir> --floors <file> --ledger <file>   alternative inputs (used by run_floors_test.js)
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const LATEST = arg('--latest', path.join(__dirname, 'witness_log', 'latest')), FLOORS = arg('--floors', path.join(__dirname, 'witness_log', 'floors.json'));
function firstJson(t) {   // the first balanced {...} object in the text (some suites print a JSON result followed by other lines)
  const i = t.indexOf('{'); if (i < 0) return null; let d = 0, inS = false, esc = false;
  for (let k = i; k < t.length; k++) { const c = t[k]; if (inS) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inS = false; continue; } if (c === '"') inS = true; else if (c === '{') d++; else if (c === '}' && --d === 0) { try { return JSON.parse(t.slice(i, k + 1)); } catch (e) { return null; } } }
  return null;
}
// result of one suite: { gate, n } where n = number of checks (null when the output carries no count)
function read(suite) {
  const j = path.join(LATEST, suite + '.json'), t = path.join(LATEST, suite + '.txt');
  if (fs.existsSync(j)) { const raw = fs.readFileSync(j, 'utf8'); let o = null; try { o = JSON.parse(raw); } catch (e) { o = firstJson(raw); } if (!o) return { gate: '?', n: null };
    const n = typeof o.n_checks === 'number' ? o.n_checks : Array.isArray(o.checks) ? o.checks.length : null; return { gate: o.gate || '?', n }; }
  if (fs.existsSync(t)) { const L = fs.readFileSync(t, 'utf8').split('\n'), pass = L.filter((l) => /^PASS\b/.test(l)).length, fail = L.filter((l) => /^FAIL\b/.test(l)).length; return { gate: fail ? 'FAIL' : pass ? 'PASS' : '?', n: pass + fail || null }; }
  return null;
}
const suites = () => [...new Set(fs.readdirSync(LATEST).filter((f) => /\.(json|txt)$/.test(f)).map((f) => f.replace(/\.(json|txt)$/, '')))].sort();
const LEDGER = arg('--ledger', path.join(__dirname, 'witness_log', 'ledger.jsonl')), now = {};
for (const s of suites()) { const r = read(s); if (r) now[s] = r; }
if (fs.existsSync(LEDGER)) { const last = {}; for (const l of fs.readFileSync(LEDGER, 'utf8').split('\n')) { if (!l) continue; try { const r = JSON.parse(l); last[r.suite] = r; } catch (e) {} }   // the ledger's newest row per suite wins: it carries n_checks for the suites that print to stderr
  for (const [s, r] of Object.entries(last)) { if (typeof r.n_checks === 'number' || !now[s]) now[s] = { gate: r.gate, n: typeof r.n_checks === 'number' ? r.n_checks : (now[s] ? now[s].n : null) }; else now[s] = { gate: r.gate, n: now[s].n }; } }
if (process.argv.includes('--init') || process.argv.includes('--raise')) {
  const old = fs.existsSync(FLOORS) ? JSON.parse(fs.readFileSync(FLOORS, 'utf8')) : {}; if (process.argv.includes('--init') && Object.keys(old).length) { console.log('floors.json exists: use --raise'); process.exit(0); }
  const out = { ...old }; let up = 0;
  for (const [s, r] of Object.entries(now)) { if (r.gate !== 'PASS') continue; const was = out[s] ? out[s].n : undefined, n = r.n; if (!(s in out)) { out[s] = { n }; up++; } else if (typeof n === 'number' && (was == null || n > was)) { out[s] = { n }; up++; } }
  fs.writeFileSync(FLOORS, JSON.stringify(Object.fromEntries(Object.entries(out).sort()), null, 1) + '\n'); console.log(`§FLOORS wrote ${Object.keys(out).length} suites (${up} new or raised), never lowered`); process.exit(0);
}
if (!fs.existsSync(FLOORS)) { console.log('§FLOORS no floors.json: run --init'); process.exit(2); }
const floors = JSON.parse(fs.readFileSync(FLOORS, 'utf8')); let trips = 0, ok = 0, raise = [];
for (const [s, f] of Object.entries(floors)) {
  const r = now[s];
  if (!r) { trips++; console.log(`§FLOORS TRIP ${s}: result missing (floor ${f.n == null ? 'gate only' : f.n})`); continue; }
  if (r.gate !== 'PASS') { trips++; console.log(`§FLOORS TRIP ${s}: gate ${r.gate}`); continue; }
  if (typeof f.n === 'number') { if (r.n == null || r.n < f.n) { trips++; console.log(`§FLOORS TRIP ${s}: ${r.n} checks < floor ${f.n}`); continue; } if (r.n > f.n) raise.push(`${s} ${f.n}->${r.n}`); }
  ok++;
}
console.log(`§FLOORS ${ok} ok, ${trips} trip${trips === 1 ? '' : 's'}${raise.length ? `; can raise: ${raise.join(', ')}` : ''}`); process.exit(trips ? 1 : 0);
