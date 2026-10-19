const test=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http');
const {createPortalServer}=require('../preview/server.cjs');
test('native return requires current capability, exact Host, POST and no browser Origin',async()=>{
 let returned=0; const options={returnToken:'a'.repeat(64),onPortalReturn:()=>returned++};const server=createPortalServer(options);await new Promise(r=>server.listen(0,'127.0.0.1',r));options.origin='http://127.0.0.1:'+server.address().port;
 const request=(method,headers={})=>new Promise((resolve,reject)=>{const req=http.request(options.origin+'/portal-return',{method,headers},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});
 try{assert.equal(await request('GET'),403);assert.equal(await request('POST'),403);assert.equal(await request('POST',{'x-yamaportal-return':'wrong'}),403);assert.equal(await request('POST',{'x-yamaportal-return':options.returnToken,Origin:'https://example.org'}),403);assert.equal(await request('POST',{'x-yamaportal-return':options.returnToken,Host:'example.org'}),403);assert.equal(returned,0);assert.equal(await request('POST',{'x-yamaportal-return':options.returnToken}),204);assert.equal(returned,1);}finally{await new Promise(r=>server.close(r));}
});
