// CONTROL for §21.6 F2: does the SHIPPED engine's own drawn polyline score the same "through-wall"
// violations under the identical test? If yes the checker is over-strict (a wall bbox spans its own
// door opening) and F2 says nothing about either router.
const fs=require('fs'),path=require('path');
const initSqlJs=require(path.join(process.env.HOME,'bim-ootb','node_modules','sql.js'));
const RG=require('/tmp/wt-roompath/common/room_graph.js');
const RW=require('/tmp/wt-roompath/viewer/lib/room_walker.js');
const BLD=path.join(process.env.HOME,'bim-ootb','buildings');
function segHits(ax,ay,bx,by,bo){const L=Math.hypot(bx-ax,by-ay),n=Math.max(1,Math.ceil(L/0.05));
 for(let i=0;i<=n;i++){const t=i/n,x=ax+(bx-ax)*t,y=ay+(by-ay)*t;if(x>=bo.x0&&x<=bo.x1&&y>=bo.y0&&y<=bo.y1)return true}return false}
function st(g,p){let s=null;for(const q of p){const n=g.nodesByGuid[q];if(!n||n.storey==null||n.kind==='stairwp')continue;if(s==null)s=n.storey;else if(s!==n.storey)return null}return s}
(async()=>{const SQL=await initSqlJs();
for(const f of ['Clinic_extracted.db','LTU_AHouse_extracted.db']){
  const db=new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD,f))));
  const rl=console.log;console.log=()=>{};RW.walk(db,{write:true});
  const dbq=s=>{try{const r=db.exec(s);return r.length?r[0].values:[]}catch(e){return[]}};
  const g=RG.buildGraph(dbq,{log:()=>{}});console.log=rl;
  const W={};dbq("SELECT m.storey,t.center_x,t.center_y,COALESCE(t.bbox_x,0),COALESCE(t.bbox_y,0) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class LIKE 'IfcWall%'")
    .forEach(([s,cx,cy,bx,by])=>{(W[s]=W[s]||[]).push({x0:cx-bx/2,x1:cx+bx/2,y0:cy-by/2,y1:cy+by/2})});
  const rooms=g.nodes.filter(n=>n.kind==='room');
  const stride=Math.max(1,Math.floor(rooms.length*rooms.length/2/1800));let k=0,n=0,viol=0,vr=0;
  const rl2=console.log;console.log=()=>{};
  outer:for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
    if((k++)%stride)continue;const a=rooms[i],b=rooms[j];if(a.storey!==b.storey)continue;
    if(Math.hypot(b.cx-a.cx,b.cy-a.cy)<=2)continue;
    const r=RG.shortestPath(g,a.guid,b.guid);if(!r||st(g,r.path)==null)continue;
    const pts=(r.polyline&&r.polyline.length>1)?r.polyline:r.path.map(q=>{const nn=g.nodesByGuid[q];return{x:nn.cx,y:nn.cy}});
    n++;let v=0;
    for(let s2=0;s2+1<pts.length;s2++)for(const wb of (W[a.storey]||[]))if(segHits(pts[s2].x,pts[s2].y,pts[s2+1].x,pts[s2+1].y,wb)){v++;break}
    if(v){viol+=v;vr++}
    if(n>=150)break outer;
  }
  console.log=rl2;
  console.log('§VIOL_CONTROL '+f+' ENGINE drawn polyline: throughWallViolations='+viol+' on '+vr+'/'+n+' routes (same test as §21.6 F2)');
  db.close();
}})();
