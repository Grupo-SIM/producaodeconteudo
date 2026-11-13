const {chromium}=require('playwright');(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
for(const n of process.argv.slice(2)){
 const c=await b.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:'vid-'+n,size:{width:1920,height:1080}}});
 const p=await c.newPage();p.on('pageerror',e=>console.log(n,e.message));await p.goto('file://'+process.cwd()+'/'+n+'.html');await p.waitForTimeout(3000);
 await p.screenshot({path:n+'.png'});await p.waitForTimeout(9000);await c.close();}
await b.close()})()
