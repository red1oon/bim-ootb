#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — POC §OPENING-EXCL Step 1 (Duplex ground truth)
# SCOPE: bim-compiler prompts/FUNCTIONAL_SPACES_ENSEMBLE.md §OPENING-EXCL (2026-07-13, Task A).
# ISSUE THIS POC PROVES/DISPROVES: do any of Duplex's 18 REAL wall devices (14 M_Lighting
# Switches + 4 M_Telephone Outlets, deploy/buildings/Duplex_extracted.db) sit INSIDE a real
# door/window opening's interval on their own nearest wall? If the real building has ZERO such
# cases, that is the NEGATIVE CONTROL for the _onSolidWall() check (a correct check must flag 0
# of the real building's own devices). All geometry math is the EXACT hostBind/_trueMidpoint
# port (disc_walker.js _eulerMat3 / P2 BBOX_RECONSTRUCT / SIDE centreline projection) — no new
# geometry conventions invented. Read the log after every run — exit code is not evidence.
import sqlite3, struct, math, sys

DB = '/home/red1/bim-compiler/deploy/buildings/Duplex_extracted.db'
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row

GEOM_TABLES = ['component_geometries', 'base_geometries']   # disc_walker.js _GEOM_TABLES

def euler_mat3(rx, ry, rz):
    # disc_walker.js _eulerMat3 port (rx||ry -> Euler(rotX, rotZ, -rotY) remap; else plain Z yaw)
    if rx or ry:
        ex, ey, ez = rx, rz, -ry
        c1, c2, c3 = math.cos(ex/2), math.cos(ey/2), math.cos(ez/2)
        s1, s2, s3 = math.sin(ex/2), math.sin(ey/2), math.sin(ez/2)
        x = s1*c2*c3 + c1*s2*s3; y = c1*s2*c3 - s1*c2*s3
        z = c1*c2*s3 + s1*s2*c3; w = c1*c2*c3 - s1*s2*s3
        x2, y2, z2 = x+x, y+y, z+z
        xx, xy, xz = x*x2, x*y2, x*z2
        yy, yz, zz = y*y2, y*z2, z*z2
        wx, wy, wz = w*x2, w*y2, w*z2
        m = [1-(yy+zz), xy+wz, xz-wy, xy-wz, 1-(xx+zz), yz+wx, xz+wy, yz-wx, 1-(xx+yy)]
        return [[m[0], m[3], m[6]], [m[1], m[4], m[7]], [m[2], m[5], m[8]]]
    cc, sc = math.cos(rz), math.sin(rz)
    return [[cc, -sc, 0], [sc, cc, 0], [0, 0, 1]]

def world_bbox(guid, t):
    """P2 BBOX_RECONSTRUCT (disc_walker.js _trueMidpoint): local mesh bbox corners -> R -> +center.
    Returns (wmin, wmax, verified)."""
    row = con.execute("SELECT geometry_hash FROM element_instances WHERE guid=?", (guid,)).fetchone()
    vb = None
    if row and row['geometry_hash']:
        for tbl in GEOM_TABLES:
            try:
                g = con.execute(f"SELECT vertices FROM {tbl} WHERE geometry_hash=?",
                                (row['geometry_hash'],)).fetchone()
            except sqlite3.OperationalError:
                continue
            if g and g['vertices']:
                vb = g['vertices']; break
    cx, cy, cz = t['center_x'], t['center_y'], t['center_z']
    if not vb:
        # fallback: raw center +- world bbox/2 (unverified), same honesty as _trueMidpoint fallback
        h = [t['bbox_x']/2, t['bbox_y']/2, t['bbox_z']/2]
        return ([cx-h[0], cy-h[1], cz-h[2]], [cx+h[0], cy+h[1], cz+h[2]], False)
    n = len(vb) // 4 // 3 * 3
    f = struct.unpack(f'<{n}f', vb[:n*4])
    lmin = [min(f[i::3]) for i in range(3)]
    lmax = [max(f[i::3]) for i in range(3)]
    R = euler_mat3(t['rotation_x'] or 0, t['rotation_y'] or 0, t['rotation_z'] or 0)
    wmin = [1e30]*3; wmax = [-1e30]*3
    for xi in (0, 1):
        for yi in (0, 1):
            for zi in (0, 1):
                c = [lmax[0] if xi else lmin[0], lmax[1] if yi else lmin[1], lmax[2] if zi else lmin[2]]
                w = [R[k][0]*c[0] + R[k][1]*c[1] + R[k][2]*c[2] + [cx, cy, cz][k] for k in range(3)]
                for k in range(3):
                    wmin[k] = min(wmin[k], w[k]); wmax[k] = max(wmax[k], w[k])
    return (wmin, wmax, True)

def rows(sql, *a):
    return con.execute(sql, a).fetchall()

# ── real devices (the ground truth) ─────────────────────────────────────────────
devs = rows("""SELECT m.guid, m.element_name, t.* FROM elements_meta m
  JOIN element_transforms t ON m.guid=t.guid
  WHERE lower(m.element_name) LIKE '%switch%' OR lower(m.element_name) LIKE '%outlet%'
     OR lower(m.element_name) LIKE '%socket%' ORDER BY m.element_name""")
walls = rows("""SELECT m.guid, t.* FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid
  WHERE m.ifc_class LIKE '%IfcWall%'""")
opens = rows("""SELECT m.guid, m.ifc_class, m.element_name, t.* FROM elements_meta m
  JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class IN ('IfcDoor','IfcWindow')""")

print(f"§POC-OPEN devices={len(devs)} walls={len(walls)} openings={len(opens)} db={DB}")

# wall lines exactly as hostBind SIDE builds them (true midpoint, dominant horizontal run axis)
lines = []
unverified = 0
for w in walls:
    wmin, wmax, ver = world_bbox(w['guid'], w)
    if not ver: unverified += 1
    mid = [(wmin[k]+wmax[k])/2 for k in range(3)]
    horiz = 0 if w['bbox_x'] >= w['bbox_y'] else 1
    hlen = (w['bbox_x'] if horiz == 0 else w['bbox_y']) / 2
    thick = w['bbox_y'] if horiz == 0 else w['bbox_x']
    a = mid[:2]; b = mid[:2]
    a = [a[0], a[1]]; b = [b[0], b[1]]
    a[horiz] -= hlen; b[horiz] += hlen
    lines.append(dict(g=w['guid'], a=a, b=b, horiz=horiz, thick=thick,
                      mid=mid, zlo=wmin[2], zhi=wmax[2], ver=ver))
print(f"§POC-OPEN wall midpoints verified={len(walls)-unverified}/{len(walls)} (unverified fall back to raw center)")

# opening world bboxes (true mesh reconstruct)
obb = []
for o in opens:
    omin, omax, ver = world_bbox(o['guid'], o)
    obb.append(dict(g=o['guid'], cls=o['ifc_class'], name=o['element_name'],
                    min=omin, max=omax, ver=ver))

def openings_on_wall(L):
    """An opening belongs to wall L when its world bbox OVERLAPS the wall's own world bbox
    (pure measured-geometry association — no guessed proximity constant). Interval = the
    opening's own world extent on the wall's run axis + its own z extent."""
    out = []
    wlo = [min(L['a'][0], L['b'][0]) - L['thick']/2, min(L['a'][1], L['b'][1]) - L['thick']/2]
    whi = [max(L['a'][0], L['b'][0]) + L['thick']/2, max(L['a'][1], L['b'][1]) + L['thick']/2]
    for o in obb:
        if (o['min'][0] <= whi[0] and o['max'][0] >= wlo[0] and
            o['min'][1] <= whi[1] and o['max'][1] >= wlo[1] and
            o['min'][2] <= L['zhi'] and o['max'][2] >= L['zlo']):
            out.append(o)
    return out

flagged = 0; run_only = 0
for d in devs:
    px, py, pz = d['center_x'], d['center_y'], d['center_z']
    best, bl, bt = 1e30, None, 0
    for L in lines:
        abx, aby = L['b'][0]-L['a'][0], L['b'][1]-L['a'][1]
        l2 = abx*abx + aby*aby
        t = ((px-L['a'][0])*abx + (py-L['a'][1])*aby)/l2 if l2 > 0 else 0
        t = max(0, min(1, t))
        cx, cy = L['a'][0]+t*abx, L['a'][1]+t*aby
        dist = math.hypot(px-cx, py-cy)
        if dist < best: best, bl, bt = dist, L, t
    name = d['element_name'].split(':')[-1]
    ops = openings_on_wall(bl)
    runc = px if bl['horiz'] == 0 else py          # device coord on the wall's run axis
    hit = None; hit_run = None
    for o in ops:
        r0, r1 = o['min'][bl['horiz']], o['max'][bl['horiz']]
        in_run = r0 <= runc <= r1
        in_z = o['min'][2] <= pz <= o['max'][2]
        if in_run and hit_run is None: hit_run = o
        if in_run and in_z: hit = o; break
    if hit_run and not hit: run_only += 1
    if hit: flagged += 1
    print(f"§POC-OPEN-DEV {name} z={pz:.2f} wall={bl['g']} d={best:.3f}m openingsOnWall={len(ops)}"
          f" runAxis={'x' if bl['horiz']==0 else 'y'} run={runc:.2f}"
          + (f" INSIDE-OPENING {hit['cls']}/{hit['name'].split(':')[-1]}" if hit else
             (f" run-hit-but-z-clear ({hit_run['cls']} z=[{hit_run['min'][2]:.2f},{hit_run['max'][2]:.2f}])"
              if hit_run else " SOLID")))

print(f"§POC-OPEN RESULT devices={len(devs)} INSIDE-OPENING={flagged} run-hit-z-clear={run_only} solid={len(devs)-flagged-run_only}")
print("§POC-OPEN VERDICT " + ("NEGATIVE CONTROL HOLDS — the real building's own devices are all on solid wall"
      if flagged == 0 else "real devices sit inside openings — interval definition or ground truth needs review"))
