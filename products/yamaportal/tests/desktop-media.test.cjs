const test=require('node:test'),assert=require('node:assert/strict');
const {installDisplayPicker}=require('../desktop/media.cjs');
function fixture({response=1,audio=false,destroyed=false}={}){
 let handler,enumerated=0,dialogCount=0;
 const win={isDestroyed:()=>destroyed,webContents:{session:{setDisplayMediaRequestHandler:fn=>handler=fn}}};
 const source={id:'screen:synthetic',name:'Test screen'};
 installDisplayPicker({win,origin:'http://127.0.0.1:4188',platform:'win32',desktopCapturer:{getSources:async()=>{enumerated++;return [source];}},dialog:{showMessageBox:async()=>{dialogCount++;return {response,checkboxChecked:audio};}}});
 return {run:request=>new Promise(resolve=>handler(request,resolve)),stats:()=>({enumerated,dialogCount}),source};
}
const request={userGesture:true,videoRequested:true,audioRequested:true,securityOrigin:'http://127.0.0.1:4188',frame:{url:'http://127.0.0.1:4188/modules/yamachat/index.html'}};
test('screen capture requires explicit source selection and separate audio consent',async()=>{
 const f=fixture();assert.deepEqual(await f.run(request),{video:f.source});
 const audio=fixture({audio:true});assert.deepEqual(await audio.run(request),{video:audio.source,audio:'loopback'});
 assert.deepEqual(await fixture({response:0}).run(request),{});
});
test('untrusted, missing-gesture or closed-window requests cannot enumerate screens',async()=>{
 for(const change of [{userGesture:false},{securityOrigin:'https://attacker.invalid'},{frame:null},{frame:{url:'http://127.0.0.1:4188/#domu'}}]){
  const f=fixture();assert.deepEqual(await f.run({...request,...change}),{});assert.deepEqual(f.stats(),{enumerated:0,dialogCount:0});
 }
 const f=fixture({destroyed:true});assert.deepEqual(await f.run(request),{});assert.equal(f.stats().enumerated,0);
});
