(() => {
  'use strict';

  const host = String(location.hostname || '').toLowerCase();
  if ((host !== 'youtube.com' && !host.endsWith('.youtube.com')) || window.top !== window) return;

  const pruneAdFields = value => {
    if (!value || typeof value !== 'object') return 0;
    let removed = 0;

    const pruneObject = object => {
      if (!object || typeof object !== 'object') return;
      for (const key of ['adPlacements', 'adSlots', 'playerAds']) {
        if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
        try {
          delete object[key];
          removed++;
        } catch {}
      }
    };

    pruneObject(value);
    pruneObject(value.playerResponse);
    if (Array.isArray(value)) {
      for (const item of value) {
        pruneObject(item);
        pruneObject(item && item.playerResponse);
      }
    }
    return removed;
  };

  const isPlayerApi = rawUrl => {
    try {
      const url = new URL(rawUrl, location.href);
      const requestHost = url.hostname.toLowerCase();
      if (requestHost !== 'youtube.com' && !requestHost.endsWith('.youtube.com')) return false;
      return url.pathname.includes('/youtubei/v1/player')
        || /\/player$/.test(url.pathname)
        || url.pathname.includes('/get_watch');
    } catch {
      return false;
    }
  };

  // This hook is installed at document start, before YouTube's own scripts can
  // assign the embedded response used for the very first video/preroll.
  try {
    let initialPlayerResponse;
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      get() { return initialPlayerResponse; },
      set(value) {
        pruneAdFields(value);
        initialPlayerResponse = value;
      }
    });
  } catch {}

  // Later videos and SPA navigations request the same player data through fetch.
  // Preserve the successful response and remove only the advertising metadata;
  // blocking YouTube's playback hosts directly would also break normal video.
  const nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  if (nativeFetch) {
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      const rawUrl = typeof args[0] === 'string'
        ? args[0]
        : ((args[0] && args[0].url) || response.url || '');
      if (!isPlayerApi(rawUrl)) return response;

      try {
        const text = await response.clone().text();
        if (!text || (text[0] !== '{' && text[0] !== '[')) return response;
        const data = JSON.parse(text);
        if (pruneAdFields(data) <= 0) return response;
        const headers = new Headers(response.headers);
        headers.delete('content-length');
        headers.delete('content-encoding');
        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      } catch {
        return response;
      }
    };
  }

})();
