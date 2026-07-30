#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOM-PATH-DOORMAP scope (READ THE LOG after every run)
 * SPEC: bim-compiler prompts/Modeller/DISC_Walker/VIEWER_FIND_PANEL_ROOM_ACCURACY.md §21.8.
 * SCOPE: measure the user's 2-stage decomposition (2026-07-31). Measure only, no engine change.
 *   STAGE 1   precompute a walkable door-to-door map of the whole building, ONCE
 *   STAGE 2   on door/room selection, the shortest path is a sequence of doors — "the dots"
 *   STAGE 2.1 connect the dots = concatenate each hop's stored walk
 * Stage 1 deliberately stores a DOOR-ADJACENCY GRAPH (doors sharing a pocket; edge weight = the
 * MEASURED in-pocket walk), NOT an all-pairs table — LTU would be 183,315 door pairs.
 * PROVES/DISPROVES: does Dijkstra over that small graph reproduce the FULL free-space grid A* length
 * (§21.6)? If yes, stage 1 is a lossless compression of the grid search and every query is O(graph)
 * instead of O(cells). If the door graph is systematically LONGER, the pocket decomposition is lossy
 * and stage 1 needs more than doors as its nodes.
 * RUN: node witness_room_path_doormap.js 2>&1 | tee /tmp/w_roompath_doormap.log
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
function Heap(){this.a=[]}
Heap.prototype.push=function(n){const a=this.a;a.push(n);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p].f<=a[i].f)break;const t=a[p];a[p]=a[i];a[i]=t;i=p}};
Heap.prototype.pop=function(){const a=this.a;if(!a.length)return null;const top=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;const n=a.length;for(;;){const l=2*i+1,r=l+1;let s=i;if(l<n&&a[l].f<a[s].f)s=l;if(r<n&&a[r].f<a[s].f)s=r;if(s===i)break;const t=a[s];a[s]=a[i];a[i]=t;i=s}}return top};
Heap.prototype.size=function(){return this.a.length};
function buildField(rects,doors){const all=rects.concat(doors);if(!all.length)return null;
 let x0=1/0,y0=1/0,x1=-1/0,y1=-1/0;all.forEach(b=>{x0=Math.min(x0,b.x0);y0=Math.min(y0,b.y0);x1=Math.max(x1,b.x1);y1=Math.max(y1,b.y1)});
 x0-=1;y0-=1;x1+=1;y1+=1;const cols=Math.ceil((x1-x0)/RES),rows=Math.ceil((y1-y0)/RES);if(cols*rows>12000000)return null;
 const free=new Uint8Array(cols*rows);
 const mark=(b,inf)=>{const c0=Math.max(0,Math.floor((b.x0+inf-x0)/RES)),c1=Math.min(cols-1,Math.floor((b.x1-inf-x0)/RES));
  const r0=Math.max(0,Math.floor((b.y0+inf-y0)/RES)),r1=Math.min(rows-1,Math.floor((b.y1-inf-y0)/RES));
  for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)free[r*cols+c]=1};
 rects.forEach(b=>mark(b,0));doors.forEach(b=>mark(b,-RES));return{free,cols,rows,x0,y0}}
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
  doorList[st]=(doorsBy[st]||[]).map((d,i)=>({id:st+'#'+i,x:d[0],y:d[1],box:{x0:d[0]-d[2]/2,x1:d[0]+d[2]/2,y0:d[1]-d[3]/2,y1:d[1]+d[3]/2}}));
  fields[st]=buildField(rectsBy[st],doorList[st].map(d=>d.box))});
 // ── STAGE 1 ──
 const t0=Date.now();let edges=0,edgeFail=0;const adj={},seen={};
 const roomDoors=new Map();
 rooms.forEach(n=>roomDoors.set(n.guid,(doorList[n.storey]||[]).filter(d=>(n.rects||[]).some(rc=>
   d.box.x1>=rc.x0-0.4&&d.box.x0<=rc.x1+0.4&&d.box.y1>=rc.y0-0.4&&d.box.y0<=rc.y1+0.4))));
 rooms.forEach(n=>{const ds=roomDoors.get(n.guid),F=fields[n.storey];if(!F)return;
  for(let i=0;i<ds.length;i++)for(let j=i+1;j<ds.length;j++){
   const key=ds[i].id<ds[j].id?ds[i].id+'|'+ds[j].id:ds[j].id+'|'+ds[i].id;if(seen[key])continue;seen[key]=1;
   const p=astar(F,ds[i].x,ds[i].y,ds[j].x,ds[j].y);if(!p){edgeFail++;continue}
   const w=len(p);edges++;
   (adj[ds[i].id]=adj[ds[i].id]||[]).push({to:ds[j].id,w});(adj[ds[j].id]=adj[ds[j].id]||[]).push({to:ds[i].id,w})}});
 const buildMs=Date.now()-t0;
 const nDoors=Object.values(doorList).reduce((s,a)=>s+a.length,0);
 const orphan=Object.values(doorList).flat().filter(d=>!adj[d.id]).length;
 console.log('§DOORMAP_STAGE1 '+label+' doors='+nDoors+' pockets='+rooms.length+' edges='+edges+' edgeFail='+edgeFail+
   ' orphanDoors='+orphan+' buildMs='+buildMs+' (all-pairs table would be '+(nDoors*(nDoors-1)/2)+' entries)');
 // ── STAGE 2 / 2.1 ──
 let n=0,agree=0,worse=0,noRoute=0,sumD=0,sumA=0,msQ=0;const ratios=[];
 const stride=Math.max(1,Math.floor(rooms.length*rooms.length/2/1200));let k=0;
 outer:for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
  if((k++)%stride)continue;const a=rooms[i],b=rooms[j];if(a.storey!==b.storey)continue;
  const F=fields[a.storey];if(!F)continue;if(Math.hypot(b.cx-a.cx,b.cy-a.cy)<=2)continue;
  const da=roomDoors.get(a.guid),dbb=roomDoors.get(b.guid);if(!da.length||!dbb.length)continue;
  const direct=astar(F,a.cx,a.cy,b.cx,b.cy);if(!direct){noRoute++;continue}
  const LA=len(direct);const tq=Date.now();
  const dist={},vis={};const H=new Heap();
  for(const d of da){const p=astar(F,a.cx,a.cy,d.x,d.y);if(!p)continue;const w=len(p);if(dist[d.id]===undefined||w<dist[d.id]){dist[d.id]=w;H.push({f:w,id:d.id})}}
  while(H.size()){const c=H.pop();if(vis[c.id])continue;vis[c.id]=1;
   for(const e of (adj[c.id]||[])){const nd=dist[c.id]+e.w;if(dist[e.to]===undefined||nd<dist[e.to]){dist[e.to]=nd;H.push({f:nd,id:e.to})}}}
  let best=Infinity;
  for(const d of dbb){if(dist[d.id]===undefined)continue;const p=astar(F,d.x,d.y,b.cx,b.cy);if(!p)continue;const t=dist[d.id]+len(p);if(t<best)best=t}
  msQ+=Date.now()-tq;
  if(!isFinite(best)){noRoute++;continue}
  n++;sumD+=best;sumA+=LA;ratios.push(best/Math.max(.01,LA));
  if(best<=LA*1.05)agree++;else worse++;
  if(n>=120)break outer}
 console.log('§DOORMAP_STAGE2 '+label+' pairs='+n+' doorGraph='+sumD.toFixed(0)+'m directGridAstar='+sumA.toFixed(0)+
   'm ratio median='+med(ratios).toFixed(3)+'x within5pct='+agree+'/'+n+' longer='+worse+' unroutable='+noRoute+
   ' avgQueryMs='+(n?(msQ/n).toFixed(1):'0'));
 db.close();
 return{n,agree,worse,ratios,edges,nDoors,buildMs,orphan};
}
(async()=>{const SQL=await initSqlJs();
 console.log('W-ROOM-PATH-DOORMAP — VIEWER_FIND_PANEL_ROOM_ACCURACY.md §21.8');
 const c=await run(SQL,'Clinic','Clinic_extracted.db');
 const l=await run(SQL,'LTU_AHouse','LTU_AHouse_extracted.db');
 console.log('\n─── §21.8 assertions ───');
 chk('D1 stage 1 is compact — a door-adjacency graph, not an all-pairs table',
   c.edges<c.nDoors*c.nDoors/2&&l.edges<l.nDoors*l.nDoors/2,'Clinic edges='+c.edges+'/'+(c.nDoors*(c.nDoors-1)/2)+' LTU edges='+l.edges+'/'+(l.nDoors*(l.nDoors-1)/2));
 chk('D2 stage 2 reproduces the full grid search within 5% on the great majority of pairs',
   c.agree/Math.max(1,c.n)>0.8&&l.agree/Math.max(1,l.n)>0.8,'Clinic '+c.agree+'/'+c.n+' LTU '+l.agree+'/'+l.n);
 console.log('\n§W-ROOM-PATH-DOORMAP DONE pass='+pass+' fail='+fail);
 process.exit(fail?1:0);
})();
