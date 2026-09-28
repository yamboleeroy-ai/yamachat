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
  await page.waitForFunction(()=>window.__ycClientReady&&window.YamachatLegalUI&&!document.getElementById('app')?.classList.contains('hidden'),{},{timeout:15000});
  await page.waitForSelector('#ycGlobalNav',{state:'attached'});
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
      const visualOrder=await page.evaluate(()=>[...document.querySelectorAll('#ycV3NavActions>button')]
        .filter(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0})
        .sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)
        .map(el=>el.id));
      assert.equal(visualOrder[visualOrder.indexOf('ycLegalAboutBtn')+1],'logoutBtn','About must be visually directly above logout');
      await page.screenshot({path:path.join(__dirname,'legal-ui-screens','desktop-navigation-about.png'),fullPage:true});
      await page.evaluate(()=>window.YamachatLegalUI.open('about'));
      await page.waitForSelector('.yc-legal-shell');
      assert.equal(await page.locator('#ycLegalTitle').textContent(),'O aplikaci');
      assert.equal(await page.getByText('Digitálně podepsaná právní baseline – podpis ověřen',{exact:true}).count(),1);
      assert(inside(await page.locator('.yc-legal-shell').boundingBox(),1440,900));
      await page.screenshot({path:path.join(__dirname,'legal-ui-screens','desktop-about.png'),fullPage:true});
      await page.locator('[data-yc-legal-close]').click();
      await page.locator('#ycDeveloperDock').waitFor({state:'visible'});
      await page.locator('#ycDeveloperDock').click();
      await page.locator('.yc-developer-modal').waitFor({state:'visible'});
      assert(inside(await page.locator('.yc-developer-modal').boundingBox(),1440,900),'Developer modal must fit desktop viewport');
      assert.equal(await page.locator('.yc-dev-grid').locator('.yc-dev-info').count(),3,'Developer information grid must contain profile, contact and project only');
      assert.equal(await page.locator('.yc-dev-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),3,'Developer information grid must use three balanced desktop columns');
      assert.equal(await page.getByText('Věk',{exact:true}).count(),0,'Developer age must stay removed');
      await page.screenshot({path:path.join(__dirname,'legal-ui-screens','desktop-developer-contact.png'),fullPage:true});
      assert.deepEqual(errors,[]);
      await page.close();
    }

    {
      const {page,errors}=await boot(browser,390,844,true);
      await page.waitForSelector('#ycMobileNavBtn',{state:'visible'});
      await page.locator('#ycMobileNavBtn').click();
      await page.waitForFunction(()=>document.getElementById('ycGlobalNav')?.classList.contains('yc-mobile-open'));
      const about=page.locator('#ycLegalAboutBtn');
      await about.waitFor({state:'visible'});
      const visualOrder=await page.evaluate(()=>[...document.querySelectorAll('#ycV3NavActions>button')]
        .filter(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0})
        .sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)
        .map(el=>el.id));
      assert.equal(visualOrder[visualOrder.indexOf('ycLegalAboutBtn')+1],'logoutBtn','Mobile About must be visually directly above logout');
      await page.screenshot({path:path.join(__dirname,'legal-ui-screens','mobile-nav-about.png')});
      await about.click();
      await page.waitForSelector('.yc-legal-shell');
      assert.equal(await page.locator('#ycGlobalNav').evaluate(el=>el.classList.contains('yc-mobile-open')),false,'About must close mobile drawer');
      assert(inside(await page.locator('.yc-legal-shell').boundingBox(),390,844));
      assert.equal(await page.locator('.yc-legal-links-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
      const portraitFit=await page.evaluate(()=>{
        const body=document.getElementById('ycLegalBody'),hero=document.querySelector('.yc-legal-hero'),title=hero?.querySelector('h3'),sig=document.querySelector('.yc-legal-signature');
        const box=el=>{const r=el?.getBoundingClientRect();return r?{x:r.x,right:r.right,width:r.width}:null};
        return {body:{clientWidth:body?.clientWidth||0,scrollWidth:body?.scrollWidth||0},title:box(title),signature:box(sig),heading:title?.textContent||''};
      });
      assert(portraitFit.body.scrollWidth<=portraitFit.body.clientWidth+1,JSON.stringify(portraitFit));
      assert.equal(portraitFit.heading,'Yamachat');
      for(const b of [portraitFit.title,portraitFit.signature])assert(b&&b.x>=-1&&b.right<=391,JSON.stringify(portraitFit));
      await page.screenshot({path:path.join(__dirname,'legal-ui-screens','mobile-about-portrait.png')});
      await page.locator('[data-yc-legal-close]').click();
      await page.locator('#ycDeveloperDock').waitFor({state:'visible'});
      await page.locator('#ycDeveloperDock').click();
      await page.locator('.yc-developer-modal').waitFor({state:'visible'});
      const developerFit=await page.locator('.yc-developer-modal').evaluate(el=>({clientWidth:el.clientWidth,scrollWidth:el.scrollWidth}));
      assert(developerFit.scrollWidth<=developerFit.clientWidth+1,JSON.stringify(developerFit));
      assert.equal(await page.locator('.yc-dev-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1,'Developer grid must collapse to one mobile column');
      assert.equal(await page.locator('.yc-dev-send').evaluate(el=>Math.round(el.getBoundingClientRect().width)),await page.locator('.yc-dev-form').evaluate(el=>Math.round(el.getBoundingClientRect().width)),'Mobile send button must span the feedback form width');
      await page.screenshot({path:path.join(__dirname,'legal-ui-screens','mobile-developer-contact.png')});
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
      const landscapeFit=await page.locator('#ycLegalBody').evaluate(el=>({clientWidth:el.clientWidth,scrollWidth:el.scrollWidth}));
      assert(landscapeFit.scrollWidth<=landscapeFit.clientWidth+1,JSON.stringify(landscapeFit));
      await page.screenshot({path:path.join(__dirname,'legal-ui-screens','mobile-about-landscape.png')});
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
      await page.locator('#auth').waitFor({state:'visible'});
      await page.locator('[data-yc-auth-legal="terms"]').waitFor({state:'visible'});
      await page.screenshot({path:path.join(__dirname,'legal-ui-screens','mobile-login-legal-links.png')});
      assert.deepEqual(errors,[]);
      await page.close();
    }

    console.log('PASS legal UI visuals: legal UI, developer contact and login legal links fit desktop/mobile viewports.');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
