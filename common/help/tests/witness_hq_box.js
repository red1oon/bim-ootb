// ⚠ DO NOT REMOVE — W-HQ-BOX (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.3 Step 3; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D1 D3, §6 step 3). READ THE LOG; an exit code is not evidence.
// ISSUE it proves or disproves: after the wiring, ONE ranker answers. The ERP help box (in the real page) and the shell's erp.ask (Node) must show the list HelpQuery itself gives for the same words, the role gate
// applied after ranking. N comes from the dictionary-built packs: the RANK-TWIN query list (every window, process, action and status name, each how-to title, each multi-word name's first word) in every built language.
//   B0 the run-time record builder == the build tool's: HelpSearch.indexFrom(...).records equals the committed index.json records, per language (N = records; both are made by HelpRecords.build).
//   B1 Node: for every query, indexFrom(...).ask(q).hits (the card's top 5) == HelpQuery.create(index.json).query(q, role gate) top 5, as id|tier|score text (X of N).
//   B2 PAGE: the same through the real widget, window.__idmpHowto.ask(q).hits, against HelpQuery over the page's own records and the page's role menu (X of N). The records the page made beyond index.json are listed (run-time dictionary rows), none may be missing.
//   B3 DOOR: the real door line `erp.ask question=...` for the fixture questions (erp/tests/fixtures/help_questions.json) answers the same window / action / how-to as the in-process card (X of N).
//   B0-B3 print INCONCLUSIVE when nothing was judged. Red control (must FAIL): HS_BREAK=revhits, set in the PAGE only (the card's list reversed there) -> B2.   Run: node common/help/tests/witness_hq_box.js
'use strict';
const fs = require('fs'), path = require('path');
const BR = process.env.HS_BREAK || '';
delete process.env.HS_BREAK;   // the page carries the break; Node stays honest (help_search.js reads HS_BREAK when it is loaded, so this comes first)
if (BR) process.env.HQ_BREAK = 'box_' + BR;   // only so the log file and the verdict line carry the red control's name; the core reads HQ_BREAK = box_revhits as no break
const H = require('./_hq'), k = H.kit('W-HQ-BOX'), HQ = require(H.CORE), HS = require(path.join(H.ERP, 'help_search.js'));
const ROLE = 102;
const LANGFX = { fr_FR: 'fr', de_DE: 'de', ja_JP: 'ja', zh_CN: 'zh', en_US: 'en' };
const top5 = (list) => list.slice(0, 5).map((x) => x.id + '|' + x.tier + '|' + x.score).join(',');
(async function main() {
  if (!H.seedOk()) { k.incon('ALL', 'no usable ad_seed.db (an LFS stub?)'); return k.end(); }
  const log = console.log; console.log = () => {}; const fsm = require(path.join(H.ERP, 'ad_docfsm.js')); console.log = log;
  const ids = H.q('SELECT DISTINCT a.ad_window_id AS w FROM ad_window_access a JOIN ad_window w ON w.ad_window_id=a.ad_window_id WHERE a.ad_role_id=' + ROLE + " AND a.isactive='Y' AND w.isactive='Y' ORDER BY 1").map((r) => Number(r.w));
  const en = JSON.parse(fs.readFileSync(path.join(H.ERP, 'i18n', 'help', 'en_US', 'help.json'), 'utf8'));
  const packOf = (lang) => (lang === 'en_US' ? null : JSON.parse(fs.readFileSync(path.join(H.ERP, 'i18n', 'help', lang, 'help.json'), 'utf8')));
  const gateOf = (set) => (g) => g[0] === 'window' && set.has(g[1]);
  const perLang = {};
  // ---- B0 + B1 (Node) ----
  let b0n = 0, b0ok = 0, b1n = 0, b1ok = 0, b1nonempty = 0; const bad1 = [], bad0 = [];
  H.LANGS.forEach((lang) => {
    const p = H.pack(lang), pk = packOf(lang), idx = HS.indexFrom({ q: H.q, en, pack: pk, fsm, windowIds: ids });
    const mine = idx.records.map((r) => JSON.stringify(r)), theirs = p.index.records.map((r) => JSON.stringify(r));
    let eq = mine.length === theirs.length ? 0 : -1; if (eq === 0) mine.forEach((s, i) => { if (s === theirs[i]) eq++; });
    b0n += theirs.length; b0ok += Math.max(eq, 0); if (eq !== theirs.length && bad0.length < 2) bad0.push(lang + ' runtime=' + mine.length + ' index.json=' + theirs.length + ' equal=' + eq);
    const set = new Set(ids), h = HQ.create(p.index, { text: p.text }), qs = H.queries(p);
    let ok = 0, ne = 0; qs.forEach((s) => { const a = top5(idx.ask(s).hits), b = top5(h.query(s, gateOf(set))); if (b) ne++; if (a === b) ok++; else if (bad1.length < 2) bad1.push(lang + ' "' + s + '" box=' + a.slice(0, 80) + ' core=' + b.slice(0, 80)); });
    b1n += qs.length; b1ok += ok; b1nonempty += ne; perLang[lang] = { p, qs, idx };
    k.L('lang=' + lang + ' records=' + theirs.length + ' runtime==index.json: ' + (eq === theirs.length) + ' · queries=' + qs.length + ' box==core top-5: ' + ok + ' (non-empty lists ' + ne + ')');
  });
  if (!b0n) k.incon('B0', 'no records judged'); else k.chk('B0 the run-time records equal the committed index.json records: ' + b0ok + ' of ' + b0n + ' records', b0ok === b0n, bad0.join(' ; '));
  if (!b1n || !b1nonempty) k.incon('B1', 'VACUOUS: queries=' + b1n + ' non-empty=' + b1nonempty); else k.chk('B1 Node: the box\'s top 5 == HelpQuery\'s top 5 (role gate after ranking): ' + b1ok + ' of ' + b1n + ' queries', b1ok === b1n, bad1.join(' ; '));
  // ---- B2 (page) ----
  let page; try { page = await H.erpPage({ HS: BR }); } catch (e) { k.incon('B2', 'no headless chromium / page: ' + String(e.message).split('\n')[0]); page = null; }
  if (page) try {
    k.L('chromium ' + page.version + ' (--disable-gpu) page errors at load=' + page.errs.length + ' ' + (page.firstIndexLine || 'NO index line').slice(0, 120));
    let b2n = 0, b2ok = 0, b2ne = 0; const bad2 = [];
    for (const lang of H.LANGS) {
      const line = lang === 'en_US' ? page.firstIndexLine : await page.setLang(lang);
      if (!line) { k.incon('B2-' + lang, 'the page did not build its index in ' + lang); continue; }
      const L = perLang[lang], menu = await page.pg.evaluate(() => window.__idmpFieldHelp.menu().windows), set = new Set(menu);
      const got = await page.pg.evaluate((qs) => { const ix = window.__idmpHowto.index(); return { rec: ix.records, hits: qs.map((s) => window.__idmpHowto.ask(s).hits.map((x) => x.id + '|' + x.tier + '|' + x.score).join(',')) }; }, L.qs);
      const have = new Set(got.rec.map((r) => r.id)), missing = L.p.index.records.filter((r) => !have.has(r.id)).length, extra = got.rec.filter((r) => !L.p.index.records.some((x) => x.id === r.id)).map((r) => r.id);
      const h = HQ.create(Object.assign({}, L.p.index, { records: got.rec }), { text: L.p.text }); let ok = 0, ne = 0;
      L.qs.forEach((s, i) => { const b = top5(h.query(s, gateOf(set))); if (b) ne++; if (got.hits[i] === b) ok++; else if (bad2.length < 2) bad2.push(lang + ' "' + s + '" page=' + got.hits[i].slice(0, 80) + ' core=' + b.slice(0, 80)); });
      b2n += L.qs.length; b2ok += ok; b2ne += ne;
      k.L('lang=' + lang + ' page records=' + got.rec.length + ' index.json records missing from the page=' + missing + ' run-time extras=' + extra.length + (extra.length ? ' (' + extra.slice(0, 8).join(',') + ')' : '') + ' · queries=' + L.qs.length + ' page==core top-5: ' + ok);
      if (missing) k.chk('B2 ' + lang + ' no index.json record is missing from the page\'s run-time records', false, missing + ' missing');
    }
    if (!b2n || !b2ne) k.incon('B2', 'VACUOUS: queries=' + b2n); else k.chk('B2 PAGE: the box\'s top 5 (window.__idmpHowto.ask) == HelpQuery\'s top 5 over the page\'s records and role menu: ' + b2ok + ' of ' + b2n + ' queries', b2ok === b2n, bad2.join(' ; '));
  } finally { await page.close(); }
  // ---- B3 (door) ----
  const { run, DOOR } = require(path.join(H.ROOT, 'common', 'door', 'tests', '_kit'));
  const FX = JSON.parse(fs.readFileSync(path.join(H.ERP, 'tests', 'fixtures', 'help_questions.json'), 'utf8')), allIds = H.q("SELECT ad_window_id AS w FROM ad_window WHERE isactive='Y'").map((r) => Number(r.w));
  let b3n = 0, b3ok = 0; const bad3 = [];
  for (const lang of ['en_US', 'zh_CN', 'de_DE']) {
    const idx = HS.indexFrom({ q: H.q, en, pack: packOf(lang), fsm, windowIds: allIds });
    for (const x of (FX[LANGFX[lang]] || [])) {
      const r = await run(DOOR, ['--actor', 'human', 'erp.ask question="' + x.q.replace(/"/g, '') + '" lang=' + lang], { LANG: 'en_US.UTF-8', BIM_DOOR_USER: '' });
      let j = null; try { j = JSON.parse(r.out.split('\n').filter((l) => l.trim().startsWith('{')).pop()); } catch (e) { j = null; }
      const res = j && (j.result || j.answer || j.data || j), c = idx.ask(x.q), strip = (t) => String(t || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
      const a = JSON.stringify([res && res.window && res.window.id, res && res.action && res.action.code, res && res.howto && res.howto.name, res && res.howto && res.howto.text]);
      const b = JSON.stringify([c.window && c.window.id, c.action && c.action.code, c.howto && c.howto.name, c.howto && strip(c.howto.html)]);
      b3n++; if (a === b) b3ok++; else if (bad3.length < 2) bad3.push(lang + ' "' + x.q + '" door=' + a.slice(0, 80) + ' card=' + b.slice(0, 80));
    }
  }
  if (!b3n) k.incon('B3', 'no fixture question judged'); else k.chk('B3 DOOR: erp.ask answers what the in-process card answers (window, action, how-to): ' + b3ok + ' of ' + b3n + ' fixture questions', b3ok === b3n, bad3.join(' ; '));
  k.end();
})().catch((e) => { console.log('ERROR', e && e.stack || e); process.exitCode = 2; });
