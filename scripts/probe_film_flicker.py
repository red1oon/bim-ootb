#!/usr/bin/env python3
"""
probe_film_flicker.py — §42: judge a BAKED FILM for frame-to-frame luma instability, from the mp4's
own pixels. No GPU, no browser, no re-bake.

WHY THIS EXISTS: the shipped §-log cannot tell a flickering frame from a good one — a bake that
swings 35 % of the picture between building and sky prints `§MAXQ_QUALITY unconverged=0` and calls
itself clean (MEP_CLASH_REVEAL_MOVIE.md §40.0, §42). This is the missing instrument.

WHAT IT MEASURES: per-frame mean luma via ffmpeg `signalstats`, then
  - |dY| > THRESH        a frame that jumps against its predecessor  (the flicker the user sees)
  - dip                  a frame darker than BOTH neighbours          (a single bad frame)
per named film window, so a defect is localised to a beat rather than reported as a film-wide rate.

IT CAN SAY NO: VACUOUS (ffmpeg produced no frames), and INCONCLUSIVE when a window holds fewer than
MIN_FRAMES — a window too short to judge must not report a clean 0.

Usage: python3 scripts/probe_film_flicker.py FILM.mp4 [--fps 24] [--thresh 15]
                                             [--win NAME:FROM:TO ...]
Default windows are the §CINEMA_BEATS structure of a full film, as fractions of its duration.
"""
import re, subprocess, sys, os, tempfile
import numpy as np

THRESH = 15.0
MIN_FRAMES = 24

def arg(k, d=None):
    return sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d

def luma(path):
    out = os.path.join(tempfile.mkdtemp(), 'y.txt')
    subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf',
                    'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=' + out,
                    '-f', 'null', '-'], check=True)
    return np.array([float(m.group(1)) for l in open(out)
                     for m in [re.search(r'YAVG=([0-9.]+)', l)] if m])

def main():
    film = sys.argv[1]
    fps = float(arg('--fps', 24))
    thresh = float(arg('--thresh', THRESH))
    y = luma(film)
    n = len(y)
    if n < 3:
        print('§FILM_FLICKER VACUOUS — ffmpeg returned %d frames from %s' % (n, film)); return 1
    dur = n / fps
    d = np.abs(np.diff(y))
    prev = np.r_[y[0], y[:-1]]; nxt = np.r_[y[1:], y[-1]]
    base = np.minimum(prev, nxt)
    rel = np.zeros(n); rel[1:-1] = (base[1:-1] - y[1:-1]) / np.maximum(1e-9, base[1:-1])
    print('§FILM_FLICKER film=%s frames=%d dur=%.2fs fps=%g meanY=%.1f thresh=%g' %
          (os.path.basename(film), n, dur, fps, y.mean(), thresh))

    wins = []
    for a in sys.argv:
        if a.startswith('--win'):
            pass
    custom = [v for i, v in enumerate(sys.argv) if i and sys.argv[i - 1] == '--win']
    if custom:
        for c in custom:
            nm, f0, f1 = c.split(':'); wins.append((nm, float(f0), float(f1)))
    else:
        # §CINEMA_BEATS fractions of a full film (dive/out/reveal/rise), the structure §37 measured
        wins = [('buildup+dive', 0.0, 0.46 * dur), ('cruise', 0.46 * dur, 0.750 * dur),
                ('reveal round', 0.750 * dur, 0.9334 * dur),
                ('storey reveal', 0.9334 * dur, 0.959 * dur), ('orbit', 0.959 * dur, dur)]
    worst = 0.0; bad = 0; judged = 0
    for nm, a, b in wins:
        i0, i1 = int(a * fps), min(n - 1, int(b * fps))
        if i1 - i0 < MIN_FRAMES:
            print('§FILM_FLICKER_WIN %-14s %7.2f-%7.2fs INCONCLUSIVE — only %d frames, fewer than %d'
                  % (nm, a, b, max(0, i1 - i0), MIN_FRAMES)); continue
        judged += 1
        dd = d[i0:i1]; rr = rel[i0:i1]
        jumps = int((dd > thresh).sum()); dips = int((rr > 0.08).sum())
        # The buildup window is EXCLUDED from the verdict and printed as context: elements really do
        # appear there, so a large |dY| is the film working, not flickering. Measured on four films,
        # every one of them jumps in this window (37-151 frames) and none of it is a defect.
        if not nm.startswith('buildup'):
            worst = max(worst, float(dd.max())); bad += jumps
        secs = ' '.join('%.2f' % ((i0 + i) / fps) for i in np.where(dd > thresh)[0][:8])
        print('§FILM_FLICKER_WIN %-14s %7.2f-%7.2fs n=%4d meanY=%5.1f jumps>%.0f=%3d (%.2f/s) dips=%2d max|dY|=%5.1f %s'
              % (nm, a, b, i1 - i0, y[i0:i1].mean(), thresh, jumps, jumps / max(1e-9, b - a), dips, dd.max(), secs))
    if not judged:
        print('§FILM_FLICKER INCONCLUSIVE — no window held enough frames to judge'); return 1
    print('§FILM_FLICKER_VERDICT %s jumps>%.0f=%d max|dY|=%.1f windowsJudged=%d '
          '(buildup excluded — its change is the building being built)'
          % ('PASS' if bad == 0 else 'FAIL', thresh, bad, worst, judged))
    return 0 if bad == 0 else 1

if __name__ == '__main__':
    sys.exit(main())
