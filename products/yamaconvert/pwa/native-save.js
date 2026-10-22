(() => {
  const waiters = new Map();
  const maxBytes = 100 * 1024 * 1024;

  window.onYamaConvertNativeSaveComplete = (id, ok, message) => {
    const waiter = waiters.get(id);
    if (!waiter) return;
    waiters.delete(id);
    clearTimeout(waiter.timer);
    if (ok) waiter.resolve(message);
    else waiter.reject(new Error(message || 'Soubor se nepodařilo uložit.'));
  };

  function nativeButton(job) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button';
    button.style.cssText = 'display:block;margin-top:5px;color:#b8f7e4;padding:5px 8px';
    button.textContent = 'Stáhnout';
    button.onclick = async () => {
      const bridge = window.YamaConvertAndroid;
      const id = `yc-save-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      button.disabled = true;
      button.textContent = 'Ukládám…';
      try {
        if (!job.output || job.output.size > maxBytes) throw new Error('Soubor překročil limit 100 MB.');
        if (!bridge?.beginConvertedFile?.(id, job.outputName, job.output.type || 'application/octet-stream'))
          throw new Error('Android nepřijal soubor k uložení.');
        const bytes = new Uint8Array(await job.output.arrayBuffer());
        const chunkSize = 192 * 1024;
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
          const parts = [];
          for (let i = 0; i < chunk.length; i += 32768)
            parts.push(String.fromCharCode(...chunk.subarray(i, Math.min(i + 32768, chunk.length))));
          if (!bridge.writeConvertedFileChunk(id, btoa(parts.join(''))))
            throw new Error('Soubor se nepodařilo předat Androidu.');
          if (offset && offset % (chunkSize * 8) === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
        const saved = new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            waiters.delete(id);
            reject(new Error('Ukládání souboru v Androidu trvalo příliš dlouho.'));
          }, 180000);
          waiters.set(id, { resolve, reject, timer });
        });
        if (!bridge.finishConvertedFile(id)) throw new Error('Android soubor nedokázal uložit.');
        button.textContent = await saved;
        button.disabled = false;
        if (window.YamaApp) window.YamaApp.notify('Soubor je uložený ve složce Stažené/YamaConvert.');
      } catch (error) {
        bridge?.cancelConvertedFile?.(id);
        const waiter = waiters.get(id);
        if (waiter) { clearTimeout(waiter.timer); waiters.delete(id); }
        button.disabled = false;
        button.textContent = 'Stáhnout';
        if (window.YamaApp) window.YamaApp.notify(error.message || 'Soubor se nepodařilo uložit.');
      }
    };
    return button;
  }

  window.YamaConvertNativeSave = Object.freeze({
    button(job) {
      if (window.YamaConvertAndroid?.isReady?.() && window.YamaConvertAndroid?.beginConvertedFile)
        return nativeButton(job);
      const link = document.createElement('a');
      link.href = job.outputUrl;
      link.download = job.outputName;
      link.className = 'button';
      link.style.cssText = 'display:block;margin-top:5px;text-decoration:none;color:#b8f7e4;padding:5px 8px';
      link.textContent = 'Stáhnout';
      return link;
    }
  });
})();
