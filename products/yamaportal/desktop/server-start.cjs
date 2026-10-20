function listen(server,port,host){return new Promise((resolve,reject)=>{const onListening=()=>{cleanup();resolve(server.address());};const onError=error=>{cleanup();reject(error);};const cleanup=()=>{server.removeListener('listening',onListening);server.removeListener('error',onError);};server.once('listening',onListening);server.once('error',onError);server.listen(port,host);});}
async function listenPortal(server,preferredPort,host='127.0.0.1'){
 try{return {address:await listen(server,preferredPort,host),usedFallback:false};}
 catch(error){if(preferredPort===0||error?.code!=='EADDRINUSE')throw error;return {address:await listen(server,0,host),usedFallback:true};}
}
module.exports={listenPortal};
