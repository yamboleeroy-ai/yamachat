import fs from 'node:fs';

const read=name=>fs.readFileSync(new URL('../web/'+name,import.meta.url),'utf8');
export function withAccountMessages(html){
  const marker='// Message actions - reactions, replies, unread markers and global reports';
  if(!html.includes(marker))throw Error('Missing account messages insertion boundary');
  html=html.replace(marker,read('account-messages.js')+'\n\n'+marker);
  return html.replace('</head>','<style id="ycAccountMessages">'+read('account-messages.css')+'</style>\n</head>');
}
