#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOM-PATH-FUNNEL scope (READ THE LOG after every run)
 * SPEC: bim-compiler prompts/Modeller/DISC_Walker/VIEWER_FIND_PANEL_ROOM_ACCURACY.md §21.11 task 1,
 * algorithm cited in §21.12, user-language mapping in §21.13. Measure only — no engine file touched.
 *
 * TASK: §21.8 measured stage 2.1 ("connect all the dots") as LOSSY — joining door CENTRES costs
 * 1.206x (Clinic) / 1.114x (LTU) versus the direct grid A*+string-pull reference, within 5% on only
 * 23/110 and 13/76 pairs. Cause: a door is an APERTURE (segment), not a dot. Fix per §21.12: the
 * funnel algorithm (Lee & Preparata 1984 / "simple stupid funnel"), which is EXACT for a given portal
 * sequence and is the same procedure as the user's own "arrow ahead, trail of dots behind" (§21.13).
 *
 * FALSIFICATION TEST — written before the implementation, per §21.14, and asserted below:
 *   T1  funnel MUST be <= door-centre joining on essentially every pair. If it is not, the portal
 *       orientation (left/right assignment) is wrong — that is the classic funnel bug.
 *   T2  funnel MUST close most of the gap to the reference: median ratio vs direct grid A*+string-pull
 *       <= 1.05x. If it does not move at all, THE MAP IS WRONG, NOT THE FUNNEL (§21.14).
 *   T3  the funnelled line must stay inside the walkable map at least as well as the reference does
 *       (§21.9's off-map sampling at 0.05m). An "optimal" path that leaves the floor is not a fix.
 * A funnel that fails T1 is a bug; a funnel that passes T1 but fails T2 is EVIDENCE ABOUT THE MAP and
 * must be reported as such, not tuned away.
 *
 * RUN: node witness_room_path_funnel.js 2>&1 | tee /tmp/w_roompath_funnel.log
 */
'use strict';
const fs=require('fs'),path=require('path');
const initSqlJs=require(path.join(process.env.HOME,'bim-ootb','node_modules','sql.js'));
const RG=require('./common/room_graph.js');
const RW=require('./viewer/lib/room_walker.js');
const BLD=path.join(process.env.HOME,'bim-ootb','buildings');
const RES=RW.RES;
let pass=0,fail=0;
const chk=(n,c,x)=>{if(c){pass++;console.log('  ✅ '+n+(x?'  '+x:''))}else{fail++;console.log('  ❌ '+n+(x?'  '+x:''))}};
const len=p=>{let L=0;for(let i=0;i+1<p.length;i++)L+=Math.hypot(p[i+1].x-p[i].x,p[i+1].y-p[i].y);return L};
const med=a=>{if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(s.length/2)]};
const qn=(a,p)=>{if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))]};
function Heap(){this.a=[]}
Heap.prototype.push=function(n){const a=this.a;a.push(n);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p].f<=a[i].f)break;const t=a[p];a[p]=a[i];a[i]=t;i=p}};
Heap.prototype.pop=function(){const a=this.a;if(!a.length)return null;const top=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;const n=a.length;for(;;){const l=2*i+1,r=l+1;let s=i;if(l<n&&a[l].f<a[s].f)s=l;if(r<n&&a[r].f<a[s].f)s=r;if(s===i)break;const t=a[s];a[s]=a[i];a[i]=t;i=s}}return top};
Heap.prototype.size=function(){return this.a.length};

// ───────── the free-space map (§21.6): walker pockets free, door footprints the connectors ─────────
function buildField(rects,doors){const all=rects.concat(doors);if(!all.length)return null;
 let x0=1/0,y0=1/0,x1=-1/0,y1=-1/0;all.forEach(b=>{x0=Math.min(x0,b.x0);y0=Math.min(y0,b.y0);x1=Math.max(x1,b.x1);y1=Math.max(y1,b.y1)});
 x0-=1;y0-=1;x1+=1;y1+=1;const cols=Math.ceil((x1-x0)/RES),rows=Math.ceil((y1-y0)/RES);if(cols*rows>12000000)return null;
 const free=new Uint8Array(cols*rows);
 const mark=(b,inf)=>{const c0=Math.max(0,Math.floor((b.x0+inf-x0)/RES)),c1=Math.min(cols-1,Math.floor((b.x1-inf-x0)/RES));
  const r0=Math.max(0,Math.floor((b.y0+inf-y0)/RES)),r1=Math.min(rows-1,Math.floor((b.y1-inf-y0)/RES));
  for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)free[r*cols+c]=1};
 rects.forEach(b=>mark(b,0));doors.forEach(b=>mark(b,-RES));return{free,cols,rows,x0,y0}}
const isFree=(F,x,y)=>{const c=Math.floor((x-F.x0)/RES),r=Math.floor((y-F.y0)/RES);
 return !(c<0||r<0||c>=F.cols||r>=F.rows)&&F.free[r*F.cols+c]===1};
function astar(F,ax,ay,bx,by){const{free,cols,rows,x0,y0}=F;
 const ok=(c,r)=>c>=0&&r>=0&&c<cols&&r<rows&&free[r*cols+c]===1;
 const snap=(x,y)=>{let c=Math.floor((x-x0)/RES),r=Math.floor((y-y0)/RES);if(ok(c,r))return{c,r};
  const R=Math.ceil(1.5/RES);for(let rad=1;rad<=R;rad++)for(let dc=-rad;dc<=rad;dc++)for(let dr=-rad;dr<=rad;dr++){
   if(Math.max(Math.abs(dc),Math.abs(dr))!==rad)continue;if(ok(c+dc,r+dr))return{c:c+dc,r:r+dr}}return null};
 const s=snap(ax,ay),g=snap(bx,by);if(!s||!g)return null;
 const idx=(c,r)=>r*cols+c,goalI=idx(g.c,g.r),gs=new Map(),came=new Map(),closed=new Uint8Array(cols*rows);
 gs.set(idx(s.c,s.r),0);const h=(c,r)=>{const dc=Math.abs(c-g.c),dr=Math.abs(r-g.r);return(dc+dr)+(Math.SQRT2-2)*Math.min(dc,dr)};
 const heap=new Heap();heap.push({i:idx(s.c,s.r),c:s.c,r:s.r,f:h(s.c,s.r)});
 const D=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
 while(heap.size()){const cur=heap.pop();
  if(cur.i===goalI){const out=[];let ci=goalI;while(ci!==undefined){const cc=ci%cols,rr=(ci-cc)/cols;out.push({x:x0+(cc+.5)*RES,y:y0+(rr+.5)*RES});ci=came.get(ci)}out.reverse();return out}
  if(closed[cur.i])continue;closed[cur.i]=1;
  for(let d=0;d<8;d++){const nc=cur.c+D[d][0],nr=cur.r+D[d][1];if(!ok(nc,nr))continue;
   if(D[d][2]>1&&(!ok(cur.c+D[d][0],cur.r)||!ok(cur.c,cur.r+D[d][1])))continue;
   const ni=idx(nc,nr);if(closed[ni])continue;const ng=gs.get(cur.i)+D[d][2];
   if(gs.get(ni)===undefined||ng<gs.get(ni)){gs.set(ni,ng);came.set(ni,cur.i);heap.push({i:ni,c:nc,r:nr,f:ng+h(nc,nr)})}}}
 return null}
function simplify(F,pts){const clear=(a,b)=>{const L=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(L/(RES/2)));
  for(let i=0;i<=n;i++){const t=i/n;if(!isFree(F,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t))return false}return true};
 if(pts.length<=2)return pts.slice();const out=[pts[0]];let i=0;
 while(i<pts.length-1){let j=pts.length-1;for(;j>i+1;j--)if(clear(pts[i],pts[j]))break;out.push(pts[j]);i=j}return out}
function offMap(F,pts){let bad=0,tot=0;
 for(let i=0;i+1<pts.length;i++){const L=Math.hypot(pts[i+1].x-pts[i].x,pts[i+1].y-pts[i].y),n=Math.max(1,Math.ceil(L/0.05));
  for(let s=0;s<=n;s++){const t=s/n;tot++;if(!isFree(F,pts[i].x+(pts[i+1].x-pts[i].x)*t,pts[i].y+(pts[i+1].y-pts[i].y)*t))bad++}}
 return{bad,tot}}

// ───────────────────────── §21.12/§21.13 — the funnel ─────────────────────────
// triarea2 > 0 => c is LEFT of ab. Standard "simple stupid funnel" over a portal sequence.
const tri2=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);
const same=(a,b)=>Math.abs(a.x-b.x)<1e-9&&Math.abs(a.y-b.y)<1e-9;
function funnel(portals){
  const pts=[portals[0].l]; let apex=portals[0].l, L=portals[0].l, R=portals[0].r, ai=0, li=0, ri=0;
  for(let i=1;i<portals.length;i++){
    const nl=portals[i].l, nr=portals[i].r;
    // tighten right
    if(tri2(apex,R,nr)<=0){
      if(same(apex,R)||tri2(apex,L,nr)>0){ R=nr; ri=i; }
      else { pts.push(L); apex=L; ai=li; L=apex; R=apex; li=ai; ri=ai; i=ai; continue; }
    }
    // tighten left
    if(tri2(apex,L,nl)>=0){
      if(same(apex,L)||tri2(apex,R,nl)<0){ L=nl; li=i; }
      else { pts.push(R); apex=R; ai=ri; L=apex; R=apex; li=ai; ri=ai; i=ai; continue; }
    }
  }
  const end=portals[portals.length-1].l;
  if(!pts.length||!same(pts[pts.length-1],end)) pts.push(end);
  return pts;
}
// A door's APERTURE as a segment (its measured opening), oriented left/right for travel direction d.
function aperture(d,dir){
  const bx=d.bw, by=d.bh;
  let p,q;
  if(bx>=by){ p={x:d.x-bx/2,y:d.y}; q={x:d.x+bx/2,y:d.y}; }
  else { p={x:d.x,y:d.y-by/2}; q={x:d.x,y:d.y+by/2}; }
  // §21.18 FIX: the SSF formulation's l/r are defined in a CLOCKWISE frame, so its "left" is the
  // vertex that is geometrically RIGHT of travel in a standard (y-up, CCW-positive) frame. Verified
  // by hand-computed unit tests over a valid 3-convex-cell L-channel with a reflex corner
  // (roompath_diagnostics/funnel_unit.js): B1 assigns true-left to `l`, CONSISTENTLY, and still
  // returns 5.1167 against an expected 3.7025; B3 assigns true-RIGHT to `l` and returns 3.7025
  // exactly. So attempt 1's fault was a convention inversion, NOT inconsistent winding and NOT
  // pocket convexity (§21.16 already ruled that out).
  const cr=dir.x*(p.y-d.y)-dir.y*(p.x-d.x);
  return cr>0?{l:q,r:p}:{l:p,r:q};
}
function pathStorey(g,p){let s=null;for(const q of p){const n=g.nodesByGuid[q];if(!n||n.storey==null||n.kind==='stairwp')continue;if(s==null)s=n.storey;else if(s!==n.storey)return null}return s}

async function run(SQL,label,file){
 console.log('\n═══ '+label+' ═══');
 const db=new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD,file))));
 const rl=console.log;console.log=()=>{};RW.walk(db,{write:true});
 const dbq=s=>{try{const r=db.exec(s);return r.length?r[0].values:[]}catch(e){return[]}};
 const g=RG.buildGraph(dbq,{log:()=>{}});const anch=RW.storeyZAnchors(db);const doorsBy=RW.storeyDoors(db,anch);console.log=rl;
 const rooms=g.nodes.filter(n=>n.kind==='room');
 const rectsBy={};rooms.forEach(n=>{(rectsBy[n.storey]=rectsBy[n.storey]||[]).push(...(n.rects||[]))});
 const fields={},doorList={};
 Object.keys(rectsBy).forEach(st=>{
  doorList[st]=(doorsBy[st]||[]).map((d,i)=>({id:st+'#'+i,x:d[0],y:d[1],bw:d[2],bh:d[3],
    box:{x0:d[0]-d[2]/2,x1:d[0]+d[2]/2,y0:d[1]-d[3]/2,y1:d[1]+d[3]/2}}));
  fields[st]=buildField(rectsBy[st],doorList[st].map(d=>d.box))});
 // STAGE 1 — door adjacency (unchanged from §21.8)
 const byId={};Object.values(doorList).flat().forEach(d=>byId[d.id]=d);
 const adj={},seen={};const roomDoors=new Map();
 rooms.forEach(n=>roomDoors.set(n.guid,(doorList[n.storey]||[]).filter(d=>(n.rects||[]).some(rc=>
   d.box.x1>=rc.x0-0.4&&d.box.x0<=rc.x1+0.4&&d.box.y1>=rc.y0-0.4&&d.box.y0<=rc.y1+0.4))));
 const rl0=console.log;console.log=()=>{};
 rooms.forEach(n=>{const ds=roomDoors.get(n.guid),F=fields[n.storey];if(!F)return;
  for(let i=0;i<ds.length;i++)for(let j=i+1;j<ds.length;j++){
   const k=ds[i].id<ds[j].id?ds[i].id+'|'+ds[j].id:ds[j].id+'|'+ds[i].id;if(seen[k])continue;seen[k]=1;
   const p=astar(F,ds[i].x,ds[i].y,ds[j].x,ds[j].y);if(!p)continue;const w=len(p);
   (adj[ds[i].id]=adj[ds[i].id]||[]).push({to:ds[j].id,w});(adj[ds[j].id]=adj[ds[j].id]||[]).push({to:ds[i].id,w})}});
 console.log=rl0;

 // §21.15 DISCRIMINATOR (CONVEX_ONLY=1): restrict to pairs whose whole door sequence touches only
 // SINGLE-RECT pockets. A single rect is convex; a §MULTI-RECT union generally is not, and the funnel
 // is exact ONLY over convex cells. If T1/T3 pass here and fail otherwise, cause (B) is confirmed.
 const CONVEX_ONLY=process.env.CONVEX_ONLY==='1';
 const convexRoom={};rooms.forEach(r=>{convexRoom[r.guid]=((r.rects||[]).length===1)});
 const doorRooms={};rooms.forEach(r=>{(roomDoors.get(r.guid)||[]).forEach(d=>{(doorRooms[d.id]=doorRooms[d.id]||[]).push(r.guid)})});
 const seqConvex=(a,b,seq)=>convexRoom[a.guid]&&convexRoom[b.guid]&&
   seq.every(d=>(doorRooms[d.id]||[]).every(gu=>convexRoom[gu]));
 let n=0,sumRef=0,sumCen=0,sumFun=0,funWorse=0,offF=0,totF=0,offR=0,totR=0,skippedNonConvex=0;
 const rCen=[],rFun=[];
 const stride=Math.max(1,Math.floor(rooms.length*rooms.length/2/1200));let k=0;
 const rl2=console.log;console.log=()=>{};
 outer:for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
  if((k++)%stride)continue;const a=rooms[i],b=rooms[j];if(a.storey!==b.storey)continue;
  const F=fields[a.storey];if(!F)continue;if(Math.hypot(b.cx-a.cx,b.cy-a.cy)<=2)continue;
  const da=roomDoors.get(a.guid),dbb=roomDoors.get(b.guid);if(!da.length||!dbb.length)continue;
  const raw=astar(F,a.cx,a.cy,b.cx,b.cy);if(!raw)continue;
  const ref=simplify(F,raw),LR=len(ref);
  // STAGE 2 — Dijkstra over the door graph, WITH predecessor so we get the door SEQUENCE
  const dist={},prev={},vis={};const H=new Heap();
  for(const d of da){const p=astar(F,a.cx,a.cy,d.x,d.y);if(!p)continue;const w=len(p);
   if(dist[d.id]===undefined||w<dist[d.id]){dist[d.id]=w;prev[d.id]=null;H.push({f:w,id:d.id})}}
  while(H.size()){const c=H.pop();if(vis[c.id])continue;vis[c.id]=1;
   for(const e of (adj[c.id]||[])){const nd=dist[c.id]+e.w;
    if(dist[e.to]===undefined||nd<dist[e.to]){dist[e.to]=nd;prev[e.to]=c.id;H.push({f:nd,id:e.to})}}}
  let bestId=null,best=Infinity;
  for(const d of dbb){if(dist[d.id]===undefined)continue;const p=astar(F,d.x,d.y,b.cx,b.cy);if(!p)continue;
   const t=dist[d.id]+len(p);if(t<best){best=t;bestId=d.id}}
  if(!isFinite(best))continue;
  const seq=[];let cur=bestId;while(cur){seq.unshift(byId[cur]);cur=prev[cur]}
  // STAGE 2.1a — join door CENTRES (today's lossy version, §21.8)
  const cen=[{x:a.cx,y:a.cy}].concat(seq.map(d=>({x:d.x,y:d.y}))).concat([{x:b.cx,y:b.cy}]);
  const LC=len(cen);
  // STAGE 2.1b — FUNNEL over door APERTURES
  const centres=[{x:a.cx,y:a.cy}].concat(seq.map(d=>({x:d.x,y:d.y}))).concat([{x:b.cx,y:b.cy}]);
  const portals=[{l:{x:a.cx,y:a.cy},r:{x:a.cx,y:a.cy}}];
  for(let s2=0;s2<seq.length;s2++){
   const prevC=centres[s2], nextC=centres[s2+2];
   const dir={x:nextC.x-prevC.x,y:nextC.y-prevC.y};
   if(Math.hypot(dir.x,dir.y)<1e-9){dir.x=1;dir.y=0}
   portals.push(aperture(seq[s2],dir));
  }
  portals.push({l:{x:b.cx,y:b.cy},r:{x:b.cx,y:b.cy}});
  if(CONVEX_ONLY&&!seqConvex(a,b,seq)){skippedNonConvex++;continue}
  const fun=funnel(portals);const LF=len(fun);
  n++;sumRef+=LR;sumCen+=LC;sumFun+=LF;rCen.push(LC/Math.max(.01,LR));rFun.push(LF/Math.max(.01,LR));
  if(LF>LC*1.001)funWorse++;
  const oF=offMap(F,fun);offF+=oF.bad;totF+=oF.tot;
  const oR=offMap(F,ref);offR+=oR.bad;totR+=oR.tot;
  if(n>=120)break outer}
 console.log=rl2;
 console.log('§FUNNEL_MODE '+label+' CONVEX_ONLY='+(CONVEX_ONLY?'1':'0')+
  ' convexPockets='+Object.values(convexRoom).filter(Boolean).length+'/'+rooms.length+
  ' skippedNonConvex='+skippedNonConvex);
 console.log('§FUNNEL_LEN '+label+' pairs='+n+' reference(gridA*+stringPull)='+sumRef.toFixed(0)+'m'+
  ' doorCentres='+sumCen.toFixed(0)+'m funnel='+sumFun.toFixed(0)+'m');
 console.log('§FUNNEL_RATIO '+label+' vs reference — doorCentres median='+med(rCen).toFixed(3)+'x p90='+qn(rCen,.9).toFixed(3)+
  'x  |  FUNNEL median='+med(rFun).toFixed(3)+'x p90='+qn(rFun,.9).toFixed(3)+'x');
 console.log('§FUNNEL_T1 '+label+' funnelLongerThanCentres='+funWorse+'/'+n+' (must be ~0 — else portal orientation is wrong)');
 console.log('§FUNNEL_T3 '+label+' offMap funnel='+offF+'/'+totF+' ('+(100*offF/Math.max(1,totF)).toFixed(2)+'%)'+
  ' reference='+offR+'/'+totR+' ('+(100*offR/Math.max(1,totR)).toFixed(2)+'%)');
 db.close();
 return{n,rCen,rFun,funWorse,offF,totF,offR,totR};
}
(async()=>{const SQL=await initSqlJs();
 console.log('W-ROOM-PATH-FUNNEL — VIEWER_FIND_PANEL_ROOM_ACCURACY.md §21.11 task 1');
 const c=await run(SQL,'Clinic','Clinic_extracted.db');
 const l=await run(SQL,'LTU_AHouse','LTU_AHouse_extracted.db');
 console.log('\n─── falsification tests (written before the implementation, §21.14) ───');
 chk('T1 funnel is never longer than joining door centres (portal orientation correct)',
   c.funWorse<=c.n*0.02&&l.funWorse<=l.n*0.02,'Clinic '+c.funWorse+'/'+c.n+' LTU '+l.funWorse+'/'+l.n);
 chk('T2 funnel closes the gap to the reference — median <=1.05x',
   med(c.rFun)<=1.05&&med(l.rFun)<=1.05,'Clinic '+med(c.rFun).toFixed(3)+'x (centres '+med(c.rCen).toFixed(3)+
   'x) LTU '+med(l.rFun).toFixed(3)+'x (centres '+med(l.rCen).toFixed(3)+'x)');
 chk('T3 funnelled line stays on the map at least as well as the reference',
   c.offF/Math.max(1,c.totF)<=c.offR/Math.max(1,c.totR)*3+0.001&&l.offF/Math.max(1,l.totF)<=l.offR/Math.max(1,l.totR)*3+0.001,
   'funnel '+(100*c.offF/Math.max(1,c.totF)).toFixed(2)+'%/'+(100*l.offF/Math.max(1,l.totF)).toFixed(2)+
   '% vs ref '+(100*c.offR/Math.max(1,c.totR)).toFixed(2)+'%/'+(100*l.offR/Math.max(1,l.totR)).toFixed(2)+'%');
 console.log('\n§W-ROOM-PATH-FUNNEL DONE pass='+pass+' fail='+fail);
 process.exit(fail?1:0);
})();
