import fs from 'node:fs';
import {withStreamViewer} from './stream-viewer.mjs';

const file='desktop/desktop-client.html';
const source=fs.readFileSync(file,'utf8');
const output=withStreamViewer(source,{desktop:true});
fs.writeFileSync(file,output);
console.log('Applied verified independent stream viewer to Windows desktop client.');
