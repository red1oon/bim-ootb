#!/usr/bin/env bash
# capex/tools/film_dash_build.sh — the SILENT video of the DASHBOARD-ONLY film (prompts/CAPEX_DASHBOARD.md §5.52) from the stills of film_dash_shots.js and plain cards. CPU only (ImageMagick + ffmpeg).
# Usage: film_dash_build.sh <shotsDir> <outDir>     Segment names and seconds are in SEGS; the narration cues are measured from the built segments (§FILM_SEG lines), never typed.
set -euo pipefail
SH="$1"; OUT="$2"; mkdir -p "$OUT/seg"; BG='#0f172a'; CARDBG='#0b0f17'
card() { convert -size 1920x1080 xc:"$CARDBG" -gravity center -font DejaVu-Sans-Bold -fill '#FF6B78' -pointsize 34 -annotate +0-190 "$2" -fill '#F3EEE8' -pointsize 100 -annotate +0-70 "$3" -fill '#FF6B78' -pointsize 100 -annotate +0+60 "$4" -font DejaVu-Sans -fill '#cbd5e1' -pointsize 38 -annotate +0+190 "$5" "$OUT/$1.png"; }
fit() { ffmpeg -hide_banner -loglevel error -y -i "$2" -vf "scale=1800:730:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:110:color=$BG" "$OUT/$1.png"; }
box() { # name x y w h label sub : a rounded box on the working image $OUT/_dia.png
  convert "$OUT/_dia.png" -fill '#1e293b' -stroke '#7dd3fc' -strokewidth 3 -draw "roundrectangle $2,$3 $(( $2+$4 )),$(( $3+$5 )) 16,16" -stroke none -font DejaVu-Sans-Bold -fill '#F3EEE8' -pointsize 34 -gravity NorthWest -annotate +$(( $2+22 ))+$(( $3+18 )) "$6" -font DejaVu-Sans -fill '#cbd5e1' -pointsize 28 -annotate +$(( $2+22 ))+$(( $3+70 )) "$7" "$OUT/_dia.png"; }
arrow() { convert "$OUT/_dia.png" -stroke '#FF6B78' -strokewidth 5 -draw "line $1,$2 $3,$4" -fill '#FF6B78' -draw "polygon $3,$4 $(( $3-18 )),$(( $4-12 )) $(( $3-18 )),$(( $4+12 ))" "$OUT/_dia.png"; }
card c0 "THE DASHBOARD" "One screen" "for the CFO and the PM" "from a building model to a project order to this page"
card c1 "THE GLANCE" "What the" "page says" "a handful of numbers, nothing to dig through"
card c2 "DRILL IN" "Every number" "opens its projects" "click, read, close"
card c3 "THE MENU" "Six places" "on the left" "what each one is for"
card c4 "TWO RUNTIMES" "One definition," "two systems" "Kernel ERP and legacy iDempiere"
card c9 "THE END" "One order," "one screen" "Definitions: the CapexDashboardGuide. Proposed ones say so."
# the model: the PA chain, drawn (bottom 230 px stay empty for subtitles)
convert -size 1920x1080 xc:"$BG" -gravity North -font DejaVu-Sans-Bold -fill '#7dd3fc' -pointsize 54 -annotate +0+95 "Every number is a Performance Analysis row" "$OUT/_dia.png"
box _dia 90 250 380 150 "PA_Measure" "what to count"; box _dia 560 250 380 150 "PA_MeasureCalc" "the SQL that counts it"; box _dia 1030 250 380 150 "PA_Goal" "target and colour"; box _dia 1500 250 330 150 "Home tab" "and this page"
arrow 470 325 560 325; arrow 940 325 1030 325; arrow 1410 325 1500 325
convert "$OUT/_dia.png" -font DejaVu-Sans-Bold -fill '#7dd3fc' -pointsize 40 -gravity NorthWest -annotate +90+470 "Kernel ERP" -font DejaVu-Sans -fill '#F3EEE8' -pointsize 34 -annotate +90+525 "SQLite, in the browser, nothing to install" -annotate +90+575 "the same rows are loaded as data" -font DejaVu-Sans-Bold -fill '#7dd3fc' -pointsize 40 -annotate +1000+470 "Legacy iDempiere" -font DejaVu-Sans -fill '#F3EEE8' -pointsize 34 -annotate +1000+525 "PostgreSQL, the stock Performance Analysis tables" -annotate +1000+575 "the same rows are applied as SQL scripts" "$OUT/p1.png"
textcard() { convert -size 1920x1080 xc:"$BG" -gravity north -font DejaVu-Sans-Bold -fill '#7dd3fc' -pointsize 54 -annotate +0+130 "$2" -font DejaVu-Sans -fill '#F3EEE8' -pointsize 44 -annotate +0+270 "$3" -annotate +0+350 "$4" -annotate +0+430 "$5" -annotate +0+510 "$6" "$OUT/$1.png"; }
PA=$(grep -o "judged=[0-9]* fail=[0-9]*" "$SH/../pa_tiles.log" | head -1); DR=$(grep -o "judged=[0-9]* fail=[0-9]*" "$SH/../drill.log" | head -1); PAJ=${PA#judged=}; PAJ=${PAJ%% *}; PAF=${PA##*fail=}; DRJ=${DR#judged=}; DRJ=${DRJ%% *}; DRF=${DR##*fail=}
textcard p2 "Same rows, same numbers" "$PAJ values compared between the two systems and the page: $PAF differ" "Tiles, health, schedule and budget buckets, checked one by one" "$DRJ click-through checks: $DRF failed" "Installing on iDempiere is SQL scripts; on the Kernel ERP, a data pack"
fit s_erp1 "$SH/e5_project_grid.png"; fit s_erp2 "$SH/e6_phase_grid.png"
for n in d0_glance d1_drill_approved d2_drill_actual d3_drill_health d4_formula m1_projects m2_budget m3_procurement m4_approvals m5_handover; do fit "s_$n" "$SH/$n.png"; done
SEGS="${SEGS:-c0:3.6 s_erp1:11 s_erp2:9 c1:3.6 s_d0_glance:18 c2:3.6 s_d1_drill_approved:12 s_d3_drill_health:15 s_d2_drill_actual:8 s_d4_formula:9 c3:3.6 s_m1_projects:8 s_m2_budget:8 s_m3_procurement:12 s_m4_approvals:8 s_m5_handover:11 c4:3.6 p1:17 p2:13 c9:6}"
: > "$OUT/list.txt"; t=0; i=0
for s in $SEGS; do n=${s%%:*}; d=${s##*:}; i=$((i+1))
  ffmpeg -hide_banner -loglevel error -y -loop 1 -framerate 25 -i "$OUT/$n.png" -t "$d" -vf "fade=t=in:st=0:d=0.4,fade=t=out:st=$(echo "$d-0.4" | bc):d=0.4,format=yuv420p" -c:v libx264 -preset veryfast -tune stillimage "$OUT/seg/$i.mp4"
  echo "file 'seg/$i.mp4'" >> "$OUT/list.txt"; echo "§FILM_SEG $n start=$t dur=$d"; t=$(echo "$t+$d" | bc)
done
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$OUT/list.txt" -c copy "$OUT/silent.mp4"
echo "§FILM_SILENT total=$t s frames=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$OUT/silent.mp4") -> $OUT/silent.mp4"
