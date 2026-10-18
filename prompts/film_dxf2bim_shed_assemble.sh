#!/bin/bash
# ⚠ DO NOT REMOVE — DXF2BIM shed film v3: the recorded take + English narration (Kokoro, two voices) + the established chapter cards (BIMCompiler film_title_cards.py, FILM_SET=shed) + burned subtitles + ducked music bed.
# usage: film_dxf2bim_shed_assemble.sh <rec dir with film.mp4, film.log, backdrops.txt, bd<n>.png> <tsv> <out.mp4>.   READ the printed POLY_TONE / CARDS / DETAIL lines and every witness line.
# (FILM_CARDS_PY overrides the cards script, e.g. a worktree copy before the BIMCompiler PR is merged)
set -e
REC=$(readlink -f $1); TSV=$(readlink -f $2); OUT=$3; P=~/bim-compiler/prompts; CARDS=${FILM_CARDS_PY:-$P/film_title_cards.py}; W=$(dirname $REC); cd $W
VD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $REC/film.mp4)
cp $REC/film.mp4 silent_master.mp4
grep -E "§FILM_(BEAT|CHAPTER)" $REC/film.log > beats.log
rm -rf fit; for i in 1 2 3; do POLY_CREDIT='Voices: AI-generated (Kokoro, local)  ·  Script directed by red1' python3 $P/film_narration_poly.py $TSV beats.log fit $VD > fit.log 2>&1; grep -q "lang=en wrong=0 rc=0" fit.log && break; sleep 2; done
grep -E "POLY_TONE" fit.log; echo DETAIL=$(grep -c "pick=DETAIL" fit.log) of $(grep -c POLY_FIT fit.log) SHORT=$(grep -c "pick=SHORT" fit.log) SKIP=$(grep -c "pick=SKIP" fit.log)
grep -E "§NARR_FIT" fit/fit_en.log | grep -v -- "-> DETAIL" || true
# chapter cards: a dimmed backdrop still over the footage for the card window + the card text, the chapter tag and the series tag appended to the narration subtitles
rm -rf cards; FILM_SET=shed python3 $CARDS beats.log $REC/backdrops.txt fit/poly.ass silent_master.mp4 cards | tee cards.log
grep -q "§CARDS FAIL" cards.log && exit 1
cp cards/carded.ass fit/poly.ass
sed -i -E '/^Style: (F|M)_/{s/,&H90000000,&H00000000,0,0,0,0,100,100,0,0,1,2\.6,0,2,/,\&H50101418,\&H00000000,0,0,0,0,100,100,0,0,3,10,0,2,/}' fit/poly.ass; grep -c "0,0,3,10,0,2," fit/poly.ass
python3 $P/film_music_bed.py music_bed.wav $VD | tail -1
cd fit; rm -f $OUT; MUSIC_WAV=$W/music_bed.wav MUSIC_STEM=$W/music_stem.wav FILM_SEC=$VD python3 $P/film_narration_mux.py poly ../cards/carded.mp4 $OUT | cut -c1-120; cd ..
echo frames: $(ffprobe -v error -count_frames -show_entries stream=nb_read_frames -of csv=p=0 -select_streams v $OUT) master: $(ffprobe -v error -count_frames -show_entries stream=nb_read_frames -of csv=p=0 -select_streams v cards/carded.mp4) dur=$VD
ffmpeg -hide_banner -i $OUT -af ebur128 -f null - 2>&1 | grep -A1 "Integrated" | tail -1
echo "silences (-40 dB, >= 2 s):"; ffmpeg -hide_banner -i $OUT -af silencedetect=n=-40dB:d=2 -f null - 2>&1 | grep -E "silence_duration" | sed 's/.*silence_end: \([0-9.]*\) | silence_duration: \([0-9.]*\).*/  end=\1 dur=\2/' || true
