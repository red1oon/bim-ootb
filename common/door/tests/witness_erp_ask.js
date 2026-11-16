// ⚠ DO NOT REMOVE — W-ERP-ASK (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §13: the help question box at the terminal, in the chosen language). READ THE LOG; an exit code is not evidence.
//   A1 ISSUE (the CLI answers an English question differently from the page) · A2 ISSUE (a Chinese question finds nothing at the terminal) · A3 ISSUE (the verb is not a read, or an AI may not ask)
//   L ISSUE (the language is not taken in the CLI's order: flag > the stated user's preference > LANG > client 0 / the session's client > en_US)
//   Every answer goes through the REAL door line (door.js 'erp.ask question="…"'), the same verb a person or an AI types. The question sets are the page witness's own (erp/tests/fixtures/help_questions.json).
//   Falsifier: ERP_BREAK=nolang (the chosen language ignored) FAILs A2 and L.
'use strict';
const fs = require('fs'), path = require('path');
const { kit, run, ROOT, DOOR } = require('./_kit');
const k = kit('W-ERP-ASK');
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'erp', 'tests', 'fixtures', 'help_questions.json'), 'utf8'));
const LR = require(path.join(ROOT, 'common', 'door', 'lang_rule.js'));
const env0 = { LANG: 'en_US.UTF-8', BIM_DOOR_USER: '' };   // the door's runner adds the machine's environment back: the language inputs are stated here, so every machine runs the same case
// one door line -> the envelope's result (the door prints one JSON envelope)
async function ask(q, extra, env, actor) {
  const line = 'erp.ask question="' + q.replace(/"/g, '') + '"' + (extra ? ' ' + extra : '');
  const r = await run(DOOR, ['--actor', actor || 'human', line], Object.assign({}, env0, env || {}));   // A2 states lang= ; L states LANG
  let j = null; try { j = JSON.parse(r.out.split('\n').filter((l) => l.trim().startsWith('{')).pop()); } catch (e) { j = null; }
  const res = j && (j.result || j.answer || j.data || j); return { code: r.code, env: j, res, err: r.err };
}
(async function main() {
  const seed = path.join(ROOT, 'erp', 'ad_seed.db'); if (!fs.existsSync(seed) || fs.statSync(seed).size < 1e6) { k.incon('ALL', 'no usable seed (an LFS stub?)'); return k.end(); }
  // A3: the verb, as the vocabulary lists it
  const V = JSON.parse(fs.readFileSync(path.join(ROOT, 'common', 'door', 'verbs.json'), 'utf8')).verbs.find((v) => v.verb === 'erp.ask');
  k.chk('A3 verbs.json lists erp.ask as a read for human and ai, calling erp_cli ask', !!V && V.harm === 'read' && V.actors.indexOf('ai') >= 0 && V.calls.cli === 'erp_cli' && V.calls.argv[0] === 'ask', V ? V.harm + ' ' + V.actors.join(',') : 'missing');
  // A1: the English set (the page's S3)
  let ok1 = 0, n1 = 0, first = null;
  for (const x of FX.en) { const r = await ask(x.q); n1++; const res = r.res || {}; first = first || r; const w = res.window && res.window.id, a = res.action ? res.action.code : null, good = w === x.w && a === x.a; if (good) ok1++;
    k.L('A1 ' + (good ? 'ok ' : 'WRONG ') + JSON.stringify(x.q) + ' -> window=' + w + ' action=' + a + ' lang=' + res.lang + ' by=' + res.langBy + ' exit=' + r.code + (good ? '' : ' err=' + String(r.err).slice(-160))); }
  k.L('A1 envelope sample: ' + JSON.stringify(first && first.env).slice(0, 300));
  if (!n1) k.incon('A1', 'VACUOUS'); else k.chk('A1 the English set through the door finds the window and the action (= the page S3)', ok1 === n1, ok1 + '/' + n1);
  // A2: the Chinese set, lang=zh_CN
  let ok2 = 0, n2 = 0;
  for (const x of FX.zh) { const r = await ask(x.q, 'lang=zh_CN'); n2++; const res = r.res || {}; const w = res.window && res.window.id, a = res.action ? res.action.code : null, good = w === x.w && a === x.a && res.lang === 'zh_CN'; if (good) ok2++;
    k.L('A2 ' + (good ? 'ok ' : 'WRONG ') + JSON.stringify(x.q) + ' -> window=' + w + ' ' + JSON.stringify(res.window && res.window.name) + ' action=' + a + ' ' + JSON.stringify(res.action && res.action.name) + ' howto=' + JSON.stringify(res.howto && res.howto.name) + ' howtoLang=' + res.howtoLang); }
  if (!n2) k.incon('A2', 'VACUOUS'); else k.chk('A2 the Chinese set (lang=zh_CN) finds the window and the action, answered in zh_CN', ok2 === n2, ok2 + '/' + n2);
  // L: the order, through the door (flag, LANG, the fallback) and on the rule itself for the preference step (the seed holds no AD_Preference 'Language' row: measured)
  const q = FX.zh[0].q;
  const lLang = await ask(q, '', { LANG: 'zh_CN.UTF-8' }), lFlag = await ask(q, 'lang=de_DE', { LANG: 'zh_CN.UTF-8' }), lNone = await ask(q, '', { LANG: 'C' });
  const got = (r) => (r.res || {}).lang + '/' + (r.res || {}).langBy;
  k.L('L LANG=zh_CN.UTF-8 -> ' + got(lLang) + ' · lang=de_DE with LANG=zh_CN -> ' + got(lFlag) + ' · LANG=C -> ' + got(lNone));
  k.chk('L the terminal LANG decides when nothing else is stated', got(lLang) === 'zh_CN/LANG', got(lLang));
  k.chk('L lang= overrides LANG', got(lFlag) === 'de_DE/flag', got(lFlag));
  k.chk('L no LANG: the system client, else the session client, else en_US (the seed has no client 0 row)', /^en_US\/(client0|client|default)$/.test(got(lNone)), got(lNone));
  const stub = (sql) => (/ad_preference/.test(sql) && / ad_user_id=100 /.test(sql + ' ') ? [{ value: 'ja_JP' }] : (/ad_client_id=0/.test(sql) ? [] : []));
  const p1 = LR.chosen(stub, { user: 100, env: { LANG: 'zh_CN.UTF-8' } }), p2 = LR.chosen(stub, { env: { LANG: 'zh_CN.UTF-8' } });
  k.chk('L a stated user\'s saved Language comes before LANG; without a user it is not read', p1.lang === 'ja_JP' && p1.by === 'preference' && p2.lang === 'zh_CN' && p2.by === 'LANG', JSON.stringify([p1, p2]));
  // A4: the card a person reads (red1 prints the answer's summary): in zh_CN the dictionary's own labels (窗口 = AD_Element AD_Window_ID, 文档动作 = DocAction) and the zh_CN how-to; in English, English
  const zc = (await ask(FX.zh[0].q, 'lang=zh_CN')).res || {}, ec = (await ask(FX.en[0].q)).res || {};
  k.L('A4 zh summary: ' + JSON.stringify(String(zc.summary || '').slice(0, 160)) + ' · en summary: ' + JSON.stringify(String(ec.summary || '').slice(0, 80)));
  k.chk('A4 the zh_CN card: dictionary labels + the Chinese how-to, marked as translated', /^窗口: 销售订单\n文档动作: 结束/.test(zc.summary || '') && /构建会话/.test(zc.summary || ''), (zc.summary || '').split('\n')[0]);
  k.chk('A4 the English card is English', /^Window: Sales Order\nAction: Close/.test(ec.summary || ''), (ec.summary || '').split('\n')[0]);
  // A3 (b): an AI may ask (read), the envelope says ok
  const ai = await ask(FX.en[0].q, '', {}, 'ai'), st = ai.env && (ai.env.status || ai.env.ok);
  k.chk('A3 an AI caller gets the answer (a read needs no confirmation)', ai.code === 0 && ((ai.res || {}).window || {}).id === FX.en[0].w, 'exit=' + ai.code + ' status=' + st);
  k.end();
})().catch((e) => { console.log('§W-ERP-ASK CRASH ' + (e && e.stack || e)); process.exit(3); });
