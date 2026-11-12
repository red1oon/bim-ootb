#!/usr/bin/env bash
# capex/tools/film_dash_twin_build.sh — the SILENT video of the DASHBOARD-ONLY film on the TWIN store (prompts/CAPEX_DASHBOARD.md §5.62 storyboard) from the stills of film_dash_twin_shots.js and plain cards. CPU only (ImageMagick + ffmpeg).
# Usage: film_dash_twin_build.sh <shotsDir> <outDir> <durationsFile>    durationsFile = lines "<segment> <seconds>" in film order (written by film_dash_twin_plan.py from the narration lengths); cues are measured from the built
# segments (§FILM_SEG lines), never typed. The bottom 230 px of every frame stay empty for the subtitles.
set -euo pipefail
SH="$1"; OUT="$2"; DUR="$3"; mkdir -p "$OUT/seg"; BG='#0f172a'; CARDBG='#0b0f17'; FB="${FB:-DejaVu-Sans-Bold}"; FR="${FR:-DejaVu-Sans}"; FILM_LANG="${FILM_LANG:-en}"   # FILM_LANG=zh with FB/FR set to Noto-Sans-CJK-SC(-Bold) builds the Chinese cards
card() { convert -size 1920x1080 xc:"$CARDBG" -gravity center -font $FB -fill '#FF6B78' -pointsize 34 -annotate +0-190 "$2" -fill '#F3EEE8' -pointsize 100 -annotate +0-70 "$3" -fill '#FF6B78' -pointsize 100 -annotate +0+60 "$4" -font $FR -fill '#cbd5e1' -pointsize 38 -annotate +0+190 "$5" "$OUT/$1.png"; }
fit() { ffmpeg -hide_banner -loglevel error -y -i "$2" -vf "scale=1800:730:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:110:color=$BG" "$OUT/$1.png"; }
box() { # name x y w h label sub : a rounded box on the working image $OUT/_dia.png
  convert "$OUT/_dia.png" -fill '#1e293b' -stroke '#7dd3fc' -strokewidth 3 -draw "roundrectangle $2,$3 $(( $2+$4 )),$(( $3+$5 )) 16,16" -stroke none -font $FB -fill '#F3EEE8' -pointsize 34 -gravity NorthWest -annotate +$(( $2+22 ))+$(( $3+18 )) "$6" -font $FR -fill '#cbd5e1' -pointsize 28 -annotate +$(( $2+22 ))+$(( $3+70 )) "$7" "$OUT/_dia.png"; }
arrow() { convert "$OUT/_dia.png" -stroke '#FF6B78' -strokewidth 5 -draw "line $1,$2 $3,$4" -fill '#FF6B78' -draw "polygon $3,$4 $(( $3-18 )),$(( $4-12 )) $(( $3-18 )),$(( $4+12 ))" "$OUT/_dia.png"; }
textcard() { convert -size 1920x1080 xc:"$BG" -gravity north -font $FB -fill '#7dd3fc' -pointsize 54 -annotate +0+130 "$2" -font $FR -fill '#F3EEE8' -pointsize 44 -annotate +0+270 "$3" -annotate +0+350 "$4" -annotate +0+430 "$5" -annotate +0+510 "$6" "$OUT/$1.png"; }

RUN="$SH"   # the stills live in the run dir beside the logs
if [ "$FILM_LANG" = zh ]; then
card c0 "仪表板  ·  BIM-ERP" "完整的建筑" "供应链" "在同一个内核上"
card c9 "结束" "一个内核，" "一个屏幕" "定义见《CAPEX 仪表板指南》。拟议的定义会说明。"
convert -size 1920x1080 xc:"$BG" -gravity North -font $FB -fill '#7dd3fc' -pointsize 54 -annotate +0+95 "一个内核，从头到尾" "$OUT/_dia.png"
box _dia 60 300 300 140 "建筑" "模型 (IFC)"; box _dia 420 300 300 140 "进度计划" "4D 计划"; box _dia 780 300 300 140 "项目订单" "阶段和明细"; box _dia 1140 300 300 140 "采购订单" "购买"; box _dia 1500 300 340 140 "收货" "货物入库"
arrow 360 370 420 370; arrow 720 370 780 370; arrow 1080 370 1140 370; arrow 1440 370 1500 370
box _dia 60 560 300 140 "发往工地" "库存与成本"; box _dia 420 560 300 140 "供应商发票" "已开票"; box _dia 780 560 300 140 "付款" "已付款"; box _dia 1140 560 700 140 "本仪表板" "读取同样的数据行"
arrow 1670 440 1670 560; arrow 360 630 420 630; arrow 720 630 780 630; arrow 1080 630 1140 630
cp "$OUT/_dia.png" "$OUT/c_chain.png"
V1=$(grep -o "judged=[0-9]*" "$RUN/drill.log" | head -1 | cut -d= -f2); V2=$(grep -o "TWIN_CHAIN_VERDICT PASS judged=[0-9]*" "$RUN/erp.log" | grep -o "[0-9]*$"); V3=$(grep -o "PROJECT_ISSUE_VERDICT PASS judged=[0-9]*" "$RUN/erp.log" | grep -o "[0-9]*$")
textcard p_proof "每个数字都经过核对" "$V1 项检查：本仪表板对照数据行" "$V2 项检查：供应链，逐张订单" "$V3 项检查：发往工地的库存" "屏幕上没有任何手工输入的数字" ""
else
card c0 "DASHBOARD  ·  BIM-ERP" "Full construction" "supply chain" "on a single kernel"
card c9 "THE END" "One kernel," "one screen" "Definitions: the CapexDashboardGuide. Proposed ones say so."
# the chain, drawn: BIM -> schedule -> order -> buy -> receive -> issue -> invoice -> pay -> dashboard (every box is a document the twin holds)
convert -size 1920x1080 xc:"$BG" -gravity North -font $FB -fill '#7dd3fc' -pointsize 54 -annotate +0+95 "One kernel, start to finish" "$OUT/_dia.png"
box _dia 60 300 300 140 "Building" "model (IFC)"; box _dia 420 300 300 140 "Schedule" "4D programme"; box _dia 780 300 300 140 "Project order" "phases and lines"; box _dia 1140 300 300 140 "Purchase order" "buy"; box _dia 1500 300 340 140 "Receipt" "goods in"
arrow 360 370 420 370; arrow 720 370 780 370; arrow 1080 370 1140 370; arrow 1440 370 1500 370
box _dia 60 560 300 140 "Issue to site" "stock + cost"; box _dia 420 560 300 140 "Vendor invoice" "billed"; box _dia 780 560 300 140 "Payment" "paid"; box _dia 1140 560 700 140 "This dashboard" "reads the same rows"
arrow 1670 440 1670 560; arrow 360 630 420 630; arrow 720 630 780 630; arrow 1080 630 1140 630
cp "$OUT/_dia.png" "$OUT/c_chain.png"
V1=$(grep -o "judged=[0-9]*" "$RUN/drill.log" | head -1 | cut -d= -f2); V2=$(grep -o "TWIN_CHAIN_VERDICT PASS judged=[0-9]*" "$RUN/erp.log" | grep -o "[0-9]*$"); V3=$(grep -o "PROJECT_ISSUE_VERDICT PASS judged=[0-9]*" "$RUN/erp.log" | grep -o "[0-9]*$")
textcard p_proof "Every number is checked" "$V1 checks on this dashboard against the rows" "$V2 checks on the supply chain, order by order" "$V3 checks on the stock issued to site" "Nothing on this screen is typed" ""
fi
for n in b02_glance b03_drill_approved b04_drill_spent b05_forecast_basis b06_drill_amber b07_map_hover b07_map_open b08_attention b09_m1_projects b09_m2_budget b09_m3_procurement b09_m4_approvals b09_m5_handover b10_page_schedule b10_page_procurement b11_formula b11_theme_classic_light b11_theme_executive_light b11_theme_executive_dark; do fit "$n" "$SH/$n.png"; done
: > "$OUT/list.txt"; t=0; i=0
while read -r n d; do [ -z "$n" ] && continue; i=$((i+1))
  ffmpeg -nostdin -hide_banner -loglevel error -y -loop 1 -framerate 25 -i "$OUT/$n.png" -t "$d" -vf "fade=t=in:st=0:d=0.4,fade=t=out:st=$(echo "$d-0.4" | bc):d=0.4,format=yuv420p" -c:v libx264 -preset veryfast -tune stillimage "$OUT/seg/$i.mp4"
  echo "file 'seg/$i.mp4'" >> "$OUT/list.txt"; echo "§FILM_SEG $n start=$t dur=$d"; t=$(echo "$t+$d" | bc)
done < "$DUR"
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$OUT/list.txt" -c copy "$OUT/silent.mp4"
echo "§FILM_SILENT total=$t s frames=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$OUT/silent.mp4") -> $OUT/silent.mp4"
