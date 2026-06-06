#!/usr/bin/env bash
set -u
cd /tmp/wt-hd
PORT="${PORT:-8147}"
LOG=tests/history_depth_probe.log
python3 -m http.server "$PORT" >/tmp/hd_http.log 2>&1 &
SRV=$!
for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/viewer/viewer.html" && break; sleep 0.3; done
PORT="$PORT" timeout --signal=KILL 170 node tests/probe_history_depth.js >"$LOG" 2>&1
RC=$?
kill -9 "$SRV" 2>/dev/null
pkill -9 -f chrome-headless-shell 2>/dev/null
pkill -9 -f "http.server $PORT" 2>/dev/null
echo "EXIT=$RC"
echo "---- chrome alive (want none) ----"
ps -eo comm | grep -i chrome | grep -v grep || echo "(clean)"
