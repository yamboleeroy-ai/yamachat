const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const bad=".select('id,username,display_name,avatar_path,avatar_url')";
const good=".select('id,username,display_name,avatar_path,discord_avatar_url,use_discord_avatar')";
for(const file of ['desktop/desktop-client.html','index.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  assert(!html.includes(bad),file+' still queries nonexistent profiles.avatar_url');
  assert(html.includes(good),file+' mention profile query does not use the live avatar schema');
}
console.log('PASS profile schema contract: mention cache uses avatar_path + Discord avatar columns and never queries nonexistent avatar_url.');
