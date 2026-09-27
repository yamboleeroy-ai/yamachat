import fs from 'node:fs';
const js=fs.readFileSync('web/stream-viewer.js','utf8'),css=fs.readFileSync('web/stream-viewer.css','utf8');
for(const file of ['index.html','desktop/desktop-client.html']){
 let html=fs.readFileSync(file,'utf8');
 const start=html.indexOf('// One app-owned layer'),end=html.indexOf('// Register every feature',start);
 if(start<0||end<0)throw Error('Current viewer boundary missing in '+file);
 html=html.slice(0,start)+js.replace('const YC_STREAM_DESKTOP=false;',`const YC_STREAM_DESKTOP=${file.startsWith('desktop/')};`)+'\n'+html.slice(end);
 html=html.replace(/<style id="ycStreamViewerStyleV2">[\s\S]*?<\/style>/,'<style id="ycStreamViewerStyleV2">'+css+'</style>');
 fs.writeFileSync(file,html);
}
