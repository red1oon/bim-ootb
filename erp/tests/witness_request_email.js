#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-EMAILREQ (bim-compiler prompts/SQLiteIDEMPIERE.md §EMAIL-REQ-R3 SPEC). READ THE LOG after every run: the §WEMAILREQ lines are the evidence, the exit code is not.
// THE ISSUE it proves/disproves: the Kernel had NO email -> Request intake (K1 "absent": legacy RequestEMailProcessor, process 50012, had no port). A site photo mailed in from WhatsApp
//   must become ONE Request (Summary/Result/DocumentNo/StartDate built as RequestEMailProcessor.createRequest builds them) with its photos as attachment entries; the same mail again must
//   NOT make a second Request (dedupe :289-318); a "Re:" mail must answer the existing Request (:320-371, Result -> LastResult + R_RequestUpdate by RequestEventHandler :193-210), not make one;
//   an unknown sender falls back to the parameter user / BPartner (:425-442); a mail with no From goes to the Error route (:221-229) and writes nothing; an HTML-only mail keeps legacy's
//   empty text Result and carries the HTML (inline image embedded) as "<subject>.html" (:462-469); a Site Camera caption's "GUID: <id>" stays verbatim in Result.
// WITNESS LEVEL ONLY (owner 2026-11-26): no legacy oracle run -> parity is reported INCONCLUSIVE, never PASS. Mutant arm: dedupe disabled -> the E2 check MUST go red.
// Run: node erp/tests/witness_request_email.js > erp/tests/logs/witness_request_email.log ; exit 0 = PASS, 1 = FAIL, 3 = INCONCLUSIVE (nothing judged)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
try { require.resolve('ajv'); } catch (e) { process.env.NODE_PATH = [process.env.NODE_PATH, path.join(os.homedir(), 'bim-ootb', 'node_modules')].filter(Boolean).join(path.delimiter); require('module').Module._initPaths(); }   // a /tmp worktree has no node_modules
const _log = console.log; console.log = function () {};   // the kernel's boot chatter; every witness line goes through say()
const say = (s) => _log(s);
const ERP = path.join(__dirname, '..'), FIX = path.join(__dirname, 'fixtures', 'request_email');
const { runFolder } = require('./request_email_run.js');
const AA = require(path.join(ERP, 'ad_attachment.js'));
const { Witness } = require('../../witness_kit/contract');
// the process parameters (RequestEMailProcessor.prepare :99-144): type 101 Service Request, fallback user 50001 (has no BPartner, so the BPartner fallback is reached too), BPartner 118, SalesRep 101
const PARAMS = { R_RequestType_ID: 101, AD_User_ID: 50001, C_BPartner_ID: 118, SalesRep_ID: 101, HTMLAttachmentType: 'H' };
const sha = (b) => crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');

// one population row per fixture mail: what the run left in the database for it (not the plan's own claims)
async function observe(arm, mutant) {
  const { k, out } = await runFolder(FIX, PARAMS, { mutant });
  const rows = [];
  for (const r of out.results) {
    const docNo = r.plan.documentNo || null;
    const byDoc = docNo ? k.q('SELECT r_request_id AS id FROM r_request WHERE ad_client_id=11 AND documentno=? ORDER BY r_request_id', [docNo]) : [];
    const req = r.requestId != null ? k.q('SELECT * FROM r_request WHERE r_request_id=?', [r.requestId])[0] || null : null;
    const ups = req ? k.q('SELECT result FROM r_requestupdate WHERE r_request_id=? ORDER BY r_requestupdate_id', [req.r_request_id]) : [];
    const att = req ? k.q("SELECT a.* FROM ad_attachment a JOIN ad_table t ON t.ad_table_id=a.ad_table_id WHERE lower(t.tablename)='r_request' AND a.record_id=?", [req.r_request_id]) : [];
    let entries = [];
    if (att.length === 1) entries = (await AA.load(att[0])).entries.map((e) => ({ name: e.name, size: e.data.length, sha256: sha(e.data), text: /\.html$/.test(e.name) ? Buffer.from(e.data).toString('utf8') : null }));
    rows.push({ arm, name: r.name, route: r.route, folder: r.folder, requestId: r.requestId == null ? null : Number(r.requestId), docNo, docNoCount: byDoc.length,
      summary: req ? req.summary : null, result: req ? req.result : null, lastResult: req ? req.lastresult : null, documentno: req ? req.documentno : null, startdate: req ? req.startdate : null,
      ad_user_id: req ? req.ad_user_id : null, c_bpartner_id: req ? req.c_bpartner_id : null, salesrep_id: req ? req.salesrep_id : null, r_requesttype_id: req ? req.r_requesttype_id : null,
      r_status_id: req ? req.r_status_id : null, processed: req ? req.processed : null, priority: req ? req.priority : null, confidentialtype: req ? req.confidentialtype : null, uu: req ? req.r_request_uu : null,
      updates: ups.map((u) => u.result), attRows: att.length, attTitle: att.length ? att[0].title : null, attRecordUU: att.length ? att[0].record_uu : null, entries,
      runRequests: out.requests, runErrors: out.errors, runTotal: out.total, newRequestsInRun: k.q('SELECT count(*) AS n FROM r_request WHERE ad_client_id=11 AND r_request_id>=1000000', [])[0].n,
      planStart: r.plan.startDate || null, log: r.log });
  }
  return { rows, k };
}

// THE CHECKS - each names the issue it proves; judge(rows) is what both the real population and the mutant are held to
const EXP = JSON.parse(fs.readFileSync(path.join(FIX, 'expected_attachments.json'), 'utf8'));   // byte hashes written by the fixture generator, independent of this parser
function by(rows, n) { return rows.find((r) => r.name === n) || {}; }
function judge(rows, statusOpen) {
  const E1 = by(rows, '01_new_two_jpegs.eml'), E2 = by(rows, '02_duplicate.eml'), E3 = by(rows, '03_reply.eml'), E4 = by(rows, '04_unknown_sender.eml'), E5 = by(rows, '05_no_from.eml'),
    E6 = by(rows, '06_html_only.eml'), E7 = by(rows, '07_sitecam_caption.eml');
  const MID1 = '<CAJ7wq0tLx9e2Bk4uQ1v8sNnR3pD5fHq0aY@mail.gmail.com>';
  const ent = (r, n) => (r.entries || []).find((e) => e.name === n);
  const reply = 'FROM: emp001@contoh.my\nContractor will inspect tomorrow at 9.';
  return [
    ['E1-create', 'a new mail makes ONE Request: Summary "FROM: <from>\\n<subject>", DocumentNo = Message-ID cut to 30 (:283-287), StartDate = the Date header (:445), type = parameter (:386-389)',
      E1.route === 'create' && E1.summary === 'FROM: emp001@contoh.my\nCracked slab at Level 2' && E1.documentno === MID1.substring(0, 30) && E1.startdate === E1.planStart && /^2026-11-26 \d\d:15:00$/.test(String(E1.startdate)) && Number(E1.r_requesttype_id) === 101,
      { route: E1.route, summary: E1.summary, documentno: E1.documentno, startdate: E1.startdate }],
    ['E1-attach', 'its 2 JPEG attachment parts become entries of ONE AD_Attachment (Title zip, Record_UU = the Request UU), bytes equal to the parts as generated (:482-486)',
      E1.attRows === 1 && E1.attTitle === 'zip' && E1.attRecordUU != null && E1.attRecordUU === E1.uu && (E1.entries || []).length === 2 && ent(E1, 'slab_1.jpg') && ent(E1, 'slab_1.jpg').sha256 === EXP['01_new_two_jpegs.eml']['slab_1.jpg'] && ent(E1, 'slab_2.jpg') && ent(E1, 'slab_2.jpg').sha256 === EXP['01_new_two_jpegs.eml']['slab_2.jpg'],
      { attRows: E1.attRows, title: E1.attTitle, recUU: E1.attRecordUU, uu: E1.uu, entries: (E1.entries || []).map((e) => e.name + ':' + e.sha256.slice(0, 12)) }],
    ['E1-defaults', 'the save rules give the new Request the type\'s default status (MStatus.getDefault), Processed N, Priority = PriorityUser 7, ConfidentialType A, SalesRep = parameter (MRequest.beforeSave :750-795)',
      Number(E1.r_status_id) === Number(statusOpen) && E1.processed === 'N' && E1.priority === '7' && E1.confidentialtype === 'A' && Number(E1.salesrep_id) === 101,
      { status: E1.r_status_id, want: statusOpen, processed: E1.processed, priority: E1.priority, conf: E1.confidentialtype, salesrep: E1.salesrep_id }],
    ['E4b-known-sender', 'a sender whose address is an AD_User of the client (UPPER(email) match, :399-426) gets that user and the user\'s BPartner (:433-438)',
      Number(E1.ad_user_id) === 1 && Number(E1.c_bpartner_id) === 1001, { user: E1.ad_user_id, bp: E1.c_bpartner_id }],
    ['E2-dedupe', 'the same Message-ID + Date again makes NO second Request (:289-318) and still counts as a Request-folder mail',
      E2.route === 'duplicate' && E2.folder === 'Request' && E2.docNoCount === 1 && E2.requestId === E1.requestId, { route: E2.route, docNoCount: E2.docNoCount, req: E2.requestId, e1: E1.requestId }],
    ['E3-reply', 'a "Re: <subject>" mail from the same sender answers the existing Request (:320-371): no new Request, and (RequestEventHandler :193-210) its Result moves to LastResult + a 2nd R_RequestUpdate, Result left empty',
      E3.route === 'update' && E3.requestId === E1.requestId && E3.docNoCount === 0 && E1.result == null && String(E1.lastResult).indexOf(reply) === 0 && (E1.updates || []).length === 2 && String((E1.updates || [])[1]).indexOf(reply) === 0 && String((E1.updates || [])[0]).indexOf('FROM: emp001@contoh.my\nTwo photos') === 0,
      { route: E3.route, req: E3.requestId, e1: E1.requestId, replyDocs: E3.docNoCount, result: E1.result, lastResult: String(E1.lastResult).slice(0, 80), updates: (E1.updates || []).map((u) => String(u).slice(0, 40)) }],
    ['E4-unknown-sender', 'an address no AD_User has falls back to the parameter user (:427-431); that user has no BPartner, so the parameter BPartner is used (:439-442)',
      E4.route === 'create' && Number(E4.ad_user_id) === 50001 && Number(E4.c_bpartner_id) === 118 && E4.summary === 'FROM: visitor@example.org\nWater leak near the lift lobby', { user: E4.ad_user_id, bp: E4.c_bpartner_id, summary: E4.summary }],
    ['E5-no-from', 'a mail without From goes to the Error route (checkEmailHeader :221-229) and writes nothing',
      E5.route === 'error' && E5.folder === 'Error' && E5.requestId == null && E5.docNoCount === 0, { route: E5.route, folder: E5.folder, req: E5.requestId }],
    ['E6-html-only', 'an HTML-only mail keeps legacy\'s text Result "FROM: <from>\\n" (:378-381, TODO in legacy) and attaches "<subject>.html" with the cid image embedded as a data: URI (H mode, :462-469 + embedImgToEmail :668-735); RFC 2047 subject decoded',
      E6.route === 'create' && E6.result === 'FROM: emp002@contoh.my\n' && E6.summary === 'FROM: emp002@contoh.my\nRetak dinding — Aras 3' && (E6.entries || []).length === 1 && !!ent(E6, 'Retak dinding — Aras 3.html')
        && String(ent(E6, 'Retak dinding — Aras 3.html').text).indexOf(' alt="inline_image_photo1@site" src="data:image/jpeg;base64,' + EXP['06_html_only.eml']['wall.jpg.base64'] + '"') > 0 && String(ent(E6, 'Retak dinding — Aras 3.html').text).indexOf('Retak pada dinding — lihat') > 0,
      { route: E6.route, result: E6.result, summary: E6.summary, entries: (E6.entries || []).map((e) => e.name + ' ' + e.size) }],
    ['E7-sitecam-guid', 'a Site Camera caption (viewer/sitecam.js:467) arrives in Result verbatim: "GUID: <id>" line intact, quoted-printable UTF-8 decoded, photo attached',
      E7.route === 'create' && String(E7.result).indexOf('\nGUID: 2O2Fr$t4X7Zf8NOew3FLOH\r\n') > 0 && String(E7.result).indexOf('Bearing: 45° NE') > 0 && String(E7.result).indexOf('https://maps.google.com/?q=3.13901,101.68685') > 0
        && !!ent(E7, 'BIM_Site_Clinic_2026-11-26-15-45-12.jpg') && ent(E7, 'BIM_Site_Clinic_2026-11-26-15-45-12.jpg').sha256 === EXP['07_sitecam_caption.eml']['BIM_Site_Clinic_2026-11-26-15-45-12.jpg'],
      { route: E7.route, result: String(E7.result).slice(0, 160), entries: (E7.entries || []).map((e) => e.name) }],
    ['RUN-counts', 'the run over the 7 mails makes exactly 4 Requests (01, 04, 06, 07) and counts Requests=6 Errors=1 as doIt :161-164 does',
      E1.newRequestsInRun === 4 && E1.runRequests === 6 && E1.runErrors === 1 && E1.runTotal === 7, { made: E1.newRequestsInRun, requests: E1.runRequests, errors: E1.runErrors, total: E1.runTotal }],
  ].map(([id, issue, ok, info]) => ({ id, issue, ok: !!ok, info }));
}

(async function () {
  const names = fs.existsSync(FIX) ? fs.readdirSync(FIX).filter((f) => /\.eml$/.test(f)) : [];
  if (names.length !== 7) { say('§WEMAILREQ-VERDICT INCONCLUSIVE fixture set has ' + names.length + ' .eml files, expected 7 (nothing judged)'); process.exit(3); }
  const real = await observe('real', null);
  const statusOpen = (real.k.q("SELECT s.r_status_id AS id FROM r_status s JOIN r_requesttype t ON t.r_statuscategory_id=s.r_statuscategory_id WHERE t.r_requesttype_id=101 AND s.isdefault='Y' ORDER BY s.seqno", [])[0] || {}).id;
  real.rows.forEach((r) => { say('§WEMAILREQ-ROW ' + r.name + ' route=' + r.route + ' folder=' + r.folder + ' request=' + r.requestId + ' docNoCount=' + r.docNoCount + ' entries=' + r.entries.map((e) => e.name).join('|') + ' updates=' + r.updates.length); r.log.forEach((l) => say('    ' + l)); });
  if (!real.rows.length) { say('§WEMAILREQ-VERDICT INCONCLUSIVE the run produced no results (nothing judged)'); process.exit(3); }
  const checks = judge(real.rows, statusOpen);
  checks.forEach((c) => say('§WEMAILREQ-CHECK ' + c.id + ' ' + (c.ok ? 'PASS' : 'FAIL') + ' issue="' + c.issue + '"' + (c.ok ? '' : ' got=' + JSON.stringify(c.info))));
  // MUTANT arm: the same mails with the dedupe query ignored. E2 must go red here, or this witness cannot see the defect it is about.
  const mut = await observe('mutant-noDedupe', { noDedupe: true });
  const mchecks = judge(mut.rows, statusOpen), mE2 = mchecks.find((c) => c.id === 'E2-dedupe'), mRed = mchecks.filter((c) => !c.ok).map((c) => c.id);
  say('§WEMAILREQ-MUTANT dedupe=off red=' + JSON.stringify(mRed) + ' E2=' + (mE2.ok ? 'PASS' : 'FAIL') + ' info=' + JSON.stringify(mE2.info));
  // the shared witness contract (witness_kit/contract.js): population = the real rows, invariants = the checks, redControl = the MUTANT run's rows (a real run, not a hand edit)
  const W = Witness('emailreq').population(() => real.rows)
    .schema({ type: 'object', required: ['name', 'route', 'folder', 'docNoCount', 'entries', 'updates'], properties: { route: { enum: ['create', 'duplicate', 'update', 'error'] }, folder: { enum: ['Request', 'Error'] }, docNoCount: { type: 'integer' } } });
  checks.forEach((c) => W.invariant(c.id + ' — ' + c.issue.slice(0, 90), (rows) => judge(rows, statusOpen).find((x) => x.id === c.id).ok));
  W.redControl(() => mut.rows);
  const res = W.run((l) => say('§WEMAILREQ-CONTRACT ' + l.trim()));
  const judged = checks.length, failed = checks.filter((c) => !c.ok).length;
  const mutantOk = !mE2.ok;
  say('§WEMAILREQ-CHECK MUTANT ' + (mutantOk ? 'PASS' : 'FAIL') + ' issue="with dedupe disabled the same mail makes a 2nd Request and E2 goes RED (the witness can see the defect)"');
  say('§WEMAILREQ-PARITY INCONCLUSIVE no legacy iDempiere oracle run this round (owner 2026-11-26: witness level only); these checks hold the port to the legacy lines it cites, not to a measured legacy run');
  const v = !judged ? 'INCONCLUSIVE' : (failed || !mutantOk || res.fail) ? 'FAIL' : 'PASS';
  say('§WEMAILREQ-VERDICT ' + v + ' judged=' + (judged + 1) + ' failed=' + (failed + (mutantOk ? 0 : 1)) + ' contract pass=' + res.pass + ' fail=' + res.fail + ' (parity: INCONCLUSIVE, no oracle)');
  process.exit(v === 'PASS' ? 0 : v === 'INCONCLUSIVE' ? 3 : 1);
})().catch((e) => { say('§WEMAILREQ-VERDICT FAIL threw ' + (e && e.stack || e)); process.exit(1); });
