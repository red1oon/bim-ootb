#!/usr/bin/env bash
# ⚠ DO NOT REMOVE — R9 (prompts/MIGRATE_INSTALL_TENANT.md): ONE command, one line per migration-lane witness.
# Logs: /tmp/count_logs/mig_<name>.log . READ THE LOG — the exit code is not evidence.
# Per witness: exit code + last verdict line + judged count. A witness whose log has no verdict line, judged=0,
# or only INCONCLUSIVE is shown as NOJUDGE (never PASS). SLOW=1 adds the 2.5-min iDempiere falsifier and the ~5-min live-page migration_journey.
cd "$(dirname "$0")"; mkdir -p /tmp/count_logs
W="migrate_engine open_balances already_there plugin_role_access sap_migrate bc_migrate odoo_form odoo_messy
   import_product import_invoice import_payment import_order import_gljournal import_inventory import_bankstatement
   bankstatement post_bankstatement sapbc_open seed_patch_idempotent idempiere_open migration_recover release_pane_dismiss migration_trade"
[ "${SLOW:-0}" = 1 ] && W="$W idempiere_falsifier migration_journey"   # migration_journey: live page, headless Chromium, ~5 min (R1/R2)
bad=0
for w in $W; do
  f=witness_$w.js; log=/tmp/count_logs/mig_$w.log
  [ -f "$f" ] || { printf '%-24s MISSING %s\n' "$w" "$f"; bad=1; continue; }
  t0=$(date +%s); timeout 600 node "$f" >"$log" 2>&1; rc=$?; dt=$(( $(date +%s)-t0 ))
  v=$(grep -E "VERDICT|RESULT|verdict=|-SUMMARY|-ALL" "$log" | tail -1 | cut -c1-110)
  j=$(echo "$v" | grep -oE 'judged=[0-9]+' | head -1)
  st=PASS
  if [ $rc -ne 0 ] || echo "$v" | grep -qE 'verdict=FAIL|VERDICT FAIL|fail(ed)?=[1-9]'; then st=FAIL
  elif [ -z "$v" ] || [ "$j" = "judged=0" ] || ! echo "$v" | grep -q PASS; then st=NOJUDGE; fi
  [ $st = PASS ] || bad=1
  printf '%-24s %-8s rc=%s %3ss %s\n' "$w" "$st" "$rc" "$dt" "$v"
done
exit $bad
