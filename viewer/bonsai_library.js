// bonsai_library.js — Bonsai "Insert library component @ LOD" provider (§OOTB Item 2 = the bulk of real
// authoring: ASSEMBLE, don't draw). prompts/BONSAI_KERNEL_RESEARCH.md §SPEC W-BONSAI-INSERT. A picked catalog
// component is placed as ONE signed GEOM_INSERT op-row; geometry = a HOST-side fold (a baked mesh, NOT an occt
// B-rep), so it never touches the occt worker. LOD is a RENDER override over the immutable signed row: LOD-200 =
// a bbox box proxy (12 tris), LOD-300 = the real extracted mesh — "same row refined", op_hash/chain-tip unchanged.
//
// CATALOG = 3 REAL components extracted NON-INVENT from library/component_library.db (Column/Beam/Door): bbox +
// real mesh blobs (vertices=Float32 3/vtx, faces=Uint32 3/tri, base64). The full 23888-row db via httpvfs
// range-load is the production follow-on; this fixture proves the mechanism (the lane's witness-first method).
(function () {
  'use strict';
  const TAG = '§LIBRARY';
  const CATALOG = [
    { hash:"3e6348624e89b507", name:"M_Rectangular Column", ifc_class:"IfcColumn", category:"COLUMN", bbox:[-0.225, 0.225, -0.4, 0.4, -2.0, 2.0], vc:16, fc:24,
      v:"/2ZmPtrMzD4CAADA/2ZmPtrMzD79//8//2GZPdrMzD79//8//2GZPdrMzD4CAADA/2GZPebMzL79//8//2GZPebMzL4CAADA/2ZmPubMzL79//8//2ZmPubMzL4CAADAAWdmvubMzL4CAADAAWdmvubMzL79//8/Ac6ZvebMzL79//8/Ac6ZvebMzL4CAADAAc6ZvdrMzD79//8/Ac6ZvdrMzD4CAADAAWdmvtrMzD79//8/AWdmvtrMzD4CAADA",
      f:"AQAAAAAAAAADAAAAAgAAAAEAAAADAAAAAgAAAAMAAAAFAAAABAAAAAIAAAAFAAAABAAAAAUAAAAHAAAABgAAAAQAAAAHAAAABgAAAAcAAAAAAAAAAQAAAAYAAAAAAAAAAwAAAAAAAAAFAAAAAAAAAAcAAAAFAAAABAAAAAEAAAACAAAABAAAAAYAAAABAAAACQAAAAgAAAALAAAACgAAAAkAAAALAAAACgAAAAsAAAANAAAADAAAAAoAAAANAAAADAAAAA0AAAAPAAAADgAAAAwAAAAPAAAADgAAAA8AAAAIAAAACQAAAA4AAAAIAAAACwAAAAgAAAANAAAACAAAAA8AAAANAAAADAAAAAkAAAAKAAAADAAAAA4AAAAJAAAA" },
    { hash:"9cbb780e8801984f", name:"M_Concrete-Rectangular Beam", ifc_class:"IfcBeam", category:"BEAM", bbox:[-2.75, 2.75, -0.15, 0.15, -0.3, 0.3], vc:16, fc:24,
      v:"DQAwQLeZGT6MmZk+8/8vwLeZGT6MmZk+8/8vwLeZGT7MzIw+DQAwQLeZGT7MzIw+8/8vwMmZGb7MzIw+DQAwQMmZGb7MzIw+8/8vwMmZGb6MmZk+DQAwQMmZGb6MmZk+DQAwQLeZGT6xmZk98/8vwLeZGT6xmZk98/8vwLeZGT6UmZm+DQAwQLeZGT6UmZm+8/8vwMmZGb6UmZm+DQAwQMmZGb6UmZm+8/8vwMmZGb6xmZk9DQAwQMmZGb6xmZk9",
      f:"AQAAAAAAAAADAAAAAgAAAAEAAAADAAAAAgAAAAMAAAAFAAAABAAAAAIAAAAFAAAABAAAAAUAAAAHAAAABgAAAAQAAAAHAAAABgAAAAcAAAAAAAAAAQAAAAYAAAAAAAAAAwAAAAAAAAAFAAAAAAAAAAcAAAAFAAAABAAAAAEAAAACAAAABAAAAAYAAAABAAAACQAAAAgAAAALAAAACgAAAAkAAAALAAAACgAAAAsAAAANAAAADAAAAAoAAAANAAAADAAAAA0AAAAPAAAADgAAAAwAAAAPAAAADgAAAA8AAAAIAAAACQAAAA4AAAAIAAAACwAAAAgAAAANAAAACAAAAA8AAAANAAAADAAAAAkAAAAKAAAADAAAAA4AAAAJAAAA" },
    { hash:"ed1eee29900658a8", name:"Double glassdoor", ifc_class:"IfcDoor", category:"DOOR", bbox:[-0.89, 0.89, -0.075, 0.075, -1.05, 1.05], vc:32, fc:52,
      v:"P9djv0SZmb1mZoY/P9djv7yYmT1mZoY/QddjP7yYmT1mZoY/QddjP0SZmb1mZoY/QddjP7yYmT1qZoa/QddjP0SZmb1qZoa/wZlZP7yYmT1qZoa/wZlZP0SZmb1qZoa/wZlZP7yYmT2uR4E/wZlZP0SZmb2uR4E/v5lZv7yYmT2uR4E/v5lZv0SZmb2uR4E/v5lZv7yYmT1qZoa/v5lZv0SZmb1qZoa/P9djv7yYmT1qZoa/P9djv0SZmb1qZoa/wdRYP3ghMD3iqYW/wdRYP3ghMD1e5YA/wdRYP7yYmT1e5YA/wdRYP7yYmT3iqYW/1oHEOryYmT1e5YA/1oHEOryYmT3iqYW/1oHEOnghMD1e5YA/1oHEOnghMD3iqYW/Kn7EunghMD3iqYW/Kn7EunghMD1e5YA/Kn7EuryYmT1e5YA/Kn7EuryYmT3iqYW/v9RYv7yYmT1e5YA/v9RYv7yYmT3iqYW/v9RYv3ghMD1e5YA/v9RYv3ghMD3iqYW/",
      f:"AQAAAAAAAAADAAAAAgAAAAEAAAADAAAAAgAAAAMAAAAFAAAABAAAAAIAAAAFAAAABAAAAAUAAAAHAAAABgAAAAQAAAAHAAAABgAAAAcAAAAJAAAACAAAAAYAAAAJAAAACAAAAAkAAAALAAAACgAAAAgAAAALAAAACgAAAAsAAAANAAAADAAAAAoAAAANAAAADAAAAA0AAAAPAAAADgAAAAwAAAAPAAAADgAAAA8AAAAAAAAAAQAAAA4AAAAAAAAACwAAAAkAAAADAAAAAAAAAAsAAAADAAAACwAAAAAAAAAPAAAACwAAAA8AAAANAAAACQAAAAcAAAAFAAAAAwAAAAkAAAAFAAAAAgAAAAgAAAAKAAAAAgAAAAoAAAABAAAADgAAAAEAAAAKAAAADAAAAA4AAAAKAAAABAAAAAYAAAAIAAAABAAAAAgAAAACAAAAEQAAABAAAAATAAAAEgAAABEAAAATAAAAEgAAABMAAAAVAAAAFAAAABIAAAAVAAAAFAAAABUAAAAXAAAAFgAAABQAAAAXAAAAFgAAABcAAAAQAAAAEQAAABYAAAAQAAAAEwAAABAAAAAVAAAAEAAAABcAAAAVAAAAFAAAABEAAAASAAAAFAAAABYAAAARAAAAGQAAABgAAAAbAAAAGgAAABkAAAAbAAAAGgAAABsAAAAdAAAAHAAAABoAAAAdAAAAHAAAAB0AAAAfAAAAHgAAABwAAAAfAAAAHgAAAB8AAAAYAAAAGQAAAB4AAAAYAAAAGwAAABgAAAAdAAAAGAAAAB8AAAAdAAAAHAAAABkAAAAaAAAAHAAAAB4AAAAZAAAA" }
  ];

  function b64ToBuf(b64) {
    const bin = atob(b64); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }
  // rotate (about +Z by rad) then translate — placement frame for an assembled component.
  function place(positions, pl) {
    const rad = ((pl && pl.rot) || 0) * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
    const ox = (pl && pl.x) || 0, oy = (pl && pl.y) || 0, oz = (pl && pl.z) || 0;
    const out = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      out[i] = cs * x - sn * y + ox; out[i + 1] = sn * x + cs * y + oy; out[i + 2] = z + oz;
    }
    return out;
  }
  // 12-tri box from a local bbox = the LOD-200 proxy (corner-indexed, two tris per face).
  function boxArrays(bb) {
    const [x0, y0, z0, x1, y1, z1] = bb;
    const p = [x0,y0,z0, x1,y0,z0, x1,y1,z0, x0,y1,z0, x0,y0,z1, x1,y0,z1, x1,y1,z1, x0,y1,z1];
    const positions = new Float32Array(p);
    const idx = [0,1,2, 0,2,3,  4,6,5, 4,7,6,  0,4,5, 0,5,1,  1,5,6, 1,6,2,  2,6,7, 2,7,3,  3,7,4, 3,4,0];
    return { positions, indices: new Uint32Array(idx) };
  }

  const Library = {
    _lod: {},                                   // featureId -> render-LOD override ('200'|'300')
    catalog() { return CATALOG.map(c => ({ hash: c.hash, name: c.name, ifc_class: c.ifc_class, category: c.category, bbox: c.bbox, fc: c.fc })); },
    get(hash) { return CATALOG.find(c => c.hash === hash) || null; },
    setLod(featureId, lod) { this._lod[featureId] = String(lod); return this; },
    lodFor(featureId, fallback) { return this._lod[featureId] || fallback || '200'; },

    meshArrays(hash) {                          // LOD-300: decode the real extracted mesh
      const c = this.get(hash); if (!c) throw new Error('no component ' + hash);
      return { positions: new Float32Array(b64ToBuf(c.v)), indices: new Uint32Array(b64ToBuf(c.f)) };
    },

    // THE FOLD for a GEOM_INSERT op-row -> a transferable mesh payload (same shape the worker returns).
    foldInsert(op) {
      const P = typeof op.parameters === 'string' ? JSON.parse(op.parameters) : op.parameters;
      const c = this.get(P.hash); if (!c) throw new Error('GEOM_INSERT unknown component ' + P.hash);
      const lod = this.lodFor(op.id, P.lod);
      const base = (lod === '300') ? this.meshArrays(P.hash) : boxArrays(c.bbox);
      const positions = place(base.positions, P.placement);
      return { featureId: op.id, triangleCount: base.indices.length / 3, positions, normals: null, indices: base.indices };
    }
  };

  window.Bonsai = window.Bonsai || {};
  window.Bonsai.library = Library;
  console.log(TAG + ' module loaded components=' + CATALOG.length);
})();
