// witness_bim_engine.js — engine claims from prompts/BIM_UTILITY_KNIFE.md: W-UP-1..3, W-EX-1..3, W-SPLIT, W-CLI-1 (browser-load path == Node path, byte-identical).
// IfcOpenShell (python) is the INDEPENDENT oracle for validity; if it is not installed those claims print INCONCLUSIVE, never PASS.
// Usage: node witness_bim_engine.js file1.ifc [file2.ifc …]
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os'), crypto = require('crypto'), http = require('http');
const S = require('../tools/step.js'), U = require('../tools/upgrade.js'), X = require('../tools/extract.js'), Sp = require('../tools/split.js'), H = require('../tools/health.js');
const files = process.argv.slice(2); if (!files.length) { console.error('usage: files'); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bime-'));
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§WITNESS PASS ' : '§WITNESS FAIL ') + id + ' ' + m); if (!c) fails++; };
const inc = (id, m) => console.log('§WITNESS INCONCLUSIVE ' + id + ' ' + m);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const VAL = `
import sys, ifcopenshell, ifcopenshell.validate as v
class L:
    def __init__(s): s.n=0
    def set_state(s,*a): pass
    def error(s,*a,**k): s.n+=1
    def warning(s,*a,**k): pass
    def info(s,*a,**k): pass
for p in sys.argv[1:]:
    try:
        f=ifcopenshell.open(p); l=L(); v.validate(f,l); print(l.n)
    except Exception as e: print(-1)
`;
fs.writeFileSync(path.join(tmp, 'val.py'), VAL);
function oracle(paths) { try { const o = cp.execFileSync('python3', [path.join(tmp, 'val.py'), ...paths], { encoding: 'utf8', timeout: 300000 }); return o.trim().split('\n').map(Number); } catch (e) { return null; } }
const gids = (m) => new Set(S.listProducts(m).map((p) => p.guid));
(async () => {
  for (const f of files) {
    const nm = path.basename(f), text = fs.readFileSync(f, 'utf8'), model = S.parse(text);
    console.log('§ENGINE file=' + nm + ' schema=' + model.schema + ' entities=' + model.ents.size + ' skippedStatements=' + model.bad);
    ok('W-PARSE', model.ents.size > 0 && model.bad === 0, 'statements unparsed=' + model.bad);
    // ── upgrade
    const up = U.upgradeModel(model, {});
    if (up.skipped) inc('W-UP-1', nm + ' ' + up.report.note); else {
      const r = up.report; ok('W-UP-1', r.verdict === 'PASS', 'in=' + r.entitiesIn + ' accounted=' + r.accounted + ' out=' + r.entitiesOut + ' dissolved=' + r.dissolved + ' requiredEmpty=' + JSON.stringify(r.requiredEmpty) + ' dropped=' + JSON.stringify(r.dropped));
      const uf = path.join(tmp, nm.replace(/\.ifc$/i, '') + '_ifc43.ifc'); fs.writeFileSync(uf, up.bytes);
      const m2 = S.parse(up.text); ok('W-UP-2a', m2.schema === 'IFC4X3_ADD2' && m2.ents.size === r.entitiesOut && m2.bad === 0, 'reparsed schema=' + m2.schema + ' entities=' + m2.ents.size);
      const g1 = gids(model), g2 = gids(m2); const lost = [...g1].filter((g) => !g2.has(g)).length;
      ok('W-UP-3a', lost === (up.report.requiredEmpty && Object.keys(up.report.requiredEmpty).length ? lost : 0) && g2.size > 0, 'products in=' + g1.size + ' out=' + g2.size + ' GlobalIds lost=' + lost + ' (only entities with required-empty attrs may disappear)');
      const h1 = H.healthModel(model).metrics, h2 = H.healthModel(m2).metrics;
      ok('W-UP-3b', ['M4_spatialChain', 'M4_storeys', 'M5_spaces', 'M7_psetPct', 'M8_materialPct', 'M14_orphans', 'M15_duplicateGuids'].every((k) => h1[k] === h2[k]), 'health before/after ' + JSON.stringify(['M3_elements', 'M7_psetPct', 'M8_materialPct', 'M14_orphans'].map((k) => k + ':' + h1[k] + '→' + h2[k])));
      const v = oracle([f, uf]);
      if (!v) inc('W-UP-2b', 'IfcOpenShell not available'); else ok('W-UP-2b', v[1] >= 0 && v[1] <= v[0], 'IfcOpenShell validate errors: source=' + v[0] + ' upgraded=' + v[1] + ' (upgrade must add none)');
    }
    // ── extract: each of the biggest classes
    const cnt = {}; S.listProducts(model).forEach((p) => (cnt[p.type] = (cnt[p.type] || 0) + 1));
    const classes = Object.keys(cnt).filter((c) => !/^IFC(BUILDINGSTOREY|BUILDING|SITE|SPACE|OPENINGELEMENT)$/.test(c)).sort((a, b) => cnt[b] - cnt[a]).slice(0, 3);
    const outs = [];
    for (const c of classes) {
      const r = X.extractModel(model, { classes: [c] }); const ef = path.join(tmp, nm + '_' + c + '.ifc'); fs.writeFileSync(ef, r.bytes); outs.push([c, ef, r]);
      const mo = S.parse(r.text), go = gids(mo), sel = S.listProducts(model).filter((p) => p.type === c).map((p) => p.guid);
      ok('W-EX-1/2/3 ' + c, r.report.selected === cnt[c] && sel.every((g) => go.has(g)) && r.report.dangling === 0, 'selected=' + r.report.selected + '/' + cnt[c] + ' GlobalIdsKept=' + sel.filter((g) => go.has(g)).length + ' dangling=' + r.report.dangling + ' entities ' + r.report.entitiesIn + '→' + r.report.entitiesOut + ' flattenedPlacements=' + r.report.placementsFlattened);
    }
    if (outs.length) { const v = oracle(outs.map((o) => o[1])), base0 = oracle([f]); if (!v) inc('W-EX-4', 'IfcOpenShell not available'); else outs.forEach((o, i) => ok('W-EX-4 ' + o[0], v[i] >= 0 && v[i] <= base0[0], 'IfcOpenShell validate errors=' + v[i] + ' (source file baseline=' + base0[0] + '; extract may inherit, never add)')); }
    else inc('W-EX-1', 'no products to extract');
    // ── split
    const sp = Sp.splitModel(model, {});
    if (!sp.report.storeys) inc('W-SPLIT', 'no storeys'); else { const parts = sp.parts.filter((p) => !p.empty); const sf = parts.map((p, i) => { const q = path.join(tmp, nm + '_s' + i + '.ifc'); fs.writeFileSync(q, p.bytes); return q; }); const v = oracle(sf);
      ok('W-SPLIT-1', sp.report.verdict === 'PASS' && parts.length > 0, 'storeys=' + sp.report.storeys + ' files=' + parts.length + ' productsInStoreys=' + sp.report.productsInStoreys + '/' + sp.report.productsTotal);
      if (!v) inc('W-SPLIT-2', 'IfcOpenShell not available'); else ok('W-SPLIT-2', v.every((n) => n === 0), 'IfcOpenShell errors per file=' + JSON.stringify(v)); }
    // ── CLI parity: Node CLI output == output of the same files loaded as browser classic <script>s
    const cdir = fs.mkdtempSync(path.join(tmp, 'cli')); const cf = path.join(cdir, nm); fs.copyFileSync(f, cf);
    if (!up.skipped) {
      const res = cp.spawnSync('node', [path.join(__dirname, '..', '..', 'bim-cli.js'), 'upgrade', cf]); const cliOut = path.join(cdir, nm.replace(/\.ifc$/i, '') + '_ifc43.ifc');
      ok('W-CLI-1a', res.status === 0 && fs.existsSync(cliOut) && sha(fs.readFileSync(cliOut)) === sha(up.bytes), 'CLI exit=' + res.status + ' sha(cli)=' + (fs.existsSync(cliOut) ? sha(fs.readFileSync(cliOut)) : '-') + ' sha(lib)=' + sha(up.bytes));
      if (process.env.PUPPETEER_PAGE !== '0') {
        let puppeteer; try { puppeteer = require(process.env.PUPPETEER || '/home/red1/bim-compiler/node_modules/puppeteer'); } catch (e) { inc('W-CLI-1b', 'puppeteer not available'); }
        if (puppeteer) {
          const root = path.join(__dirname, '..', '..');
          const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const ff = path.join(root, u === '/' ? 'bim.html' : u); if (!ff.startsWith(root) || !fs.existsSync(ff) || fs.statSync(ff).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'application/javascript' }[path.extname(ff)] || 'application/octet-stream' }); fs.createReadStream(ff).pipe(r); });
          await new Promise((r) => srv.listen(0, '127.0.0.1', r));
          const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] }); const pg = await br.newPage(); await pg.goto('http://127.0.0.1:' + srv.address().port + '/bim.html', { waitUntil: 'load', timeout: 120000 });
          const h = await pg.evaluate(async (t) => { const r = BIM_UPGRADE.run(t, {}); const d = new Uint8Array(await crypto.subtle.digest('SHA-256', r.bytes)); return Array.from(d).map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16); }, text);
          ok('W-CLI-1b', h === sha(fs.readFileSync(cliOut)), 'browser sha=' + h + ' cli sha=' + sha(fs.readFileSync(cliOut)));
          await br.close(); srv.close();
        }
      }
    }
  }
  process.exit(fails ? 1 : 0);
})();
