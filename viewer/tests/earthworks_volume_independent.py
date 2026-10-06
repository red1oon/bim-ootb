# Independent computation for witness_earthworks_volume.js (§EARTHWORKS_VOLUME). Usage: python3 -I this.py <building.db>
# Does NOT share code with viewer/cpe_road_panels.js: numpy, float64, np.unique weld, sorted-edge closedness.
import sys, sqlite3, json
sys.path.append("/home/red1/.local/lib/python3.12/site-packages")   # -I drops user site; numpy lives there
import numpy as np
c = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True)
rows = c.execute("select m.guid,g.vertices,g.faces from elements_meta m join element_instances i on i.guid=m.guid "
                 "join component_geometries g on g.geometry_hash=i.geometry_hash where m.discipline='EARTHWORK'").fetchall()
out = []
for guid, vb, fb in rows:
    V = np.frombuffer(vb, dtype=np.float32).reshape(-1, 3); F = np.frombuffer(fb, dtype=np.uint32).reshape(-1, 3).astype(np.int64)
    u, inv = np.unique(V, axis=0, return_inverse=True); G = inv.ravel()[F]
    G = G[(G[:, 0] != G[:, 1]) & (G[:, 1] != G[:, 2]) & (G[:, 0] != G[:, 2])]
    P = u.astype(np.float64); a, b, cc = P[G[:, 0]], P[G[:, 1]], P[G[:, 2]]
    signed = float(np.einsum('ij,ij->i', a, np.cross(b, cc)).sum() / 6)
    e = np.concatenate([G[:, [0, 1]], G[:, [1, 2]], G[:, [2, 0]]]); n = len(u) + 1
    key = np.minimum(e[:, 0], e[:, 1]) * n + np.maximum(e[:, 0], e[:, 1]); fwd = (e[:, 0] < e[:, 1]).astype(np.int64)
    uk, ix = np.unique(key, return_inverse=True); cnt = np.bincount(ix); nf = np.bincount(ix, weights=fwd).astype(np.int64)
    open_ = int((cnt == 1).sum()); nm = int((cnt > 2).sum()); ww = int(((cnt == 2) & (nf != 1)).sum())
    closed = open_ == 0 and nm == 0 and ww == 0
    out.append(dict(guid=guid, tris=int(len(G)), uniqueVerts=int(len(u)), openEdges=open_, nonManifoldEdges=nm, wrongWayEdges=ww,
                    closed=closed, signedSum=signed, volume=abs(signed) if closed else None))
print(json.dumps(out))
