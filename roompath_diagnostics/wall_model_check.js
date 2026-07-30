// §21b — is _pointWalkable wall-aware AT ALL? Take pairs where graphless A* == straight line, and ask
// whether a REAL IfcWall physically lies across that segment. If walls cross it and the predicate says
// legal, then the geometry layer has no wall model and wall-legality comes ONLY from the door graph.
const fs=require('fs'),path=require('path');
const initSqlJs=require(path.join(process.env.HOME,'bim-ootb','node_modules','sql.js'));
const RG=require('/tmp/wt-roompath/common/room_graph.js');
const RW=require('/tmp/wt-roompath/viewer/lib/room_walker.js');
const BLD=path.join(process.env.HOME,'bim-ootb','buildings');
// does segment a->b pass through this axis-aligned wall box? sample at 0.05m
function segHitsBox(ax,ay,bx,by,bo){const L=Math.hypot(bx-ax,by-ay),n=Math.max(1,Math.ceil(L/0.05));
 for(let i=0;i<=n;i++){const t=i/n,x=ax+(bx-ax)*t,y=ay+(by-ay)*t;
  if(x>=bo.x0&&x<=bo.x1&&y>=bo.y0&&y<=bo.y1)return true}return false}
(async()=>{const SQL=await initSqlJs();
for(const [f,pairs] of [['Clinic_extracted.db',[['First Floor R1','First Floor R2'],['First Floor R2','First Floor R12'],['First Floor R7','First Floor R17']]],
                        ['LTU_AHouse_extracted.db',[['VÅNING 1 R27','VÅNING 1 R29'],['VÅNING 1 R1','VÅNING 1 R2']]]]){
  const db=new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD,f))));
  const rl=console.log;console.log=()=>{};RW.walk(db,{write:true});
  const dbq=s=>{try{const r=db.exec(s);return r.length?r[0].values:[]}catch(e){return[]}};
  const g=RG.buildGraph(dbq,{log:()=>{}});console.log=rl;
  const rooms=g.nodes.filter(n=>n.kind==='room');
  // real wall + door footprints per storey, straight from the extraction tables
  const walls={},doors={};
  dbq("SELECT m.storey,t.center_x,t.center_y,COALESCE(t.bbox_x,0),COALESCE(t.bbox_y,0) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class LIKE 'IfcWall%'")
    .forEach(([st,cx,cy,bx,by])=>{(walls[st]=walls[st]||[]).push({x0:cx-bx/2,x1:cx+bx/2,y0:cy-by/2,y1:cy+by/2})});
  dbq("SELECT m.storey,t.center_x,t.center_y,COALESCE(t.bbox_x,0),COALESCE(t.bbox_y,0) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class LIKE 'IfcDoor%'")
    .forEach(([st,cx,cy,bx,by])=>{(doors[st]=doors[st]||[]).push({x0:cx-bx/2-0.3,x1:cx+bx/2+0.3,y0:cy-by/2-0.3,y1:cy+by/2+0.3})});
  for(const [fa,fb] of pairs){
    const a=rooms.find(r=>String(r.name||'').indexOf(fa)>=0),b=rooms.find(r=>String(r.name||'').indexOf(fb)>=0);
    if(!a||!b){console.log('§WALLCHK '+f+' pair not found: '+fa+' / '+fb);continue}
    const ill=RG.chordIllegalCount(g,a.storey,a.cx,a.cy,b.cx,b.cy);
    const W=(walls[a.storey]||[]).filter(bo=>segHitsBox(a.cx,a.cy,b.cx,b.cy,bo));
    const D=(doors[a.storey]||[]).filter(bo=>segHitsBox(a.cx,a.cy,b.cx,b.cy,bo));
    console.log('§WALLCHK '+f+' "'+fa+'"->"'+fb+'" straight='+Math.hypot(b.cx-a.cx,b.cy-a.cy).toFixed(1)+
      'm  chordIllegalCount='+ill+'  realWallsCrossed='+W.length+'  realDoorsOnSegment='+D.length+
      '  => '+(ill===0&&W.length>0&&D.length===0?'PREDICATE SAYS WALKABLE THROUGH '+W.length+' WALL(S), NO DOOR':'ok'));
  }
  db.close();
}})();
