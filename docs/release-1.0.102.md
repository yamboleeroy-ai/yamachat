Yamachat 1.0.102

- Opravený návrat Windows aplikace z pozadí přes ikonu na taskbaru: při nativním restore/show/focus se znovu aktivuje vstup okna a renderer/iframe focus. Běžící stream ani voice se kvůli opravě nereloadují ani neodpojují.
- Do produkčního desktopu jsou povýšené ověřené opravy z testovací větve social-hover-context-7: rychlejší progresivní načítání DM médií, rušení zastaralých requestů, stabilnější presence při více současných klientech a méně zbytečných refreshů Members/Friends.
- Context menu a hover už nemají při asynchronním načítání skákat nebo se zavírat kvůli programovému scrollu; DM/Friends panel nemá vytvářet horizontální hover jitter.
- Web, Android a iOS PWA dostávají stejné ověřené behaviorální opravy bez kopírování desktopového rozložení. Mobilní responsive layout, portrait/landscape, safe-area, vysouvací panely a navigace zůstávají zachované.
- Přepnutí zobrazeného serveru během aktivního voice samo neukončí voice spojení; stream a soundboard používají kontext skutečně připojené voice komunity.
- Fullscreen stream controls se po neaktivitě schovají a pointer/touch interakce je znovu zobrazí.
- Na dotykových zařízeních se interaktivní karty, kanály, členové, taby a context menu neoznačují systémovým výběrem textu; text zpráv, inputy a editovatelný obsah zůstávají kopírovatelné.
- Zachované notifikace, FCM/WNS, updater, stream, voice, DM, Friends, profily, servery, kanály a mobilní panely.

Poznámka: iOS PWA je vydávána společně s webem. Nativní TestFlight build se publikuje pouze pokud jsou v GitHubu nakonfigurované Apple distribuční secrets.

Předchozí vydání v1.0.101 zůstává dostupné pro návrat.
