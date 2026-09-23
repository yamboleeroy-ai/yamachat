import fs from 'node:fs';

// Apply the same small adaptation to web/mobile and the desktop client.
// The archived desktop reference and existing backend handlers stay intact.
export function withProfileActions(html) {
  const replace = (before, after) => {
    if (!html.includes(before)) throw Error('Profile actions source boundary changed: ' + before.slice(0, 80));
    html = html.replace(before, after);
  };
  replace("const [{data:f},{data:blockRow}]=await Promise.all", "const actor=user.id;const [friendResult,blockResult]=await Promise.all");
  replace("ycFriendQuery1029(uid),sb.from('user_blocks').select('blocked_id').eq('blocker_id',user.id).eq('blocked_id',uid).maybeSingle()]),", "Promise.resolve(ycFriendQuery1029(uid)).catch(error=>({error})),Promise.resolve(sb.from('user_blocks').select('blocked_id').eq('blocker_id',user.id).eq('blocked_id',uid).maybeSingle()).catch(error=>({error}))]),");
  replace("if(!uid||uid===user?.id)return;const p=await ycProfileRow1029(uid),name=p?.display_name||p?.username||'Uživatel';", "if(!uid||uid===user?.id)return;const sourceModal=document.querySelector('#modalRoot .steam-profile'),reportActor=user.id;const p=await ycProfileRow1029(uid),name=p?.display_name||p?.username||'Uživatel';if(!sourceModal?.isConnected||user?.id!==reportActor)return;");
  replace(",blockedByMe=!!blockRow,host=modal.querySelector('.steam-profile-body')||modal,row=document.createElement('div');row.className='yc-profile-actions-v1028';",
    ";if(!modal.isConnected||user?.id!==actor)return;const {data:f,error:friendError}=friendResult,{data:blockRow,error:blockError}=blockResult;const blockedByMe=!!blockRow,host=modal.querySelector('.steam-profile-body')||modal,row=document.createElement('section');row.className='yc-profile-actions-v1028';row.setAttribute('aria-label','Akce uživatele');");
  replace("label='✕ Zrušit žádost'", "label='Žádost odeslána · zrušit'");
  replace("const discord=host.querySelector('.discord-link');discord?host.insertBefore(row,discord):host.appendChild(row);", "host.appendChild(row);");
  replace("row.querySelector('[data-yc-profile-reject]')?.addEventListener('click',async()=>{await rejectFriend(uid);await ycInjectProfileActions1029(uid)});", "if(row.querySelector('[data-yc-profile-reject]'))row.querySelector('[data-yc-profile-reject]').onclick=async()=>{await rejectFriend(uid);if(row.isConnected)await ycInjectProfileActions1029(uid)};");
  // Prevent completion of an old dialog from modifying a subsequently opened profile.
  replace("await ycInjectProfileActions1029(uid);if(rightMode==='friends')", "if(row.isConnected)await ycInjectProfileActions1029(uid);if(rightMode==='friends')");
  replace("else await ycBlockUser(uid,name);await ycInjectProfileActions1029(uid)", "else await ycBlockUser(uid,name);if(row.isConnected)await ycInjectProfileActions1029(uid)");
  replace("if(!p)return toast('Soukromou zprávu", "if(!row.isConnected||user?.id!==actor)return;if(!p)return toast('Soukromou zprávu");
  replace("row.querySelector('[data-yc-profile-report]').onclick=()=>void ycOpenProfileReport1029(uid)",
    "row.querySelector('[data-yc-profile-report]').onclick=()=>ycOpenProfileReport1029(uid);\n" + fs.readFileSync(new URL('../web/profile-actions.js', import.meta.url), 'utf8'));
  // Legacy actions were declared inside a layout block, invisible to openUserProfile.
  // Move only the social helpers to module scope; keep the existing profile artwork.
  const start=html.indexOf('function ycFriendQuery1029(uid)'),end=html.indexOf('const ycOpenProfileBase1029=',start);
  if(start<0||end<0)throw Error('Missing legacy profile helper boundaries');
  const actions=html.slice(start,end);html=html.slice(0,start)+html.slice(end);
  replace('// Desktop v1.0.38: shared headers and stream entry points.',actions+'\n// Desktop v1.0.38: shared headers and stream entry points.');
  replace('await ycDecorateProfile1029(uid);await ycInjectProfileActions1029(uid)','await ycInjectProfileActions1029(uid)');
  return html.replace('</head>', '<style id="ycProfileActions">'+fs.readFileSync(new URL('../web/profile-actions.css',import.meta.url),'utf8')+'</style>\n</head>');
}
