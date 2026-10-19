/* Startup failures must leave a recoverable screen, not an endless spinner. */
(() => {
  let done = false, timer;
  function fail() {
    if (done) return;
    const splash = document.getElementById('ycBootSplash');
    if (!splash || splash.classList.contains('hidden')) return;
    let box = document.getElementById('ycBootRecovery');
    if (box) return;
    box = document.createElement('div');
    box.id = 'ycBootRecovery';
    box.style.cssText = 'max-width:420px;margin:18px auto;text-align:center;padding:12px;color:#dbeef8';
    const text = document.createElement('p');
    text.textContent = 'Načtení aplikace se nepodařilo dokončit. Zkontroluj připojení a zkus to znovu.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Zkusit znovu';
    retry.style.cssText = 'padding:10px 18px;border:1px solid #7b68ee;border-radius:8px;background:#172635;color:white;cursor:pointer';
    retry.onclick = () => location.reload();
    box.append(text, retry);
    (splash.firstElementChild || splash).appendChild(box);
  }
  function begin() {
    done = false;
    clearTimeout(timer);
    document.getElementById('ycBootRecovery')?.remove();
    timer = setTimeout(fail, 30000);
  }
  begin();
  window.addEventListener('error', event => {
    if (event.target?.tagName === 'SCRIPT' || event.error) fail();
  }, true);
  window.addEventListener('unhandledrejection', fail);
  window.YamachatBootGuard = Object.freeze({begin, ready() {
    done = true;
    clearTimeout(timer);
    document.getElementById('ycBootRecovery')?.remove();
  }});
})();
