#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — gen_fast_script_guide.js: the Fast Script User Guide's two generated parts. READ THE §-LOG after every run.
// Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §R.3 Lane A (lane file A.md). Witness: common/door/tests/witness_fast_script_guide.js (W-FAST-SCRIPT-GUIDE).
// ISSUE: a guide's verb table and example output, typed by hand, drift from the vocabulary and from what the commands print.
//   1. The verb table between  <!-- GEN:verbs -->  and  <!-- /GEN:verbs -->  is built from common/door/verbs.json, never typed.
//   2. A run block is  <!-- run: id [cut=N] -->  then a ```text fence whose first line is  $ <command>  and whose other lines are the command's stdout.
//      --refresh re-runs every run block and pastes the real stdout (each line cut to N characters if cut=N, marked with "…"). Nothing is retyped.
//   node gen_fast_script_guide.js --page docs/FastScriptGuide.md --write      rebuild the verb table
//   node gen_fast_script_guide.js --page docs/FastScriptGuide.md --refresh    re-run every run block, paste its stdout (slow: opens the Modeller)
//   node gen_fast_script_guide.js --page docs/FastScriptGuide.md --check      exit 1 if the table is not what verbs.json gives
// Exports (used by the witness): parsePage, verbTable, needs, normalise, runBlock, makeFlatFolder.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), https = require('https'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const LIVE = 'https://red1oon.github.io/bim-ootb/';
const FLAT = ['modeller/tools/edit_cli.js', 'modeller/tools/bim_mcp.js', 'common/door/door.js', 'common/door/verbs.json', 'common/door/render.js', 'viewer/tools/viewer_verbs.js', 'viewer/tools/viewer_driver.js'];   // the 4-file download + the 2 Viewer files (NEURO §0.15)

const loadVocab = (file) => JSON.parse(fs.readFileSync(file || path.join(ROOT, 'common', 'door', 'verbs.json'), 'utf8'));

// Which download does a verb need? A verb whose program is edit_cli (or a composed verb whose lines all are) runs from the 4 files; any other needs a bim-ootb checkout.
function needs(entry, vocab) {
  const byVerb = new Map(vocab.verbs.map(v => [v.verb, v]));
  const clis = (e, seen) => {
    if (e.body) return e.body.reduce((a, ln) => { const m = /^(?:\w+\s*=\s*)?([a-z]+\.[a-z_]+)/.exec(ln.trim()); return a.concat(m && byVerb.get(m[1]) && seen.indexOf(m[1]) < 0 ? clis(byVerb.get(m[1]), seen.concat(m[1])) : []); }, []);
    return [e.calls.cli];
  };
  const all = clis(entry, [entry.verb]);
  return all.length && all.every(c => c === 'edit_cli') ? 'the 4-file download' : all.length && all.every(c => c === 'edit_cli' || c === 'viewer_verbs') ? 'the 4 files + the 2 Viewer files' : 'a bim-ootb checkout';
}
const UNIT = { m: 'metres', h: 'hours', day: 'day number' };
const inputText = (i) => '`' + i.name + '`' + (i.unit ? ' (' + (UNIT[i.unit] || i.unit) + ')' : '') + (i.required ? '' : ' (optional)');
function verbTable(vocab) {
  const rows = vocab.verbs.map(e => '| `' + e.verb + '` | ' + e.title + ' | ' + (e.inputs.map(inputText).concat(e.calls && e.calls.rest ? ['further `column=value` filters (optional)'] : []).join(', ') || 'none') + ' | ' + e.harm + ' | ' + e.actors.join(', ') + ' | ' + needs(e, vocab) + ' |');
  return ['| Verb | What it does | Inputs | Harm | Who may use it | Needs |', '|---|---|---|---|---|---|'].concat(rows).join('\n');
}
const GEN = (md) => { const a = md.indexOf('<!-- GEN:verbs -->'), b = md.indexOf('<!-- /GEN:verbs -->'); return a < 0 || b < a ? null : { a: a + '<!-- GEN:verbs -->'.length, b }; };

// run blocks and file blocks
function parsePage(md) {
  const runs = [], files = [];
  let m; const re = /<!-- run: (\S+)((?: \w+=\S+)*) -->\n```text\n([\s\S]*?)\n```/g;
  while ((m = re.exec(md))) {
    const opts = {}; (m[2].match(/\w+=\S+/g) || []).forEach(x => { const [k, v] = x.split('='); opts[k] = v; });
    const lines = m[3].split('\n'); if (lines[0].indexOf('$ ') !== 0) throw new Error('run block ' + m[1] + ' must start with "$ "');
    runs.push({ id: m[1], opts, cmd: lines[0].slice(2), out: lines.slice(1).join('\n'), index: m.index, len: m[0].length, head: '<!-- run: ' + m[1] + m[2] + ' -->' });
  }
  const rf = /<!-- file: (\S+) -->\n```text\n([\s\S]*?)\n```/g;
  while ((m = rf.exec(md))) files.push({ name: m[1], text: m[2] });
  return { runs, files };
}
// the only fields that differ between two real runs of the same command: the request id and the milliseconds
const normalise = (s) => String(s).replace(/"request":"[^"]*"/g, '"request":"R"').replace(/"ms":\d+/g, '"ms":0');
const cutLines = (s, n) => (n ? s.split('\n').map(l => (l.length > n ? l.slice(0, n) + '…' : l)).join('\n') : s);

function get(rel) { return new Promise((res, rej) => https.get(LIVE + rel + '?nc=' + Date.now(), (r) => { if (r.statusCode !== 200) { rej(new Error('HTTP ' + r.statusCode + ' ' + rel)); r.resume(); return; } const c = []; r.on('data', d => c.push(d)); r.on('end', () => res(Buffer.concat(c))); }).on('error', rej)); }
async function makeFlatFolder(local) {   // an empty folder holding only the 4 files, from the live site (or from this tree when local)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast_script_flat_'));
  for (const rel of FLAT) fs.writeFileSync(path.join(dir, path.basename(rel)), local ? fs.readFileSync(path.join(ROOT, rel)) : await get(rel));
  return dir;
}
// Run one command text as the page prints it. a command that names `common/door/` (door.js, dotted.js) runs in the checkout; every other command in the flat folder.
function runBlock(run, ctx) {   // ctx {flat, root, files:[{name,text}]}
  return new Promise((res) => {
    const cwd = run.cmd.indexOf('common/door/') >= 0 ? ctx.root : ctx.flat;   // a checkout command runs in the checkout; everything else in the 4-file folder
    (ctx.files || []).forEach(f => { if (run.cmd.indexOf(f.name) >= 0) fs.writeFileSync(path.join(cwd, f.name), f.text + '\n'); });
    const env = Object.assign({}, process.env, { BIM_DOOR_JOURNAL: path.join(ctx.flat, 'journal_' + run.id + '.jsonl') });
    const p = spawn('bash', ['-c', run.cmd], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }); let o = '', e = '';
    p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; }); const t = setTimeout(() => p.kill(), 420000); p.on('close', code => { clearTimeout(t); res({ code, out: o.trim(), err: e.trim() }); });   // the timer is cleared when the command ends (it kept every --refresh alive for 7 minutes)
  });
}
module.exports = { parsePage, verbTable, needs, normalise, cutLines, runBlock, makeFlatFolder, loadVocab, GEN, FLAT };

if (require.main === module) (async () => {
  const a = process.argv.slice(2), page = a[a.indexOf('--page') + 1], L = (m) => console.log('§FAST_GUIDE_GEN ' + m);
  if (!page || a.indexOf('--page') < 0) { console.error('usage: --page FILE (--write | --refresh | --check)'); process.exit(2); }
  let md = fs.readFileSync(page, 'utf8'); const vocab = loadVocab(), g = GEN(md);
  if (!g) { L('FAIL no <!-- GEN:verbs --> markers in ' + page); process.exit(1); }
  const table = '\n' + verbTable(vocab) + '\n';
  if (a.indexOf('--check') >= 0) { const same = md.slice(g.a, g.b) === table; L('verb table ' + (same ? 'equals' : 'DIFFERS from') + ' verbs.json (' + vocab.verbs.length + ' verbs)'); process.exit(same ? 0 : 1); }
  if (a.indexOf('--write') >= 0 || a.indexOf('--refresh') >= 0) {
    md = md.slice(0, g.a) + table + md.slice(g.b); L('verb table written: ' + vocab.verbs.length + ' verbs');
    // the coverage sentence's counts come from the vocabulary too (the witness's K1, K2, K5 read them back)
    const real = vocab.verbs.filter(v => !v.alias_of), n = (app) => real.filter(v => v.verb.indexOf(app + '.') === 0).length, nAlias = vocab.verbs.length - real.length;   // distinct verbs: an old name kept as an alias is counted on its own (CLI_ERP_IVR §11)
    // the two totals the page quotes from the committed inventory reports (the witness's K3, K4 read them back)
    const rd = (f, re) => { try { const m = re.exec(fs.readFileSync(path.join(ROOT, 'internal', f), 'utf8')); return m ? m[1] : null; } catch (e) { return null; } };
    const nAct = rd('VIEWER_ACTIONS.md', /\(N_actions\) \| (\d+) \|/), nErp = rd('ERP_VERBS.md', /\*\*N\*\* \(N_doc \+ N_proc\) \| (\d+) \|/);
    if (nAct) md = md.replace(/has \d+ actions a person can press/, 'has ' + nAct + ' actions a person can press');
    if (nErp) md = md.replace(/ERP has \d+ documents and processes/, 'ERP has ' + nErp + ' documents and processes');
    md = md.replace(/\d+ verbs cover/, real.length + ' verbs cover').replace(/\d+ MIS verbs/, n('mis') + ' MIS verbs').replace(/\d+ old names/, nAlias + ' old names').replace(/door offers \d+ Viewer verbs/, 'door offers ' + n('viewer') + ' Viewer verbs').replace(/door offers \d+ ERP verbs/, 'door offers ' + n('erp') + ' ERP verbs');
  }
  if (a.indexOf('--refresh') >= 0) {
    const flat = await makeFlatFolder(a.indexOf('--local') >= 0), { runs, files } = parsePage(md); L('flat folder ' + flat + ', ' + runs.length + ' run blocks');
    const edits = [];
    for (const r of runs) {   // in page order: later blocks read files that earlier ones wrote
      if (a.indexOf('--only') >= 0 && a[a.indexOf('--only') + 1] !== r.id) continue;
      const x = await runBlock(r, { flat, root: ROOT, files }), cut = r.opts.cut ? +r.opts.cut : 0;
      L('run ' + r.id + ' exit=' + x.code + ' stdout=' + x.out.length + ' bytes' + (x.out ? '' : ' EMPTY'));
      if (!x.out) continue;
      edits.push({ r, block: r.head + '\n```text\n$ ' + r.cmd + '\n' + cutLines(x.out, cut) + '\n```' });
    }
    edits.reverse().forEach(e => { md = md.slice(0, e.r.index) + e.block + md.slice(e.r.index + e.r.len); });   // applied last-first so earlier offsets stay valid
  }
  fs.writeFileSync(page, md); L('wrote ' + page);
})().catch(e => { console.error('§FAST_GUIDE_GEN FAIL ' + (e && e.stack || e)); process.exit(1); });
