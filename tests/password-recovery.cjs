const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const jwt=()=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:'11111111-1111-4111-8111-111111111111',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),role:'authenticated',aud:'authenticated'})).toString('base64url'),'testsignature'].join('.');
for(const target of ['index.html','desktop-client-dist/desktop-client.html']){
 const html=fs.readFileSync(path.join(root,target),'utf8');
 for(const marker of ['id="ycForgotPassword"','id="ycPasswordRequestBack"','id="ycPasswordRequestEmail"',"sb.auth.resetPasswordForEmail(email",'E-mailový server odpovídá pomalu']) assert(html.includes(marker),target+' missing in-app recovery marker '+marker);
 assert(!html.includes('id="ycForgotPassword" href="https://yamachat.eu/reset-password.html" target="_blank"'),target+' still sends forgot-password request to external page');
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  for(const scenario of ['request','unknown','rate-limit','offline','reset','expired','weak','mismatch','invalid-type']){
   const page=await browser.newPage({viewport:{width:390,height:844}}),calls=[],errors=[];let updates=0;
   page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(()=>localStorage.setItem('existing-login','do-not-touch'));
   await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='bxjvmjdppmqgbxfcowpf.supabase.co'){
     const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST,PUT,GET,OPTIONS'}});
     const body=req.postDataJSON();calls.push({path:u.pathname,method:req.method(),body});
     if(scenario==='offline')return route.abort();
     let status=200,response={};
     if(u.pathname.endsWith('/recover')&&scenario==='rate-limit'){status=429;response={code:'over_email_send_rate_limit',msg:'Too many requests'}}
     if(u.pathname.endsWith('/verify')){
      if(scenario==='expired'){status=403;response={code:'otp_expired',msg:'Token has expired or is invalid'}}
      else response={access_token:jwt(),refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user:{id:'11111111-1111-4111-8111-111111111111',email:'test@example.com',aud:'authenticated'}};
     }
     if(u.pathname.endsWith('/user')){updates++;if(scenario==='weak'&&updates===1){status=422;response={code:'weak_password',msg:'Weak password'}}else response={id:'11111111-1111-4111-8111-111111111111',email:'test@example.com',aud:'authenticated'}}
     await new Promise(resolve=>setTimeout(resolve,30));
     return route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-expose-headers':'x-supabase-api-version','x-supabase-api-version':'2024-01-01'},body:JSON.stringify(response)});
    }
    if(u.hostname!=='yamachat.test')throw Error('Unexpected external request: '+u.origin);
    const file=path.join(root,decodeURIComponent(u.pathname));
    return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''});
   });
   const request=['request','unknown','rate-limit','offline'].includes(scenario);
   const url='https://yamachat.test/reset-password.html'+(request?'':'#token_hash='+'a'.repeat(64)+'&type='+(scenario==='invalid-type'?'signup':'recovery'));
   await page.goto(url);await page.waitForFunction(()=>window.supabase?.createClient);await page.waitForTimeout(75);
   assert.equal(calls.length,0,'Opening an email must not consume its token');
   assert.equal(new URL(page.url()).hash,'');
   if(request){
    await page.locator('#recoveryEmail').fill(scenario==='unknown'?'unknown@example.com':'test@example.com');
    await page.evaluate(()=>{document.getElementById('requestSubmit').click();document.getElementById('requestSubmit').click()});
    await page.waitForFunction(()=>!document.getElementById('requestSubmit').disabled);
    assert.equal(calls.length,1);assert.equal(calls[0].body.email,scenario==='unknown'?'unknown@example.com':'test@example.com');
    const text=await page.locator('#recoveryStatus').innerText();
    if(scenario==='rate-limit')assert.match(text,/Příliš mnoho/);else if(scenario==='offline')assert.match(text,/připojit/);else assert.match(text,/Pokud k této adrese existuje účet/);
   }else if(scenario==='invalid-type'){assert(await page.locator('#passwordForm').isHidden());assert(await page.locator('#retryLink').isVisible())}
   else{
    await page.locator('#newPassword').fill('ExamplePassword123!');await page.locator('#confirmNewPassword').fill(scenario==='mismatch'?'DifferentPassword123!':'ExamplePassword123!');
    await page.evaluate(()=>{document.getElementById('passwordSubmit').click();document.getElementById('passwordSubmit').click()});
    await page.waitForFunction(()=>!document.getElementById('passwordSubmit').disabled);
    if(scenario==='mismatch'){assert.equal(calls.length,0);assert.match(await page.locator('#recoveryStatus').innerText(),/neshodují/)}
    else if(scenario==='expired'){assert.equal(calls.filter(c=>c.path.endsWith('/user')).length,0);assert(await page.locator('#retryLink').isVisible())}
    else {
     if(scenario==='weak'){assert.match(await page.locator('#recoveryStatus').innerText(),/nesplňuje/);await page.locator('#passwordSubmit').click();await page.waitForFunction(()=>!document.getElementById('passwordSubmit').disabled)}
     assert.equal(calls.filter(c=>c.path.endsWith('/verify')).length,1);assert.equal(calls.find(c=>c.path.endsWith('/verify')).body.type,'recovery');assert.match(await page.locator('#recoveryStatus').innerText(),/Heslo bylo změněno/);assert(await page.locator('#passwordForm').isHidden());
    }
   }
   assert.equal(await page.evaluate(()=>localStorage.getItem('existing-login')),'do-not-touch');
   assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),['existing-login']);
   assert.deepEqual(errors,[]);await page.close();console.log('PASS recovery:',scenario);
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
