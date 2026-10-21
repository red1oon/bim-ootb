#!/bin/bash
# ⚠ DO NOT REMOVE — the 2D wand film (prompts/FILM_DXF2BIM_WAND.md): recorder take + narration (EN, Kokoro local) + chapter cards (FILM_SET=wand) + soft music bed. Read every log line it prints.
# usage: film_dxf2bim_wand_assemble.sh <take dir (film.mp4, backdrops.txt) > <take log (film.log with §FILM_BEAT/CHAPTER)> <tsv> <out.mp4>   (FILM_CARDS_PY = the cards script with the wand set)
set -e
REC=$(readlink -f $1); LOG=$(readlink -f $2); TSV=$(readlink -f $3); OUT=$(readlink -m $4); P=~/bim-compiler/prompts; CARDS=${FILM_CARDS_PY:?set FILM_CARDS_PY}; W=$REC/work_en; rm -rf $W; mkdir -p $W; cd $W
VD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $REC/film.mp4)
cp $REC/film.mp4 silent_master.mp4; grep -E "§FILM_(BEAT|CHAPTER)" $LOG > beats.log
CR='Voices: AI (Kokoro, local)  ·  Script: red1'
for i in 1 2 3; do POLY_CREDIT="$CR" python3 $P/film_narration_poly.py $TSV beats.log fit $VD > fit.log 2>&1; grep -q "lang=en wrong=0 rc=0" fit.log && break; sleep 2; done
grep -E "POLY_TONE" fit.log; echo "DETAIL=$(grep -c 'pick=DETAIL' fit.log) of $(grep -c POLY_FIT fit.log) SHORT=$(grep -c 'pick=SHORT' fit.log) SKIP=$(grep -c 'pick=SKIP' fit.log)"
rm -rf cards; FILM_SET=wand python3 $CARDS beats.log $REC/backdrops.txt fit/poly.ass silent_master.mp4 cards | tee cards.log
grep -q "§CARDS FAIL" cards.log && exit 1
cp cards/carded.ass fit/poly.ass
sed -i -E '/^Style: (F|M)_/{s/,&H90000000,&H00000000,0,0,0,0,100,100,0,0,1,2\.6,0,2,/,\&H50101418,\&H00000000,0,0,0,0,100,100,0,0,3,10,0,2,/}' fit/poly.ass
python3 $P/film_music_bed.py music_bed.wav $VD | tail -1
cd fit; rm -f $OUT; MUSIC_WAV=$W/music_bed.wav MUSIC_STEM=$W/music_stem.wav FILM_SEC=$VD python3 $P/film_narration_mux.py poly ../cards/carded.mp4 $OUT | cut -c1-140; cd ..
echo frames: $(ffprobe -v error -count_frames -show_entries stream=nb_read_frames -of csv=p=0 -select_streams v $OUT) master: $(ffprobe -v error -count_frames -show_entries stream=nb_read_frames -of csv=p=0 -select_streams v cards/carded.mp4) dur=$VD
ffmpeg -hide_banner -i $OUT -af ebur128 -f null - 2>&1 | grep -A1 "Integrated" | tail -1
echo "silences (-40 dB, >= 2 s):"; ffmpeg -hide_banner -i $OUT -af silencedetect=n=-40dB:d=2 -f null - 2>&1 | grep -E "silence_duration" | sed 's/.*silence_end: \([0-9.]*\) | silence_duration: \([0-9.]*\).*/  end=\1 dur=\2/' || true
echo "black frames:"; ffmpeg -hide_banner -i $OUT -vf blackdetect=d=0.5:pix_th=0.05 -an -f null - 2>&1 | grep -c black_start || true
