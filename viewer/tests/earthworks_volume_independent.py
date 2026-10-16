# Independent computation for witness_earthworks_volume.js (§EARTHWORKS_VOLUME, spec in viewer/cpe_road_panels.js).
# Usage: python3 -I this.py <building.db> [--dump DIR]     (--dump writes the EARTHWORK blobs as DIR/<guid>.v.bin / .f.bin)
# Shares NO code with cpe_road_panels.js: numpy float64, np.unique weld, sorted-edge census, and B by RE-TRANSLATING every vertex to each
# shifted origin and re-summing (the JS uses the closed form V(o)=V0-o.S/6).
import sys, sqlite3, json
sys.path.append("/home/red1/.local/lib/python3.12/site-packages")   # -I drops user site; numpy lives there
import numpy as np
def vol(P, G, o):
    Q = P - o; return float(np.einsum('ij,ij->i', Q[G[:, 0]], np.cross(Q[G[:, 1]], Q[G[:, 2]])).sum() / 6)
def analyse(vb, fb):
    V = np.frombuffer(vb, dtype=np.float32).reshape(-1, 3); F = np.frombuffer(fb, dtype=np.uint32).reshape(-1, 3).astype(np.int64)
    lo, hi = V.astype(np.float64).min(0), V.astype(np.float64).max(0); cen = (lo + hi) / 2; hal = (hi - lo) / 2
    u, inv = np.unique(V, axis=0, return_inverse=True); G = inv.ravel()[F]
    G = G[(G[:, 0] != G[:, 1]) & (G[:, 1] != G[:, 2]) & (G[:, 0] != G[:, 2])]
    P = u.astype(np.float64)
    e = np.concatenate([G[:, [0, 1]], G[:, [1, 2]], G[:, [2, 0]]]); n = len(u) + 1
    key = np.minimum(e[:, 0], e[:, 1]) * n + np.maximum(e[:, 0], e[:, 1]); fwd = (e[:, 0] < e[:, 1]).astype(np.int64)
    uk, ix = np.unique(key, return_inverse=True); cnt = np.bincount(ix); nf = np.bincount(ix, weights=fwd).astype(np.int64)
    open_ = int((cnt == 1).sum()); nm = int((cnt > 2).sum()); ww = int(((cnt == 2) & (nf != 1)).sum())
    closed = len(G) > 0 and open_ == 0 and nm == 0 and ww == 0
    shifts = [np.array([sx * hal[0], sy * hal[1], sz * hal[2]]) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    for d in range(3):
        for sg in (-1, 1):
            v = np.zeros(3); v[d] = sg * 5000.0; shifts.append(v)
    Vc = vol(P, G, cen); B = max(abs(vol(P, G, cen + s) - Vc) for s in shifts)
    if len(G) == 0 or ww > 0: verdict = 'INCONCLUSIVE'
    elif closed: verdict = 'EXACT'
    else: verdict = 'INCONCLUSIVE' if B >= abs(Vc) else 'APPROXIMATE'
    return dict(tris=int(len(G)), uniqueVerts=int(len(u)), openEdges=open_, nonManifoldEdges=nm, wrongWayEdges=ww, E=open_ + nm,
                closed=closed, signedSum=Vc, V=abs(Vc), B=B, nShifts=len(shifts), verdict=verdict)
if __name__ == '__main__':
    c = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True)
    rows = c.execute("select m.guid,g.vertices,g.faces from elements_meta m join element_instances i on i.guid=m.guid "
                     "join component_geometries g on g.geometry_hash=i.geometry_hash where m.discipline='EARTHWORK'").fetchall()
    dump = sys.argv[sys.argv.index('--dump') + 1] if '--dump' in sys.argv else None
    out = []
    for guid, vb, fb in rows:
        r = analyse(vb, fb); r['guid'] = guid; out.append(r)
        if dump: open(dump + '/' + guid + '.v.bin', 'wb').write(vb); open(dump + '/' + guid + '.f.bin', 'wb').write(fb)
    print(json.dumps(out))
