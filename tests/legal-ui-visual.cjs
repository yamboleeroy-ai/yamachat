const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mock=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

async function boot(browser,width,height,mobile=false){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block',hasTouch:mobile,isMobile:mobile});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname==='/vendor/supabase.js')return route.fulfill({contentType:'application/javascript',body:mock});
    const file=path.join(root,u.pathname==='/'?'index.html':decodeURIComponent(u.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8')});
    return route.fulfill({path:file});
  });
  await page.goto('http://127.0.0.1/');
  await page.waitForFunction(()=>window.__ycClientReady&&window.YamachatLegalUI,{},{timeout:15000});
  await page.waitForSelector('#ycGlobalNav',{state:'attached'});
  await page.evaluate(({mobile})=>{
    const auth=document.getElementById('auth'),app=document.getElementById('app');
    auth?.classList.add('hidden');auth?.style.setProperty('display','none','important');
    app?.classList.remove('hidden');app?.style.setProperty('display',mobile?'block':'grid','important');
  },{mobile});
  return {page,errors};
}
function inside(b,w,h){return b&&b.width>0&&b.height>0&&b.x>=-1&&b.y>=-1&&b.x+b.width<=w+1&&b.y+b.height<=h+1}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    fs.mkdirSync(path.join(__dirname,'legal-ui-screens'),{recursive:true});

    {
      const {page,errors}=await boot(browser,1440,900,false);
      const about=page.locator('#ycLegalAboutBtn');
      assert.equal(await about.locator('span').last().textContent(),'O aplikaci');
      const navState=await page.evaluate(()=>{
        const ids=['profileBtn','appSettingsBtn','ycServerSettingsNavBtn','ycLegalAboutBtn','logoutBtn'];
        const items=Object.fromEntries(ids.map(id=>{
          const el=document.getElementById(id),p=el?.parentElement;
          return [id,{exists:!!el,parentId:p?.id||'',parentClass:p?.className||'',siblings:[...(p?.children||[])].map(x=>x.id||x.className||x.tagName)}];
        }));
        return {items,userActionCount:document.querySelectorAll('.yc-v3-user-actions').length};
      });
      console.log('LEGAL-NAV-STATE '+JSON.stringify(navState));
      const aboutState=navState.items.ycLegalAboutBtn,logoutState=navState.items.logoutBtn;
      assert(aboutState.exists&&logoutState.exists,'About/logout missing from runtime DOM');
      assert.equal(aboutState.parentId||aboutState.parentClass,logoutState.parentId||logoutState.parentClass,'About and logout must share navigation container');
      const order=aboutState.siblings;
      assert(order.includes('ycLegalAboutBtn')&&order.includes('logoutBtn'),'About/logout missing from shared navigation');
      assert(order.indexOf('ycLegalAboutBtn')<order.indexOf('logoutBtn'),'About must be directly before logout in navigation order');
      await page.evaluate(()=>{
        const app=document.getElementById('app'),nav=document.getElementById('ycGlobalNav');
        app?.style.setProperty('display','grid','important');
        app?.style.setProperty('visibility','visible','important');
        nav?.style.setProperty('display','flex','important');
        nav?.style.setProperty('visibility','visible','important');
        nav?.style.setProperty('transform','none','important');
      });
      await page.screenshot({path:path.join(__dirname,'legal-ui-screens','desktop-navigation-about.png'),fullPage:true});
      await page.evaluate(()=>window.YamachatLegalUI.open('about'));
      await page.waitForSelector('.yc-legal-shell');
      assert.equal(await page.locator('#ycLegalTitle').textContent(),'O aplikaci');
      assert.equal(await page.getByText('Digitálně podepsaná právní baseline – podpis ověřen',{exact:true}).count(),1);
      assert(inside(await page.locator('.yc-legal-shell').boundingBox(),1440,900));
      await page.screenshot({path:path.join(__dirname,'legal-ui-screens','desktop-about.png'),fullPage:true});
      assert.deepEqual(errors,[]);
      await page.close();
    }

    {
      const {page,errors}=await boot(browser,390,844,true);
      const about=page.locator('#ycLegalAboutBtn');
      await page.evaluate(()=>{
        const app=document.getElementById('app'),nav=document.getElementById('ycGlobalNav');
        app?.style.setProperty('display','block','important');
        app?.style.setProperty('visibility','visible','important');
        nav?.classList.add('yc-mobile-open');
        if(nav)nav.inert=false;
        app?.classList.add('yc-mobile-drawer-open');
        nav?.style.setProperty('display','flex','important');
        nav?.style.setProperty('visibility','visible','important');
      });
      const order=await page.evaluate(()=>[...(document.getElementById('ycV3NavActions')?.children||[])].map(x=>x.id));
      assert(order.indexOf('ycLegalAboutBtn')>=0&&order.indexOf('ycLegalAboutBtn')<order.indexOf('logoutBtn'),'Mobile About must render above logout in final nav actions');
      await page.screenshot({path:path.join(__dirname,'legal-ui-screens','mobile-nav-about.png'),fullPage:true});
      await page.evaluate(()=>{
        document.getElementById('ycGlobalNav')?.classList.remove('yc-mobile-open');
        document.getElementById('app')?.classList.remove('yc-mobile-drawer-open');
        window.YamachatLegalUI.open('about');
      });
      await page.waitForSelector('.yc-legal-shell');
      assert(inside(await page.locator('.yc-legal-shell').boundingBox(),390,844));
      assert.equal(await page.locator('.yc-legal-links-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
      await page.screenshot({path:path.join(__dirname,'legal-ui-screens','mobile-about-portrait.png'),fullPage:true});
      assert.deepEqual(errors,[]);
      await page.close();
    }

    {
      const {page,errors}=await boot(browser,844,390,true);
      await page.evaluate(()=>window.YamachatLegalUI.open('about'));
      await page.waitForSelector('.yc-legal-shell');
      assert(inside(await page.locator('.yc-legal-shell').boundingBox(),844,390));
      assert.equal(await page.locator('.yc-legal-shell').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
      assert.equal(await page.locator('.yc-legal-links-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
      await page.screenshot({path:path.join(__dirname,'legal-ui-screens','mobile-about-landscape.png'),fullPage:true});
      assert.deepEqual(errors,[]);
      await page.close();
    }

    {
      const {page,errors}=await boot(browser,390,844,true);
      await page.evaluate(()=>{
        document.getElementById('app')?.classList.add('hidden');
        document.getElementById('auth')?.classList.remove('hidden');
      });
      assert.equal(await page.locator('[data-yc-auth-legal="terms"]').textContent(),'Podmínky');
      assert.equal(await page.locator('[data-yc-auth-legal="privacy"]').textContent(),'Soukromí');
      await page.screenshot({path:path.join(__dirname,'legal-ui-screens','mobile-login-legal-links.png'),fullPage:true});
      assert.deepEqual(errors,[]);
      await page.close();
    }

    console.log('PASS legal UI visuals: desktop, mobile portrait/landscape and login legal links fit the viewport.');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
