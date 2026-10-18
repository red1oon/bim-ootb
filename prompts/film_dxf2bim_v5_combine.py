#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — DXF2BIM film v5 (prompts/DXF2BIM_MODELLER_LANE.md §L31): lay the owner's Viewer tour (video + the clips' own sound) over the held window of the recorder take; everything after it moves up. Produces a rec-like dir for film_dxf2bim_v5_assemble.sh. READ the printed §V5 lines.
# usage: film_dxf2bim_v5_combine.py <rec dir (film.mp4, film.log, bd*.png)> <tour work dir (cut/master.mp4, cut/sfx_boost.wav, script/beats.log, ...)> <out dir> [<cards dir with pa1.png pa2.png>]   (PA_SEC='13,14' = the two closing cards' lengths, inserted before the take's final end card)
import sys, os, re, subprocess, shutil
rec, tour, out = [os.path.abspath(x) for x in sys.argv[1:4]]; os.makedirs(out, exist_ok=True)
cards = os.path.abspath(sys.argv[4]) if len(sys.argv) > 4 else None; PA = [float(x) for x in os.environ.get('PA_SEC', '13,14').split(',')] if cards else []
TAIL = float(os.environ.get('TAIL_SEC', '5.0'))   # the last frame (the end card) is held so its line can land
HERE = os.path.dirname(os.path.abspath(__file__))
if not os.path.exists(os.path.join(tour, 'cut', 'sfx_boost.wav')): subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', os.path.join(tour, 'cut', 'sfx.wav'), '-af', f"volume={os.environ.get('SFX_GAIN_DB', '5')}dB,alimiter=limit=0.95", os.path.join(tour, 'cut', 'sfx_boost.wav')])   # the clips' own sound, +5 dB, limited: audible under the narration
dur = lambda f: float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
log = open(os.path.join(rec, 'film.log')).read()
beats = [(m.group(1), float(m.group(2))) for m in re.finditer(r'§FILM_BEAT id=(\S+) t=([\d.]+)', log)]
chaps = [(int(m.group(1)), m.group(2), float(m.group(3))) for m in re.finditer(r'§FILM_CHAPTER n=(\d+) key=(\S+) t=([\d.]+)', log)]
B = dict(beats); tA, t3 = B['v01'], B['v03']; Tt = dur(os.path.join(tour, 'cut', 'master.mp4')); Rt = dur(os.path.join(rec, 'film.mp4')); shift = (tA + Tt) - t3
print(f'§V5 splice: take v01={tA:.2f} v03={t3:.2f} end={Rt:.2f}; tour={Tt:.2f}s; later beats move by {shift:+.2f}s; closing cards {PA}; final ~{Rt + shift + sum(PA) + TAIL:.1f}s')
tE = B['end']; shift = (tA + Tt) - t3
fcs = [f"[0:v]trim=start=0:end={tA:.3f},setpts=PTS-STARTPTS,fps=25,format=yuv420p[a]", "[1:v]fps=25,format=yuv420p,setpts=PTS-STARTPTS[b]",
       f"[0:v]trim=start={t3:.3f}:end={tE:.3f},setpts=PTS-STARTPTS,fps=25,format=yuv420p[c]"]
segs, extra_in = ['[a]', '[b]', '[c]'], []
for k, d in enumerate(PA):
    fcs.append(f"[{3 + k}:v]fps=25,format=yuv420p,trim=duration={d:.3f},setpts=PTS-STARTPTS[p{k}]"); segs.append(f'[p{k}]')
fcs.append(f"[0:v]trim=start={tE:.3f},setpts=PTS-STARTPTS,fps=25,format=yuv420p,tpad=stop_mode=clone:stop_duration={TAIL:.3f}[d]"); segs.append('[d]')
fcs.append(''.join(segs) + f"concat=n={len(segs)}:v=1:a=0[v]")
tot_pa = sum(PA)
fcs.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{tA:.3f}[s1];[2:a]aresample=48000[s2];anullsrc=r=48000:cl=stereo,atrim=0:{Rt - t3 + tot_pa + TAIL:.3f}[s3];[s1][s2][s3]concat=n=3:v=0:a=1[a]")
fc = ';'.join(fcs)
ins = ['-i', os.path.join(rec, 'film.mp4'), '-i', os.path.join(tour, 'cut', 'master.mp4'), '-i', os.path.join(tour, 'cut', 'sfx_boost.wav')]
for k in range(len(PA)): ins += ['-loop', '1', '-framerate', '25', '-i', os.path.join(cards, f'pa{k + 1}.png')]
r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y'] + ins + ['-filter_complex', fc,
                    '-map', '[v]', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', os.path.join(out, 'film.mp4'), '-map', '[a]', '-c:a', 'pcm_s16le', os.path.join(out, 'sfx.wav')], capture_output=True, text=True)
print('§V5 ffmpeg rc=' + str(r.returncode), r.stderr[-300:])
# beats: take beats before the splice, the tour's beats (minus its closing line) offset by tA, the take's later beats shifted
tb = [(m.group(1), float(m.group(2))) for m in re.finditer(r'id=(\S+) t=([\d.]+)', open(os.path.join(tour, 'script', 'beats.log')).read())]
final = [(k, t) for k, t in beats if t < tA - 1e-6] + [(k, t + tA) for k, t in tb if k not in ('e01', 'end')] + [(k, t + shift) for k, t in beats if t3 - 1e-6 <= t < tE - 1e-6]
cur = tE + shift
for k, d in enumerate(PA): final.append((f'pa0{k + 1}', cur)); cur += d
final.append(('end', cur)); final.append(('fin', cur + (Rt - tE) + TAIL))
final.sort(key=lambda x: x[1])
L = ''.join(f'§FILM_BEAT id={k} t={t:.3f}\n' for k, t in final) + ''.join(f'§FILM_CHAPTER n={n} key={key} t={(tA if n == 5 else t):.3f}\n' for n, key, t in chaps)
open(os.path.join(out, 'film.log'), 'w').write(L)
for f in os.listdir(rec):
    if re.match(r'bd[1-4]\.png$', f): shutil.copy(os.path.join(rec, f), out)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', '3.0', '-i', os.path.join(tour, 'cut', 'master.mp4'), '-frames:v', '1', os.path.join(out, 'bd5.png')])
open(os.path.join(out, 'backdrops.txt'), 'w').write(''.join(f'c{n} {os.path.join(out, "bd" + str(n) + ".png")}\n' for n, _, _ in chaps))
open(os.path.join(out, 'splice.txt'), 'w').write(f'tA={tA:.3f} tour={Tt:.3f} shift={shift:.3f}\n')
print(f'§V5 combined beats={len(final)} chapters={len(chaps)} out={out}')
