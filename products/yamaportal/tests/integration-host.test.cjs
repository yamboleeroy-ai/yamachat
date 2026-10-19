const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
test('switching away and back keeps one iframe and never starts another auth client',async()=>{
 const nodes={};let frames=0,authCalls=0;const classes=new Set();const panel={hidden:false,classList:{contains:key=>classes.has(key),toggle(key,value){if(value)classes.add(key);else classes.delete(key);}},querySelector(selector){return nodes[selector]??=( {textContent:'',remove(){},setAttribute(){}});},append(){frames++;}};
 const location={hash:'#yamachat',origin:'http://localhost'};const body={classList:{add(){},remove(){},toggle(){}}};const document={body,fullscreenEnabled:false,createElement(tag){return tag==='section'?panel:{setAttribute(){},addEventListener(){}};},querySelector(){return {append(){}};},addEventListener(){}};
 const context={window:{},document,location,YamaAccountUI:{isSignedIn:()=>true,async init(){authCalls++;}},YamaPortalIntegration:{sharedClient(){return {};}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../preview/dist/module-host.js'),'utf8'),context);
 await Promise.all([context.window.YamaModuleHost.show(),context.window.YamaModuleHost.show(),context.window.YamaModuleHost.show()]);context.window.YamaModuleHost.expand(true);assert.equal(classes.has('module-expanded'),true);context.window.YamaModuleHost.hide();assert.equal(panel.hidden,true);assert.equal(classes.has('module-expanded'),false);await context.window.YamaModuleHost.show();assert.equal(frames,1);assert.equal(authCalls,3);assert.equal(panel.hidden,false);
});
test('isolated chat uses the same client and has an app-styled return control',()=>{const html=fs.readFileSync(path.join(__dirname,'../preview/dist/modules/yamachat/index.html'),'utf8');assert.match(html,/const sb=window.parent.YamaPortalIntegration.sharedClient/);assert.doesNotMatch(html,/const sb=createClient/);assert.match(html,/id='yamaPortalReturn'/);assert.match(html,/yc-v3-nav-btn/);assert.match(html,/const ycWebSw=null/);});
test('native launcher rejects unknown app IDs, relative paths and wrong filenames',()=>{const launcher=require('../desktop/launcher.cjs');assert.throws(()=>launcher.validate('maker','C:/Fake.exe'));assert.throws(()=>launcher.validate('search','YamaSearch.exe'));assert.throws(()=>launcher.validate('search','C:/cmd.exe'));assert.deepEqual(launcher.candidates('view'),[]);});
test('signed-out Yamachat does not load its module and offers real sign-in without blocking local apps',async()=>{
 let frames=0,login;const status={textContent:''};
 const nodes={'#module-status':status,'#module-expand':{},'#module-fullscreen':{}};
 const panel={className:'',classList:{contains(){return false;}},querySelector:key=>key==='#module-login'?login:nodes[key],append(node){login=node;}};
 const context={window:{},location:{hash:'#yamachat'},YamaAccountUI:{init:async()=>{},isSignedIn:()=>false},document:{fullscreenEnabled:false,body:{classList:{add(){}}},querySelector:()=>({append(){}}),createElement(tag){if(tag==='section')return panel;if(tag==='iframe')frames++;return {};},addEventListener(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../preview/dist/module-host.js'),'utf8'),context);
 await context.window.YamaModuleHost.show();assert.equal(frames,0);assert.equal(login.href,'#profil');assert.match(status.textContent,/vyžaduje přihlášení/);assert.match(status.textContent,/ostatních aplikací/);
});

test('iPhone without Fullscreen API can render Portal before any module is opened',()=>{
 const context={window:{},document:{fullscreenElement:null,body:{classList:{remove(){}}},addEventListener(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../preview/dist/module-host.js'),'utf8'),context);
 assert.doesNotThrow(()=>context.window.YamaModuleHost.hide());
});
