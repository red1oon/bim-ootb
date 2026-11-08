#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-PROPOSER-GUIDE (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §14.3). READ THE §-LOG after every run.
 * ISSUE: the public guide's commands may not work for an outsider, or its numbers may have gone stale. §15.1: red edits now come back stopped, exit 3.
 * Every command runs as the guide prints it: one edit_cli.js downloaded from the live site, from an empty folder, against the live Modeller. Every number must match, and must appear on the published page.
 *   node witness_proposer_guide.js            all of it
 *   node witness_proposer_guide.js --no-page  before publishing: the commands only, the page is reported as not checked
 * Falsifier: GUIDE_BREAK=1 (one expected number is wrong) must fail. A site that cannot be reached prints INCONCLUSIVE and exits 2, never a pass.
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), https = require('https'), { spawn } = require('child_process');
const LIVE_CLI = 'https://red1oon.github.io/bim-ootb/modeller/tools/edit_cli.js', PAGE = 'https://red1oon.github.io/BIMCompiler/ProposerGuide/';
const NO_PAGE = process.argv.indexOf('--no-page') >= 0, BREAK = process.env.GUIDE_BREAK === '1';
const L = (m) => console.log('§W-PROPOSER-GUIDE ' + m);
const get = (u) => new Promise((res, rej) => https.get(u + '?nc=' + Date.now(), (r) => { if (r.statusCode !== 200) { rej(new Error('HTTP ' + r.statusCode + ' ' + u)); r.resume(); return; } let b = ''; r.setEncoding('utf8'); r.on('data', d => { b += d; }); r.on('end', () => res(b)); }).on('error', rej));
const row = (e, id) => e.rows.filter(x => x.id === id)[0];
const nw = (e, id) => e.newRows.filter(x => x.id === id)[0].count;
const noRed = (e) => ['clash', 'abuts-clash', 'door-out', 'door-crush'].every(k => nw(e, k) === 0);

const CLAIMS = [
  { name: 'G1 the Hospital: its lines, where they came from, no readable material', args: '--building Hospital --lines', exit: 0,
    check: (j) => { const m = j.model, p = (id) => m.lines.filter(l => l.id === id)[0].pos; return m.lines.length === 124 && m.grid_source === 'column-derived' && m.system === 'column-framed' && m.material === null && m.girders === 84 && Math.abs(p('gx38') - p('gx37') - 5.707) < 0.001; }, text: ['124', '5.707', 'column-derived'] },
  { name: 'G2 refused: the shift of gx38', args: '--building Hospital --shift gx38 --move 0.793', exit: 3,
    check: (j) => j.edits[0].refused === true && /filling #5531 straddles the line in #2212/.test(j.edits[0].reason), text: ['filling #5531 straddles the line in #2212'] },
  { name: 'G3 stopped: the single move of gx38, red, undone, its report inside', args: '--building Hospital --grid gx38 --move 0.793', exit: 3,
    check: (j) => { const s = j.edits[0], e = s.report; return s.stopped_by_gate === true && /^stopped: Driven into a wall it touches: 1$/.test(s.reason) && e.change.recomposed === 8 && row(e, 'overlap').before === 57 && row(e, 'overlap').after === 46 && nw(e, 'abuts-clash') === 1 && nw(e, 'clash') === 0 && nw(e, 'clearance') === 2 && nw(e, 'abuts-realign') === 1 && row(e, 'span_red').state === 'NOT_JUDGED' && j.gate[0].not_judged.indexOf('span_red') >= 0; }, text: ['57', '46', 'stopped: Driven into a wall it touches: 1'] },
  { name: 'G4 no red: gx0 outward, and the JSON the guide quotes', args: '--building Hospital --grid gx0 --move -0.5', exit: 0,
    check: (j) => { const e = j.edits[0]; return e.change.recomposed === 6 && row(e, 'overlap').before === (BREAK ? 128 : 127) && row(e, 'overlap').after === 125 && noRed(e) && nw(e, 'clearance') === 2 && e.notChecked.length === 11; }, text: ['6 moved elements against 7362', 'the material could not be read from the building, and is not guessed', 'wrong units or absurd sizes, unless they hit something'] },
  { name: 'G5 left behind: the shift of gx67', args: '--building Hospital --shift gx67 --move 1', exit: 0,
    check: (j) => { const e = j.edits[0], c = e.change; return noRed(e) && c.moved === 254 && c.stretched === 51 && c.riders === 3 && c.left.count === 19 && c.left.by_class.IfcPlate === 18 && c.left.by_class.IfcWindow === 1; }, text: ['254', '51', '19'] },
  { name: 'G6 stopped: the shift of gx39, red and left behind', args: '--building Hospital --shift gx39 --move 1', exit: 3,
    check: (j) => { const s = j.edits[0], e = s.report; return s.stopped_by_gate === true && /New or deeper (box )?overlap( \(shapes checked\))?: (18|8)( |$)/.test(s.reason) && ((nw(e, 'clash') === 18 && !e.shapes) || (nw(e, 'clash') === 8 && e.newRows.filter(x => x.id === 'clash')[0].box_count === 18)) && e.change.left.count === 34;   /* §20.2.10: once the shape check is live the stop reads 8 shape clashes of the 18 box pairs; before it, 18 */ }, text: ['18', '34'] },
  { name: 'G7 stopped: the limit and the bay, the Garage', args: '--building HospitalGarage --lattice-boxes --shift gx6 --move 1.817', exit: 3,
    check: (j) => { const s = j.edits[0], r = row(s.report, 'span_red'), b = r.over_limit_changed[0]; if (!(s.stopped_by_gate === true && /bay gx5-gx6 newly over the limit: 12\.993 m/.test(s.reason))) return false; return r.limit === 12 && r.material === 'RC' && r.before === 91 && r.after === 92 && b.bay === 'gx5-gx6' && b.before === 11.176 && b.after === 12.993 && b.newly_over === true; }, text: ['gx5-gx6', '11.176', '12.993', 'bay gx5-gx6 newly over the limit: 12.993 m'] },
  { name: 'G8 the stop can be turned off, and then the edit stands and is reported', args: '--building Hospital --report-only --grid gx38 --move 0.793', exit: 0,
    check: (j) => { const e = j.edits[0]; return !e.refused && nw(e, 'abuts-clash') === 1 && j.gate === 'off (--report-only)'; }, text: ['--report-only'] }
];

(async () => {
  let cli;
  try { cli = await get(LIVE_CLI); } catch (e) { L('verdict=INCONCLUSIVE reason=' + e.message); process.exit(2); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proposer_guide_')); fs.writeFileSync(path.join(dir, 'edit_cli.js'), cli);
  L('edit_cli.js from the live site, ' + cli.length + ' bytes, run from ' + dir);
  let pass = 0, fail = 0; const chk = (n, c, d) => { if (c) pass++; else fail++; console.log((c ? '  ✅ ' : '  ❌ ') + n + (d ? '  ' + d : '')); };
  const run = (args) => new Promise((res) => { let o = ''; const p = spawn('node', ['edit_cli.js'].concat(args.split(' ')), { cwd: dir, env: process.env, stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; }); p.on('close', c => { let j = null; try { j = JSON.parse(o); } catch (e) {} res({ code: c, json: j }); }); });
  for (const c of CLAIMS) {
    const r = await run(c.args);
    let ok = false; try { ok = r.code === c.exit && !!r.json && c.check(r.json); } catch (e) { L('check threw ' + e.message); }
    chk(c.name, ok, 'exit=' + r.code + ' ms=' + (r.json && r.json.ms));
    if (!ok) L('got ' + JSON.stringify(r.json && (r.json.edits || r.json.model)).slice(0, 900));
  }
  fs.rmSync(dir, { recursive: true, force: true });
  if (NO_PAGE) L('the published page was NOT checked (--no-page)');
  else {
    let html = null; try { html = await get(PAGE); } catch (e) { L('verdict=INCONCLUSIVE page: ' + e.message); process.exit(2); }
    const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
    for (const c of CLAIMS) {
      const miss = c.text.concat('node edit_cli.js ' + c.args).filter(t => text.indexOf(t) < 0);
      chk('P ' + c.name.split(' ')[0] + ' the page prints its command and its numbers', miss.length === 0, miss.length ? 'missing: ' + miss.join(' | ') : '');
    }
  }
  console.log('§WITNESS_PROPOSER_GUIDE pass=' + pass + ' fail=' + fail + ' verdict=' + (fail ? 'FAIL' : 'PASS'));
  process.exit(fail ? 1 : 0);
})().catch(e => { L('verdict=INCONCLUSIVE reason=' + (e && e.stack || e)); process.exit(2); });
