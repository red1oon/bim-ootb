#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Implementing bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.19 (amended 2026-11-23, owner: "U be drawing from the rich info in the source code that governs each DocAction?").
// Witness: W-CTXHELP-DERIVED. Reads LEGACY's source (the iDempiere checkout) into erp/tools/legacy_rules.json, read by build_help_pack.js:
//   refusals - every `m_processMsg = <expr>;` inside the model class's prepareIt() / completeIt() (the Complete path), the expression's literals and
//              Msg.getElement(getCtx(), COLUMNNAME_X) kept, every other value a hole (…); then legacy's Msg.translate rule (Msg.java:670-690): @X@ = AD_Message X,
//              else AD_Element X's Name, from the legacy DB. An expression with no literal at all (a validator, a StringBuilder, status.getErrorMsg()) is listed
//              under `dynamic` with its line, never guessed.
//   effects  - erp/tools/legacy_effects.json (what an action DOES, cited by file + line by hand): each cited line must still hold its token, or the build FAILS;
//              subtype codes -> AD_Ref_List 148 names, flag columns -> their AD_Element names (legacy DB).
//   The model class of a table is legacy's own naming rule (MTable.getClass: "M" + the table name without its prefix and underscores).
// Run: node erp/tools/legacy_rules.js [--src <idempiere>/org.adempiere.base/src] [--db idempiere_pilot] [--tables C_Order,...] [--check]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const OUT = path.join(__dirname, 'legacy_rules.json'), EFF = path.join(__dirname, 'legacy_effects.json');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const METHODS = ['prepareIt', 'completeIt'];

function psql(db, sql) {   // rows as JSON arrays: a text may hold newlines
  const r = cp.spawnSync('docker', ['exec', 'postgres', 'psql', '-U', 'adempiere', '-d', db, '-At', '-c', 'SELECT coalesce(json_agg(json_build_array(' + sql.cols + ')), \'[]\') FROM (' + sql.q + ') x'], { encoding: 'utf8', maxBuffer: 1 << 27 });
  if (r.status !== 0) throw new Error('legacy DB ' + db + ': ' + r.stderr); return JSON.parse(r.stdout);
}
const classOf = (table) => 'M' + table.replace(/^[A-Za-z]+_/, '').replace(/_/g, '');
// the body of `public <type> <name>()` by brace matching (strings and comments skipped), with its first line number
function methodBody(src, name) {
  const m = new RegExp('public\\s+\\w+\\s+' + name + '\\s*\\(\\s*\\)').exec(src); if (!m) return null;
  let i = src.indexOf('{', m.index), depth = 0, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '"') { j++; while (j < src.length && src[j] !== '"') { if (src[j] === '\\') j++; j++; } continue; }
    if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); continue; }
    if (c === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j) + 1; continue; }
    if (c === '{') depth++; else if (c === '}' && --depth === 0) break;
  }
  return { start: src.slice(0, m.index).split('\n').length, text: src.slice(m.index, j + 1), offset: m.index };
}
// split an expression on top-level '+' and keep literals / Msg.getElement(…COLUMNNAME_X) as @X@
function parts(expr) {
  const out = []; let cur = '', depth = 0, inS = false;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (inS) { cur += c; if (c === '\\') { cur += expr[++i]; } else if (c === '"') inS = false; continue; }
    if (c === '"') { inS = true; cur += c; continue; }
    if (c === '(') depth++; if (c === ')') depth--;
    if (c === '+' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out.map((p) => { let m; if ((m = /^"((?:[^"\\]|\\.)*)"$/.exec(p))) return { lit: m[1] }; if ((m = /^Msg\.getElement\(\s*getCtx\(\)\s*,\s*COLUMNNAME_(\w+)\s*\)$/.exec(p))) return { lit: '@' + m[1] + '@' }; return { hole: p }; });
}
function build(srcDir, db, tables) {
  const msg = {}, el = {}, sub = {};
  psql(db, { cols: 'x.value, x.msgtext', q: "SELECT value, msgtext FROM ad_message WHERE isactive='Y'" }).forEach(([v, t]) => { msg[v] = t; });
  psql(db, { cols: 'x.columnname, x.name', q: "SELECT columnname, name FROM ad_element WHERE isactive='Y'" }).forEach(([c, n]) => { el[c] = n; });
  psql(db, { cols: 'x.value, x.name', q: "SELECT value, name FROM ad_ref_list WHERE ad_reference_id=148 AND isactive='Y'" }).forEach(([v, n]) => { sub[v] = n; });
  const tr = (s) => s.replace(/@(\w+)@/g, (m, k) => msg[k] != null ? msg[k] : el[k] != null ? el[k] : k).replace(/\s+/g, ' ').trim();   // Msg.translate: AD_Message, else AD_Element
  const head = cp.spawnSync('git', ['-C', srcDir, 'log', '-1', '--format=%H %cI'], { encoding: 'utf8' }).stdout.trim();
  const classes = {};
  tables.forEach((t) => {
    const rel = 'org/compiere/model/' + classOf(t) + '.java', f = path.join(srcDir, rel);
    if (!fs.existsSync(f)) { classes[t] = { file: rel, missing: true }; return; }
    const src = fs.readFileSync(f, 'utf8'), refusals = [], dynamic = [];
    METHODS.forEach((mn) => {
      const b = methodBody(src, mn); if (!b) return;
      const re = /m_processMsg\s*=\s*([^;]+);/g; let m;
      while ((m = re.exec(b.text))) {
        const line = b.start + b.text.slice(0, m.index).split('\n').length - 1, p = parts(m[1].replace(/\s+/g, ' '));
        if (!p.some((x) => x.lit != null)) { dynamic.push({ method: mn, line, expr: m[1].trim() }); continue; }
        const raw = p.map((x) => x.lit != null ? x.lit : '…').join(''), text = tr(raw).replace(/(… ?)+/g, '… ').replace(/ …$/, ' …').trim();
        if (!/[A-Za-z]{2}/.test(text.replace(/…/g, ''))) { dynamic.push({ method: mn, line, expr: m[1].trim() }); continue; }   // only holes and punctuation (m_processMsg + " -> " + inner): no words of legacy's own
        if (!refusals.some((r) => r.text === text)) refusals.push({ method: mn, line, raw, text }); else refusals.find((r) => r.text === text).also = (refusals.find((r) => r.text === text).also || []).concat(line);
      }
    });
    classes[t] = { file: rel, refusals, dynamic };
  });
  const E = JSON.parse(fs.readFileSync(EFF, 'utf8')), effects = [];
  const lineHas = (rel, n, tok) => { const L = fs.readFileSync(path.join(srcDir, rel), 'utf8').split('\n'); return (L[n - 1] || '').indexOf(tok) >= 0; };
  E.effects.filter((x) => tables.indexOf(x.table) >= 0).forEach((x) => {
    const checks = [[x.file, x.line, x.token]].concat(x.rule ? [[x.rule.file, x.rule.line, x.rule.token]] : [], x.flag ? [[x.file, x.flag.line, x.flag.token]] : []);
    const bad = checks.filter((c) => !lineHas(c[0], c[1], c[2])).map((c) => c[0] + ':' + c[1]);
    if (bad.length) throw new Error('§LEGACY_RULES_DRIFT ' + x.id + ' cited line no longer holds its token: ' + bad.join(', '));
    effects.push(Object.assign({}, x, { whenNames: Array.isArray(x.when) ? x.when.map((v) => sub[v] || v) : null, flagName: x.flag ? { subtype: sub[x.flag.subtype] || x.flag.subtype, column: el[x.flag.column] || x.flag.column } : null }));
  });
  return { spec: E.spec, source: { repo: 'iDempiere (org.adempiere.base/src)', head }, legacyDb: db, subtypes: sub, classes, effects };
}
function main() {
  const srcDir = arg('--src', path.join(os.homedir(), 'idempiere-dev-setup', 'idempiere', 'org.adempiere.base', 'src')), db = arg('--db', 'idempiere_pilot');
  const tables = arg('--tables', 'C_Order').split(',');
  const R = build(srcDir, db, tables), text = JSON.stringify(R, null, 1) + '\n';
  if (process.argv.includes('--check')) { const ok = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === text; console.log('§LEGACY_RULES_CHECK ' + (ok ? 'PASS' : 'FAIL') + ' (the committed file ' + (ok ? 'equals' : 'differs from') + ' a fresh read of the source)'); process.exit(ok ? 0 : 1); }
  fs.writeFileSync(OUT, text);
  Object.keys(R.classes).forEach((t) => { const c = R.classes[t]; console.log('§LEGACY_RULES ' + t + ' ' + c.file + (c.missing ? ' MISSING' : ' refusals=' + c.refusals.length + ' dynamic=' + c.dynamic.length + ' [' + c.dynamic.map((d) => d.method + ':' + d.line).join(' ') + ']')); (c.refusals || []).forEach((r) => console.log('§LEGACY_REFUSAL ' + t + ' ' + r.method + ':' + r.line + ' "' + r.text + '"')); });
  R.effects.forEach((e) => console.log('§LEGACY_EFFECT ' + e.id + ' ' + e.file + ':' + e.line + ' when=' + JSON.stringify(e.whenNames || e.when) + (e.flagName ? ' flag=' + e.flagName.subtype + ':' + e.flagName.column : '') + ' token-ok'));
  console.log('§LEGACY_RULES_SOURCE head=' + R.source.head);
}
if (require.main === module) main(); else module.exports = { build, classOf, methodBody, parts };
