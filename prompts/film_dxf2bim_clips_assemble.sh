#!/bin/bash
# ⚠ DO NOT REMOVE — DXF2BIM film v5 (prompts/DXF2BIM_MODELLER_LANE.md §L31): narration (Kokoro EN / Edge MS) + the owner's own clip audio under it + burned subtitles. No music bed (the clips' sound effects are the aesthetic). READ the printed POLY/NARR lines.
# usage: film_dxf2bim_clips_assemble.sh <work dir with cut/master.mp4, cut/sfx.wav, script/beats.log, script/film_narration_*_<lang>.tsv> <en|ms> <out.mp4>
set -e
W=$(readlink -f $1); L=$2; OUT=$3; P=~/bim-compiler/prompts; cd $W
VD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 cut/master.mp4)
[ -f cut/sfx_boost.wav ] || ffmpeg -loglevel error -y -i cut/sfx.wav -af "volume=${SFX_GAIN_DB:-5}dB,alimiter=limit=0.95" cut/sfx_boost.wav
rm -rf fit_$L
if [ "$L" = ms ]; then CR='Suara: dijana AI (Microsoft Edge TTS, awan)  ·  Skrip diarahkan oleh red1  ·  Bunyi: rakaman Viewer'; else CR='Voices: AI-generated (Kokoro, local)  ·  Script directed by red1  ·  Sound: the Viewer, as recorded'; fi
for i in 1 2 3; do POLY_CREDIT="$CR" python3 $P/film_narration_poly.py script/film_narration_dxf2bim_clips_$L.tsv script/beats.log fit_$L $VD > fit_$L.log 2>&1; grep -q "lang=$L wrong=0 rc=0" fit_$L.log && break; sleep 2; done
grep -E "POLY_TONE|POLY_GLOSS" fit_$L.log; echo "DETAIL=$(grep -c 'pick=DETAIL' fit_$L.log) of $(grep -c POLY_FIT fit_$L.log) SHORT=$(grep -c 'pick=SHORT' fit_$L.log) SKIP=$(grep -c 'pick=SKIP' fit_$L.log)"
grep -E "§NARR_FIT" fit_$L/fit_$L.log | grep -v -- "-> DETAIL" || true
# subtitles: the series' boxed style
sed -i -E '/^Style: (F|M)/{s/,&H90000000,&H00000000,0,0,0,0,100,100,0,0,1,2\.6,0,2,/,\&H50101418,\&H00000000,0,0,0,0,100,100,0,0,3,10,0,2,/}' fit_$L/poly.ass
cd fit_$L; rm -f $OUT; SFX_WAV=$W/cut/sfx_boost.wav SFX_VOL=${SFX_VOL:-1.0} FILM_SEC=$VD python3 $P/film_narration_mux.py poly ../cut/master.mp4 $OUT | cut -c1-140; cd ..
echo frames: $(ffprobe -v error -count_frames -show_entries stream=nb_read_frames -of csv=p=0 -select_streams v $OUT) master: $(ffprobe -v error -count_frames -show_entries stream=nb_read_frames -of csv=p=0 -select_streams v cut/master.mp4) dur=$VD
ffmpeg -hide_banner -i $OUT -af ebur128 -f null - 2>&1 | grep -A1 "Integrated" | tail -1
echo "silences (-40 dB, >= 2 s):"; ffmpeg -hide_banner -i $OUT -af silencedetect=n=-40dB:d=2 -f null - 2>&1 | grep -E "silence_duration" | sed 's/.*silence_end: \([0-9.]*\) | silence_duration: \([0-9.]*\).*/  end=\1 dur=\2/' || true
