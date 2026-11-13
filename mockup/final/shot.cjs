const {chromium}=require('playwright');(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
for(const n of ['01-fluxo','02-escritorio','03-mesa','04-editor-arte','05-editor-video','06-publicacao','07-marcas','08-produtos','09-otimizacao','10-cerebro']){
 const p=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:(n.match(/02|10/)?1:2)});p.on('pageerror',e=>console.log(n,e.message));await p.goto('file://'+process.cwd()+'/'+n+'.html');await p.waitForTimeout(n.match(/02|10/)?4000:900);try{await p.screenshot({path:n+'.png'})}catch(e){console.log('fail',n);await p.setViewportSize({width:1920,height:1080});}await p.close()}
await b.close()})()
