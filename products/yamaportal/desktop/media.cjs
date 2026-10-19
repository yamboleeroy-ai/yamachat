'use strict';
function installDisplayPicker({win,origin,desktopCapturer,dialog,smoke=false,platform=process.platform}){
  win.webContents.session.setDisplayMediaRequestHandler(async(request,callback)=>{
    const valid=()=>{
      try{return !smoke&&!win.isDestroyed()&&request.userGesture&&request.videoRequested&&request.frame
        &&new URL(request.frame.url).origin===origin
        &&new URL(request.frame.url).pathname==='/modules/yamachat/index.html'
        &&request.securityOrigin===origin;}catch{return false;}
    };
    try{
      if(!valid())return callback({});
      const sources=(await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:0,height:0},fetchWindowIcons:false})).slice(0,16);
      if(!sources.length||!valid())return callback({});
      const canAudio=platform==='win32'&&request.audioRequested;
      const choice=await dialog.showMessageBox(win,{type:'question',title:'Sdílení obrazovky v Yamachatu',message:'Vyber, co chceš sdílet.',detail:'Ostatní účastníci uvidí obsah vybraného okna nebo obrazovky.',buttons:['Zrušit',...sources.map(source=>source.name)],defaultId:0,cancelId:0,noLink:true,...(canAudio?{checkboxLabel:'Sdílet také systémový zvuk',checkboxChecked:false}:{})});
      if(!valid()||!Number.isInteger(choice.response)||choice.response<1||choice.response>sources.length)return callback({});
      callback({video:sources[choice.response-1],...(canAudio&&choice.checkboxChecked?{audio:'loopback'}:{})});
    }catch{callback({});}
  });
}
module.exports={installDisplayPicker};
