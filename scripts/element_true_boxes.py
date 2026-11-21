#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — scope: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.55 (proof film). Read the printed §-line after every run.
# WHAT: the TRUE world box of every element of a shipped DB = element_transforms.center_* + the min / max of its own mesh
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
    out[g] = [round(cx + lo[0], 4), round(cx + hi[0], 4), round(cy + lo[1], 4), round(cy + hi[1], 4), round(cz + lo[2], 4), round(cz + hi[2], 4)]
json.dump(out, open(sys.argv[1], 'w'))
print('§FILM_TRUE_BOX %s elements=%d noMesh=%d' % (sys.argv[2].split('/')[-1], len(out), miss))
