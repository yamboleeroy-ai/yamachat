const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sql=fs.readFileSync(path.join(__dirname,'..','supabase','yamachat-restrict-anon-rpc-exec.sql'),'utf8');
const protectedFunctions=[
  'assign_community_role','award_stream_xp','award_voice_xp','create_community_role',
  'delete_community_role','remove_community_role','rename_community','report_profile',
  'set_community_server_color','update_community_role','update_community_settings'
];

test('authenticated Yamachat RPCs no longer grant anonymous SECURITY DEFINER execution',()=>{
  for(const name of protectedFunctions){
    assert.match(sql,new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${name}\\(`));
    assert.match(sql,new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+ TO authenticated;`));
  }
  assert.match(sql,/FROM PUBLIC, anon/);
  assert.doesNotMatch(sql,/(?:REVOKE|GRANT)[^;]*list_public_communities/);
});
