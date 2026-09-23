(()=>{
if(window.__ycAccountMessagesV1)return;window.__ycAccountMessagesV1=true;
let ycAccountMessagesSub=null,ycAccountMessagesCache=[],ycBanStatusTimer=null;
const YC_ADMIN_USERS_FUNCTION='yamachat-snapshot-v11';
const ycAccountMessageDate=v=>{try{return v?new Date(v).toLocaleString('cs-CZ'):'—'}catch{return String(v||'—')}};
const ycAccountMessageKindLabel=k=>k==='warning'?'Upozornění':k==='important'?'Důležité':'Informace';
async function ycAdminInvoke(body){
  const {data,error}=await sb.functions.invoke(YC_ADMIN_USERS_FUNCTION,{body});
  if(error){
    let message=error.message||'Požadavek se nepodařil.';
    try{const detail=await error.context?.json?.();if(detail?.error)message=detail.error}catch{}
    throw new Error(message)
  }
  if(data?.error)throw new Error(data.error);
  return data||{}
}
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

const ycAdminBanLabel=p=>{
  if(!p?.is_banned)return 'Aktivní';
  if(!p.banned_until)return 'Zabanován';
  const y=new Date(p.banned_until).getUTCFullYear();
  return y>=2100?'Trvalý ban':'Ban do '+ycAccountMessageDate(p.banned_until)
};
function ycAdminUserRow(p){
  const name=p.display_name||p.username||p.email||'Uživatel',self=String(p.id)===String(user?.id);
  const last=p.moderation,moderation=last?.reason?'<div class="yc-admin-user-note">Poslední zásah: '+esc(last.action==='ban'?'ban':'odbanování')+' · '+esc(last.reason)+'</div>':'';
  return '<div class="yc-admin-user-row '+(p.is_banned?'banned':'')+'" data-yc-admin-user="'+esc(p.id)+'"><div class="yc-admin-user-avatar">'+esc(initials(name))+'</div><div class="yc-admin-user-main"><div class="yc-admin-user-title"><strong>'+esc(name)+'</strong>'+(p.is_banned?'<span class="yc-admin-pill danger">BAN</span>':'<span class="yc-admin-pill">OK</span>')+'</div><small>'+esc(p.email||'Bez e-mailu')+(p.email&&!p.email_confirmed_at?' · e-mail nepotvrzen':'')+'</small><small>@'+esc(p.username||'—')+' · registrace '+esc(ycAccountMessageDate(p.created_at))+'</small><small>Poslední přihlášení: '+esc(ycAccountMessageDate(p.last_sign_in_at))+' · '+esc(ycAdminBanLabel(p))+'</small>'+moderation+'</div><div class="yc-admin-user-actions"><button type="button" class="smallbtn" data-yc-admin-send="'+esc(p.id)+'">📨 Vzkaz</button>'+(p.is_banned?'<button type="button" class="smallbtn" data-yc-admin-unban="'+esc(p.id)+'">Odbanovat</button>':'<button type="button" class="smallbtn yc-admin-danger" data-yc-admin-ban="'+esc(p.id)+'" '+(self?'disabled title="Vlastní účet nelze zabanovat"':'')+'>Ban</button>')+'</div></div>'
}
async function ycOpenPlatformUsers(){
  if(!window.__ycPlatformAdmin){toast('Platform Admin není aktivní.',true);return}
  $('modalRoot').innerHTML='<div class="modal-back"><div class="modal yc-admin-directory"><div class="modal-head"><h3>👤 Platform Admin · uživatelské účty</h3><button class="x" id="closeModal">×</button></div><div class="yc-admin-empty">Načítám registrované účty…</div></div></div>';$('closeModal').onclick=closeModal;
  let rows;try{rows=(await ycAdminInvoke({action:'list',perPage:1000})).users||[]}catch(e){toast('Uživatelé: '+(e?.message||e),true);await ycOpenPlatformAdmin();return}
  const banned=rows.filter(x=>x.is_banned).length;
  $('modalRoot').innerHTML='<div class="modal-back"><div class="modal yc-admin-directory"><div class="modal-head"><h3>👤 Platform Admin · uživatelské účty</h3><button class="x" id="closeModal">×</button></div><div class="yc-admin-headline"><button type="button" class="smallbtn" id="ycAdminUsersBack">← Servery</button><span>'+rows.length+' účtů</span><span>'+banned+' zabanovaných</span></div><input id="ycAdminUserSearch" class="directory-search" placeholder="Hledat jméno, uživatelské jméno, e-mail nebo ID…"><div id="ycAdminUserList" class="yc-admin-user-list">'+(rows.length?rows.map(ycAdminUserRow).join(''):'<div class="yc-admin-empty">Žádné registrované účty.</div>')+'</div></div></div>';
  $('closeModal').onclick=closeModal;$('ycAdminUsersBack').onclick=ycOpenPlatformAdmin;
  const list=$('ycAdminUserList'),search=$('ycAdminUserSearch');
  search.oninput=()=>{const q=search.value.trim().toLowerCase();for(const row of list.querySelectorAll('[data-yc-admin-user]')){const p=rows.find(x=>String(x.id)===String(row.dataset.ycAdminUser)),hay=[p?.display_name,p?.username,p?.email,p?.id].join(' ').toLowerCase();row.classList.toggle('hidden',!!q&&!hay.includes(q))}};
  list.querySelectorAll('[data-yc-admin-send]').forEach(b=>b.onclick=()=>ycOpenAdminAccountComposer(rows.find(x=>String(x.id)===String(b.dataset.ycAdminSend))));
  list.querySelectorAll('[data-yc-admin-ban]').forEach(b=>b.onclick=()=>ycOpenAdminBanUser(rows.find(x=>String(x.id)===String(b.dataset.ycAdminBan))));
  list.querySelectorAll('[data-yc-admin-unban]').forEach(b=>b.onclick=()=>void ycAdminUnbanUser(rows.find(x=>String(x.id)===String(b.dataset.ycAdminUnban))))
}
async function ycOpenAdminBanUser(p){
  if(!window.__ycPlatformAdmin||!p?.id)return;
  const name=p.display_name||p.username||p.email||'Uživatel';
  $('modalRoot').innerHTML='<div class="modal-back"><div class="modal yc-admin-compose"><div class="modal-head"><h3>⛔ Ban · '+esc(name)+'</h3><button class="x" id="closeModal">×</button></div><div class="yc-admin-headline"><button type="button" class="smallbtn" id="ycAdminBanBack">← Uživatelé</button><span>'+esc(p.email||'')+'</span></div><label for="ycAdminBanDuration">Délka banu</label><select id="ycAdminBanDuration"><option value="24h">24 hodin</option><option value="7d">7 dní</option><option value="30d">30 dní</option><option value="permanent">Trvale</option></select><label for="ycAdminBanReason">Důvod</label><textarea id="ycAdminBanReason" maxlength="500" placeholder="Např. opakované obtěžování uživatelů, spam…"></textarea><div class="yc-admin-warning">Ban se provede přímo v Supabase Auth. Uživatel se znovu nepřihlásí a další obnovení jeho session bude zamítnuto.</div><div class="yc-admin-actions"><button type="button" class="smallbtn yc-admin-danger" id="ycAdminBanSubmit">Zabanovat účet</button></div></div></div>';
  $('closeModal').onclick=closeModal;$('ycAdminBanBack').onclick=ycOpenPlatformUsers;
  $('ycAdminBanSubmit').onclick=async()=>{const btn=$('ycAdminBanSubmit'),reason=$('ycAdminBanReason').value.trim(),duration=$('ycAdminBanDuration').value;if(reason.length<2){toast('Napiš důvod banu.',true);return}if(!confirm('Opravdu zabanovat účet '+name+'?'))return;btn.disabled=true;btn.textContent='Banuji…';try{await ycAdminInvoke({action:'ban',user_id:p.id,duration,reason});toast('⛔ Účet '+name+' byl zabanován.');await ycOpenPlatformUsers()}catch(e){btn.disabled=false;btn.textContent='Zabanovat účet';toast('Ban se nepodařil: '+(e?.message||e),true)}}
}
async function ycAdminUnbanUser(p){
  if(!window.__ycPlatformAdmin||!p?.id)return;const name=p.display_name||p.username||p.email||'Uživatel';
  if(!confirm('Odbanovat účet '+name+'?'))return;
  try{await ycAdminInvoke({action:'unban',user_id:p.id,reason:'Ruční odbanování Platform Adminem'});toast('✓ Účet '+name+' byl odbanován.');await ycOpenPlatformUsers()}catch(e){toast('Odbanování se nepodařilo: '+(e?.message||e),true)}
}
async function ycOpenAdminAccountComposer(p){
  if(!window.__ycPlatformAdmin||!p?.id)return;
  const name=p.display_name||p.username||p.email||'Uživatel';
  $('modalRoot').innerHTML='<div class="modal-back"><div class="modal yc-admin-compose"><div class="modal-head"><h3>📨 Vzkaz pro '+esc(name)+'</h3><button class="x" id="closeModal">×</button></div><div class="yc-admin-headline"><button type="button" class="smallbtn" id="ycAdminComposeBack">← Uživatelé</button><span>'+esc(p.email||('@'+(p.username||'')))+'</span></div><label for="ycAdminMessageKind">Typ zprávy</label><select id="ycAdminMessageKind"><option value="info">Informace</option><option value="important">Důležité</option><option value="warning">Upozornění</option></select><label for="ycAdminMessageTitle">Nadpis</label><input id="ycAdminMessageTitle" maxlength="120" placeholder="Např. Upozornění k účtu"><label for="ycAdminMessageBody">Zpráva</label><textarea id="ycAdminMessageBody" maxlength="4000" placeholder="Napiš zprávu, která se uživateli zobrazí v jeho účtu."></textarea><div class="yc-admin-actions"><button type="button" class="primary" id="ycAdminMessageSend">Odeslat do účtu</button></div></div></div>';
  $('closeModal').onclick=closeModal;$('ycAdminComposeBack').onclick=ycOpenPlatformUsers;
  $('ycAdminMessageSend').onclick=async()=>{const btn=$('ycAdminMessageSend'),title=$('ycAdminMessageTitle').value.trim(),body=$('ycAdminMessageBody').value.trim(),kind=$('ycAdminMessageKind').value;if(!title||!body){toast('Vyplň nadpis i zprávu.',true);return}btn.disabled=true;btn.textContent='Odesílám…';const {error}=await sb.from('account_messages').insert({recipient_user_id:p.id,title,body,kind,created_by:user.id});if(error){btn.disabled=false;btn.textContent='Odeslat do účtu';toast('Vzkaz se nepodařilo odeslat: '+error.message,true);return}toast('📨 Vzkaz byl odeslán uživateli '+name+'.');await ycOpenPlatformUsers()}
}
window.ycOpenPlatformUsers=ycOpenPlatformUsers;
const ycAccountOpenPlatformAdminBase=ycOpenPlatformAdmin;
ycOpenPlatformAdmin=async function(...args){const out=await ycAccountOpenPlatformAdminBase.apply(this,args);const head=document.querySelector('#modalRoot .yc-admin-headline');if(head&&!$('ycAdminUsers')){const b=document.createElement('button');b.type='button';b.className='smallbtn';b.id='ycAdminUsers';b.textContent='👤 Uživatelé';b.onclick=ycOpenPlatformUsers;head.appendChild(b)}return out};

async function ycCheckOwnBanStatus(){
  if(!user?.id)return;
  try{const state=await ycAdminInvoke({action:'self-status'});if(!state?.is_banned)return;const until=state.banned_until;try{await sb.auth.signOut({scope:'local'})}catch{};showAuth();const msg=$('authMsg');if(msg){msg.textContent='Tento účet je zablokovaný'+(until?' do '+ycAccountMessageDate(until):'')+'.';msg.classList.add('error')} }catch(e){console.warn('account ban status',e)}
}
async function ycStartAccountMessages(){
  if(ycAccountMessagesSub){try{await sb.removeChannel(ycAccountMessagesSub)}catch{}ycAccountMessagesSub=null}
  if(!user?.id)return;
  let rows=[];try{rows=await ycLoadAccountMessages()}catch(e){console.warn('account messages load',e);return}
  const unread=rows.filter(x=>!x.read_at).length;if(unread){toast('📨 Máš '+unread+' '+(unread===1?'novou zprávu':'nové zprávy')+' od Yamachatu.');setTimeout(()=>void ycOpenAccountInbox(true),800)}
  ycAccountMessagesSub=sb.channel('yc-account-messages-'+user.id+'-'+Date.now()).on('postgres_changes',{event:'INSERT',schema:'public',table:'account_messages',filter:'recipient_user_id=eq.'+user.id},async()=>{try{await ycLoadAccountMessages()}catch{}toast('📨 Nový vzkaz od Yamachatu.');setTimeout(()=>void ycOpenAccountInbox(true),250)}).subscribe()
}
ycOnLifecycle('init',()=>{void ycStartAccountMessages();void ycCheckOwnBanStatus();clearInterval(ycBanStatusTimer);ycBanStatusTimer=setInterval(()=>void ycCheckOwnBanStatus(),60000)});
ycOnLifecycle('beforeAuth',()=>{ycAccountMessagesCache=[];clearInterval(ycBanStatusTimer);ycBanStatusTimer=null;if(ycAccountMessagesSub){try{sb.removeChannel(ycAccountMessagesSub)}catch{}ycAccountMessagesSub=null}})
})();