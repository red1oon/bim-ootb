// Robustness check on §REDUN_R4: is the high median detour ratio a real signal, or an artifact of
// adjacent-room pairs whose straight-line baseline is a couple of metres? Buckets the SAME ratio by
// straight-line distance, over a strided (representative, not first-N) sample.
const fs=require('fs'),path=require('path');
const initSqlJs=require(path.join(process.env.HOME,'bim-ootb','node_modules','sql.js'));
const RG=require('/tmp/wt-roompath/common/room_graph.js');
const RW=require('/tmp/wt-roompath/viewer/lib/room_walker.js');
const BLD=path.join(process.env.HOME,'bim-ootb','buildings');
const len=p=>{let L=0;for(let i=0;i+1<p.length;i++)L+=Math.hypot(p[i+1].x-p[i].x,p[i+1].y-p[i].y);return L};
const med=a=>{if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(s.length/2)]};
function st(g,p){let s=null;for(const q of p){const n=g.nodesByGuid[q];if(!n||n.storey==null||n.kind==='stairwp')continue;if(s==null)s=n.storey;else if(s!==n.storey)return null}return s}
(async()=>{const SQL=await initSqlJs();
for(const f of ['Clinic_extracted.db','LTU_AHouse_extracted.db']){
  const db=new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD,f))));
  const rl=console.log;console.log=()=>{};RW.walk(db,{write:true});
  const g=RG.buildGraph(s=>{try{const r=db.exec(s);return r.length?r[0].values:[]}catch(e){return[]}},{log:()=>{}});
  const rooms=g.nodes.filter(n=>n.kind==='room');
  const B={'0-5m':[],'5-15m':[],'15-40m':[],'40m+':[]};let n=0;
  const stride=Math.max(1,Math.floor(rooms.length*rooms.length/2/4000));let k=0;
  for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
    if((k++)%stride)continue;
    const r=RG.shortestPath(g,rooms[i].guid,rooms[j].guid);if(!r)continue;if(st(g,r.path)==null)continue;
    const S=Math.hypot(rooms[j].cx-rooms[i].cx,rooms[j].cy-rooms[i].cy);if(S<=0.5)continue;
    const pts=(r.polyline&&r.polyline.length>1)?r.polyline:r.path.map(q=>{const nn=g.nodesByGuid[q];return{x:nn.cx,y:nn.cy}});
    const ratio=len(pts)/S;n++;
    (S<5?B['0-5m']:S<15?B['5-15m']:S<40?B['15-40m']:B['40m+']).push(ratio);
  }
  console.log=rl;
  console.log('§R4_BUCKETS '+f+' sampled='+n+' '+Object.entries(B).map(([k2,v])=>k2+': n='+v.length+' median='+med(v).toFixed(2)+' p90='+(v.length?v.slice().sort((a,b)=>a-b)[Math.floor(0.9*v.length)].toFixed(2):'-')).join(' | '));
  db.close();
}})();
