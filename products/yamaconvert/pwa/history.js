/* Small local history store. Source files are never saved; small output blobs may be kept for re-download. */
(()=>{'use strict';
const DB_NAME='yamaconver-history',STORE='conversions',MAX_ENTRIES=40,MAX_AGE_MS=30*24*60*60*1000,MAX_BLOB_BYTES=50*1024*1024,MAX_TOTAL_BLOB_BYTES=150*1024*1024;
let dbPromise;
function db(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{if(!('indexedDB'in window)){reject(new Error('Historie není v tomto prohlížeči dostupná.'));return}const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{const database=request.result;if(!database.objectStoreNames.contains(STORE))database.createObjectStore(STORE,{keyPath:'id'})};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Databázi historie se nepodařilo otevřít.'))});return dbPromise}
function transaction(mode,run){return db().then(database=>new Promise((resolve,reject)=>{const tx=database.transaction(STORE,mode),store=tx.objectStore(STORE);let result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||new Error('Zápis historie selhal.'));tx.onabort=()=>reject(tx.error||new Error('Zápis historie byl přerušen.'));try{const request=run(store);if(request){request.onsuccess=()=>{result=request.result};request.onerror=()=>reject(request.error||new Error('Operace historie selhala.'))}}catch(error){reject(error);try{tx.abort()}catch{}}}))}
function all(){return transaction('readonly',store=>store.getAll()).then(records=>records||[])}
function put(record){return transaction('readwrite',store=>store.put(record))}
function remove(id){return transaction('readwrite',store=>store.delete(id))}
function clear(){return transaction('readwrite',store=>store.clear())}
async function trim(){const records=(await all()).sort((a,b)=>b.createdAt-a.createdAt),cutoff=Date.now()-MAX_AGE_MS;let kept=0,bytes=0;for(const record of records){const blobSize=record.blob?.size||0;if(record.createdAt<cutoff||kept>=MAX_ENTRIES||bytes+blobSize>MAX_TOTAL_BLOB_BYTES){await remove(record.id);continue}kept++;bytes+=blobSize}}
const ready=trim().catch(error=>{console.warn('Úklid historie se nepodařil:',error)});
async function save(job){try{await ready;const id=window.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;const record={id,createdAt:Date.now(),sourceName:job.file?.name||'Soubor',state:job.state,outputName:job.outputName||'',outputSize:job.output?.size||0,outputType:job.output?.type||'',message:job.state.startsWith('Chyba:')?job.state.slice(7):'',blob:job.output&&job.output.size<=MAX_BLOB_BYTES?job.output:null};try{await put(record)}catch(error){if(!record.blob)throw error;record.blob=null;await put(record)}await trim();window.dispatchEvent(new Event('yama-history-updated'));return id}catch(error){console.warn('Historie převodu se neuložila:',error);return null}}
async function list(){await ready;return all()}
window.YamaHistory=Object.freeze({list,remove,clear,save});
})();
