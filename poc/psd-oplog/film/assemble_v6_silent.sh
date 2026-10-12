#!/bin/bash
# Usage: bash film/assemble_v6_silent.sh   Silent first cut of the v6 film from the raw takes and cards in ~/Videos/oplogpic_v2_work/v6 (ffmpeg only). Output: <v6>/OplogPic_v6_SILENT.mp4 with chapter markers (OplogPic_v6_SILENT_chapters.mp4).
# Segment speeds are only to land near 3 minutes before narration exists; the narration pass sets the real timing.
set -e; V=$HOME/Videos/oplogpic_v2_work/v6; S=$V/seg; rm -rf $S; mkdir -p $S; cd $V
FPS=25; ENC="-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r $FPS -an"
card() { # name seconds
  ffmpeg -v error -y -loop 1 -t $2 -i cards/$1.png -vf "scale=1920:1080,fade=t=in:st=0:d=0.35,fade=t=out:st=$(echo "$2-0.35" | bc):d=0.35,format=yuv420p" $ENC $S/$1.mp4; }
take() { # name speed startsec
  ffmpeg -v error -y -ss $3 -i $1.webm -vf "scale=1920:1080,setpts=PTS/$2,fade=t=in:st=0:d=0.3,format=yuv420p" $ENC $S/$1.mp4; }
card cover 3; card c1 5; card c2 2.5; take tour 1.1 4.3; card c3 2.5; take history 1.25 4.3; card c4 2.5; take edits 1.15 4.3; card c5 8; card end 10
ORDER="cover c1 c2 tour c3 history c4 edits c5 end"; : > $S/list.txt; for n in $ORDER; do echo "file '$S/$n.mp4'" >> $S/list.txt; done
ffmpeg -v error -y -f concat -safe 0 -i $S/list.txt -c copy OplogPic_v6_SILENT.mp4
# chapters: Concept(cover+c1), Tour(c2+tour), History(c3+history), Edits(c4+edits), Cost(c5), Prior art(end)
d() { ffprobe -v error -show_entries format=duration -of csv=p=0 $S/$1.mp4; }
python3 - <<PY > $S/chapters.txt
import subprocess
def d(n): return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0','$S/'+n+'.mp4']).decode())
chap=[('1 A photo editor with history',['cover','c1']),('2 The finished file',['c2','tour']),('3 The history is the file',['c3','history']),('4 Two edits',['c4','edits']),('5 What it costs',['c5']),('Prior art',['end'])]
t=0.0; print(';FFMETADATA1')
for title,segs in chap:
    ln=sum(d(s) for s in segs); print('[CHAPTER]\nTIMEBASE=1/1000\nSTART=%d\nEND=%d\ntitle=%s'%(round(t*1000),round((t+ln)*1000),title)); t+=ln
PY
ffmpeg -v error -y -i OplogPic_v6_SILENT.mp4 -i $S/chapters.txt -map 0 -map_metadata 1 -map_chapters 1 -c copy OplogPic_v6_SILENT_chapters.mp4
ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate,codec_name -of default=nw=1 OplogPic_v6_SILENT_chapters.mp4; ffprobe -v error -show_chapters -of csv=p=0 OplogPic_v6_SILENT_chapters.mp4 | cut -d, -f5,6,7
