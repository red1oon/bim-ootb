#!/usr/bin/env bash
# ⚠ DO NOT REMOVE — SCOPE: the 4D gates in ONE command (bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.9.3 item 8, §Q.14.5).
# Rebuilds the persisted runs for the seven buildings (a cache hit is instant), runs every 4D gate witness, writes ONE
# stamped log and prints one table. CPU only: no browser, no GPU. Read the log, not the exit code:
#   logs/4d_gates_<UTC time>.log      (override the folder with LOG_DIR)
# Usage: scripts/run_4d_gates.sh [Building ...]      default: all seven
#        LARGE=1 scripts/run_4d_gates.sh            also the edit chain on Clinic and Hospital
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BLDS=("$@"); [ ${#BLDS[@]} -eq 0 ] && BLDS=(Duplex HHS_Office_Federated Hospital Terminal Clinic JKR LTU_AHouse)
LOG_DIR="${LOG_DIR:-$ROOT/logs}"; mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/4d_gates_$(date -u +%Y%m%dT%H%M%SZ).log"
GATES=(witness_tm_assembly_order witness_midair_zero witness_gantt_lock_integrity witness_gantt_edit_coherence
       witness_tm_edit_exception witness_tm_reveal_within_bar witness_big_element_support_coverage witness_curtain_wall_opening
       witness_tm_needle_sync witness_gantt_one_commit_pipeline witness_gantt_undo_every_edit)
node "$ROOT/scripts/log_stamp.js" "run_4d_gates ${BLDS[*]}" > "$LOG"
echo "§GATES_STEP cache ${BLDS[*]}" >> "$LOG"
(cd "$ROOT" && node scripts/cache_4d_run.js "${BLDS[@]}") >> "$LOG" 2>&1; cacheRc=$?
echo "§GATES_STEP_EXIT cache rc=$cacheRc" >> "$LOG"
declare -a ROWS; red=0; missing=0
for g in "${GATES[@]}"; do
  f="$ROOT/viewer/tests/$g.js"
  if [ ! -f "$f" ]; then ROWS+=("$g|MISSING|-"); missing=$((missing+1)); echo "§GATES_STEP_EXIT $g MISSING" >> "$LOG"; continue; fi
  echo "§GATES_STEP $g" >> "$LOG"; tmp="$(mktemp)"
  (cd "$ROOT/viewer" && node "tests/$g.js") > "$tmp" 2>&1; rc=$?
  cat "$tmp" >> "$LOG"; echo "§GATES_STEP_EXIT $g rc=$rc" >> "$LOG"
  last="$(grep -E 'pass=[0-9]+ +fail=[0-9]+' "$tmp" | tail -1 | grep -oE 'pass=[0-9]+ +fail=[0-9]+( +inconclusive=[0-9]+)?')"
  inc="$(grep -c 'INCONCLUSIVE\|VACUOUS' "$tmp")"
  [ $rc -ne 0 ] && red=$((red+1))
  [ -z "$last" ] && last="$(grep -v '^$' "$tmp" | tail -1 | cut -c1-90)"
  ROWS+=("$g|rc=$rc|${last:-no output} inconclusiveOrVacuousLines=$inc"); rm -f "$tmp"
done
# LARGE=1 — the edit chain again on two large buildings (minutes each): bar move/resize re-times its elements, and
# verify -> bad drag refused -> undo clean. §Q.15.3. Off by default so the everyday run stays short.
if [ "${LARGE:-0}" = 1 ]; then
  for b in Clinic Hospital; do for pair in "witness_gantt_edit_coherence COH_BLD" "witness_gantt_lock_integrity LI_BLD"; do
    set -- $pair; g=$1; var=$2
    echo "§GATES_STEP $g $b" >> "$LOG"; tmp="$(mktemp)"
    (cd "$ROOT/viewer" && env "$var=$b" node "tests/$g.js") > "$tmp" 2>&1; rc=$?
    cat "$tmp" >> "$LOG"; echo "§GATES_STEP_EXIT $g $b rc=$rc" >> "$LOG"
    last="$(grep -E 'pass=[0-9]+ +fail=[0-9]+' "$tmp" | tail -1 | grep -oE 'pass=[0-9]+ +fail=[0-9]+')"
    [ $rc -ne 0 ] && red=$((red+1))
    ROWS+=("$g@$b|rc=$rc|${last:-no pass/fail line}"); rm -f "$tmp"
  done; done
fi
{ echo "§GATES_TABLE buildings=${BLDS[*]} cacheRc=$cacheRc"
  for r in "${ROWS[@]}"; do IFS='|' read -r n c t <<< "$r"; printf '§GATES_ROW %-40s %-8s %s\n' "$n" "$c" "$t"; done
  verdict=GREEN; [ $red -ne 0 ] || [ $cacheRc -ne 0 ] && verdict=RED; [ $missing -ne 0 ] && [ $verdict = GREEN ] && verdict=INCONCLUSIVE
  echo "§GATES_VERDICT $verdict red=$red missing=$missing gates=${#GATES[@]} log=$LOG"; } | tee -a "$LOG"
[ $red -eq 0 ] && [ $cacheRc -eq 0 ] && [ $missing -eq 0 ]
