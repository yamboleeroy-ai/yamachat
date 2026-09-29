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
