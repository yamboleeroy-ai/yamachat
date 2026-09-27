Yamachat 1.0.101

- Opravené odpojování z aktivního voice při procházení nebo psaní v jiné komunitě. Kontrola skrytých/zaheslovaných kanálů teď smí ukončit voice jen v komunitě, ke které aktivní voice skutečně patří.
- Desktopový stream používá skutečný Windows fullscreen na první kliknutí. Fullscreen obraz vyplní displej a spodní ovládací lišta se po neaktivitě automaticky skryje.
- Hlasitost streamu na 0 % nyní znamená skutečné úplné ztlumení a stream audio je oddělené od běžného voice audia.
- Po ukončení a novém spuštění streamu se znovu vytvoří stream-audio WebRTC cesta, takže divák nemusí opouštět a znovu připojovat voice kvůli obnovení zvuku.
- Opravené bliknutí desktopového okna při práci s Windows lištou / změně fokusu po pádu GPU procesu; Windows klient používá stabilnější vykreslovací cestu.
- Na iOS/PWA a Androidu prvky s dlouhým podržením (serverové karty, kanály a uživatelé) neoznačují text při otevření kontextové nabídky.
- Zachované současné notifikace, FCM/WNS, updater, voice nastavení a ostatní funkce z 1.0.100.

Poznámka: nativní TestFlight build se publikuje jen pokud jsou v GitHubu nakonfigurované Apple distribuční secrets; web/PWA a iOS kontrola tím nejsou blokované.

Předchozí vydání v1.0.100 zůstává dostupné pro návrat.
