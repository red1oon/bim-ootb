// ⚠ DO NOT REMOVE — W-UAT-B31-PER-PACK (spec: prompts/CAPEX_DASHBOARD.md "2026-11-24 SPEC — the Run Checker judges B3.1 per the tester's rate pack"; owner 2026-11-24:
//   "When user is Bangladesh, it is using local rates"). READ THE LOG; an exit code is not evidence.
//   ISSUE it proves or disproves: "the Run Checker marks a correct run FAIL because B3.1 knows one pack": a tester whose language is Bangla and who pinned no pack prices with
//   pwd2024_bd (RATES_SOURCE_OF_TRUTH §6.3) and reads "BDT 15,147,435.97 (USD 126,229) — total building cost"; the checker expected the US pack's line.
//   The table (capex/uat/uat_packs.js) holds VARIANTS = reference models measured by the real Viewer: 'guide-45in' (the signed 2026-11-22 pack) and 'drawing' (the owner's 2026-11-24 ruling:
//   the Footing Section's @BODYZ wins). The checker picks the variant whose figure the pack's manifest states, so a re-based pack needs no code change.
//   P1 each variant has an entry for every distinct pack of rates.js LOCALE_RATE_MAP, its currency == the pack JSON meta.currency (X of N)
//   P2 the shipped manifest (pack 20261122) selects variant guide-45in by its own B3.1 figure; a manifest stating the drawing figure selects 'drawing' (re-base, no code change); a manifest naming no variant -> INCONCLUSIVE
//   P3 the bn_BD unpinned line (the literal above) -> B3.1 PASS, pack pwd2024_bd; P3a that literal IS what the table measured for pwd2024_bd
//   P4 the US line -> PASS (rsmeans2024_us); P4b the same line digit-grouped as German ("355.097,98") -> PASS
//   P5 the Bangladesh line judged against the US pack (inputs.pack) -> FAIL      P6 a wrong BDT figure (the exclude-box miss, x 358,943.48 / 355,097.97658) -> FAIL
//   P7 no readable figure -> INCONCLUSIVE (never PASS), the whole run INCONCLUSIVE; P7b a named pack the reference has no figures for -> INCONCLUSIVE; P7c empty -> NOT GIVEN
//   P8 X of N: every pack's own measured figure -> PASS (the pack named), the miss-scaled figure -> FAIL      P9 each pack's figure against another-currency pack named -> FAIL
//   P10 re-base: under the drawing manifest the drawing figures PASS and the guide-45in figures FAIL, and the reverse under the shipped manifest (X of N packs)
//   G  the REAL checker page (check.html + the shipped pack zip, headless): the bn_BD line typed into box 5 -> B3.1 PASS naming pwd2024_bd; the US line PASS; a wrong BDT figure FAIL; text with no figure INCONCLUSIVE
//   L  (SHED_DB / SHED_DB_DRAWING given) the real Viewer re-measures rsmeans2024_us and pwd2024_bd on that db and equals its variant (uat_measure_packs.js --check)
//   INCONCLUSIVE (never PASS) when a reading is missing. Break switch UAT_PACK_BREAK=old serves origin/main's uat_compare.js (BREAK_REF, default 155428e4): P3, P8 must FAIL.
// Run: [SHED_DB=<copy of SHED_extracted.db>] [UAT_MANIFEST=<pack manifest.json>] [UAT_PACK_BREAK=old] node capex/tests/witness_uat_b31_per_pack.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const { kit } = require(path.join(ROOT, 'common', 'door', 'tests', '_kit.js'));
const k = kit('W-UAT-B31-PER-PACK');
const BREAK = process.env.UAT_PACK_BREAK || '', BREAK_REF = process.env.BREAK_REF || '155428e4';
const MANIFEST = process.env.UAT_MANIFEST || path.join(os.homedir(), '.cache', 'uat_film_part3', 'pack22', 'manifest.json'), SHED = process.env.SHED_DB || '';
const text = BREAK === 'old' ? cp.execFileSync('git', ['-C', ROOT, 'show', BREAK_REF + ':capex/uat/uat_compare.js'], { maxBuffer: 1 << 26 }).toString() : fs.readFileSync(path.join(ROOT, 'capex', 'uat', 'uat_compare.js'), 'utf8');
const ctx = { module: { exports: {} } }; ctx.exports = ctx.module.exports; ctx.UatPacks = require(path.join(ROOT, 'capex', 'uat', 'uat_packs.js')); vm.createContext(ctx); vm.runInContext(text, ctx);
const UC = ctx.module.exports.judge ? ctx.module.exports : ctx.UatCompare;
const grp = n => Math.round(n * 100) / 100;
const fmt2 = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MISS = 358943.48 / 355097.97658;   // a missed exclude box (guide B3.1): the same model priced higher by this ratio
let BDT, USD;   // the reference lines of the variant the GIVEN pack's manifest selects (2026-11-24 REBASE: the shipped pack may be the signed 45 in one or the re-based drawing one)
const rates = fs.readFileSync(path.join(ROOT, 'viewer', 'rates.js'), 'utf8'), MAP = eval('(' + rates.match(/var LOCALE_RATE_MAP = (\{[\s\S]*?\});/)[1] + ')');
const ALL = Array.from(new Set(Object.values(MAP))).sort();
const DOC = require(path.join(ROOT, 'capex', 'uat', 'uat_packs.js')), VG = DOC.variants && DOC.variants['guide-45in'], VD = DOC.variants && DOC.variants['drawing'];
const T = VG && VG.packs || {}, TD = VD && VD.packs || {}, meta = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', n + '.json'), 'utf8')).meta;
if (!fs.existsSync(MANIFEST)) { k.incon('setup', 'manifest missing: ' + MANIFEST); k.end(); process.exit(2); }
const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const SV = Object.keys(DOC.variants || {}).find(v => DOC.variants[v].packs.rsmeans2024_us && String(man.expected['B3.1']).indexOf(DOC.variants[v].packs.rsmeans2024_us.primary + ' (') === 0) || 'guide-45in', TS = (DOC.variants[SV] || {}).packs || {};
BDT = TS.pwd2024_bd && TS.pwd2024_bd.line; USD = TS.rsmeans2024_us && TS.rsmeans2024_us.line;
const b31 = (line, pack, mf) => { const r = UC.judge(mf || man, { marked: null, db: null, viewerLine: null, costLine: line, pack: pack }); return { row: r.rows.find(x => x.row === 'B3.1'), overall: r.verdict }; };
k.L('serving comparer ' + (BREAK ? 'BREAK=' + BREAK + ' (' + BREAK_REF + ')' : 'worktree') + '; manifest built=' + man.built + ' commit=' + man.commit + '; variants=' + Object.keys(DOC.variants || {}).join(',') + ' packs=' + Object.keys(T).length + '/' + Object.keys(TD).length);
// P1, P2
const complete = V => ALL.filter(p => V[p] && V[p].currency === meta(p).currency && V[p].primary && /^[A-Z]{2,4} [\d,]+(\.\d{2})?$/.test(V[p].primary) && V[p].exact && V[p].b4 && V[p].b4.push_status);
const hg = complete(T), hd = complete(TD);
k.chk('P1 guide-45in has a measured entry for every distinct pack of LOCALE_RATE_MAP, currency == the pack JSON (' + hg.length + ' of ' + ALL.length + ')', ALL.length >= 16 && hg.length === ALL.length, ALL.filter(p => hg.indexOf(p) < 0).join(',') || 'all');
k.chk('P1b drawing has the same (' + hd.length + ' of ' + ALL.length + ')', ALL.length >= 16 && hd.length === ALL.length, ALL.filter(p => hd.indexOf(p) < 0).join(',') || 'all');
const usg = TS.rsmeans2024_us, usd = TD.rsmeans2024_us, manFig = /^([A-Z]{2,4} [\d,]+\.\d{2}) \(/.exec(man.expected['B3.1']);
const manG = Object.assign({}, man, { expected: Object.assign({}, man.expected, { 'B3.1': (usg0 => usg0 ? usg0.primary : 'USD 0.00')(T.rsmeans2024_us) + ' (RM 1) \u2014 total building cost' }) });   // a manifest stating the guide-45in figure (P10, independent of which pack is shipped)
const manD = Object.assign({}, man, { expected: Object.assign({}, man.expected, { 'B3.1': (usd ? usd.primary : 'USD 0.00') + ' (RM 1) \u2014 total building cost' }) }), manX = Object.assign({}, man, { expected: Object.assign({}, man.expected, { 'B3.1': 'USD 1.00 (RM 1) \u2014 total building cost' }) });
const sel = (mf) => b31(USD, undefined, mf).row.detail;
k.chk('P2 the shipped manifest figure "' + (manFig && manFig[1]) + '" selects variant ' + SV + ' (its own figure); the drawing figure "' + (usd && usd.primary) + '" in a manifest selects drawing',
  !!manFig && !!usg && usg.primary === manFig[1] && sel(man).variant === SV && b31(usd.primary + ' (RM 1) \u2014 total building cost', undefined, manD).row.detail.variant === 'drawing', 'shipped->' + sel(man).variant + ' drawing->' + b31(usd.primary + ' (RM 1) \u2014 total building cost', undefined, manD).row.detail.variant);
const p2x = b31(USD, undefined, manX);
k.chk('P2b a manifest whose B3.1 figure no variant measured -> INCONCLUSIVE (not PASS)', p2x.row.verdict === 'INCONCLUSIVE', p2x.row.verdict + ' ' + (p2x.row.detail.reason || '').slice(0, 80));
// P3
const p3 = b31(BDT);
k.chk('P3 the bn_BD unpinned line "' + BDT + '" -> B3.1 PASS (pack pwd2024_bd)', p3.row.verdict === 'PASS' && /pwd2024_bd/.test(p3.row.detail.pack || ''), p3.row.verdict + ' pack=' + p3.row.detail.pack + (p3.row.detail.reason ? ' ' + p3.row.detail.reason : ''));
k.chk('P3a that literal is what the real Viewer measured for pwd2024_bd: "' + (TS.pwd2024_bd && TS.pwd2024_bd.line) + '"', !!TS.pwd2024_bd && TS.pwd2024_bd.line === BDT, 'exact=' + (TS.pwd2024_bd && TS.pwd2024_bd.exact));
// P4
const p4 = b31(USD), deU = USD.replace(/[\d,.]+/g, t => t.replace(/,/g, '\u0001').replace(/\./g, ',').replace(/\u0001/g, '.')), p4b = b31(deU);   // the same line grouped the German way
k.chk('P4 the US line -> PASS (rsmeans2024_us)', p4.row.verdict === 'PASS' && /rsmeans2024_us/.test(p4.row.detail.pack || ''), p4.row.verdict + ' pack=' + p4.row.detail.pack);
k.chk('P4b the US line grouped the German way ("' + deU.split(' (')[0] + '") -> PASS', p4b.row.verdict === 'PASS', p4b.row.verdict);
// P5, P6
const p5 = b31(BDT, 'rsmeans2024_us');
k.chk('P5 the Bangladesh line judged against the US pack -> FAIL', p5.row.verdict === 'FAIL', p5.row.verdict + ' ' + (p5.row.detail.reason || ''));
const bd = Number(TS.pwd2024_bd.primary.replace(/[^\d.]/g, '')), wrong = 'BDT ' + fmt2(bd * MISS) + ' (USD ' + Math.round(bd * MISS / 120).toLocaleString('en-US') + ') — total building cost', p6 = b31(wrong);
k.chk('P6 a wrong BDT figure "' + wrong + '" -> FAIL', p6.row.verdict === 'FAIL', p6.row.verdict + ' ' + (p6.row.detail.reason || ''));
// P7
const p7 = b31('total building cost'), p7b = b31(BDT, 'nosuchpack2099'), p7c = b31('   ');
k.chk('P7 no readable figure -> INCONCLUSIVE (not PASS), and the whole run INCONCLUSIVE', p7.row.verdict === 'INCONCLUSIVE' && p7.overall === 'INCONCLUSIVE', p7.row.verdict + ' overall=' + p7.overall);
k.chk('P7b a named pack the reference has no figures for -> INCONCLUSIVE', p7b.row.verdict === 'INCONCLUSIVE', p7b.row.verdict);
k.chk('P7c an empty line -> NOT GIVEN', p7c.row.verdict === 'NOT GIVEN', p7c.row.verdict);
// P8, P9
let ok8 = 0, ok9 = 0; const bad8 = [], bad9 = [];
ALL.forEach((p, i) => {
  if (!TS[p]) { bad8.push(p + ' (no entry)'); return; }
  const n = Number(TS[p].primary.replace(/[^\d.]/g, '')), cur = TS[p].currency, mk = fmt2(n * MISS);
  const hit = b31(TS[p].primary + ' (' + (cur === 'USD' ? 'BDT' : 'USD') + ' 1,234) — total building cost'), miss = b31(cur + ' ' + mk + ' (USD 1,234) — total building cost');
  if (hit.row.verdict === 'PASS' && (hit.row.detail.pack || '').split(' or ').indexOf(p) >= 0 && miss.row.verdict === 'FAIL') ok8++; else bad8.push(p + ' hit=' + hit.row.verdict + ' miss=' + miss.row.verdict);
  const other = ALL.find(q => TS[q] && TS[q].currency !== cur), x = other && b31(TS[p].primary + ' (USD 1) — total building cost', other);
  if (x && x.row.verdict === 'FAIL') ok9++; else bad9.push(p + ' vs ' + other + ' ' + (x && x.row.verdict));
});
k.chk('P8 X of N: each pack\'s own measured figure PASSES naming the pack, the exclude-box-miss figure FAILS (' + ok8 + ' of ' + ALL.length + ')', ok8 === ALL.length, bad8.join('; ') || 'all');
k.chk('P9 X of N: each pack\'s figure judged against a pack of another currency FAILS (' + ok9 + ' of ' + ALL.length + ')', ok9 === ALL.length, bad9.join('; ') || 'all');
// P10 re-base
let ok10 = 0; const bad10 = [];
ALL.forEach(p => {
  if (!T[p] || !TD[p]) { bad10.push(p + ' (missing)'); return; }
  const line = pr => pr + ' (USD 1,234) \u2014 total building cost';
  const a = b31(line(TD[p].primary), undefined, manD).row.verdict, b = b31(line(T[p].primary), undefined, manD).row.verdict, c = b31(line(T[p].primary), undefined, manG).row.verdict, d = b31(line(TD[p].primary), undefined, manG).row.verdict;
  if (a === 'PASS' && b === 'FAIL' && c === 'PASS' && d === 'FAIL') ok10++; else bad10.push(p + ' drawing/drawingMF=' + a + ' guide/drawingMF=' + b + ' guide/guideMF=' + c + ' drawing/guideMF=' + d);
});
k.chk('P10 X of N re-base: under the drawing manifest the drawing figures PASS and the guide figures FAIL, under the shipped manifest the reverse (' + ok10 + ' of ' + ALL.length + ')', ok10 === ALL.length, bad10.join('; ') || 'all');
// G the page
const PACKZIP = process.env.UAT_PACK || path.join(path.dirname(MANIFEST), 'Shed_UAT_pack_20261122.zip');   // UAT_PACK and UAT_MANIFEST must name the SAME pack (the manifest is the zip's manifest.json)
if (!fs.existsSync(PACKZIP)) k.incon('G', 'the pack zip is missing: ' + PACKZIP);
else {
  const http = require('http'), puppeteer = require(path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer')), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
  const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]);
    if (u === '/capex/uat/uat_compare.js') { r.writeHead(200, { 'Content-Type': 'text/javascript' }); r.end(text); return; }   // the comparer under test (the worktree's, or BREAK_REF's)
    fs.readFile(path.join(ROOT, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(b); }); });
  (async () => {
    await new Promise(r => srv.listen(0, '127.0.0.1', r)); const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = async (line) => { const pg = await br.newPage(), logs = []; pg.on('console', m => { const t = m.text(); if (/§UATCHECK/.test(t)) logs.push(t); });
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/capex/uat/check.html', { waitUntil: 'load' }); await (await pg.$('#pack')).uploadFile(PACKZIP);
      for (let i = 0; i < 80 && !logs.some(l => /pack (ok|refused)/.test(l)); i++) await new Promise(r => setTimeout(r, 250));
      await pg.type('#cline', line); await pg.click('#go'); for (let i = 0; i < 80 && !logs.some(l => /_VERDICT/.test(l)); i++) await new Promise(r => setTimeout(r, 250));
      const res = await pg.evaluate(() => window.__uatResult ? { verdict: window.__uatResult.verdict, b31: window.__uatResult.rows.find(x => x.row === 'B3.1'), text: document.getElementById('rows').innerText } : null); await pg.close(); return res; };
    const g1 = await page(BDT), g2 = await page(USD), g3 = await page(wrong), g4 = await page('total building cost');
    const v = g => g && g.b31 ? g.b31.verdict : 'none';
    k.L('G page B3.1: bn_BD ' + v(g1) + ' (' + (g1 && g1.b31 && g1.b31.detail.pack) + ') | US ' + v(g2) + ' | wrong BDT ' + v(g3) + ' | no figure ' + v(g4) + ' | page text for bn_BD: ' + (g1 && g1.text || '').replace(/\s+/g, ' ').slice(0, 220));
    k.chk('G1 the real page: the bn_BD line in box 5 -> B3.1 PASS (pack pwd2024_bd)', v(g1) === 'PASS' && /pwd2024_bd/.test(g1.b31.detail.pack || ''), v(g1));
    k.chk('G2 the real page: the US line -> PASS', v(g2) === 'PASS', v(g2));
    k.chk('G3 the real page: a wrong BDT figure -> FAIL', v(g3) === 'FAIL', v(g3));
    k.chk('G4 the real page: text with no figure -> INCONCLUSIVE, the page verdict INCONCLUSIVE', v(g4) === 'INCONCLUSIVE' && g4.verdict === 'INCONCLUSIVE', v(g4) + ' page=' + (g4 && g4.verdict));
    await br.close(); srv.close();
  })().then(() => finish(), e => { k.incon('G', 'page run stopped: ' + (e && e.message)); srv.close(); finish(); });
}
function finish() {
// L
[['guide-45in', SHED], ['drawing', process.env.SHED_DB_DRAWING || '']].forEach(([v, db]) => {
  if (!db || !fs.existsSync(db)) { k.incon('L ' + v, 'no db given (' + db + '): the live re-measure of this variant was not run'); return; }
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'capex', 'tools', 'uat_measure_packs.js'), '--check', '--variant', v, '--packs', 'rsmeans2024_us,pwd2024_bd', '--log', path.join(os.tmpdir(), 'uat_b31_live_' + v + '.log')], { env: Object.assign({}, process.env, { SHED_DB: db }), encoding: 'utf8', timeout: 900000 });
  const m = /§UATMEASURE_CHECK variant=\S+ (\w+) (.*)/.exec(r.stdout || ''); k.L('L ' + (m ? m[0] : 'no check line: ' + (r.stdout || '') + (r.stderr || '')));
  if (!m || m[1] === 'INCONCLUSIVE') k.incon('L ' + v, 'the live measure gave no reading'); else k.chk('L ' + v + ': the real Viewer re-measures rsmeans2024_us and pwd2024_bd == the table', m[1] === 'PASS', m[0]);
});
k.end();
}
if (!fs.existsSync(PACKZIP)) finish();   // with the zip, finish() runs after the page part
