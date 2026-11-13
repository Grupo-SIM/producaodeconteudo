const {chromium}=require('playwright');(async()=>{const px=process.env.HTTPS_PROXY||process.env.https_proxy;
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'],proxy:px?{server:px,bypass:'localhost'}:undefined});
for(const n of process.argv.slice(2)){
 const c=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1920,height:1080},recordVideo:{dir:'vid-'+n,size:{width:1920,height:1080}}});
 const p=await c.newPage();p.on('pageerror',e=>console.log(n,e.message));await p.goto('http://localhost:8765/'+n+'.html');await p.waitForTimeout(8000);
 await p.screenshot({path:n+'.png'});await p.waitForTimeout(9000);await c.close();}
await b.close()})()
