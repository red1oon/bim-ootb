#!/usr/bin/env bash
# capex/tools/film_seq_build.sh — the SILENT video of the sequel film (prompts/CAPEX_DASHBOARD.md §5.37) from the stills of film_seq_shots.js and plain cards. CPU only (ImageMagick + ffmpeg).
# Segment lengths come from the cues of capex/tools/film_cards/narration_seq_en.tsv (so the narration lands on its picture). Usage: film_seq_build.sh <shotsDir> <outDir>
set -euo pipefail
SH="$1"; OUT="$2"; mkdir -p "$OUT/seg"; BG='#0f172a'; CARDBG='#0b0f17'
card() { # name kicker title1 title2 line   (plain dark card, house typography; DejaVu Sans)
  convert -size 1920x1080 xc:"$CARDBG" -gravity center -font DejaVu-Sans-Bold \
    -fill '#FF6B78' -pointsize 34 -annotate +0-190 "$2" -fill '#F3EEE8' -pointsize 100 -annotate +0-70 "$3" -fill '#FF6B78' -pointsize 100 -annotate +0+60 "$4" \
    -font DejaVu-Sans -fill '#cbd5e1' -pointsize 38 -annotate +0+190 "$5" "$OUT/$1.png"; }
textcard() { # name heading line1 line2 line3 (bottom 230 px stay empty for subtitles)
  convert -size 1920x1080 xc:"$BG" -gravity north -font DejaVu-Sans-Bold -fill '#7dd3fc' -pointsize 54 -annotate +0+130 "$2" \
    -font DejaVu-Sans -fill '#F3EEE8' -pointsize 44 -annotate +0+270 "$3" -annotate +0+350 "$4" -annotate +0+430 "$5" "$OUT/$1.png"; }
fit() { # name src.png  (scaled into the top 1920x800, centred, on the dark ground; bottom 230 px empty)
  ffmpeg -hide_banner -loglevel error -y -i "$2" -vf "scale=1800:760:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:110:color=$BG" "$OUT/$1.png"; }
card c0 "SEQUEL" "From a fresh model" "to the CFO and the PM" "a private set, shown under a neutral name"
textcard b1 "A fresh start" "A fresh model of Building A: 6458 elements" "Its 4D programme is run once, the order is computed:" "1 project, 7 phases, 27 tasks, 67 lines" "Pushed through iDempiere's web services: 440 rows read back, 0 differ"
card c1 "CHAPTER 1" "What the CFO" "reads" "money, per currency, with its formula"
card c2 "CHAPTER 2" "What the PM" "reads" "health, schedule, progress, stage, drawings"
card c3 "CHAPTER 3" "Edit it," "install it" "every definition is a data row"
textcard b3 "Editing" "Change a target on the Home tab" "The dial recomputes (witness W-PA-EDITOR, 7 of 7)" "A formula is a row in the Performance tables" "Not code, not AI"
textcard b4 "Installing" "On the twin: a data pack (org.bimootb.capex 1.0.3)" "On iDempiere: migration scripts, plain SQL" "The page only reads, through the standard web services" "Three definitions are ours and say proposed"
card c9 "THE END" "One order," "two readers" "Definitions: the CapexDashboardGuide"
for n in s2_budget s3_actual s4_committed s5_forecast s6_budget_status s7_health s8_schedule s9_physical s10_stage s1_project_selector s11_documents; do fit "p_$n" "$SH/$n.png"; done
# name:seconds in film order (from the TSV cues)
SEGS="c0:3.6 b1:17.0 c1:3.6 p_s2_budget:9 p_s3_actual:9 p_s4_committed:12 p_s5_forecast:13 c2:3.6 p_s6_budget_status:9 p_s7_health:9 p_s8_schedule:9 p_s9_physical:9 p_s10_stage:9 p_s1_project_selector:9 p_s11_documents:9 c3:3.6 b3:10 b4:12 c9:10"
: > "$OUT/list.txt"; t=0
for s in $SEGS; do n=${s%%:*}; d=${s##*:}
  ffmpeg -hide_banner -loglevel error -y -loop 1 -framerate 25 -i "$OUT/$n.png" -t "$d" -vf "fade=t=in:st=0:d=0.4,fade=t=out:st=$(echo "$d-0.4" | bc):d=0.4,format=yuv420p" -c:v libx264 -preset veryfast -crf 18 -tune stillimage "$OUT/seg/$n.mp4"
  echo "file 'seg/$n.mp4'" >> "$OUT/list.txt"; echo "§FILM_SEG $n start=$t dur=$d"; t=$(echo "$t+$d" | bc)
done
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$OUT/list.txt" -c copy "$OUT/silent.mp4"
echo "§FILM_SILENT total=$t s frames=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$OUT/silent.mp4") -> $OUT/silent.mp4"
