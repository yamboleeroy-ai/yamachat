function removeExactOnceIfPresent(html,needle){
  const first=html.indexOf(needle);
  if(first<0)return html;
  if(html.indexOf(needle,first+needle.length)>=0)throw Error('Dead-code cleanup duplicate boundary');
  return html.slice(0,first)+html.slice(first+needle.length);
}

export function withDeadCodeCleanup(html){
  html=removeExactOnceIfPresent(
    html,
    "function ycAfterLayoutStable(){return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))}\n"
  );
  html=removeExactOnceIfPresent(
    html,
    "function ycScreenMbpsText(){return (ycScreenShareProfile().bitrate/1000000).toFixed(1).replace('.0','')+' Mb/s'}\n"
  );

  html=removeExactOnceIfPresent(
    html,
    "function ycMembersPresenceNeedsRefresh(){if(rightMode!=='members')return false;for(const uid of ycVisibleMemberIds){const state=ycPresenceState(ycPresenceDisplayRow(uid,ycPresenceRowsByUser.get(uid)||null));if(ycPresenceRenderedStateByUser.get(uid)!==state)return true}return false}\n"
  );
  html=removeExactOnceIfPresent(
    html,
    `function ycHandlePresenceRealtime(payload){
 const row=payload?.new||payload?.old||{},uid=String(row.user_id||'');if(!uid)return;
 const before=ycPresenceRowsByUser.get(uid)||null,beforeSig=ycPresenceVisualSig(uid,before);
 if(payload?.eventType==='DELETE')ycPresenceRowsByUser.delete(uid);else ycPresenceRowsByUser.set(uid,row);
 if(uid===String(user?.id||'')&&String(row.state||'').toLowerCase()==='online'){const seen=new Date(row.last_seen_at||0).getTime();if(Number.isFinite(seen))ycPresenceRemoteOnlineUntil=Math.max(ycPresenceRemoteOnlineUntil,seen+YC_PRESENCE_ACTIVE_LEASE_MS)}
 const after=payload?.eventType==='DELETE'?null:row,afterSig=ycPresenceVisualSig(uid,after);if(beforeSig===afterSig)return;
 if(rightMode==='members'&&ycVisibleMemberIds.has(uid)){const beforeState=ycPresenceState(ycPresenceDisplayRow(uid,before)),afterState=ycPresenceState(ycPresenceDisplayRow(uid,after));if(beforeState!=='offline'&&afterState!=='offline'&&ycPatchVisibleMemberPresence(uid,after))return}
 ycRefreshVisibleSocialSoon()
}
`
  );

  html=removeExactOnceIfPresent(
    html,
    "function ycPresenceVisualSig(uid,row){const shown=ycPresenceDisplayRow(uid,row),state=ycPresenceState(shown),activity=state==='offline'?'':String(shown?.activity_text||'');return state+'|'+activity}\n"
  );

  const start='// SAME VOICE STREAM FIX v3.0.18 — refresh the existing peer video negotiation before watch-on-demand.\n';
  const end='const ycViewerHandleVoiceSignal=handleVoiceSignal';
  const startAt=html.indexOf(start);
  if(startAt>=0){
    const endAt=html.indexOf(end,startAt);
    if(endAt<0)throw Error('Dead-code stream helper boundary missing');
    const block=html.slice(startAt,endAt);
    if(!block.includes('async function ycPrimeExistingVoiceForStream')||!block.includes('async function ycRebuildVoicePeerForStream')){
      throw Error('Dead-code stream helper proof missing');
    }
    html=html.slice(0,startAt)+html.slice(endAt);
  }

  return html;
}
