// capex/tests/_setup_gate.js — §5.46: a witness that needs the legacy TEST instance (idempiere_bimdoc) refuses to run on one that was refreshed away.
// The cause (F6): common/door/tests/witness_legacy_plugin.js calls legacy.refresh, which drops and rebuilds idempiere_bimdoc from the base seed by design.
const { spawnSync } = require('child_process'), path = require('path');
module.exports = function gate(verdictTag) {
  const r = spawnSync('bash', [path.join(__dirname, '..', 'legacy', 'test_instance', 'setup_test_instance.sh'), '--check'], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || ''); console.log(out.trim());
  if (r.status !== 0) { console.log(verdictTag + ' INCONCLUSIVE test instance not prepared (refreshed away?): run capex/legacy/test_instance/setup_test_instance.sh, restart ~/idempiere-bimdoc, rerun'); process.exit(2); }
};
