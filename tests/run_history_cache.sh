#!/usr/bin/env bash
set -u
cd /tmp/wt-hc
PORT="${PORT:-8148}"
python3 -m http.server "$PORT" >/tmp/hcache_http.log 2>&1 &
SRV=$!
for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/viewer/viewer.html" && break; sleep 0.3; done
echo "===== LANDING (§8) ====="
PORT="$PORT" timeout --signal=KILL 90 node tests/probe_landing_history.js >tests/landing_history_probe.log 2>&1
echo "land_rc=$?"
echo "===== VIEWER CACHE (§9 + §8 mirror) ====="
PORT="$PORT" timeout --signal=KILL 170 node tests/probe_history_cache.js >tests/history_cache_probe.log 2>&1
echo "cache_rc=$?"
kill -9 "$SRV" 2>/dev/null
pkill -9 -f chrome-headless-shell 2>/dev/null
pkill -9 -f "chrome" 2>/dev/null
pkill -9 -f "http.server $PORT" 2>/dev/null
echo "---- chrome alive (want none) ----"
ps -eo comm | grep -i chrome | grep -v grep || echo "(clean)"
