# OplogPic film (2026-10-11)

Narrated chapters movie of the owner's screen recording of https://red1oon.github.io/bim-ootb/oplogpic/. Same pipeline as the other films (`bim-compiler/prompts/FILM_NARRATION.md` PLAYBOOK + §BIM-TOOLS FILM): cards, the recording cut into pieces, Kokoro F/M dialogue, subtitles burned in, camera sounds mixed under it.

**Output:** `~/Videos/OplogPic_narrated_chapters_AFTER.mp4` (120.9 s, 1920x1080, 26 fps, 5 chapters). Work dir `~/Videos/oplogpic_work/` (cards, segments, fit, sounds). The recording `~/Videos/simplescreenrecorder-2026-10-11_07.04.51.mp4` is never touched; its own audio is dropped.

**Structure:** cover (3 s) · Ch1 card "Photoshop clone: kernel OPLOG version, mobile, no install, offline" (6.5 s) + the recording (0.8-58.0 s and 63.5-70.2 s; the idle 58-63.5 s is cut) · Ch2 card "Just a proof of concept, MIT licensed" (4.5 s) · roadmap card (26 s) · black PRIOR ART CHECK card (17 s).

**Files here:** `oplogpic_cards.py` (cards, black end card) · `oplogpic_dialogue.tsv` (id, cue, end, source, SHORT, DETAIL; every row names what on screen or which measured result it rests on) · `oplogpic_audio.py` (camera sound stems). The fitter, assembler and mux are `bim-compiler/prompts/film_narration_fit_kokoro_v3.py`, `film_assemble.py`, `film_narration_mux.py`.

**Rebuild:**
```
python3 oplogpic_cards.py <frame-of-the-recording.png> <W>/cards            # cover c1 c2 road end
ffmpeg ... (each card -> 26 fps mp4 with 0.35 s fades)                      # see the build log in the session notes
python3 film_assemble.py OplogPic_SILENT.mp4 1920 1080 26 cover c1 REC@0.8-58.0 REC@63.5-70.2 c2 road end
cd <W>/fit; cp oplogpic_dialogue.tsv .; cp film_narration_ass_head.txt ass_head.txt
FILM_SEC=120.88 ~/.local/share/film_narration/venv/bin/python film_narration_fit_kokoro_v3.py oplogpic_dialogue.tsv oplogpic 1.15
~/.local/share/film_narration/venv/bin/python oplogpic_audio.py <W>/snd 120.88 camera_sfx.wav camera_bed.wav
FILM_SEC=120.88 SFX_WAV=camera_sfx.wav SFX_VOL=0.6 MUSIC_WAV=camera_bed.wav MUSIC_VOL=0.45 python3 film_narration_mux.py oplogpic ../OplogPic_SILENT.mp4 ../OplogPic_muxed.mp4
ffmpeg -i OplogPic_muxed.mp4 -i chapters.txt -map 0 -map_metadata 1 -map_chapters 1 -c copy OplogPic_narrated_chapters_AFTER.mp4   # chapters.txt = FFMETADATA1, 5 [CHAPTER] blocks
```

**Camera sounds (real recordings, CC0):** BigSoundBank 0448 "iPhone camera", 3022 "Old camera trigger", 2391 and 0985 "SLR camera in burst mode" (licence read on each sound's page 2026-10-11: "CC0 license (public-domain equivalent)"). Saved as `~/Videos/OplogPic_camera_*_bigsoundbank_<id>_CC0.wav`. One snap per chapter card, the SLR burst plus more snaps on the black card, and a sparse click bed under the demo that is ducked under every voice.

**Facts spoken (all traced):** counter 3 -> 4 -> 6 -> 7 -> 8 -> 9 -> 10 -> 3 read off the recording's own "N ops in the log" line; ten blend modes = the list on screen; MIT = repo `LICENSE` (MIT, Copyright 2026 Redhuan D. Oon); offline and no install = live check on the https URL 2026-10-10 (service worker scope /oplogpic/, offline reload paints) and the owner's phone test; roadmap = the level plan agreed with the owner 2026-10-10; prior art = a passing web search 2026-10-10 (Photopea closed source; photobaer AGPL, Rust/WebAssembly; PhotoCraft; Krita and GIMP open-source desktop; Graphite node-based). The end card says "not a survey" and "Not found together" because nothing more than that search was done.

**Witness (run 2026-10-11):** §NARR_FIT 15/15 DETAIL, 0 SHORT, 0 SKIP · §NARR_TONE 0 WRONG (one "Where do I see that?" rose instead of falling, reworded "Can I see that?") · frames 3,143 = the silent assembly 3,143 · 5 chapters · integrated loudness -17.2 LUFS, true peak -1.4 dBFS · silences >= 2 s: 2.6 s and 2.3 s only (the first mux left an 8.3 s gap on the end card, filled with more snaps) · subtitle font DejaVu Sans.
**Not done / not claimed:** no native-speaker listen; English only; the camera bed's taste is the owner's to judge (volume is `MUSIC_VOL`/`SFX_VOL`); no claim that no other clone exists.

## Malay version (2026-10-11)
**Output:** `~/Videos/OplogPic_MALAY_narrated_chapters_AFTER.mp4` (129.9 s, 1920x1080, 26 fps, 5 chapters in Malay; silent master `~/Videos/oplogpic_work/OplogPic_MALAY_SILENT.mp4`). Work dir `~/Videos/oplogpic_work/{cards_ms,seg_ms,fit_ms}`.
**What differs from the English film:** cards and captions in Malay (`python3 oplogpic_cards.py <backdrop> <out> ms`); voices Microsoft Edge TTS `ms-MY-Yasmin` (F) / `ms-MY-Osman` (M) via `film_narration_fit_edge.py oplogpic_dialogue_ms.tsv oplogpic ms` (script text is sent to Microsoft; clips are cached so a re-run makes no calls; the fitter burns in its Malay credit line "Suara: dijana AI (Microsoft Edge TTS, awan) · Skrip diarahkan oleh red1" on the closing card). Malay runs about 1.5 to 2 times longer than English in the first draft, so the wording was tightened and four card sections lengthened: Ch1 card 7.5 s (English 6.5), Ch2 card 5.5 (4.5), roadmap 30 (26), closing card 20 (17). The recording's own pieces and every source line are unchanged; only the cues move (`oplogpic_dialogue_ms.tsv`). Camera stems rebuilt for the new layout: `oplogpic_audio.py <snd> 129.88 sfx.wav bed.wav cover=0.05 c1=3.00 c2=74.38 road=79.88 end=109.95 bed0=12.0 bed1=73.5`.
**Witness (run 2026-10-11):** §NARR_FIT 15/15 DETAIL, 0 SHORT, 0 SKIP (first draft 5 DETAIL, 9 SHORT, 1 SKIP; fixed by tightening words and by extending windows where the next scene had not started, never by raising the speed limit) · §NARR_TONE 0 WRONG · frames 3,377 = Malay silent master 3,377 · 5 chapters · integrated loudness -16.2 LUFS, true peak -1.5 dBFS · silences >= 2 s: 3.1 s mid-film and a 4.5 s tail on the closing card · subtitle font DejaVu Sans.
**Slip caught before delivery:** the first Malay mux used the English silent master by mistake (wrong path); the output was deleted and redone with the Malay master. The frame-count check (3,377) is what proves the right video is under the Malay audio.
**Not done / not claimed:** no native-speaker listen (Malay term choices such as "calit" for smudge, "adunan" for blend and "geganti" for relay are unreviewed); "kernel log op" is spoken in English-Malay mix as in the card; the claims on the closing card are the same passing-search claims as in English.
