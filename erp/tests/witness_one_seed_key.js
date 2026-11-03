// witness_one_seed_key.js — SEAM_IDENTITY_AUDIT F10: the ERP seed IDB key has ONE owner (erp/seed_key.js).
// Issue proved/disproved: a bump of the key was a hand-edit at ~9 sites (one test sat on v13 unnoticed).
// Claims:  §SK1 zero `ad_seed_v<digits>` literals outside seed_key.js across shipped/tracked code
//          (EXCLUDED: *.md, docs/, prompts/, internal/, archive dirs, and COMMENT-ONLY lines in erp/sw.js history)
//          §SK2 every HTML using ERP_SEED_KEY (directly or via a script that does) loads seed_key.js BEFORE first use
//          §SK3 the constant equals the value origin/main shipped (no silent re-download)
//          §SK4 judged population non-empty, else INCONCLUSIVE
// Env: WITNESS_REF=origin/main  judge that tree via git (expected FAIL: literals present, no module).
//      WITNESS_MUTATE=1         re-add a literal to erp/erp.html in memory (expected FAIL).
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const REF = process.env.WITNESS_REF || '';
const git = (a) => cp.execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const files = git(REF ? ['ls-tree', '-r', '--name-only', REF] : ['ls-files']).split('\n').filter(Boolean);
const EXCL = /(^|\/)(docs|prompts|internal|archive|node_modules)\/|\.md$|\.db$|\.sql$|\.json$|\.png$|\.wasm$/;
const read = (f) => { try { return REF ? cp.execFileSync('git', ['-C', ROOT, 'show', REF + ':' + f], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }) : fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return null; } };
const LIT = /ad_seed_v\d+/;
let fails = 0, judged = 0;
const say = (t, ok, m) => { console.log('§SK' + t + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + m); if (!ok) fails++; };
const cache = {};
const get = (f) => (f in cache ? cache[f] : (cache[f] = read(f)));
if (process.env.WITNESS_MUTATE) { cache['erp/erp.html'] = (get('erp/erp.html') || '') + "\n<script>idbGet('ad_seed_v99')</script>\n"; }

// SK1
const hits = [];
for (const f of files) {
  if (EXCL.test(f) || f === 'erp/seed_key.js' || f === 'erp/tests/witness_one_seed_key.js' || !/\.(js|mjs|html)$/.test(f)) continue;
  const s = get(f); if (s == null) continue; judged++;
  s.split('\n').forEach((l, i) => {
    if (!LIT.test(l)) return;
    if (f === 'erp/sw.js' && /^\s*\/\//.test(l)) return;   // history comments of past bumps
    hits.push(f + ':' + (i + 1));
  });
}
say(1, hits.length === 0, 'literals outside owner: ' + hits.length + ' ' + hits.slice(0, 12).join(' ') + ' (judged files=' + judged + ')');

// SK2
const htmls = files.filter((f) => /\.html$/.test(f) && !EXCL.test(f));
let usedPages = 0;
for (const h of htmls) {
  const s = get(h); if (s == null) continue;
  const tags = [...s.matchAll(/<script[^>]*\bsrc="([^"?]+)[^"]*"[^>]*>/g)].map((m) => ({ src: m[1], at: m.index }));
  const dir = path.posix.dirname(h);
  let firstUse = s.indexOf('ERP_SEED_KEY');
  for (const t of tags) {
    const c = get(path.posix.normalize(dir + '/' + t.src));
    if (c && /ERP_SEED_KEY/.test(c) && t.src !== 'seed_key.js' && (firstUse < 0 || t.at < firstUse)) firstUse = t.at;
  }
  if (firstUse < 0) continue;
  usedPages++;
  const owner = tags.find((t) => t.src === 'seed_key.js');
  say(2, !!owner && owner.at < firstUse, h + ' owner@' + (owner ? owner.at : 'MISSING') + ' firstUse@' + firstUse);
}

// SK3
const expect = 'ad_seed_v18';   // value origin/main c6327cc8 shipped at every live site (erp.html:280/321, idempiere.html:921/1101/1110, system_monitor.js:321)
let val = null;
try { const m = get('erp/seed_key.js'); const mm = m && m.match(/var KEY = '([^']+)'/); val = mm && mm[1]; } catch (e) {}
say(3, val === expect, 'constant=' + val + ' expected=' + expect);

// SK4
if (!fails && (judged === 0 || usedPages === 0)) { console.log('§SK_VERDICT INCONCLUSIVE judged=' + judged + ' pagesUsingKey=' + usedPages); process.exit(2); }
console.log('§SK_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' fails=' + fails + ' judged=' + judged + ' pages=' + usedPages);
process.exit(fails ? 1 : 0);
