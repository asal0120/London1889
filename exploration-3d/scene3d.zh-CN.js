/* 探索场景的立体版（three.js）。由 experiments/hd2d-sample 的场景画法改成探索页的画面模组：
   地图、主角位置、已探索格、敌人与事件都读游戏状态，规则不在这里。
   载入完成后提供 window.ExplorationScene3D.create()，介面同 2D 版 ExplorationGeneratedScene。
   素材在同目录的 assets/。 */
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {RenderPixelatedPass} from 'three/addons/postprocessing/RenderPixelatedPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {HorizontalTiltShiftShader} from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import {VerticalTiltShiftShader} from 'three/addons/shaders/VerticalTiltShiftShader.js';
import {mergeGeometries,mergeGroups} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';


/* ---------- 共用 ---------- */
const TEX=32;                       // 每格 32 个像素：材质解析度
const WALL_H=2.4;

/* 状态：地点类型取自游戏地图，时段取自游戏环境（hour） */
const state={type:'residence',seed:1,time:'day',fx:{bloom:true,tilt:true,pixel:false},detail:true,near:false};
const ASSET=new URL('./assets/',import.meta.url).href;

const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate=false;   // 阴影只在有东西移动时重算
renderer.info.autoReset=false;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;

const camera=new THREE.PerspectiveCamera(24,1,.5,200);
const ELEV=THREE.MathUtils.degToRad(44);

/* ---------- 像素材质产生器 ---------- */
function makeRng(seed){return SceneMap.rng(seed);}
function canvasTex(w,h,draw,{repeat=true,seed=1}={}){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const g=c.getContext('2d');g.imageSmoothingEnabled=false;
  const r=makeRng(seed);
  const px=(x,y,col,ww=1,hh=1)=>{g.fillStyle=col;g.fillRect(x|0,y|0,ww,hh);};
  draw(g,px,r,w,h);
  const t=new THREE.CanvasTexture(c);
  t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapLinearFilter;
  t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;
  if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;}
  return t;
}
const pick=(r,a)=>a[Math.floor(r()*a.length)];
const shade=(hex,k)=>{const c=new THREE.Color(hex);c.multiplyScalar(k);return '#'+c.getHexString();};

const T={};
function buildTextures(){
  T.planks=canvasTex(TEX,TEX,(g,px,r)=>{
    for(let row=0;row<4;row++){const y=row*8,off=(row%2)*12+(r()*6|0);
      const base=pick(r,['#7a5232','#83593a','#6f4a2c','#8a6040']);
      px(0,y,base,TEX,8);px(0,y,shade(base,1.25),TEX,1);px(0,y+7,shade(base,.55),TEX,1);
      for(const s of [off%TEX,(off+16)%TEX])px(s,y,shade(base,.5),1,8);
      for(let k=0;k<6;k++)px(r()*TEX,y+2+r()*4,shade(base,.8),2+(r()*4|0),1);}
  },{seed:3});
  T.parquet=canvasTex(TEX,TEX,(g,px,r)=>{
    for(let by=0;by<4;by++)for(let bx=0;bx<4;bx++){const v=(bx+by)%2,x=bx*8,y=by*8,base=v?'#8c6238':'#6d4826';
      px(x,y,base,8,8);
      for(let i=0;i<4;i++)v?px(x,y+i*2,shade(base,i%2?.9:1.08),8,1):px(x+i*2,y,shade(base,i%2?.9:1.08),1,8);
      px(x,y,shade(base,.55),8,1);px(x,y,shade(base,.55),1,8);}
  },{seed:5});
  T.checker=canvasTex(TEX,TEX,(g,px,r)=>{
    for(let by=0;by<2;by++)for(let bx=0;bx<2;bx++){const w=(bx+by)%2===0,base=w?'#d9d1bd':'#2b2a2e';px(bx*16,by*16,base,16,16);
      for(let k=0;k<10;k++)px(bx*16+r()*15,by*16+r()*15,shade(base,w?.9:1.35),2,1);
      px(bx*16,by*16,shade(base,w?.75:1.6),16,1);}
  },{seed:7});
  T.wallpaper=canvasTex(TEX,TEX,(g,px,r)=>{
    px(0,0,'#4a5a4a',TEX,TEX);
    for(let x=0;x<TEX;x+=8){px(x,0,'#3f4e40',2,TEX);}
    for(let y=4;y<TEX;y+=16)for(let x=4;x<TEX;x+=8){const yy=y+(x/8%2)*8;px(x,yy,'#8d9a72',1,1);px(x-1,yy+1,'#7a8862',3,1);px(x,yy+2,'#8d9a72',1,1);}
  },{seed:9});
  T.wallpaper2=canvasTex(TEX,TEX,(g,px,r)=>{
    px(0,0,'#6b3a36',TEX,TEX);
    for(let x=0;x<TEX;x+=16){px(x,0,'#5a302d',4,TEX);px(x+6,0,'#7c4641',1,TEX);}
    for(let y=6;y<TEX;y+=16)for(let x=10;x<TEX;x+=16){px(x,y,'#c09a5c',1,1);px(x-1,y+1,'#a8854d',3,2);px(x,y+3,'#c09a5c',1,1);}
  },{seed:10});
  T.wainscot=canvasTex(TEX,TEX,(g,px,r)=>{
    px(0,0,'#4a2e1b',TEX,TEX);px(3,4,'#5d3a22',26,22);px(3,4,'#2d1b10',26,1);px(3,4,'#2d1b10',1,22);px(3,25,'#7a5235',26,1);px(28,4,'#7a5235',1,22);
    px(0,0,'#6e4a2e',TEX,2);
  },{seed:11});
  T.wood=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#5b3a22',TEX,TEX);for(let y=0;y<TEX;y+=2)px(0,y,r()<.5?'#634026':'#53351f',TEX,1);for(let k=0;k<12;k++)px(r()*TEX,r()*TEX,'#3f2716',3,1);},{seed:12});
  T.woodLight=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#8f6a43',TEX,TEX);for(let y=0;y<TEX;y+=2)px(0,y,r()<.5?'#9a7449':'#86613c',TEX,1);for(let k=0;k<10;k++)px(r()*TEX,r()*TEX,'#6c4d2e',3,1);},{seed:13});
  T.velvet=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#7a2630',TEX,TEX);for(let k=0;k<60;k++)px(r()*TEX,r()*TEX,r()<.5?'#8c2f3a':'#651f28',1,1);for(let x=0;x<TEX;x+=8)px(x,0,'#5c1c24',1,TEX);},{seed:14});
  T.velvetGreen=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#2f5444',TEX,TEX);for(let k=0;k<60;k++)px(r()*TEX,r()*TEX,r()<.5?'#3a6452':'#264638',1,1);},{seed:15});
  T.linen=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#e4dccb',TEX,TEX);for(let k=0;k<50;k++)px(r()*TEX,r()*TEX,'#cfc5b0',1,1);},{seed:16});
  T.quilt=canvasTex(TEX,TEX,(g,px,r)=>{for(let by=0;by<4;by++)for(let bx=0;bx<4;bx++){const c=pick(r,['#4b5f8a','#8a4b4b','#c7b07a','#5d7a5a','#3f4a6e']);px(bx*8,by*8,c,8,8);px(bx*8,by*8,shade(c,1.3),8,1);px(bx*8,by*8+7,shade(c,.6),8,1);}},{seed:17});
  T.books=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#3a2414',TEX,TEX);
    for(let s=0;s<2;s++){const y=s*16;px(0,y+14,'#6b4527',TEX,2);let x=1;while(x<TEX-1){const w=1+(r()*3|0),h=8+(r()*5|0),c=pick(r,['#7a2630','#2f5444','#3f4a6e','#8a6a2a','#5b3a5a','#a08a5a','#2d2d30']);px(x,y+14-h,c,w,h);px(x,y+15-h,shade(c,1.4),w,1);if(r()<.4)px(x,y+10-h/2,'#c9a14a',w,1);x+=w;}}},{seed:18});
  T.drawers=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#5b3a22',TEX,TEX);for(let y=1;y<TEX;y+=10){px(2,y,'#6b4429',28,8);px(2,y+8,'#2f1d10',28,1);px(15,y+3,'#c9a14a',2,2);}},{seed:19});
  T.brick=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#5a4a40',TEX,TEX);
    for(let row=0;row<8;row++){const off=row%2?4:0;for(let x=-off;x<TEX;x+=8){const c=pick(r,['#8a4a36','#7d4231','#94523b','#733c2d','#86503d']);px(x+1,row*4+1,c,7,3);px(x+1,row*4+1,shade(c,1.2),7,1);}}},{seed:20});
  T.marble=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#d8d4c8',TEX,TEX);for(let k=0;k<5;k++){let x=r()*TEX,y=0;while(y<TEX){px(x,y,'#a9a598',1,1);x+=r()<.5?1:-1;y++;}}},{seed:21});
  T.setts=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#2b2f2d',TEX,TEX);
    for(let row=0;row<5;row++){const h=row===4?4:6,y=row*6+(row===4?1:0),off=row%2?5:0;for(let x=-off;x<TEX;x+=10){const c=pick(r,['#5a605a','#646a62','#6e7268','#545a56','#727466']);px(x+1,y+1,c,9,h-1);px(x+2,y+1,shade(c,1.3),7,1);px(x+1,y+h-1,shade(c,.7),9,1);}}},{seed:22});
  T.flags=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#5d6257',TEX,TEX);
    for(const [x,y,w,h] of [[0,0,18,15],[18,0,14,15],[0,15,11,17],[11,15,21,17]]){const c=pick(r,['#8b8c7a','#949381','#868a79','#9a9884']);px(x+1,y+1,c,w-1,h-1);px(x+1,y+1,shade(c,1.15),w-1,1);if(r()<.3)px(x+3+r()*(w-6),y+3,shade(c,.75),1,h-6);}},{seed:23});
  T.slate=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#2c3236',TEX,TEX);for(let row=0;row<8;row++){const off=row%2?3:0;for(let x=-off;x<TEX;x+=6){const c=pick(r,['#3d454a','#454e54','#383f44','#4a5258']);px(x+1,row*4,c,5,3);px(x+1,row*4+3,shade(c,.6),5,1);}}},{seed:24});
  T.tile=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#5a2e22',TEX,TEX);for(let row=0;row<8;row++){const off=row%2?4:0;for(let x=-off;x<TEX;x+=8){const c=pick(r,['#8a4632','#9a5038','#7c3f2c']);px(x+1,row*4,c,7,3);px(x+1,row*4+3,shade(c,.55),7,1);}}},{seed:25});
  T.iron=canvasTex(8,8,(g,px)=>{px(0,0,'#1f2522',8,8);px(1,0,'#3a4440',1,8);},{seed:26});
  // 工厂地面：水泥、防滑铁板
  T.concrete=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#5c5a54',TEX,TEX);for(let k=0;k<110;k++)px(r()*TEX,r()*TEX,pick(r,['#55534d','#63615a','#4e4c47']),1,1);
    px(0,0,'#46443f',TEX,1);px(0,0,'#46443f',1,TEX);let x=r()*TEX|0,y=0;while(y<TEX){px(x,y,'#4a4843',1,1);x+=r()<.5?1:-1;y++;}},{seed:41});
  T.treadplate=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#43484a',TEX,TEX);for(let y=2;y<TEX;y+=6)for(let x=(y/6|0)%2?5:2;x<TEX;x+=6){px(x,y,'#5c6366',2,1);px(x,y+1,'#2e3234',2,1);}
    px(0,0,'#2c3032',TEX,1);px(0,0,'#2c3032',1,TEX);},{seed:42});
  // 林地地面：草地、小径泥土、林下的苔藓
  T.grass=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#4a6634',TEX,TEX);for(let k=0;k<90;k++)px(r()*TEX,r()*TEX,pick(r,['#557540','#3f5a2c','#5e7e44','#46602f']),1,1);
    for(let k=0;k<14;k++)px(r()*TEX|0,r()*TEX|0,'#68884a',1,2);},{seed:31});
  T.dirt=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#6a5236',TEX,TEX);for(let k=0;k<80;k++)px(r()*TEX,r()*TEX,pick(r,['#5e4830','#7a6040','#584430']),1,1);
    for(let k=0;k<6;k++)px(r()*TEX,r()*TEX,'#8a8070',2,1);},{seed:32});
  T.moss=canvasTex(TEX,TEX,(g,px,r)=>{px(0,0,'#2c3c24',TEX,TEX);for(let k=0;k<70;k++)px(r()*TEX,r()*TEX,pick(r,['#33462a','#26341f','#3a4c2c']),1,1);},{seed:33});
  T.glow=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.35,'rgba(255,255,255,.35)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
  T.shaft=(()=>{const c=document.createElement('canvas');c.width=16;c.height=64;const g=c.getContext('2d');const gr=g.createLinearGradient(0,0,0,64);gr.addColorStop(0,'rgba(255,255,255,.9)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,16,64);const e=g.createLinearGradient(0,0,16,0);e.addColorStop(0,'rgba(0,0,0,1)');e.addColorStop(.25,'rgba(0,0,0,0)');e.addColorStop(.75,'rgba(0,0,0,0)');e.addColorStop(1,'rgba(0,0,0,1)');g.globalCompositeOperation='destination-out';g.fillStyle=e;g.fillRect(0,0,16,64);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
}
buildTextures();

/* 材质：同一张像素图在任何大小的方块上都维持「每格 32 像素」，不会拉伸 */
const matCache=new Map();
function mat(key,opt={}){
  const id=key+JSON.stringify(opt);if(matCache.has(id))return matCache.get(id);
  const m=new THREE.MeshStandardMaterial({map:T[key]||null,color:opt.color??0xffffff,roughness:opt.roughness??.88,metalness:opt.metalness??0,
    emissive:opt.emissive??0x000000,emissiveIntensity:opt.ei??1,transparent:!!opt.transparent,opacity:opt.opacity??1});
  matCache.set(id,m);return m;
}
const plain=(color,opt={})=>mat('_'+color,{...opt,color});
function box(w,h,d){
  const g=new THREE.BoxGeometry(w,h,d),uv=g.attributes.uv;
  const dims=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
  for(let f=0;f<6;f++)for(let v=0;v<4;v++){const i=f*4+v;uv.setXY(i,uv.getX(i)*dims[f][0],uv.getY(i)*dims[f][1]);}
  return g;
}
function mesh(geo,material,{cast=true,receive=true}={}){const m=new THREE.Mesh(geo,material);m.castShadow=cast;m.receiveShadow=receive;return m;}
/* 方块：x,z 是左前角的格座标，y 是底部高度 */
function block(parent,x,y,z,w,h,d,material,o){const m=mesh(box(w,h,d),material,o);m.position.set(x+w/2,y+h/2,z+d/2);parent.add(m);return m;}

/* ---------- 场景 ---------- */
let scene,map,world,lights,actors,fadeables;
const cellCenter=id=>({x:map.cells[id].x+.5,z:map.cells[id].y+.5});

function build(){
  if(scene)scene.traverse(o=>{if(o.geometry)o.geometry.dispose();});
  scene=new THREE.Scene();world=new THREE.Group();scene.add(world);
  lights={points:[],windows:[],shafts:[],lampHalos:[]};fadeables=[];
  if(KIT.ready)lights.windows.push({facade:KIT.glassEve,dusk:.6,night:0},{facade:KIT.glassLate,dusk:.6,night:.9},{facade:KIT.glassWarm,dusk:.6,night:1});
  map=generateMap();
  // 地图外的暗色底面
  const voidPlane=mesh(new THREE.PlaneGeometry(200,200),plain(state.type==='london'?0x1c1f1d:state.type==='woodland'?0x10150e:0x120e0b),{cast:false});
  voidPlane.rotation.x=-Math.PI/2;voidPlane.position.set(map.cols/2,-.3,map.rows/2);world.add(voidPlane);
  if(state.type==='london')buildLondon();else if(state.type==='woodland')buildWoodland();else buildResidence();
  mergeStatic();buildLights();buildActors();
  applyTime();
}

const isActive=(x,y)=>x>=0&&y>=0&&x<map.cols&&y<map.rows&&map.cells[y*map.cols+x].active;

/* 地板：同材质的格子合成一个 InstancedMesh，减少绘制次数 */
function floorTiles(cells,material,y=0,thick=0){
  if(!cells.length)return;
  const geo=thick?box(1,thick,1):(()=>{const g=new THREE.PlaneGeometry(1,1);g.rotateX(-Math.PI/2);return g;})();
  const inst=new THREE.InstancedMesh(geo,material,cells.length);inst.receiveShadow=true;inst.castShadow=!!thick;
  const m=new THREE.Matrix4();
  cells.forEach((c,i)=>{m.makeTranslation(c.x+.5,y+(thick?thick/2:0),c.y+.5);inst.setMatrixAt(i,m);});
  world.add(inst);
}

/* ---------- 林地：树木、岩石等用 Kenney Nature Kit（CC0），颜色在这里重上 ---------- */
const WOOD={ready:false,src:{},geo:{}};
// 原作是鲜艳的卡通色；改成偏暗、偏灰的配色
const WOOD_PALETTE={leafsGreen:'#56743a',leafsDark:'#33523a',woodBark:'#5a3f2e',woodBarkDark:'#443228',woodInner:'#c0a074',grass:'#52723c',dirt:'#665036',
  stone:'#86847a',colorRed:'#a03838',colorYellow:'#d0a840',colorPurple:'#74589a',colorTan:'#c4a678',_defaultMat:'#ddd4c2'};
const WOOD_MAT=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92,flatShading:true});
/* 像素纹理：依世界座标投影（每格 32 像素，同地板与墙面），叠在顶点色上。
   原模型是平涂色块，加上这层后树叶、树皮、岩石才有像素点的质感，和其他场景一致。 */
const WOOD_NOISE=(()=>{const N=32,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d'),r=makeRng(4242);
  g.fillStyle='rgb(190,190,190)';g.fillRect(0,0,N,N);
  const dot=(x,y,v,w=1,h=1)=>{g.fillStyle=`rgb(${v},${v},${v})`;g.fillRect(((x%N)+N)%N,((y%N)+N)%N,w,h);};
  for(let k=0;k<70;k++){const x=r()*N|0,y=r()*N|0;dot(x,y,150);dot(x+1,y,165);dot(x,y+1,170);}   // 暗色小叶丛
  for(let k=0;k<60;k++){const x=r()*N|0,y=r()*N|0;dot(x,y,228);dot(x+1,y+1,212);}              // 亮点
  for(let k=0;k<120;k++)dot(r()*N|0,r()*N|0,175+(r()*30|0));
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapLinearFilter;t.colorSpace=THREE.NoColorSpace;return t;})();
WOOD_MAT.onBeforeCompile=sh=>{
  sh.uniforms.uNoise={value:WOOD_NOISE};
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWPos;')
    .replace('#include <project_vertex>',`#include <project_vertex>
    { vec4 wp=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        wp=instanceMatrix*wp;
      #endif
      vWPos=(modelMatrix*wp).xyz; }`);
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D uNoise;\nvarying vec3 vWPos;')
    .replace('#include <color_fragment>',`#include <color_fragment>
    { vec3 n=abs(normalize(cross(dFdx(vWPos),dFdy(vWPos))));
      vec2 uv=n.y>n.x&&n.y>n.z?vWPos.xz:n.x>n.z?vWPos.zy:vWPos.xy;
      diffuseColor.rgb*=texture2D(uNoise,uv).r*1.32; }`);
};
// 每种地图物件用哪些模型；h＝高度范围（格），fit＝占地内的比例；over＝换色（桦树白皮、柳树黄绿）
const WOOD_KINDS={
  'w-oak':{v:['tree_oak','tree_default','tree_detailed'],h:[3.0,3.6]},
  'w-willow':{v:['tree_fat','tree_plateau'],h:[2.6,3.0],over:{leafsGreen:'#78884a'}},
  'w-pine':{v:['tree_pineDefaultA','tree_pineDefaultB','tree_pineRoundA','tree_pineRoundC','tree_pineTallA'],h:[3.2,4.0]},
  'w-birch':{v:['tree_thin','tree_simple','tree_tall'],h:[3.0,3.6],over:{woodBark:'#d4cfc0',leafsGreen:'#72904a'}},
  'w-bush':{v:['plant_bush','plant_bushLarge','plant_bushDetailed'],h:[.6,.8]},
  'w-rock':{v:['rock_largeA','rock_largeB','rock_tallA','rock_tallB','stone_tallA'],fit:.95},
  'w-log':{v:['log_large','log_stack'],fixedRot:true},
  'w-stump':{v:['stump_old','stump_round','stump_oldTall'],fit:.8},
  'w-fern':{v:['plant_flatTall','plant_flatShort','grass_large'],fit:.9},
};
const WOOD_TALL=new Set(['w-oak','w-willow','w-pine','w-birch']);
function loadWoodland(){
  return gltfLoader.loadAsync(ASSET+'woodland-kit.glb').then(g=>{for(const c of g.scene.children)WOOD.src[c.name]=c;WOOD.ready=true;})
    .catch(e=>console.warn('林地模型载入失败',e));
}
/* 一个模型的几何：各材质合并成一块，颜色写在顶点上；每个三角形明暗略有差异，像手绘的色块 */
function woodGeo(name,over={}){
  const key=name+JSON.stringify(over);if(WOOD.geo[key])return WOOD.geo[key];
  const root=WOOD.src[name];if(!root)return null;root.updateMatrixWorld(true);
  const inv=root.matrixWorld.clone().invert(),rel=new THREE.Matrix4(),parts=[];
  let seed=7;for(const ch of name)seed=(seed*31+ch.charCodeAt(0))>>>0;const rnd=makeRng(seed);
  root.traverse(o=>{if(!o.isMesh)return;
    const base=o.material.name.replace(/\.\d+$/,''),c=new THREE.Color(over[base]||WOOD_PALETTE[base]||'#888888');
    const src=o.geometry.index?o.geometry.toNonIndexed():o.geometry,p=new THREE.BufferGeometry();
    p.setAttribute('position',src.attributes.position.clone());p.applyMatrix4(rel.multiplyMatrices(inv,o.matrixWorld));
    const n=p.attributes.position.count,a=new Float32Array(n*3);
    for(let i=0;i<n;i+=3){const k=.88+rnd()*.2;for(let j=0;j<3&&i+j<n;j++){a[(i+j)*3]=c.r*k;a[(i+j)*3+1]=c.g*k;a[(i+j)*3+2]=c.b*k;}}
    p.setAttribute('color',new THREE.BufferAttribute(a,3));parts.push(p);});
  const geo=mergeGeometries(parts,false);geo.computeVertexNormals();geo.computeBoundingBox();
  return WOOD.geo[key]=geo;
}
/* 模型摆进格子：让模型底面中心对准 (x,z) 的位置 */
function woodPlace(geo,x,z,s,rot){
  const b=geo.boundingBox,cx=(b.min.x+b.max.x)/2*s,cz=(b.min.z+b.max.z)/2*s,c=Math.cos(rot),n=Math.sin(rot);
  return new THREE.Vector3(x-(c*cx+n*cz),0,z-(-n*cx+c*cz));
}
function woodObject(o){
  const k=WOOD_KINDS[o.key];if(!k||!WOOD.ready)return false;
  const r=makeRng(((o.seed??0)^(o.x*73856093)^(o.y*19349663))>>>0);
  const geo=woodGeo(pick(r,k.v),k.over);if(!geo)return false;
  const b=geo.boundingBox,bx=b.max.x-b.min.x,by=b.max.y-b.min.y,bz=b.max.z-b.min.z;
  const s=k.h?(k.h[0]+r()*(k.h[1]-k.h[0]))/by:k.fixedRot?Math.min(o.cols*.9/bx,o.rows*.9/bz):k.fit*Math.min(o.cols,o.rows)/Math.max(bx,bz);
  const rot=k.fixedRot?(r()<.5?0:Math.PI):r()*Math.PI*2;
  const g=new THREE.Group();world.add(g);
  const m=mesh(geo,WOOD_MAT);m.position.copy(woodPlace(geo,o.x+o.cols/2,o.y+o.rows/2,s,rot));m.rotation.y=rot;m.scale.setScalar(s);g.add(m);
  if(WOOD_TALL.has(o.key)){g.userData.parts=[m];fadeables.push(m);}   // 高的树挡住人物时变半透明
  return true;
}
/* 同一种模型大量摆放（林缘的树、地上的草花）：一种模型一次画完 */
function woodInstances(list,cast){
  const by=new Map();for(const it of list){if(!it.geo)continue;if(!by.has(it.geo))by.set(it.geo,[]);by.get(it.geo).push(it);}
  const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),Y=new THREE.Vector3(0,1,0),S=new THREE.Vector3();
  for(const[geo,items]of by){const inst=new THREE.InstancedMesh(geo,WOOD_MAT,items.length);inst.castShadow=cast;inst.receiveShadow=true;
    items.forEach((it,i)=>{Q.setFromAxisAngle(Y,it.rot);S.setScalar(it.s);M.compose(woodPlace(geo,it.x,it.z,it.s,it.rot),Q,S);inst.setMatrixAt(i,M);});
    inst.computeBoundingSphere();world.add(inst);}
}
/* 林地地面：小径泥土、草地、林下苔藓画在同一片上。
   每格记一个点（泥土／苔藓／有无地面），格与格之间平滑内插，再加上大小两层杂讯决定分界，
   所以边界是弯曲、参差的；判断以 1/32 格为单位，边缘仍是像素格。
   泥土画得比小径格子窄，宽度沿路慢慢变化（约 0.5～0.9 格），两旁露出草地；可走范围不变。 */
function woodGround(){
  const P=3,W=map.cols+P*2,H=map.rows+P*2,data=new Uint8Array(W*H*4);
  const core=(x,y)=>isActive(x,y)&&map.cells[y*map.cols+x].core;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const cx=x-P,cy=y-P,i=(y*W+x)*4;let near=false;
    for(let dy=-3;dy<=3&&!near;dy++)for(let dx=-3;dx<=3;dx++)if(isActive(cx+dx,cy+dy)){near=true;break;}
    data[i]=core(cx,cy)?255:0;data[i+1]=isActive(cx,cy)?0:255;data[i+3]=near?255:0;}
  const mask=new THREE.DataTexture(data,W,H,THREE.RGBAFormat);mask.magFilter=mask.minFilter=THREE.LinearFilter;mask.needsUpdate=true;
  const nc=document.createElement('canvas');nc.width=nc.height=64;const ng=nc.getContext('2d'),nr=makeRng(map.seed^0x9a);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){const v=nr()*255|0;ng.fillStyle=`rgb(${v},${v},${v})`;ng.fillRect(x,y,1,1);}
  const noise=(f)=>{const t=new THREE.CanvasTexture(nc);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=f;t.minFilter=f;t.generateMipmaps=false;t.colorSpace=THREE.NoColorSpace;return t;};
  const m=new THREE.MeshStandardMaterial({roughness:1});
  m.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,{uMask:{value:mask},uSmooth:{value:noise(THREE.LinearFilter)},uFine:{value:noise(THREE.NearestFilter)},
      uGrass:{value:T.grass},uDirt:{value:T.dirt},uMoss:{value:T.moss}});
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>','#include <project_vertex>\nvWPos=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uMask,uSmooth,uFine,uGrass,uDirt,uMoss;')
      .replace('#include <map_fragment>',`
      vec2 q=(floor(vWPos.xz*32.)+.5)/32.;
      vec4 mk=texture2D(uMask,(q+${P}.)/vec2(${W}.,${H}.));
      float k=(texture2D(uSmooth,q*.012).r-.5)*.3+(texture2D(uSmooth,q*.05).r-.5)*.2+(texture2D(uFine,q*.5).r-.5)*.22;
      float thr=.54+texture2D(uSmooth,q*.006+.37).r*.2;   // 小径宽度：值越大泥土越窄
      if(mk.a+k<.5)discard;
      // 宽阔的泥土区（上下左右一格内都是小径）里长出几块草地；一两格宽的小径不会被截断
      vec2 cu=(q+${P}.)/vec2(${W}.,${H}.),ox=vec2(1./${W}.,0.),oy=vec2(0.,1./${H}.);
      float inner=min(min(texture2D(uMask,cu+ox).r,texture2D(uMask,cu-ox).r),min(texture2D(uMask,cu+oy).r,texture2D(uMask,cu-oy).r));
      float d=mk.r+k-inner*smoothstep(.5,.72,texture2D(uSmooth,q*.02+.61).r)*.65,mo=mk.g+k*.9;
      vec4 col=mo>.5?texture2D(uMoss,vWPos.xz):texture2D(uGrass,vWPos.xz);
      if(d>thr)col=texture2D(uDirt,vWPos.xz)*(d<thr+.06?.82:1.);   // 泥土边缘稍暗，像被踩实的土
      else if(d>thr-.1)col.rgb*=.9;                                 // 小径旁的草较稀、偏暗
      diffuseColor*=col;`);
  };
  const g=new THREE.PlaneGeometry(W,H);g.rotateX(-Math.PI/2);
  const plane=mesh(g,m,{cast:false});plane.position.set(map.cols/2,0,map.rows/2);plane.receiveShadow=true;world.add(plane);
}
/* 林缘：地面外围三格内种树。树会往北遮住后方，所以北侧三格内有地面的位置只放矮灌木与岩石 */
function woodBorder(){
  const r=makeRng(map.seed^0xb0d),near=[],items=[];
  const dist=(x,y)=>{let d=9;for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)if(isActive(x+dx,y+dy))d=Math.min(d,Math.max(Math.abs(dx),Math.abs(dy)));return d;};
  const tall=['tree_pineDefaultA','tree_pineDefaultB','tree_pineRoundA','tree_pineRoundC','tree_pineTallA','tree_oak','tree_default','tree_detailed'];
  const low=['plant_bush','plant_bushLarge','plant_bushDetailed','rock_largeA','rock_largeB'];
  for(let y=-3;y<map.rows+3;y++)for(let x=-3;x<map.cols+3;x++){
    if(isActive(x,y))continue;const d=dist(x,y);if(d>3)continue;near.push({x,y});
    const hides=isActive(x,y-1)||isActive(x,y-2)||isActive(x,y-3);
    const jx=x+.5+(r()-.5)*.5,jz=y+.5+(r()-.5)*.5;
    if(hides){
      if(r()<.6){const name=pick(r,low),geo=woodGeo(name),b=geo.boundingBox,rock=name.startsWith('rock');
        items.push({geo,x:jx,z:jz,rot:r()*6.28,s:rock?.6/(b.max.x-b.min.x):(.42+r()*.16)/(b.max.y-b.min.y)});}
    }else if(r()<(d===1?.7:.9)){const name=pick(r,tall),geo=woodGeo(name),b=geo.boundingBox;
      items.push({geo,x:jx,z:jz,rot:r()*6.28,s:(3+r()*1.2)/(b.max.y-b.min.y)});}
  }
  woodInstances(items,true);
}
/* 地上的草丛、野花、蘑菇：不占格、很矮，只放在空地（不放在小径与物件上） */
function woodDecor(){
  const r=makeRng(map.seed^0xdec),items=[],names=['grass','grass','grass_large','plant_flatShort','flower_redA','flower_yellowA','flower_purpleA','mushroom_redGroup','mushroom_tanGroup'];
  for(const c of map.cells){if(!c.active||c.core||c.blocked||r()>.45)continue;
    const name=pick(r,names),geo=woodGeo(name),b=geo.boundingBox;
    items.push({geo,x:c.x+.2+r()*.6,z:c.y+.2+r()*.6,rot:r()*6.28,s:(name.startsWith('grass')?.45:.32)/Math.max(.1,b.max.y-b.min.y)});}
  // 小径边缘：草丛长在泥土与草地交界外侧，碎石散在泥土边上（只放在旁边是草地的那一侧）
  const core=(x,y)=>isActive(x,y)&&map.cells[y*map.cols+x].core,edge=['grass','grass','grass_large','plant_flatShort'],stones=['rock_largeA','rock_largeB','stone_largeA'];
  for(const c of map.cells){if(!c.core||c.blocked)continue;
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){if(!isActive(c.x+dx,c.y+dy)||core(c.x+dx,c.y+dy))continue;
      for(let k=0;k<2;k++){if(r()>.55)continue;const along=(r()-.5)*.8,out=.42+r()*.16,x=c.x+.5+dx*out+dy*along,z=c.y+.5+dy*out+dx*along;
        const name=pick(r,edge),geo=woodGeo(name),b=geo.boundingBox;items.push({geo,x,z,rot:r()*6.28,s:(.22+r()*.12)/Math.max(.1,b.max.y-b.min.y)});}
      if(r()<.35){const along=(r()-.5)*.8,out=.2+r()*.14,name=pick(r,stones),geo=woodGeo(name),b=geo.boundingBox;
        items.push({geo,x:c.x+.5+dx*out+dy*along,z:c.y+.5+dy*out+dx*along,rot:r()*6.28,s:(.07+r()*.06)/Math.max(.1,b.max.x-b.min.x)});}}}
  woodInstances(items,false);
}
function buildWoodland(){
  const act=map.cells.filter(c=>c.active);
  woodGround();
  if(!WOOD.ready){for(const o of map.objects)furniture(o,makeRng(1));return;}
  woodBorder();
  for(const o of map.objects)if(!woodObject(o))furniture(o,makeRng(1));
  woodDecor();
}

/* ---------- 住宅 ---------- */
function buildResidence(){
  const r=makeRng(map.seed^0x51);
  const factory=map.locationType==='factory';
  const floorKeys=factory?['concrete','treadplate','planks','concrete','treadplate']:['parquet','planks','checker','parquet','planks'];
  const roomOf=c=>map.rooms.findIndex(o=>c.x>=o.x&&c.x<o.x+o.w&&c.y>=o.y&&c.y<o.y+o.h);
  const groups=new Map();
  for(const c of map.cells){if(!c.active)continue;const ri=roomOf(c),key=ri<0?'hall':floorKeys[(ri+map.seed)%floorKeys.length];if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
  for(const[key,cells]of groups)floorTiles(cells,key==='hall'?(factory?mat('concrete',{color:0x9a968c}):mat('planks',{color:0xb0a090})):mat(key,{roughness:key==='checker'?.45:.8}));
  if(factory){buildWalls(r);for(const o of map.objects)furniture(o,r);return;}   // 工厂：没有地毯
  // 走廊地毯
  for(const c of groups.get('hall')||[]){const m=mesh(new THREE.PlaneGeometry(.56,1),plain(0x6e3a32,{roughness:1}),{cast:false});m.rotation.x=-Math.PI/2;m.position.set(c.x+.5,.006,c.y+.5);world.add(m);}
  // 房间地毯
  map.rooms.forEach((room,i)=>{
    if(room.w<5||room.h<4||(i+map.seed)%floorKeys.length===2)return;
    const cols=pick(r,[['#7a3f35','#c9a36a','#36524a'],['#3f5a52','#c9a36a','#7a3f35'],['#5b4366','#cdb57d','#3f5a52']]);
    const W=room.w-1.4,H=room.h-1.6;
    const tex=canvasTex(Math.round(W*TEX/2),Math.round(H*TEX/2),(g,px,rr,w,h)=>{
      px(0,0,cols[0],w,h);px(2,2,cols[1],w-4,1);px(2,h-3,cols[1],w-4,1);px(2,2,cols[1],1,h-4);px(w-3,2,cols[1],1,h-4);
      px(5,5,cols[2],w-10,h-10);
      for(let x=6;x<w-6;x+=4)for(let y=6;y<h-6;y+=4)if((x+y)%8===0)px(x,y,shade(cols[2],1.4),2,2);
      const cx=w/2|0,cy=h/2|0;for(let k=0;k<6;k++){px(cx-k,cy-6+k,cols[1],2*k+1,1);px(cx-k,cy+6-k,cols[1],2*k+1,1);}
      for(let x=1;x<w;x+=2){px(x,0,'#d8c7a0',1,1);px(x,h-1,'#d8c7a0',1,1);}
    },{repeat:false,seed:i});
    const m=mesh(new THREE.PlaneGeometry(W,H),new THREE.MeshStandardMaterial({map:tex,roughness:1}),{cast:false});
    m.rotation.x=-Math.PI/2;m.position.set(room.x+room.w/2,.01,room.y+room.h/2);world.add(m);
  });
  buildWalls(r);
  for(const o of map.objects)furniture(o,r);
}

function buildWalls(r){
  const factory=map.locationType==='factory',papers=factory?['brick','brick']:['wallpaper','wallpaper2'];
  const wallMats=papers.map(p=>[plain(0x2a2018),plain(0x2a2018),plain(0x17110c,{roughness:1}),plain(0x2a2018),mat(p),plain(0x2a2018)]);
  const lowMat=factory?mat('treadplate',{color:0xb8b8b8}):mat('wainscot');   // 墙脚：工厂用铁板，住宅用护墙板
  const T_=.22;
  // 北墙：沿每一列合并成连续一段
  for(let y=0;y<map.rows;y++){let start=-1;
    for(let x=0;x<=map.cols;x++){const need=x<map.cols&&isActive(x,y)&&!isActive(x,y-1);
      if(need&&start<0)start=x;
      if(!need&&start>=0){
        const len=x-start,wm=wallMats[(y+map.seed)%2];
        const w=block(world,start-T_,0,y-T_,len+T_*2,WALL_H,T_,wm);
        block(world,start,0,y-.02,len,.85,.06,[plain(0x2a1a10),plain(0x2a1a10),plain(0x6e4a2e),plain(0x2a1a10),lowMat,plain(0x2a1a10)]);
        block(world,start,WALL_H-.12,y-.02,len,.1,.08,plain(0x4a3020));
        // 窗户：每段墙随机开 1–2 扇
        const n=len>=4?1+(r()<.5?1:0):len>=2?1:0,used=new Set();
        for(let k=0;k<n;k++){let wx=start+Math.floor(r()*(len-1))+.5;if(used.has(wx))continue;used.add(wx);addWindow(wx,y);}
        // 壁灯
        if(len>=3&&r()<.7){const sx=start+len/2+(r()<.5?-1:1)*Math.min(1.5,len/2-.5);addSconce(sx,y);}
        start=-1;}
    }
  }
  // 东西墙
  for(let x=0;x<=map.cols;x++){let start=-1;
    for(let y=0;y<=map.rows;y++){
      const need=y<map.rows&&((isActive(x,y)&&!isActive(x-1,y))||(isActive(x-1,y)&&!isActive(x,y)));
      if(need&&start<0)start=y;
      if(!need&&start>=0){block(world,x-T_/2,0,start,T_,WALL_H,y-start,[plain(0x3a2c22),plain(0x3a2c22),plain(0x17110c,{roughness:1}),plain(0x2a2018),plain(0x2a2018),plain(0x2a2018)]);start=-1;}
    }
  }
  // 南墙：切开成矮墙，像剖面模型一样看得到房内
  for(let y=0;y<=map.rows;y++){let start=-1;
    for(let x=0;x<=map.cols;x++){const need=x<map.cols&&isActive(x,y-1)&&!isActive(x,y);
      if(need&&start<0)start=x;
      if(!need&&start>=0){block(world,start-T_,0,y,x-start+T_*2,.38,T_,[plain(0x2a2018),plain(0x2a2018),plain(0x17110c,{roughness:1}),plain(0x2a2018),plain(0x3c2c20),plain(0x2a2018)]);start=-1;}
    }
  }
}

function addWindow(x,y){
  const g=new THREE.Group();g.position.set(x,0,y);world.add(g);
  const frame=plain(0xd8cdb0,{roughness:.7});
  block(g,-.42,.95,-.02,.84,.08,.12,frame);block(g,-.42,2.05,-.02,.84,.08,.12,frame);
  block(g,-.45,.95,-.02,.07,1.18,.12,frame);block(g,.38,.95,-.02,.07,1.18,.12,frame);block(g,-.035,1.03,-.02,.07,1.02,.1,frame);block(g,-.38,1.5,-.02,.76,.05,.1,frame);
  const pane=new THREE.MeshStandardMaterial({color:0x101820,emissive:0xbfd8ff,emissiveIntensity:1.6,roughness:.2});
  const p=mesh(new THREE.PlaneGeometry(.76,1.02),pane,{cast:false});p.position.set(0,1.54,.005);g.add(p);
  // 窗帘
  block(g,-.6,.85,.02,.16,1.4,.06,mat('velvet'));block(g,.44,.85,.02,.16,1.4,.06,mat('velvet'));block(g,-.62,2.2,0,1.24,.08,.1,plain(0xc9a14a,{metalness:.6,roughness:.4}));
  // 光束：斜照到地板上的半透明面
  const shaft=new THREE.Mesh(new THREE.PlaneGeometry(.9,2.6),new THREE.MeshBasicMaterial({map:T.shaft,color:0xfff0c8,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  shaft.position.set(0,1.0,.85);shaft.rotation.x=-.75;g.add(shaft);
  lights.windows.push(pane);lights.shafts.push(shaft);
}
function addSconce(x,y){
  const g=new THREE.Group();g.position.set(x,0,y);world.add(g);
  block(g,-.05,1.55,0,.1,.18,.08,plain(0xc9a14a,{metalness:.7,roughness:.35}));
  const flame=new THREE.MeshStandardMaterial({color:0xffe0a0,emissive:0xffb050,emissiveIntensity:3});
  const b=mesh(new THREE.SphereGeometry(.06,6,4),flame,{cast:false});b.position.set(0,1.82,.08);g.add(b);
  addHalo(g,0,1.82,.12,.9,0xffb060);
  addPoint(x,1.8,y+.35,0xffaa55,3.5,4,flame);
}
function addHalo(parent,x,y,z,size,color){
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:T.glow,color,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false}));
  s.position.set(x,y,z);s.scale.set(size,size,1);parent.add(s);lights.lampHalos.push(s);return s;
}
function addPoint(x,y,z,color,intensity,distance,emissiveMat,{flick=.0,dayFactor=.35}={}){
  const p={pos:new THREE.Vector3(x,y,z),color:new THREE.Color(color),base:intensity,cur:intensity,distance,dayFactor,
    mat:emissiveMat,matBase:emissiveMat?emissiveMat.emissiveIntensity:0,flick,phase:Math.random()*10};
  lights.points.push(p);return p;
}

/* ---------- 精细素材：Blender 输出的壁炉 ---------- */
// 模型用 Draco 压缩；解压程式从 CDN 载入一次，所有模型共用
const gltfLoader=new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/'));
const FIREPLACE={scene:null};
/* 工厂机具（Blender，assets/factory-kit.glb）：每个物件名称就是地图物件的 key（m-furnace 等） */
const FACTORY={models:{},embers:null};
function loadFactory(){
  const ao=new THREE.TextureLoader().load(ASSET+'factory-kit-ao.webp');ao.flipY=false;ao.channel=1;ao.colorSpace=THREE.NoColorSpace;
  return gltfLoader.loadAsync(ASSET+'factory-kit.glb').then(g=>{
    g.scene.traverse(o=>{
      if(!o.isMesh)return;const m=o.material;
      if(m.map){m.map.magFilter=THREE.NearestFilter;m.map.minFilter=THREE.NearestMipmapLinearFilter;m.map.anisotropy=4;}
      m.aoMap=ao;
      if(m.name==='Embers'){m.emissive.set(0xff8a30);m.emissiveMap=m.map;m.emissiveIntensity=3;FACTORY.embers=m;}
      else if(m.name==='Gauge'){m.emissive.set(0xffffff);m.emissiveMap=m.map;m.emissiveIntensity=.25;}
      else{m.emissive.set(0);m.emissiveIntensity=0;}
    });
    for(const c of g.scene.children)FACTORY.models[c.name]=c;
  }).catch(e=>console.warn('工厂模型载入失败',e));
}
function loadFireplace(){
  // 预先算好的凹处阴影，贴在模型的第二组 UV 上（glTF 的 UV 不需上下翻转）
  const ao=new THREE.TextureLoader().load(ASSET+'fireplace-ao.webp');ao.flipY=false;ao.channel=1;ao.colorSpace=THREE.NoColorSpace;
  return gltfLoader.loadAsync(ASSET+'fireplace.glb').then(g=>{
    g.scene.traverse(o=>{
      if(!o.isMesh)return;const m=o.material;
      if(m.map){m.map.magFilter=THREE.NearestFilter;m.map.minFilter=THREE.NearestMipmapLinearFilter;m.map.anisotropy=4;}
      m.aoMap=ao;m.aoMapIntensity=1;
      if(m.name==='Coals'){m.emissive.set(0xff8a30);m.emissiveMap=m.map;m.emissiveIntensity=3;}
      else if(m.name==='Flame'){m.emissive.set(0xffc060);m.emissiveMap=null;m.emissiveIntensity=5;m.aoMap=null;}
      else if(m.name==='Mirror'){m.emissive.set(0xffffff);m.emissiveMap=m.map;m.emissiveIntensity=.3;}  // 镜面带一点自身亮度，像反射房间
      else{m.emissive.set(0);m.emissiveIntensity=0;}
    });
    FIREPLACE.scene=g.scene;
  }).catch(e=>console.warn('壁炉模型载入失败',e));
}
/* ---------- 精细素材：街屋模组（assets/street-kit.glb） ----------
   每个模组一格宽、一层高。依每栋的楼层、宽度与一楼用途排起来，再依材质合并成少数几块。 */
const KIT={ready:false,modules:{},mats:{},tex:{},styleMats:{},sideMats:{},paintMats:{},loading:[]};
const KIT_STYLES=['brick_red','brick_red','brick_stock','brick_soot','stucco'];
const KIT_PAINT=['#2f4a3e','#5a1e24','#1d2a3a','#5a3a1e','#24262a','#6b5a2a','#3a2a4a'];
function kitTexture(name){
  if(KIT.tex[name])return KIT.tex[name];
  let done;KIT.loading.push(new Promise(r=>done=r));
  const t=new THREE.TextureLoader().load(ASSET+'street/'+name+'.webp',done,undefined,done);
  t.flipY=false;t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapLinearFilter;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;
  return KIT.tex[name]=t;
}
function loadKit(){
  const ao=new THREE.TextureLoader().load(ASSET+'street-kit-ao.webp');ao.flipY=false;ao.channel=1;ao.colorSpace=THREE.NoColorSpace;
  return gltfLoader.loadAsync(ASSET+'street-kit.glb').then(g=>{
    g.scene.traverse(o=>{
      if(!o.isMesh)return;const m=o.material;
      if(m.map){m.map.magFilter=THREE.NearestFilter;m.map.minFilter=THREE.NearestMipmapLinearFilter;m.map.anisotropy=4;}
      m.aoMap=ao;m.emissive.set(0);m.emissiveIntensity=0;KIT.mats[m.name]=m;
    });
    for(const c of [...g.scene.children])KIT.modules[c.name]=c;
    // 亮灯的窗：glassEve 只在黄昏亮（晚上还醒着的人家、营业中的店），glassLate 深夜也亮（少数）
    KIT.glassEve=KIT.mats.Glass.clone();KIT.glassEve.emissive.set(0xffc878);
    KIT.glassLate=KIT.mats.Glass.clone();KIT.glassLate.emissive.set(0xffc878);
    // 窗框、石材、油漆、铁件等几乎单色的小零件：合并时改用这一个材质，颜色写在顶点上
    KIT.flat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.7,aoMap:ao,name:'KitFlat'});
    KIT.glassWarm=KIT.mats.GlassWarm;KIT.glassWarm.emissive.set(0xffa040);KIT.glassWarm.emissiveMap=KIT.glassWarm.map;
    KIT.lamp=KIT.mats.Lamp;KIT.lamp.emissive.set(0xffc070);KIT.lamp.emissiveIntensity=4;
    for(const s of new Set(KIT_STYLES))kitTexture(s);
    return Promise.all(KIT.loading);
  }).then(()=>{KIT.ready=true;}).catch(e=>console.warn('街屋模组载入失败',e));
}
function kitStyleMat(style){return KIT.styleMats[style]||(KIT.styleMats[style]=Object.assign(KIT.mats.Brick.clone(),{map:kitTexture(style)}));}
function kitSideMat(style){return KIT.sideMats[style]||(KIT.sideMats[style]=new THREE.MeshStandardMaterial({map:kitTexture(style),roughness:.9}));}
function kitPaintMat(color){if(!KIT.paintMats[color]){const m=KIT.mats.Paint.clone();m.color.set(color);KIT.paintMats[color]=m;}return KIT.paintMats[color];}
/* 放一个模组：复制后换上这栋的砖、油漆颜色，玻璃随机亮灯 */
function kitPut(g,list,key,x,y,z,style,paint,rr,rotY=0){
  const src=KIT.modules[key];if(!src)return null;
  const m=src.clone(true);m.position.set(x,y,z);m.rotation.y=rotY;g.add(m);list.push(m);
  // 窗户亮不亮：店面黄昏大多营业、深夜打烊；住家黄昏约四成亮，深夜只剩约一成
  const v=rr(),shop=key==='G_SHOP'||key==='G_SHOPDOOR';
  const glass=shop?(v<.85?KIT.glassEve:KIT.mats.Glass):v<.12?KIT.glassLate:v<.5?KIT.glassEve:KIT.mats.Glass;
  m.traverse(o=>{if(!o.isMesh)return;const n=o.material.name;
    o.material=n==='Brick'?kitStyleMat(style):n==='Paint'?kitPaintMat(paint):n==='Glass'?glass:o.material;});
  return m;
}
/* 街屋正面的模组。正面可能朝南（front）、朝东或朝西（side），朝北的建物（back）镜头看到的是后墙。
   at(i,out)：沿正面第 i 格、往外 out 格的位置（建物内座标）与模组要转的角度。 */
function kitFacade(g,o,W,D,FH,GH,style,rr,list){
  const side=o.face==='side',east=side&&o.street==='east',N=side?D:W;
  const at=(i,out=0)=>side?(east?{x:W+out,z:D-i,rot:Math.PI/2}:{x:-out,z:i,rot:-Math.PI/2}):{x:i,z:D+out,rot:0};
  const put=(key,i,y)=>{const p=at(i);return kitPut(g,list,key,p.x,y,p.z,style,paint,rr,p.rot);};
  const paint=pick(rr,KIT_PAINT),r=rr(),rear=o.face==='back';
  const ground=rear?'rear':r<.5?'shop':r<.82?'door':'pub';
  const upper=rear?'U_SASH':pick(rr,['U_SASH','U_SASH','U_ARCH','U_BOX']),bay=!rear&&o.floors>=2&&rr()<.5,doorCol=Math.min(N-1,Math.floor(N/2));
  for(let f=0;f<o.floors;f++)for(let c=0;c<N;c++){
    const key=f===0?(ground==='shop'?(c===doorCol?'G_SHOPDOOR':'G_SHOP'):ground==='pub'?'G_PUB':(c===doorCol?'G_DOOR':'G_SASH'))
      :(bay&&f===1&&c===doorCol?'U_BAY':upper==='U_BOX'&&f>1?'U_SASH':upper);
    put(key,c,f===0?0:GH+(f-1)*FH);
  }
  for(let c=0;c<N;c++)put('CORNICE',c,GH+(o.floors-1)*FH);
  if(ground==='pub'){put('LAMP_BRACKET',doorCol,0);const p=at(doorCol,.28),m=side?{x:0,z:east?-.5:.5}:{x:.5,z:0};
    addPoint(o.x+p.x+m.x,1.52,o.y+p.z+m.z,0xffb860,6,5,KIT.lamp,{dayFactor:0});}
  return ground;
}
// 单色零件的颜色（取自 make_street_textures.py 的底色；油漆再乘上每栋的颜色）
const KIT_FLAT={Frame:'#efebe0',Stone:'#cdc7b9',Paint:'#f2efe8',Iron:'#262a2e',Clay:'#a45a3a',Leaves:'#44663a',Gilt:'#c8a24c',AwnRed:'#7a2630',AwnCream:'#e8dcc0'};
/* 店面遮阳篷：用红白两色的长条拼成，并进该栋的单色零件（不另外多一次绘制）。
   装在招牌上方、只伸出约 0.35 格，从镜头看整片在人物头顶之上。side＝正面朝东或朝西 */
const AWN_MATS=[new THREE.MeshBasicMaterial({name:'AwnRed'}),new THREE.MeshBasicMaterial({name:'AwnCream'})];
const AWN_UV1=[.6514,.4033];   // 凹处阴影图里没有阴影的一点（模组零件都要有第二组 UV 才能合并）
function kitAwning(g,o,W,D){
  const side=o.face==='side',east=o.street==='east',len=(side?D:W)-.2,n=Math.max(6,Math.round(len/.3)),w=len/n;
  const root=new THREE.Group(),tilt=new THREE.Group();
  if(side){root.position.set(east?W:0,0,D/2);root.rotation.y=east?Math.PI/2:-Math.PI/2;}else root.position.set(W/2,0,D);
  tilt.position.set(0,1.47,.18);tilt.rotation.x=.3;root.add(tilt);
  for(let i=0;i<n;i++){const geo=new THREE.BoxGeometry(w,.05,.36),c=geo.attributes.position.count,u=new Float32Array(c*2);
    for(let k=0;k<c;k++){u[k*2]=AWN_UV1[0];u[k*2+1]=AWN_UV1[1];}geo.setAttribute('uv1',new THREE.BufferAttribute(u,2));
    const m=new THREE.Mesh(geo,AWN_MATS[i%2]);m.position.x=-len/2+w*(i+.5);tilt.add(m);}
  g.add(root);return root;
}
/* 一栋建物的模组依材质合并（每种材质一块），减少绘制次数 */
function mergeInto(g,roots){
  g.updateMatrixWorld(true);
  const inv=g.matrixWorld.clone().invert(),buckets=new Map(),rel=new THREE.Matrix4();
  for(const root of roots){
    root.traverse(o=>{
      if(!o.isMesh)return;
      const src=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone(),piece=new THREE.BufferGeometry();
      for(const n of ['position','normal','uv','uv1'])if(src.attributes[n])piece.setAttribute(n,src.attributes[n]);
      piece.applyMatrix4(rel.multiplyMatrices(inv,o.matrixWorld));
      let m=o.material;const flat=KIT_FLAT[m.name];
      if(flat&&KIT.flat){const c=new THREE.Color(flat);if(m.name==='Paint')c.multiply(m.color);
        const n=piece.attributes.position.count,a=new Float32Array(n*3);for(let i=0;i<n;i++){a[i*3]=c.r;a[i*3+1]=c.g;a[i*3+2]=c.b;}
        piece.setAttribute('color',new THREE.BufferAttribute(a,3));m=KIT.flat;}
      if(!buckets.has(m.uuid))buckets.set(m.uuid,{m,list:[]});
      buckets.get(m.uuid).list.push(piece);
    });
    g.remove(root);
  }
  const out=[];
  for(const b of buckets.values()){const geo=mergeGeometries(b.list,false);if(!geo)continue;const m=mesh(geo,b.m);g.add(m);out.push(m);}
  return out;
}

/* 像素火苗：4 格动画，每片火苗各自错开 */
let flameTex=null;const flames=[];
function flameSheet(){
  if(flameTex)return flameTex;
  const FW=12,FH=20;
  flameTex=canvasTex(FW*4,FH,(g,px,r)=>{
    for(let f=0;f<4;f++)for(let y=0;y<FH;y++){
      const t=y/FH,w=Math.max(0,Math.round(5.2*Math.pow(Math.sin(Math.PI*Math.min(1,(1-t)*1.05)),.7)*(1-t*.35))),sway=Math.round(Math.sin(t*5+f*1.6)*1.4*t);
      for(let x=-w;x<=w;x++){const e=Math.abs(x)/(w+.01),c=e>.7||t<.08?'#e0501c':e>.4||t<.25?'#ff9a30':t>.6?'#ffd060':'#fff2b0';px(f*FW+6+x+sway,FH-1-y,c);}
      if(f%2&&y===FH-2)px(f*FW+6+sway,0,'#ff9a30');
    }
  },{repeat:false,seed:5});
  flameTex.repeat.set(.25,1);return flameTex;
}
function addFlames(parent,x,y,z){
  for(const [dx,s,ph] of [[-.1,.75,0],[0,1,2],[.11,.8,1]]){
    const tex=flameSheet().clone();tex.needsUpdate=true;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(.18*s,.3*s).translate(0,.15*s,0),
      new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:.1,depthWrite:false,toneMapped:false,color:new THREE.Color(2.2,1.7,1.3)}));
    m.position.set(x+dx,y,z+Math.abs(dx)*.3);parent.add(m);flames.push({tex,phase:ph});
  }
}

/* 家具：每种家具用几个贴像素材质的方块组成。占地与摆放都来自 map-generator.js。 */
/* 室内家具原本配合 1.55 格的人物；人物改成 1.2 格后，整组以后缘（靠北墙）为基准缩小。
   AP() 把家具内的座标换成世界座标（给光源用）。街上的路灯、长椅、花台不缩。 */
const FURN_SCALE=.78;
function furniture(o,r){
  const g=new THREE.Group();g.position.set(o.x,0,o.y);world.add(g);
  const S=o.key.startsWith('f-')?FURN_SCALE:1,ox=o.cols/2*(1-S);
  if(S!==1){g.scale.setScalar(S);g.position.x+=ox;}
  const AP=(lx,ly,lz,...a)=>addPoint(o.x+ox+lx*S,ly*S,o.y+lz*S,...a);
  // 工厂机具：Blender 模型已按格子尺寸做好，直接放进占地（熔炉另加火焰与光源）
  if(o.key.startsWith('m-')&&state.detail&&FACTORY.models[o.key]){
    const m=FACTORY.models[o.key].clone(true);m.traverse(c=>{if(c.isMesh)c.castShadow=c.receiveShadow=true;});g.add(m);
    if(o.key==='m-furnace'){addFlames(g,1,.28,.9);addHalo(g,1,.5,.95,1.4,0xff8030);AP(1,.6,1.5,0xff7a30,6,6,FACTORY.embers,{flick:.25,dayFactor:.6});}
    return;
  }
  const W=o.cols,D=o.rows,brass=plain(0xc9a14a,{metalness:.7,roughness:.35}),dark=plain(0x2a1a10);
  const legs=(x0,z0,w,d,h,m=dark)=>{for(const[a,b]of[[x0,z0],[x0+w-.06,z0],[x0,z0+d-.06],[x0+w-.06,z0+d-.06]])block(g,a,0,b,.06,h,.06,m);};
  const front=(m,frontMat)=>[m,m,m,m,frontMat,m];
  switch(o.key){
    case 'f-sofa':case 'f-armchair':{const w=o.key==='f-sofa'?W-.2:.8,x=(W-w)/2,v=r()<.5?mat('velvet'):mat('velvetGreen');
      block(g,x,.12,.2,w,.3,.62,v);block(g,x,.12,.12,w,.78,.18,v);block(g,x-.02,.12,.2,.16,.5,.62,v);block(g,x+w-.14,.12,.2,.16,.5,.62,v);legs(x,.2,w,.6,.12);break;}
    case 'f-tea':block(g,.3,.36,.25,W-.6,.06,.5,mat('woodLight'));legs(.34,.28,W-.68,.44,.36);block(g,W/2-.1,.42,.42,.2,.12,.16,mat('linen'));break;
    case 'f-bookcase':block(g,.05,0,.04,W-.1,2.05,.42,front(mat('wood'),mat('books')));block(g,0,2.05,0,W,.08,.48,mat('wood'));break;
    case 'f-cabinet':block(g,.1,0,.05,.8,1.05,.45,front(mat('wood'),mat('drawers')));block(g,.3,1.05,.15,.15,.25,.15,plain(0x3f5a52,{roughness:.3}));break;
    case 'f-clock':{block(g,.28,0,.08,.44,1.95,.34,mat('wood'));const face=new THREE.MeshStandardMaterial({color:0xe8dcc0,emissive:0x302010,roughness:.5});const f=mesh(new THREE.CircleGeometry(.16,12),face,{cast:false});f.position.set(.5,1.62,.425);g.add(f);block(g,.47,.6,.42,.06,.6,.02,brass);break;}
    case 'f-piano':block(g,.1,0,.05,W-.2,1.15,.55,plain(0x15110f,{roughness:.25}));block(g,.15,.72,.6,W-.3,.06,.22,mat('linen'));block(g,.15,.7,.6,W-.3,.04,.24,plain(0x15110f,{roughness:.25}));break;
    case 'f-fireplace':if(state.detail&&FIREPLACE.scene){
      // Blender 做的精细壁炉（assets/fireplace.glb）；火焰、光晕、光源在这里加上
      const m=FIREPLACE.scene.clone(true);let coals=null;
      m.traverse(c=>{if(!c.isMesh)return;c.castShadow=c.receiveShadow=true;c.userData.keep=true;if(c.material.name==='Coals')coals=c.material;});
      g.add(m);
      addFlames(g,1,.24,.12);addHalo(g,1,.34,.3,1.3,0xff8030);
      for(const x of [.52,1.48])addHalo(g,x,1.51,.22,.35,0xffc070);
      AP(1,.6,1.05,0xff7a30,5,6,coals,{flick:.25,dayFactor:.6});break;
    }else{block(g,.05,0,0,W-.1,1.2,.42,mat('marble',{roughness:.5}));block(g,0,1.2,0,W,.1,.5,mat('marble',{roughness:.5}));
      block(g,W/2-.45,0,.25,.9,.75,.2,plain(0x0c0806));
      const fire=new THREE.MeshStandardMaterial({color:0xffa040,emissive:0xff7a20,emissiveIntensity:4});
      for(let k=0;k<5;k++){const f=mesh(new THREE.BoxGeometry(.1,.14+r()*.2,.08),fire,{cast:false});f.position.set(W/2-.3+k*.15,.12,.38);g.add(f);}
      addHalo(g,W/2,.35,.5,1.4,0xff8030);
      block(g,W/2-.3,1.3,.1,.08,.25,.08,brass);block(g,W/2+.22,1.3,.1,.08,.25,.08,brass);
      AP(W/2,.5,.9,0xff7a30,9,6,fire,{flick:.25,dayFactor:.6});break;}

    case 'f-desk':{block(g,.1,.72,.15,W-.2,.07,.65,mat('woodLight'));block(g,.12,0,.15,.45,.72,.62,front(mat('wood'),mat('drawers')));block(g,W-.57,0,.15,.45,.72,.62,front(mat('wood'),mat('drawers')));
      block(g,.6,.79,.35,.4,.02,.3,mat('linen'));block(g,W-.5,.79,.3,.06,.3,.06,brass);
      const shadeM=new THREE.MeshStandardMaterial({color:0x5a8a5a,emissive:0xffd890,emissiveIntensity:2.2,roughness:.4});
      const s=mesh(new THREE.CylinderGeometry(.08,.16,.14,8),shadeM,{cast:false});s.position.set(W-.47,1.15,.33);g.add(s);addHalo(g,W-.47,1.1,.4,.8,0xffd890);
      AP(W-.47,1.1,.6,0xffd890,3,3.5,shadeM);break;}
    case 'f-globe':{block(g,.42,0,.42,.16,.7,.16,mat('wood'));const tex=canvasTex(16,8,(gg,px,rr)=>{px(0,0,'#3c6a8a',16,8);for(let k=0;k<14;k++)px(rr()*16,rr()*8,'#8a9a5a',2,1);},{seed:o.x*31+o.y});
      const s=mesh(new THREE.SphereGeometry(.24,12,8),new THREE.MeshStandardMaterial({map:tex,roughness:.5}));s.position.set(.5,.95,.5);g.add(s);break;}
    case 'f-bed':{block(g,.1,0,.05,W-.2,.35,D-.15,mat('wood'));block(g,.1,0,0,W-.2,1.25,.12,mat('wood'));block(g,.15,.35,.12,W-.3,.18,D-.3,mat('linen'));
      block(g,.18,.4,.65,W-.36,.16,D-.85,mat('quilt'));block(g,.25,.52,.18,.6,.12,.35,mat('linen'));block(g,W-.85,.52,.18,.6,.12,.35,mat('linen'));block(g,.1,0,D-.15,W-.2,.6,.08,mat('wood'));break;}
    case 'f-nightstand':block(g,.2,0,.15,.6,.6,.5,front(mat('wood'),mat('drawers')));{const c=new THREE.MeshStandardMaterial({color:0xfff0c0,emissive:0xffc060,emissiveIntensity:3});const m=mesh(new THREE.BoxGeometry(.05,.12,.05),c,{cast:false});m.position.set(.5,.68,.4);g.add(m);addHalo(g,.5,.75,.45,.5,0xffc060);AP(.5,.9,.7,0xffb060,2.5,3.5,c,{flick:.12});}break;
    case 'f-wardrobe':block(g,.1,0,.05,W-.2,2.1,.55,front(mat('wood'),mat('drawers')));block(g,.05,2.1,0,W-.1,.1,.62,mat('wood'));break;
    case 'f-washstand':block(g,.15,0,.15,.7,.75,.45,mat('wood'));block(g,.12,.75,.12,.76,.05,.5,mat('marble',{roughness:.4}));{const b=mesh(new THREE.CylinderGeometry(.18,.12,.1,10),mat('linen',{roughness:.3}));b.position.set(.5,.85,.37);g.add(b);}break;
    case 'f-sideboard':block(g,.1,0,.08,W-.2,.9,.5,front(mat('wood'),mat('drawers')));block(g,W/2-.04,.9,.25,.08,.35,.08,brass);break;
    case 'f-dining':{block(g,.25,.72,.3,W-.5,.07,D-.6,mat('linen'));legs(.3,.35,W-.6,D-.7,.72);
      for(let k=0;k<3;k++){const cx=.5+k*(W-1)/2;block(g,cx-.2,0,.05,.4,.45,.35,mat('wood'));block(g,cx-.2,.45,.02,.4,.5,.06,mat('wood'));block(g,cx-.2,0,D-.4,.4,.45,.35,mat('wood'));}
      const c=new THREE.MeshStandardMaterial({color:0xfff0c0,emissive:0xffc060,emissiveIntensity:3});
      for(const dx of[-.3,0,.3]){const m=mesh(new THREE.BoxGeometry(.04,.16,.04),c,{cast:false});m.position.set(W/2+dx,.88,D/2);g.add(m);}
      addHalo(g,W/2,.95,D/2,1.2,0xffc060);AP(W/2,1.4,D/2,0xffc070,4,4,c,{flick:.1});break;}
    case 'f-plant':{const pot=mesh(new THREE.CylinderGeometry(.18,.13,.3,8),plain(0x8a5a3a));pot.position.set(.5,.15,.5);g.add(pot);
      const leaf=new THREE.MeshStandardMaterial({color:0x4a7a40,flatShading:true,roughness:.8});
      for(let k=0;k<5;k++){const s=mesh(new THREE.IcosahedronGeometry(.16+r()*.08,0),leaf);s.position.set(.5+(r()-.5)*.3,.45+r()*.35,.5+(r()-.5)*.3);g.add(s);}break;}
    case 'lamp':{block(g,.44,0,.44,.12,.12,.12,mat('iron'));block(g,.47,.12,.47,.06,1.8,.06,mat('iron'));
      const glass=new THREE.MeshStandardMaterial({color:0xffe6b0,emissive:0xffc070,emissiveIntensity:.2,roughness:.3});
      block(g,.38,1.9,.38,.24,.3,.24,glass,{cast:false});block(g,.34,2.2,.34,.32,.06,.32,mat('iron'));
      const h=addHalo(g,.5,2.05,.5,2.2,0xffc070);
      AP(.5,1.95,.5,0xffb860,14,7,glass,{dayFactor:0});lights.points[lights.points.length-1].matBase=4;break;}
    case 'bench':block(g,.1,.35,.3,W-.2,.06,.4,mat('woodLight'));block(g,.1,.4,.25,W-.2,.4,.06,mat('woodLight'));legs(.15,.3,W-.3,.4,.35,mat('iron'));break;
    case 'planter':{block(g,.15,0,.15,.7,.4,.7,mat('brick'));const leaf=new THREE.MeshStandardMaterial({color:0x4f6e3f,flatShading:true});for(let k=0;k<4;k++){const s=mesh(new THREE.IcosahedronGeometry(.2,0),leaf);s.position.set(.35+r()*.3,.55,.35+r()*.3);g.add(s);}break;}
    default:block(g,.1,0,.1,W-.2,.8,D-.2,mat('wood'));
  }
}

/* ---------- 伦敦街区 ---------- */
const FACADE={red:['#8a4a36','#733c2d'],stock:['#a88a5a','#8c7246'],stucco:['#d8cfb8','#b8ae96'],stone:['#8d8a80','#6f6c63'],soot:['#4a3f38','#3a312b']};
function buildLondon(){
  const r=makeRng(map.seed^0x77);
  floorTiles(map.cells.filter(c=>c.active&&c.core),mat('setts',{roughness:.7}));
  floorTiles(map.cells.filter(c=>c.active&&!c.core&&!c.blocked),mat('flags'),0,.1);
  floorTiles(map.cells.filter(c=>c.active&&c.blocked&&!map.objects.some(o=>(o.key==='building'||o.key==='landmark')&&o.ids.includes(c.id))),mat('flags'),0,.1);
  for(const o of map.objects){if(o.key==='building'||o.key==='landmark')building(o);else furniture(o,r);}
}
function facadeTex(o,cols,floors,kind){
  const rr=makeRng(o.seed),matKey=pick(rr,Object.keys(FACADE)),[base,dk]=FACADE[matKey];
  const fh=36,w=cols*TEX,h=floors*fh+6,lit=[];
  const shop=kind!=='back'&&rr()<.6,shopCol=pick(rr,['#2f4a3e','#4a1e22','#1d2430','#5a3a1e']);
  const draw=(g,px,ri)=>{
    px(0,0,base,w,h);
    for(let y=0;y<h;y+=4)for(let x=(y/4%2)*4;x<w;x+=8){px(x,y,dk,1,4);}
    for(let y=0;y<h;y+=4)px(0,y,shade(base,.85),w,1);
    px(0,0,shade(base,.6),w,3);
    for(let f=0;f<floors;f++){const y=h-(f+1)*fh;
      px(0,y+fh-2,shade(base,1.25),w,2);
      for(let c=0;c<cols;c++){const x=c*TEX;
        if(f===0&&shop){px(x,y+6,shopCol,TEX,fh-6);px(x+3,y+10,'#1a2228',TEX-6,fh-14);px(x+3,y+10,'#3d5866',TEX-6,2);lit.push([x+3,y+10,TEX-6,fh-14]);if(c===0)px(x,y+2,pick(rr,['#c9a14a','#e8dcc0']),w,4);continue;}
        if(f===0&&c===Math.floor(cols/2)&&kind!=='back'){px(x+10,y+8,'#22382f',12,fh-8);px(x+20,y+20,'#c9a14a',1,2);continue;}
        px(x+7,y+6,'#e9e3d2',18,22);px(x+9,y+8,'#1a2228',14,18);px(x+9,y+16,'#e9e3d2',14,1);px(x+15,y+8,'#e9e3d2',1,18);px(x+6,y+28,shade(base,1.3),20,2);
        lit.push([x+9,y+8,14,18]);}
    }
  };
  const tex=canvasTex(w,h,draw,{repeat:false,seed:o.seed});
  const em=canvasTex(w,h,(g,px)=>{px(0,0,'#000',w,h);const er=makeRng(o.seed^99);for(const[x,y,ww,hh]of lit)if(er()<.55)px(x,y,er()<.5?'#ffcf80':'#ffb060',ww,hh);},{repeat:false,seed:o.seed});
  return {tex,em,base,dk,matKey};
}
function building(o){
  const g=new THREE.Group();g.position.set(o.x,0,o.y);world.add(g);
  // 精细素材：一般建物改用 Blender 模组（正面朝哪都一样）；地标维持程式绘制
  const useKit=state.detail&&KIT.ready&&o.key==='building';
  // 模组的一楼（店面、大门）较高：1.5 格，人物约 1.2 格；楼上每层 1.125 格
  const FH=1.125,GH=useKit?1.5:FH,H=GH+(o.floors-1)*FH+.2,W=o.cols,D=o.rows;
  const rk=makeRng(o.seed^0x5151),style=useKit?pick(rk,KIT_STYLES):null,kitParts=[];
  const visibleCols=o.face==='side'?D:W;
  const {tex,em,base}=facadeTex(o,visibleCols,o.floors,o.face);
  const facadeMat=new THREE.MeshStandardMaterial({map:tex,emissiveMap:em,emissive:0xffffff,emissiveIntensity:0,roughness:.9});
  const sideTex=mat('brick',{color:new THREE.Color(base).lerp(new THREE.Color(0xffffff),.35).getHex()});
  const plainMat=new THREE.MeshStandardMaterial({color:new THREE.Color(base).multiplyScalar(.85),roughness:.95});
  lights.windows.push({facade:facadeMat});
  // 材质顺序 +x,-x,+y,-y,+z,-z
  const faces=[sideTex,sideTex,plain(0x2c3236),plainMat,o.face==='front'?facadeMat:sideTex,plainMat];
  if(o.face==='side'){if(o.street==='east')faces[0]=facadeMat;else faces[1]=facadeMat;}
  // 模组的墙板厚 0.06，嵌在本体正面那一侧：本体在那一侧缩进 0.06，该面涂成暗色
  let bx0=0,bx1=W,bz1=D;
  if(useKit){const sm=kitSideMat(style),dark=plain(0x18130f);faces[0]=faces[1]=faces[4]=sm;
    if(o.face==='side'){if(o.street==='east'){faces[0]=dark;bx1=W-.06;}else{faces[1]=dark;bx0=.06;}}
    else{faces[4]=dark;bz1=D-.06;}
    faces[3]=faces[2];faces[5]=sm;}
  tex.repeat.set(1/visibleCols,1/H);em.repeat.set(1/visibleCols,1/H);
  // 六个面依材质合并：同材质的面一次画完
  const bgeo=box(bx1-bx0,H,bz1),uniq=[...new Set(faces)];
  for(const gr of bgeo.groups)gr.materialIndex=uniq.indexOf(faces[gr.materialIndex]);
  const body=mesh(mergeGroups(bgeo),uniq);body.position.set((bx0+bx1)/2,H/2,bz1/2);g.add(body);
  const parts=[body];
  // 屋顶
  const rr=makeRng(o.seed^7),roofKind=o.key==='landmark'?'landmark':o.face==='back'?'flat':pick(rr,['gable','gable','flat','mansard']);
  const roofMat=mat(rr()<.6?'slate':'tile');
  if(roofKind==='gable'){const rh=Math.min(1.1,D*.45,.35+o.floors*.3),s=new THREE.Shape();s.moveTo(-.1,0);s.lineTo(D+.1,0);s.lineTo(D/2,rh);s.closePath();
    const geo=new THREE.ExtrudeGeometry(s,{depth:W+.1,bevelEnabled:false});geo.rotateY(Math.PI/2);
    const uv=geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i),uv.getY(i));
    const m=mesh(geo,roofMat);m.position.set(-.05,H,D);g.add(m);parts.push(m);
    if(useKit){
      // 屋脊附近的烟囱与屋顶前坡的老虎窗（模组）
      for(let k=0;k<Math.max(1,W/3|0);k++)kitPut(g,kitParts,'CHIMNEY',.6+k*2.6,H+rh*.5-.15,D*.25,style,null,rk);
      if(o.face==='front'&&D>=2&&rk()<.7)kitPut(g,kitParts,'DORMER',W/2+(W>=3?.5:0),H-.05,D-.2,style,'#e8e2d4',rk);
    }else for(let k=0;k<Math.max(1,W/3|0);k++)parts.push(block(g,.4+k*2.6,H+.3,D*.25,.35,1.2,.35,mat('brick')));}
  else if(roofKind==='mansard'){parts.push(block(g,.12,H,.12,W-.24,.8,D-.24,roofMat));parts.push(block(g,0,H,0,W,.06,D,plain(0x2c3236)));
    for(let k=0;k<W;k++)parts.push(block(g,k+.3,H+.15,D-.2,.4,.5,.12,plain(0xd8cfb8)));}
  else if(roofKind==='flat'){parts.push(block(g,0,H,0,W,.25,.12,plain(0x5a5a52)));parts.push(block(g,0,H,D-.12,W,.25,.12,plain(0x5a5a52)));
    if(rr()<.4){const t=mesh(new THREE.CylinderGeometry(.35,.35,.7,10),mat('woodLight'));t.position.set(W*.7,H+.55,D/2);g.add(t);parts.push(t);}}
  else{ // 地标：钟塔
    const tw=Math.min(2,W-1),tx=(W-tw)/2;parts.push(block(g,tx,H,D/2-tw/2,tw,2.4,tw,sideTex));
    const clock=new THREE.MeshStandardMaterial({color:0xf0e6c8,emissive:0xffe0a0,emissiveIntensity:0});const c=mesh(new THREE.CircleGeometry(.5,16),clock,{cast:false});c.position.set(W/2,H+1.6,D/2+tw/2+.01);g.add(c);
    lights.windows.push({facade:clock});
    const sp=mesh(new THREE.ConeGeometry(tw*.75,2.2,4),roofMat);sp.rotation.y=Math.PI/4;sp.position.set(W/2,H+3.5,D/2);g.add(sp);parts.push(sp);}
  let ground=null;
  if(useKit){ground=kitFacade(g,o,W,D,FH,GH,style,rk,kitParts);
    if(ground==='shop'&&rr()<(o.face==='side'?.5:.35))kitParts.push(kitAwning(g,o,W,D));   // 模组版只放在商店
    parts.push(...mergeInto(g,kitParts));}
  // 店面遮阳篷（非模组版；模组版见 kitAwning）
  if(!useKit&&o.face==='front'&&rr()<.45){const aw=canvasTex(16,8,(gg,px)=>{for(let x=0;x<16;x+=4)px(x,0,'#7a2630',2,8),px(x+2,0,'#e8dcc0',2,8);},{seed:o.seed});
    const a=mesh(new THREE.BoxGeometry(W-.2,.05,.7),new THREE.MeshStandardMaterial({map:aw,roughness:.9}));
    a.position.set(W/2,.95,D+.3);a.rotation.x=.35;g.add(a);parts.push(a);}
  for(const p of parts){fadeables.push(p);}
  g.userData.parts=parts;
}

/* 不会动的墙、家具、地毯依材质合并成少数几块，减少每张画面的绘制次数。
   建物（伦敦会变半透明）、光束与实例化地板不合并。 */
function mergeStatic(){
  world.updateMatrixWorld(true);
  const skip=new Set(fadeables),buckets=new Map(),remove=[];
  world.traverse(o=>{
    if(!o.isMesh||o.isInstancedMesh||skip.has(o)||o.userData.keep)return;
    const mats=Array.isArray(o.material)?o.material:[o.material];
    if(mats.some(m=>m.transparent))return;
    const flat=o.geometry.index?o.geometry.toNonIndexed():o.geometry;
    const total=flat.attributes.position.count;
    const groups=Array.isArray(o.material)&&o.geometry.groups.length?o.geometry.groups:[{start:0,count:total,materialIndex:0}];
    for(const gr of groups){
      const m=mats[gr.materialIndex];if(!m)continue;
      const piece=new THREE.BufferGeometry(),end=Math.min(total,gr.start+gr.count);
      for(const name of ['position','normal','uv','uv1','color']){const a=flat.attributes[name];if(!a)continue;piece.setAttribute(name,new THREE.BufferAttribute(a.array.slice(gr.start*a.itemSize,end*a.itemSize),a.itemSize));}
      piece.applyMatrix4(o.matrixWorld);
      const key=m.uuid+'|'+o.castShadow+'|'+o.receiveShadow;
      if(!buckets.has(key))buckets.set(key,{m,cast:o.castShadow,recv:o.receiveShadow,list:[]});
      buckets.get(key).list.push(piece);
    }
    remove.push(o);
  });
  for(const o of remove)o.parent.remove(o);
  for(const b of buckets.values()){const g=mergeGeometries(b.list,false);if(!g)continue;const m=new THREE.Mesh(g,b.m);m.castShadow=b.cast;m.receiveShadow=b.recv;world.add(m);}
}

/* ---------- 光源与时段 ---------- */
function buildLights(){
  lights.hemi=new THREE.HemisphereLight(0xcfd8e8,0x4a3a2a,.6);scene.add(lights.hemi);
  lights.sun=new THREE.DirectionalLight(0xffe2b0,2.6);lights.sun.castShadow=true;
  const S=SHADOW_HALF;const sc=lights.sun.shadow.camera;sc.left=-S;sc.right=S;sc.top=S;sc.bottom=-S;sc.near=1;sc.far=90;
  lights.sun.shadow.mapSize.set(1024,1024);lights.sun.shadow.bias=-.0006;lights.sun.shadow.normalBias=.02;
  scene.add(lights.sun);scene.add(lights.sun.target);
  // 固定数量的真实光源，轮流分给离镜头最近的灯；其他灯只保留发亮的外观。
  lights.pool=Array.from({length:MAX_LIGHTS},()=>{const l=new THREE.PointLight(0xffffff,0,1,1.6);scene.add(l);return {light:l,src:null,k:0,leaving:false};});
  lights.sunAt=null;
  // 主角的提灯：黄昏与夜晚照亮主角和身边一两格，暗处也看得清楚；白天熄灭（室内白天留一点）
  lights.lantern=new THREE.PointLight(0xffd2a0,0,4.6,1.5);scene.add(lights.lantern);
}
const MAX_LIGHTS=4,SHADOW_HALF=10;
function updateLightPool(dt,t){
  const want=lights.points.filter(p=>p.cur>0).map(p=>[p,(p.pos.x-camTarget.x)**2+(p.pos.z-camTarget.z)**2]).sort((a,b)=>a[1]-b[1]).slice(0,MAX_LIGHTS).map(v=>v[0]);
  const wanted=new Set(want);
  for(const s of lights.pool)if(s.src&&!wanted.has(s.src))s.leaving=true;
  const taken=new Set(lights.pool.filter(s=>s.src&&!s.leaving).map(s=>s.src));
  for(const s of lights.pool){
    if(s.leaving){s.k=Math.max(0,s.k-dt*4);if(s.k===0){s.src=null;s.leaving=false;}}
    if(!s.src){const next=want.find(p=>!taken.has(p));if(next){s.src=next;taken.add(next);s.k=0;s.light.position.copy(next.pos);s.light.color.copy(next.color);s.light.distance=next.distance;}}
    if(s.src&&!s.leaving)s.k=Math.min(1,s.k+dt*4);
    const p=s.src;
    s.light.intensity=p?p.cur*s.k*(1+(p.flick?(Math.sin(t*9+p.phase)+Math.sin(t*23+p.phase*2))*p.flick*.5:0)):0;
  }
}
/* 阴影范围跟着镜头，只涵盖画面附近；镜头移动超过 3 格才重新对准 */
function updateSun(force){
  const at=lights.sunAt;
  if(!force&&at&&Math.hypot(at.x-camTarget.x,at.z-camTarget.z)<3)return false;
  const x=Math.round(camTarget.x),z=Math.round(camTarget.z),o=TIMES[state.time].sun[2];
  lights.sunAt={x,z};lights.sun.target.position.set(x,0,z);lights.sun.position.set(x+o[0],o[1],z+o[2]);lights.sun.target.updateMatrixWorld();
  return true;
}
const TIMES={
  day:{hemi:[0xd8e2f0,0x5a4a38,.7],sun:[0xfff0d0,2.8,[-14,30,18]],fog:0x2a2620,bg:0x15120e,window:2.2,exposure:1.0,lamp:0,lantern:0,rim:.9},
  dusk:{hemi:[0xe8b890,0x4a3830,.62],sun:[0xffa060,2.2,[20,10,14]],fog:0x2a1c18,bg:0x1a100c,window:1.2,exposure:1.1,lamp:.7,lantern:3.5,rim:1.5},
  night:{hemi:[0x6a84b4,0x262a36,.66],sun:[0x9ab8f0,1.1,[-10,30,8]],fog:0x0c1018,bg:0x07090d,window:.25,exposure:1.18,lamp:1,lantern:4.5,rim:1.9}
};
function applyTime(){
  const t=TIMES[state.time],indoor=map.indoor;
  lights.hemi.color.set(t.hemi[0]);lights.hemi.groundColor.set(t.hemi[1]);lights.hemi.intensity=t.hemi[2]*(indoor?.8:1);
  lights.sun.color.set(t.sun[0]);lights.sun.intensity=t.sun[1]*(indoor?.75:1);
  updateSun(true);renderer.shadowMap.needsUpdate=true;
  scene.background=new THREE.Color(t.bg);scene.fog=new THREE.Fog(t.fog,40,80);
  renderer.toneMappingExposure=t.exposure;
  lights.lantern.intensity=t.lantern||(indoor?1.5:0);RIM.value=t.rim;
  const lampOn=indoor?(state.time==='day'?.35:1):t.lamp;
  for(const p of lights.points){const k=indoor?(state.time==='day'?p.dayFactor:1):lampOn;
    p.cur=p.base*k;
    if(p.mat)p.mat.emissiveIntensity=p.matBase*(k>0?Math.max(.4,k):0)+.05;}
  for(const s of lights.lampHalos)s.material.opacity=(indoor?(state.time==='day'?.25:.6):lampOn*.6);
  for(const w of lights.windows){
    if(w.facade){w.facade.emissiveIntensity=state.time==='night'?(w.night??1.6):state.time==='dusk'?(w.dusk??.6):0;}
    else{w.emissive.set(state.time==='night'?0x3050a0:state.time==='dusk'?0xffb070:0xcfe2ff);w.emissiveIntensity=t.window;}
  }
  for(const s of lights.shafts){s.material.color.set(state.time==='night'?0x6a8cd8:state.time==='dusk'?0xffa060:0xfff0c8);s.material.opacity=state.time==='night'?.16:.22;}
}

/* ---------- 角色 ---------- */
const loader=new THREE.TextureLoader();
/* 立绘往后仰，头顶几乎贴到墙面，遮阳篷、凸窗、靠墙家具会插进立绘。
   判断前后遮挡时，把立绘沿视线往镜头移 SPRITE_DEPTH_BIAS 格：画面上的位置与大小不变，
   伸出半格左右的东西改画在人物后面；前后相隔一整格的物件不受影响。光照与阴影仍用原位置。 */
const SPRITE_DEPTH_BIAS=.5;
function spriteMat(url){const t=loader.load(url);t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.LinearMipmapLinearFilter;
  const m=new THREE.MeshStandardMaterial({map:t,alphaTest:.5,side:THREE.DoubleSide,emissive:0xffffff,emissiveMap:t,emissiveIntensity:.22,roughness:1});
  m.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <project_vertex>',
    `#include <project_vertex>
    { float d=length(mvPosition.xyz); gl_Position=projectionMatrix*vec4(mvPosition.xyz*max(.05,1.-${SPRITE_DEPTH_BIAS.toFixed(2)}/d),1.); }`);};
  return m;}
function makeActor(url,w,h){
  const g=new THREE.Group();
  const geo=new THREE.PlaneGeometry(w,h);geo.translate(0,h/2,0);
  const m=new THREE.Mesh(geo,spriteMat(url));m.rotation.x=-.32;g.add(m);
  // 人物不画进阴影图（否则每走一步都要重算整片阴影），改在地上放一张依太阳方向拉长的人形影子
  const shadow=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:m.material.map,color:0,transparent:true,opacity:.3,alphaTest:.05,depthWrite:false,side:THREE.DoubleSide}));
  shadow.rotation.x=Math.PI/2;const pivot=new THREE.Group();pivot.position.y=.012;pivot.add(shadow);g.add(pivot);
  const blob=new THREE.Mesh(new THREE.CircleGeometry(.23,16),new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:.35,depthWrite:false}));
  blob.rotation.x=-Math.PI/2;blob.position.y=.015;blob.scale.set(1,.6,1);g.add(blob);
  world.add(g);return {g,sprite:m,blob,shadow,pivot,trail:[]};
}
/* 外框：在立绘后面放一张稍大的板子，画出立绘轮廓往外扩一圈的颜色。用在敌人（原图是深色剪影，暗处看不到）。
   板子是立绘的子物件，跟着转向；换走路格时 setPose 会同步贴图与格位。 */
const RIM={value:1};
function addOutline(a,w,h,color,width){
  const W=w+width*2,H=h+width*2,geo=new THREE.PlaneGeometry(W,H);geo.translate(0,h/2,0);
  const uv=geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)*W-width)/w,(uv.getY(i)*H-width)/h);
  const src=a.sprite.material.map;
  const m=new THREE.ShaderMaterial({uniforms:{map:{value:src},uvT:{value:new THREE.Matrix3()},r:{value:new THREE.Vector2(width/w,width/h)},color:{value:new THREE.Color(color)},rim:RIM},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);float d=length(mv.xyz);
      gl_Position=projectionMatrix*vec4(mv.xyz*max(.05,1.-${SPRITE_DEPTH_BIAS.toFixed(2)}/d),1.);}`,
    fragmentShader:`uniform sampler2D map;uniform mat3 uvT;uniform vec2 r;uniform vec3 color;uniform float rim;varying vec2 vUv;
      float A(vec2 p){if(p.x<0.||p.y<0.||p.x>1.||p.y>1.)return 0.;return texture2D(map,(uvT*vec3(p,1.)).xy).a;}
      void main(){float a=0.;for(int i=0;i<12;i++){float t=float(i)*.5236;a=max(a,A(vUv+vec2(cos(t),sin(t))*r));}
        if(a<.5)discard;gl_FragColor=vec4(color*rim,1.);}`});
  const o=new THREE.Mesh(geo,m);o.position.z=-.02;a.sprite.add(o);a.outline=o;return o;
}
function syncOutline(a){if(!a.outline)return;const u=a.outline.material.uniforms,map=a.sprite.material.map;u.map.value=map;map.updateMatrix();u.uvT.value.copy(map.matrix);}
/* ---------- 后制 ---------- */
// 画面暂存加上深度图：迷雾要用深度算出每个像素在地面上的位置
const rtMain=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});rtMain.depthTexture=new THREE.DepthTexture(1,1);
const composer=new EffectComposer(renderer,rtMain);
composer.renderTarget2.depthTexture=new THREE.DepthTexture(1,1);   // 复制出来的暂存画面会共用同一张深度图，造成读写冲突；另给一张
const renderPass=new RenderPass(null,camera);
const pixelPass=new RenderPixelatedPass(3,null,camera,{normalEdgeStrength:.25,depthEdgeStrength:.35});
const bloom=new UnrealBloomPass(new THREE.Vector2(256,256),.55,.5,.82);
const output=new OutputPass();
const tiltH=new ShaderPass(HorizontalTiltShiftShader),tiltV=new ShaderPass(VerticalTiltShiftShader);
tiltH.uniforms.r.value=tiltV.uniforms.r.value=.52;
const grade=new ShaderPass({uniforms:{tDiffuse:{value:null},strength:{value:1}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform sampler2D tDiffuse;uniform float strength;varying vec2 vUv;
    void main(){vec4 c=texture2D(tDiffuse,vUv);vec3 col=c.rgb;
      float l=dot(col,vec3(.299,.587,.114));
      col=mix(col,col*vec3(1.06,1.0,.9),.6);              // 偏暖
      col=mix(vec3(l),col,1.08);                           // 微增饱和
      col=mix(col*vec3(.86,.9,1.05),col,smoothstep(.0,.5,l)); // 暗部偏冷
      vec2 d=vUv-.5;col*=1.-dot(d,d)*.9*strength;          // 暗角
      gl_FragColor=vec4(col,c.a);}`});
composer.addPass(renderPass);composer.addPass(pixelPass);composer.addPass(bloom);composer.addPass(output);composer.addPass(tiltH);composer.addPass(tiltV);composer.addPass(grade);
function applyFx(){
  state.fx.tilt=tiltSaved();
  renderPass.enabled=!state.fx.pixel;pixelPass.enabled=state.fx.pixel;
  bloom.enabled=state.fx.bloom;tiltH.enabled=tiltV.enabled=state.fx.tilt;
}

/* 建物淡出：复制材质给该栋专用，避免影响其他建物 */
function setGroupOpacity(g,target){
  const cur=g.userData.opacity??1,next=cur+(target-cur)*.2;if(Math.abs(next-cur)<.002&&cur===target)return;g.userData.opacity=Math.abs(next-target)<.01?target:next;
  for(const o of g.userData.parts){
    if(!o.userData.ownMats){o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();o.userData.ownMats=true;}
    for(const m of Array.isArray(o.material)?o.material:[o.material]){m.transparent=g.userData.opacity<1;m.opacity=g.userData.opacity;m.depthWrite=g.userData.opacity>.95;}
  }
}

/* 预热：把整张地图（含镜头外）画一次，事先编译着色程式、上传模型与材质图，
   走进物件密集的地方时就不会临时准备而卡顿 */
function warmUp(){
  const list=[];scene.traverse(o=>{if(o.frustumCulled){list.push(o);o.frustumCulled=false;}});
  renderer.compile(scene,camera);renderer.render(scene,camera);
  for(const o of list)o.frustumCulled=true;
}
/* 人物影子：方向背对太阳，长度依太阳高度；太阳越弱越淡 */
function updateActorShadows(){
  const s=lights.sun,vx=s.position.x-s.target.position.x,vy=Math.max(.1,s.position.y-s.target.position.y),vz=s.position.z-s.target.position.z;
  const h=Math.hypot(vx,vz)||1,len=Math.min(1.6,Math.max(.35,h/vy)),rot=Math.atan2(-vx,-vz);
  const op=(map.indoor?.24:.38)*Math.min(1,Math.max(.4,s.intensity/2.4));
  for(const a of [actors.player,...[...actors.markers.values()].map(m=>m.actor).filter(Boolean)]){const y=groundAt(a.g.position.x,a.g.position.z);
    a.pivot.position.y=y+.012;a.blob.position.y=y+.015;
    a.pivot.rotation.y=rot;a.shadow.scale.set(a.sprite.scale.x,len,1);a.shadow.material.opacity=op;}
}
/* 地面高度：街区的人行道（非车道）比路面高 0.1 格 */
let groundCells=null;
function groundAt(x,z){
  if(map.indoor||map.locationType!=='london')return 0;
  if(!groundCells||groundCells.map!==map){groundCells=new Map(map.cells.map(c=>[c.x+','+c.y,c]));groundCells.map=map;}
  const c=groundCells.get(Math.floor(x)+','+Math.floor(z));
  return c&&c.active&&!c.core?.1:0;
}
/* ---------- 迷雾：未探索的地方盖上暗色 ----------
   用深度图算出每个像素在地面上的位置，查「已探索」遮罩：建物、树、家具和地面都用同一条规则，
   不必逐一隐藏物件。遮罩每格一个值，格与格之间平滑内插并加杂讯，边缘柔和不方正。 */
const FOG_PAD=3;
const fogNoise=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=makeRng(7177);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){const v=r()*255|0;g.fillStyle=`rgb(${v},${v},${v})`;g.fillRect(x,y,1,1);}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.generateMipmaps=false;t.minFilter=t.magFilter=THREE.LinearFilter;t.colorSpace=THREE.NoColorSpace;return t;})();
const fog={tex:null,cur:null,want:null,w:0,h:0,animating:false};
class ShroudPass extends ShaderPass{
  render(r,write,read,dt,mask){this.uniforms.tDepth.value=read.depthTexture;
    this.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);this.uniforms.uCamWorld.value.copy(camera.matrixWorld);super.render(r,write,read,dt,mask);}
}
const shroud=new ShroudPass({uniforms:{tDiffuse:{value:null},tDepth:{value:null},uMask:{value:null},uNoise:{value:fogNoise},uProjInv:{value:new THREE.Matrix4()},uCamWorld:{value:new THREE.Matrix4()},
    uRect:{value:new THREE.Vector4(0,0,1,1)},uColor:{value:new THREE.Color(0x0b0a09)},uOn:{value:1},uWet:{value:0},uSnow:{value:0},uSnowLit:{value:.6},uSky:{value:new THREE.Color()}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform sampler2D tDiffuse,tDepth,uMask,uNoise;uniform mat4 uProjInv,uCamWorld;uniform vec4 uRect;uniform vec3 uColor,uSky;uniform float uOn,uWet,uSnow,uSnowLit;varying vec2 vUv;
    void main(){vec4 c=texture2D(tDiffuse,vUv);float z=texture2D(tDepth,vUv).x;
      if(uOn<.5||z>=1.){gl_FragColor=c;return;}
      vec4 v=uProjInv*vec4(vUv*2.-1.,z*2.-1.,1.);v/=v.w;vec3 w=(uCamWorld*v).xyz;
      vec2 q=(floor(w.xz*16.)+.5)/16.;
      float m=texture2D(uMask,(q-uRect.xy)/uRect.zw).r;
      float n=(texture2D(uNoise,q*.012).r-.5)*.4+(texture2D(uNoise,q*.25).r-.5)*.16;
      float s=1.-smoothstep(.4,.62,m+n);
      // 积水与积雪：由相邻像素的位置算出表面朝向，只处理朝上的面（地面、屋顶、桌面）；立绘接近直立，不受影响
      if(uWet>.001||uSnow>.001){
        float up=smoothstep(.55,.8,abs(normalize(cross(dFdx(w),dFdy(w))).y));   // 斜屋顶约 .7，也算朝上
        float big=texture2D(uNoise,q*.015).r,fine=texture2D(uNoise,q*.5).r;
        if(uWet>.001){c.rgb*=1.-.28*uWet*up;
          float pud=smoothstep(.56,.64,big+(fine-.5)*.06)*up*uWet;c.rgb=mix(c.rgb,c.rgb*.55+uSky*.12,pud*.8);}
        if(uSnow>.001){float cover=up*smoothstep(0.,.12,uSnow*1.15-(1.-big)*.6-(fine-.5)*.15),l=dot(c.rgb,vec3(.299,.587,.114));
          c.rgb=mix(c.rgb,vec3(.86,.9,.95)*clamp(max(l*2.4,uSnowLit),.05,1.4),cover*.92);}   // 深色屋顶上的雪不会跟着变黑；最低亮度依时段
      }
      gl_FragColor=vec4(mix(c.rgb,uColor,s*.93),c.a);}`});
composer.insertPass(shroud,2);
function fogInit(){
  fog.w=map.cols+FOG_PAD*2;fog.h=map.rows+FOG_PAD*2;fog.cur=new Float32Array(fog.w*fog.h);fog.want=new Float32Array(fog.w*fog.h);
  if(fog.tex)fog.tex.dispose();
  fog.tex=new THREE.DataTexture(new Uint8Array(fog.w*fog.h*4),fog.w,fog.h,THREE.RGBAFormat);fog.tex.magFilter=fog.tex.minFilter=THREE.LinearFilter;
  shroud.uniforms.uMask.value=fog.tex;shroud.uniforms.uRect.value.set(-FOG_PAD,-FOG_PAD,fog.w,fog.h);
}
/* 已探索：走过或看过的格子；同一物件只要有一格被看见就整个显示；
   地图外与墙、林缘这些不能走的格子，旁边一格有已探索地面就跟着显示 */
function fogTarget(st,all){
  const seen=new Uint8Array(map.cols*map.rows);
  for(const c of map.cells)if(all?c.active:st.cells[c.id].seen)seen[c.id]=1;
  for(const o of map.objects)if(o.ids&&o.ids.some(id=>seen[id]))for(const id of o.ids)seen[id]=1;
  for(let y=0;y<fog.h;y++)for(let x=0;x<fog.w;x++){
    const cx=x-FOG_PAD,cy=y-FOG_PAD,inside=cx>=0&&cy>=0&&cx<map.cols&&cy<map.rows;let v=inside&&seen[cy*map.cols+cx]?1:0;
    if(!v&&!(inside&&map.cells[cy*map.cols+cx].active))
      for(let dy=-1;dy<=1&&!v;dy++)for(let dx=-1;dx<=1;dx++){const nx=cx+dx,ny=cy+dy;if(nx>=0&&ny>=0&&nx<map.cols&&ny<map.rows&&seen[ny*map.cols+nx]&&map.cells[ny*map.cols+nx].active){v=1;break;}}
    fog.want[y*fog.w+x]=v;
  }
  fog.animating=true;
}
function fogStep(dt,snap){
  if(!fog.animating)return;let busy=false;const d=fog.tex.image.data,k=snap?1:Math.min(1,dt*5);
  for(let i=0;i<fog.cur.length;i++){const a=fog.cur[i],b=fog.want[i];let v=a+(b-a)*k;if(Math.abs(b-v)<.01)v=b;else busy=true;fog.cur[i]=v;d[i*4]=v*255;}
  fog.tex.needsUpdate=true;fog.animating=busy;
}

/* ---------- 游戏接口 ----------
   探索页（exploration-45 的规则与介面）透过 create() 取得画面物件，方法与 2D 版 ExplorationGeneratedScene 相同。 */
let host=null,game={state:null,travel:null,map:null},rafId=0,visible=true,overviewMode=false,motionEnabled=true;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const moveOK=()=>motionEnabled&&!reduced.matches;
function generateMap(){map=game.map;state.type=map.locationType;return map;}

/* 主角、敌人、事件标记 */
/* 走路动画：2D 版的 walk.webp 是浏览器自己播放的动图，贴到 WebGL 只读得到第一格。
   建置时拆成横排的连续格图（exploration-3d/build.py 产生，数据在 window.ExplorationScene3DWalk），
   这里依时间切换格子；最后一步后 300ms 回到站姿（同 2D 版）。减少动态效果时不播放。 */
const WALK=window.ExplorationScene3DWalk||null;
let walkMat=null,walkUntil=0;
function walkMaterial(){
  if(!WALK)return null;
  if(!walkMat){walkMat=spriteMat(new URL(WALK.src,document.baseURI).href);walkMat.map.repeat.set(1/WALK.frames,1);}
  return walkMat;
}
function setPose(a,walk,t){
  const m=walk?walkMaterial():a.poster;if(!m)return;
  if(a.sprite.material!==m){a.sprite.material=m;a.shadow.material.map=m.map;}
  if(walk)m.map.offset.x=(Math.floor(t*1000/WALK.ms)%WALK.frames)/WALK.frames;
  syncOutline(a);
}
function buildActors(){
  const cat=window.ExplorationActorAssets,entry=cat.player,img=cat.images[entry.poster],[ax,ay]=entry.anchor||[.5,1];
  const W=.82,H=1.2,player=makeActor(img.src,W,H);
  player.sprite.geometry.translate(-(ax-.5)*W,-(1-ay)*H,0);player.mirror=entry.mirror?-1:1;player.face=1;player.poster=player.sprite.material;walkMaterial();
  const ring=mesh(new THREE.RingGeometry(.3,.35,28),new THREE.MeshBasicMaterial({color:0xeed299,transparent:true,opacity:.75,depthWrite:false}),{cast:false,receive:false});
  ring.rotation.x=-Math.PI/2;world.add(ring);
  const dots=new THREE.InstancedMesh(new THREE.CircleGeometry(.07,8).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xe5cf94,transparent:true,opacity:.85,depthWrite:false}),160);
  dots.count=0;dots.frustumCulled=false;world.add(dots);
  const at=game.state?game.state.player.at:map.spawn,s=cellCenter(at);
  actors={player,ring,dots,markers:new Map(),cell:at};
  player.g.position.set(s.x,0,s.z);faceActor(player,1);camTarget.set(s.x,0,s.z);
}
function faceActor(a,dir){a.face=dir;a.sprite.scale.x=dir*(a.mirror||1);}
const GEM=new THREE.OctahedronGeometry(.1);
function makeMarker(kind){
  const cat=window.ExplorationActorAssets,g=new THREE.Group();let actor=null;
  if(kind==='enemy'){const img=cat.images[cat.mapEnemy];
    if(img){const h=1.15,w=h*img.width/img.height;actor=makeActor(img.src,w,h);actor.mirror=1;addOutline(actor,w,h,0xff6a3a,.035);syncOutline(actor);}}   // makeActor 已放进 world；放大并加暖红外框，暗处也认得出
  const gem=new THREE.Mesh(GEM,new THREE.MeshBasicMaterial({color:kind==='enemy'?0xff9a6a:0xf2d68e,toneMapped:false}));
  const gemY=kind==='enemy'?1.36:.62;gem.position.y=gemY;gem.scale.setScalar(kind==='enemy'?1.15:1.5);g.add(gem);
  const halo=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:T.glow,color:kind==='enemy'?0xd8653a:0xe8c070,transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending}));
  halo.rotation.x=-Math.PI/2;halo.position.y=.03;halo.scale.setScalar(kind==='enemy'?1.05:1.1);g.add(halo);
  world.add(g);return {g,actor,gem,halo,kind,gemY};
}
function syncMarkers(st){
  for(const c of st.cells){
    if(c.kind!=='enemy'&&c.kind!=='event'&&!actors.markers.has(c.id))continue;
    const v=host.rules.tileView(st,c.id),kind=v.kind==='enemy'||v.kind==='event'?v.kind:'';
    let m=actors.markers.get(c.id);
    if(m&&m.kind!==kind){world.remove(m.g);if(m.actor)world.remove(m.actor.g);actors.markers.delete(c.id);m=null;}
    if(kind&&!m){m=makeMarker(kind);const p=cellCenter(c.id);m.g.position.set(p.x,0,p.z);if(m.actor)m.actor.g.position.set(p.x,0,p.z);actors.markers.set(c.id,m);}
  }
}
function syncRoute(st,travel){
  const d=actors.dots,M=new THREE.Matrix4();let n=0;
  if(!overviewMode&&travel&&travel.path){let prev=cellCenter(st.player.at);
    for(const id of travel.path){if(!st.cells[id].seen)break;const c=cellCenter(id);
      for(let k=1;k<=3&&n<d.instanceMatrix.count;k++){M.makeTranslation(prev.x+(c.x-prev.x)*k/3,.03,prev.z+(c.z-prev.z)*k/3);d.setMatrixAt(n++,M);}prev=c;}}
  d.count=n;d.instanceMatrix.needsUpdate=true;
}

/* ---------- 镜头 ---------- */
const camTarget=new THREE.Vector3();
let viewCells=7.5;
function resize(){
  if(!host)return;const w=Math.max(1,host.board.clientWidth),h=Math.max(1,host.board.clientHeight);
  renderer.setSize(w,h,false);composer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();
  viewCells=Math.max(6,Math.min(13,w/72));
  const pr=renderer.getPixelRatio();tiltH.uniforms.h.value=1.6/(w*pr);tiltV.uniforms.v.value=1.6/(h*pr);
}
function placeCamera(snap){
  const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanH=tanV*camera.aspect;let dist,want;
  if(overviewMode){
    dist=Math.max((map.cols+1)/2/tanH,(map.rows+1)*Math.sin(ELEV)/2/tanV*1.05);
    want=new THREE.Vector3(map.cols/2,0,map.rows/2+.4);
  }else{
    const halfW=viewCells/2;dist=halfW/tanH;
    const halfD=viewCells/camera.aspect/2/Math.sin(ELEV)*.85,P=actors.player.g.position;
    const clamp=(v,a,b)=>a>b?(a+b)/2:Math.min(b,Math.max(a,v));
    want=new THREE.Vector3(clamp(P.x,halfW-.5,map.cols-halfW+.5),0,clamp(P.z-1.2,halfD-1.5,Math.max(map.rows-halfD+.5,P.z-halfD*.45)));
  }
  camTarget.lerp(want,snap?1:.08);
  camera.position.set(camTarget.x,camTarget.y+Math.sin(ELEV)*dist+.6,camTarget.z+Math.cos(ELEV)*dist);
  camera.lookAt(camTarget.x,.6,camTarget.z);
  const far=Math.max(200,dist*3);if(camera.far!==far){camera.far=far;camera.updateProjectionMatrix();}
  if(scene.fog){scene.fog.near=dist*1.05;scene.fog.far=dist*2.6;}
}

/* ---------- 每一帧 ---------- */
const ray=new THREE.Raycaster(),groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
const clock=new THREE.Clock();
function running(){const st=game.state;return !!host&&!host.disposed&&visible&&!document.hidden&&!!st&&(st.phase==='explore'||st.phase==='event');}
function schedule(){if(!rafId&&running()){clock.getDelta();rafId=requestAnimationFrame(tick);}}
function tick(){
  rafId=0;if(!running())return;
  const dt=Math.min(clock.getDelta(),.05),t=clock.elapsedTime;
  const P=actors.player.g.position,c=cellCenter(game.state.player.at),dx=c.x-P.x,dz=c.z-P.z,d=Math.hypot(dx,dz);let moving=false;
  if(d>.001){
    if(!moveOK()||d>1.6){P.x=c.x;P.z=c.z;}
    else{const sp=4.2*dt;moving=true;if(Math.abs(dx)>.01)faceActor(actors.player,dx<0?-1:1);if(d<=sp){P.x=c.x;P.z=c.z;}else{P.x+=dx/d*sp;P.z+=dz/d*sp;}}
  }
  const now=performance.now();if(moving)walkUntil=now+300;
  setPose(actors.player,!!WALK&&moveOK()&&now<walkUntil,t);
  actors.player.sprite.position.y=moving&&!WALK?Math.abs(Math.sin(t*12))*.06:0;   // 没有走路图时才用上下晃动代替
  actors.ring.position.set(P.x,groundAt(P.x,P.z)+.02,P.z);lights.lantern.position.set(P.x,1.7,P.z+.9);actors.ring.visible=!overviewMode;
  for(const m of actors.markers.values()){m.gem.position.y=m.gemY+(moveOK()?Math.sin(t*2.4+m.g.position.x)*.04:0);if(moveOK())m.gem.rotation.y=t*1.2;}
  // 挡在主角前面的建物变半透明
  if(fadeables.length){
    const head=new THREE.Vector3(P.x,.7,P.z),dir=head.clone().sub(camera.position),len=dir.length();ray.set(camera.position,dir.normalize());ray.far=len-.3;
    const hit=overviewMode?new Set():new Set(ray.intersectObjects(fadeables,false).map(h=>h.object.parent));
    for(const o of fadeables)o.parent.userData.fade=hit.has(o.parent)?.28:1;
    const seen=new Set();for(const o of fadeables){const g=o.parent;if(seen.has(g))continue;seen.add(g);setGroupOpacity(g,g.userData.fade??1);}
  }
  placeCamera(false);
  if(updateSun(false))renderer.shadowMap.needsUpdate=true;
  updateActorShadows();updateLightPool(dt,t);fogStep(dt,false);stepWeather(dt);
  for(const f of flames)f.tex.offset.x=(Math.floor(t*11+f.phase)%4)/4;
  renderer.info.reset();composer.render();
  rafId=requestAnimationFrame(tick);
}

/* ---------- 点地面：换算成格子，交给原本的格子按钮处理（是否可走、寻路、事件都沿用规则） ---------- */
let press=null;
function onDown(e){if(e.target!==renderer.domElement||e.button>0)return;press={x:e.clientX,y:e.clientY,t:performance.now(),id:e.pointerId};}
function onUp(e){
  const p=press;press=null;if(!p||p.id!==e.pointerId||!host||overviewMode)return;
  if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>10||performance.now()-p.t>600)return;
  const r=renderer.domElement.getBoundingClientRect(),v=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);
  ray.setFromCamera(v,camera);ray.far=Infinity;const q=new THREE.Vector3();if(!ray.ray.intersectPlane(groundPlane,q))return;
  const x=Math.floor(q.x),y=Math.floor(q.z);if(x<0||y<0||x>=map.cols||y>=map.rows)return;
  const b=host.buttons.get(y*map.cols+x);if(b&&!b.disabled)b.click();
}

/* ---------- 时段：游戏的 hour 对应到三种光线（清晨用黄昏的暖光） ---------- */
/* ---------- 雨雪 ----------
   降水：镜头附近一个箱子范围内的雨丝（线段）与雪片（点）。位置在着色器里依时间算，不必每帧更新数据；
   镜头移动时粒子在箱子里循环，看起来一直在下。积水、积雪在迷雾那一步处理（见上方 ShroudPass）。 */
const PRECIP={box:new THREE.Vector3(20,8,20),t:0,rain:null,snow:null};
function precipMesh(snow){
  const N=snow?520:760,per=snow?1:2,seed=new Float32Array(N*per*4),end=new Float32Array(N*per),r=makeRng(snow?77:78);
  for(let i=0;i<N;i++){const a=[r(),r(),r(),r()];for(let k=0;k<per;k++){seed.set(a,(i*per+k)*4);end[i*per+k]=k;}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*per*3),3));
  g.setAttribute('seed',new THREE.BufferAttribute(seed,4));g.setAttribute('endp',new THREE.BufferAttribute(end,1));
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
    uniforms:{uT:{value:0},uC:{value:new THREE.Vector3()},uBox:{value:PRECIP.box},uColor:{value:new THREE.Color(snow?0xf1f4e8:0xb5d0d1)},uPx:{value:1}},
    vertexShader:`attribute vec4 seed;attribute float endp;uniform float uT,uPx;uniform vec3 uC,uBox;varying float vA;
      void main(){
        float sp=${snow?'.55+seed.w*.5':'11.+seed.w*4.'};
        vec3 drift=${snow?'vec3(sin(uT*.7+seed.w*6.28)*.35,0.,cos(uT*.5+seed.z*6.28)*.25)':'vec3(-uT*sp*.18,0.,0.)'};
        vec3 p;
        p.y=uBox.y-mod(seed.y*uBox.y+uT*sp,uBox.y);
        p.x=uC.x-uBox.x*.5+mod(seed.x*uBox.x+drift.x-uC.x+uBox.x*.5,uBox.x);
        p.z=uC.z-uBox.z*.5+mod(seed.z*uBox.z+drift.z-uC.z+uBox.z*.5,uBox.z);
        ${snow?'':'p+=endp*vec3(.07,.42,0.);'}
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        vA=${snow?'.45+seed.w*.4':'.22+seed.w*.3'};
        ${snow?'gl_PointSize=max(1.5,(1.+seed.z*1.6)*uPx*30./-mv.z);':''}
      }`,
    fragmentShader:`uniform vec3 uColor;varying float vA;void main(){${snow?'vec2 d=gl_PointCoord-.5;if(dot(d,d)>.25)discard;':''}gl_FragColor=vec4(uColor,vA);}`});
  const o=snow?new THREE.Points(g,m):new THREE.LineSegments(g,m);o.frustumCulled=false;o.renderOrder=5;return o;
}
/* 天气：降水显示、雨雪天阳光变弱（阴天）、积水与积雪的程度 */
function syncWeather(){
  if(!host||!scene)return;const e=host.env.get();
  if(!PRECIP.rain){PRECIP.rain=precipMesh(false);PRECIP.snow=precipMesh(true);}
  for(const o of [PRECIP.rain,PRECIP.snow])if(o.parent!==scene)scene.add(o);
  PRECIP.rain.visible=e.weather==='rain';PRECIP.snow.visible=e.weather==='snow';
  if(e.weather!=='clear'){lights.sun.intensity*=.5;lights.hemi.intensity*=1.18;}
  const u=shroud.uniforms;u.uWet.value=e.wetness;u.uSnow.value=e.snow;u.uSnowLit.value={day:.62,dusk:.38,night:.16}[state.time];u.uSky.value.set(TIMES[state.time].hemi[0]);
}
function stepWeather(dt){
  if(!PRECIP.rain||!host)return;const e=host.env.get();
  if(moveOK()&&e.motion)PRECIP.t+=dt;   // 关闭降水动态或减少动态效果时停在原处
  const px=renderer.getPixelRatio()*Math.max(.6,host.board.clientHeight/500);
  for(const o of [PRECIP.rain,PRECIP.snow]){const u=o.material.uniforms;u.uT.value=PRECIP.t;u.uC.value.copy(camTarget);u.uPx.value=px;}
}
function timeFromEnv(e){const p=SceneEnvironment.period(e.hour);return p==='night'?'night':p==='day'?'day':'dusk';}
function syncTime(){if(!host)return;state.time=timeFromEnv(host.env.get());if(!scene)return;applyTime();syncWeather();   // 时段与天气都会改光线，一起重算
  shroud.uniforms.uColor.value.set(TIMES[state.time].bg).multiplyScalar(.7);}

function newMap(st){
  game.map=st.sceneMap;flames.length=0;state.time=timeFromEnv(host.env.get());build();
  renderer.shadowMap.needsUpdate=true;renderPass.scene=scene;pixelPass.scene=scene;applyFx();fogInit();syncTime();
  host.board.dataset.locationType=map.locationType;
  host.buttons.forEach(b=>b.remove());host.buttons.clear();host.fogKey='';
  for(const c of map.cells){if(!c.active||c.blocked)continue;
    const b=document.createElement('button');b.type='button';b.className='scene45-hit scene3d-hit';b.dataset.tile=c.id;b.tabIndex=-1;host.board.append(b);host.buttons.set(c.id,b);}
  resize();placeCamera(true);updateSun(true);warmUp();
}

function render(next,nextTravel){
  if(!host||host.disposed||!next||!next.sceneMap)return;
  const changed=game.state!==next;game.state=next;game.travel=nextTravel;
  if(game.map!==next.sceneMap)newMap(next);
  if(changed)overviewMode=false;
  const st=next,R=host.rules,evShown=(R.eventsEnabled&&R.eventsEnabled())||st.eventLimit>0;
  host.overviewButton.textContent=overviewMode?'返回探索':'地景一览';host.overviewButton.setAttribute('aria-pressed',String(overviewMode));
  host.note.textContent=overviewMode?'完整地景 · 显示已发现的遭遇'+(evShown?'与事件':''):'点选地面前往 · 镜头随角色移动';
  host.board.setAttribute('aria-label',overviewMode?'完整地景预览，返回探索后可移动':'探索地图，点选已探索地面移动');
  syncMarkers(st);syncRoute(st,nextTravel);
  const key=(overviewMode?'all':'')+st.cells.filter(c=>c.seen).length;
  if(host.fogKey!==key){fogTarget(st,overviewMode);host.fogKey=key;if(host.firstFog){fogStep(0,true);host.firstFog=false;}}
  for(const [id,el] of host.buttons){
    const v=R.tileView(st,id),current=id===st.player.at,c=map.cells[id];
    el.disabled=overviewMode||!v.seen||st.phase!=='explore';el.tabIndex=current&&!el.disabled?0:-1;
    el.className='scene45-hit scene3d-hit'+(current?' is-current':v.kind==='enemy'||v.kind==='event'?' has-symbol':'');el.dataset.view=v.kind;
    el.setAttribute('aria-label',`${c.y+1} 排 ${c.x+1} 列，`+(current?'你的位置，点击停下'+(evShown?'或进入事件':''):v.kind==='enemy'?'敌人遭遇，点击前往交战':v.kind==='event'?'可选事件：'+v.name:v.seen?'可通行地面':'未探索'));
    if(current)el.setAttribute('aria-current','location');else el.removeAttribute('aria-current');
  }
  schedule();
}

/* 景深模糊（画面上下边缘的模糊）：只在试玩设定页切换（记在浏览器里）；玩家画面没有开关，预设关闭（2026-11-05 暂定）。
   设定页和游戏画面是同一网站的两个页面，设定页改了值，这里会收到 storage 通知并立刻套用。 */
const TILT_KEY='newcard.exploration.scene3d.tilt';
function tiltSaved(){try{return localStorage.getItem(TILT_KEY)==='on';}catch(_){return false;}}
function onStorage(e){if(e.key!==TILT_KEY&&e.key!==null)return;applyFx();if(scene&&actors&&host&&!host.disposed)composer.render();}
function create(options){
  if(host&&!host.disposed)host.api.dispose();
  const board=options.board;   // 手机版面会把一览按钮移到方向盘旁，按钮用 id 找
  const env=SceneEnvironment.controller();env.set(options.environment||{});motionEnabled=options.motionEnabled!==false;
  host={board,rules:options.rules,env,buttons:new Map(),overviewButton:document.getElementById('scene45-overview'),note:document.getElementById('scene45-view-note'),disposed:false,fogKey:'',firstFog:true};
  game={state:null,travel:null,map:null};overviewMode=false;
  board.classList.add('scene45','scene-generated','scene3d');board.dataset.elevation='44';board.style.setProperty('--scene-ratio','544 / 554');
  board.replaceChildren();const cv=renderer.domElement;cv.className='scene3d-canvas';cv.setAttribute('aria-hidden','true');board.append(cv);
  board.addEventListener('pointerdown',onDown);board.addEventListener('pointerup',onUp);board.addEventListener('pointercancel',()=>{press=null;});
  const ro=new ResizeObserver(()=>{resize();if(scene&&actors){placeCamera(true);composer.render();}}),
    io=new IntersectionObserver(en=>{visible=en[0].isIntersecting;schedule();});ro.observe(board);io.observe(board);
  const vis=()=>schedule();document.addEventListener('visibilitychange',vis);
  host.overviewButton.disabled=false;window.addEventListener('storage',onStorage);
  const api={
    render,stopMotion(){},syncMotion(){schedule();},
    setMotionEnabled(v){motionEnabled=!!v;},
    setEnvironment(v){const r=env.set(v);syncTime();return r;},getEnvironment(){return env.get();},
    isOverview(){return overviewMode;},
    setOverview(v){if(host.disposed||game.state?.phase!=='explore')return false;overviewMode=!!v;host.fogKey='';
      if(actors)placeCamera(true);render(game.state,game.travel);if(actors){updateSun(true);renderer.shadowMap.needsUpdate=true;}return true;},
    inspect(){return {generated:true,renderer:'webgl',elevation:44,projection:'perspective',playerCell:game.state?game.state.player.at:null,
      visibleCells:game.state?game.state.cells.filter(c=>c.seen).length:0,overview:overviewMode,environment:env.get(),time:state.time,
      drawCalls:renderer.info.render.calls,pose:actors&&actors.player.sprite.material===walkMat?'walk':'poster',tilt:tiltH.enabled,
      playerScreen:actors?(v=>({x:(v.x+1)/2,y:(1-v.y)/2}))(actors.player.g.position.clone().setY(.6).project(camera)):null,   // 主角在画面上的位置（0～1），检查用
area:map?SceneMap.audit(map):null,disposed:host.disposed};},
    dispose(){if(host.disposed)return;host.disposed=true;if(rafId)cancelAnimationFrame(rafId);rafId=0;ro.disconnect();io.disconnect();
      document.removeEventListener('visibilitychange',vis);window.removeEventListener('storage',onStorage);board.removeEventListener('pointerdown',onDown);board.removeEventListener('pointerup',onUp);
      env.dispose();host.buttons.forEach(b=>{b.disabled=true;});cv.remove();}
  };
  host.api=api;resize();return api;
}

Promise.all([loadFireplace(),loadKit(),loadWoodland(),loadFactory()]).finally(()=>{
  window.ExplorationScene3D={create};window.dispatchEvent(new Event('scene3d-ready'));
});
