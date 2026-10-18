#!/bin/bash
# ⚠ DO NOT REMOVE — DXF2BIM film v5 (§L31): the combined take (recorder chapters + the owner's Viewer tour) + narration (EN Kokoro / MS Edge) + chapter cards + the clips' own sound under the tour + a music bed everywhere ELSE (muted over the tour, 1.5 s ramps) + burned subtitles. READ the printed POLY/NARR/CARDS lines.
# usage: film_dxf2bim_v5_assemble.sh <combined dir (film.mp4, film.log, sfx.wav, splice.txt, backdrops.txt)> <tsv> <lang en|ms> <out.mp4>      (FILM_CARDS_PY overrides the cards script)
set -e
REC=$(readlink -f $1); TSV=$(readlink -f $2); L=$3; OUT=$4; P=~/bim-compiler/prompts; CARDS=${FILM_CARDS_PY:-$P/film_title_cards.py}; W=$REC/work_$L; rm -rf $W; mkdir -p $W; cd $W
VD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $REC/film.mp4)
cp $REC/film.mp4 silent_master.mp4; grep -E "§FILM_(BEAT|CHAPTER)" $REC/film.log > beats.log
if [ "$L" = ms ]; then CR='Suara: dijana AI (Microsoft Edge TTS, awan)  ·  Skrip diarahkan oleh red1  ·  Bunyi lawatan: rakaman Viewer'; else CR='Voices: AI-generated (Kokoro, local)  ·  Script directed by red1  ·  Tour sound: the Viewer, as recorded'; fi
for i in 1 2 3; do POLY_CREDIT="$CR" python3 $P/film_narration_poly.py $TSV beats.log fit $VD > fit.log 2>&1; grep -q "lang=$L wrong=0 rc=0" fit.log && break; sleep 2; done
grep -E "POLY_TONE" fit.log; echo "DETAIL=$(grep -c 'pick=DETAIL' fit.log) of $(grep -c POLY_FIT fit.log) SHORT=$(grep -c 'pick=SHORT' fit.log) SKIP=$(grep -c 'pick=SKIP' fit.log)"
grep -E "§NARR_FIT" fit/fit_$L.log | grep -v -- "-> DETAIL" || true
rm -rf cards; FILM_SET=shed python3 $CARDS beats.log $REC/backdrops.txt fit/poly.ass silent_master.mp4 cards | tee cards.log
grep -q "§CARDS FAIL" cards.log && exit 1
cp cards/carded.ass fit/poly.ass
sed -i -E '/^Style: (F|M)_/{s/,&H90000000,&H00000000,0,0,0,0,100,100,0,0,1,2\.6,0,2,/,\&H50101418,\&H00000000,0,0,0,0,100,100,0,0,3,10,0,2,/}' fit/poly.ass; grep -c "0,0,3,10,0,2," fit/poly.ass
# the music bed, muted over the tour window (the clips' own sound is the aesthetic there)
python3 $P/film_music_bed.py music_raw.wav $VD | tail -1
read A TT < <(sed -E 's/tA=([0-9.]+) tour=([0-9.]+).*/\1 \2/' $REC/splice.txt); B=$(python3 -c "print($A+$TT)")
ffmpeg -loglevel error -y -i music_raw.wav -af "volume='if(lt(t,$A-1.5),1,if(lt(t,$A),($A-t)/1.5,if(lt(t,$B),0,if(lt(t,$B+1.5),(t-$B)/1.5,1))))':eval=frame" music_bed.wav
echo "music muted ${A}s..${B}s"
cd fit; rm -f $OUT; SFX_WAV=$REC/sfx.wav SFX_VOL=${SFX_VOL:-1.0} MUSIC_WAV=$W/music_bed.wav MUSIC_STEM=$W/music_stem.wav FILM_SEC=$VD python3 $P/film_narration_mux.py poly ../cards/carded.mp4 $OUT | cut -c1-140; cd ..
echo frames: $(ffprobe -v error -count_frames -show_entries stream=nb_read_frames -of csv=p=0 -select_streams v $OUT) master: $(ffprobe -v error -count_frames -show_entries stream=nb_read_frames -of csv=p=0 -select_streams v cards/carded.mp4) dur=$VD
ffmpeg -hide_banner -i $OUT -af ebur128 -f null - 2>&1 | grep -A1 "Integrated" | tail -1
echo "silences (-40 dB, >= 2 s):"; ffmpeg -hide_banner -i $OUT -af silencedetect=n=-40dB:d=2 -f null - 2>&1 | grep -E "silence_duration" | sed 's/.*silence_end: \([0-9.]*\) | silence_duration: \([0-9.]*\).*/  end=\1 dur=\2/' || true
