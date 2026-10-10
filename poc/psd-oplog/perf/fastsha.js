// Fast synchronous SHA-256: reads the input bytes in place (no buffer copy), same hex output as Stack.sha256. Spec: witness_log/HYPOTHESES.md "Browser sha256 speed" (S2).
(function (root) {
  const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const w = new Int32Array(64), HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
  function sha256(data) {
    const u8 = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength), l = u8.length;
    let h0 = 0x6a09e667 | 0, h1 = 0xbb67ae85 | 0, h2 = 0x3c6ef372 | 0, h3 = 0xa54ff53a | 0, h4 = 0x510e527f | 0, h5 = 0x9b05688c | 0, h6 = 0x1f83d9ab | 0, h7 = 0x5be0cd19 | 0;
    const full = l >> 6, tailLen = l - (full << 6), padLen = tailLen < 56 ? 64 : 128, tail = new Uint8Array(padLen); tail.set(u8.subarray(full << 6)); tail[tailLen] = 0x80;
    const dv = new DataView(tail.buffer); dv.setUint32(padLen - 4, (l * 8) >>> 0); dv.setUint32(padLen - 8, Math.floor(l / 0x20000000));
    const blocks = full + (padLen >> 6);
    for (let b = 0; b < blocks; b++) {
      const src = b < full ? u8 : tail, o = b < full ? b << 6 : (b - full) << 6;
      for (let i = 0; i < 16; i++) { const p = o + (i << 2); w[i] = (src[p] << 24) | (src[p + 1] << 16) | (src[p + 2] << 8) | src[p + 3]; }
      for (let i = 16; i < 64; i++) { const a = w[i - 15], c = w[i - 2]; w[i] = (w[i - 16] + (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + w[i - 7] + (((c >>> 17) | (c << 15)) ^ ((c >>> 19) | (c << 13)) ^ (c >>> 10))) | 0; }
      let a = h0, bb = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0, t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + bb) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    let out = ''; for (const v of [h0, h1, h2, h3, h4, h5, h6, h7]) out += HEX[(v >>> 24) & 255] + HEX[(v >>> 16) & 255] + HEX[(v >>> 8) & 255] + HEX[v & 255]; return out;
  }
  const api = { sha256 };
  if (typeof module !== 'undefined') module.exports = api; else root.FastSha = api;
})(this);
