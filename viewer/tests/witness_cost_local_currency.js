// ⚠ DO NOT REMOVE — W-COST-LOCAL-CURRENCY (spec: prompts/CAPEX_DASHBOARD.md "2026-11-24 SPEC — the cost line's second currency follows the chosen language";
//   owner 2026-11-24: "solve the localised currency … so it shows USD (Bangladesh's)"). READ THE LOG (the page console is written to LOG); an exit code is not evidence.
//   ISSUE: the Ask "total cost" line (UAT guide B3.1) shows the loaded pack's own second currency (RM) whatever language is chosen; a Bangladesh tester on the
//   USD pack sees "USD 355,097.98 (RM 1,365,761)", never taka. And the Run Checker compared the bracket, so a line in another bracket would FAIL.
//   R  the rule (rates.js localSecond) over all 18 LOCALE_RATE_MAP locales on the US pack == the rule restated here over the pack JSON files (X of 18),
//      plus three named values: bn_BD -> BDT 42,611,757 (x 120, pwd2024_bd meta.exchange_rate), en_MY -> RM 1,365,761 (pack's own 0.26), de_DE -> EUR (x 0.85)
//   V  the REAL Viewer (headless, software GL), Shed copy, language saved as the flag saves it (bim.lang), US pack pinned as Settings ▸ 5D Rate Pack does (bim_5d_pack):
//      V1 bn_BD, V2 bl_BD -> "USD 355,097.98 (BDT 42,611,757) — total building cost"; V3 en_MY pinned, V4 en_US unpinned -> "USD 355,097.98 (RM 1,365,761)" unchanged;
//      V5 the primary exact is the same in every run (the priced amount does not move)
//   K  capex/uat/uat_compare.js judge() on the shipped manifest (reference pack 20261122): K1 the BDT line -> B3.1 PASS, K2 the RM line -> PASS, K3 the missed-exclude
//      figure USD 358,943.48 in a BDT bracket -> FAIL
//   MEASURED, not judged: bn_BD with NO pack pinned (§6.3 then prices with pwd2024_bd; which pack a Bangladesh tester uses is the owner's question)
//   INCONCLUSIVE (never PASS) when a reading is missing.   Break switch COST_LOCAL_BREAK=old serves viewer/nlp.js, viewer/rates.js and capex/uat/uat_compare.js from
//   BREAK_REF (default 2b8f6fa0, before the change): R, V1, V2 and K1 must FAIL.
// Run: SHED_DB=<copy of SHED_extracted.db> [UAT_MANIFEST=<pack manifest.json>] LOG=<file> node viewer/tests/witness_cost_local_currency.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), vm = require('vm'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const { kit } = require(path.join(ROOT, 'common', 'door', 'tests', '_kit.js'));
const k = kit('W-COST-LOCAL-CURRENCY');
const PW = process.env.PW || path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright');
const BREAK = process.env.COST_LOCAL_BREAK || '', BREAK_REF = process.env.BREAK_REF || '2b8f6fa0';
const LOGF = process.env.LOG || path.join(os.tmpdir(), 'witness_cost_local_currency.log');
const SHED = process.env.SHED_DB || '', MANIFEST = process.env.UAT_MANIFEST || path.join(os.homedir(), '.cache', 'uat_film_part3', 'pack22', 'manifest.json');
const BD = require(path.join(ROOT, 'erp', 'bigdecimal.js'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml' };
const OLD = new Set(['viewer/nlp.js', 'viewer/rates.js', 'capex/uat/uat_compare.js']);
const src = rel => (BREAK === 'old' && OLD.has(rel)) ? cp.execFileSync('git', ['-C', ROOT, 'show', BREAK_REF + ':' + rel]) : fs.readFileSync(path.join(ROOT, rel));
const out = fs.createWriteStream(LOGF); const T0 = Date.now();
const L = m => { out.write('[+' + ((Date.now() - T0) / 1000).toFixed(1) + 's] ' + m + '\n'); };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''); if (!p) p = 'viewer/viewer.html';
  let buf; try { buf = src(p); } catch (e) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
});
const pack = name => JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', name + '.json'), 'utf8')).meta || {};
const EXACT = '355097.97658', grp = n => Math.round(n).toLocaleString('en-US');

// ── R: the rule as code vs the rule restated over the JSON files
function partR() {
  const text = src('viewer/rates.js').toString();
  const MAP = eval('(' + text.match(/var LOCALE_RATE_MAP = (\{[\s\S]*?\});/)[1] + ')');
  const ctx = {}; vm.createContext(ctx);
  const fn = text.match(/function localSecond\([\s\S]*?\n\}/);
  if (fn) vm.runInContext(fn[0], ctx);
  const P = pack('rsmeans2024_us'), trl = { cur2: P.currency2, cur_rate: P.exchange_rate }, exact = Number(EXACT);
  let ok = 0; const locales = Object.keys(MAP), got = {};
  locales.forEach(loc => {
    const Lm = pack(MAP[loc]);
    const wantLocal = Lm.currency !== P.currency && Lm.currency !== P.currency2 && Lm.currency2 === P.currency && Lm.exchange_rate > 0;
    const want = wantLocal ? { cur: Lm.currency, amt: exact * Lm.exchange_rate } : { cur: P.currency2, amt: exact / P.exchange_rate };
    let g = null; if (typeof ctx.localSecond === 'function') { const s = ctx.localSecond(P.currency, P, Lm, trl); g = { cur: s.cur, amt: s.op === 'mul' ? exact * s.factor : exact / s.factor, src: s.src }; }
    got[loc] = g; const pass = !!g && g.cur === want.cur && grp(g.amt) === grp(want.amt); if (pass) ok++;
    k.L('R ' + loc + ' pack=' + MAP[loc] + ' want=' + want.cur + ' ' + grp(want.amt) + ' got=' + (g ? g.cur + ' ' + grp(g.amt) + ' src=' + g.src : 'none (no localSecond)') + (pass ? '' : ' DIFFERS'));
  });
  k.chk('R the rule == the JSON packs\' own currency/factor on all ' + locales.length + ' locales (US pack)', locales.length === 18 && ok === locales.length, ok + ' of ' + locales.length);
  const nm = (loc, cur, amt) => got[loc] && got[loc].cur === cur && grp(got[loc].amt) === amt;
  k.chk('R named: bn_BD -> BDT 42,611,757 (x 120, pwd2024_bd meta.exchange_rate); en_MY -> RM 1,365,761 (the pack\'s own 0.26); de_DE -> EUR ' + grp(exact * 0.85),
    nm('bn_BD', 'BDT', '42,611,757') && nm('en_MY', 'RM', '1,365,761') && nm('de_DE', 'EUR', grp(exact * 0.85)), JSON.stringify({ bn_BD: got.bn_BD, en_MY: got.en_MY, de_DE: got.de_DE }));
}

// ── K: the Run Checker's comparer on the shipped manifest
function partK() {
  if (!fs.existsSync(MANIFEST)) { k.incon('K', 'manifest missing: ' + MANIFEST); return; }
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')), ctx = { module: { exports: {} } }; ctx.exports = ctx.module.exports; vm.createContext(ctx);
  vm.runInContext(src('capex/uat/uat_compare.js').toString(), ctx); const UC = ctx.module.exports && ctx.module.exports.judge ? ctx.module.exports : ctx.UatCompare;
  if (!UC || !UC.judge) { k.incon('K', 'uat_compare.js exports no judge'); return; }
  const b31 = line => { const r = UC.judge(man, { marked: null, db: null, viewerLine: null, costLine: line }).rows.find(x => x.row === 'B3.1'); return r ? r.verdict : 'none'; };
  const bdt = 'USD 355,097.98 (BDT 42,611,757) — total building cost', rm = man.expected['B3.1'], miss = 'USD 358,943.48 (BDT ' + grp(358943.48 * 120) + ') — total building cost';
  k.L('K expected="' + rm + '" pack built=' + man.built + ' commit=' + man.commit);
  const v1 = b31(bdt), v2 = b31(rm), v3 = b31(miss);
  k.chk('K1 the Bangladesh line "' + bdt + '" -> B3.1 PASS', v1 === 'PASS', v1);
  k.chk('K2 the shipped RM line -> B3.1 PASS', v2 === 'PASS', v2);
  k.chk('K3 the missed-exclude figure "' + miss + '" -> B3.1 FAIL', v3 === 'FAIL', v3);
}

// ── V: the real Viewer
async function viewer(chromium, tag, lang, pinned) {
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--use-gl=swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  await ctx.addInitScript(([c, p]) => { try { if (!sessionStorage.getItem('__wclc')) { localStorage.setItem('bim.lang', c); if (p) localStorage.setItem('bim_5d_pack', p); else localStorage.removeItem('bim_5d_pack'); sessionStorage.setItem('__wclc', '1'); } } catch (e) {} }, [lang, pinned || '']);
  const page = await ctx.newPage(), logs = []; page.on('console', m => { const t = m.text(); logs.push(t); L('[' + tag + '] ' + t); }); page.on('pageerror', e => L('[' + tag + '] [pageerror] ' + e));
  const sleep = ms => page.waitForTimeout(ms), find = re => { for (let i = logs.length - 1; i >= 0; i--) { const m = re.exec(logs[i]); if (m) return m; } return null; };
  let r = {};
  try {
    await page.goto('http://127.0.0.1:' + server.address().port + '/viewer/viewer.html?blank=1&ghost=1', { waitUntil: 'load' });
    await page.waitForFunction('window.APP && typeof window.APP.openModelDb === "function"', null, { timeout: 240000 }); await sleep(2000);
    await page.evaluate(() => { try { delete window.showOpenFilePicker; } catch (e) {} window.showOpenFilePicker = undefined; });
    await page.mouse.click(900, 640); await sleep(300);
    const fc = page.waitForEvent('filechooser', { timeout: 20000 }); await page.keyboard.press('Control+o'); (await fc).setFiles(SHED);
    let st = ''; for (let i = 0; i < 720 && !/DONE/.test(st); i++) { st = await page.evaluate(() => (window.APP && APP.status ? APP.status.textContent : '') || '').catch(() => ''); if (!/DONE/.test(st)) await sleep(500); }
    await page.evaluate(() => { const i = document.getElementById('nlp-input'); i.value = 'total cost'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    let line = null; for (let i = 0; i < 120 && !line; i++) { line = await page.evaluate(() => { const m = document.body.innerText.match(/[A-Z]{2,4} [\d][\d,.   ]*\d \([A-Z]{2,4} [\d][\d,.   ]*\d\) — total building cost/); return m ? m[0] : null; }).catch(() => null); if (!line) await sleep(500); }
    await sleep(300);
    const env = await page.evaluate(() => ({ pack: window.RATE_TEMPLATE_NAME, cur: window._TRL && _TRL.cur, lang: document.documentElement.lang }));
    const ex = find(/§ASK_COST scope="total building cost".* exact=(\S+)/), cl = find(/§COST_LOCAL locale=.*/);
    r = { line, exact: ex && ex[1], costLocal: cl && cl[0], env, detect: (find(/§TRL_DETECT .*/) || [])[0] };
  } catch (e) { r.err = e && e.message; L('[' + tag + '] ERROR ' + (e && e.stack)); }
  await browser.close();
  k.L('V ' + tag + ' lang=' + lang + ' pinned=' + (pinned || '-') + ' line="' + r.line + '" exact=' + r.exact + ' env=' + JSON.stringify(r.env) + ' | ' + (r.costLocal || 'no §COST_LOCAL') + ' | ' + r.detect);
  return r;
}

(async () => {
  k.L('serving ' + ROOT + (BREAK ? ' BREAK=' + BREAK + ' ref=' + BREAK_REF : ''));
  partR(); partK();
  if (!SHED || !fs.existsSync(SHED)) { k.incon('V', 'SHED_DB missing: ' + SHED); out.end(); k.end(); return; }
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { chromium } = require(PW);
  const BDT = 'USD 355,097.98 (BDT 42,611,757) — total building cost', RM = 'USD 355,097.98 (RM 1,365,761) — total building cost';
  const runs = [['V1', 'bn_BD', 'rsmeans2024_us', BDT], ['V2', 'bl_BD', 'rsmeans2024_us', BDT], ['V3', 'en_MY', 'rsmeans2024_us', RM], ['V4', 'en_US', null, RM]], ex = [];
  for (const [id, lang, pin, want] of runs) {
    const r = await viewer(chromium, id, lang, pin);
    if (!r.line) { k.incon(id, 'no total cost line (' + (r.err || 'timeout') + ')'); continue; }
    if (r.exact) ex.push(r.exact);
    k.chk(id + ' ' + lang + (pin ? ' on the pinned ' + pin : ' (no pin)') + ' prints "' + want + '"', r.line === want, 'got "' + r.line + '"');
  }
  if (ex.length < runs.length) k.incon('V5', 'a primary exact is missing (' + ex.length + ' of ' + runs.length + ')');
  else k.chk('V5 the priced amount is the same in every run: ' + EXACT, ex.every(x => BD.of(x).compareTo(BD.of(EXACT)) === 0), ex.join(','));
  const m = await viewer(chromium, 'M', 'bn_BD', null);   // measured, not judged
  k.L('MEASURED (not judged) bn_BD with no pack pinned -> "' + m.line + '" pack=' + (m.env && m.env.pack) + ' (owner question: which pack a Bangladesh tester prices with)');
  server.close(); out.end(); k.end();
})().catch(e => { console.log('§W-COST-LOCAL-CURRENCY ERROR ' + (e && e.stack || e)); process.exit(2); });
