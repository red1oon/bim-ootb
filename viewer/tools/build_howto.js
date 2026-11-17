#!/usr/bin/env node
// build_howto.js — BUILD viewer/help/howto.json: per main-pill How To links for the `?` palette. Spec: bim-compiler
// prompts/VOCAB_MESSAGE_CATALOG.md §14.3. Generated, never hand-edited: re-run when the guide, panels.js or verbs.json change.
//   guide — the BIM User Guide section (h2-h4 of the LIVE page) whose HEADING names the pill's English name; else the one whose
//           body names it most often; an EQUAL count goes to the section whose heading shares the most words with the pill's name,
//           and only if that ties too, the first in the page; a shared word alone never links (§14.3.2: a new 'Help' section, first in the page, had taken Save/Open).
//   cli   — door verbs attached ONLY by a phrase quoted from the verb's own description (VERB_LINKS below; refused if missing).
// --check writes nothing and exits 1 if the shipped file differs (W-HOWTO H1). Live guide unreachable → exit 2 (inconclusive).
// Read the §HOWTO_BUILD lines after a run; exit code is not evidence.
'use strict';
const fs = require('fs'), path = require('path'), { Buffer } = require('buffer');
const ROOT = path.join(__dirname, '..', '..');
const GUIDE = 'https://red1oon.github.io/BIMCompiler/BIMUserGuide/';
const OUT = path.join(ROOT, 'viewer', 'help', 'howto.json');
// A pill whose only name matches are a DIFFERENT feature: no link, the reason kept in the file.
const EXCLUDE = { walk: 'the guide names "Walk" only in the Cinema Film-Maker walk-mode sections, a different feature from the mobile Walk pill' };
// pill id -> [verb, phrase quoted from that verb's description]
const VERB_LINKS = {
  find: [['viewer.counts', "the same answer the Viewer's Find panel gives"], ['viewer.clashes', "the same answer the Viewer's Find panel gives"],
         ['viewer.cost', "as the Viewer's Find panel does"]],
  tm: [['viewer.schedule_at', 'the Time Machine scrubber']]
};
const log = s => console.log('§HOWTO_BUILD ' + s);

function pills(src) {   // the top-level entries of panels.js `var _actions = [ … ];` (6-space indent)
  const a = src.indexOf('var _actions = ['), b = src.indexOf('\n    ];', a);
  if (a < 0 || b < 0) throw new Error('panels.js: _actions block not found');
  const out = [], re = /^ {6}\{ id: '([A-Za-z0-9_-]+)',\s+name: '([^']+)'/gm, block = src.slice(a, b);
  let m; while ((m = re.exec(block))) out.push({ id: m[1], name: m[2] });
  return out;
}
function unhtml(s) { return s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&para;|¶/g, '').replace(/\s+/g, ' ').trim(); }
function sections(html) {   // [{anchor, heading, body}] for every h2-h4 with an id, body = text up to the next such heading
  const re = /<h([234]) id="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/g, hs = []; let m;
  while ((m = re.exec(html))) hs.push({ anchor: m[2], heading: unhtml(m[3]).replace(/¶/g, '').trim(), start: m.index, end: re.lastIndex });
  return hs.map((h, i) => ({ anchor: h.anchor, heading: h.heading, body: unhtml(html.slice(h.end, i + 1 < hs.length ? hs[i + 1].start : html.length)) }));
}
const words = s => new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3));
function shared(heading, name) { const a = words(heading); let n = 0; words(name).forEach(w => { if (a.has(w)) n++; }); return n; }   // < 1000 always: mentions dominate
function count(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }

function build(html, panelsSrc, verbs) {
  const secs = sections(html), ps = pills(panelsSrc), byVerb = new Map(verbs.map(v => [v.verb, v]));
  const out = { spec: 'bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §14.3', guide: GUIDE, pills: {}, gaps: [], excluded: {} };
  ps.forEach(p => {
    const rec = { name: p.name, guide: null, cli: [] };
    if (EXCLUDE[p.id]) out.excluded[p.id] = EXCLUDE[p.id];
    else {
      let best = null;
      secs.forEach(s => { const h = s.heading.indexOf(p.name) >= 0, n = count(s.body, p.name), score = (h ? 1e6 : 0) + n * 1000 + shared(s.heading, p.name);
        if ((h || n > 0) && (!best || score > best.score)) best = { anchor: s.anchor, heading: s.heading, n, h, score }; });
      if (best) rec.guide = { anchor: best.anchor, heading: best.heading, in_heading: best.h, mentions: best.n }; else out.gaps.push(p.id);
    }
    (VERB_LINKS[p.id] || []).forEach(([verb, cite]) => {
      const v = byVerb.get(verb);
      if (!v) throw new Error('verb ' + verb + ' not in verbs.json');
      if ((v.description || '').indexOf(cite) < 0) throw new Error('verb ' + verb + ': quoted phrase not in its description: ' + cite);
      const req = (v.inputs || []).filter(i => i.required).map(i => i.name);
      rec.cli.push({ verb, title: v.title, line: verb + req.map(n => ' ' + n + '=<' + n + '>').join(''), cite });
    });
    out.pills[p.id] = rec;
  });
  return out;
}

async function main() {
  const check = process.argv.includes('--check');
  let html;
  try { const r = await fetch(GUIDE + '?nc=' + Date.now()); if (!r.ok) throw new Error('HTTP ' + r.status); html = await r.text(); }
  catch (e) { log('INCONCLUSIVE guide unreachable ' + GUIDE + ' err=' + e.message); process.exit(2); }
  const panelsSrc = fs.readFileSync(path.join(ROOT, 'viewer', 'panels.js'), 'utf8');
  const verbs = JSON.parse(fs.readFileSync(path.join(ROOT, 'common', 'door', 'verbs.json'), 'utf8')).verbs;
  const out = build(html, panelsSrc, verbs), text = JSON.stringify(out, null, 1) + '\n';
  const ids = Object.keys(out.pills), withGuide = ids.filter(k => out.pills[k].guide).length, withCli = ids.filter(k => out.pills[k].cli.length).length;
  log('pills=' + ids.length + ' guide=' + withGuide + ' cli_pills=' + withCli + ' gaps=' + out.gaps.join(',') + ' excluded=' + Object.keys(out.excluded).join(',') + ' bytes=' + Buffer.byteLength(text));
  if (check) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    log('check ' + (cur === text ? 'same' : 'DIFFERS')); process.exit(cur === text ? 0 : 1);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, text); log('written ' + path.relative(ROOT, OUT));
}
module.exports = { build, pills, sections, shared, GUIDE, EXCLUDE, VERB_LINKS };
if (require.main === module) main().catch(e => { log('ERROR ' + e.message); process.exit(1); });
