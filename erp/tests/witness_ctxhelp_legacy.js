#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-CTXHELP-LEGACY (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.17 F6). READ THE LOG after every run: every verdict is a § line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: the owner offers our how-to topics to legacy iDempiere users as a migration script (erp/legacy/local_sql/postgresql/*_KernelERP_ContextHelp.sql),
//   legacy's code untouched. Does a REAL legacy database, after applying it, show each topic where the twin does, with the site's OWN tab text first, inside legacy's column
//   limit, without taking fixed ids, without replacing a site's own help, and does a second apply change nothing?
// ORACLE: legacy's own PostgreSQL (docker `postgres`), the PILOT copy `idempiere_pilot` — never the oracle DB `idempiere`. Everything runs in ONE transaction that is ROLLED BACK.
//   L1 for every target (erp/legacy/ctxhelp_targets.json, the twin's K6 targets) legacy's lookup (MCtxHelpMsg.getCtxHelpID: AD_Tab / AD_Process .AD_CtxHelp_ID, then the
//      client-0 message) finds OUR help (its UUID); the message == the site's own Name / Description / Help (read from the pilot BEFORE the apply, legacy's block shape,
//      HelpController.java:338-364) + <hr> + the twin's message (exact, or a whole-word start of it ending with the guide link when the site's limit is reached),
//      and (§19.21 item 4) every message ends with ONE "More, and questions" footer line (red BR=nofooter).
//   L2 the same per site language (AD_Tab_Trl / AD_Process_Trl rows): the translated own text first, then the twin's text in that language or English.
//   L3 a second apply: every INSERT / UPDATE reports 0 rows and the two sequences do not move.
//   L4 ids: every new row's id was taken from the site's sequence (>= its CurrentNext before the apply), none is a fixed number.
//   L5 a target that already has a site help keeps it (one tab is given legacy's Home help first, inside the transaction).
//   L6 every message and translation <= the site's own AD_Column.FieldLength of MsgText.
//   L7 (§19.17 F6.1) no dead link: the twin's window links reach legacy as plain bold terms; the guide links stay.
//   L8 (§19.21 deletion budget, 2026-11-25) no fixed stop-reason list reaches legacy: no applied message holds "What can stop Complete" / "When it refuses" (red LEG_BREAK=oldlist: the script of 2026-11-24, which carried it).
// Reds: LEG_BREAK=oldlist -> L8 FAIL; LEG_BREAK=oldscript (the script before F6.1) -> L7 FAIL; LEG_BREAK=noconflict (no ON CONFLICT) -> L3 FAIL; LEG_BREAK=nodict (no own text) -> L1 FAIL; LEG_BREAK=nolinkguard (links over a site's help) -> L5 FAIL.
// Run: node erp/tests/witness_ctxhelp_legacy.js   Needs: docker postgres up with the idempiere_pilot DB, else INCONCLUSIVE.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ERP = path.join(__dirname, '..'), BR = process.env.LEG_BREAK || '', DB = process.env.LEG_DB || 'idempiere_pilot';
if (DB === 'idempiere') throw new Error('W-CTXHELP-LEGACY never runs on the oracle DB `idempiere`');
const LOGD = path.join(__dirname, 'logs'); fs.mkdirSync(LOGD, { recursive: true });
const LOGF = path.join(LOGD, 'w_ctxhelp_legacy' + (BR ? '_break_' + BR : '') + '.log'); fs.writeFileSync(LOGF, '');
const out = (m) => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
const K = { pass: 0, fail: 0, inc: 0 };
const chk = (n, ok, info) => { ok ? K.pass++ : K.fail++; out('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + n + (info ? '  ' + info : '')); };
const incon = (id, why) => { K.inc++; out('§CTXHELP_LEGACY INCONCLUSIVE ' + id + ' — ' + why); };
const L = (m) => out('§CTXHELP_LEGACY ' + m);
const ent = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const words = (h) => ent(String(h || '').replace(/<[^>]+>/g, ' ')).split(/\s+/).filter(Boolean).join(' ');
const MORE = /<p><a href="([^"]*)" target="_blank">([^<]*) …<\/a><\/p>$/;
const FOOT = /<p><a href="[^"]*" target="_blank" data-guide-footer="1">More, and questions: [^<]* →<\/a><\/p>$/;   // §19.21 item 4: every message ends with ONE footer line (judged here, then set aside for the text comparison)
const KEEP_TAB = 187;   // L5: Order Line gets legacy's Home help (200000) before the apply, as a site's own link

(function main() {
  const T = JSON.parse(fs.readFileSync(path.join(ERP, 'legacy', 'ctxhelp_targets.json'), 'utf8')), file = path.join(ERP, T.file);
  let sql = fs.readFileSync(file, 'utf8');
  if (BR === 'oldscript') sql = cp.execFileSync('git', ['-C', path.join(ERP, '..'), 'show', (process.env.OLD_REF || 'debd3c0e') + ':erp/' + T.file], { encoding: 'utf8', maxBuffer: 1 << 28 });   // §19.17 F6.1 red: the script before the fix
  if (BR === 'oldlist') sql = cp.execFileSync('git', ['-C', path.join(ERP, '..'), 'show', (process.env.OLDLIST_REF || 'eef6ea4e') + ':erp/legacy/local_sql/postgresql/202611241825_KernelERP_ContextHelp.sql'], { encoding: 'utf8', maxBuffer: 1 << 28 });   // L8 red: the script that still listed the stop reasons
  if (BR === 'noconflict') sql = sql.replace(/\nON CONFLICT[^\n]*;/g, ';');
  if (BR === 'nodict') sql = sql.split("'<p><strong>' || r.Name || '</strong></p>' || COALESCE('<p><em>' || NULLIF(r.Description, '') || '</em></p>', '') || COALESCE('<p>' || NULLIF(r.Help, '') || '</p>', '') || '<hr>'").join("''");
  if (BR === 'nolinkguard') sql = sql.split(' AND AD_CtxHelp_ID IS NULL;').join(';');
  L('script ' + T.file + ' ' + sql.length + ' chars, targets ' + T.targets.length + ', db ' + DB + ', break ' + (BR || 'none'));
  const app = require(path.join(ERP, 'ad_ctxhelp_app_rows.js')), twin = {};   // the twin's English message per help (proven against the guides by W-CTXHELP-OVERLAY K6)
  // §19.17 F6.1: legacy gets the twin's window / process links as plain bold terms (no handler there); everything else is the twin's text as is. The old script (red) keeps them.
  const asLegacy = (h) => BR === 'oldscript' ? h : h.replace(/<a [^>]*data-help-(?:win|proc)="[^"]*"[^>]*>([\s\S]*?)<\/a>/g, '<b>$1</b>');
  app.rows.filter((r) => /^INSERT OR IGNORE INTO ad_ctxhelpmsg \(/.test(r)).forEach((r) => { const m = /VALUES \(0, (\d+), \d+, '[^']*', 0, '[^']*', 100, 'Y', NULL, '((?:[^']|'')*)'/.exec(r); if (m) twin[m[1]] = asLegacy(m[2].replace(/''/g, "'")); });
  const tabs = T.targets.filter((t) => t.kind === 'T').map((t) => t.id), procs = T.targets.filter((t) => t.kind === 'P').map((t) => t.id);
  const seqQ = "SELECT '§SEQ|' || (SELECT CurrentNext FROM AD_Sequence WHERE Name='AD_CtxHelp' AND IsTableID='Y') || '|' || (SELECT CurrentNext FROM AD_Sequence WHERE Name='AD_CtxHelpMsg' AND IsTableID='Y');";
  const dictQ = (tb, ids) => "SELECT '§D|' || json_build_object('kind', '" + (tb === 'AD_Tab' ? 'T' : 'P') + "', 'id', r." + tb + "_ID, 'name', r.Name, 'desc', r.Description, 'help', r.Help, 'trl', (SELECT json_object_agg(x.AD_Language, json_build_object('name', x.Name, 'desc', x.Description, 'help', x.Help)) FROM " + tb + '_Trl x WHERE x.' + tb + '_ID=r.' + tb + '_ID))::text FROM ' + tb + ' r WHERE r.' + tb + '_ID IN (' + (ids.join(',') || '0') + ');';
  // legacy's lookup (MCtxHelpMsg.java:110-205 getCtxHelpID + :62-108 get, client 0), the message, its translations
  const lookQ = (tb, ids) => "SELECT '§J|' || json_build_object('kind', '" + (tb === 'AD_Tab' ? 'T' : 'P') + "', 'id', r." + tb + "_ID, 'hid', h.AD_CtxHelp_ID, 'uu', h.AD_CtxHelp_UU, 'mid', m.AD_CtxHelpMsg_ID, 'msg', m.MsgText, 'trl', (SELECT json_object_agg(x.AD_Language, x.MsgText) FROM AD_CtxHelpMsg_Trl x WHERE x.AD_CtxHelpMsg_ID=m.AD_CtxHelpMsg_ID))::text FROM " + tb +
    " r LEFT JOIN AD_CtxHelp h ON h.AD_CtxHelp_ID=r.AD_CtxHelp_ID AND h.IsActive='Y' AND h.AD_Client_ID=0 LEFT JOIN LATERAL (SELECT * FROM AD_CtxHelpMsg mm WHERE mm.AD_CtxHelp_ID=h.AD_CtxHelp_ID AND mm.IsActive='Y' AND mm.AD_Client_ID=0 AND mm.AD_Org_ID=0 ORDER BY mm.AD_CtxHelpMsg_ID DESC LIMIT 1) m ON true WHERE r." + tb + '_ID IN (' + (ids.join(',') || '0') + ');';
  const limQ = "SELECT '§LIM|' || (SELECT c.FieldLength FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID WHERE t.TableName='AD_CtxHelpMsg' AND c.ColumnName='MsgText') || '|' || (SELECT c.FieldLength FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID WHERE t.TableName='AD_CtxHelpMsg_Trl' AND c.ColumnName='MsgText');";
  const input = ['\\set ON_ERROR_STOP on', 'BEGIN;', 'SET search_path=adempiere;', limQ, seqQ, dictQ('AD_Tab', tabs), dictQ('AD_Process', procs),
    'UPDATE AD_Tab SET AD_CtxHelp_ID=(SELECT AD_CtxHelp_ID FROM AD_CtxHelp WHERE CtxType=\'H\' AND AD_Client_ID=0 ORDER BY AD_CtxHelp_ID LIMIT 1) WHERE AD_Tab_ID=' + KEEP_TAB + ' AND AD_CtxHelp_ID IS NULL;',
    "SELECT '§KEEP0|' || COALESCE(AD_CtxHelp_ID::text, 'null') FROM AD_Tab WHERE AD_Tab_ID=" + KEEP_TAB + ';',
    "SELECT '§APPLY1';", sql, "SELECT '§AFTER1';", seqQ, lookQ('AD_Tab', tabs), lookQ('AD_Process', procs),
    "SELECT '§KEEP1|' || COALESCE(AD_CtxHelp_ID::text, 'null') FROM AD_Tab WHERE AD_Tab_ID=" + KEEP_TAB + ';',
    "SELECT '§APPLY2';", sql, "SELECT '§AFTER2';", seqQ, 'ROLLBACK;', "SELECT '§DONE';"].join('\n');
  const r = cp.spawnSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', DB, '-At', '-F', '|'], { input, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.error || (r.status !== 0 && !/§APPLY1/.test(r.stdout || ''))) { incon('ALL', 'psql on ' + DB + ' not reachable: ' + String(r.error || r.stderr).slice(0, 200)); return finish(); }
  const lines = (r.stdout || '').split('\n'), at = (m) => lines.indexOf(m);
  fs.writeFileSync(path.join(LOGD, 'w_ctxhelp_legacy' + (BR ? '_break_' + BR : '') + '.psql.log'), r.stdout + '\n--- stderr ---\n' + r.stderr);
  if (r.stderr && /ERROR/.test(r.stderr)) L('psql ERROR: ' + r.stderr.split('\n').filter((x) => /ERROR/.test(x)).slice(0, 2).join(' | ').slice(0, 300));
  const done = at('§DONE') >= 0; L('psql exit ' + r.status + ', markers APPLY1 ' + (at('§APPLY1') >= 0) + ' AFTER1 ' + (at('§AFTER1') >= 0) + ' AFTER2 ' + (at('§AFTER2') >= 0) + ' rolled back ' + done);
  const lim = (lines.find((x) => x.startsWith('§LIM|')) || '').split('|'), LM = Number(lim[1]), LT = Number(lim[2]);
  const seqs = lines.filter((x) => x.startsWith('§SEQ|')).map((x) => x.split('|').slice(1).map(Number));
  const D = {}; lines.filter((x) => x.startsWith('§D|')).forEach((x) => { const o = JSON.parse(x.slice(3)); D[o.kind + o.id] = o; });
  const J = {}; lines.filter((x) => x.startsWith('§J|')).forEach((x) => { const o = JSON.parse(x.slice(3)); J[o.kind + o.id] = o; });
  const keep0 = (lines.find((x) => x.startsWith('§KEEP0|')) || '').split('|')[1], keep1 = (lines.find((x) => x.startsWith('§KEEP1|')) || '').split('|')[1];
  L('limits MsgText ' + LM + ' / _Trl ' + LT + '; sequences before ' + JSON.stringify(seqs[0]) + ' after 1st ' + JSON.stringify(seqs[1]) + ' after 2nd ' + JSON.stringify(seqs[2]) + '; site help on tab ' + KEEP_TAB + ' before ' + keep0 + ' after ' + keep1);
  if (at('§AFTER1') < 0) { chk('L1 the script applies on ' + DB, false, r.stderr.slice(0, 300)); return finish(); }
  // the site's own block, legacy's shape (HelpController.renderCtxHelp :345-353), from the values read BEFORE the apply
  const own = (n, d, h) => '<p><strong>' + n + '</strong></p>' + (d ? '<p><em>' + d + '</em></p>' : '') + (h ? '<p>' + h + '</p>' : '') + '<hr>';
  const judge = (msg, head, tw, max) => {   // -> null when right, else why
    if (msg == null) return 'no message';
    if (msg.length > max) return 'over the limit ' + msg.length + ' > ' + max;
    if (!FOOT.test(msg) || msg.split('data-guide-footer').length !== 2) return 'does not end with exactly one "More, and questions" line';
    if (BR === 'nofooter') return 'red nofooter';
    const fMsg = (FOOT.exec(msg) || [])[0], fTw = (FOOT.exec(String(tw)) || [])[0];   // the footer line, kept to compare after the cut test below
    msg = msg.replace(FOOT, ''); tw = String(tw).replace(FOOT, '');
    if (msg.indexOf(head) !== 0) return 'does not start with the own text';
    const rest = msg.slice(head.length), mo = MORE.exec(rest), twMo = MORE.exec(tw), twBody = twMo ? tw.slice(0, twMo.index) : tw;
    if (rest === tw) return null;   // the whole twin message (it may itself end with the guide link, F7)
    // §19.19: legacy's copy has its window links unlinked (<b>, shorter), so it can keep MORE whole blocks than the twin's own cut row: both are whole-block starts of the
    //   same text, so one must be a whole-word start of the other (a whole rest beside a cut twin row, or two cuts of different length)
    const kept = words(mo ? rest.slice(0, mo.index) : rest), all = words(twBody);
    // a cut with NO "…" link is by design (§19.21 item 4: no link where the footer already links the same page): judged as a whole-word start of the twin's message that ends in the SAME footer line
    if (!mo && !twMo) return kept !== all && (all + ' ').indexOf(kept + ' ') === 0 && fMsg === fTw ? null : 'the rest is not the twin\'s message';
    return kept !== all && ((all + ' ').indexOf(kept + ' ') === 0 || (kept + ' ').indexOf(all + ' ') === 0) ? null : 'the cut rest is not a whole-word start of the twin\'s message (or the twin\'s of it)';
  };
  let n1 = 0, ok1 = 0, n2 = 0, ok2 = 0, cut = 0; const bad = [], ids = [];
  T.targets.forEach((t) => {
    const k = t.kind + t.id, d = D[k], j = J[k], tw = twin[t.help];
    if (t.kind === 'T' && t.id === KEEP_TAB) return;   // L5's target: the site's own help stays (its ids are the site's, not ours)
    if (j && j.hid) ids.push(Number(j.hid)); if (j && j.mid) ids.push(Number(j.mid));
    n1++; const w1 = !d || !tw ? 'no dictionary row or twin message' : (j && j.uu === t.huu ? judge(j.msg, own(d.name, d.desc, d.help), tw, LM) : 'lookup finds help ' + (j && j.hid) + ', not ours');
    if (!w1) { ok1++; if (MORE.test(j.msg)) cut++; } else bad.push(k + ' ' + w1);
    Object.keys((d && d.trl) || {}).forEach((lg) => { n2++; const x = d.trl[lg], got = j && j.trl ? j.trl[lg] : null;
      const w2 = judge(got, own(x.name || d.name, x.desc, x.help), tw, LT);   // no machine text in this language: the twin's English message (L2's expectation)
      if (!w2) ok2++; else bad.push(k + ' ' + lg + ' ' + w2); });
  });
  { const msgs = T.targets.map((t) => J[t.kind + t.id]).filter((j) => j && j.msg), listed = msgs.filter((j) => /What can stop Complete|When it refuses/.test(j.msg)).length;
    L('L8 applied messages ' + msgs.length + ', carrying a stop-reason list ' + listed);
    if (!msgs.length) incon('L8', 'VACUOUS: no applied message read back'); else chk('L8 no fixed stop-reason list reaches legacy: ' + listed + ' of ' + msgs.length + ' applied messages carry one', listed === 0); }
  L('L1/L2 judged ' + n1 + ' targets + ' + n2 + ' site-language rows; cut at the site limit ' + cut + (bad.length ? '; wrong: ' + bad.slice(0, 5).join(' ; ') : ''));
  chk('L1 legacy\'s lookup finds our help on ' + ok1 + ' of ' + n1 + ' targets, each message = the site\'s own tab / process text + <hr> + the twin\'s message (whole blocks, ' + cut + ' ending in the guide link)', n1 > 0 && ok1 === n1);
  if (!n2) incon('L2', 'the pilot has no _Trl rows for the targets (no second system language)');
  else chk('L2 per site language: ' + ok2 + ' of ' + n2 + ' translations = the translated own text first, then the twin\'s message', ok2 === n2);
  const a2 = at('§APPLY2'), f2 = at('§AFTER2'), tags = a2 >= 0 && f2 > a2 ? lines.slice(a2 + 1, f2).filter((x) => /^(INSERT|UPDATE) /.test(x)) : [], moved = tags.filter((x) => !/^INSERT 0 0$|^UPDATE 0$/.test(x));
  L('L3 second apply: ' + tags.length + ' statements, ' + moved.length + ' changed rows ' + JSON.stringify(moved.slice(0, 4)));
  chk('L3 a second apply changes nothing: ' + (tags.length - moved.length) + ' of ' + tags.length + ' statements report 0 rows, sequences ' + JSON.stringify(seqs[1]) + ' -> ' + JSON.stringify(seqs[2]),
    f2 > a2 && tags.length > 0 && moved.length === 0 && seqs.length === 3 && seqs[1].join() === seqs[2].join());
  const base = seqs[0] ? Math.min(...seqs[0]) : NaN, fresh = ids.filter((i) => i >= base);
  chk('L4 ids from the site\'s sequences: ' + fresh.length + ' of ' + ids.length + ' new rows >= CurrentNext before the apply (' + base + '); sequences advanced ' + (seqs[1] ? seqs[1].map((v, i) => v - seqs[0][i]).join(' / ') : '?'), ids.length > 0 && fresh.length === ids.length);
  chk('L5 a tab that already has a site help keeps it: tab ' + KEEP_TAB + ' help ' + keep0 + ' -> ' + keep1, keep0 && keep0 !== 'null' && keep1 === keep0);
  // L7 (§19.17 F6.1) no dead link reaches legacy: no message or translation on the pilot holds a data-help- attribute or an href="#"; the guide links (https) are kept
  const texts = Object.values(J).filter((j) => j.uu && T.targets.some((t) => t.huu === j.uu)).reduce((a, j) => a.concat([j.msg], Object.values(j.trl || {})), []).filter((x) => x != null);
  const dead = texts.filter((x) => /data-help-|href="#"/.test(x)).length, guideLinks = texts.reduce((a, x) => a + (x.match(/<a href="https:\/\/[^"]+" target="_blank">/g) || []).length, 0);
  L('L7 our messages + translations on the pilot ' + texts.length + ', with a dead link ' + dead + ', guide links kept ' + guideLinks);
  chk('L7 no dead link reaches legacy: ' + (texts.length - dead) + ' of ' + texts.length + ' messages and translations have no data-help- / href="#" link; guide links kept ' + guideLinks, texts.length > 0 && dead === 0 && guideLinks > 0);
  const allMsg = Object.values(J).filter((j) => j.msg != null), over = allMsg.filter((j) => j.msg.length > LM).length + Object.values(J).reduce((a, j) => a + Object.values(j.trl || {}).filter((m) => m.length > LT).length, 0);
  chk('L6 every message and translation fits the site\'s MsgText length (' + LM + ' / ' + LT + '): over = ' + over, LM > 0 && allMsg.length > 0 && over === 0);
  if (!done) L('the transaction did not reach ROLLBACK (psql stopped on an error); a stopped psql session rolls back its open transaction');
  finish();
})();
function finish() {
  const v = K.fail ? 'FAIL' : (K.inc || !K.pass ? 'INCONCLUSIVE' : 'PASS');
  out('§WITNESS_CTXHELP_LEGACY pass=' + K.pass + ' fail=' + K.fail + ' inconclusive=' + K.inc + ' verdict=' + v + (BR ? ' LEG_BREAK=' + BR : ''));
  process.exitCode = v === 'PASS' ? 0 : 1;
}
