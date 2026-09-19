#!/usr/bin/env bash
# ⚠ OFFLINE HI-RES BAKE — MEP_CLASH_REVEAL_MOVIE.md §129.38 (2026-09-19)
#
# WHAT IT IS FOR: start a full 1920x1080/24fps delivery bake, walk away, take the machine off the
# network, and find the mp4 in ~/Downloads when you come back. It needs no network and no session
# attached to it: it detaches itself, survives the terminal closing, and copies the film into
# ~/Downloads ITSELF rather than leaving that to whoever started it.
#
# WHY IT COPIES RATHER THAN BAKING STRAIGHT INTO ~/Downloads: a bake that dies mid-encode still
# leaves a file at --out, and a half-written mp4 sitting in Downloads under the delivery name is
# worse than no file. It bakes to a scratch path, checks the bake said fileOk=true AND that ffprobe
# can read the frame count back, and only then copies. A failed run leaves Downloads untouched and
# says so in a .FAILED marker beside where the film would have been.
#
# OFFLINE: everything the page needs is served from this checkout by the bake's own local server
# (127.0.0.1) — three.js, sql-wasm, the HDRI, the fonts, the DB. viewer/loader.js is local-first
# and only falls back to a CDN when a local file is missing. The one genuinely external thing in
# viewer.html is a goatcounter analytics beacon, which is a non-blocking <script> that simply fails
# with no network. §SUN_PATH is NOAA arithmetic, computed in-process ("offline, no network" is its
# own log line). Verified by running a bake inside a network namespace with no route out.
#
# RUN:  ./scripts/bake_hires_offline.sh [DB_NAME]        (default HHS_Office_Federated_silent)
# THEN: tail -f out/<db>_hires_<stamp>.log     — or just wait and look in ~/Downloads.
# READ THE LOG AFTER EVERY RUN (CLAUDE.md Log Mandate): exit code is not evidence.
set -uo pipefail

DB="${1:-HHS_Office_Federated_silent}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y-%m-%d_%H%M)"
DEST_DIR="${BAKE_DEST_DIR:-$HOME/Downloads}"
DEST="$DEST_DIR/${DB}_1920x1080_24fps_${STAMP}.mp4"
SCRATCH="${TMPDIR:-/tmp}/bake_${DB}_${STAMP}.mp4"
LOG="$ROOT/out/${DB}_hires_${STAMP}.log"

mkdir -p "$ROOT/out" "$DEST_DIR"

# The stale-profile trap, and it is not optional: cli_silent_bake.js reuses
# /tmp/silent-bake-profile-<port>, which holds the service-worker registration and its Cache
# Storage, so a bake can render OLD code while every source file on disk is new. Bumping
# CACHE_VERSION does NOT evict it — a new worker waits while the old one still controls the page.
# Measured 2026-09-19: three bakes in a row showed pre-fix behaviour until this line was run.
rm -rf /tmp/silent-bake-profile-* 2>/dev/null

run() {
  {
    echo "§BAKE_SCRIPT start $(date -Is) db=$DB dest=$DEST"
    echo "§BAKE_SCRIPT commit=$(git -C "$ROOT" rev-parse --short HEAD) branch=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
    # --gpu real, never sw: measured 0.86 s/frame against 107 s/frame on this box (RTX 4060).
    # A 1,970-frame film at sw would be over two days.
    node "$ROOT/cli_silent_bake.js" \
      --db "$DB" --out "$SCRATCH" \
      --gpu real --width 1920 --height 1080 --fps 24 \
      # --clash added 2026-09-19 (red1: "we shall ensure ON together for next bake"). The mesh-true
      # clash pairs stand from frame 0, so this is the one flag that changes the picture before
      # the buildup reaches anything — expect it in §CLI_BAKE_RESOLVED as clash=1.
      --buildup --label --measure --clash --load-path --ledger --cost --storey-reveal --sun-compass --day tr
    echo "§BAKE_SCRIPT node exit=$?"

    # DELIVERY GATE — three independent checks, because any one of them alone has been fooled
    # before: the bake's own verdict, the file having real bytes, and ffprobe reading frames back
    # out of it. A film that fails any of them is NOT copied into Downloads.
    ok=1
    grep -q 'fileOk=true' "$LOG" || { echo "§BAKE_SCRIPT GATE the bake never said fileOk=true"; ok=0; }
    [ -s "$SCRATCH" ] || { echo "§BAKE_SCRIPT GATE no file at $SCRATCH"; ok=0; }
    if [ -s "$SCRATCH" ]; then
      fr=$(ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames \
           -of default=nk=1:nw=1 "$SCRATCH" 2>/dev/null)
      case "$fr" in ''|*[!0-9]*) echo "§BAKE_SCRIPT GATE ffprobe could not count frames"; ok=0;;
        *) [ "$fr" -gt 0 ] && echo "§BAKE_SCRIPT ffprobe frames=$fr" || { echo "§BAKE_SCRIPT GATE zero frames"; ok=0; };;
      esac
    fi

    if [ "$ok" = "1" ]; then
      cp "$SCRATCH" "$DEST" && rm -f "$SCRATCH"
      echo "§BAKE_SCRIPT DELIVERED $DEST bytes=$(stat -c%s "$DEST")"
    else
      echo "§BAKE_SCRIPT NOT DELIVERED — Downloads left untouched on purpose. Scratch kept at $SCRATCH"
      echo "bake failed $(date -Is); see $LOG" > "$DEST.FAILED"
    fi

    # The lines worth reading first, pulled to the end so they are the last thing on screen.
    echo "§BAKE_SCRIPT ---- verdicts ----"
    grep -E "=> (PASS|FAIL)|unconverged=|§SUN_COMPASS |§SUN_COMPASS_HELD|§LOADPATH_BUILD|INCONCLUSIVE|MISMATCH|§CLI_BAKE_WALL" "$LOG" | sed 's/^[0-9:.]* *+ *[0-9.]*s //' | cut -c1-200
    echo "§BAKE_SCRIPT end $(date -Is)"
  } >> "$LOG" 2>&1
}

# setsid + nohup: outlives the terminal, the ssh session and the agent that started it.
export -f run 2>/dev/null
setsid nohup bash -c "$(declare -f run); DB='$DB' ROOT='$ROOT' SCRATCH='$SCRATCH' DEST='$DEST' LOG='$LOG' run" </dev/null >/dev/null 2>&1 &
echo "bake detached (pid $!)"
echo "  log  : $LOG"
echo "  lands: $DEST"
