// capex/tests/witness_dash_fx.js — W-DASH-FX (spec: prompts/CAPEX_DASHBOARD.md "2026-11-25 SPEC — the dashboard shows a foreign currency's sum with its conversion in brackets"). Node only, pure.
// ISSUES IT PROVES OR DISPROVES (each named on its line):
//   I1 "a BDT project on a USD-accounting client shows BDT alone, so a USD reader cannot size it" -> the pick finds the BDT->USD row and converts 15,342,507.96847 BDT to USD 127,854.23 (shown 127,854).
//   I2 "the pick is not iDempiere's" -> default conversion type, date window, client/org order, IsActive, direct row only (MConversionType.getDefault :53-72, MConversionRate.getRate :229-246).
//   I3 "a missing rate is hidden or guessed" -> no row = NO_CONV_RATE (no figure); no accounting schema = NO_ACCT; a source without the four entities = NO_SOURCE.
//   I4 "the accounting currency is converted too" -> identity, status 'acct'.
// Expected numbers are written by hand (15342507.96847 / 120), not read back from the code. BREAK=1 uses rate x1 (identity) and must FAIL.
// §-lines: §W_DASHFX_ASSERT PASS|FAIL <claim>; verdict §W_DASHFX_VERDICT (INCONCLUSIVE when nothing was judged).
'use strict';
const T = require('../tiles.js');
let fails = 0, judged = 0;
const check = (n, ok, d) => { judged++; if (!ok) fails++; console.log('§W_DASHFX_ASSERT ' + (ok ? 'PASS' : 'FAIL') + ' ' + n + (d ? ' ' + d : '')); };
const BREAK = process.env.BREAK === '1';
const USD = 100, EUR = 102, BDT = 322, SPOT = 114, PERIOD = 115;
const cur = [{ C_Currency_ID: USD, ISO_Code: 'USD', StdPrecision: 2 }, { C_Currency_ID: EUR, ISO_Code: 'EUR', StdPrecision: 2 }, { C_Currency_ID: BDT, ISO_Code: 'BDT', StdPrecision: 2 }];
const row = (id, from, to, mul, o) => Object.assign({ C_Conversion_Rate_ID: id, AD_Client_ID: 11, AD_Org_ID: 0, C_Currency_ID: from, C_Currency_ID_To: to, C_ConversionType_ID: SPOT, MultiplyRate: mul, DivideRate: 1 / mul, ValidFrom: '2000-01-01 00:00:00', ValidTo: '2056-01-29 00:00:00', IsActive: 'Y' }, o || {});
// GardenWorld as it is: USD<->EUR 135/136 (active), 137/138 (inactive, the older pair), Spot default (client 0), primary schema 101 = USD
const base = () => ({ currencies: cur, meta: { client: 11, org: 11 }, unavailable: [],
  rates: [row(135, USD, EUR, 0.85), row(136, EUR, USD, 1.17647058823529), row(137, USD, EUR, 0.8006405124, { IsActive: 'N', ValidFrom: '2003-12-29 00:00:00' }), row(138, EUR, USD, 1.249, { IsActive: 'N', ValidFrom: '2003-12-29 00:00:00' })],
  convtypes: [{ C_ConversionType_ID: PERIOD, AD_Client_ID: 0, IsDefault: 'N', IsActive: 'Y' }, { C_ConversionType_ID: SPOT, AD_Client_ID: 0, IsDefault: 'Y', IsActive: 'Y' }],
  acctschemas: [{ C_AcctSchema_ID: 101, AD_Client_ID: 11, C_Currency_ID: USD }, { C_AcctSchema_ID: 200000, AD_Client_ID: 11, C_Currency_ID: EUR }],
  clientinfo: [{ AD_Client_ID: 11, C_AcctSchema1_ID: 101 }] });
const withBdt = d => { d.rates.push(row(990100, BDT, USD, BREAK ? 1 : 1 / 120), row(990101, USD, BDT, 120)); return d; };
const TODAY = '2026-11-25', SHED_CENTS = 1534250797;   // SHED PlannedAmt 15342507.96847, summed once = 1,534,250,797 cents (tiles.js sum-once)

// I1 the Bangladesh case
let f = T.fx(withBdt(base()), TODAY), r = f.of(BDT), c = f.convert(SHED_CENTS, BDT);
check('I1 accounting currency of client 11 = USD (schema 101 via AD_ClientInfo.C_AcctSchema1_ID, not the Euro schema 200000)', f.acct === '100', 'acct=' + f.acct);
check('I1 default conversion type = Spot 114 (IsDefault=Y, client 0)', f.type === '114', 'type=' + f.type);
check('I1 BDT -> USD found: status rate, row 990100', r.status === 'rate' && r.row === 990100, JSON.stringify(r));
check('I1 15,342,507.96847 BDT -> USD 127,854.23 (12785423 cents; hand: 15342507.96847 / 120 = 127854.2330)', c === 12785423, 'cents=' + c);
// shown the way dash.js shows it (whole units, half away from zero): 127,854
const whole = x => Math.sign(x) * Math.floor(Math.abs(x) / 100 + 0.5);
check('I1 the bracket reads 127,854 (as B3.1)', whole(c) === 127854, 'whole=' + whole(c));
// I4 identity
check('I4 USD sum is not converted: status acct, cents unchanged', f.of(USD).status === 'acct' && f.convert(36610562, USD) === 36610562);
// I2 the pick
let d = withBdt(base()); d.rates.push(row(990102, BDT, USD, 1 / 100, { AD_Client_ID: 0, AD_Org_ID: 0 }));
check('I2 a client-11 row beats a system (client 0) row (ORDER BY AD_Client_ID DESC)', T.fx(d, TODAY).of(BDT).row === 990100);
d = withBdt(base()); d.rates.push(row(990102, BDT, USD, 1 / 110, { AD_Org_ID: 11 }));
check('I2 an org-11 row beats the org-0 row for the org-11 login (ORDER BY AD_Org_ID DESC)', T.fx(d, TODAY).of(BDT).row === 990102);
d = withBdt(base()); d.meta.org = 12;
d.rates.push(row(990102, BDT, USD, 1 / 110, { AD_Org_ID: 11 }));
check('I2 an org-11 row is not used by an org-12 login (AD_Org_ID IN (0,org))', T.fx(d, TODAY).of(BDT).row === 990100);
d = withBdt(base()); d.rates.find(x => x.C_Conversion_Rate_ID === 990100).IsActive = 'N';
check('I2 an inactive row is skipped -> NO_CONV_RATE', T.fx(d, TODAY).of(BDT).status === 'NO_CONV_RATE');
d = withBdt(base()); d.rates.find(x => x.C_Conversion_Rate_ID === 990100).ValidTo = '2026-11-24 00:00:00';
check('I2 a row that ended yesterday is not valid today (? BETWEEN ValidFrom AND ValidTo)', T.fx(d, TODAY).of(BDT).status === 'NO_CONV_RATE');
check('I2 ...and is valid on its last day', T.fx(d, '2026-11-24').of(BDT).status === 'rate');
d = withBdt(base()); d.rates.find(x => x.C_Conversion_Rate_ID === 990100).C_ConversionType_ID = PERIOD;
check('I2 a row of a non-default type (Period End 115) is not used (type 0 -> default)', T.fx(d, TODAY).of(BDT).status === 'NO_CONV_RATE');
d = base(); d.rates.push(row(990101, USD, BDT, 120));
check('I2 only the reverse row exists: iDempiere does not invert, BDT -> USD is NO_CONV_RATE', T.fx(d, TODAY).of(BDT).status === 'NO_CONV_RATE');
check('I2 EUR -> USD uses the active 136 (1.17647...), not the inactive 138', T.fx(base(), TODAY).of(EUR).row === 136);
// I3 falsifiers
r = T.fx(base(), TODAY).of(BDT);
check('I3 FALSIFIER no BDT row at all: NO_CONV_RATE, no rate, no figure', r.status === 'NO_CONV_RATE' && r.rate == null && T.fx(base(), TODAY).convert(SHED_CENTS, BDT) === null, JSON.stringify(r));
d = withBdt(base()); d.clientinfo = []; d.meta = { client: 11 };
check('I3 no AD_ClientInfo row for the client: NO_ACCT', T.fx(d, TODAY).of(BDT).status === 'NO_ACCT');
d = withBdt(base()); d.unavailable = ['rates', 'convtypes', 'acctschemas', 'clientinfo']; d.rates = d.convtypes = d.acctschemas = d.clientinfo = [];
r = T.fx(d, TODAY).of(BDT); check('I3 a server without the four read types: NO_SOURCE', r.status === 'NO_SOURCE' && T.fx(d, TODAY).convert(SHED_CENTS, BDT) === null);
d = withBdt(base()); delete d.convtypes;
check('I3 one entity absent (not unavailable-listed): NO_SOURCE, naming it', T.fx(d, TODAY).of(BDT).status === 'NO_SOURCE' && T.fx(d, TODAY).missing.join() === 'convtypes');
// the Kernel store has no meta.client: its single client row names it
d = withBdt(base()); d.meta = {};
check('I1 Kernel shape (no meta.client): the one client row of AD_ClientInfo names the client, same answer', T.fx(d, TODAY).convert(SHED_CENTS, BDT) === 12785423);
d = withBdt(base()); d.meta = {}; d.clientinfo.push({ AD_Client_ID: 12, C_AcctSchema1_ID: 101 });
check('I3 two clients and no named login: NO_ACCT (never a guess)', T.fx(d, TODAY).of(BDT).status === 'NO_ACCT');
// a negative sum rounds half away from zero, the target's precision (2) holds
check('I1 negative sum rounds symmetric to the positive (half away from zero)', T.fx(withBdt(base()), TODAY).convert(-1534250797, BDT) === -12785423);
const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
console.log('§W_DASHFX_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + (BREAK ? ' (BREAK=1 — must be FAIL)' : ''));
process.exit(v === 'PASS' ? 0 : 1);
