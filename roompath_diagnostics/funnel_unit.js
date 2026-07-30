// §21.18 — RIGOROUS funnel unit tests over VALID channels (three convex cells forming an L), with
// hand-computed expected answers. §21.15's A3 was a hand-built channel whose consecutive portals
// shared no convex cell, so it could not distinguish an algorithm bug from an invalid input.
// Geometry: A=[0,2]x[0,2]  B=[2,4]x[0,2]  C=[2,4]x[2,4]. Union is an L with a REFLEX corner at (2,2).
// Portal A|B = x=2, y in [0,2].  Portal B|C = y=2, x in [2,4].
const tri2=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);
const same=(a,b)=>Math.abs(a.x-b.x)<1e-9&&Math.abs(a.y-b.y)<1e-9;
function funnel(portals){
  const pts=[portals[0].l];let apex=portals[0].l,L=portals[0].l,R=portals[0].r,ai=0,li=0,ri=0;
  for(let i=1;i<portals.length;i++){const nl=portals[i].l,nr=portals[i].r;
    if(tri2(apex,R,nr)<=0){if(same(apex,R)||tri2(apex,L,nr)>0){R=nr;ri=i}
      else{pts.push(L);apex=L;ai=li;L=apex;R=apex;li=ai;ri=ai;i=ai;continue}}
    if(tri2(apex,L,nl)>=0){if(same(apex,L)||tri2(apex,R,nl)<0){L=nl;li=i}
      else{pts.push(R);apex=R;ai=ri;L=apex;R=apex;li=ai;ri=ai;i=ai;continue}}}
  const end=portals[portals.length-1].l;
  if(!pts.length||!same(pts[pts.length-1],end))pts.push(end);return pts}
const len=p=>{let L=0;for(let i=0;i+1<p.length;i++)L+=Math.hypot(p[i+1].x-p[i].x,p[i+1].y-p[i].y);return L};
const show=(n,r,exp)=>console.log(n.padEnd(34)+' len='+len(r).toFixed(4)+' expect='+exp.toFixed(4)+
  (Math.abs(len(r)-exp)<1e-3?'  ✅':'  ❌ BUG')+'  pts='+JSON.stringify(r.map(p=>[+p.x.toFixed(2),+p.y.toFixed(2)])));

const S={x:0.5,y:0.5}, E={x:2.5,y:3.5};
// hand-computed: straight S->E exits the L (at x=2 it is at y=2.75 > 2), so the taut path bends at
// the reflex corner (2,2).  len = |S->(2,2)| + |(2,2)->E| = 2.12132 + 1.58114 = 3.70246
const EXP=Math.hypot(1.5,1.5)+Math.hypot(0.5,1.5);

// B1 — CORRECT winding. Travel +x through A|B (left = +y), then +y through B|C (left = -x).
show('B1 L-channel, correct winding', funnel([
  {l:S,r:S}, {l:{x:2,y:2},r:{x:2,y:0}}, {l:{x:2,y:2},r:{x:4,y:2}}, {l:E,r:E}]), EXP);

// B2 — SECOND portal flipped. This is exactly what an independent per-portal orientation heuristic
// produces when its local direction estimate points the wrong way.
show('B2 same channel, portal2 flipped', funnel([
  {l:S,r:S}, {l:{x:2,y:2},r:{x:2,y:0}}, {l:{x:4,y:2},r:{x:2,y:2}}, {l:E,r:E}]), EXP);

// B3 — BOTH portals flipped (globally reversed winding — still self-consistent).
show('B3 both flipped (consistent)', funnel([
  {l:S,r:S}, {l:{x:2,y:0},r:{x:2,y:2}}, {l:{x:4,y:2},r:{x:2,y:2}}, {l:E,r:E}]), EXP);

// B4 — straight corridor, no bend: taut path is the straight line.
show('B4 straight corridor', funnel([
  {l:{x:0,y:0},r:{x:0,y:0}}, {l:{x:2,y:1},r:{x:2,y:-1}}, {l:{x:4,y:1},r:{x:4,y:-1}},
  {l:{x:6,y:0},r:{x:6,y:0}}]), 6);
