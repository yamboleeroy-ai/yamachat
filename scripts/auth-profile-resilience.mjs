/**
 * Keep a valid Yamaportal/Yamachat session alive when the profile row is
 * temporarily unavailable. If an account genuinely lacks its profile, ask
 * the authenticated server-side RPC to create the row for the same auth UUID.
 */
export function withAuthProfileResilience(html) {
  // The verified desktop/web parity transform already imports this exact
  // behavior from desktop/desktop-client.html; keep the build idempotent.
  if (html.includes("sb.rpc('yamachat_ensure_my_profile')")) {
    if (!html.includes('ycShowProfileLoadRetry()')) throw new Error('Partial Yamachat profile recovery transform.');
    return html;
  }
  const oldQuery = "const {data,error}=await sb.from('profiles').select('*').eq('id',uid).single();\n    if(!active())return false;if(error)throw error;if(!data)throw Error('Profil nebyl nalezen.');profile=data;";
  const newQuery = "let {data,error}=await sb.from('profiles').select('*').eq('id',uid).maybeSingle();\n    if(!active())return false;if(error)throw error;\n    if(!data){const {error:provisionError}=await sb.rpc('yamachat_ensure_my_profile');if(!active())return false;if(provisionError)throw provisionError;\n      const restored=await sb.from('profiles').select('*').eq('id',uid).maybeSingle();if(!active())return false;if(restored.error)throw restored.error;data=restored.data}\n    if(!data)throw Error('Profil se nepodařilo bezpečně vytvořit.');profile=data;";
  const oldCatch = "}catch(error){if(active()){showAuth();$('authMsg').textContent='Načtení profilu selhalo: '+(error.message||error)}return false}";
  const newCatch = "}catch(error){if(active()){console.warn('Yamachat profile startup failed',error);ycShowProfileLoadRetry()}return false}";
  if (!html.includes(oldQuery)) {
    const at=html.indexOf("sb.from('profiles').select('*').eq('id',uid)");
    throw new Error('Missing exact Yamachat profile query boundary: '+(at<0?'not found':html.slice(at-35,at+210)));
  }
  if (!html.includes(oldCatch)) throw new Error('Missing exact Yamachat profile error boundary.');
  html = html.replace(oldQuery, newQuery).replace(oldCatch, newCatch);
  const helper = `\nfunction ycShowProfileLoadRetry(){window.YamachatBootGuard?.ready();$('auth').classList.add('hidden');$('app').classList.add('hidden');ycShowBootSplash();const note=$('ycBootSplash')?.querySelector('small');if(note)note.textContent='Společný účet je přihlášený, ale profil se teď nepodařilo načíst. Zkus to znovu.';let button=$('ycBootRetry');if(!button){button=document.createElement('button');button.id='ycBootRetry';button.type='button';button.className='secondary';button.textContent='Zkusit znovu';button.style.marginTop='14px';$('ycBootSplash')?.append(button);button.addEventListener('click',()=>{if(!session?.user){button.hidden=true;showAuth();return}button.disabled=true;const note=$('ycBootSplash')?.querySelector('small');if(note)note.textContent='Znovu načítám profil…';void initApp(session).finally(()=>{button.disabled=false})})}button.hidden=false}\n`;
  const anchor = 'async function initApp(s){';
  if (!html.includes(anchor)) throw new Error('Missing Yamachat initApp boundary.');
  return html.replace(anchor, helper + anchor);
}
