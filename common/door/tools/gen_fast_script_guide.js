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
//   ... --refresh --only id1,id2   only those blocks, in page order, in one folder (a block that reads a file an earlier block wrote needs both)
//   ... --page GUIDE,REFERENCE --refresh --only …   the blocks of both pages in one folder (a chain that runs from one page into the other)
//   node gen_fast_script_guide.js --page docs/FastScriptGuide.md --check      exit 1 if the table is not what verbs.json gives
// Exports (used by the witness): parsePage, verbTable, needs, normalise, runBlock, makeFlatFolder.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), https = require('https'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const LIVE = 'https://red1oon.github.io/bim-ootb/';
const FLAT = ['modeller/tools/edit_cli.js', 'modeller/tools/bim_mcp.js', 'common/door/door.js', 'common/door/verbs.json', 'common/door/msg_core.js', 'common/door/vocab/messages.json', 'common/door/render.js', 'viewer/tools/viewer_verbs.js', 'viewer/tools/viewer_driver.js'];   // the 6-file download (msg_core.js + messages.json since VOCAB_MESSAGE_CATALOG.md §6) + the 2 Viewer files (NEURO §0.15)

const loadVocab = (file) => JSON.parse(fs.readFileSync(file || path.join(ROOT, 'common', 'door', 'verbs.json'), 'utf8'));

// Which download does a verb need? A verb whose program is edit_cli (or a composed verb whose lines all are) runs from the 6 files; any other needs a bim-ootb checkout.
function needs(entry, vocab) {
  const byVerb = new Map(vocab.verbs.map(v => [v.verb, v]));
  const clis = (e, seen) => {
    if (e.body) return e.body.reduce((a, ln) => { const m = /^(?:\w+\s*=\s*)?([a-z]+\.[a-z_]+)/.exec(ln.trim()); return a.concat(m && byVerb.get(m[1]) && seen.indexOf(m[1]) < 0 ? clis(byVerb.get(m[1]), seen.concat(m[1])) : []); }, []);
    return [e.calls.cli];
  };
  const all = clis(entry, [entry.verb]);
  return all.length && all.every(c => c === 'edit_cli') ? 'the 6-file download' : all.length && all.every(c => c === 'edit_cli' || c === 'viewer_verbs') ? 'the 6 files + the 2 Viewer files' : 'a bim-ootb checkout';
}
const UNIT = { m: 'metres', h: 'hours', day: 'day number' };
const inputText = (i) => '`' + i.name + '`' + (i.unit ? ' (' + (UNIT[i.unit] || i.unit) + ')' : '') + (i.required ? '' : ' (optional)');
const oldNamesLead = 'Old names that still run, each the same as the verb it points at: ';
function verbTable(vocab) {
  // §50 (7) bim-compiler prompts/CLI_ERP_IVR.md: an old name kept as an alias gets no row of its own; one line under the table names each and what it is now
  const rows = vocab.verbs.filter(e => !e.alias_of).map(e => '| `' + e.verb + '` | ' + e.title + ' | ' + (e.inputs.map(inputText).concat(e.calls && e.calls.rest ? ['further `column=value` filters (optional)'] : []).join(', ') || 'none') + ' | ' + e.harm + ' | ' + e.actors.join(', ') + ' | ' + needs(e, vocab) + ' |');
  const old = vocab.verbs.filter(e => e.alias_of).map(e => '`' + e.verb + '` → `' + e.alias_of + '`');
  return ['| Verb | What it does | Inputs | Harm | Who may use it | Needs |', '|---|---|---|---|---|---|'].concat(rows).join('\n') + (old.length ? '\n\n' + oldNamesLead + old.join(' · ') : '');
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
// a CSV ends its lines with CRLF (render.js, RFC 4180); a markdown page cannot show a CR, so the page holds LF and both sides compare with CRLF read as LF
const normalise = (s) => String(s).replace(/\r\n/g, '\n').replace(/"request":"[^"]*"/g, '"request":"R"').replace(/"ms":\d+/g, '"ms":0');
const cutLines = (s, n) => (n ? s.split('\n').map(l => (l.length > n ? l.slice(0, n) + '…' : l)).join('\n') : s);
// W-FAST-SCRIPT-GUIDE R: a run's stdout equals its block. A cut line was cut at N characters of ITS OWN run, whose "request" id carries a process id of varying length,
// so the cut point moves with that length: a cut line matches when the page line is exactly N characters + "…" and, masked, is a prefix of the real (masked) full line.
// Every other line, and the line count, must be equal once masked. (Fixed 2026-11-17: the old check cut first and masked after, so a 6-digit vs 7-digit pid failed it.)
function sameOut(realOut, pageOut, n) {
  const R = String(realOut).replace(/\r\n/g, '\n').split('\n'), P = String(pageOut).replace(/\r\n/g, '\n').split('\n');
  if (!n) return normalise(R.join('\n')) === normalise(P.join('\n'));
  if (R.length !== P.length) return false;
  return R.every((r, i) => { const p = P[i];
    if (r.length > n && p.slice(-1) === '…') return p.length === n + 1 && normalise(r).indexOf(normalise(p.slice(0, -1))) === 0;
    return normalise(r) === normalise(p); });
}

function get(rel) { return new Promise((res, rej) => https.get(LIVE + rel + '?nc=' + Date.now(), (r) => { if (r.statusCode !== 200) { rej(new Error('HTTP ' + r.statusCode + ' ' + rel)); r.resume(); return; } const c = []; r.on('data', d => c.push(d)); r.on('end', () => res(Buffer.concat(c))); }).on('error', rej)); }
async function makeFlatFolder(local) {   // an empty folder holding only the 6 files, from the live site (or from this tree when local)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast_script_flat_'));
  for (const rel of FLAT) fs.writeFileSync(path.join(dir, path.basename(rel)), local ? fs.readFileSync(path.join(ROOT, rel)) : await get(rel));
  return dir;
}
// Run one command text as the page prints it. a command that names `common/door/` (door.js, red1.js) runs in the checkout; every other command in the flat folder.
function runBlock(run, ctx) {   // ctx {flat, root, files:[{name,text}]}
  return new Promise((res) => {
    const cwd = run.cmd.indexOf('common/door/') >= 0 ? ctx.root : ctx.flat;   // a checkout command runs in the checkout; everything else in the 6-file folder
    (ctx.files || []).forEach(f => { if (run.cmd.indexOf(f.name) >= 0) fs.writeFileSync(path.join(cwd, f.name), f.text + '\n'); });
    // ISOLATION (coordinator 2026-11-16: the shared ~/.cache/bim_object op-log was polluted by other agents' runs, so a block that read it was not byte-stable, and two runs of this witness at once shared /tmp/fast_guide_*):
    // every block gets its OWN op-log and journal in this run's folder; a command that names its own BIM_OBJECT_OPLOG (the blocks that build on each other) still wins, and
    // the page's /tmp/fast_guide_ scratch names are mapped into this run's folder (the page prints /tmp/…, what a reader types; the run keeps no file outside its folder).
    const cmd = run.cmd.split('/tmp/fast_guide_').join(path.join(ctx.flat, 'fast_guide_'));
    const env = Object.assign({}, process.env, { BIM_DOOR_JOURNAL: path.join(ctx.flat, 'journal_' + run.id + '.jsonl'), BIM_OBJECT_OPLOG: path.join(ctx.flat, 'oplog_' + run.id + '.jsonl') });
    const p = spawn('bash', ['-c', cmd], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }); let o = '', e = '';
    p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; }); const t = setTimeout(() => p.kill(), 420000); p.on('close', code => { clearTimeout(t); const back = (x) => x.split(path.join(ctx.flat, 'fast_guide_')).join('/tmp/fast_guide_'); res({ code, out: back(o).trim(), err: back(e).trim() }); });   // the run's own folder is printed as the /tmp/ path the page shows   // the timer is cleared when the command ends (it kept every --refresh alive for 7 minutes)
  });
}
module.exports = { oldNamesLead, parsePage, verbTable, needs, normalise, cutLines, sameOut, runBlock, makeFlatFolder, loadVocab, GEN, FLAT };

if (require.main === module) (async () => {
  const a = process.argv.slice(2), pages = String(a[a.indexOf('--page') + 1] || '').split(',').filter(Boolean), L = (m) => console.log('§FAST_GUIDE_GEN ' + m);
  if (!pages.length || a.indexOf('--page') < 0) { console.error('usage: --page FILE[,FILE2] (--write | --refresh | --check)'); process.exit(2); }
  // --page A,B: the pages in that order, their blocks in ONE flat folder (a chain whose op-log runs from the guide into the reference, as the witness runs them)
  let flat = null;
  for (const page of pages) {
    let md = fs.readFileSync(page, 'utf8'); const vocab = loadVocab(), g = GEN(md);
    const refOnly = !g && a.indexOf('--refresh') >= 0 && a.indexOf('--only') >= 0;   // a reference page has run blocks and no verb table: --refresh --only <id> still works
    if (!g && !refOnly) { L('FAIL no <!-- GEN:verbs --> markers in ' + page); process.exit(1); }
    const table = g ? '\n' + verbTable(vocab) + '\n' : '';
    if (a.indexOf('--check') >= 0) { const same = md.slice(g.a, g.b) === table; L('verb table ' + (same ? 'equals' : 'DIFFERS from') + ' verbs.json (' + vocab.verbs.length + ' verbs)'); process.exit(same ? 0 : 1); }
    if (g && (a.indexOf('--write') >= 0 || a.indexOf('--refresh') >= 0)) {
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
      if (!flat) flat = await makeFlatFolder(a.indexOf('--local') >= 0); const { runs, files } = parsePage(md); L('flat folder ' + flat + ', ' + page + ': ' + runs.length + ' run blocks');
      const edits = [];
      for (const r of runs) {   // in page order: later blocks read files that earlier ones wrote
        if (a.indexOf('--only') >= 0 && String(a[a.indexOf('--only') + 1]).split(',').indexOf(r.id) < 0) continue;   // --only a,b: dependent blocks (one reads a file the other wrote) refresh together, in page order, in ONE flat folder
        const x = await runBlock(r, { flat, root: ROOT, files }), cut = r.opts.cut ? +r.opts.cut : 0;
        L('run ' + r.id + ' exit=' + x.code + ' stdout=' + x.out.length + ' bytes' + (x.out ? '' : ' EMPTY'));
        if (!x.out) continue;
        edits.push({ r, block: r.head + '\n```text\n$ ' + r.cmd + '\n' + cutLines(x.out.replace(/\r\n/g, '\n'), cut) + '\n```' });
      }
      edits.reverse().forEach(e => { md = md.slice(0, e.r.index) + e.block + md.slice(e.r.index + e.r.len); });   // applied last-first so earlier offsets stay valid
    }
    fs.writeFileSync(page, md); L('wrote ' + page);
  }
})().catch(e => { console.error('§FAST_GUIDE_GEN FAIL ' + (e && e.stack || e)); process.exit(1); });
