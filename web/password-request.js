;(()=>{
if(window.__ycPasswordRequestV2)return;window.__ycPasswordRequestV2=true;
let ycPasswordRequestBusy=false,ycPasswordSlowTimer=null,ycPasswordHardTimer=null;
const ycPasswordRequestStatus=(message,error=false)=>{
  const el=$('ycPasswordRequestStatus');if(!el)return;
  el.textContent=message;el.classList.add('show');el.classList.toggle('error',!!error);
};
const ycPasswordRequestOpen=()=>{
  const back=$('ycPasswordRequestBack'),input=$('ycPasswordRequestEmail');if(!back||!input)return;
  input.value=String($('email')?.value||'').trim();
  ycPasswordRequestStatus('',false);$('ycPasswordRequestStatus')?.classList.remove('show');
  back.classList.add('show');back.setAttribute('aria-hidden','false');
  setTimeout(()=>input.focus(),0);
};
const ycPasswordRequestClose=()=>{
  if(ycPasswordRequestBusy)return;
  const back=$('ycPasswordRequestBack');if(!back)return;
  back.classList.remove('show');back.setAttribute('aria-hidden','true');
};
async function ycPasswordRequestSend(event){
  event?.preventDefault?.();if(ycPasswordRequestBusy)return;
  const form=$('ycPasswordRequestForm'),input=$('ycPasswordRequestEmail'),button=$('ycPasswordRequestSubmit');
  if(!form||!input||!button||!form.reportValidity())return;
  const email=String(input.value||'').trim();ycPasswordRequestBusy=true;button.disabled=true;button.textContent='Odesílám…';
  ycPasswordRequestStatus('Odesílám odkaz pro obnovu hesla…');
  clearTimeout(ycPasswordSlowTimer);clearTimeout(ycPasswordHardTimer);
  ycPasswordSlowTimer=setTimeout(()=>{if(ycPasswordRequestBusy)ycPasswordRequestStatus('E-mailový server odpovídá pomalu. Ještě čekám na potvrzení odeslání…')},8000);
  const hardTimeout=new Promise((_,reject)=>{ycPasswordHardTimer=setTimeout(()=>{const e=new Error('Recovery request timeout');e.code='yc_recovery_timeout';reject(e)},55000)});
  try{
    const result=await Promise.race([
      sb.auth.resetPasswordForEmail(email,{redirectTo:'https://yamachat.eu/reset-password.html'}),
      hardTimeout
    ]);
    const error=result?.error;
    if(error){
      const msg=error.status===429
        ?'Příliš mnoho žádostí. Počkej chvíli a zkus to znovu.'
        :(error.status===504||error.code==='request_timeout'
          ?'E-mailový server neodpověděl včas. Zkus to prosím znovu za chvíli.'
          :'Odkaz se teď nepodařilo odeslat. Zkus to prosím později.');
      ycPasswordRequestStatus(msg,true);return;
    }
    ycPasswordRequestStatus('Pokud k této adrese existuje účet Yamachat, požadavek byl přijat. Zkontroluj doručenou poštu i Spam.');
  }catch(error){
    ycPasswordRequestStatus(error?.code==='yc_recovery_timeout'
      ?'Odesílání trvá příliš dlouho. E-mailový server může být dočasně nedostupný; zkus to za chvíli znovu.'
      :'Nepodařilo se připojit k e-mailové službě. Zkontroluj internet a zkus to znovu.',true);
  }finally{
    clearTimeout(ycPasswordSlowTimer);clearTimeout(ycPasswordHardTimer);ycPasswordRequestBusy=false;button.disabled=false;button.textContent='Odeslat odkaz';
  }
}
$('ycForgotPassword')?.addEventListener('click',e=>{e.preventDefault();ycPasswordRequestOpen()});
$('ycPasswordRequestClose')?.addEventListener('click',ycPasswordRequestClose);
$('ycPasswordRequestBack')?.addEventListener('click',e=>{if(e.target===e.currentTarget)ycPasswordRequestClose()});
$('ycPasswordRequestForm')?.addEventListener('submit',ycPasswordRequestSend);
window.ycOpenPasswordRecovery=ycPasswordRequestOpen;
})();