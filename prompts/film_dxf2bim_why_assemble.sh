#!/bin/bash
# ⚠ DO NOT REMOVE — the Why-markings film (prompts/FILM_DXF2BIM_WHY_MARKINGS.md): recorder take + narration (EN, Kokoro local; the TSV FILLED from this take by film_narration_fill.js) + chapter cards (FILM_SET=why) + soft music bed. Read every log line it prints.
# usage: film_dxf2bim_why_assemble.sh <take dir (film.mp4, backdrops.txt)> <take.log (§FILM_BEAT/CHAPTER/FACT)> <filled tsv> <out.mp4>   (FILM_CARDS_PY = the compiler's film_title_cards.py, run with FILM_SET=why; BEAT_MIN_JSON = the recorder's beat_min.json)
set -e
REC=$(readlink -f $1); LOG=$(readlink -f $2); TSV=$(readlink -f $3); OUT=$(readlink -m $4); BM=$(readlink -f ${BEAT_MIN_JSON:?set BEAT_MIN_JSON}); P=~/bim-compiler/prompts; CARDS=${FILM_CARDS_PY:?set FILM_CARDS_PY}; W=$REC/work_en; rm -rf $W; mkdir -p $W; cd $W
VD0=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $REC/film.mp4)
grep -E "§FILM_(BEAT|CHAPTER)" $LOG > beats.log
# §LAST_BEAT (FILM_DXF2BIM_WAND.md "The last beat", same here): the screencast stops sending frames on the static end card, so pad the master to the recorder's own hold of the last beat, then close that beat with a terminal one (the fitter slots a beat up to the NEXT beat)
read LAST TL PAD <<< $(python3 -I -c 'import re,json,sys;b=[(m.group(1),float(m.group(2))) for m in re.finditer(r"§FILM_BEAT id=(\S+) t=([\d.]+)",open(sys.argv[1]).read())];k,t=max(b,key=lambda x:x[1]);m=json.load(open(sys.argv[2]));print(k,t,max(0.0,t+m[k]+0.8+1.2-float(sys.argv[3])))' beats.log $BM $VD0)
[ -n "$PAD" ] || { echo "§LAST_BEAT FAIL no pad (beat log / BEAT_MIN_JSON)"; exit 1; }
ffmpeg -v error -y -i $REC/film.mp4 -vf "tpad=stop_mode=clone:stop_duration=$PAD,format=yuv420p" -c:v libx264 -crf 17 -preset medium silent_master.mp4
VD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 silent_master.mp4); echo "§LAST_BEAT id=$LAST t=$TL take=$VD0 pad=$PAD master=$VD"
{ cat beats.log; echo "§FILM_BEAT id=_fin t=$VD"; } > beats_fit.log   # the fitter only; the cards keep the take's beats (tags end at the last beat, the end card stays clean)
CR='Voices: AI (Kokoro, local)  ·  Script: red1'
for i in 1 2 3; do POLY_CREDIT="$CR" python3 $P/film_narration_poly.py $TSV beats_fit.log fit $VD > fit.log 2>&1; grep -q "lang=en wrong=0 rc=0" fit.log && break; sleep 2; done
grep -E "POLY_TONE" fit.log; echo "DETAIL=$(grep -c 'pick=DETAIL' fit.log) of $(grep -c POLY_FIT fit.log) SHORT=$(grep -c 'pick=SHORT' fit.log) SKIP=$(grep -c 'pick=SKIP' fit.log)"
NF=$(grep -c POLY_FIT fit.log); NR=$(grep -c . $TSV); [ "$NF" = "$NR" ] || { echo "§LAST_BEAT FAIL fitted=$NF rows=$NR (a row had no slot)"; exit 1; }
rm -rf cards; FILM_SET=${FILM_SET:-why} python3 $CARDS beats.log $REC/backdrops.txt fit/poly.ass silent_master.mp4 cards | tee cards.log
grep -q "§CARDS FAIL" cards.log && exit 1
cp cards/carded.ass fit/poly.ass
sed -i -E '/^Style: (F|M)_/{s/,&H90000000,&H00000000,0,0,0,0,100,100,0,0,1,2\.6,0,2,/,\&H50101418,\&H00000000,0,0,0,0,100,100,0,0,3,10,0,2,/}' fit/poly.ass
python3 $P/film_music_bed.py music_bed.wav $VD | tail -1
cd fit; rm -f $OUT; MUSIC_WAV=$W/music_bed.wav MUSIC_STEM=$W/music_stem.wav FILM_SEC=$VD python3 $P/film_narration_mux.py poly ../cards/carded.mp4 $OUT | cut -c1-140; cd ..
echo frames: $(ffprobe -v error -count_frames -show_entries stream=nb_read_frames -of csv=p=0 -select_streams v $OUT) master: $(ffprobe -v error -count_frames -show_entries stream=nb_read_frames -of csv=p=0 -select_streams v cards/carded.mp4) dur=$VD
ffmpeg -hide_banner -i $OUT -af ebur128 -f null - 2>&1 | grep -A1 "Integrated" | tail -1
echo "silences (-40 dB, >= 2 s):"; ffmpeg -hide_banner -i $OUT -af silencedetect=n=-40dB:d=2 -f null - 2>&1 | grep -E "silence_duration" | sed 's/.*silence_end: \([0-9.]*\) | silence_duration: \([0-9.]*\).*/  end=\1 dur=\2/' || true
echo "black frames:"; ffmpeg -hide_banner -i $OUT -vf blackdetect=d=0.5:pix_th=0.05 -an -f null - 2>&1 | grep -c black_start || true
