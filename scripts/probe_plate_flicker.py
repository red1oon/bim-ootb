#!/usr/bin/env python3
"""
probe_plate_flicker.py — §38.1 / §26.12: MEASURE the plate-beat flicker in the shipped film's
own pixels, before anything is changed.

Inputs (all already on disk, no GPU, no bake):
  out/frames_plate/f%05d.png                       frames 216.. of the 720p Hospital film
  out/Hospital_FULL_measure_2026-09-08_poses.json  [frameIdx, cx,cy,cz, tx,ty,tz, perfNow]
  plate corners + envelope from the film's own §SLAB_BEAT_* log lines (passed in below)

Emits §PLATE_FLICKER lines. Nothing is inferred: every number is counted from the pixels.
"""
import json, math, sys
import numpy as np
from PIL import Image

FPS = 24.0
W, H = 1280, 720
FOV_DEG = 60.0

# §SLAB_BEAT_DIAG corners (THREE world) + §SLAB_BEAT_PICK / _ENVELOPE from
# out/Hospital_FULL_measure_2026-09-08.log
CORNERS = [(-37.05, 10.60, 31.49), (50.51, 10.60, 31.49), (50.51, 10.60, -55.13), (-37.05, 10.60, -55.13)]
POP_SEC, FADE_IN, HOLD, FADE_OUT = 9.38, 0.6, 1.0, 0.6
ENV_END = POP_SEC + FADE_IN + HOLD + FADE_OUT          # 11.58
TINT_RGB = (0xff, 0xb3, 0x00)                          # §SLAB_BEAT_TINT color=#ffb300

def view_matrix(eye, tgt, up=(0.0, 1.0, 0.0)):
    e = np.array(eye, float); t = np.array(tgt, float); u = np.array(up, float)
    f = t - e; f /= np.linalg.norm(f)
    s = np.cross(f, u); n = np.linalg.norm(s)
    if n < 1e-9:
        u = np.array([0.0, 0.0, 1.0]); s = np.cross(f, u); n = np.linalg.norm(s)
    s /= n
    v = np.cross(s, f)
    return np.stack([s, v, -f]), e

NEAR = 0.1

def to_cam(pts, eye, tgt):
    R, e = view_matrix(eye, tgt)
    return (np.array(pts, float) - e) @ R.T          # camera space, -Z forward

def clip_near(cam):
    """Sutherland-Hodgman against z_cam <= -NEAR (in front of the camera). A plate the camera
    flies OVER has corners behind it every frame of the dive; rejecting the whole polygon there
    (the first cut of this probe did) makes the measurement VACUOUS, not clean."""
    out = []
    n = len(cam)
    for i in range(n):
        a = cam[i]; b = cam[(i + 1) % n]
        ain = (-a[2]) > NEAR; bin_ = (-b[2]) > NEAR
        if ain: out.append(a)
        if ain != bin_:
            t = ((-a[2]) - NEAR) / ((-a[2]) - (-b[2]))
            out.append(a + (b - a) * t)
    return np.array(out) if out else None

def cam_to_px(cam):
    zc = -cam[:, 2]
    fpx = (H / 2.0) / math.tan(math.radians(FOV_DEG) / 2.0)
    x = W / 2.0 + cam[:, 0] * fpx / zc
    y = H / 2.0 - cam[:, 1] * fpx / zc
    return np.stack([x, y], 1), zc

def project(pts, eye, tgt):
    cam = to_cam(pts, eye, tgt)
    return cam_to_px(cam)

def poly_mask(poly, w, h):
    """even-odd scanline fill, no external deps"""
    m = np.zeros((h, w), bool)
    n = len(poly)
    ys = [p[1] for p in poly]
    y0 = max(0, int(math.floor(min(ys)))); y1 = min(h - 1, int(math.ceil(max(ys))))
    for y in range(y0, y1 + 1):
        yc = y + 0.5
        xs = []
        for i in range(n):
            ax, ay = poly[i]; bx, by = poly[(i + 1) % n]
            if (ay <= yc < by) or (by <= yc < ay):
                xs.append(ax + (yc - ay) * (bx - ax) / (by - ay))
        xs.sort()
        for i in range(0, len(xs) - 1, 2):
            a = max(0, int(math.ceil(xs[i] - 0.5))); b = min(w - 1, int(math.floor(xs[i + 1] - 0.5)))
            if b >= a: m[y, a:b + 1] = True
    return m

def seg_mask(a, b, w, h, rad=2):
    m = np.zeros((h, w), bool)
    n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) + 1
    if n > 20000: return m
    for i in range(n + 1):
        t = i / max(1, n)
        x = int(round(a[0] + (b[0] - a[0]) * t)); y = int(round(a[1] + (b[1] - a[1]) * t))
        x0, x1 = max(0, x - rad), min(w - 1, x + rad)
        y0, y1 = max(0, y - rad), min(h - 1, y + rad)
        if x1 >= x0 and y1 >= y0: m[y0:y1 + 1, x0:x1 + 1] = True
    return m

def amberness(rgb):
    """distance-free amber score in 0..1: how close a pixel leans to #ffb300 in hue+sat.
    R>G>B with a real spread is amber; grey/blue/white score 0."""
    r = rgb[..., 0].astype(np.int16); g = rgb[..., 1].astype(np.int16); b = rgb[..., 2].astype(np.int16)
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    sat = (mx - mn)
    hue_ok = (r >= g) & (g >= b) & (r - b > 30)
    # amber = hue near 42deg: g-b should be ~0.70*(r-b) for #ffb300
    with np.errstate(divide='ignore', invalid='ignore'):
        frac = np.where((r - b) > 0, (g - b) / np.maximum(1, (r - b)), 0.0)
    near = np.abs(frac - 0.702) < 0.28
    return (hue_ok & near & (sat > 40))

def env_at(sec):
    dt = sec - POP_SEC
    if dt < 0: return 0.0
    if dt < FADE_IN: return dt / FADE_IN
    if dt < FADE_IN + HOLD: return 1.0
    if dt < FADE_IN + HOLD + FADE_OUT: return 1.0 - (dt - FADE_IN - HOLD) / FADE_OUT
    return 0.0

def main():
    poses = {p[0]: p for p in json.load(open(sys.argv[1]))}
    frames_dir = sys.argv[2]
    f0, f1 = int(sys.argv[3]), int(sys.argv[4])
    rows = []
    prev_amber_in = None
    for fi in range(f0, f1 + 1):
        p = poses.get(fi)
        if p is None: continue
        try: img = np.asarray(Image.open('%s/f%05d.png' % (frames_dir, fi)).convert('RGB'))
        except FileNotFoundError: continue
        sec = fi / FPS
        cam4 = to_cam(CORNERS, (p[1], p[2], p[3]), (p[4], p[5], p[6]))
        camc = clip_near(cam4)
        if camc is None or len(camc) < 3:
            rows.append((fi, sec, None, None, None, None, 'wholly-behind-camera'))
            continue
        pts, _zc = cam_to_px(camc)
        poly = [(float(x), float(y)) for x, y in pts]
        # the two diagonals of the ORIGINAL box, each clipped on its own
        diags = []
        for ia, ib in ((0, 2), (1, 3)):
            seg = clip_near(np.stack([cam4[ia], cam4[ib], cam4[ia]]))
            if seg is not None and len(seg) >= 2:
                sp, _ = cam_to_px(seg[:2])
                diags.append((tuple(sp[0]), tuple(sp[1])))
        m = poly_mask(poly, W, H)
        area = int(m.sum())
        if area < 200:
            rows.append((fi, sec, area, None, None, None, 'tiny'))
            continue
        amb = amberness(img)
        amber_in = float(amb[m].mean())
        # the X diagonals, 2px band each (clipped segments of the ORIGINAL box)
        dm = np.zeros((H, W), bool)
        for a2, b2 in diags: dm |= seg_mask(a2, b2, W, H)
        dm &= m
        diag_px = int((amb & dm).sum())
        diag_area = int(dm.sum())
        diag_frac = diag_px / diag_area if diag_area else 0.0
        # control: same-size band OUTSIDE the plate polygon, same rows
        ctrl = (~m)
        amber_out = float(amb[ctrl].mean())
        rows.append((fi, sec, area, amber_in, amber_out, diag_frac, ''))
    # ── report
    print('§PLATE_FLICKER frames=%d film=%s pop=%.2f envEnd=%.2f tint=#ffb300' %
          (len(rows), frames_dir, POP_SEC, ENV_END))
    print('§PLATE_FLICKER_HDR frame sec polyPx amberIn amberOut diagFrac env residual')
    live = []
    for r in rows:
        fi, sec, area, ai, ao, df, note = r
        if ai is None:
            print('§PLATE_FLICKER_F %d %.3f %s %s' % (fi, sec, area, note)); continue
        e = env_at(sec)
        print('§PLATE_FLICKER_F %d %.3f %d %.5f %.5f %.4f %.3f' % (fi, sec, area, ai, ao, df, e))
        if POP_SEC <= sec <= ENV_END: live.append((sec, ai, df, e))
    if len(live) > 4:
        s = np.array([x[0] for x in live]); ai = np.array([x[1] for x in live])
        df = np.array([x[2] for x in live]); e = np.array([x[3] for x in live])
        # fit amberIn = a*env + b, residual = the part the envelope does NOT explain
        A = np.stack([e, np.ones_like(e)], 1)
        coef, *_ = np.linalg.lstsq(A, ai, rcond=None)
        res = ai - A @ coef
        print('§PLATE_FLICKER_TINT n=%d fit=%.5f*env+%.5f residStd=%.5f residMaxAbs=%.5f '
              'residStd/range=%.3f' % (len(live), coef[0], coef[1], res.std(), np.abs(res).max(),
                                       res.std() / max(1e-9, ai.max() - ai.min())))
        d1 = np.abs(np.diff(ai)); step = np.abs(np.diff(e)) * abs(coef[0])
        print('§PLATE_FLICKER_TINT_STEP meanAbsDelta=%.5f expectedRampStep=%.5f excess=%.5f '
              'maxAbsDelta=%.5f' % (d1.mean(), step.mean(), d1.mean() - step.mean(), d1.max()))
        dd = np.abs(np.diff(df))
        print('§PLATE_FLICKER_DIAG n=%d mean=%.4f std=%.4f min=%.4f max=%.4f '
              'meanAbsDelta=%.4f maxAbsDelta=%.4f cv=%.3f' %
              (len(df), df.mean(), df.std(), df.min(), df.max(), dd.mean(), dd.max(),
               df.std() / max(1e-9, df.mean())))
    else:
        print('§PLATE_FLICKER VACUOUS — fewer than 5 in-envelope frames were measurable')

if __name__ == '__main__':
    main()
