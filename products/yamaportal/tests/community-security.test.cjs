const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'..','..','supabase','yamaportal-community.sql'),'utf8');
const replies=fs.readFileSync(path.join(root,'..','..','supabase','yamaportal-forum-replies.sql'),'utf8');
const ui=fs.readFileSync(path.join(root,'preview','dist','community-ui.js'),'utf8');
const app=fs.readFileSync(path.join(root,'preview','dist','app.js'),'utf8');

test('Portal community schema is isolated and authenticated-only',()=>{
  for(const table of ['portal_chat_messages','portal_forum_topics']){
    assert.match(migration,new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration,new RegExp(`grant select, insert on public\\.${table} to authenticated`));
    assert.doesNotMatch(migration,new RegExp(`grant [^;]* on public\\.${table} to anon`));
  }
  assert.match(migration,/with check \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.match(migration,/char_length\(btrim\(body\)\) between 1 and 1000/);
  assert.match(migration,/char_length\(btrim\(title\)\) between 1 and 120/);
  assert.doesNotMatch(migration,/public\.(messages|channels|communities)\s+(insert|update|delete)/i);
});

test('Portal chat and forum defer reads and realtime until account verification',()=>{
  const accountGate=ui.indexOf('const result=await client.auth.getUser()');
  const noUserGate=ui.indexOf('if(!user){target.innerHTML=signedOut(kind);return;}');
  const firstRead=ui.search(/\.from\('portal_(chat_messages|forum_topics)'\)/);
  const subscription=ui.indexOf("client.channel('yamaportal-live-chat')");
  assert.ok(accountGate>=0&&noUserGate>accountGate&&firstRead>noUserGate);
  assert.ok(subscription>noUserGate);
  assert.match(ui,/removeChannel\(active\)/);
  assert.match(ui,/maxlength="1000"/);
  assert.match(ui,/maxlength="5000"/);
  assert.match(app,/href="#live-chat"/);
  assert.match(app,/href="#forum"/);
  assert.match(app,/if\(active==='live-chat'\|\|active==='forum'\)\{YamaPortalCommunity\.show\(active\);return;\}/);
});

test('Forum replies are isolated, tied to a topic, and authenticated-only',()=>{
  assert.match(replies,/create table if not exists public\.portal_forum_replies/);
  assert.match(replies,/references public\.portal_forum_topics\(id\) on delete cascade/);
  assert.match(replies,/references public\.profiles\(id\) on delete cascade/);
  assert.match(replies,/alter table public\.portal_forum_replies enable row level security/);
  assert.match(replies,/with check \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.match(replies,/grant select, insert on public\.portal_forum_replies to authenticated/);
  assert.doesNotMatch(replies,/grant [^;]* on public\.portal_forum_replies to anon/i);
  assert.doesNotMatch(replies,/grant [^;]*(update|delete)[^;]* on public\.portal_forum_replies to authenticated/i);
  assert.match(replies,/portal_forum_replies_topic_created_idx/);
  assert.match(replies,/portal_forum_replies_user_id_idx/);
  assert.match(ui,/portal_forum_replies/);
  assert.match(ui,/Otevřít diskusi/);
  assert.match(ui,/Odeslat odpověď/);
});
