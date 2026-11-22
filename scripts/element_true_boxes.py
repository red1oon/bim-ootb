#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — scope: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.55 (proof film). Read the printed §-line after every run.
# WHAT: the LOCAL box of every element's own mesh (min / max of its vertices, relative to element_transforms.center_*)
#       (component_geometries, stored relative to center_*). Read from the DB and its _geo half; nothing from a patch, nothing authored.
# usage: true_boxes.py out.json <meta or extracted .db> [<_geo.db>]
import sys, sqlite3, json, numpy as np
con = sqlite3.connect('file:' + sys.argv[2] + '?mode=ro', uri=True)
geo = sqlite3.connect('file:' + (sys.argv[3] if len(sys.argv) > 3 else sys.argv[2]) + '?mode=ro', uri=True)
out, cache, miss = {}, {}, 0
for g, cx, cy, cz, h in con.execute('select t.guid, t.center_x, t.center_y, t.center_z, i.geometry_hash from element_transforms t join element_instances i on i.guid = t.guid'):
    if h not in cache:
        r = geo.execute('select vertices from component_geometries where geometry_hash = ?', (h,)).fetchone()
        if not r or not r[0] or len(r[0]) % 12: cache[h] = None
        else:
            v = np.frombuffer(r[0], dtype='<f4').reshape(-1, 3).astype(float); cache[h] = (v.min(0), v.max(0))
    if cache[h] is None or cx is None: miss += 1; continue
    lo, hi = cache[h]
    # LOCAL box (the mesh's own min / max, relative to center_*). The centre is added by the judge from the db AS THE VIEWER HAS IT (its patch can move
    # a centre: Terminal's patch repairs 2,074 transforms) — so the truth is where THAT product draws the mesh.
    out[g] = [round(float(lo[0]), 4), round(float(hi[0]), 4), round(float(lo[1]), 4), round(float(hi[1]), 4), round(float(lo[2]), 4), round(float(hi[2]), 4)]
json.dump(out, open(sys.argv[1], 'w'))
print('§ELEMENT_LOCAL_BOX %s elements=%d noMesh=%d' % (sys.argv[2].split('/')[-1], len(out), miss))
