'use strict';

/*
 * YamaSearch for iOS is a launcher PWA, not an embedded full web browser.
 * Apple iOS/WebKit won't allow embedding arbitrary third-party pages inside a PWA.
 */
(() => {
  const PREFIX = 'yamasearch-ios-v1:';
  const STORE = {
    bookmarks:'bookmarks',
    history:'history',
    engine:'engine',
    saveHistory:'save-history'
  };
  const ENGINES = Object.freeze({
    duckduckgo:'https://duckduckgo.com/?q=',
    google:'https://www.google.com/search?q=',
    bing:'https://www.bing.com/search?q='
  });
  const $ = id => document.getElementById(id);
  const notify = message => {
    const el = $('message');
    el.textContent = message;
    el.classList.toggle('visible', Boolean(message));
  };
  const read = (key, fallback) => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      notify('Úložiště tohoto zařízení není dostupné. Změnu nebylo možné uložit.');
      return false;
    }
  };
  const safeWebUrl = input => {
    if (typeof input !== 'string' || input.length > 2048) return null;
    try {
      const url = new URL(input.trim());
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password) return null;
      return url.href;
    } catch { return null; }
  };
  const queryToUrl = raw => {
    const value = raw.trim();
    if (!value || value.length > 2048) return null;
    if (/^https?:\/\//i.test(value)) return safeWebUrl(value);
    // Scheme-like strings are not accepted as navigation targets.
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
    if (!/\s/.test(value) && /^(?:[^./\s]+\.)+[^./\s]+(?::\d+)?(?:[/?#].*)?$/u.test(value)) {
      const url = safeWebUrl('https://' + value);
      if (url) return url;
    }
    const engine = read(STORE.engine, 'duckduckgo');
    return (ENGINES[engine] || ENGINES.duckduckgo) + encodeURIComponent(value);
  };
  const bookmarks = () => {
    const result = read(STORE.bookmarks, []);
    return Array.isArray(result) ? result.filter(item =>
      item && typeof item.name === 'string' && safeWebUrl(item.url)).slice(0,80) : [];
  };
  const history = () => {
    const result = read(STORE.history, []);
    return Array.isArray(result) ? result.filter(item =>
      item && typeof item.name === 'string' && safeWebUrl(item.url)).slice(0,40) : [];
  };
  const record = (url, name) => {
    if (read(STORE.saveHistory, false) !== true) return;
    const valid = safeWebUrl(url);
    if (!valid) return;
    const other = history().filter(item => item.url !== valid);
    other.unshift({url:valid,name:String(name || valid).slice(0,100)});
    if (write(STORE.history, other.slice(0,40))) renderHistory();
  };
  function makeLinkItem(item, removable) {
    const row = document.createElement('div');
    row.className = 'link-item';
    const a = document.createElement('a');
    a.href = item.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const name = document.createElement('span');
    name.className = 'link-name';
    name.textContent = item.name.slice(0,100);
    const url = document.createElement('small');
    url.className = 'link-url';
    url.textContent = item.url;
    a.append(name,url);
    a.addEventListener('click', () => record(item.url,item.name));
    row.append(a);
    if (removable) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-link';
      remove.setAttribute('aria-label', 'Odstranit ze záložek: ' + item.name);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        if (write(STORE.bookmarks, bookmarks().filter(entry => entry.url !== item.url))) {
          renderBookmarks();
          notify('Stránka byla odebrána z oblíbených.');
        }
      });
      row.append(remove);
    }
    return row;
  }
  function renderBookmarks() {
    const items = bookmarks();
    $('favorites').replaceChildren(...items.map(item => makeLinkItem(item,true)));
    $('favorites-empty').hidden = items.length > 0;
  }
  function renderHistory() {
    const items = history();
    $('recents').replaceChildren(...items.map(item => makeLinkItem(item,false)));
    $('recents-empty').hidden = items.length > 0;
  }
  $('search-form').addEventListener('submit', event => {
    event.preventDefault();
    const raw = $('search-input').value;
    const url = queryToUrl(raw);
    if (!url) {
      notify('Zadej platný HTTPS/HTTP odkaz nebo hledaný výraz.');
      return;
    }
    notify('Odkaz se otevře v Safari. Historie ostatních stránek se v YamaSearch neukládá.');
    record(url,raw.trim());
    const external = document.createElement('a');
    external.href = url;
    external.target = '_blank';
    external.rel = 'noopener noreferrer';
    document.body.append(external);
    external.click();
    external.remove();
  });
  $('search-engine').value = ENGINES[read(STORE.engine,'duckduckgo')] ?
    read(STORE.engine,'duckduckgo') : 'duckduckgo';
  $('search-engine').addEventListener('change', event => {
    const engine = event.target.value;
    if (ENGINES[engine]) write(STORE.engine,engine);
  });
  $('show-add').addEventListener('click', () => {
    $('add-form').hidden = false;
    $('bookmark-name').focus();
  });
  $('cancel-add').addEventListener('click', () => { $('add-form').hidden = true; });
  $('add-form').addEventListener('submit', event => {
    event.preventDefault();
    const url = safeWebUrl($('bookmark-url').value);
    const name = $('bookmark-name').value.trim().slice(0,80);
    if (!url || !name) {
      notify('Pro oblíbenou stránku potřebuješ název a platnou HTTP(S) adresu.');
      return;
    }
    const items = bookmarks().filter(item => item.url !== url);
    items.unshift({url,name});
    if (write(STORE.bookmarks, items.slice(0,80))) {
      $('add-form').reset();
      $('add-form').hidden = true;
      renderBookmarks();
      notify('Stránka byla uložena do oblíbených.');
    }
  });
  $('save-history').checked = read(STORE.saveHistory,false) === true;
  $('save-history').addEventListener('change', event => {
    if (write(STORE.saveHistory,event.target.checked))
      notify(event.target.checked ? 'Lokální historie YamaSearch je zapnutá.' : 'Lokální historie YamaSearch je vypnutá.');
  });
  $('clear-history').addEventListener('click', () => {
    if (!confirm('Smazat odkazy otevřené z YamaSearch na tomto zařízení?')) return;
    if (write(STORE.history, [])) {
      renderHistory();
      notify('Lokální historie YamaSearch byla vymazána. Historie Safari se tím nemění.');
    }
  });
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) {
    $('install-title').textContent = 'YamaSearch už běží z plochy';
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', {scope:'./'}).catch(() => {
        notify('Offline režim není dostupný. Zkontroluj připojení a HTTPS.');
      });
    });
  }
  renderBookmarks();
  renderHistory();
})();
