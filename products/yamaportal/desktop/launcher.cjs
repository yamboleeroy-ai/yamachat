const path=require('node:path');const fs=require('node:fs');const {spawn}=require('node:child_process');
const names={chat:'Yamachat.exe',search:'YamaSearch.exe',help:'YamaHelp.Desktop.exe'};
function validate(id,file){if(!names[id]||!path.isAbsolute(file)||path.basename(file).toLowerCase()!==names[id].toLowerCase())throw new Error('Vyber skutečný spustitelný soubor dané aplikace.');const stat=fs.statSync(file);if(!stat.isFile())throw new Error('Aplikace nebyla nalezena.');return fs.realpathSync(file);}
function candidates(id,local=process.env.LOCALAPPDATA){if(!names[id]||!local)return [];const folder={chat:'Yamachat',search:'YamaSearch',help:'YamaHelp'}[id];return [path.join(local,'Programs',folder,names[id])];}
function detect(id,selected){for(const file of [...(selected?[selected]:[]),...candidates(id)]){try{return validate(id,file);}catch{}}return null;}
function launch(id,file,portalEnvironment={}){const executable=validate(id,file);return new Promise((resolve,reject)=>{const child=spawn(executable,[],{cwd:path.dirname(executable),detached:true,stdio:'ignore',env:{...process.env,...portalEnvironment},shell:false,windowsHide:false});child.once('error',()=>reject(new Error('Aplikaci se nepodařilo spustit.')));child.once('spawn',()=>{child.unref();resolve({opened:true});});});}
module.exports={names,validate,candidates,detect,launch};
