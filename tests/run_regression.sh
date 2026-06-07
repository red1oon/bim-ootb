#!/usr/bin/env bash
# Re-run ALL viewer history probes against the EXTRACTED shared-module worktree → prove no regression.
set -u
cd /tmp/wt-sm
PORT="${PORT:-8150}"
python3 -m http.server "$PORT" >/tmp/reg_http.log 2>&1 &
SRV=$!
for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/viewer/viewer.html" && break; sleep 0.3; done
run () { echo "===== $1 ====="; PORT="$PORT" timeout --signal=KILL "${3:-170}" node "tests/$1" >"tests/$2" 2>&1; echo "rc=$?"; }
run probe_history_picks.js  reg_picks.log
run probe_history_bar.js    reg_bar.log
run probe_history_depth.js  reg_depth.log
run probe_history_cache.js  reg_cache.log
run probe_landing_history.js reg_landing.log 90
run probe_status_just.js    reg_status.log
kill -9 "$SRV" 2>/dev/null
pkill -9 -f chrome-headless-shell 2>/dev/null; pkill -9 -f "http.server $PORT" 2>/dev/null
echo "---- chrome alive (want none) ----"
ps -eo comm | grep -i chrome | grep -v grep || echo "(clean)"
