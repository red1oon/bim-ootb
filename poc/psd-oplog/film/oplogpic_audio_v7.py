# ⚠ DO NOT REMOVE — Scope: the OplogPic v7 film's camera-sound layers. Real CC0 recordings from BigSoundBank (licence read on each sound's page 2026-10-11: "CC0 license (public-domain equivalent)"):
# 0448 iPhone camera · 3022 old camera trigger · 2391 and 0985 SLR camera in burst mode. Same stems as v6: SFX (NOT ducked: one snap per chapter card + the SLR burst on the black end card), BED (ducked: a sparse seeded scatter under the demo).
# usage: oplogpic_audio_v7.py <sound_dir> <timeline.json> <out_sfx.wav> <out_bed.wav>.  Read the log: §CAMERA lines list every placed sound with its time.
import sys, json, numpy as np, soundfile as sf
d, TLJ, out_sfx, out_bed = sys.argv[1:5]; SR = 48000; T = json.load(open(TLJ)); FILM = T['total']; seg = T['segments']
load = lambda n: sf.read(f'{d}/{n}.wav', always_2d=True)[0].astype(np.float64)
S = {n: load(n) for n in ('0448', '3022', '2391', '0985')}
N = int(FILM * SR) + SR; sfx = np.zeros((N, 2)); bed = np.zeros((N, 2))
def put(buf, name, t, gain):
    a = S[name]; i = int(t * SR); j = min(N, i + len(a)); buf[i:j] += a[:j - i] * gain; print(f'§CAMERA {"SFX" if buf is sfx else "BED"} {name} at={t:.2f}s len={len(a)/SR:.2f}s gain={gain:.2f}')
cards = ['cover', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6']; snaps = ['0448', '3022', '2391', '3022', '2391', '3022', '2391']
for c, name in zip(cards, snaps): put(sfx, name, seg[c]['start'] + (0.05 if c == 'cover' else 0.0), 0.9)
e = seg['end']['start']; put(sfx, '0985', e, 1.0)
for name, dt, g in (('2391', 9.25, 0.9), ('3022', 11.35, 0.8), ('2391', 14.45, 0.9)): put(sfx, name, e + dt, g)
rng = np.random.RandomState(11); t = seg['c1']['start'] + 8.0; k = 0
while t < seg['c6']['start'] - 2.0:
    put(bed, ('2391', '3022')[k % 2], t, 0.9); k += 1; t += 4.5 + 3.5 * rng.rand()
for buf in (sfx, bed): np.clip(buf, -1, 1, out=buf)
sf.write(out_sfx, sfx[:int(FILM * SR)], SR, subtype='PCM_16'); sf.write(out_bed, bed[:int(FILM * SR)], SR, subtype='PCM_16')
print(f'§CAMERA wrote sfx={out_sfx} bed={out_bed} film={FILM:.2f}s peak_sfx={np.abs(sfx).max():.2f} peak_bed={np.abs(bed).max():.2f}')
