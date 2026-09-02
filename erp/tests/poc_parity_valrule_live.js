// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for §P3 of bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md — W-PARITY-VALRULE.
//   THE ISSUE this test proves/disproves: "AD_Val_Rule is not wired into the live app at all" (§MEASURED) —
//     build/erp/ad_valrule.js was witnessed headless (W-VALRULE, 327/332 interpretable) but NO file in the
//     shipped erp/ consumed it, so the FK pickers built a plain SELECT over the target table and offered the
//     user rows iDempiere would never have shown. 61 displayed fields on the five document header tabs carry
//     an AD_Val_Rule_ID.
//   CLAIM: an FK picker on a column carrying an AD_Val_Rule_ID offers STRICTLY the rows the rule's
//     where-clause admits (MLookupFactory.java:122-125 — the rule's Code IS the lookup's ValidationCode),
//     asserted as before > after on NAMED real columns, plus a falsifier: a row the rule EXCLUDES is absent
//     from the picker AND is REJECTED on save.
//   ACT (GardenWorld). Every expected value is read from the seed through the app's own accessor
//     (window.__idmpDb) AT RUN TIME — no count, id or clause is typed into this file:
//     A · window 169 / tab 257 c_doctype_id — the ONE field-level rule on the five tabs, and it DISAGREES
//         with its column's (AD_Field_v: COALESCE(f.ad_val_rule_id, c.ad_val_rule_id) — field wins). Proves
//         the precedence, not just the filter.
//     B · window 143 / tab 186 c_bpartner_id — the flagship Sales Order lookup.
//     C · window 195 / tab 330 c_order_id    — the payment's order lookup.
//     D · window 143 / tab 186 c_bpartner_location_id — the TOKEN arm, @C_BPartner_ID@. With no BPartner
//         chosen the lookup offers NO ROWS (Env.java:1641-1645 empties the clause; MLookup.java:1128-1140
//         then CLEARS the lookup — iDempiere does not silently show all of them); choosing a BPartner
//         narrows it to exactly that partner's ship-to locations.
//     FALSIFIER · an id the rule excludes is absent from the options AND validateField → valrule:not-admitted,
//         with an admitted id passing as the control (so the check is not rejecting everything).
//     VACUITY · a rule that filters nothing proves nothing: any arm whose before == after is reported
//         INCONCLUSIVE, never PASS, and the known NO-BITE rules on these tabs are listed as such.
//   §-log first — READ tests/poc_parity_valrule_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_parity_valrule_live.js   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});
let pass = 0, fail = 0, inconclusive = 0;
const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };
// a vacuous population is NOT a pass (CLAUDE.md PRIMAL LAW §4) — it is its own verdict.
const inconc = (label, why) => { console.log('   ⬜ INCONCLUSIVE ' + label + ' — ' + why); inconclusive++; };

async function landed(page) {
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const okb = await page.$('#idmp-login-ok'); if (okb) await okb.click(); }
    await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  });
  await page.waitForTimeout(600);
}
async function clickNew(page) {
  await page.waitForSelector('#idmp-toolbar button[title^="New record"]', { timeout: 15000 });
  await page.click('#idmp-toolbar button[title^="New record"]');
  await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 10000 });
  await page.waitForTimeout(700);
}

// ── the ORACLE, read from the seed through the app's own accessor at run time ──────────────────────────────
// Returns the rule bound to <tab>.<col> exactly as AD_Field_v resolves it, the unfiltered row count of the
// lookup's target table, and — for a rule with no unresolved token left — the admitted id set. Token
// substitution here is a plain String.replace, deliberately NOT ad_valrule.substitute(), so the expectation
// is independent of the engine under test.
const seedRule = (page, tab, col, ctx) => page.evaluate(({ tab, col, ctx }) => {
  const q = (s) => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; };
  const vr = q("SELECT COALESCE(NULLIF(f.AD_Val_Rule_ID,''), c.AD_Val_Rule_ID), f.AD_Val_Rule_ID, c.AD_Val_Rule_ID" +
    " FROM AD_Field f JOIN AD_Column c ON f.AD_Column_ID=c.AD_Column_ID" +
    " WHERE f.AD_Tab_ID=" + tab + " AND lower(c.ColumnName)='" + col + "' AND f.IsActive='Y'");
  if (!vr.length || vr[0][0] == null) return { bound: false };
  const id = vr[0][0], fieldLevel = vr[0][1], colLevel = vr[0][2];
  const rr = q("SELECT name, code FROM ad_val_rule WHERE ad_val_rule_id=" + id);
  if (!rr.length) return { bound: false, id };
  const name = rr[0][0]; let code = String(rr[0][1] || '');
  const t = col.replace(/_id$/, ''), pk = t + '_id';
  let before = null; try { before = q('SELECT COUNT(*) FROM ' + t)[0][0]; } catch (e) {}
  let sub = code, unresolved = [];
  code.replace(/@([#$]?[A-Za-z0-9_]+)@/g, (whole, n) => {
    const k = Object.keys(ctx || {}).find(x => x.toLowerCase() === n.toLowerCase().replace(/^[#$]/, ''));
    if (k != null && ctx[k] != null && String(ctx[k]) !== '') sub = sub.split(whole).join(String(ctx[k]));
    else unresolved.push(n);
    return whole;
  });
  let admitted = null, err = null;
  if (!unresolved.length) {
    try { admitted = q('SELECT ' + pk + ' FROM ' + t + ' WHERE (' + sub + ')').map(r => String(r[0])); }
    catch (e) { err = String(e && e.message); }
  }
  const all = (() => { try { return q('SELECT ' + pk + ' FROM ' + t).map(r => String(r[0])); } catch (e) { return []; } })();
  return { bound: true, id, fieldLevel, colLevel, name, code, sub, unresolved, table: t, before, admitted, all, err };
}, { tab, col, ctx: ctx || {} });

// what the picker actually offers, and what the fold typed onto the field spec
const pickerState = (page, col) => page.evaluate((col) => {
  const el = document.querySelector('#idmp-inline-mount select[data-col="' + col + '"]');
  const e = window.__crud.formEntry(); const f = e && (e.fields || []).find(x => x.col === col);
  return {
    dom: el ? { tag: el.tagName, values: Array.from(el.options).map(o => o.value).filter(v => v !== ''),
                hasBlank: Array.from(el.options).some(o => o.value === ''), value: el.value, disabled: el.disabled } : null,
    spec: f ? { type: f.type, ref: f.ref, valruleid: f.valruleid == null ? null : Number(f.valruleid),
                required: !!f.required, admitted: f.admitted ? Object.keys(f.admitted).length : null } : null
  };
}, col);
const validateVal = (page, col, val) => page.evaluate(({ col, val }) => {
  const e = window.__crud.formEntry(); const f = e && (e.fields || []).find(x => x.col === col);
  return f ? window.__crud.core.validateField(window.__crud.store(), f, val, undefined, {}, {}) : 'no-field';
}, { col, val });

// one before/after arm. Reports INCONCLUSIVE (never PASS) when the rule admits everything.
async function arm(page, label, tab, col, ctx) {
  const exp = await seedRule(page, tab, col, ctx);
  const got = await pickerState(page, col);
  console.log('§PARITY-VALRULE[' + col + '] seed=' + JSON.stringify({ id: exp.id, name: exp.name, table: exp.table,
    before: exp.before, after: exp.admitted ? exp.admitted.length : null, unresolved: exp.unresolved, err: exp.err }) +
    ' dom=' + JSON.stringify(got.dom && { n: got.dom.values.length, blank: got.dom.hasBlank, value: got.dom.value }) +
    ' spec=' + JSON.stringify(got.spec));
  if (!exp.bound) { inconc(label, 'no AD_Val_Rule bound to ' + tab + '.' + col + ' in this seed — nothing to judge'); return null; }
  ok(label + ': the fold carried the rule onto the field spec (vr=' + exp.id + ')',
     !!got.spec && Number(got.spec.valruleid) === Number(exp.id), JSON.stringify(got.spec));
  if (exp.admitted == null) { inconc(label, 'expectation could not be computed (unresolved=' + JSON.stringify(exp.unresolved) + ' err=' + exp.err + ')'); return exp; }
  if (exp.before === exp.admitted.length) {
    inconc(label, 'rule ' + exp.id + ' admits every row (' + exp.before + '→' + exp.admitted.length + ') — a filter that filters nothing proves nothing');
    return exp;
  }
  ok(label + ': the picker NARROWED, before > after (' + exp.before + ' → ' + exp.admitted.length + ')',
     !!got.dom && got.dom.values.length === exp.admitted.length && got.dom.values.length < exp.before,
     'offered=' + (got.dom ? got.dom.values.length : 'absent') + ' expected=' + exp.admitted.length + ' unfiltered=' + exp.before);
  ok(label + ': the offered ids ARE the admitted set (exactly, not just the same count)',
     !!got.dom && JSON.stringify(got.dom.values.slice().sort()) === JSON.stringify(exp.admitted.slice().sort()));
  ok(label + ': a blank option is still offered (§IMPL F5 — an empty FK must never land on row 1)',
     !!got.dom && got.dom.hasBlank && got.dom.value === '', got.dom ? ('blank=' + got.dom.hasBlank + ' value="' + got.dom.value + '"') : 'absent');
  return exp;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  console.log('\n§PARITY-VALRULE ===== an FK picker offers strictly the rows its AD_Val_Rule admits (61 fields on the five document tabs) =====');
  const logs = [], errs = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  const vrLogs = () => logs.filter(l => /^§VALRULE col=/.test(l));

  // ══ B + D — window 143 / tab 186 (Sales Order) ═════════════════════════════════════════════════════════
  await page.goto(`http://localhost:${port}/idempiere.html?seed=ad_seed.db&login=GardenAdmin&window=143`, { waitUntil: 'networkidle' });
  await landed(page); await clickNew(page);

  const expB = await arm(page, 'B c_order.c_bpartner_id', 186, 'c_bpartner_id', {});

  // ── FALSIFIER — a row the rule EXCLUDES is absent from the picker AND rejected on save ────────────────
  if (expB && expB.admitted && expB.admitted.length && expB.admitted.length < expB.all.length) {
    const excluded = expB.all.find(id => expB.admitted.indexOf(id) < 0);
    const included = expB.admitted[0];
    const got = await pickerState(page, 'c_bpartner_id');
    const vBad = await validateVal(page, 'c_bpartner_id', excluded);
    const vGood = await validateVal(page, 'c_bpartner_id', included);
    console.log('§PARITY-VALRULE-FALSIFIER col=c_bpartner_id excluded=' + excluded + ' included=' + included +
      ' inOptions=' + (got.dom ? got.dom.values.indexOf(excluded) >= 0 : '?') + ' validate(excluded)=' + vBad + ' validate(included)=' + vGood);
    ok('FALSIFIER (i): the excluded C_BPartner ' + excluded + ' is ABSENT from the picker',
       !!got.dom && got.dom.values.indexOf(excluded) < 0);
    ok('FALSIFIER (ii): saving it is REJECTED → valrule:not-admitted', vBad === 'valrule:not-admitted', String(vBad));
    ok('FALSIFIER control: an ADMITTED id (' + included + ') still validates clean — the check is not rejecting everything',
       vGood === null, String(vGood));
  } else inconc('FALSIFIER', 'rule on c_bpartner_id excluded no row in this seed — nothing to be absent');

  // ── D — the TOKEN arm. No BPartner chosen ⇒ NO rows (E3), then choose one and re-narrow ───────────────
  const dCol = 'c_bpartner_location_id';
  const d0 = await pickerState(page, dCol);
  const dSeed0 = await seedRule(page, 186, dCol, {});
  console.log('§PARITY-VALRULE[' + dCol + '/unresolved] seed=' + JSON.stringify({ id: dSeed0.id, unresolved: dSeed0.unresolved, before: dSeed0.before }) +
    ' dom=' + JSON.stringify(d0.dom && { n: d0.dom.values.length, blank: d0.dom.hasBlank }) + ' spec=' + JSON.stringify(d0.spec));
  if (!dSeed0.bound || !dSeed0.unresolved.length) inconc('D ' + dCol + ' (unresolved arm)', 'the rule has no unresolved token on a New form — the E3 path is not exercised');
  else {
    ok('D (E3): with no BPartner chosen the token is unresolved and the lookup offers NO ROWS (MLookup.java:1128-1140), not all ' + dSeed0.before,
       !!d0.dom && d0.dom.values.length === 0, d0.dom ? ('offered=' + d0.dom.values.length + ' of ' + dSeed0.before) : 'absent');
    const l0 = vrLogs().find(l => new RegExp('col=' + dCol + ' ').test(l) && /unresolved=\[/.test(l));
    ok('D: the §VALRULE line NAMES the unresolved token rather than silently degrading', !!l0, l0 || 'no unresolved §VALRULE line for ' + dCol);
  }
  // pick a BPartner that actually HAS ship-to locations, then let the dependent lookup refresh
  const bpPick = await page.evaluate(() => {
    const q = (s) => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; };
    const el = document.querySelector('#idmp-inline-mount select[data-col="c_bpartner_id"]');
    if (!el) return null;
    const offered = Array.from(el.options).map(o => o.value).filter(v => v !== '');
    const withLoc = q("SELECT c_bpartner_id, COUNT(*) FROM c_bpartner_location WHERE isshipto='Y' AND isactive='Y' GROUP BY c_bpartner_id");
    const hit = withLoc.map(r => String(r[0])).find(id => offered.indexOf(id) >= 0);
    if (!hit) return null;
    el.value = hit; el.dispatchEvent(new Event('change', { bubbles: true }));
    return hit;
  });
  if (!bpPick) inconc('D ' + dCol + ' (resolved arm)', 'no offered C_BPartner in this seed has an active ship-to location');
  else {
    await page.waitForTimeout(500);
    const expD = await seedRule(page, 186, dCol, { C_BPartner_ID: bpPick });
    const gotD = await pickerState(page, dCol);
    console.log('§PARITY-VALRULE[' + dCol + '/resolved] bp=' + bpPick + ' seed=' + JSON.stringify({ id: expD.id, sub: expD.sub, after: expD.admitted && expD.admitted.length, before: expD.before }) +
      ' dom=' + JSON.stringify(gotD.dom && { n: gotD.dom.values.length, values: gotD.dom.values }));
    if (!expD.admitted) inconc('D ' + dCol + ' (resolved arm)', 'expectation not computable: err=' + expD.err);
    else if (expD.admitted.length === expD.before) inconc('D ' + dCol + ' (resolved arm)', 'this BPartner owns every location row (' + expD.before + ') — no narrowing to prove');
    else {
      ok('D: after choosing C_BPartner ' + bpPick + ' the dependent lookup re-narrows to exactly its ship-to locations (' + expD.before + ' → ' + expD.admitted.length + ')',
         !!gotD.dom && JSON.stringify(gotD.dom.values.slice().sort()) === JSON.stringify(expD.admitted.slice().sort()),
         'offered=' + (gotD.dom ? JSON.stringify(gotD.dom.values) : 'absent') + ' expected=' + JSON.stringify(expD.admitted));
      ok('D: the @token@ feed resolved from the RECORD under edit (ctx carries C_BPartner_ID=' + bpPick + ')',
         vrLogs().some(l => new RegExp('col=' + dCol + ' ').test(l) && l.indexOf('"C_BPartner_ID":"' + bpPick + '"') >= 0 || l.indexOf('"C_BPartner_ID":' + bpPick) >= 0),
         (vrLogs().filter(l => new RegExp('col=' + dCol + ' ').test(l)).pop() || 'no §VALRULE line'));
    }
  }

  // ══ A — window 169 / tab 257 (Shipment): the field-level rule must BEAT the column's ════════════════════
  await page.goto(`http://localhost:${port}/idempiere.html?seed=ad_seed.db&login=GardenAdmin&window=169`, { waitUntil: 'networkidle' });
  await landed(page); await clickNew(page);
  const expA = await arm(page, 'A m_inout.c_doctype_id', 257, 'c_doctype_id', {});
  if (expA && expA.bound) {
    ok('A (AD_Field_v precedence): the FIELD rule (' + expA.fieldLevel + ') was used, not the COLUMN rule (' + expA.colLevel + ')',
       expA.fieldLevel != null && String(expA.fieldLevel) !== '' && String(expA.id) === String(expA.fieldLevel) && String(expA.colLevel) !== String(expA.fieldLevel),
       'field=' + expA.fieldLevel + ' column=' + expA.colLevel + ' used=' + expA.id);
  }

  // ══ C — window 195 / tab 330 (Payment) ═════════════════════════════════════════════════════════════════
  await page.goto(`http://localhost:${port}/idempiere.html?seed=ad_seed.db&login=GardenAdmin&window=195`, { waitUntil: 'networkidle' });
  await landed(page); await clickNew(page);
  await arm(page, 'C c_payment.c_order_id', 330, 'c_order_id', {});

  // ══ VACUITY ledger — the rules that do NOT bite are reported, never counted as passes ═══════════════════
  const noBite = vrLogs().filter(l => {
    const b = /before=(\d+)/.exec(l), a = /after=(\d+)/.exec(l);
    return b && a && /verdict=applied/.test(l) && b[1] === a[1];
  });
  const bite = vrLogs().filter(l => {
    const b = /before=(\d+)/.exec(l), a = /after=(\d+)/.exec(l);
    return b && a && /verdict=applied/.test(l) && Number(a[1]) < Number(b[1]);
  });
  console.log('\n§PARITY-VALRULE-VACUITY applied=' + (noBite.length + bite.length) + ' BITE=' + bite.length + ' NO-BITE=' + noBite.length +
    ' (a NO-BITE rule is reported, never counted as a pass)');
  noBite.forEach(l => console.log('   ⬜ NO-BITE ' + /col=(\S+) vr=(\S+)/.exec(l).slice(1, 3).join(' vr=') + ' — ' + /before=\d+ after=\d+/.exec(l)[0]));
  console.log('§PARITY-VALRULE-DEGRADED ' + vrLogs().filter(l => !/verdict=(applied|unresolved-tokens)/.test(l)).length +
    ' field(s) fell back to the UNFILTERED picker and said so (our interpreter\'s limit, not iDempiere\'s verdict):');
  vrLogs().filter(l => !/verdict=(applied|unresolved-tokens)/.test(l)).slice(0, 8)
    .forEach(l => console.log('   ⬜ ' + /col=\S+/.exec(l)[0] + ' ' + /verdict=\S+/.exec(l)[0]));

  ok('the wiring is LIVE on real document tabs (≥8 §VALRULE lines emitted)', vrLogs().length >= 8, String(vrLogs().length));
  ok('at least one rule genuinely BITES (a filter that filters nothing would prove nothing)', bite.length >= 1, 'biting=' + bite.length);
  ok('0 pageerrors across the run', errs.length === 0, errs.slice(0, 3).join(' | '));
  await page.close();

  const verdict = (fail === 0)
    ? 'CRITIC ✔ AD_Val_Rule is wired: an FK picker on a val-rule column offers exactly the admitted rows (counts and id SETS asserted against the seed at run time), the AD_Field rule beats the AD_Column rule, an unresolved @token@ clears the lookup as MLookup does, and an excluded row is both absent from the picker and rejected on save.'
    : 'CRITIC ✘ the picker still offers rows the rule excludes, or the falsifier did not fire — see the 🔴 above.';
  console.log('\n§PARITY-VALRULE-VERDICT ' + verdict);
  console.log((fail === 0 ? '✅' : '❌') + ' W-PARITY-VALRULE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL, ' + inconclusive + ' INCONCLUSIVE)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (x) {} process.exit(1); });
