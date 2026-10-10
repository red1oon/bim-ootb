# ⚠ DO NOT REMOVE — Scope: the OplogPic film's camera-sound layers. Real CC0 recordings from BigSoundBank (licence read on each sound's page 2026-10-11: "CC0 license (public-domain equivalent)"):
# 0448 iPhone camera · 3022 old camera trigger · 2391 and 0985 SLR camera in burst mode. Two stems: SFX (NOT ducked: one snap per chapter card + the SLR burst on the black end card) and
# BED (ducked under the voices by film_narration_mux.py: a sparse, seeded scatter of clicks under the demo). Read the log: §CAMERA lines list every placed sound with its time.
# usage: oplogpic_audio.py <sound_dir> <film_sec> <out_sfx.wav> <out_bed.wav> [cover=.. c1=.. c2=.. road=.. end=.. bed0=.. bed1=..]   (seconds; defaults = the English film)
import sys, numpy as np, soundfile as sf
d, FILM, out_sfx, out_bed = sys.argv[1], float(sys.argv[2]), sys.argv[3], sys.argv[4]; SR = 48000
load = lambda n: sf.read(f'{d}/{n}.wav', always_2d=True)[0].astype(np.float64)
LAY = dict(cover=0.05, c1=3.00, c2=73.38, road=77.88, end=103.95, bed0=11.0, bed1=72.5); LAY.update({k: float(v) for k, v in (a.split('=') for a in sys.argv[5:])})
S = {n: load(n) for n in ('0448', '3022', '2391', '0985')}
N = int(FILM * SR) + SR; sfx = np.zeros((N, 2)); bed = np.zeros((N, 2))
def put(buf, name, t, gain):
    a = S[name]; i = int(t * SR); j = min(N, i + len(a)); buf[i:j] += a[:j - i] * gain; print(f'§CAMERA {"SFX" if buf is sfx else "BED"} {name} at={t:.2f}s len={len(a)/SR:.2f}s gain={gain:.2f}')
# chapter-card snaps (times from the §ASSEMBLE log of the silent film)
for name, t, g in (('0448', LAY['cover'], 0.9), ('3022', LAY['c1'], 0.9), ('2391', LAY['c2'], 1.0), ('2391', LAY['road'], 0.8)): put(sfx, name, t, g)
put(sfx, '0985', LAY['end'], 1.0)                                    # the SLR burst under the black prior-art card
for name, t, g in (('2391', LAY['end'] + 9.25, 0.9), ('3022', LAY['end'] + 11.35, 0.8), ('2391', LAY['end'] + 14.45, 0.9)): put(sfx, name, t, g)   # more snaps across the card's silent tail (first mux left an 8.3 s gap)
# the bed under the demo (9.5 s .. 73.4 s): a seeded scatter, one sound every 4.5-8 s, alternating burst / old trigger
rng = np.random.RandomState(11); t = LAY['bed0']; k = 0
while t < LAY['bed1']:
    put(bed, ('2391', '3022')[k % 2], t, 0.9); k += 1; t += 4.5 + 3.5 * rng.rand()
for buf in (sfx, bed): np.clip(buf, -1, 1, out=buf)
sf.write(out_sfx, sfx[:int(FILM * SR)], SR, subtype='PCM_16'); sf.write(out_bed, bed[:int(FILM * SR)], SR, subtype='PCM_16')
print(f'§CAMERA wrote sfx={out_sfx} bed={out_bed} film={FILM}s peak_sfx={np.abs(sfx).max():.2f} peak_bed={np.abs(bed).max():.2f}')
