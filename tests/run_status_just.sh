#!/usr/bin/env bash
set -u
cd /tmp/wt-hm
PORT="${PORT:-8149}"
python3 -m http.server "$PORT" >/tmp/sj_http.log 2>&1 &
SRV=$!
for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/viewer/viewer.html" && break; sleep 0.3; done
PORT="$PORT" timeout --signal=KILL 150 node tests/probe_status_just.js >tests/status_just_probe.log 2>&1
echo "EXIT=$?"
kill -9 "$SRV" 2>/dev/null
pkill -9 -f chrome-headless-shell 2>/dev/null; pkill -9 -f "http.server $PORT" 2>/dev/null
ps -eo comm | grep -i chrome | grep -v grep || echo "(clean)"
