// Independent float64 colour math (no ICC engine): sRGB / Display-P3 <-> XYZ(D50, Bradford) <-> Lab, and CIEDE2000.
(function (root) {
  const mul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0]*B[0][j] + r[1]*B[1][j] + r[2]*B[2][j]));
  const mv = (A, v) => A.map((r) => r[0]*v[0] + r[1]*v[1] + r[2]*v[2]);
  const inv = (m) => { const [[a,b,c],[d,e,f],[g,h,i]] = m, A = e*i-f*h, B = -(d*i-f*g), C = d*h-e*g, det = a*A + b*B + c*C;
    return [[A, -(b*i-c*h), b*f-c*e], [B, a*i-c*g, -(a*f-c*d)], [C, -(a*h-b*g), a*e-b*d]].map((r) => r.map((x) => x / det)); };
  const xyY = (x, y) => [x / y, 1, (1 - x - y) / y];
  const D50 = [0.9642, 1.0, 0.8249], D65 = xyY(0.3127, 0.3290);   // D50 as in the ICC spec / lcms
  const BFD = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]];
  function adapt(srcW, dstW) { const s = mv(BFD, srcW), d = mv(BFD, dstW); const S = [[d[0]/s[0],0,0],[0,d[1]/s[1],0],[0,0,d[2]/s[2]]]; return mul(inv(BFD), mul(S, BFD)); }
  function rgbToXyzMatrix(p, wxy) {   // p = {r:[x,y], g:[x,y], b:[x,y]}
    const P = [p.r, p.g, p.b].map(([x, y]) => xyY(x, y)), M = [0,1,2].map((r) => [P[0][r], P[1][r], P[2][r]]), W = xyY(wxy[0], wxy[1]), S = mv(inv(M), W);
    return M.map((r) => r.map((x, j) => x * S[j])); }
  const PRIM = { srgb: { r: [0.64, 0.33], g: [0.30, 0.60], b: [0.15, 0.06] }, p3: { r: [0.680, 0.320], g: [0.265, 0.690], b: [0.150, 0.060] } };
  const WXY = [0.3127, 0.3290], CAT = adapt(D65, D50);
  const toD50 = (space) => mul(CAT, rgbToXyzMatrix(PRIM[space], WXY));   // linear RGB -> XYZ D50
  const dec = (v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4), enc = (v) => v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1/2.4) - 0.055;   // sRGB TRC (also used by Display-P3)
  const M = { srgb: toD50('srgb'), p3: toD50('p3') };
  const rgbToXyz = (space, c8) => mv(M[space], c8.map((v) => dec(v / 255)));
  const xyzToRgb8 = (space, xyz) => mv(inv(M[space]), xyz).map((v) => 255 * enc(Math.max(0, Math.min(1, v))));   // clipped
  const f = (t) => t > 216/24389 ? Math.cbrt(t) : (24389/27 * t + 16) / 116;
  const xyzToLab = (xyz) => { const fx = f(xyz[0]/D50[0]), fy = f(xyz[1]/D50[1]), fz = f(xyz[2]/D50[2]); return [116*fy - 16, 500*(fx-fy), 200*(fy-fz)]; };
  function dE2000(l1, l2) {   // Sharma, Wu, Dalal 2005
    const rad = Math.PI / 180, deg = 180 / Math.PI, [L1,a1,b1] = l1, [L2,a2,b2] = l2;
    const C1 = Math.hypot(a1,b1), C2 = Math.hypot(a2,b2), Cb = (C1+C2)/2, G = 0.5*(1 - Math.sqrt(Cb**7/(Cb**7 + 25**7)));
    const ap1 = (1+G)*a1, ap2 = (1+G)*a2, Cp1 = Math.hypot(ap1,b1), Cp2 = Math.hypot(ap2,b2);
    const hp = (b,a) => (b === 0 && a === 0) ? 0 : ((Math.atan2(b,a)*deg) + 360) % 360, h1 = hp(b1,ap1), h2 = hp(b2,ap2);
    const dL = L2-L1, dC = Cp2-Cp1; let dh = 0; if (Cp1*Cp2 !== 0) { dh = h2-h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
    const dH = 2*Math.sqrt(Cp1*Cp2)*Math.sin(dh*rad/2), Lb = (L1+L2)/2, Cpb = (Cp1+Cp2)/2;
    let hb = h1+h2; if (Cp1*Cp2 === 0) hb = h1+h2; else if (Math.abs(h1-h2) <= 180) hb = (h1+h2)/2; else hb = (h1+h2 < 360) ? (h1+h2+360)/2 : (h1+h2-360)/2;
    const T = 1 - 0.17*Math.cos((hb-30)*rad) + 0.24*Math.cos(2*hb*rad) + 0.32*Math.cos((3*hb+6)*rad) - 0.20*Math.cos((4*hb-63)*rad);
    const dth = 30*Math.exp(-(((hb-275)/25)**2)), Rc = 2*Math.sqrt(Cpb**7/(Cpb**7 + 25**7)), Sl = 1 + 0.015*(Lb-50)**2/Math.sqrt(20+(Lb-50)**2), Sc = 1 + 0.045*Cpb, Sh = 1 + 0.015*Cpb*T, Rt = -Math.sin(2*dth*rad)*Rc;
    return Math.sqrt((dL/Sl)**2 + (dC/Sc)**2 + (dH/Sh)**2 + Rt*(dC/Sc)*(dH/Sh));
  }
  function selfTest() {   // published Sharma pairs
    const P = [[[50,2.6772,-79.7751],[50,0,-82.7485],2.0425],[[50,3.1571,-77.2803],[50,0,-82.7485],2.8615],[[50,2.5,0],[50,0,-2.5],4.3065],[[50,2.5,0],[73,25,-18],27.1492],[[60.2574,-34.0099,36.2677],[60.4626,-34.1751,39.4387],1.2644]];
    return Math.max(...P.map(([a,b,e]) => Math.abs(dE2000(a,b) - e)));
  }
  const api = { mul, mv, inv, D50, D65, adapt, rgbToXyzMatrix, PRIM, WXY, CAT, M, rgbToXyz, xyzToRgb8, xyzToLab, dE2000, selfTest, dec, enc };
  if (typeof module !== 'undefined') module.exports = api; else root.ColorMath = api;
})(this);
