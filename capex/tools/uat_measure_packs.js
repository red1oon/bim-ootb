// ⚠ DO NOT REMOVE — uat_measure_packs.js writes capex/uat/uat_packs.js (spec: prompts/CAPEX_DASHBOARD.md "2026-11-24 SPEC — the Run Checker judges B3.1 per the tester's rate pack").
//   READ THE LOG (--log); an exit code is not evidence. Nothing here is typed: every figure is what the REAL Viewer (headless, software GL) printed for the Shed reference db
//   with the pack pinned (localStorage bim_5d_pack, as Settings ▸ 5D Rate Pack sets it): the `total cost` line + its §ASK_COST exact, the Find panel's whole-model cost, and the status line after the first › ERP push.
// Run: SHED_DB=<copy of a reference SHED_extracted.db> node capex/tools/uat_measure_packs.js --variant <id> --label "<what this db is>" [--packs a,b] [--out file] [--log file] [--check]
//   A VARIANT = one reference db (the Shed with a given footing depth): the file keeps every variant; a run replaces only its own. The checker picks the variant whose figure the pack's manifest states.
//   --check: measure and compare with the committed table instead of writing (exit 1 on a difference); --packs limits the list (default: every distinct pack of LOCALE_RATE_MAP).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const arg = n => { const i = process.argv.indexOf('--' + n); return i < 0 ? null : (process.argv[i + 1] && !/^--/.test(process.argv[i + 1]) ? process.argv[i + 1] : true); };
const PW = process.env.PW || path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright');
const VARIANT = arg('variant') || '', LABEL = arg('label') || VARIANT, SHED = process.env.SHED_DB || '', OUT = arg('out') || path.join(ROOT, 'capex', 'uat', 'uat_packs.js'), LOGF = arg('log') || path.join(os.tmpdir(), 'uat_measure_packs.log');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml' };
const out = fs.createWriteStream(LOGF); const T0 = Date.now(); const L = m => { out.write('[+' + ((Date.now() - T0) / 1000).toFixed(1) + 's] ' + m + '\n'); };
const ratesSrc = fs.readFileSync(path.join(ROOT, 'viewer', 'rates.js'), 'utf8');
const MAP = eval('(' + ratesSrc.match(/var LOCALE_RATE_MAP = (\{[\s\S]*?\});/)[1] + ')');
const ALL = Array.from(new Set(Object.values(MAP))).sort();
const PACKS = typeof arg('packs') === 'string' ? arg('packs').split(',') : ALL;
const meta = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', n + '.json'), 'utf8')).meta || {};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
async function measure(chromium, pack) {
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--use-gl=swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });   // a fresh context per pack: no saved language, no earlier Project Order in OPFS
  await ctx.addInitScript(p => { try { if (!sessionStorage.getItem('__uatmp')) { localStorage.setItem('bim_5d_pack', p); sessionStorage.setItem('__uatmp', '1'); } } catch (e) {} }, pack);   // pinned as Settings ▸ 5D Rate Pack pins (the page reloads once and drops ?rates=)
  const page = await ctx.newPage(), logs = [], tag = pack; page.on('console', m => { const t = m.text(); logs.push(t); L('[' + tag + '] ' + t); }); page.on('pageerror', e => L('[' + tag + '] [pageerror] ' + e));
  const sleep = ms => page.waitForTimeout(ms), find = re => { for (let i = logs.length - 1; i >= 0; i--) { const m = re.exec(logs[i]); if (m) return m; } return null; };
  const until = async (fn, ms) => { for (let i = 0; i < ms / 250; i++) { const v = await page.evaluate(fn).catch(() => null); if (v) return v; await sleep(250); } return null; };
  const r = { pack };
  try {
    await page.goto('http://127.0.0.1:' + server.address().port + '/viewer/viewer.html?blank=1&ghost=1', { waitUntil: 'load' });
    await page.waitForFunction('window.APP && typeof window.APP.openModelDb === "function"', null, { timeout: 240000 }); await sleep(2000);
    await page.evaluate(() => { try { delete window.showOpenFilePicker; } catch (e) {} window.showOpenFilePicker = undefined; });
    await page.mouse.click(900, 640); await sleep(300);
    const fc = page.waitForEvent('filechooser', { timeout: 20000 }); await page.keyboard.press('Control+o'); (await fc).setFiles(SHED);
    await until(() => /DONE/.test((window.APP && APP.status ? APP.status.textContent : '') || ''), 360000);
    r.loaded = await page.evaluate(() => window.RATE_TEMPLATE_NAME);
    await page.evaluate(() => { const i = document.getElementById('nlp-input'); i.value = 'total cost'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    r.line = await until(() => { const m = document.body.innerText.match(/[A-Z]{2,4} [\d][\d,.   ]*\d \([A-Z]{2,4} [\d][\d,.   ]*\d\) — total building cost/); return m ? m[0] : null; }, 60000);
    const ex = find(/§ASK_COST scope="total building cost".* exact=(\S+)/), cu = find(/§ASK_COST scope="total building cost".* cur=(\S+)/);
    r.exact = ex && ex[1]; r.cur = cu && cu[1];
    await page.mouse.click(900, 640); await sleep(300); await page.keyboard.press('f'); await sleep(2500);
    await page.locator('#find-tree .find-tree-row[data-find-parent="Level 1"] > span:nth-child(2)').first().click();
    r.selected = await until(() => { const t = ((document.getElementById('find-selected') || {}).innerText || '').replace(/\s+/g, ' ').trim(); return /[A-Z]{2,4} [\d,]+(\.\d{2})?(?![\d,])/.test(t) ? t : null; }, 120000);
    await page.locator('#find-erp-btn').click();
    r.push = await until(() => { const s = document.getElementById('status').textContent; return /Project Order: \d+ lines/.test(s) ? s : null; }, 120000);
  } catch (e) { r.err = e && e.message; L('[' + tag + '] ERROR ' + (e && e.stack)); }
  await browser.close();
  L('MEASURED ' + JSON.stringify(r)); console.log('§UATMEASURE ' + JSON.stringify(r));
  return r;
}
(async () => {
  if (typeof VARIANT !== 'string' || !VARIANT) { console.log('§UATMEASURE INCONCLUSIVE --variant <id> is required'); process.exit(2); }
  if (!SHED || !fs.existsSync(SHED)) { console.log('§UATMEASURE INCONCLUSIVE SHED_DB missing: ' + SHED); process.exit(2); }
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { chromium } = require(PW), res = {}, bad = [];
  for (const p of PACKS) {
    const m = meta(p); let r = await measure(chromium, p); if (r.err) { console.log('§UATMEASURE retry ' + p + ' after: ' + String(r.err).split('\n')[0]); r = await measure(chromium, p); }   // one retry: a loaded machine can miss the file chooser
    const cm = r.line && /^([A-Z]{2,4}) ([\d,]+(?:\.\d{2})?) \(/.exec(r.line);
    if (!r.line || !r.exact || !cm || r.loaded !== p || cm[1] !== m.currency || r.cur !== m.currency || !r.push || !r.selected) { bad.push(p); console.log('§UATMEASURE INCONCLUSIVE ' + p + ' ' + JSON.stringify(r)); continue; }
    res[p] = { currency: m.currency, exact: r.exact, primary: cm[1] + ' ' + cm[2], line: r.line, b4: { find_selected: r.selected, push_status: r.push } };
  }
  server.close();
  let all = {}; try { all = JSON.parse(JSON.stringify(require(OUT))); } catch (e) { all = {}; }
  const sha = require('crypto').createHash('sha256').update(fs.readFileSync(SHED)).digest('hex');
  const doc = { source: 'capex/tools/uat_measure_packs.js: the real Viewer (headless), the pack pinned as Settings > 5D Rate Pack pins it (bim_5d_pack), browser en-US, one fresh context per pack', variants: Object.assign({}, all.variants || {}) };
  doc.variants[VARIANT] = { label: LABEL, db_sha256: sha, packs: res };
  if (arg('check')) {
    let have = null; try { have = require(OUT).variants[VARIANT].packs; } catch (e) {}
    const diff = Object.keys(res).filter(p => !have || !have[p] || have[p].exact !== res[p].exact || have[p].primary !== res[p].primary || have[p].currency !== res[p].currency);
    console.log('§UATMEASURE_CHECK variant=' + VARIANT + ' ' + (bad.length ? 'INCONCLUSIVE' : diff.length ? 'FAIL' : 'PASS') + ' measured=' + Object.keys(res).length + ' differs=' + diff.join(',') + ' unreadable=' + bad.join(','));
    process.exit(bad.length || diff.length ? 1 : 0);
  }
  if (bad.length) { console.log('§UATMEASURE_WRITE REFUSED, unreadable: ' + bad.join(',')); process.exit(1); }
  const text = '// GENERATED by capex/tools/uat_measure_packs.js from real Viewer runs; never edited by hand. Spec: prompts/CAPEX_DASHBOARD.md "2026-11-24 SPEC — the Run Checker judges B3.1 per the tester\'s rate pack".\n'
    + '(function (root, factory) { if (typeof module === \'object\' && module.exports) module.exports = factory(); else root.UatPacks = factory(); })(this, function () {\n  \'use strict\';\n  return ' + JSON.stringify(doc, null, 2).replace(/\n/g, '\n  ') + ';\n});\n';
  fs.writeFileSync(OUT, text); console.log('§UATMEASURE_WRITE ' + OUT + ' variant=' + VARIANT + ' packs=' + Object.keys(res).length + ' variants=' + Object.keys(doc.variants).join(','));
})().catch(e => { console.log('§UATMEASURE ERROR ' + (e && e.stack || e)); process.exit(2); });
