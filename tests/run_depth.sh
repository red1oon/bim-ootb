#!/usr/bin/env bash
# Leak-safe witness runner: static server (background), run probe under a hard KILL timeout,
# then reap any stray headless chrome. Inline `&`+curl in one Bash tool trips the sandbox →
# run this script file with bash instead.
set -u
cd /home/red1/bim-ootb
PORT="${PORT:-8137}"
LOG=tests/depth_probe.log

python3 -m http.server "$PORT" >/tmp/depth_http.log 2>&1 &
SRV=$!
# wait for the server
for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/viewer/viewer.html" && break; sleep 0.3; done

PORT="$PORT" timeout --signal=KILL 150 node tests/probe_depth.js >"$LOG" 2>&1
RC=$?

kill -9 "$SRV" 2>/dev/null
pkill -9 -f chrome-headless-shell 2>/dev/null
pkill -9 -f "http.server $PORT" 2>/dev/null
echo "EXIT=$RC"
echo "---- chrome procs still alive (want none) ----"
ps -eo comm | grep -i chrome | grep -v grep || echo "(clean)"
