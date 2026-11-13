const {chromium}=require('playwright');(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
for(const c of ['ny','dubai','cyber'])for(const tv of ['1','0']){const n=`esc-${c}-${tv=='1'?'telao':'sem'}`;
 const ctx=await b.newContext({viewport:{width:1920,height:1080},recordVideo:process.argv[2]?{dir:'vid-'+n,size:{width:1920,height:1080}}:undefined});
 const p=await ctx.newPage();p.on('pageerror',e=>console.log(n,e.message));p.setDefaultTimeout(90000);await p.goto('file://'+process.cwd()+`/escritorio-cidade.html?cidade=${c}&tv=${tv}`);await p.waitForTimeout(5000);
 try{await p.screenshot({path:n+'.png'})}catch(e){console.log('fail',n)}if(process.argv[2])await p.waitForTimeout(8000);await ctx.close()}
await b.close()})()
