#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-FAST-SCRIPT-GUIDE (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §R.3 Lane A). READ THE §-LOG after every run.
 * ISSUE: the Fast Script User Guide's commands may not work for an outsider, its numbers may be stale or invented, and its verb table may not be the vocabulary.
 * Pattern of W-PROPOSER-GUIDE (modeller/tests/witness_proposer_guide.js). Every command in a run block is run as the page prints it:
 * `node door.js …` from an empty folder holding only the 4-file download (live site; --local = this tree), `node common/door/door.js …` from this checkout.
 *   node witness_fast_script_guide.js --page FILE             the source page: table, every run block, every number
 *   node witness_fast_script_guide.js --page FILE --live      also fetch the PUBLISHED page and the diagram, and repeat the table and number checks on the served bytes
 *   --local   take the 4 files from this tree instead of the live site (before a merge)      --no-run   skip the commands (reported as NOT checked)
 *   T  the verb table on the page equals common/door/verbs.json, name for name and cell for cell, in order
 *   R  each run block: the command's real stdout equals the page's block (only "ms" and "request" differ between real runs and are masked)
 *   C  the numbers the story rests on, recomputed from the runs with exact decimals: 11.176, 1.824, 0.824, the statuses of the five kinds of reply
 *   N  every decimal number on the page is in some run's output, or is computed from one, or is on a named list (the Node version)
 *   K  the counts the page states (verbs, viewer verbs, viewer actions, ERP N) equal verbs.json and the committed internal reports
 *   F  no command on the page is outside a run block; the 4 curl lines name exactly the 4 files
 * Falsifier: GUIDE_BREAK=1 (one expected number is wrong AND one verb is dropped from the compared set) must FAIL.
 * INCONCLUSIVE (exit 2), never a pass, when no command ran or a site cannot be reached.
 */
'use strict';
require('dns').setDefaultResultOrder('ipv4first');
const fs = require('fs'), path = require('path'), https = require('https');
const { kit, ROOT } = require('./_kit');
const G = require('../tools/gen_fast_script_guide.js');
const { Dec } = require('../door.js');
const k = kit('W-FAST-SCRIPT-GUIDE'), A = process.argv.slice(2), BREAK = process.env.GUIDE_BREAK === '1';
const arg = (n) => (A.indexOf(n) >= 0 ? A[A.indexOf(n) + 1] : null);
const PAGE_URL = 'https://red1oon.github.io/BIMCompiler/FastScriptGuide/';
const NODE_VERSION_OK = ['18.19'];   // the one decimal on the page that is not a measurement: the Node version the steps were run on
const get = (u) => new Promise((res, rej) => https.get(u + (u.indexOf('?') < 0 ? '?nc=' + Date.now() : ''), (r) => { if (r.statusCode !== 200) { rej(new Error('HTTP ' + r.statusCode + ' ' + u)); r.resume(); return; } let b = ''; r.setEncoding('utf8'); r.on('data', d => { b += d; }); r.on('end', () => res(b)); }).on('error', rej));
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const decimals = (s) => (String(s).match(/\d+\.\d+/g) || []);

(async () => {
  const pageFile = arg('--page'); if (!pageFile) { console.error('usage: --page FILE [--live] [--local] [--no-run]'); process.exit(2); }
  const md = fs.readFileSync(pageFile, 'utf8'), vocab = G.loadVocab(), { runs, files } = G.parsePage(md);
  k.L('page ' + pageFile + ': ' + runs.length + ' run blocks, ' + files.length + ' file blocks, vocabulary ' + vocab.verbs.length + ' verbs');

  // T: the verb table
  const g = G.GEN(md); let tableMd = '';
  const cmpVocab = BREAK ? { verbs: vocab.verbs.slice(0, -1) } : vocab;   // falsifier: one verb dropped from the vocabulary side
  if (!g) k.chk('T0 the page has its generated verb-table markers', false);
  else {
    tableMd = md.slice(g.a, g.b).trim();
    const want = G.verbTable(cmpVocab);
    k.chk('T1 the verb table on the page equals the table generated from verbs.json (cell for cell)', tableMd === want, 'page rows=' + (tableMd.split('\n').length - 2) + ' vocabulary=' + cmpVocab.verbs.length);
    const names = tableMd.split('\n').slice(2).map(r => (/^\| `([^`]+)`/.exec(r) || [])[1]);
    k.chk('T2 the table names equal the vocabulary names, in order', JSON.stringify(names) === JSON.stringify(cmpVocab.verbs.map(v => v.verb)), names.length + ' names');
  }

  // F: nothing outside a run block; the download lines
  const fenced = [...md.matchAll(/```(\w*)\n([\s\S]*?)```/g)].map(m => ({ lang: m[1], body: m[2] }));
  const loose = fenced.filter(b => b.lang !== 'text' && /door\.js/.test(b.body.replace(/curl -O \S+/g, '')));
  k.chk('F1 no `door.js` command sits in a code block that is not a run block', loose.length === 0, loose.length ? loose[0].body.split('\n')[0] : '');
  const curls = [...md.matchAll(/curl -O https:\/\/red1oon\.github\.io\/bim-ootb\/(\S+)/g)].map(m => m[1]);
  k.chk('F2 the page\'s curl lines name exactly the 4 downloaded files', JSON.stringify(curls.slice().sort()) === JSON.stringify(G.FLAT.slice().sort()), curls.length + ' lines');
  const proposerLink = /ProposerGuide\.md#connect-your-ai/.test(md);
  k.chk('F3 the page links the Proposer Guide for the AI connection (not duplicated)', proposerLink);

  // K: counts the page states
  const real = vocab.verbs.filter(v => !v.alias_of), vcount = real.length, vv = real.filter(v => /^viewer\./.test(v.verb)).length;   // distinct verbs; the old names kept as aliases are K7
  const rd = (f, re) => { try { const m = re.exec(fs.readFileSync(path.join(ROOT, 'internal', f), 'utf8')); return m ? +m[1] : null; } catch (e) { return null; } };
  const nAct = rd('VIEWER_ACTIONS.md', /\(N_actions\) \| (\d+) \|/), nErp = rd('ERP_VERBS.md', /\*\*N\*\* \(N_doc \+ N_proc\) \| (\d+) \|/);
  const said = (re) => { const m = re.exec(md); return m ? +m[1] : null; };
  k.chk('K1 "N verbs" on the page = verbs.json', said(/(\d+) verbs cover/) === vcount, 'page=' + said(/(\d+) verbs cover/) + ' vocabulary=' + vcount);
  k.chk('K2 "N Viewer verbs" on the page = verbs.json viewer.*', said(/door offers (\d+) Viewer verbs/) === vv, 'page=' + said(/door offers (\d+) Viewer verbs/) + ' vocabulary=' + vv);
  k.chk('K3 "N actions a person can press" = internal/VIEWER_ACTIONS.md N_actions', nAct !== null && said(/has (\d+) actions a person can press/) === nAct, 'page=' + said(/has (\d+) actions a person can press/) + ' report=' + nAct);
  k.chk('K4 "N documents and processes" = internal/ERP_VERBS.md N', nErp !== null && said(/ERP has (\d+) documents and processes/) === nErp, 'page=' + said(/ERP has (\d+) documents and processes/) + ' report=' + nErp);
  const erpOffered = real.filter(v => /^erp\./.test(v.verb)).length, misOffered = real.filter(v => /^mis\./.test(v.verb)).length, nAlias = vocab.verbs.length - real.length;
  k.chk('K5 "N ERP verbs" on the page = verbs.json erp.*', said(/door offers (\d+) ERP verbs/) === erpOffered, 'page=' + said(/door offers (\d+) ERP verbs/) + ' vocabulary=' + erpOffered);
  k.chk('K6 "N MIS verbs" on the page = verbs.json mis.* (not aliases)', said(/(\d+) MIS verbs/) === misOffered && misOffered > 0, 'page=' + said(/(\d+) MIS verbs/) + ' vocabulary=' + misOffered);
  k.chk('K7 "N old names" on the page = the aliases in verbs.json', said(/(\d+) old names/) === nAlias && nAlias > 0, 'page=' + said(/(\d+) old names/) + ' vocabulary=' + nAlias);

  // R: run every block
  const got = {};
  if (A.indexOf('--no-run') >= 0) k.incon('R', 'the commands were NOT run (--no-run); a pass here would judge only the table and the counts');
  else if (!runs.length) k.incon('R0', 'the page has no run block');
  else {
    let flat; try { flat = await G.makeFlatFolder(A.indexOf('--local') >= 0); } catch (e) { k.incon('FETCH', 'the 4-file download failed: ' + e.message); return k.end(); }
    k.L('4-file download ' + (A.indexOf('--local') >= 0 ? '(this tree)' : '(live site)') + ' in an empty folder ' + flat + ': ' + fs.readdirSync(flat).join(','));
    for (const r of runs) {
      const x = await G.runBlock(r, { flat, root: ROOT, files }); got[r.id] = x;
      const cut = r.opts.cut ? +r.opts.cut : 0, real = G.normalise(G.cutLines(x.out, cut)), shown = G.normalise(r.out);
      k.chk('R ' + r.id + ': the real stdout equals the page\'s block', !!x.out && real === shown, 'exit=' + x.code + ' bytes=' + x.out.length);
      if (!!x.out && real !== shown) { let i = 0; while (real[i] === shown[i]) i++; k.L('  first difference at ' + i + ': real=' + JSON.stringify(real.slice(Math.max(0, i - 40), i + 60)) + ' page=' + JSON.stringify(shown.slice(Math.max(0, i - 40), i + 60))); }
    }
  }

  // C: the story's numbers, recomputed
  const full = (id) => (got[id] && got[id].out) || '';
  if (got.widen) {
    let a = null, b = null;
    const pa = /"id":"gx5","axis":"x","pos":([0-9.]+)/.exec(full('widen_read')), pb = /"id":"gx6","axis":"x","pos":([0-9.]+)/.exec(full('widen_read'));
    if (pa && pb) { a = Dec.parse(pa[1]); b = Dec.parse(pb[1]); }
    const bay = a && b ? b.sub(a) : null, expect = BREAK ? '11.177' : '11.176';   // falsifier: the expected bay is wrong
    k.chk('C1 the bay between gx5 and gx6 is ' + expect + ' m (157.163 - 145.987, exact)', !!bay && bay.toString() === expect && md.indexOf(expect + ' m') >= 0, 'computed=' + (bay && bay.toString()));
    const mv = bay ? Dec.parse('13').sub(bay) : null, mm = /"move":([0-9.]+)/.exec(full('widen_move'));
    k.chk('C2 the move to reach 13 m is 1.824, computed exactly, equals what the door passed on', !!mv && mv.toString() === '1.824' && !!mm && mm[1] === '1.824' && md.indexOf('**1.824 m**') >= 0, 'computed=' + (mv && mv.toString()) + ' door=' + (mm && mm[1]));
    const why = full('widen_why');
    k.chk('C3 the 13 m request is stopped, with the app\'s reason, and exit 3', /"why":"line 2 \(modeller\.try_shift\): stopped: Beam spans over limit: 91 -> 92 \(limit 12 m, RC\); bay gx5-gx6 newly over the limit: 13 m"/.test(why) && full('widen') === 'exit 3', why.slice(0, 160) + ' | ' + full('widen'));
    const bayRow = /"bay":"gx5-gx6","before":([0-9.]+),"after":([0-9.]+),"newly_over":true/.exec(full('widen_bay'));
    k.chk('C4 the report row: gx5-gx6 went 11.176 to 13, newly over the limit', !!bayRow && bayRow[1] === '11.176' && bayRow[2] === '13', bayRow ? bayRow[1] + ' -> ' + bayRow[2] : 'none');
    const heads = (full('widen_steps').match(/"status":"([^"]*)"/g) || []).map(s => s.slice(10, -1));
    k.chk('C5 the widen_bay envelopes in order: the whole request refused, the grid read ok, the shift refused', JSON.stringify(heads) === JSON.stringify(['refused', 'ok', 'refused']), heads.join(','));
  }
  if (got.script) {
    const lines = got.lines && got.widen_read ? full('widen_read') : '';
    const pa = /"id":"gx5","axis":"x","pos":([0-9.]+)/.exec(lines), pb = /"id":"gx6","axis":"x","pos":([0-9.]+)/.exec(lines);
    const m0 = pa && pb ? Dec.parse('12').sub(Dec.parse(pb[1]).sub(Dec.parse(pa[1]))) : null, mm = /"delta":([0-9.]+)/.exec(full('script_move'));
    k.chk('C6 the script computes 12 - 11.176 = 0.824 exactly, equals the door\'s delta', !!m0 && m0.toString() === '0.824' && !!mm && mm[1] === '0.824', 'computed=' + (m0 && m0.toString()) + ' door=' + (mm && mm[1]));
    const fl = String(12 - 11.176);
    k.chk('C7 the page\'s floating-point figure is what floating point gives (' + fl + ') and differs from the door\'s', md.indexOf(fl) >= 0 && fl !== '0.824', 'js=' + fl);
    const st = (full('script_status').match(/"status":"([^"]*)"/g) || []).map(s => s.slice(10, -1));
    k.chk('C8 both lines of the script answer ok, and the page says so; the span count stays 91 -> 91', st.length === 2 && st[0] === 'ok' && st[1] === 'ok' && md.indexOf('both answer `ok`') >= 0 && /"before":91,"after":91,"delta":0/.test(full('script_span')), st.join(',') + ' | ' + full('script_span').slice(-60));
    k.L('script outcome: ' + st.join(','));
  }
  const status = (id) => { const m = /"status":"([a-z]+)"/.exec(full(id)); return m ? m[1] : null; };
  const kinds = { lines: 'ok', question: 'refused', error: 'error', claim: 'claim', claim_email: 'claim', inconclusive: 'inconclusive' };
  if (Object.keys(got).length) for (const id of Object.keys(kinds)) k.chk('C9 ' + id + ' answers status ' + kinds[id], status(id) === kinds[id], 'got=' + status(id));
  if (got.describe_methods) k.chk('C10 object.describe lists the generic methods for Element', /"methods":\["read","update","attach","history"\]/.test(full('describe_methods')) && /read.*update.*attach.*history/.test(md.slice(md.indexOf('run: describe_methods'))), full('describe_methods'));

  // N: every decimal on the page is accounted for
  const known = new Set(NODE_VERSION_OK);
  Object.keys(got).forEach(id => decimals(got[id].out).forEach(d => known.add(d)));
  known.add(String(12 - 11.176));
  const pageNoTable = md.replace(tableMd, '');
  const onPage = [...new Set(decimals(pageNoTable))], unknown = onPage.filter(d => !known.has(d));
  if (!Object.keys(got).length) k.L('N: no run happened, so the decimals cannot be matched to a run (NOT checked)');
  else k.chk('N1 every decimal number on the page appears in a real run\'s output, is computed from one, or is the Node version', unknown.length === 0, onPage.length + ' decimals on the page' + (unknown.length ? '; NOT in any run: ' + unknown.join(', ') : ''));

  // LIVE: the published page
  if (A.indexOf('--live') >= 0) {
    let html; try { html = await get(PAGE_URL); } catch (e) { k.incon('LIVE', 'the published page: ' + e.message); return k.end(); }
    const t = text(html);
    const missing = vocab.verbs.map(v => v.verb).filter(n => t.indexOf(n) < 0);
    k.chk('L1 the published page names every verb of verbs.json', missing.length === 0, missing.length ? 'missing: ' + missing.join(', ') : vocab.verbs.length + ' verbs found');
    const rowsLive = (html.match(/<td><code>[a-z]+\.[a-z_]+<\/code><\/td>/g) || []).map(s => s.replace(/<[^>]+>/g, ''));
    k.chk('L2 the published table rows, in order, are the vocabulary names', JSON.stringify(rowsLive) === JSON.stringify(vocab.verbs.map(v => v.verb)), rowsLive.length + ' rows');
    const cmds = runs.map(r => r.cmd).filter(c => t.indexOf(c) < 0);
    k.chk('L3 the published page prints every command', cmds.length === 0, cmds.length ? 'missing: ' + cmds[0] : runs.length + ' commands');
    const unk = [...new Set(decimals(t))].filter(d => !known.has(d) && d !== '1.0');
    k.chk('L4 every decimal on the published page is accounted for', Object.keys(got).length > 0 && unk.length === 0, unk.length ? 'NOT in any run: ' + unk.join(', ') : '');
    const img = /<img[^>]+src="([^"]*one_door\.svg)"/.exec(html);
    if (!img) k.chk('L5 the published page carries the one-door diagram', false, 'no <img> for one_door.svg');
    else {
      const url = new URL(img[1], PAGE_URL).toString();
      try { const svg = await get(url); k.chk('L5 the diagram is served (HTTP 200) and is the redrawn one', /ONE DOOR: the script engine/.test(svg) && /CHANNEL/.test(svg), url + ' ' + svg.length + ' bytes'); } catch (e) { k.chk('L5 the diagram is served', false, e.message); }
    }
  } else k.L('the published page was NOT checked (no --live)');
  k.end();
})().catch(e => { console.log('§WITNESS_FAST_SCRIPT_GUIDE verdict=INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
