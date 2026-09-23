(()=>{
if(window.__ycAccountMessagesV1)return;window.__ycAccountMessagesV1=true;
let ycAccountMessagesSub=null,ycAccountMessagesCache=[];
const ycAccountMessageDate=v=>{try{return new Date(v).toLocaleString('cs-CZ')}catch{return String(v||'')}};
const ycAccountMessageKindLabel=k=>k==='warning'?'Upozornění':k==='important'?'Důležité':'Informace';
async function ycLoadAccountMessages(){
  if(!user?.id){ycAccountMessagesCache=[];return[]}
  const {data,error}=await sb.from('account_messages').select('id,recipient_user_id,title,body,kind,created_at,read_at,created_by').eq('recipient_user_id',user.id).order('created_at',{ascending:false}).limit(50);
  if(error)throw error;ycAccountMessagesCache=data||[];return ycAccountMessagesCache
}
function ycAccountMessageCard(m){
  const unread=!m.read_at;
  return '<article class="yc-account-message '+esc(m.kind||'info')+' '+(unread?'unread':'')+'" data-yc-account-message="'+esc(m.id)+'"><div class="yc-account-message-head"><div><strong>'+esc(m.title||'Zpráva od Yamachatu')+'</strong><div class="yc-account-message-meta">'+esc(ycAccountMessageKindLabel(m.kind))+' · '+esc(ycAccountMessageDate(m.created_at))+'</div></div>'+(unread?'<span class="yc-admin-pill gold">NOVÁ</span>':'<span class="yc-admin-pill">Přečteno</span>')+'</div><div class="yc-account-message-body">'+esc(m.body||'')+'</div>'+(unread?'<div class="yc-account-message-actions"><button type="button" class="smallbtn" data-yc-account-read="'+esc(m.id)+'">Označit jako přečtené</button></div>':'')+'</article>'
}
async function ycMarkAccountMessageRead(id){
  if(!id||!user?.id)return false;
  const {error}=await sb.from('account_messages').update({read_at:new Date().toISOString()}).eq('id',id).eq('recipient_user_id',user.id);
  if(error){toast('Zprávu se nepodařilo označit jako přečtenou: '+error.message,true);return false}
  await ycLoadAccountMessages();return true
}
async function ycOpenAccountInbox(auto=false){
  let rows;try{rows=await ycLoadAccountMessages()}catch(e){if(!auto)toast('Zprávy Yamachatu: '+(e?.message||e),true);return}
  const unread=rows.filter(x=>!x.read_at).length;
  if(auto&&!unread)return;
  if(auto&&$('modalRoot')?.innerHTML.trim())return;
  $('modalRoot').innerHTML='<div class="modal-back"><div class="modal yc-account-inbox"><div class="modal-head"><h3>📨 Zprávy od Yamachatu</h3><button class="x" id="closeModal">×</button></div><div class="yc-admin-headline"><span>'+rows.length+' zpráv</span><span>'+unread+' nepřečtených</span>'+(unread>1?'<button type="button" class="smallbtn" id="ycAccountReadAll">Označit vše jako přečtené</button>':'')+'</div><div class="yc-account-inbox-list">'+(rows.length?rows.map(ycAccountMessageCard).join(''):'<div class="yc-admin-empty">Zatím tu nemáš žádnou systémovou zprávu.</div>')+'</div></div></div>';
  $('closeModal').onclick=closeModal;
  document.querySelectorAll('[data-yc-account-read]').forEach(b=>b.onclick=async()=>{b.disabled=true;if(await ycMarkAccountMessageRead(b.dataset.ycAccountRead))await ycOpenAccountInbox(false)});
  $('ycAccountReadAll')?.addEventListener('click',async()=>{const ids=rows.filter(x=>!x.read_at).map(x=>x.id);for(const id of ids)await ycMarkAccountMessageRead(id);await ycOpenAccountInbox(false)})
}
window.ycOpenAccountInbox=ycOpenAccountInbox;
async function ycAttachAccountInboxEntry(){
  const modal=document.querySelector('#modalRoot .steam-profile');if(!modal||!user?.id)return;
  const host=modal.querySelector('.steam-profile-body')||modal;host.querySelector('.yc-account-inbox-entry')?.remove();
  let rows=[];try{rows=await ycLoadAccountMessages()}catch{}
  if(!modal.isConnected)return;const unread=rows.filter(x=>!x.read_at).length,btn=document.createElement('button');
  btn.type='button';btn.className='ghost yc-account-inbox-entry';btn.textContent='📨 Zprávy od Yamachatu'+(unread?' ('+unread+' nové)':'');btn.onclick=()=>void ycOpenAccountInbox(false);host.appendChild(btn)
}
const ycAccountOpenProfileBase=openProfile;
openProfile=async function(...args){const out=await ycAccountOpenProfileBase.apply(this,args);try{await ycAttachAccountInboxEntry()}catch(e){console.warn('account inbox profile',e)}return out};

function ycAdminUserRow(p){
  const name=p.display_name||p.username||'Uživatel';
  return '<div class="yc-admin-user-row" data-yc-admin-user="'+esc(p.id)+'"><div class="yc-admin-user-avatar">'+esc(initials(name))+'</div><div class="yc-admin-user-main"><strong>'+esc(name)+'</strong><small>@'+esc(p.username||'')+' · účet '+esc(ycProfileCreated(p.created_at))+'</small></div><button type="button" class="smallbtn" data-yc-admin-send="'+esc(p.id)+'">Poslat zprávu</button></div>'
}
async function ycOpenPlatformUsers(){
  if(!window.__ycPlatformAdmin){toast('Platform Admin není aktivní.',true);return}
  const {data,error}=await sb.from('profiles').select('id,username,display_name,created_at').order('username',{ascending:true}).limit(500);
  if(error){toast('Uživatelé: '+error.message,true);return}
  const rows=data||[];
  $('modalRoot').innerHTML='<div class="modal-back"><div class="modal yc-admin-directory"><div class="modal-head"><h3>👤 Platform Admin · uživatelé</h3><button class="x" id="closeModal">×</button></div><div class="yc-admin-headline"><button type="button" class="smallbtn" id="ycAdminUsersBack">← Servery</button><span>'+rows.length+' účtů</span></div><input id="ycAdminUserSearch" class="directory-search" placeholder="Hledat uživatele nebo zobrazované jméno…"><div id="ycAdminUserList" class="yc-admin-user-list">'+rows.map(ycAdminUserRow).join('')+'</div></div></div>';
  $('closeModal').onclick=closeModal;$('ycAdminUsersBack').onclick=ycOpenPlatformAdmin;
  const list=$('ycAdminUserList'),search=$('ycAdminUserSearch');search.oninput=()=>{const q=search.value.trim().toLowerCase();for(const row of list.querySelectorAll('[data-yc-admin-user]')){const p=rows.find(x=>String(x.id)===String(row.dataset.ycAdminUser)),hay=((p?.display_name||'')+' '+(p?.username||'')).toLowerCase();row.classList.toggle('hidden',!!q&&!hay.includes(q))}};
  list.querySelectorAll('[data-yc-admin-send]').forEach(b=>b.onclick=()=>ycOpenAdminAccountComposer(rows.find(x=>String(x.id)===String(b.dataset.ycAdminSend))))
}
async function ycOpenAdminAccountComposer(p){
  if(!window.__ycPlatformAdmin||!p?.id)return;
  const name=p.display_name||p.username||'Uživatel';
  $('modalRoot').innerHTML='<div class="modal-back"><div class="modal yc-admin-compose"><div class="modal-head"><h3>📨 Zpráva pro '+esc(name)+'</h3><button class="x" id="closeModal">×</button></div><div class="yc-admin-headline"><button type="button" class="smallbtn" id="ycAdminComposeBack">← Uživatelé</button><span>@'+esc(p.username||'')+'</span></div><label for="ycAdminMessageKind">Typ zprávy</label><select id="ycAdminMessageKind"><option value="info">Informace</option><option value="important">Důležité</option><option value="warning">Upozornění</option></select><label for="ycAdminMessageTitle">Nadpis</label><input id="ycAdminMessageTitle" maxlength="120" placeholder="Např. Důležitá informace k účtu"><label for="ycAdminMessageBody">Zpráva</label><textarea id="ycAdminMessageBody" maxlength="4000" placeholder="Napiš zprávu, která se uživateli zobrazí v jeho účtu."></textarea><div class="yc-admin-actions"><button type="button" class="primary" id="ycAdminMessageSend">Odeslat do účtu</button></div></div></div>';
  $('closeModal').onclick=closeModal;$('ycAdminComposeBack').onclick=ycOpenPlatformUsers;
  $('ycAdminMessageSend').onclick=async()=>{const btn=$('ycAdminMessageSend'),title=$('ycAdminMessageTitle').value.trim(),body=$('ycAdminMessageBody').value.trim(),kind=$('ycAdminMessageKind').value;if(!title||!body){toast('Vyplň nadpis i zprávu.',true);return}btn.disabled=true;btn.textContent='Odesílám…';const {error}=await sb.from('account_messages').insert({recipient_user_id:p.id,title,body,kind,created_by:user.id});if(error){btn.disabled=false;btn.textContent='Odeslat do účtu';toast('Zprávu se nepodařilo odeslat: '+error.message,true);return}toast('📨 Zpráva byla odeslána uživateli '+name+'.');await ycOpenPlatformUsers()}
}
window.ycOpenPlatformUsers=ycOpenPlatformUsers;
const ycAccountOpenPlatformAdminBase=ycOpenPlatformAdmin;
ycOpenPlatformAdmin=async function(...args){const out=await ycAccountOpenPlatformAdminBase.apply(this,args);const head=document.querySelector('#modalRoot .yc-admin-headline');if(head&&!$('ycAdminUsers')){const b=document.createElement('button');b.type='button';b.className='smallbtn';b.id='ycAdminUsers';b.textContent='👤 Uživatelé';b.onclick=ycOpenPlatformUsers;head.appendChild(b)}return out};

async function ycStartAccountMessages(){
  if(ycAccountMessagesSub){try{await sb.removeChannel(ycAccountMessagesSub)}catch{}ycAccountMessagesSub=null}
  if(!user?.id)return;
  let rows=[];try{rows=await ycLoadAccountMessages()}catch(e){console.warn('account messages load',e);return}
  const unread=rows.filter(x=>!x.read_at).length;if(unread){toast('📨 Máš '+unread+' '+(unread===1?'novou zprávu':'nové zprávy')+' od Yamachatu.');setTimeout(()=>void ycOpenAccountInbox(true),800)}
  ycAccountMessagesSub=sb.channel('yc-account-messages-'+user.id+'-'+Date.now()).on('postgres_changes',{event:'INSERT',schema:'public',table:'account_messages',filter:'recipient_user_id=eq.'+user.id},async()=>{try{await ycLoadAccountMessages()}catch{}toast('📨 Nová zpráva od Yamachatu.');setTimeout(()=>void ycOpenAccountInbox(true),250)}).subscribe()
}
ycOnLifecycle('init',()=>void ycStartAccountMessages());
ycOnLifecycle('beforeAuth',()=>{ycAccountMessagesCache=[];if(ycAccountMessagesSub){try{sb.removeChannel(ycAccountMessagesSub)}catch{}ycAccountMessagesSub=null}})
})();