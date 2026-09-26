export function withWebNotificationScrollFix(html){
  const unsafeJump=String.raw`async function ycWinJumpToMessage(messageId){
 const id=String(messageId||'');if(!id)return false
 for(let i=0;i<12;i++){
  const row=document.querySelector('[data-message-id="'+CSS.escape(id)+'"]')
  if(row){row.scrollIntoView({behavior:'smooth',block:'center'});row.classList.add('yc-notification-jump');setTimeout(()=>row.classList.remove('yc-notification-jump'),1800);return true}
  await new Promise(r=>setTimeout(r,80))
 }
 return false
}`;

  const safeJump=String.raw`function ycWebNotificationResetRootScroll(){
 try{
  if(document.scrollingElement)document.scrollingElement.scrollTop=0
  document.documentElement.scrollTop=0
  document.body.scrollTop=0
 }catch{}
}
function ycWebNotificationScrollRow(row){
 const scroller=document.getElementById('messages')
 if(!row||!scroller||!scroller.contains(row))return false
 try{
  const sr=scroller.getBoundingClientRect(),rr=row.getBoundingClientRect()
  const max=Math.max(0,scroller.scrollHeight-scroller.clientHeight)
  const delta=((rr.top+rr.bottom)-(sr.top+sr.bottom))/2
  const next=Math.max(0,Math.min(max,scroller.scrollTop+delta))
  scroller.scrollTo({top:next,behavior:'smooth'})
  ycWebNotificationResetRootScroll()
  return true
 }catch{return false}
}
async function ycWinJumpToMessage(messageId){
 const id=String(messageId||'');if(!id)return false
 ycWebNotificationResetRootScroll()
 for(let i=0;i<12;i++){
  const row=document.querySelector('[data-message-id="'+CSS.escape(id)+'"]')
  if(row){ycWebNotificationScrollRow(row);row.classList.add('yc-notification-jump');setTimeout(()=>row.classList.remove('yc-notification-jump'),1800);ycWebNotificationResetRootScroll();return true}
  await new Promise(r=>setTimeout(r,80))
 }
 ycWebNotificationResetRootScroll()
 return false
}`;

  if(!html.includes(unsafeJump)) throw new Error('Web notification jump boundary missing');
  html=html.replace(unsafeJump,safeJump);

  const unsafeMention=String.raw`function ycRenderMentions(){document.querySelectorAll('.m-body').forEach(ycRenderMentionBody);if(ycPendingMentionJump){const row=document.querySelector('[data-message-id="'+CSS.escape(ycPendingMentionJump)+'"]');if(row){row.scrollIntoView({behavior:'smooth',block:'center'});row.classList.add('yc-mention-jump');setTimeout(()=>row.classList.remove('yc-mention-jump'),1400);ycPendingMentionJump=null}}}`;

  const safeMention=String.raw`function ycRenderMentions(){document.querySelectorAll('.m-body').forEach(ycRenderMentionBody);if(ycPendingMentionJump){const row=document.querySelector('[data-message-id="'+CSS.escape(ycPendingMentionJump)+'"]');if(row){ycWebNotificationScrollRow(row);ycWebNotificationResetRootScroll();row.classList.add('yc-mention-jump');setTimeout(()=>row.classList.remove('yc-mention-jump'),1400);ycPendingMentionJump=null}}}`;

  if(!html.includes(unsafeMention)) throw new Error('Web mention notification jump boundary missing');
  return html.replace(unsafeMention,safeMention);
}
