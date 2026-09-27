const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const client=fs.readFileSync(path.join(root,'desktop/desktop-client.html'),'utf8');
const friends=fs.readFileSync(path.join(root,'scripts/friends-panel-refresh.mjs'),'utf8');

for(const marker of [
  ".yc-friends-home #dmList{display:grid!important;gap:6px!important;padding-bottom:8px!important;overflow-x:hidden!important}",
  ".yc-dm-social-row:hover{transform:none!important",
  "Math.max(card.offsetHeight||0,280)",
  "document.documentElement.dataset.ycUiMenuOpen==='1'",
  "document.documentElement.dataset.ycContextPending==='1'",
  "window.addEventListener('wheel',ycCloseUiMenu,{capture:true,passive:true})",
  "window.addEventListener('touchmove',ycCloseUiMenu,{capture:true,passive:true})",
  "delete document.documentElement.dataset.ycUiMenuOpen",
  "document.documentElement.dataset.ycUiMenuOpen='1'",
  "document.documentElement.dataset.ycContextPending='1'"
]) assert(client.includes(marker),'Social hover/context stability marker missing: '+marker);

assert(!client.includes("window.addEventListener('scroll',ycCloseUiMenu,true)"),
  'Programmatic list scroll must not close the context menu');
assert(!client.includes("ycHoverRender(data);ycHoverPosition(anchor)"),
  'Loaded hover content must not reposition and jump vertically');
assert(!friends.includes("transform:translateX(1px)"),
  'Friends-home DM hover must not create horizontal overflow');
assert(friends.includes("overflow-x:hidden!important"),
  'Friends-home DM list must suppress horizontal scrollbar churn');

console.log('PASS social hover/context stability: no hover overflow jitter, fixed hover geometry, and context menus survive layout scroll.');
