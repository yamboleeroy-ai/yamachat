const {app,BrowserWindow,ipcMain,dialog,Menu,shell,safeStorage,globalShortcut}=require('electron');const fs=require('node:fs');const path=require('node:path');
const {createPortalServer}=require('../preview/server.cjs');const launcher=require('./launcher.cjs');
const {DesktopOAuth}=require('./oauth.cjs');
const {installDisplayPicker}=require('./media.cjs');
let win,server,origin,desktopOAuth,selected={};
const returnToken=require('node:crypto').randomBytes(32).toString('hex');
const smoke=process.argv.includes('--smoke-test');
// Separate profile directory: never reuse Yamachat/Search app data.
app.setPath('userData',smoke?(app.isPackaged?path.join(app.getPath('temp'),'Yamaportal-Smoke-'+process.pid):path.join(__dirname,'.smoke-profile')):process.env.PORTABLE_EXECUTABLE_DIR?path.join(process.env.PORTABLE_EXECUTABLE_DIR,'YamaportalData'):path.join(app.getPath('appData'),'Yamaportal-Preview'));
if(!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',()=>{win?.show();win?.focus();});
app.whenReady().then(async()=>{
 let nativeBridgeReady=false,resolveNativeBridge;const nativeBridgePromise=new Promise(resolve=>{resolveNativeBridge=resolve;});
 const settings=path.join(app.getPath('userData'),'app-paths.json');try{selected=JSON.parse(fs.readFileSync(settings,'utf8'));}catch{}
 const serverOptions={oauthCallback:url=>desktopOAuth?.receive(url)===true,returnToken,onPortalReturn:()=>{if(win?.isMinimized())win.restore();win?.show();win?.focus();}};server=createPortalServer(serverOptions);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(smoke?0:4188,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;serverOptions.origin=origin;
 win=new BrowserWindow({icon:path.join(__dirname,'../preview/dist/assets/yamaportal.png'),frame:false,show:!smoke,title:'Yamaportal · testovací verze',width:1250,height:860,backgroundColor:'#050c1b',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 installDisplayPicker({win,origin,desktopCapturer:require('electron').desktopCapturer,dialog,smoke});
 win.webContents.on('preload-error',(_event,_file,error)=>console.error('Preload initialization failed:',error.name,error.message));
 if(smoke)win.webContents.session.webRequest.onBeforeRequest({urls:['https://*/*','wss://*/*']},(details,callback)=>callback({cancel:true}));
 win.webContents.session.setPermissionRequestHandler(async(contents,permission,callback,details)=>{if(smoke){callback(false);return;}let valid=false;try{valid=new URL(details.requestingUrl).origin===origin;}catch{}if(contents!==win.webContents||!valid||!['media','display-capture','notifications','fullscreen'].includes(permission)){callback(false);return;}const result=await dialog.showMessageBox(win,{type:'question',buttons:['Nepovolit','Povolit'],defaultId:0,cancelId:0,title:'Oprávnění Yamachatu',message:'Povolit oprávnění: '+permission+'?'});callback(result.response===1);});
 function trusted(event){if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||new URL(event.senderFrame.url).origin!==origin)throw new Error('Nedovolený požadavek.');}
 function id(value){if(!Object.hasOwn(launcher.names,value))throw new Error('Neznámá aplikace.');return value;}
 const policy=JSON.parse(fs.readFileSync(path.join(__dirname,'../preview/dist/identity-providers.json'),'utf8'));
 desktopOAuth=new DesktopOAuth({origin,policy,openExternal:url=>shell.openExternal(url),deliver:url=>{win.webContents.send('portal:oauth-callback',url);if(win.isMinimized())win.restore();win.show();win.focus();}});
 ipcMain.handle('portal:oauth-begin',(event,url,callback)=>{trusted(event);return desktopOAuth.begin(url,callback);});
 ipcMain.handle('portal:oauth-cancel',event=>{trusted(event);desktopOAuth.cancel();});
 ipcMain.handle('portal:storage',(event,action,key,value)=>{trusted(event);if(!/^yamaportal-auth-v1(?:-code-verifier|-user)?$/.test(key))throw new Error('Neplatné úložiště.');if(!safeStorage.isEncryptionAvailable())throw new Error('Zabezpečené úložiště není dostupné.');const file=path.join(app.getPath('userData'),key+'.encrypted');if(action==='get'){try{return safeStorage.decryptString(fs.readFileSync(file));}catch{return null;}}if(action==='set'){if(typeof value!=='string'||value.length>100000)throw new Error('Neplatná relace.');fs.writeFileSync(file,safeStorage.encryptString(value));return;}if(action==='remove'){fs.rmSync(file,{force:true});return;}throw new Error('Neplatná operace.');});
 ipcMain.handle('portal:apps',event=>{trusted(event);nativeBridgeReady=true;resolveNativeBridge();return Object.keys(launcher.names).map(key=>({id:key,installed:!!launcher.detect(key,selected[key])}));});
 ipcMain.handle('portal:choose',async(event,key)=>{trusted(event);id(key);const result=await dialog.showOpenDialog(win,{title:'Vyber '+launcher.names[key],properties:['openFile'],filters:[{name:launcher.names[key],extensions:['exe']}]});if(result.canceled)return {cancelled:true};selected[key]=launcher.validate(key,result.filePaths[0]);fs.writeFileSync(settings,JSON.stringify(selected,null,2));return {selected:true};});
 ipcMain.handle('portal:launch',async(event,key)=>{trusted(event);id(key);const file=launcher.detect(key,selected[key]);if(!file)throw new Error('Nejdřív vyber nainstalovanou nebo portable aplikaci.');return launcher.launch(key,file,key==='search'?{YAMAPORTAL_ACCOUNT:'central',YAMAPORTAL_RETURN_ORIGIN:origin,YAMAPORTAL_RETURN_TOKEN:returnToken}:{});});
 ipcMain.handle('portal:window',(event,action)=>{trusted(event);if(action==='minimize')win.minimize();else if(action==='maximize'){if(win.isMaximized())win.unmaximize();else win.maximize();}else if(action==='close')win.close();else throw new Error('Neplatná akce okna.');});
 ipcMain.handle('portal:return',event=>{trusted(event);win.show();win.focus();});
 win.webContents.setWindowOpenHandler(({url})=>{try{const target=new URL(url);if(target.protocol==='https:'&&['yamachat.eu','updates.yamachat.eu'].includes(target.hostname))void shell.openExternal(url);}catch{}return {action:'deny'};});
 win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
 // An always-available OS menu returns focus without closing the launched app.
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Yamaportal',submenu:[{label:'Zpět do Yamaportalu',accelerator:'Ctrl+Shift+P',click:()=>{win.show();win.focus();}},{role:'quit',label:'Ukončit Yamaportal'}]}]));
 globalShortcut.register('CommandOrControl+Shift+P',()=>{if(win.isMinimized())win.restore();win.show();win.focus();});
 win.setMenuBarVisibility(false);
 await win.loadURL(origin+'/#domu');
 if(!smoke){win.show();win.focus();}
 if(smoke){await Promise.race([nativeBridgePromise,new Promise(resolve=>setTimeout(resolve,2000))]);const report={checkedAt:new Date().toISOString(),desktopLoaded:true,nativeBridgeReady,secureStorage:safeStorage.isEncryptionAvailable(),nativeApps:Object.keys(launcher.names).map(key=>({id:key,installed:!!launcher.detect(key,selected[key])})),accountRequiredForLauncher:false};console.log(JSON.stringify(report));if(process.env.YAMAPORTAL_SMOKE_REPORT&&path.isAbsolute(process.env.YAMAPORTAL_SMOKE_REPORT))fs.writeFileSync(process.env.YAMAPORTAL_SMOKE_REPORT,JSON.stringify(report,null,2));app.exit(nativeBridgeReady?0:1);}
}).catch(error=>{console.error('Yamaportal se nepodařilo spustit:',error.code||error.message);app.exit(1);});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>{globalShortcut.unregisterAll();server?.close();});
}
