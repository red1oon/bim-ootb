// ⚠ DO NOT REMOVE — W-FIELD-HELP (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §7, P1b: field tooltips + the Tool Tip panel = legacy). READ THE LOG; an exit code is not evidence.
//   F1 ISSUE (a field's tooltip is a developer string, not legacy's Description) · F2 ISSUE (a `<ColumnName> · …` tooltip is left anywhere)
//   F3 ISSUE (no Help panel, or one that does not answer like HelpController) · F4 ISSUE (the twin window's text is inherited, not the field's own as AD_Field_v)
//   F5 ISSUE (a process parameter's tooltip is not AD_Process_Para.Description)
//   Falsifiers: FH_BREAK=anywindow (§7.1: the old oracle, the first header tab of ANY window) FAILs F1-scope · devtitle FAILs F1+F2 · nohelp FAILs F3 · fallback FAILs F4 (a throwaway copy where an empty field text takes its column's, the inheritance legacy never does).
//   Each claim can say VACUOUS / INCONCLUSIVE (F4 is INCONCLUSIVE when the legacy postgres is not running, never PASS).
//   Population: X of N, N counted from the dictionary. Browser part: the REAL page (idempiere.html, GardenAdmin), its real render functions through window.__idmpFieldHelp.
// Run: node erp/tests/witness_field_help.js   (ERP_SEED_DB overrides the seed; PW overrides the playwright path; LEGACY_PG=docker container name, default postgres)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), cp = require('child_process');
const { kit, ROOT } = require('../../common/door/tests/_kit');
const k = kit('W-FIELD-HELP');
const ERP = path.join(ROOT, 'erp');
const SEED = process.env.ERP_SEED_DB || path.join(ERP, 'ad_seed.db');
const BREAK = process.env.FH_BREAK || '';
const str = (s) => (s == null ? '' : String(s));
const PW = process.env.PW || path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright');
const SQLJS = [path.join(ROOT, 'node_modules', 'sql.js'), path.join(os.homedir(), 'bim-ootb', 'node_modules', 'sql.js')].find((p) => fs.existsSync(p));

// ---------- F4: the twin window's field text = legacy AD_Field_v, field by field ----------
async function f4() {
  const pg = process.env.LEGACY_PG || 'postgres';
  const r = cp.spawnSync('docker', ['exec', pg, 'psql', '-U', 'adempiere', '-d', 'idempiere', '-At', '-c',
    "SELECT json_agg(json_build_array(ad_field_id, description, help)) FROM adempiere.ad_field_v"], { encoding: 'utf8', maxBuffer: 1 << 29 });
  if (r.status !== 0 || !r.stdout.trim()) { k.incon('F4', 'legacy postgres not reachable (' + str(r.stderr).trim().slice(0, 80) + ')'); return; }
  const legacy = new Map(); JSON.parse(r.stdout.trim()).forEach(([id, d, h]) => legacy.set(Number(id), { d: str(d), h: str(h) }));
  if (!SQLJS) { k.incon('F4', 'sql.js not found'); return; }
  const SQL = await require(path.join(SQLJS, 'dist', 'sql-wasm.js'))();
  const db = new SQL.Database(fs.readFileSync(SEED));
  if (BREAK === 'fallback') {   // the throwaway in-memory copy inherits field -> column where the field's own text is empty
    db.run("UPDATE ad_field SET help=(SELECT c.help FROM ad_column c WHERE c.ad_column_id=ad_field.ad_column_id) WHERE coalesce(help,'')=''");
    db.run("UPDATE ad_field SET description=(SELECT c.description FROM ad_column c WHERE c.ad_column_id=ad_field.ad_column_id) WHERE coalesce(description,'')=''");
  }
  const log = console.log; console.log = () => {}; const ADP = require(path.join(ERP, 'ad_parser.js')); console.log = log;
  const tabs = db.exec("SELECT DISTINCT f.ad_tab_id FROM ad_field f JOIN ad_tab t ON t.ad_tab_id=f.ad_tab_id WHERE f.isactive='Y' AND f.isdisplayed='Y' AND t.isactive='Y' ORDER BY 1")[0].values.map((v) => v[0]);
  let n = 0, okD = 0, okH = 0, twinOnly = 0; const badD = [], badH = [];
  console.log = () => {};
  tabs.forEach((tid) => {
    (ADP.getFields(db, tid) || []).filter((f) => f && f.isDisplayed && !f.isKey).forEach((f) => {
      const L = legacy.get(Number(f.id)); if (!L) { twinOnly++; return; }
      n++;
      if (str(f.description) === L.d) okD++; else if (badD.length < 3) badD.push(f.id + ':' + f.columnName);
      if (str(f.help) === L.h) okH++; else if (badH.length < 3) badH.push(f.id + ':' + f.columnName);
    });
  });
  console.log = log;
  k.L('F4 tabs=' + tabs.length + ' displayed fields judged=' + n + ' twin-only (plugin ids, not in legacy, not judged)=' + twinOnly + ' legacy rows=' + legacy.size);
  if (!n) { k.incon('F4', 'VACUOUS: no displayed field matched a legacy row'); return; }
  k.chk('F4 description = AD_Field_v.description', okD === n, okD + '/' + n + (badD.length ? ' first wrong: ' + badD.join(', ') + ' (' + (n - okD) + ' wrong)' : ''));
  k.chk('F4 help = AD_Field_v.help', okH === n, okH + '/' + n + (badH.length ? ' first wrong: ' + badH.join(', ') + ' (' + (n - okH) + ' wrong)' : ''));
}

// ---------- the browser part: F1, F2, F3, F5 through the real page ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.png': 'image/png' };
function serve() {
  const s = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
    fs.readFile(path.join(ERP, p), (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
  });
  return new Promise((r) => s.listen(0, () => r(s)));
}
async function landed(page) {
  const ready = () => page.waitForFunction(() => window.__idmpFieldHelp && window.__idmpFieldHelp.menu().windows.length > 0 && document.getElementById('idmp-help-tooltip'), null, { timeout: 30000 });
  await ready().catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const b = await page.$('#idmp-login-ok'); if (b) await b.click(); }
    await ready();
  });
}
// in the page: the expected panel markup is built HERE, independently, from SQL and HelpController's rules (not by FieldHelp)
const PAGE_EXPECT = `(function(){
  window.__fhq = function (sql) { var r = window.__idmpDb.exec(sql); if (!r.length) return []; return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; }); };
  window.__fhExpect = function (hdr, d, h) { var s = function (x) { return x == null ? '' : String(x); }; hdr = s(hdr); d = s(d); h = s(h);
    var m = '<div class="help-content"><p><strong>' + hdr + '</strong></p>'; if (d.trim().length > 0) m += '<p><i>' + d + '</i></p>'; if (h.trim().length > 0) m += '<p>' + h + '</p>';
    var x = document.createElement('div'); x.innerHTML = m + '</div>'; return x.innerHTML; };
})();`;
async function browser() {
  let chromium; try { ({ chromium } = require(PW)); } catch (e) { k.incon('F1,F2,F3,F5', 'playwright not found at ' + PW); return; }
  const srv = await serve(), port = srv.address().port;
  const b = await chromium.launch({ headless: true });
  const page = await b.newPage();
  if (BREAK) await page.addInitScript((v) => { window.__FH_BREAK = v; }, BREAK);
  const fhLines = []; page.on('console', (m) => { const t = m.text(); if (/^§FIELD_HELP panel/.test(t)) fhLines.push(t); });
  try {
    await page.goto('http://localhost:' + port + '/idempiere.html?seed=ad_seed.db&login=GardenAdmin', { waitUntil: 'networkidle', timeout: 60000 });
    await landed(page);
    await page.evaluate(PAGE_EXPECT);
    k.L('panel ' + (fhLines[0] || 'NO §FIELD_HELP panel line'));
    // F3 part 1: with no field focused, the panel says PlaceCursorIntoField (read from AD_Message, not typed here)
    const idle = await page.evaluate(() => { var m = window.__fhq("SELECT msgtext FROM ad_message WHERE value='PlaceCursorIntoField'")[0]; var x = document.createElement('div'); x.innerHTML = '<div class="help-content"><p><em>(' + (m ? m.msgtext : '?') + ')</em></p></div>';
      return { got: document.getElementById('idmp-help-tooltip').innerHTML, want: x.innerHTML, shown: getComputedStyle(document.getElementById('idmp-help')).display !== 'none', title: document.getElementById('idmp-help-title').textContent }; });
    k.L('F3 idle panel title=' + JSON.stringify(idle.title) + ' visible=' + idle.shown + ' content=' + JSON.stringify(idle.got.slice(0, 100)));
    // F1 + F3 (read-only form): every displayed field of every tab of every menu window, through the real _appendReadonlyFields
    const ro = await page.evaluate(() => {
      var H = window.__idmpFieldHelp, menu = H.menu(), box = document.createElement('div'); box.style.cssText = 'position:absolute;left:-9999px;top:0'; document.body.appendChild(box);
      var out = { windows: menu.windows.length, tabs: 0, expected: 0, rendered: 0, okLabel: 0, okVal: 0, okPanel: 0, bad: [], badPanel: [], dev: 0, tips: 0 };
      var dev = /^[A-Za-z_][A-Za-z0-9_]* · /;
      menu.windows.forEach(function (wid) {
        var w; try { w = H.windowModel(wid); } catch (e) { return; } if (!w || !w.tabs) return;
        w.tabs.forEach(function (tab) {
          out.tabs++;
          var exp = window.__fhq("SELECT f.ad_field_id id, f.name nm, f.description d, f.help h, c.columnname cn FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE f.ad_tab_id=" + Number(tab.id) + " AND f.isactive='Y' AND f.isdisplayed='Y' AND coalesce(c.iskey,'N')<>'Y'");
          out.expected += exp.length;
          var byCol = {}; exp.forEach(function (r) { byCol[String(r.cn).toLowerCase()] = r; });
          box.innerHTML = ''; var form = H.readonlyForm(tab, null); box.appendChild(form);
          form.querySelectorAll('.idmp-fld[data-ad-column]').forEach(function (fld) {
            var r = byCol[String(fld.getAttribute('data-ad-column')).toLowerCase()]; if (!r) return;
            out.rendered++;
            var d = r.d == null ? '' : String(r.d), want = d.length ? d : null;
            var lb = fld.querySelector('label'), v = fld.querySelector('.val');
            var tl = lb && lb.hasAttribute('title') ? lb.title : null, tv = v && v.hasAttribute('title') ? v.title : null;
            [tl, tv].forEach(function (t) { if (t != null) { out.tips++; if (dev.test(t)) out.dev++; } });
            if (tl === want) out.okLabel++; if (tv === want) out.okVal++; else if (out.bad.length < 3) out.bad.push(wid + '/' + tab.id + '/' + r.cn + ' got=' + JSON.stringify(tv) + ' want=' + JSON.stringify(want));
            if (v) { v.focus(); var got = document.getElementById('idmp-help-tooltip').innerHTML, wantP = window.__fhExpect(fld.querySelector('label') ? fld.querySelector('label').textContent : r.nm, r.d, r.h);
              if (got === wantP) out.okPanel++; else if (out.badPanel.length < 2) out.badPanel.push(r.cn + ' got=' + JSON.stringify(got.slice(0, 80)) + ' want=' + JSON.stringify(wantP.slice(0, 80))); }
          });
        });
      });
      box.remove(); return out;
    });
    k.L('F1 read-only form: windows=' + ro.windows + ' tabs=' + ro.tabs + ' displayed non-key fields (dictionary)=' + ro.expected + ' rendered=' + ro.rendered);
    if (!ro.rendered) { k.incon('F1', 'VACUOUS: no field rendered'); }
    else {
      k.chk('F1 read-only form: label tooltip = AD_Field.Description (none when empty)', ro.okLabel === ro.rendered, ro.okLabel + '/' + ro.rendered);
      k.chk('F1 read-only form: value tooltip = AD_Field.Description (none when empty)', ro.okVal === ro.rendered, ro.okVal + '/' + ro.rendered + (ro.bad.length ? ' first wrong: ' + ro.bad.join(' | ') : ''));
      k.chk('F1 read-only form renders every displayed non-key field the dictionary lists', ro.rendered === ro.expected, ro.rendered + '/' + ro.expected + ' (a field hidden by the renderer is counted, not excused)');
      k.chk('F3 focus -> the panel shows header / description / help as HelpController', ro.okPanel === ro.rendered, ro.okPanel + '/' + ro.rendered + (ro.badPanel.length ? ' first wrong: ' + ro.badPanel.join(' | ') : ''));
    }
    // F5 (+F2): every parameter of every menu process with parameters, through the real renderProcParamForm
    const pr = await page.evaluate(() => {
      var H = window.__idmpFieldHelp, procs = H.menu().processes, out = { menu: procs.length, withParams: 0, expected: 0, rendered: 0, ok: 0, okLabel: 0, bad: [], dev: 0, tips: 0, err: 0 };
      var dev = /^[A-Za-z_][A-Za-z0-9_]* · /;
      procs.forEach(function (pid) {
        var exp = window.__fhq("SELECT columnname cn, description d FROM ad_process_para WHERE isactive='Y' AND ad_process_id=" + Number(pid)); if (!exp.length) return;
        var proc; try { proc = H.procForm(pid); } catch (e) { out.err++; return; } if (!proc) return;
        out.withParams++; out.expected += exp.length;
        var pane = document.querySelector('.idmp-procform'); if (!pane) return;
        exp.forEach(function (r) {
          var inp = pane.querySelector('[data-proc-param="' + r.cn + '"]'); if (!inp) return; out.rendered++;
          var d = r.d == null ? '' : String(r.d), want = d.length ? d : null, t = inp.hasAttribute('title') ? inp.title : null;
          var lb = inp.parentNode && inp.parentNode.querySelector('label'), tl = lb && lb.hasAttribute('title') ? lb.title : null;
          [t, tl].forEach(function (x) { if (x != null) { out.tips++; if (dev.test(x)) out.dev++; } });
          if (t === want) out.ok++; else if (out.bad.length < 3) out.bad.push(pid + '/' + r.cn + ' got=' + JSON.stringify(t) + ' want=' + JSON.stringify(want));
          if (tl === want) out.okLabel++;
        });
      });
      return out;
    });
    k.L('F5 menu processes=' + pr.menu + ' with parameters=' + pr.withParams + ' parameters (dictionary)=' + pr.expected + ' rendered=' + pr.rendered + ' open errors=' + pr.err);
    if (!pr.rendered) k.incon('F5', 'VACUOUS: no parameter rendered');
    else {
      k.chk('F5 parameter editor tooltip = AD_Process_Para.Description', pr.ok === pr.rendered, pr.ok + '/' + pr.rendered + (pr.bad.length ? ' first wrong: ' + pr.bad.join(' | ') : ''));
      k.chk('F5 parameter label tooltip = AD_Process_Para.Description', pr.okLabel === pr.rendered, pr.okLabel + '/' + pr.rendered);
    }
    // F1 inline editor (+F3 on focus): the REAL New/Edit paths on the windows W-PARITY-FIELDSET drives (crud_overlay.renderInline)
    const INLINE = [{ w: 143, mode: 'new' }, { w: 169, mode: 'new' }, { w: 167, mode: 'edit' }, { w: 195, mode: 'new' }];
    let inl = { windows: 0, rows: 0, okE: 0, okL: 0, okP: 0, focusable: 0, disabled: 0, hidden: 0, bad: [], dev: 0, tips: 0 };
    for (const c of INLINE) {
      await page.goto('http://localhost:' + port + '/idempiere.html?seed=ad_seed.db&login=GardenAdmin&window=' + c.w, { waitUntil: 'networkidle', timeout: 60000 });
      await landed(page); await page.evaluate(PAGE_EXPECT);
      if (c.mode === 'new') { await page.waitForSelector('#idmp-toolbar [data-tb="new"]', { timeout: 15000 }).catch(() => {}); await page.click('#idmp-toolbar [data-tb="new"]').catch(() => {}); }
      else { await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 15000 }).catch(() => {}); await page.evaluate(() => { var tr = document.querySelector('.idmp-grid tbody tr[data-ad-record]'); if (tr) tr.click(); }); }
      await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 10000 }).catch(() => {});
      const r = await page.evaluate((brk) => {
        var o = { rows: 0, okE: 0, okL: 0, okP: 0, focusable: 0, disabled: 0, hidden: 0, bad: [], dev: 0, tips: 0 }, dev = /^[A-Za-z_][A-Za-z0-9_]* · /;
        // §7.1: the oracle reads the field of the window that is OPEN (the page's own state), never 'the first header tab of any window on this table' — c_order/m_inout/c_invoice are shared by a sales and a purchase window whose header tabs tie on seqno
        var st = window.__idmpHowto && window.__idmpHowto.state ? window.__idmpHowto.state() : null, ow = st && st.win != null ? Number(st.win) : null; o.openWin = ow; o.otherWin = 0;
        var host = document.getElementById('idmp-inline-mount'); if (!host) return o;
        var tab = window.__fhq("SELECT 1"); // keep the handle warm
        host.querySelectorAll('.cfrow[data-row]').forEach(function (row) {
          var t = row.getAttribute('data-ad-table'), col = row.getAttribute('data-row');
          var tn = "'" + String(t).toLowerCase().replace(/'/g, "''") + "'", cn = "'" + String(col).toLowerCase().replace(/'/g, "''") + "'";
          var sel = "SELECT f.name nm, f.description d, f.help h, tb.ad_window_id w FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id JOIN ad_tab tb ON tb.ad_tab_id=f.ad_tab_id JOIN ad_table tt ON tt.ad_table_id=tb.ad_table_id WHERE lower(tt.tablename)=" + tn + " AND lower(c.columnname)=" + cn + " AND f.isactive='Y'";
          var r = brk === 'anywindow' ? window.__fhq(sel + " AND tb.tablevel=0 ORDER BY tb.seqno LIMIT 1")[0]   // falsifier: the old oracle (first header tab of ANY window)
            : (ow == null ? null : window.__fhq(sel + " AND tb.ad_window_id=" + ow + " ORDER BY tb.tablevel, tb.seqno LIMIT 1")[0]);
          if (r && ow != null && Number(r.w) !== ow) o.otherWin++;
          if (!r) return; o.rows++;
          var d = r.d == null ? '' : String(r.d), want = d.length ? d : null;
          var ed = row.querySelector('input[data-col],select[data-col],textarea[data-col]'), lb = row.querySelector('.cfl');
          var te = ed && ed.hasAttribute('title') ? ed.title : null, tl = lb && lb.hasAttribute('title') ? lb.title : null;
          [te, tl].forEach(function (x) { if (x != null) { o.tips++; if (dev.test(x)) o.dev++; } });
          if (te === want) o.okE++; else if (o.bad.length < 3) o.bad.push(t + '.' + col + ' got=' + JSON.stringify(te) + ' want=' + JSON.stringify(want));
          if (tl === want) o.okL++;
          // F3 judges only what a person can focus: a disabled editor (read-only here) and one hidden by DisplayLogic take no focus — counted, not judged
          if (ed && ed.disabled) o.disabled++; else if (ed && !ed.offsetParent) o.hidden++;
          else if (ed) { o.focusable++; ed.focus(); var got = document.getElementById('idmp-help-tooltip').innerHTML; var wl = r.nm;   // legacy's header = GridField.getHeader = AD_Field.Name (a curated crud label is not the header)
            if (lb && lb.firstChild && lb.firstChild.nodeType === 3 && lb.firstChild.nodeValue.replace(/\s+$/, '') !== String(r.nm)) o.labelDiff = (o.labelDiff || 0) + 1;
            if (got === window.__fhExpect(wl, r.d, r.h)) o.okP++; }
        });
        return o;
      }, BREAK);
      k.L('F1 inline window=' + c.w + ' (' + c.mode + ') open=' + r.openWin + ' oracle-from-another-window=' + r.otherWin + ' rows=' + r.rows + ' editor ok=' + r.okE + ' label ok=' + r.okL + ' panel ok=' + r.okP + '/' + r.focusable + ' focusable (disabled=' + r.disabled + ' hidden=' + r.hidden + ') label != AD_Field.Name: ' + (r.labelDiff || 0) + (r.bad.length ? ' first wrong: ' + r.bad.join(' | ') : ''));
      if (r.rows) inl.windows++;
      ['rows', 'okE', 'okL', 'okP', 'focusable', 'disabled', 'hidden', 'dev', 'tips', 'otherWin'].forEach((x) => { inl[x] = (inl[x] || 0) + (r[x] || 0); }); if (r.openWin !== c.w) inl.wrongOpen = (inl.wrongOpen || 0) + 1; inl.bad = inl.bad.concat(r.bad).slice(0, 3);
    }
    if (inl.rows) k.chk('F1-scope every judged inline row is checked against the OPEN window\'s field (§7.1): ' + (inl.otherWin || 0) + ' rows from another window, ' + (inl.wrongOpen || 0) + ' cases where the open window was not the one driven', !(inl.otherWin || 0) && !(inl.wrongOpen || 0));
    if (!inl.rows) k.incon('F1-inline', 'VACUOUS: no inline editor row rendered');
    else {
      k.chk('F1 inline editor: editor tooltip = AD_Field.Description (' + inl.windows + ' windows)', inl.okE === inl.rows, inl.okE + '/' + inl.rows + (inl.bad.length ? ' first wrong: ' + inl.bad.join(' | ') : ''));
      k.chk('F1 inline editor: label tooltip = AD_Field.Description', inl.okL === inl.rows, inl.okL + '/' + inl.rows);
      if (!inl.focusable) k.incon('F3-inline', 'VACUOUS: no focusable inline editor');
      else k.chk('F3 inline editor focus -> panel as HelpController', inl.okP === inl.focusable, inl.okP + '/' + inl.focusable + ' focusable (not judged: disabled=' + inl.disabled + ' hidden=' + inl.hidden + ')');
    }
    // F2: no developer tooltip left, across form, process parameters and inline editor
    const tips = ro.tips + pr.tips + inl.tips, dev = ro.dev + pr.dev + inl.dev;
    k.L('F2 tooltips seen=' + tips + ' developer-form=' + dev);
    if (!tips) k.incon('F2', 'VACUOUS: no tooltip seen at all');
    else k.chk('F2 0 tooltips of the form `<ColumnName> · …`', dev === 0, dev + ' of ' + tips);
    k.chk('F3 idle panel = (PlaceCursorIntoField) and the East panel is shown (HelpCollapsed default N)', idle.got === idle.want && idle.shown, JSON.stringify(idle.got.slice(0, 80)));
  } finally { await b.close(); srv.close(); }
}

(async function main() {
  if (!fs.existsSync(SEED) || fs.statSync(SEED).size < 1e6) { k.incon('ALL', 'no usable seed at ' + SEED + ' (an LFS stub?)'); return k.end(); }
  k.L('seed=' + SEED + ' break=' + (BREAK || 'none'));
  await f4();
  await browser();
  k.end();
})().catch((e) => { console.log('§W-FIELD-HELP CRASH ' + (e && e.stack || e)); process.exit(3); });
