window.supabase={createClient:()=>{
 const profile={id:'audit-user',username:'tester',display_name:'Místní test',status:'online',ui_theme_color:'#ff0000'};
 const communities=[{id:'community-a',name:'Testovací server',owner_id:'audit-user',server_color:'#1a9fff'}];
 const channels=[{id:'chat-a',community_id:'community-a',name:'obecný',kind:'text'},{id:'chat-b',community_id:'community-a',name:'druhý-chat',kind:'text'}];
 function query(table){let single=false,filters={},op='read';const q=new Proxy({}, {get:(_,key)=>key==='then'?(resolve)=>{
 let data=[];
 if(table==='profiles')data=[profile];
 if(table==='community_members')data=[{user_id:'audit-user',community_id:'community-a',role:'owner',profiles:profile}];
 if(table==='communities')data=communities;
 if(table==='channels')data=channels;
 if(table==='messages')data=Array.from({length:60},(_,i)=>({id:(filters.channel_id||'chat-a')+'-'+i,channel_id:filters.channel_id||'chat-a',author_id:'audit-user',body:'Testovací zpráva '+i,created_at:new Date(1700000000000+i*60000).toISOString(),profiles:profile}));
 if(filters.id)data=data.filter(x=>x.id===filters.id);
 if(op!=='read')window.__mockWrites.push(table+':'+op);
 return new Promise(r=>setTimeout(()=>r({data:single?(data[0]||null):data,error:null,count:data.length}),table==='profiles'?80:15)).then(resolve);
 }:(...args)=>{if(key==='single'||key==='maybeSingle')single=true;if(key==='eq')filters[args[0]]=args[1];if(['insert','update','upsert','delete'].includes(key))op=key;return q}});return q}
 const channel=()=>{const c={on:()=>c,subscribe:()=>c,track:async()=>{},untrack:async()=>{},send:async()=>{},presenceState:()=>({})};return c};
 return {from:query,rpc:async()=>({data:false,error:null}),channel,removeChannel:async()=>{},auth:{getSession:async()=>({data:{session:{user:{id:'audit-user'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getUser:async()=>({data:{user:{id:'audit-user',identities:[]}}}),signOut:async()=>({error:null})},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}}),createSignedUrl:async()=>({data:null})})},functions:{invoke:async()=>({data:null,error:Error('offline fixture')})},realtime:{isConnected:()=>true,connect(){}}}
}};window.__mockWrites=[];