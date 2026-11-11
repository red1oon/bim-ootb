#!/usr/bin/env bash
# capex/tools/film_seq2_build.sh — the SILENT video of sequel film v2 (prompts/CAPEX_DASHBOARD.md §5.37): flashback frames of the walked building (taken from an existing take), the ERP window stills, then the dashboard with each tile zoomed over the dimmed full page.
# Segment lengths = the cues of capex/tools/film_cards/narration_seq2_en.tsv. CPU only. Usage: film_seq2_build.sh <dashShots> <erpShots> <flashbackDir with fb_a.png fb_b.png> <outDir>
set -euo pipefail
DS="$1"; ES="$2"; FB="$3"; OUT="$4"; mkdir -p "$OUT/seg"; BG='#0f172a'; CARDBG='#0b0f17'
card() { convert -size 1920x1080 xc:"$CARDBG" -gravity center -font DejaVu-Sans-Bold -fill '#FF6B78' -pointsize 34 -annotate +0-190 "$2" -fill '#F3EEE8' -pointsize 100 -annotate +0-70 "$3" -fill '#FF6B78' -pointsize 100 -annotate +0+60 "$4" -font DejaVu-Sans -fill '#cbd5e1' -pointsize 38 -annotate +0+190 "$5" "$OUT/$1.png"; }
fit() { ffmpeg -hide_banner -loglevel error -y -i "$2" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=$BG" "$OUT/$1.png"; }
zoom() { # name tile.png : the full dashboard dimmed behind, the tile enlarged on top with a sky-blue frame (bottom 230 px left empty for subtitles)
  convert "$DS/s0_dashboard.png" -resize 1920x1080! -fill black -colorize 72% "$OUT/_bg.png"
  convert "$2" -resize 1500x600 -bordercolor '#7dd3fc' -border 6 "$OUT/_tile.png"
  convert "$OUT/_bg.png" "$OUT/_tile.png" -gravity north -geometry +0+110 -composite "$OUT/$1.png"; }
card c0 "SEQUEL" "From a walked building" "to the CFO's screen" "quantities, rates, one dashboard"
card c1 "THE BIG PICTURE" "The same figure," "everywhere" "ledger first, dashboard next"
card c2 "EVERYTHING IS A TABLE" "Rates and documents" "make the dashboard" "change a row, the numbers follow"
card c9 "THE END" "Real quantities," "example rates" "give us your rates and it becomes an estimate"
fit f_a "$FB/fb_a.png"; fit f_b "$FB/fb_b.png"; fit e_1 "$ES/e5_project_grid.png"; fit e_3 "$ES/e6_phase_grid.png"; fit d_full "$DS/s0_dashboard.png"
for n in s2_budget s3_actual s4_committed s5_forecast s6_budget_status s7_health s8_schedule s9_physical; do zoom "z_$n" "$DS/$n.png"; done
SEGS="c0:3.6 f_a:10 f_b:9 e_1:10 e_3:9 c1:3.6 d_full:15 z_s2_budget:9 z_s3_actual:9 z_s4_committed:12 z_s5_forecast:12 z_s6_budget_status:9 z_s7_health:9 z_s8_schedule:9 z_s9_physical:12 c2:3.6 d_full:14 c9:10"
: > "$OUT/list.txt"; t=0; i=0
for s in $SEGS; do n=${s%%:*}; d=${s##*:}; i=$((i+1))
  ffmpeg -hide_banner -loglevel error -y -loop 1 -framerate 25 -i "$OUT/$n.png" -t "$d" -vf "fade=t=in:st=0:d=0.4,fade=t=out:st=$(echo "$d-0.4" | bc):d=0.4,format=yuv420p" -c:v libx264 -preset veryfast -crf 18 -tune stillimage "$OUT/seg/$i.mp4"
  echo "file 'seg/$i.mp4'" >> "$OUT/list.txt"; echo "§FILM_SEG $n start=$t dur=$d"; t=$(echo "$t+$d" | bc)
done
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$OUT/list.txt" -c copy "$OUT/silent.mp4"
echo "§FILM_SILENT total=$t s frames=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$OUT/silent.mp4") -> $OUT/silent.mp4"
