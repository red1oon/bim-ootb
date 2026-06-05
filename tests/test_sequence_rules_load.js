// Proves: rates.js loadSequenceRules() fetches rates/sequence_rules.json, applies
// it IN PLACE over the hardcoded fallback, and leaves no global undefined.
// Issue under test: "sequence rules unified into one JSON source (no drift,
// fallback intact)" — §RATES_JSON must report loaded=json with the JSON's counts,
// and the applied SEQUENCE_RULES must EQUAL the shipped JSON (faithful unify).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', 'viewer');
const ratesSrc = fs.readFileSync(path.join(root, 'rates.js'), 'utf8');
const seqJson = JSON.parse(fs.readFileSync(path.join(root, 'rates', 'sequence_rules.json'), 'utf8'));

let logs = [];
const sandbox = {
  window: {}, localStorage: { getItem: () => null },
  console: { log: m => logs.push(m), warn: m => logs.push(m) },
  fetch: (url) => Promise.resolve({
    ok: url.indexOf('sequence_rules.json') > -1,
    status: 200,
    json: () => Promise.resolve(seqJson),
  }),
  URLSearchParams: URLSearchParams,
};
vm.createContext(sandbox);
vm.runInContext(ratesSrc, sandbox);

(async () => {
  let fail = 0;
  const ok = await vm.runInContext('loadSequenceRules()', sandbox);
  const applied = vm.runInContext('SEQUENCE_RULES', sandbox);
  const labor = vm.runInContext('LABOR_RATES', sandbox);
  const def = vm.runInContext('SEQUENCE_DEFAULT', sandbox);

  const jsonRuleCount = Object.keys(seqJson.SEQUENCE_RULES).length;
  const appliedRuleCount = Object.keys(applied).length;

  function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fail++; }

  check('§RATES_JSON line fired', logs.some(l => /§RATES_JSON loaded=json/.test(l)));
  check('loader returned true (applied, not fallback)', ok === true);
  check(`SEQUENCE_RULES applied = JSON (${appliedRuleCount} >= ${jsonRuleCount})`, appliedRuleCount >= jsonRuleCount);
  // Faithful unify: every JSON rule landed verbatim onto the global.
  check('every JSON rule applied verbatim (no drift)',
    Object.keys(seqJson.SEQUENCE_RULES).every(k =>
      applied[k] && applied[k].phase === seqJson.SEQUENCE_RULES[k].phase &&
      applied[k].sequence === seqJson.SEQUENCE_RULES[k].sequence));
  check('LABOR_RATES present (no global left undefined)', labor && Object.keys(labor).length > 0);
  check('SEQUENCE_DEFAULT present', def && typeof def.phase === 'string');

  console.log('\n§RATES_JSON witness:', logs.find(l => /§RATES_JSON/.test(l)));
  console.log(fail === 0 ? '\n✅ ALL PASS' : `\n❌ ${fail} FAILED`);
  process.exit(fail === 0 ? 0 : 1);
})();
