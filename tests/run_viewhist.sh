#!/usr/bin/env bash
# Leak-safe witness runner for §VIEWLOG (Find view-history). Static server (background),
# run probe under a hard KILL timeout, then reap any stray headless chrome.
set -u
cd /home/red1/bim-ootb
PORT="${PORT:-8137}"
LOG=tests/viewhist_probe.log

python3 -m http.server "$PORT" >/tmp/vh_http.log 2>&1 &
SRV=$!
for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/viewer/viewer.html" && break; sleep 0.3; done

PORT="$PORT" timeout --signal=KILL 200 node tests/probe_viewhist.js >"$LOG" 2>&1
RC=$?

kill -9 "$SRV" 2>/dev/null
pkill -9 -f chrome-headless-shell 2>/dev/null
pkill -9 -f "http.server $PORT" 2>/dev/null
echo "EXIT=$RC"
echo "---- chrome procs still alive (want none) ----"
ps -eo comm | grep -i chrome | grep -v grep || echo "(clean)"
