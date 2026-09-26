import fs from 'node:fs';
import path from 'node:path';

const file=path.resolve(process.cwd(),process.argv[2]||'android/app/google-services.json');
const releasePath=path.resolve(process.cwd(),process.argv[3]||'android-release.json');

function fail(message){
  console.error('FCM CONFIG ERROR:',message);
  process.exit(1);
}

if(!fs.existsSync(file))fail('google-services.json is missing at '+file);
if(!fs.existsSync(releasePath))fail('android-release.json is missing at '+releasePath);

let cfg,release;
try{cfg=JSON.parse(fs.readFileSync(file,'utf8'))}catch{fail('google-services.json is not valid JSON')}
try{release=JSON.parse(fs.readFileSync(releasePath,'utf8'))}catch{fail('android-release.json is not valid JSON')}

const expected=String(release.applicationId||'').trim();
if(!expected)fail('Expected applicationId is empty');

const projectId=String(cfg?.project_info?.project_id||'').trim();
const projectNumber=String(cfg?.project_info?.project_number||'').trim();
if(!projectId)fail('project_info.project_id is missing');
if(!projectNumber)fail('project_info.project_number is missing');

const clients=Array.isArray(cfg?.client)?cfg.client:[];
const client=clients.find(x=>String(x?.client_info?.android_client_info?.package_name||'').trim()===expected);
if(!client)fail('No Firebase Android client matches '+expected);

const appId=String(client?.client_info?.mobilesdk_app_id||'').trim();
if(!appId)fail('mobilesdk_app_id is missing for '+expected);

const apiKeys=Array.isArray(client?.api_key)?client.api_key.map(x=>String(x?.current_key||'').trim()).filter(Boolean):[];
if(!apiKeys.length)fail('Firebase API key is missing for '+expected);

const result={ok:true,applicationId:expected,projectId,projectNumber,mobileSdkAppId:appId};
console.log(JSON.stringify(result));
if(process.env.GITHUB_OUTPUT){
  fs.appendFileSync(process.env.GITHUB_OUTPUT,
    'firebase_project_id='+projectId+'\n'+
    'firebase_project_number='+projectNumber+'\n'+
    'firebase_mobile_app_id='+appId+'\n'
  );
}
