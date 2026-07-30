// §21.10 — loop-cut / shortcut check: do R2 point-revisits and R3 reversals survive in the prototype?
// empty space?" Direct test of the string-pull guard: sample every produced polyline at 0.05m and
// count samples the walkable map itself says are NOT free. Also reports the SHIPPED engine's drawn
// polyline under the identical test, as the control.
const fs=require('fs'),path=require('path');
const initSqlJs=require(path.join(process.env.HOME,'bim-ootb','node_modules','sql.js'));
const RG=require('/tmp/wt-roompath/common/room_graph.js');
const RW=require('/tmp/wt-roompath/viewer/lib/room_walker.js');
const BLD=path.join(process.env.HOME,'bim-ootb','buildings');
const RES=RW.RES;
const len=p=>{let L=0;for(let i=0;i+1<p.length;i++)L+=Math.hypot(p[i+1].x-p[i].x,p[i+1].y-p[i].y);return L};
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
const isFree=(F,x,y)=>{const c=Math.floor((x-F.x0)/RES),r=Math.floor((y-F.y0)/RES);
 return !(c<0||r<0||c>=F.cols||r>=F.rows)&&F.free[r*F.cols+c]===1};
// §20.2 R2 + R3, verbatim definitions, applied to whichever polyline is passed in
function redun(pts){let rev=0,turn=0,tm=0;
 for(let i=0;i<pts.length;i++)for(let j=0;j+2<=i;j++)
  if(Math.hypot(pts[i].x-pts[j].x,pts[i].y-pts[j].y)<=0.05){rev++;break}
 for(let i=1;i+1<pts.length;i++){const ax=pts[i].x-pts[i-1].x,ay=pts[i].y-pts[i-1].y,
  bx=pts[i+1].x-pts[i].x,by=pts[i+1].y-pts[i].y,la=Math.hypot(ax,ay),lb=Math.hypot(bx,by);
  if(la<1e-6||lb<1e-6)continue;
  if((ax*bx+ay*by)/(la*lb)<-0.866){turn++;tm+=Math.min(la,lb)}}
 return{rev,turn,tm}}
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
function st(g,p){let s=null;for(const q of p){const n=g.nodesByGuid[q];if(!n||n.storey==null||n.kind==='stairwp')continue;if(s==null)s=n.storey;else if(s!==n.storey)return null}return s}
(async()=>{const SQL=await initSqlJs();
for(const f of ['Clinic_extracted.db','LTU_AHouse_extracted.db']){
 const db=new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD,f))));
 const rl=console.log;console.log=()=>{};RW.walk(db,{write:true});
 const dbq=s=>{try{const r=db.exec(s);return r.length?r[0].values:[]}catch(e){return[]}};
 const g=RG.buildGraph(dbq,{log:()=>{}});const anch=RW.storeyZAnchors(db);const doorsBy=RW.storeyDoors(db,anch);console.log=rl;
 const rooms=g.nodes.filter(n=>n.kind==='room');const rectsBy={};
 rooms.forEach(n=>{(rectsBy[n.storey]=rectsBy[n.storey]||[]).push(...(n.rects||[]))});
 const fields={};Object.keys(rectsBy).forEach(s2=>{
  const dbx=(doorsBy[s2]||[]).map(d=>({x0:d[0]-d[2]/2,x1:d[0]+d[2]/2,y0:d[1]-d[3]/2,y1:d[1]+d[3]/2}));
  fields[s2]=buildField(rectsBy[s2],dbx)});
 let n=0,pBad=0,pTot=0,pRoutes=0,eBad=0,eTot=0,eRoutes=0,pTm=0,eTm=0,pRawRev=0,pRawTurn=0;
 const stride=Math.max(1,Math.floor(rooms.length*rooms.length/2/1200));let k=0;
 const rl2=console.log;console.log=()=>{};
 outer:for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
  if((k++)%stride)continue;const a=rooms[i],b=rooms[j];if(a.storey!==b.storey)continue;
  const F=fields[a.storey];if(!F)continue;if(Math.hypot(b.cx-a.cx,b.cy-a.cy)<=2)continue;
  const res=RG.shortestPath(g,a.guid,b.guid);if(!res||st(g,res.path)==null)continue;
  const raw=astar(F,a.cx,a.cy,b.cx,b.cy);if(!raw)continue;
  const pts=simplify(F,raw);const o1=redun(pts);pBad+=o1.rev;pTot+=o1.turn;pTm=(pTm||0)+o1.tm;if(o1.rev||o1.turn)pRoutes++;
  const rawR=redun(raw);pRawRev=(pRawRev||0)+rawR.rev;pRawTurn=(pRawTurn||0)+rawR.turn;
  const drawn=(res.polyline&&res.polyline.length>1)?res.polyline:res.path.map(q=>{const nn=g.nodesByGuid[q];return{x:nn.cx,y:nn.cy}});
  const o2=redun(drawn);eBad+=o2.rev;eTot+=o2.turn;eTm=(eTm||0)+o2.tm;if(o2.rev||o2.turn)eRoutes++;
  n++;if(n>=120)break outer}
 console.log=rl2;
 console.log('§LOOPCUT '+f+' routes='+n+'   (R2=point revisits <=0.05m non-adjacent · R3=turn >150deg)');
 console.log('   prototype BEFORE string-pull (raw A* cells): R2='+pRawRev+' R3='+pRawTurn);
 console.log('   prototype AFTER  string-pull:                R2='+pBad+' R3='+pTot+' metresInReversals='+pTm.toFixed(1)+' routesAffected='+pRoutes+'/'+n);
 console.log('   SHIPPED engine drawn polyline:               R2='+eBad+' R3='+eTot+' metresInReversals='+eTm.toFixed(1)+' routesAffected='+eRoutes+'/'+n);
 db.close()}})();
