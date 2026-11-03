'use strict';
// ⚠ DO NOT REMOVE — witness_one_tax_owner (bim-compiler prompts/CODE_HYGIENE_REVIEW_2026-11.md C1; spec: TAX_RESULT.md in the session scratchpad, kept in bim-compiler prompts/ERP_ONE_TAX_OWNER.md).
// SCOPE: MTax.calculateTax (MTax.java:340-372) existed 3x (erp_engine.calcTax BigInt/10-dec, doc_poster._mtaxCalc BigInt/12-dec, model_trade.calcTax BigDecimal) + taxGet 2x.
//   T1  every former implementation routes to the ONE owner (BigDecimal.mtaxCalculate, bigdecimal.js) — source gate + exactly one taxGet.
//   T2  the owner (model_trade.calcTax -> mtaxCalculate) equals the REAL java.math.BigDecimal oracle (fixtures/one_tax_owner/MTaxOracle.java, MTax.java verbatim) on the full corpus.
//   T3  each caller (engine, poster, model_trade) equals the Java oracle on every case it can express.
// Corpus: every C_Tax row of erp/ad_seed.db (+ children, + a summary-with-Rate-0 variant) x IsTaxIncluded x precisions {0,2,3 (C_Currency.StdPrecision in the seed), 12 (poster dist. path)} x amounts incl. half-up edges, tiny, large, negative.
// Modes: (default) current tree · --baseline = tree pinned at 0dc101a9 (expects FAIL) · --mutant=M1 (owner HALF_EVEN) · --mutant=M2 (engine keeps its old body) · --mutant=M3 (poster keeps its old body).
// READ THE LOG after every run (CLAUDE.md). Verdict is INCONCLUSIVE when nothing was judged.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const REPO = path.resolve(__dirname, '..', '..'), BASE = '0dc101a9';
const mode = process.argv.includes('--baseline') ? 'baseline' : ((process.argv.find(a => a.startsWith('--mutant=')) || '').slice(9) || 'current');
const L = (m) => console.log(m);
let tree = path.join(REPO, 'erp'), tmp = null;
if (mode !== 'current') {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'one_tax_')); tree = path.join(tmp, 'erp');
  if (mode === 'baseline') cp.execSync(`git -C ${REPO} archive ${BASE} ':(glob)erp/*.js' | tar -x -C ${tmp}`);
  else { fs.mkdirSync(tree); fs.readdirSync(path.join(REPO, 'erp')).filter(f => f.endsWith('.js')).forEach(f => fs.copyFileSync(path.join(REPO, 'erp', f), path.join(tree, f))); }
  const edit = (f, fn) => { const p = path.join(tree, f); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
  const oldBody = (f, re) => cp.execSync(`git -C ${REPO} show ${BASE}:erp/${f}`, { maxBuffer: 1e8 }).toString().match(re)[0];
  if (mode === 'baseline') edit('doc_poster.js', s => s.replace('_test: { poLineCost: _poLineCost,', '_test: { poLineCost: _poLineCost, mtaxCalc: _mtaxCalc,'));   // the ONLY change to the pinned baseline: expose the private fn so it can be measured
  if (mode === 'M1') edit('bigdecimal.js', s => { const a = s.indexOf('BigDecimal.mtaxCalculate = '), b = s.indexOf('return sum;', a); return s.slice(0, a) + s.slice(a, b).replace(/RM\.HALF_UP/g, 'RM.HALF_EVEN') + s.slice(b); });
  if (mode === 'M2') edit('erp_engine.js', s => s.replace(/function calcTax\(tax, amountMinor[\s\S]*?\n}\n/, oldBody('erp_engine.js', /function calcTax\(tax, amountMinor[\s\S]*?\n}\n/)));
  if (mode === 'M3') edit('doc_poster.js', s => s.replace(/function _mtaxCalc\([\s\S]*?\n}\n/, oldBody('doc_poster.js', /function _mtaxCalc\([\s\S]*?\n}\n/)));
}
L(`§ONE_TAX mode=${mode} tree=${tree}`);
const BD = require(path.join(tree, 'bigdecimal.js'));
const Eng = require(path.join(tree, 'erp_engine.js'));
const Trade = require(path.join(tree, 'model_trade.js'));
let Post = null; try { Post = require(path.join(tree, 'doc_poster.js'))._test; } catch (e) { L('§ONE_TAX poster load: ' + e.message); }

// ── corpus from REAL seed rows ──
const sq = (sql) => JSON.parse(cp.execSync(`sqlite3 -json ${path.join(REPO, 'erp', 'ad_seed.db')} "${sql}"`, { maxBuffer: 1e8 }).toString() || '[]');
const lc = (r) => { const o = {}; Object.keys(r).forEach(k => o[k.toLowerCase()] = r[k]); return o; };
const taxes = sq('select * from c_tax').map(lc);
const precs = sq('select distinct stdprecision p from c_currency order by 1').map(r => r.p);
const kidsOf = (t) => taxes.filter(k => String(k.parent_tax_id) === String(t.c_tax_id) && k.isactive === 'Y' && String(k.ad_client_id) === String(t.ad_client_id));
const taxCases = taxes.map(t => ({ id: t.c_tax_id, t, kids: kidsOf(t), kind: t.issummary === 'Y' ? 'summary' : (Number(t.rate) === 0 ? 'zero' : 'plain') }));
const s108 = taxes.find(t => t.issummary === 'Y');
if (s108) taxCases.push({ id: 'variant:summary-rate0', t: Object.assign({}, s108, { rate: '0', c_tax_id: -1 }), kids: kidsOf(s108), kind: 'summary-rate0' });
const MINOR = [0, 1, 2, 5, 49, 50, 51, 99, 100, 101, 105, 106, 115, 995, 1005, 12345, 99999, 100000, 999999999999, -1, -5, -105, -12345, -100000];
const EXTRA = ['0.005', '0.015', '0.025', '1.005', '2.675', '10.125', '0.0049999', '-0.005', '-2.675', '1234.56789', '0.000001', '100.0000051'];
const scales = precs.concat([12]);
const cases = [];
taxCases.forEach(tc => [false, true].forEach(incl => scales.forEach(sc => {
  MINOR.forEach(m => cases.push({ tc, incl, sc, amt: new BD(BigInt(m), sc).toString(), minorOK: sc <= 3 }));
  EXTRA.forEach(a => cases.push({ tc, incl, sc, amt: a, minorOK: false }));
})));
// Java oracle (real java.math.BigDecimal)
const cls = fs.mkdtempSync(path.join(os.tmpdir(), 'one_tax_cls_')), fx = path.join(REPO, 'erp/tests/fixtures/one_tax_owner');
cp.execSync(`javac -d ${cls} ${fx}/MTaxOracle.java`);
const input = cases.map(c => [c.tc.t.rate, c.tc.t.issummary, c.tc.kids.map(k => k.rate).join(';'), c.incl ? 1 : 0, c.sc, c.amt].join('\t')).join('\n') + '\n';
const jout = cp.execSync(`java -cp ${cls} MTaxOracle`, { input, maxBuffer: 1e9 }).toString().trim().split('\n');
if (jout.length !== cases.length) { L('§ONE_TAX VERDICT=FAIL java oracle line count ' + jout.length + ' != ' + cases.length); process.exit(1); }
cases.forEach((c, i) => c.java = BD.fromString(jout[i]));

// ── adapters (each returns BigDecimal, or null when the caller cannot express the case) ──
const trx = (c) => ({ find: (t, w) => c.tc.kids });
const run = {
  trade: (c) => Trade.calcTax(trx(c), c.tc.t, c.amt, c.incl, c.sc),
  engine: (c) => { if (!c.minorOK) return null; const a = BD.fromString(c.amt); if (a.setScale(c.sc, 'DOWN').compareTo(a) !== 0) return null;   // minor-unit shape: only amounts exact at the precision
    const minor = Number(a.multiply(BD.fromString('1' + '0'.repeat(c.sc))).toString());
    return new BD(BigInt(Eng.calcTax(c.tc.t, minor, c.incl, () => c.tc.kids)), c.sc); },
  poster: (c) => { if (!Post) return null; const a = BD.fromString(c.amt).setScale(12, 'HALF_UP'); return new BD(Post.mtaxCalc(c.tc.t, c.tc.kids, a.unscaledValue(), c.incl, c.sc), c.sc); },
};
const stat = {}, bad = {};
Object.keys(run).forEach(n => { stat[n] = { judged: 0, na: 0, dis: 0 }; bad[n] = {}; });
cases.forEach(c => Object.keys(run).forEach(n => {
  let r; try { r = run[n](c); } catch (e) { r = 'THROW ' + e.message; }
  if (r == null) { stat[n].na++; return; }
  stat[n].judged++;
  if (typeof r === 'string' || r.compareTo(c.java) !== 0) {
    stat[n].dis++; const cls = `${c.tc.kind} ${c.incl ? 'incl' : 'excl'} scale=${c.sc}`;
    (bad[n][cls] = bad[n][cls] || []).push({ id: c.tc.id, amt: c.amt, got: String(r), java: c.java.toString() });
  }
}));
const jc = (n) => Object.values(bad[n]).reduce((a, v) => a + v.length, 0);
L(`§ONE_TAX corpus taxes=${taxCases.length} (seed C_Tax rows=${taxes.length}) precisions=[${precs}]+12 cases=${cases.length}`);
let total = 0, fails = [];
Object.keys(run).forEach(n => {
  L(`§ONE_TAX ${n}: judged=${stat[n].judged} n/a=${stat[n].na} disagree-with-Java=${stat[n].dis}`); total += stat[n].judged;
  Object.keys(bad[n]).sort().forEach(k => { const v = bad[n][k]; L(`   ${n} DIS ${k} x${v.length} e.g. tax=${v[0].id} amt=${v[0].amt} got=${v[0].got} java=${v[0].java}`); });
});
// T1 source gate
const body = (f, re) => { const m = fs.readFileSync(path.join(tree, f), 'utf8').match(re); return m ? m[0] : ''; };
const OWN = /\.divide\(|\.multiply\(|_rhuB?\(|_dec\(|_bigDec\(|100n/;   // rate arithmetic = a private copy of the algorithm
const gates = [['erp_engine.calcTax', body('erp_engine.js', /function calcTax\(tax, amountMinor[\s\S]*?\n}\n/)], ['doc_poster._mtaxCalc', body('doc_poster.js', /function _mtaxCalc\([\s\S]*?\n}\n/)], ['model_trade.calcTax', body('model_trade.js', /function calcTax\(trx[\s\S]*?\n  }\n/)]];
let t1 = true;
gates.forEach(([n, b]) => { const ok = /mtaxCalculate/.test(b) && !OWN.test(b); L(`§ONE_TAX T1 ${n}: routes-to-owner=${/mtaxCalculate/.test(b)} own-arithmetic=${OWN.test(b)} -> ${ok ? 'ok' : 'DUPLICATE'}`); t1 = t1 && ok; });
const nTaxGet = fs.readdirSync(tree).filter(f => f.endsWith('.js')).reduce((a, f) => a + (fs.readFileSync(path.join(tree, f), 'utf8').match(/function taxGet\(/g) || []).length, 0);
L(`§ONE_TAX T1 taxGet definitions=${nTaxGet} (want 1) -> ${nTaxGet === 1 ? 'ok' : 'DUPLICATE'}`); t1 = t1 && nTaxGet === 1;
const callers = ['model_order.js', 'model_invoice.js'].map(f => [f, /T\.taxGet\(ctx,/.test(fs.readFileSync(path.join(tree, f), 'utf8'))]);
const wired = typeof Trade.taxGet === 'function' && callers.every(c => c[1]);
L(`§ONE_TAX T1 taxGet callers via T.taxGet: ${callers.map(c => c[0] + '=' + c[1])} model_trade.taxGet=${typeof Trade.taxGet} -> ${wired ? 'ok' : 'NOT WIRED'}`); t1 = t1 && wired;
const t2 = stat.trade.judged > 0 && stat.trade.dis === 0, t3 = stat.engine.judged > 0 && stat.poster.judged > 0 && stat.engine.dis === 0 && stat.poster.dis === 0 && t2;
L(`§ONE_TAX T1 ${t1 ? 'PASS' : 'FAIL'} · T2 owner==Java ${stat.trade.judged ? (t2 ? 'PASS' : 'FAIL') : 'INCONCLUSIVE'} (${stat.trade.judged} judged, ${stat.trade.dis} dis) · T3 callers==Java ${(stat.engine.judged && stat.poster.judged) ? (t3 ? 'PASS' : 'FAIL') : 'INCONCLUSIVE'} (engine ${stat.engine.judged}/${stat.engine.dis}, poster ${stat.poster.judged}/${stat.poster.dis})`);
const verdict = total === 0 ? 'INCONCLUSIVE' : (t1 && t2 && t3 ? 'PASS' : 'FAIL');
L(`§ONE_TAX VERDICT=${verdict} mode=${mode}`);
process.exit(verdict === 'PASS' ? 0 : (verdict === 'INCONCLUSIVE' ? 2 : 1));
