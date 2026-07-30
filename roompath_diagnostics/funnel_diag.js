// Discriminate the two candidate causes of §21.11-task-1's T1 failure:
//  (A) my left/right portal orientation is wrong  -> a synthetic channel with a known answer exposes it
//  (B) the channel is invalid because pockets are NON-CONVEX (funnel is exact only over convex cells)
//      -> restricting to single-rect (convex) rooms should then fix it
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

// ── TEST A1: straight corridor, 3 portals, travel +x. Correct answer = straight line, length 6.
let P=[{l:{x:0,y:0},r:{x:0,y:0}},
       {l:{x:2,y:1},r:{x:2,y:-1}},
       {l:{x:4,y:1},r:{x:4,y:-1}},
       {l:{x:6,y:0},r:{x:6,y:0}}];
let r=funnel(P);
console.log('A1 straight corridor  len='+len(r).toFixed(3)+' (expect 6.000) pts='+JSON.stringify(r));

// ── TEST A2: same corridor with left/right SWAPPED — this is what a wrong orientation looks like.
let P2=[{l:{x:0,y:0},r:{x:0,y:0}},
        {l:{x:2,y:-1},r:{x:2,y:1}},
        {l:{x:4,y:-1},r:{x:4,y:1}},
        {l:{x:6,y:0},r:{x:6,y:0}}];
let r2=funnel(P2);
console.log('A2 swapped orientation len='+len(r2).toFixed(3)+' pts='+JSON.stringify(r2));

// ── TEST A3: an L-bend that REQUIRES a corner. Portals force the path around (2,2). Expect > straight.
let P3=[{l:{x:0,y:0},r:{x:0,y:0}},
        {l:{x:1,y:2},r:{x:1,y:0}},
        {l:{x:3,y:2},r:{x:3,y:0}},
        {l:{x:3,y:4},r:{x:5,y:4}},
        {l:{x:4,y:6},r:{x:4,y:6}}];
let r3=funnel(P3);
console.log('A3 L-bend             len='+len(r3).toFixed(3)+' straight='+Math.hypot(4,6).toFixed(3)+' pts='+JSON.stringify(r3));
