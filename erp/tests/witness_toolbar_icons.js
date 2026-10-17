// ⚠ DO NOT REMOVE — W-TB-ICONS (bim-compiler prompts/ERP_DEPTH_FILM.md §TB-ICONS). READ THE LOG after every run: the §TBI lines carry the evidence, exit code is not.
// THE ISSUE it proves/disproves: the twin drew text-labelled buttons in a hand-made order; legacy ADWindowToolbar draws icon-only buttons in AD_ToolBarButton order.
//   ORACLE = (a) the pilot's AD_ToolBarButton / AD_Message rows via postgres, ordered by MToolBarButton.getToolbarButtons' own SQL (independent of AdToolbar.layout);
//            (b) the catalogue (name, image, tooltip key, Alt hint) PARSED OUT OF the Java source ADWindowToolbar.java, not re-typed here.
//   Per window opened (N = windows judged): T1 drawn data-tb sequence + separators == the pilot bar; T2 each button is one <img> <Image>24.png and carries NO text;
//   T3 tooltip == pilot MsgText + the Java Alt hint; T4 the More popup lists exactly the IsShowMore rows, label = MsgText.   INCONCLUSIVE if 0 windows judged.
//   Negative control TB_BREAK=labels (button text added) must turn T2 RED.
// Run: [TB_BREAK=labels] [WINS=25] node erp/tests/witness_toolbar_icons.js > <log>
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const REPO = process.env.REPO || path.join(__dirname, '..', '..'), BREAK = process.env.TB_BREAK || '', NWIN = Number(process.env.WINS || 25);
const JAVA = os.homedir() + '/idempiere-dev-setup/idempiere/org.adempiere.ui.zk/WEB-INF/src/org/adempiere/webui/adwindow/ADWindowToolbar.java';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.png': 'image/png' };
const server = http.createServer((req, res) => { const fp = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });
const pg = (sql) => execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'postgres', '-d', process.env.PG_DB || 'idempiere_pilot', '-tA', '-F', '|', '-c', 'set search_path=adempiere;' + sql], { encoding: 'utf8' }).split('\n').filter(l => l && l !== 'SET').map(l => l.split('|'));
let fails = 0, judged = 0;
const verdict = (id, claim, cond, info, inconclusive) => { if (inconclusive) { fails++; console.log('§TBI ' + id + ' INCONCLUSIVE ' + claim); return; } judged++; if (!cond) fails++; console.log('§TBI ' + id + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + claim + (cond ? '' : ' ' + JSON.stringify(info))); };
// (b) catalogue from the Java source
const src = fs.readFileSync(JAVA, 'utf8'), CAT = {};
for (const m of src.matchAll(/(\w+)\s*=\s*createButton\("(\w+)",\s*"(\w+)",\s*"(\w+)"\);\s*\n?(?:\s*\1\.setTooltiptext\(\1\.getTooltiptext\(\)\s*\+\s*"(\s+Alt\+\w+)"\);)?/g)) CAT[m[2]] = { img: m[3], tip: m[4], alt: m[5] || '' };
(async () => {
  console.log('§TBI catalogue parsed from Java: ' + Object.keys(CAT).length + ' buttons');
  // (a) pilot bar: MToolBarButton.getToolbarButtons("W") order, official ids, no tab, active; catalogue names only
  const rows = pg("select componentname, coalesce(isaddseparator,'N'), coalesce(isshowmore,'N') from ad_toolbarbutton where action='W' and ad_tab_id is null and isactive='Y' and (ad_toolbarbutton_id<=999999 or actionclassname is not null) order by case when coalesce(seqno,0)=0 then ad_toolbarbutton_id else seqno end, ad_toolbarbutton_id")
    .filter(r => CAT[r[0]]);
  const msg = {}; for (const [v, t] of pg("select value, msgtext from ad_message where ad_client_id=0")) msg[v] = t;
  const bar = rows.filter(r => r[2] !== 'Y'), more = rows.filter(r => r[2] === 'Y').map(r => r[0]);
  const expBar = bar.map(r => r[0].toLowerCase() + (r[1] === 'Y' ? '|' : '')).concat(more.length ? ['showmore'] : []);
  console.log('§TBI pilot bar=' + expBar.join(',') + ' more=' + more.join(','));
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const PAGELOG = []; page.on('console', m => PAGELOG.push(m.text())); page.on('pageerror', e => PAGELOG.push('PAGEERR ' + e)); page.on('dialog', async d => { await d.accept(); });
  try {
    await page.goto(base + '/idempiere.html?login=GardenAdmin&lang=en_US', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.IdmpHost && !!window.__idmpDb && window.APP && window.APP.roleId != null, null, { timeout: 30000 });
    if (BREAK) await page.evaluate(b => { window.__tbBreak = b; }, BREAK);
    const wins = await page.evaluate(() => { const r = window.__idmpDb.exec("SELECT DISTINCT w.name FROM ad_window w JOIN ad_window_access a ON a.ad_window_id=w.ad_window_id AND a.isactive='Y' JOIN ad_tab t ON t.ad_window_id=w.ad_window_id WHERE a.ad_role_id=" + window.APP.roleId + " AND w.isactive='Y' ORDER BY w.name"); return r.length ? r[0].values.map(v => v[0]) : []; });
    const step = Math.max(1, Math.floor(wins.length / NWIN)), pick = wins.filter((_, i) => i % step === 0).slice(0, NWIN);
    console.log('§TBI role windows=' + wins.length + ' sampled=' + pick.length);
    let n = 0, t1bad = [], t2bad = [], t3bad = [], t4bad = [], skipped = [], moreChecked = 0;
    for (const w of pick) {
      await page.evaluate(x => window.IdmpHost.focus('tb', { window: x }), w);
      await page.waitForTimeout(900);
      const dom = await page.evaluate(() => { const tb = document.getElementById('idmp-toolbar'); if (!tb || tb.style.display === 'none') return null; const seq = [], bt = [];
        for (const c of tb.children) { if (c.classList.contains('sep')) { if (seq.length) seq[seq.length - 1] += '|'; } else if (c.classList.contains('toolbar-button')) { seq.push(c.getAttribute('data-tb')); bt.push({ n: c.getAttribute('data-tb'), title: c.title, text: c.textContent, imgs: c.querySelectorAll('img').length, src: (c.querySelector('img') || {}).getAttribute ? c.querySelector('img').getAttribute('src') : null }); } else break; }
        return { seq: seq.map((s, i) => s), bt }; });
      if (!dom || !dom.bt.length) { skipped.push(w); continue; }
      n++;
      const got = dom.seq.filter((s, i, a) => !(i === a.length - 1 && false));
      const want = expBar; const g = got.join(','), e = want.join(',');
      if (g !== e) t1bad.push({ w, got: g });
      const bad2 = dom.bt.filter(b => b.text !== '' || b.imgs !== 1 || !b.src || !b.src.endsWith((CAT[Object.keys(CAT).find(k => k.toLowerCase() === b.n)] || { img: '?' }).img + '24.png')); if (bad2.length) t2bad.push({ w, bad2: bad2.slice(0, 3) });
      const bad3 = dom.bt.filter(b => { const k = Object.keys(CAT).find(k => k.toLowerCase() === b.n); const c = CAT[k]; return !c || b.title !== (msg[c.tip] || c.tip) + c.alt; }); if (bad3.length) t3bad.push({ w, bad3: bad3.slice(0, 3).map(b => [b.n, b.title]) });
      if (more.length && moreChecked < 5) { moreChecked++;
        await page.click('#idmp-toolbar [data-tb="showmore"]'); await page.waitForTimeout(200);
        const pop = await page.$$eval('#idmp-tb-more .more-row', r => r.map(x => [x.getAttribute('data-tb-more'), x.textContent]));
        await page.mouse.click(5, 5); await page.waitForTimeout(150);
        const wantPop = more.map(m => [m.toLowerCase(), msg[CAT[m].tip] || m]);
        if (JSON.stringify(pop) !== JSON.stringify(wantPop)) t4bad.push({ w, pop, wantPop });
      }
    }
    console.log('§TBI windows judged=' + n + ' skipped(no toolbar)=' + skipped.length);
    verdict('T1', `bar order + separators: ${n - t1bad.length} of ${n} windows == the pilot AD_ToolBarButton bar`, !t1bad.length, t1bad.slice(0, 2), !n);
    verdict('T2', `icon only (one <Image>24.png, no text): ${n - t2bad.length} of ${n} windows`, !t2bad.length, t2bad.slice(0, 2), !n);
    verdict('T3', `tooltip == pilot MsgText + Java Alt hint: ${n - t3bad.length} of ${n} windows`, !t3bad.length, t3bad.slice(0, 2), !n);
    verdict('T4', `More popup == IsShowMore rows with MsgText labels: ${moreChecked - t4bad.length} of ${moreChecked} windows`, !t4bad.length, t4bad.slice(0, 1), !moreChecked);
  } catch (e) { fails++; console.log('§TBI ERROR ' + e.stack); }
  console.log(PAGELOG.filter(l => /^§TB-ICONS/.test(l)).slice(-1).join('\n'));   // the shipped § line: skipped / unported buttons
  console.log(PAGELOG.filter(l => /^PAGEERR/.test(l)).slice(0, 5).join('\n'));
  console.log('§TBI RESULT ' + (fails ? 'FAIL' : 'PASS') + ' fails=' + fails);
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})();
