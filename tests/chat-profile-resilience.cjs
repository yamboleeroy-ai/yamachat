const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const targets=[
  'index.html',
  'desktop/desktop-client.html',
  'products/yamaportal/preview/dist/modules/yamachat/index.html'
];
for(const relative of targets){
  const html=fs.readFileSync(path.join(root,relative),'utf8');
  assert.match(html,/ycShowProfileLoadRetry\(\)/,relative+' must preserve the session and offer retry when profile loading fails');
  assert.match(html,/yamachat_ensure_my_profile/,relative+' must repair a genuinely missing profile on the same authenticated UUID');
  assert.doesNotMatch(html,/showAuth\(\);\$\('authMsg'\)\.textContent='Načtení profilu selhalo/,relative+' must not turn a profile/network error into a false logout');
  assert.match(html,/\.eq\('id',uid\)\.maybeSingle\(\)/,relative+' must look up only the exact authenticated user id');
}
const migration=fs.readFileSync(path.join(root,'supabase/yamachat-ensure-my-profile.sql'),'utf8');
assert.match(migration,/security definer/i);
assert.match(migration,/auth\.uid\(\)/i);
assert.match(migration,/on conflict \(id\) do nothing/i);
assert.match(migration,/substr\(replace\(v_user_id::text, '-', ''\), 1, 27\)/,'generated usernames must honor profiles.username max length');
assert.match(migration,/revoke all on function public\.yamachat_ensure_my_profile\(\) from public, anon/i);
assert.match(migration,/grant execute on function public\.yamachat_ensure_my_profile\(\) to authenticated/i);
assert.doesNotMatch(migration,/service_role|auth\.users|where\s+[^;]*email/i,'profile repair must not use privileged client credentials or link by email');
console.log('PASS Yamachat retains the shared session on profile-load errors and repairs missing profiles by the authenticated UUID only.');
