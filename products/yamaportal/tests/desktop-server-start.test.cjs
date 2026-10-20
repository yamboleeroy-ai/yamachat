const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {listenPortal}=require('../desktop/server-start.cjs');

test('Desktop server falls back to an ephemeral localhost port when its preferred port is occupied',async()=>{
 const server=new EventEmitter();let selected;
 server.listen=(port,host)=>{selected={port,host};setImmediate(()=>port?server.emit('error',Object.assign(new Error('occupied'),{code:'EADDRINUSE'})):server.emit('listening'));};
 server.address=()=>({address:'127.0.0.1',port:43721});
 const result=await listenPortal(server,4188);
 assert.deepEqual(result,{address:{address:'127.0.0.1',port:43721},usedFallback:true});
 assert.deepEqual(selected,{port:0,host:'127.0.0.1'});
});

test('Desktop server does not hide unrelated startup failures',async()=>{
 const server=new EventEmitter();server.listen=()=>setImmediate(()=>server.emit('error',Object.assign(new Error('denied'),{code:'EACCES'})));
 await assert.rejects(()=>listenPortal(server,4188),error=>error.code==='EACCES');
});
