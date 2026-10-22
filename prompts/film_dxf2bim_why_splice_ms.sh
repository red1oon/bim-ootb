#!/bin/bash
# ⚠ DO NOT REMOVE — the MALAY why film's splice (FILM_DXF2BIM_WHY_MARKINGS.md §MALAY VERSION): the Malay take (chapters 1-3, from film_dxf2bim_why_assemble_ms.sh)
# + chapters 4-5 cut from the earlier shed film's MALAY master at the SAME cut points as the English v4 (recovered by frame matching, §SPLICE_MATCH) + a Malay end card,
# 0.5 s cross-fades video + audio, two-pass loudnorm -16.5. READ every printed line; exit code is not evidence.
# usage: film_dxf2bim_why_splice_ms.sh <take film (assembled, Malay)> <trim_to_seconds> <out.mp4>      (MS_MASTER=<..._v5_MS.mp4>)
set -e
A=$(readlink -f $1); TRIM=$2; OUT=$(readlink -m $3); M=${MS_MASTER:-$HOME/Videos/DXF2BIM_Chapter_BricsCAD_Shed_to_Viewer_1920x1080_25fps_2026-10-19_v5_MS.mp4}; W=$(mktemp -d /tmp/splice_ms.XXXX); XF=0.5
enc() { ffmpeg -v error -y "$@" -vf "fps=25,scale=1920:1080,format=yuv420p" -c:v libx264 -crf 17 -preset medium -c:a aac -b:a 192k -ar 48000 -ac 2 ; }
# pieces: [start, duration) of the Malay master. B1a = chapter 4 + 5 up to the STILL OPEN card; B1b = prior art; B2 = tail (clipped at the master's end)
MD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$M")
declare -A S=( [B1a]=96.8 [B1b]=293.6 [B2]=311.0 ) D=( [B1a]=170.56 [B1b]=13.0 [B2]=6.09 )
D[B2]=$(python3 -c "print(round(min(6.09,$MD-311.0-0.04),2))")
for k in B1a B1b B2; do ffmpeg -v error -y -ss ${S[$k]} -t ${D[$k]} -i "$M" -vf "fps=25,scale=1920:1080,format=yuv420p" -c:v libx264 -crf 17 -preset medium -c:a aac -b:a 192k -ar 48000 -ac 2 $W/$k.mp4; echo "§SPLICE_PIECE $k from=${S[$k]} dur=${D[$k]}"; done
ffmpeg -v error -y -i "$A" -t $TRIM -vf "fps=25,scale=1920:1080,format=yuv420p" -c:v libx264 -crf 17 -preset medium -c:a aac -b:a 192k -ar 48000 -ac 2 $W/A.mp4; echo "§SPLICE_PIECE A trim=$TRIM"
python3 - $W/END.png <<'PY'
import sys
from PIL import Image, ImageDraw, ImageFont
im=Image.new('RGB',(1920,1080),(12,12,14)); d=ImageDraw.Draw(im)
B=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',84); R=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',29)
def c(y,t,f,fill): w=d.textlength(t,font=f); d.text(((1920-w)/2,y),t,font=f,fill=fill)
c(410,'DARIPADA LUKISAN',B,(243,238,232)); c(520,'KEPADA MODEL',B,(255,107,120))
c(884,'Bab 1 hingga 3 dirakam dalam rakaman ini.',R,(154,160,171)); c(930,'Bab 4 dan 5 daripada rakaman terdahulu bagi lukisan yang sama (512 jasad yang sama).',R,(154,160,171))
im.save(sys.argv[1])
PY
ffmpeg -v error -y -loop 1 -t 7 -i $W/END.png -f lavfi -t 7 -i anullsrc=r=48000:cl=stereo -vf "fps=25,format=yuv420p" -c:v libx264 -crf 17 -c:a aac -b:a 192k -shortest $W/END.mp4
L=(A B1a B1b B2 END); T=(); for k in "${L[@]}"; do T+=($(ffprobe -v error -show_entries format=duration -of csv=p=0 $W/$k.mp4)); done
IN=(); for k in "${L[@]}"; do IN+=(-i $W/$k.mp4); done
FV="[0:v]"; FA="[0:a]"; off=0; cum=${T[0]}; F=""
for i in 1 2 3 4; do off=$(python3 -c "print(round($cum-$XF,3))"); F+="${FV}[$i:v]xfade=transition=fade:duration=$XF:offset=$off[v$i];${FA}[$i:a]acrossfade=d=$XF[a$i];"; FV="[v$i]"; FA="[a$i]"; cum=$(python3 -c "print(round($off+${T[$i]},3))"); done
ffmpeg -v error -y "${IN[@]}" -filter_complex "${F%;}" -map "$FV" -map "$FA" -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k $W/joined.mp4
echo "§SPLICE_JOIN pieces=${T[*]} joined=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $W/joined.mp4)"
# two-pass loudnorm to -16.5
M1=$(ffmpeg -hide_banner -i $W/joined.mp4 -af loudnorm=I=-16.5:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
g() { echo "$M1" | python3 -c "import sys,json;print(json.load(sys.stdin)['$1'])"; }
ffmpeg -v error -y -i $W/joined.mp4 -af "loudnorm=I=-16.5:TP=-1.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true" -c:v copy -c:a aac -b:a 192k $OUT
echo "§SPLICE_DONE $OUT dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $OUT) work=$W"
ffmpeg -hide_banner -i $OUT -af ebur128 -f null - 2>&1 | grep -A1 "Integrated" | tail -1
echo "black frames: $(ffmpeg -hide_banner -i $OUT -vf blackdetect=d=0.5:pix_th=0.05 -an -f null - 2>&1 | grep -c black_start || true)"
