const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {createPortalServer}=require('../preview/server.cjs');
(async()=>{
 const server=createPortalServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:393,height:852}});
  await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  const page=await context.newPage();await page.goto(origin+'/?v=20#stazeni');
  await page.getByText('Offline rozcestník je připravený.',{exact:false}).waitFor();
  await context.setOffline(true);
  await page.goto(origin+'/?v=20#domu');
  await page.getByRole('heading',{name:'Tvůj prostor. Tvoje aplikace.'}).waitFor();
  await page.reload();
  await page.getByRole('heading',{name:'Tvůj prostor. Tvoje aplikace.'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Otevřít v Portalu →'}).count(),1);
  await page.getByRole('link',{name:'◉ Můj profil'}).click();
  await page.getByRole('heading',{name:'Přihlášení do Yamaportalu'}).waitFor();
  console.log('PASS: real Chromium mobile viewport, prepared worker, offline navigation, reload and public account entry. No live credentials or services used.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
