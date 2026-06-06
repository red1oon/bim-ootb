#!/usr/bin/env bash
# Leak-safe witness runner for HISTORY_SCRUB_FIX bar UX (§2/§3/§4/§5/§7). Static server (bg) over
# the EDITED worktree, probe under a hard KILL timeout, then reap any stray headless chrome.
set -u
cd /tmp/wt-hf
PORT="${PORT:-8146}"
LOG=tests/history_bar_probe.log

python3 -m http.server "$PORT" >/tmp/hb_http.log 2>&1 &
SRV=$!
for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/viewer/viewer.html" && break; sleep 0.3; done

PORT="$PORT" timeout --signal=KILL 170 node tests/probe_history_bar.js >"$LOG" 2>&1
RC=$?

kill -9 "$SRV" 2>/dev/null
pkill -9 -f chrome-headless-shell 2>/dev/null
pkill -9 -f "http.server $PORT" 2>/dev/null
echo "EXIT=$RC"
echo "---- chrome procs still alive (want none) ----"
ps -eo comm | grep -i chrome | grep -v grep || echo "(clean)"
