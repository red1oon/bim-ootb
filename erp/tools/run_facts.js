#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Implementing bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.19 (derived how-to content). Witness: W-CTXHELP-DERIVED (erp/tests/witness_ctxhelp_derived.js).
// Extracts LEGACY's own recorded outcomes from a parallel-run log (bim-compiler scripts/bridge, witness_m3_gap.js) into erp/tools/legacy_run_facts.json, read by build_help_pack.js.
//   - a scenario is kept only when the log names its table + document type (§SCN_META, read from the descriptor the legacy push used, never from the scenario's name);
//   - the verdict (§SCN) and legacy's values (§SCN_DETAIL legacy={...}) are copied as logged; the SQLite side is not read;
//   - a refusal is legacy's own AD_Message: the longest active MsgText of legacy's dictionary (the pilot DB) found inside the logged reason. No message found = no text (D4).
//   - D6: the log must be newer than the scenario sources it was run from (--bridge <dir>: witness_m3_gap.js, cycle_o2c.js), or it is refused as STALE-RUN; their sha256 is
//     recorded, so the witness can tell when bim-compiler's scenario code has changed since the run.
// Run:   node erp/tools/run_facts.js --log <run.log> --bridge <bim-compiler>/scripts/bridge [--db idempiere_pilot] [--check]
//        --check: build in memory and compare with the committed file (D2): §RUN_FACTS_CHECK PASS|FAIL.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const OUT = path.join(__dirname, 'legacy_run_facts.json');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SOURCES = ['witness_m3_gap.js', 'cycle_o2c.js'];

function parseLog(text) {
  const verdict = {}, meta = {}, legacy = {};
  text.split('\n').forEach((l) => {
    let m;
    if ((m = /^§SCN (\S+) (\S+)/.exec(l))) verdict[m[1]] = m[2];
    else if ((m = /^§SCN_META (\S+) (\{.*\})\s*$/.exec(l))) meta[m[1]] = JSON.parse(m[2]);
    else if ((m = /^§SCN_DETAIL (\S+) legacy=(\{.*?\}) sqlite=/.exec(l))) legacy[m[1]] = JSON.parse(m[2]);
  });
  return { verdict, meta, legacy };
}
// legacy's dictionary messages (the oracle): value + text, active, no placeholder (a text with @var@ / {0} is a template, not the words a user reads)
function legacyMessages(db) {
  const sql = "SELECT json_agg(json_build_array(value, msgtext)) FROM ad_message WHERE isactive='Y' AND length(msgtext) >= 8 AND msgtext NOT LIKE '%@%' AND msgtext NOT LIKE '%{%'";   // JSON: a MsgText may hold newlines
  const r = cp.spawnSync('docker', ['exec', 'postgres', 'psql', '-U', 'adempiere', '-d', db, '-At', '-c', sql], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error('legacy AD_Message not readable from ' + db + ': ' + r.stderr);
  return JSON.parse(r.stdout).map(([value, text]) => ({ value, text: String(text).trim() })).filter((x) => x.text);
}
// the CAUSE inside legacy's reason: legacy wraps a cause as '<wrapper>: <cause>' (e.g. 'Failed when processing document: Period Closed'), so every message found in the
//   reason is a span; a span inside a longer one is dropped ('Credit Hold' inside 'Business Partner with this Order over Credit Hold'), and the LAST remaining span is the cause
const messageOf = (reason, msgs) => { if (!reason) return null; const sp = []; msgs.forEach((m) => { let k = reason.indexOf(m.text); while (k >= 0) { sp.push({ m, a: k, b: k + m.text.length }); k = reason.indexOf(m.text, k + 1); } });
  const top = sp.filter((x) => !sp.some((y) => y !== x && y.a <= x.a && y.b >= x.b && (y.b - y.a) > (x.b - x.a))); if (!top.length) return null;
  return top.sort((x, y) => y.a - x.a || (y.b - y.a) - (x.b - x.a))[0].m; };

function build(logFile, bridge, db) {
  const st = fs.statSync(logFile), src = {};
  SOURCES.forEach((f) => { const p = path.join(bridge, f); src[f] = require('crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex'); if (fs.statSync(p).mtimeMs > st.mtimeMs) throw new Error('STALE-RUN ' + path.basename(logFile) + ' is older than ' + f); });
  const L = parseLog(fs.readFileSync(logFile, 'utf8')), msgs = legacyMessages(db), scenarios = [];
  Object.keys(L.meta).forEach((id) => {
    const lg = L.legacy[id]; if (!lg || !L.verdict[id]) return;
    const msg = lg.outcome === 'REJECTED' ? messageOf(lg.reason, msgs) : null;
    scenarios.push({ id, verdict: L.verdict[id], table: L.meta[id].table, doctype: L.meta[id].doctype, legacy: lg, refusal: msg ? { value: msg.value, text: msg.text } : null });
  });
  return { spec: 'bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.19', log: path.basename(logFile), logTime: st.mtime.toISOString(), sources: src, legacyDb: db,
    counts: { scn: Object.keys(L.verdict).length, meta: Object.keys(L.meta).length, kept: scenarios.length }, scenarios };
}

function main() {
  const logFile = arg('--log'), bridge = arg('--bridge'), db = arg('--db', 'idempiere_pilot');
  if (!logFile || !bridge) throw new Error('usage: --log <run.log> --bridge <scripts/bridge>');
  const F = build(logFile, bridge, db), text = JSON.stringify(F, null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const ok = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === text;
    console.log('§RUN_FACTS_CHECK ' + (ok ? 'PASS' : 'FAIL') + ' log=' + F.log + ' kept=' + F.counts.kept + ' (the committed file ' + (ok ? 'equals' : 'differs from') + ' a fresh extraction)');
    process.exit(ok ? 0 : 1);
  }
  fs.writeFileSync(OUT, text);
  const by = {}; F.scenarios.forEach((s) => { const k = s.table + ':' + s.verdict + ':' + s.legacy.outcome; by[k] = (by[k] || 0) + 1; });
  console.log('§RUN_FACTS log=' + F.log + ' scn=' + F.counts.scn + ' meta=' + F.counts.meta + ' kept=' + F.counts.kept + ' ' + JSON.stringify(by) + ' refusals_with_msg=' + F.scenarios.filter((s) => s.refusal).length +
    ' refusals_without_msg=' + F.scenarios.filter((s) => s.legacy.outcome === 'REJECTED' && !s.refusal).map((s) => s.id).join(','));
}
if (require.main === module) main(); else module.exports = { parseLog, messageOf, build };
