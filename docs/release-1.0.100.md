Yamachat 1.0.100

- Opravený přenos zvuku vybrané aplikace přes nativní process loopback, bez automatického přepnutí na zvuk celého systému.
- Sdílení celé obrazovky vylučuje zvuk procesů Yamachatu. Známé virtuální výstupy (např. FxSound) bezpečně odmítne s vysvětlením; obraz lze dál sdílet.
- Fullscreen přehrávače zachovává stav desktopového okna a dostupné ovládání hlasitosti. iOS/PWA má bezpečný režim přes celý viewport.
- Kontrola aktualizací po 20 minutách v aktivní online aplikaci, kontrola při návratu a značka Update v Nastavení.
- Volba Auto / Mužský / Ženský hlas podle dostupných hlasů zařízení, se zachováním testu, čtení jmen a join/leave zvuků.
- Android zachovává permanentní podpis, Firebase oznámení a aktuální mobilní klient. Web/PWA používá aktuální ověřený zdroj, bez regenerace ze staré reference.

Omezení: kompletní kombinace spuštění Windows jako správce a zvýšených práv cílových aplikací ještě nebyla ověřena na reálném zařízení. Nelze proto tvrdit, že je každé selhání streamu při elevaci vyřešené. Dostupnost mužského/ženského hlasu závisí na hlasech nainstalovaných v zařízení. iOS fullscreen byl ověřen simulací fallbacku, nikoli na fyzickém iPhonu.

Předchozí vydání v1.0.99 zůstává dostupné pro návrat.

