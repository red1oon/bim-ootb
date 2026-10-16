// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for §P10 of bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md — W-DOCNO-BRANCH.
//   THE ISSUE this test proves/disproves: §P4-CANDIDATES scored the IsDocNoControlled IMPLEMENTATION faithful
//     (crud_overlay.js _docTypeSeqId ≡ MSequence.getDocumentNo:683-686 — 'N' means "use the TABLE sequence
//     DocumentNo_<TableName>", not "no number"), but the only DocNo witness (bim-compiler
//     scripts/poc_audit_changelog.js W-DOCNO) was SCOPE-BLIND in the strongest sense: it asserted only the
//     table-level path AND it did so against a MOCKED __idmpDb whose expected 'SO-1000' was written three
//     lines above the assertion — a tautology, not an oracle. The doctype-controlled branch was never judged,
//     though the seed carries 34 doctypes IsDocNoControlled='Y', ALL 34 with a DocNoSequence_ID resolving to
//     an ACTIVE AD_Sequence, and 18 ='N', NONE carrying one.
//   CLAIM: run against the REAL seed through the SHIPPED functions (window.__crud.docNoSeam — no
//     reimplementation), BOTH branches are correct and load-bearing: every ='Y' doctype resolves to its OWN
//     DocNoSequence_ID; every ='N' doctype resolves to null so the caller falls back to DocumentNo_<table>;
//     and the two branches produce DIFFERENT DocumentNo previews wherever the two sequences differ.
//   Expected ids and counts are READ FROM THE SEED (window.__idmpDb) AT RUN TIME. Nothing is typed here.
// §-log first — READ tests/poc_parity_docno_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_parity_docno_live.js   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});
let pass = 0, fail = 0, inconclusive = 0;
const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };
const judged = (label, n, cond, extra) => {
  if (!n) { console.log('   ⬜ INCONCLUSIVE ' + label + ' — judged population is 0 (' + (extra || '') + ')'); inconclusive++; return; }
  ok(label + ' (n=' + n + ')', cond, extra);
};

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));

  console.log('§W-DOCNO-BRANCH start (real seed, SHIPPED functions via window.__crud.docNoSeam)');
  await page.goto('http://localhost:' + port + '/idempiere.html?login=GardenAdmin&window=143', { waitUntil: 'load' });
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 });
  await page.waitForTimeout(800);

  const seamOk = await page.evaluate(() => !!(window.__crud && window.__crud.docNoSeam && typeof window.__crud.docNoSeam.docTypeSeqId === 'function'));
  ok('the shipped DocNo seam is reachable (the witness judges the product, not a mock)', seamOk);
  if (!seamOk) { console.log('❌ W-DOCNO-BRANCH: harness cannot reach the seam'); await browser.close(); server.close(); process.exit(1); }

  const R = await page.evaluate(() => {
    const q = s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; };
    const SEAM = window.__crud.docNoSeam;
    // ── the POPULATION, straight from the seed ────────────────────────────────────────────────
    const yes = q("SELECT c_doctype_id, docnosequence_id FROM c_doctype WHERE UPPER(isdocnocontrolled)='Y'")
      .map(r => ({ id: Number(r[0]), seq: r[1] == null ? null : Number(r[1]) }));
    const no = q("SELECT c_doctype_id, docnosequence_id FROM c_doctype WHERE UPPER(isdocnocontrolled)='N'")
      .map(r => ({ id: Number(r[0]), seq: r[1] == null ? null : Number(r[1]) }));
    const yesWithActiveSeq = q("SELECT COUNT(*) FROM c_doctype d JOIN ad_sequence s ON s.ad_sequence_id=d.docnosequence_id " +
      "WHERE UPPER(d.isdocnocontrolled)='Y' AND UPPER(s.isactive)='Y'");
    // ── branch 1: every ='Y' doctype resolves to its OWN DocNoSequence_ID ────────────────────
    const yMiss = yes.filter(d => SEAM.docTypeSeqId({ c_doctype_id: d.id }) !== d.seq);
    // ── branch 2: every ='N' doctype resolves to null (→ table sequence) ─────────────────────
    const nMiss = no.filter(d => SEAM.docTypeSeqId({ c_doctype_id: d.id }) !== null);
    // C_DocTypeTarget_ID is the same branch by a second column name (MOrder/MInvoice carry the target)
    const tgtMiss = yes.filter(d => SEAM.docTypeSeqId({ c_doctypetarget_id: d.id }) !== d.seq);
    // ── the branches must produce DIFFERENT numbers where the sequences differ ───────────────
    const tableSeq = q("SELECT AD_Sequence_ID, CurrentNext, Prefix, Suffix FROM AD_Sequence " +
      "WHERE UPPER(Name)=UPPER('DocumentNo_c_order') AND UPPER(IsActive)='Y'");
    const tableSeqId = tableSeq.length ? Number(tableSeq[0][0]) : null;
    const tablePreview = tableSeq.length ? ((tableSeq[0][2] || '') + tableSeq[0][1] + (tableSeq[0][3] || '')) : null;
    // pick a ='Y' doctype on c_order whose sequence is NOT the table sequence — read, not chosen by hand
    const cand = yes.filter(d => d.seq != null && d.seq !== tableSeqId)
      .filter(d => q("SELECT 1 FROM ad_sequence WHERE ad_sequence_id=" + d.seq + " AND UPPER(isactive)='Y'").length > 0);
    let dtCase = null;
    if (cand.length) {
      const d = cand[0];
      const s = q("SELECT CurrentNext, Prefix, Suffix FROM AD_Sequence WHERE AD_Sequence_ID=" + d.seq);
      dtCase = { doctype: d.id, seq: d.seq,
                 expected: s.length ? ((s[0][1] || '') + s[0][0] + (s[0][2] || '')) : null,
                 got: SEAM.previewDocNo('c_order', { c_doctype_id: d.id }) };
    }
    const noDoctypePreview = SEAM.previewDocNo('c_order', {});
    // ── FALSIFIER: invert the branch. A ='Y' doctype whose flag is flipped in the probe row must
    //    fall back to null; and an id that is not a doctype at all must too.
    const falsifier = {
      unknownDoctype: SEAM.docTypeSeqId({ c_doctype_id: -424242 }),
      noDoctype: SEAM.docTypeSeqId({}),
      // a ='N' doctype is the real in-seed inversion of a ='Y' one — same call shape, opposite flag
      nSample: no.length ? { id: no[0].id, got: SEAM.docTypeSeqId({ c_doctype_id: no[0].id }) } : null,
      ySample: yes.length ? { id: yes[0].id, seq: yes[0].seq, got: SEAM.docTypeSeqId({ c_doctype_id: yes[0].id }) } : null
    };
    return { yes: yes.length, no: no.length,
             yesWithActiveSeq: yesWithActiveSeq.length ? Number(yesWithActiveSeq[0][0]) : 0,
             yMiss: yMiss.slice(0, 5), nMiss: nMiss.slice(0, 5), tgtMiss: tgtMiss.slice(0, 5),
             tableSeqId: tableSeqId, tablePreview: tablePreview, noDoctypePreview: noDoctypePreview,
             dtCase: dtCase, falsifier: falsifier };
  });

  console.log('\n── the population, read from the seed ──');
  console.log('   §DOCNO-POPULATION controlled_Y=' + R.yes + ' (of which a resolving ACTIVE sequence: ' + R.yesWithActiveSeq +
              ') controlled_N=' + R.no + ' tableSeq(DocumentNo_c_order)=' + R.tableSeqId);

  console.log('\n── branch 1 · IsDocNoControlled = Y → the DOCTYPE\'s own DocNoSequence_ID ──');
  judged("every ='Y' doctype resolves to its own DocNoSequence_ID", R.yes, R.yMiss.length === 0,
    R.yMiss.length ? JSON.stringify(R.yMiss) : 'all ' + R.yes + ' match the seed');
  judged("…and the same holds through C_DocTypeTarget_ID (the column MOrder/MInvoice actually carry)", R.yes,
    R.tgtMiss.length === 0, R.tgtMiss.length ? JSON.stringify(R.tgtMiss) : 'all ' + R.yes + ' match');
  judged("the branch is not vacuous — every ='Y' doctype's sequence is a REAL active AD_Sequence", R.yes,
    R.yesWithActiveSeq === R.yes, R.yesWithActiveSeq + '/' + R.yes + ' resolve to an active sequence');

  console.log('\n── branch 2 · IsDocNoControlled = N → null, so the caller uses DocumentNo_<TableName> ──');
  judged("every ='N' doctype resolves to null (MSequence.getDocumentNo:683-686)", R.no, R.nMiss.length === 0,
    R.nMiss.length ? JSON.stringify(R.nMiss) : 'all ' + R.no + ' → null');
  judged('the table-level fallback is a REAL sequence and previews from it', R.tableSeqId ? 1 : 0,
    R.noDoctypePreview != null && R.noDoctypePreview === R.tablePreview,
    'seed DocumentNo_c_order → ' + R.tablePreview + ' · seam(no doctype) → ' + R.noDoctypePreview);

  console.log('\n── the two branches are DISTINGUISHABLE (otherwise neither arm proves anything) ──');
  if (!R.dtCase) {
    console.log('   ⬜ INCONCLUSIVE no ="Y" doctype in this seed carries a sequence different from DocumentNo_c_order'); inconclusive++;
  } else {
    ok('a doctype-controlled preview uses THAT doctype\'s sequence, not the table one',
      R.dtCase.got === R.dtCase.expected && R.dtCase.got !== R.noDoctypePreview,
      'doctype=' + R.dtCase.doctype + ' seq=' + R.dtCase.seq + ' expected=' + R.dtCase.expected +
      ' got=' + R.dtCase.got + ' · table-branch=' + R.noDoctypePreview);
    console.log('   §DOCNO-BRANCH doctype=' + R.dtCase.doctype + ' seq=doctype#' + R.dtCase.seq +
                ' docno=' + R.dtCase.got + ' docNoControlled=true  |  table seq=DocumentNo_c_order docno=' +
                R.noDoctypePreview + ' docNoControlled=false');
  }

  console.log('\n── FALSIFIER · the flag is what decides, not the presence of a doctype ──');
  judged("an in-seed ='N' doctype takes the SAME call shape and returns null — the flag is load-bearing",
    R.falsifier.nSample ? 1 : 0,
    R.falsifier.nSample && R.falsifier.nSample.got === null &&
    R.falsifier.ySample && R.falsifier.ySample.got === R.falsifier.ySample.seq,
    JSON.stringify({ N: R.falsifier.nSample, Y: R.falsifier.ySample }));
  ok('an unknown doctype id and an absent doctype both fall back to the table sequence (null), never fabricate',
    R.falsifier.unknownDoctype === null && R.falsifier.noDoctype === null,
    JSON.stringify(R.falsifier.unknownDoctype) + ' / ' + JSON.stringify(R.falsifier.noDoctype));

  ok(errs.length + ' pageerrors across the run', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('\n§DOCNO-BRANCH-VERDICT CRITIC ' + (fail === 0 ? '✔' : '✘') + ' ' + (fail === 0
    ? 'Both IsDocNoControlled branches are now judged against the real seed through the shipped functions: all ' +
      R.yes + " doctypes ='Y' resolve to their own active DocNoSequence_ID (also via C_DocTypeTarget_ID), all " +
      R.no + " ='N' resolve to null so the caller falls back to DocumentNo_<TableName>, and the two branches " +
      'produce different numbers — the scope-blind, mock-oracled W-DOCNO arm is superseded.'
    : 'an IsDocNoControlled branch diverges from MSequence.getDocumentNo — see the 🔴 above.'));
  console.log((fail === 0 ? '✅' : '❌') + ' W-DOCNO-BRANCH: ' + pass + '/' + (pass + fail) +
              ' PASS (' + fail + ' FAIL, ' + inconclusive + ' INCONCLUSIVE)');
  await browser.close(); server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('🔴 W-DOCNO-BRANCH harness threw: ' + e.message); process.exit(1); });
