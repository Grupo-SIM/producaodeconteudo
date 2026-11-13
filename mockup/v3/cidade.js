// Penthouse + cidade. Lê ?cidade=ny|dubai|cyber e ?tv=0|1
(function(){
const q=new URLSearchParams(location.search);const C=q.get('cidade')||'ny';const TV=q.get('tv')!=='0';
const TH={ny:{sky:['#0d1a3a','#3a4f8a','#f0a25a'],win:['#ffd89a','#fff2cc','#9fc7ff'],bld:0x1a2030,fog:0x33405e,amb:0x8fb0ff,neon:null,name:'Nova York'},
 dubai:{sky:['#1a1030','#b5562e','#ffcf7a'],win:['#ffe0a0','#ffffff','#ffc070'],bld:0x2a2420,fog:0x8a5a3a,amb:0xffc890,neon:null,name:'Dubai'},
 cyber:{sky:['#05010f','#2a0640','#8a1a6a'],win:['#ff3ad0','#2af0ff','#ffd23a'],bld:0x0c0a18,fog:0x2a0a3a,amb:0xb06aff,neon:[0xff2ad0,0x22e6ff,0xffd23a,0x7a5cff],name:'China cyberpunk'}}[C];
// céu
const sc=document.createElement('canvas');sc.width=16;sc.height=512;const g=sc.getContext('2d');const gr=g.createLinearGradient(0,0,0,512);gr.addColorStop(0,TH.sky[0]);gr.addColorStop(.55,TH.sky[1]);gr.addColorStop(.8,TH.sky[2]);gr.addColorStop(1,TH.sky[2]);g.fillStyle=gr;g.fillRect(0,0,16,512);
const sky=new THREE.Mesh(new THREE.SphereGeometry(900,32,16),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(sc),side:THREE.BackSide,fog:false}));sky.position.y=-150;S.add(sky);
S.background=null;S.fog=new THREE.Fog(TH.fog,220,800);
S.add(new THREE.AmbientLight(TH.amb,.25));
// janelas: textura
function winTex(){const c=document.createElement('canvas');c.width=64;c.height=256;const x=c.getContext('2d');x.fillStyle='#07080c';x.fillRect(0,0,64,256);
 for(let yy=4;yy<256;yy+=8)for(let xx=3;xx<64;xx+=8){if(Math.random()<.42){x.fillStyle=TH.win[Math.random()*TH.win.length|0];x.globalAlpha=.55+Math.random()*.45;x.fillRect(xx,yy,5,5)}}x.globalAlpha=1;
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t}
const texs=[winTex(),winTex(),winTex()];texs.forEach(t=>t.repeat.set(3,7));const MATS=texs.map(t=>new THREE.MeshStandardMaterial({color:TH.bld,emissive:0xffffff,emissiveMap:t,emissiveIntensity:C=='cyber'?1.1:.9,roughness:.6,metalness:.3}));
const city=new THREE.Group();S.add(city);const BASE=-260;
function tower(x,z,w,d,h,col){const m=MATS[Math.random()*3|0];
 const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);b.position.set(x,BASE+h/2,z);city.add(b);return b}
for(let i=0;i<380;i++){const a=Math.random()*Math.PI*2,r=60+Math.pow(Math.random(),.6)*420;const x=Math.cos(a)*r,z=Math.sin(a)*r;
 const h=60+Math.random()*150+(Math.random()<.08?90:0);tower(x,z,10+Math.random()*18,10+Math.random()*18,h,TH.bld)}
// marcos de cada cidade
if(C=='ny'){[[-70,-110],[60,-150],[-150,-40]].forEach(([x,z],i)=>{const b=tower(x*1.8,z*1.8,22,22,290+i*25,0x1c2234);const sp=new THREE.Mesh(new THREE.ConeGeometry(2.2,30,8),new THREE.MeshStandardMaterial({color:0xaab4c8,emissive:0xffe2a0,emissiveIntensity:.3}));sp.position.set(x*1.8,BASE+b.geometry.parameters.height+15,z*1.8);city.add(sp)})}
if(C=='dubai'){const x=-110,z=-300;let y=BASE,w=40;for(let k=0;k<10;k++){const h=48-k*2;const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,w),new THREE.MeshStandardMaterial({color:0x8a8a92,metalness:.8,roughness:.25,emissive:0xffd9a0,emissiveMap:texs[0],emissiveIntensity:.6}));b.position.set(x,y+h/2,z);city.add(b);y+=h;w*=.8}
 const sp=new THREE.Mesh(new THREE.ConeGeometry(2,110,8),new THREE.MeshStandardMaterial({color:0xcfd3dc,metalness:.9}));sp.position.set(x,y+55,z);city.add(sp);
 const sea=new THREE.Mesh(new THREE.PlaneGeometry(1800,600),new THREE.MeshStandardMaterial({color:0x1a3a5a,metalness:.9,roughness:.15}));sea.rotation.x=-Math.PI/2;sea.position.set(0,BASE+2,420);city.add(sea);
 [[90,-120],[150,-60]].forEach(([x,z])=>{const s=new THREE.Mesh(new THREE.CylinderGeometry(9,14,230,6),new THREE.MeshStandardMaterial({color:0x5a5a66,metalness:.7,emissive:0xffcc88,emissiveMap:texs[1],emissiveIntensity:.5}));s.position.set(x*2,BASE+80,z*2);city.add(s)})}
const anim=[];
if(C=='cyber'){for(let i=0;i<70;i++){const a=Math.random()*Math.PI*2,r=50+Math.random()*200;const col=TH.neon[i%4];
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(6+Math.random()*12,16+Math.random()*30),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.85,fog:false,side:THREE.DoubleSide}));sign.position.set(Math.cos(a)*(r*1.6),-150+Math.random()*110,Math.sin(a)*(r*1.6));sign.lookAt(0,sign.position.y,0);city.add(sign);anim.push({sign,ph:Math.random()*6})}
 for(let i=0;i<40;i++){const car=new THREE.Mesh(new THREE.BoxGeometry(4,1.4,2),new THREE.MeshBasicMaterial({color:TH.neon[i%4],fog:false}));city.add(car);anim.push({car,r:80+Math.random()*220,y:-10-Math.random()*60,sp:(Math.random()<.5?-1:1)*(.05+Math.random()*.08),a:Math.random()*6})}
 const holo=new THREE.Mesh(new THREE.TorusGeometry(40,2,8,60),new THREE.MeshBasicMaterial({color:0x22e6ff,transparent:true,opacity:.6,fog:false}));holo.position.set(-80,10,-260);city.add(holo);anim.push({holo})}
// janelas de vidro do penthouse
const glass=new THREE.MeshStandardMaterial({color:0x9fc4ff,transparent:true,opacity:.08,metalness:.9,roughness:.05});
const mull=M(0x2a2f3a);
function wall(len,axis){for(let k=-len/2;k<=len/2;k+=3.75){const m=new THREE.Mesh(new THREE.BoxGeometry(.18,9,.18),mull);axis=='z'?m.position.set(k,4.5,-11.2):m.position.set(-15.2,4.5,k);S.add(m)}
 const top=new THREE.Mesh(new THREE.BoxGeometry(axis=='z'?len:.3,.3,axis=='z'?.3:len),mull);axis=='z'?top.position.set(0,9,-11.2):top.position.set(-15.2,9,0);S.add(top);
 const p=new THREE.Mesh(new THREE.PlaneGeometry(len,9),glass);axis=='z'?p.position.set(0,4.5,-11.2):(p.position.set(-15.2,4.5,0),p.rotation.y=Math.PI/2);S.add(p)}
wall(30,'z');wall(22,'x');
// teto
const ceil=new THREE.Mesh(new THREE.BoxGeometry(30.4,.3,22.4),M(0x15171c));ceil.position.set(0,9.2,0);ceil.visible=false;S.add(ceil);
// telão on/off
if(!TV){frameM.visible=false;scr.visible=false;tvl.intensity=0;const w=document.getElementById('tvwrap');if(w)w.style.display='none';window.__noTV=true;
 S.children.filter(o=>o.geometry&&o.geometry.type=='BoxGeometry'&&o.position.z==-10.7&&Math.abs(o.position.x)==5).forEach(o=>o.visible=false)}
window.__city=function(t){anim.forEach(a=>{if(a.sign)a.sign.material.opacity=.6+Math.sin(t*3+a.ph)*.3;if(a.car){a.a+=a.sp*.05;a.car.position.set(Math.cos(a.a)*a.r,a.y,Math.sin(a.a)*a.r);a.car.rotation.y=-a.a}if(a.holo){a.holo.rotation.y=t*.5;a.holo.rotation.x=t*.2}})};
document.title='Escritório · '+TH.name;
const lab=document.createElement('div');lab.style.cssText='position:absolute;left:50%;top:22px;transform:translateX(-50%);z-index:4;background:#111113e0;border:1px solid #3a3220;color:#e9d29a;border-radius:999px;padding:6px 14px;font-size:12px';lab.textContent='Cenário: '+TH.name+(TV?' · com telão':' · sem telão');document.querySelector('.main').appendChild(lab);
})();
