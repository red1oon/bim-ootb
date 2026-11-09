#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (W-ERP-VERBS)
// Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §21.7. Read the log after every run.
// SCOPE: one pure report. Read the application dictionary (erp/ad_seed.db, read-only) and the
//        handler registration sites under erp/, write internal/ERP_VERBS.md: the ERP's DocAction and
//        process verbs, whether each has a handler, and a harm class by rule. This is the DENOMINATOR
//        for "X of N ERP verbs offered to actors" (AD-LAYER LAW 2). No runtime change, no DB write.
// N:     N_doc  = (document table, DocAction) pairs; document table = AD_Table with an AD_Column
//                 named DocAction; DocAction = AD_Ref_List of AD_Reference 135 minus `--`.
//        N_proc = active AD_Process rows.   N = N_doc + N_proc.   Reads are not in N (stated in §21.7).
// LEVELS: (a) in the dictionary · (b) implemented: doc pair = a K.register(table, action) resolved at its
//        site; process = AdProcess.resolveClassname(row) is a key registerHandler('…') registers ·
//        (c) offered to actors = rows of erp/actor_verbs.json if it exists (X; absent = 0).
// NON-INVENT: a dictionary row with no handler is NOT IMPLEMENTED; a handler with no dictionary row is
//        HANDLER WITHOUT DICTIONARY ROW; a registration whose arguments come from a data file at run
//        time is DYNAMIC and NOT COUNTED, with the reason. Nothing is hidden.
// PLUGINS (§21.7 SPEC 2026-11-09): the dictionary rows each BUILT-IN plugin stages at activation (erp/plugin_overlay.js BUILTINS)
//        are staged into the in-memory copy of ad_seed.db by the host's own registry (erp/plugin_registry.js
//        stageManifestDictionary -> ctx.dict.insert) before counting; rows carry their source (seed / plugin <name>).
//        ColumnSQL (virtual) columns are properties of a record, not actions: not counted. Install-only bundles are not counted.
// PLUGIN HANDLERS (rule (b) widened): a built-in plugin registers through its context, not K.register / registerHandler('…'):
//        ctx.docAction.registerDocAction(table, impl) -> (table, action) implemented when impl has the action's method
//        (action -> method as erp/model_layer.js processIt:595-616); ctx.process.defineProcess(classname, factory[, opts]) -> classname
//        implemented. Table/class name = a literal or a same-file string const; anything else is DYNAMIC, not counted. Evidence = file:line of the call.
//        Harm of a plugin process: opts.harm (read|writes|posts|sends) when the definition declares one; else the rules below; "assumed" only when nothing matched.
// Run: node scripts/gen_erp_verbs.js [--root DIR] [--db FILE] [--out FILE] [--json]
'use strict';
const fs = require('fs'), path = require('path');

const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ROOT = path.resolve(opt('--root') || path.join(__dirname, '..'));
const DB = path.resolve(opt('--db') || path.join(ROOT, 'erp/ad_seed.db'));
const OUT = opt('--out') || path.join(ROOT, 'internal/ERP_VERBS.md');
const JSON_OUT = argv.includes('--json');
const NO_PLUGINS = process.env.EV_NO_PLUGINS === '1';   // falsifier: skip built-in plugin staging (must fail W-ERP-VERBS EV7)
const NO_PLUGIN_REGS = process.env.EV_NO_PLUGIN_REGS === '1';   // falsifier: ignore plugin-context registrations (must fail W-ERP-VERBS EV9)
const NO_EVIDENCE = process.env.EV_NO_EVIDENCE === '1';   // falsifier: ignore every pair's parity evidence (X must drop; W-ERP-VERBS EV12)
const BREAK = process.env.EV_BREAK === '1';   // falsifier: drop one DocAction value (must fail EV1)

// ── harm class tables (R5): every rule cites its source ──────────────────────────────────────────
// DocAction codes. Source: erp/ad_docfsm.js (port of DocumentEngine.processIt, DocumentEngine.java:305-);
// the manifest wfmc lists the same codes. CO/PO/RC/RA create or reverse accounting facts (Doc.post);
// every other code changes a document's status or lock only.
const DOC_CLASS = {
  CO: ['posts', 'Complete posts the document to the books (DocumentEngine ACTION_Complete → Doc.post)'],
  PO: ['posts', 'Post writes Fact_Acct (DocumentEngine ACTION_Post)'],
  RC: ['posts', 'Reverse-Correct posts a reversing document (DocumentEngine ACTION_Reverse_Correct)'],
  RA: ['posts', 'Reverse-Accrual posts a reversing document (DocumentEngine ACTION_Reverse_Accrual)'],
};
const DOC_DEFAULT = ['writes', 'changes DocStatus/DocAction/Processed only (erp/ad_docfsm.js TRANSITION)'];
// Process rules, first match wins, tested on class name + value + name (lower case).
// Source for the vocabulary: iDempiere org.compiere.process / org.compiere.report class names in AD_Process.ClassName.
const PROC_RULES = [
  ['sends', /mail|notice|\brequest\b|mailing|\bsms\b|broadcast/, 'class/name says it mails or notifies'],
  ['posts', /fact_?acct|\bposting\b|\bpost\b|doc\.?post|invoicegenerate|allocat|bankstatementpayment|paymentgenerate|payselect|paymentprint|costing|inventorycount|imputation|storageclean|periodclose|openclose|reval/, 'class/name says it posts, allocates, costs or generates documents'],
];
const procClass = (p, cn, declared) => {
  if (declared) return [declared, 'declared by the process definition (defineProcess opts.harm)'];
  if (p.isreport === 'Y') return ['read', 'IsReport=Y (a report process)'];
  const hay = [cn, p.value, p.name].join(' ').toLowerCase();
  for (const [c, re, why] of PROC_RULES) if (re.test(hay)) return [c, why];
  return ['writes', 'no rule matched, assumed writes'];
};

// ── dictionary (read-only, sql.js) ───────────────────────────────────────────────────────────────
async function openDb(file) {
  const initSqlJs = require(path.join(ROOT, 'modeller/lib/sql-wasm.js'));
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller/lib/sql-wasm.wasm')) });
  return new SQL.Database(new Uint8Array(fs.readFileSync(file)));
}
// ── built-in plugins: the host's own staging (erp/plugin_registry.js) over an in-memory writable wrapper ──
function builtinPlugins() {
  const src = fs.readFileSync(path.join(ROOT, 'erp/plugin_overlay.js'), 'utf8');
  const m = /\bvar\s+BUILTINS\s*=\s*\[([^\]]*)\]/.exec(src);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [];
}
async function stagePlugins(db) {
  const REG = require(path.join(ROOT, 'erp/plugin_registry.js'));
  const wdb = { run: (q, p) => { db.run(q, p || []); }, query: (q, p) => { const st = db.prepare(q); st.bind(p || []); const o = []; while (st.step()) o.push(st.getAsObject()); st.free(); return o; } };
  const reg = REG.create({ db: wdb });
  const out = [];
  for (const rel_ of builtinPlugins()) {
    const file = path.join(ROOT, 'erp', rel_), name = path.basename(rel_).replace(/\.[^.]+$/, '');
    const mod = await import(require('url').pathToFileURL(file).href);
    const dict = (mod.manifest && mod.manifest.dictionary) || [];
    const n = reg.stageManifestDictionary(mod.manifest);
    const rowsFor = t => dict.filter(d => d.table.toLowerCase() === t).flatMap(d => d.rows);
    out.push({ regs: NO_PLUGIN_REGS ? { doc: [], proc: [], dynamic: [] } : scanPluginRegs(file, mod, 'erp/' + rel_), name, procIds: new Set(rowsFor('ad_process').map(r => r.ad_process_id)), docTables: rowsFor('ad_table').map(r => r.tablename), file: 'erp/' + rel_, staged: n, tables: dict.map(d => d.table.toLowerCase()), manifestRows: dict.reduce((a, d) => a + d.rows.length, 0),
      family: mod.FAMILY && mod.FAMILY.allow ? [...new Set(Object.values(mod.FAMILY.allow).flat())].sort() : null,
      virtualCols: dict.filter(d => d.table.toLowerCase() === 'ad_column').flatMap(d => d.rows).filter(r => r.columnsql).length });
  }
  return out;
}
// ── plugin-context registrations (rule (b) for built-in plugins) ──
const ACTION_METHOD = { PR: 'prepareIt', CO: 'completeIt', AP: 'approveIt', RJ: 'rejectIt', VO: 'voidIt', CL: 'closeIt', RC: 'reverseCorrectIt', RA: 'reverseAccrualIt', RE: 'reActivateIt' };
function callArgs(src, openIdx) {   // balanced scan from the '(' at openIdx -> top-level argument strings
  let d = 0, q = null, cur = '', out = [];
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (q) { cur += c; if (c === '\\') { cur += src[++i]; } else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; cur += c; continue; }
    if ('([{'.includes(c)) { d++; if (d > 1) cur += c; continue; }
    if (')]}'.includes(c)) { d--; if (d === 0) { out.push(cur.trim()); return out; } cur += c; continue; }
    if (c === ',' && d === 1) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  return out;
}
function resolveName(arg, src) {   // 'lit' | lc(CONST) | CONST | CONST.toLowerCase() -> string or null
  const a = (arg || '').replace(/^\w+\(\s*(\w+)\s*\)$/, '$1').replace(/\.toLowerCase\(\)$/, '').trim();
  const lit = /^'([^']*)'$|^"([^"]*)"$/.exec(a); if (lit) return lit[1] != null ? lit[1] : lit[2];
  if (!/^[A-Za-z_$][\w$]*$/.test(a)) return null;
  const m = new RegExp('\\b' + a + "\\s*=\\s*'([^']+)'").exec(src); return m ? m[1] : null;
}
function scanPluginRegs(file, mod, relFile) {
  const raw = fs.readFileSync(file, 'utf8'), src = stripComments(raw), out = { doc: [], proc: [], dynamic: [] };
  for (const m of src.matchAll(/\bregisterDocAction\s*\(/g)) {
    const at = relFile + ':' + lineOf(src, m.index), a = callArgs(src, m.index + m[0].length - 1);
    const table = resolveName(a[0], src), impl = /^[A-Za-z_$][\w$]*$/.test(a[1] || '') ? mod[a[1]] : null;
    if (!table || !impl) { out.dynamic.push(at + ' registerDocAction(' + (a[0] || '') + ', ' + (a[1] || '') + ') table or class not a literal/const'); continue; }
    out.doc.push({ at, table, actions: Object.keys(ACTION_METHOD).filter(k => typeof impl[ACTION_METHOD[k]] === 'function') });
  }
  for (const m of src.matchAll(/\bdefineProcess\s*\(/g)) {
    const at = relFile + ':' + lineOf(src, m.index), a = callArgs(src, m.index + m[0].length - 1);
    const cn = resolveName(a[0], src);
    if (!cn) { out.dynamic.push(at + ' defineProcess(' + (a[0] || '') + ', …) class name not a literal/const'); continue; }
    const hm = a[2] ? /\bharm\s*:\s*['"](read|writes|posts|sends)['"]/.exec(a[2]) : null;
    out.proc.push({ at, classname: cn, harm: hm ? hm[1] : null });
  }
  return out;
}
const rowsOf = (db, sql) => { const r = db.exec(sql); if (!r.length) return []; const c = r[0].columns; return r[0].values.map(v => Object.fromEntries(v.map((x, i) => [c[i], x]))); };

// ── file walk ───────────────────────────────────────────────────────────────────────────────────
const SKIP = /\/(lib|node_modules|archive|tests|\.git|docs)(\/|$)|\.min\./;
function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const p = path.join(dir, e.name);
    if (SKIP.test(p + (e.isDirectory() ? '/' : ''))) continue;
    if (e.isDirectory()) walk(p, out); else if (/\.(js|mjs|html)$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, a) => a + ' '.repeat(m.length - a.length));
const arrLit = (src, name) => {   // `var NAME = ['a','b']` → ['a','b'] or null
  const m = new RegExp('\\b(?:var|let|const)\\s+' + name + '\\s*=\\s*\\[([^\\]]*)\\]').exec(src);
  return m ? { list: [...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map(x => x[1] || x[2]), idx: m.index } : null;
};

async function main() {
  if (!fs.existsSync(DB)) { console.log('§ERP_VERBS INCONCLUSIVE — dictionary not found: ' + DB); process.exit(2); }
  const head = fs.readFileSync(DB).subarray(0, 15).toString();
  if (head !== 'SQLite format 3') { console.log('§ERP_VERBS INCONCLUSIVE — ' + DB + ' is not a SQLite file (LFS pointer stub?)'); process.exit(2); }
  const db = await openDb(DB);

  // seed state BEFORE plugin staging (to attribute every new row to its plugin)
  const seedTables = new Set(rowsOf(db, "SELECT DISTINCT t.tablename AS tablename FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID WHERE lower(c.columnname)='docaction'").map(r => r.tablename));
  const seedProcIds = new Set(rowsOf(db, 'SELECT ad_process_id AS id FROM ad_process').map(r => r.id));
  const seedEmpty = !seedTables.size && !seedProcIds.size;   // an empty dictionary has no tables to stage into: stays VACUOUS / INCONCLUSIVE (exit 2)
  const plugins = (NO_PLUGINS || seedEmpty) ? [] : await stagePlugins(db);
  // (a) dictionary
  let actions = rowsOf(db, "SELECT value AS value, name AS name FROM AD_Ref_List WHERE AD_Reference_ID=135 AND value<>'--' ORDER BY value");
  if (BREAK && actions.length) actions = actions.slice(0, -1);
  const docTables = rowsOf(db, "SELECT DISTINCT t.tablename AS tablename FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID WHERE lower(c.columnname)='docaction' ORDER BY t.tablename").map(r => r.tablename);
  const procs = rowsOf(db, 'SELECT ad_process_id AS id, value, name, classname, isreport, isactive FROM ad_process ORDER BY ad_process_id');
  const procActive = procs.filter(p => p.isactive === 'Y'), procInactive = procs.length - procActive.length;
  const procSrc = id => seedProcIds.has(id) ? 'seed' : 'plugin ' + ((plugins.find(pl => pl.tables.includes('ad_process') && pl.procIds && pl.procIds.has(id)) || {}).name || '?');
  const tableSrc = t => seedTables.has(t) ? 'seed' : 'plugin ' + ((plugins.find(pl => pl.docTables && pl.docTables.includes(t)) || {}).name || '?');
  // pairs of a table: a seed table = every DocAction of reference 135; a plugin table with a DocAction family = the family's OFFERED actions (union of FAMILY.allow); owner ruling 2026-11-09
  const famOf = t => { if (seedTables.has(t)) return null; const pl = plugins.find(q => q.docTables.includes(t)); return pl && pl.family ? pl.family : null; };
  const pairsOf = t => { const f = famOf(t); return f ? actions.filter(a => f.includes(a.value)) : actions; };
  const N_doc = docTables.reduce((a, t) => a + pairsOf(t).length, 0), N_proc = procActive.length, N = N_doc + N_proc;
  const empty = !actions.length || !docTables.length || !procActive.length;

  // wfmc (the kernel's state machine): which actions have ≥ 1 legal transition
  const wfmc = JSON.parse(fs.readFileSync(path.join(ROOT, 'erp/manifest.json'), 'utf8')).wfmc || {};
  const wfActions = [...new Set((wfmc.transitions || []).map(t => t[1]))].sort();

  // (b) doc handlers: every K.register( site outside tests/
  const files = walk(path.join(ROOT, 'erp'), []);
  const sites = [];   // {file,line,kind,reason?,pairs:[[table,action]],src}
  const REG = /\b(?:K|Kernel|ERPKernel|window\.ERPKernel)\s*\.\s*register\s*\(/g;
  const bareRe = /(^|[^\w$.])register\s*\(\s*docType\s*,\s*action\b/;   // the definition itself
  for (const f of files) {
    const raw = fs.readFileSync(f, 'utf8'); const src = stripComments(raw);
    let m; while ((m = REG.exec(src))) {
      const line = lineOf(src, m.index), file = rel(f);
      const site = { file, line, pairs: [], kind: '', reason: '' };
      const rest = src.slice(m.index + m[0].length, m.index + m[0].length + 120);
      const lit = /^\s*'([^']+)'\s*,\s*'([^']+)'/.exec(rest);
      if (file === 'erp/kanban_host.js') {
        // loop: cfg.tables × actions in wfmc.transitions; cfg.tables comes from each KanbanHost.publish caller
        site.kind = 'LOOP';
        for (const g of files) {
          const gs = stripComments(fs.readFileSync(g, 'utf8'));
          const pm = /KanbanHost\.publish\s*\(\s*\{[^}]*?\btables:\s*([A-Za-z_$][\w$]*)/.exec(gs);
          if (!pm) continue;
          const a = arrLit(gs, pm[1]);
          if (!a) { site.reason += `tables ${pm[1]} in ${rel(g)} not a literal; `; continue; }
          site.via = (site.via || []).concat([`${rel(g)}:${lineOf(gs, a.idx)} ${pm[1]}`]);
          for (const t of a.list) for (const act of wfActions) site.pairs.push([t, act]);
        }
        if (!site.via) site.kind = 'UNRESOLVED';
      } else if (file === 'erp/kanban_lens.html') {
        site.kind = 'LOOP';
        const a = arrLit(src, 'tables');
        if (a) { site.via = [`${file}:${lineOf(src, a.idx)} tables`]; for (const t of a.list) for (const act of wfActions) site.pairs.push([t, act]); }
        else site.kind = 'UNRESOLVED';
      } else if (lit) { site.kind = file === 'erp/spike_writepath.html' ? 'SPIKE' : 'LITERAL'; site.pairs.push([lit[1], lit[2]]); if (site.kind === 'SPIKE') site.reason = 'spike page, not a shipped host'; }
      else if (file === 'erp/erp_picker.js' || file === 'erp/odoo_agent/agent.js') { site.kind = 'DYNAMIC'; site.reason = 'docType/action come from the events of a chain file loaded at run time (ev.d)'; }
      else site.kind = 'UNRESOLVED';
      sites.push(site);
    }
  }
  const unresolved = sites.filter(s => s.kind === 'UNRESOLVED');
  const counted = sites.filter(s => s.kind === 'LOOP' || s.kind === 'LITERAL');
  const handlerPairs = new Map();   // 'table:action' → [site descr]
  for (const s of counted) for (const [t, a] of s.pairs) { const k = t.toLowerCase() + ':' + a; if (!handlerPairs.has(k)) handlerPairs.set(k, []); handlerPairs.get(k).push(`${s.file}:${s.line}`); }
  for (const pl of plugins) for (const r of pl.regs.doc) for (const act of r.actions) { const k = r.table.toLowerCase() + ':' + act; if (!handlerPairs.has(k)) handlerPairs.set(k, []); handlerPairs.get(k).push(r.at + ' (plugin ' + pl.name + ')'); }
  const dictPair = new Set(); for (const t of docTables) for (const a of pairsOf(t)) dictPair.add(t.toLowerCase() + ':' + a.value);
  const implDoc = [...dictPair].filter(k => handlerPairs.has(k)).length;
  const noDict = [...handlerPairs.keys()].filter(k => !dictPair.has(k)).sort();

  // (b) process handlers: literal registerHandler('…') in erp/ (not tests/)
  const procLits = new Map();   // classname → file:line
  const dynProc = [];
  const RH = /\bregisterHandler\s*\(\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$.]*))/g;
  for (const f of files) {
    const src = stripComments(fs.readFileSync(f, 'utf8')); const file = rel(f);
    if (!/ad_process\.js$/.test(file) && !/\/plugins\//.test(file)) continue;
    let m; while ((m = RH.exec(src))) {
      const before = src.slice(Math.max(0, m.index - 10), m.index);
      if (/function\s*$/.test(before)) continue;                        // the definition
      if (file.endsWith('ad_callout.js')) continue;
      const lit = m[1] || m[2];
      if (lit) { if (!procLits.has(lit)) procLits.set(lit, `${file}:${lineOf(src, m.index)}`); }
      else dynProc.push(`${file}:${lineOf(src, m.index)} registerHandler(${m[3]}, …)`);
    }
  }
  const AP = require(path.join(ROOT, 'erp/ad_process.js'));
  const plugProc = new Map();   // classname -> { at, harm } from defineProcess in the staged built-in plugins
  for (const pl of plugins) for (const r of pl.regs.proc) if (!plugProc.has(r.classname)) plugProc.set(r.classname, { at: r.at + ' (plugin ' + pl.name + ')', harm: r.harm });
  const procRows = procActive.map(p => {
    const cn = AP.resolveClassname({ classname: p.classname || '', isReport: p.isreport === 'Y', value: p.value, name: p.name });
    const pp = cn && plugProc.get(cn);
    const at = cn && (procLits.get(cn) || (pp && pp.at));
    const [cls, basis] = procClass(p, cn || p.classname || '', !seedProcIds.has(p.id) && pp ? pp.harm : null);
    return { at0: at || '', src: procSrc(p.id), id: p.id, value: p.value, name: p.name, classname: p.classname || '', resolved: cn || '', at: at || '', cls, basis };
  });
  const implProc = procRows.filter(r => r.at).length;
  const procWithHandler = new Set(procRows.filter(r => r.at).map(r => r.resolved));
  const procHandlerNoRow = [...procLits.keys(), ...[...plugProc.keys()].filter(k => !procLits.has(k))].filter(k => !procWithHandler.has(k)).sort();

  // (c) offered to actors = X. A (table, action) pair counts ONLY when all three hold (lane B, NEURO §0.4 detail 2: "counts only for the tables where it is implemented and witnessed against legacy"):
  //   (1) it is a dictionary pair (the table is a document table above, the action is a value of reference 135);
  //   (2) the DocAction class is registered by a literal ModelLayer.registerDocAction('<table>', ...) in erp/model_*.js (file:line printed) -- the engine path erp_cli.js runs;
  //   (3) the pair's evidence file exists and carries the line `§A5_PAIR table=<T> action=<A> verdict=MATCH` (the parallel-run witness compared it to legacy iDempiere).
  // A row failing any test is listed with the reason and does NOT count.
  const avFile = path.join(ROOT, 'erp/actor_verbs.json');
  let X = 0, xBasis = 'erp/actor_verbs.json does not exist: no verb list is offered to actors';
  const xRows = [];
  if (fs.existsSync(avFile)) {
    const j = JSON.parse(fs.readFileSync(avFile, 'utf8')); xBasis = 'pairs of erp/actor_verbs.json that are dictionary pairs AND have a registerDocAction site AND a MATCH line in their evidence file';
    const regs = new Map();
    for (const f of fs.readdirSync(path.join(ROOT, 'erp')).filter(f => /^model_.*\.js$/.test(f))) fs.readFileSync(path.join(ROOT, 'erp', f), 'utf8').split('\n').forEach((ln, i) => { const m = /registerDocAction\(\s*'([a-z0-9_]+)'/.exec(ln); if (m && !regs.has(m[1])) regs.set(m[1], 'erp/' + f + ':' + (i + 1)); });
    for (const v of j.verbs || []) {
      const T = String(v.table).toLowerCase(), why = [];
      if (!docTables.some(t => String(t).toLowerCase() === T)) why.push('not a document table in the dictionary');
      if (!actions.some(a => (a.value || a) === v.action)) why.push('action not in reference 135');
      if (!regs.has(T)) why.push('no registerDocAction site');
      const ev = !NO_EVIDENCE && v.evidence && fs.existsSync(path.join(ROOT, v.evidence)) ? fs.readFileSync(path.join(ROOT, v.evidence), 'utf8') : null;
      if (ev == null) why.push('evidence file missing'); else if (ev.indexOf('§A5_PAIR table=' + v.table + ' action=' + v.action + ' verdict=MATCH') < 0) why.push('evidence has no MATCH line for the pair');
      xRows.push({ verb: v.verb, table: v.table, action: v.action, site: regs.get(T) || null, counted: why.length === 0, why: why.join('; ') });
    }
    X = xRows.filter(r => r.counted).length;
  }

  const notImplDoc = N_doc - implDoc, notImplProc = N_proc - implProc;
  const dynamic = sites.filter(s => s.kind === 'DYNAMIC' || s.kind === 'SPIKE').length + dynProc.length;
  const summary = `§ERP_VERBS N=${N} N_doc=${N_doc} (tables=${docTables.length} actions=${actions.length} plugin_family_pairs=${docTables.filter(t => famOf(t)).reduce((a, t) => a + pairsOf(t).length, 0)}) N_proc=${N_proc} (inactive=${procInactive}) ` +
    `impl=${implDoc + implProc} (doc=${implDoc} proc=${implProc}) not_impl=${notImplDoc + notImplProc} X=${X} handler_no_dict=${noDict.length + procHandlerNoRow.length} dynamic=${dynamic} unresolved=${unresolved.length}${empty ? ' VACUOUS INCONCLUSIVE' : ''}`;
  const pluginRows = plugins.map(pl => {
    const procs = procRows.filter(r => r.src === 'plugin ' + pl.name), tabs = docTables.filter(t => tableSrc(t) === 'plugin ' + pl.name);
    return { name: pl.name, file: pl.file, staged: pl.staged, manifestRows: pl.manifestRows, procs: procs.map(r => r.value), docTables: tabs, pairs: tabs.reduce((a, t) => a + pairsOf(t).length, 0), family: pl.family, virtualCols: pl.virtualCols };
  });
  const pluginLines = pluginRows.map(pl => `§ERP_VERBS_PLUGINS plugin=${pl.name} staged_rows=${pl.staged}/${pl.manifestRows} new_processes=${pl.procs.length} [${pl.procs.join(',')}] new_doc_tables=${pl.docTables.length} [${pl.docTables.join(',')}] doc_pairs=${pl.pairs} (rule: family offered actions) family_offers=[${(pl.family || []).join(',')}] columnsql_properties=${pl.virtualCols} (not counted)`);
  const J = { plugins: pluginRows, procRows: procRows.map(r => ({ id: r.id, value: r.value, src: r.src, at: r.at })), pluginDoc: [...handlerPairs.entries()].filter(([, v]) => v.some(x => /\(plugin /.test(x))).map(([k, v]) => [k, v.filter(x => /\(plugin /.test(x))]), pluginDynamic: plugins.flatMap(pl => pl.regs.dynamic), N, N_doc, N_proc, tables: docTables, actions: actions.map(a => a.value), procActive: N_proc, procInactive, implDoc, implProc, X, noDict, procHandlerNoRow,
    xRows,
    sites: sites.map(s => ({ file: s.file, line: s.line, kind: s.kind, pairs: s.pairs.length })), unresolved: unresolved.map(s => s.file + ':' + s.line), dynamic, empty, summary,
    handlerSites: sites.map(s => s.file + ':' + s.line), procLits: [...procLits.entries()], dynProc };
  if (JSON_OUT) { process.stdout.write(JSON.stringify(J, null, 1)); process.exit(0); }

  // ── markdown ──
  const esc = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const md = s => '`' + String(s).replace(/`/g, "'") + '`';
  const L = [];
  L.push('# ERP verbs — generated inventory', '');
  L.push('> **Generated. Do not hand-edit.** `node scripts/gen_erp_verbs.js`');
  L.push('> Spec: bim-compiler `prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md` §21.7 (W-ERP-VERBS). Witness: `tests/witness_erp_verbs.js`.', '');
  L.push('The ERP\'s DocActions and processes from the application dictionary (`erp/ad_seed.db`), whether a handler is registered for each, and a harm class by rule. The denominator for "X of N ERP verbs offered to actors" (§21.2). Reads are not in N (§21.7). A `read` class never means safe.', '');
  L.push('| | |', '|---|---:|');
  L.push(`| **N** (N_doc + N_proc) | ${N} |`);
  L.push(`| N_doc = ${docTables.filter(t => !famOf(t)).length} document tables × ${actions.length} DocActions + ${docTables.filter(t => famOf(t)).length} plugin table(s) × their family's offered actions | ${N_doc} |`);
  L.push(`| N_proc = active AD_Process rows (${procInactive} inactive, not in N) | ${N_proc} |`);
  L.push(`| (b) doc pairs with a registered handler | ${implDoc} |`);
  L.push(`| (b) processes whose resolved class name has a handler | ${implProc} |`);
  L.push(`| of which from built-in plugins (doc pairs / processes) | ${pluginRows.reduce((a, p) => a + p.pairs, 0)} / ${pluginRows.reduce((a, p) => a + p.procs.length, 0)} |`);
  L.push(`| NOT IMPLEMENTED (doc / process) | ${notImplDoc} / ${notImplProc} |`);
  L.push(`| handlers without a dictionary row (doc / process) | ${noDict.length} / ${procHandlerNoRow.length} |`);
  L.push(`| **(c) X offered to actors** | ${X} |`);
  L.push('');
  L.push(`Basis for X: ${xBasis}.`, '');
  L.push('**What "handler" means here:** a function registered under (table, action) in the kernel handler registry. The generic Kanban handler (`erp/kanban_host.js:73`) returns one `SET_STATUS` op and posts nothing, so a doc pair marked implemented by it is a status change, not the legacy Complete with its accounting; the twin check for that is §21.5 A5, not this file. Tables whose name ends `_v` are dictionary views that carry a DocAction column; they are counted because the dictionary says so.', '');
  L.push('## Built-in plugins counted (source column below)', '');
  L.push('The dictionary rows each BUILT-IN plugin (`erp/plugin_overlay.js` BUILTINS) stages at activation are staged into the in-memory dictionary by the host\'s own registry (`stageManifestDictionary` → `ctx.dict.insert`) before counting. ColumnSQL (virtual) columns are properties of a record, not actions: not counted. A plugin\'s DocAction class and process class are registered through the plugin context (`registerDocAction`, `defineProcess`), not `K.register` / `registerHandler(\'…\')`; rule (b) also reads those two calls in the staged plugin files (a DocAction class implements an action when it has the action\'s method; a process class by its class name), evidence file:line. A plugin document table with a DocAction family counts the family\'s OFFERED actions only (union of `FAMILY.allow`; owner ruling 2026-11-09: RE is set by a newer revision, never offered), not the 13 of reference 135; a seed table counts all 13.', '');
  L.push('| plugin | file | rows staged | new processes | new document tables | doc pairs | family offers | ColumnSQL properties (not counted) |', '|---|---|---:|---|---|---:|---|---:|');
  for (const pl of pluginRows) L.push(`| ${pl.name} | ${md(pl.file)} | ${pl.staged} of ${pl.manifestRows} | ${pl.procs.map(md).join(' ') || '—'} | ${pl.docTables.map(md).join(' ') || '—'} | ${pl.pairs} | ${(pl.family || []).join(' ') || '—'} | ${pl.virtualCols} |`);
  if (!pluginRows.length) L.push('| (none staged) | | | | | | | |');
  L.push('');
  L.push('## Handler registration sites (`K.register`, outside tests/)', '');
  L.push('| site | kind | pairs | how resolved |', '|---|---|---:|---|');
  for (const s of sites) L.push(`| ${md(s.file + ':' + s.line)} | ${s.kind}${s.kind === 'LOOP' || s.kind === 'LITERAL' ? '' : ' (NOT COUNTED)'} | ${s.pairs.length} | ${esc(s.via ? 'tables ← ' + s.via.join('; ') + '; actions ← erp/manifest.json wfmc.transitions (' + wfActions.length + ')' : s.kind === 'LITERAL' ? 'literal arguments' : s.reason)} |`);
  L.push('');
  L.push('## DocActions (dictionary AD_Reference 135)', '');
  L.push('| code | name | class | rule | legal in wfmc | tables with handler (of ' + docTables.length + ') |', '|---|---|---|---|---|---:|');
  for (const a of actions) {
    const [c, why] = DOC_CLASS[a.value] || DOC_DEFAULT;
    const n = docTables.filter(t => handlerPairs.has(t.toLowerCase() + ':' + a.value)).length;
    L.push(`| ${md(a.value)} | ${esc(a.name)} | ${c} | ${esc(why)} | ${wfActions.includes(a.value) ? 'yes' : 'no transition'} | ${n} |`);
  }
  L.push('');
  L.push('## Document tables with a DocAction column', '');
  L.push('| table | source | actions with a handler | handler site |', '|---|---|---|---|');
  for (const t of docTables) {
    const have = actions.filter(a => handlerPairs.has(t.toLowerCase() + ':' + a.value));
    const sitesFor = [...new Set(have.flatMap(a => handlerPairs.get(t.toLowerCase() + ':' + a.value)))];
    L.push(`| ${md(t)} | ${tableSrc(t)} | ${have.length ? have.map(a => a.value).join(' ') : '**NOT IMPLEMENTED**'} | ${sitesFor.map(md).join(' ') || '—'} |`);
  }
  L.push('');
  if (noDict.length) { L.push('## HANDLER WITHOUT DICTIONARY ROW (doc)', ''); for (const k of noDict) L.push(`- ${md(k)} at ${handlerPairs.get(k).map(md).join(' ')}`); L.push(''); }
  L.push('## Processes (active AD_Process rows)', '');
  L.push('Class rules (first match wins): ' + PROC_RULES.map(r => `**${r[0]}** ← ${r[2]} (${md(r[1].source)})`).join('; ') + '; IsReport=Y → **read**; else **writes**, basis "no rule matched, assumed writes".', '');
  const byCls = c => procRows.filter(r => r.cls === c).length;
  L.push(`Classes: read ${byCls('read')}, writes ${byCls('writes')}, posts ${byCls('posts')}, sends ${byCls('sends')}. Implemented ${implProc} of ${N_proc}.`, '');
  L.push('| id | source | value | name | class name → resolved | handler | class | basis |', '|---:|---|---|---|---|---|---|---|');
  for (const r of procRows) L.push(`| ${r.id} | ${r.src} | ${esc(r.value)} | ${esc(r.name)} | ${r.classname ? md(r.classname) : '—'}${r.resolved && r.resolved !== r.classname ? ' → ' + md(r.resolved) : ''} | ${r.at ? md(r.at) : '**NOT IMPLEMENTED**'} | ${r.cls} | ${esc(r.basis)} |`);
  L.push('');
  if (procHandlerNoRow.length) { L.push('## HANDLER WITHOUT DICTIONARY ROW (process)', '', 'Registered by `registerHandler`, no active AD_Process row resolves to it.', ''); for (const k of procHandlerNoRow) L.push(`- ${md(k)} at ${md(procLits.get(k) || plugProc.get(k).at)}`); L.push(''); }
  if (dynProc.length) { L.push('## DYNAMIC process registrations (NOT COUNTED)', ''); for (const d of dynProc) L.push('- ' + md(d)); L.push(''); }
  const plugDyn = plugins.flatMap(pl => pl.regs.dynamic);
  if (plugDyn.length) { L.push('## DYNAMIC plugin registrations (NOT COUNTED)', ''); for (const d of plugDyn) L.push('- ' + md(d)); L.push(''); }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, L.join('\n') + '\n');
  console.log(summary);
  for (const l of pluginLines) console.log(l);
  for (const r of xRows) console.log(`§ERP_VERBS_X verb=${r.verb} table=${r.table} action=${r.action} counted=${r.counted ? 'Y' : 'N'} registerDocAction=${r.site || 'none'}${r.why ? ' why=' + r.why : ''}`);
  console.log(`§ERP_VERBS_X_BASIS ${xBasis}`);
  if (!NO_PLUGINS && !seedEmpty && !plugins.length) console.log('§ERP_VERBS_PLUGINS INCONCLUSIVE no built-in plugin found in erp/plugin_overlay.js BUILTINS');
  for (const s of unresolved) console.log(`§ERP_VERBS_UNRESOLVED ${s.file}:${s.line} register site not classified`);
  if (empty) process.exit(2);
  if (unresolved.length) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
