#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-RATES-PACK (bim-compiler prompts/RATES_SOURCE_OF_TRUTH.md §6). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the Viewer's prices came from the DISPLAY LANGUAGE, not the rate pack. locale_loader.js wrote each
// language's own rates / labour / equipment / misc-element numbers into the same globals a pack writes, so the last writer won (a pack loaded
// at start raced it, #2411); a locale file prices 40 of the pack's 50 classes, so a non-MY page priced the other 10 in ringgit (en_US IfcRoof
// 238 = the CIDB figure, labelled $); and initRateTemplate loaded the pack and sequence_rules.json in parallel, so the pack's labour was lost
// whenever the rules answered second. Rule: numbers + currency = the pack, words = the language, whatever order they load in.
//   RP1 every locale, both load orders (language first / pack first): every number = the pack's, every word = the language's (else the pack's)
//   RP2 every locale: productivity / crew_size / max_crews on the pack path = the old locale path (4D durations unchanged)
//   RP3 every locale: the misc-element price (RATES_DEFAULT) = the locale file's, now from its pack
//   RP4 initRateTemplate with sequence_rules.json answering AFTER the pack: the pack's labour survives
//   RP5 pack choice: ?lang=ar (mapped) -> aramco2024_sa, as locale_loader detects it; a Settings pick beats the language; ?rates= beats both
//   RP6 a language switch in place with no pick loads the new language's pack; with a pick it keeps the pick
// Falsifier: RP1 / RP4 / RP5 / RP6 on the code before the fix (FALSIFIER_REF), RP2 / RP3 on today's code with the packs before the data move.
// usage: node viewer/tests/witness_rates_pack.js            (FALSIFIER_REF=<sha> to change the "before" tree; default eb1fcdb5 = main 2026-10-27)
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path'), cp = require('child_process');
const V = path.join(__dirname, '..'), ROOT = path.join(V, '..');
const REF = process.env.FALSIFIER_REF || 'eb1fcdb5';
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§PASS ' : '§FAIL ') + id + '  ' + m); if (!c) fails++; };
const _git = {};
// a tree = where code and data are read from: null = the working tree, else a git ref
const reader = (codeRef, dataRef) => f => {
  const ref = /^(rates|locales)\//.test(f) ? dataRef : codeRef;
  if (!ref) return fs.readFileSync(path.join(V, f), 'utf8');
  const k = ref + ':' + f; if (!(k in _git)) { try { _git[k] = cp.execFileSync('git', ['-C', ROOT, 'show', ref + ':viewer/' + f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { _git[k] = null; } }
  if (_git[k] == null) throw new Error('MISSING ' + ref + ':viewer/' + f); return _git[k];
};
const NOW = reader(null, null), OLD = reader(REF, REF), OLD_DATA = reader(null, REF);
const MAP = eval('(' + NOW('rates.js').match(/var LOCALE_RATE_MAP = (\{[\s\S]*?\});/)[1] + ')');
const LOCALES = Object.keys(MAP).sort();
const localeData = (read, loc) => { const c = {}; vm.createContext(c); vm.runInContext(read('locales/' + loc + '.js') + ';this.L=_TRL_LOCALE;', c); return c.L; };
const tick = ms => new Promise(r => setTimeout(r, ms));

// One page: rates.js then locale_loader.js (its own boot), the way viewer.html loads them. delay(url) sets when each fetch answers.
function page(read, o) {
  o = o || {};
  const store = Object.assign({ bim_ootb_config: JSON.stringify({ locale: o.locale || 'en_MY' }) }, o.store || {});
  const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const events = [];
  const fetchStub = u => {
    const f = String(u).replace(/^https?:\/\/h\/viewer\//, '').replace(/\?.*$/, '');
    let body = null; try { body = read(f); } catch (e) { body = null; }
    const ms = o.delay ? o.delay(f) : 0;
    return tick(ms).then(() => body == null ? { ok: false, status: 404 } : { ok: true, status: 200, json: () => Promise.resolve(JSON.parse(body)), text: () => Promise.resolve(body) });
  };
  const el = () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} } });
  const doc = { currentScript: { src: 'http://h/viewer/rates.js?v=11' }, getElementsByTagName: () => [{ src: 'http://h/viewer/locale_loader.js?v=13' }], querySelectorAll: () => [], querySelector: () => null,
    getElementById: () => null, createElement: el, readyState: 'complete', addEventListener() {}, documentElement: { setAttribute() {}, style: {} }, body: el() };
  const win = { location: { search: o.search || '', href: 'http://h/viewer/viewer.html' + (o.search || '') }, localStorage: ls, navigator: { language: 'en-MY' },
    console: { log() {}, warn() {}, error() {} }, URLSearchParams, URL, fetch: fetchStub, document: doc, history: { replaceState() {} },
    __TRL_SWITCH_NO_RETRANSLATE: true,   // the switch's DOM re-translation pass needs a real DOM; it touches no rate
    addEventListener() {}, dispatchEvent: e => { events.push(e); return true; }, CustomEvent: function (t, d) { this.type = t; this.detail = d && d.detail; }, setTimeout, clearTimeout };
  win.window = win; win.self = win; const ctx = vm.createContext(win);
  vm.runInContext(read('rates.js'), ctx, { filename: 'rates.js' });
  doc.currentScript = { src: 'http://h/viewer/locale_loader.js?v=13' };
  vm.runInContext(read('locale_loader.js'), ctx, { filename: 'locale_loader.js' });
  ctx.__events = events; ctx.__store = store; return ctx;
}
const ready = async (ctx, n) => { for (let i = 0; i < 200 && ctx.__events.filter(e => e.type === 'trl-ready').length < (n || 1); i++) await tick(5); };
const tables = ctx => JSON.parse(vm.runInContext('JSON.stringify({ R: RATES, L: LABOR_RATES, E: EQUIPMENT_RATES, D: RATES_DEFAULT, cur: _TRL.cur, name: RATE_TEMPLATE_NAME })', ctx));
// the Viewer at start: locale_loader boots on its own, the page starts the pack (initRateTemplate), both settle
async function viewer(read, loc, order) {
  const late = 30, delay = f => (order === 'language-first' ? (/^rates\//.test(f) ? late : 0) : (/^(locales|i18n)\//.test(f) ? late : 0));
  const ctx = page(read, { locale: loc, delay });
  await vm.runInContext('initRateTemplate()', ctx); await ready(ctx); await tick(late + 20);
  return tables(ctx);
}

// RP1 — numbers from the pack, words from the language (else the pack), in either order
function rp1Diff(T, P, L) {
  const bad = [], lw = L.rates || {}, lt = L.labor_rates || {}, le = L.equipment_rates || {};
  for (const c of Object.keys(P.materials)) {
    const r = T.R[c] || {}; if (r.rate !== P.materials[c].rate || r.unit !== P.materials[c].unit) bad.push(c + ' ' + r.rate + '/' + r.unit + ' pack ' + P.materials[c].rate + '/' + P.materials[c].unit);
    const w = (lw[c] && lw[c].desc) || P.materials[c].desc; if (r.desc !== w) bad.push(c + ' desc "' + r.desc + '" want "' + w + '"');
  }
  for (const k of Object.keys(P.labor)) {
    const t = T.L[k] || {}, p = P.labor[k];
    for (const f of Object.keys(p)) {
      if (f === 'trade') continue;
      if (f === 'productivity') { for (const c of Object.keys(p.productivity)) if ((t.productivity || {})[c] !== p.productivity[c]) bad.push(k + '.' + c + ' ' + (t.productivity || {})[c] + ' pack ' + p.productivity[c]); }
      else if (JSON.stringify(t[f]) !== JSON.stringify(p[f])) bad.push(k + '.' + f + ' ' + t[f] + ' pack ' + p[f]);
    }
    const w = (lt[k] && lt[k].trade) || p.trade; if (t.trade !== w) bad.push(k + ' trade "' + t.trade + '" want "' + w + '"');
  }
  for (const k of Object.keys(P.equipment)) {
    const e = T.E[k] || {}, p = P.equipment[k];
    for (const f of Object.keys(p)) if (f !== 'desc' && JSON.stringify(e[f]) !== JSON.stringify(p[f])) bad.push(k + '.' + f + ' ' + e[f] + ' pack ' + p[f]);
    const w = (le[k] && le[k].desc) || p.desc; if (e.desc !== w) bad.push(k + ' desc "' + e.desc + '" want "' + w + '"');
  }
  if (!P.rates_default) bad.push('pack has no rates_default');
  else if (T.D.rate !== P.rates_default.rate || T.D.unit !== P.rates_default.unit) bad.push('RATES_DEFAULT ' + T.D.rate + '/' + T.D.unit + ' pack ' + P.rates_default.rate + '/' + P.rates_default.unit);
  const dw = (L.rates_default && L.rates_default.desc) || (P.rates_default && P.rates_default.desc) || 'Misc Element'; if (T.D.desc !== dw) bad.push('RATES_DEFAULT desc "' + T.D.desc + '" want "' + dw + '"');
  if (T.cur !== P.meta.currency) bad.push('cur ' + T.cur + ' pack ' + P.meta.currency);
  return bad;
}
async function rp1(read) {
  const out = { bad: 0, first: '' };
  for (const loc of LOCALES) for (const order of ['language-first', 'pack-first']) {
    const T = await viewer(read, loc, order), P = JSON.parse(read('rates/' + MAP[loc] + '.json')), d = rp1Diff(T, P, localeData(read, loc));
    if (T.name !== MAP[loc]) d.unshift('pack ' + T.name + ' want ' + MAP[loc]);
    if (d.length) { out.bad++; if (!out.first) out.first = loc + '/' + order + ': ' + d.length + ' off, e.g. ' + d.slice(0, 2).join('; '); }
  }
  return out;
}

// RP2 + RP3 — the 4D numbers and the misc-element price equal the old locale path
function oldLocalePath(loc) {   // the code before the fix, the Viewer as it was: rates.js + the language's numbers, no pack
  const ctx = page(OLD, { locale: loc }); return ready(ctx).then(() => tables(ctx));
}
async function rp23(read) {
  const r = { prodOff: [], rdefOff: [] };
  for (const loc of LOCALES) {
    const A = await oldLocalePath(loc), off = [];
    for (const order of ['language-first', 'pack-first']) { const B = await viewer(read, loc, order);
    for (const k of new Set([...Object.keys(A.L), ...Object.keys(B.L)])) {
      const a = A.L[k] || {}, b = B.L[k] || {};
      for (const c of new Set([...Object.keys(a.productivity || {}), ...Object.keys(b.productivity || {})])) if ((a.productivity || {})[c] !== (b.productivity || {})[c]) off.push(k + '.' + c + ' ' + (a.productivity || {})[c] + '->' + (b.productivity || {})[c]);
      if (a.crew_size !== b.crew_size) off.push(k + '.crew_size'); if (a.max_crews !== b.max_crews) off.push(k + '.max_crews');
    }
    const want = localeData(read, loc).rates_default; if (B.D.rate !== want.rate || B.D.unit !== want.unit) r.rdefOff.push(loc + '/' + order + ' ' + B.D.rate + ' want ' + want.rate);
    }
    if (off.length) r.prodOff.push(loc + '(' + off.length + ': ' + off[0] + ')');
  }
  return r;
}

// RP4 — sequence_rules.json answers after the pack: the pack's labour must survive
async function rp4(read) {
  const ctx = page(read, { locale: 'en_MY', search: '?rates=bcis2024_uk', delay: f => (f === 'rates/sequence_rules.json' ? 40 : 0) });
  await vm.runInContext('initRateTemplate()', ctx); await ready(ctx); await tick(60);
  const P = JSON.parse(read('rates/bcis2024_uk.json')), T = tables(ctx);
  return { got: T.L.HVAC_TECH.rate_per_day, want: P.labor.HVAC_TECH.rate_per_day, prod: T.L.HVAC_TECH.productivity.IfcDuct, wantProd: P.labor.HVAC_TECH.productivity.IfcDuct };
}

// RP5 — which pack
async function rp5(read) {
  const pick = async o => { const ctx = page(read, o); await vm.runInContext('initRateTemplate()', ctx); await ready(ctx); return vm.runInContext('RATE_TEMPLATE_NAME', ctx); };
  return { mapped: await pick({ search: '?lang=ar' }), picked: await pick({ search: '?lang=ar', store: { bim_5d_pack: 'jbci2024_jp' } }), url: await pick({ search: '?lang=ar&rates=sni2024_id', store: { bim_5d_pack: 'jbci2024_jp' } }) };
}

// RP6 — switch the language in place
async function rp6(read) {
  const sw = async store => { const ctx = page(read, { locale: 'en_MY', store }); await vm.runInContext('initRateTemplate()', ctx); await ready(ctx);
    await vm.runInContext('_TRL_LOADER.setLocale("en_US")', ctx); await tick(40); const T = tables(ctx); return { name: T.name, roof: T.R.IfcRoof.rate, cur: T.cur }; };
  return { free: await sw({}), pinned: await sw({ bim_5d_pack: 'cidb2024_my' }) };
}

let verdict = false;   // a run that stops without its verdict line (a promise that never settles) must not exit 0
process.on('exit', () => { if (!verdict) { console.log('§W-RATES-PACK INCONCLUSIVE: stopped before the verdict (a load never settled)'); process.exitCode = 2; } });
(async () => {
  const usP = JSON.parse(NOW('rates/rsmeans2024_us.json')), myP = JSON.parse(NOW('rates/cidb2024_my.json'));
  const a = await rp1(NOW), aOld = await rp1(OLD);
  ok('RP1 numbers = the pack, words = the language, in either load order (' + LOCALES.length + ' locales x 2 orders)', a.bad === 0 && aOld.bad > 0,
    'off now=' + a.bad + ' ' + a.first + ' | before (' + REF + ') off=' + aOld.bad + ' e.g. ' + aOld.first);
  const b = await rp23(NOW), bOld = await rp23(OLD_DATA);
  ok('RP2 4D labour numbers on the pack path = the old locale path (' + LOCALES.length + ' locales)', b.prodOff.length === 0 && bOld.prodOff.length > 0,
    'differ now=' + b.prodOff.length + ' ' + b.prodOff.slice(0, 2).join(' ') + ' | packs before the move: ' + bOld.prodOff.length + ' [' + bOld.prodOff.map(s => s.split('(')[0]).join(' ') + ']');
  ok('RP3 the misc-element price = the locale file\'s, via its pack (' + LOCALES.length + ' locales)', b.rdefOff.length === 0 && bOld.rdefOff.length > 0,
    'differ now=' + b.rdefOff.length + ' ' + b.rdefOff.slice(0, 2).join(', ') + ' | packs before the move: ' + bOld.rdefOff.length + ' e.g. ' + bOld.rdefOff.slice(0, 2).join(', '));
  const c = await rp4(NOW), cOld = await rp4(OLD);
  ok('RP4 sequence rules answering after the pack do not erase the pack\'s labour', c.got === c.want && c.prod === c.wantProd && !(cOld.got === cOld.want && cOld.prod === cOld.wantProd),
    'HVAC_TECH rate_per_day ' + c.got + ' (pack ' + c.want + ') IfcDuct ' + c.prod + ' (pack ' + c.wantProd + ') | before: ' + cOld.got + ' / ' + cOld.prod);
  const d = await rp5(NOW), dOld = await rp5(OLD), dPass = x => x.mapped === 'aramco2024_sa' && x.picked === 'jbci2024_jp' && x.url === 'sni2024_id';
  ok('RP5 the pack: ?rates= > Settings pick > the language as locale_loader detects it', dPass(d) && !dPass(dOld), JSON.stringify(d) + ' | before ' + JSON.stringify(dOld));
  const e = await rp6(NOW), eOld = await rp6(OLD), ePass = x => x.free.name === 'rsmeans2024_us' && x.free.roof === usP.materials.IfcRoof.rate && x.free.cur === usP.meta.currency && x.pinned.name === 'cidb2024_my' && x.pinned.roof === myP.materials.IfcRoof.rate && x.pinned.cur === myP.meta.currency;
  ok('RP6 a language switch in place follows the language\'s pack, unless a pack is picked', ePass(e) && !ePass(eOld), JSON.stringify(e) + ' | before ' + JSON.stringify(eOld));
  verdict = true; console.log('§W-RATES-PACK ' + (fails ? 'FAIL' : 'PASS') + ' fails=' + fails); process.exit(fails ? 1 : 0);
})().catch(err => { console.log('§W-RATES-PACK ERROR ' + (err && err.stack || err)); process.exit(2); });
