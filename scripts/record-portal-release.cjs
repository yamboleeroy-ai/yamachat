'use strict';
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const file=path.join(root,'release-feed.json');
const allowed=new Set(['yamaportal','yamachat','yamasearch','yamahelp','yamaview','yamamaker']);
const input=process.argv[2];
if(!input){console.error('Usage: node scripts/record-portal-release.cjs <verified-release-entry.json>');process.exit(2);}
const entry=JSON.parse(fs.readFileSync(path.resolve(input),'utf8'));
if(!allowed.has(entry.app))throw Error('Unknown Yama application in release entry.');
for(const key of ['id','version','title','summary','details','releasedAt'])if(typeof entry[key]!=='string'||!entry[key].trim())throw Error(`Release entry requires ${key}.`);
if(entry.id.length>100||entry.version.length>40||entry.title.length>160||entry.summary.length>500||entry.details.length>10000)throw Error('Release entry exceeds allowed text size.');
if(!/^[a-zA-Z0-9._:-]+$/.test(entry.id)||!Number.isFinite(Date.parse(entry.releasedAt)))throw Error('Release id or timestamp is invalid.');
if(!Array.isArray(entry.platforms)||entry.platforms.length<1||entry.platforms.length>8||entry.platforms.some(value=>typeof value!=='string'||!value.trim()||value.length>60))throw Error('Release platforms are invalid.');
if(!['update','new-app'].includes(entry.kind))throw Error('Release kind must be update or new-app.');
const feed=JSON.parse(fs.readFileSync(file,'utf8'));
if(feed.schemaVersion!==1||!Array.isArray(feed.releases))throw Error('Unexpected release feed format.');
const clean={id:entry.id,app:entry.app,kind:entry.kind,version:entry.version,title:entry.title.trim(),summary:entry.summary.trim(),details:entry.details.trim(),releasedAt:new Date(entry.releasedAt).toISOString(),platforms:entry.platforms.map(value=>value.trim())};
const releases=[clean,...feed.releases.filter(item=>item.id!==clean.id)].sort((a,b)=>Date.parse(b.releasedAt)-Date.parse(a.releasedAt)).slice(0,100);
fs.writeFileSync(file,JSON.stringify({schemaVersion:1,releases},null,2)+'\n');
console.log(`Recorded verified ${clean.app} release ${clean.version}.`);
