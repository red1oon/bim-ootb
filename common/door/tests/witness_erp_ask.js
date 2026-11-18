// ⚠ DO NOT REMOVE — W-ERP-ASK (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §13: the help question box at the terminal, in the chosen language). READ THE LOG; an exit code is not evidence.
//   A1 ISSUE (the CLI answers an English question differently from the page) · A2 ISSUE (a Chinese question finds nothing at the terminal) · A3 ISSUE (the verb is not a read, or an AI may not ask)
//   L ISSUE (the language is not taken in the CLI's order: flag > the stated user's preference > LANG > client 0 / the session's client > en_US)
//   Every answer goes through the REAL door line (door.js 'erp.ask question="…"'), the same verb a person or an AI types. The question sets are the page witness's own (erp/tests/fixtures/help_questions.json).
//   P ISSUE (bim-compiler prompts/CLI_ERP_IVR.md §60, door ≠ page: the door's ask never names a process or report, because it gave indexFrom no processIds while the page gives its menu's).
//   Falsifier: ERP_BREAK=nolang (the chosen language ignored) FAILs A2 and L. HS_BREAK=winonly (indexFrom drops processIds) FAILs P2.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const { kit, run, ROOT, DOOR } = require('./_kit');
const k = kit('W-ERP-ASK');
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'erp', 'tests', 'fixtures', 'help_questions.json'), 'utf8'));
const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp', 'ad_seed.db'), q], { encoding: 'utf8' }).stdout || '[]');   // the independent oracle: the raw seed
const LR = require(path.join(ROOT, 'common', 'door', 'lang_rule.js'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'w_erp_ask_'));
const env0 = { LANG: 'en_US.UTF-8', BIM_DOOR_USER: '', BIM_OBJECT_OPLOG: path.join(scratch, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(scratch, 'journal.jsonl') };   // a read, but the door may journal: never the owner's files   // the door's runner adds the machine's environment back: the language inputs are stated here, so every machine runs the same case
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
  // A2de: the German set, lang=de_DE (whole words), answered with the de_DE how-to
  let okd = 0, nd = 0;
  for (const x of FX.de || []) { const r = await ask(x.q, 'lang=de_DE'); nd++; const res = r.res || {}; const w = res.window && res.window.id, a = res.action ? res.action.code : null, good = w === x.w && a === x.a && res.lang === 'de_DE' && res.howtoLang === 'de_DE'; if (good) okd++;
    k.L('A2de ' + (good ? 'ok ' : 'WRONG ') + JSON.stringify(x.q) + ' -> window=' + w + ' ' + JSON.stringify(res.window && res.window.name) + ' action=' + a + ' ' + JSON.stringify(res.action && res.action.name) + ' howto=' + JSON.stringify(res.howto && res.howto.name) + ' howtoLang=' + res.howtoLang); }
  if (!nd) k.incon('A2de', 'VACUOUS'); else k.chk('A2de the German set (lang=de_DE) finds the window and the action, with the de_DE how-to', okd === nd, okd + '/' + nd);
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
  // A4: the card a person reads (red1 prints the answer's summary; rows in the page's order: Window, then a Process/Report row when the index names one (§60), then Action): in zh_CN the dictionary's own labels (窗口 = AD_Element AD_Window_ID, 文档动作 = DocAction) and the zh_CN how-to; in English, English
  const zc = (await ask(FX.zh[0].q, 'lang=zh_CN')).res || {}, ec = (await ask(FX.en[0].q)).res || {};
  k.L('A4 zh summary: ' + JSON.stringify(String(zc.summary || '').slice(0, 160)) + ' · en summary: ' + JSON.stringify(String(ec.summary || '').slice(0, 80)));
  k.chk('A4 the zh_CN card: dictionary labels + the Chinese how-to, marked as translated', /^窗口: 销售订单\n(?:(?:进程|报告): [^\n]+\n)?文档动作: 结束/.test(zc.summary || '') && /构建会话/.test(zc.summary || ''), (zc.summary || '').split('\n')[0]);
  k.chk('A4 the English card is English', /^Window: Sales Order\n(?:(?:Process|Report): [^\n]+\n)?Action: Close/.test(ec.summary || ''), (ec.summary || '').split('\n')[0]);
  // A3 (b): an AI may ask (read), the envelope says ok
  const ai = await ask(FX.en[0].q, '', {}, 'ai'), st = ai.env && (ai.env.status || ai.env.ok);
  k.chk('A3 an AI caller gets the answer (a read needs no confirmation)', ai.code === 0 && ((ai.res || {}).window || {}).id === FX.en[0].w, 'exit=' + ai.code + ' status=' + st);
  // P (§60): the role's menu processes and reports, as the page's menu().processes. Oracle = an independent SQL over the raw seed (common/help/tests/witness_hq_legacy_superset.js pids)
  const ROLE = 102, menuP = "SELECT DISTINCT m.ad_process_id AS p FROM ad_menu m JOIN ad_process pr ON pr.ad_process_id=m.ad_process_id JOIN ad_process_access a ON a.ad_process_id=m.ad_process_id WHERE m.action IN ('P','R') AND m.isactive='Y' AND m.issummary='N' AND pr.isactive='Y' AND a.ad_role_id=" + ROLE + " AND a.isactive='Y'";
  const pids = new Set(sq(menuP).map((r) => Number(r.p)));
  const pa = (await ask('Aging', 'role=' + ROLE)).res || {};
  k.L('P1 role=' + ROLE + ' door processes=' + pa.processes + ' oracle=' + pids.size);
  if (!pids.size) k.incon('P1', 'VACUOUS: the seed gives role ' + ROLE + ' no menu process'); else k.chk('P1 the door\'s process set for role ' + ROLE + ' = the menu\'s P/R leaves the role may run (independent SQL)', pa.processes === pids.size, pa.processes + ' vs ' + pids.size);
  // P2: names picked from the seed (not typed): on the role's menu, a name no other active process and no window carries, no shorter than 6 letters; the first 5 by id
  const cand = sq(menuP.replace('SELECT DISTINCT m.ad_process_id AS p', 'SELECT DISTINCT pr.ad_process_id AS p, pr.name AS n, pr.isreport AS r') + " AND length(pr.name)>=6 AND (SELECT count(*) FROM ad_process x WHERE x.isactive='Y' AND lower(x.name)=lower(pr.name))=1 AND NOT EXISTS (SELECT 1 FROM ad_window w WHERE lower(w.name)=lower(pr.name)) ORDER BY 1 LIMIT 5");
  let ok2p = 0, rowAt = 0;
  for (const x of cand) { const r = (await ask(x.n, 'role=' + ROLE)).res || {}, got = r.process && r.process.id, lab = x.r === 'Y' ? 'Report' : 'Process';
    const ls = String(r.summary || '').split('\n'), at = ls.indexOf(lab + ': ' + x.n), place = at === (r.window ? 1 : 0); if (got === Number(x.p)) ok2p++; if (place) rowAt++;
    k.L('P2 ' + (got === Number(x.p) && place ? 'ok ' : 'WRONG ') + JSON.stringify(x.n) + ' want=' + x.p + ' got=' + got + ' row at line ' + at + ' window=' + (r.window ? r.window.id : 'none')); }
  if (!cand.length) k.incon('P2', 'VACUOUS: no unique process name on the menu'); else {
    k.chk('P2 a process name on the role\'s menu is answered with that process, through the real door line', ok2p === cand.length, ok2p + '/' + cand.length);
    k.chk('P2 the summary has the Process/Report row right after the Window row (first when no window), as the page', rowAt === cand.length, rowAt + '/' + cand.length); }
  // P3: a process NOT on the role's menu is never named, asked by its exact (unique) name
  const off = sq("SELECT pr.ad_process_id AS p, pr.name AS n FROM ad_process pr WHERE pr.isactive='Y' AND length(pr.name)>=6 AND pr.ad_process_id NOT IN (" + menuP.replace('SELECT DISTINCT m.ad_process_id AS p', 'SELECT m.ad_process_id') + ") AND (SELECT count(*) FROM ad_process x WHERE x.isactive='Y' AND lower(x.name)=lower(pr.name))=1 ORDER BY 1 LIMIT 3");
  let stray = 0; for (const x of off) { const r = (await ask(x.n, 'role=' + ROLE)).res || {}, got = r.process && r.process.id; if (got != null && !pids.has(got)) stray++; k.L('P3 ' + JSON.stringify(x.n) + ' (off the menu, id ' + x.p + ') -> process=' + got); }
  if (!off.length) k.incon('P3', 'VACUOUS'); else k.chk('P3 a process off the role\'s menu is never named', stray === 0, stray + ' stray of ' + off.length);
  k.end();
})().catch((e) => { console.log('§W-ERP-ASK CRASH ' + (e && e.stack || e)); process.exit(3); });
