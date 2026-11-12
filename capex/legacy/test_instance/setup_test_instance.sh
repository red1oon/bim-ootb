#!/usr/bin/env bash
# ⚠ DO NOT REMOVE — spec prompts/CAPEX_DASHBOARD.md §5.46 (F6/F7). READ THE LOG: the verdict is the last line, §SETUP_VERDICT.
# Re-applies everything the CAPEX witnesses and the sequel film need to a FRESH test DB (base seed + BIM Document plugin): the CAPEX migrations, the pilot-remapped
# web-service types (copytypes.py reads them from idempiere_pilot, ids shifted so they cannot collide), the BIM Document and Q4 read types, then update_sequences().
# Usage: setup_test_instance.sh [--check]   (DB = $DB, default idempiere_bimdoc). --check applies nothing and only prints the verdict. A film/witness must refuse to run on §SETUP_VERDICT FAIL.
set -u; DB=${DB:-idempiere_bimdoc}; HERE=$(cd "$(dirname "$0")" && pwd); L=$(dirname "$HERE"); P=postgresql
psqlq(){ docker exec -i postgres psql -U adempiere -d "$DB" -qtA "$@"; }
run(){ docker exec -i postgres psql -U adempiere -d "$DB" -v ON_ERROR_STOP=1 -qtA -c "set search_path=adempiere" -f - 2>&1 | grep -E "ERROR|DETAIL" | head -3; }
seqs(){ psqlq -c "set search_path=adempiere; select update_sequences()" >/dev/null; }
verdict(){ local miss=0 t
  for t in QueryBIMDocument QueryCOrder QueryCProjectIssue BridgeCreateOrder BridgeCreateProjectIssue BridgeCreateCProject; do
    n=$(psqlq -c "set search_path=adempiere; select count(*) from ws_webservicetype where value='$t'" | tail -1); [ "$n" = 1 ] || { echo "  §SETUP missing WS type $t (count=$n)"; miss=$((miss+1)); }; done
  for m in 1000023 1000024 1000040 1000041 1000042; do
    n=$(psqlq -c "set search_path=adempiere; select count(*) from pa_measure where pa_measure_id=$m" | tail -1); [ "$n" = 1 ] || { echo "  §SETUP missing PA measure $m"; miss=$((miss+1)); }; done
  n=$(psqlq -c "set search_path=adempiere; select count(*) from pa_measurecalc where pa_measurecalc_id=1000023 and whereclause like '%IsComplete=''N''%'" | tail -1); [ "$n" = 1 ] || { echo "  §SETUP Health Green lacks the §5.44 overdue test"; miss=$((miss+1)); }
  n=$(psqlq -c "set search_path=adempiere; select count(*) from pa_measurecalc where pa_measurecalc_id=1000042 and selectclause like '%* 1.0 /%'" | tail -1); [ "$n" = 1 ] || { echo "  §SETUP forecast measure lacks the §5.56 float division"; miss=$((miss+1)); }
  n=$(psqlq -c "set search_path=adempiere; select count(*) from ad_table where tablename='BIM_Document'" | tail -1); [ "$n" = 1 ] || { echo "  §SETUP BIM Document plugin absent"; miss=$((miss+1)); }
  [ $miss = 0 ] && { echo "§SETUP_VERDICT PASS db=$DB"; return 0; } || { echo "§SETUP_VERDICT FAIL db=$DB missing=$miss"; return 1; }; }
[ "${1:-}" = "--check" ] && { verdict; exit $?; }
for f in ws/migration/iD13/$P/202611042300_CAPEX-WS-READ.sql migration/iD13/$P/202611031900_CAPEX-R0.sql migration/iD13/$P/202611032000_CAPEX-G2.sql migration/iD13/$P/202611032100_CAPEX-G3.sql \
  migration/iD13/$P/202611032200_CAPEX-G4.sql migration/iD13/$P/202611041000_CAPEX-G7.sql migration/iD13/$P/202611111300_CAPEX-Q2-STAGES.sql migration/iD13/$P/202611111310_CAPEX-PROPOSED-MEASURES.sql \
  migration/iD13/$P/202611121000_CAPEX-S2-HEALTH-OVERDUE.sql migration/iD13/$P/202611121200_CAPEX-Q3-EAC-FLOATDIV.sql ws_testserver/migration/iD13/$P/202611042302_CAPEX-WS-PHASE.sql ws_testserver/migration/iD13/$P/202611042304_CAPEX-WS-PROGRESS.sql; do echo "== $f"; run < "$L/$f"; done
for f in 202611042301_CAPEX-WS-PUSH.sql 202611042303_CAPEX-WS-PA.sql; do echo "== remapped $f"; run < "$HERE/$f"; done
echo "== copied pilot types"; python3 "$HERE/copytypes.py" | run
seqs
for f in ws/bimdoc/migration/iD13/$P/202611111200_CAPEX-WS-BIMDOC.sql ws/q4/migration/iD13/$P/202611111400_CAPEX-WS-Q4.sql; do echo "== $f"; run < "$L/$f"; done
seqs
verdict
