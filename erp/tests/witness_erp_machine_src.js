#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-ERP-MACHINE-SRC (bim-compiler prompts/TRL_TRILOGY_STANDARD.md §3 S-1/S-3/S-4, step T5a). READ THE LOG after every run: erp/tests/logs/w_erp_machine_src.log
// ISSUE IT PROVES OR DISPROVES: "the ERP's own (machine) translations are loose JSON — erp/i18n/chrome.json keys[*].machine and erp/i18n/machine/<lang>.json {English: text} — so nobody can
// see who wrote a row, and a published row could be overridden unseen". They are now legacy Translation XML rows in erp/i18n/machine/ (AD_Message app-own ids >= 1000000 for the chrome
// keys; <T>_Trl_<lang>.xml BY ID for the screen names), and the built erp/i18n/*.json are build outputs of build_i18n.py.
//   S1  the built screen packs are LABEL-equal to BEFORE_REF's (11 languages: every key and map equal; only the header `machineSource` text differs, it names the new source) and
//       chrome.json is label-equal (the order of the languages inside one key's machine{} is normalised).
//   S2  the XML rows are the same rows: per table the XML row count == the BEFORE_REF _Trl_m map size (X of N), AD_Message rows == the chrome machine entries; no stale row; ids unique.
//   S3  the shipped JSON are what build_i18n.py makes from the sources (fixture copy rebuilt, bytes equal).
//   S4  PACK WINS in the real erp_i18n.js (headless chromium --disable-gpu): where a chrome key has a pack text AND a machine text that differ, t() shows the pack text (X of N per language);
//       a key with only a machine text shows it. RED: erp_i18n.js with machine tried before the pack FAILs S4.
//   S5  a machine row for an id the pack already translates is SHADOWED (counted, not used, the row stays in the file); shipped shadowed = 0. RED: build_i18n.py without the shadow rule USES it.
// INCONCLUSIVE, never PASS, when nothing was judged (no BEFORE_REF / no pack cache). Run: node erp/tests/witness_erp_machine_src.js   Env: BEFORE_REF (default 8a293120), PW, ERP_TRL_CACHE.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..'), ERP = path.join(ROOT, 'erp'), I18N = path.join(ERP, 'i18n'), MACH = path.join(I18N, 'machine');
const BEFORE_REF = process.env.BEFORE_REF || '8a293120', PW = process.env.PW || path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright');
const CACHE = process.env.ERP_TRL_CACHE || path.join(os.homedir(), '.cache', 'erp_trl');
const LANGS = ['fr_FR', 'es_ES', 'de_DE', 'ar', 'zh_CN', 'ja_JP', 'ms_MY', 'th_TH', 'pt_BR', 'id_ID'], PACKS = ['en_US'].concat(LANGS), TABS = ['AD_Menu', 'AD_Window', 'AD_Tab', 'AD_Field'];
fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
const LOGF = path.join(__dirname, 'logs', 'w_erp_machine_src.log'); fs.writeFileSync(LOGF, '');
const out = (m) => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
let pass = 0, fail = 0, inc = 0;
const chk = (name, ok, info) => { ok ? pass++ : fail++; out('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); return ok; };
const incon = (id, why) => { inc++; out('§ERP_MACHINE_SRC INCONCLUSIVE ' + id + ' — ' + why); };
const L = (m) => out('§ERP_MACHINE_SRC ' + m);
const git = (a) => cp.spawnSync('git', a, { cwd: ROOT, encoding: 'buffer', maxBuffer: 1 << 28 });
const gitJson = (f) => { const r = git(['show', BEFORE_REF + ':' + f]); return r.status === 0 ? JSON.parse(r.stdout.toString('utf8')) : null; };
const sq = (sql) => { const r = cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ERP, 'ad_seed.db'), sql], { encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status !== 0) throw new Error(r.stderr); return JSON.parse(r.stdout || '[]'); };
const unx = (s) => s.replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d))).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function readXml(f) { if (!fs.existsSync(f)) return null; const t = fs.readFileSync(f, 'utf8'), rows = []; const re = /<row id="(\d+)" trl="([YN])">\s*<value column="(?:Name|MsgText)" original="([^"]*)">([\s\S]*?)<\/value>/g; let m;
  while ((m = re.exec(t))) rows.push({ id: Number(m[1]), trl: m[2], original: unx(m[3]), text: unx(m[4]) }); const n = (t.match(/<row /g) || []).length; if (n !== rows.length) throw new Error(f + ': ' + n + ' <row> tags, ' + rows.length + ' parsed'); return rows; }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

(async () => {
  L('begin before_ref=' + BEFORE_REF);
  if (git(['cat-file', '-t', BEFORE_REF]).status !== 0) { incon('setup', BEFORE_REF + ' not in this clone'); return end(); }
  // ── S1 ──
  const bad1 = [];
  PACKS.filter(l => l !== 'en_US').forEach(l => { const o = gitJson('erp/i18n/' + l + '.json'), n = JSON.parse(fs.readFileSync(path.join(I18N, l + '.json'), 'utf8')); if (!o) { bad1.push(l + ':no-before'); return; }
    const ks = new Set(Object.keys(o).concat(Object.keys(n))); ks.delete('machineSource'); const diff = Array.from(ks).filter(k => JSON.stringify(o[k]) !== JSON.stringify(n[k])); if (diff.length) bad1.push(l + ':' + diff.slice(0, 3)); });
  const oc = gitJson('erp/i18n/chrome.json'), nc = JSON.parse(fs.readFileSync(path.join(I18N, 'chrome.json'), 'utf8')), sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys) : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((a, k) => (a[k] = sortKeys(v[k]), a), {}) : v, norm = (c) => JSON.stringify(sortKeys(c));   // object member order is not a label
  const ncOld = JSON.parse(JSON.stringify(nc)); Object.keys(ncOld.keys).forEach(k => { const m = ncOld.keys[k].machine; if (m) { delete m.pt_BR; delete m.id_ID; delete m.ko_KR; if (!Object.keys(m).length) delete ncOld.keys[k].machine; } });   // T5b added pt_BR / id_ID chrome text (W-ERP-CHROME-FILL); S1 judges the 8 languages that existed
  const added = oc ? Object.keys(ncOld.keys).filter(k => !(k in oc.keys)) : []; added.forEach(k => delete ncOld.keys[k]);   // a key ADDED after BEFORE_REF is outside S1's claim (the move changed no existing label): counted, not compared
  if (added.length) L('S1 chrome keys added after ' + BEFORE_REF + ' (not judged by S1): ' + added.length + ' ' + added.join(','));
  const chromeEq = !!oc && norm(oc.keys) === norm(ncOld.keys) && oc._doc === nc._doc;
  chk('S1 the ' + (PACKS.length - 1) + ' built screen packs are label-equal to ' + BEFORE_REF + ' (every key and map; only `machineSource` text differs) and chrome.json is label-equal (member order normalised): ' + (PACKS.length - 1 - bad1.length) + ' of ' + (PACKS.length - 1) + ' packs, chrome ' + chromeEq, bad1.length === 0 && chromeEq, bad1.join(' | '));
  // ── S2 ──
  const left = fs.readdirSync(MACH).filter(f => /\.json$/.test(f)), eng = {};
  TABS.forEach(t => { const col = t === 'AD_Menu' ? 'AD_Menu' : t; eng[t] = new Map(sq('SELECT ' + col + '_ID AS id, Name AS n FROM ' + col).map(r => [r.id, r.n])); });
  let nRows = 0, nExp = 0, stale = 0, dup = 0; const perT = {};
  TABS.forEach(t => { perT[t] = [0, 0]; LANGS.forEach(l => { const rows = readXml(path.join(MACH, t + '_Trl_' + l + '.xml')), o = gitJson('erp/i18n/' + l + '.json'); if (!o && !rows) return;
    const exp = o ? Object.keys(o[t + '_Trl_m'] || {}).length : 0, got = rows ? rows.length : 0; perT[t][0] += got; perT[t][1] += exp; nRows += got; nExp += exp;
    const seen = new Set(); (rows || []).forEach(r => { if (seen.has(r.id)) dup++; seen.add(r.id); if ((eng[t].get(r.id) || '').trim().replace(/\s+/g, ' ') !== r.original.trim().replace(/\s+/g, ' ')) stale++; }); }); });
  let msgRows = 0, msgExp = 0; LANGS.slice(0, 8).forEach(l => {   // the 8 languages that had machine text at BEFORE_REF (T5b adds pt_BR / id_ID rows: judged by W-ERP-CHROME-FILL)
    const rows = readXml(path.join(MACH, 'AD_Message_Trl_' + l + '.xml')) || []; msgRows += rows.length; msgExp += Object.keys(oc.keys).filter(k => oc.keys[k].machine && oc.keys[k].machine[l]).length; });
  L('S2 machine rows by table (XML / BEFORE _Trl_m): ' + TABS.map(t => t + ' ' + perT[t][0] + '/' + perT[t][1]).join(', ') + '; AD_Message (chrome) ' + msgRows + '/' + msgExp + '; stale=' + stale + ', duplicate ids=' + dup + '; machine/*.json left=' + left.length);
  chk('S2 the XML rows are the same rows: ' + nRows + ' of ' + nExp + ' screen-name rows and ' + msgRows + ' of ' + msgExp + ' chrome rows; stale 0, no duplicate id, no loose machine/*.json', nRows === nExp && nExp > 0 && msgRows === msgExp && msgExp > 0 && stale === 0 && dup === 0 && left.length === 0);
  // ── S3 + S5 fixtures need the pack cache ──
  if (!fs.existsSync(path.join(CACHE, 'ad_message_base.csv'))) incon('S3/S5', 'no published-pack cache at ' + CACHE + ' (erp/tools/fetch_i18n_packs.sh)');
  else {
    const fx = (mut) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'erp_ms_')); cp.execSync('cp -r ' + JSON.stringify(I18N) + '/. ' + JSON.stringify(d)); if (mut) mut(d); return d; };
    const run = (d, py) => { const r = cp.spawnSync('python3', [py || path.join(ERP, 'tools', 'build_i18n.py')], { encoding: 'utf8', env: Object.assign({}, process.env, { ERP_I18N_OUT: d }), maxBuffer: 1 << 26 }); return { st: r.status, out: r.stdout, err: r.stderr }; };
    const d3 = fx(), r3 = run(d3), eqs = PACKS.filter(l => l !== 'en_US').concat(['chrome', 'index']).filter(f => fs.readFileSync(path.join(d3, f + '.json'), 'utf8') !== fs.readFileSync(path.join(I18N, f + '.json'), 'utf8'));
    chk('S3 the shipped JSON are what build_i18n.py makes from the sources: ' + (LANGS.length + 2 - eqs.length) + ' of ' + (LANGS.length + 2) + ' (10 screen packs, chrome.json, index.json) byte-equal after a rebuild' + (r3.st ? ' [build exit ' + r3.st + ' ' + r3.err.slice(0, 80) + ']' : ''), r3.st === 0 && eqs.length === 0, eqs.join(','));
    const shipped = (r3.out.match(/machine-src lang=\S+ .*/g) || []), sh = shipped.reduce((s, l) => s + (l.match(/shadowed:(\d+)/g) || []).reduce((a, x) => a + Number(x.split(':')[1]), 0), 0);
    L('S5 shipped §I18N-BUILD machine-src lines=' + shipped.length + ', shadowed total=' + sh);
    // S5 fixture: a machine AD_Window row for an id de_DE's pack translates
    const de = JSON.parse(fs.readFileSync(path.join(I18N, 'de_DE.json'), 'utf8')), wid = Object.keys(de.AD_Window_Trl)[0], packText = de.AD_Window_Trl[wid], enName = (sq('SELECT Name AS n FROM AD_Window WHERE AD_Window_ID=' + wid)[0] || {}).n;
    const addRow = (d) => { const f = path.join(d, 'machine', 'AD_Window_Trl_de_DE.xml'), t = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, t.replace('</idempiereTrl>', ' <row id="' + wid + '" trl="Y">\n  <value column="Name" original="' + enName.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '">MACHINE-WOULD-OVERRIDE</value>\n </row>\n</idempiereTrl>')); };
    const dg = fx(addRow), rg = run(dg), pg = JSON.parse(fs.readFileSync(path.join(dg, 'de_DE.json'), 'utf8')), lineG = (rg.out.match(/machine-src lang=de_DE .*/) || [''])[0];
    const okG = rg.st === 0 && /AD_Window=kept:\d+\/shadowed:1\//.test(lineG) && pg.AD_Window_Trl[wid] === packText && !(pg.AD_Window_Trl_m || {})[wid] && fs.readFileSync(path.join(dg, 'machine', 'AD_Window_Trl_de_DE.xml'), 'utf8').indexOf('MACHINE-WOULD-OVERRIDE') > 0;
    chk('S5 a machine row for an id the pack translates is shadowed (shadowed=1, pack text ' + JSON.stringify(packText) + ' stays, not in AD_Window_Trl_m, row still in the file); shipped shadowed=' + sh, okG && sh === 0, lineG.slice(0, 160));
    const dr = fx(d => { addRow(d); }); const bpy = path.join(dr, 'build_i18n_red.py'); fs.writeFileSync(bpy, fs.readFileSync(path.join(ERP, 'tools', 'build_i18n.py'), 'utf8').replace('        if packed: st[t][1] += 1; return                                  # shadowed by a published row\n', '').replace("sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))", "sys.path.insert(0, " + JSON.stringify(path.join(ERP, 'tools')) + ")").replace("HERE = os.path.dirname(os.path.abspath(__file__))", "HERE = " + JSON.stringify(path.join(ERP, 'tools'))));
    const rr = run(dr, bpy), pr = rr.st === 0 ? JSON.parse(fs.readFileSync(path.join(dr, 'de_DE.json'), 'utf8')) : null, usedRed = pr && (pr.AD_Window_Trl_m || {})[wid] === 'MACHINE-WOULD-OVERRIDE';
    L('RED S5 build without the shadow rule: build exit=' + rr.st + ', machine text used in AD_Window_Trl_m=' + usedRed + (rr.st ? ' ' + rr.err.slice(-160) : ''));
    chk('RED S5 without the shadow rule the machine row is USED, so the S5 check FAILs (witness can fail)', !!usedRed);
    [d3, dg, dr].forEach(d => fs.rmSync(d, { recursive: true, force: true }));
  }
  // ── S4 + RED: pack wins, in the real erp_i18n.js ──
  let browser, srv;
  try {
    srv = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); if (p === '/__shim.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><meta charset="utf-8"><script src="/erp/erp_i18n.js"></script>'); }
      fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); }); });
    await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port, { chromium } = require(PW); browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
    const src = fs.readFileSync(path.join(ERP, 'erp_i18n.js'), 'utf8'), redSrc = src.replace('var v = _ref(e.ref);', 'var v = (e.machine && e.machine[_lang]) ? null : _ref(e.ref);');
    if (redSrc === src) { incon('S4', 'the t() line to reorder was not found'); return end(); }
    const keys = nc.keys, expect = {};   // per language: [key, expected pack text (fmt-wrapped), machine text]
    PACKS.filter(l => l !== 'en_US').forEach(l => { const p = JSON.parse(fs.readFileSync(path.join(I18N, l + '.json'), 'utf8')); expect[l] = [];
      Object.keys(keys).forEach(k => { const e = keys[k], m = e.machine && e.machine[l]; if (!e.ref || !m) return; const [t, i] = e.ref.split(':'), v = t === 'msg' ? p.AD_Message_Trl[i] : (p.AD_Element_Trl[i] || [])[0]; if (!v) return;
        expect[l].push([k, e.fmt ? e.fmt.replace('{}', v) : v, e.fmt ? e.fmt.replace('{}', m) : m]); }); });
    async function page(red) { const ctx = await browser.newContext(), pg = await ctx.newPage(); if (red) await pg.route('**/erp/erp_i18n.js*', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: redSrc })); await pg.goto(base + '/__shim.html'); await pg.waitForFunction(() => window.ErpI18n); return { pg, ctx }; }
    async function judge(red) { const { pg, ctx } = await page(red); let ok = 0, n = 0, ovl = 0, mo = 0, moOk = 0; const bad = [];
      for (const l of Object.keys(expect)) { await pg.evaluate((c) => ErpI18n.set(c), l); const got = await pg.evaluate((ks) => ks.map(k => ErpI18n.t(k)), expect[l].map(x => x[0])); expect[l].forEach((x, i) => { n++; if (got[i] === x[1]) ok++; else if (bad.length < 3) bad.push(l + ':' + x[0]); if (x[1] !== x[2]) ovl++; });
        const only = Object.keys(keys).filter(k => keys[k].machine && keys[k].machine[l] && !expect[l].some(x => x[0] === k) && !keys[k].ref); const g2 = await pg.evaluate((ks) => ks.map(k => ErpI18n.t(k)), only); only.forEach((k, i) => { mo++; if (g2[i] === keys[k].machine[l]) moOk++; }); }
      await ctx.close(); return { ok, n, ovl, mo, moOk, bad }; }
    const g = await judge(false), r = await judge(true);
    L('S4 real erp_i18n.js: pack-and-machine keys=' + g.n + ' (of which text differs ' + g.ovl + '); t() = pack text for ' + g.ok + '; machine-only keys=' + g.mo + ', shown ' + g.moOk + ' | RED (machine tried first): pack text for ' + r.ok + ' of ' + r.n);
    chk('S4 PACK WINS: where a chrome key has a pack text and a machine text, t() shows the pack text: ' + g.ok + ' of ' + g.n + ' (' + g.ovl + ' of them differ from the machine text); machine-only keys show the machine text ' + g.moOk + ' of ' + g.mo, g.n > 0 && g.ovl > 0 && g.ok === g.n && g.mo > 0 && g.moOk === g.mo, g.bad.join(' | '));
    chk('RED machine tried before the pack FAILs S4: pack text for only ' + r.ok + ' of ' + r.n + ' (witness can fail)', r.ok < r.n);
  } catch (e) { fail++; out('FAIL S4 harness exception ' + (e && e.stack || e)); }
  if (browser) await browser.close(); if (srv) srv.close();
  end();
})();
function end() { const v = fail ? 'FAIL' : (inc || !pass ? 'INCONCLUSIVE' : 'PASS'); out('§WITNESS_ERP_MACHINE_SRC pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + v); process.exitCode = v === 'PASS' ? 0 : 1; }
