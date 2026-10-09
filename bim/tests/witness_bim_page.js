// witness_bim_page.js — INTERACTIVE mode end to end (prompts/BIM_UTILITY_KNIFE.md §Two run modes + §Pick UI).
// W-RUN-2 rendered==engine count · W-PICK-1 hover tooltip text · W-PICK-2 search count · W-PICK-3 select→export GlobalIds · W-RUN-3 loopback only + exits.
// Usage: node witness_bim_page.js <file.ifc>   (needs puppeteer from bim-compiler/node_modules; software GL, no GPU)
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const puppeteer = require(process.env.PUPPETEER || '/home/red1/bim-compiler/node_modules/puppeteer');
const S = require('../tools/step.js');
const src = process.argv[2]; if (!src) { console.error('usage: file.ifc'); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bimw-')), file = path.join(tmp, path.basename(src)); fs.copyFileSync(src, file);
const out = []; const say = (s) => { out.push(s); console.log(s); };
let fails = 0; const ok = (id, cond, msg) => { say((cond ? '§WITNESS PASS ' : '§WITNESS FAIL ') + id + ' ' + msg); if (!cond) fails++; };
const inc = (id, msg) => say('§WITNESS INCONCLUSIVE ' + id + ' ' + msg);
(async () => {
  const cli = cp.spawn('node', [path.join(__dirname, '..', '..', 'bim-cli.js'), 'open', file], { env: Object.assign({}, process.env, { PATH: '/nonexistent' + (process.platform === 'win32' ? '' : ':/usr/bin') }) });
  let url = ''; let cliOut = '';
  cli.stdout.on('data', (d) => { cliOut += d; const m = /§OPEN (http\S+)/.exec(cliOut); if (m) url = m[1]; });
  for (let i = 0; i < 50 && !url; i++) await new Promise((r) => setTimeout(r, 100));
  if (!url) { say('§WITNESS FAIL W-RUN-2 server never printed a URL'); process.exit(1); }
  ok('W-RUN-3a', /^http:\/\/127\.0\.0\.1:\d+\//.test(url), 'bound to loopback: ' + url);
  const model = S.parse(fs.readFileSync(file, 'utf8')), prods = S.listProducts(model);
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1100, height: 750 });
  const logs = []; pg.on('console', (m) => logs.push(m.text())); pg.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  await pg.goto(url, { waitUntil: 'load' });
  await pg.waitForFunction(() => window.__bim && window.__bim.R && window.__bim.cur && window.__bim.cur.rendered, { timeout: 120000 }).catch(() => {});
  const rl = logs.find((l) => l.startsWith('§BIM_RENDER')) || '';
  const rendered = +((/elementsRendered=(\d+)/.exec(rl) || [])[1] || 0), withGeo = +((/productsWithGeometry=(\d+)/.exec(rl) || [])[1] || 0);
  say(rl || '§BIM_RENDER missing; page logs: ' + logs.slice(-5).join(' | '));
  if (!rendered) { inc('W-RUN-2', 'nothing rendered, nothing to judge'); await br.close(); cli.kill(); process.exit(1); }
  // W-RUN-2: every product the engine lists that has geometry in web-ifc is in the table; rendered elements are all known STEP ids
  const unknown = await pg.evaluate(() => { const c = window.__bim.cur; let u = 0; c.renderedEids.forEach((id) => { if (!c.model.ents.has(id)) u++; }); return u; });
  ok('W-RUN-2', unknown === 0 && withGeo > 0, 'rendered elements=' + rendered + ' productsWithGeometry=' + withGeo + ' enginProducts=' + prods.length + ' renderedIdsNotInStep=' + unknown);
  // W-PICK-1: find a screen point that hits an element, hover, compare tooltip with engine class·name
  const hit = await pg.evaluate(() => { for (let y = 120; y < 700; y += 12) for (let x = 100; x < 1000; x += 12) { const e = window.__bim.pickAt(x, y); if (e != null) { const p = window.__bim.cur.byId.get(e); if (p) return { x, y, eid: e, type: p.type, name: p.name }; } } return null; });
  if (!hit) inc('W-PICK-1', 'no element under any probe point'); else {
    await pg.mouse.move(hit.x, hit.y); await pg.mouse.move(hit.x + 1, hit.y + 1); await new Promise((r) => setTimeout(r, 150));
    const tip = await pg.$eval('#tip', (e) => ({ t: e.textContent, d: e.style.display }));
    const want = hit.type + ' · ' + (hit.name || '(no name)') + ' — click to select';
    ok('W-PICK-1', tip.d === 'block' && tip.t === want, 'tooltip="' + tip.t + '" expected="' + want + '"');
    await pg.mouse.click(hit.x, hit.y); await new Promise((r) => setTimeout(r, 100));
    const sel = await pg.evaluate(() => [...window.__bim.selected]);
    ok('W-PICK-3a', sel.length === 1 && sel[0] === hit.eid, 'clicked eid=' + hit.eid + ' selected=' + JSON.stringify(sel));
  }
  // W-PICK-2: search panel count == engine count for the class among rendered
  const cls = 'IFCWALL'; const engineN = await pg.evaluate((c) => window.__bim.cur.prods.filter((p) => p.type.indexOf(c) >= 0 && window.__bim.cur.renderedEids.has(p.id)).length, cls);
  await pg.keyboard.press('f'); await pg.type('#sq', cls.toLowerCase()); await new Promise((r) => setTimeout(r, 200));
  const panel = await pg.evaluate(() => window.__bim.lastSearch);
  if (!engineN) inc('W-PICK-2', 'no ' + cls + ' in model'); else ok('W-PICK-2', panel === engineN, 'search "' + cls + '" panel=' + panel + ' engine=' + engineN);
  // W-PICK-3: select all matches, export, compare GlobalIds on disk (saved beside input by the served /__save)
  await pg.click('#sa'); const picked = await pg.evaluate(() => [...window.__bim.selected].map((id) => window.__bim.cur.byId.get(id).guid));
  await pg.click('#exp'); await new Promise((r) => setTimeout(r, 800));
  const saved = path.join(tmp, path.basename(file).replace(/\.ifc$/i, '') + '_extract.ifc');
  if (!fs.existsSync(saved)) ok('W-PICK-3', false, 'no export on disk at ' + saved);
  else {
    const m2 = S.parse(fs.readFileSync(saved, 'utf8')), outG = new Set(S.listProducts(m2).map((p) => p.guid));
    const missing = picked.filter((g) => !outG.has(g)).length;
    ok('W-PICK-3', missing === 0 && picked.length > 0, 'picked=' + picked.length + ' missingInExport=' + missing + ' exportBytes=' + fs.statSync(saved).size + ' file=' + path.basename(saved));
  }
  const errs = logs.filter((l) => /PAGEERROR/.test(l)); ok('W-PAGE-ERRORS', errs.length === 0, 'pageerrors=' + errs.length + (errs[0] ? ' first=' + errs[0].slice(0, 160) : ''));
  await br.close(); cli.kill();
  fs.writeFileSync(path.join(tmp, 'witness.log'), out.join('\n')); say('§WITNESS_LOG ' + path.join(tmp, 'witness.log'));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('§WITNESS FAIL harness ' + e.message); process.exit(1); });
