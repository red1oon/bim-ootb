#!/bin/bash
# §CPE_GAZE_ACQUIRE regression checklist — the SAME 13 witnesses on the branch and on clean
# origin/main, classified identically. A witness that is already RED on main is NOT evidence about
# this change; only a green->red transition is.
printf "%-34s %-10s %-10s %s\n" WITNESS BRANCH MAIN VERDICT
printf -- "----------------------------------------------------------------------------\n"
regress=0
for w in witness_cinema_path_editor witness_cpe_gaze_spin witness_cpe_spin_whip \
         witness_cpe_even_turn witness_cpe_stick_hold witness_cpe_walk_budget \
         witness_cinema_orbit_v2 witness_cinema_damping_bleed witness_cinema_flat_ending \
         witness_cinema_reciprocal witness_cinema_exit_breathe witness_cpe_noise_law \
         witness_cpe_room_title_gaze; do
  cls () {   # $1 = logfile -> PASS | RED | INFRA | MISSING
    [ -f "$1" ] || { echo MISSING; return; }
    if grep -qE "TimeoutError|ERR_CONNECTION|Cannot read|is not a function|PLAN FAILED|could not discover" "$1"; then echo INFRA; return; fi
    if grep -qE "VERDICT: FAIL|WITNESS FAIL|— FAIL|^FAIL " "$1"; then echo RED; return; fi
    echo PASS
  }
  b=$(cls "/tmp/wt-gaze/wlogs2/$w.log")
  m=$(cls "/tmp/wt-base/wlogs2/$w.log")
  if [ "$b" = "$m" ]; then v="same as main"; else
    if [ "$m" = "PASS" ] && [ "$b" != "PASS" ]; then v="*** REGRESSION ***"; regress=$((regress+1));
    else v="differs ($m -> $b)"; fi
  fi
  printf "%-34s %-10s %-10s %s\n" "$w" "$b" "$m" "$v"
done
printf -- "----------------------------------------------------------------------------\n"
echo "REGRESSIONS INTRODUCED BY THIS BRANCH: $regress"
