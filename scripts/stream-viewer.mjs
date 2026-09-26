import fs from 'node:fs';

// Transform both current platform clients. Never edit the immutable reference.
// Every removed block was audited: discovery, audio transport and RTC stay intact.
export function withStreamViewer(input,{desktop=false}={}) {
  let html=input.replaceAll('\r\n','\n');
  if(html.includes('id="ycStreamViewerStyleV2"'))throw Error('Stream viewer already installed');
  const cut=(start,end,replacement='')=>{
    const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
    if(a<0||b<0)throw Error('Stream migration boundary missing: '+start);
    html=html.slice(0,a)+replacement+html.slice(b);
  };
  cut('function renderScreenShareStage(){','function attachVoiceScreen(',
    'function ycSyncStreamViewer(){ycStreamViewer.sync()}\n');
  cut('const ycBridgeRenderScreenShareStage=renderScreenShareStage','\n', '');
  cut('renderScreenShareStage=function(...args)', '\n', '');
  cut('// Yamachat Desktop - expand any active screen share, local or remote.',
    '// Discord avatar is optional.');
  for(const name of ['ycStreamVolumeScript','ycDeadShareCleanup','ycMultiStreamViewerScript','ycStreamFullscreenLocalV3016Script','ycStreamResizeScript']){
    cut('// Integrated extension: '+name+'\n','// Integrated extension:');
  }
  html=html.replace(/\s*<div id="screenShareStage" class="screen-share-stage hidden"><\/div>/,'');
  html=html.replaceAll('renderScreenShareStage','ycSyncStreamViewer');
  // These selectors belong solely to the removed stage/overlay; retain mixed
  // rules' unrelated selectors (including voice, discovery and theme rules).
  const obsolete=/(?:#screenShareStage|\.screen-share-(?:stage|head|grid|card|label)|\.yc-share-(?:overlay|placeholder)|\.yc-stream-(?:card-stop|volume-safe|resize-handle|user-sized|resizing)|\.yc-no-live-stream)/;
  html=html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/g,(_,attrs,css)=>{
    css=css.replace(/([^{}]+)\{([^{}]*)\}/g,(rule,selector,body)=>{
      if(!obsolete.test(selector))return rule;
      const kept=selector.split(/,(?![^()]*\))/).filter(s=>!obsolete.test(s));
      return kept.length?kept.join(',')+'{'+body+'}':'';
    });
    return '<style'+attrs+'>'+css+'</style>';
  });
  for(const name of ['ycStreamLayoutFitStyle','ycStreamVolumeStyle','ycMultiStreamViewerStyle','ycStreamPolishV3014Style','ycStreamFullscreenLocalV3016Style','ycStreamResizeStyle']){
    html=html.replace(new RegExp('<style id="'+name+'">[\\s\\S]*?<\\/style>'),'');
  }
  // A stream track can briefly mute during network recovery. Keep the same
  // MediaStream/video binding; the pending state owns retry/timeout instead.
  html=html.replace('remoteScreenStreams.delete(peerId);if(screenWatchingByUser.has(peerId)&&(voiceScreenActiveByUser.has(peerId)||ycStreamInfo(peerId)))',
    'if(screenWatchingByUser.has(peerId)&&(voiceScreenActiveByUser.has(peerId)||ycStreamInfo(peerId)))');
  const marker='// Register every feature before restoring a cached session.';
  if(!html.includes(marker))throw Error('Stream viewer lifecycle boundary missing');
  const runtime=fs.readFileSync(new URL('../web/stream-viewer.js',import.meta.url),'utf8').replace('const YC_STREAM_DESKTOP=false;',`const YC_STREAM_DESKTOP=${desktop};`);
  const css=fs.readFileSync(new URL('../web/stream-viewer.css',import.meta.url),'utf8');
  html=html.replace(marker,runtime+'\n'+marker)
    .replace('</head>','<style id="ycStreamViewerStyleV2">'+css+'</style>\n</head>');
  for(const old of ['screenShareStage','ycShareOverlay','__ycMultiStreamViewerInstalled','__ycStreamResizeInstalled']){
    if(html.includes(old))throw Error('Old stream UI remains: '+old);
  }
  return html;
}
