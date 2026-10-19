#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — foundation lane F5 (prompts/DXF2BIM_FOUNDATION_LANE.md §5), READ-ONLY. Is the library really content-addressed? (1) which hash rule each key in component_library.db follows; (2) do the DXF2BIM shards match their index and their own keys?
# usage: python3 store_verify.py <component_library.db> <dir with the downloaded dxf2bim/library/<sha>/ files: index.json + shard_*.json (gzip or plain)> [out.json]
import sys, json, gzip, hashlib, struct, sqlite3, collections
db = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True); D = sys.argv[2].rstrip('/')
def load(f):
    raw = open(f, 'rb').read()
    try: return raw, gzip.decompress(raw)
    except Exception: return raw, raw
n = rule_v = rule_other = other = 0; unexplained = []; badvc = collections.Counter()
for h, v, f in db.execute('select geometry_hash, vertices, faces from component_geometries'):
    n += 1
    if hashlib.sha256(v).hexdigest()[:16] == h: rule_v += 1
    elif hashlib.sha256(v + f).hexdigest()[:16] == h or hashlib.sha256(f).hexdigest()[:16] == h: rule_other += 1
    else: other += 1; unexplained.append(h)
_, ixb = load(D + '/index.json'); ix = json.loads(ixb); ok_sha = nm = nm_ok = 0; mism = []
for s in ix['shards']:
    raw, dec = load(D + '/' + s['name'] + '.json')
    if hashlib.sha256(dec).hexdigest() == s['sha256']: ok_sha += 1     # the index hashes the DECOMPRESSED shard
    for h, m in json.loads(dec)['meshes'].items():
        nm += 1; vb = struct.pack('<%df' % len(m['vertices']), *m['vertices'])
        if hashlib.sha256(vb).hexdigest()[:16] == h: nm_ok += 1
        else: mism.append(h)
res = {'library_rows': n, 'key_is_sha256_vertices_16': rule_v, 'key_is_sha256_vertices_plus_faces_or_faces': rule_other, 'key_unexplained': other, 'unexplained_sample': unexplained[:5], 'shards': len(ix['shards']), 'shards_sha256_match_index': ok_sha, 'shard_meshes': nm, 'shard_meshes_key_is_sha256_vertices': nm_ok, 'shard_meshes_other': len(mism)}
print('§STORE_VERIFY ' + json.dumps(res))
if len(sys.argv) > 3: json.dump(res, open(sys.argv[3], 'w'), indent=1)
