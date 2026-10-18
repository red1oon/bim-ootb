#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — DXF2BIM film v5 (prompts/DXF2BIM_MODELLER_LANE.md §L31): cut the owner's three Viewer clips into one compact master. Deterministic; the inputs are never edited. READ the printed §CUT lines.
# usage: film_dxf2bim_clips_cut.py <outdir> <clip1> <clip2> <clip3>   -> <outdir>/master.mp4 (video only, 1920x1080, 25 fps), sfx.wav (the clips' own audio, cut along), map.json (per clip: [src_start, src_end, master_start])
import sys, os, json, subprocess, numpy as np
HEAD, TAIL, STATIC_PCT, STATIC_MIN, STATIC_KEEP, MERGE_GAP = 5.0, 3.8, 0.15, 2.4, 3.0, 0.6   # §L31 cut rules
out, clips = sys.argv[1], sys.argv[2:]; os.makedirs(out, exist_ok=True)
# stretches that carry a panel the narration explains keep their length: HOLD='<clip no>:<run start s>=<keep s>,...' (a run is matched by its start within 1 s)
# the last frame of a clip is frozen so the narration can land on it: HOLD_END='<clip no>=<seconds>,...' (video: cloned last frame; the clip's own audio: silence)
HOLD_END = {int(a) - 1: float(b) for a, b in (x.split('=') for x in os.environ.get('HOLD_END', '').split(',') if x)}
HOLD = [(int(a.split(':')[0]) - 1, float(a.split(':')[1]), float(b)) for a, b in (x.split('=') for x in os.environ.get('HOLD', '').split(',') if x)]
def dur(f): return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
def static_runs(f):
    W, H = 192, 108
    a = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-vf', f'fps=5,scale={W}:{H},format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout, dtype=np.uint8).reshape(-1, H, W).astype(np.int16)
    d = [(np.abs(a[i] - a[i - 1]) > 12).mean() * 100 for i in range(1, len(a))]; runs, run = [], None
    for i, v in enumerate(d):
        if v < STATIC_PCT:
            if run is None: run = i
        else:
            if run is not None: runs.append([run / 5, i / 5]); run = None
    if run is not None: runs.append([run / 5, len(d) / 5])
    m = []
    for r in runs:
        if m and r[0] - m[-1][1] < MERGE_GAP: m[-1][1] = r[1]
        else: m.append(r[:])
    return m
plan, mp, mt = [], [], 0.0
for k, f in enumerate(clips):
    d = dur(f); lo, hi = HEAD, d - TAIL; cuts = []
    for s, e in static_runs(f):
        s, e = max(s, lo), min(e, hi)
        keepL = STATIC_KEEP
        for hk, hs, hv in HOLD:
            if hk == k and abs(hs - s) <= 1.0: keepL = hv
        if e - s >= STATIC_MIN and e - s > keepL: cuts.append((s + keepL, e))
    keep, cur = [], lo
    for s, e in cuts: keep.append((cur, s)); cur = e
    keep.append((cur, hi)); m = []
    for s, e in keep:
        if e - s < 0.2: continue
        ext = HOLD_END.get(k, 0.0) if (s, e) == keep[-1] else 0.0
        plan.append((k, s, e, ext)); m.append([round(s, 3), round(e, 3), round(mt, 3), ext]); mt += e - s + ext
    mp.append(m); print(f'§CUT clip{k + 1} src={d:.1f}s window={lo:.1f}..{hi:.1f} static_cuts={[(round(a, 1), round(b, 1)) for a, b in cuts]} kept={sum(e - s for s, e in keep):.1f}s')
print(f'§CUT total master={mt:.1f}s pieces={len(plan)}')
fc, ins = [], []
for k, f in enumerate(clips): ins += ['-i', f]
for i, (k, s, e, ext) in enumerate(plan):
    L = e - s
    fc.append(f'[{k}:v]trim=start={s:.3f}:end={e:.3f},setpts=PTS-STARTPTS,fps=25,format=yuv420p' + (f',tpad=stop_mode=clone:stop_duration={ext:.3f}' if ext else '') + f'[v{i}]')
    fc.append(f'[{k}:a]atrim=start={s:.3f}:end={e:.3f},asetpts=PTS-STARTPTS,aresample=48000,afade=t=in:d=0.04,afade=t=out:st={max(0, L - 0.04):.3f}:d=0.04' + (f',apad=pad_dur={ext:.3f}' if ext else '') + f'[a{i}]')
fc.append(''.join(f'[v{i}][a{i}]' for i in range(len(plan))) + f'concat=n={len(plan)}:v=1:a=1[vo][ao]')
r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y'] + ins + ['-filter_complex', ';'.join(fc), '-map', '[vo]', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', os.path.join(out, 'master.mp4'), '-map', '[ao]', '-c:a', 'pcm_s16le', '-ar', '48000', os.path.join(out, 'sfx.wav')], capture_output=True, text=True)
print('§CUT ffmpeg rc=' + str(r.returncode), r.stderr[-300:])
json.dump({'clips': [os.path.basename(c) for c in clips], 'map': mp, 'master_sec': mt}, open(os.path.join(out, 'map.json'), 'w'), indent=1)
