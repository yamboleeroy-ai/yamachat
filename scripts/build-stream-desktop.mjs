import fs from 'node:fs';
// Current packaged 1.0.99-derived source is authoritative. No historical regeneration.
fs.mkdirSync('desktop-client-dist',{recursive:true});
fs.copyFileSync('desktop/desktop-client.html','desktop-client-dist/desktop-client.html');
