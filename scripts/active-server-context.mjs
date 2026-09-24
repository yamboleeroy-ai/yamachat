import fs from 'node:fs';

const read=name=>fs.readFileSync(new URL('../web/'+name,import.meta.url),'utf8');
export function withActiveServerContext(html){
  const marker='// Message actions - reactions, replies, unread markers and global reports';
  if(!html.includes(marker))throw Error('Missing active server context insertion boundary');
  html=html.replace(marker,read('active-server-context.js')+'\n\n'+marker);
  return html.replace('</head>','<style id="ycActiveServerContextStyle">'+read('active-server-context.css')+'</style>\n</head>');
}
