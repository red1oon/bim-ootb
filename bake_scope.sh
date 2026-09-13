#!/usr/bin/env bash
# §91.4 — run a bake in its OWN systemd scope so systemd-oomd cannot take the session with it.
#
# Why this exists: on 2026-09-13 three consecutive sessions in the bake-perf lane were SIGKILLed by
# systemd-oomd, which kills a whole cgroup unit under memory pressure. `claude` and the bake were
# children of the same gnome-terminal vte scope, so the bake's ~26 GB peak (31.8 GB box) got the
# session killed along with it. This wrapper makes the bake a SIBLING scope of the terminal's, so the
# bake is the offender oomd selects and the session survives. See §91 in
# prompts/MEP_CLASH_REVEAL_MOVIE.md for the syslog evidence.
#
# Usage:   ./bake_scope.sh node cli_silent_bake.js --db Hospital_silent --out out/x.mp4 --gpu real ...
# Opt-in caps (unset by default — a hard cap would distort the very perf numbers this lane measures):
#   BAKE_MEM_HIGH=20G   soft brake, throttles by reclaim instead of killing
#   BAKE_MEM_MAX=28G    cgroup-v2 memory.max. NOTE (measured): on its own this does NOT kill — the
#                       cgroup spills to swap first and only OOMs once swap is also exhausted, so a
#                       bare MemoryMax buys a swap-thrash, not a stop. Pair it with:
#   BAKE_SWAP_MAX=0     memory.swap.max — with this set, MemoryMax becomes a real hard stop
set -uo pipefail

[ $# -gt 0 ] || { echo "bake_scope.sh: no command given" >&2; exit 2; }

if ! command -v systemd-run >/dev/null 2>&1; then
  echo "§BAKE_SCOPE unavailable=systemd-run — running unwrapped, the session is NOT protected" >&2
  exec "$@"
fi

unit="bake-$$-$(date +%s)"
props=(-p ManagedOOMMemoryPressure=kill)
[ -n "${BAKE_MEM_HIGH:-}" ] && props+=(-p "MemoryHigh=$BAKE_MEM_HIGH")
[ -n "${BAKE_MEM_MAX:-}" ]  && props+=(-p "MemoryMax=$BAKE_MEM_MAX")
[ -n "${BAKE_SWAP_MAX:-}" ] && props+=(-p "MemorySwapMax=$BAKE_SWAP_MAX")

echo "§BAKE_SCOPE unit=${unit}.scope high=${BAKE_MEM_HIGH:-none} max=${BAKE_MEM_MAX:-none} swapMax=${BAKE_SWAP_MAX:-none} cmd=$*"

# The peak is read from inside the scope: a transient scope is gone before the parent could query it.
systemd-run --user --scope -q --unit="$unit" "${props[@]}" -- bash -c '
  "$@"; rc=$?
  cg=$(sed -n "s|^0::||p" /proc/self/cgroup)
  peak=$(cat "/sys/fs/cgroup${cg}/memory.peak" 2>/dev/null || echo "")
  swpk=$(cat "/sys/fs/cgroup${cg}/memory.swap.peak" 2>/dev/null || echo "")
  fmt() { [ -n "$1" ] && awk -v b="$1" "BEGIN{printf \"%.1fG\", b/1073741824}" || echo "n/a"; }
  echo "§BAKE_SCOPE_PEAK rc=$rc memPeak=$(fmt "$peak") swapPeak=$(fmt "$swpk")"
  exit $rc
' bake "$@"
rc=$?
# oomd/kernel kill of the scope surfaces here as 137 (SIGKILL) — say so rather than leaving a bare code.
# 137 = SIGKILL reached the command, 143 = SIGTERM tore the scope down after it. Either way the scope
# died and no §BAKE_SCOPE_PEAK line was printed — that absence is itself the signal.
case $rc in 137|143)
  echo "§BAKE_SCOPE_KILLED rc=$rc — the scope was killed, not the session (check: grep -a 'systemd-oomd killed' /var/log/syslog, and 'journalctl --user -u ${unit}.scope'). Your session surviving this is the wrapper working." >&2 ;;
esac
exit $rc
